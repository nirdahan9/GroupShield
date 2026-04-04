// src/shabbat.js - Shabbat & Holiday mode: weekly Shabbat fetch + annual holiday fetch + group lock/unlock

const https = require('https');
const database = require('./database');
const logger = require('./logger');

const SETTINGS_KEY             = 'shabbat_times';
const RECOVERY_KEY             = 'shabbat_recovery';
const HOLIDAY_SETTINGS_KEY_PREFIX = 'holiday_times_'; // e.g. 'holiday_times_2026'
const LOCK_OFFSET_MS   = 5 * 60 * 1000;   // lock 5 min before entry
const UNLOCK_OFFSET_MS = 5 * 60 * 1000;   // unlock 5 min after exit

// Tracks whether each group was last observed as locked by WhatsApp (chat.announce).
// Re-lock fires only on a confirmed locked→unlocked transition, not on stale API data.
const confirmedLockedState = new Map(); // groupId → true | false

// ── Timezone helper (used for manual entry in recovery flow) ─────────────────

/**
 * Convert an Israel local time string (HH:MM) on a given YYYY-MM-DD date to UTC ms.
 * Israel is UTC+2 (winter, IST) or UTC+3 (summer, IDT).
 */
function israelTimeToUtcMs(dateStr, timeStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [h, m] = timeStr.split(':').map(Number);

    for (const offsetHours of [2, 3]) {
        const candidateMs = Date.UTC(year, month - 1, day, h - offsetHours, m, 0);
        const israelHour = parseInt(
            new Date(candidateMs).toLocaleString('en-US', {
                timeZone: 'Asia/Jerusalem',
                hour: 'numeric',
                hour12: false
            }),
            10
        );
        if (israelHour === h) return candidateMs;
    }
    return Date.UTC(year, month - 1, day, h - 2, m, 0); // fallback UTC+2
}

// ── HebCal fetch (Shabbat — weekly) ─────────────────────────────────────────

/**
 * Fetch Shabbat items for a given city from the free HebCal API.
 * Returns array of items, or null on failure.
 */
function hebcalFetch(city) {
    return new Promise((resolve) => {
        const req = https.get(
            `https://www.hebcal.com/shabbat?cfg=json&city=${encodeURIComponent(city)}&M=on`,
            (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data).items || []);
                    } catch (e) {
                        logger.warn(`HebCal parse error for ${city}`, e.message);
                        resolve(null);
                    }
                });
            }
        );
        req.setTimeout(8000, () => { req.destroy(); resolve(null); });
        req.on('error', e => { logger.warn(`HebCal fetch error for ${city}`, e.message); resolve(null); });
    });
}

/**
 * Fetch Shabbat times from HebCal:
 *   entry = candle lighting in Jerusalem
 *   exit  = Havdalah in Netanya
 * Returns { entryMs, exitMs, friday } or null on failure.
 */
async function fetchShabbatTimes() {
    const [jerusalemItems, netanyaItems] = await Promise.all([
        hebcalFetch('Jerusalem'),
        hebcalFetch('Netanya')
    ]);

    if (!jerusalemItems || !netanyaItems) {
        logger.warn('HebCal fetch failed for one or both cities');
        return null;
    }

    // Find the candles item that falls on a Friday (Israel time).
    // HebCal's weekly endpoint may return extra candles items for Yom Tov days that
    // appear in the same week (before or after Shabbat) — we must pick only the Shabbat candles.
    // Shabbat candle lighting is always Friday evening in Israel (UTC+2/3), so it is
    // still Friday in UTC (earliest candle times are ~13:00 UTC). getUTCDay() === 5 → Friday.
    const candlesItem = jerusalemItems.find(i => i.category === 'candles' && new Date(i.date).getUTCDay() === 5);

    if (!candlesItem) {
        logger.warn('HebCal: no Friday candles item found in Jerusalem response');
        return null;
    }

    // HebCal dates include timezone offset (e.g. "2026-03-27T18:15:00+03:00")
    // — JavaScript Date parses them correctly to UTC ms.
    const entryMs = new Date(candlesItem.date).getTime();
    const friday  = candlesItem.date.slice(0, 10);

    if (isNaN(entryMs)) {
        logger.warn('HebCal: invalid candles date format', candlesItem.date);
        return null;
    }

    // Find the first havdalah from Netanya that comes AFTER candle lighting.
    // When Yom Tov precedes Shabbat, HebCal may return an earlier Motzei-Yom-Tov havdalah
    // for Netanya (before Shabbat starts) and sometimes omits the Motzei-Shabbat havdalah.
    // Fallback: try Jerusalem's havdalah items in that case.
    let havdalahItem = netanyaItems.find(i => i.category === 'havdalah' && new Date(i.date).getTime() > entryMs);

    if (!havdalahItem) {
        // Netanya has no havdalah after entry — try Jerusalem (less common but more complete)
        havdalahItem = jerusalemItems.find(i => i.category === 'havdalah' && new Date(i.date).getTime() > entryMs);
        if (havdalahItem) {
            logger.info(`HebCal: Netanya havdalah missing after entry — using Jerusalem havdalah as fallback`);
        }
    }

    if (!havdalahItem) {
        logger.warn('HebCal: no havdalah found after candle lighting time in either city');
        return null;
    }

    const exitMs = new Date(havdalahItem.date).getTime();

    if (isNaN(exitMs)) {
        logger.warn('HebCal: invalid havdalah date format', havdalahItem.date);
        return null;
    }

    logger.info(`HebCal times: candles(Jerusalem)=${candlesItem.date}, havdalah=${havdalahItem.date}`);
    return { entryMs, exitMs, friday, notifiedGroups: {} };
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

function getHolidayBlessing(nameHe) {
    const normalized = (nameHe || '').trim();
    if (normalized.startsWith('ראש השנה')) return 'שנה טובה';
    if (normalized.includes('יום כיפור')) return 'חתימה טובה';
    return 'חג שמח';
}

function buildPreCloseGreeting(isShabbat, holidayName) {
    if (isShabbat && holidayName) return `שבת שלום ו${getHolidayBlessing(holidayName)}`;
    if (isShabbat) return 'שבת שלום';
    return getHolidayBlessing(holidayName);
}

function windowsOverlap(startA, endA, startB, endB) {
    return startA < endB && startB < endA;
}

/**
 * Fetch Shabbat times from HebCal and persist to settings table.
 * Called every Thursday by the scheduler.
 * Returns the saved times object on success, or null on failure.
 */
async function fetchAndSaveShabbatTimes() {
    logger.info('Fetching Shabbat times from HebCal...');
    const times = await fetchShabbatTimes();
    if (!times) {
        logger.warn('Shabbat time fetch returned null — keeping previous times');
        return null;
    }
    await database.setSetting(SETTINGS_KEY, JSON.stringify(times));
    logger.info(`Shabbat times saved: entry=${new Date(times.entryMs).toISOString()}, exit=${new Date(times.exitMs).toISOString()}`);
    return times;
}

// ── HebCal fetch (Holidays — annual) ────────────────────────────────────────

/**
 * Fetch annual holiday calendar for a given city and year from HebCal.
 * Uses maj=on (major holidays), s=off (no Shabbat entries), c=on (candle/havdalah times),
 * i=on (Israel 1-day yom tov), mf=off (no fast days), min=off (no minor holidays).
 * Returns array of items, or null on failure.
 */
function hebcalAnnualFetch(city, year) {
    return new Promise((resolve) => {
        const url =
            `https://www.hebcal.com/hebcal?v=1&cfg=json` +
            `&year=${year}&maj=on&min=off&ss=off&mf=off` +
            `&c=on&geo=city&city=${encodeURIComponent(city)}&M=on&s=off&i=on`;
        const req = https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data).items || []); }
                catch (e) {
                    logger.warn(`HebCal annual parse error for ${city}/${year}`, e.message);
                    resolve(null);
                }
            });
        });
        req.setTimeout(12000, () => { req.destroy(); resolve(null); });
        req.on('error', e => {
            logger.warn(`HebCal annual fetch error for ${city}/${year}`, e.message);
            resolve(null);
        });
    });
}

/**
 * Given a sorted array of HebCal annual items, pair each candles→havdalah sequence
 * into a closed window — but only for real holidays (windows that contain a major
 * holiday item). Plain Shabbat windows are discarded even though c=on causes HebCal
 * to emit candles/havdalah for every Friday/Saturday regardless of s=off.
 *
 * Algorithm:
 *  - candles with no open window → opens a new window (entryMs = item.date)
 *  - candles with window already open → skipped (inter-day lighting, e.g. RH day 2)
 *  - first major holiday item inside open window → captures Hebrew name
 *  - havdalah with open window and a holiday name → closes window, saves to array
 *  - havdalah with open window but no holiday name → discards (plain Shabbat)
 *
 * Returns: [{ nameHe, entryMs, exitMs, notifiedGroups: {} }, ...]
 */
function pairHolidayWindows(items) {
    const windows = [];
    let openWindow = null; // { entryMs, nameHe }

    for (const item of items) {
        const ms = new Date(item.date).getTime();
        if (isNaN(ms)) continue;

        if (item.category === 'candles') {
            if (!openWindow) {
                openWindow = { entryMs: ms, nameHe: null };
            }
            // else: already in a multi-day window (e.g. Rosh Hashana day 2 candles) — skip
        } else if (item.category === 'holiday' && item.subcat === 'major' && openWindow && !openWindow.nameHe) {
            openWindow.nameHe = item.hebrew || null;
        } else if (item.category === 'havdalah' && openWindow) {
            // Only keep windows that contain a real holiday — skip plain Shabbat windows
            // (c=on in the HebCal URL emits candles/havdalah for every Shabbat even with s=off)
            if (openWindow.nameHe) {
                windows.push({
                    nameHe: openWindow.nameHe,
                    entryMs: openWindow.entryMs,
                    exitMs: ms,
                    notifiedGroups: {}
                });
            }
            openWindow = null;
        }
    }
    return windows;
}

/**
 * Fetch holiday windows for a given year.
 * Entry times from Jerusalem (earlier candle lighting), exit times from Netanya (later havdalah).
 * Returns array of { nameHe, entryMs, exitMs, notifiedGroups }, or null on failure.
 */
async function fetchHolidayTimes(year) {
    const [jerusalemItems, netanyaItems] = await Promise.all([
        hebcalAnnualFetch('Jerusalem', year),
        hebcalAnnualFetch('Netanya', year)
    ]);

    if (!jerusalemItems || !netanyaItems) {
        logger.warn(`Holiday fetch failed for year ${year}`);
        return null;
    }

    const sortByDate = arr => arr.slice().sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const entryWindows = pairHolidayWindows(sortByDate(jerusalemItems));
    const exitWindows  = pairHolidayWindows(sortByDate(netanyaItems));

    if (entryWindows.length !== exitWindows.length) {
        logger.warn(`Holiday window count mismatch: Jerusalem=${entryWindows.length}, Netanya=${exitWindows.length} for ${year}`);
    }

    const count = Math.min(entryWindows.length, exitWindows.length);
    const holidays = [];
    for (let i = 0; i < count; i++) {
        holidays.push({
            nameHe:         entryWindows[i].nameHe,
            entryMs:        entryWindows[i].entryMs,   // Jerusalem candle lighting
            exitMs:         exitWindows[i].exitMs,      // Netanya havdalah
            notifiedGroups: {}
        });
        logger.info(`Holiday[${i}] ${entryWindows[i].nameHe}: entry=${new Date(entryWindows[i].entryMs).toISOString()}, exit=${new Date(exitWindows[i].exitMs).toISOString()}`);
    }

    logger.info(`Fetched ${holidays.length} holiday windows for ${year}`);
    return holidays;
}

/**
 * Fetch holiday windows for the given year (defaults to current civil year)
 * and persist to settings table under key 'holiday_times_YEAR'.
 * Returns the saved array on success, or null on failure.
 */
async function fetchAndSaveHolidayTimes(year) {
    const y = year || new Date().getFullYear();
    logger.info(`Fetching holiday times for ${y}...`);
    const holidays = await fetchHolidayTimes(y);
    if (!holidays) {
        logger.warn(`Holiday fetch returned null for ${y}`);
        return null;
    }
    const key = HOLIDAY_SETTINGS_KEY_PREFIX + y;
    await database.setSetting(key, JSON.stringify(holidays));
    logger.info(`Holiday times saved: ${holidays.length} windows for ${y}`);
    return holidays;
}

/**
 * Return the holiday window that contains 'now' (with offsets applied), or null.
 * lockTime   = window.entryMs - LOCK_OFFSET_MS
 * unlockTime = window.exitMs  + UNLOCK_OFFSET_MS
 */
function getCurrentHolidayWindow(now, holidays) {
    if (!holidays || holidays.length === 0) return null;
    for (const w of holidays) {
        const lockTime   = w.entryMs - LOCK_OFFSET_MS;
        const unlockTime = w.exitMs  + UNLOCK_OFFSET_MS;
        if (now >= lockTime && now < unlockTime) return w;
    }
    return null;
}

// ── Lock / Unlock / Notify ────────────────────────────────────────────────────

/**
 * Alert the group owner about a lock/unlock failure.
 */
async function alertOwner(client, ownerJid, message) {
    try { await client.sendMessage(ownerJid, message); } catch (_) {}
}

/**
 * Called every minute. For each group with Shabbat/holiday mode enabled:
 *  - Send pre-Shabbat or pre-holiday notification (once per event, skipped if already locked)
 *  - Lock the group 5 min before Shabbat/holiday entry
 *  - Re-lock if someone opens the group during Shabbat/holiday
 *  - Unlock 5 min after both Shabbat AND any active holiday have ended
 *  - Alert the owner on any lock/unlock failure
 *
 * shouldBeLocked = isInShabbatWindow OR isInHolidayWindow
 * Adjacent Shabbat+holiday: the group stays locked throughout with no unlock in between.
 * Pre-notifications are skipped if the group is already locked (group.shabbatLocked=1).
 */
async function checkShabbatAndHolidayGroups(client) {
    const now = Date.now();

    // ── Load Shabbat times ────────────────────────────────────────────────
    const shabbatRaw = await database.getSetting(SETTINGS_KEY);
    let shabbatTimes = null;
    if (shabbatRaw) {
        try { shabbatTimes = JSON.parse(shabbatRaw); } catch { /* ignore */ }
    }

    // ── Load Holiday times for current year ──────────────────────────────
    const currentYear = new Date().getFullYear();
    const holidayKey  = HOLIDAY_SETTINGS_KEY_PREFIX + currentYear;
    const holidayRaw  = await database.getSetting(holidayKey);
    let holidays = [];
    let holidaysModified = false;
    if (holidayRaw) {
        try { holidays = JSON.parse(holidayRaw); } catch { /* ignore */ }
    }

    // ── Compute Shabbat window ────────────────────────────────────────────
    let isInShabbatWindow = false;
    let shabbatLockTime   = null;
    let shabbatUnlockTime = null;
    const shabbatNotifiedGroups = shabbatTimes ? (shabbatTimes.notifiedGroups || {}) : {};
    let shabbatModified = false;

    if (shabbatTimes && shabbatTimes.entryMs && shabbatTimes.exitMs) {
        shabbatLockTime         = shabbatTimes.entryMs - LOCK_OFFSET_MS;
        shabbatUnlockTime       = shabbatTimes.exitMs  + UNLOCK_OFFSET_MS;
        isInShabbatWindow = (now >= shabbatLockTime && now < shabbatUnlockTime);
    }

    // ── Compute Holiday window ────────────────────────────────────────────
    const activeHolidayWindow = getCurrentHolidayWindow(now, holidays);
    const isInHolidayWindow   = activeHolidayWindow !== null;
    const holidayLockTime     = activeHolidayWindow
        ? activeHolidayWindow.entryMs - LOCK_OFFSET_MS
        : null;

    const groups = await database.getShabbatGroups();
    if (!groups || groups.length === 0) return;

    for (const group of groups) {
        let shabbatCfg;
        try { shabbatCfg = JSON.parse(group.shabbatConfig); } catch { continue; }
        if (!shabbatCfg || !shabbatCfg.enabled) continue;

        const notifyMinutes = shabbatCfg.notifyMinutes || 0;
        const alreadyLocked = !!group.shabbatLocked;
        let shabbatNotifiedThisCycle = false;

        // ── Pre-Shabbat notification ──────────────────────────────────────
        // Skip if group is already locked (adjacent holiday+Shabbat: no mid-closure notification)
        if (notifyMinutes > 0 && shabbatTimes && shabbatLockTime && !alreadyLocked) {
            const notifyTime = shabbatLockTime - notifyMinutes * 60 * 1000;
            const notifyKey  = `${group.groupId}_${shabbatTimes.friday}`;

            if (now >= notifyTime && now < shabbatLockTime && !shabbatNotifiedGroups[notifyKey]) {
                try {
                    const remaining = Math.max(1, Math.round((shabbatLockTime - now) / 60000));
                    const overlappingHoliday = (shabbatLockTime && shabbatUnlockTime)
                        ? holidays.find((w) => windowsOverlap(
                            shabbatLockTime,
                            shabbatUnlockTime,
                            w.entryMs - LOCK_OFFSET_MS,
                            w.exitMs + UNLOCK_OFFSET_MS
                        ))
                        : null;
                    const greeting = buildPreCloseGreeting(true, overlappingHoliday ? overlappingHoliday.nameHe : null);

                    await client.sendMessage(group.groupId,
                        `${greeting}, לידיעתכם הקבוצה תיסגר להודעות בעוד ${remaining} דקות.`
                    );
                    logger.info(`Shabbat pre-notify sent to ${group.groupName}`);
                    shabbatNotifiedGroups[notifyKey] = true;
                    shabbatModified = true;
                    shabbatNotifiedThisCycle = true;
                } catch (e) {
                    logger.warn(`Shabbat notify failed for ${group.groupName}`, e.message);
                }
            } else if (shabbatNotifiedGroups[notifyKey]) {
                // Already notified for this Shabbat — treat as notified this cycle too
                shabbatNotifiedThisCycle = true;
            }
        }

        // ── Pre-holiday notification ──────────────────────────────────────
        // Skip if group is already locked (adjacent Shabbat+holiday: no mid-closure notification)
        // Also skip if a Shabbat notification was already sent this cycle (prevents double notification
        // when a holiday coincides with Shabbat and both notification windows overlap).
        if (notifyMinutes > 0 && !alreadyLocked && !shabbatNotifiedThisCycle) {
            const upcomingHolidayWindow = holidays.find((w) => {
                const lockTime = w.entryMs - LOCK_OFFSET_MS;
                const notifyTime = lockTime - notifyMinutes * 60 * 1000;
                return now >= notifyTime && now < lockTime;
            });

            if (upcomingHolidayWindow) {
                const upcomingHolidayLockTime = upcomingHolidayWindow.entryMs - LOCK_OFFSET_MS;
                const upcomingHolidayUnlockTime = upcomingHolidayWindow.exitMs + UNLOCK_OFFSET_MS;
                const notifyKey = `${group.groupId}_${upcomingHolidayWindow.entryMs}`;

                if (!upcomingHolidayWindow.notifiedGroups[notifyKey]) {
                try {
                    const remaining = Math.max(1, Math.round((upcomingHolidayLockTime - now) / 60000));
                    const overlapsShabbat = (shabbatLockTime && shabbatUnlockTime)
                        ? windowsOverlap(
                            shabbatLockTime,
                            shabbatUnlockTime,
                            upcomingHolidayLockTime,
                            upcomingHolidayUnlockTime
                        )
                        : false;
                    const greeting = buildPreCloseGreeting(overlapsShabbat, upcomingHolidayWindow.nameHe);

                    await client.sendMessage(group.groupId,
                        `${greeting}, לידיעתכם הקבוצה תיסגר להודעות בעוד ${remaining} דקות.`
                    );
                    logger.info(`Holiday pre-notify sent to ${group.groupName} (${upcomingHolidayWindow.nameHe})`);
                    upcomingHolidayWindow.notifiedGroups[notifyKey] = true;
                    holidaysModified = true;
                } catch (e) {
                    logger.warn(`Holiday notify failed for ${group.groupName}`, e.message);
                }
            }
            }
        }

        // ── Read actual WhatsApp group state ──────────────────────────────
        let chat, isActuallyLocked;
        try {
            chat = await client.getChatById(group.groupId);
            isActuallyLocked = chat.announce === true;
        } catch (e) {
            logger.warn(`Shabbat/holiday: could not read state for ${group.groupName}`, e.message);
            continue;
        }

        const shouldBeLocked = isInShabbatWindow || isInHolidayWindow;
        const lockLabel = isInHolidayWindow
            ? `שמירת חג (${activeHolidayWindow.nameHe})`
            : 'שמירת שבת';

        if (shouldBeLocked) {
            if (!group.shabbatLocked) {
                // ── First lock ────────────────────────────────────────────
                if (isActuallyLocked) {
                    // Bot restarted mid-Shabbat/holiday — group already locked, take ownership
                    await database.setShabbatLocked(group.groupId, true);
                    confirmedLockedState.set(group.groupId, true);
                    logger.info(`${lockLabel}: ${group.groupName} already locked — took ownership`);
                } else {
                    try {
                        await chat.setMessagesAdminsOnly(true);
                        await database.setShabbatLocked(group.groupId, true);
                        logger.info(`${lockLabel} locked: ${group.groupName}`);
                        // confirmedLockedState stays unset until chat.announce confirms true
                    } catch (e) {
                        logger.warn(`${lockLabel} lock failed for ${group.groupName}`, e.message);
                        await alertOwner(client, group.ownerJid,
                            `⚠️ *GroupShield — שמירת שבת וחג*\n` +
                            `הבוט לא הצליח לסגור את הקבוצה "${group.groupName}" לקראת ${lockLabel}.\n` +
                            `שגיאה: ${e.message}`
                        );
                    }
                }
            } else {
                // shabbatLocked=1 — already locked. Re-lock only on confirmed locked→unlocked transition.
                if (isActuallyLocked) {
                    confirmedLockedState.set(group.groupId, true);
                } else if (confirmedLockedState.get(group.groupId) === true) {
                    // Was confirmed locked; now open → someone manually unlocked
                    confirmedLockedState.set(group.groupId, false);
                    try {
                        await chat.setMessagesAdminsOnly(true);
                        logger.info(`${lockLabel} re-locked (manually opened): ${group.groupName}`);
                    } catch (e) {
                        logger.warn(`${lockLabel} re-lock failed for ${group.groupName}`, e.message);
                        await alertOwner(client, group.ownerJid,
                            `⚠️ *GroupShield — שמירת שבת וחג*\n` +
                            `מישהו פתח את הקבוצה "${group.groupName}" ב${lockLabel} ` +
                            `והבוט לא הצליח לסגור אותה שוב.\nשגיאה: ${e.message}`
                        );
                    }
                }
                // else: isActuallyLocked=false but not yet confirmed-locked → stale API data, ignore
            }

        } else {
            // ── Unlock (only when BOTH Shabbat and holiday windows are inactive) ──
            if (group.shabbatLocked) {
                let unlockOk = true;
                try {
                    await chat.setMessagesAdminsOnly(false);
                    if (isActuallyLocked) {
                        logger.info(`Shabbat/holiday unlocked: ${group.groupName}`);
                    } else {
                        logger.info(`Shabbat/holiday: ${group.groupName} already unlocked — syncing DB`);
                    }
                } catch (e) {
                    logger.warn(`Shabbat/holiday unlock failed for ${group.groupName}`, e.message);
                    await alertOwner(client, group.ownerJid,
                        `⚠️ *GroupShield — שמירת שבת וחג*\n` +
                        `הבוט לא הצליח לפתוח את הקבוצה "${group.groupName}" אחרי שבת/חג.\n` +
                        `שגיאה: ${e.message}`
                    );
                    unlockOk = false; // keep shabbatLocked=1 so we retry next minute
                }
                if (unlockOk) {
                    await database.setShabbatLocked(group.groupId, false);
                    confirmedLockedState.delete(group.groupId);
                }
            }
            // else: shabbatLocked=0 and outside all lock windows → no action needed
        }
    }

    // ── Persist notification state changes ────────────────────────────────
    if (shabbatModified && shabbatTimes) {
        shabbatTimes.notifiedGroups = shabbatNotifiedGroups;
        await database.setSetting(SETTINGS_KEY, JSON.stringify(shabbatTimes));
    }
    if (holidaysModified) {
        await database.setSetting(holidayKey, JSON.stringify(holidays));
    }
}

// ── Manual recovery state machine (Shabbat weekly fetch) ─────────────────────

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

module.exports = {
    fetchAndSaveShabbatTimes,
    fetchAndSaveHolidayTimes,
    checkShabbatAndHolidayGroups,
    formatIsraelTime,
    initiateRecovery,
    handleShabbatRecovery
};
