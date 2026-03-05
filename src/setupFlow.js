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
        case 'group_verify_admin':
            return await handleGroupVerifyAdmin(client, senderJid, content, state, lang);
        case 'rules_type':
            return await handleRulesType(client, senderJid, content, state, lang);
        case 'rules_content':
            return await handleRulesContent(client, senderJid, content, state, lang);
        case 'rules_match_mode':
            return await handleRulesMatchMode(client, senderJid, content, state, lang);
        case 'non_text_rule':
            return await handleNonTextRule(client, senderJid, content, state, lang);
        case 'non_text_types':
            return await handleNonTextTypes(client, senderJid, content, state, lang);
        case 'time_window':
            return await handleTimeWindow(client, senderJid, content, state, lang);
        case 'time_day':
            return await handleTimeDay(client, senderJid, content, state, lang);
        case 'time_start':
            return await handleTimeStart(client, senderJid, content, state, lang);
        case 'time_end':
            return await handleTimeEnd(client, senderJid, content, state, lang);
        case 'time_more':
            return await handleTimeMore(client, senderJid, content, state, lang);
        case 'antispam':
            return await handleAntiSpam(client, senderJid, content, state, lang);
        case 'spam_max':
            return await handleSpamMax(client, senderJid, content, state, lang);
        case 'spam_window':
            return await handleSpamWindow(client, senderJid, content, state, lang);
        case 'enforcement':
            return await handleEnforcement(client, senderJid, content, state, lang);
        case 'quick_enforcement':
            return await handleQuickEnforcement(client, senderJid, content, state, lang);
        case 'warnings':
            return await handleWarnings(client, senderJid, content, state, lang);
        case 'quick_warnings':
            return await handleQuickWarnings(client, senderJid, content, state, lang);
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
        case 'mgmt_group_verify_count':
            return await handleMgmtGroupVerifyCount(client, senderJid, content, state, lang);
        case 'welcome_msg':
            return await handleWelcomeMsg(client, senderJid, content, state, lang);
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

function parseTimeToMinutes(input) {
    const raw = (input || '').trim();
    if (!raw) return null;

    // Backward compatible: "6" => 06:00
    if (/^\d{1,2}$/.test(raw)) {
        const h = parseInt(raw, 10);
        if (h >= 0 && h <= 23) return h * 60;
        return null;
    }

    // New format: HH:mm
    const m = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
}

function formatMinutes(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getNonTextTypeLabel(type, lang) {
    const labels = {
        all_non_text: { he: 'הכל', en: 'All non-text types' },
        image: { he: 'תמונות', en: 'Images' },
        video: { he: 'וידאו', en: 'Video' },
        sticker: { he: 'סטיקרים', en: 'Stickers' },
        document: { he: 'מסמכים', en: 'Documents' },
        audio: { he: 'אודיו', en: 'Audio' },
        other_non_text: { he: 'שאר סוגי לא-טקסט', en: 'Other non-text types' }
    };
    return (labels[type] && labels[type][lang]) || type;
}

function getRuleMatchModeLabel(mode, lang) {
    const labels = {
        exact: { he: 'זהה בדיוק', en: 'Exact match' },
        contains: { he: 'מכיל ביטוי', en: 'Contains phrase' }
    };
    return (labels[mode] && labels[mode][lang]) || mode;
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

            const canClaim = await database.canOwnerClaimGroup(groupId, jid);
            if (!canClaim) {
                await saveState(jid, { step: 'group_name' });
                return t('group_already_managed', lang);
            }

            const usedAsMgmt = await database.isGroupUsedAsMgmt(groupId);
            if (usedAsMgmt) {
                await saveState(jid, { step: 'group_name' });
                return t('group_used_as_mgmt', lang);
            }

            if (!isAdmin) {
                await saveState(jid, {
                    ...state,
                    step: 'admin_check'
                });
                return t('group_not_admin', lang);
            }

            // Bot is admin — perform second verification by participant count
            const participantsCount = chat.participants ? chat.participants.length : 0;
            await saveState(jid, {
                step: 'group_verify_admin',
                groupId: groupId,
                groupName: state.candidateGroupName,
                candidateGroupExpectedCount: participantsCount
            });
            return t('group_admin_confirmed', lang) + '\n\n' + t('ask_group_verify_admin', lang);
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

            const canClaim = await database.canOwnerClaimGroup(groupId, jid);
            if (!canClaim) {
                await saveState(jid, { step: 'group_name' });
                return t('group_already_managed', lang);
            }

            const usedAsMgmt = await database.isGroupUsedAsMgmt(groupId);
            if (usedAsMgmt) {
                await saveState(jid, { step: 'group_name' });
                return t('group_used_as_mgmt', lang);
            }

            if (!isAdmin) {
                return t('group_not_admin', lang);
            }

            const participantsCount = chat.participants ? chat.participants.length : 0;
            await saveState(jid, {
                step: 'group_verify_admin',
                groupId: groupId,
                groupName: state.candidateGroupName,
                candidateGroupExpectedCount: participantsCount
            });
            return t('group_admin_confirmed', lang) + '\n\n' + t('ask_group_verify_admin', lang);
        } catch (e) {
            logger.error('Failed to re-check admin', e);
            return t('error_generic', lang, { error: e.message });
        }
    }
    return t('group_not_admin', lang);
}

async function handleGroupVerifyAdmin(client, jid, content, state, lang) {
    const expected = parseInt(content.trim(), 10);
    if (isNaN(expected) || expected < 1) {
        return t('ask_group_verify_admin', lang);
    }

    try {
        const chat = await client.getChatById(state.groupId || state.candidateGroupId);
        const actual = chat.participants ? chat.participants.length : 0;
        if (actual !== expected) {
            return t('group_verify_admin_failed', lang, {
                expected: expected.toString(),
                actual: actual.toString()
            }) + '\n\n' + t('ask_group_verify_admin', lang);
        }
    } catch (e) {
        logger.error('Failed to verify enforced group participant count', e);
        return t('error_generic', lang, { error: e.message });
    }

    await saveState(jid, {
        step: 'rules_type',
        groupId: state.groupId || state.candidateGroupId,
        groupName: state.groupName || state.candidateGroupName
    });

    return t('group_verify_admin_success', lang) + '\n\n' + t('ask_rules_type', lang);
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
        await saveState(jid, { ...state, step: 'non_text_rule', rulesType: 'none' });
        return t('ask_non_text_rule', lang);
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
        step: 'non_text_rule',
        rulesMessages: messages,
        rulesMatchMode: state.rulesType === 'allowed' ? 'exact' : 'contains'
    });
    return t('rules_content_saved', lang, { count: messages.length.toString() }) + '\n\n' + t('ask_non_text_rule', lang);
}

async function handleRulesMatchMode(client, jid, content, state, lang) {
    // Deprecated step kept for backward compatibility with old setup states
    await saveState(jid, {
        ...state,
        step: 'non_text_rule',
        rulesMatchMode: state.rulesType === 'allowed' ? 'exact' : 'contains'
    });
    return t('ask_non_text_rule', lang);
}

async function handleNonTextRule(client, jid, content, state, lang) {
    const choice = content.trim();
    if (choice === '1' || choice.includes('כן') || choice.toLowerCase() === 'yes') {
        await saveState(jid, { ...state, step: 'non_text_types', blockNonText: true });
        return t('non_text_rule_saved', lang, { status: lang === 'he' ? 'מופעל' : 'Enabled' }) + '\n\n' + t('ask_non_text_types', lang);
    } else if (choice === '2' || choice.includes('לא') || choice.toLowerCase() === 'no') {
        await saveState(jid, { ...state, step: 'time_window', blockNonText: false, blockedNonTextTypes: [] });
        return t('non_text_rule_saved', lang, { status: lang === 'he' ? 'כבוי' : 'Disabled' }) + '\n\n' + t('ask_time_window', lang);
    }
    return t('ask_non_text_rule', lang);
}

async function handleNonTextTypes(client, jid, content, state, lang) {
    const options = {
        0: 'all_non_text',
        1: 'image',
        2: 'video',
        3: 'sticker',
        4: 'document',
        5: 'audio',
        6: 'other_non_text'
    };

    const picks = content.trim().split(/[\s,]+/).map(x => parseInt(x, 10)).filter(n => !isNaN(n));
    let blockedTypes = [...new Set(picks.map(p => options[p]).filter(Boolean))];
    if (blockedTypes.includes('all_non_text')) {
        blockedTypes = ['all_non_text'];
    }

    if (blockedTypes.length === 0) {
        return t('ask_non_text_types', lang);
    }

    await saveState(jid, { ...state, step: 'time_window', blockedNonTextTypes: blockedTypes });
    const blockedTypesLabel = blockedTypes.map(tKey => getNonTextTypeLabel(tKey, lang)).join(', ');
    return t('non_text_types_saved', lang, {
        types: blockedTypesLabel
    }) + '\n\n' + t('ask_time_window', lang);
}

async function handleTimeWindow(client, jid, content, state, lang) {
    const choice = content.trim();
    if (choice === '1' || choice.includes('כן') || choice.toLowerCase() === 'yes') {
        await saveState(jid, { ...state, step: 'time_day', timeWindows: state.timeWindows || [] });
        return t('ask_time_day', lang);
    } else if (choice === '2' || choice.includes('לא') || choice.toLowerCase() === 'no') {
        await saveState(jid, { ...state, step: 'antispam', timeWindow: null, timeWindows: [] });
        return t('ask_antispam', lang);
    }
    return t('ask_time_window', lang);
}

async function handleTimeDay(client, jid, content, state, lang) {
    const rawDay = parseInt(content.trim());
    if (isNaN(rawDay) || rawDay < 0 || rawDay > 7) {
        return t('ask_time_day', lang);
    }

    // UX mapping: 1-7 = Sunday-Saturday, 0 = Every day
    const day = rawDay === 0 ? 7 : (rawDay - 1);

    await saveState(jid, { ...state, step: 'time_start', timeDay: day });
    return t('ask_time_start', lang);
}

async function handleTimeStart(client, jid, content, state, lang) {
    const minutes = parseTimeToMinutes(content);
    if (minutes === null) {
        return t('ask_time_start', lang);
    }
    await saveState(jid, { ...state, step: 'time_end', timeStartMinutes: minutes });
    return t('ask_time_end', lang);
}

async function handleTimeEnd(client, jid, content, state, lang) {
    const endMinutes = parseTimeToMinutes(content);
    if (endMinutes === null) {
        return t('ask_time_end', lang);
    }

    const dayKey = `day_${state.timeDay}`;
    const startMinutes = (typeof state.timeStartMinutes === 'number')
        ? state.timeStartMinutes
        : (Number(state.timeStartHour) * 60);
    if (!Number.isFinite(startMinutes) || startMinutes < 0 || startMinutes > 1439) {
        return t('ask_time_start', lang);
    }
    const range = {
        day: state.timeDay,
        startMinute: startMinutes,
        endMinute: endMinutes,
        // Backward compatibility fields
        startHour: Math.floor(startMinutes / 60),
        endHour: Math.floor(endMinutes / 60)
    };
    const nextWindows = [...(state.timeWindows || []), range];

    await saveState(jid, {
        ...state,
        step: 'time_more',
        timeEndMinutes: endMinutes,
        timeWindow: range,
        timeWindows: nextWindows
    });

    return t('time_range_added', lang, {
        day: t(dayKey, lang),
        start: formatMinutes(startMinutes),
        end: formatMinutes(endMinutes)
    }) + '\n\n' + t('ask_time_more', lang);
}

async function handleTimeMore(client, jid, content, state, lang) {
    const choice = content.trim();
    if (choice === '1' || choice.includes('כן') || choice.toLowerCase() === 'yes') {
        await saveState(jid, { ...state, step: 'time_day' });
        return t('ask_time_day', lang);
    }
    if (choice === '2' || choice.includes('לא') || choice.toLowerCase() === 'no') {
        await saveState(jid, { ...state, step: 'antispam' });
        return t('ask_antispam', lang);
    }
    return t('ask_time_more', lang);
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

async function handleQuickEnforcement(client, jid, content, state, lang) {
    const choices = content.trim().split(/[\s,]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    if (choices.length === 0) {
        return t('quick_enforcement_intro', lang) + '\n\n' + buildEnforcementQuestion(lang);
    }

    const enforcementConfig = {
        deleteMessage: choices.includes(1),
        privateWarning: choices.includes(2),
        removeFromGroup: choices.includes(3),
        blockUser: choices.includes(4),
        sendReport: choices.includes(5)
    };

    await saveState(jid, { ...state, step: 'quick_warnings', enforcementConfig });
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

async function handleQuickWarnings(client, jid, content, state, lang) {
    const count = parseInt(content.trim());
    if (isNaN(count) || count < 0 || count > 99) {
        return t('ask_warnings', lang);
    }

    if (!state.groupId) {
        await saveState(jid, { step: 'done' });
        return t('error_generic', lang, { error: lang === 'he' ? 'קבוצה לא נמצאה' : 'Group not found' });
    }

    await database.setEnforcement(state.groupId, state.enforcementConfig);
    await database.updateGroupWarningCount(state.groupId, count);
    await saveState(jid, { step: 'done' });

    return t('quick_enforcement_saved', lang);
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
        await saveState(jid, { ...state, step: 'welcome_msg', reportTarget: 'dm' });
        return t('ask_welcome_msg', lang);
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
    await saveState(jid, { ...state, step: 'welcome_msg', reportTarget });
    return t('ask_welcome_msg', lang);
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

        // A management group cannot be the enforced group itself
        if (match.id._serialized === state.groupId) {
            return t('mgmt_group_cannot_be_enforced', lang);
        }

        // A management group cannot be another enforced group
        const existingManaged = await database.getGroup(match.id._serialized);
        if (existingManaged) {
            return t('mgmt_group_cannot_be_enforced', lang);
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
        await saveState(jid, { ...state, step: 'mgmt_group_verify_count' });
        return t('ask_mgmt_group_verify_count', lang);
    } else {
        await saveState(jid, { ...state, step: 'mgmt_group_name' });
        return t('ask_mgmt_group_name', lang);
    }
}

async function handleMgmtGroupVerifyCount(client, jid, content, state, lang) {
    const expected = parseInt(content.trim(), 10);
    if (isNaN(expected) || expected < 1) {
        return t('ask_mgmt_group_verify_count', lang);
    }

    try {
        const chat = await client.getChatById(state.mgmtGroupId);
        const actual = chat.participants ? chat.participants.length : 0;
        if (actual !== expected) {
            return t('mgmt_group_verify_count_failed', lang, {
                expected: expected.toString(),
                actual: actual.toString()
            }) + '\n\n' + t('ask_mgmt_group_verify_count', lang);
        }

        const reportTarget = 'mgmt_group';
        await saveState(jid, { ...state, step: 'welcome_msg', reportTarget, mgmtGroupConfirmed: true });
        return t('mgmt_group_verify_count_success', lang) + '\n\n' + t('ask_welcome_msg', lang);
    } catch (e) {
        logger.error('Failed to verify management group count', e);
        return t('error_generic', lang, { error: e.message });
    }
}

async function handleWelcomeMsg(client, jid, content, state, lang) {
    const choice = content.trim();
    if (choice === '1' || choice.includes('כן') || choice.toLowerCase() === 'yes') {
        await saveState(jid, { ...state, step: 'summary', welcomeMessageEnabled: true });
        return t('welcome_msg_saved', lang) + '\n\n' + await buildSummary({ ...state, welcomeMessageEnabled: true }, state.reportTarget, state.mgmtGroupId, lang);
    } else if (choice === '2' || choice.includes('לא') || choice.toLowerCase() === 'no') {
        await saveState(jid, { ...state, step: 'summary', welcomeMessageEnabled: false });
        return t('welcome_msg_saved', lang) + '\n\n' + await buildSummary({ ...state, welcomeMessageEnabled: false }, state.reportTarget, state.mgmtGroupId, lang);
    }
    return t('ask_welcome_msg', lang);
}

async function buildSummary(state, reportTarget, mgmtGroupId, lang) {
    const rulesTypeMap = {
        'allowed': lang === 'he' ? 'הודעות מותרות בלבד' : 'Allowed messages only',
        'forbidden': lang === 'he' ? 'הודעות אסורות' : 'Forbidden messages',
        'none': lang === 'he' ? 'ללא חוקי תוכן' : 'No content rules'
    };

    const rulesModeValue = state.rulesType === 'allowed'
        ? 'exact'
        : (state.rulesType === 'forbidden' ? 'contains' : 'n/a');
    const rulesMode = rulesModeValue === 'n/a'
        ? (lang === 'he' ? 'לא רלוונטי' : 'N/A')
        : getRuleMatchModeLabel(rulesModeValue, lang);

    const windows = (state.timeWindows && state.timeWindows.length > 0)
        ? state.timeWindows
        : (state.timeWindow ? [state.timeWindow] : []);

    const getWindowStart = (w) => (typeof w.startMinute === 'number' ? w.startMinute : (w.startHour || 0) * 60);
    const getWindowEnd = (w) => (typeof w.endMinute === 'number' ? w.endMinute : (w.endHour || 0) * 60);

    const timeStr = windows.length > 0
        ? windows.map(w => `${t(`day_${w.day}`, lang)}, ${formatMinutes(getWindowStart(w))} - ${formatMinutes(getWindowEnd(w))}`).join('\n')
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

    const nonTextStr = state.blockNonText
        ? ((state.blockedNonTextTypes && state.blockedNonTextTypes.length > 0)
            ? state.blockedNonTextTypes.map(tKey => getNonTextTypeLabel(tKey, lang)).join(', ')
            : (lang === 'he' ? 'חסום' : 'Blocked'))
        : (lang === 'he' ? 'מותר' : 'Allowed');

    const exemptStr = (state.exemptNumbers && state.exemptNumbers.length > 0)
        ? state.exemptNumbers.length.toString()
        : (lang === 'he' ? 'אין' : 'None');

    const welcomeStr = state.welcomeMessageEnabled
        ? (lang === 'he' ? 'מופעל (דורש אישור משתמש)' : 'Enabled (requires agreement)')
        : (lang === 'he' ? 'כבוי' : 'Disabled');

    return t('setup_summary', lang, {
        groupName: state.groupName,
        rulesType: rulesTypeMap[state.rulesType] || state.rulesType,
        rulesMode,
        nonTextRule: nonTextStr,
        timeWindow: timeStr,
        antiSpam: spamStr,
        enforcement: enfSteps.join('\n'),
        warnings: (state.warningCount || 0).toString(),
        exempt: exemptStr,
        report: reportStr,
        welcome: welcomeStr
    });
}

async function handleSummary(client, jid, content, state, lang) {
    const choice = content.trim();
    if (choice === '1' || choice.includes('אשר') || choice.toLowerCase().includes('confirm')) {
        // Save everything to database
        try {
            const groupId = state.groupId;

            const canClaim = await database.canOwnerClaimGroup(groupId, jid);
            if (!canClaim) {
                return t('group_already_managed', lang);
            }

            const usedAsMgmt = await database.isGroupUsedAsMgmt(groupId);
            if (usedAsMgmt) {
                return t('group_used_as_mgmt', lang);
            }

            if (state.mgmtGroupId) {
                if (state.mgmtGroupId === groupId) {
                    return t('mgmt_group_cannot_be_enforced', lang);
                }
                const mgmtIsManaged = await database.getGroup(state.mgmtGroupId);
                if (mgmtIsManaged && mgmtIsManaged.groupId !== groupId) {
                    return t('mgmt_group_cannot_be_enforced', lang);
                }
            }

            // 1. Create group
            await database.createGroup(groupId, jid, state.groupName);
            await database.updateUserGroup(jid, groupId);

            // 2. Save rules
            await database.clearRules(groupId);
            if (state.rulesType === 'allowed' && state.rulesMessages) {
                await database.addRule(groupId, 'allowed_messages', {
                    messages: state.rulesMessages,
                    matchMode: 'exact'
                });
            } else if (state.rulesType === 'forbidden' && state.rulesMessages) {
                await database.addRule(groupId, 'forbidden_messages', {
                    messages: state.rulesMessages,
                    matchMode: 'contains'
                });
            }
            if (state.timeWindows && state.timeWindows.length > 0) {
                await database.addRule(groupId, 'time_window', { windows: state.timeWindows });
            } else if (state.timeWindow) {
                // Backward-compatible fallback
                await database.addRule(groupId, 'time_window', state.timeWindow);
            }
            if (state.blockNonText) {
                await database.addRule(groupId, 'block_non_text', {
                    enabled: true,
                    blockedTypes: state.blockedNonTextTypes || ['other_non_text']
                });
            }
            if (state.antiSpam) {
                await database.addRule(groupId, 'anti_spam', state.antiSpam);
            }

            // 3. Save enforcement
            await database.setEnforcement(groupId, state.enforcementConfig);

            // 4. Save warning count
            await database.updateGroupWarningCount(groupId, state.warningCount || 0);

            // 5. Save welcome message setting
            await database.updateGroupWelcomeMessage(groupId, !!state.welcomeMessageEnabled);

            // 6. Save exempt users
            await database.clearExemptUsers(groupId);
            if (state.exemptNumbers && state.exemptNumbers.length > 0) {
                for (const num of state.exemptNumbers) {
                    await database.addExemptUser(groupId, num + '@s.whatsapp.net');
                }
            }

            // 7. Save report target
            await database.updateGroupReportTarget(groupId, state.reportTarget || 'dm');

            // 8. Save management group if applicable
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
    if (!user || !user.setupState) return false;
    try {
        const state = JSON.parse(user.setupState);
        return !!state.step && state.step !== 'done';
    } catch {
        return false;
    }
}

/**
 * Reset user setup (for "settings" command)
 */
async function resetSetup(jid) {
    await saveState(jid, { step: 'welcome' });
}

function isSetupTrigger(content) {
    const normalized = (content || '').trim().toLowerCase();
    const triggers = [
        'התחל',
        'התחל הגדרה',
        'התחל setup',
        'setup',
        'start setup',
        'start'
    ];
    return triggers.includes(normalized);
}

async function startSetup(jid, preferredLang = 'he') {
    let user = await database.getUser(jid);
    if (!user) {
        user = await database.createUser(jid, preferredLang);
    }
    await saveState(jid, { step: 'welcome' });
    return t('welcome', user.language || preferredLang);
}

async function startQuickEnforcementUpdate(jid) {
    const user = await database.getUser(jid);
    if (!user || !user.groupId) {
        const lang = user ? (user.language || 'he') : 'he';
        return t('no_group_linked', lang);
    }

    const lang = user.language || 'he';
    await saveState(jid, { step: 'quick_enforcement', groupId: user.groupId });
    return t('quick_enforcement_intro', lang) + '\n\n' + buildEnforcementQuestion(lang);
}

module.exports = {
    processSetupMessage,
    isInSetup,
    resetSetup,
    isSetupTrigger,
    startSetup,
    startQuickEnforcementUpdate
};
