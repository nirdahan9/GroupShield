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
        he: '📋 *שלב 1: קישור קבוצה*\n\nקודם כל, הוסף אותי לקבוצה שאתה רוצה שאאכוף ומנה אותי כ*מנהל*.\n\nלאחר מכן, שלח לי את *שם הקבוצה* (כפי שהוא מופיע בוואטסאפ).\n\n✳️ תשובה לדוגמה:\nמשפחה',
        en: '📋 *Step 1: Link Group*\n\nFirst, add me to the group you want me to enforce and make me an *admin*.\n\nThen, send me the *group name* (as it appears in WhatsApp).\n\n✳️ Example reply:\nFamily'
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
        he: '📏 *שלב 2: הגדרת חוקים*\n\nאיזה סוג חוקי תוכן תרצה?\n\n1️⃣ *הודעות מותרות בלבד* — רק הודעות ספציפיות מותרות\n2️⃣ *הודעות אסורות* — הודעות ספציפיות אסורות, השאר מותר\n3️⃣ *ללא חוקי תוכן* — ללא הגבלת תוכן',
        en: '📏 *Step 2: Set Rules*\n\nWhat type of content rules do you want?\n\n1️⃣ *Allowed messages only* — only specific messages allowed\n2️⃣ *Forbidden messages* — specific messages blocked, rest allowed\n3️⃣ *No content rules* — no content restrictions'
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
        he: '🧠 איך להתאים את הודעות הכלל?\n\n1️⃣ זהה בדיוק — ההודעה חייבת להיות בדיוק הטקסט שציינת\n2️⃣ מכיל ביטוי — מספיק שהטקסט שציינת מופיע בתוך ההודעה\n\n✳️ לדוגמה: אם המילה "קללה" אסורה ובוחרים "מכיל ביטוי" — גם "איזו קללה קשה" תיחשב הפרה.',
        en: '🧠 How should message matching work for this rule?\n\n1️⃣ Exact match — message must exactly equal your configured text\n2️⃣ Contains phrase — configured text can appear inside a larger message\n\n✳️ Example: if "curse" is forbidden and you choose "contains", then "this is a curse word" is also a violation.'
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
        he: '🕐 שעת התחלה?\nאפשר לשלוח שעה בלבד או שעה:דקות\n\n✳️ תשובות מוצעות:\n06:00\n22:30\n6',
        en: '🕐 Start time?\nYou can send hour only or hour:minute\n\n✳️ Suggested replies:\n06:00\n22:30\n6'
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
        he: '⚖️ *שלב 5: שלבי אכיפה*\n\nבחר אילו שלבים הבוט יבצע בהפרה.\n*הסדר קבוע* — בחר אילו להפעיל:\n\n{{steps}}\n\nשלח את המספרים שברצונך להפעיל, מופרדים בפסיקים.\nלדוגמה: 1,2,3,5',
        en: '⚖️ *Step 5: Enforcement Steps*\n\nChoose which steps the bot takes on violation.\n*Fixed order* — choose which to enable:\n\n{{steps}}\n\nSend the numbers you want to enable, separated by commas.\nExample: 1,2,3,5'
    },
    'enforcement_step_1': {
        he: '1️⃣ מחיקת ההודעה המפרה — ההודעה תימחק מהקבוצה',
        en: '1️⃣ Delete violating message — removes the message from the group'
    },
    'enforcement_step_2': {
        he: '2️⃣ הודעה פרטית — המשתמש יקבל אזהרה/הודעת ענישה בפרטי',
        en: '2️⃣ Private message — user receives warning/enforcement notice in DM'
    },
    'enforcement_step_3': {
        he: '3️⃣ הסרה מהקבוצה — המשתמש יוצא מהקבוצה',
        en: '3️⃣ Remove from group — user is removed from the group'
    },
    'enforcement_step_4': {
        he: '4️⃣ חסימת המשתמש — הבוט יחסום את המשתמש בוואטסאפ',
        en: '4️⃣ Block user — bot blocks the user on WhatsApp'
    },
    'enforcement_step_5': {
        he: '5️⃣ שליחת דיווח — נשלח דו״ח ליעד הדיווח שהוגדר',
        en: '5️⃣ Send report — sends enforcement report to configured report target'
    },
    'enforcement_saved': {
        he: '✅ שלבי אכיפה נשמרו.',
        en: '✅ Enforcement steps saved.'
    },

    // ── Warnings ─────────────────────────────────────────────────────────
    'ask_warnings': {
        he: '⚠️ *שלב 6: אזהרות*\n\nכמה אזהרות לפני אכיפה מלאה?\n(0 = אכיפה מיידית, ללא אזהרות)\n\n✳️ תשובות מוצעות:\n0\n3\n5',
        en: '⚠️ *Step 6: Warnings*\n\nHow many warnings before full enforcement?\n(0 = immediate enforcement, no warnings)\n\n✳️ Suggested replies:\n0\n3\n5'
    },
    'warnings_saved': {
        he: '✅ מספר אזהרות: {{count}}',
        en: '✅ Warning count: {{count}}'
    },

    // ── Exempt Users ─────────────────────────────────────────────────────
    'ask_exempt': {
        he: '🛡️ *שלב 7: משתמשים חסינים*\n\nשלח מספרי טלפון של משתמשים שלא ייאכפו עליהם חוקים.\nמספר אחד בכל שורה, בפורמט בינלאומי או מקומי.\n\nלדוגמה:\n+1 202-555-0187\n+972-52-123-4567\n\nאו שלח *"דלג"* לדלג.',
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
        he: '👥 שלח את שם קבוצת ההנהלה (הוסף אותי לקבוצה קודם):\n\n✳️ תשובה לדוגמה:\nהנהלה',
        en: '👥 Send the management group name (add me to the group first):\n\n✳️ Example reply:\nManagement'
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

    // ── Summary & Completion ─────────────────────────────────────────────
    'setup_summary': {
        he: '📋 *סיכום הגדרות GroupShield*\n\n🏷️ *קבוצה:* {{groupName}}\n📏 *חוקי תוכן:* {{rulesType}}\n🧠 *התאמת תוכן:* {{rulesMode}}\n🖼️ *הודעות לא-טקסט:* {{nonTextRule}}\n⏰ *חלון זמנים:* {{timeWindow}}\n🔁 *אנטי-ספאם:* {{antiSpam}}\n⚖️ *שלבי אכיפה:* {{enforcement}}\n⚠️ *אזהרות:* {{warnings}}\n🛡️ *חסינים:* {{exempt}}\n📨 *דיווח:* {{report}}\n\nלאשר ולהפעיל?\n\n1️⃣ אשר ✅\n2️⃣ התחל מחדש 🔄',
        en: '📋 *GroupShield Configuration Summary*\n\n🏷️ *Group:* {{groupName}}\n📏 *Content rules:* {{rulesType}}\n🧠 *Match mode:* {{rulesMode}}\n🖼️ *Non-text messages:* {{nonTextRule}}\n⏰ *Time window:* {{timeWindow}}\n🔁 *Anti-spam:* {{antiSpam}}\n⚖️ *Enforcement:* {{enforcement}}\n⚠️ *Warnings:* {{warnings}}\n🛡️ *Exempt:* {{exempt}}\n📨 *Reports:* {{report}}\n\nConfirm and activate?\n\n1️⃣ Confirm ✅\n2️⃣ Start over 🔄'
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
        he: '🛡️ *דו"ח GroupShield*\n\n🏷️ *קבוצה:* {{groupName}}\n🆔 *מזהה:* {{violationId}}\n🧾 *מזהה קבוצה:* {{groupId}}\n👤 *שם:* {{pushname}}\n📱 *מספר:* {{number}}\n📝 *סיבה:* {{reason}}\n📝 *תוכן:* "{{content}}"\n📩 *הודעה פרטית:* {{privateStatus}}\n🚫 *הסרה:* {{removeStatus}}\n🔒 *חסימה:* {{blockStatus}}\n🕒 *זמן:* {{time}}',
        en: '🛡️ *GroupShield Report*\n\n🏷️ *Group:* {{groupName}}\n🆔 *ID:* {{violationId}}\n🧾 *Group ID:* {{groupId}}\n👤 *Name:* {{pushname}}\n📱 *Number:* {{number}}\n📝 *Reason:* {{reason}}\n📝 *Content:* "{{content}}"\n📩 *Private msg:* {{privateStatus}}\n🚫 *Removal:* {{removeStatus}}\n🔒 *Block:* {{blockStatus}}\n🕒 *Time:* {{time}}'
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
    'undo_requires_group_id': {
        he: '❌ בקבוצת הנהלה משותפת חייבים לבצע "בטל" רק על דו״ח חדש שמכיל מזהה קבוצה (Group ID).',
        en: '❌ In a shared management group, undo must reference a newer report that includes Group ID.'
    },
    'undo_not_report': {
        he: '❌ ניתן להגיב "בטל" רק לדו"ח הסרה של GroupShield.',
        en: '❌ You can only reply "undo" to a GroupShield removal report.'
    },

    // ── Commands ─────────────────────────────────────────────────────────
    'help': {
        he: '🛡️ *פקודות GroupShield*\n\n📊 *מידע:*\n• *עזרה* — תפריט זה\n• *סטטוס* — מצב הבוט והקבוצה\n\n🛡️ *חסינים:*\n• *הוסף חסין 05X-XXX-XXXX* — הוסף חסין\n• *הסר חסין 05X-XXX-XXXX* — הסר חסין\n• *רשימת חסינים* — הצג חסינים\n\n⚠️ *אזהרות:*\n• *אפס אזהרות 05X-XXX-XXXX* — אפס אזהרות\n\n🔄 *שינוי שם קבוצה:*\n• *אשר שם <requestId>* — אישור שם חדש\n• *דחה שם <requestId>* — דחיית שם חדש\n\n⚙️ *מערכת:*\n• *התחל* — התחלת setup\n• *הגדרות* — שינוי הגדרות מלא\n• *עדכן אכיפה* — שינוי מהיר של אכיפה ואזהרות\n• *איפוס* — איפוס מלא\n• *הפסק אכיפה* — עצירת אכיפה ויציאה מקבוצות\n• *שפה* — החלף שפה\n• *ריסטארט* — אתחל בוט',
        en: '🛡️ *GroupShield Commands*\n\n📊 *Info:*\n• *help* — this menu\n• *status* — bot and group status\n\n🛡️ *Exemptions:*\n• *exempt add 05X-XXX-XXXX* — add exempt\n• *exempt remove 05X-XXX-XXXX* — remove exempt\n• *exempt list* — list exempt users\n\n⚠️ *Warnings:*\n• *warnings reset 05X-XXX-XXXX* — reset warnings\n\n🔄 *Group name changes:*\n• *confirm name <requestId>* — approve new name\n• *reject name <requestId>* — reject new name\n\n⚙️ *System:*\n• *start* — begin setup\n• *settings* — full reconfiguration\n• *update enforcement* — quick enforcement + warnings update\n• *reset* — full reset\n• *stop enforcement* — stop enforcement and leave groups\n• *language* — switch language\n• *restart* — restart bot'
    },
    'status_message': {
        he: '📊 *סטטוס GroupShield*\n🟢 פעיל\n🛡️ *קבוצה:* {{groupName}} ({{memberCount}} חברים)\n⚠️ *אזהרות פעילות:* {{activeWarnings}}\n🕒 {{time}}',
        en: '📊 *GroupShield Status*\n🟢 Active\n🛡️ *Group:* {{groupName}} ({{memberCount}} members)\n⚠️ *Active warnings:* {{activeWarnings}}\n🕒 {{time}}'
    },

    // ── General ──────────────────────────────────────────────────────────
    'unknown_command': {
        he: '❓ לא זיהיתי את ההודעה.\nשלח *"עזרה"* לרשימת פקודות, או *"התחל"* כדי להתחיל הגדרה.',
        en: '❓ I could not recognize this message.\nSend *"help"* for commands, or *"start"* to begin setup.'
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
        he: '🛑 האכיפה הופסקה לקבוצה *{{groupName}}*. יצאתי מהקבוצה (וגם מקבוצת הנהלה אם הוגדרה).',
        en: '🛑 Enforcement stopped for *{{groupName}}*. I left the group (and management group if configured).'
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
    'group_name_change_detected': {
        he: '🔄 *זוהה שינוי בשם קבוצה*\n\nשם קודם: *{{oldName}}*\nשם חדש שזוהה: *{{newName}}*\n\nאם השם החדש תקין, השב:\n*אשר שם {{requestId}}*\n\nאם לא תקין, השב:\n*דחה שם {{requestId}}*',
        en: '🔄 *Group name change detected*\n\nOld name: *{{oldName}}*\nDetected new name: *{{newName}}*\n\nIf the new name is correct, reply:\n*confirm name {{requestId}}*\n\nIf not correct, reply:\n*reject name {{requestId}}*'
    },
    'name_change_request_not_found': {
        he: '❌ בקשת עדכון שם לא נמצאה או שכבר טופלה ({{requestId}}).',
        en: '❌ Name-change request not found or already handled ({{requestId}}).'
    },
    'name_change_unauthorized': {
        he: '⛔ אין לך הרשאה לאשר/לדחות את שינוי השם עבור קבוצה זו.',
        en: '⛔ You are not authorized to approve/reject this group name change.'
    },
    'name_change_approved': {
        he: '✅ שינוי שם אושר.\n*{{oldName}}* → *{{newName}}*',
        en: '✅ Name change approved.\n*{{oldName}}* → *{{newName}}*'
    },
    'name_change_rejected': {
        he: '✅ שינוי שם נדחה. השם יישאר:\n*{{oldName}}*\n(השם שזוהה: *{{newName}}*)',
        en: '✅ Name change rejected. Stored name remains:\n*{{oldName}}*\n(detected: *{{newName}}*)'
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
