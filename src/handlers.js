// src/handlers.js - Message routing and group event handlers
const config = require('./config');
const logger = require('./logger');
const database = require('./database');
const { getNormalizedJid, extractNumber, resolveContactToPhone, withRetry, buildGroupRulesSummary } = require('./utils');
const { t } = require('./i18n');
const { evaluateMessage, checkAntiSpam } = require('./ruleEngine');
const { executeEnforcement, handleUndo, isPendingRemoval } = require('./enforcement');
const setupFlow = require('./setupFlow');
const commands = require('./commands');
const ADMIN_CACHE_TTL_MS = config.get('performance.adminCacheTtlMs', 60000);
const groupAdminCache = new Map();

async function sendBotReply(client, to, text) {
    if (!text) return;
    await client.sendMessage(to, text, { linkPreview: false });
}

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
        try { await msg.delete(true); } catch (e) { logger.warn(`Could not delete message from user being removed: ${senderJid}`, e.message); }
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

    // Explicit setup start trigger (anyone, including developer)
    if (setupFlow.isSetupTrigger(content)) {
        const response = await setupFlow.startSetup(senderJid, lang);
        if (response) {
            await client.sendMessage(msg.from, response, { linkPreview: false });
        }
        return;
    }

    // Developer: if actively in setup → continue setup; otherwise → execute commands directly
    if (config.isDeveloper(senderJid)) {
        const inSetup = await setupFlow.isInSetup(senderJid);
        if (inSetup) {
            const response = await setupFlow.processSetupMessage(client, senderJid, content);
            if (response) await sendBotReply(client, msg.from, response);
        } else {
            const response = await commands.executeCommand(client, senderJid, content, lang);
            if (response) {
                await sendBotReply(client, msg.from, response);
            } else {
                await client.sendMessage(msg.from, t('unknown_command', lang), { linkPreview: false });
            }
        }
        return;
    }

    // Check for pending admin action responses (demotion/removal)
    if (await handleAdminActionResponse(client, msg, senderJid, content, lang)) {
        return;
    }

    // Check if user is responding to a Welcome Message DM
    const lowerContent = content.trim().toLowerCase();
    const isAgree = lowerContent === '1' || lowerContent.includes('מסכים') || lowerContent === 'agree';
    const isDisagree = lowerContent === '2' || lowerContent.includes('לא מסכים') || lowerContent === 'disagree';

    if (isAgree || isDisagree) {
        const pendingRows = await database.getPendingMember(senderJid);
        if (pendingRows && pendingRows.length > 0) {
            for (const row of pendingRows) {
                const groupConfig = await database.getGroup(row.groupId);
                if (!groupConfig) continue;

                if (isAgree) {
                    await database.removePendingMember(row.groupId, senderJid);
                    await client.sendMessage(msg.from, t('welcome_agreed', lang, { groupName: groupConfig.groupName }), { linkPreview: false });
                    logger.info(`User ${extractNumber(senderJid)} agreed to rules in ${groupConfig.groupName}`);
                } else if (isDisagree) {
                    await client.sendMessage(msg.from, t('welcome_disagreed', lang), { linkPreview: false });
                    try {
                        const chat = await client.getChatById(row.groupId);
                        await chat.removeParticipants([senderJid]);
                    } catch (e) {
                        logger.error(`Failed to remove disagreeing user ${senderJid} from ${groupConfig.groupName}`, e);
                    }
                    await database.removePendingMember(row.groupId, senderJid);
                    logger.info(`User ${extractNumber(senderJid)} disagreed to rules and was removed from ${groupConfig.groupName}`);
                }
            }
            return;
        }
    }

    // Check if user is in setup flow
    const inSetup = await setupFlow.isInSetup(senderJid);
    if (inSetup) {
        const response = await setupFlow.processSetupMessage(client, senderJid, content);
        if (response) {
            await sendBotReply(client, msg.from, response);
        }
        return;
    }

    // User has not started setup yet (and hasn't explicitly stopped enforcement)
    let setupState = {};
    try { setupState = user && user.setupState ? JSON.parse(user.setupState) : {}; } catch (e) { setupState = {}; }
    if (!user || !user.groupId) {
        // Only show setup hint if user has previously interacted with the bot
        // (prevents spamming warned group members who never opened the bot)
        if (user && setupState.step !== 'stopped') {
            await client.sendMessage(msg.from, t('setup_start_hint', lang), { linkPreview: false });
        }
        return;
    }

    // User has completed setup — handle commands
    const response = await commands.executeCommand(client, senderJid, content, lang);
    if (response) {
        await sendBotReply(client, msg.from, response);
        return;
    }

    // No command matched — show help
    await client.sendMessage(msg.from, t('unknown_command', lang), { linkPreview: false });
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
    const mgmtLinkedGroups = await database.getGroupsByMgmtGroup(groupJid);
    const isMgmtGroup = mgmtLinkedGroups.length > 0;

    if (!groupConfig && !isMgmtGroup) return; // Not a managed/mgmt group

    if (!groupConfig && isMgmtGroup) {
        // Use first linked group only for language fallback; operations below are multi-group aware
        groupConfig = mgmtLinkedGroups[0];
    }

    const senderUser = await database.getUser(senderJid);
    const ownerUser = await database.getUser(groupConfig.ownerJid);
    const lang = senderUser ? senderUser.language || 'he' : (ownerUser ? ownerUser.language || 'he' : 'he');

    // Handle bot removal/demotion responses within the mgmt group
    if (isMgmtGroup) {
        if (await handleAdminActionResponse(client, msg, senderJid, content, lang)) {
            return;
        }
    }

    // Check if this is the management group — handle undo and pending actions
    if (isMgmtGroup) {
        // Handle pending group actions (multi-group target selection)
        const possibleChoice = parseInt(content.trim(), 10);
        if (!isNaN(possibleChoice)) {
            const pendingAction = await database.getPendingGroupAction(senderJid);
            if (pendingAction) {
                const options = pendingAction.optionsData || [];
                if (possibleChoice > 0 && possibleChoice <= options.length) {
                    const targetGroupId = options[possibleChoice - 1];
                    const targetGroupConf = await database.getGroup(targetGroupId);
                    
                    if (targetGroupConf) {
                        if (pendingAction.action === 'pause') {
                            const response = await commands.pauseEnforcement(client, senderJid, targetGroupConf, pendingAction.duration, lang);
                            if (response) await msg.reply(response);
                        } else if (pendingAction.action === 'resume') {
                            if (targetGroupConf.status && targetGroupConf.status.startsWith('PAUSED_UNTIL:')) {
                                await database.updateGroupStatus(targetGroupConf.groupId, 'ACTIVE');
                                logger.auditLog(senderJid, 'RESUME_ENFORCEMENT', `Group: ${targetGroupConf.groupName}`, true);
                                await msg.reply(t('action_resumed', lang, { groupName: targetGroupConf.groupName }));
                            } else {
                                await msg.reply(lang === 'he' ? '❌ הקבוצה אינה מושהית.' : '❌ Group is not paused.');
                            }
                        } else if (pendingAction.action === 'stop') {
                            const response = await commands.stopEnforcement(client, senderJid, targetGroupConf, lang);
                            if (response) await msg.reply(response);
                        } else if (pendingAction.action === 'execute') {
                            // pendingAction.duration contains the original command string text
                            const response = await commands.executeCommand(client, senderJid, pendingAction.duration, lang, targetGroupConf);
                            if (response) await msg.reply(response);
                        }
                    } else {
                         await msg.reply(lang === 'he' ? '❌ שגיאה: הקבוצה לא נמצאה במסד הנתונים.' : '❌ Error: Group not found in database.');
                    }
                    
                    await database.deletePendingGroupAction(senderJid);
                    return;
                } else {
                    await msg.reply(lang === 'he' ? `❌ נא לבחור מספר תקין בין 1 ל-${options.length}.` : `❌ Please select a valid number between 1 and ${options.length}.`);
                    return;
                }
            }
        }

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

        // In management groups, allow only group-name approval/rejection commands and enforcement commands
        const mgmtCommand = (content || '').trim().toLowerCase();

        // Pause / Resume / Stop commands
        if (mgmtCommand.startsWith('השהה ') || mgmtCommand.startsWith('pause ') ||
            mgmtCommand === 'המשך אכיפה' || mgmtCommand === 'resume' || mgmtCommand === 'חזור לאכוף' || mgmtCommand === 'resume enforcement' ||
            mgmtCommand === 'הפסק אכיפה' || mgmtCommand === 'stop enforcement') {

            let targetGroupConf = null;
            let durationParams = null;

            if (mgmtCommand.startsWith('השהה ') || mgmtCommand.startsWith('pause ')) {
                const durationRaw = mgmtCommand.replace(/^(השהה |pause )/, '').trim();
                durationParams = parseInt(durationRaw, 10);
                if (isNaN(durationParams) || durationParams <= 0) {
                    await msg.reply(t('invalid_pause_duration', lang));
                    return;
                }
            }

            if (mgmtLinkedGroups.length === 1) {
                targetGroupConf = mgmtLinkedGroups[0];
            } else if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage();
                const quotedContent = quotedMsg.body || '';
                const groupIdMatch = quotedContent.match(/(?:Group ID|מזהה קבוצה):\s*([^\s\n]+)/i);
                if (groupIdMatch && groupIdMatch[1]) {
                    targetGroupConf = await database.getGroup(groupIdMatch[1]);
                }
            }

            if (!targetGroupConf && mgmtLinkedGroups.length > 1 && !msg.hasQuotedMsg) {
                // Multi-group target selection via numbering
                const optionsData = mgmtLinkedGroups.map(g => g.groupId);
                const actionType = (mgmtCommand.startsWith('השהה ') || mgmtCommand.startsWith('pause ')) ? 'pause' :
                                   (mgmtCommand === 'המשך אכיפה' || mgmtCommand === 'resume' || mgmtCommand === 'חזור לאכוף' || mgmtCommand === 'resume enforcement') ? 'resume' : 'stop';
                
                await database.createPendingGroupAction(senderJid, actionType, durationParams, optionsData);
                
                let promptMsg = lang === 'he' ? '👇 על איזה קבוצה תרצה להחיל את הפעולה? (השב במספר בלבד):\n' : '👇 Which group would you like to apply this action to? (Reply with a number):\n';
                mgmtLinkedGroups.forEach((g, idx) => {
                    promptMsg += `${idx + 1}. ${g.groupName}\n`;
                });
                await msg.reply(promptMsg);
                return;
            } else if (!targetGroupConf) {
                await msg.reply(lang === 'he' ? '❌ בקבוצת הנהלה משותפת יש להגיב לדו״ח של הבוט כדי לבצע פעולה זו.' : '❌ In a shared management group, please reply to a bot report to perform this action.');
                return;
            }

            // Now apply the command to targetGroupConf
            if (mgmtCommand.startsWith('השהה ') || mgmtCommand.startsWith('pause ')) {
                const response = await commands.pauseEnforcement(client, senderJid, targetGroupConf, durationParams, lang);
                if (response) await msg.reply(response);
            } else if (mgmtCommand === 'המשך אכיפה' || mgmtCommand === 'resume' || mgmtCommand === 'חזור לאכוף' || mgmtCommand === 'resume enforcement') {
                if (targetGroupConf.status && targetGroupConf.status.startsWith('PAUSED_UNTIL:')) {
                    await database.updateGroupStatus(targetGroupConf.groupId, 'ACTIVE');
                    logger.auditLog(senderJid, 'RESUME_ENFORCEMENT', `Group: ${targetGroupConf.groupName}`, true);
                    await msg.reply(t('action_resumed', lang, { groupName: targetGroupConf.groupName }));
                } else {
                    await msg.reply(lang === 'he' ? '❌ הקבוצה אינה מושהית.' : '❌ Group is not paused.');
                }
            } else if (mgmtCommand === 'הפסק אכיפה' || mgmtCommand === 'stop enforcement') {
                const response = await commands.stopEnforcement(client, senderJid, targetGroupConf, lang);
                if (response) await msg.reply(response);
            }
            return;
        }

        const isGeneralMultiGroupCommand = 
            mgmtCommand.startsWith('הוסף חסין ') || mgmtCommand.startsWith('exempt add ') ||
            mgmtCommand.startsWith('הסר חסין ') || mgmtCommand.startsWith('exempt remove ') ||
            mgmtCommand === 'רשימת חסינים' || mgmtCommand === 'exempt list' ||
            mgmtCommand.startsWith('אפס אזהרות ') || mgmtCommand.startsWith('warnings reset ') ||
            mgmtCommand === 'התחל' || mgmtCommand === 'start' || mgmtCommand === 'setup' || mgmtCommand === 'start setup' ||
            mgmtCommand === 'הגדרות' || mgmtCommand === 'settings' ||
            mgmtCommand === 'עדכן אכיפה' || mgmtCommand === 'update enforcement' ||
            mgmtCommand === 'איפוס' || mgmtCommand === 'reset' ||
            mgmtCommand === 'חוקי הקבוצה' || mgmtCommand === 'group rules';

        if (isGeneralMultiGroupCommand) {
            let targetGroupConf = null;

            if (mgmtLinkedGroups.length === 1) {
                targetGroupConf = mgmtLinkedGroups[0];
            } else if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage();
                const quotedContent = quotedMsg.body || '';
                const groupIdMatch = quotedContent.match(/(?:Group ID|מזהה קבוצה):\s*([^\s\n]+)/i);
                if (groupIdMatch && groupIdMatch[1]) {
                    targetGroupConf = await database.getGroup(groupIdMatch[1]);
                }
            }

            if (!targetGroupConf && mgmtLinkedGroups.length > 1 && !msg.hasQuotedMsg) {
                // Multi-group target selection via numbering
                const optionsData = mgmtLinkedGroups.map(g => g.groupId);
                // We store the original message text in 'duration' parameter
                await database.createPendingGroupAction(senderJid, 'execute', content, optionsData);
                
                let promptMsg = lang === 'he' ? '👇 על איזה קבוצה תרצה להחיל את הפעולה? (השב במספר בלבד):\n' : '👇 Which group would you like to apply this action to? (Reply with a number):\n';
                mgmtLinkedGroups.forEach((g, idx) => {
                    promptMsg += `${idx + 1}. ${g.groupName}\n`;
                });
                await msg.reply(promptMsg);
                return;
            } else if (!targetGroupConf) {
                await msg.reply(lang === 'he' ? '❌ בקבוצת הנהלה משותפת יש להגיב לדו״ח של הבוט כדי לבצע פעולה זו.' : '❌ In a shared management group, please reply to a bot report to perform this action.');
                return;
            }

            // Apply directly
            const mgmtResponse = await commands.executeCommand(client, senderJid, content, lang, targetGroupConf);
            if (mgmtResponse) {
                await msg.reply(mgmtResponse);
            }
            return;
        }

        const isApproveCommand =
            mgmtCommand.startsWith('אימות שם ') ||
            mgmtCommand.startsWith('verify name ');

        const isRejectCommand =
            mgmtCommand.startsWith('לא אימות שם ') ||
            mgmtCommand.startsWith('verify_not name ');

        if (isApproveCommand) {
            const requestId = content.trim().replace(/^(אימות שם |verify name )/i, '').trim();
            const response = await commands.approveGroupNameChange(client, senderJid, requestId, lang);
            if (response) await msg.reply(response);
        } else if (isRejectCommand) {
            const requestId = content.trim().replace(/^(לא אימות שם |verify_not name )/i, '').trim();
            const response = await commands.stopEnforcementOnNameRejection(client, senderJid, requestId, lang, false);
            if (response) await msg.reply(response);
        }

        return; // Don't enforce rules in management group
    }

    // ── Pre-Check for PAUSED / PENDING status ───────────────────────
    if (!isMgmtGroup && groupConfig) {
        if (groupConfig.status === 'PENDING_ADMIN_ACTION' || groupConfig.status === 'PENDING_ADMIN_RESUME') {
            return; // Not enforcing right now
        }
        if (groupConfig.status && groupConfig.status.startsWith('PAUSED_UNTIL:')) {
            const untilIso = groupConfig.status.split('PAUSED_UNTIL:')[1];
            if (untilIso) {
                const untilTime = new Date(untilIso).getTime();
                if (Date.now() < untilTime) {
                    return; // Group is paused, do not enforce
                } else {
                    // Pause expired, resume automatically
                    await database.updateGroupStatus(groupConfig.groupId, 'ACTIVE');
                    groupConfig.status = 'ACTIVE';
                    logger.info(`Pause expired for ${groupConfig.groupName}, resuming enforcement.`);
                }
            }
        }
    }

    // Global immunity: users who started setup flow are never enforced
    if (await database.isGlobalProtected(senderJid)) return;

    // ── Immunity Checks ─────────────────────────────────────────────

    // Check if sender is group admin
    try {
        const isAdmin = await isGroupAdminCached(client, groupJid, senderJid);
        if (isAdmin) {
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

    // ── Welcome Message Strict Enforcement ──────────────────────────

    // If user is pending agreement, reject their message and remove them
    const isPending = await database.isPendingMember(groupJid, senderJid);
    if (isPending) {
        try { await msg.delete(true); } catch (e) { logger.warn(`Could not delete message from unapproved pending member: ${senderJid}`, e.message); }

        // Notify DM
        const dmMsg = t('welcome_unapproved_message', lang);
        try { await client.sendMessage(senderJid, dmMsg, { linkPreview: false }); } catch (e) { logger.warn(`Could not send DM to unapproved member: ${senderJid}`, e.message); }

        // Remove from group
        try {
            const chat = await client.getChatById(groupJid);
            await chat.removeParticipants([senderJid]);
        } catch (e) {
            logger.error(`Failed to remove unapproved user ${senderJid}`, e);
        }

        // Cleanup DB and log action
        await database.removePendingMember(groupJid, senderJid);

        const actionId = `ACT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        await database.createEnforcementAction({
            actionId,
            groupId: groupJid,
            userJid: senderJid,
            reason: t('reason_unapproved_welcome', lang),
            content,
            msgType,
            status: 'completed'
        });

        await database.updateEnforcementActionStep(actionId, 'deleteStatus', 'success');
        await database.updateEnforcementActionStep(actionId, 'warningStatus', 'skipped');
        await database.updateEnforcementActionStep(actionId, 'removeStatus', 'success');

        logger.info(`Removed user ${extractNumber(senderJid)} from ${groupConfig.groupName} for sending message before rule approval`);
        return;
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
            try { await msg.react('⚠️'); } catch (e) { logger.warn(`Could not react to spam warning message`, e.message); }
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

async function isGroupAdminCached(client, groupJid, senderJid) {
    const now = Date.now();
    const cached = groupAdminCache.get(groupJid);
    if (cached && (now - cached.fetchedAt) < ADMIN_CACHE_TTL_MS) {
        return cached.admins.has(senderJid);
    }

    const chat = await withRetry(() => client.getChatById(groupJid), 3, 700);
    const admins = new Set();
    for (const p of (chat.participants || [])) {
        if (p.isAdmin || p.isSuperAdmin) {
            admins.add(getNormalizedJid(p.id._serialized));
        }
    }

    groupAdminCache.set(groupJid, { admins, fetchedAt: now });
    return admins.has(senderJid);
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
        } catch (e) { logger.warn(`Could not fetch member count for group ${g.groupId}`, e.message); }

        const activeWarnings = await database.getActiveWarningsCount(g.groupId);

        // Determine status emoji based on group status
        let statusEmoji = '🟢';
        if (g.status && g.status.startsWith('PAUSED_UNTIL:')) {
            const until = new Date(g.status.split('PAUSED_UNTIL:')[1]);
            const timeStr = until.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
            statusEmoji = `⏸️ (עד ${timeStr})`;
        } else if (g.status === 'PENDING_ADMIN_ACTION') {
            statusEmoji = '⚠️';
        } else if (g.status === 'PENDING_ADMIN_RESUME') {
            statusEmoji = '🔄';
        }

        lines.push(`${statusEmoji} ${g.groupName} | 👥 ${memberCount} | ⚠️ ${activeWarnings}`);
    }

    const time = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    const title = lang === 'he' ? '📊 סטטוס קבוצות אכיפה (קבוצת הנהלה משותפת)' : '📊 Enforced Groups Status (Shared Management Group)';
    return `${title}\n${lines.join('\n')}\n🕒 ${time}`;
}

/**
 * Handle group participant updates (joins/leaves)
 */
async function handleGroupNotification(client, notification) {
    const groupId = notification.chatId;
    if (!groupId) return;

    invalidateGroupAdminCache(groupId);

    const groupConfig = await database.getGroup(groupId);
    if (!groupConfig) return; // Not a managed group

    const action = notification.type;
    const participants = notification.recipientIds || [];

    // ── Bot Demotion or Removal ──────────────────────────────────────
    const botJid = client.info && client.info.wid ? getNormalizedJid(client.info.wid._serialized) : null;
    if (botJid && participants.includes(botJid)) {
        if (action === 'remove' || action === 'leave' || action === 'demote') {
            await handleBotDemotionOrRemoval(client, groupConfig, action);
            return;
        } else if (action === 'promote') {
            // Edge case: Bot was manually promoted to admin in WhatsApp, bypassing external bot commands
            if (groupConfig.status === 'PENDING_ADMIN_ACTION' || groupConfig.status === 'PENDING_ADMIN_RESUME') {
                await database.updateGroupStatus(groupId, 'ACTIVE');
                logger.info(`Bot was manually promoted back in ${groupConfig.groupName}, automatically resuming enforcement.`);

                // Notify the reporter that it was detected automatically
                const ownerUser = await database.getUser(groupConfig.ownerJid);
                const lang = ownerUser ? ownerUser.language || 'he' : 'he';
                const msg = lang === 'he'
                    ? `✅ זיהיתי שחזרתי להיות מנהל בקבוצה *${groupConfig.groupName}*. האכיפה חזרה לפעילות באופן אוטומטי.`
                    : `✅ I noticed I've been promoted to admin in *${groupConfig.groupName}*. Enforcement has automatically resumed.`;
                await sendNoticeToReporter(client, groupConfig, msg);
            }
            return;
        }
    }

    if (action === 'add' || action === 'invite') {
        const ownerUser = await database.getUser(groupConfig.ownerJid);
        const lang = ownerUser ? ownerUser.language || 'he' : 'he';

        for (const pId of participants) {
            const addedJid = getNormalizedJid(pId);
            const addedNum = extractNumber(addedJid);
            logger.info(`JOIN: ${addedNum} joined ${groupConfig.groupName}`);

            // Welcome Message Logic
            if (groupConfig.welcomeMessageEnabled) {
                // Determine if user is exempt/immune
                let shouldSendWelcome = true;
                if (groupConfig.ownerJid === addedJid) shouldSendWelcome = false;
                if (shouldSendWelcome && await database.isGlobalProtected(addedJid)) shouldSendWelcome = false;
                if (shouldSendWelcome && await database.isExempt(groupConfig.groupId, addedJid)) shouldSendWelcome = false;

                if (shouldSendWelcome) {
                    try {
                        const rules = await database.getRules(groupConfig.groupId);
                        const enf = await database.getEnforcement(groupConfig.groupId);
                        const rulesSummary = buildGroupRulesSummary(groupConfig, rules, enf, t, lang);

                        const welcomeText = t('welcome_dm', lang, {
                            groupName: groupConfig.groupName,
                            rulesSummary
                        });

                        await database.addPendingMember(groupConfig.groupId, addedJid);
                        await client.sendMessage(addedJid, welcomeText, { linkPreview: false });
                        await database.markPendingMemberNotified(groupConfig.groupId, addedJid);
                        logger.info(`Sent welcome rules DM to ${addedNum} for group ${groupConfig.groupName}`);
                    } catch (e) {
                        logger.error(`Failed to send welcome message to ${addedNum}`, e);
                        // If we can't DM them, we might be blocked by privacy settings.
                        // We leave them in pending_group_members so the 24h cron evicts them if they never agree.
                    }
                }
            }
        }
    }

    if (action === 'remove' || action === 'leave') {
        // Reset warnings for removed/left users
        for (const pId of participants) {
            const jid = getNormalizedJid(pId);
            await database.resetWarnings(groupConfig.groupId, jid);
        }
    }
}

async function handleBotDemotionOrRemoval(client, groupConfig, action) {
    logger.info(`Bot was ${action === 'demote' ? 'demoted' : 'removed'} from ${groupConfig.groupName}`);
    await database.updateGroupStatus(groupConfig.groupId, 'PENDING_ADMIN_ACTION');

    const ownerUser = await database.getUser(groupConfig.ownerJid);
    const lang = ownerUser ? ownerUser.language || 'he' : 'he';

    const reason = action === 'demote' ? t('bot_demoted', lang) : t('bot_removed', lang);
    const text = t('bot_action_required', lang, {
        groupName: groupConfig.groupName,
        reason
    });

    await sendNoticeToReporter(client, groupConfig, text);
}

async function sendNoticeToReporter(client, groupConfig, text) {
    try {
        if (groupConfig.reportTarget === 'mgmt_group' && groupConfig.mgmtGroupId) {
            await client.sendMessage(groupConfig.mgmtGroupId, text, { linkPreview: false });
        } else if (groupConfig.reportTarget && groupConfig.reportTarget.startsWith('phone:')) {
            const phone = groupConfig.reportTarget.split(':')[1];
            await client.sendMessage(phone + '@s.whatsapp.net', text, { linkPreview: false });
        } else {
            await client.sendMessage(groupConfig.ownerJid, text, { linkPreview: false });
        }
    } catch (e) {
        logger.error(`Failed to send notice to reporter for ${groupConfig.groupId}`, e);
    }
}

async function handleAdminActionResponse(client, msg, senderJid, content, lang) {
    const text = (content || '').trim().toLowerCase();

    // Quick check if the message could be a response
    if (text !== '1' && text !== '2' && text !== 'בוצע' && text !== 'done') {
        return false;
    }

    const pendingGroups = await database.getPendingAdminActionGroups();
    if (pendingGroups.length === 0) return false;

    // Filter to groups where this sender has authority
    const authorizedGroups = pendingGroups.filter(g => {
        if (g.reportTarget === 'mgmt_group' && g.mgmtGroupId === msg.from) return true;
        if (g.reportTarget === `phone:${extractNumber(senderJid)}`) return true;
        if (g.ownerJid === senderJid) return true;
        return false;
    });

    if (authorizedGroups.length === 0) return false;

    // Handle multiple pending groups — ask which one if more than one
    if (authorizedGroups.length > 1) {
        let promptMsg = lang === 'he'
            ? '⚠️ יש מספר קבוצות שממתינות לפעולה. על איזו קבוצה הפעולה מתייחסת?\n'
            : '⚠️ Multiple groups are awaiting action. Which group does this apply to?\n';
        authorizedGroups.forEach((g, idx) => {
            promptMsg += `${idx + 1}. ${g.groupName}\n`;
        });
        await msg.reply(promptMsg);
        return true;
    }

    const targetGroup = authorizedGroups[0];

    if (targetGroup.status === 'PENDING_ADMIN_ACTION') {
        if (text === '1') {
            await database.updateGroupStatus(targetGroup.groupId, 'PENDING_ADMIN_RESUME');
            await msg.reply(t('bot_action_resume_guide', lang));
            return true;
        } else if (text === '2') {
            // Stop Completely - stop command already exists in commands.js via stopEnforcement, but we implement the logic here directly
            await database.setGroupActive(targetGroup.groupId, false);
            await database.deleteGroup(targetGroup.groupId);

            // Try to leave
            try {
                const managedChat = await client.getChatById(targetGroup.groupId);
                await managedChat.leave();
            } catch (e) {
                logger.warn(`Could not leave managed group ${targetGroup.groupId} during stop completely`);
            }

            await msg.reply(t('stop_enforcement_done', lang, { groupName: targetGroup.groupName }));
            logger.auditLog(senderJid, 'STOP_ENFORCEMENT', `Group: ${targetGroup.groupName} (via bot removal prompt)`, true);
            return true;
        }
    } else if (targetGroup.status === 'PENDING_ADMIN_RESUME' && (text === 'בוצע' || text === 'done')) {
        // Verify admin status
        try {
            const chat = await withRetry(() => client.getChatById(targetGroup.groupId), 3, 700);
            const botJid = client.info && client.info.wid ? getNormalizedJid(client.info.wid._serialized) : null;
            let nIsAdmin = false;

            if (chat && chat.participants && botJid) {
                const botParticipant = chat.participants.find(p => getNormalizedJid(p.id._serialized) === botJid);
                if (botParticipant && (botParticipant.isAdmin || botParticipant.isSuperAdmin)) {
                    nIsAdmin = true;
                }
            }

            if (nIsAdmin) {
                await database.updateGroupStatus(targetGroup.groupId, 'ACTIVE');
                await msg.reply(lang === 'he' ? '✅ מעולה. חזרתי להיות מנהל והאכיפה חזרה לפעילות.' : '✅ Great. I am an admin again and enforcement has resumed.');
                logger.info(`Resumed enforcement for ${targetGroup.groupName}`);
            } else {
                await msg.reply(t('group_not_admin', lang));
            }
            return true;
        } catch (e) {
            logger.error(`Failed to verify admin status before resume for ${targetGroup.groupId}`, e);
            await msg.reply(lang === 'he' ? '❌ שגיאה בבדיקת ההרשאות. אנא נסה שנית בעוד רגע.' : '❌ Error checking permissions. Please try again in a moment.');
            return true;
        }
    }

    return false;
}

function invalidateGroupAdminCache(groupJid) {
    groupAdminCache.delete(groupJid);
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
    // ── 1. Handle expired name-change approval requests (12-hour timeout) ───────────
    try {
        const expired = await database.getExpiredNameChangeRequests(12);
        for (const req of expired) {
            try {
                const groupConfig = await database.getGroup(req.groupId);
                if (!groupConfig) {
                    await database.resolveGroupNameChangeRequest(req.requestId, 'timeout_missing_group', 'system');
                    continue;
                }
                const ownerUser = await database.getUser(groupConfig.ownerJid);
                const lang = ownerUser ? ownerUser.language || 'he' : 'he';

                // Notify before stopping
                const timeoutMsg = t('name_change_timeout', lang, { groupName: groupConfig.groupName });
                await sendNoticeToReporter(client, groupConfig, timeoutMsg);

                // Stop enforcement (marks request as rejected internally)
                await commands.stopEnforcementOnNameRejection(client, null, req.requestId, lang, true);
                logger.info(`Auto-stopped enforcement for ${groupConfig.groupName} due to name change timeout (req: ${req.requestId})`);
            } catch (e) {
                logger.error(`Failed to handle expired name change request ${req.requestId}`, e);
            }
        }
    } catch (e) {
        logger.error('Failed to scan for expired name change requests', e);
    }

    // ── 2. Check for new group name changes ────────────────────────────────────
    const groups = await database.getAllManagedGroupsForNameRefresh();

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
                await client.sendMessage(g.mgmtGroupId, prompt, { linkPreview: false });
            } else if (g.reportTarget && g.reportTarget.startsWith('phone:')) {
                const phone = g.reportTarget.split(':')[1];
                await client.sendMessage(phone + '@s.whatsapp.net', prompt, { linkPreview: false });
            } else {
                await client.sendMessage(g.ownerJid, prompt, { linkPreview: false });
            }

            logger.info(`Detected group name change for ${storedName} -> ${detectedName} (request ${requestId})`);
        } catch (e) {
            logger.error(`Group name refresh failed for ${g.groupId}`, e);
        }
    }
}

module.exports = {
    processMessage,
    handleGroupNotification,
    buildStatusMessage,
    refreshManagedGroupNames
};
