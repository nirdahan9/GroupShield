// src/setupFlow.js - Interactive setup conversation via DM
const database = require('./database');
const logger = require('./logger');
const { t } = require('./i18n');
const { parsePhoneNumber, getNormalizedJid, extractNumber } = require('./utils');

/**
 * Process a DM message as part of the setup/command flow
 * Returns the response message string, or null if not handled
 */
async function processSetupMessage(client, senderJid, content) {
    // Get or create user
    let user = await database.getUser(senderJid);
    if (!user) {
        user = await database.createUser(senderJid, 'he');
    }

    const lang = user.language || 'he';

    // Parse setup state
    let state = {};
    try {
        state = user.setupState ? JSON.parse(user.setupState) : {};
    } catch (e) {
        state = {};
    }

    const step = state.step || 'welcome';

    // Handle each step
    switch (step) {
        case 'welcome':
            return await handleWelcome(client, senderJid, content, state, lang);
        case 'language':
            return await handleLanguage(client, senderJid, content, state, lang);
        case 'group_name':
            return await handleGroupName(client, senderJid, content, state, lang);
        case 'group_confirm':
            return await handleGroupConfirm(client, senderJid, content, state, lang);
        case 'admin_check':
            return await handleAdminCheck(client, senderJid, content, state, lang);
        case 'rules_type':
            return await handleRulesType(client, senderJid, content, state, lang);
        case 'rules_content':
            return await handleRulesContent(client, senderJid, content, state, lang);
        case 'time_window':
            return await handleTimeWindow(client, senderJid, content, state, lang);
        case 'time_day':
            return await handleTimeDay(client, senderJid, content, state, lang);
        case 'time_start':
            return await handleTimeStart(client, senderJid, content, state, lang);
        case 'time_end':
            return await handleTimeEnd(client, senderJid, content, state, lang);
        case 'antispam':
            return await handleAntiSpam(client, senderJid, content, state, lang);
        case 'spam_max':
            return await handleSpamMax(client, senderJid, content, state, lang);
        case 'spam_window':
            return await handleSpamWindow(client, senderJid, content, state, lang);
        case 'enforcement':
            return await handleEnforcement(client, senderJid, content, state, lang);
        case 'warnings':
            return await handleWarnings(client, senderJid, content, state, lang);
        case 'exempt':
            return await handleExempt(client, senderJid, content, state, lang);
        case 'report_target':
            return await handleReportTarget(client, senderJid, content, state, lang);
        case 'report_phone':
            return await handleReportPhone(client, senderJid, content, state, lang);
        case 'mgmt_group_name':
            return await handleMgmtGroupName(client, senderJid, content, state, lang);
        case 'mgmt_group_confirm':
            return await handleMgmtGroupConfirm(client, senderJid, content, state, lang);
        case 'summary':
            return await handleSummary(client, senderJid, content, state, lang);
        default:
            // Reset to welcome
            await saveState(senderJid, { step: 'welcome' });
            return t('welcome', lang);
    }
}

// ── State Management ─────────────────────────────────────────────────────

async function saveState(jid, state) {
    await database.updateUserSetupState(jid, state);
}

async function updateLang(jid, lang) {
    await database.updateUserLanguage(jid, lang);
}

// ── Step Handlers ────────────────────────────────────────────────────────

async function handleWelcome(client, jid, content, state, lang) {
    await saveState(jid, { step: 'language' });
    return t('welcome', lang);
}

async function handleLanguage(client, jid, content, state, lang) {
    const choice = content.trim();
    if (choice === '1' || choice.includes('עברית')) {
        await updateLang(jid, 'he');
        await saveState(jid, { step: 'group_name' });
        return t('lang_set', 'he') + '\n\n' + t('ask_group_name', 'he');
    } else if (choice === '2' || choice.toLowerCase().includes('english')) {
        await updateLang(jid, 'en');
        await saveState(jid, { step: 'group_name' });
        return t('lang_set', 'en') + '\n\n' + t('ask_group_name', 'en');
    }
    return t('welcome', lang);
}

async function handleGroupName(client, jid, content, state, lang) {
    const groupName = content.trim();
    if (!groupName) return t('ask_group_name', lang);

    // Search for the group among bot's groups
    try {
        const chats = await client.getChats();
        const groups = chats.filter(c => c.isGroup);

        // Case-insensitive search
        const match = groups.find(g =>
            g.name && g.name.toLowerCase() === groupName.toLowerCase()
        );

        if (!match) {
            // Try partial match
            const partial = groups.find(g =>
                g.name && g.name.toLowerCase().includes(groupName.toLowerCase())
            );
            if (partial) {
                const count = partial.participants ? partial.participants.length : 0;
                await saveState(jid, {
                    step: 'group_confirm',
                    candidateGroupId: partial.id._serialized,
                    candidateGroupName: partial.name
                });
                return t('group_found_confirm', lang, { name: partial.name, count: count.toString() });
            }
            return t('group_not_found', lang);
        }

        const count = match.participants ? match.participants.length : 0;
        await saveState(jid, {
            step: 'group_confirm',
            candidateGroupId: match.id._serialized,
            candidateGroupName: match.name
        });
        return t('group_found_confirm', lang, { name: match.name, count: count.toString() });
    } catch (e) {
        logger.error('Failed to search groups', e);
        return t('error_generic', lang, { error: e.message });
    }
}

async function handleGroupConfirm(client, jid, content, state, lang) {
    const choice = content.trim();
    if (choice === '1' || choice.includes('כן') || choice.toLowerCase() === 'yes') {
        // Confirmed — check admin status
        const groupId = state.candidateGroupId;
        try {
            const chat = await client.getChatById(groupId);
            const botInfo = await client.info;
            const botJid = botInfo.wid._serialized;

            const botParticipant = chat.participants.find(p =>
                p.id._serialized === botJid
            );
            const isAdmin = botParticipant && (botParticipant.isAdmin || botParticipant.isSuperAdmin);

            if (!isAdmin) {
                await saveState(jid, {
                    ...state,
                    step: 'admin_check'
                });
                return t('group_not_admin', lang);
            }

            // Bot is admin — proceed
            await saveState(jid, {
                step: 'rules_type',
                groupId: groupId,
                groupName: state.candidateGroupName
            });
            return t('group_admin_confirmed', lang) + '\n\n' + t('ask_rules_type', lang);
        } catch (e) {
            logger.error('Failed to check admin status', e);
            return t('error_generic', lang, { error: e.message });
        }
    } else {
        // Not the right group — search again
        await saveState(jid, { step: 'group_name' });
        return t('ask_group_name', lang);
    }
}

async function handleAdminCheck(client, jid, content, state, lang) {
    const check = content.trim().toLowerCase();
    if (check === 'בדוק' || check === 'check') {
        const groupId = state.candidateGroupId;
        try {
            const chat = await client.getChatById(groupId);
            const botInfo = await client.info;
            const botJid = botInfo.wid._serialized;

            const botParticipant = chat.participants.find(p =>
                p.id._serialized === botJid
            );
            const isAdmin = botParticipant && (botParticipant.isAdmin || botParticipant.isSuperAdmin);

            if (!isAdmin) {
                return t('group_not_admin', lang);
            }

            await saveState(jid, {
                step: 'rules_type',
                groupId: groupId,
                groupName: state.candidateGroupName
            });
            return t('group_admin_confirmed', lang) + '\n\n' + t('ask_rules_type', lang);
        } catch (e) {
            logger.error('Failed to re-check admin', e);
            return t('error_generic', lang, { error: e.message });
        }
    }
    return t('group_not_admin', lang);
}

async function handleRulesType(client, jid, content, state, lang) {
    const choice = content.trim();
    if (choice === '1') {
        await saveState(jid, { ...state, step: 'rules_content', rulesType: 'allowed' });
        return t('ask_allowed_messages', lang);
    } else if (choice === '2') {
        await saveState(jid, { ...state, step: 'rules_content', rulesType: 'forbidden' });
        return t('ask_forbidden_messages', lang);
    } else if (choice === '3') {
        await saveState(jid, { ...state, step: 'time_window', rulesType: 'none' });
        return t('ask_time_window', lang);
    }
    return t('ask_rules_type', lang);
}

async function handleRulesContent(client, jid, content, state, lang) {
    const messages = content.trim().split('\n').map(m => m.trim()).filter(m => m.length > 0);
    if (messages.length === 0) {
        return state.rulesType === 'allowed'
            ? t('ask_allowed_messages', lang)
            : t('ask_forbidden_messages', lang);
    }

    await saveState(jid, {
        ...state,
        step: 'time_window',
        rulesMessages: messages
    });
    return t('rules_content_saved', lang, { count: messages.length.toString() }) + '\n\n' + t('ask_time_window', lang);
}

async function handleTimeWindow(client, jid, content, state, lang) {
    const choice = content.trim();
    if (choice === '1' || choice.includes('כן') || choice.toLowerCase() === 'yes') {
        await saveState(jid, { ...state, step: 'time_day' });
        return t('ask_time_day', lang);
    } else if (choice === '2' || choice.includes('לא') || choice.toLowerCase() === 'no') {
        await saveState(jid, { ...state, step: 'antispam', timeWindow: null });
        return t('ask_antispam', lang);
    }
    return t('ask_time_window', lang);
}

async function handleTimeDay(client, jid, content, state, lang) {
    const day = parseInt(content.trim());
    if (isNaN(day) || day < 0 || day > 7) {
        return t('ask_time_day', lang);
    }
    await saveState(jid, { ...state, step: 'time_start', timeDay: day });
    return t('ask_time_start', lang);
}

async function handleTimeStart(client, jid, content, state, lang) {
    const hour = parseInt(content.trim());
    if (isNaN(hour) || hour < 0 || hour > 23) {
        return t('ask_time_start', lang);
    }
    await saveState(jid, { ...state, step: 'time_end', timeStartHour: hour });
    return t('ask_time_end', lang);
}

async function handleTimeEnd(client, jid, content, state, lang) {
    const hour = parseInt(content.trim());
    if (isNaN(hour) || hour < 0 || hour > 23) {
        return t('ask_time_end', lang);
    }

    const dayNames = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Every day' };
    const dayKey = `day_${state.timeDay}`;

    await saveState(jid, {
        ...state,
        step: 'antispam',
        timeEndHour: hour,
        timeWindow: { day: state.timeDay, startHour: state.timeStartHour, endHour: hour }
    });
    return t('time_window_saved', lang, {
        day: t(dayKey, lang),
        start: state.timeStartHour.toString(),
        end: hour.toString()
    }) + '\n\n' + t('ask_antispam', lang);
}

async function handleAntiSpam(client, jid, content, state, lang) {
    const choice = content.trim();
    if (choice === '1' || choice.includes('כן') || choice.toLowerCase() === 'yes') {
        await saveState(jid, { ...state, step: 'spam_max' });
        return t('ask_spam_max', lang);
    } else if (choice === '2' || choice.includes('לא') || choice.toLowerCase() === 'no') {
        await saveState(jid, { ...state, step: 'enforcement', antiSpam: null });
        return buildEnforcementQuestion(lang);
    }
    return t('ask_antispam', lang);
}

async function handleSpamMax(client, jid, content, state, lang) {
    const max = parseInt(content.trim());
    if (isNaN(max) || max < 1 || max > 100) {
        return t('ask_spam_max', lang);
    }
    await saveState(jid, { ...state, step: 'spam_window', spamMax: max });
    return t('ask_spam_window', lang);
}

async function handleSpamWindow(client, jid, content, state, lang) {
    const window = parseInt(content.trim());
    if (isNaN(window) || window < 1 || window > 300) {
        return t('ask_spam_window', lang);
    }
    await saveState(jid, {
        ...state,
        step: 'enforcement',
        antiSpam: { maxMessages: state.spamMax, windowSeconds: window }
    });
    return t('antispam_saved', lang, {
        max: state.spamMax.toString(),
        window: window.toString()
    }) + '\n\n' + buildEnforcementQuestion(lang);
}

function buildEnforcementQuestion(lang) {
    const steps = [
        t('enforcement_step_1', lang),
        t('enforcement_step_2', lang),
        t('enforcement_step_3', lang),
        t('enforcement_step_4', lang),
        t('enforcement_step_5', lang)
    ].join('\n');
    return t('ask_enforcement', lang, { steps });
}

async function handleEnforcement(client, jid, content, state, lang) {
    const choices = content.trim().split(/[,\s]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    if (choices.length === 0) {
        return buildEnforcementQuestion(lang);
    }

    const enforcementConfig = {
        deleteMessage: choices.includes(1),
        privateWarning: choices.includes(2),
        removeFromGroup: choices.includes(3),
        blockUser: choices.includes(4),
        sendReport: choices.includes(5)
    };

    await saveState(jid, { ...state, step: 'warnings', enforcementConfig });
    return t('enforcement_saved', lang) + '\n\n' + t('ask_warnings', lang);
}

async function handleWarnings(client, jid, content, state, lang) {
    const count = parseInt(content.trim());
    if (isNaN(count) || count < 0 || count > 99) {
        return t('ask_warnings', lang);
    }
    await saveState(jid, { ...state, step: 'exempt', warningCount: count });
    return t('warnings_saved', lang, { count: count.toString() }) + '\n\n' + t('ask_exempt', lang);
}

async function handleExempt(client, jid, content, state, lang) {
    const text = content.trim();
    const skipWords = ['דלג', 'skip', 'לא', 'no'];
    if (skipWords.includes(text.toLowerCase())) {
        await saveState(jid, { ...state, step: 'report_target', exemptNumbers: [] });
        return t('exempt_skipped', lang) + '\n\n' + t('ask_report_target', lang);
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const numbers = [];
    for (const line of lines) {
        const parsed = parsePhoneNumber(line);
        if (parsed) numbers.push(parsed);
    }

    if (numbers.length === 0) {
        return t('invalid_input', lang) + '\n\n' + t('ask_exempt', lang);
    }

    await saveState(jid, { ...state, step: 'report_target', exemptNumbers: numbers });
    return t('exempt_saved', lang, { count: numbers.length.toString() }) + '\n\n' + t('ask_report_target', lang);
}

async function handleReportTarget(client, jid, content, state, lang) {
    const choice = content.trim();
    if (choice === '1') {
        await saveState(jid, { ...state, step: 'summary', reportTarget: 'dm' });
        return await buildSummary(state, 'dm', null, lang);
    } else if (choice === '2') {
        await saveState(jid, { ...state, step: 'report_phone' });
        return t('ask_report_phone', lang);
    } else if (choice === '3') {
        await saveState(jid, { ...state, step: 'mgmt_group_name' });
        return t('ask_mgmt_group_name', lang);
    }
    return t('ask_report_target', lang);
}

async function handleReportPhone(client, jid, content, state, lang) {
    const parsed = parsePhoneNumber(content.trim());
    if (!parsed) {
        return t('invalid_input', lang) + '\n\n' + t('ask_report_phone', lang);
    }
    const reportTarget = `phone:${parsed}`;
    await saveState(jid, { ...state, step: 'summary', reportTarget });
    return await buildSummary(state, reportTarget, null, lang);
}

async function handleMgmtGroupName(client, jid, content, state, lang) {
    const groupName = content.trim();
    if (!groupName) return t('ask_mgmt_group_name', lang);

    try {
        const chats = await client.getChats();
        const groups = chats.filter(c => c.isGroup);
        const match = groups.find(g => g.name && (
            g.name.toLowerCase() === groupName.toLowerCase() ||
            g.name.toLowerCase().includes(groupName.toLowerCase())
        ));

        if (!match) {
            return t('group_not_found', lang);
        }

        const count = match.participants ? match.participants.length : 0;
        await saveState(jid, {
            ...state,
            step: 'mgmt_group_confirm',
            mgmtGroupId: match.id._serialized,
            mgmtGroupName: match.name
        });
        return t('mgmt_group_confirm', lang, { name: match.name, count: count.toString() });
    } catch (e) {
        logger.error('Failed to search mgmt groups', e);
        return t('error_generic', lang, { error: e.message });
    }
}

async function handleMgmtGroupConfirm(client, jid, content, state, lang) {
    const choice = content.trim();
    if (choice === '1' || choice.includes('כן') || choice.toLowerCase() === 'yes') {
        const reportTarget = 'mgmt_group';
        await saveState(jid, { ...state, step: 'summary', reportTarget, mgmtGroupConfirmed: true });
        return await buildSummary(state, reportTarget, state.mgmtGroupId, lang);
    } else {
        await saveState(jid, { ...state, step: 'mgmt_group_name' });
        return t('ask_mgmt_group_name', lang);
    }
}

async function buildSummary(state, reportTarget, mgmtGroupId, lang) {
    const rulesTypeMap = {
        'allowed': lang === 'he' ? 'הודעות מותרות בלבד' : 'Allowed messages only',
        'forbidden': lang === 'he' ? 'הודעות אסורות' : 'Forbidden messages',
        'none': lang === 'he' ? 'ללא חוקי תוכן' : 'No content rules'
    };

    const timeStr = state.timeWindow
        ? `${t(`day_${state.timeWindow.day}`, lang)}, ${state.timeWindow.startHour}:00 - ${state.timeWindow.endHour}:00`
        : (lang === 'he' ? 'ללא הגבלה' : 'No restriction');

    const spamStr = state.antiSpam
        ? `${state.antiSpam.maxMessages} / ${state.antiSpam.windowSeconds}s`
        : (lang === 'he' ? 'כבוי' : 'Disabled');

    const enfSteps = [];
    if (state.enforcementConfig.deleteMessage) enfSteps.push(t('enforcement_step_1', lang));
    if (state.enforcementConfig.privateWarning) enfSteps.push(t('enforcement_step_2', lang));
    if (state.enforcementConfig.removeFromGroup) enfSteps.push(t('enforcement_step_3', lang));
    if (state.enforcementConfig.blockUser) enfSteps.push(t('enforcement_step_4', lang));
    if (state.enforcementConfig.sendReport) enfSteps.push(t('enforcement_step_5', lang));

    const reportStr = reportTarget === 'dm'
        ? (lang === 'he' ? 'הודעה פרטית' : 'DM')
        : reportTarget.startsWith('phone:')
            ? (lang === 'he' ? `טלפון: ${reportTarget.split(':')[1]}` : `Phone: ${reportTarget.split(':')[1]}`)
            : (lang === 'he' ? 'קבוצת הנהלה' : 'Management group');

    const exemptStr = (state.exemptNumbers && state.exemptNumbers.length > 0)
        ? state.exemptNumbers.length.toString()
        : (lang === 'he' ? 'אין' : 'None');

    return t('setup_summary', lang, {
        groupName: state.groupName,
        rulesType: rulesTypeMap[state.rulesType] || state.rulesType,
        timeWindow: timeStr,
        antiSpam: spamStr,
        enforcement: enfSteps.join('\n'),
        warnings: (state.warningCount || 0).toString(),
        exempt: exemptStr,
        report: reportStr
    });
}

async function handleSummary(client, jid, content, state, lang) {
    const choice = content.trim();
    if (choice === '1' || choice.includes('אשר') || choice.toLowerCase().includes('confirm')) {
        // Save everything to database
        try {
            const groupId = state.groupId;

            // 1. Create group
            await database.createGroup(groupId, jid, state.groupName);
            await database.updateUserGroup(jid, groupId);

            // 2. Save rules
            await database.clearRules(groupId);
            if (state.rulesType === 'allowed' && state.rulesMessages) {
                await database.addRule(groupId, 'allowed_messages', { messages: state.rulesMessages });
            } else if (state.rulesType === 'forbidden' && state.rulesMessages) {
                await database.addRule(groupId, 'forbidden_messages', { messages: state.rulesMessages });
            }
            if (state.timeWindow) {
                await database.addRule(groupId, 'time_window', state.timeWindow);
            }
            if (state.antiSpam) {
                await database.addRule(groupId, 'anti_spam', state.antiSpam);
            }

            // 3. Save enforcement
            await database.setEnforcement(groupId, state.enforcementConfig);

            // 4. Save warning count
            await database.updateGroupWarningCount(groupId, state.warningCount || 0);

            // 5. Save exempt users
            await database.clearExemptUsers(groupId);
            if (state.exemptNumbers && state.exemptNumbers.length > 0) {
                for (const num of state.exemptNumbers) {
                    await database.addExemptUser(groupId, num + '@s.whatsapp.net');
                }
            }

            // 6. Save report target
            await database.updateGroupReportTarget(groupId, state.reportTarget || 'dm');

            // 7. Save management group if applicable
            if (state.mgmtGroupId && state.mgmtGroupConfirmed) {
                await database.updateGroupMgmt(groupId, state.mgmtGroupId);
            }

            // 8. Clear setup state
            await saveState(jid, { step: 'done' });

            logger.info(`Setup completed for group ${state.groupName} by ${extractNumber(jid)}`);
            logger.auditLog(jid, 'SETUP_COMPLETE', `Group: ${state.groupName} (${groupId})`, true);

            return t('setup_complete', lang, { groupName: state.groupName });
        } catch (e) {
            logger.error('Failed to save setup', e);
            return t('error_generic', lang, { error: e.message });
        }
    } else if (choice === '2' || choice.includes('מחדש') || choice.toLowerCase().includes('start over')) {
        // Restart setup
        await saveState(jid, { step: 'welcome' });
        return t('welcome', lang);
    }
    return t('invalid_input', lang);
}

/**
 * Check if a user is currently in setup flow
 */
async function isInSetup(jid) {
    const user = await database.getUser(jid);
    if (!user || !user.setupState) return true; // New user → start setup
    try {
        const state = JSON.parse(user.setupState);
        return state.step !== 'done';
    } catch {
        return true;
    }
}

/**
 * Reset user setup (for "settings" command)
 */
async function resetSetup(jid) {
    await saveState(jid, { step: 'welcome' });
}

module.exports = {
    processSetupMessage,
    isInSetup,
    resetSetup
};
