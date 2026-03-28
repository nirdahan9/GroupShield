const { CURSE_WORDS } = require('./src/cursesList');

function test(message) {
    const normMsg = message.normalize('NFKD').toLowerCase().replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202F\u2060-\u206F\uFEFF]/gu, '').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '').replace(/(.)\1{2,}/g, '$1$1');
    console.log('Testing', message, '=>', normMsg);

    for (const forbidden of CURSE_WORDS) {
        const tgt = forbidden.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
        if (normMsg.includes(tgt)) {
            console.log('Includes direct:', tgt);
        }
    }
}

test('היי');
test('הוא לא הולך להסיר אותי');
test('ניר הבוט יותר פרוגרסיבי מברק רביד');
test('רדיוס לבית״ר');
test('אבל אי אפשר לתת לאיזה agent שיפענח את הטקסט?');
test('אני חושב שיש באג');
test('שמעון מזרחי');
test('לא מנבל את הפה');

