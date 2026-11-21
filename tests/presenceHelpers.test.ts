import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESENCE_ONLINE_WINDOW_MS,
  getMsUntilNextJstMidnight,
  normalizePresenceDoc,
  splitPresenceRecords,
} from '../lib/presenceHelpers.js';

test('splitPresenceRecords resets today logins right at 00:00 JST and filters online timeout', () => {
  // 2026-11-20 23:59:50 JST -> 2026-11-20T14:59:50Z
  const beforeMidnightMs = Date.UTC(2026, 10, 20, 14, 59, 50);
  // 2026-11-21 00:00:05 JST -> 2026-11-20T15:00:05Z
  const afterMidnightMs = Date.UTC(2026, 10, 20, 15, 0, 5);

  const records = [
    normalizePresenceDoc('v1', {
      username: 'ユーザーA',
      isAdminVerified: true,
      dayKey: '2026-11-20',
      isOnline: true,
      lastLoginAt: new Date(beforeMidnightMs - 5000).toISOString(),
      lastSeenAt: new Date(beforeMidnightMs - 2000).toISOString(),
    }),
    normalizePresenceDoc('v2', {
      username: 'ユーザーB',
      isAdminVerified: false,
      dayKey: '2026-11-20',
      isOnline: true,
      // Stale (> online window)
      lastLoginAt: new Date(beforeMidnightMs - 120_000).toISOString(),
      lastSeenAt: new Date(beforeMidnightMs - PRESENCE_ONLINE_WINDOW_MS - 5000).toISOString(),
    }),
    normalizePresenceDoc('v3', {
      username: 'ユーザーC',
      isAdminVerified: false,
      dayKey: '2026-11-21',
      isOnline: true,
      lastLoginAt: new Date(afterMidnightMs - 1000).toISOString(),
      lastSeenAt: new Date(afterMidnightMs - 1000).toISOString(),
    }),
  ];

  const before = splitPresenceRecords(records, beforeMidnightMs, 'v1');
  assert.equal(before.todayDayKey, '2026-11-20');
  assert.deepEqual(
    before.onlineUsers.map((u) => u.visitorId),
    ['v1', 'v3']
  );
  assert.deepEqual(
    before.todayLogins.map((u) => u.visitorId),
    ['v1', 'v2']
  );

  const after = splitPresenceRecords(records, afterMidnightMs, 'v3');
  assert.equal(after.todayDayKey, '2026-11-21');
  assert.deepEqual(
    after.todayLogins.map((u) => u.visitorId),
    ['v3']
  );
  assert.deepEqual(
    after.onlineUsers.map((u) => u.visitorId),
    ['v3', 'v1']
  );
});

test('splitPresenceRecords deduplicates same custom username while preserving multiple default-named players', () => {
  const nowMs = Date.UTC(2026, 10, 21, 7, 45, 0);
  const records = [
    normalizePresenceDoc('dup_old_1', {
      username: 'らもビルダー',
      isAdminVerified: true,
      dayKey: '2026-11-21',
      isOnline: true,
      lastLoginAt: new Date(nowMs - 600_000).toISOString(),
      lastSeenAt: new Date(nowMs - 300_000).toISOString(),
    }),
    normalizePresenceDoc('dup_old_2', {
      username: 'らもビルダー',
      isAdminVerified: false,
      dayKey: '2026-11-21',
      isOnline: true,
      lastLoginAt: new Date(nowMs - 20_000).toISOString(),
      lastSeenAt: new Date(nowMs - 20_000).toISOString(),
    }),
    normalizePresenceDoc('self_id', {
      username: 'らもビルダー',
      isAdminVerified: false,
      dayKey: '2026-11-21',
      isOnline: true,
      lastLoginAt: new Date(nowMs - 5_000).toISOString(),
      lastSeenAt: new Date(nowMs - 2_000).toISOString(),
    }),
    normalizePresenceDoc('guest_a', {
      username: 'プレイヤー1',
      isAdminVerified: false,
      dayKey: '2026-11-21',
      isOnline: true,
      lastLoginAt: new Date(nowMs - 10_000).toISOString(),
      lastSeenAt: new Date(nowMs - 4_000).toISOString(),
    }),
    normalizePresenceDoc('guest_b', {
      username: 'プレイヤー1',
      isAdminVerified: false,
      dayKey: '2026-11-21',
      isOnline: true,
      lastLoginAt: new Date(nowMs - 8_000).toISOString(),
      lastSeenAt: new Date(nowMs - 3_000).toISOString(),
    }),
  ];

  const result = splitPresenceRecords(records, nowMs, 'self_id');
  assert.equal(result.todayLogins.length, 3);
  assert.equal(result.onlineUsers.length, 3);

  const ramoEntry = result.todayLogins.find((u) => u.username === 'らもビルダー');
  assert.ok(ramoEntry);
  assert.equal(ramoEntry.visitorId, 'self_id');
  assert.equal(ramoEntry.isSelf, true);
  assert.equal(ramoEntry.isAdminVerified, true);

  const guestIds = result.onlineUsers.filter((u) => u.username === 'プレイヤー1').map((u) => u.visitorId);
  assert.deepEqual(guestIds.sort(), ['guest_a', 'guest_b']);
});

test('getMsUntilNextJstMidnight computes remaining milliseconds until 00:00 JST', () => {
  const nowMs = Date.UTC(2026, 10, 20, 14, 50, 0);
  assert.equal(getMsUntilNextJstMidnight(nowMs), 10 * 60 * 1000);
});
