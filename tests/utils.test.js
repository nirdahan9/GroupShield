// tests/utils.test.js
const assert = require('assert');
const { parsePhoneNumber, getNormalizedJid, extractNumber } = require('../src/utils');

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

console.log('\n🧪 utils tests\n');

console.log('parsePhoneNumber:');
test('parses Israeli local 05X format', () => {
    const result = parsePhoneNumber('0521234567');
    assert.ok(result && result.startsWith('972'));
});
test('parses international format', () => {
    const result = parsePhoneNumber('+972521234567');
    assert.strictEqual(result, '972521234567');
});
test('handles dashes', () => {
    const result = parsePhoneNumber('052-123-4567');
    assert.ok(result && result.startsWith('972'));
});
test('returns null for invalid input', () => {
    assert.strictEqual(parsePhoneNumber('abc'), null);
});
test('returns null for empty input', () => {
    assert.strictEqual(parsePhoneNumber(''), null);
});

console.log('getNormalizedJid:');
test('converts @c.us to @s.whatsapp.net', () => {
    assert.strictEqual(getNormalizedJid('123@c.us'), '123@s.whatsapp.net');
});
test('keeps @s.whatsapp.net unchanged', () => {
    assert.strictEqual(getNormalizedJid('123@s.whatsapp.net'), '123@s.whatsapp.net');
});
test('handles null', () => {
    assert.strictEqual(getNormalizedJid(null), null);
});

console.log('extractNumber:');
test('extracts number from JID', () => {
    assert.strictEqual(extractNumber('972521234567@s.whatsapp.net'), '972521234567');
});
test('handles JID with colon', () => {
    const result = extractNumber('972521234567:12@s.whatsapp.net');
    assert.ok(result === '972521234567' || result === '97252123456712');
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
