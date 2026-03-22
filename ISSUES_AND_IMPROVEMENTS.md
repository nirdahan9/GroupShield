# GroupShield Bot — Issues & Improvements

> נוצר על ידי Claude (Cowork) לאחר סקירת קוד מלאה של הפרויקט.
> המשך עבודה: ראה פרומפט בתחתית הקובץ.

---

## 🐛 בעיות לוגיות / באגים

### 1. Race Condition ב-`incrementWarning` (קריטי)
**קובץ:** `src/database.js` — שורות 640–666

**הבעיה:** הפונקציה מבצעת שתי פעולות נפרדות: קריאת ה-count הנוכחי ואז עדכונו. אם שתי הודעות מגיעות במקביל מאותו משתמש, שתיהן יקראו את אותו count לפני שאחת מהן עדכנה אותו, וכתוצאה:
- שתי ההודעות יקבלו warning מספר 1 (במקום 1 ו-2)
- המשתמש לעולם לא יגיע לסף ההסרה בצורה תקינה אם הוא שולח הודעות מהר

**קוד בעייתי:**
```javascript
// database.js שורה 640
async incrementWarning(groupId, userJid) {
    const existing = await this._get(...)  // קריאה
    // ...כאן עלול להיכנס thread נוסף לפני העדכון...
    await this._run('UPDATE warnings SET count = count + 1 ...')  // עדכון
    return existing.count + 1;  // מחזיר ערך ישן!
}
```

**פתרון מוצע:** עטוף ב-SQLite transaction ועדכן את הפנקציה להחזיר את הערך החדש בפועל עם `RETURNING count` או שאילתה שנייה.

---

### 2. `getAllActiveGroups` לא מחזירה קבוצות PAUSED (בינוני)
**קובץ:** `src/database.js` — שורה 429

**הבעיה:** הפונקציה מסננת `status = 'ACTIVE'` בלבד. הפונקציה `refreshManagedGroupNames` בקובץ `src/handlers.js` קוראת לה כדי לבדוק שינויי שמות — קבוצות מושהות לא יתעדכן להן השם בזמן ההשהיה, ואחרי שחזרה לפעילות יופיע ה-bot כאילו השם השתנה.

**קוד בעייתי:**
```javascript
// database.js שורה 429
async getAllActiveGroups() {
    return this._all("SELECT * FROM groups WHERE active = 1 AND verified = 1 AND status = 'ACTIVE'");
    // קבוצות עם PAUSED_UNTIL:... מוחמצות לחלוטין
}
```

**פתרון מוצע:** ב-`refreshManagedGroupNames` להשתמש בשאילתה רחבה יותר שכוללת גם קבוצות מושהות.

---

### 3. `buildGroupRulesSummary` קוראת `.includes()` על אובייקט (קריטי)
**קובץ:** `src/utils.js` — (פונקציה `buildGroupRulesSummary`)

**הבעיה:** הפונקציה קוראת `nonTextRule.ruleData.includes(...)` — אבל `ruleData` לאחר הפארסינג ב-`database.getRules()` הוא **אובייקט JavaScript**, לא מחרוזת. קריאת `includes` על אובייקט תחזיר תמיד `undefined` (לא תזרוק שגיאה), מה שגורם לפונקציה לא להציג נכון את חוקי הבלוק.

**הדגמה:**
```javascript
// database.js שורה 486 — פארסינג הופך את ruleData למחרוזת ← אובייקט
ruleData: JSON.parse(r.ruleData)

// utils.js — בעיה: קוראים includes על אובייקט
nonTextRule.ruleData.includes('all_non_text')  // undefined תמיד!
// צריך להיות:
nonTextRule.ruleData.blockedTypes.includes('all_non_text')
```

---

### 4. שתי פונקציות דומות: `getActiveWarningCount` ו-`getActiveWarningsCount` (בינוני)
**קובץ:** `src/database.js` — שורות 437 ו-675

**הבעיה:** קיימות שתי פונקציות עם שמות כמעט זהים:
- `getActiveWarningCount` (שורה 437) — **לא** בודקת expiry, לא בשימוש כלל
- `getActiveWarningsCount` (שורה 675) — בודקת expiry, בשימוש ב-handlers

הפונקציה הראשונה מיותרת ומסוכנת — אם מישהו ישתמש בה בטעות, הוא יקבל ספירה לא נכונה.

---

### 5. אין timeout על `client.getChats()` ב-setupFlow (בינוני)
**קובץ:** `src/setupFlow.js` — שורות 185–220

**הבעיה:** הקריאה `client.getChats()` (שמחזירה את כל הצ'אטים) עלולה לקחת זמן רב אם הלקוח לא מגיב. אין עליה timeout ואין retry. משתמש שמנסה להגדיר בוט יקבל תקיעה ללא הודעת שגיאה.

```javascript
// setupFlow.js שורה 185 — ללא הגנה
const chats = await client.getChats();  // עלול לתקוע לנצח
```

---

### 6. `handleAdminActionResponse` תמיד בוחר את הקבוצה "האחרונה" (בינוני)
**קובץ:** `src/handlers.js` — שורה 692

**הבעיה:** כשמרובה קבוצות נמצאות ב-`PENDING_ADMIN_ACTION`, הבוט תמיד יבחר את `authorizedGroups[authorizedGroups.length - 1]` — הקבוצה האחרונה שנכנסה לסטטוס pending. אם יש שתי קבוצות בעייתיות בו-זמנית, המנהל לא יכול לדעת לאיזו קבוצה הפעולה תחול.

```javascript
// handlers.js שורה 692
const targetGroup = authorizedGroups[authorizedGroups.length - 1];
// נבחרת האחרונה בשקט, ללא שאלה למשתמש
```

---

## ⚡ בעיות ביצועים

### 7. N+1 Queries ב-`buildFullGroupsStatus` (בינוני)
**קובץ:** `src/commands.js`

**הבעיה:** הפונקציה מריצה עבור **כל קבוצה** בנפרד שאילתות ל-`getGroupErrors` ו-`group_name_change_requests`. עם 20 קבוצות זה 40+ שאילתות נפרדות לאותה פעולה.

**פתרון מוצע:** שאילתה אחת עם `GROUP BY groupId` שמחזירה את הנתונים לכל הקבוצות בבת אחת.

---

### 8. Admin Cache לא מתעדכן בזמן אמת (נמוך)
**קובץ:** `src/handlers.js` — שורה 495

**הבעיה:** ה-cache של admins מתנקה רק בעת join/leave/promote מהקבוצה, אבל ה-TTL הוא 60 שניות. אדמין שנוסף יהיה חשוף לאכיפה עד לפקיעת ה-cache.

---

## 🏗️ בעיות ארכיטקטורה ותחזוקה

### 9. `database._get` נקרא ישירות מ-`commands.js` (נמוך)
**קובץ:** `src/commands.js`

**הבעיה:** בשורת הקוד `await database._get(...)` נקראת פונקציה פנימית (prefix `_`) מחוץ למחלקה. זה שובר encapsulation ומקשה על refactoring.

**פתרון מוצע:** הוסף public method ל-`database.js` שתעטוף את הפונקציונליות הנדרשת.

---

### 10. `pending_group_actions.duration` — טיפוס שגוי ב-DB (בינוני)
**קובץ:** `src/database.js` — שורה 149

**הבעיה:** הטור `duration` מוגדר כ-`INTEGER` ב-SQLite, אבל עבור `action = 'execute'` נשמרת בו מחרוזת טקסט (הפקודה המקורית). SQLite לא יזרוק שגיאה אך הדבר עלול לחתוך נתונים בגרסאות מסוימות.

```sql
-- database.js שורה 149
duration INTEGER,   -- ← מוגדר INTEGER אבל נשמרת בו מחרוזת פקודה!
```

---

### 11. מספר טלפון אמיתי ב-`config.json` (אבטחה)
**קובץ:** `config.json` — שורה 7

**הבעיה:** ה-`config.json` הכיל מספר טלפון אמיתי. אם הפרויקט נדחף ל-GitHub, המספר ייחשף.

**פתרון מוצע:** העבר ל-`.env` קובץ ובדוק שהוא ב-`.gitignore`.

---

## 💡 הצעות לשיפורים

### 1. יומן פעולות נגיש לבעלים (פקודת `יומן`)
הוסף פקודה שמציגה לבעל הקבוצה את 10-20 הפעולות האחרונות שבוצעו בקבוצה שלו — הסרות, אזהרות, מי הוסר ומדוע. המידע כבר קיים בטבלת `enforcement_actions`.

### 2. מצב Dry Run
אפשרות להפעיל `השהה אכיפה` אבל **כן לשלוח דיווחים** — כלומר הבוט ידווח על הפרות אבל לא יסיר. שימושי לניסיון לפני הפעלה מלאה.

### 3. תמיכה ב-Regex בחוקי תוכן
כרגע `forbidden_messages` עובד עם `includes` פשוט. תוספת תמיכה ב-regex (עם prefix `regex:`) תאפשר חוקים מורכבים יותר כמו `regex:^https?://` לחסימת קישורים.

### 4. `undo` לאזהרות (לא רק להסרות)
כרגע `undo` עובד על הסרות בלבד. אפשר להוסיף פקודה כמו `אפס אזהרה @name` שמוחקת אזהרה אחת ספציפית.

### 5. הגנה על תמונת קבוצה
הבוט כבר מזהה שינוי שם קבוצה ומבקש אישור — אותה לוגיקה אפשר להרחיב לשינוי תמונת הקבוצה.

### 6. Tests — אפס כרגע
`package.json` מציין `"test": "echo \"Error: no test specified\" && exit 1"`.
לפחות unit tests על `ruleEngine.js` ו-`utils.js` (שהן פונקציות טהורות ללא תלות חיצונית) יהיו בעלי ערך גבוה מאוד.

### 7. Transaction-based Enforcement
עטוף את שלבי האכיפה (מחיקה → אזהרה → הסרה) בלוגיקת rollback state נקייה. כרגע אם ההסרה נכשלת אחרי שנשלחה הודעת אזהרה, המשתמש מקבל אזהרה שגוייה.

---

## 📋 סיכום עדיפויות

| עדיפות | בעיה | קובץ |
|--------|------|------|
| 🔴 קריטי | Race condition ב-`incrementWarning` | `src/database.js` |
| 🔴 קריטי | `buildGroupRulesSummary` — `includes` על אובייקט | `src/utils.js` |
| 🟠 בינוני | `config.json` עם טלפון אמיתי | `config.json` |
| 🟠 בינוני | `getAllActiveGroups` לא כולל PAUSED | `src/database.js` |
| 🟠 בינוני | `handleAdminActionResponse` לא שואל בין קבוצות | `src/handlers.js` |
| 🟠 בינוני | `duration` טיפוס שגוי ב-DB | `src/database.js` |
| 🟡 נמוך | `_get` חשוף החוצה מ-`commands.js` | `src/commands.js` |
| 🟡 נמוך | שתי פונקציות WarningCount מבלבלות | `src/database.js` |
| 🟡 נמוך | N+1 queries בסטטוס | `src/commands.js` |

---

## 🔵 פרומפט להמשך בVS Code עם Claude Code

```
היי Claude, אני ממשיך שיחה מ-Cowork.
בצענו סקירת קוד מלאה של הבוט GroupShield שנמצא בתיקייה הנוכחית.
כל הבעיות וההצעות לשיפור מפורטות בקובץ ISSUES_AND_IMPROVEMENTS.md שנמצא ב-root של הפרויקט.

אני רוצה שתתחיל לתקן את הבעיות לפי סדר העדיפויות שמופיע בטבלה בסוף הקובץ.
התחל מהבעיות הקריטיות (🔴):
1. Race condition ב-incrementWarning בקובץ src/database.js
2. buildGroupRulesSummary קוראת .includes() על אובייקט בקובץ src/utils.js

לכל תיקון:
- קרא את הקוד הרלוונטי לפני שאתה משנה
- הסבר מה אתה משנה ולמה
- עדכן את הקובץ
- אל תשבור שום פונקציונליות קיימת

לאחר התיקונים הקריטיים, שאל אותי אם להמשיך לבעיות הבינוניות (🟠).
```
