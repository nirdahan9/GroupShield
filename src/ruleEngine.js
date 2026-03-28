// src/ruleEngine.js - Generic rule evaluation engine
const logger = require('./logger');
const { t } = require('./i18n');
const { CURSE_WORDS } = require('./cursesList');

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

// Emoji that are unambiguously offensive (middle finger + skin tone variants)
const FORBIDDEN_EMOJIS = new Set(['🖕','🖕🏻','🖕🏼','🖕🏽','🖕🏾','🖕🏿']);

/**
 * Check forbidden messages rule
 * Specific messages are banned; everything else is allowed
 */
function checkForbiddenMessages(ruleData, content, lang) {
    const violations = [];
    if (!ruleData) return violations;

    // Curses preset: forbidden emoji check (rule engine, no LLM needed)
    if (ruleData.isCursesPreset) {
        for (const emoji of FORBIDDEN_EMOJIS) {
            if (content.includes(emoji)) {
                violations.push(t('reason_forbidden_content', lang));
                return violations;
            }
        }
    }

    // Curses preset: always use the live CURSE_WORDS list so updates to cursesList.js
    // take effect immediately for all groups — no DB migration needed.
    const forbiddenList = ruleData.isCursesPreset ? CURSE_WORDS : (ruleData.messages || []);
    const matchMode = ruleData.matchMode || 'contains';
    const normalizedContent = content.trim().toLowerCase();

    const matchedForbidden = forbiddenList.find(forbidden => {
        const target = forbidden.trim().toLowerCase();
        if (!target) return false;

        if (matchMode === 'exact') {
            return normalizedContent === target;
        }
        if (matchMode === 'smart') {
            const normTarget = normalizeForSmartMatch(forbidden);
            if (!normTarget) return false;

            const isHebrew = /[\u05D0-\u05EA]/.test(forbidden.trim());

            if (isHebrew) {
                // ── Hebrew word: existing bypass-detection passes ──────────────
                // Pass 1: Standard normalization
                const normMsg = normalizeForSmartMatch(content);
                if (smartMatchesForbidden(normMsg, normTarget)) return true;

                if (normTarget === 'בן זונה' || normTarget === 'כוס') {
                     // console.log('Checking target:', normTarget, 'against msg:', content, 'which normalized to:', normMsg);
                }

                // Pass 1.5: Multi-word phrase spaceless bypass (e.g., "בן זונה" -> "בןזונה")
                if (normTarget.includes(' ')) {
                    const noSpaceTarget = normTarget.replace(/\s+/g, '');
                    const noSpaceMsg = normMsg.replace(/\s+/g, '');
                    if (smartMatchesForbidden(noSpaceMsg, noSpaceTarget)) {
                        console.log('Match Pass 1.5:', noSpaceTarget, 'in', noSpaceMsg);
                        return true;
                    }
                }

                // Pass 2: Homoglyph normalization — digit/Latin/Cyrillic/Arabic substitutions
                const homoMsg = normalizeForSmartMatch(applyHomoglyphs(content.toLowerCase()));
                if (homoMsg !== normMsg && smartMatchesForbidden(homoMsg, normTarget)) return true;

                // Pass 3: Hebrew-only — strips inserted foreign letters (קaללה → קללה)
                const hebrewMsg = normMsg.replace(/[^\u05D0-\u05EA\u05F0-\u05F4\s]/g, '');
                if (hebrewMsg !== normMsg && smartMatchesForbidden(hebrewMsg, normTarget)) return true;

                // Pass 4: Latin transliteration — only for messages with NO Hebrew (full Latin bypass)
                // e.g. "kalla" for קללה, "kus" for כוס
                if (normTarget.length >= 2 && !/[\u05D0-\u05EA]/.test(content)) {
                    const transPattern = buildTransliterationPattern(normTarget.replace(/\s+/g, ''));
                    // Use space-collapsed text for transliteration to handle phrases correctly
                    if (transPattern && transPattern.test(content.toLowerCase().replace(/\s+/g, ''))) return true;
                }
            } else {
                // ── Latin/English word: Unicode word-boundary matching ─────────
                const escaped = escapeRegex(forbidden.trim());
                const wbRegex = new RegExp('(?<![\\p{L}\\p{N}])' + escaped + '(?![\\p{L}\\p{N}])', 'iu');
                const derepForbidden = forbidden.trim().replace(/(.)\1+/gi, '$1');
                const wbDerepRegex = new RegExp(
                    '(?<![\\p{L}\\p{N}])' + escapeRegex(derepForbidden) + '(?![\\p{L}\\p{N}])',
                    'iu'
                );

                // Pass E0: word-boundary on raw content
                if (wbRegex.test(content)) return true;

                // Pass E1: de-repetition — "fuuuuck" → "fuck"
                const derepContent = content.replace(/(.)\1+/gi, '$1');
                if (wbDerepRegex.test(derepContent)) return true;

                // Pass E2: invisible chars + Cyrillic lookalikes + spaced letters
                // e.g. "fuсk" (Cyrillic с) → "fuck", zero-width inserted → stripped
                const cleanContent = applyEnglishNormalizations(content);
                if (wbRegex.test(cleanContent)) return true;

                // Pass E3: E2 + de-repetition combined
                if (wbDerepRegex.test(cleanContent.replace(/(.)\1+/gi, '$1'))) return true;

                // Pass E4: phonetic/leet variants → canonical
                // e.g. "fvck" → "fuck", "sh1t" → "shit", "a55" → "ass"
                const phoneticContent = applyEnglishPhoneticMap(cleanContent);
                if (wbRegex.test(phoneticContent)) return true;

                // Pass E5: multi-word phrase spaceless bypass
                // e.g. "g o t o h e l l" → "gotohell" vs "go to hell" → "gotohell"
                if (forbidden.includes(' ')) {
                    const noSpaceForbidden = forbidden.trim().replace(/\s+/g, '');
                    const wbNoSpaceRegex = new RegExp(
                        '(?<![\\p{L}\\p{N}])' + escapeRegex(noSpaceForbidden) + '(?![\\p{L}\\p{N}])',
                        'iu'
                    );
                    if (wbNoSpaceRegex.test(cleanContent)) return true;
                    if (wbNoSpaceRegex.test(cleanContent.replace(/(.)\1+/gi, '$1'))) return true;
                }
            }

            return false;
        }
        // contains (default)
        return normalizedContent.includes(target);
    });

    if (matchedForbidden) {
        logger.debug(`Rule engine blocked: matched "${matchedForbidden}" in "${content.slice(0, 80)}"`);
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
 * Normalizes spaced letters bypass (e.g. "ז ו נ ה" -> "זונה")
 * Only collapses if there are 3 or more single letters separated by spaces.
 */
function collapseSpacedLetters(text) {
    if (!text) return text;
    return text.replace(/(?:^|\s)((?:[\p{L}\p{N}]\s+){2,}[\p{L}\p{N}])(?=\s|$)/gu, (match, p1) => {
        return match.replace(p1, p1.replace(/\s+/g, ''));
    });
}

/**
 * Normalize text for smart matching:
 * 1. Strip zero-width / invisible / bidirectional control chars
 * 2. Strip Unicode combining marks (Hebrew nikud, cantillation, etc.)
 * 3. Remove punctuation, emoji, RTL marks etc. but KEEP LETTERS, DIGITS, AND SPACES.
 * 4. Collapse multiple spaces into one.
 * 5. Collapse 3+ identical consecutive characters to 2 (מיייל → מייל)
 */
function normalizeForSmartMatch(text) {
    if (!text) return '';
    let normalized = text
        .normalize('NFKD')
        .toLowerCase()
        // Invisible / zero-width / bidirectional control characters
        .replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202F\u2060-\u206F\uFEFF]/gu, '')
        // Unicode combining marks — strips Hebrew niqqud, cantillation, diacritics
        .replace(/\p{M}/gu, '')
        // Keep letters, digits, and spaces. Remove punctuation, emoji, etc.
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        // Collapse multiple spaces
        .replace(/\s+/g, ' ')
        // Collapse 3+ repeated chars (מיייל → מייל)
        .replace(/(.)\1{2,}/g, '$1$1')
        .trim();
        
    return collapseSpacedLetters(normalized);
}

/**
 * Map of look-alike characters → Hebrew equivalents.
 * Applied to the INCOMING MESSAGE only (forbidden words are already Hebrew).
 * Covers common digit/Latin/Arabic substitutions used to bypass filters.
 */
const HOMOGLYPH_MAP = {
    // Digits → Hebrew letters
    '0': 'ס',   // 0 ≈ ס
    '1': 'ו',   // 1 ≈ ו / י
    '6': 'ב',   // 6 ≈ ב
    '7': 'ל',   // 7 ≈ ל
    // Latin → Hebrew look-alikes
    'o': 'ס',   // o ≈ ס
    'i': 'י',   // i ≈ י
    'l': 'ו',   // l ≈ ו
    // Cyrillic → Hebrew look-alikes
    '\u0441': 'ס',   // Cyrillic с ≈ ס
    '\u0430': 'א',   // Cyrillic а ≈ א
    '\u0440': 'ר',   // Cyrillic р ≈ ר
    '\u0435': 'ה',   // Cyrillic е ≈ ה
    '\u043e': 'ס',   // Cyrillic о ≈ ס
    // Arabic letters → Hebrew look-alikes
    '\u0648': 'ו',   // Arabic Waw (و) ≈ ו
    '\u064a': 'י',   // Arabic Ya (ي) ≈ י
    '\u0643': 'כ',   // Arabic Kaf (ك) ≈ כ
    '\u0644': 'ל',   // Arabic Lam (ل) ≈ ל
};

function applyHomoglyphs(text) {
    return text.split('').map(ch => HOMOGLYPH_MAP[ch] || ch).join('');
}

// ─── Phonetic substitutions ────────────────────────────────────────────────
// Hebrew letters that sound identical in Israeli speech
const PHONETIC_MAP = {
    'כ': ['ק', 'ח'],
    'ק': ['כ', 'ח'],
    'ח': ['כ', 'ק'],
    'ס': ['ש'],
    'ש': ['ס'],
    'ת': ['ט'],
    'ט': ['ת'],
    'ב': ['ו'],
    'ו': ['ב'],
    'א': ['ע'],
    'ע': ['א'],
};

// ─── Visual confusables within Hebrew ─────────────────────────────────────
// Hebrew letters that look nearly identical to each other
const HEBREW_VISUAL_CONFUSABLES = {
    'ד': ['ר'],   // ד and ר differ only by a small bump
    'ר': ['ד'],
    'ה': ['ח'],   // ה and ח differ by a gap at the top right
    'ח': ['ה'],
    'ו': ['ז'],   // ו and ז differ by a short horizontal stroke
    'ז': ['ו'],
    'כ': ['ב'],   // כ and ב are mirror-like shapes
    'ב': ['כ'],
};

/**
 * Generic substitution variant generator.
 * For each position in the word, substitutes using the given map
 * and accumulates all resulting combinations (up to maxVariants).
 */
function getSubstitutionVariants(word, substitutionMap, maxVariants = 60) {
    const variants = new Set([word]);
    const letters = word.split('');

    for (let i = 0; i < letters.length; i++) {
        const alts = substitutionMap[letters[i]];
        if (!alts) continue;
        const snapshot = [...variants];
        for (const v of snapshot) {
            if (variants.size >= maxVariants) break;
            for (const alt of alts) {
                const chars = v.split('');
                chars[i] = alt;
                variants.add(chars.join(''));
            }
        }
        if (variants.size >= maxVariants) break;
    }

    return [...variants].filter(v => v !== word);
}

// ─── Latin transliteration ─────────────────────────────────────────────────
// Maps each Hebrew letter to a regex fragment for its common Latin spellings
const HEBREW_TO_LATIN_PATTERN = {
    'א': '(?:[ae]?)',       'ב': '(?:v|b)',          'ג': 'g',
    'ד': 'd',               'ה': '(?:h|a|)',          'ו': '(?:u|o|v|w|)',
    'ז': 'z',               'ח': '(?:ch|kh|h)',       'ט': 't',
    'י': '(?:y|i|)',        'כ': '(?:kh|ch|k)',       'ל': 'l',
    'מ': 'm',               'נ': 'n',                 'ס': 's',
    'ע': '(?:[ae]?)',       'פ': '(?:ph|f|p)',        'צ': '(?:tz|ts|z)',
    'ק': '(?:q|k)',         'ר': 'r',                 'ש': '(?:sh|s)',
    'ת': 't',               'ך': '(?:kh|ch|k)',       'ם': 'm',
    'ן': 'n',               'ף': '(?:ph|f|p)',        'ץ': '(?:tz|ts)',
};

/**
 * Build a regex that matches common Latin transliterations of a Hebrew word.
 * Allows 0–2 vowels between each letter's Latin representation.
 * Only applied when the message contains NO Hebrew characters (full transliteration).
 */
function buildTransliterationPattern(word) {
    if (!word || word.length < 2) return null;
    const parts = word.split('').map(c => HEBREW_TO_LATIN_PATTERN[c]).filter(Boolean);
    if (parts.length < 2) return null;
    try {
        // \b prevents matching inside another word (e.g. "skill" won't match קללה)
        return new RegExp('\\b' + parts.join('[aeiou]{0,2}'), 'i');
    } catch (e) {
        return null;
    }
}

const HEBREW_PREFIXES = ['ובה', 'ולה', 'ומה', 'וב', 'ול', 'ומ', 'וש', 'וה', 'ו', 'ב', 'ל', 'כ', 'מ', 'ש', 'ה'];
const HEBREW_SUFFIXES = ['ים', 'ות', 'תי', 'נו', 'כם', 'כן', 'הם', 'הן', 'ו', 'י', 'ת', 'ה', 'ך'];

/**
 * Generate variants of a normalized Hebrew word by stripping common
 * prefixes and suffixes, to catch morphological inflections.
 */
function getHebrewVariants(word) {
    const variants = new Set([word]);
    // MIN_STEM = 4: prevents 2-3 char stems (e.g. "הי", "ושי", "יט") that are
    // too common in Hebrew and cause rampant false positives.
    const MIN_STEM = 4;

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
    // Minimum 6 chars: prevents 4-5 char near-miss matches on short substrings
    // of unrelated words (e.g. "יביס" in "ביביסט" matching "יבאס" at dist 1).
    if (normTarget.length < 6) return false;
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

    // 2. Hebrew morphological variants (prefix/suffix stripping)
    // MIN_STEM=4 is enforced in getHebrewVariants; guard here too.
    for (const variant of getHebrewVariants(normForbidden)) {
        if (variant.length >= 4 && normMessage.includes(variant)) return true;
    }

    // 3. Fuzzy match (typos) — single-character edit distance, words ≥ 6 chars
    if (fuzzyMatchesAnyWord(normMessage, normForbidden)) return true;

    // 4. Reversed word — e.g. הללק instead of קללה (≥ 4 chars to avoid false positives)
    if (normForbidden.length >= 4) {
        const reversed = normForbidden.split('').reverse().join('');
        if (normMessage.includes(reversed)) return true;
    }

    // 5. Phonetic substitutions — ק↔כ, ס↔ש, ת↔ט, ב↔ו, א↔ע, ח↔כ
    // Minimum 4: prevents 3-char words (e.g. "חול"→"הול") matching common syllables.
    for (const variant of getSubstitutionVariants(normForbidden, PHONETIC_MAP)) {
        if (variant.length >= 4 && normMessage.includes(variant)) return true;
    }

    // 6. Visual confusables — ד↔ר, ה↔ח, ו↔ז, כ↔ב
    // Minimum 4: same reason as phonetic above.
    for (const variant of getSubstitutionVariants(normForbidden, HEBREW_VISUAL_CONFUSABLES)) {
        if (variant.length >= 4 && normMessage.includes(variant)) return true;
    }

    return false;
}

// ─── English normalization helpers ────────────────────────────────────────

/**
 * Strip invisible / zero-width / bidirectional control characters and combining
 * diacritics from English content before word-boundary checks.
 * Mirrors what normalizeForSmartMatch does for Hebrew.
 */
function stripInvisibleChars(text) {
    return text
        .normalize('NFKC')  // fullwidth Latin: Ｆｕｃｋ → Fuck; also decomposes ligatures
        .normalize('NFKD')  // then decompose remaining combining marks
        .replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202F\u2060-\u206F\uFEFF]/gu, '')
        .replace(/\p{M}/gu, '');   // strip combining diacritics: f̃ùćk → fuck
}

/**
 * Replace Cyrillic characters that are visually identical to Latin ones.
 * e.g. "fuсk" where с is Cyrillic U+0441 → "fuck"
 */
const CYRILLIC_TO_LATIN_MAP = {
    '\u0430': 'a',  // а → a
    '\u0435': 'e',  // е → e
    '\u043E': 'o',  // о → o
    '\u0440': 'p',  // р → p
    '\u0441': 'c',  // с → c
    '\u0445': 'x',  // х → x
    '\u0443': 'u',  // у → u
    '\u0456': 'i',  // Ukrainian і → i
    '\u0454': 'e',  // Ukrainian є → e
};

function applyCyrillicToLatin(text) {
    return text.split('').map(ch => CYRILLIC_TO_LATIN_MAP[ch] || ch).join('');
}

/**
 * Collapse runs of 3+ single letters separated by spaces into one word.
 * e.g. "f u c k" → "fuck", "כ ו ס" → "כוס"
 * Requires at least 3 letters to avoid collapsing normal short phrases.
 */
function collapseSpacedLetters(text) {
    return text.replace(
        /(^|[\s,!?.])([a-zA-Z\u05D0-\u05EA])((?:\s[a-zA-Z\u05D0-\u05EA]){2,})([\s,!?.]|$)/g,
        (_, before, first, rest, after) => before + first + rest.replace(/\s/g, '') + after
    );
}

/**
 * Known phonetic/leet bypass variants → canonical English form.
 * Applied to message content so word-boundary checks work against canonical words.
 */
const ENGLISH_PHONETIC_MAP = {
    // fuck
    'fvck': 'fuck', 'phuck': 'fuck', 'phuk': 'fuck', 'fcuk': 'fuck',
    'fook': 'fuck', 'fuk':  'fuck',  'fuq':  'fuck', 'fyck': 'fuck',
    'f@ck': 'fuck', 'f4ck': 'fuck',  'f*ck': 'fuck', 'feck': 'fuck',
    'fucc': 'fuck', 'fack': 'fuck',  'fuc':  'fuck',
    // shit
    'sh1t': 'shit', 'shyt': 'shit',  'sh!t': 'shit', 'sheit': 'shit',
    'shitt': 'shit', 'shi+': 'shit',
    // ass
    'a55':  'ass', '@ss': 'ass', 'azz': 'ass', '4ss': 'ass', 'a$$': 'ass',
    // asshole
    '@sshole': 'asshole', 'a55hole': 'asshole', 'azzhole': 'asshole',
    // bitch
    'b1tch':  'bitch', 'biatch': 'bitch', 'biotch': 'bitch', 'b!tch': 'bitch',
    'bich':   'bitch', 'bytch':  'bitch',
    // cunt
    'c0nt': 'cunt', 'kunt': 'cunt', 'c*nt': 'cunt', 'cvnt': 'cunt',
    // dick
    'd1ck': 'dick', 'd!ck': 'dick', 'dikc': 'dick', 'd*ck': 'dick',
    // cock
    'c0ck': 'cock', 'k0ck': 'cock', 'c*ck': 'cock',
    // pussy
    'pu$$y': 'pussy', 'pvssy': 'pussy', 'p*ssy': 'pussy',
    // nigger
    'n1gger': 'nigger', 'nigg3r': 'nigger', 'n1gg3r': 'nigger', 'n!gger': 'nigger',
    // faggot
    'f4ggot': 'faggot', 'f@ggot': 'faggot', 'faggt': 'faggot',
    // whore
    'wh0re': 'whore', 'wh0r3': 'whore', 'wh*re': 'whore',
    // slut
    'sl0t': 'slut', 'sl!t': 'slut',
    // hell
    'h3ll': 'hell',
    // damn
    'd4mn': 'damn', 'dmn': 'damn',
    // bastard
    'b@stard': 'bastard',
    // motherfucker
    'mofo': 'motherfucker', 'm0f0': 'motherfucker', 'mf': 'motherfucker',
};

function applyEnglishPhoneticMap(text) {
    let result = text.toLowerCase();
    for (const [variant, canonical] of Object.entries(ENGLISH_PHONETIC_MAP)) {
        try {
            const escaped = escapeRegex(variant);
            result = result.replace(
                new RegExp('(?<![\\p{L}\\p{N}])' + escaped + '(?![\\p{L}\\p{N}])', 'gu'),
                canonical
            );
        } catch { /* skip on invalid pattern */ }
    }
    return result;
}

/**
 * Apply all non-destructive English bypass normalizations in sequence.
 */
function applyEnglishNormalizations(text) {
    return collapseSpacedLetters(applyCyrillicToLatin(stripInvisibleChars(text)));
}

module.exports = {
    evaluateMessage,
    checkAntiSpam
};
