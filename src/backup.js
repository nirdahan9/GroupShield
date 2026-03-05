// src/backup.js - Automated Backup System
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const config = require('./config');
const logger = require('./logger');

class BackupSystem {
    constructor() {
        this.backupDir = path.join(__dirname, '../', config.get('backup.backupDir', 'backups'));
        this.keepBackups = config.get('backup.keepBackups', 7);
        this.initialized = false;
    }

    initialize() {
        if (!config.get('backup.enabled', true)) {
            logger.info('Backup system disabled');
            return;
        }

        ['db', 'config'].forEach(dir => {
            const fullPath = path.join(this.backupDir, dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
            }
        });

        const schedule = config.get('backup.schedule', '0 3 * * *');
        cron.schedule(schedule, () => {
            logger.info('Scheduled backup triggered');
            this.createBackup();
        });

        this.initialized = true;
        logger.info(`Backup system initialized (schedule: ${schedule})`);
    }

    async createBackup() {
        if (!this.initialized) return { success: false, error: 'Not initialized' };

        logger.info('Creating backup...');
        const timestamp = this.getTimestamp();
        const files = [];

        try {
            // Backup database
            const dbFile = path.join(__dirname, '../', config.get('database.file', 'groupshield.db'));
            if (fs.existsSync(dbFile)) {
                const dbBackup = path.join(this.backupDir, 'db', `groupshield_${timestamp}.db`);
                fs.copyFileSync(dbFile, dbBackup);
                files.push(`DB: ${path.basename(dbBackup)}`);
            }

            // Backup config
            const configFile = path.join(__dirname, '../config.json');
            if (fs.existsSync(configFile)) {
                const configBackup = path.join(this.backupDir, 'config', `config_${timestamp.split('_')[0]}.json`);
                fs.copyFileSync(configFile, configBackup);
                files.push(`Config: ${path.basename(configBackup)}`);
            }

            await this.rotateBackups();
            logger.info(`Backup completed (${files.length} files)`);
            return { success: true, files };
        } catch (error) {
            logger.error('Backup failed', error);
            return { success: false, error: error.message };
        }
    }

    async rotateBackups() {
        for (const subdir of ['db', 'config']) {
            const dirPath = path.join(this.backupDir, subdir);
            if (!fs.existsSync(dirPath)) continue;
            const files = fs.readdirSync(dirPath)
                .filter(f => !f.startsWith('.'))
                .map(f => ({
                    name: f,
                    path: path.join(dirPath, f),
                    time: fs.statSync(path.join(dirPath, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);
            if (files.length > this.keepBackups) {
                for (const file of files.slice(this.keepBackups)) {
                    fs.unlinkSync(file.path);
                }
            }
        }
    }

    getTimestamp() {
        const now = new Date();
        return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    }
}

module.exports = new BackupSystem();
