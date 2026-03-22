# GroupShield — הוראות לקלוד

## פריסה אוטומטית לאחר כל שינוי

**לאחר כל שינוי בקוד, בצע תמיד את הסדר הבא:**

1. **Commit לגיט** — עם הודעה תמציתית שמסכמת את השינוי
2. **Push לגיטהאב** — `git push origin main`
3. **העלאה לשרת + reload** — בהתאם ל-[DEPLOY.md](DEPLOY.md)

> אין צורך לשאול את המשתמש אם לפרוס — פשוט תעשה זאת תמיד בסיום.

## פרטי שרת (ראה DEPLOY.md לפקודות המלאות)

- Host: `87.106.137.182` | User: `root` | PM2: `groupshield`
- תיקייה: `/root/groupshield-bot/`

## מבנה הפרויקט

- `bot.js` — קובץ ראשי
- `src/` — כל הלוגיקה
- `src/setupFlow.js` — מנגנון ההגדרות האינטראקטיבי
- `src/handlers.js` — טיפול בהודעות נכנסות
- `src/i18n.js` — כל הטקסטים (עברית/אנגלית)
- `src/database.js` — SQLite, מיגרציות
- `src/commands.js` — פקודות ניהול
- `src/enforcement.js` — לוגיקת אכיפה
