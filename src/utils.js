// src/utils.js - Utility Functions
const config = require('./config');

/**
 * Normalize WhatsApp JID to standard format
 * Converts Puppeteer's @c.us to @s.whatsapp.net for DB compatibility
 */
function getNormalizedJid(jid) {
    if (!jid) return null;
    if (jid.endsWith('@c.us')) {
        return jid.replace('@c.us', '@s.whatsapp.net');
    }
    return jid;
}

/**
 * Extract phone number from JID  
 */
function extractNumber(jid) {
    if (!jid) return '';
    const user = jid.split('@')[0];
    return user.split(':')[0].split('.')[0];
}

/**
 * Format Israeli phone number for display
 */
function formatIsraelLocalNumber(rawDigits) {
    if (!rawDigits) return '';
    const digits = String(rawDigits).replace(/\D/g, '');
    if (!digits.startsWith('972')) return '';
    const national = '0' + digits.substring(3);
    if (!/^0\d{9}$/.test(national)) return '';
    if (national.startsWith('05') && national.length === 10) {
        return national.substring(0, 3) + '-' + national.substring(3, 6) + '-' + national.substring(6);
    }
    return national;
}

/**
 * Parse phone number from various local/international formats to digits-only E.164-like value
 * Examples accepted: +1..., 001..., 972..., 052-... (Israel local converted to 972...)
 */
function parsePhoneNumber(raw) {
    if (!raw) return null;

    let cleaned = String(raw)
        .replace(/[\s\u00A0\u202F\u2009\u200B]/g, '')
        .replace(/[-\u2010\u2011\u2012\u2013\u2014\u2015\uFE58\uFE63\uFF0D().]/g, '')
        .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
        .replace(/^\+/, '');

    // International prefix 00xxxx -> xxxxx
    if (cleaned.startsWith('00')) {
        cleaned = cleaned.slice(2);
    }

    // Keep digits only from this point
    cleaned = cleaned.replace(/\D/g, '');

    // Israeli local convenience: 05xxxxxxxx -> 9725xxxxxxxx
    if (/^0\d{9}$/.test(cleaned)) {
        cleaned = '972' + cleaned.slice(1);
    }

    // Generic international length bounds (E.164 max 15 digits)
    if (/^\d{7,15}$/.test(cleaned)) {
        return cleaned;
    }

    return null;
}

/**
 * Rate Limiter - Prevents too many actions in short time
 */
class RateLimiter {
    constructor() {
        this.enabled = config.get('rateLimiting.enabled', true);
        this.delay = config.get('rateLimiting.delayBetweenRemovalsMs', 2500);
        this.maxPerMinute = config.get('rateLimiting.maxRemovalsPerMinute', 15);
        this.lastAction = 0;
        this.actionsThisMinute = [];
    }

    async throttle(action, actionName = 'action') {
        if (!this.enabled) {
            return await action();
        }
        const now = Date.now();
        this.actionsThisMinute = this.actionsThisMinute.filter(t => now - t < 60000);
        if (this.actionsThisMinute.length >= this.maxPerMinute) {
            throw new Error(`Rate limit exceeded: ${this.maxPerMinute} ${actionName}s per minute`);
        }
        const timeSinceLastAction = now - this.lastAction;
        if (timeSinceLastAction < this.delay) {
            const waitTime = this.delay - timeSinceLastAction;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        try {
            const result = await action();
            this.lastAction = Date.now();
            this.actionsThisMinute.push(this.lastAction);
            return result;
        } catch (error) {
            throw error;
        }
    }
}

/**
 * Resolve JID to Phone Number JID
 * Handles LID -> Phone mapping using Client
 */
async function resolveContactToPhone(client, jid) {
    if (!jid) return null;
    const normalized = getNormalizedJid(jid);
    if (normalized.endsWith('@s.whatsapp.net') || normalized.endsWith('@g.us')) {
        return normalized;
    }
    try {
        const contact = await client.getContactById(normalized);
        if (contact) {
            if (contact.number) {
                return contact.number + '@s.whatsapp.net';
            }
            if (contact.id && contact.id._serialized && contact.id._serialized.endsWith('@s.whatsapp.net')) {
                return contact.id._serialized;
            }
        }
    } catch (e) {
        // Fallback to original
    }
    return normalized;
}

/**
 * Retry async operation with linear backoff
 */
async function withRetry(fn, attempts = 3, delayMs = 800) {
    let lastError = null;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e;
            if (i < attempts - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
            }
        }
    }
    throw lastError;
}

module.exports = {
    getNormalizedJid,
    extractNumber,
    formatIsraelLocalNumber,
    parsePhoneNumber,
    RateLimiter,
    resolveContactToPhone,
    withRetry
};
