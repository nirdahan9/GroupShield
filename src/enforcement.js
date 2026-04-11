// src/enforcement.js - Enforcement pipeline with fixed order
const database = require('./database');
const logger = require('./logger');
const { t } = require('./i18n');
const { extractNumber, withRetry } = require('./utils');
const path = require('path');
const config = require('./config');
const messageLog = require('./messageLog');

/**
 * Format a phone number for display in group messages (e.g. 972541234567 → 972-54-123-4567)
 */
function formatNumberForDisplay(number) {
    const str = String(number);
    if (/^972\d{9}$/.test(str)) {
        return `${str.slice(0, 3)}-${str.slice(3, 5)}-${str.slice(5, 8)}-${str.slice(8)}`;
    }
    return str;
}

const REMOVALS_LOG_FILE = path.join(__dirname, '../removals_log.txt');

// Track users currently undergoing the removal process
const pendingRemovals = new Set();

function formatContent(content, msgType, lang) {
    if (content && content.trim()) return `"${content.trim()}"`;
    const labels = {
        image:    { he: '📸 [תמונה]',          en: '📸 [Image]' },
        video:    { he: '🎥 [וידאו]',           en: '🎥 [Video]' },
        sticker:  { he: '🎭 [סטיקר]',           en: '🎭 [Sticker]' },
        document: { he: '📄 [מסמך]',            en: '📄 [Document]' },
        audio:    { he: '🎵 [אודיו]',           en: '🎵 [Audio]' },
        ptt:      { he: '🎙️ [הקלטה קולית]',    en: '🎙️ [Voice note]' },
    };
    return (labels[msgType] && labels[msgType][lang]) || (lang === 'he' ? '[הודעה לא-טקסטואלית]' : '[Non-text message]');
}

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
async function executeEnforcement(client, msg, senderJid, violations, content, msgType, groupConfig, enforcementConfig, rateLimiter, lang, source = 'rule_engine') {
    const number = extractNumber(senderJid);
    const reason = violations.join(lang === 'he' ? ' וגם ' : ' and ');
    const targetJid = number + '@s.whatsapp.net';
    const formattedTime = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    const groupId = groupConfig.groupId;

    // Log enforcement to the group's message log + increment stats counter
    messageLog.logEnforcement(groupId, groupConfig.groupName, senderJid, content, reason, source);
    database.incrementEnforcementStat(source).catch(() => {});
    const maxWarnings = groupConfig.warningCount || 0;
    const actionId = `ENF-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    // If already being removed, skip
    if (pendingRemovals.has(targetJid)) return;

    // Global protection fail-safe
    if (await database.isGlobalProtected(senderJid)) {
        logger.info(`Skipped enforcement for globally protected user ${number}`);
        return;
    }

    // Grace period check — skip enforcement for recently joined members
    const gracePeriodMinutes = groupConfig.gracePeriodMinutes || 0;
    if (gracePeriodMinutes > 0) {
        try {
            const joinRecord = await database.getMemberJoinTime(groupId, senderJid);
            if (joinRecord) {
                const joinedAt = new Date(joinRecord.joinedAt).getTime();
                const graceEndsAt = joinedAt + gracePeriodMinutes * 60 * 1000;
                if (Date.now() < graceEndsAt) {
                    logger.info(`Grace period active for ${number} in ${groupConfig.groupName} — skipping enforcement`);
                    return;
                }
            }
        } catch (e) {
            logger.warn(`Grace period check failed for ${number}`, e);
        }
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

    // Fetch pushname once — used in both warning and removal reports
    let pushname = number;
    try {
        const contact = await client.getContactById(senderJid);
        pushname = contact.pushname || contact.name || number;
    } catch (e) { }

    // Check if we should warn or enforce
    // Warning phase: counts violations up to maxWarnings regardless of warnPrivateDm.
    // warnPrivateDm only controls whether a DM is sent for each warning.
    if (maxWarnings > 0) {
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

            // Send warning DM only if warnPrivateDm is enabled
            if (enforcementConfig.warnPrivateDm) {
                try {
                    const warnText = t('violation_warning', lang, {
                        current: newCount.toString(),
                        max: maxWarnings.toString(),
                        groupName: groupConfig.groupName,
                        reason: reason,
                        remaining: remaining.toString(),
                        content: formatContent(content, msgType, lang)
                    });
                    await client.sendMessage(targetJid, warnText);
                    logger.info(`Warning ${newCount}/${maxWarnings} sent to ${number}`);
                    await database.updateEnforcementActionStep(actionId, 'warningStatus', 'success');
                } catch (e) {
                    logger.error(`Failed to send warning to ${number}`, e);
                    await database.updateEnforcementActionStep(actionId, 'warningStatus', 'failed', e.message);
                }
            } else {
                logger.info(`Warning ${newCount}/${maxWarnings} (silent, no DM) for ${number}`);
                await database.updateEnforcementActionStep(actionId, 'warningStatus', 'skipped');
            }

            // Public group notice for warning (if enabled)
            if (enforcementConfig.publicRemovalNotice) {
                try {
                    const displayNumber = formatNumberForDisplay(number);
                    const noticeText = t('public_warning_notice_msg', lang, {
                        number: displayNumber,
                        current: newCount.toString(),
                        max: maxWarnings.toString(),
                        reason
                    });
                    await client.sendMessage(groupId, noticeText, { mentions: [targetJid] }).catch(async () => {
                        await client.sendMessage(groupId, noticeText);
                    });
                } catch (e) {
                    logger.warn(`Public warning notice failed for ${number}`, e);
                }
            }

            // Report warning if reporting is enabled
            if (enforcementConfig.sendReport) {
                const warningReport = t('warning_report', lang, {
                    current: newCount.toString(),
                    max: maxWarnings.toString(),
                    groupName: groupConfig.groupName,
                    pushname,
                    number,
                    reason,
                    content: formatContent(content, msgType, lang)
                });
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

    try {
        // STEP 1: Delete message
        let messageWasDeleted = false;
        if (enforcementConfig.deleteMessage) {
            messageWasDeleted = await deleteMessage(client, msg);
            await database.updateEnforcementActionStep(actionId, 'deleteStatus', messageWasDeleted ? 'success' : 'failed');
        } else {
            await database.updateEnforcementActionStep(actionId, 'deleteStatus', 'skipped');
        }

        // STEP 1b: Public removal notice in group (if enabled)
        if (enforcementConfig.publicRemovalNotice) {
            try {
                const displayNumber = formatNumberForDisplay(number);
                const noticeText = t('public_removal_notice_msg', lang, { number: displayNumber, reason });
                await client.sendMessage(groupId, noticeText, { mentions: [targetJid] }).catch(async () => {
                    await client.sendMessage(groupId, noticeText);
                });
            } catch (e) {
                logger.warn(`Public removal notice failed for ${number}`, e);
            }
        }

        // STEP 2: Private warning/notification
        if (enforcementConfig.privateWarning) {
            try {
                const warnText = t('violation_removed', lang, {
                    groupName: groupConfig.groupName,
                    reason: reason,
                    content: formatContent(content, msgType, lang),
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

        // STEP 4: Send report
        if (enforcementConfig.sendReport) {
            const report = t('violation_report', lang, {
                groupName: groupConfig.groupName,
                pushname,
                number,
                reason,
                content: content || msgType,
                privateStatus,
                removeStatus,
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

    // Resolve group from the action record (groupId stored in DB — no longer in report text)
    if (action.groupId) {
        const byAction = await database.getGroup(action.groupId);
        if (byAction) {
            effectiveGroupConfig = byAction;
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
