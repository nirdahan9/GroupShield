const fs = require('fs');
const { CURSE_WORDS } = require('./src/cursesList');
const ruleEngine = require('./src/ruleEngine');

const hebrewPrefixes = ['ובה', 'ולה', 'ומה', 'וב', 'ול', 'ומ', 'וש', 'וה', 'ו', 'ב', 'ל', 'כ', 'מ', 'ש', 'ה'];
const hebrewSuffixes = ['ים', 'ות', 'תי', 'נו', 'כם', 'כן', 'הם', 'הן', 'ו', 'י', 'ת', 'ה', 'ך'];

const targetWords = ['היי', 'הוא לא הולך להסיר אותי', 'ניר הבוט יותר פרוגרסיבי מברק רביד', 'רדיוס לביתר', 'אבל אי אפשר לתת לאיזה', 'שמעון מזרחי', 'מושי', 'היידה', 'אני חושב שיש באג'];

function normalize(text) {
    return text.normalize('NFKD').toLowerCase().replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202F\u2060-\u206F\uFEFF]/gu, '').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '').replace(/(.)\1{2,}/g, '$1$1');
}

for (let word of targetWords) {
    let norm = normalize(word);
    console.log("Checking:", word, "->", norm);
    for (const forbidden of CURSE_WORDS) {
        let normForbidden = normalize(forbidden);
        
        // Let's use the actual smartMatchesForbidden logic for each
        if (ruleEngine.smartMatchesForbidden(norm, normForbidden)) {
            console.log(`  [OVERALL MATCH] matched ruleEngine.smartMatchesForbidden against: ${forbidden}`);
        }
    }
}
