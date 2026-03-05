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
    }

    async getUserByGroup(groupId) {
        return this._get('SELECT * FROM users WHERE groupId = ?', [groupId]);
    }

    // ── Group Operations ─────────────────────────────────────────────────

    async getGroup(groupId) {
        return this._get('SELECT * FROM groups WHERE groupId = ?', [groupId]);
    }

    async getGroupByOwner(ownerJid) {
        return this._get('SELECT * FROM groups WHERE ownerJid = ?', [ownerJid]);
    }

    async createGroup(groupId, ownerJid, groupName) {
        await this._run(
            'INSERT OR REPLACE INTO groups (groupId, ownerJid, groupName, verified, createdAt) VALUES (?, ?, ?, 1, ?)',
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
            'SELECT count FROM warnings WHERE groupId = ? AND userJid = ?',
            [groupId, userJid]
        );
        return row ? row.count : 0;
    }

    async incrementWarning(groupId, userJid) {
        const existing = await this._get(
            'SELECT * FROM warnings WHERE groupId = ? AND userJid = ?',
            [groupId, userJid]
        );
        if (existing) {
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
        const row = await this._get(
            'SELECT COUNT(*) as cnt FROM warnings WHERE groupId = ? AND count > 0',
            [groupId]
        );
        return row ? row.cnt : 0;
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
