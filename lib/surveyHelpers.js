export const SURVEY_DAILY_LIMIT = 3;
export const SURVEY_NAME_MAX = 20;
export const SURVEY_CONTENT_MAX = 300;

export function getJstDateParts(nowMs = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(nowMs));
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  return {
    year,
    month,
    day,
    dayKey: `${map.year}-${map.month}-${map.day}`,
  };
}

export function sanitizeSurveyInput(rawAuthorName, rawContent) {
  const authorName =
    (typeof rawAuthorName === 'string' ? rawAuthorName.trim() : '').slice(0, SURVEY_NAME_MAX) ||
    'プレイヤー';
  const content = (typeof rawContent === 'string' ? rawContent.trim() : '').slice(
    0,
    SURVEY_CONTENT_MAX
  );
  return {
    authorName,
    content,
    isValid: content.length > 0,
  };
}

export function computeRemainingQuota(used, limit = SURVEY_DAILY_LIMIT) {
  const safeLimit = Math.max(1, Number(limit) || SURVEY_DAILY_LIMIT);
  const safeUsed = Math.max(0, Number(used) || 0);
  return {
    used: safeUsed,
    remaining: Math.max(0, safeLimit - safeUsed),
    limit: safeLimit,
  };
}

export function timestampToIso(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (typeof value.seconds === 'number') {
    const ms = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    return new Date(ms).toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return '';
}

export function normalizeSurveyDoc(id, data = {}) {
  const createdAt = timestampToIso(data.createdAt);
  const createdAtMs = createdAt ? Date.parse(createdAt) || 0 : 0;
  return {
    id: String(id || data.id || ''),
    authorName: String(data.authorName || 'プレイヤー').slice(0, SURVEY_NAME_MAX),
    content: String(data.content || '').slice(0, SURVEY_CONTENT_MAX),
    isAdminVerified: Boolean(data.isAdminVerified),
    createdAt,
    createdAtMs,
  };
}

export function sortSurveysDesc(items) {
  return [...items].sort((a, b) => {
    const msA = typeof a.createdAtMs === 'number' ? a.createdAtMs : Date.parse(a.createdAt || '') || 0;
    const msB = typeof b.createdAtMs === 'number' ? b.createdAtMs : Date.parse(b.createdAt || '') || 0;
    return msB - msA;
  });
}
