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
                         FROM users`);

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

        await this._run(
            'INSERT OR IGNORE INTO global_protected_users (jid, addedAt, source) VALUES (?, ?, ?)',
            [jid, new Date().toISOString(), 'setup_flow']
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

    async getAllActiveGroups() {
        return this._all('SELECT * FROM groups WHERE active = 1 AND verified = 1');
    }

    async deleteGroup(groupId) {
        await this._run('DELETE FROM groups WHERE groupId = ?', [groupId]);
        await this._run('DELETE FROM rules WHERE groupId = ?', [groupId]);
        await this._run('DELETE FROM enforcement WHERE groupId = ?', [groupId]);
        await this._run('DELETE FROM exempt_users WHERE groupId = ?', [groupId]);
        await this._run('DELETE FROM warnings WHERE groupId = ?', [groupId]);
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
        return rows.map(r => ({
            ...r,
            ruleData: JSON.parse(r.ruleData)
        }));
    }

    async clearRules(groupId) {
        await this._run('DELETE FROM rules WHERE groupId = ?', [groupId]);
    }

    // ── Enforcement Operations ───────────────────────────────────────────

    async setEnforcement(groupId, config) {
        await this._run(
            `INSERT OR REPLACE INTO enforcement 
             (groupId, deleteMessage, privateWarning, removeFromGroup, blockUser, sendReport)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                groupId,
                config.deleteMessage ? 1 : 0,
                config.privateWarning ? 1 : 0,
                config.removeFromGroup ? 1 : 0,
                config.blockUser ? 1 : 0,
                config.sendReport ? 1 : 0
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
                sendReport: true
            };
        }
        return {
            deleteMessage: !!row.deleteMessage,
            privateWarning: !!row.privateWarning,
            removeFromGroup: !!row.removeFromGroup,
            blockUser: !!row.blockUser,
            sendReport: !!row.sendReport
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
        const existing = await this._get(
            'SELECT * FROM warnings WHERE groupId = ? AND userJid = ?',
            [groupId, userJid]
        );
        if (existing) {
            if (this._isWarningExpired(existing.lastWarningAt)) {
                await this._run(
                    'UPDATE warnings SET count = 1, lastWarningAt = ? WHERE groupId = ? AND userJid = ?',
                    [new Date().toISOString(), groupId, userJid]
                );
                return 1;
            }

            await this._run(
                'UPDATE warnings SET count = count + 1, lastWarningAt = ? WHERE groupId = ? AND userJid = ?',
                [new Date().toISOString(), groupId, userJid]
            );
            return existing.count + 1;
        } else {
            await this._run(
                'INSERT INTO warnings (groupId, userJid, count, lastWarningAt) VALUES (?, ?, 1, ?)',
                [groupId, userJid, new Date().toISOString()]
            );
            return 1;
        }
    }

    async resetWarnings(groupId, userJid) {
        await this._run(
            'DELETE FROM warnings WHERE groupId = ? AND userJid = ?',
            [groupId, userJid]
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

    // ── Lifecycle ────────────────────────────────────────────────────────

    close() {
        this.db.close();
    }
}

module.exports = new Database();
