// src/ruleEngine.js - Generic rule evaluation engine
const logger = require('./logger');
const { t } = require('./i18n');

const JERUSALEM_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour12: false,
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric'
});

/**
 * Evaluate a message against group rules
 * @param {Array} rules - Rules from database (parsed ruleData)
 * @param {object} msgInfo - { content, msgType, senderJid, timestamp }
 * @param {string} lang - User language for violation reasons
 * @returns {{ allowed: boolean, violations: string[] }}
 */
function evaluateMessage(rules, msgInfo, lang = 'he') {
    const violations = [];
    const { content, msgType } = msgInfo;

    for (const rule of rules) {
        switch (rule.ruleType) {
            case 'allowed_messages':
                violations.push(...checkAllowedMessages(rule.ruleData, content, msgType, lang));
                break;
            case 'forbidden_messages':
                violations.push(...checkForbiddenMessages(rule.ruleData, content, lang));
                break;
            case 'block_non_text':
                violations.push(...checkNonTextRule(rule.ruleData, msgType, lang));
                break;
            case 'time_window':
                violations.push(...checkTimeWindow(rule.ruleData, lang));
                break;
            // anti_spam is handled separately in handlers.js via spamMap
        }
    }

    return {
        allowed: violations.length === 0,
        violations
    };
}

/**
 * Check allowed messages rule
 * Only specific text messages are allowed; everything else is a violation
 */
function checkAllowedMessages(ruleData, content, msgType, lang) {
    const violations = [];
    const allowedList = ruleData.messages || [];
    const matchMode = ruleData.matchMode || 'exact';

    // Non-text is allowed by default (can be restricted via dedicated block_non_text rule)
    if (msgType !== 'chat') {
        return violations;
    }

    // Check if content matches any allowed message (exact or contains)
    const normalizedContent = content.trim();
    const isAllowed = allowedList.some(allowed => {
        const target = allowed.trim();
        if (!target) return false;

        if (matchMode === 'contains') {
            return normalizedContent.toLowerCase().includes(target.toLowerCase());
        }
        // exact (default)
        const pattern = new RegExp(`^${escapeRegex(target)}\\s*$`, 'i');
        return pattern.test(normalizedContent);
    });

    if (!isAllowed) {
        violations.push(t('reason_invalid_content', lang));
    }

    return violations;
}

/**
 * Optional rule: block non-text messages
 */
function checkNonTextRule(ruleData, msgType, lang) {
    const violations = [];
    if (msgType === 'chat') return violations;

    const blockedTypes = Array.isArray(ruleData && ruleData.blockedTypes)
        ? ruleData.blockedTypes
        : ['other_non_text'];

    const knownMap = {
        image: 'image',
        video: 'video',
        sticker: 'sticker',
        document: 'document',
        audio: 'audio',
        ptt: 'audio'
    };

    const normalizedType = knownMap[msgType] || 'other_non_text';
    if (blockedTypes.includes(normalizedType) || blockedTypes.includes('all_non_text')) {
        violations.push(t('reason_forbidden_type', lang, { type: msgType }));
    }
    return violations;
}

/**
 * Check forbidden messages rule
 * Specific messages are banned; everything else is allowed
 */
function checkForbiddenMessages(ruleData, content, lang) {
    const violations = [];
    const forbiddenList = ruleData.messages || [];
    const matchMode = ruleData.matchMode || 'contains';
    const normalizedContent = content.trim().toLowerCase();

    const isForbidden = forbiddenList.some(forbidden => {
        const target = forbidden.trim().toLowerCase();
        if (!target) return false;

        if (matchMode === 'exact') {
            return normalizedContent === target;
        }
        // contains (default)
        return normalizedContent.includes(target);
    });

    if (isForbidden) {
        violations.push(t('reason_forbidden_content', lang));
    }

    return violations;
}

/**
 * Check time window rule
 * Messages only allowed during specified day/hours
 */
function checkTimeWindow(ruleData, lang) {
    const violations = [];

    const now = new Date();
    const parts = JERUSALEM_PARTS_FORMATTER.formatToParts(now);

    const currentDayName = parts.find(p => p.type === 'weekday').value;
    const currentHour = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const currentMinute = parseInt(parts.find(p => p.type === 'minute').value, 10);
    const currentMinuteOfDay = currentHour * 60 + currentMinute;

    // Map day name to number
    const dayNameToNum = {
        Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
        Thursday: 4, Friday: 5, Saturday: 6
    };
    const currentDay = dayNameToNum[currentDayName];

    const windows = Array.isArray(ruleData.windows) && ruleData.windows.length > 0
        ? ruleData.windows
        : [ruleData];

    const isAnyWindowOpen = windows.some(w => {
        const day = Number(w.day);
        const startMinute = typeof w.startMinute === 'number' ? Number(w.startMinute) : Number(w.startHour) * 60;
        const endMinute = typeof w.endMinute === 'number' ? Number(w.endMinute) : Number(w.endHour) * 60;

        if ([day, startMinute, endMinute].some(n => Number.isNaN(n))) return false;

        // Every day
        if (day === 7) {
            if (startMinute <= endMinute) {
                return currentMinuteOfDay >= startMinute && currentMinuteOfDay <= endMinute;
            }
            // Overnight every-day window (e.g., 22:30-06:15)
            return currentMinuteOfDay >= startMinute || currentMinuteOfDay <= endMinute;
        }

        // Specific day
        if (startMinute <= endMinute) {
            return currentDay === day && currentMinuteOfDay >= startMinute && currentMinuteOfDay <= endMinute;
        }

        // Overnight specific day, e.g. Monday 22:30-06:15 means:
        // Monday 22:30-23:59 OR Tuesday 00:00-06:15
        const nextDay = (day + 1) % 7;
        return (currentDay === day && currentMinuteOfDay >= startMinute)
            || (currentDay === nextDay && currentMinuteOfDay <= endMinute);
    });

    const windowMode = ruleData.windowMode || 'allow_in_window';

    if (windowMode === 'allow_in_window') {
        if (!isAnyWindowOpen) {
            violations.push(t('reason_time_violation', lang));
        }
    } else { // block_in_window
        if (isAnyWindowOpen) {
            violations.push(t('reason_time_blocked', lang));
        }
    }

    return violations;
}

/**
 * Check anti-spam for a user
 * @param {Map} spamMap - In-memory spam tracking map
 * @param {string} senderJid - Sender JID
 * @param {object} spamConfig - { maxMessages, windowSeconds }
 * @returns {{ isSpam: boolean, isWarning: boolean, count: number }}
 */
function checkAntiSpam(spamMap, senderJid, spamConfig) {
    if (!spamConfig) return { isSpam: false, isWarning: false, count: 0 };

    const now = Date.now();
    const windowMs = (spamConfig.windowSeconds || 10) * 1000;
    const max = spamConfig.maxMessages || 5;

    const userSpam = spamMap.get(senderJid) || { count: 0, time: now };

    if (now - userSpam.time > windowMs) {
        userSpam.count = 1;
        userSpam.time = now;
    } else {
        userSpam.count++;
    }
    spamMap.set(senderJid, userSpam);

    // Warning at max count, spam at max+1
    if (userSpam.count === max) {
        return { isSpam: false, isWarning: true, count: userSpam.count };
    } else if (userSpam.count > max) {
        return { isSpam: true, isWarning: false, count: userSpam.count };
    }

    return { isSpam: false, isWarning: false, count: userSpam.count };
}

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    evaluateMessage,
    checkAntiSpam
};
