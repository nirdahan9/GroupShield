'use strict';

// src/cursesTrainingLog.js
// Unified training log for all groups running the "offensive language" (curses) preset.
// Single file: logs/curses_training.jsonl — one JSON line per event.
//
// Two event types:
//   "message"  — every message evaluated in a curses-preset group (raw input)
//   "enforced" — every enforcement action taken (rule_engine / llm / cosine / injection)
//
// For ML training:
//   • "message" events WITHOUT a subsequent "enforced" event → clean samples
//   • "message" events WITH a subsequent "enforced" event  → violation samples

const fs   = require('fs');
const path = require('path');

const LOG_DIR  = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'curses_training.jsonl');

function ensureDir() {
    if (!fs.existsSync(LOG_DIR)) {
        try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ignore */ }
    }
}

function append(entry) {
    try {
        ensureDir();
        fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
    } catch { /* never block message flow */ }
}

function shortUser(jid) {
    return (jid || '').replace(/@.*/, '');
}

/**
 * Log a message that entered the curses evaluation pipeline.
 * Called for every message in a curses-preset group (before enforcement decision).
 */
function logMessage(groupId, groupName, userJid, content, msgType) {
    append({
        event:   'message',
        ts:      new Date().toISOString(),
        group:   groupName,
        groupId,
        user:    shortUser(userJid),
        type:    msgType || 'text',
        content: content || ''
    });
}

/**
 * Log an enforcement action in a curses-preset group.
 * actionType: 'rule_engine' | 'llm' | 'cosine' | 'injection'
 */
function logEnforcement(groupId, groupName, userJid, content, reason, actionType) {
    append({
        event:      'enforced',
        ts:         new Date().toISOString(),
        group:      groupName,
        groupId,
        user:       shortUser(userJid),
        content:    content || '',
        reason:     reason  || '',
        actionType: actionType || 'rule_engine'
    });
}

module.exports = { logMessage, logEnforcement };
