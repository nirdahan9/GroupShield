const { CURSE_WORDS } = require('./src/cursesList');

const targetWords = ['היי', 'הוא לא הולך להסיר אותי', 'ניר הבוט יותר פרוגרסיבי מברק רביד', 'רדיוס לביתר', 'אבל אי אפשר לתת לאיזה', 'שמעון מזרחי', 'מושי', 'היידה', 'אני חושב שיש באג'];

for (let msg of targetWords) {
    const normalizedContent = msg.trim().toLowerCase();
    for (let forbidden of CURSE_WORDS) {
        const target = forbidden.trim().toLowerCase();
        if (normalizedContent.includes(target)) {
            console.log(`Msg: '${msg}' contains target: '${target}'`);
        }
    }
}
