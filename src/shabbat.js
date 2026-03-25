// src/shabbat.js - Shabbat mode: weekly time fetch (LLM) + group lock/unlock

const https = require('https');
const database = require('./database');
const logger = require('./logger');
const config = require('./config');

const SETTINGS_KEY = 'shabbat_times';
const MODEL = 'llama-3.1-8b-instant';
const LOCK_OFFSET_MS   = 5 * 60 * 1000;   // lock 5 min before entry
const UNLOCK_OFFSET_MS = 5 * 60 * 1000;   // unlock 5 min after exit

// ── Timezone helper ──────────────────────────────────────────────────────────

/**
 * Convert an Israel local time string (HH:MM) on a given YYYY-MM-DD date to UTC ms.
 * Israel is UTC+2 (winter, IST) or UTC+3 (summer, IDT).
 * We try UTC+2 first, then verify via Intl; fall back to UTC+3 if needed.
 */
function israelTimeToUtcMs(dateStr, timeStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [h, m] = timeStr.split(':').map(Number);

    // Try UTC+2 first
    for (const offsetHours of [2, 3]) {
        const utcH = h - offsetHours;
        const candidateMs = Date.UTC(year, month - 1, day, utcH, m, 0);
        const candidateDate = new Date(candidateMs);

        // Verify: get the Israel local hour for this UTC timestamp
        const israelHour = parseInt(
            candidateDate.toLocaleString('en-US', {
                timeZone: 'Asia/Jerusalem',
                hour: 'numeric',
                hour12: false
            }),
            10
        );
        if (israelHour === h) return candidateMs;
    }

    // Fallback: assume UTC+2
    return Date.UTC(year, month - 1, day, h - 2, m, 0);
}

// ── LLM fetch ────────────────────────────────────────────────────────────────

/**
 * Query Groq for Shabbat entry (Jerusalem) and exit (Netanya) times for the
 * coming Shabbat.  Returns { entryMs, exitMs, friday } or null on failure.
 */
async function fetchShabbatTimes() {
    const apiKey = config.get('groq.apiKey');
    if (!apiKey) {
        logger.warn('Shabbat time fetch skipped: no Groq API key');
        return null;
    }

    // Find the next Friday from today
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun … 6=Sat
    const daysUntilFriday = dayOfWeek === 5 ? 7 : (5 - dayOfWeek + 7) % 7;
    const friday = new Date(today);
    friday.setDate(today.getDate() + daysUntilFriday);
    const fridayStr = friday.toISOString().slice(0, 10); // YYYY-MM-DD

    const saturday = new Date(friday);
    saturday.setDate(friday.getDate() + 1);
    const saturdayStr = saturday.toISOString().slice(0, 10);

    const body = JSON.stringify({
        model: MODEL,
        messages: [
            {
                role: 'system',
                content:
                    'You are a Jewish calendar assistant.\n' +
                    'Given a date, calculate:\n' +
                    '1. Shabbat candle-lighting time in Jerusalem (18 minutes before sunset).\n' +
                    '2. Shabbat exit time in Netanya (when 3 stars are visible, ~42 min after sunset).\n' +
                    'Reply with EXACTLY this format and nothing else:\n' +
                    'ENTRY: HH:MM\n' +
                    'EXIT: HH:MM'
            },
            {
                role: 'user',
                content: `Shabbat entry time in Jerusalem for Friday ${fridayStr} and exit time in Netanya for Saturday ${saturdayStr}.`
            }
        ],
        max_tokens: 20,
        temperature: 0
    });

    return new Promise((resolve) => {
        const req = https.request(
            {
                hostname: 'api.groq.com',
                path: '/openai/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            },
            (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        const answer = (parsed.choices?.[0]?.message?.content || '').trim();
                        const entryMatch = answer.match(/ENTRY:\s*(\d{1,2}:\d{2})/);
                        const exitMatch  = answer.match(/EXIT:\s*(\d{1,2}:\d{2})/);

                        if (!entryMatch || !exitMatch) {
                            logger.warn(`Shabbat LLM: unexpected format: "${answer.slice(0, 80)}"`);
                            resolve(null);
                            return;
                        }

                        const entryMs = israelTimeToUtcMs(fridayStr,   entryMatch[1]);
                        const exitMs  = israelTimeToUtcMs(saturdayStr, exitMatch[1]);

                        logger.info(`Shabbat times fetched: entry=${entryMatch[1]} (${fridayStr}), exit=${exitMatch[1]} (${saturdayStr})`);
                        resolve({ entryMs, exitMs, friday: fridayStr, notifiedGroups: {} });
                    } catch (e) {
                        logger.warn('Shabbat LLM parse error', e.message);
                        resolve(null);
                    }
                });
            }
        );

        req.setTimeout(10000, () => { req.destroy(); resolve(null); });
        req.on('error', () => resolve(null));
        req.write(body);
        req.end();
    });
}

/**
 * Fetch Shabbat times from LLM and persist to settings table.
 * Called every Thursday by the scheduler.
 */
async function fetchAndSaveShabbatTimes() {
    logger.info('Fetching Shabbat times from LLM...');
    const times = await fetchShabbatTimes();
    if (!times) {
        logger.warn('Shabbat time fetch returned null — keeping previous times');
        return;
    }
    await database.setSetting(SETTINGS_KEY, JSON.stringify(times));
    logger.info(`Shabbat times saved: entry=${new Date(times.entryMs).toISOString()}, exit=${new Date(times.exitMs).toISOString()}`);
}

// ── Lock / Unlock / Notify ────────────────────────────────────────────────────

/**
 * Called every minute.  For each group with Shabbat mode enabled:
 *  - Send pre-Shabbat notification (once per week)
 *  - Lock the group 5 min before Shabbat entry
 *  - Unlock the group 5 min after Shabbat exit
 */
async function checkShabbatGroups(client) {
    const raw = await database.getSetting(SETTINGS_KEY);
    if (!raw) return;

    let times;
    try { times = JSON.parse(raw); } catch { return; }

    const now = Date.now();
    const lockTime   = times.entryMs - LOCK_OFFSET_MS;
    const unlockTime = times.exitMs  + UNLOCK_OFFSET_MS;

    const groups = await database.getShabbatGroups();
    if (!groups || groups.length === 0) return;

    // Track per-group notification state in the stored times object (avoid re-notifying)
    const notifiedGroups = times.notifiedGroups || {};
    let timesModified = false;

    for (const group of groups) {
        let shabbatCfg;
        try { shabbatCfg = JSON.parse(group.shabbatConfig); } catch { continue; }
        if (!shabbatCfg || !shabbatCfg.enabled) continue;

        // ── Pre-Shabbat notification ─────────────────────────────────
        const notifyMinutes = shabbatCfg.notifyMinutes || 0;
        if (notifyMinutes > 0) {
            const notifyTime = lockTime - notifyMinutes * 60 * 1000;
            const notifyKey  = `${group.groupId}_${times.friday}`;

            if (now >= notifyTime && now < lockTime && !notifiedGroups[notifyKey]) {
                try {
                    const remaining = Math.max(1, Math.round((lockTime - now) / 60000));
                    const notifyText = `שבת שלום, לידיעתכם הקבוצה תיסגר להודעות בעוד ${remaining} דקות.`;
                    await client.sendMessage(group.groupId, notifyText);
                    logger.info(`Shabbat pre-notify sent to ${group.groupName}`);
                    notifiedGroups[notifyKey] = true;
                    timesModified = true;
                } catch (e) {
                    logger.warn(`Shabbat notify failed for ${group.groupName}`, e.message);
                }
            }
        }

        // ── Lock ─────────────────────────────────────────────────────
        if (now >= lockTime && now < unlockTime) {
            if (!group.shabbatLocked) {
                try {
                    const chat = await client.getChatById(group.groupId);
                    await chat.setMessagesAdminsOnly(true);
                    await database.setShabbatLocked(group.groupId, true);
                    logger.info(`Shabbat locked: ${group.groupName}`);
                } catch (e) {
                    logger.warn(`Shabbat lock failed for ${group.groupName}`, e.message);
                }
            }
        }

        // ── Unlock ───────────────────────────────────────────────────
        if (now >= unlockTime && group.shabbatLocked) {
            try {
                const chat = await client.getChatById(group.groupId);
                await chat.setMessagesAdminsOnly(false);
                await database.setShabbatLocked(group.groupId, false);
                logger.info(`Shabbat unlocked: ${group.groupName}`);
            } catch (e) {
                logger.warn(`Shabbat unlock failed for ${group.groupName}`, e.message);
            }
        }
    }

    // Persist any notification state changes
    if (timesModified) {
        times.notifiedGroups = notifiedGroups;
        await database.setSetting(SETTINGS_KEY, JSON.stringify(times));
    }
}

module.exports = { fetchAndSaveShabbatTimes, checkShabbatGroups };
