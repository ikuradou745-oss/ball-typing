import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {
  SURVEY_CONTENT_MAX,
  SURVEY_DAILY_LIMIT,
  SURVEY_NAME_MAX,
  getJstDateParts,
  normalizeSurveyDoc,
  sortSurveysDesc,
} from './lib/surveyHelpers.js';
import {
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  PRESENCE_SCOPE,
  getMsUntilNextJstMidnight,
  normalizePresenceDoc,
  sanitizePresenceUsername,
  splitPresenceRecords,
} from './lib/presenceHelpers.js';

export {
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  SURVEY_CONTENT_MAX,
  SURVEY_DAILY_LIMIT,
  SURVEY_NAME_MAX,
  getJstDateParts,
  getMsUntilNextJstMidnight,
  splitPresenceRecords,
};

const ADMIN_WEB_KEY_STORAGE = 'ball_typing_admin_key_v1';
const ADMIN_CHANNEL_STORAGE = 'ball_typing_admin_channel_v1';
const VISITOR_WEB_KEY_STORAGE = 'ball_typing_visitor_key_v1';
const SURVEY_STATE_STORAGE = 'ball_typing_survey_state_v1';

export const OperationType = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
});

let appInstance = null;
let dbInstance = null;
let initPromise = null;
let connectionTested = false;

function readStorageKey(storageKey) {
  try {
    return localStorage.getItem(storageKey) || '';
  } catch {
    return '';
  }
}

function writeStorageKey(storageKey, value) {
  try {
    if (value) {
      localStorage.setItem(storageKey, value);
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function getSelfVisitorId() {
  const token = readStorageKey(VISITOR_WEB_KEY_STORAGE);
  if (!token || !token.includes('.')) return '';
  try {
    const encoded = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const pad = encoded.length % 4 === 0 ? '' : '='.repeat(4 - (encoded.length % 4));
    const parsed = JSON.parse(atob(encoded + pad));
    return typeof parsed.vid === 'string' ? parsed.vid : '';
  } catch {
    return '';
  }
}

function readSurveyStateWebKey() {
  const today = getJstDateParts().dayKey;
  try {
    const raw = localStorage.getItem(SURVEY_STATE_STORAGE);
    if (!raw) {
      return { dayKey: today, used: 0, remaining: SURVEY_DAILY_LIMIT, limit: SURVEY_DAILY_LIMIT, items: [] };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.dayKey !== today) {
      return { dayKey: today, used: 0, remaining: SURVEY_DAILY_LIMIT, limit: SURVEY_DAILY_LIMIT, items: [] };
    }
    return {
      dayKey: today,
      used: Number(parsed.used) || 0,
      remaining: Number.isFinite(parsed.remaining) ? parsed.remaining : SURVEY_DAILY_LIMIT,
      limit: Number(parsed.limit) || SURVEY_DAILY_LIMIT,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { dayKey: today, used: 0, remaining: SURVEY_DAILY_LIMIT, limit: SURVEY_DAILY_LIMIT, items: [] };
  }
}

function writeSurveyStateWebKey(nextState) {
  try {
    localStorage.setItem(SURVEY_STATE_STORAGE, JSON.stringify(nextState));
  } catch {
    // Ignore storage quota errors
  }
}

function clearAdminStorageKeys() {
  writeStorageKey(ADMIN_WEB_KEY_STORAGE, '');
  writeStorageKey(ADMIN_CHANNEL_STORAGE, '');
}

function buildAuthHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  const adminKey = readStorageKey(ADMIN_WEB_KEY_STORAGE);
  const visitorKey = readStorageKey(VISITOR_WEB_KEY_STORAGE);
  if (adminKey) headers['X-Admin-Key'] = adminKey;
  if (visitorKey) headers['X-Visitor-Key'] = visitorKey;
  return headers;
}

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: [],
    },
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(db) {
  if (connectionTested) return;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export async function ensureFirebase() {
  if (dbInstance) {
    return { app: appInstance, db: dbInstance };
  }
  if (!initPromise) {
    initPromise = (async () => {
      const resp = await fetch('./firebase-applet-config.json', { cache: 'no-store' });
      if (!resp.ok) {
        throw new Error('Firebase設定ファイルが見つかりません。');
      }
      const firebaseConfig = await resp.json();
      appInstance = initializeApp(firebaseConfig);
      dbInstance = firebaseConfig.firestoreDatabaseId
        ? getFirestore(appInstance, firebaseConfig.firestoreDatabaseId)
        : getFirestore(appInstance);
      await testConnection(dbInstance);
      return { app: appInstance, db: dbInstance };
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export async function fetchAdminStatus() {
  try {
    const resp = await fetch('/api/admin/status', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: buildAuthHeaders(),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    if (data && data.visitorKey) {
      writeStorageKey(VISITOR_WEB_KEY_STORAGE, data.visitorKey);
    }
    if (data && data.isAdmin) {
      if (data.adminKey) {
        writeStorageKey(ADMIN_WEB_KEY_STORAGE, data.adminKey);
      }
      if (data.adminChannel) {
        writeStorageKey(ADMIN_CHANNEL_STORAGE, data.adminChannel);
      }
      return true;
    }
    clearAdminStorageKeys();
    return false;
  } catch {
    return false;
  }
}

export async function verifyAdminCodeOnServer(code, username = '') {
  let resp;
  try {
    resp = await fetch('/api/admin/verify-code', {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify({
        code: String(code || ''),
        username: String(username || '').slice(0, SURVEY_NAME_MAX),
      }),
    });
  } catch {
    throw new Error('管理者認証サーバーに接続できません。');
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'コードが正しくありません。');
  }
  if (data.visitorKey) {
    writeStorageKey(VISITOR_WEB_KEY_STORAGE, data.visitorKey);
  }
  if (data.adminKey) {
    writeStorageKey(ADMIN_WEB_KEY_STORAGE, data.adminKey);
  }
  if (data.adminChannel) {
    writeStorageKey(ADMIN_CHANNEL_STORAGE, data.adminChannel);
  }
  return true;
}

export async function logoutAdminSession() {
  await fetch('/api/admin/logout', {
    method: 'POST',
    headers: buildAuthHeaders(),
    credentials: 'same-origin',
  }).catch(() => {});
  clearAdminStorageKeys();
  return false;
}

export async function getTodaySurveyQuota() {
  const cached = readSurveyStateWebKey();
  try {
    const resp = await fetch('/api/surveys/quota', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: buildAuthHeaders(),
    });
    if (!resp.ok) {
      return { used: cached.used, remaining: cached.remaining, limit: cached.limit };
    }
    const data = await resp.json();
    if (data && data.visitorKey) {
      writeStorageKey(VISITOR_WEB_KEY_STORAGE, data.visitorKey);
    }
    const used = Number(data.used) || 0;
    const remaining = Number.isFinite(data.remaining) ? data.remaining : SURVEY_DAILY_LIMIT;
    const limit = Number(data.limit) || SURVEY_DAILY_LIMIT;
    writeSurveyStateWebKey({
      ...cached,
      dayKey: data.dayKey || cached.dayKey,
      used,
      remaining,
      limit,
    });
    return { used, remaining, limit };
  } catch {
    return { used: cached.used, remaining: cached.remaining, limit: cached.limit };
  }
}

export async function submitSurveyFeedback({ authorName, content }) {
  const cleanName = String(authorName || '').trim().slice(0, SURVEY_NAME_MAX) || 'プレイヤー';
  const cleanContent = String(content || '').trim().slice(0, SURVEY_CONTENT_MAX);
  if (!cleanContent) {
    throw new Error('追加して欲しい内容を入力してください。');
  }

  let resp;
  try {
    resp = await fetch('/api/surveys', {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify({ authorName: cleanName, content: cleanContent }),
    });
  } catch {
    throw new Error('送信サーバーに接続できません。');
  }

  const data = await resp.json().catch(() => ({}));
  if (data && data.visitorKey) {
    writeStorageKey(VISITOR_WEB_KEY_STORAGE, data.visitorKey);
  }
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'アンケートの送信に失敗しました。');
  }

  const used = Number(data.used) || 0;
  const remaining = Number.isFinite(data.remaining) ? data.remaining : 0;
  const limit = Number(data.limit) || SURVEY_DAILY_LIMIT;
  const prevState = readSurveyStateWebKey();
  const nextItems = [
    {
      id: data.id || '',
      authorName: data.authorName || cleanName,
      content: data.content || cleanContent,
      isAdminVerified: Boolean(data.isAdminVerified),
      createdAt: data.createdAt || new Date().toISOString(),
    },
    ...prevState.items,
  ].slice(0, 20);

  writeSurveyStateWebKey({
    dayKey: data.dayKey || prevState.dayKey,
    used,
    remaining,
    limit,
    items: nextItems,
  });

  return { used, remaining, limit };
}

async function resolveAdminChannel() {
  let channel = readStorageKey(ADMIN_CHANNEL_STORAGE);
  if (!channel) {
    const authed = await fetchAdminStatus();
    if (!authed) {
      const err = new Error('管理者認証が必要です。');
      err.status = 403;
      throw err;
    }
    channel = readStorageKey(ADMIN_CHANNEL_STORAGE);
  }
  if (!channel) {
    const err = new Error('管理者認証が必要です。');
    err.status = 403;
    throw err;
  }
  return channel;
}

export async function subscribeAdminSurveys(onUpdate, onError) {
  const adminChannel = await resolveAdminChannel();
  try {
    const { db } = await ensureFirebase();
    const surveysQuery = query(
      collection(db, 'surveys'),
      where('adminChannel', '==', adminChannel)
    );
    return onSnapshot(
      surveysQuery,
      (snapshot) => {
        const items = [];
        snapshot.forEach((docSnap) => {
          items.push(normalizeSurveyDoc(docSnap.id, docSnap.data()));
        });
        onUpdate(sortSurveysDesc(items));
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'surveys');
        } catch (wrappedErr) {
          if (onError) onError(wrappedErr);
        }
      }
    );
  } catch (err) {
    const fallbackItems = await fetchAdminSurveys();
    onUpdate(fallbackItems);
    return () => {};
  }
}

export async function fetchAdminSurveys() {
  const adminChannel = readStorageKey(ADMIN_CHANNEL_STORAGE);
  if (adminChannel) {
    try {
      const { db } = await ensureFirebase();
      const surveysQuery = query(
        collection(db, 'surveys'),
        where('adminChannel', '==', adminChannel)
      );
      const snap = await getDocs(surveysQuery);
      const items = [];
      snap.forEach((docSnap) => {
        items.push(normalizeSurveyDoc(docSnap.id, docSnap.data()));
      });
      return sortSurveysDesc(items);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'surveys');
    }
  }

  let resp;
  try {
    resp = await fetch('/api/surveys', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: buildAuthHeaders(),
    });
  } catch {
    throw new Error('サーバーに接続できません。');
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) {
    const err = new Error(data.error || '管理者認証が必要です。');
    err.status = resp.status;
    throw err;
  }
  return Array.isArray(data.items) ? data.items : [];
}

// Real-Time Presence APIs (Online + Today Logins reset at 00:00 JST)
export async function sendPresenceHeartbeat(username) {
  try {
    const resp = await fetch('/api/presence/heartbeat', {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify({ username: sanitizePresenceUsername(username) }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && data.visitorKey) {
      writeStorageKey(VISITOR_WEB_KEY_STORAGE, data.visitorKey);
    }
    return data;
  } catch {
    return null;
  }
}

export function sendPresenceLeave() {
  const visitorKey = readStorageKey(VISITOR_WEB_KEY_STORAGE);
  if (!visitorKey) return Promise.resolve();
  try {
    return fetch('/api/presence/leave', {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify({ visitorKey }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

export async function fetchPresenceSnapshot() {
  const resp = await fetch('/api/presence', {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: buildAuthHeaders(),
  });
  if (!resp.ok) {
    throw new Error('ログイン状況の取得に失敗しました。');
  }
  return await resp.json();
}

export async function subscribePresence(onRecords, onError) {
  try {
    const { db } = await ensureFirebase();
    const presenceQuery = query(
      collection(db, 'presence'),
      where('presenceScope', '==', PRESENCE_SCOPE)
    );
    return onSnapshot(
      presenceQuery,
      (snapshot) => {
        const records = [];
        snapshot.forEach((docSnap) => {
          records.push(normalizePresenceDoc(docSnap.id, docSnap.data()));
        });
        onRecords(records);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'presence');
        } catch (wrappedErr) {
          if (onError) onError(wrappedErr);
        }
      }
    );
  } catch (err) {
    if (onError) onError(err);
    return () => {};
  }
}
