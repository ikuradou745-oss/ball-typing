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
      // Stale (>60s ago)
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
  // At 00:00:05 JST, yesterday's dayKey ('2026-11-20') is excluded from todayLogins
  assert.deepEqual(
    after.todayLogins.map((u) => u.visitorId),
    ['v3']
  );
  assert.deepEqual(
    after.onlineUsers.map((u) => u.visitorId),
    ['v3', 'v1']
  );
});

test('getMsUntilNextJstMidnight computes remaining milliseconds until 00:00 JST', () => {
  // 2026-11-20 23:50:00 JST -> 10 minutes = 600,000 ms until 00:00 JST
  const nowMs = Date.UTC(2026, 10, 20, 14, 50, 0);
  assert.equal(getMsUntilNextJstMidnight(nowMs), 10 * 60 * 1000);
});
