// src/handlers.js - Message routing and group event handlers
const config = require('./config');
const logger = require('./logger');
const database = require('./database');
const { getNormalizedJid, extractNumber, resolveContactToPhone } = require('./utils');
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

    // Check if user is in setup flow
    const inSetup = await setupFlow.isInSetup(senderJid);
    if (inSetup) {
        const response = await setupFlow.processSetupMessage(client, senderJid, content);
        if (response) {
            await client.sendMessage(msg.from, response);
        }
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

    // Check if this is a managed group
    const groupConfig = await database.getGroup(groupJid);
    if (!groupConfig || !groupConfig.active) return; // Not a managed group

    const ownerUser = await database.getUser(groupConfig.ownerJid);
    const lang = ownerUser ? ownerUser.language || 'he' : 'he';

    // Check if this is the management group — handle undo
    if (groupConfig.mgmtGroupId === groupJid) {
        const undoWords = ['בטל', 'undo'];
        if (msg.hasQuotedMsg && undoWords.includes(content.trim().toLowerCase())) {
            const response = await handleUndo(client, msg, groupConfig, lang);
            if (response) {
                await msg.reply(response);
            }
        }
        return; // Don't enforce rules in management group
    }

    // ── Immunity Checks ─────────────────────────────────────────────

    // Check if sender is group admin
    try {
        const chat = await client.getChatById(groupJid);
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
            const mgmtChat = await client.getChatById(groupConfig.mgmtGroupId);
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
        const spamResult = checkAntiSpam(spamMap, senderJid, spamRule.ruleData);
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

module.exports = {
    processMessage,
    handleGroupUpdate,
    buildStatusMessage
};
