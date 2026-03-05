// src/i18n.js - Bilingual message system (Hebrew + English)

const strings = {
    // ── Setup Flow ────────────────────────────────────────────────────────
    'welcome': {
        he: `🛡️ *ברוכים הבאים ל-GroupShield!*\n\nאני בוט שעוזר לאכוף חוקים בקבוצות וואטסאפ.\nבואו נתחיל בהגדרת הקבוצה שלך.\n\nבחר שפה / Choose language:\n\n1️⃣ 🇮🇱 עברית\n2️⃣ 🇬🇧 English`,
        en: `🛡️ *Welcome to GroupShield!*\n\nI'm a bot that helps enforce rules in WhatsApp groups.\nLet's set up your group.\n\nChoose language / בחר שפה:\n\n1️⃣ 🇮🇱 עברית\n2️⃣ 🇬🇧 English`
    },
    'lang_set': {
        he: '✅ השפה הוגדרה לעברית.\n\nבואו נתחיל! 👇',
        en: '✅ Language set to English.\n\nLet\'s begin! 👇'
    },
    'ask_group_name': {
        he: '📋 *שלב 1: קישור קבוצה*\n\nקודם כל, הוסף אותי לקבוצה שאתה רוצה שאאכוף ומנה אותי כ*מנהל*.\n\nלאחר מכן, שלח לי את *שם הקבוצה* (כפי שהוא מופיע בוואטסאפ):',
        en: '📋 *Step 1: Link Group*\n\nFirst, add me to the group you want me to enforce and make me an *admin*.\n\nThen, send me the *group name* (as it appears in WhatsApp):'
    },
    'group_searching': {
        he: '🔍 מחפש את הקבוצה...',
        en: '🔍 Searching for the group...'
    },
    'group_not_found': {
        he: '❌ לא מצאתי קבוצה בשם הזה.\n\nוודא ש:\n1. הוספת אותי לקבוצה\n2. כתבת את שם הקבוצה בדיוק\n\nנסה שוב — שלח את שם הקבוצה:',
        en: '❌ I couldn\'t find a group with that name.\n\nMake sure that:\n1. You\'ve added me to the group\n2. The group name is exactly as written in WhatsApp\n\nTry again — send the group name:'
    },
    'group_found_confirm': {
        he: '✅ מצאתי קבוצה!\n\n📌 *שם:* {{name}}\n👥 *משתתפים:* {{count}}\n\nזו הקבוצה הנכונה?\n\n1️⃣ כן ✅\n2️⃣ לא, חפש שוב ❌',
        en: '✅ Found a group!\n\n📌 *Name:* {{name}}\n👥 *Participants:* {{count}}\n\nIs this the right group?\n\n1️⃣ Yes ✅\n2️⃣ No, search again ❌'
    },
    'group_not_admin': {
        he: '⚠️ אני לא מנהל בקבוצה הזו!\n\nכדי שאוכל לאכוף חוקים, אני חייב להיות *מנהל* בקבוצה.\nמנה אותי כמנהל ושלח *"בדוק"* כשמוכן.',
        en: '⚠️ I\'m not an admin in this group!\n\nTo enforce rules, I must be an *admin* in the group.\nMake me admin and send *"check"* when ready.'
    },
    'group_admin_confirmed': {
        he: '✅ מעולה! אני מנהל בקבוצה. נמשיך להגדרת החוקים.',
        en: '✅ Great! I\'m an admin in the group. Let\'s set up the rules.'
    },

    // ── Rules Setup ──────────────────────────────────────────────────────
    'ask_rules_type': {
        he: '📏 *שלב 2: הגדרת חוקים*\n\nאיזה סוג חוקי תוכן תרצה?\n\n1️⃣ *הודעות מותרות בלבד* — רק הודעות ספציפיות מותרות\n2️⃣ *הודעות אסורות* — הודעות ספציפיות אסורות, השאר מותר\n3️⃣ *ללא חוקי תוכן* — ללא הגבלת תוכן',
        en: '📏 *Step 2: Set Rules*\n\nWhat type of content rules do you want?\n\n1️⃣ *Allowed messages only* — only specific messages allowed\n2️⃣ *Forbidden messages* — specific messages blocked, rest allowed\n3️⃣ *No content rules* — no content restrictions'
    },
    'ask_allowed_messages': {
        he: '✍️ שלח לי את ההודעות *המותרות*.\nשלח כל הודעה בשורה נפרדת.\n\nלדוגמה:\nשבת שלום\nבוקר טוב',
        en: '✍️ Send me the *allowed* messages.\nSend each message on a separate line.\n\nExample:\nShabbat Shalom\nGood morning'
    },
    'ask_forbidden_messages': {
        he: '✍️ שלח לי את ההודעות *האסורות*.\nשלח כל הודעה בשורה נפרדת.\n\nלדוגמה:\nפרסומת\nספאם',
        en: '✍️ Send me the *forbidden* messages.\nSend each message on a separate line.\n\nExample:\nad\nspam'
    },
    'rules_content_saved': {
        he: '✅ נשמר! {{count}} הודעות הוגדרו.',
        en: '✅ Saved! {{count}} messages configured.'
    },
    'ask_time_window': {
        he: '⏰ *שלב 3: חלון זמנים*\n\nלהגביל שליחת הודעות לזמנים מסוימים?\n\n1️⃣ כן ✅\n2️⃣ לא ❌',
        en: '⏰ *Step 3: Time Window*\n\nRestrict messages to specific times?\n\n1️⃣ Yes ✅\n2️⃣ No ❌'
    },
    'ask_time_day': {
        he: '📅 באיזה יום? (שלח מספר)\n\n0️⃣ ראשון\n1️⃣ שני\n2️⃣ שלישי\n3️⃣ רביעי\n4️⃣ חמישי\n5️⃣ שישי\n6️⃣ שבת\n7️⃣ כל יום',
        en: '📅 Which day? (send number)\n\n0️⃣ Sunday\n1️⃣ Monday\n2️⃣ Tuesday\n3️⃣ Wednesday\n4️⃣ Thursday\n5️⃣ Friday\n6️⃣ Saturday\n7️⃣ Every day'
    },
    'ask_time_start': {
        he: '🕐 שעת התחלה? (0-23)\nלדוגמה: 6',
        en: '🕐 Start hour? (0-23)\nExample: 6'
    },
    'ask_time_end': {
        he: '🕐 שעת סיום? (0-23)\nלדוגמה: 23',
        en: '🕐 End hour? (0-23)\nExample: 23'
    },
    'time_window_saved': {
        he: '✅ חלון זמנים נשמר: יום {{day}}, {{start}}:00 - {{end}}:00',
        en: '✅ Time window saved: {{day}}, {{start}}:00 - {{end}}:00'
    },

    // ── Anti-Spam ────────────────────────────────────────────────────────
    'ask_antispam': {
        he: '🔁 *שלב 4: אנטי-ספאם*\n\nלהפעיל הגנה מפני ספאם?\n\n1️⃣ כן ✅\n2️⃣ לא ❌',
        en: '🔁 *Step 4: Anti-Spam*\n\nEnable spam protection?\n\n1️⃣ Yes ✅\n2️⃣ No ❌'
    },
    'ask_spam_max': {
        he: '📊 כמה הודעות מקסימום בחלון זמן?\nלדוגמה: 5',
        en: '📊 Maximum messages in time window?\nExample: 5'
    },
    'ask_spam_window': {
        he: '⏱️ חלון זמן בשניות?\nלדוגמה: 10',
        en: '⏱️ Time window in seconds?\nExample: 10'
    },
    'antispam_saved': {
        he: '✅ אנטי-ספאם: מקסימום {{max}} הודעות ב-{{window}} שניות',
        en: '✅ Anti-spam: max {{max}} messages in {{window}} seconds'
    },

    // ── Enforcement ──────────────────────────────────────────────────────
    'ask_enforcement': {
        he: '⚖️ *שלב 5: שלבי אכיפה*\n\nבחר אילו שלבים הבוט יבצע בהפרה.\n*הסדר קבוע* — בחר אילו להפעיל:\n\n{{steps}}\n\nשלח את המספרים שברצונך להפעיל, מופרדים בפסיקים.\nלדוגמה: 1,2,3,5',
        en: '⚖️ *Step 5: Enforcement Steps*\n\nChoose which steps the bot takes on violation.\n*Fixed order* — choose which to enable:\n\n{{steps}}\n\nSend the numbers you want to enable, separated by commas.\nExample: 1,2,3,5'
    },
    'enforcement_step_1': {
        he: '1️⃣ מחיקת ההודעה המפרה',
        en: '1️⃣ Delete the violating message'
    },
    'enforcement_step_2': {
        he: '2️⃣ הודעה פרטית (אזהרה)',
        en: '2️⃣ Private message (warning)'
    },
    'enforcement_step_3': {
        he: '3️⃣ הסרה מהקבוצה',
        en: '3️⃣ Remove from group'
    },
    'enforcement_step_4': {
        he: '4️⃣ חסימת המשתמש',
        en: '4️⃣ Block the user'
    },
    'enforcement_step_5': {
        he: '5️⃣ שליחת דיווח',
        en: '5️⃣ Send report'
    },
    'enforcement_saved': {
        he: '✅ שלבי אכיפה נשמרו.',
        en: '✅ Enforcement steps saved.'
    },

    // ── Warnings ─────────────────────────────────────────────────────────
    'ask_warnings': {
        he: '⚠️ *שלב 6: אזהרות*\n\nכמה אזהרות לפני אכיפה מלאה?\n(0 = אכיפה מיידית, ללא אזהרות)\n\nשלח מספר:',
        en: '⚠️ *Step 6: Warnings*\n\nHow many warnings before full enforcement?\n(0 = immediate enforcement, no warnings)\n\nSend a number:'
    },
    'warnings_saved': {
        he: '✅ מספר אזהרות: {{count}}',
        en: '✅ Warning count: {{count}}'
    },

    // ── Exempt Users ─────────────────────────────────────────────────────
    'ask_exempt': {
        he: '🛡️ *שלב 7: משתמשים חסינים*\n\nשלח מספרי טלפון של משתמשים שלא ייאכפו עליהם חוקים.\nמספר אחד בכל שורה, בפורמט ישראלי.\n\nלדוגמה:\n052-123-4567\n054-987-6543\n\nאו שלח *"דלג"* לדלג.',
        en: '🛡️ *Step 7: Exempt Users*\n\nSend phone numbers of users exempt from rules.\nOne number per line, in Israeli format.\n\nExample:\n052-123-4567\n054-987-6543\n\nOr send *"skip"* to skip.'
    },
    'exempt_saved': {
        he: '✅ {{count}} משתמשים חסינים נשמרו.',
        en: '✅ {{count}} exempt users saved.'
    },
    'exempt_skipped': {
        he: '✅ אין משתמשים חסינים.',
        en: '✅ No exempt users.'
    },

    // ── Report Target ────────────────────────────────────────────────────
    'ask_report_target': {
        he: '📨 *שלב 8: יעד דיווח*\n\nלאן לשלוח דיווחי הפרות?\n\n1️⃣ אליי בפרטי\n2️⃣ לטלפון אחר\n3️⃣ לקבוצת הנהלה',
        en: '📨 *Step 8: Report Target*\n\nWhere should violation reports be sent?\n\n1️⃣ To me (DM)\n2️⃣ To another phone\n3️⃣ To a management group'
    },
    'ask_report_phone': {
        he: '📱 שלח את מספר הטלפון לדיווח:',
        en: '📱 Send the phone number for reports:'
    },
    'ask_mgmt_group_name': {
        he: '👥 שלח את שם קבוצת ההנהלה (הוסף אותי לקבוצה קודם):',
        en: '👥 Send the management group name (add me to the group first):'
    },
    'mgmt_group_confirm': {
        he: '✅ מצאתי קבוצת הנהלה!\n\n📌 *שם:* {{name}}\n👥 *משתתפים:* {{count}}\n\nזו הקבוצה הנכונה?\n\n1️⃣ כן ✅\n2️⃣ לא, חפש שוב ❌',
        en: '✅ Found management group!\n\n📌 *Name:* {{name}}\n👥 *Participants:* {{count}}\n\nIs this the right group?\n\n1️⃣ Yes ✅\n2️⃣ No, search again ❌'
    },
    'report_saved': {
        he: '✅ יעד דיווח נשמר.',
        en: '✅ Report target saved.'
    },

    // ── Summary & Completion ─────────────────────────────────────────────
    'setup_summary': {
        he: '📋 *סיכום הגדרות GroupShield*\n\n🏷️ *קבוצה:* {{groupName}}\n📏 *חוקי תוכן:* {{rulesType}}\n⏰ *חלון זמנים:* {{timeWindow}}\n🔁 *אנטי-ספאם:* {{antiSpam}}\n⚖️ *שלבי אכיפה:* {{enforcement}}\n⚠️ *אזהרות:* {{warnings}}\n🛡️ *חסינים:* {{exempt}}\n📨 *דיווח:* {{report}}\n\nלאשר ולהפעיל?\n\n1️⃣ אשר ✅\n2️⃣ התחל מחדש 🔄',
        en: '📋 *GroupShield Configuration Summary*\n\n🏷️ *Group:* {{groupName}}\n📏 *Content rules:* {{rulesType}}\n⏰ *Time window:* {{timeWindow}}\n🔁 *Anti-spam:* {{antiSpam}}\n⚖️ *Enforcement:* {{enforcement}}\n⚠️ *Warnings:* {{warnings}}\n🛡️ *Exempt:* {{exempt}}\n📨 *Reports:* {{report}}\n\nConfirm and activate?\n\n1️⃣ Confirm ✅\n2️⃣ Start over 🔄'
    },
    'setup_complete': {
        he: '🛡️✅ *GroupShield פעיל!*\n\nהבוט מאכוף כעת את החוקים בקבוצה *{{groupName}}*.\n\nשלח *"עזרה"* לרשימת פקודות.',
        en: '🛡️✅ *GroupShield Active!*\n\nThe bot is now enforcing rules in *{{groupName}}*.\n\nSend *"help"* for a list of commands.'
    },

    // ── Enforcement Messages ─────────────────────────────────────────────
    'violation_warning': {
        he: '⚠️ *אזהרה ({{current}}/{{max}})*\n\nהודעתך בקבוצה *{{groupName}}* הפרה את החוקים.\n📝 *סיבה:* {{reason}}\n\nנותרו לך {{remaining}} אזהרות לפני אכיפה.',
        en: '⚠️ *Warning ({{current}}/{{max}})*\n\nYour message in *{{groupName}}* violated the rules.\n📝 *Reason:* {{reason}}\n\nYou have {{remaining}} warnings remaining.'
    },
    'violation_removed': {
        he: '🚫 *הוסרת מהקבוצה "{{groupName}}"*\n\n📝 *סיבה:* {{reason}}\n📅 *זמן:* {{time}}',
        en: '🚫 *You were removed from "{{groupName}}"*\n\n📝 *Reason:* {{reason}}\n📅 *Time:* {{time}}'
    },
    'violation_report': {
        he: '🛡️ *דו"ח GroupShield*\n\n👤 *שם:* {{pushname}}\n📱 *מספר:* {{number}}\n📝 *סיבה:* {{reason}}\n📝 *תוכן:* "{{content}}"\n📩 *הודעה פרטית:* {{privateStatus}}\n🚫 *הסרה:* {{removeStatus}}\n🔒 *חסימה:* {{blockStatus}}\n🕒 *זמן:* {{time}}',
        en: '🛡️ *GroupShield Report*\n\n👤 *Name:* {{pushname}}\n📱 *Number:* {{number}}\n📝 *Reason:* {{reason}}\n📝 *Content:* "{{content}}"\n📩 *Private msg:* {{privateStatus}}\n🚫 *Removal:* {{removeStatus}}\n🔒 *Block:* {{blockStatus}}\n🕒 *Time:* {{time}}'
    },

    // ── Undo ─────────────────────────────────────────────────────────────
    'undo_success': {
        he: '✅ פעולת הענישה בוטלה עבור *{{number}}*.',
        en: '✅ Punishment undone for *{{number}}*.'
    },
    'undo_failed': {
        he: '❌ פעולת הביטול נכשלה: {{error}}',
        en: '❌ Undo failed: {{error}}'
    },
    'undo_not_report': {
        he: '❌ ניתן להגיב "בטל" רק לדו"ח הסרה של GroupShield.',
        en: '❌ You can only reply "undo" to a GroupShield removal report.'
    },

    // ── Commands ─────────────────────────────────────────────────────────
    'help': {
        he: '🛡️ *פקודות GroupShield*\n\n📊 *מידע:*\n• *עזרה* — תפריט זה\n• *סטטוס* — מצב הבוט והקבוצה\n\n🛡️ *חסינים:*\n• *הוסף חסין 05X-XXX-XXXX* — הוסף חסין\n• *הסר חסין 05X-XXX-XXXX* — הסר חסין\n• *רשימת חסינים* — הצג חסינים\n\n⚠️ *אזהרות:*\n• *אפס אזהרות 05X-XXX-XXXX* — אפס אזהרות\n\n⚙️ *מערכת:*\n• *הגדרות* — שנה הגדרות\n• *שפה* — החלף שפה\n• *ריסטארט* — אתחל בוט',
        en: '🛡️ *GroupShield Commands*\n\n📊 *Info:*\n• *help* — this menu\n• *status* — bot and group status\n\n🛡️ *Exemptions:*\n• *exempt add 05X-XXX-XXXX* — add exempt\n• *exempt remove 05X-XXX-XXXX* — remove exempt\n• *exempt list* — list exempt users\n\n⚠️ *Warnings:*\n• *warnings reset 05X-XXX-XXXX* — reset warnings\n\n⚙️ *System:*\n• *settings* — change settings\n• *language* — switch language\n• *restart* — restart bot'
    },
    'status_message': {
        he: '📊 *סטטוס GroupShield*\n🟢 פעיל\n🛡️ *קבוצה:* {{groupName}} ({{memberCount}} חברים)\n⚠️ *אזהרות פעילות:* {{activeWarnings}}\n⏱️ *זמן פעילות:* {{uptime}}\n💾 *זיכרון:* {{memory}}\n🕒 {{time}}',
        en: '📊 *GroupShield Status*\n🟢 Active\n🛡️ *Group:* {{groupName}} ({{memberCount}} members)\n⚠️ *Active warnings:* {{activeWarnings}}\n⏱️ *Uptime:* {{uptime}}\n💾 *Memory:* {{memory}}\n🕒 {{time}}'
    },

    // ── General ──────────────────────────────────────────────────────────
    'unknown_command': {
        he: '❓ לא הבנתי. שלח *"עזרה"* לרשימת פקודות.',
        en: '❓ I didn\'t understand. Send *"help"* for a list of commands.'
    },
    'error_generic': {
        he: '❌ שגיאה: {{error}}',
        en: '❌ Error: {{error}}'
    },
    'invalid_input': {
        he: '❌ קלט לא תקין. נסה שוב.',
        en: '❌ Invalid input. Please try again.'
    },
    'language_switched': {
        he: '✅ השפה הוחלפה לעברית.',
        en: '✅ Language switched to English.'
    },
    'restart_message': {
        he: '🔄 מאתחל...',
        en: '🔄 Restarting...'
    },

    // ── Violation reasons ────────────────────────────────────────────────
    'reason_forbidden_type': {
        he: 'סוג הודעה אסור ({{type}})',
        en: 'Forbidden message type ({{type}})'
    },
    'reason_invalid_content': {
        he: 'תוכן הודעה לא תקין',
        en: 'Invalid message content'
    },
    'reason_forbidden_content': {
        he: 'תוכן הודעה אסור',
        en: 'Forbidden message content'
    },
    'reason_time_violation': {
        he: 'חריגה מחלון הזמנים',
        en: 'Time window violation'
    },
    'reason_spam': {
        he: 'ספאם',
        en: 'Spam'
    },

    // ── Day names ────────────────────────────────────────────────────────
    'day_0': { he: 'ראשון', en: 'Sunday' },
    'day_1': { he: 'שני', en: 'Monday' },
    'day_2': { he: 'שלישי', en: 'Tuesday' },
    'day_3': { he: 'רביעי', en: 'Wednesday' },
    'day_4': { he: 'חמישי', en: 'Thursday' },
    'day_5': { he: 'שישי', en: 'Friday' },
    'day_6': { he: 'שבת', en: 'Saturday' },
    'day_7': { he: 'כל יום', en: 'Every day' },

    // ── Exempt commands ──────────────────────────────────────────────────
    'exempt_added': {
        he: '✅ {{number}} נוסף לרשימת החסינים.',
        en: '✅ {{number}} added to exempt list.'
    },
    'exempt_removed': {
        he: '✅ {{number}} הוסר מרשימת החסינים.',
        en: '✅ {{number}} removed from exempt list.'
    },
    'exempt_list_empty': {
        he: '📋 רשימת החסינים ריקה.',
        en: '📋 Exempt list is empty.'
    },
    'exempt_list_header': {
        he: '🛡️ *רשימת חסינים ({{count}})*\n',
        en: '🛡️ *Exempt Users ({{count}})*\n'
    },
    'warnings_reset': {
        he: '✅ האזהרות אופסו עבור {{number}}.',
        en: '✅ Warnings reset for {{number}}.'
    },
    'not_configured': {
        he: '❌ הבוט עדיין לא הוגדר. שלח הודעה כלשהי כדי להתחיל.',
        en: '❌ Bot not configured yet. Send any message to start setup.'
    },
    'no_group_linked': {
        he: '❌ אין קבוצה מקושרת. שלח *"הגדרות"* כדי להגדיר.',
        en: '❌ No group linked. Send *"settings"* to configure.'
    }
};

/**
 * Get translated string with parameter interpolation
 * @param {string} key - Translation key
 * @param {string} lang - 'he' or 'en'  
 * @param {object} params - Parameters to interpolate ({{key}} → value)
 */
function t(key, lang = 'he', params = {}) {
    const entry = strings[key];
    if (!entry) return `[Missing: ${key}]`;

    let text = entry[lang] || entry['he'] || `[Missing: ${key}.${lang}]`;

    for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
    }

    return text;
}

module.exports = { t, strings };
