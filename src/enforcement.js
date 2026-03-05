// src/enforcement.js - Enforcement pipeline with fixed order
const database = require('./database');
const logger = require('./logger');
const { t } = require('./i18n');
const { extractNumber, getNormalizedJid } = require('./utils');
const path = require('path');
const config = require('./config');

const REMOVALS_LOG_FILE = path.join(__dirname, '../removals_log.txt');

// Track users currently undergoing the removal process
const pendingRemovals = new Set();

/**
 * Execute enforcement pipeline for a violation
 * Fixed order: 1. Delete → 2. Warning → 3. Remove → 4. Block → 5. Report
 * 
 * @param {import('whatsapp-web.js').Client} client
 * @param {object} msg - WhatsApp message object
 * @param {string} senderJid - Normalized sender JID
 * @param {string[]} violations - List of violation reasons
 * @param {string} content - Message content
 * @param {string} msgType - Message type
 * @param {object} groupConfig - Group config from DB
 * @param {object} enforcementConfig - Enforcement config from DB
 * @param {object} rateLimiter - Rate limiter instance
 * @param {string} lang - User language
 */
async function executeEnforcement(client, msg, senderJid, violations, content, msgType, groupConfig, enforcementConfig, rateLimiter, lang) {
    const number = extractNumber(senderJid);
    const reason = violations.join(lang === 'he' ? ' וגם ' : ' and ');
    const targetJid = number + '@s.whatsapp.net';
    const formattedTime = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    const groupId = groupConfig.groupId;
    const maxWarnings = groupConfig.warningCount || 0;

    // If already being removed, skip
    if (pendingRemovals.has(targetJid)) return;

    logger.warn(`🚨 Violation: ${number} in ${groupConfig.groupName} | Reason: ${reason}`);

    // Check if we should warn or enforce
    if (maxWarnings > 0 && enforcementConfig.privateWarning) {
        const currentCount = await database.getWarningCount(groupId, senderJid);
        if (currentCount < maxWarnings) {
            // Still in warning phase
            const newCount = await database.incrementWarning(groupId, senderJid);
            const remaining = maxWarnings - newCount;

            // Step 1: Delete message (if enabled, even during warning phase)
            if (enforcementConfig.deleteMessage) {
                await deleteMessage(client, msg);
            }

            // Send warning to user
            try {
                const warnText = t('violation_warning', lang, {
                    current: newCount.toString(),
                    max: maxWarnings.toString(),
                    groupName: groupConfig.groupName,
                    reason: reason,
                    remaining: remaining.toString()
                });
                await client.sendMessage(targetJid, warnText);
                logger.info(`Warning ${newCount}/${maxWarnings} sent to ${number}`);
            } catch (e) {
                logger.error(`Failed to send warning to ${number}`, e);
            }

            // Report warning if reporting is enabled
            if (enforcementConfig.sendReport) {
                const warningReport = `⚠️ *${lang === 'he' ? 'אזהרה' : 'Warning'}* (${newCount}/${maxWarnings})\n👤 ${number}\n📝 ${reason}`;
                await sendReport(client, groupConfig, warningReport, lang);
            }

            return; // Don't enforce yet
        }
        // Warnings exhausted — proceed with full enforcement
    }

    pendingRemovals.add(targetJid);

    let privateStatus = '❌';
    let removeStatus = '❌';
    let blockStatus = '❌';

    try {
        // STEP 1: Delete message
        if (enforcementConfig.deleteMessage) {
            await deleteMessage(client, msg);
        }

        // STEP 2: Private warning/notification
        if (enforcementConfig.privateWarning) {
            try {
                const warnText = t('violation_removed', lang, {
                    groupName: groupConfig.groupName,
                    reason: reason,
                    time: formattedTime
                });
                await client.sendMessage(targetJid, warnText);
                privateStatus = '✅';
                logger.info(`Removal notice sent to ${number}`);
                await new Promise(r => setTimeout(r, 2000));
            } catch (e) {
                logger.error(`Warning failed for ${number}`, e);
            }
        }

        // STEP 3: Remove from group
        if (enforcementConfig.removeFromGroup) {
            try {
                await rateLimiter.throttle(async () => {
                    const chat = await client.getChatById(groupId);
                    await chat.removeParticipants([targetJid]);
                    logger.info(`Removed ${number} from ${groupConfig.groupName}`);
                    removeStatus = '✅';
                }, 'removal');
            } catch (e) {
                logger.error(`Remove failed for ${number}`, e);
            }
        }

        // STEP 4: Block user
        if (enforcementConfig.blockUser) {
            try {
                const contact = await client.getContactById(targetJid);
                await contact.block();
                blockStatus = '✅';
                logger.info(`Blocked ${number}`);
            } catch (e) {
                logger.error(`Block failed for ${number}`, e);
            }
        }

        // STEP 5: Send report
        if (enforcementConfig.sendReport) {
            let pushname = 'Unknown';
            try {
                const contact = await client.getContactById(senderJid);
                pushname = contact.pushname || contact.name || 'Unknown';
            } catch (e) { }

            const report = t('violation_report', lang, {
                pushname,
                number,
                reason,
                content: content || msgType,
                privateStatus,
                removeStatus,
                blockStatus,
                time: formattedTime
            });
            await sendReport(client, groupConfig, report, lang);
        }

        // Reset warnings after enforcement
        await database.resetWarnings(groupId, senderJid);

        // Log removal
        logger.appendLog(REMOVALS_LOG_FILE, `REMOVED: ${number} from ${groupConfig.groupName} - ${reason}`);

    } finally {
        pendingRemovals.delete(targetJid);
    }
}

/**
 * Delete a message
 */
async function deleteMessage(client, msg) {
    try {
        if (msg) {
            await msg.delete(true);
            logger.debug('Message deleted');
        }
    } catch (e) {
        logger.error('Delete failed', e);
    }
}

/**
 * Send report to configured target
 */
async function sendReport(client, groupConfig, report, lang) {
    const target = groupConfig.reportTarget || 'dm';

    try {
        if (target === 'dm') {
            // Send to group owner
            await client.sendMessage(groupConfig.ownerJid, report);
        } else if (target.startsWith('phone:')) {
            const phone = target.split(':')[1];
            await client.sendMessage(phone + '@s.whatsapp.net', report);
        } else if (target === 'mgmt_group' && groupConfig.mgmtGroupId) {
            await client.sendMessage(groupConfig.mgmtGroupId, report);
        } else {
            // Fallback to owner
            await client.sendMessage(groupConfig.ownerJid, report);
        }
        logger.info('Report sent');
    } catch (e) {
        logger.error('Report failed', e);
    }
}

/**
 * Handle "undo" — reply "בטל"/"undo" to a GroupShield report
 */
async function handleUndo(client, msg, groupConfig, lang) {
    if (!msg.hasQuotedMsg) return null;

    const quotedMsg = await msg.getQuotedMessage();
    const quotedContent = quotedMsg.body || '';

    // Check if quoted message is a GroupShield report
    if (!quotedContent.includes('GroupShield') && !quotedContent.includes('דו"ח')) {
        return t('undo_not_report', lang);
    }

    // Extract phone number from report
    const match = quotedContent.match(/(?:מספר|Number):\s*(\d+)/i);
    if (!match) {
        return t('undo_failed', lang, { error: lang === 'he' ? 'לא זוהה מספר' : 'Number not found' });
    }

    const targetNumber = match[1];
    const targetJid = targetNumber + '@s.whatsapp.net';

    try {
        // 1. Unblock
        try {
            const contact = await client.getContactById(targetJid);
            await contact.unblock();
        } catch (e) { /* May not be blocked */ }

        // 2. Add back to group
        try {
            const chat = await client.getChatById(groupConfig.groupId);
            await chat.addParticipants([targetJid]);
        } catch (e) {
            logger.error(`Failed to re-add ${targetNumber}`, e);
        }

        // 3. Reset warnings
        await database.resetWarnings(groupConfig.groupId, targetJid);

        logger.auditLog(msg.author || msg.from, 'UNDO', `User: ${targetNumber}`, true);
        return t('undo_success', lang, { number: targetNumber });
    } catch (e) {
        logger.error(`Undo failed for ${targetNumber}`, e);
        return t('undo_failed', lang, { error: e.message });
    }
}

/**
 * Check if a user is currently being removed (to intercept their messages)
 */
function isPendingRemoval(jid) {
    return pendingRemovals.has(jid);
}

module.exports = {
    executeEnforcement,
    handleUndo,
    isPendingRemoval,
    sendReport
};
