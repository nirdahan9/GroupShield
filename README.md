# GroupShield 🛡️

Production-grade WhatsApp moderation engine with a bilingual setup UX, deterministic enforcement pipeline, and operational reliability built for real communities.

https://nirdahan9.github.io/GroupShield/

## Core strengths

- **Product thinking + backend engineering:** complex rule configuration happens through an intuitive chat flow, without a dashboard.
- **Real reliability work:** self-healing runtime, PM2 process management, health monitoring, and automated backups.
- **Scalable design:** multitenant SQLite model and event-driven enforcement flow designed for many managed groups.
- **Strong safety controls:** warning thresholds, fixed-order enforcement, exempt users, bilingual user-facing messaging, and undo-by-report workflow.

## High-impact capabilities

- **Interactive setup state machine** in DM (`start`/`התחל`) with multilingual guidance.
- **Flexible policy engine:** allowed-only / blocked-only text policies, match modes (`exact` / `contains`), time windows, anti-spam.
- **Enforcement pipeline:** delete → warn → remove → block → report.
- **Management operations:** shared management groups, status views, group rules view, and safe admin actions.
- **Operational tooling:** restart tracking, structured logs, scheduled cleanups, and backup automation.

## Tech stack

- **Runtime:** Node.js
- **WhatsApp automation:** `whatsapp-web.js` + Puppeteer
- **Storage:** SQLite
- **Process manager:** PM2
- **Observability:** Winston logging + health checks

## Quick start

```bash
npm install
node bot.js
```

Scan QR from WhatsApp, then DM the bot and send `start` / `התחל`.

## Project map

```text
bot.js              → App bootstrap, client lifecycle, schedulers
src/setupFlow.js    → Setup conversation + configuration flow
src/ruleEngine.js   → Rule evaluation logic
src/enforcement.js  → Enforcement + report/undo lifecycle
src/handlers.js     → Message routing and command dispatch
src/database.js     → SQLite schema and data access
src/i18n.js         → Hebrew/English templates
src/health.js       → Health checks and self-healing hooks
src/backup.js       → Automated backup jobs
```

## Credits

Created by Nirdahan Dahan

## License

ISC
