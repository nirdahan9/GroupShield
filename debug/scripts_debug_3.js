const fs = require('fs');
const { CURSE_WORDS } = require('./src/cursesList');
const ruleEngine = require('./src/ruleEngine');

// Override smartMatchesForbidden to log what matched
const orig_smartMatchesForbidden = ruleEngine.smartMatchesForbidden;

// We need to inject our hook or just rebuild the check logic for logging
function checkMatchingWord(content) {
    const normMsg = content.normalize('NFKD').toLowerCase()
        .replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202F\u2060-\u206F\uFEFF]/gu, '')
        .replace(/\p{M}/gu, '')
        .replace(/[^\p{L}\p{N}]/gu, '')
        .replace(/(.)\1{2,}/g, '$1$1');
        
    for (let forbidden of CURSE_WORDS) {
        let normTarget = forbidden.normalize('NFKD').toLowerCase()
        .replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202F\u2060-\u206F\uFEFF]/gu, '')
        .replace(/\p{M}/gu, '')
        .replace(/[^\p{L}\p{N}]/gu, '')
        .replace(/(.)\1{2,}/g, '$1$1');

        if (smartMatchesForbiddenTest(normMsg, normTarget)) {
            console.log(`Matched! Msg: '${content}' by Curse: '${forbidden}' (NormTgt: '${normTarget}')`);
            return;
        }
    }
}

// Copying functions from ruleEngine for local testing access
const HEBREW_PREFIXES = ['ובה', 'ולה', 'ומה', 'וב', 'ול', 'ומ', 'וש', 'וה', 'ו', 'ב', 'ל', 'כ', 'מ', 'ש', 'ה'];
const HEBREW_SUFFIXES = ['ים', 'ות', 'תי', 'נו', 'כם', 'כן', 'הם', 'הן', 'ו', 'י', 'ת', 'ה', 'ך'];
function getHebrewVariants(word) {
    const variants = new Set([word]);
    const MIN_STEM = 4;
    for (const prefix of HEBREW_PREFIXES) {
        if (word.startsWith(prefix) && word.length - prefix.length >= MIN_STEM) {
            const stem = word.slice(prefix.length);
            variants.add(stem);
            for (const suffix of HEBREW_SUFFIXES) {
                if (stem.endsWith(suffix) && stem.length - suffix.length >= MIN_STEM) {
                    variants.add(stem.slice(0, stem.length - suffix.length));
                }
            }
        }
    }
    for (const suffix of HEBREW_SUFFIXES) {
        if (word.endsWith(suffix) && word.length - suffix.length >= MIN_STEM) {
            variants.add(word.slice(0, word.length - suffix.length));
        }
    }
    return [...variants];
}

const HOMOGLYPH_MAP = {
    '0': 'ס', '1': 'ו', '6': 'ב', '7': 'ל',
    'o': 'ס', 'i': 'י', 'l': 'ו',
    '\u0441': 'ס', '\u0430': 'א', '\u0440': 'ר', '\u0435': 'ה', '\u043e': 'ס',
    '\u0648': 'ו', '\u064a': 'י', '\u0643': 'כ', '\u0644': 'ל',
};
function applyHomoglyphs(text) {
    return text.split('').map(ch => HOMOGLYPH_MAP[ch] || ch).join('');
}


const PHONETIC_MAP = {
    'כ': ['ק', 'ח'], 'ק': ['כ', 'ח'], 'ח': ['כ', 'ק'],
    'ס': ['ש'], 'ש': ['ס'], 'ת': ['ט'], 'ט': ['ת'],
    'ב': ['ו'], 'ו': ['ב'], 'א': ['ע'], 'ע': ['א'],
};
const HEBREW_VISUAL_CONFUSABLES = {
    'ד': ['ר'], 'ר': ['ד'], 'ה': ['ח'], 'ח': ['ה'],
    'ו': ['ז'], 'ז': ['ו'], 'כ': ['ב'], 'ב': ['כ'],
};
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
function fuzzyMatchesAnyWord(normMessage, normTarget) {
    if (normTarget.length < 6) return false;
    const targetLen = normTarget.length;
    for (let i = 0; i <= normMessage.length - targetLen + 1; i++) {
        const window = normMessage.slice(i, i + targetLen + 1);
        if (window.length >= targetLen - 1 && editDistance(window.slice(0, targetLen), normTarget) <= 1) {
            return true;
        }
    }
    return false;
}

function smartMatchesForbiddenTest(normMessage, normForbidden) {
    if (normMessage.includes(normForbidden)) { console.log(`  -> Direct contain`); return true; }
    for (const variant of getHebrewVariants(normForbidden)) {
        if (variant.length >= 4 && normMessage.includes(variant)) { console.log(`  -> Prefix/Suf contain: ${variant}`); return true; }
    }
    if (fuzzyMatchesAnyWord(normMessage, normForbidden)) { console.log(`  -> Fuzzy`); return true; }
    if (normForbidden.length >= 4) {
        const reversed = normForbidden.split('').reverse().join('');
        if (normMessage.includes(reversed)) { console.log(`  -> Reversed ${reversed}`); return true; }
    }
    for (const variant of getSubstitutionVariants(normForbidden, PHONETIC_MAP)) {
        if (variant.length >= 4 && normMessage.includes(variant)) { console.log(`  -> Phonetic ${variant}`); return true; }
    }
    for (const variant of getSubstitutionVariants(normForbidden, HEBREW_VISUAL_CONFUSABLES)) {
        if (variant.length >= 4 && normMessage.includes(variant)) { console.log(`  -> Visual ${variant}`); return true; }
    }
    
    // Test homoglyph and stripped versions
    const homoMsg = normMessage; 
    // etc... this is slightly abstracted from original `checkForbiddenMessages`
    return false;
}

function fullCheck(msg) {
    try {
        const hebrewMsgOrig = msg.normalize('NFKD').toLowerCase().replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202F\u2060-\u206F\uFEFF]/gu, '').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '').replace(/(.)\1{2,}/g, '$1$1');
        
        for (let forbidden of CURSE_WORDS) {
            let normTarget = forbidden.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
            const isHebrew = /[\u05D0-\u05EA]/.test(forbidden.trim());
            if (isHebrew) {
                let normMsg = hebrewMsgOrig;
                if (smartMatchesForbiddenTest(normMsg, normTarget)) return [msg, forbidden];
                let homoMsg = applyHomoglyphs(msg.toLowerCase()); // simplify
                homoMsg = homoMsg.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').replace(/(.)\1{2,}/g, '$1$1');
                if (smartMatchesForbiddenTest(homoMsg, normTarget)) return [msg, forbidden];
                
                let hebrewOnly = normMsg.replace(/[^\u05D0-\u05EA\u05F0-\u05F4]/g, '');
                if (smartMatchesForbiddenTest(hebrewOnly, normTarget)) return [msg, forbidden];
            }
        }
    } catch (e) {}
    return null;
}

const tests = [
    'היי',
    'הוא לא הולך להסיר אותי',
    'ניר הבוט יותר פרוגרסיבי מברק רביד',
    'רדיוס לבית״ר',
    'אבל אי אפשר לתת לאיזה agent שיפענח את הטקסט?',
    'שמעון מזרחי',
    'לא מנבל את הפה',
    'אני חושב שיש באג',
    'מושי',
    'היידה'
];

tests.forEach(t => {
    const res = fullCheck(t);
    if (res) console.log(`Msg: '${t}' matched '${res[1]}'`);
    else console.log(`Msg: '${t}' - NO MATCH`);
});


module.exports = { fullCheck };
