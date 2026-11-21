import { SURVEY_NAME_MAX, getJstDateParts, timestampToIso } from './surveyHelpers.js';

export const PRESENCE_SCOPE = 'public_lobby';
export const PRESENCE_ONLINE_WINDOW_MS = 60 * 1000;
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 20 * 1000;

export function sanitizePresenceUsername(rawName) {
  const clean = (typeof rawName === 'string' ? rawName.trim() : '').slice(0, SURVEY_NAME_MAX);
  return clean || 'プレイヤー';
}

export function getMsUntilNextJstMidnight(nowMs = Date.now()) {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const jstMs = nowMs + JST_OFFSET_MS;
  const elapsedToday = ((jstMs % DAY_MS) + DAY_MS) % DAY_MS;
  return DAY_MS - elapsedToday;
}

export function normalizePresenceDoc(id, data = {}) {
  const lastLoginAt = timestampToIso(data.lastLoginAt);
  const lastSeenAt = timestampToIso(data.lastSeenAt);
  const lastLoginAtMs = lastLoginAt ? Date.parse(lastLoginAt) || 0 : 0;
  const lastSeenAtMs = lastSeenAt ? Date.parse(lastSeenAt) || 0 : 0;
  return {
    visitorId: String(id || data.visitorId || ''),
    username: sanitizePresenceUsername(data.username),
    isAdminVerified: Boolean(data.isAdminVerified),
    dayKey: typeof data.dayKey === 'string' ? data.dayKey : '',
    isOnline: Boolean(data.isOnline),
    lastLoginAt,
    lastLoginAtMs,
    lastSeenAt,
    lastSeenAtMs,
  };
}

export function isRecordCurrentlyOnline(record, nowMs = Date.now()) {
  if (!record || !record.isOnline) return false;
  if (!record.lastSeenAtMs) return false;
  return nowMs - record.lastSeenAtMs <= PRESENCE_ONLINE_WINDOW_MS;
}

export function splitPresenceRecords(records, nowMs = Date.now(), selfVisitorId = '') {
  const todayDayKey = getJstDateParts(nowMs).dayKey;
  const normalized = Array.isArray(records) ? records : [];

  const onlineUsers = [];
  const todayLogins = [];

  for (const raw of normalized) {
    if (!raw || !raw.visitorId) continue;
    const isSelf = Boolean(selfVisitorId && raw.visitorId === selfVisitorId);
    const activeNow = isRecordCurrentlyOnline(raw, nowMs);
    const enriched = {
      ...raw,
      isSelf,
      activeNow,
    };
    if (activeNow) {
      onlineUsers.push(enriched);
    }
    if (raw.dayKey === todayDayKey) {
      todayLogins.push(enriched);
    }
  }

  onlineUsers.sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return b.lastSeenAtMs - a.lastSeenAtMs;
  });

  todayLogins.sort((a, b) => {
    if (a.activeNow !== b.activeNow) return a.activeNow ? -1 : 1;
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return b.lastSeenAtMs - a.lastSeenAtMs;
  });

  return {
    todayDayKey,
    onlineUsers,
    todayLogins,
  };
}
