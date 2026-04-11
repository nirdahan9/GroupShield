# GroupShield 🛡️

Production-grade WhatsApp moderation engine with a bilingual setup UX, deterministic enforcement pipeline, and operational reliability built for real communities.

https://www.groupshield.icu

## Core strengths

- **Product thinking + backend engineering:** complex rule configuration happens through an intuitive chat flow, without a dashboard.
- **Real reliability work:** self-healing runtime, PM2 process management, health monitoring, and automated backups.
- **Scalable design:** multitenant SQLite model and event-driven enforcement flow designed for many managed groups.
- **Strong safety controls:** warning thresholds, fixed-order enforcement, exempt users, bilingual user-facing messaging, and undo-by-report workflow.

## High-impact capabilities

- **Interactive setup state machine** in DM (`start`/`התחל`) with multilingual guidance.
- **Flexible policy engine:** allowed-only / blocked-only text policies, match modes (`exact` / `contains`), time windows, anti-spam, offensive language preset.
- **Shabbat & Holiday mode:** automatically locks/unlocks groups based on weekly candle-lighting and havdalah times fetched live from HebCal API (Jerusalem/Netanya). Handles all major Jewish holidays. Self-healing recovery flow if API fetch fails.
- **AI-powered offensive language detection:** two-layer filter — local curselist + Groq/Llama-3.1 LLM with bypass-detection, suspicion pre-scorer, and prompt-injection blocking.
- **Enforcement pipeline:** delete → DM warning → remove → report. Warning count threshold, undo-by-reply workflow.
- **Management operations:** shared management groups, per-group status views, group rules view, enforcement pause/resume, exempt users, warnings reset.
- **Group description sync:** auto-updates group description with current rules on setup and on demand (`עדכן תיאור`).
- **Reconfiguration deep-link:** after reset, generates a `wa.me` link for one-tap reconfiguration from private chat.
- **Periodic reminders:** configurable daily/weekly/monthly group rule reminders.
- **Operational tooling:** restart tracking, structured logs, scheduled cleanups, backup automation, pause expiry notifications.

## Tech stack

- **Runtime:** Node.js
- **WhatsApp automation:** `whatsapp-web.js` + Puppeteer
- **Storage:** SQLite
- **AI:** Groq API (Llama-3.1-8b-instant)
- **External APIs:** HebCal (Shabbat/holiday times)
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
src/commands.js     → Admin command handlers
src/database.js     → SQLite schema and data access
src/i18n.js         → Hebrew/English templates
src/shabbat.js      → Shabbat/holiday scheduler and lock logic
src/utils.js        → Shared utilities (phone parsing, group description, rules summary)
src/health.js       → Health checks and self-healing hooks
src/backup.js       → Automated backup jobs
src/llm.js          → AI moderation layer (Groq)
landing/            → Public landing page (groupshield.icu)
```

## Credits

Created by Nir Dahan

## License

ISC
