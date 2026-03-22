// src/commands.js - Admin command handlers
const os = require('os');
const { setRestartReason } = require('./restartTracker');
const config = require('./config');
const logger = require('./logger');
const database = require('./database');
const { t } = require('./i18n');
const { extractNumber, parsePhoneNumber, getNormalizedJid } = require('./utils');
const setupFlow = require('./setupFlow');
const backup = require('./backup');
const health = require('./health');

/**
 * Parse and execute admin commands (from DM or management group)
 * @param {object} client - The WhatsApp client
 * @param {string} senderJid - The JID of the user sending the command
 * @param {string} command - The text content of the command
 * @param {string} lang - The preferred language code ('he' or 'en')
 * @param {object} [overrideGroupConfig=null] - Optional group config to override the sender's default group
 * @returns {string|null} Response message, or null if not a command
 */
async function executeCommand(client, senderJid, command, lang, overrideGroupConfig = null) {
    const cmd = command.trim();
    const cmdLower = cmd.toLowerCase();
    const normalizedSender = getNormalizedJid(senderJid);
    const isDeveloper = config.isDeveloper(normalizedSender);

    // Get user's group config, or use override if provided
    const user = await database.getUser(senderJid);
    const groupConfig = overrideGroupConfig || (user && user.groupId ? await database.getGroup(user.groupId) : null);

    try {
        // ── Help ─────────────────────────────────────────────────────
        if (cmdLower === '?' || cmdLower === 'עזרה' || cmdLower === 'help') {
            return t(isDeveloper ? 'help_developer' : 'help_user', lang);
        }

        // ── Status ───────────────────────────────────────────────────
        if (cmdLower === 'סטטוס' || cmdLower === 'status') {
            return await buildUserStatus(client, senderJid, groupConfig, lang);
        }

        // ── Start Setup Trigger Alias ────────────────────────────────
        if (cmdLower === 'התחל' || cmdLower === 'setup' || cmdLower === 'start setup' || cmdLower === 'start') {
            return await setupFlow.startSetup(senderJid, lang);
        }

        // ── Settings ─────────────────────────────────────────────────
        if (cmdLower === 'הגדרות' || cmdLower === 'settings') {
            await setupFlow.resetSetup(senderJid);
            return await setupFlow.processSetupMessage(client, senderJid, '');
        }

        // ── Reset All Configuration ──────────────────────────────────
        if (cmdLower === 'איפוס' || cmdLower === 'reset') {
            if (!groupConfig) return t('no_group_linked', lang);
            await database.deleteGroup(groupConfig.groupId);
            await database.updateUserGroup(senderJid, null);
            await setupFlow.resetSetup(senderJid);
            logger.auditLog(senderJid, 'RESET_CONFIG', `Group: ${groupConfig.groupName}`, true);
            return t('reset_completed', lang);
        }

        // ── Quick Enforcement Update ────────────────────────────────
        if (cmdLower === 'עדכן אכיפה' || cmdLower === 'update enforcement') {
            return await setupFlow.startQuickEnforcementUpdate(senderJid);
        }

        // ── Pause Enforcement ────────────────────────────────────────
        if (cmdLower.startsWith('השהה ') || cmdLower.startsWith('pause ')) {
            if (!groupConfig) return t('no_group_linked', lang);
            const durationRaw = cmdLower.replace(/^(השהה |pause )/, '').trim();
            const durationParams = parseInt(durationRaw, 10);
            if (isNaN(durationParams) || durationParams <= 0) {
                return t('invalid_pause_duration', lang);
            }
            return await pauseEnforcement(client, senderJid, groupConfig, durationParams, lang);
        }

        // ── Resume Enforcement ───────────────────────────────────────
        if (cmdLower === 'המשך אכיפה' || cmdLower === 'resume' || cmdLower === 'חזור לאכוף' || cmdLower === 'resume enforcement') {
            if (!groupConfig) return t('no_group_linked', lang);
            if (!groupConfig.status || !groupConfig.status.startsWith('PAUSED_UNTIL:')) return t('enforcement_not_paused', lang);

            await database.updateGroupStatus(groupConfig.groupId, 'ACTIVE');
            logger.auditLog(senderJid, 'RESUME_ENFORCEMENT', `Group: ${groupConfig.groupName}`, true);
            return t('action_resumed', lang, { groupName: groupConfig.groupName });
        }

        // ── Stop Enforcement + Exit Groups ───────────────────────────
        if (cmdLower === 'הפסק אכיפה' || cmdLower === 'stop enforcement') {
            if (!groupConfig) return t('no_group_linked', lang);
            return await stopEnforcement(client, senderJid, groupConfig, lang);
        }

        // ── Language ─────────────────────────────────────────────────
        if (cmdLower === 'שפה' || cmdLower === 'language') {
            const newLang = lang === 'he' ? 'en' : 'he';
            await database.updateUserLanguage(senderJid, newLang);
            return t('language_switched', newLang);
        }

        // ── Exempt Add ───────────────────────────────────────────────
        if (cmd.startsWith('הוסף חסין ') || cmd.startsWith('exempt add ')) {
            if (!groupConfig) return t('no_group_linked', lang);
            const rawPhone = cmd.replace(/^(הוסף חסין |exempt add )/, '').trim();
            return await addExemptUser(groupConfig, rawPhone, lang, senderJid);
        }

        // ── Exempt Remove ────────────────────────────────────────────
        if (cmd.startsWith('הסר חסין ') || cmd.startsWith('exempt remove ')) {
            if (!groupConfig) return t('no_group_linked', lang);
            const rawPhone = cmd.replace(/^(הסר חסין |exempt remove )/, '').trim();
            return await removeExemptUser(groupConfig, rawPhone, lang, senderJid);
        }

        // ── Exempt List ──────────────────────────────────────────────
        if (cmdLower === 'רשימת חסינים' || cmdLower === 'exempt list') {
            if (!groupConfig) return t('no_group_linked', lang);
            return await listExemptUsers(client, groupConfig, lang);
        }

        // ── Warnings Reset ───────────────────────────────────────────
        if (cmd.startsWith('אפס אזהרות ') || cmd.startsWith('warnings reset ')) {
            if (!groupConfig) return t('no_group_linked', lang);
            const rawPhone = cmd.replace(/^(אפס אזהרות |warnings reset )/, '').trim();
            return await resetUserWarnings(groupConfig, rawPhone, lang, senderJid);
        }

        // ── Warning Undo (decrement) ─────────────────────────────────
        if (cmd.startsWith('בטל אזהרה ') || cmd.startsWith('undo warning ')) {
            if (!groupConfig) return t('no_group_linked', lang);
            const rawPhone = cmd.replace(/^(בטל אזהרה |undo warning )/, '').trim();
            return await undoWarning(groupConfig, rawPhone, lang, senderJid);
        }

        // ── Restart ──────────────────────────────────────────────────
        if (cmdLower === 'גיבוי' || cmdLower === 'backup') {
            if (!isDeveloper) return t('developer_only_command', lang);
            const result = await backup.createBackup();
            if (result.success) {
                const count = Array.isArray(result.files) ? result.files.length : 0;
                return t('backup_done', lang, { count: String(count) });
            }
            return t('backup_failed', lang, { error: result.error || (lang === 'he' ? 'שגיאה לא ידועה' : 'Unknown error') });
        }

        if (cmdLower === 'ניקוי' || cmdLower === 'cleanup') {
            if (!isDeveloper) return t('developer_only_command', lang);
            const removed = await database.cleanupExpiredWarnings();
            await database.markStaleEnforcementActionsFailed(15);
            await database.cleanupExpiredPendingGroupActions(10);
            return t('cleanup_done', lang, { removed: String(removed) });
        }

        if (cmdLower === 'סטטוס מפתח' || cmdLower === 'dev status') {
            if (!isDeveloper) return t('developer_only_command', lang);
            return buildFullGroupsStatus(lang);
        }

        // ── View group rules ─────────────────────────────────────────
        if (cmdLower === 'חוקי הקבוצה' || cmdLower === 'group rules') {
            if (!groupConfig) return t('no_group_linked', lang);
            return buildGroupRulesMessage(groupConfig, lang);
        }

        if (cmdLower === 'ריסטארט' || cmdLower === 'restart') {
            if (!isDeveloper) return t('developer_only_command', lang);
            logger.auditLog(senderJid, 'RESTART', 'Manual restart', true);
            setRestartReason('manual_restart', 'Admin command');
            setTimeout(() => process.exit(0), 1000);
            return t('restart_message', lang);
        }

        // ── Group Name Change Approvals ─────────────────────────────
        if (cmdLower.startsWith('אימות שם ') || cmdLower.startsWith('verify name ')) {
            const requestId = cmd.split(/\s+/).slice(2).join(' ').trim();
            return await approveGroupNameChange(client, senderJid, requestId, lang);
        }

        if (cmdLower.startsWith('לא אימות שם ') || cmdLower.startsWith('verify_not name ')) {
            const requestId = cmd.split(/\s+/).slice(3).join(' ').trim();
            return await rejectGroupNameChange(client, senderJid, requestId, lang);
        }

        // No command matched
        return null;

    } catch (error) {
        logger.error('Command execution failed', error);
        return t('error_generic', lang, { error: error.message });
    }
}

/**
 * Build status message for a specific user's group
 */
async function buildUserStatus(client, senderJid, groupConfig, lang) {
    if (!groupConfig) return t('no_group_linked', lang);

    let memberCount = 0;
    try {
        const chat = await client.getChatById(groupConfig.groupId);
        memberCount = chat.participants ? chat.participants.length : 0;
    } catch (e) { }

    const activeWarnings = await database.getActiveWarningsCount(groupConfig.groupId);
    const time = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });

    return t('status_message', lang, {
        groupName: groupConfig.groupName,
        memberCount: memberCount.toString(),
        activeWarnings: activeWarnings.toString(),
        time
    });
}

/**
 * Add exempt user
 */
async function addExemptUser(groupConfig, rawPhone, lang, senderJid = null) {
    const number = parsePhoneNumber(rawPhone);
    if (!number) return t('invalid_input', lang);

    const jid = number + '@s.whatsapp.net';
    await database.addExemptUser(groupConfig.groupId, jid);
    logger.auditLog(senderJid, 'EXEMPT_ADD', `User: ${number}, Group: ${groupConfig.groupName}`, true);
    return t('exempt_added', lang, { number });
}

/**
 * Remove exempt user
 */
async function removeExemptUser(groupConfig, rawPhone, lang, senderJid = null) {
    const number = parsePhoneNumber(rawPhone);
    if (!number) return t('invalid_input', lang);

    const jid = number + '@s.whatsapp.net';
    await database.removeExemptUser(groupConfig.groupId, jid);
    logger.auditLog(senderJid, 'EXEMPT_REMOVE', `User: ${number}, Group: ${groupConfig.groupName}`, true);
    return t('exempt_removed', lang, { number });
}

/**
 * List exempt users
 */
async function listExemptUsers(client, groupConfig, lang) {
    const exemptUsers = await database.getExemptUsers(groupConfig.groupId);
    if (exemptUsers.length === 0) return t('exempt_list_empty', lang);

    let msg = t('exempt_list_header', lang, { count: exemptUsers.length.toString() });
    for (let i = 0; i < exemptUsers.length; i++) {
        const num = extractNumber(exemptUsers[i].jid);
        let name = '';
        try {
            const contact = await client.getContactById(exemptUsers[i].jid);
            name = contact.pushname || contact.name || '';
        } catch (e) { }
        msg += `${i + 1}. ${num}`;
        if (name) msg += ` (${name})`;
        msg += '\n';
    }
    return msg;
}

/**
 * Reset warnings for a user
 */
async function resetUserWarnings(groupConfig, rawPhone, lang, senderJid = null) {
    const number = parsePhoneNumber(rawPhone);
    if (!number) return t('invalid_input', lang);

    const jid = number + '@s.whatsapp.net';
    await database.resetWarnings(groupConfig.groupId, jid);
    logger.auditLog(senderJid, 'WARNINGS_RESET', `User: ${number}, Group: ${groupConfig.groupName}`, true);
    return t('warnings_reset', lang, { number });
}

async function undoWarning(groupConfig, rawPhone, lang, senderJid = null) {
    const number = parsePhoneNumber(rawPhone);
    if (!number) return t('invalid_input', lang);

    const jid = number + '@s.whatsapp.net';
    const currentCount = await database.getWarningCount(groupConfig.groupId, jid);

    if (currentCount === 0) {
        return lang === 'he'
            ? `ℹ️ למשתמש ${number} אין אזהרות פעילות.`
            : `ℹ️ User ${number} has no active warnings.`;
    }

    if (currentCount === 1) {
        await database.resetWarnings(groupConfig.groupId, jid);
    } else {
        await database.decrementWarning(groupConfig.groupId, jid);
    }

    const newCount = Math.max(0, currentCount - 1);
    logger.auditLog(senderJid, 'WARNING_UNDO', `User: ${number}, Group: ${groupConfig.groupName}, ${currentCount} → ${newCount}`, true);
    return lang === 'he'
        ? `✅ אזהרה אחת בוטלה עבור ${number}. אזהרות נוכחיות: ${newCount}`
        : `✅ One warning removed for ${number}. Current warnings: ${newCount}`;
}

async function pauseEnforcement(client, senderJid, groupConfig, hours, lang) {
    try {
        const ms = hours * 60 * 60 * 1000;
        const until = new Date(Date.now() + ms);
        const untilIso = until.toISOString();

        await database.updateGroupStatus(groupConfig.groupId, `PAUSED_UNTIL:${untilIso}`);

        logger.auditLog(senderJid, 'PAUSE_ENFORCEMENT', `Group: ${groupConfig.groupName} for ${hours}h`, true);

        const timeStr = until.toLocaleString('he-IL', {
            timeZone: 'Asia/Jerusalem',
            hour: '2-digit', minute: '2-digit',
            day: '2-digit', month: '2-digit'
        });

        return t('action_paused', lang, {
            groupName: groupConfig.groupName,
            duration: hours.toString(),
            time: timeStr
        });
    } catch (error) {
        logger.error('Failed to pause enforcement', error);
        return t('error_generic', lang, { error: error.message });
    }
}

async function buildGroupRulesMessage(groupConfig, lang) {
    const rules = await database.getRules(groupConfig.groupId);
    const enforcement = await database.getEnforcement(groupConfig.groupId);

    const header = t('group_rules_header', lang, { groupName: groupConfig.groupName });
    if (!rules || rules.length === 0) {
        return `${header}\n\n${t('group_rules_empty', lang)}`;
    }

    const lines = [header, ''];

    for (const rule of rules) {
        const rd = rule.ruleData || {};
        switch (rule.ruleType) {
            case 'time_window': {
                const windows = Array.isArray(rd.windows) ? rd.windows : (rd.start ? [rd] : []);
                if (windows.length > 0) {
                    const wStrs = windows.map(w => `${w.start}–${w.end}`).join(', ');
                    lines.push(lang === 'he' ? `⏰ *שעות פעילות:* ${wStrs}` : `⏰ *Active hours:* ${wStrs}`);
                }
                break;
            }
            case 'allowed_messages': {
                const count = Array.isArray(rd.messages) ? rd.messages.length : 0;
                lines.push(lang === 'he'
                    ? `✅ *הודעות מותרות בלבד:* ${count} הודעות מוגדרות (התאמה מדויקת)`
                    : `✅ *Allowed messages only:* ${count} defined (exact match)`);
                break;
            }
            case 'forbidden_messages': {
                const count = Array.isArray(rd.messages) ? rd.messages.length : 0;
                lines.push(lang === 'he'
                    ? `🚫 *ביטויים אסורים:* ${count} ביטויים (כל הכלה)`
                    : `🚫 *Forbidden phrases:* ${count} phrases (contains match)`);
                break;
            }
            case 'block_non_text': {
                const mediaTypeLabels = {
                    all_non_text: { he: 'הכל (כל סוג לא-טקסט)', en: 'All non-text types' },
                    image: { he: 'תמונות', en: 'Images' },
                    video: { he: 'וידאו', en: 'Video' },
                    sticker: { he: 'סטיקרים', en: 'Stickers' },
                    document: { he: 'מסמכים', en: 'Documents' },
                    audio: { he: 'אודיו', en: 'Audio' },
                    other_non_text: { he: 'שאר לא-טקסט', en: 'Other non-text' }
                };
                const getLabel = (type) => (mediaTypeLabels[type] && mediaTypeLabels[type][lang]) || type;
                if (Array.isArray(rd.blockedTypes) && rd.blockedTypes.includes('all_non_text')) {
                    lines.push(lang === 'he' ? '🖼️ *מדיה:* כל סוגי המדיה חסומים' : '🖼️ *Media:* all non-text blocked');
                } else if (Array.isArray(rd.blockedTypes) && rd.blockedTypes.length > 0) {
                    const labels = rd.blockedTypes.map(getLabel).join(', ');
                    lines.push(lang === 'he'
                        ? `🖼️ *מדיה חסומה:* ${labels}`
                        : `🖼️ *Blocked media:* ${labels}`);
                }
                break;
            }
            case 'anti_spam': {
                lines.push(lang === 'he'
                    ? `🔁 *אנטי-ספאם:* ${rd.maxConsecutive ?? '?'} הודעות זהות ברצף, ${rd.maxDaily ?? '?'} ביום`
                    : `🔁 *Anti-spam:* ${rd.maxConsecutive ?? '?'} consecutive, ${rd.maxDaily ?? '?'}/day`);
                break;
            }
            default:
                lines.push(`📌 ${rule.ruleType}`);
        }
    }

    // Enforcement summary
    if (enforcement) {
        const steps = [];
        if (enforcement.deleteMessage)    steps.push(lang === 'he' ? '🗑️ מחיקה' : '🗑️ delete');
        if (enforcement.privateWarning)   steps.push(lang === 'he' ? '📩 הודעת הסרה' : '📩 removal notice');
        if (enforcement.removeFromGroup)  steps.push(lang === 'he' ? '🚫 הסרה' : '🚫 remove');
        if (enforcement.blockUser)        steps.push(lang === 'he' ? '🔒 חסימה' : '🔒 block');
        if (enforcement.sendReport)       steps.push(lang === 'he' ? '📋 דיווח' : '📋 report');
        if (enforcement.warnPrivateDm)    steps.push(lang === 'he' ? '💬 הודעה פרטית בכל אזהרה' : '💬 private DM per warning');
        const maxWarn = groupConfig.warningCount ?? 1;
        lines.push('');
        lines.push(lang === 'he'
            ? `⚖️ *אכיפה:* ${steps.join(' → ')} | אזהרות לפני הסרה: ${maxWarn}`
            : `⚖️ *Enforcement:* ${steps.join(' → ')} | Warnings before removal: ${maxWarn}`);
    }

    return lines.join('\n');
}

async function buildFullGroupsStatus(lang) {
    const allGroups = await database.getAllGroups();

    // ── Memory & health stats ─────────────────────────────────────────
    const mem = process.memoryUsage();
    const totalRamMB = Math.round(os.totalmem() / 1024 / 1024);
    const usedRamMB = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024);
    const ramPct = ((usedRamMB / totalRamMB) * 100).toFixed(1);
    const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
    const heapPct = ((heapUsedMB / heapTotalMB) * 100).toFixed(1);
    const rssMB = Math.round(mem.rss / 1024 / 1024);
    const rssPct = ((rssMB / totalRamMB) * 100).toFixed(1);

    const uptimeSec = Math.floor(process.uptime());
    const uptimeHrs = Math.floor(uptimeSec / 3600);
    const uptimeMins = Math.floor((uptimeSec % 3600) / 60);

    const lastMsgMinutes = Math.floor((Date.now() - health.lastMessageTime) / 60000);
    const errorCount24h = health.errorWindow.filter(t => Date.now() - t < 86400000).length;
    const isHealthy = errorCount24h < 10;

    const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\//g, '.');

    const sysBlock = lang === 'he'
        ? `📊 *סטטוס בוט (Chrome)*\n🟢 פעיל\n📅 *תאריך ושעה:* ${now}\n🖥️ זיכרון מערכת: ${usedRamMB}MB / ${totalRamMB}MB (${ramPct}%)\n🧠 זיכרון תהליך (Heap): ${heapUsedMB}MB / ${heapTotalMB}MB (${heapPct}%)\n📦 RSS (זיכרון פיזי): ${rssMB}MB / ${totalRamMB}MB (${rssPct}%)\n\n🏥 *בריאות המערכת*\nסטטוס: ${isHealthy ? '🟢 בריא' : '🟡 בעיות'}\nזמן פעילות: ${uptimeHrs}h ${uptimeMins}m\nהודעה אחרונה: ${lastMsgMinutes} דקות\nשגיאות (24h): ${errorCount24h}`
        : `📊 *Bot Status (Chrome)*\n🟢 Active\n📅 *Date & time:* ${now}\n🖥️ System RAM: ${usedRamMB}MB / ${totalRamMB}MB (${ramPct}%)\n🧠 Process heap: ${heapUsedMB}MB / ${heapTotalMB}MB (${heapPct}%)\n📦 RSS (physical): ${rssMB}MB / ${totalRamMB}MB (${rssPct}%)\n\n🏥 *System Health*\nStatus: ${isHealthy ? '🟢 Healthy' : '🟡 Issues'}\nUptime: ${uptimeHrs}h ${uptimeMins}m\nLast message: ${lastMsgMinutes}m ago\nErrors (24h): ${errorCount24h}`;

    if (!allGroups || allGroups.length === 0) {
        return sysBlock + '\n\n' + (lang === 'he' ? '📋 אין קבוצות מוגדרות במערכת.' : '📋 No groups configured in the system.');
    }

    // Fetch all errors and pending names once
    const { failedMap, staleMap } = await database.getAllGroupErrors();
    const pendingNameMap = await database.getAllPendingNameChanges();

    const lines = [];
    lines.push(lang === 'he'
        ? `${sysBlock}\n\n📋 *קבוצות (${allGroups.length})*\n${'─'.repeat(30)}`
        : `${sysBlock}\n\n📋 *Groups (${allGroups.length})*\n${'─'.repeat(30)}`);

    for (const g of allGroups) {
        // ── Status ────────────────────────────────────────────────────
        const status = g.status || 'ACTIVE';
        let statusLine;
        if (!g.active) {
            statusLine = lang === 'he' ? '🔴 לא פעיל' : '🔴 Inactive';
        } else if (status === 'ACTIVE') {
            statusLine = lang === 'he' ? '🟢 פעיל' : '🟢 Active';
        } else if (status.startsWith('PAUSED_UNTIL:')) {
            const until = new Date(status.split('PAUSED_UNTIL:')[1]);
            const timeStr = until.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
            statusLine = lang === 'he' ? `⏸️ מושהה עד ${timeStr}` : `⏸️ Paused until ${timeStr}`;
        } else if (status === 'PENDING_ADMIN_ACTION') {
            statusLine = lang === 'he' ? '⚠️ הבוט הוסר / הורד — ממתין לפעולה' : '⚠️ Bot removed/demoted — awaiting action';
        } else if (status === 'PENDING_ADMIN_RESUME') {
            statusLine = lang === 'he' ? '🔄 ממתין לשחזור הרשאות אדמין' : '🔄 Waiting for admin rights to be restored';
        } else {
            statusLine = `❓ ${status}`;
        }

        // ── Reporter ──────────────────────────────────────────────────
        const rt = g.reportTarget || 'dm';
        let reporterLabel;
        if (rt === 'dm') {
            reporterLabel = lang === 'he' ? 'הודעה פרטית לבעלים' : 'Private DM to owner';
        } else if (rt === 'mgmt_group') {
            const shortId = g.mgmtGroupId ? g.mgmtGroupId.split('@')[0] : '?';
            reporterLabel = lang === 'he' ? `קבוצת הנהלה (${shortId})` : `Management group (${shortId})`;
        } else if (rt.startsWith('phone:')) {
            reporterLabel = `📱 ${rt.replace('phone:', '')}`;
        } else {
            reporterLabel = rt;
        }

        // ── Operational Errors (from cached maps) ────────────────────
        const failedRecent = failedMap[g.groupId] || 0;
        const staleStuck = staleMap[g.groupId] || 0;
        const pendingName = pendingNameMap[g.groupId] ? { requestId: pendingNameMap[g.groupId] } : null;

        const entry = [
            `\n📌 *${g.groupName}*`,
            (lang === 'he' ? `📊 סטטוס: ` : `📊 Status: `) + statusLine,
            (lang === 'he' ? `📣 דיווח: ` : `📣 Reporter: `) + reporterLabel,
        ];
        if (failedRecent > 0) {
            entry.push(lang === 'he'
                ? `❌ ${failedRecent} כשל אכיפה (24ש אחרונות)`
                : `❌ ${failedRecent} enforcement failure(s) in last 24h`);
        }
        if (staleStuck > 0) {
            entry.push(lang === 'he'
                ? `⏳ ${staleStuck} פעולת אכיפה תקועה (>15 דק')`
                : `⏳ ${staleStuck} stuck enforcement action(s) (>15 min)`);
        }
        if (failedRecent === 0 && staleStuck === 0 && g.active) {
            entry.push(lang === 'he' ? '✅ ללא תקלות' : '✅ No errors');
        }
        if (pendingName) {
            entry.push(lang === 'he'
                ? `🔔 ממתין לאישור שינוי שם (${pendingName.requestId})`
                : `🔔 Pending name-change approval (${pendingName.requestId})`);
        }
        lines.push(entry.join('\n'));
    }

    return lines.join(`\n${'─'.repeat(30)}`);
}

async function stopEnforcement(client, senderJid, groupConfig, lang) {
    try {
        const mgmtGroupId = groupConfig.mgmtGroupId;

        // Disable enforcement and cleanup DB config
        await database.setGroupActive(groupConfig.groupId, false);
        await database.deleteGroup(groupConfig.groupId);
        // Always clear the owner's linked group and mark as stopped so no setup hint is sent
        await database.updateUserGroup(groupConfig.ownerJid, null);
        await database.updateUserSetupState(groupConfig.ownerJid, { step: 'stopped' });

        // Leave managed group
        try {
            const managedChat = await client.getChatById(groupConfig.groupId);
            await managedChat.leave();
        } catch (e) {
            logger.warn(`Could not leave managed group ${groupConfig.groupId}`);
        }

        // Leave management group only if no other active enforced groups still use it
        if (mgmtGroupId) {
            const stillLinked = await database.getGroupsByMgmtGroup(mgmtGroupId);
            const stillUsedByOthers = stillLinked.some(g => g.groupId !== groupConfig.groupId);

            if (stillUsedByOthers) {
                logger.info(`Keeping management group ${mgmtGroupId} because it is shared by other enforced groups`);
            } else {
                try {
                    const mgmtChat = await client.getChatById(mgmtGroupId);
                    await mgmtChat.leave();
                } catch (e) {
                    logger.warn(`Could not leave management group ${mgmtGroupId}`);
                }
            }
        }

        logger.auditLog(senderJid || 'system_timeout', 'STOP_ENFORCEMENT', `Group: ${groupConfig.groupName}`, true);
        return t('stop_enforcement_done', lang, { groupName: groupConfig.groupName });
    } catch (error) {
        logger.error('Failed to stop enforcement', error);
        return t('error_generic', lang, { error: error.message });
    }
}

async function isAuthorizedNameChangeResponder(client, senderJid, groupConfig) {
    const normalizedSender = getNormalizedJid(senderJid);
    const target = groupConfig.reportTarget || 'dm';

    if (target === 'dm') {
        return normalizedSender === groupConfig.ownerJid;
    }

    if (target.startsWith('phone:')) {
        const phone = target.split(':')[1];
        if (!phone) return false;
        const phoneJid = phone + '@s.whatsapp.net';
        return normalizedSender === phoneJid;
    }

    if (target === 'mgmt_group' && groupConfig.mgmtGroupId) {
        try {
            const mgmtChat = await client.getChatById(groupConfig.mgmtGroupId);
            return mgmtChat.participants.some(p => getNormalizedJid(p.id._serialized) === normalizedSender);
        } catch {
            return false;
        }
    }

    return false;
}

async function approveGroupNameChange(client, senderJid, requestId, lang) {
    if (!requestId) return t('invalid_input', lang);

    const req = await database.getGroupNameChangeRequest(requestId);
    if (!req || req.status !== 'pending') {
        return t('name_change_request_not_found', lang, { requestId });
    }

    const groupConfig = await database.getGroup(req.groupId);
    if (!groupConfig) {
        await database.resolveGroupNameChangeRequest(requestId, 'rejected_missing_group', senderJid);
        return t('name_change_request_not_found', lang, { requestId });
    }

    const authorized = await isAuthorizedNameChangeResponder(client, senderJid, groupConfig);
    if (!authorized) {
        return t('name_change_unauthorized', lang);
    }

    await database.updateGroupName(req.groupId, req.newName);
    await database.resolveGroupNameChangeRequest(requestId, 'approved', senderJid);
    logger.auditLog(senderJid, 'GROUP_NAME_APPROVED', `${req.oldName} -> ${req.newName} (${requestId})`, true);

    return t('name_change_approved', lang, {
        oldName: req.oldName || (lang === 'he' ? 'לא ידוע' : 'Unknown'),
        newName: req.newName
    });
}

async function stopEnforcementOnNameRejection(client, senderJid, requestId, lang, isTimeout = false) {
    if (!requestId) return t('invalid_input', lang);

    const req = await database.getGroupNameChangeRequest(requestId);
    if (!req || req.status !== 'pending') {
        return t('name_change_request_not_found', lang, { requestId });
    }

    const groupConfig = await database.getGroup(req.groupId);
    if (!groupConfig) {
        await database.resolveGroupNameChangeRequest(requestId, 'rejected_missing_group', senderJid || 'system');
        return t('name_change_request_not_found', lang, { requestId });
    }

    if (!isTimeout) {
        const authorized = await isAuthorizedNameChangeResponder(client, senderJid, groupConfig);
        if (!authorized) {
            return t('name_change_unauthorized', lang);
        }
    }

    await database.resolveGroupNameChangeRequest(requestId, 'rejected', senderJid || 'system_timeout');
    const who = isTimeout ? 'timeout' : senderJid;
    logger.auditLog(who, 'GROUP_NAME_REJECTED_STOP', `${req.oldName} -> ${req.newName} (${requestId}). Stopping enforcement.`, !isTimeout);

    // Stop enforcement fully
    return await stopEnforcement(client, senderJid || groupConfig.ownerJid, groupConfig, lang);
}

module.exports = {
    executeCommand,
    pauseEnforcement,
    stopEnforcement,
    approveGroupNameChange,
    stopEnforcementOnNameRejection
};
