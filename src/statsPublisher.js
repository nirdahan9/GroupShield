const https = require('https');
const logger = require('./logger');

const FIREBASE_URL = 'groupshield-default-rtdb.europe-west1.firebasedatabase.app';
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function pushToFirebase(stats, secret) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(stats);
        const req = https.request(
            {
                hostname: FIREBASE_URL,
                path: `/stats.json?auth=${secret}`,
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            },
            (res) => {
                res.resume();
                if (res.statusCode >= 200 && res.statusCode < 300) resolve();
                else reject(new Error(`Firebase responded ${res.statusCode}`));
            }
        );
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function start(db) {
    const secret = process.env.FIREBASE_SECRET;
    if (!secret) {
        logger.warn('[statsPublisher] FIREBASE_SECRET not set — stats will not be pushed to Firebase');
        return;
    }

    async function publish() {
        try {
            const stats = await db.getPublicStats();
            await pushToFirebase(stats, secret);
            logger.info('[statsPublisher] Stats pushed to Firebase', stats);
        } catch (e) {
            logger.warn('[statsPublisher] Failed to push stats:', e.message);
        }
    }

    // Run immediately on start, then every 30 minutes
    publish();
    setInterval(publish, INTERVAL_MS);
}

module.exports = { start };
