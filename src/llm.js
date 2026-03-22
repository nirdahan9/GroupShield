// src/llm.js - LLM-based moderation fallback via Groq
// Called async for messages that passed the rule engine but are "suspicious".
// Falls back silently on error — never blocks message flow.

const https = require('https');
const config = require('./config');
const logger = require('./logger');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-8b-instant';
const TIMEOUT_MS = 4000;

// ── Usage tracking ────────────────────────────────────────────────────────────
// Rolling 1-minute window + total counter (for status messages)

const GROQ_MINUTE_CAP = 30; // Groq free tier limit (display reference only)
const callTimestamps = [];  // timestamps of calls in the last 60s
let totalCalls = 0;

function recordCall() {
    const now = Date.now();
    callTimestamps.push(now);
    totalCalls++;
    // Evict entries older than 60s
    const cutoff = now - 60_000;
    while (callTimestamps.length && callTimestamps[0] < cutoff) callTimestamps.shift();
}

function getGroqStats() {
    const now = Date.now();
    const cutoff = now - 60_000;
    while (callTimestamps.length && callTimestamps[0] < cutoff) callTimestamps.shift();
    const lastMinute = callTimestamps.length;
    const pct = Math.round((lastMinute / GROQ_MINUTE_CAP) * 100);
    return { lastMinute, cap: GROQ_MINUTE_CAP, pct, total: totalCalls };
}

// ── Suspicion score ───────────────────────────────────────────────────────────
// Returns true if the message is worth checking with the LLM.
// Only messages that PASSED the rule engine reach here.

function isSuspicious(text) {
    if (!text || text.length < 2) return false;
    const lower = text.toLowerCase();

    // 1. Special chars replacing letters: f*ck, a$$, sh!t, b@tch
    if (/[a-zA-Z\u05D0-\u05EA][*@#$!][a-zA-Z\u05D0-\u05EA]/.test(text)) return true;

    // 2. Known abbreviations / leet bypasses not in the forbidden list
    if (/\b(wtf|kys|stfu|fck|sht|btch|cnt|a55|f4ck|fvck|phck|biatch|mofo)\b/.test(lower)) return true;

    // 3. All-caps short message (aggressive tone)
    if (text.length <= 25 && /[A-Z]{3,}/.test(text) && text === text.toUpperCase() && /[A-Z]/.test(text)) return true;

    // 4. Mixed-script single "word" (could be a disguised curse)
    // e.g. "כ0ס" already handled by ruleEngine homoglyphs,
    // but patterns like "f-u-c-k" (dashes between letters) slip through
    if (/[a-zA-Z\u05D0-\u05EA][-_.][a-zA-Z\u05D0-\u05EA][-_.][a-zA-Z\u05D0-\u05EA]/.test(text)) return true;

    // 5. "Go _ yourself" or "kill _" patterns with pronouns
    if (/\b(go\s+\w+\s+yourself|kill\s+(yourself|ur?self)|hope\s+you\s+(die|rot|burn))\b/.test(lower)) return true;

    return false;
}

// ── Groq API call ─────────────────────────────────────────────────────────────

function callGroq(text) {
    const apiKey = config.get('groq.apiKey');
    if (!apiKey) return Promise.resolve(null);

    const prompt =
        'You are a content moderator for a WhatsApp group.\n' +
        'Group rule: no swearing, no offensive language, no insults, no death wishes.\n' +
        'Decide if the following message violates this rule.\n' +
        'Answer with exactly one word: YES or NO.\n\n' +
        'Message: ' + text;

    const body = JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 5,
        temperature: 0
    });

    return new Promise((resolve) => {
        const req = https.request(
            'https://api.groq.com',
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
                        const answer = (parsed.choices?.[0]?.message?.content || '').trim().toUpperCase();
                        resolve(answer.startsWith('YES'));
                    } catch {
                        resolve(null);
                    }
                });
            }
        );

        req.setTimeout(TIMEOUT_MS, () => { req.destroy(); resolve(null); });
        req.on('error', () => resolve(null));
        req.write(body);
        req.end();
    });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Async LLM fallback check — called ONLY for messages that passed the rule engine
 * AND belong to a group with the curses preset active.
 *
 * If the LLM decides it's a violation → executes enforcement.
 * On any error or timeout → silently allows (no false positives from infra failures).
 */
async function checkWithLLM(client, msg, senderJid, content, msgType, groupConfig, enforcementConfig, rateLimiter, lang) {
    if (!isSuspicious(content)) return;

    const apiKey = config.get('groq.apiKey');
    if (!apiKey) return;

    recordCall();
    try {
        const isViolation = await callGroq(content);
        if (isViolation !== true) return;

        logger.info(`LLM flagged message in ${groupConfig.groupName} from ${senderJid}: "${content.slice(0, 60)}"`);

        const { executeEnforcement } = require('./enforcement');
        const { t } = require('./i18n');
        await executeEnforcement(
            client, msg, senderJid,
            [t('reason_llm_violation', lang)],
            content, msgType, groupConfig, enforcementConfig, rateLimiter, lang
        );
    } catch (e) {
        logger.warn('LLM moderation check failed', e.message);
    }
}

module.exports = { checkWithLLM, getGroqStats };
