import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SURVEY_DAILY_LIMIT,
  computeRemainingQuota,
  getJstDateParts,
  normalizeSurveyDoc,
  sanitizeSurveyInput,
  sortSurveysDesc,
} from '../lib/surveyHelpers.js';

test('getJstDateParts computes Asia/Tokyo calendar day accurately across UTC midnight', () => {
  // 2026-11-18T16:30:00Z is 2026-11-19T01:30:00+09:00 in JST
  const utcMs = Date.UTC(2026, 10, 18, 16, 30, 0);
  const parts = getJstDateParts(utcMs);
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 11);
  assert.equal(parts.day, 19);
  assert.equal(parts.dayKey, '2026-11-19');
});

test('sanitizeSurveyInput enforces fallback name, length bounds, and empty content rejection', () => {
  const empty = sanitizeSurveyInput('', '   ');
  assert.equal(empty.isValid, false);
  assert.equal(empty.authorName, 'プレイヤー');

  const longName = 'あ'.repeat(30);
  const longContent = 'い'.repeat(350);
  const valid = sanitizeSurveyInput(`  ${longName}  `, `  ${longContent}  `);
  assert.equal(valid.isValid, true);
  assert.equal(valid.authorName.length, 20);
  assert.equal(valid.content.length, 300);
});

test('computeRemainingQuota never goes negative and respects daily limit', () => {
  assert.deepEqual(computeRemainingQuota(0), { used: 0, remaining: 3, limit: SURVEY_DAILY_LIMIT });
  assert.deepEqual(computeRemainingQuota(2), { used: 2, remaining: 1, limit: SURVEY_DAILY_LIMIT });
  assert.deepEqual(computeRemainingQuota(5), { used: 5, remaining: 0, limit: SURVEY_DAILY_LIMIT });
});

test('normalizeSurveyDoc and sortSurveysDesc handle Firestore timestamps and order newest first', () => {
  const older = normalizeSurveyDoc('s1', {
    authorName: 'A',
    content: 'First',
    isAdminVerified: false,
    createdAt: { seconds: 1700000000, nanoseconds: 0 },
  });
  const newer = normalizeSurveyDoc('s2', {
    authorName: 'B',
    content: 'Second',
    isAdminVerified: true,
    createdAt: { toDate: () => new Date(1700000500 * 1000) },
  });
  const sorted = sortSurveysDesc([older, newer]);
  assert.deepEqual(
    sorted.map((s) => s.id),
    ['s2', 's1']
  );
  assert.equal(sorted[0].isAdminVerified, true);
  assert.equal(sorted[1].isAdminVerified, false);
});
