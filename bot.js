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
const { RateLimiter, buildGroupRulesSummary } = require('./src/utils');
const { t } = require('./src/i18n');
const handlers = require('./src/handlers');
const { buildFullGroupsStatus } = require('./src/commands');
const health = require('./src/health');
const backup = require('./src/backup');
const shabbat = require('./src/shabbat');

const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');
const VERSION = config.get('bot.version', '1.0.0');
const DEVELOPER_JID = config.get('developer.jid');
const runtime = {
    readyInitialized: false,
    intervals: [],
    cronTasks: []
};

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
                } catch (e) { logger.warn(`Could not remove Chrome cache entry: ${fullPath}`, e.message); }
            }
        }
    } catch (e) { logger.warn('Could not read Chrome cache directory for cleanup', e.message); }

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
        if (runtime.readyInitialized) {
            logger.warn('Ready event received again - skipping duplicate scheduler/interval initialization');
            return;
        }
        runtime.readyInitialized = true;

        logger.info('✅ GroupShield is ready!');

        // Initialize subsystems
        health.initialize(client);
        backup.initialize();

        // Load previously learned phrases from DB into the live curse/context lists
        require('./src/cursesList').initLearnedPhrases();

        // Schedule restarts and status messages
        runtime.cronTasks.push(scheduleRestarts());
        runtime.cronTasks.push(scheduleStatusMessages(client));
        runtime.cronTasks.push(scheduleWarningsCleanup());
        runtime.cronTasks.push(scheduleUnknownGroupExit(client));
        runtime.cronTasks.push(schedulePendingMembersCleanup(client));
        runtime.cronTasks.push(schedulePeriodicReminders(client));
        runtime.cronTasks.push(scheduleShabbatFetch(client));
        runtime.cronTasks.push(scheduleHolidayFetch(client));

        // Fetch holiday times for current year on startup (non-blocking)
        shabbat.fetchAndSaveHolidayTimes().then(h => {
            if (!h) logger.warn('Holiday fetch on startup failed — Shabbat-only mode until restart');
            else logger.info(`Startup: loaded ${h.length} holiday windows`);
        }).catch(e => logger.error('Holiday fetch startup error', e));

        // Check every minute whether any Shabbat/holiday group needs to be locked/unlocked/notified
        const shabbatCheckHandle = setInterval(async () => {
            try { await shabbat.checkShabbatAndHolidayGroups(client); } catch (e) {
                logger.warn('Shabbat/holiday check failed', e.message);
            }
        }, 60 * 1000);
        runtime.intervals.push(shabbatCheckHandle);

        // Mark stale enforcement actions after restart and start group-name refresh loop
        await database.markStaleEnforcementActionsFailed(15);
        const cleanedWarnings = await database.cleanupExpiredWarnings();
        if (cleanedWarnings > 0) {
            logger.info(`Expired warnings cleanup removed ${cleanedWarnings} rows`);
        }
        await handlers.refreshManagedGroupNames(client);
        const groupNameRefreshMs = config.get('scheduling.groupNameRefreshIntervalMs', 300000);
        const groupNameRefreshHandle = setInterval(async () => {
            await handlers.refreshManagedGroupNames(client);
        }, groupNameRefreshMs);
        runtime.intervals.push(groupNameRefreshHandle);

        const spamCleanupHandle = scheduleSpamMapCleanup(spamMap);
        runtime.intervals.push(spamCleanupHandle);

        // Check for expired admin-action timeouts every 30 minutes
        const adminTimeoutHandle = setInterval(async () => {
            try { await handlers.checkAdminActionTimeouts(client); } catch (e) {
                logger.warn('Admin action timeout check failed', e.message);
            }
        }, 30 * 60 * 1000);
        runtime.intervals.push(adminTimeoutHandle);

        // Send startup notification to developer
        handleStartupNotification(client);

        // Memory monitor
        const memoryMonitorHandle = setInterval(() => {
            const mem = process.memoryUsage().rss / 1024 / 1024;
            const maxMem = config.get('memory.maxMemoryMB', 400);
            if (mem > maxMem) {
                logger.warn(`Memory high (${mem.toFixed(0)}MB). Restarting...`);
                setRestartReason('critical_memory', `${mem.toFixed(0)}MB`);
                process.exit(0);
            }
        }, config.get('memory.checkIntervalMs', 300000));
        runtime.intervals.push(memoryMonitorHandle);
    });

    // ── Disconnected ─────────────────────────────────────────────────
    client.on('disconnected', (reason) => {
        logger.error(`❌ Disconnected: ${reason}`);
        setRestartReason('error', `Disconnected: ${reason}`);
        process.exit(1);
    });

    // ── Call Handler (Auto-Reject) ───────────────────────────────────
    client.on('call', async (call) => {
        logger.info(`דחיית שיחה נכנסת מאת: ${call.from}`);
        try {
            await call.reject();
        } catch (e) {
            logger.error(`שגיאה בדחיית שיחה מאת ${call.from}: ${e.message}`);
        }
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

    // ── Group Notifications ──────────────────────────────────────────
    const handleNotification = async (notification) => {
        try {
            await handlers.handleGroupNotification(client, notification);
        } catch (e) {
            logger.error('Group notification error', e);
        }
    };

    client.on('group_join', handleNotification);
    client.on('group_leave', handleNotification);
    client.on('group_admin_changed', handleNotification);
    client.on('group_update', handleNotification);

    // Initialize client
    client.initialize();
}

// ── Scheduling ───────────────────────────────────────────────────────────

function scheduleRestarts() {
    const schedule = getValidCronOrDefault('scheduling.dailyRestart', '0 6 * * *');
    return cron.schedule(schedule, () => {
        logger.info('Scheduled restart');
        setRestartReason('scheduled', schedule);
        process.exit(0);
    }, { timezone: 'Asia/Jerusalem' });
}

function scheduleStatusMessages(client) {
    const schedule = getValidCronOrDefault('scheduling.statusMessages', '0 10,14,18,22 * * *');
    return cron.schedule(schedule, async () => {
        await sendStatusToDeveloper(client);
    }, { timezone: 'Asia/Jerusalem' });
}

function scheduleShabbatFetch(client) {
    // Every Thursday at 13:00 Israel time (Asia/Jerusalem) — handles DST automatically
    const schedule = getValidCronOrDefault('scheduling.shabbatFetch', '0 13 * * 4');
    return cron.schedule(schedule, async () => {
        let times = null;
        try {
            times = await shabbat.fetchAndSaveShabbatTimes();
        } catch (e) {
            logger.error('Shabbat time fetch failed', e);
        }

        if (!DEVELOPER_JID) return;
        if (times) {
            try {
                const msg =
                    `🕯️ *GroupShield — שעות שבת נשמרו*\n\n` +
                    `⬇️ כניסת שבת: *${shabbat.formatIsraelTime(times.entryMs)}*\n` +
                    `⬆️ יציאת שבת: *${shabbat.formatIsraelTime(times.exitMs)}*\n\n` +
                    `(שעון ישראל)`;
                await client.sendMessage(DEVELOPER_JID, msg);
            } catch (e) {
                logger.warn('Failed to send Shabbat times notification to developer', e.message);
            }
        } else {
            // Fetch failed — start interactive recovery flow with developer
            await shabbat.initiateRecovery(client, DEVELOPER_JID);
        }
    }, { timezone: 'Asia/Jerusalem' });
}

function scheduleHolidayFetch(client) {
    // Every January 1st at 08:00 Israel time — fetch the new year's holiday windows
    const schedule = getValidCronOrDefault('scheduling.holidayFetch', '0 8 1 1 *');
    return cron.schedule(schedule, async () => {
        const year = new Date().getFullYear();
        let holidays = null;
        try {
            holidays = await shabbat.fetchAndSaveHolidayTimes(year);
        } catch (e) {
            logger.error(`Annual holiday fetch failed for ${year}`, e);
        }

        if (!DEVELOPER_JID) return;
        try {
            await client.sendMessage(DEVELOPER_JID, holidays
                ? `🕍 *GroupShield — שעות חגים נשמרו לשנת ${year}*\nנשמרו ${holidays.length} חלונות סגירה לחגים.`
                : `⚠️ *GroupShield — שגיאה בשליפת שעות חגים לשנת ${year}*\nשמירת שבת תמשיך לפעול כרגיל. נסה ריסטארט לניסיון חוזר.`
            );
        } catch (e) {
            logger.warn('Failed to send holiday fetch notification', e.message);
        }
    }, { timezone: 'Asia/Jerusalem' });
}

function scheduleWarningsCleanup() {
    const schedule = getValidCronOrDefault('scheduling.warningsCleanup', '15 6 * * *');
    return cron.schedule(schedule, async () => {
        try {
            const removed = await database.cleanupExpiredWarnings();
            if (removed > 0) {
                logger.info(`Scheduled warnings cleanup removed ${removed} rows`);
            }
        } catch (e) {
            logger.error('Scheduled warnings cleanup failed', e);
        }
    }, { timezone: 'Asia/Jerusalem' });
}

function scheduleUnknownGroupExit(client) {
    const enabled = config.get('scheduling.unknownGroupExitEnabled', true);
    if (!enabled) return null;

    const schedule = getValidCronOrDefault('scheduling.unknownGroupExit', '30 6 * * *');
    return cron.schedule(schedule, async () => {
        try {
            const dbFilePath = path.join(__dirname, config.get('database.file', 'groupshield.db'));
            if (!fs.existsSync(dbFilePath)) {
                logger.warn(`Unknown-group daily cleanup skipped: database file not found at ${dbFilePath}`);
                return;
            }

            const activeGroups = await database.getAllManagedGroups();
            const allowedGroupIds = new Set();
            activeGroups.forEach(g => {
                allowedGroupIds.add(g.groupId);
                if (g.mgmtGroupId) allowedGroupIds.add(g.mgmtGroupId);
            });

            const chats = await client.getChats();
            const groups = chats.filter(c => c.isGroup);

            let leftCount = 0;
            for (const g of groups) {
                const gid = g.id && g.id._serialized;
                if (!gid) continue;

                if (!allowedGroupIds.has(gid)) {
                    try {
                        await g.leave();
                        leftCount++;
                    } catch (e) {
                        logger.warn(`Failed leaving unknown group ${gid}`);
                    }
                }
            }

            logger.info(`Unknown-group daily cleanup finished (left ${leftCount} groups)`);
        } catch (e) {
            logger.error('Unknown-group daily cleanup failed', e);
        }
    }, { timezone: 'Asia/Jerusalem' });
}

function schedulePendingMembersCleanup(client) {
    const schedule = getValidCronOrDefault('scheduling.pendingMembersCleanup', '0 * * * *'); // Run every hour
    return cron.schedule(schedule, async () => {
        try {
            // Step 1: Send 5-hour reminder to members who haven't approved yet
            const reminderMembers = await database.getPendingMembersForReminder(5, 6);
            for (const member of (reminderMembers || [])) {
                try {
                    const groupConfig = await database.getGroup(member.groupId);
                    if (groupConfig) {
                        const ownerUser = await database.getUser(groupConfig.ownerJid);
                        const lang = ownerUser ? ownerUser.language || 'he' : 'he';
                        await client.sendMessage(
                            member.userJid,
                            t('welcome_reminder', lang, { groupName: groupConfig.groupName }),
                            { linkPreview: false }
                        );
                        logger.info(`Sent 5h approval reminder to ${member.userJid} for ${groupConfig.groupName}`);
                    }
                } catch (e) {
                    logger.warn(`Failed to send 5h reminder to ${member.userJid}`, e.message);
                }
                await database.markPendingMemberReminderSent(member.groupId, member.userJid);
            }

            // Step 2: Remove members who still haven't approved after 6 hours
            const expiredMembers = await database.getExpiredPendingMembers(6);
            if (!expiredMembers || expiredMembers.length === 0) return;

            logger.info(`Found ${expiredMembers.length} expired pending members to remove`);

            for (const member of expiredMembers) {
                try {
                    const chat = await client.getChatById(member.groupId);
                    await chat.removeParticipants([member.userJid]);
                    logger.info(`Removed expired pending member ${member.userJid} from group ${member.groupId}`);
                } catch (e) {
                    logger.error(`Failed removing expired pending member ${member.userJid} from ${member.groupId}`, e);
                }
                // Always remove from DB so we don't keep retrying if the bot lacks permissions
                await database.removePendingMember(member.groupId, member.userJid);
            }
        } catch (e) {
            logger.error('Pending members cleanup failed', e);
        }
    }, { timezone: 'Asia/Jerusalem' });
}

function schedulePeriodicReminders(client) {
    // Runs every hour — checks which groups need a rules reminder
    return cron.schedule('0 * * * *', async () => {
        try {
            const groups = await database.getGroupsForPeriodicReminder();
            if (!groups || groups.length === 0) return;

            for (const groupConfig of groups) {
                try {
                    const ownerUser = await database.getUser(groupConfig.ownerJid);
                    const lang = ownerUser ? ownerUser.language || 'he' : 'he';

                    const rules = await database.getRules(groupConfig.groupId);
                    const enf = await database.getEnforcement(groupConfig.groupId);
                    const rulesSummary = buildGroupRulesSummary(groupConfig, rules, enf, t, lang);

                    const reminderText = t('periodic_reminder_message', lang, {
                        groupName: groupConfig.groupName,
                        rulesSummary
                    });

                    await client.sendMessage(groupConfig.groupId, reminderText, { linkPreview: false });
                    await database.updateGroupLastReminderAt(groupConfig.groupId);
                    logger.info(`Sent periodic rules reminder to ${groupConfig.groupName}`);

                    // Update group description if enabled
                    if (groupConfig.rulesInDescription) {
                        try {
                            const chat = await client.getChatById(groupConfig.groupId);
                            await chat.setDescription(rulesSummary.slice(0, 500));
                        } catch (e) {
                            logger.warn(`Failed to update description for ${groupConfig.groupName}`, e);
                        }
                    }
                } catch (e) {
                    logger.error(`Periodic reminder failed for group ${groupConfig.groupId}`, e);
                }
            }
        } catch (e) {
            logger.error('schedulePeriodicReminders error', e);
        }
    }, { timezone: 'Asia/Jerusalem' });
}

function getValidCronOrDefault(configKey, fallback) {
    const configured = config.get(configKey, fallback);
    if (cron.validate(configured)) return configured;
    logger.warn(`Invalid cron for ${configKey}: "${configured}". Using fallback "${fallback}"`);
    return fallback;
}

function scheduleSpamMapCleanup(spamMap) {
    const intervalMs = config.get('scheduling.spamMapCleanupIntervalMs', 600000);
    const ttlMs = config.get('scheduling.spamMapEntryTtlMs', 1800000);

    return setInterval(() => {
        const now = Date.now();
        let removed = 0;
        for (const [key, value] of spamMap.entries()) {
            if (!value || !value.time || (now - value.time) > ttlMs) {
                spamMap.delete(key);
                removed++;
            }
        }
        if (removed > 0) {
            logger.debug(`Spam map cleanup removed ${removed} stale entries`);
        }
    }, intervalMs);
}

function cleanupRuntimeResources() {
    for (const task of runtime.cronTasks) {
        try {
            task && task.stop && task.stop();
        } catch (e) {
            logger.warn('Failed stopping cron task during shutdown');
        }
    }
    runtime.cronTasks = [];

    for (const handle of runtime.intervals) {
        clearInterval(handle);
    }
    runtime.intervals = [];
}

async function sendStatusToDeveloper(client) {
    try {
        const status = await buildFullGroupsStatus('he');
        await client.sendMessage(DEVELOPER_JID, status);
    } catch (e) {
        logger.error('Failed to send status', e);
    }
}

function handleStartupNotification(client) {
    setTimeout(async () => {
        try {
            const restartData = getRestartReason();
            const restartLine = formatRestartMessage(VERSION, restartData);
            const statusMsg = await buildFullGroupsStatus('he');
            await client.sendMessage(DEVELOPER_JID, restartLine + '\n\n' + statusMsg);
            logger.info('Startup notification sent to developer');
        } catch (e) {
            logger.error('Failed to send startup notification', e);
        }
    }, 5000);
}

// ── Graceful Shutdown ────────────────────────────────────────────────────

process.on('SIGINT', () => {
    logger.info('SIGINT received');
    setRestartReason('sigint', 'Manual stop');
    cleanupRuntimeResources();
    database.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('SIGTERM received');
    setRestartReason('sigterm', 'System stop');
    cleanupRuntimeResources();
    database.close();
    process.exit(0);
});

// ── Run ──────────────────────────────────────────────────────────────────
startBot();
