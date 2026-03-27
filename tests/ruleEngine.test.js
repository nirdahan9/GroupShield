// tests/ruleEngine.test.js
const assert = require('assert');
// Mock the i18n module
const mockT = (key, lang, params) => key;
// We need to test the functions in isolation
// Since ruleEngine requires './i18n', mock it first
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === './i18n') return { t: mockT };
    return originalLoad.apply(this, arguments);
};

const { evaluateMessage, checkAntiSpam } = require('../src/ruleEngine');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ❌ ${name}: ${e.message}`);
        failed++;
    }
}

console.log('\n🧪 ruleEngine tests\n');

// --- allowed_messages (exact) ---
console.log('allowed_messages (exact):');
test('allows exact match', () => {
    const rules = [{ ruleType: 'allowed_messages', ruleData: { messages: ['שלום'], matchMode: 'exact' } }];
    const result = evaluateMessage(rules, { content: 'שלום', msgType: 'chat' });
    assert.strictEqual(result.allowed, true);
});
test('blocks non-matching message', () => {
    const rules = [{ ruleType: 'allowed_messages', ruleData: { messages: ['שלום'], matchMode: 'exact' } }];
    const result = evaluateMessage(rules, { content: 'מה קורה', msgType: 'chat' });
    assert.strictEqual(result.allowed, false);
});
test('exact match does not allow partial', () => {
    const rules = [{ ruleType: 'allowed_messages', ruleData: { messages: ['שלום'], matchMode: 'exact' } }];
    const result = evaluateMessage(rules, { content: 'שלום עולם', msgType: 'chat' });
    assert.strictEqual(result.allowed, false);
});

// --- allowed_messages (contains) ---
console.log('allowed_messages (contains):');
test('contains match allows partial', () => {
    const rules = [{ ruleType: 'allowed_messages', ruleData: { messages: ['שלום'], matchMode: 'contains' } }];
    const result = evaluateMessage(rules, { content: 'שלום עולם', msgType: 'chat' });
    assert.strictEqual(result.allowed, true);
});

// --- forbidden_messages (contains) ---
console.log('forbidden_messages (contains):');
test('contains match blocks message with forbidden phrase', () => {
    const rules = [{ ruleType: 'forbidden_messages', ruleData: { messages: ['spam'], matchMode: 'contains' } }];
    const result = evaluateMessage(rules, { content: 'this is spam content', msgType: 'chat' });
    assert.strictEqual(result.allowed, false);
});
test('allows clean message', () => {
    const rules = [{ ruleType: 'forbidden_messages', ruleData: { messages: ['spam'], matchMode: 'contains' } }];
    const result = evaluateMessage(rules, { content: 'hello world', msgType: 'chat' });
    assert.strictEqual(result.allowed, true);
});

// --- forbidden_messages (exact) ---
console.log('forbidden_messages (exact):');
test('exact blocks only exact match', () => {
    const rules = [{ ruleType: 'forbidden_messages', ruleData: { messages: ['badword'], matchMode: 'exact' } }];
    const result = evaluateMessage(rules, { content: 'badword', msgType: 'chat' });
    assert.strictEqual(result.allowed, false);
});
test('exact allows message that only contains the word', () => {
    const rules = [{ ruleType: 'forbidden_messages', ruleData: { messages: ['badword'], matchMode: 'exact' } }];
    const result = evaluateMessage(rules, { content: 'not a badword today', msgType: 'chat' });
    assert.strictEqual(result.allowed, true);
});

// --- block_non_text ---
console.log('block_non_text:');
test('blocks image when all_non_text blocked', () => {
    const rules = [{ ruleType: 'block_non_text', ruleData: { blockedTypes: ['all_non_text'] } }];
    const result = evaluateMessage(rules, { content: '', msgType: 'image' });
    assert.strictEqual(result.allowed, false);
});
test('allows text when block_non_text active', () => {
    const rules = [{ ruleType: 'block_non_text', ruleData: { blockedTypes: ['all_non_text'] } }];
    const result = evaluateMessage(rules, { content: 'hello', msgType: 'chat' });
    assert.strictEqual(result.allowed, true);
});

// --- checkAntiSpam ---
console.log('checkAntiSpam:');
test('no spam in empty map', () => {
    const spamMap = new Map();
    const result = checkAntiSpam(spamMap, 'user1', { maxMessages: 3, windowSeconds: 10 });
    assert.strictEqual(result.isSpam, false);
    assert.strictEqual(result.isWarning, false);
});
test('warning at threshold', () => {
    const spamMap = new Map();
    checkAntiSpam(spamMap, 'user1', { maxMessages: 3, windowSeconds: 10 });
    checkAntiSpam(spamMap, 'user1', { maxMessages: 3, windowSeconds: 10 });
    const result = checkAntiSpam(spamMap, 'user1', { maxMessages: 3, windowSeconds: 10 });
    assert.strictEqual(result.isWarning, true);
});
test('spam above threshold', () => {
    const spamMap = new Map();
    for (let i = 0; i < 4; i++) checkAntiSpam(spamMap, 'user1', { maxMessages: 3, windowSeconds: 10 });
    const result = checkAntiSpam(spamMap, 'user1', { maxMessages: 3, windowSeconds: 10 });
    assert.strictEqual(result.isSpam, true);
});

// --- forbidden_messages (smart) — Hebrew obfuscation ---
console.log('forbidden_messages (smart — Hebrew obfuscation):');
test('blocks direct Hebrew curse', () => {
    const rules = [{ ruleType: 'forbidden_messages', ruleData: { messages: ['כוס'], matchMode: 'smart' } }];
    assert.strictEqual(evaluateMessage(rules, { content: 'כוס', msgType: 'chat' }).allowed, false);
});
test('blocks Hebrew curse with spaces between letters (כ ו ס)', () => {
    const rules = [{ ruleType: 'forbidden_messages', ruleData: { messages: ['כוס'], matchMode: 'smart' } }];
    assert.strictEqual(evaluateMessage(rules, { content: 'כ ו ס', msgType: 'chat' }).allowed, false);
});
test('blocks Hebrew curse with phonetic substitution (א→ע)', () => {
    const rules = [{ ruleType: 'forbidden_messages', ruleData: { messages: ['אידיוט'], matchMode: 'smart' } }];
    assert.strictEqual(evaluateMessage(rules, { content: 'עידיוט', msgType: 'chat' }).allowed, false);
});
test('blocks Hebrew curse with digit homoglyph (1→ו)', () => {
    const rules = [{ ruleType: 'forbidden_messages', ruleData: { messages: ['כוס'], matchMode: 'smart' } }];
    assert.strictEqual(evaluateMessage(rules, { content: 'כ1ס', msgType: 'chat' }).allowed, false);
});
test('blocks Hebrew curse embedded in sentence', () => {
    const rules = [{ ruleType: 'forbidden_messages', ruleData: { messages: ['כוס'], matchMode: 'smart' } }];
    assert.strictEqual(evaluateMessage(rules, { content: 'אתה כוס גדול', msgType: 'chat' }).allowed, false);
});
test('allows innocent Hebrew message (smart mode)', () => {
    const rules = [{ ruleType: 'forbidden_messages', ruleData: { messages: ['כוס', 'זין', 'זונה'], matchMode: 'smart' } }];
    assert.strictEqual(evaluateMessage(rules, { content: 'שלום חברים, מה נשמע?', msgType: 'chat' }).allowed, true);
});

// --- forbidden_messages (smart) — English obfuscation ---
console.log('forbidden_messages (smart — English obfuscation):');
test('blocks English curse with leet substitution (fvck)', () => {
    const rules = [{ ruleType: 'forbidden_messages', ruleData: { messages: ['fuck'], matchMode: 'smart' } }];
    assert.strictEqual(evaluateMessage(rules, { content: 'fvck this', msgType: 'chat' }).allowed, false);
});
test('blocks English curse with special char substitution (sh!t)', () => {
    const rules = [{ ruleType: 'forbidden_messages', ruleData: { messages: ['shit'], matchMode: 'smart' } }];
    assert.strictEqual(evaluateMessage(rules, { content: 'sh!t', msgType: 'chat' }).allowed, false);
});
test('blocks English curse with spaced letters (f u c k)', () => {
    const rules = [{ ruleType: 'forbidden_messages', ruleData: { messages: ['fuck'], matchMode: 'smart' } }];
    assert.strictEqual(evaluateMessage(rules, { content: 'f u c k', msgType: 'chat' }).allowed, false);
});
test('blocks English curse with repeated letters (fuuuuck)', () => {
    const rules = [{ ruleType: 'forbidden_messages', ruleData: { messages: ['fuck'], matchMode: 'smart' } }];
    assert.strictEqual(evaluateMessage(rules, { content: 'fuuuuck', msgType: 'chat' }).allowed, false);
});
test('allows innocent English message (smart mode)', () => {
    const rules = [{ ruleType: 'forbidden_messages', ruleData: { messages: ['fuck', 'shit', 'bitch'], matchMode: 'smart' } }];
    assert.strictEqual(evaluateMessage(rules, { content: 'Good morning everyone!', msgType: 'chat' }).allowed, true);
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
