---
description: Project context and architecture overview for GroupShield bot
---

# GroupShield Project Context

## Overview
GroupShield is a generic, bilingual WhatsApp group enforcement bot built with whatsapp-web.js (Puppeteer).
It was transformed from a specific "ShabbatBot" into a fully configurable enforcement platform.

## Architecture

### Entry Point
- `bot.js` — Main entry, Puppeteer client, QR auth, scheduling, memory monitoring

### Core Modules (src/)
- `setupFlow.js` — Interactive 15-step DM setup (state machine stored in DB)
- `ruleEngine.js` — Evaluates messages against configured rules
- `enforcement.js` — Fixed-order pipeline: delete → warn → remove → block → report
- `handlers.js` — Message router: DM → setup/commands, Group → rules/enforcement
- `commands.js` — Bilingual admin commands (help, status, exempt, warnings, restart)

### Infrastructure (src/)
- `database.js` — SQLite with 7 tables: users, groups, rules, enforcement, exempt_users, warnings, settings
- `i18n.js` — 60+ bilingual strings (Hebrew + English) with template interpolation
- `config.js` — Reads config.json (minimal global config, per-group config lives in DB)
- `logger.js` — Winston logging with Israeli timezone
- `health.js` — Connectivity, error rate, memory monitoring with self-healing
- `backup.js` — Automated daily backups of DB and config
- `restartTracker.js` — Tracks restart reasons across process restarts
- `utils.js` — JID normalization, phone parsing, rate limiter

### Key Design Decisions
1. **All group config is in SQLite, not config.json** — dynamic per-group settings
2. **Setup is a DM state machine** — each step saves state as JSON in users.setupState
3. **Enforcement order is FIXED** (delete → warn → remove → block → report) — user chooses which steps to enable
4. **Warnings system** — configurable count, after exhaustion → full enforcement
5. **Bilingual** — every user-facing string goes through `t(key, lang, params)` from i18n.js
6. **Immunity hierarchy** — group admins > bot owner > exempt users > management group members
7. **Reports go to configurable target** — DM, phone number, or management group
8. **"Undo" feature** — reply "בטל"/"undo" to a report to reverse punishment

### Developer Admin
- JID: 972526980000@s.whatsapp.net (configured in config.json)
- Receives all status and error notifications
- Can restart via admin command

## GitHub
- Repo: https://github.com/nirdahan9/GroupShield
- Branch: main

## Running
```bash
npm install
node bot.js  # or: pm2 start ecosystem.config.js
```
