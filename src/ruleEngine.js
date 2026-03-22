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
    if (!ruleData) return violations;
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
    if (!ruleData) return violations;
    const forbiddenList = ruleData.messages || [];
    const matchMode = ruleData.matchMode || 'contains';
    const normalizedContent = content.trim().toLowerCase();

    const isForbidden = forbiddenList.some(forbidden => {
        const target = forbidden.trim().toLowerCase();
        if (!target) return false;

        if (matchMode === 'exact') {
            return normalizedContent === target;
        }
        if (matchMode === 'smart') {
            const normTarget = normalizeForSmartMatch(forbidden);
            if (!normTarget) return false;

            // Standard normalization
            const normMsg = normalizeForSmartMatch(content);
            if (smartMatchesForbidden(normMsg, normTarget)) return true;

            // Homoglyph normalization — catches digit/Latin/Arabic substitutions (0→ס, l→ו, etc.)
            const homoMsg = normalizeForSmartMatch(applyHomoglyphs(content.toLowerCase()));
            if (homoMsg !== normMsg && smartMatchesForbidden(homoMsg, normTarget)) return true;

            return false;
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
    if (!ruleData) return violations;

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

// ─── Smart match helpers ───────────────────────────────────────────────────

/**
 * Normalize text for smart matching:
 * 1. Strip zero-width / invisible / bidirectional control chars
 * 2. Strip Unicode combining marks (Hebrew nikud, cantillation, etc.)
 * 3. Remove everything that is not a letter or digit (emoji, punctuation, spaces…)
 * 4. Collapse 3+ identical consecutive characters to 2 (מיייל → מייל)
 */
function normalizeForSmartMatch(text) {
    return text
        .toLowerCase()
        // Invisible / zero-width / bidirectional control characters
        .replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202F\u2060-\u206F\uFEFF]/gu, '')
        // Unicode combining marks — strips Hebrew niqqud, cantillation, diacritics
        .replace(/\p{M}/gu, '')
        // Keep only letters and digits; removes spaces, emoji, punctuation, RTL marks, etc.
        .replace(/[^\p{L}\p{N}]/gu, '')
        // Collapse 3+ repeated chars (מיייל → מייל)
        .replace(/(.)\1{2,}/g, '$1$1');
}

/**
 * Map of look-alike characters → Hebrew equivalents.
 * Applied to the INCOMING MESSAGE only (forbidden words are already Hebrew).
 * Covers common digit/Latin/Arabic substitutions used to bypass filters.
 */
const HOMOGLYPH_MAP = {
    // Digits → Hebrew letters
    '0': 'ס',   // 0 ≈ ס
    '6': 'ב',   // 6 ≈ ב
    '7': 'ל',   // 7 ≈ ל
    // Latin → Hebrew look-alikes
    'o': 'ס',   // o ≈ ס
    'i': 'י',   // i ≈ י
    'l': 'ו',   // l ≈ ו
    // Arabic letters → Hebrew look-alikes
    '\u0648': 'ו',   // Arabic Waw (و) ≈ ו
    '\u064a': 'י',   // Arabic Ya (ي) ≈ י
    '\u0643': 'כ',   // Arabic Kaf (ك) ≈ כ
    '\u0644': 'ל',   // Arabic Lam (ل) ≈ ל
};

function applyHomoglyphs(text) {
    return text.split('').map(ch => HOMOGLYPH_MAP[ch] || ch).join('');
}

const HEBREW_PREFIXES = ['ובה', 'ולה', 'ומה', 'וב', 'ול', 'ומ', 'וש', 'וה', 'ו', 'ב', 'ל', 'כ', 'מ', 'ש', 'ה'];
const HEBREW_SUFFIXES = ['ים', 'ות', 'תי', 'נו', 'כם', 'כן', 'הם', 'הן', 'ו', 'י', 'ת', 'ה', 'ך'];

/**
 * Generate variants of a normalized Hebrew word by stripping common
 * prefixes and suffixes, to catch morphological inflections.
 */
function getHebrewVariants(word) {
    const variants = new Set([word]);
    const MIN_STEM = 2; // don't strip if remaining stem is too short

    // Strip prefix
    for (const prefix of HEBREW_PREFIXES) {
        if (word.startsWith(prefix) && word.length - prefix.length >= MIN_STEM) {
            const stem = word.slice(prefix.length);
            variants.add(stem);

            // Strip suffix from stem too
            for (const suffix of HEBREW_SUFFIXES) {
                if (stem.endsWith(suffix) && stem.length - suffix.length >= MIN_STEM) {
                    variants.add(stem.slice(0, stem.length - suffix.length));
                }
            }
        }
    }

    // Strip suffix from original
    for (const suffix of HEBREW_SUFFIXES) {
        if (word.endsWith(suffix) && word.length - suffix.length >= MIN_STEM) {
            variants.add(word.slice(0, word.length - suffix.length));
        }
    }

    return [...variants];
}

/**
 * Levenshtein edit distance between two strings
 */
function editDistance(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

/**
 * Check if any word in the message is within edit distance 1 of the target.
 * Only applied to words and targets of length >= 5 to avoid false positives.
 */
function fuzzyMatchesAnyWord(normMessage, normTarget) {
    if (normTarget.length < 5) return false;
    // Split original (pre-normalized) is not available here, so split on
    // boundaries: find all substrings of similar length
    const targetLen = normTarget.length;
    for (let i = 0; i <= normMessage.length - targetLen + 1; i++) {
        const window = normMessage.slice(i, i + targetLen + 1);
        if (window.length >= targetLen - 1 && editDistance(window.slice(0, targetLen), normTarget) <= 1) {
            return true;
        }
    }
    return false;
}

/**
 * Smart match: checks a normalized message against a normalized forbidden word
 * using containment, Hebrew morphological variants, fuzzy matching, and reversed word.
 */
function smartMatchesForbidden(normMessage, normForbidden) {
    // 1. Direct containment
    if (normMessage.includes(normForbidden)) return true;

    // 2. Hebrew morphological variants
    for (const variant of getHebrewVariants(normForbidden)) {
        if (variant.length >= 2 && normMessage.includes(variant)) return true;
    }

    // 3. Fuzzy match (typos) — single-character edit distance, words ≥ 5 chars only
    if (fuzzyMatchesAnyWord(normMessage, normForbidden)) return true;

    // 4. Reversed word — e.g. הללק instead of קללה (≥ 4 chars to avoid false positives)
    if (normForbidden.length >= 4) {
        const reversed = normForbidden.split('').reverse().join('');
        if (normMessage.includes(reversed)) return true;
    }

    return false;
}

module.exports = {
    evaluateMessage,
    checkAntiSpam
};
