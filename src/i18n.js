// src/i18n.js - Bilingual message system (Hebrew + English)

const strings = {
    // ── Setup Flow ────────────────────────────────────────────────────────
    'welcome': {
        he: `🛡️ *ברוכים הבאים ל-GroupShield!*\n\nאני בוט שעוזר לאכוף חוקים בקבוצות וואטסאפ.\nבואו נתחיל בהגדרת הקבוצה שלך.\n\nבחר שפה / Choose language:\n\n1️⃣ 🇮🇱 עברית\n2️⃣ 🇬🇧 English`,
        en: `🛡️ *Welcome to GroupShield!*\n\nI'm a bot that helps enforce rules in WhatsApp groups.\nLet's set up your group.\n\nChoose language / בחר שפה:\n\n1️⃣ 🇮🇱 עברית\n2️⃣ 🇬🇧 English`
    },
    'lang_set': {
        he: '✅ השפה הוגדרה לעברית.\n\n💡 *פקודות זמינות בכל עת:*\n• *איפוס* — מחק והתחל מהתחלה\n• *חזור* — חזור לשלב הקודם\n• *יציאה* — צא ממצב ההגדרה\n\nבואו נתחיל! 👇',
        en: '✅ Language set to English.\n\n💡 *Commands available anytime:*\n• *reset* — clear and start over\n• *back* — go to previous step\n• *exit* — leave setup mode\n\nLet\'s begin! 👇'
    },
    'ask_group_name': {
        he: '📋 *שלב 1: קישור קבוצה*\n\nיש שתי דרכים להוסיף אותי לקבוצה:\n\n*אפשרות א׳ — הוספה ידנית:*\nהוסף אותי לקבוצה ומנה אותי כ*מנהל*, ואז שלח את *שם הקבוצה*.\n\n*אפשרות ב׳ — לינק הצטרפות:*\nשלח לי לינק הצטרפות לקבוצה (chat.whatsapp.com/...) ואצטרף אוטומטית.\nחשוב: עדיין יש למנות אותי כמנהל לאחר ההצטרפות.\n\n✳️ תשובה לדוגמה:\nמשפחה\nאו: https://chat.whatsapp.com/ABC123',
        en: '📋 *Step 1: Link Group*\n\nThere are two ways to add me to a group:\n\n*Option A — Manual:*\nAdd me to the group and make me an *admin*, then send the *group name*.\n\n*Option B — Invite link:*\nSend me a group invite link (chat.whatsapp.com/...) and I\'ll join automatically.\nNote: you still need to make me admin after I join.\n\n✳️ Example reply:\nFamily\nOr: https://chat.whatsapp.com/ABC123'
    },
    'invite_link_joining': {
        he: '🔗 מצטרף לקבוצה דרך הלינק...',
        en: '🔗 Joining group via invite link...'
    },
    'invite_link_joined_not_admin': {
        he: '✅ הצטרפתי לקבוצה *{{name}}* ({{count}} משתתפים)!\n\nעכשיו אנא מנה אותי כ*מנהל* בקבוצה ושלח *"בדוק"* כשמוכן.',
        en: '✅ Joined *{{name}}* ({{count}} participants)!\n\nNow please make me an *admin* in the group and send *"check"* when ready.'
    },
    'invite_link_joined_admin': {
        he: '✅ הצטרפתי לקבוצה *{{name}}* ואני כבר מנהל!',
        en: '✅ Joined *{{name}}* and I\'m already an admin!'
    },
    'invite_link_failed': {
        he: '❌ לא הצלחתי להצטרף דרך הלינק.\nשגיאה: {{error}}\n\nנסה להוסיף אותי לקבוצה ידנית ושלח את שם הקבוצה.',
        en: '❌ Failed to join via invite link.\nError: {{error}}\n\nTry adding me to the group manually and send the group name.'
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
    'ask_group_verify_admin': {
        he: '🔐 *אימות קבוצה נוסף*\n\nכדי לוודא שזו הקבוצה הנכונה, שלח את *מספר המשתתפים* הנוכחי שאתה מצפה לראות בקבוצה.',
        en: '🔐 *Additional group verification*\n\nTo verify this is the correct group, send the *current participant count* you expect in the group.'
    },
    'group_already_managed': {
        he: '⛔ הקבוצה הזו כבר מנוהלת על-ידי משתמש אחר, ולכן אי אפשר להגדיר עליה אכיפה מחדש.',
        en: '⛔ This group is already managed by another user, so it cannot be configured again.'
    },
    'group_used_as_mgmt': {
        he: '⛔ הקבוצה הזו מוגדרת כבר כקבוצת הנהלה, ולכן לא יכולה להיות קבוצה נאכפת.',
        en: '⛔ This group is already used as a management group, so it cannot be an enforced group.'
    },
    'group_verify_admin_failed': {
        he: '❌ אימות נכשל: ציפית ל-{{expected}} משתתפים, אבל כרגע זוהו {{actual}}.',
        en: '❌ Verification failed: expected {{expected}} participants, but detected {{actual}}.'
    },
    'group_verify_admin_success': {
        he: '✅ אימות הקבוצה הושלם בהצלחה.',
        en: '✅ Group verification completed successfully.'
    },

    // ── Rules Setup ──────────────────────────────────────────────────────
    'ask_rules_type': {
        he: '📏 *שלב 2: הגדרת חוקים*\n\nאיזה סוג חוקי תוכן תרצה?\n\n1️⃣ *הודעות מותרות בלבד* — רק הודעות ספציפיות מותרות\n2️⃣ *הודעות אסורות* — הודעות ספציפיות אסורות, השאר מותר\n3️⃣ *ללא חוקי תוכן* — ללא הגבלת תוכן\n4️⃣ *חסימת קללות* — חסום קללות נפוצות בעברית אוטומטית',
        en: '📏 *Step 2: Set Rules*\n\nWhat type of content rules do you want?\n\n1️⃣ *Allowed messages only* — only specific messages allowed\n2️⃣ *Forbidden messages* — specific messages blocked, rest allowed\n3️⃣ *No content rules* — no content restrictions\n4️⃣ *Block curses* — automatically block common Hebrew profanity'
    },
    'curses_preset_selected': {
        he: '✅ חסימת קללות הופעלה.\nהבוט יחסום קללות נפוצות בעברית עם זיהוי חכם של עקיפות.',
        en: '✅ Curse blocking enabled.\nThe bot will block common Hebrew profanity using smart bypass detection.'
    },
    'ask_non_text_rule': {
        he: '🖼️ *חוק סוג הודעה*\n\nהאם לחסום הודעות שהן לא טקסט? (תמונה/וידאו/מסמך וכו׳)\n\n1️⃣ כן, לחסום\n2️⃣ לא, לאפשר (ברירת מחדל)',
        en: '🖼️ *Message type rule*\n\nDo you want to block non-text messages? (image/video/document etc.)\n\n1️⃣ Yes, block\n2️⃣ No, allow (default)'
    },
    'ask_non_text_types': {
        he: '🧩 אילו סוגי הודעות לא-טקסט לחסום?\n\n0️⃣ הכל (כל סוג לא-טקסט)\n1️⃣ תמונות\n2️⃣ וידאו\n3️⃣ סטיקרים\n4️⃣ מסמכים\n5️⃣ אודיו\n6️⃣ כל סוג לא-טקסט אחר (למשל מיקום, איש קשר, סקר ועוד)\n\nשלח מספר/ים מופרדים בפסיק.\n✳️ לדוגמה: 0 או 1,3',
        en: '🧩 Which non-text message types should be blocked?\n\n0️⃣ All (all non-text types)\n1️⃣ Images\n2️⃣ Video\n3️⃣ Stickers\n4️⃣ Documents\n5️⃣ Audio\n6️⃣ Any other non-text type (e.g., location, contact cards, polls, etc.)\n\nSend number(s) separated by commas.\n✳️ Example: 0 or 1,3'
    },
    'non_text_types_saved': {
        he: '✅ סוגי הודעות לא-טקסט לחסימה נשמרו: {{types}}',
        en: '✅ Blocked non-text message types saved: {{types}}'
    },
    'non_text_rule_saved': {
        he: '✅ חוק הודעות לא-טקסט: {{status}}',
        en: '✅ Non-text message rule: {{status}}'
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
    'ask_rules_match_mode': {
        he: '🧠 איך להתאים את הודעות הכלל?\n\n1️⃣ זהה בדיוק — ההודעה חייבת להיות בדיוק הטקסט שציינת\n2️⃣ מכיל ביטוי — מספיק שהטקסט שציינת מופיע בתוך ההודעה\n3️⃣ חכם 🧠 — עמיד לעקיפות: רווחים בין אותיות, תווים מיוחדים, הטיות דקדוקיות ושגיאות כתיב\n\n✳️ לדוגמה: אם המילה "קללה" אסורה במצב חכם — גם "ק ל ל ה", "ק.ל.ל.ה", "הקללה" ו-"קלללה" יחשבו הפרה.',
        en: '🧠 How should message matching work for this rule?\n\n1️⃣ Exact match — message must exactly equal your configured text\n2️⃣ Contains phrase — configured text can appear inside a larger message\n3️⃣ Smart 🧠 — bypass-resistant: handles spaces between letters, special characters, inflections and typos\n\n✳️ Example: if "curse" is forbidden in smart mode, then "c u r s e", "c.u.r.s.e" and "cursee" also count as violations.'
    },
    'rules_match_mode_saved': {
        he: '✅ מצב התאמת הודעות נשמר: {{mode}}',
        en: '✅ Message match mode saved: {{mode}}'
    },
    'ask_time_window': {
        he: '⏰ *שלב 3: חלון זמנים*\n\nלהגביל שליחת הודעות לזמנים מסוימים?\n\n1️⃣ כן ✅\n2️⃣ לא ❌',
        en: '⏰ *Step 3: Time Window*\n\nRestrict messages to specific times?\n\n1️⃣ Yes ✅\n2️⃣ No ❌'
    },
    'ask_time_day': {
        he: '📅 באיזה יום? (שלח מספר)\n\n1️⃣ ראשון\n2️⃣ שני\n3️⃣ שלישי\n4️⃣ רביעי\n5️⃣ חמישי\n6️⃣ שישי\n7️⃣ שבת\n0️⃣ כל יום',
        en: '📅 Which day? (send number)\n\n1️⃣ Sunday\n2️⃣ Monday\n3️⃣ Tuesday\n4️⃣ Wednesday\n5️⃣ Thursday\n6️⃣ Friday\n7️⃣ Saturday\n0️⃣ Every day'
    },
    'ask_time_start': {
        he: '🕐 שעת התחלה?\nאפשר לשלוח שעה בלבד או שעה:דקות\nאו שלח *"כל היום"* לבחור 00:00–23:59\n\n✳️ תשובות מוצעות:\n06:00\n22:30\nכל היום',
        en: '🕐 Start time?\nYou can send hour only or hour:minute\nOr send *"all day"* for 00:00–23:59\n\n✳️ Suggested replies:\n06:00\n22:30\nall day'
    },
    'ask_time_end': {
        he: '🕐 שעת סיום?\nאפשר לשלוח שעה בלבד או שעה:דקות\n\n✳️ תשובות מוצעות:\n23:00\n06:15\n23',
        en: '🕐 End time?\nYou can send hour only or hour:minute\n\n✳️ Suggested replies:\n23:00\n06:15\n23'
    },
    'time_window_saved': {
        he: '✅ חלון זמנים נשמר: יום {{day}}, {{start}} - {{end}}',
        en: '✅ Time window saved: {{day}}, {{start}} - {{end}}'
    },
    'time_range_added': {
        he: '✅ טווח זמן נוסף: יום {{day}}, {{start}} - {{end}}',
        en: '✅ Time range added: {{day}}, {{start}} - {{end}}'
    },
    'ask_time_more': {
        he: '➕ להוסיף עוד טווח זמן?\n\n1️⃣ כן\n2️⃣ לא, המשך',
        en: '➕ Add another time range?\n\n1️⃣ Yes\n2️⃣ No, continue'
    },
    'ask_time_window_mode': {
        he: '⏰ *סוג חלון הזמן*\n\nבחר סוג חלון הזמן:\n\n1️⃣ ✅ זמן מותר — הודעות מותרות רק בזמן זה\n2️⃣ 🚫 זמן חסום — הודעות חסומות בזמן זה בלבד',
        en: '⏰ *Time Window Type*\n\nChoose time window type:\n\n1️⃣ ✅ Allowed window — messages allowed only during this time\n2️⃣ 🚫 Blocked window — messages blocked only during this time'
    },
    'time_window_mode_saved': {
        he: '✅ סוג חלון הזמן: {{mode}}',
        en: '✅ Time window type: {{mode}}'
    },

    // ── Anti-Spam ────────────────────────────────────────────────────────
    'ask_antispam': {
        he: '🔁 *שלב 4: אנטי-ספאם*\n\nהאנטי-ספאם עובד כך:\n• מגדירים *מקסימום הודעות* בתוך *חלון זמן בשניות*\n• בהגעה למקסימום — התראה ⚠️\n• הודעה נוספת מעבר למקסימום — הפרה ואכיפה לפי השלבים שהגדרת\n\nלדוגמה: 5 הודעות ב-10 שניות → ההודעה ה-6 תיחשב ספאם.\n\nלהפעיל?\n1️⃣ כן ✅\n2️⃣ לא ❌',
        en: '🔁 *Step 4: Anti-Spam*\n\nAnti-spam works like this:\n• Set *max messages* within a *time window (seconds)*\n• Reaching max → warning ⚠️\n• Next message above max → violation and enforcement (based on your configured steps)\n\nExample: 5 messages in 10 seconds → 6th message is spam.\n\nEnable it?\n1️⃣ Yes ✅\n2️⃣ No ❌'
    },
    'ask_spam_max': {
        he: '📊 כמה הודעות מקסימום בחלון זמן?\n\n✳️ תשובות מוצעות:\n3\n5\n10',
        en: '📊 Maximum messages in time window?\n\n✳️ Suggested replies:\n3\n5\n10'
    },
    'ask_spam_window': {
        he: '⏱️ חלון זמן בשניות?\n\n✳️ תשובות מוצעות:\n10\n20\n30',
        en: '⏱️ Time window in seconds?\n\n✳️ Suggested replies:\n10\n20\n30'
    },
    'antispam_saved': {
        he: '✅ אנטי-ספאם: מקסימום {{max}} הודעות ב-{{window}} שניות',
        en: '✅ Anti-spam: max {{max}} messages in {{window}} seconds'
    },

    // ── Enforcement ──────────────────────────────────────────────────────
    'ask_enforcement': {
        he: '⚖️ *שלב 6: שלבי אכיפה*\n\nבחר אילו שלבים הבוט יבצע בהפרה.\n*הסדר קבוע* — בחר אילו להפעיל:\n\n{{steps}}\n\nשלח את המספרים שברצונך להפעיל, מופרדים בפסיקים.\nלדוגמה: 1,2,3,4',
        en: '⚖️ *Step 6: Enforcement Steps*\n\nChoose which steps the bot takes on violation.\n*Fixed order* — choose which to enable:\n\n{{steps}}\n\nSend the numbers you want to enable, separated by commas.\nExample: 1,2,3,4'
    },
    'enforcement_step_1': {
        he: '1️⃣ מחיקת ההודעה — ההודעה תימחק מהקבוצה',
        en: '1️⃣ Delete message — the message will be removed from the group'
    },
    'enforcement_step_2': {
        he: '2️⃣ הודעת הסרה בפרטי — המשתמש יקבל הודעה פרטית בעת הסרה',
        en: '2️⃣ Removal notice (DM) — user receives a private message upon removal'
    },
    'enforcement_step_2_warning': {
        he: '2️⃣ הודעת הסרה בפרטי — המשתמש יקבל הודעה פרטית בעת הסרה',
        en: '2️⃣ Removal notice (DM) — user receives a private message upon removal'
    },
    'enforcement_step_2_notice': {
        he: '2️⃣ הודעת הסרה בפרטי — המשתמש יקבל הודעה פרטית בעת הסרה',
        en: '2️⃣ Removal notice (DM) — user receives a private message upon removal'
    },
    'enforcement_step_3': {
        he: '3️⃣ הסרה מהקבוצה — המשתמש יוצא מהקבוצה',
        en: '3️⃣ Remove from group — user is removed from the group'
    },
    'enforcement_step_4': {
        he: '4️⃣ שליחת דיווח — נשלח דו״ח ליעד הדיווח שהוגדר',
        en: '4️⃣ Send report — sends enforcement report to configured report target'
    },
    'enforcement_saved': {
        he: '✅ שלבי אכיפה נשמרו.',
        en: '✅ Enforcement steps saved.'
    },

    // ── Warnings ─────────────────────────────────────────────────────────
    'ask_warnings': {
        he: '⚠️ *שלב 5: אזהרות*\n\nכמה אזהרות לפני אכיפה מלאה?\n(0 = אכיפה מיידית, ללא אזהרות)\n\n✳️ תשובות מוצעות:\n0\n3\n5',
        en: '⚠️ *Step 5: Warnings*\n\nHow many warnings before full enforcement?\n(0 = immediate enforcement, no warnings)\n\n✳️ Suggested replies:\n0\n3\n5'
    },
    'warnings_saved': {
        he: '✅ מספר אזהרות: {{count}}',
        en: '✅ Warning count: {{count}}'
    },
    'ask_warn_private_dm': {
        he: '💬 *הודעה פרטית בעת אזהרה*\n\nהאם לשלוח למשתמש הודעה פרטית בכל פעם שהוא מקבל אזהרה (לפני הסרה)?\n\n1️⃣ כן — שלח אזהרה פרטית\n2️⃣ לא — אל תשלח',
        en: '💬 *Private message per warning*\n\nShould the user receive a private DM each time they receive a warning (before removal)?\n\n1️⃣ Yes — send private warning\n2️⃣ No — don\'t send'
    },
    'warn_private_dm_saved': {
        he: '✅ הודעה פרטית בעת אזהרה: {{status}}',
        en: '✅ Private warning DM: {{status}}'
    },

    // ── Exempt Users ─────────────────────────────────────────────────────
    'ask_exempt': {
        he: '🛡️ *שלב 7: משתמשים חסינים*\n\n💡 *שים לב:* מנהלי הקבוצה חסינים אוטומטית — אין צורך להוסיף אותם.\n\nשלח מספרי טלפון של משתמשים נוספים שלא ייאכפו עליהם חוקים.\nמספר אחד בכל שורה, בפורמט בינלאומי או מקומי.\n\nלדוגמה:\n+1 202-555-0187\n+972-52-123-4567\n\nאו שלח *"דלג"* לדלג.',
        en: '🛡️ *Step 7: Exempt Users*\n\nSend phone numbers of users exempt from rules.\nOne number per line, in international or local format.\n\nExample:\n+1 202-555-0187\n+972-52-123-4567\n\nOr send *"skip"* to skip.'
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
        he: '📱 שלח את מספר הטלפון לדיווח:\n\n✳️ תשובות מוצעות:\n+1 202-555-0187\n+972521234567',
        en: '📱 Send the phone number for reports:\n\n✳️ Suggested replies:\n+1 202-555-0187\n+972521234567'
    },
    'ask_mgmt_group_name': {
        he: '👥 *קבוצת הנהלה*\n\nיש שתי דרכים:\n\n*אפשרות א׳ — הוספה ידנית:*\nהוסף אותי לקבוצת ההנהלה ושלח את *שמה*.\n\n*אפשרות ב׳ — לינק הצטרפות:*\nשלח לינק הצטרפות (chat.whatsapp.com/...) ואצטרף אוטומטית.\n\n✳️ דוגמה:\nהנהלה\nאו: https://chat.whatsapp.com/ABC123',
        en: '👥 *Management Group*\n\nTwo options:\n\n*Option A — Manual:*\nAdd me to the management group and send its *name*.\n\n*Option B — Invite link:*\nSend an invite link (chat.whatsapp.com/...) and I\'ll join automatically.\n\n✳️ Example:\nManagement\nOr: https://chat.whatsapp.com/ABC123'
    },
    'mgmt_group_confirm': {
        he: '✅ מצאתי קבוצת הנהלה!\n\n📌 *שם:* {{name}}\n👥 *משתתפים:* {{count}}\n\nזו הקבוצה הנכונה?\n\n1️⃣ כן ✅\n2️⃣ לא, חפש שוב ❌',
        en: '✅ Found management group!\n\n📌 *Name:* {{name}}\n👥 *Participants:* {{count}}\n\nIs this the right group?\n\n1️⃣ Yes ✅\n2️⃣ No, search again ❌'
    },
    'mgmt_group_cannot_be_enforced': {
        he: '⛔ קבוצת הנהלה לא יכולה להיות קבוצה נאכפת (ולהפך). בחר קבוצה אחרת.',
        en: '⛔ A management group cannot be an enforced group (and vice versa). Please choose another group.'
    },
    'ask_mgmt_group_verify_count': {
        he: '🔍 אימות נוסף לקבוצת הנהלה: שלח את מספר המשתתפים שאתה מצפה לראות בקבוצה.',
        en: '🔍 Additional management-group verification: send the participant count you expect in that group.'
    },
    'mgmt_group_verify_count_failed': {
        he: '❌ אימות נכשל: ציפית ל-{{expected}} משתתפים, אבל כרגע זוהו {{actual}}. נסה שוב.',
        en: '❌ Verification failed: expected {{expected}} participants, but detected {{actual}}. Please try again.'
    },
    'mgmt_group_verify_count_success': {
        he: '✅ אימות קבוצת הנהלה הושלם בהצלחה.',
        en: '✅ Management group verification completed successfully.'
    },
    'report_saved': {
        he: '✅ יעד דיווח נשמר.',
        en: '✅ Report target saved.'
    },

    // ── Welcome Message (Onboarding) ─────────────────────────────────────
    'ask_welcome_msg': {
        he: '👋 *שלב 9: קבלת פנים (Welcome Message)*\n\nהאם תרצה שהבוט ישלח הודעת קבלת פנים לכל משתמש חדש שמצטרף?\nההודעה תכיל את חוקי הקבוצה (כפי שהגדרת) והוראה לאשר אותם.\n⚠️ משתמש שלא יאשר לא יוכל לכתוב בקבוצה (ויורחק בהודעה הראשונה, או לאחר 24 שעות).\n\n1️⃣ כן, שלח הודעת קבלת פנים ודרוש אישור ✅\n2️⃣ לא, בלי הודעת קבלת פנים ❌',
        en: '👋 *Step 9: Welcome Message*\n\nDo you want the bot to send a welcome message to new users joining the group?\nThe message will include the rules and require them to agree.\n⚠️ Unapproved users cannot message the group (removed on first message, or after 24h).\n\n1️⃣ Yes, send welcome message & require agreement ✅\n2️⃣ No, don\'t send welcome message ❌'
    },
    'welcome_msg_saved': {
        he: '✅ הגדרות קבלת פנים נשמרו.',
        en: '✅ Welcome message settings saved.'
    },

    // ── Bot Demotion / Removal ───────────────────────────────────────────
    'bot_demoted': {
        he: 'משתמש כלשהו הסיר ממני את הרשאת הניהול',
        en: 'Someone removed my admin privileges'
    },
    'bot_removed': {
        he: 'הוסרתי או יצאתי מהקבוצה',
        en: 'I was removed or left the group'
    },
    'bot_action_required': {
        he: '⚠️ *הפסקה באכיפה - דרושה פעולה*\n\nזיהיתי ש{{reason}} בקבוצה *{{groupName}}*.\nהאכיפה לקבוצה זו הושהתה כעת.\n\nבחר כיצד תרצה להמשיך (השב במספר):\n\n1️⃣ *חזרה לאכוף* - אדריך אותך כיצד להחזיר אותי\n2️⃣ *הפסקת אכיפה לגמרי* - מחיקת כל הנתונים של הקבוצה ממסד הנתונים',
        en: '⚠️ *Enforcement Paused - Action Required*\n\nI noticed that {{reason}} in the group *{{groupName}}*.\nEnforcement for this group is currently paused.\n\nPlease choose how to proceed (reply with number):\n\n1️⃣ *Resume* - I will guide you on how to bring me back\n2️⃣ *Stop completely* - delete all group data from my database'
    },
    'bot_action_resume_guide': {
        he: '🔄 *החזרה לפעילות*\n\nכדי לחזור לאכוף, אנא בצע את הפעולה הנדרשת (החזר אותי לקבוצה או מנה אותי חזרה למנהל).\n\nלאחר מכן, השב להודעה זו במילה *"בוצע"*.',
        en: '🔄 *Resuming Enforcement*\n\nTo resume enforcement, please perform the required action (add me back to the group or make me admin again).\n\nAfterward, reply to this message with *"done"*.'
    },
    'action_paused': {
        he: '⏸️ הפעילות עבור הקבוצה *{{groupName}}* הושהתה למשך *{{duration}}* שעות (עד {{time}}). לא יתבצעו הרחקות או מחיקות בזמן זה.',
        en: '⏸️ Enforcement for *{{groupName}}* paused for *{{duration}}* hours (until {{time}}). No actions will be taken.'
    },
    'action_resumed': {
        he: '▶️ אכיפת חוקים עבור הקבוצה *{{groupName}}* חזרה לפעילות כרגיל.',
        en: '▶️ Enforcement for *{{groupName}}* has resumed.'
    },
    'enforcement_not_paused': {
        he: 'ℹ️ אכיפת החוקים כבר פעילה ולא מושהית.',
        en: 'ℹ️ Enforcement is already active and not paused.'
    },
    'invalid_pause_duration': {
        he: '❌ לא הוגדר זמן נכון. אנא שלח השהיה בצירוף מספר שעות. לדוגמה: `pause 24`',
        en: '❌ Invalid duration. Please provide hours. Example: `pause 24`'
    },

    // ── Summary & Completion ─────────────────────────────────────────────
    'setup_summary': {
        he: '📋 *סיכום הגדרות GroupShield*\n\n🏷️ *קבוצה:* {{groupName}}\n📏 *חוקי תוכן:* {{rulesType}}\n🧠 *התאמת תוכן:* {{rulesMode}}\n🖼️ *הודעות לא-טקסט:* {{nonTextRule}}\n⏰ *חלון זמנים:* {{timeWindow}}\n🔁 *אנטי-ספאם:* {{antiSpam}}\n⚖️ *שלבי אכיפה:*\n{{enforcement}}\n⚠️ *אזהרות:* {{warnings}}\n🛡️ *חסינים:* {{exempt}}\n📨 *דיווח:* {{report}}\n👋 *הודעת קבלת פנים:* {{welcome}}\n\nלאשר ולהפעיל?\n\n1️⃣ אשר ✅\n2️⃣ התחל מחדש 🔄',
        en: '📋 *GroupShield Configuration Summary*\n\n🏷️ *Group:* {{groupName}}\n📏 *Content rules:* {{rulesType}}\n🧠 *Match mode:* {{rulesMode}}\n🖼️ *Non-text messages:* {{nonTextRule}}\n⏰ *Time window:* {{timeWindow}}\n🔁 *Anti-spam:* {{antiSpam}}\n⚖️ *Enforcement:* {{enforcement}}\n⚠️ *Warnings:* {{warnings}}\n🛡️ *Exempt:* {{exempt}}\n📨 *Reports:* {{report}}\n👋 *Welcome Message:* {{welcome}}\n\nConfirm and activate?\n\n1️⃣ Confirm ✅\n2️⃣ Start over 🔄'
    },
    'setup_complete': {
        he: '🛡️✅ *GroupShield פעיל!*\n\nהבוט אוכף כעת את החוקים בקבוצה *{{groupName}}*.\n\nשלח *"עזרה"* לרשימת פקודות.',
        en: '🛡️✅ *GroupShield Active!*\n\nThe bot is now enforcing rules in *{{groupName}}*.\n\nSend *"help"* for a list of commands.'
    },

    // ── Enforcement Messages ─────────────────────────────────────────────
    'violation_warning': {
        he: '⚠️ *אזהרה ({{current}}/{{max}})*\n\nהודעתך בקבוצה *{{groupName}}* הפרה את החוקים.\n📝 *סיבה:* {{reason}}\n💬 *הודעה:* {{content}}\n\nנותרו לך {{remaining}} אזהרות לפני נקיטת הליכי ענישה.',
        en: '⚠️ *Warning ({{current}}/{{max}})*\n\nYour message in *{{groupName}}* violated the rules.\n📝 *Reason:* {{reason}}\n💬 *Message:* {{content}}\n\nYou have {{remaining}} warnings remaining.'
    },
    'violation_removed': {
        he: '🚫 *הוסרת מהקבוצה "{{groupName}}"*\n\n📝 *סיבה:* {{reason}}\n💬 *הודעה:* {{content}}\n📅 *זמן:* {{time}}',
        en: '🚫 *You were removed from "{{groupName}}"*\n\n📝 *Reason:* {{reason}}\n💬 *Message:* {{content}}\n📅 *Time:* {{time}}'
    },
    'violation_report': {
        he: '🛡️ *דו"ח GroupShield*\n\n🏷️ *קבוצה:* {{groupName}}\n🆔 *מזהה:* {{violationId}}\n🧾 *מזהה קבוצה:* {{groupId}}\n👤 *שם:* {{pushname}}\n📱 *מספר:* {{number}}\n📝 *סיבה:* {{reason}}\n📝 *תוכן:* "{{content}}"\n📩 *הודעה פרטית:* {{privateStatus}}\n🚫 *הסרה:* {{removeStatus}}\n🕒 *זמן:* {{time}}',
        en: '🛡️ *GroupShield Report*\n\n🏷️ *Group:* {{groupName}}\n🆔 *ID:* {{violationId}}\n🧾 *Group ID:* {{groupId}}\n👤 *Name:* {{pushname}}\n📱 *Number:* {{number}}\n📝 *Reason:* {{reason}}\n📝 *Content:* "{{content}}"\n📩 *Private msg:* {{privateStatus}}\n🚫 *Removal:* {{removeStatus}}\n🕒 *Time:* {{time}}'
    },

    // ── Welcome Flow & Rules Summary ─────────────────────────────────────
    'welcome_dm': {
        he: '👋 *ברוך הבא לקבוצה {{groupName}}!*\n\nרגע לפני שמתחילים לשלוח הודעות, הנה כללי הקבוצה בקצרה כדי לשמור על סביבה נעימה לכולם:\n\n{{rulesSummary}}\n\n⚠️ חובה לאשר את החוקים כדי להיות חלק מהקבוצה.\nאם לא תאשר ותשלח הודעה, ההודעה תימחק ותוסר מיידית.\n\nכדי להתחיל לשלוח הודעות בקבוצה, האם אתה מסכים לתקנון?\n\n1️⃣ מסכים ✅\n2️⃣ לא מסכים ❌',
        en: '👋 *Welcome to {{groupName}}!*\n\nJust before you start chatting, here are the group rules to keep this a great place:\n\n{{rulesSummary}}\n\n⚠️ You must agree to the rules to participate.\nIf you send a message without agreeing, it will be deleted and you will be removed immediately.\n\nDo you agree to the group rules?\n\n1️⃣ Agree ✅\n2️⃣ Disagree ❌'
    },
    'welcome_agreed': {
        he: '✅ מעולה! אישרת את תקנון הקבוצה *{{groupName}}* ואתה יכול להתחיל לשלוח הודעות.',
        en: '✅ Great! You agreed to the rules of *{{groupName}}* and can now send messages.'
    },
    'welcome_disagreed': {
        he: '❌ בחרת שלא להסכים לתקנון הקבוצה, ולכן תוסר ממנה כעת.',
        en: '❌ You chose not to agree to the group rules, so you will be removed now.'
    },
    'welcome_unapproved_message': {
        he: '⛔ אינך יכול לשלוח הודעות בקבוצה לפני שתאשר את התקנון (הודעתך בקבוצה הוסרה, ותוסר מהקבוצה בשל כך).\nאם לא ראית את התקנון, חפש אותו בהודעות קודמות בשיחה זו.',
        en: '⛔ You cannot send messages before agreeing to the rules (your message was deleted, and you will be removed).\nIf you missed the rules, check the previous messages in this chat.'
    },
    'rules_summary_no_media': { he: 'אין לשלוח שום קובץ מדיה (רק הודעות טקסט)', en: 'No media allowed (text messages only)' },
    'rules_summary_blocked_media': { he: 'אין לשלוח קבצי: {{types}}', en: 'Do not send: {{types}}' },
    'rules_summary_allowed_only': { he: 'מותר לשלוח רק הודעות טקסט שהוגדרו מראש (אחרות יימחקו)', en: 'Only specific allowed text messages can be sent' },
    'rules_summary_forbidden': { he: 'ישנן {{count}} מילים/ביטויים שאסור לכתוב בקבוצה', en: 'There are {{count}} forbidden words/phrases' },
    'rules_summary_no_curses': { he: 'אסור לקלל בקבוצה', en: 'No swearing allowed in this group' },
    'reason_llm_violation': { he: 'תוכן פוגעני (זוהה ע"י AI)', en: 'Offensive content (detected by AI)' },
    'rules_summary_no_content_rules': { he: 'אין הגבלות על תוכן ההודעות', en: 'No content restrictions' },
    'rules_summary_time_window_title': { he: 'שעות פעילות:', en: 'Active Hours:' },
    'rules_summary_enforcement_title': { he: 'אכיפה (GroupShield):', en: 'Enforcement (GroupShield):' },
    'rules_summary_warnings': { he: 'אזהרות מותרות: {{maxWarnings}} (ולאחר מכן הרחקה)', en: 'Max warnings: {{maxWarnings}} (before removal)' },
    'rules_summary_enforce_delete': { he: 'הודעות מפרות יימחקו אוטומטית', en: 'Violating messages are auto-deleted' },
    'type_image': { he: 'תמונה', en: 'image' },
    'type_video': { he: 'וידאו', en: 'video' },
    'type_sticker': { he: 'סטיקר', en: 'sticker' },
    'type_document': { he: 'מסמך', en: 'document' },
    'type_audio': { he: 'הודעות קוליות (אודיו)', en: 'audio/voice' },
    'type_other_non_text': { he: 'מיקום, איש קשר, סקר וכו׳', en: 'location/contact/poll etc' },

    // ── Undo ─────────────────────────────────────────────────────────────
    'undo_success': {
        he: '✅ פעולת הענישה בוטלה עבור *{{number}}*.',
        en: '✅ Punishment undone for *{{number}}*.'
    },
    'undo_failed': {
        he: '❌ פעולת הביטול נכשלה: {{error}}',
        en: '❌ Undo failed: {{error}}'
    },
    'undo_requires_group_id': {
        he: '❌ בקבוצת הנהלה משותפת חייבים לבצע "בטל" רק על דו״ח חדש שמכיל מזהה קבוצה (Group ID).',
        en: '❌ In a shared management group, undo must reference a newer report that includes Group ID.'
    },
    'undo_not_report': {
        he: '❌ ניתן להגיב "בטל" רק לדו"ח הסרה של GroupShield.',
        en: '❌ You can only reply "undo" to a GroupShield removal report.'
    },
    'undo_expired': {
        he: '❌ לא ניתן לבצע ביטול לפעולה שבוצעה לפני יותר מ-24 שעות.',
        en: '❌ Undo is not available for actions older than 24 hours.'
    },

    // ── Commands ─────────────────────────────────────────────────────────
    'help_user': {
        he: '🛡️ *פקודות GroupShield*\n\n📊 *מידע:*\n• *עזרה* — תפריט זה\n• *סטטוס* — מצב הבוט, הקבוצה ומספר האזהרות הפעילות\n• *חוקי הקבוצה* — הצג את כל החוקים ושלבי האכיפה הנוכחיים\n\n🛡️ *חסינים:*\n• *הוסף חסין 05X-XXX-XXXX* — הוסף משתמש שלא ייאכפו עליו חוקים\n• *הסר חסין 05X-XXX-XXXX* — הסר משתמש מרשימת החסינים\n• *רשימת חסינים* — הצג את כל המשתמשים החסינים\n\n⚠️ *אזהרות:*\n• *אפס אזהרות 05X-XXX-XXXX* — מחיקת כל האזהרות של משתמש\n• *בטל אזהרה 05X-XXX-XXXX* — הפחתת אזהרה אחת למשתמש\n\n⚙️ *מערכת:*\n• *התחל* — הגדרת קבוצה חדשה\n• *עדכן אכיפה* — עדכון מהיר של שלבי האכיפה ומספר האזהרות בלבד\n• *איפוס* — מחיקת כל נתוני הקבוצה ותחילה מחדש\n• *השהה <n>* — השהיית אכיפה למשך n שעות (לדוגמה: `השהה 24`)\n• *המשך אכיפה* — ביטול השהיה וחזרה לאכיפה פעילה\n• *הפסק אכיפה* — עצירת האכיפה לצמיתות ויציאה מהקבוצה\n• *שפה* — החלפת שפת הבוט (עברית ↔ English)',
        en: '🛡️ *GroupShield Commands*\n\n📊 *Info:*\n• *help* — this menu\n• *status* — bot status, group name and active warnings count\n• *group rules* — display all current rules and enforcement steps\n\n🛡️ *Exemptions:*\n• *exempt add 05X-XXX-XXXX* — add a user who won\'t be enforced\n• *exempt remove 05X-XXX-XXXX* — remove a user from the exempt list\n• *exempt list* — list all exempt users\n\n⚠️ *Warnings:*\n• *warnings reset 05X-XXX-XXXX* — clear all warnings for a user\n• *undo warning 05X-XXX-XXXX* — subtract one warning from a user\n\n⚙️ *System:*\n• *start* — set up a new group\n• *settings* — fully reconfigure the current group from scratch\n• *update enforcement* — quickly update enforcement steps and warning count only\n• *reset* — delete all group data and start over\n• *pause <n>* — pause enforcement for n hours (e.g., `pause 24`)\n• *resume* — cancel pause and resume active enforcement\n• *stop enforcement* — permanently stop enforcement and leave the group\n• *language* — switch language (Hebrew ↔ English)'
    },
    'help_developer': {
        he: '🛡️ *פקודות GroupShield (מפתח)*\n\n📊 *מידע:*\n• *עזרה* — תפריט זה\n• *סטטוס* — מצב הבוט, הקבוצה ומספר האזהרות הפעילות\n• *חוקי הקבוצה* — הצג את כל החוקים ושלבי האכיפה הנוכחיים\n\n🛡️ *ניהול קבוצה:*\n• *הוסף חסין 05X-XXX-XXXX* — הוסף משתמש שלא ייאכפו עליו חוקים\n• *הסר חסין 05X-XXX-XXXX* — הסר משתמש מרשימת החסינים\n• *רשימת חסינים* — הצג את כל המשתמשים החסינים\n• *אפס אזהרות 05X-XXX-XXXX* — מחיקת כל האזהרות של משתמש\n• *בטל אזהרה 05X-XXX-XXXX* — הפחתת אזהרה אחת למשתמש\n• *התחל* — הגדרת קבוצה חדשה\n• *עדכן אכיפה* — עדכון מהיר של שלבי האכיפה ומספר האזהרות\n• *איפוס* — מחיקת כל נתוני הקבוצה ותחילה מחדש\n• *השהה <n>* — השהיית אכיפה למשך n שעות\n• *המשך אכיפה* — ביטול השהיה וחזרה לאכיפה פעילה\n• *הפסק אכיפה* — עצירת האכיפה לצמיתות ויציאה מהקבוצה\n• *שפה* — החלפת שפת הבוט\n\n🧰 *מפתח בלבד:*\n• *סטטוס מפתח* — סקירת כל הקבוצות הנאכפות + נתוני מערכת וזיכרון\n• *גיבוי* — יצירת גיבוי מיידי של מסד הנתונים\n• *ניקוי* — ניקוי אזהרות שפג תוקפן ופעולות תקועות\n• *ריסטארט* — אתחול מחדש של הבוט\n• *הפסק אכיפה <שם קבוצה>* — הפסקת אכיפה לכל קבוצה לפי שם',
        en: '🛡️ *GroupShield Commands (Developer)*\n\n📊 *Info:*\n• *help* — this menu\n• *status* — bot status, group name and active warnings count\n• *group rules* — display all current rules and enforcement steps\n\n🛡️ *Group management:*\n• *exempt add 05X-XXX-XXXX* — add a user who won\'t be enforced\n• *exempt remove 05X-XXX-XXXX* — remove a user from the exempt list\n• *exempt list* — list all exempt users\n• *warnings reset 05X-XXX-XXXX* — clear all warnings for a user\n• *undo warning 05X-XXX-XXXX* — subtract one warning from a user\n• *start* — set up a new group\n• *settings* — fully reconfigure the current group from scratch\n• *update enforcement* — quickly update enforcement steps and warning count only\n• *reset* — delete all group data and start over\n• *pause <n>* — pause enforcement for n hours\n• *resume* — cancel pause and resume active enforcement\n• *stop enforcement* — permanently stop enforcement and leave the group\n• *language* — switch language\n\n🧰 *Developer only:*\n• *dev status* — overview of all enforced groups + system memory info\n• *backup* — create immediate database backup\n• *cleanup* — clear expired warnings and stale enforcement actions\n• *restart* — restart the bot\n• *stop enforcement <group name>* — stop enforcement for any group by name'
    },
    'status_message': {
        he: '📊 *סטטוס GroupShield*\n🟢 פעיל\n🛡️ *קבוצה:* {{groupName}} ({{memberCount}} חברים)\n⚠️ *אזהרות פעילות:* {{activeWarnings}}\n🕒 {{time}}',
        en: '📊 *GroupShield Status*\n🟢 Active\n🛡️ *Group:* {{groupName}} ({{memberCount}} members)\n⚠️ *Active warnings:* {{activeWarnings}}\n🕒 {{time}}'
    },
    'group_rules_header': {
        he: '📋 *חוקי הקבוצה — {{groupName}}*',
        en: '📋 *Group Rules — {{groupName}}*'
    },
    'group_rules_empty': {
        he: 'ℹ️ אין חוקים מוגדרים עדיין לקבוצה זו.',
        en: 'ℹ️ No rules configured yet for this group.'
    },

    // ── General ──────────────────────────────────────────────────────────
    'unknown_command': {
        he: '❓ לא זיהיתי את ההודעה.\nשלח *"עזרה"* לרשימת פקודות, או *"התחל"* כדי להתחיל הגדרה.\n\n❓ I could not recognize this message.\nSend *"help"* for commands, or *"start"* to begin setup.',
        en: '❓ לא זיהיתי את ההודעה.\nשלח *"עזרה"* לרשימת פקודות, או *"התחל"* כדי להתחיל הגדרה.\n\n❓ I could not recognize this message.\nSend *"help"* for commands, or *"start"* to begin setup.'
    },
    'setup_start_hint': {
        he: '👋 כדי להתחיל הגדרת בוט, שלח *"התחל"*.',
        en: '👋 To start setup, send *"start"*.'
    },
    'quick_enforcement_intro': {
        he: '⚙️ *עדכון אכיפה מהיר*\nבחר מחדש את שלבי האכיפה והאזהרות:',
        en: '⚙️ *Quick enforcement update*\nReconfigure enforcement steps and warnings:'
    },
    'quick_enforcement_saved': {
        he: '✅ הגדרות האכיפה עודכנו בהצלחה.',
        en: '✅ Enforcement settings updated successfully.'
    },
    'reset_completed': {
        he: '✅ בוצע איפוס מלא.\nכדי להתחיל מחדש שלח *"התחל"*.',
        en: '✅ Full reset completed.\nSend *"start"* to begin again.'
    },
    'stop_enforcement_done': {
        he: '🛑 האכיפה הופסקה לקבוצה *{{groupName}}*.\nיצאתי מהקבוצה ומחקתי את כל נתוניה.\n\nתודה שהשתמשת ב-GroupShield 🛡️',
        en: '🛑 Enforcement stopped for *{{groupName}}*.\nI left the group and deleted all its data.\n\nThank you for using GroupShield 🛡️'
    },
    'setup_reset_mid': {
        he: '🔄 ההגדרות אופסו. נתחיל מחדש — בחר שפה:',
        en: '🔄 Configuration reset. Starting over — choose language:'
    },
    'setup_back_done': {
        he: '↩️ חזרנו שלב אחד אחורה.',
        en: '↩️ Went back one step.'
    },
    'setup_no_prev_step': {
        he: 'ℹ️ אין שלב קודם לחזור אליו.',
        en: 'ℹ️ No previous step to go back to.'
    },
    'setup_exit': {
        he: '👋 יצאת ממצב ההגדרה.\n\nשלח כל הודעה כדי להתחיל מחדש.',
        en: '👋 You have exited setup mode.\n\nSend any message to start again.'
    },
    'reserved_name_error': {
        he: '❌ שם זה שמור לפקודת בוט ולא ניתן להשתמש בו.\nאנא בחר שם אחר.',
        en: '❌ This name is reserved as a bot command and cannot be used.\nPlease choose a different name.'
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
    'developer_only_command': {
        he: '⛔ הפקודה זמינה רק למפתח הבוט.',
        en: '⛔ This command is available to the bot developer only.'
    },
    'backup_done': {
        he: '✅ גיבוי ידני הושלם ({{count}} קבצים).',
        en: '✅ Manual backup completed ({{count}} files).'
    },
    'backup_failed': {
        he: '❌ גיבוי נכשל: {{error}}',
        en: '❌ Backup failed: {{error}}'
    },
    'cleanup_done': {
        he: '✅ ניקוי הושלם. נמחקו {{removed}} אזהרות שפג תוקפן.',
        en: '✅ Cleanup completed. Removed {{removed}} expired warnings.'
    },

    // ── Violation reasons ────────────────────────────────────────────────
    'reason_unapproved_welcome': {
        he: 'שליחת הודעה ללא אישור תקנון',
        en: 'Message sent without agreeing to rules'
    },
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
    'reason_time_blocked': {
        he: 'הקבוצה חסומה בשעות אלה',
        en: 'The group is blocked during these hours'
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
    'group_name_change_detected': {
        he: '🔄 *שינוי שם קבוצה זוהה*\n\nשם קודם: *{{oldName}}*\nשם חדש: *{{newName}}*\n\nכדי לאשר: השב *אימות שם {{requestId}}*\nכדי לדחות: השב *לא אימות שם {{requestId}}*\n\n⚠️ ביצוע דחייה או אי אישור בתוך 12 שעות יגרום להפסקת אכיפה ויציאת הבוט מהקבוצה.',
        en: '🔄 *Group name change detected*\n\nOld name: *{{oldName}}*\nNew name: *{{newName}}*\n\nTo approve: reply *verify name {{requestId}}*\nTo reject: reply *verify_not name {{requestId}}*\n\n⚠️ Rejecting or not responding within 12 hours will stop enforcement and the bot will leave the group.'
    },
    'name_change_request_not_found': {
        he: '❌ בקשת עדכון שם לא נמצאה או שכבר טופלה ({{requestId}}).',
        en: '❌ Name-change request not found or already handled ({{requestId}}).'
    },
    'name_change_unauthorized': {
        he: '⛔ אין לך הרשאה לאמת את שינוי השם עבור קבוצה זו.',
        en: '⛔ You are not authorized to verify this group name change.'
    },
    'name_change_approved': {
        he: '✅ אימות שם קבוצה עודכן.\n*{{oldName}}* → *{{newName}}*',
        en: '✅ Group name updated.\n*{{oldName}}* → *{{newName}}*'
    },
    'name_change_rejected': {
        he: '🚫 שינוי שם נדחה. הבוט יפסיק לאכוף את *{{oldName}}* ויצא מהקבוצה.',
        en: '🚫 Name change rejected. The bot will stop enforcing *{{oldName}}* and leave the group.'
    },
    'name_change_timeout': {
        he: '⏰ פג חלון האישור (יותר מ-12 שעות) עבור שינוי שם בקבוצה *{{groupName}}*. הבוט מפסיק לאכוף ויצא מהקבוצה.',
        en: '⏰ Approval window expired (12 hours) for name change in *{{groupName}}*. The bot will stop enforcing and leave the group.'
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
