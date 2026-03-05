// src/commands.js - Admin command handlers
const { setRestartReason } = require('./restartTracker');
const config = require('./config');
const logger = require('./logger');
const database = require('./database');
const { t } = require('./i18n');
const { extractNumber, parsePhoneNumber } = require('./utils');
const setupFlow = require('./setupFlow');

/**
 * Parse and execute admin commands (from DM or management group)
 * @returns {string|null} Response message, or null if not a command
 */
async function executeCommand(client, senderJid, command, lang) {
    const cmd = command.trim();
    const cmdLower = cmd.toLowerCase();

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

        // ── Settings ─────────────────────────────────────────────────
        if (cmdLower === 'הגדרות' || cmdLower === 'settings') {
            await setupFlow.resetSetup(senderJid);
            return await setupFlow.processSetupMessage(client, senderJid, '');
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
        if (cmdLower === 'ריסטארט' || cmdLower === 'restart') {
            logger.auditLog(senderJid, 'RESTART', 'Manual restart', true);
            setRestartReason('manual_restart', 'Admin command');
            setTimeout(() => process.exit(0), 1000);
            return t('restart_message', lang);
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
    const uptime = process.uptime();
    const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
    const memMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
    const time = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });

    return t('status_message', lang, {
        groupName: groupConfig.groupName,
        memberCount: memberCount.toString(),
        activeWarnings: activeWarnings.toString(),
        uptime: uptimeStr,
        memory: `${memMB}MB`,
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

module.exports = {
    executeCommand
};
