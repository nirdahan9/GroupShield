// src/commands.js - Admin command handlers
const { setRestartReason } = require('./restartTracker');
const config = require('./config');
const logger = require('./logger');
const database = require('./database');
const { t } = require('./i18n');
const { extractNumber, parsePhoneNumber, getNormalizedJid } = require('./utils');
const setupFlow = require('./setupFlow');
const backup = require('./backup');

/**
 * Parse and execute admin commands (from DM or management group)
 * @returns {string|null} Response message, or null if not a command
 */
async function executeCommand(client, senderJid, command, lang) {
    const cmd = command.trim();
    const cmdLower = cmd.toLowerCase();
    const normalizedSender = getNormalizedJid(senderJid);
    const isDeveloper = config.isDeveloper(normalizedSender);

    // Get user's group config
    const user = await database.getUser(senderJid);
    const groupConfig = user && user.groupId ? await database.getGroup(user.groupId) : null;

    try {
        // ── Help ─────────────────────────────────────────────────────
        if (cmdLower === '?' || cmdLower === 'עזרה' || cmdLower === 'help') {
            return t('help', lang);
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
            return await addExemptUser(groupConfig, rawPhone, lang);
        }

        // ── Exempt Remove ────────────────────────────────────────────
        if (cmd.startsWith('הסר חסין ') || cmd.startsWith('exempt remove ')) {
            if (!groupConfig) return t('no_group_linked', lang);
            const rawPhone = cmd.replace(/^(הסר חסין |exempt remove )/, '').trim();
            return await removeExemptUser(groupConfig, rawPhone, lang);
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
            return await resetUserWarnings(groupConfig, rawPhone, lang);
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
            return t('cleanup_done', lang, { removed: String(removed) });
        }

        if (cmdLower === 'ריסטארט' || cmdLower === 'restart') {
            if (!isDeveloper) return t('developer_only_command', lang);
            logger.auditLog(senderJid, 'RESTART', 'Manual restart', true);
            setRestartReason('manual_restart', 'Admin command');
            setTimeout(() => process.exit(0), 1000);
            return t('restart_message', lang);
        }

        // ── Group Name Change Approvals ─────────────────────────────
        if (cmdLower.startsWith('אשר שם ') || cmdLower.startsWith('confirm name ')) {
            const requestId = cmd.split(/\s+/).slice(2).join(' ').trim();
            return await approveGroupNameChange(client, senderJid, requestId, lang);
        }

        if (cmdLower.startsWith('דחה שם ') || cmdLower.startsWith('reject name ')) {
            const requestId = cmd.split(/\s+/).slice(2).join(' ').trim();
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
async function addExemptUser(groupConfig, rawPhone, lang) {
    const number = parsePhoneNumber(rawPhone);
    if (!number) return t('invalid_input', lang);

    const jid = number + '@s.whatsapp.net';
    await database.addExemptUser(groupConfig.groupId, jid);
    logger.auditLog(null, 'EXEMPT_ADD', `User: ${number}, Group: ${groupConfig.groupName}`, true);
    return t('exempt_added', lang, { number });
}

/**
 * Remove exempt user
 */
async function removeExemptUser(groupConfig, rawPhone, lang) {
    const number = parsePhoneNumber(rawPhone);
    if (!number) return t('invalid_input', lang);

    const jid = number + '@s.whatsapp.net';
    await database.removeExemptUser(groupConfig.groupId, jid);
    logger.auditLog(null, 'EXEMPT_REMOVE', `User: ${number}, Group: ${groupConfig.groupName}`, true);
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
async function resetUserWarnings(groupConfig, rawPhone, lang) {
    const number = parsePhoneNumber(rawPhone);
    if (!number) return t('invalid_input', lang);

    const jid = number + '@s.whatsapp.net';
    await database.resetWarnings(groupConfig.groupId, jid);
    logger.auditLog(null, 'WARNINGS_RESET', `User: ${number}, Group: ${groupConfig.groupName}`, true);
    return t('warnings_reset', lang, { number });
}

async function stopEnforcement(client, senderJid, groupConfig, lang) {
    try {
        const mgmtGroupId = groupConfig.mgmtGroupId;

        // Disable enforcement and cleanup DB config
        await database.setGroupActive(groupConfig.groupId, false);
        await database.deleteGroup(groupConfig.groupId);
        await database.updateUserGroup(senderJid, null);

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

        logger.auditLog(senderJid, 'STOP_ENFORCEMENT', `Group: ${groupConfig.groupName}`, true);
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
        const phoneJid = target.split(':')[1] + '@s.whatsapp.net';
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

async function rejectGroupNameChange(client, senderJid, requestId, lang) {
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

    await database.resolveGroupNameChangeRequest(requestId, 'rejected', senderJid);
    logger.auditLog(senderJid, 'GROUP_NAME_REJECTED', `${req.oldName} -> ${req.newName} (${requestId})`, true);

    return t('name_change_rejected', lang, {
        oldName: req.oldName || (lang === 'he' ? 'לא ידוע' : 'Unknown'),
        newName: req.newName
    });
}

module.exports = {
    executeCommand
};
