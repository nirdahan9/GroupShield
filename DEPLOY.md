# GroupShield — מדריך פריסה לשרת

> קובץ הנחיות עבור Claude Code לדיפלוי שינויים לגיטהאב ולשרת.

## פרטי השרת

| פרמטר | ערך |
|--------|-----|
| Host | `87.106.137.182` |
| User | `root` |
| Password | `1uW1XKZt` |
| תיקייה בשרת | `/root/groupshield-bot/` |
| PM2 App Name | `groupshield` |

## מבנה הפרויקט

```
GroupShield/
├── bot.js                  ← קובץ ראשי
├── config.json             ← הגדרות (כולל developer JID)
├── ecosystem.config.js     ← הגדרות PM2
├── package.json
├── package-lock.json
└── src/
    ├── backup.js
    ├── circuitBreaker.js
    ├── commands.js
    ├── config.js
    ├── database.js
    ├── enforcement.js
    ├── handlers.js
    ├── health.js
    ├── i18n.js
    ├── logger.js
    ├── restartTracker.js
    ├── ruleEngine.js
    ├── setupFlow.js
    └── utils.js
```

## פריסה מלאה (כולל git push)

### 1. Push לגיטהאב

```bash
git -C /Users/nirdahan/Documents/GroupShield add -A
git -C /Users/nirdahan/Documents/GroupShield commit -m "your message"
git -C /Users/nirdahan/Documents/GroupShield push origin main
```

### 2. העלאת קבצי root

```bash
expect -c "
set timeout 60
spawn scp -o StrictHostKeyChecking=no \
  /Users/nirdahan/Documents/GroupShield/bot.js \
  /Users/nirdahan/Documents/GroupShield/config.json \
  /Users/nirdahan/Documents/GroupShield/ecosystem.config.js \
  /Users/nirdahan/Documents/GroupShield/package.json \
  /Users/nirdahan/Documents/GroupShield/package-lock.json \
  root@87.106.137.182:/root/groupshield-bot/
expect {
    'password:' { send '1uW1XKZt\r'; exp_continue }
    eof
}
"
```

### 3. העלאת src/

```bash
expect -c "
set timeout 60
spawn scp -o StrictHostKeyChecking=no \
  /Users/nirdahan/Documents/GroupShield/src/backup.js \
  /Users/nirdahan/Documents/GroupShield/src/circuitBreaker.js \
  /Users/nirdahan/Documents/GroupShield/src/commands.js \
  /Users/nirdahan/Documents/GroupShield/src/config.js \
  /Users/nirdahan/Documents/GroupShield/src/database.js \
  /Users/nirdahan/Documents/GroupShield/src/enforcement.js \
  /Users/nirdahan/Documents/GroupShield/src/handlers.js \
  /Users/nirdahan/Documents/GroupShield/src/health.js \
  /Users/nirdahan/Documents/GroupShield/src/i18n.js \
  /Users/nirdahan/Documents/GroupShield/src/logger.js \
  /Users/nirdahan/Documents/GroupShield/src/restartTracker.js \
  /Users/nirdahan/Documents/GroupShield/src/ruleEngine.js \
  /Users/nirdahan/Documents/GroupShield/src/setupFlow.js \
  /Users/nirdahan/Documents/GroupShield/src/utils.js \
  root@87.106.137.182:/root/groupshield-bot/src/
expect {
    'password:' { send '1uW1XKZt\r'; exp_continue }
    eof
}
"
```

### 4. הפעלה מחדש בשרת

```bash
expect -c "
set timeout 30
spawn ssh -o StrictHostKeyChecking=no root@87.106.137.182 {cd /root/groupshield-bot && pm2 reload groupshield}
expect {
    'password:' { send '1uW1XKZt\r'; exp_continue }
    eof
}
"
```

---

## העלאת קובץ בודד

אם שינית רק קובץ אחד (למשל `handlers.js`):

```bash
expect -c "
set timeout 30
spawn scp -o StrictHostKeyChecking=no \
  /Users/nirdahan/Documents/GroupShield/src/handlers.js \
  root@87.106.137.182:/root/groupshield-bot/src/
expect {
    'password:' { send '1uW1XKZt\r'; exp_continue }
    eof
}
"
```

ואז `pm2 reload groupshield` כנ"ל.

---

## פקודות ניהול שימושיות

```bash
# בדיקת סטטוס
pm2 status

# לוגים חיים
pm2 logs groupshield

# הפעלה מחדש
pm2 reload groupshield

# עצירה
pm2 stop groupshield

# מחיקה מ-PM2
pm2 delete groupshield
```

---

## הערות
- **הסשן** (`.wwebjs_auth/`) נשמר בשרת — לא נמחק בין דיפלוי לדיפלוי
- **ה-DB** (`groupshield.db`) נשמר בשרת — לא מועלה ולא מוחק
- אם הוספת חבילת npm חדשה ל-`package.json`, יש להריץ `npm install` בשרת לאחר העלאת ה-`package.json`
