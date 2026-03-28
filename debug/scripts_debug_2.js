const fs = require('fs');

// We need to load ruleEngine methods and state to test evaluateMessage properly
// Let's copy it and expose what we need, or just require it if we can.
const { checkForbiddenMessages } = require('./tests/ruleEngine.test.js') // wait, let's just make a mock group with curse preset

// Oh wait, `src/ruleEngine.js` doesn't export checkForbiddenMessages it seems?
// evaluateMessage is exported.

async function run() {
    const { evaluateMessage } = require('./src/ruleEngine');

    const rules = [
        {
            ruleType: 'forbidden_messages',
            ruleData: {
                isCursesPreset: true,
                matchMode: 'smart'
            }
        }
    ];

    function check(msg) {
        const res = evaluateMessage(rules, { content: msg, msgType: 'chat' });
        console.log('Test:', msg, '=>', !res.allowed ? 'BLOCKED' : 'ALLOWED', res.violations);
    }

    check('היי');
    check('הוא לא הולך להסיר אותי');
    check('ניר הבוט יותר פרוגרסיבי מברק רביד');
    check('רדיוס לבית״ר');
    check('אבל אי אפשר לתת לאיזה agent שיפענח את הטקסט?');
    check('אני חושב שיש באג');
    check('שמעון מזרחי');
    check('לא מנבל את הפה');

}

run();
