# GroupShield 🛡️

**Generic WhatsApp Group Enforcement Bot** — Enforce any rules on any WhatsApp group.

## Features

- 🌐 **Bilingual** — Full Hebrew + English support
- 💬 **Interactive Setup** — Easy ping-pong DM conversation to configure everything
- 📏 **Flexible Rules** — Allowed/forbidden messages, time windows, anti-spam
- ⚖️ **Configurable Enforcement** — Choose which steps: delete, warn, remove, block, report
- ⚠️ **Warning System** — Configurable warning count before enforcement
- 🛡️ **Exempt Users** — Define users immune to rules
- 📨 **Smart Reporting** — Reports to DM, phone number, or management group
- ↩️ **Undo** — Reply "בטל"/"undo" to reports to reverse punishment
- 🏥 **Self-Healing** — Health monitoring, memory management, auto-restart
- 💾 **Backups** — Automated daily database backups

## Setup

```bash
npm install
node bot.js
```

Scan the QR code with WhatsApp, then send a DM to the bot to start configuring a group.

## Architecture

```
bot.js              → Main entry point (Puppeteer/whatsapp-web.js)
src/
  config.js         → Configuration manager
  database.js       → SQLite database (7 tables)
  i18n.js           → Bilingual string system
  setupFlow.js      → Interactive setup conversation
  ruleEngine.js     → Generic rule evaluation
  enforcement.js    → Enforcement pipeline
  handlers.js       → Message routing
  commands.js       → Admin commands
  health.js         → Health monitoring
  backup.js         → Backup system
  logger.js         → Winston logging
  restartTracker.js → Restart reason tracking
  utils.js          → Utility functions
```

## Commands

| Hebrew | English | Description |
|--------|---------|-------------|
| עזרה | help | Show commands |
| סטטוס | status | Bot status |
| הגדרות | settings | Reconfigure |
| שפה | language | Switch language |
| הוסף חסין | exempt add | Add exempt user |
| הסר חסין | exempt remove | Remove exempt |
| רשימת חסינים | exempt list | List exempt |
| אפס אזהרות | warnings reset | Reset warnings |
| ריסטארט | restart | Restart bot |

## License

ISC
