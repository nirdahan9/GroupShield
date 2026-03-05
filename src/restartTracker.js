// src/restartTracker.js - Track restart reasons across process restarts
const fs = require('fs');
const path = require('path');

const RESTART_REASON_FILE = path.join(__dirname, '.restart_reason');

function setRestartReason(reason, details = '') {
    try {
        const data = {
            reason,
            details,
            timestamp: new Date().toISOString(),
            pid: process.pid
        };
        fs.writeFileSync(RESTART_REASON_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Failed to write restart reason:', e);
    }
}

function getRestartReason() {
    try {
        if (fs.existsSync(RESTART_REASON_FILE)) {
            const data = JSON.parse(fs.readFileSync(RESTART_REASON_FILE, 'utf8'));
            fs.unlinkSync(RESTART_REASON_FILE);
            return data;
        }
    } catch (e) {
        console.error('Failed to read restart reason:', e);
    }
    return null;
}

function formatRestartMessage(version, restartData) {
    if (!restartData) {
        return `✅ GroupShield (v${version}) started\n🔄 *Reason:* Initial startup / PM2 restart`;
    }
    const { reason, details, timestamp } = restartData;
    const time = new Date(timestamp).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    let emoji = '🔄';
    let reasonText = '';
    switch (reason) {
        case 'scheduled':
            emoji = '📅';
            reasonText = `Scheduled restart — ${details}`;
            break;
        case 'manual_restart':
            emoji = '👤';
            reasonText = 'Manual restart (admin command)';
            break;
        case 'critical_memory':
            emoji = '🚨';
            reasonText = `Critical memory (${details})`;
            break;
        case 'pm2_memory_limit':
            emoji = '⚠️';
            reasonText = `PM2 Memory Limit (${details})`;
            break;
        case 'error':
            emoji = '❌';
            reasonText = `Error: ${details}`;
            break;
        case 'sigint':
            emoji = '🛑';
            reasonText = 'Manual stop (SIGINT)';
            break;
        default:
            emoji = '🔄';
            reasonText = reason;
    }
    return `✅ GroupShield (v${version}) restarted\n${emoji} *Reason:* ${reasonText}\n🕒 *Exit time:* ${time}`;
}

module.exports = {
    setRestartReason,
    getRestartReason,
    formatRestartMessage
};
