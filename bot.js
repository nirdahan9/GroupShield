// bot.js - GroupShield v1.0 - Generic WhatsApp Group Enforcement Bot (Puppeteer/Chrome)
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const config = require('./src/config');
const logger = require('./src/logger');
const database = require('./src/database');
const { setRestartReason, getRestartReason, formatRestartMessage } = require('./src/restartTracker');
const { RateLimiter } = require('./src/utils');
const handlers = require('./src/handlers');
const health = require('./src/health');
const backup = require('./src/backup');

const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');
const VERSION = config.get('bot.version', '1.0.0');
const DEVELOPER_JID = config.get('developer.jid');

// ── Chrome Cache Cleanup ─────────────────────────────────────────────────
function cleanChromeCache() {
    const sessionDir = path.join(AUTH_DIR, 'session');
    if (!fs.existsSync(sessionDir)) return;

    const cachePatterns = ['Cache', 'Code Cache', 'GPUCache', 'Service Worker', 'blob_storage'];
    let cleaned = 0;

    try {
        const entries = fs.readdirSync(sessionDir);
        for (const entry of entries) {
            if (cachePatterns.some(p => entry.includes(p))) {
                const fullPath = path.join(sessionDir, entry);
                try {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                    cleaned++;
                } catch (e) { }
            }
        }
    } catch (e) { }

    if (cleaned > 0) logger.info(`Cleaned ${cleaned} Chrome cache directories`);
}

// ── Main Bot ─────────────────────────────────────────────────────────────
async function startBot() {
    cleanChromeCache();
    logger.info(`Starting GroupShield v${VERSION}`);

    const client = new Client({
        authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-extensions'
            ]
        }
    });

    const spamMap = new Map();
    const rateLimiter = new RateLimiter();

    // ── QR Code ──────────────────────────────────────────────────────
    client.on('qr', (qr) => {
        logger.info('⚠️ Scan QR code below:');
        qrcode.generate(qr, { small: true });
    });

    // ── Authentication ───────────────────────────────────────────────
    client.on('authenticated', () => {
        logger.info('✅ Authenticated');
    });

    client.on('auth_failure', (msg) => {
        logger.error(`❌ Authentication failed: ${msg}`);
        setRestartReason('error', 'Auth failure');
        process.exit(1);
    });

    // ── Ready ────────────────────────────────────────────────────────
    client.on('ready', async () => {
        logger.info('✅ GroupShield is ready!');

        // Initialize subsystems
        health.initialize(client);
        backup.initialize();

        // Schedule restarts and status messages
        scheduleRestarts();
        scheduleStatusMessages(client);

        // Send startup notification to developer
        handleStartupNotification(client);

        // Memory monitor
        setInterval(() => {
            const mem = process.memoryUsage().rss / 1024 / 1024;
            const maxMem = config.get('memory.maxMemoryMB', 400);
            if (mem > maxMem) {
                logger.warn(`Memory high (${mem.toFixed(0)}MB). Restarting...`);
                setRestartReason('critical_memory', `${mem.toFixed(0)}MB`);
                process.exit(0);
            }
        }, config.get('memory.checkIntervalMs', 300000));
    });

    // ── Disconnected ─────────────────────────────────────────────────
    client.on('disconnected', (reason) => {
        logger.error(`❌ Disconnected: ${reason}`);
        setRestartReason('error', `Disconnected: ${reason}`);
        process.exit(1);
    });

    // ── Message Handler ──────────────────────────────────────────────
    client.on('message', async (msg) => {
        try {
            health.recordMessage();
            await handlers.processMessage(client, msg, spamMap, rateLimiter);
        } catch (e) {
            logger.error('Message processing error', e);
            health.recordError();
        }
    });

    // ── Group Updates ────────────────────────────────────────────────
    client.on('group_update', async (update) => {
        try {
            await handlers.handleGroupUpdate(client, update);
        } catch (e) {
            logger.error('Group update error', e);
        }
    });

    // Initialize client
    client.initialize();
}

// ── Scheduling ───────────────────────────────────────────────────────────

function scheduleRestarts() {
    const schedule = config.get('scheduling.dailyRestart', '0 4 * * *');
    cron.schedule(schedule, () => {
        logger.info('Scheduled restart');
        setRestartReason('scheduled', schedule);
        process.exit(0);
    });
}

function scheduleStatusMessages(client) {
    const schedule = config.get('scheduling.statusMessages', '0 8,12,16,20 * * *');
    cron.schedule(schedule, async () => {
        await sendStatusToDeveloper(client);
    });
}

async function sendStatusToDeveloper(client) {
    try {
        const status = await handlers.buildStatusMessage(client);
        await client.sendMessage(DEVELOPER_JID, status);
    } catch (e) {
        logger.error('Failed to send status', e);
    }
}

function handleStartupNotification(client) {
    setTimeout(async () => {
        try {
            const restartData = getRestartReason();
            const msg = formatRestartMessage(VERSION, restartData);
            await client.sendMessage(DEVELOPER_JID, msg);
        } catch (e) {
            logger.error('Failed to send startup notification', e);
        }
    }, 5000);
}

// ── Graceful Shutdown ────────────────────────────────────────────────────

process.on('SIGINT', () => {
    logger.info('SIGINT received');
    setRestartReason('sigint', 'Manual stop');
    database.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('SIGTERM received');
    database.close();
    process.exit(0);
});

// ── Run ──────────────────────────────────────────────────────────────────
startBot();
