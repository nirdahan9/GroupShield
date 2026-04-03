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
        this.lastAction = Date.now();
        this.actionsThisMinute.push(this.lastAction);
        return await action();
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

/**
 * Build dynamic group rules summary text based on config and rules
 */
function buildGroupRulesSummary(groupConfig, rules, enforceConfig, t, lang) {
    let text = '';

    // Non-text rules
    const nonTextRule = rules.find(r => r.ruleType === 'block_non_text');
    if (nonTextRule) {
        const blockedTypes = nonTextRule.ruleData.blockedTypes || [];
        if (blockedTypes.includes('all_non_text')) {
            text += `• ${t('rules_summary_no_media', lang)}\n`;
        } else {
            const types = blockedTypes.map(type => t(`type_${type}`, lang)).join(', ');
            text += `• ${t('rules_summary_blocked_media', lang, { types })}\n`;
        }
    }

    // Content rules (Allowed vs Forbidden)
    const allowedRules = rules.find(r => r.ruleType === 'allowed_messages');
    if (allowedRules) {
        const messages = allowedRules.ruleData.messages || [];
        const MAX_SHOW = 8;
        const shown = messages.slice(0, MAX_SHOW).join(', ');
        const extra = messages.length > MAX_SHOW ? ` (ועוד ${messages.length - MAX_SHOW})` : '';
        const words = shown + extra;
        text += `• ${t('rules_summary_allowed_only', lang, { words })}\n`;
    }

    const forbiddenRules = rules.find(r => r.ruleType === 'forbidden_messages');
    if (forbiddenRules) {
        if (forbiddenRules.ruleData.isCursesPreset) {
            text += `• ${t('rules_summary_no_curses', lang)}\n`;
        } else {
            const messages = forbiddenRules.ruleData.messages || [];
            const MAX_SHOW = 8;
            const shown = messages.slice(0, MAX_SHOW).join(', ');
            const extra = messages.length > MAX_SHOW ? ` (ועוד ${messages.length - MAX_SHOW})` : '';
            const words = shown + extra;
            text += `• ${t('rules_summary_forbidden', lang, { words })}\n`;
        }
    }

    if (!nonTextRule && !allowedRules && !forbiddenRules) {
        text += `• ${t('rules_summary_no_content_rules', lang)}\n`;
    }

    // Time window
    const timeRule = rules.find(r => r.ruleType === 'time_window');
    if (timeRule) {
        text += `\n⏰ ${t('rules_summary_time_window_title', lang)}\n`;
        const windows = Array.isArray(timeRule.ruleData.windows) ? timeRule.ruleData.windows : [timeRule.ruleData];
        const fmtMin = m => `${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`;
        windows.forEach(tw => {
            const startMin = typeof tw.startMinute === 'number' ? tw.startMinute : (tw.startHour || 0) * 60;
            const endMin = typeof tw.endMinute === 'number' ? tw.endMinute : (tw.endHour || 0) * 60;
            const dayName = t(`day_${tw.day}`, lang);
            const modeLabel = timeRule.ruleData.windowMode === 'block_in_window'
                ? (lang === 'he' ? '🚫 זמן חסום' : '🚫 Blocked window')
                : (lang === 'he' ? '✅ זמן מותר' : '✅ Allowed window');
            text += `• ${dayName}: ${fmtMin(startMin)} - ${fmtMin(endMin)} (${modeLabel})\n`;
        });
    }

    // Warnings
    const maxWarnings = groupConfig.warningCount || 0;
    text += `\n⚠️ ${t('rules_summary_enforcement_title', lang)}\n`;
    text += `${t('rules_summary_warnings', lang, { maxWarnings })}\n`;
    if (enforceConfig.deleteMessage) {
        text += `• ${t('rules_summary_enforce_delete', lang)}\n`;
    }

    return text.trim();
}

/**
 * Set a WhatsApp group description safely across WA Web versions.
 * Handles the renamed store key (GroupMetadata → WAWebGroupMetadataCollection).
 * Returns true on success, false if the operation failed or was denied.
 */
async function setGroupDescriptionSafe(client, groupId, description) {
    return client.pupPage.evaluate(async (chatId, desc) => {
        const chatWid = window.Store.WidFactory.createWid(chatId);
        const groupMetadata = window.Store.GroupMetadata || window.Store.WAWebGroupMetadataCollection;
        if (!groupMetadata) return false;

        let meta = groupMetadata.get(chatWid);
        if (!meta && window.Store.GroupQueryAndUpdate) {
            await window.Store.GroupQueryAndUpdate(chatWid);
            meta = groupMetadata.get(chatWid);
        }
        if (!meta) return false;

        const descId = meta.descId;
        const newId = await window.Store.MsgKey.newId();
        try {
            await window.Store.GroupUtils.setGroupDescription(chatWid, desc, newId, descId);
            return true;
        } catch (err) {
            if (err.name === 'ServerStatusCodeError') return false;
            throw err;
        }
    }, groupId, description);
}

module.exports = {
    getNormalizedJid,
    extractNumber,
    formatIsraelLocalNumber,
    parsePhoneNumber,
    RateLimiter,
    resolveContactToPhone,
    withRetry,
    buildGroupRulesSummary,
    setGroupDescriptionSafe
};
