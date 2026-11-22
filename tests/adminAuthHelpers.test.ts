import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAdminCodeInput, verifyAdminCodeDigest } from '../lib/adminAuthHelpers.js';

test('normalizeAdminCodeInput handles NFKC full-width characters, whitespace, and invisible chars', () => {
  assert.equal(normalizeAdminCodeInput('  ａｂ１２３４  '), 'ab1234');
  assert.equal(normalizeAdminCodeInput('ab\u200B12\uFEFF34'), 'ab1234');
  assert.equal(normalizeAdminCodeInput(null), '');
});

test('verifyAdminCodeDigest validates matching codes safely and rejects wrong/empty/oversized inputs', () => {
  const samplePasscode = 'sample-pass-9876';
  assert.equal(verifyAdminCodeDigest(samplePasscode, samplePasscode), true);
  assert.equal(verifyAdminCodeDigest('  ｓａｍｐｌｅ－ｐａｓｓ－９８７６ ', samplePasscode), true);
  assert.equal(verifyAdminCodeDigest('wrong-pass', samplePasscode), false);
  assert.equal(verifyAdminCodeDigest('', samplePasscode), false);
  assert.equal(verifyAdminCodeDigest('   ', samplePasscode), false);
  assert.equal(verifyAdminCodeDigest('x'.repeat(65), samplePasscode), false);

  // Also test real scrypt digest path fails safely for invalid input
  assert.equal(verifyAdminCodeDigest('invalid-code', ''), false);
  assert.equal(verifyAdminCodeDigest('', ''), false);
});
