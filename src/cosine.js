// src/cosine.js — Cosine-similarity layer for curse detection
//
// Sits between the rule engine and the LLM:
//   score >= HARD_BLOCK_THRESHOLD → enforce immediately (no LLM call)
//   score >= SUSPICIOUS_THRESHOLD → route to LLM for final decision
//
// Uses character bigrams (n=2) so it works for short Hebrew words too.
// Only applied to short messages (≤ MAX_MSG_CHARS after normalization),
// since long messages dilute the bigram vector and produce false negatives.

const { CURSE_WORDS } = require('./cursesList');

const NGRAM_SIZE = 2;
const MAX_MSG_CHARS = 40;      // skip cosine for long messages
const HARD_BLOCK_THRESHOLD = 0.85; // high confidence → enforce immediately
const SUSPICIOUS_THRESHOLD  = 0.65; // medium confidence → send to LLM
const MIN_WORD_LEN_FOR_HARD_BLOCK = 4; // short words (כוס, יא) have too few bigrams for reliable hard-block

// ── Normalisation ─────────────────────────────────────────────────────────

function normalizeForCosine(text) {
    return text
        .toLowerCase()
        // Strip invisible / zero-width / bidirectional control characters
        .replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202F\uFEFF]/gu, '')
        // Strip combining marks (Hebrew niqqud, diacritics)
        .replace(/\p{M}/gu, '')
        // Keep only letters and digits (removes spaces and punctuation)
        .replace(/[^\p{L}\p{N}]/gu, '')
        .trim();
}

// ── Bigram vector ─────────────────────────────────────────────────────────

function textToBigramVector(text) {
    const freq = {};
    for (let i = 0; i <= text.length - NGRAM_SIZE; i++) {
        const gram = text.slice(i, i + NGRAM_SIZE);
        freq[gram] = (freq[gram] || 0) + 1;
    }
    return freq;
}

// ── Cosine similarity ─────────────────────────────────────────────────────

function cosineSimilarity(v1, v2) {
    let dot = 0;
    for (const key of Object.keys(v1)) {
        if (v2[key]) dot += v1[key] * v2[key];
    }
    const mag1 = Math.sqrt(Object.values(v1).reduce((s, x) => s + x * x, 0));
    const mag2 = Math.sqrt(Object.values(v2).reduce((s, x) => s + x * x, 0));
    if (!mag1 || !mag2) return 0;
    return dot / (mag1 * mag2);
}

// ── Reference vectors (built once lazily from CURSE_WORDS) ────────────────

let _referenceVectors = null;

function getReferenceVectors() {
    if (_referenceVectors) return _referenceVectors;
    _referenceVectors = CURSE_WORDS
        .map(word => {
            const norm = normalizeForCosine(word);
            if (norm.length < NGRAM_SIZE) return null;
            return { word, norm, vec: textToBigramVector(norm) };
        })
        .filter(Boolean);
    return _referenceVectors;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Check a message against all known curse-word reference vectors.
 *
 * @param {string} text - Raw message content
 * @returns {{
 *   score: number,          // best cosine similarity found (0–1)
 *   matchedWord: string|null, // the curse word that matched best
 *   isHardBlock: boolean,   // true → enforce immediately without LLM
 *   isSuspicious: boolean,  // true → route to LLM for final decision
 * }}
 */
function checkCosineSimilarity(text) {
    const norm = normalizeForCosine(text);

    // Too short → not enough bigrams to be meaningful
    // Too long  → vector diluted, produces unreliable similarity scores
    if (norm.length < NGRAM_SIZE || norm.length > MAX_MSG_CHARS) {
        return { score: 0, matchedWord: null, isHardBlock: false, isSuspicious: false };
    }

    const msgVec = textToBigramVector(norm);
    const refs = getReferenceVectors();

    let bestScore = 0;
    let bestWord  = null;
    let bestNormLen = 0;

    for (const ref of refs) {
        const sim = cosineSimilarity(msgVec, ref.vec);
        if (sim > bestScore) {
            bestScore    = sim;
            bestWord     = ref.word;
            bestNormLen  = ref.norm.length;
        }
    }

    // Hard-block only if the matching reference word is long enough to be reliable
    const isHardBlock  = bestScore >= HARD_BLOCK_THRESHOLD && bestNormLen >= MIN_WORD_LEN_FOR_HARD_BLOCK;
    const isSuspicious = bestScore >= SUSPICIOUS_THRESHOLD;

    return { score: bestScore, matchedWord: bestWord, isHardBlock, isSuspicious };
}

function resetReferenceVectors() {
    _referenceVectors = null;
}

module.exports = { checkCosineSimilarity, resetReferenceVectors };
