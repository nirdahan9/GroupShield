'use strict';

// ─── Direct-block list ────────────────────────────────────────────────────────
// Words/phrases blocked immediately by the rule engine (no LLM needed).
const CURSE_WORDS = [
    // ── גניטליה / מין ─────────────────────────────────────────────────────────
    'כוס', 'כוסאמק', 'כוסמק', 'כסאמק', 'כסמק', 'כוסית',
    'כוס אמא', 'כוס אמו', 'כוס אמך', 'כוס אמם', 'כוס של אמא',
    'כוס אחתך', 'כוס אחי', 'בסהלק', 'כסח', 'פות', 'פוצה',
    'זין', 'זיון', 'זיונים', 'זיני', 'לזיין', 'מזיין', 'מזדיין',
    'תזדיין', 'תזיין', 'נזדיין', 'יזדיין', 'יזיין',
    'לך לזיין', 'לך תזדיין', 'תזדיין לי', 'מזיינת', 'מזדיינת',
    'זיין לך', 'זיין לה', 'זיין לו', 'זיין לכם', 'זיין לכן',
    'לזיין את אמא', 'תזיין את אמא שלך',
    'תחת', 'תחתים', 'חור תחת', 'פומפה', 'בוסה',
    'מציצה', 'מוצץ זין', 'למצוץ', 'תמצוץ',
    'נטחן', 'נטחנת', 'נטחנים', 'נטחנות',
    'מתחנגל', 'רקטאנגל מתחנגל', 'נטחניטיס', 'חיל הנטחנים',
    'לדפוק', 'דפיקה', 'דפוק אותה', 'דפוק אותו',
    'בא עליה', 'בא עליו',
    'תיבאס', 'יבאס', 'ינאל', 'ינאל אמך', 'ינאל אבוק',
    'להזדיין', 'שתזדיין', 'תזדיין איתה', 'תזדיין אתו',
    'חרמן', 'חרמנית', 'חרמנים',
    'זין בראש', 'זין בתחת', 'זין בפנים',
    // ── זנות / השפלה ───────────────────────────────────────────────────────────
    'זונה', 'זונות', 'שרמוטה', 'שרמוטות', 'יצאנית', 'יצאניות',
    'בן זונה', 'יבן זונה', 'בן שרמוטה', 'בנת זונה', 'בת זונה',
    'יבן שרמוטה', 'בן זונה מושלם',
    'סרסור', 'סרסורית', 'מוכת תחת', 'כלי מיטה',
    'זין עלייך', 'זין עליה', 'זין עליו', 'זין עליכם',
    'תזדיין עם', 'לך תזדיין עם',
    // ── צואה / גוף ────────────────────────────────────────────────────────────
    'חרא', 'חרה', 'חרטא', 'חרטות',
    'בת חרא', 'בן חרא', 'מלא חרא', 'אוכל חרא', 'כדור חרא',
    'שיט חרא', 'שטיק חרא', 'אתה חרא', 'את חרא',
    'שיט', 'תשיט', 'תשתן',
    // ── ממזר / נבלה / רשע ─────────────────────────────────────────────────────
    'ממזר', 'ממזרים', 'ממזרת', 'ממזרות',
    'נבלה', 'נבלות',
    'מנוול', 'מנוולת', 'מנוולים',
    'בן כלב', 'בן כלבה', 'בן זבל', 'כלב מסריח',
    'רשע', 'רשעה', 'רשעים', 'מרושע', 'מרושעת',
    'שקרן', 'שקרנית', 'שקרנים', 'שקרניות',
    'רמאי', 'רמאית', 'רמאים',
    'גנב', 'גנבת', 'גנבים',
    'בוגד', 'בוגדת', 'בוגדים',
    'מרגל', 'פושע', 'פושעת',
    'נוכל', 'נוכלת', 'נוכלים',
    // ── אידיוט / מפגר ──────────────────────────────────────────────────────────
    'אידיוט', 'אידיוטית', 'אידיוטים',
    'טמבל', 'טמבלה', 'טמבלים',
    'מפגר', 'מפגרת', 'מפגרים',
    'אוויל', 'שוטה', 'שוטים',
    'מורון', 'דביל', 'דבילה', 'דבילים',
    'קריטין', 'אימבציל',
    'מונגול', 'מונגולויד', 'דאון',
    'נכה שכל', 'חסר מוח', 'ריק מוח', 'חסר שכל',
    'מטורף', 'מטורפת', 'מטורפים',
    'פסיכו', 'פסיכית', 'פסיכופת', 'פסיכופטית',
    'משוגע', 'משוגעת', 'משוגעים',
    'סכיזו', 'פרנואיד',
    // ── קללות ישירות / מוות ───────────────────────────────────────────────────
    'תמות', 'שתמות', 'תשרף', 'שתשרף',
    'תחרב', 'שתחרב', 'תיאבד', 'שתיאבד', 'תאבד',
    'תיעלם', 'תתאיין', 'תכלה',
    'לעזאזל', 'לך לעזאזל', 'תלך לעזאזל', 'לך לגיהנום',
    'תרד לשאול', 'שייך לגיהנום',
    'תסתלק', 'תסתלק מפה', 'תסתלק מחיי',
    'תתנקב', 'תתנקבו',
    'ייקב את שמך', 'ייקב שמו', 'ייקב שמה',
    'יימח שמך', 'יימח שמו', 'יימח שמה', 'יימח שמם',
    'יהיה לך רע', 'יהיה לך רע בחיים', 'שתסבול', 'תסבול',
    'כל הקללות עליך', 'כל הקללות עליו', 'כל הקללות עליה',
    'ארור', 'ארורה', 'ארורים', 'ארורות',
    'שתיכרת', 'תיכרת',
    // ── עלבונות גזעניים / כינויים פוגעניים ───────────────────────────────────
    'כושי', 'כושית', 'כושים', 'חבשי', 'ניגר', 'ניגה', 'ניגרים',
    'ערס', 'ערסים', 'ערסית', 'ערסיות',
    'פרחה', 'פרחות', 'שיגץ', 'שיקסה',
    'קוקסינל', 'אוחצ\'ה', 'קחבה', 'צ\'ולה', 'פוסטמה', 'צ\'חצ\'ח', 'אבוטבול',
    'ח׳ביל', 'חביל', 'פאחד',
    'ח׳ול', 'זפת',
    'בהיים',
    'דבע', 'דאבע',                   // גידוף מיני ערבי (עבר LLM מספר פעמים)
    'חמאר',                            // ערבית: חמור (גידוף)
    'יכלב', 'יכאלב',                  // ערבית: בן כלב
    'גלאב', 'כלב', 'קלב',             // ערבית: כלב (גידוף)
    'מניאק', 'מניאכ', 'מניוכ',        // ערבי-ישראלי: מטורף/מזוין (גידוף)
    'ח׳רה', 'ח\'רה', 'חרה ביום',      // ערבית: חרא
    'ואלק', 'ולק', 'וואלק',           // ערבי: קללה גסה
    'מנחוס', 'מנחוסה', 'מנחוסים',    // ערבית: ארור/מקולל (גידוף)
    'ח׳ייבה', 'ח\'ייבה', 'חייבה',    // ערבית: כישלון/אפס (גידוף)
    'זבאלה', 'זבלה', 'זבל בן זבל',   // ערבית: אשפה (גידוף)
    'שלק', 'שלוק',                    // ערבי-ישראלי: שמוק/אפס
    'יא חמאר', 'יא גלאב', 'יא זפת', 'יא חרא', 'יא מניאק', // צירופי "יא" ערביים
    // ── אנגלית גסה בכתיב עברי ────────────────────────────────────────────────
    'פאק', 'פאקינג', 'פאק יו', 'וואט דה פאק',
    'סאק', 'סאק מיי', 'ביץ', 'בסטרד',
    'אסהול', 'קאנט', 'מאדרפאקר', 'סאן אוף אביץ',
    // ── English — fuck ────────────────────────────────────────────────────────
    'fuck', 'fucking', 'fucker', 'fucked', 'fucks', 'fuckin',
    'fk', 'fuk', 'phuck',
    'fuck you', 'fuck off', 'fuck this', 'fuck that', 'fuck him', 'fuck her', 'fuck them',
    'fuck your', 'fuck my', 'fuck everyone', 'fuck everything',
    'wtf', 'what the fuck', 'what the f', 'omfg',
    'go fuck yourself', 'go fuck yourself hard',
    'fucking hell', 'for fucks sake', 'for fuck sake',
    'motherfucker', 'motherfucking', 'motherf', 'mf', 'mofo',
    'fucktard', 'fuckwit', 'fuckface', 'fuckup', 'fuckhead', 'fuckbag',
    'clusterfuck', 'mindfuck',
    'shut the fuck up', 'stfu',
    // ── English — shit ────────────────────────────────────────────────────────
    'shit', 'shithead', 'shitface', 'shithole', 'shitbag', 'shitbird', 'shitlord',
    'bullshit', 'piece of shit', 'holy shit', 'pile of shit', 'horseshit',
    'dipshit', 'dumbshit', 'dogshit', 'chickenshit',
    'shitty', 'shitting', 'shitter',
    'crap', 'crappy', 'piece of crap',
    // ── English — ass compounds (standalone 'ass' → context list) ─────────────
    'asshole', 'asswipe', 'asshat', 'assface', 'assclown', 'assbag',
    'jackass', 'dumbass', 'smartass', 'fatass', 'lardass',
    'kiss my ass', 'lick my ass', 'shove it up your ass', 'stick it up your ass',
    // ── English — dick / cock compounds ───────────────────────────────────────
    'dick', 'dickhead', 'dickface', 'dickweed', 'dickwad', 'dumbdick',
    'cocksucker', 'cock sucker', 'cockhead', 'cockface', 'cockwad',
    // ── English — bitch compounds (standalone 'bitch' → context list) ─────────
    'bitches', 'bitchy', 'bitch ass',
    'son of a bitch', 'son of a whore', 'you bitch', 'stupid bitch', 'dumb bitch',
    'basic bitch', 'dirty bitch',
    // ── English — cunt / pussy compounds ──────────────────────────────────────
    'cunt', 'cunts', 'stupid cunt', 'dumb cunt',
    'pussies', 'pussy ass',
    'nutsack', 'ballsack',
    'blowjob', 'blow job', 'handjob', 'hand job', 'jizz', 'cum',
    // ── English — whore / slut ─────────────────────────────────────────────────
    'whore', 'slut', 'skank', 'hoe', 'hoes', 'ho', 'prostitute', 'tramp',
    'bastard', 'bastards',
    'wanker', 'wank', 'twat', 'prick', 'bollocks', 'tosser', 'git',
    'douchebag', 'douche', 'douchebags', 'douchey',
    // ── English — racial / ethnic slurs ───────────────────────────────────────
    'nigger', 'nigga', 'nigg', 'niger', 'nibba', 'chimp',
    'faggot', 'fag', 'fags', 'dyke', 'tranny', 'fagbag', 'shemale', 'twink',
    'retard', 'retarded', 'spastic', 'mongoloid',
    'kike', 'chink', 'gook', 'spic', 'wetback', 'beaner',
    'towelhead', 'raghead', 'sand nigger', 'camel jockey',
    'coon', 'jap', 'nip', 'white trash',
    // ── English — insults ──────────────────────────────────────────────────────
    'idiot', 'idiots', 'moron', 'morons', 'imbecile', 'imbeciles',
    'dumbfuck', 'dumb fuck', 'stupid fuck', 'dumb shit', 'dumbfucks',
    'loser', 'losers', 'piece of trash', 'piece of garbage',
    'scumbag', 'scum', 'scumbags', 'lowlife', 'low life',
    'dirtbag', 'sleazebag', 'scumbucket', 'slimeball', 'sleazeball',
    'jerk', 'jerk off', 'jerkoff', 'jerkface',
    'numbnuts', 'numbskull', 'numskull', 'knucklehead', 'blockhead',
    'dipshit', 'nitwit', 'halfwit', 'dimwit',
    'airhead', 'pinhead', 'shitforbrains', 'shit for brains',
    'pervert', 'perv', 'creep', 'creeps',
    'psycho', 'nutjob', 'nutcase', 'freak', 'weirdo',
    'swine', 'vermin',
    'worthless', 'worthless piece of shit', 'worthless piece of garbage',
    'you suck', 'suck my', 'suck it', 'eat shit', 'eat my',
    'cuck', 'cuckold', 'soyboy', 'libtard', 'magat', 'incel', 'thot', 'simp',
    'shitstain', 'fucknugget', 'twot', 'wankstain', 'cockwomble', 
    // ── English — death wishes / aggression ───────────────────────────────────
    'go to hell', 'go to hell and die', 'rot in hell', 'burn in hell',
    'drop dead', 'kill yourself', 'kys', 'go die', 'please die',
    'i hope you die', 'i hope you rot', 'i hope you burn',
    'i will kill you', 'i will hurt you', 'i will destroy you',
    'get the fuck out', 'get out of my face', 'get lost',
    'i hate you', 'i hate your guts', 'go away and die',
    'die in a fire', 'die slowly',
    // ── גסויות כלליות ─────────────────────────────────────────────────────────
    'יא זבל', 'יא חמור', 'יא מנוול', 'יא ממזר',
    'יא שרמוטה', 'יא אידיוט', 'יא מפגר', 'יא כלב',
    'פלצן', 'פלצנות',
    'מסריח', 'מסריחה', 'מסריחים',
    'מגעיל', 'מגעילה', 'מגעילים',
    'עלוב', 'עלובה', 'עלובים',
    'טיפש', 'טיפשה', 'טיפשים',
    'שרץ',
    'בזוי', 'בזויה', 'בזויים',
    'נחשל', 'נחשלת',
    'פגמן', 'גלם',
    'טחוב', 'מצחין',
    'זקן מנוול', 'זקנה מנוולת',
    'לא שווה כלום', 'לא שווה שום דבר', 'זין שווה',
    'תסגור את הפה', 'סתום את הפה', 'סתום',
    'לך תשתוק', 'לא מעניין אותי',
    'תחרב לך הבית', 'תחרב הבית שלך',
    'יהיה לך חושך',
    'סעמק', 'כוסעמק', 'אחושרמוטה', 'שרלילה', 'שלירלולה', 'חתיכת אפס', 'אתה אפס', 'יא מסכן',
    'טפי', 'טפי עליך', 'יא פח', 'קוף', 'בבון', 'יא חתיכת', 'בן אלף', 'בן מתרומם',
    'אוכל בתחת', 'מזדיין בתחת', 'לקקן', 'לקקנית', 'חולה מין',
    // ── bypass variants — added explicitly since morphological shortening no longer catches them ──
    'שרמיט', 'שרמוט', 'שארמוטה', 'שרמוטה יא', 'כוסיט', 'כוסעמאק',
    // ── ביטויי שנאה / הסתה ────────────────────────────────────────────────────
    'מוות לערבים', 'מוות ליהודים', 'מוות למוסלמים', 'מוות לנוצרים',
    'מוות לדרוזים', 'מוות לחרדים', 'מוות לערבי',
    'ערבים לים', 'ערבים החוצה', 'כל הערבים', 'גרשו את הערבים',
    'לגזים', 'לתאי גז', 'לכבשנים',   // הסתה לרצח עם / שואה
    // ── גידופי מיניות / דת / אתניות — נאכפים ישיר (ללא LLM) ─────────────────
    'נאצי', 'נאצית', 'נאצים',          // always an insult in this context
    'פייגלה',                            // homophobic slur
];

// ─── Context-dependent list ───────────────────────────────────────────────────
// Words that have innocent meanings in some contexts.
// These are NOT blocked directly — every message containing one is sent to the
// LLM which decides based on context.
const CONTEXT_WORDS = [
    // Hebrew — food / nature / everyday that can also be vulgar/insulting
    'ביצים', 'בצים',      // eggs → also testicles
    'נקניק',               // sausage → also penis
    'חרמון',               // Mount Hermon → also horny
    'חרי',                 // feces-construct → false positives in 'אחרי', 'חריגה'
    'חרות',                // freedom (common innocent) → false positives vs crude usage
    'שיטה',                // method (common) → also "shit" slang
    'נרתיק', 'יבתול', 'בתולים',  // medical/anatomical terms used offensively
    'נבל',                 // harp/scoundrel (generates false positives inside 'מנבל')
    'חול',                 // sand/sick/jerk (generates false positives inside 'יכול', 'חולם')
    'מוצץ', 'מוצצת',      // pacifier / vacuum → also oral-sex insult
    'כלבה',                // female dog → also bitch
    'עכברוש',              // rat (pest) → also snitch/traitor
    'בעל חיים',            // animal (biology) → also beast (insult)
    'בהמה', 'בהמות',       // animal/beast (literal) → insult
    'נחש',                 // snake (reptile) → also backstabber
    'חזיר', 'חזירה', 'חזירים', 'חזירון',  // pig (food/farm) → insult
    // Hebrew — identity/history that can be used as curses
    'הומו', 'לסבית', 'גיא', 'גיי', // sexual orientation vs slur
    'שואה', // history education vs curse
    'אוטיסט', 'אוטיסטים', 'אוטיסטית', 'פיגור', 'מפגר', // medical vs curse
    'מוגבל', 'נכה', 'נכות', 'תסמונת דאון', // disabilities vs curses
    'שמן', 'שמנה', 'דובה', 'מכוער', 'מכוערת', 'קירח', // appearance describing vs body shaming
    'מחבל', 'ערבי', 'שמאלני', 'ימני', 'פשיסט', 'דיקטטור', // news/politics vs insults
    'סרטן', 'מחלה', // medical vs "you are cancer"
    // Hebrew — adjectives used innocently in everyday speech
    'דפוק', 'דפוקה', 'דפוקים',       // broken/messed-up → also crude insult
    'קורע', 'קריעה',                 // funny vs ripping
    // English — words with clear innocent meanings
    'cock',       // rooster → vulgar
    'bitch',      // female dog → insult
    'balls',      // sports balls → vulgar
    'nuts',       // food (almonds, etc.) → vulgar
    'tits',       // birds (blue tit) → vulgar
    'ass',        // donkey → vulgar
    'pussy',      // cat → vulgar
    'fag',        // cigarette (UK) → slur
    'cracker',    // food → racial slur
    'pig',        // farm animal → insult
    'rat',        // rodent → informer insult
    'snake',      // reptile → backstabber insult
    'nazi',       // history → insult
    'gay',        // orientation / happy → insult
    'queer',      // orientation → insult
    'autism',     // medical → slur
    'autistic',   // medical → slur
    'holocaust',  // history → insult
    'cancer',     // medical vs "you're cancer"
    'tumor',      // medical vs insult
    'terrorist',  // news vs insult
    'communist',  // politics vs insult
    'fascist',    // politics vs insult
    'groomer',    // pet care/crime vs political insult
    'pedophile',  // crime vs internet insult
    'jew',        // identity vs slur
    'black',      // color/identity vs slur
    'white'       // color/identity vs slur
];

// ─── Allowed-words list (override) ───────────────────────────────────────────
// If a message contains any phrase from this list, curse enforcement is skipped
// entirely for that message (absolute whitelist override).
const ALLOWED_WORDS = [];

// ── Runtime learning ──────────────────────────────────────────────────────────

/**
 * Add a phrase to the live CURSE_WORDS, CONTEXT_WORDS, or ALLOWED_WORDS array
 * at runtime. Persists to DB if persist=true (default).
 * Returns true if the phrase was new, false if it already existed.
 */
function addToLiveList(phrase, type, persist = true) {
    const normalized = phrase.trim();
    if (!normalized || normalized.length < 2) return false;

    let target;
    if (type === 'context') target = CONTEXT_WORDS;
    else if (type === 'allowed') target = ALLOWED_WORDS;
    else target = CURSE_WORDS;

    if (target.includes(normalized)) return false;

    target.push(normalized);

    // Invalidate cosine reference vectors so the new phrase is included next check
    if (type !== 'allowed') {
        try { require('./cosine').resetReferenceVectors(); } catch (e) { /* ignore */ }
    }

    if (persist) {
        try {
            require('./database').addLearnedPhrase(normalized, type, null).catch(() => {});
        } catch (e) { /* ignore */ }
    }

    return true;
}

/**
 * Called once on bot startup — loads all previously learned phrases from DB
 * and pushes them into the live arrays (without re-persisting).
 */
async function initLearnedPhrases() {
    try {
        const database = require('./database');
        const [learnedRows, allowedRows] = await Promise.all([
            database.getLearnedPhrases(),
            database.getAllowedPhrases()
        ]);
        let loaded = 0;
        for (const { phrase, list_type } of [...learnedRows, ...allowedRows]) {
            if (addToLiveList(phrase, list_type, false)) loaded++;
        }
        if (loaded > 0) {
            const logger = require('./logger');
            logger.info(`Learned phrases: loaded ${loaded} phrase(s) from DB into live filter`);
        }
    } catch (e) {
        /* non-fatal — bot works fine with static lists only */
    }
}

module.exports = { CURSE_WORDS, CONTEXT_WORDS, ALLOWED_WORDS, addToLiveList, initLearnedPhrases };
