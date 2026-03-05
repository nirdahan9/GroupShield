// src/ruleEngine.js - Generic rule evaluation engine
const logger = require('./logger');
const { t } = require('./i18n');

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

    // Only text messages can match allowed list
    if (msgType !== 'chat' && msgType !== 'revoked') {
        violations.push(t('reason_forbidden_type', lang, { type: msgType }));
        return violations;
    }

    // Check if content matches any allowed message (case-insensitive, trim whitespace)
    const normalizedContent = content.trim();
    const isAllowed = allowedList.some(allowed => {
        const pattern = new RegExp(`^${escapeRegex(allowed.trim())}\\s*$`, 'i');
        return pattern.test(normalizedContent);
    });

    if (!isAllowed) {
        violations.push(t('reason_invalid_content', lang));
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
    const normalizedContent = content.trim().toLowerCase();

    const isForbidden = forbiddenList.some(forbidden =>
        normalizedContent.includes(forbidden.trim().toLowerCase())
    );

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
    const { day, startHour, endHour } = ruleData;

    const now = new Date();
    const options = { timeZone: 'Asia/Jerusalem', hour12: false, weekday: 'long', hour: 'numeric' };
    const fmt = new Intl.DateTimeFormat('en-US', options);
    const parts = fmt.formatToParts(now);

    const currentDayName = parts.find(p => p.type === 'weekday').value;
    const currentHour = parseInt(parts.find(p => p.type === 'hour').value, 10);

    // Map day number to day name
    const dayMap = {
        0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday',
        4: 'Thursday', 5: 'Friday', 6: 'Saturday'
    };

    // Day check (7 = every day)
    if (day !== 7) {
        const expectedDay = dayMap[day];
        if (currentDayName !== expectedDay) {
            violations.push(t('reason_time_violation', lang));
            return violations;
        }
    }

    // Hour check
    if (currentHour < startHour || currentHour > endHour) {
        violations.push(t('reason_time_violation', lang));
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
