---
description: Project context and architecture overview for GroupShield bot
---

# GroupShield Project Context

## Overview
GroupShield is a generic, bilingual WhatsApp group enforcement bot built with whatsapp-web.js (Puppeteer).
It was transformed from a specific "ShabbatBot" into a fully configurable enforcement platform.

## Recent Session Changes (Memory)

### Enforcement & Safety
- Added global protected users table (`global_protected_users`) and immunity checks in both handlers and enforcement.
- Added transactional enforcement log table (`enforcement_actions`) with per-step statuses and stale-action recovery on restart.
- Added reliable undo linkage via violation ID (`ENF-*`) in reports.

### Rules Engine
- Non-text messages are allowed by default unless explicit `block_non_text` rule is configured.
- `block_non_text` now supports either:
	- all non-text (`all_non_text`), or
	- selected types (`image`, `video`, `sticker`, `document`, `audio`, `other_non_text`).
- Time windows support:
	- multiple ranges,
	- minute precision (`HH:mm`),
	- overnight windows crossing midnight.
- Content rule matching supports mode:
	- `exact` (exact equality),
	- `contains` (phrase appears inside larger message).

### Setup Flow
- Setup starts only on explicit trigger (`התחל` / `start` / `setup`).
- Added second group verification by admin phone.
- Added group claim guard: a group cannot be claimed by a different owner.
- Added exclusivity guards:
	- enforced group cannot be used as management group,
	- management group cannot be an enforced group.
- Added management-group extra verification step by participant count.
- Added quick enforcement update flow (steps + warnings) without full setup.
- Added full reset and stop-enforcement operations.

### Operational Automation
- Periodic group-name refresh every 5 minutes with approval workflow (`confirm/reject name <requestId>`).
- Daily orphan-group cleanup: bot leaves groups that are neither enforced nor management groups.
- Warning TTL and cleanup:
	- default reset after 60 days,
	- scheduled cleanup job.

### Status / Messaging
- User status no longer includes memory/uptime.
- Status/report/violation messages include enforced group name where relevant.
- Unknown input now gets explicit "message not recognized" guidance.

### Phone Handling
- Phone parsing supports international formats (not Israel-only), including `+`, `00`, local formatting cleanup.

### Latest Additions (Current Session)
- Matching policy is now fixed globally:
	- `forbidden_messages` => always `contains`
	- `allowed_messages` => always `exact`
- Verification flow for enforced group and management group is unified:
	- both use participant-count verification
	- on mismatch, bot re-asks same verification question (retry path)
- Shared management group support:
	- one management group can serve multiple enforced groups
	- management-group status command now supports:
		- all linked enforced groups summary
		- specific group filter via command text (`status <group-name>`)
- Undo in shared management groups resolves target enforced group from quoted report `Group ID`.
- Violation report now includes both enforced group name and enforced group ID.

### Shared Management Group Hardening (Follow-up)
- Fixed `stop enforcement` behavior so bot does **not** leave a shared management group if other enforced groups still depend on it.
- Moved global-immunity short-circuit to avoid blocking management-group command flows (undo/status) for protected users.
- Undo hardening:
	- requires quoted message to be bot-authored (`fromMe`),
	- in shared management groups, requires quoted report to include `Group ID` to prevent cross-group misrouting.
- Management-group detection now checks all linked enforced groups via `getGroupsByMgmtGroup`, improving consistency.

### Latest Hardening & Performance Update
- Added strict developer-only controls for sensitive manual operations:
	- `restart`, `backup`, and `cleanup` are now developer-only commands.
- Management-group command surface is restricted:
	- group messages in management groups now accept `status` (all/specific), `undo`, and group-name approval commands only.
	- system commands are no longer generally executed from management groups.
- Added scheduler/runtime init guard in `ready` flow to prevent duplicate cron/interval registration on repeated ready events.
- Added periodic anti-spam map cleanup (stale key pruning) to prevent in-memory growth over time.
- Enforcement step observability improved:
	- delete/report step statuses now reflect actual success/failure instead of assumed success.
- Logging writes were made non-blocking (`appendFile` instead of sync appends) to reduce event-loop blocking.
- Removed direct `console.*` usage in config/restart modules; switched to safer stderr writes.
- Database cleanup hardening:
	- `PRAGMA foreign_keys = ON` enabled.
	- deleting a group now also removes linked name-change requests and enforcement action rows.
- Performance optimization:
	- added short-lived group-admin cache for immunity checks.
	- reused Jerusalem time formatter in rule engine instead of rebuilding formatter per message.

### Latest Security & Reliability Update (Current Prompt)
- Critical protection-scope fix:
	- setup-start no longer grants immediate global immunity.
	- users are added to `global_protected_users` only after an actual group link is persisted (`updateUserGroup` with non-null group).
	- added startup cleanup for legacy over-protected setup users without linked groups.
- Undo safety window:
	- undo now requires a valid `ENF-*` action ID,
	- only actions in `completed` status are reversible,
	- undo is blocked for actions older than 24 hours.
- Backup robustness:
	- database backup moved from raw file copy to SQLite `VACUUM INTO` snapshot flow.
- Cron validation hardening:
	- scheduler expressions are validated before registration with fallbacks and warning logs.
	- applied in both main runtime schedulers and backup scheduler.
- Command UX split:
	- help menu is now role-aware (`help_user` vs `help_developer`), exposing developer-only commands only to developer users.

### Latest Follow-up (Current Prompt)
- Automatic orphan-group leaving was removed from scheduled runtime maintenance.
	- Bot now leaves groups only through explicit `stop enforcement` command flow.
- Admin cache correctness improved:
	- group admin cache is invalidated on group update events to reduce stale-permission windows.

### Latest Follow-up (Unknown Group Exit)
- Reintroduced a controlled daily leave policy for unknown groups by request:
	- once per day, bot scans joined groups and exits groups that are not active enforced groups and not configured management groups.
	- policy is configurable via:
		- `scheduling.unknownGroupExitEnabled` (default: true)
		- `scheduling.unknownGroupExit` cron expression (default: `30 4 * * *`)
- Added safety guard for missing database file:
	- if the SQLite DB file is missing, unknown-group cleanup is skipped entirely (bot does not leave any group).

## Mandatory Workflow Instruction
- For **every** new prompt that includes code/config changes:
	1. apply and validate changes,
	2. update this `.agents` context file,
	3. commit and push to GitHub (`main`),
	4. report back with commit hash and what was updated.

## Architecture

### Entry Point
- `bot.js` — Main entry, Puppeteer client, QR auth, scheduling, memory monitoring

### Core Modules (src/)
- `setupFlow.js` — Interactive DM setup (state machine in DB), includes quick-update subflows
- `ruleEngine.js` — Evaluates messages against configured rules
- `enforcement.js` — Fixed-order pipeline: delete → warn → remove → block → report
- `handlers.js` — Message router: DM → setup/commands, Group → rules/enforcement
- `commands.js` — Bilingual admin commands (help, status, exempt, warnings, restart)

### Infrastructure (src/)
- `database.js` — SQLite with core + operational tables (includes group_name_change_requests, enforcement_actions, global_protected_users)
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
9. **Group ownership lock** — one enforced group cannot be owned by two users simultaneously
10. **Management/enforced exclusivity** — a group cannot be both managed target and management group

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
