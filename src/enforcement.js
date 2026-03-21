// src/enforcement.js - Enforcement pipeline with fixed order
const database = require('./database');
const logger = require('./logger');
const { t } = require('./i18n');
const { extractNumber, withRetry } = require('./utils');
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
    const actionId = `ENF-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    // If already being removed, skip
    if (pendingRemovals.has(targetJid)) return;

    // Global protection fail-safe
    if (await database.isGlobalProtected(senderJid)) {
        logger.info(`Skipped enforcement for globally protected user ${number}`);
        return;
    }

    logger.warn(`🚨 Violation: ${number} in ${groupConfig.groupName} | Reason: ${reason}`);

    await database.createEnforcementAction({
        actionId,
        groupId,
        userJid: senderJid,
        reason,
        content,
        msgType,
        status: 'started'
    });

    // Check if we should warn or enforce
    if (maxWarnings > 0 && enforcementConfig.privateWarning) {
        const currentCount = await database.getWarningCount(groupId, senderJid);
        if (currentCount < maxWarnings) {
            // Still in warning phase
            const newCount = await database.incrementWarning(groupId, senderJid);
            const remaining = maxWarnings - newCount;

            // Step 1: Delete message (if enabled, even during warning phase)
            if (enforcementConfig.deleteMessage) {
                const deleted = await deleteMessage(client, msg);
                await database.updateEnforcementActionStep(actionId, 'deleteStatus', deleted ? 'success' : 'failed');
            } else {
                await database.updateEnforcementActionStep(actionId, 'deleteStatus', 'skipped');
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
                await database.updateEnforcementActionStep(actionId, 'warningStatus', 'success');
            } catch (e) {
                logger.error(`Failed to send warning to ${number}`, e);
                await database.updateEnforcementActionStep(actionId, 'warningStatus', 'failed', e.message);
            }

            // Report warning if reporting is enabled
            if (enforcementConfig.sendReport) {
                const warningReport = `⚠️ *${lang === 'he' ? 'אזהרה' : 'Warning'}* (${newCount}/${maxWarnings})\n🏷️ ${groupConfig.groupName}\n👤 ${number}\n📝 ${reason}`;
                const reportSent = await sendReport(client, groupConfig, warningReport, lang);
                await database.updateEnforcementActionStep(actionId, 'reportStatus', reportSent ? 'success' : 'failed');
            } else {
                await database.updateEnforcementActionStep(actionId, 'reportStatus', 'skipped');
            }

            await database.completeEnforcementAction(actionId, 'warning_phase');

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
            const deleted = await deleteMessage(client, msg);
            await database.updateEnforcementActionStep(actionId, 'deleteStatus', deleted ? 'success' : 'failed');
        } else {
            await database.updateEnforcementActionStep(actionId, 'deleteStatus', 'skipped');
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
                await database.updateEnforcementActionStep(actionId, 'warningStatus', 'success');
            } catch (e) {
                logger.error(`Warning failed for ${number}`, e);
                await database.updateEnforcementActionStep(actionId, 'warningStatus', 'failed', e.message);
            }
            // Brief delay to allow the warning message to be delivered before removal
            await new Promise(r => setTimeout(r, 2000));
        } else {
            await database.updateEnforcementActionStep(actionId, 'warningStatus', 'skipped');
        }

        // STEP 3: Remove from group
        if (enforcementConfig.removeFromGroup) {
            try {
                await rateLimiter.throttle(async () => {
                    const chat = await withRetry(() => client.getChatById(groupId), 3, 800);
                    await chat.removeParticipants([targetJid]);
                    logger.info(`Removed ${number} from ${groupConfig.groupName}`);
                    removeStatus = '✅';
                }, 'removal');
                await database.updateEnforcementActionStep(actionId, 'removeStatus', 'success');
            } catch (e) {
                logger.error(`Remove failed for ${number}`, e);
                await database.updateEnforcementActionStep(actionId, 'removeStatus', 'failed', e.message);
            }
        } else {
            await database.updateEnforcementActionStep(actionId, 'removeStatus', 'skipped');
        }

        // STEP 4: Block user
        if (enforcementConfig.blockUser) {
            try {
                const contact = await client.getContactById(targetJid);
                await contact.block();
                blockStatus = '✅';
                logger.info(`Blocked ${number}`);
                await database.updateEnforcementActionStep(actionId, 'blockStatus', 'success');
            } catch (e) {
                logger.error(`Block failed for ${number}`, e);
                await database.updateEnforcementActionStep(actionId, 'blockStatus', 'failed', e.message);
            }
        } else {
            await database.updateEnforcementActionStep(actionId, 'blockStatus', 'skipped');
        }

        // STEP 5: Send report
        if (enforcementConfig.sendReport) {
            let pushname = 'Unknown';
            try {
                const contact = await client.getContactById(senderJid);
                pushname = contact.pushname || contact.name || 'Unknown';
            } catch (e) { }

            const report = t('violation_report', lang, {
                groupName: groupConfig.groupName,
                groupId: groupConfig.groupId,
                pushname,
                number,
                reason,
                content: content || msgType,
                privateStatus,
                removeStatus,
                blockStatus,
                time: formattedTime,
                violationId: actionId
            });
            const reportSent = await sendReport(client, groupConfig, report, lang);
            await database.updateEnforcementActionStep(actionId, 'reportStatus', reportSent ? 'success' : 'failed');
        } else {
            await database.updateEnforcementActionStep(actionId, 'reportStatus', 'skipped');
        }

        // Reset warnings after enforcement
        await database.resetWarnings(groupId, senderJid);

        // Log removal
        logger.appendLog(REMOVALS_LOG_FILE, `REMOVED: ${number} from ${groupConfig.groupName} - ${reason}`);
        await database.completeEnforcementAction(actionId, 'completed');

    } catch (e) {
        await database.completeEnforcementAction(actionId, 'failed', e.message || 'Unknown error');
        throw e;
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
            return true;
        }
        return false;
    } catch (e) {
        logger.warn(`Delete failed: ${e.message}`);
        return false;
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
            if (!phone) {
                await client.sendMessage(groupConfig.ownerJid, report);
            } else {
                await client.sendMessage(phone + '@s.whatsapp.net', report);
            }
        } else if (target === 'mgmt_group' && groupConfig.mgmtGroupId) {
            await client.sendMessage(groupConfig.mgmtGroupId, report);
        } else {
            // Fallback to owner
            await client.sendMessage(groupConfig.ownerJid, report);
        }
        logger.info('Report sent');
        return true;
    } catch (e) {
        logger.error('Report failed', e);
        return false;
    }
}

/**
 * Handle "undo" — reply "בטל"/"undo" to a GroupShield report
 */
async function handleUndo(client, msg, groupConfig, lang) {
    if (!msg.hasQuotedMsg) return null;

    const quotedMsg = await msg.getQuotedMessage();
    const quotedContent = quotedMsg.body || '';

    // Must be a bot-authored report message
    if (!quotedMsg.fromMe) {
        return t('undo_not_report', lang);
    }

    // Check if quoted message is a GroupShield report
    if (!quotedContent.includes('GroupShield') && !quotedContent.includes('דו"ח')) {
        return t('undo_not_report', lang);
    }

    // Extract action ID + phone number from report
    const idMatch = quotedContent.match(/(?:ID|מזהה):\s*(ENF-[\w-]+)/i);
    const actionId = idMatch ? idMatch[1] : null;
    const groupIdMatch = quotedContent.match(/(?:Group ID|מזהה קבוצה):\s*([^\s\n]+)/i);
    const quotedGroupId = groupIdMatch ? groupIdMatch[1] : null;
    const match = quotedContent.match(/(?:מספר|Number):\s*(\d+)/i);
    if (!match) {
        return t('undo_failed', lang, { error: lang === 'he' ? 'לא זוהה מספר' : 'Number not found' });
    }

    const targetNumber = match[1];
    const targetJid = targetNumber + '@s.whatsapp.net';

    if (!actionId) {
        return t('undo_failed', lang, { error: lang === 'he' ? 'דו"ח ישן ללא מזהה פעולה' : 'Old report without action ID' });
    }

    const action = await database.getEnforcementAction(actionId);
    if (!action) {
        return t('undo_failed', lang, { error: lang === 'he' ? 'פעולת אכיפה לא נמצאה' : 'Enforcement action not found' });
    }

    if (action.status !== 'completed') {
        return t('undo_failed', lang, {
            error: lang === 'he' ? 'הפעולה כבר בוטלה או לא במצב שניתן לבטל' : 'Action already undone or not in a reversible state'
        });
    }

    const createdAtMs = new Date(action.createdAt).getTime();
    if (Number.isNaN(createdAtMs)) {
        return t('undo_failed', lang, { error: lang === 'he' ? 'תאריך פעולה לא תקין' : 'Invalid action date' });
    }
    const ageMs = Date.now() - createdAtMs;
    const maxUndoMs = 24 * 60 * 60 * 1000;
    if (ageMs > maxUndoMs) {
        return t('undo_expired', lang);
    }

    let effectiveGroupConfig = groupConfig;

    // In shared management groups, group ID is mandatory for safe undo routing
    const linked = await database.getGroupsByMgmtGroup(msg.from);
    if (linked.length > 1 && !quotedGroupId) {
        return t('undo_requires_group_id', lang);
    }

    if (quotedGroupId) {
        const byQuoted = await database.getGroup(quotedGroupId);
        if (byQuoted) {
            effectiveGroupConfig = byQuoted;
        }
    }

    try {
        // 1. Unblock
        try {
            const contact = await client.getContactById(targetJid);
            await contact.unblock();
        } catch (e) { /* May not be blocked */ }

        // 2. Add back to group
        let reAddSuccess = false;
        try {
            const chat = await withRetry(() => client.getChatById(effectiveGroupConfig.groupId), 3, 800);
            await chat.addParticipants([targetJid]);
            reAddSuccess = true;
        } catch (e) {
            logger.error(`Failed to re-add ${targetNumber}`, e);
        }
        if (!reAddSuccess) {
            return t('undo_failed', lang, { error: lang === 'he' ? 'לא ניתן להוסיף את המשתמש חזרה לקבוצה' : 'Could not re-add user to group' });
        }

        // 3. Reset warnings
        await database.resetWarnings(effectiveGroupConfig.groupId, targetJid);

        logger.auditLog(msg.author || msg.from, 'UNDO', `User: ${targetNumber}`, true);
        if (actionId) {
            await database.completeEnforcementAction(actionId, 'undone');
        }
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
