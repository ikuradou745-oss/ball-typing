import { SURVEY_NAME_MAX, getJstDateParts, timestampToIso } from './surveyHelpers.js';

export const PRESENCE_SCOPE = 'public_lobby';
export const PRESENCE_ONLINE_WINDOW_MS = 90 * 1000;
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 10 * 1000;
const DEFAULT_PLAYER_USERNAMES = new Set(['プレイヤー', 'プレイヤー1']);

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

function shouldPreferPresenceRecord(candidate, incumbent) {
  if (!incumbent) return true;
  if (candidate.isSelf !== incumbent.isSelf) return candidate.isSelf;
  if (candidate.activeNow !== incumbent.activeNow) return candidate.activeNow;
  if (candidate.lastSeenAtMs !== incumbent.lastSeenAtMs) {
    return candidate.lastSeenAtMs > incumbent.lastSeenAtMs;
  }
  if (candidate.isAdminVerified !== incumbent.isAdminVerified) {
    return candidate.isAdminVerified;
  }
  return candidate.lastLoginAtMs > incumbent.lastLoginAtMs;
}

function deduplicatePresenceList(list) {
  const byIdentity = new Map();
  for (const item of list) {
    const key = DEFAULT_PLAYER_USERNAMES.has(item.username)
      ? `id:${item.visitorId}`
      : `name:${item.username}`;
    const existing = byIdentity.get(key);
    if (!existing || shouldPreferPresenceRecord(item, existing)) {
      byIdentity.set(key, {
        ...item,
        isAdminVerified: Boolean(item.isAdminVerified || existing?.isAdminVerified),
      });
    } else if (item.isAdminVerified && !existing.isAdminVerified) {
      byIdentity.set(key, { ...existing, isAdminVerified: true });
    }
  }
  return Array.from(byIdentity.values());
}

export function splitPresenceRecords(records, nowMs = Date.now(), selfVisitorId = '') {
  const todayDayKey = getJstDateParts(nowMs).dayKey;
  const normalized = Array.isArray(records) ? records : [];

  const byVisitorId = new Map();
  for (const raw of normalized) {
    if (!raw || !raw.visitorId) continue;
    const isSelf = Boolean(selfVisitorId && raw.visitorId === selfVisitorId);
    const activeNow = isRecordCurrentlyOnline(raw, nowMs);
    const enriched = {
      ...raw,
      isSelf,
      activeNow,
    };
    const prev = byVisitorId.get(raw.visitorId);
    if (!prev || shouldPreferPresenceRecord(enriched, prev)) {
      byVisitorId.set(raw.visitorId, enriched);
    }
  }

  const rawOnline = [];
  const rawToday = [];
  for (const record of byVisitorId.values()) {
    if (record.activeNow) {
      rawOnline.push(record);
    }
    if (record.dayKey === todayDayKey) {
      rawToday.push(record);
    }
  }

  const onlineUsers = deduplicatePresenceList(rawOnline).sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return b.lastSeenAtMs - a.lastSeenAtMs;
  });

  const todayLogins = deduplicatePresenceList(rawToday).sort((a, b) => {
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
