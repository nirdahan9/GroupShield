// src/shabbat.js - Shabbat mode: weekly time fetch (LLM) + group lock/unlock

const https = require('https');
const database = require('./database');
const logger = require('./logger');
const config = require('./config');

const SETTINGS_KEY  = 'shabbat_times';
const RECOVERY_KEY  = 'shabbat_recovery';
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
 * Format a UTC timestamp as Israel local time string (HH:MM, DD/MM).
 */
function formatIsraelTime(ms) {
    const d = new Date(ms);
    const time = d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false });
    const date = d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit' });
    return `${time} (${date})`;
}

/**
 * Fetch Shabbat times from LLM and persist to settings table.
 * Called every Thursday by the scheduler.
 * Returns the saved times object on success, or null on failure.
 */
async function fetchAndSaveShabbatTimes() {
    logger.info('Fetching Shabbat times from LLM...');
    const times = await fetchShabbatTimes();
    if (!times) {
        logger.warn('Shabbat time fetch returned null — keeping previous times');
        return null;
    }
    await database.setSetting(SETTINGS_KEY, JSON.stringify(times));
    logger.info(`Shabbat times saved: entry=${new Date(times.entryMs).toISOString()}, exit=${new Date(times.exitMs).toISOString()}`);
    return times;
}

// ── Lock / Unlock / Notify ────────────────────────────────────────────────────

/**
 * Alert the group owner about a Shabbat lock/unlock failure.
 */
async function alertOwner(client, ownerJid, message) {
    try { await client.sendMessage(ownerJid, message); } catch (_) {}
}

/**
 * Called every minute.  For each group with Shabbat mode enabled:
 *  - Send pre-Shabbat notification (once per week)
 *  - Lock the group 5 min before Shabbat entry (and re-lock if someone opens it during Shabbat)
 *  - Unlock the group 5 min after Shabbat exit
 *  - Alert the owner on any lock/unlock failure
 *
 * State sync: the actual WhatsApp announce-flag is always read to handle
 * cases where the group was already locked/unlocked externally (or the bot
 * restarted mid-Shabbat).
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

        // ── Read actual WhatsApp group state ─────────────────────────
        let chat, isActuallyLocked;
        try {
            chat = await client.getChatById(group.groupId);
            // chat.announce === true means only admins can send messages
            isActuallyLocked = chat.announce === true;
        } catch (e) {
            logger.warn(`Shabbat: could not read state for ${group.groupName}`, e.message);
            continue; // skip this group this cycle
        }

        const shouldBeLocked = (now >= lockTime && now < unlockTime);

        if (shouldBeLocked) {
            // ── Lock / Re-lock ────────────────────────────────────────
            if (!isActuallyLocked) {
                // Either first lock, or re-lock after someone manually opened it during Shabbat
                const isReLock = !!group.shabbatLocked;
                try {
                    await chat.setMessagesAdminsOnly(true);
                    await database.setShabbatLocked(group.groupId, true);
                    logger.info(isReLock
                        ? `Shabbat re-locked (opened during Shabbat): ${group.groupName}`
                        : `Shabbat locked: ${group.groupName}`);
                } catch (e) {
                    logger.warn(`Shabbat lock failed for ${group.groupName}`, e.message);
                    const msg = isReLock
                        ? `⚠️ *GroupShield — שמירת שבת*\nמישהו פתח את הקבוצה "${group.groupName}" בזמן השבת.\nהבוט ניסה לסגור אותה שוב אך נכשל.\nשגיאה: ${e.message}`
                        : `⚠️ *GroupShield — שמירת שבת*\nהבוט לא הצליח לסגור את הקבוצה "${group.groupName}" לקראת שבת.\nשגיאה: ${e.message}`;
                    await alertOwner(client, group.ownerJid, msg);
                }
            } else if (!group.shabbatLocked) {
                // Group is already locked (external/pre-existing), take ownership so we unlock it later
                await database.setShabbatLocked(group.groupId, true);
                logger.info(`Shabbat: ${group.groupName} was already locked — took ownership`);
            }
            // else: isActuallyLocked && group.shabbatLocked → correct state, nothing to do

        } else {
            // ── Unlock ───────────────────────────────────────────────
            if (group.shabbatLocked) {
                // We own the lock — release it
                let unlockOk = true;
                if (isActuallyLocked) {
                    try {
                        await chat.setMessagesAdminsOnly(false);
                        logger.info(`Shabbat unlocked: ${group.groupName}`);
                    } catch (e) {
                        logger.warn(`Shabbat unlock failed for ${group.groupName}`, e.message);
                        await alertOwner(client, group.ownerJid,
                            `⚠️ *GroupShield — שמירת שבת*\nהבוט לא הצליח לפתוח את הקבוצה "${group.groupName}" אחרי שבת.\nשגיאה: ${e.message}`);
                        unlockOk = false; // keep shabbatLocked=1 so we retry next minute
                    }
                } else {
                    // Already unlocked (someone opened it manually, or unlock succeeded in a prior cycle)
                    logger.info(`Shabbat: ${group.groupName} already unlocked — syncing DB`);
                }
                if (unlockOk) {
                    await database.setShabbatLocked(group.groupId, false);
                }
            }
            // else: shabbatLocked=0 and we're outside lock window → no action needed
        }
    }

    // Persist any notification state changes
    if (timesModified) {
        times.notifiedGroups = notifiedGroups;
        await database.setSetting(SETTINGS_KEY, JSON.stringify(times));
    }
}

// ── Manual recovery state machine ────────────────────────────────────────────

/**
 * Parse a user-supplied time string — accepts "HHMM" or "HH:MM" / "H:MM".
 * Returns a normalised "HH:MM" string, or null on invalid input.
 */
function parseTimeInput(str) {
    const cleaned = (str || '').trim();

    // 4 bare digits: 1805 → 18:05
    if (/^\d{4}$/.test(cleaned)) {
        const h = parseInt(cleaned.slice(0, 2), 10);
        const m = parseInt(cleaned.slice(2, 4), 10);
        if (h <= 23 && m <= 59) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // HH:MM or H:MM
    const match = cleaned.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
        const h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        if (h <= 23 && m <= 59) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    return null;
}

/** Returns the next Friday as a YYYY-MM-DD string (always ≥ 1 day away). */
function getNextFridayStr() {
    const today = new Date();
    const dow = today.getDay(); // 0=Sun … 6=Sat
    const daysUntil = dow === 5 ? 7 : (5 - dow + 7) % 7;
    const fri = new Date(today);
    fri.setDate(today.getDate() + daysUntil);
    return fri.toISOString().slice(0, 10);
}

/** Returns the Saturday after a given YYYY-MM-DD Friday string. */
function getSaturdayStr(fridayStr) {
    const [y, mo, d] = fridayStr.split('-').map(Number);
    const fri = new Date(Date.UTC(y, mo - 1, d));
    fri.setUTCDate(fri.getUTCDate() + 1);
    return fri.toISOString().slice(0, 10);
}

const RECOVERY_MENU =
    `1️⃣ ניסיון שליפה נוסף\n` +
    `2️⃣ הזנת שעות ידנית\n` +
    `3️⃣ דלג על שמירת שבת השבוע`;

/**
 * Save recovery state and send the choice prompt to the developer.
 * Called from bot.js immediately after a failed fetch.
 */
async function initiateRecovery(client, developerJid) {
    await database.setSetting(RECOVERY_KEY, JSON.stringify({ step: 'awaiting_choice' }));
    try {
        await client.sendMessage(developerJid,
            `⚠️ *GroupShield — שגיאה בשליפת שעות שבת*\n` +
            `הבוט לא הצליח לשלוף את שעות השבת השבוע.\n\n` +
            `מה תרצה לעשות?\n\n` + RECOVERY_MENU
        );
    } catch (e) {
        logger.warn('Failed to send Shabbat recovery prompt', e.message);
    }
}

/**
 * Handle a developer DM while a recovery flow is in progress.
 * Returns a reply string if the message was consumed, or null to pass through.
 */
async function handleShabbatRecovery(client, developerJid, content) {
    const raw = await database.getSetting(RECOVERY_KEY);
    if (!raw) return null;

    let state;
    try { state = JSON.parse(raw); } catch { return null; }

    if (!state || !state.step || state.step === 'done') {
        await database.deleteSetting(RECOVERY_KEY);
        return null;
    }

    const trimmed = (content || '').trim();

    // ── awaiting_choice ──────────────────────────────────────────────────
    if (state.step === 'awaiting_choice') {
        if (trimmed === '1') {
            const times = await fetchAndSaveShabbatTimes();
            if (times) {
                await database.deleteSetting(RECOVERY_KEY);
                return (
                    `✅ הניסיון החוזר הצליח!\n\n` +
                    `⬇️ כניסת שבת: *${formatIsraelTime(times.entryMs)}*\n` +
                    `⬆️ יציאת שבת: *${formatIsraelTime(times.exitMs)}*\n\n` +
                    `(שעון ישראל)`
                );
            }
            // Still failed — stay in awaiting_choice
            return `❌ הניסיון החוזר גם כן נכשל.\n\nמה תרצה לעשות?\n\n` + RECOVERY_MENU;
        }

        if (trimmed === '2') {
            await database.setSetting(RECOVERY_KEY, JSON.stringify({ step: 'awaiting_entry' }));
            return (
                `🕯️ *הזנת שעות ידנית*\n\n` +
                `מה שעת *כניסת השבת*?\n` +
                `שלח 4 ספרות ברצף או עם ״:״ באמצע\n\n` +
                `✳️ לדוגמה: 1805 או 18:05`
            );
        }

        if (trimmed === '3') {
            await database.deleteSetting(RECOVERY_KEY);
            return `✅ שמירת שבת לא תבוצע השבוע.`;
        }

        return `בחר אפשרות:\n\n` + RECOVERY_MENU;
    }

    // ── awaiting_entry ───────────────────────────────────────────────────
    if (state.step === 'awaiting_entry') {
        const parsed = parseTimeInput(trimmed);
        if (!parsed) {
            return (
                `❌ פורמט שגוי.\n` +
                `שלח 4 ספרות ברצף (לדוגמה: *1805*) או עם ״:״ באמצע (לדוגמה: *18:05*).`
            );
        }
        const fridayStr = getNextFridayStr();
        const entryMs = israelTimeToUtcMs(fridayStr, parsed);
        await database.setSetting(RECOVERY_KEY, JSON.stringify({ step: 'awaiting_exit', entryMs, friday: fridayStr }));
        return (
            `✅ כניסת שבת: *${formatIsraelTime(entryMs)}*\n\n` +
            `מה שעת *יציאת השבת*?\n` +
            `שלח 4 ספרות ברצף או עם ״:״ באמצע\n\n` +
            `✳️ לדוגמה: 1922 או 19:22`
        );
    }

    // ── awaiting_exit ────────────────────────────────────────────────────
    if (state.step === 'awaiting_exit') {
        const parsed = parseTimeInput(trimmed);
        if (!parsed) {
            return (
                `❌ פורמט שגוי.\n` +
                `שלח 4 ספרות ברצף (לדוגמה: *1922*) או עם ״:״ באמצע (לדוגמה: *19:22*).`
            );
        }
        const saturdayStr = getSaturdayStr(state.friday);
        const exitMs = israelTimeToUtcMs(saturdayStr, parsed);
        const times = { entryMs: state.entryMs, exitMs, friday: state.friday, notifiedGroups: {} };
        await database.setSetting(SETTINGS_KEY, JSON.stringify(times));
        await database.deleteSetting(RECOVERY_KEY);
        return (
            `✅ *שעות שבת נשמרו ידנית!*\n\n` +
            `⬇️ כניסת שבת: *${formatIsraelTime(state.entryMs)}*\n` +
            `⬆️ יציאת שבת: *${formatIsraelTime(exitMs)}*\n\n` +
            `(שעון ישראל)`
        );
    }

    // Unknown step — clear and pass through
    await database.deleteSetting(RECOVERY_KEY);
    return null;
}

module.exports = { fetchAndSaveShabbatTimes, checkShabbatGroups, formatIsraelTime, initiateRecovery, handleShabbatRecovery };
