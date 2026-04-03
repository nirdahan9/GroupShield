// src/database.js - SQLite Database for GroupShield
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const { getNormalizedJid, extractNumber, formatIsraelLocalNumber } = require('./utils');

const DB_FILE = path.join(__dirname, '../', config.get('database.file', 'groupshield.db'));

class Database {
    constructor() {
        this.db = new sqlite3.Database(DB_FILE);
        this.initialize();
    }

    initialize() {
        this.db.serialize(() => {
            this.db.run('PRAGMA foreign_keys = ON');

            // Users — people who configure the bot via DM
            this.db.run(`CREATE TABLE IF NOT EXISTS users (
                jid TEXT PRIMARY KEY,
                language TEXT DEFAULT 'he',
                setupState TEXT,
                groupId TEXT,
                createdAt TEXT
            )`);

            // Global protected users — never enforce remove/block on these users
            this.db.run(`CREATE TABLE IF NOT EXISTS global_protected_users (
                jid TEXT PRIMARY KEY,
                addedAt TEXT,
                source TEXT DEFAULT 'setup_flow'
            )`);

            // Group name change approval requests
            this.db.run(`CREATE TABLE IF NOT EXISTS group_name_change_requests (
                requestId TEXT PRIMARY KEY,
                groupId TEXT NOT NULL,
                oldName TEXT,
                newName TEXT NOT NULL,
                reportTarget TEXT,
                status TEXT DEFAULT 'pending',
                responderJid TEXT,
                createdAt TEXT,
                respondedAt TEXT
            )`);

            // Enforcement action log (transaction-like trace)
            this.db.run(`CREATE TABLE IF NOT EXISTS enforcement_actions (
                actionId TEXT PRIMARY KEY,
                groupId TEXT NOT NULL,
                userJid TEXT NOT NULL,
                reason TEXT,
                content TEXT,
                msgType TEXT,
                status TEXT DEFAULT 'started',
                deleteStatus TEXT DEFAULT 'pending',
                warningStatus TEXT DEFAULT 'pending',
                removeStatus TEXT DEFAULT 'pending',
                blockStatus TEXT DEFAULT 'pending',
                reportStatus TEXT DEFAULT 'pending',
                error TEXT,
                createdAt TEXT,
                updatedAt TEXT
            )`);

            // Managed groups
            this.db.run(`CREATE TABLE IF NOT EXISTS groups (
                groupId TEXT PRIMARY KEY,
                ownerJid TEXT NOT NULL,
                groupName TEXT,
                verified INTEGER DEFAULT 0,
                mgmtGroupId TEXT,
                mgmtGroupVerified INTEGER DEFAULT 0,
                reportTarget TEXT DEFAULT 'dm',
                welcomeMessageEnabled INTEGER DEFAULT 0,
                warningCount INTEGER DEFAULT 3,
                active INTEGER DEFAULT 1,
                createdAt TEXT
            )`);

            // Rules per group
            this.db.run(`CREATE TABLE IF NOT EXISTS rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                groupId TEXT NOT NULL,
                ruleType TEXT NOT NULL,
                ruleData TEXT NOT NULL,
                enabled INTEGER DEFAULT 1
            )`);

            // Enforcement config per group
            this.db.run(`CREATE TABLE IF NOT EXISTS enforcement (
                groupId TEXT PRIMARY KEY,
                deleteMessage INTEGER DEFAULT 1,
                privateWarning INTEGER DEFAULT 1,
                removeFromGroup INTEGER DEFAULT 1,
                blockUser INTEGER DEFAULT 0,
                sendReport INTEGER DEFAULT 1
            )`);

            // Exempt users per group
            this.db.run(`CREATE TABLE IF NOT EXISTS exempt_users (
                groupId TEXT NOT NULL,
                jid TEXT NOT NULL,
                addedAt TEXT,
                PRIMARY KEY (groupId, jid)
            )`);

            // Warning tracking per user per group
            this.db.run(`CREATE TABLE IF NOT EXISTS warnings (
                groupId TEXT NOT NULL,
                userJid TEXT NOT NULL,
                count INTEGER DEFAULT 0,
                lastWarningAt TEXT,
                PRIMARY KEY (groupId, userJid)
            )`);

            // Global settings
            this.db.run(`CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )`);

            // Backfill: every known setup user is globally protected
            this.db.run(`INSERT OR IGNORE INTO global_protected_users (jid, addedAt, source)
                         SELECT jid, COALESCE(createdAt, datetime('now')), 'setup_flow'
                                                 FROM users
                                                 WHERE groupId IS NOT NULL`);

            // Cleanup legacy over-protection: users without linked group should not stay setup_flow protected
            this.db.run(`DELETE FROM global_protected_users
                                                 WHERE source = 'setup_flow'
                                                     AND jid IN (SELECT jid FROM users WHERE groupId IS NULL)`);

            // Pending group members (for welcome message)
            this.db.run(`CREATE TABLE IF NOT EXISTS pending_group_members (
                groupId TEXT NOT NULL,
                userJid TEXT NOT NULL,
                joinedAt TEXT NOT NULL,
                notified INTEGER DEFAULT 0,
                reminderSentAt TEXT,
                PRIMARY KEY (groupId, userJid)
            )`);

            this.db.run(`CREATE TABLE IF NOT EXISTS pending_rejoin (
                groupId TEXT NOT NULL,
                userJid TEXT NOT NULL,
                removedAt INTEGER DEFAULT (strftime('%s', 'now')),
                PRIMARY KEY (groupId, userJid)
            )`);

            // Pending group actions (for multi-group target selection via numbering)
            this.db.run(`CREATE TABLE IF NOT EXISTS pending_group_actions (
                userJid TEXT PRIMARY KEY,
                action TEXT NOT NULL,
                duration TEXT,
                optionsData TEXT NOT NULL,
                createdAt TEXT NOT NULL
            )`);

            // Learned phrases — added by LLM after mention-triggered violation reviews
            this.db.run(`CREATE TABLE IF NOT EXISTS learned_phrases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phrase TEXT UNIQUE NOT NULL,
                list_type TEXT NOT NULL CHECK(list_type IN ('forbidden','context')),
                source_message TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )`);

            // Pending learned phrases — awaiting owner/developer approval before going live
            this.db.run(`CREATE TABLE IF NOT EXISTS pending_learned_phrases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phrase TEXT NOT NULL,
                list_type TEXT NOT NULL CHECK(list_type IN ('forbidden','context')),
                source_message TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )`);

            // Allowed phrases (whitelist) — developer-managed; overrides curse detection
            this.db.run(`CREATE TABLE IF NOT EXISTS allowed_phrases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phrase TEXT UNIQUE NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            )`);

            // Enforcement stats — counts by detection source (rule_engine, cosine, llm, injection)
            this.db.run(`CREATE TABLE IF NOT EXISTS enforcement_stats (
                source TEXT PRIMARY KEY,
                count INTEGER DEFAULT 0,
                last_updated TEXT DEFAULT (datetime('now'))
            )`);

            // Member join times (for grace period feature)
            this.db.run(`CREATE TABLE IF NOT EXISTS member_join_times (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                groupId TEXT NOT NULL,
                userJid TEXT NOT NULL,
                joinedAt TEXT NOT NULL,
                UNIQUE(groupId, userJid)
            )`);

            // Check if welcomeMessageEnabled column exists, if not, add it (schema migration)
            // Migrate enforcement table: add warnPrivateDm + publicRemovalNotice columns
            this.db.all("PRAGMA table_info(enforcement)", (err, rows) => {
                if (!err && rows) {
                    const hasWarnPrivateDm = rows.some(r => r.name === 'warnPrivateDm');
                    if (!hasWarnPrivateDm) {
                        this.db.run("ALTER TABLE enforcement ADD COLUMN warnPrivateDm INTEGER DEFAULT 0");
                        logger.info("Migrated schema: Added warnPrivateDm to enforcement");
                    }
                    const hasPublicRemovalNotice = rows.some(r => r.name === 'publicRemovalNotice');
                    if (!hasPublicRemovalNotice) {
                        this.db.run("ALTER TABLE enforcement ADD COLUMN publicRemovalNotice INTEGER DEFAULT 0");
                        logger.info("Migrated schema: Added publicRemovalNotice to enforcement");
                    }
                }
            });

            this.db.all("PRAGMA table_info(groups)", (err, rows) => {
                if (!err && rows) {
                    const hasWelcomeCol = rows.some(r => r.name === 'welcomeMessageEnabled');
                    if (!hasWelcomeCol) {
                        this.db.run("ALTER TABLE groups ADD COLUMN welcomeMessageEnabled INTEGER DEFAULT 0");
                        logger.info("Migrated schema: Added welcomeMessageEnabled to groups");
                    }

                    const hasStatusCol = rows.some(r => r.name === 'status');
                    if (!hasStatusCol) {
                        this.db.run("ALTER TABLE groups ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
                        logger.info("Migrated schema: Added status to groups");
                    }
                }
            });

            // Migrate pending_group_actions.duration from INTEGER to TEXT if needed
            this.db.all("PRAGMA table_info(pending_group_actions)", (err, rows) => {
                if (!err && rows) {
                    const durationCol = rows.find(r => r.name === 'duration');
                    if (durationCol && durationCol.type === 'INTEGER') {
                        // SQLite doesn't support ALTER COLUMN, recreate the table
                        this.db.serialize(() => {
                            this.db.run(`CREATE TABLE IF NOT EXISTS pending_group_actions_new (
                                userJid TEXT PRIMARY KEY,
                                action TEXT NOT NULL,
                                duration TEXT,
                                optionsData TEXT NOT NULL,
                                createdAt TEXT NOT NULL
                            )`);
                            this.db.run(`INSERT OR IGNORE INTO pending_group_actions_new SELECT userJid, action, CAST(duration AS TEXT), optionsData, createdAt FROM pending_group_actions`);
                            this.db.run(`DROP TABLE pending_group_actions`);
                            this.db.run(`ALTER TABLE pending_group_actions_new RENAME TO pending_group_actions`);
                            logger.info('Migrated schema: pending_group_actions.duration to TEXT');
                        });
                    }
                }
            });

            // Migrate pending_group_members: add reminderSentAt column if missing
            this.db.all("PRAGMA table_info(pending_group_members)", (err, rows) => {
                if (!err && rows) {
                    const hasReminderCol = rows.some(r => r.name === 'reminderSentAt');
                    if (!hasReminderCol) {
                        this.db.run("ALTER TABLE pending_group_members ADD COLUMN reminderSentAt TEXT");
                        logger.info("Migrated schema: Added reminderSentAt to pending_group_members");
                    }
                }
            });

            // Migrate groups: add shabbatConfig, shabbatLocked, and new feature columns if missing
            this.db.all("PRAGMA table_info(groups)", (err2, rows2) => {
                if (!err2 && rows2) {
                    const hasShabbatConfig = rows2.some(r => r.name === 'shabbatConfig');
                    if (!hasShabbatConfig) {
                        this.db.run("ALTER TABLE groups ADD COLUMN shabbatConfig TEXT DEFAULT NULL");
                        logger.info("Migrated schema: Added shabbatConfig to groups");
                    }
                    const hasShabbatLocked = rows2.some(r => r.name === 'shabbatLocked');
                    if (!hasShabbatLocked) {
                        this.db.run("ALTER TABLE groups ADD COLUMN shabbatLocked INTEGER DEFAULT 0");
                        logger.info("Migrated schema: Added shabbatLocked to groups");
                    }
                    const hasGracePeriod = rows2.some(r => r.name === 'gracePeriodMinutes');
                    if (!hasGracePeriod) {
                        this.db.run("ALTER TABLE groups ADD COLUMN gracePeriodMinutes INTEGER DEFAULT 0");
                        logger.info("Migrated schema: Added gracePeriodMinutes to groups");
                    }
                    const hasPeriodicReminderEnabled = rows2.some(r => r.name === 'periodicReminderEnabled');
                    if (!hasPeriodicReminderEnabled) {
                        this.db.run("ALTER TABLE groups ADD COLUMN periodicReminderEnabled INTEGER DEFAULT 0");
                        logger.info("Migrated schema: Added periodicReminderEnabled to groups");
                    }
                    const hasPeriodicReminderInterval = rows2.some(r => r.name === 'periodicReminderIntervalHours');
                    if (!hasPeriodicReminderInterval) {
                        this.db.run("ALTER TABLE groups ADD COLUMN periodicReminderIntervalHours INTEGER DEFAULT 168");
                        logger.info("Migrated schema: Added periodicReminderIntervalHours to groups");
                    }
                    const hasRulesInDescription = rows2.some(r => r.name === 'rulesInDescription');
                    if (!hasRulesInDescription) {
                        this.db.run("ALTER TABLE groups ADD COLUMN rulesInDescription INTEGER DEFAULT 0");
                        logger.info("Migrated schema: Added rulesInDescription to groups");
                    }
                    const hasLastReminderAt = rows2.some(r => r.name === 'lastReminderAt');
                    if (!hasLastReminderAt) {
                        this.db.run("ALTER TABLE groups ADD COLUMN lastReminderAt TEXT DEFAULT NULL");
                        logger.info("Migrated schema: Added lastReminderAt to groups");
                    }
                    const hasWelcomeMessageCustom = rows2.some(r => r.name === 'welcomeMessageCustom');
                    if (!hasWelcomeMessageCustom) {
                        this.db.run("ALTER TABLE groups ADD COLUMN welcomeMessageCustom TEXT DEFAULT NULL");
                        logger.info("Migrated schema: Added welcomeMessageCustom to groups");
                    }
                    const hasPeriodicFrequency = rows2.some(r => r.name === 'periodicReminderFrequency');
                    if (!hasPeriodicFrequency) {
                        this.db.run("ALTER TABLE groups ADD COLUMN periodicReminderFrequency TEXT DEFAULT NULL");
                        logger.info("Migrated schema: Added periodicReminderFrequency to groups");
                    }
                    const hasPeriodicTime = rows2.some(r => r.name === 'periodicReminderTime');
                    if (!hasPeriodicTime) {
                        this.db.run("ALTER TABLE groups ADD COLUMN periodicReminderTime TEXT DEFAULT NULL");
                        logger.info("Migrated schema: Added periodicReminderTime to groups");
                    }
                    const hasPeriodicDayOfWeek = rows2.some(r => r.name === 'periodicReminderDayOfWeek');
                    if (!hasPeriodicDayOfWeek) {
                        this.db.run("ALTER TABLE groups ADD COLUMN periodicReminderDayOfWeek INTEGER DEFAULT NULL");
                        logger.info("Migrated schema: Added periodicReminderDayOfWeek to groups");
                    }
                    const hasPeriodicDayOfMonth = rows2.some(r => r.name === 'periodicReminderDayOfMonth');
                    if (!hasPeriodicDayOfMonth) {
                        this.db.run("ALTER TABLE groups ADD COLUMN periodicReminderDayOfMonth INTEGER DEFAULT NULL");
                        logger.info("Migrated schema: Added periodicReminderDayOfMonth to groups");
                    }
                    const hasPeriodicDateOfYear = rows2.some(r => r.name === 'periodicReminderDateOfYear');
                    if (!hasPeriodicDateOfYear) {
                        this.db.run("ALTER TABLE groups ADD COLUMN periodicReminderDateOfYear TEXT DEFAULT NULL");
                        logger.info("Migrated schema: Added periodicReminderDateOfYear to groups");
                    }
                }
            });

            // Helpful indexes
            this.db.run('CREATE INDEX IF NOT EXISTS idx_rules_group ON rules(groupId)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_rules_group_type ON rules(groupId, ruleType)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_warnings_group ON warnings(groupId)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_warnings_last_time ON warnings(lastWarningAt)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_exempt_group ON exempt_users(groupId)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_users_group ON users(groupId)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_groups_owner ON groups(ownerJid)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_groups_mgmt_group ON groups(mgmtGroupId)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_name_change_group_status ON group_name_change_requests(groupId, status)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_name_change_status_time ON group_name_change_requests(status, createdAt)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_enforcement_group_status ON enforcement_actions(groupId, status)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_enforcement_status_time ON enforcement_actions(status, createdAt)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_pending_members_group ON pending_group_members(groupId)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_pending_members_joined_time ON pending_group_members(joinedAt)');

            logger.info('Database initialized successfully');
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    _run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    _get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row || null);
            });
        });
    }

    _all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    _getWarningsResetDays() {
        const raw = Number(config.get('warnings.resetAfterDays', 60));
        if (!Number.isFinite(raw) || raw < 1) return 60;
        return Math.floor(raw);
    }

    _getWarningsExpiryThresholdIso() {
        const days = this._getWarningsResetDays();
        const ms = days * 24 * 60 * 60 * 1000;
        return new Date(Date.now() - ms).toISOString();
    }

    _isWarningExpired(lastWarningAt) {
        if (!lastWarningAt) return true;
        const last = new Date(lastWarningAt).getTime();
        if (Number.isNaN(last)) return true;
        const threshold = new Date(this._getWarningsExpiryThresholdIso()).getTime();
        return last < threshold;
    }

    // ── User Operations ──────────────────────────────────────────────────

    async getUser(jid) {
        return this._get('SELECT * FROM users WHERE jid = ?', [jid]);
    }

    async createUser(jid, language = 'he') {
        await this._run(
            'INSERT OR IGNORE INTO users (jid, language, createdAt) VALUES (?, ?, ?)',
            [jid, language, new Date().toISOString()]
        );

        return this.getUser(jid);
    }

    async updateUserLanguage(jid, language) {
        await this._run('UPDATE users SET language = ? WHERE jid = ?', [language, jid]);
    }

    async updateUserSetupState(jid, state) {
        const stateJson = typeof state === 'string' ? state : JSON.stringify(state);
        await this._run('UPDATE users SET setupState = ? WHERE jid = ?', [stateJson, jid]);
    }

    async updateUserGroup(jid, groupId) {
        await this._run('UPDATE users SET groupId = ? WHERE jid = ?', [groupId, jid]);

        if (groupId) {
            await this._run(
                'INSERT OR IGNORE INTO global_protected_users (jid, addedAt, source) VALUES (?, ?, ?)',
                [jid, new Date().toISOString(), 'setup_flow']
            );
        }
    }

    async getUserByGroup(groupId) {
        return this._get('SELECT * FROM users WHERE groupId = ?', [groupId]);
    }

    async isGlobalProtected(jid) {
        const row = await this._get(
            'SELECT jid FROM global_protected_users WHERE jid = ?',
            [jid]
        );
        return !!row;
    }

    async getGlobalProtectedUsers() {
        return this._all('SELECT * FROM global_protected_users ORDER BY addedAt ASC');
    }

    // ── Group Name Change Requests ──────────────────────────────────────

    async hasPendingGroupNameRequest(groupId, newName) {
        const row = await this._get(
            `SELECT requestId FROM group_name_change_requests
             WHERE groupId = ? AND newName = ? AND status = 'pending'`,
            [groupId, newName]
        );
        return !!row;
    }

    async createGroupNameChangeRequest(requestId, groupId, oldName, newName, reportTarget) {
        await this._run(
            `INSERT OR REPLACE INTO group_name_change_requests
             (requestId, groupId, oldName, newName, reportTarget, status, createdAt)
             VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
            [requestId, groupId, oldName || '', newName, reportTarget || 'dm', new Date().toISOString()]
        );
    }

    async getGroupNameChangeRequest(requestId) {
        return this._get('SELECT * FROM group_name_change_requests WHERE requestId = ?', [requestId]);
    }

    async resolveGroupNameChangeRequest(requestId, status, responderJid) {
        await this._run(
            `UPDATE group_name_change_requests
             SET status = ?, responderJid = ?, respondedAt = ?
             WHERE requestId = ?`,
            [status, responderJid, new Date().toISOString(), requestId]
        );
    }

    async getExpiredNameChangeRequests(hours = 12) {
        const threshold = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        return this._all(
            `SELECT * FROM group_name_change_requests WHERE status = 'pending' AND createdAt < ?`,
            [threshold]
        );
    }

    // ── Group Operations ─────────────────────────────────────────────────

    async getGroup(groupId) {
        return this._get('SELECT * FROM groups WHERE groupId = ?', [groupId]);
    }

    async getGroupByOwner(ownerJid) {
        return this._get('SELECT * FROM groups WHERE ownerJid = ?', [ownerJid]);
    }

    async getGroupByMgmtGroup(mgmtGroupId) {
        return this._get('SELECT * FROM groups WHERE mgmtGroupId = ? AND active = 1', [mgmtGroupId]);
    }

    async getGroupsByMgmtGroup(mgmtGroupId) {
        return this._all('SELECT * FROM groups WHERE mgmtGroupId = ? AND active = 1', [mgmtGroupId]);
    }

    async isGroupUsedAsMgmt(groupId) {
        const row = await this._get('SELECT groupId FROM groups WHERE mgmtGroupId = ? AND active = 1', [groupId]);
        return !!row;
    }

    async canOwnerClaimGroup(groupId, ownerJid) {
        const existing = await this.getGroup(groupId);
        if (!existing) return true;
        return existing.ownerJid === ownerJid;
    }

    async createGroup(groupId, ownerJid, groupName) {
        const existing = await this.getGroup(groupId);

        if (existing && existing.ownerJid !== ownerJid) {
            throw new Error('Group is already managed by another owner');
        }

        if (existing) {
            await this._run(
                'UPDATE groups SET groupName = ?, verified = 1, active = 1 WHERE groupId = ?',
                [groupName, groupId]
            );
            return;
        }

        await this._run(
            'INSERT INTO groups (groupId, ownerJid, groupName, verified, createdAt) VALUES (?, ?, ?, 1, ?)',
            [groupId, ownerJid, groupName, new Date().toISOString()]
        );
    }

    async updateGroupMgmt(groupId, mgmtGroupId) {
        await this._run(
            'UPDATE groups SET mgmtGroupId = ?, mgmtGroupVerified = 1 WHERE groupId = ?',
            [mgmtGroupId, groupId]
        );
    }

    async updateGroupReportTarget(groupId, reportTarget) {
        await this._run(
            'UPDATE groups SET reportTarget = ? WHERE groupId = ?',
            [reportTarget, groupId]
        );
    }

    async updateGroupWarningCount(groupId, count) {
        await this._run(
            'UPDATE groups SET warningCount = ? WHERE groupId = ?',
            [count, groupId]
        );
        // Reset all warning counters when the threshold changes
        await this._run('DELETE FROM warnings WHERE groupId = ?', [groupId]);
    }

    async updateGroupWelcomeMessage(groupId, enabled) {
        await this._run(
            'UPDATE groups SET welcomeMessageEnabled = ? WHERE groupId = ?',
            [enabled ? 1 : 0, groupId]
        );
    }

    async setGroupActive(groupId, active) {
        await this._run(
            'UPDATE groups SET active = ? WHERE groupId = ?',
            [active ? 1 : 0, groupId]
        );
    }

    async updateGroupName(groupId, groupName) {
        await this._run('UPDATE groups SET groupName = ? WHERE groupId = ?', [groupName, groupId]);
    }

    async updateGroupStatus(groupId, status) {
        await this._run('UPDATE groups SET status = ? WHERE groupId = ?', [status, groupId]);
    }

    async getPendingAdminActionGroups() {
        return this._all("SELECT * FROM groups WHERE status LIKE 'PENDING_ADMIN_ACTION%' OR status = 'PENDING_ADMIN_RESUME'");
    }

    // Alias used by checkAdminActionTimeouts
    async getGroupsWithPendingAdminAction() {
        return this.getPendingAdminActionGroups();
    }

    async getAllActiveGroups() {
        return this._all("SELECT * FROM groups WHERE active = 1 AND verified = 1 AND status = 'ACTIVE'");
    }

    async getPausedGroups() {
        return this._all("SELECT * FROM groups WHERE active = 1 AND verified = 1 AND status LIKE 'PAUSED_UNTIL:%'");
    }

    async getAllManagedGroups() {
        // All groups the bot should remain in, regardless of operational status (paused, pending admin action, etc.)
        return this._all("SELECT * FROM groups WHERE active = 1 AND verified = 1");
    }

    async getAllManagedGroupsForNameRefresh() {
        return this._all("SELECT * FROM groups WHERE active = 1 AND verified = 1");
    }

    async getAllGroups() {
        return this._all('SELECT * FROM groups WHERE verified = 1 ORDER BY createdAt ASC');
    }

    async getGroupErrors(groupId) {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const staleThreshold = new Date(Date.now() - 15 * 60 * 1000).toISOString();

        const failed = await this._get(
            `SELECT COUNT(*) as cnt FROM enforcement_actions WHERE groupId = ? AND status = 'failed' AND createdAt > ?`,
            [groupId, since24h]
        );
        const stale = await this._get(
            `SELECT COUNT(*) as cnt FROM enforcement_actions WHERE groupId = ? AND status = 'started' AND createdAt < ?`,
            [groupId, staleThreshold]
        );
        return {
            failedRecent: failed ? failed.cnt : 0,
            staleStuck: stale ? stale.cnt : 0
        };
    }

    async getAllGroupErrors() {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const staleThreshold = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const failed = await this._all(
            `SELECT groupId, COUNT(*) as cnt FROM enforcement_actions WHERE status = 'failed' AND createdAt > ? GROUP BY groupId`,
            [since24h]
        );
        const stale = await this._all(
            `SELECT groupId, COUNT(*) as cnt FROM enforcement_actions WHERE status = 'started' AND createdAt < ? GROUP BY groupId`,
            [staleThreshold]
        );
        const failedMap = {};
        const staleMap = {};
        failed.forEach(r => { failedMap[r.groupId] = r.cnt; });
        stale.forEach(r => { staleMap[r.groupId] = r.cnt; });
        return { failedMap, staleMap };
    }

    async getAllPendingNameChanges() {
        const rows = await this._all(
            `SELECT groupId, requestId FROM group_name_change_requests WHERE status = 'pending'`
        );
        const map = {};
        rows.forEach(r => { map[r.groupId] = r.requestId; });
        return map;
    }

    async deleteGroup(groupId) {
        await this._run('DELETE FROM groups WHERE groupId = ?', [groupId]);
        await this._run('DELETE FROM rules WHERE groupId = ?', [groupId]);
        await this._run('DELETE FROM enforcement WHERE groupId = ?', [groupId]);
        await this._run('DELETE FROM exempt_users WHERE groupId = ?', [groupId]);
        await this._run('DELETE FROM warnings WHERE groupId = ?', [groupId]);
        await this._run('DELETE FROM group_name_change_requests WHERE groupId = ?', [groupId]);
        await this._run('DELETE FROM enforcement_actions WHERE groupId = ?', [groupId]);
        await this._run('DELETE FROM pending_group_members WHERE groupId = ?', [groupId]);
    }

    // ── Rules Operations ─────────────────────────────────────────────────

    async addRule(groupId, ruleType, ruleData) {
        const data = typeof ruleData === 'string' ? ruleData : JSON.stringify(ruleData);
        await this._run(
            'INSERT INTO rules (groupId, ruleType, ruleData) VALUES (?, ?, ?)',
            [groupId, ruleType, data]
        );
    }

    async getRules(groupId) {
        const rows = await this._all('SELECT * FROM rules WHERE groupId = ? AND enabled = 1', [groupId]);
        return rows.map(r => {
            let ruleData;
            try {
                ruleData = JSON.parse(r.ruleData);
            } catch (e) {
                logger.error(`Corrupt ruleData for rule ${r.id} in group ${groupId}`, e);
                ruleData = null;
            }
            return { ...r, ruleData };
        });
    }

    async clearRules(groupId) {
        await this._run('DELETE FROM rules WHERE groupId = ?', [groupId]);
    }

    // ── Enforcement Operations ───────────────────────────────────────────

    async setEnforcement(groupId, config) {
        await this._run(
            `INSERT OR REPLACE INTO enforcement
             (groupId, deleteMessage, privateWarning, removeFromGroup, blockUser, sendReport, warnPrivateDm, publicRemovalNotice)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                groupId,
                config.deleteMessage ? 1 : 0,
                config.privateWarning ? 1 : 0,
                config.removeFromGroup ? 1 : 0,
                config.blockUser ? 1 : 0,
                config.sendReport ? 1 : 0,
                config.warnPrivateDm ? 1 : 0,
                config.publicRemovalNotice ? 1 : 0
            ]
        );
    }

    async getEnforcement(groupId) {
        const row = await this._get('SELECT * FROM enforcement WHERE groupId = ?', [groupId]);
        if (!row) {
            return {
                deleteMessage: true,
                privateWarning: true,
                removeFromGroup: true,
                blockUser: false,
                sendReport: true,
                warnPrivateDm: false,
                publicRemovalNotice: false
            };
        }
        return {
            deleteMessage: !!row.deleteMessage,
            privateWarning: !!row.privateWarning,
            removeFromGroup: !!row.removeFromGroup,
            blockUser: !!row.blockUser,
            sendReport: !!row.sendReport,
            warnPrivateDm: !!row.warnPrivateDm,
            publicRemovalNotice: !!row.publicRemovalNotice
        };
    }

    async createEnforcementAction(payload) {
        await this._run(
            `INSERT INTO enforcement_actions
             (actionId, groupId, userJid, reason, content, msgType, status, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                payload.actionId,
                payload.groupId,
                payload.userJid,
                payload.reason || '',
                payload.content || '',
                payload.msgType || '',
                payload.status || 'started',
                new Date().toISOString(),
                new Date().toISOString()
            ]
        );
    }

    async updateEnforcementActionStep(actionId, stepName, stepStatus, error = '') {
        const allowedSteps = ['deleteStatus', 'warningStatus', 'removeStatus', 'blockStatus', 'reportStatus'];
        if (!allowedSteps.includes(stepName)) return;

        await this._run(
            `UPDATE enforcement_actions
             SET ${stepName} = ?, error = CASE WHEN ? <> '' THEN ? ELSE error END, updatedAt = ?
             WHERE actionId = ?`,
            [stepStatus, error, error, new Date().toISOString(), actionId]
        );
    }

    async completeEnforcementAction(actionId, status, error = '') {
        await this._run(
            `UPDATE enforcement_actions
             SET status = ?, error = CASE WHEN ? <> '' THEN ? ELSE error END, updatedAt = ?
             WHERE actionId = ?`,
            [status, error, error, new Date().toISOString(), actionId]
        );
    }

    async getEnforcementAction(actionId) {
        return this._get('SELECT * FROM enforcement_actions WHERE actionId = ?', [actionId]);
    }

    async markStaleEnforcementActionsFailed(maxAgeMinutes = 15) {
        const threshold = new Date(Date.now() - maxAgeMinutes * 60000).toISOString();
        await this._run(
            `UPDATE enforcement_actions
             SET status = 'failed_stale',
                 error = CASE WHEN error IS NULL OR error = '' THEN 'Marked stale after restart' ELSE error END,
                 updatedAt = ?
             WHERE status IN ('started', 'warning_phase') AND createdAt < ?`,
            [new Date().toISOString(), threshold]
        );
    }

    // ── Exempt Users Operations ──────────────────────────────────────────

    async addExemptUser(groupId, jid) {
        await this._run(
            'INSERT OR IGNORE INTO exempt_users (groupId, jid, addedAt) VALUES (?, ?, ?)',
            [groupId, jid, new Date().toISOString()]
        );
    }

    async removeExemptUser(groupId, jid) {
        const result = await this._run(
            'DELETE FROM exempt_users WHERE groupId = ? AND jid = ?',
            [groupId, jid]
        );
        return result.changes > 0;
    }

    async isExempt(groupId, jid) {
        const row = await this._get(
            'SELECT * FROM exempt_users WHERE groupId = ? AND jid = ?',
            [groupId, jid]
        );
        return !!row;
    }

    async getExemptUsers(groupId) {
        return this._all('SELECT * FROM exempt_users WHERE groupId = ?', [groupId]);
    }

    async clearExemptUsers(groupId) {
        await this._run('DELETE FROM exempt_users WHERE groupId = ?', [groupId]);
    }

    // ── Warning Operations ───────────────────────────────────────────────

    async getWarningCount(groupId, userJid) {
        const row = await this._get(
            'SELECT count, lastWarningAt FROM warnings WHERE groupId = ? AND userJid = ?',
            [groupId, userJid]
        );
        if (!row) return 0;

        if (this._isWarningExpired(row.lastWarningAt)) {
            await this.resetWarnings(groupId, userJid);
            return 0;
        }

        return row.count;
    }

    async incrementWarning(groupId, userJid) {
        const now = new Date().toISOString();
        const expiryThreshold = this._getWarningsExpiryThresholdIso();

        // Use atomic INSERT OR REPLACE to handle both create and update in one transaction
        await this._run(
            `INSERT INTO warnings (groupId, userJid, count, lastWarningAt)
             VALUES (?, ?, 1, ?)
             ON CONFLICT(groupId, userJid) DO UPDATE SET
               count = CASE WHEN lastWarningAt < ? THEN 1 ELSE count + 1 END,
               lastWarningAt = ?`,
            [groupId, userJid, now, expiryThreshold, now]
        );

        // Now fetch the actual new count from the database
        const result = await this._get(
            'SELECT count FROM warnings WHERE groupId = ? AND userJid = ?',
            [groupId, userJid]
        );
        return result ? result.count : 1;
    }

    async resetWarnings(groupId, userJid) {
        await this._run(
            'DELETE FROM warnings WHERE groupId = ? AND userJid = ?',
            [groupId, userJid]
        );
    }

    async decrementWarning(groupId, userJid) {
        await this._run(
            'UPDATE warnings SET count = count - 1, lastWarningAt = ? WHERE groupId = ? AND userJid = ? AND count > 0',
            [new Date().toISOString(), groupId, userJid]
        );
    }

    async getActiveWarningsCount(groupId) {
        const threshold = this._getWarningsExpiryThresholdIso();
        const row = await this._get(
            'SELECT COUNT(*) as cnt FROM warnings WHERE groupId = ? AND count > 0 AND lastWarningAt >= ?',
            [groupId, threshold]
        );
        return row ? row.cnt : 0;
    }

    async cleanupExpiredWarnings() {
        const threshold = this._getWarningsExpiryThresholdIso();
        const result = await this._run(
            'DELETE FROM warnings WHERE lastWarningAt IS NULL OR lastWarningAt < ?',
            [threshold]
        );
        return result.changes || 0;
    }

    // ── Pending Group Members (Welcome Message) ──────────────────────────

    async addPendingMember(groupId, userJid) {
        await this._run(
            `INSERT OR IGNORE INTO pending_group_members (groupId, userJid, joinedAt, notified)
             VALUES (?, ?, ?, 0)`,
            [groupId, userJid, new Date().toISOString()]
        );
    }

    async getPendingMember(userJid) {
        return this._all('SELECT * FROM pending_group_members WHERE userJid = ?', [userJid]);
    }

    async isPendingMember(groupId, userJid) {
        const row = await this._get('SELECT * FROM pending_group_members WHERE groupId = ? AND userJid = ?', [groupId, userJid]);
        return !!row;
    }

    async markPendingMemberNotified(groupId, userJid) {
        await this._run(
            'UPDATE pending_group_members SET notified = 1 WHERE groupId = ? AND userJid = ?',
            [groupId, userJid]
        );
    }

    async removePendingMember(groupId, userJid) {
        await this._run(
            'DELETE FROM pending_group_members WHERE groupId = ? AND userJid = ?',
            [groupId, userJid]
        );
    }

    async addPendingRejoin(groupId, userJid) {
        await this._run(
            'INSERT OR REPLACE INTO pending_rejoin (groupId, userJid) VALUES (?, ?)',
            [groupId, userJid]
        );
    }

    async getPendingRejoin(groupId, userJid) {
        return this._get(
            'SELECT * FROM pending_rejoin WHERE groupId = ? AND userJid = ?',
            [groupId, userJid]
        );
    }

    async getPendingRejoinByUser(userJid) {
        return this._all(
            'SELECT * FROM pending_rejoin WHERE userJid = ?',
            [userJid]
        );
    }

    async removePendingRejoin(groupId, userJid) {
        await this._run(
            'DELETE FROM pending_rejoin WHERE groupId = ? AND userJid = ?',
            [groupId, userJid]
        );
    }

    async getExpiredPendingMembers(hours = 6) {
        const threshold = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        return this._all(
            'SELECT * FROM pending_group_members WHERE joinedAt < ?',
            [threshold]
        );
    }

    // Returns members who have been pending for reminderHours+ but NOT yet for evictHours,
    // and have not yet received a reminder.
    async getPendingMembersForReminder(reminderHours = 5, evictHours = 6) {
        const reminderThreshold = new Date(Date.now() - reminderHours * 60 * 60 * 1000).toISOString();
        const evictThreshold    = new Date(Date.now() - evictHours   * 60 * 60 * 1000).toISOString();
        return this._all(
            'SELECT * FROM pending_group_members WHERE joinedAt < ? AND joinedAt >= ? AND reminderSentAt IS NULL',
            [reminderThreshold, evictThreshold]
        );
    }

    async markPendingMemberReminderSent(groupId, userJid) {
        await this._run(
            'UPDATE pending_group_members SET reminderSentAt = ? WHERE groupId = ? AND userJid = ?',
            [new Date().toISOString(), groupId, userJid]
        );
    }

    // ── Pending Group Actions (Multi-Group Command Selection) ────────────

    async createPendingGroupAction(userJid, action, duration, optionsData) {
        await this._run(
            `INSERT OR REPLACE INTO pending_group_actions (userJid, action, duration, optionsData, createdAt)
             VALUES (?, ?, ?, ?, ?)`,
            [userJid, action, duration, JSON.stringify(optionsData), new Date().toISOString()]
        );
    }

    async getPendingGroupAction(userJid) {
        const row = await this._get(
            'SELECT * FROM pending_group_actions WHERE userJid = ?',
            [userJid]
        );
        if (row) {
            try {
                row.optionsData = JSON.parse(row.optionsData);
            } catch (e) {
                logger.error(`Corrupt optionsData for pending action of ${userJid}`, e);
                row.optionsData = null;
            }
        }
        return row;
    }

    async deletePendingGroupAction(userJid) {
        await this._run('DELETE FROM pending_group_actions WHERE userJid = ?', [userJid]);
    }

    async cleanupExpiredPendingGroupActions(minutes = 10) {
        const threshold = new Date(Date.now() - minutes * 60 * 1000).toISOString();
        const result = await this._run(
            'DELETE FROM pending_group_actions WHERE createdAt < ?',
            [threshold]
        );
        return result.changes || 0;
    }

    // ── Shabbat Operations ───────────────────────────────────────────────

    async updateGroupShabbatConfig(groupId, config) {
        const json = config ? JSON.stringify(config) : null;
        await this._run('UPDATE groups SET shabbatConfig = ? WHERE groupId = ?', [json, groupId]);
    }

    async getShabbatGroups() {
        return this._all("SELECT * FROM groups WHERE shabbatConfig IS NOT NULL AND active = 1");
    }

    async setShabbatLocked(groupId, locked) {
        await this._run('UPDATE groups SET shabbatLocked = ? WHERE groupId = ?', [locked ? 1 : 0, groupId]);
    }

    // ── Settings Operations ──────────────────────────────────────────────

    async getSetting(key, defaultValue = null) {
        const row = await this._get('SELECT value FROM settings WHERE key = ?', [key]);
        return row ? row.value : defaultValue;
    }

    async setSetting(key, value) {
        await this._run(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            [key, value.toString()]
        );
    }

    async deleteSetting(key) {
        await this._run('DELETE FROM settings WHERE key = ?', [key]);
    }

    // ── Learned phrases ──────────────────────────────────────────────────

    async addLearnedPhrase(phrase, listType, sourceMessage = null) {
        if (listType === 'allowed') {
            // Allowed phrases have their own table (no CHECK constraint conflict)
            await this._run(
                'INSERT OR IGNORE INTO allowed_phrases (phrase) VALUES (?)',
                [phrase]
            );
        } else {
            await this._run(
                'INSERT OR IGNORE INTO learned_phrases (phrase, list_type, source_message) VALUES (?, ?, ?)',
                [phrase, listType, sourceMessage]
            );
        }
    }

    async getLearnedPhrases() {
        return this._all('SELECT phrase, list_type FROM learned_phrases ORDER BY id ASC');
    }

    async getAllowedPhrases() {
        return this._all("SELECT phrase, 'allowed' AS list_type FROM allowed_phrases ORDER BY id ASC");
    }

    async removeAllowedPhrase(phrase) {
        await this._run('DELETE FROM allowed_phrases WHERE phrase = ?', [phrase.trim()]);
    }

    async removeCursePhrase(phrase) {
        await this._run('DELETE FROM learned_phrases WHERE phrase = ? AND list_type = ?', [phrase.trim(), 'forbidden']);
    }

    // ── Pending learned phrases (awaiting approval) ───────────────────────

    async addPendingLearnedPhrase(phrase, listType, sourceMessage = null) {
        const result = await this._run(
            'INSERT INTO pending_learned_phrases (phrase, list_type, source_message) VALUES (?, ?, ?)',
            [phrase, listType, sourceMessage]
        );
        return result.lastID;
    }

    async getPendingLearnedPhrase(id) {
        return this._get('SELECT * FROM pending_learned_phrases WHERE id = ?', [id]);
    }

    async getAllPendingLearnedPhrases() {
        return this._all('SELECT * FROM pending_learned_phrases ORDER BY id ASC');
    }

    async deletePendingLearnedPhrase(id) {
        await this._run('DELETE FROM pending_learned_phrases WHERE id = ?', [id]);
    }

    async isGroupOwner(jid) {
        const row = await this._get(
            'SELECT 1 FROM groups WHERE ownerJid = ? AND active = 1', [jid]
        );
        return !!row;
    }

    // ── Enforcement stats ─────────────────────────────────────────────────

    async incrementEnforcementStat(source) {
        await this._run(
            `INSERT INTO enforcement_stats (source, count, last_updated)
             VALUES (?, 1, datetime('now'))
             ON CONFLICT(source) DO UPDATE SET
                count = count + 1,
                last_updated = datetime('now')`,
            [source]
        );
    }

    async getEnforcementStats() {
        return this._all('SELECT source, count, last_updated FROM enforcement_stats ORDER BY count DESC');
    }

    async getLearnedPhrasesCount() {
        const row = await this._get('SELECT COUNT(*) as cnt FROM learned_phrases');
        return row ? row.cnt : 0;
    }

    async getPendingLearnedPhrasesCount() {
        const row = await this._get('SELECT COUNT(*) as cnt FROM pending_learned_phrases');
        return row ? row.cnt : 0;
    }

    // ── Grace Period / Join Times ─────────────────────────────────────────

    async recordMemberJoin(groupId, userJid) {
        await this._run(
            `INSERT OR REPLACE INTO member_join_times (groupId, userJid, joinedAt) VALUES (?, ?, ?)`,
            [groupId, userJid, new Date().toISOString()]
        );
    }

    async getMemberJoinTime(groupId, userJid) {
        return this._get('SELECT joinedAt FROM member_join_times WHERE groupId = ? AND userJid = ?', [groupId, userJid]);
    }

    async deleteMemberJoinTime(groupId, userJid) {
        await this._run('DELETE FROM member_join_times WHERE groupId = ? AND userJid = ?', [groupId, userJid]);
    }

    async updateGroupGracePeriod(groupId, minutes) {
        await this._run('UPDATE groups SET gracePeriodMinutes = ? WHERE groupId = ?', [minutes, groupId]);
    }

    // ── Periodic Reminder / Rules in Description ──────────────────────────

    async updateGroupPeriodicReminder(groupId, enabled, options = {}) {
        const {
            intervalHours = null,
            frequency = null,
            time = null,
            dayOfWeek = null,
            dayOfMonth = null,
            dateOfYear = null
        } = typeof options === 'object' ? options : { intervalHours: options };
        await this._run(
            `UPDATE groups SET
             periodicReminderEnabled = ?,
             periodicReminderIntervalHours = COALESCE(?, periodicReminderIntervalHours),
             periodicReminderFrequency = ?,
             periodicReminderTime = ?,
             periodicReminderDayOfWeek = ?,
             periodicReminderDayOfMonth = ?,
             periodicReminderDateOfYear = ?
             WHERE groupId = ?`,
            [enabled ? 1 : 0, intervalHours, frequency, time, dayOfWeek, dayOfMonth, dateOfYear, groupId]
        );
    }

    async updateGroupRulesInDescription(groupId, enabled) {
        await this._run('UPDATE groups SET rulesInDescription = ? WHERE groupId = ?', [enabled ? 1 : 0, groupId]);
    }

    async updateGroupLastReminderAt(groupId) {
        await this._run('UPDATE groups SET lastReminderAt = ? WHERE groupId = ?', [new Date().toISOString(), groupId]);
    }

    async getGroupsForPeriodicReminder() {
        return this._all(`
            SELECT * FROM groups
            WHERE active = 1 AND verified = 1 AND status = 'ACTIVE'
              AND periodicReminderEnabled = 1
        `);
    }

    // ── Custom Welcome Message ────────────────────────────────────────────

    async updateGroupWelcomeMessageCustom(groupId, text) {
        await this._run('UPDATE groups SET welcomeMessageCustom = ? WHERE groupId = ?', [text || null, groupId]);
    }

    // ── Clone Rules ───────────────────────────────────────────────────────

    async copyRulesFromGroup(sourceGroupId, targetGroupId) {
        const rules = await this._all('SELECT ruleType, ruleData, enabled FROM rules WHERE groupId = ?', [sourceGroupId]);
        for (const rule of rules) {
            await this._run(
                'INSERT INTO rules (groupId, ruleType, ruleData, enabled) VALUES (?, ?, ?, ?)',
                [targetGroupId, rule.ruleType, rule.ruleData, rule.enabled]
            );
        }
        return rules.length;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────

    close() {
        this.db.close();
    }
}

module.exports = new Database();
