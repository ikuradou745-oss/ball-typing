import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  ADMIN_CODE_SALT,
  ADMIN_CODE_SHA256_HEX,
  createStaticAdminWebKey,
  isStaticAdminWebKey,
  normalizeAdminCodeInput,
  sha256HexUtf8,
  verifyStaticAdminCode,
} from '../lib/adminCodeStatic.js';

test('sha256HexUtf8 matches standard SHA-256 vectors', () => {
  assert.equal(
    sha256HexUtf8('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
  assert.equal(
    sha256HexUtf8(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
  assert.equal(
    sha256HexUtf8('日本語テスト'),
    crypto.createHash('sha256').update('日本語テスト', 'utf8').digest('hex')
  );
});

test('verifyStaticAdminCode handles normalization, valid digests, and invalid inputs', () => {
  const samplePass = 'demo-admin-pass-77';
  const sampleDigest = sha256HexUtf8(`${ADMIN_CODE_SALT}:${samplePass}`);

  assert.equal(verifyStaticAdminCode(samplePass, sampleDigest), true);
  assert.equal(verifyStaticAdminCode('  ｄｅｍｏ－ａｄｍｉｎ－ｐａｓｓ－７７\u200B ', sampleDigest), true);
  assert.equal(verifyStaticAdminCode('wrong-pass', sampleDigest), false);
  assert.equal(verifyStaticAdminCode('', sampleDigest), false);
  assert.equal(verifyStaticAdminCode('x'.repeat(65), sampleDigest), false);

  assert.equal(verifyStaticAdminCode('invalid-code', ADMIN_CODE_SHA256_HEX), false);
  assert.equal(verifyStaticAdminCode('', ADMIN_CODE_SHA256_HEX), false);
  assert.equal(normalizeAdminCodeInput('　ａｂｃ　'), 'abc');
});

test('createStaticAdminWebKey and isStaticAdminWebKey bind to visitor presence ID', () => {
  const idA = '0123456789abcdef01234567';
  const idB = 'fedcba9876543210fedcba98';
  const keyA = createStaticAdminWebKey(idA);

  assert.equal(isStaticAdminWebKey(keyA, idA), true);
  assert.equal(isStaticAdminWebKey(keyA, idB), false);
  assert.equal(isStaticAdminWebKey('static_admin_v1:bad:0000', idA), false);
  assert.equal(isStaticAdminWebKey('', idA), false);
});
