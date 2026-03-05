// src/health.js - Health Monitoring System (adapted for GroupShield)
const os = require('os');
const config = require('./config');
const logger = require('./logger');
const database = require('./database');
const { setRestartReason } = require('./restartTracker');

class HealthMonitor {
    constructor() {
        this.lastMessageTime = Date.now();
        this.errorCount = 0;
        this.errorWindow = [];
        this.client = null;
    }

    initialize(client) {
        this.client = client;
        this.startMonitoring();
        logger.info('Health monitoring initialized');
    }

    startMonitoring() {
        const interval = config.get('health.checkIntervalMs', 300000);
        setInterval(() => this.performHealthCheck(), interval);
    }

    async performHealthCheck() {
        logger.debug('Performing health check...');
        const issues = [];

        // Check 1: Connectivity
        const connectivity = await this.checkConnectivity();
        if (!connectivity.healthy) issues.push(connectivity.issue);

        // Check 2: Error Rate
        const errors = this.checkErrorRate();
        if (!errors.healthy) issues.push(errors.issue);

        // Check 3: Memory
        const memory = this.checkMemory();
        if (!memory.healthy) issues.push(memory.issue);

        if (issues.length > 0) {
            logger.warn(`Health issues: ${issues.join(', ')}`);
            if (config.get('health.enableSelfHealing', true)) {
                await this.selfHeal(issues);
            }
        }

        return { healthy: issues.length === 0, issues, timestamp: new Date().toISOString() };
    }

    async checkConnectivity() {
        try {
            if (this.client && this.client.info) {
                const state = await this.client.getState();
                if (state === 'CONNECTED') return { healthy: true };
                return { healthy: false, issue: `Client state: ${state}` };
            }
            return { healthy: false, issue: 'Client not initialized' };
        } catch (error) {
            return { healthy: false, issue: `Connectivity: ${error.message}` };
        }
    }

    checkErrorRate() {
        const now = Date.now();
        this.errorWindow = this.errorWindow.filter(t => now - t < 3600000);
        if (this.errorWindow.length > 10) {
            return { healthy: false, issue: `High error rate: ${this.errorWindow.length}/hour` };
        }
        return { healthy: true };
    }

    checkMemory() {
        const processRss = process.memoryUsage().rss;
        const maxMem = (config.get('memory.maxMemoryMB', 400)) * 1024 * 1024;
        if (processRss > maxMem) {
            return { healthy: false, issue: `High memory: ${(processRss / 1024 / 1024).toFixed(0)}MB` };
        }
        return { healthy: true };
    }

    async selfHeal(issues) {
        for (const issue of issues) {
            if (issue.includes('High memory')) {
                logger.error(`Memory critical, restarting...`);
                setRestartReason('critical_memory', issue);
                setTimeout(() => process.exit(0), 1000);
            }
        }
    }

    recordMessage() {
        this.lastMessageTime = Date.now();
    }

    recordError() {
        this.errorCount++;
        this.errorWindow.push(Date.now());
    }

    async getHealthStatus() {
        const check = await this.performHealthCheck();
        const uptime = process.uptime();
        const memory = process.memoryUsage();

        return {
            status: check.healthy ? '🟢 Healthy' : '🟡 Issues detected',
            uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
            memory: `${(memory.rss / 1024 / 1024).toFixed(0)}MB`,
            errorCount: this.errorWindow.length,
            issues: check.issues,
            timestamp: check.timestamp
        };
    }
}

module.exports = new HealthMonitor();
