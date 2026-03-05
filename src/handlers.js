// src/handlers.js - Message routing and group event handlers
const config = require('./config');
const logger = require('./logger');
const database = require('./database');
const { getNormalizedJid, extractNumber, resolveContactToPhone, withRetry } = require('./utils');
const { t } = require('./i18n');
const { evaluateMessage, checkAntiSpam } = require('./ruleEngine');
const { executeEnforcement, handleUndo, isPendingRemoval } = require('./enforcement');
const setupFlow = require('./setupFlow');
const commands = require('./commands');

/**
 * Process incoming message
 */
async function processMessage(client, msg, spamMap, rateLimiter) {
    if (msg.fromMe) return;

    const remoteJid = msg.from;
    let senderJid = getNormalizedJid(msg.author || msg.from);

    // Resolve LID to Phone if needed
    senderJid = await resolveContactToPhone(client, senderJid);

    // Intercept messages from users currently being removed
    if (isPendingRemoval(senderJid)) {
        try { await msg.delete(true); } catch (e) { }
        return;
    }

    const msgType = msg.type;
    const content = msg.body || '';
    const isDM = !remoteJid.endsWith('@g.us');

    // ── DM Handler ───────────────────────────────────────────────────
    if (isDM) {
        await handleDM(client, msg, senderJid, content);
        return;
    }

    // ── Group Message Handler ────────────────────────────────────────
    await handleGroupMessage(client, msg, senderJid, remoteJid, msgType, content, spamMap, rateLimiter);
}

/**
 * Handle DM (private) messages
 */
async function handleDM(client, msg, senderJid, content) {
    const user = await database.getUser(senderJid);
    const lang = user ? user.language || 'he' : 'he';

    // Explicit setup start trigger
    if (setupFlow.isSetupTrigger(content)) {
        const response = await setupFlow.startSetup(senderJid, lang);
        if (response) {
            await client.sendMessage(msg.from, response);
        }
        return;
    }

    // Check if user is in setup flow
    const inSetup = await setupFlow.isInSetup(senderJid);
    if (inSetup) {
        const response = await setupFlow.processSetupMessage(client, senderJid, content);
        if (response) {
            await client.sendMessage(msg.from, response);
        }
        return;
    }

    // User has not started setup yet
    if (!user || !user.groupId) {
        await client.sendMessage(msg.from, t('setup_start_hint', lang));
        return;
    }

    // User has completed setup — handle commands
    const response = await commands.executeCommand(client, senderJid, content, lang);
    if (response) {
        await client.sendMessage(msg.from, response);
        return;
    }

    // No command matched — show help
    await client.sendMessage(msg.from, t('unknown_command', lang));
}

/**
 * Handle group messages — check if it's a managed group and enforce rules
 */
async function handleGroupMessage(client, msg, senderJid, groupJid, msgType, content, spamMap, rateLimiter) {
    // Ignore system/protocol messages
    const ignoredTypes = ['call_log', 'e2e_notification', 'notification_template', 'revoked'];
    if (ignoredTypes.includes(msgType)) return;

    // Check if this is a managed group or a configured management group
    let groupConfig = await database.getGroup(groupJid);
    const isDirectManagedGroup = !!groupConfig;
    const mgmtLinkedGroups = !groupConfig ? await database.getGroupsByMgmtGroup(groupJid) : [];
    const isMgmtGroup = !isDirectManagedGroup && mgmtLinkedGroups.length > 0;

    if (!groupConfig && !isMgmtGroup) return; // Not a managed/mgmt group

    if (!groupConfig && isMgmtGroup) {
        // Use first linked group only for language fallback; operations below are multi-group aware
        groupConfig = mgmtLinkedGroups[0];
    }

    const senderUser = await database.getUser(senderJid);
    const ownerUser = await database.getUser(groupConfig.ownerJid);
    const lang = senderUser ? senderUser.language || 'he' : (ownerUser ? ownerUser.language || 'he' : 'he');

    // Global immunity: users who started setup flow are never enforced
    if (await database.isGlobalProtected(senderJid)) return;

    // Check if this is the management group — handle undo
    if (isMgmtGroup) {
        const undoWords = ['בטל', 'undo'];
        if (msg.hasQuotedMsg && undoWords.includes(content.trim().toLowerCase())) {
            const response = await handleUndo(client, msg, groupConfig, lang);
            if (response) {
                await msg.reply(response);
            }
            return;
        }

        const statusResponse = await buildMgmtGroupStatusResponse(client, content, mgmtLinkedGroups, lang);
        if (statusResponse) {
            await msg.reply(statusResponse);
            return;
        }

        // Allow management group to approve/reject group-name change requests
        const mgmtResponse = await commands.executeCommand(client, senderJid, content, lang);
        if (mgmtResponse) {
            await msg.reply(mgmtResponse);
        }
        return; // Don't enforce rules in management group
    }

    // ── Immunity Checks ─────────────────────────────────────────────

    // Check if sender is group admin
    try {
        const chat = await withRetry(() => client.getChatById(groupJid), 3, 700);
        const participant = chat.participants.find(p =>
            getNormalizedJid(p.id._serialized) === senderJid
        );
        if (participant && (participant.isAdmin || participant.isSuperAdmin)) {
            return; // Group admins are always immune
        }
    } catch (e) {
        logger.error('Failed to check admin status', e);
    }

    // Check if sender is the group owner (who configured the bot)
    if (senderJid === groupConfig.ownerJid) return;

    // Check if sender is exempt
    const isExempt = await database.isExempt(groupJid, senderJid);
    if (isExempt) return;

    // Check if sender is in management group (if configured)
    if (groupConfig.mgmtGroupId) {
        try {
            const mgmtChat = await withRetry(() => client.getChatById(groupConfig.mgmtGroupId), 3, 700);
            const isMgmtMember = mgmtChat.participants.some(p =>
                getNormalizedJid(p.id._serialized) === senderJid
            );
            if (isMgmtMember) return; // Management group members are immune
        } catch (e) {
            logger.error('Failed to check mgmt membership', e);
        }
    }

    // ── Rule Evaluation ─────────────────────────────────────────────

    // Get rules for this group
    const rules = await database.getRules(groupJid);
    const enforcementConfig = await database.getEnforcement(groupJid);

    // Check anti-spam first
    const spamRule = rules.find(r => r.ruleType === 'anti_spam');
    if (spamRule) {
        const spamKey = `${groupJid}:${senderJid}`;
        const spamResult = checkAntiSpam(spamMap, spamKey, spamRule.ruleData);
        if (spamResult.isWarning) {
            // Send warning emoji reaction
            try { await msg.react('⚠️'); } catch (e) { }
        }
        if (spamResult.isSpam) {
            await executeEnforcement(
                client, msg, senderJid,
                [t('reason_spam', lang)],
                content, msgType, groupConfig, enforcementConfig, rateLimiter, lang
            );
            return;
        }
    }

    // Check content and time rules
    const contentRules = rules.filter(r => r.ruleType !== 'anti_spam');
    if (contentRules.length > 0) {
        const result = evaluateMessage(contentRules, { content, msgType, senderJid }, lang);
        if (!result.allowed) {
            await executeEnforcement(
                client, msg, senderJid,
                result.violations,
                content, msgType, groupConfig, enforcementConfig, rateLimiter, lang
            );
        }
    }
}

async function buildMgmtGroupStatusResponse(client, content, groups, lang) {
    const text = (content || '').trim();
    const lower = text.toLowerCase();

    const isStatusAll = (lower === 'סטטוס' || lower === 'status');
    const isStatusSpecific = lower.startsWith('סטטוס ') || lower.startsWith('status ');
    if (!isStatusAll && !isStatusSpecific) return null;

    let targetGroups = groups;
    if (isStatusSpecific) {
        const query = text.split(/\s+/).slice(1).join(' ').trim().toLowerCase();
        targetGroups = groups.filter(g => (g.groupName || '').toLowerCase().includes(query));
    }

    if (!targetGroups || targetGroups.length === 0) {
        return lang === 'he' ? '❌ לא נמצאה קבוצה תואמת לסטטוס.' : '❌ No matching group found for status.';
    }

    const lines = [];
    for (const g of targetGroups) {
        let memberCount = 0;
        try {
            const chat = await withRetry(() => client.getChatById(g.groupId), 3, 700);
            memberCount = chat.participants ? chat.participants.length : 0;
        } catch (e) { }

        const activeWarnings = await database.getActiveWarningsCount(g.groupId);
        lines.push(`🛡️ ${g.groupName} | 👥 ${memberCount} | ⚠️ ${activeWarnings}`);
    }

    const time = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    const title = lang === 'he' ? '📊 סטטוס קבוצות אכיפה (קבוצת הנהלה משותפת)' : '📊 Enforced Groups Status (Shared Management Group)';
    return `${title}\n${lines.join('\n')}\n🕒 ${time}`;
}

/**
 * Handle group participant updates (joins/leaves)
 */
async function handleGroupUpdate(client, update) {
    const groupConfig = await database.getGroup(update.id);
    if (!groupConfig) return; // Not a managed group

    if (update.action === 'add') {
        const ownerUser = await database.getUser(groupConfig.ownerJid);
        const lang = ownerUser ? ownerUser.language || 'he' : 'he';

        for (const pId of update.participants) {
            const addedJid = getNormalizedJid(pId);
            const addedNum = extractNumber(addedJid);
            logger.info(`JOIN: ${addedNum} joined ${groupConfig.groupName}`);
        }
    }

    if (update.action === 'remove' || update.action === 'leave') {
        // Reset warnings for removed/left users
        for (const pId of update.participants) {
            const jid = getNormalizedJid(pId);
            await database.resetWarnings(groupConfig.groupId, jid);
        }
    }
}

/**
 * Build status message for developer
 */
async function buildStatusMessage(client) {
    const os = require('os');
    const totalMemMB = (os.totalmem() / 1024 / 1024).toFixed(0);
    const freeMemMB = (os.freemem() / 1024 / 1024).toFixed(0);
    const usedMemMB = totalMemMB - freeMemMB;
    const memUsage = process.memoryUsage();
    const rssMB = (memUsage.rss / 1024 / 1024).toFixed(0);
    const uptime = process.uptime();
    const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
    const time = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });

    // Get all managed groups
    const groups = await database.getAllActiveGroups();

    let status = `📊 *GroupShield Status*\n🟢 Active\n🛡️ Managed Groups: ${groups.length}\n`;

    for (const g of groups) {
        try {
            const chat = await client.getChatById(g.groupId);
            const count = chat.participants ? chat.participants.length : 0;
            status += `👥 ${g.groupName} (${count} members)\n`;
        } catch (e) {
            status += `❌ ${g.groupName}: error\n`;
        }
    }

    status += `\n⏱️ Uptime: ${uptimeStr}\n💾 Memory: ${rssMB}MB (system: ${usedMemMB}/${totalMemMB}MB)\n🕒 ${time}`;
    return status;
}

/**
 * Periodically verify group names and request confirmation on detected changes
 */
async function refreshManagedGroupNames(client) {
    const groups = await database.getAllActiveGroups();

    for (const g of groups) {
        try {
            const chat = await withRetry(() => client.getChatById(g.groupId), 3, 800);
            const detectedName = (chat && chat.name ? chat.name.trim() : '');
            const storedName = (g.groupName || '').trim();

            if (!detectedName || detectedName === storedName) continue;

            const alreadyPending = await database.hasPendingGroupNameRequest(g.groupId, detectedName);
            if (alreadyPending) continue;

            const requestId = `GN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            await database.createGroupNameChangeRequest(requestId, g.groupId, storedName, detectedName, g.reportTarget || 'dm');

            const ownerUser = await database.getUser(g.ownerJid);
            const lang = ownerUser ? ownerUser.language || 'he' : 'he';

            const prompt = t('group_name_change_detected', lang, {
                oldName: storedName || (lang === 'he' ? 'לא ידוע' : 'Unknown'),
                newName: detectedName,
                requestId
            });

            if (g.reportTarget === 'mgmt_group' && g.mgmtGroupId) {
                await client.sendMessage(g.mgmtGroupId, prompt);
            } else if (g.reportTarget && g.reportTarget.startsWith('phone:')) {
                const phone = g.reportTarget.split(':')[1];
                await client.sendMessage(phone + '@s.whatsapp.net', prompt);
            } else {
                await client.sendMessage(g.ownerJid, prompt);
            }

            logger.info(`Detected group name change for ${storedName} -> ${detectedName} (request ${requestId})`);
        } catch (e) {
            logger.error(`Group name refresh failed for ${g.groupId}`, e);
        }
    }
}

module.exports = {
    processMessage,
    handleGroupUpdate,
    buildStatusMessage,
    refreshManagedGroupNames
};
