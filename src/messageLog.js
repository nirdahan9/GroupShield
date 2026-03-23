'use strict';

// src/messageLog.js — Logs every group message + enforcement decisions to a JSONL file.
// One file per group: logs/msg_<groupId>.jsonl
// Each line is a self-contained JSON object, readable with `cat`, `grep`, or jq.

const fs   = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');

function safeGroupId(groupId) {
    return (groupId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function append(groupId, entry) {
    try {
        fs.appendFileSync(
            path.join(LOG_DIR, `msg_${safeGroupId(groupId)}.jsonl`),
            JSON.stringify(entry) + '\n',
            'utf8'
        );
    } catch { /* never block message flow */ }
}

function shortUser(jid) {
    return (jid || '').replace(/@.*/, '');
}

/**
 * Log a received group message (before enforcement decision).
 * Called for every non-immune message the bot evaluates.
 */
function logMessage(groupId, groupName, userJid, content, msgType) {
    append(groupId, {
        event:   'message',
        ts:      new Date().toISOString(),
        group:   groupName,
        user:    shortUser(userJid),
        type:    msgType,
        content: content,
        enforced: false   // updated to true if enforcement follows
    });
}

/**
 * Log an enforcement action.
 * Called from handlers.js (pending-welcome path), enforcement.js, and llm.js.
 */
function logEnforcement(groupId, groupName, userJid, content, reason, actionType) {
    append(groupId, {
        event:      'enforced',
        ts:         new Date().toISOString(),
        group:      groupName,
        user:       shortUser(userJid),
        content:    content,
        reason:     reason,
        actionType: actionType || 'rule_engine'  // 'pending_welcome' | 'rule_engine' | 'llm'
    });
}

module.exports = { logMessage, logEnforcement };
