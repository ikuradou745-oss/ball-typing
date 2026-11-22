import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
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
  PRESENCE_ONLINE_WINDOW_MS,
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
const PRESENCE_ID_STORAGE = 'ball_typing_presence_id_v1';
const SURVEY_STATE_STORAGE = 'ball_typing_survey_state_v1';
const OPEN_TABS_STORAGE = 'ball_typing_open_tabs_v1';
const TAB_ID_SESSION_KEY = 'ball_typing_tab_id_v1';

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
let serverClockOffsetMs = 0;
let memoryPresenceId = '';
let heartbeatInFlight = null;
let queuedHeartbeatUsername = null;
let knownPresenceExistsInFirestore = false;
let knownPresenceDayKey = '';
let knownPresenceIsAdminVerified = false;
let knownPresenceLastLoginTs = null;

function generateRandomHexId24() {
  try {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let out = '';
    for (let i = 0; i < 24; i++) {
      out += Math.floor(Math.random() * 16).toString(16);
    }
    return out;
  }
}

export function getOrCreateClientPresenceId() {
  const existing = readStorageKey(PRESENCE_ID_STORAGE);
  if (/^[a-f0-9]{24}$/.test(existing)) {
    memoryPresenceId = existing;
    return existing;
  }
  if (/^[a-f0-9]{24}$/.test(memoryPresenceId)) {
    writeStorageKey(PRESENCE_ID_STORAGE, memoryPresenceId);
    return memoryPresenceId;
  }
  const token = readStorageKey(VISITOR_WEB_KEY_STORAGE);
  if (token && token.includes('.')) {
    try {
      const encoded = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      const pad = encoded.length % 4 === 0 ? '' : '='.repeat(4 - (encoded.length % 4));
      const parsed = JSON.parse(atob(encoded + pad));
      if (typeof parsed.vid === 'string' && /^[a-f0-9]{24}$/.test(parsed.vid)) {
        memoryPresenceId = parsed.vid;
        writeStorageKey(PRESENCE_ID_STORAGE, parsed.vid);
        return parsed.vid;
      }
    } catch {
      // Ignore malformed token
    }
  }
  const freshId = generateRandomHexId24();
  memoryPresenceId = freshId;
  writeStorageKey(PRESENCE_ID_STORAGE, freshId);
  return freshId;
}

function updateServerClockOffset(serverNowMs) {
  if (typeof serverNowMs === 'number' && Number.isFinite(serverNowMs) && serverNowMs > 0) {
    serverClockOffsetMs = serverNowMs - Date.now();
  }
}

export function getSyncedNowMs() {
  return Date.now() + serverClockOffsetMs;
}

function getTabId() {
  try {
    let tabId = sessionStorage.getItem(TAB_ID_SESSION_KEY);
    if (!tabId) {
      tabId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(TAB_ID_SESSION_KEY, tabId);
    }
    return tabId;
  } catch {
    return 'default_tab';
  }
}

export function registerActiveTab() {
  try {
    const now = Date.now();
    const tabId = getTabId();
    const raw = localStorage.getItem(OPEN_TABS_STORAGE);
    const parsed = raw ? JSON.parse(raw) : {};
    const next = {};
    for (const [id, ts] of Object.entries(parsed && typeof parsed === 'object' ? parsed : {})) {
      if (typeof ts === 'number' && now - ts <= PRESENCE_ONLINE_WINDOW_MS) {
        next[id] = ts;
      }
    }
    next[tabId] = now;
    localStorage.setItem(OPEN_TABS_STORAGE, JSON.stringify(next));
  } catch {
    // Ignore storage errors
  }
}

export function unregisterActiveTab() {
  try {
    const now = Date.now();
    const tabId = getTabId();
    const raw = localStorage.getItem(OPEN_TABS_STORAGE);
    const parsed = raw ? JSON.parse(raw) : {};
    const next = {};
    for (const [id, ts] of Object.entries(parsed && typeof parsed === 'object' ? parsed : {})) {
      if (id !== tabId && typeof ts === 'number' && now - ts <= PRESENCE_ONLINE_WINDOW_MS) {
        next[id] = ts;
      }
    }
    localStorage.setItem(OPEN_TABS_STORAGE, JSON.stringify(next));
    return Object.keys(next).length === 0;
  } catch {
    return true;
  }
}

const memoryStorageFallback = new Map();

function readStorageKey(storageKey) {
  try {
    const val = localStorage.getItem(storageKey);
    if (val) {
      memoryStorageFallback.set(storageKey, val);
      return val;
    }
  } catch {
    // Fallback to in-memory storage when localStorage is restricted
  }
  return memoryStorageFallback.get(storageKey) || '';
}

function writeStorageKey(storageKey, value) {
  if (value) {
    memoryStorageFallback.set(storageKey, value);
  } else {
    memoryStorageFallback.delete(storageKey);
  }
  try {
    if (value) {
      localStorage.setItem(storageKey, value);
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch {
    // Ignore storage quota / iframe sandbox errors
  }
}

export function getSelfVisitorId() {
  return getOrCreateClientPresenceId();
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
      try {
        dbInstance = firebaseConfig.firestoreDatabaseId
          ? initializeFirestore(
              appInstance,
              { experimentalAutoDetectLongPolling: true },
              firebaseConfig.firestoreDatabaseId
            )
          : initializeFirestore(appInstance, { experimentalAutoDetectLongPolling: true });
      } catch {
        dbInstance = firebaseConfig.firestoreDatabaseId
          ? getFirestore(appInstance, firebaseConfig.firestoreDatabaseId)
          : getFirestore(appInstance);
      }
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
function cacheSelfPresenceFromData(presenceId, rawData) {
  if (!rawData || !presenceId) return;
  knownPresenceExistsInFirestore = true;
  if (typeof rawData.dayKey === 'string') knownPresenceDayKey = rawData.dayKey;
  if (typeof rawData.isAdminVerified === 'boolean') {
    knownPresenceIsAdminVerified = rawData.isAdminVerified;
  }
  if (rawData.lastLoginAt) {
    knownPresenceLastLoginTs = rawData.lastLoginAt;
  }
}

async function directWritePresenceFallback(presenceId, username, isOnline) {
  try {
    const { db } = await ensureFirebase();
    const cleanName = sanitizePresenceUsername(username);
    const dayKey = getJstDateParts(getSyncedNowMs()).dayKey;
    const presenceRef = doc(db, 'presence', presenceId);

    if (!knownPresenceExistsInFirestore) {
      const snap = await getDocs(
        query(collection(db, 'presence'), where('presenceScope', '==', PRESENCE_SCOPE))
      );
      snap.forEach((docSnap) => {
        if (docSnap.id === presenceId) {
          cacheSelfPresenceFromData(presenceId, docSnap.data());
        }
      });
    }

    if (!knownPresenceExistsInFirestore) {
      await setDoc(presenceRef, {
        visitorId: presenceId,
        username: cleanName,
        isAdminVerified: false,
        dayKey,
        isOnline: Boolean(isOnline),
        presenceScope: PRESENCE_SCOPE,
        lastLoginAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      });
      knownPresenceExistsInFirestore = true;
      knownPresenceDayKey = dayKey;
      knownPresenceIsAdminVerified = false;
    } else {
      const isNewDay = knownPresenceDayKey !== dayKey;
      const updatePayload = {
        username: cleanName,
        isAdminVerified: Boolean(knownPresenceIsAdminVerified),
        dayKey,
        isOnline: Boolean(isOnline),
        lastSeenAt: serverTimestamp(),
        lastLoginAt:
          isNewDay || !knownPresenceLastLoginTs
            ? serverTimestamp()
            : knownPresenceLastLoginTs,
      };
      await updateDoc(presenceRef, updatePayload);
      knownPresenceDayKey = dayKey;
    }

    const nowIso = new Date(getSyncedNowMs()).toISOString();
    return {
      ok: true,
      serverNowMs: getSyncedNowMs(),
      visitorId: presenceId,
      dayKey,
      firestoreSynced: true,
      record: {
        visitorId: presenceId,
        username: cleanName,
        isAdminVerified: Boolean(knownPresenceIsAdminVerified),
        dayKey,
        isOnline: Boolean(isOnline),
        lastLoginAt: nowIso,
        lastSeenAt: nowIso,
      },
    };
  } catch (err) {
    console.warn('Direct Firestore presence fallback skipped:', err?.message || err);
    return null;
  }
}

async function performPresenceHeartbeat(username) {
  registerActiveTab();
  const presenceId = getOrCreateClientPresenceId();
  const cleanName = sanitizePresenceUsername(username);

  try {
    const resp = await fetch('/api/presence/heartbeat', {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify({ username: cleanName, presenceId }),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.serverNowMs) {
        updateServerClockOffset(data.serverNowMs);
      }
      if (data && data.visitorKey) {
        writeStorageKey(VISITOR_WEB_KEY_STORAGE, data.visitorKey);
      }
      if (data && data.record) {
        knownPresenceExistsInFirestore = Boolean(data.firestoreSynced);
        knownPresenceDayKey = data.record.dayKey || knownPresenceDayKey;
        knownPresenceIsAdminVerified = Boolean(data.record.isAdminVerified);
      }
      if (data && data.firestoreSynced) {
        return data;
      }
      // Server couldn't write directly to Firestore; fall back to direct browser Firestore write
      const directData = await directWritePresenceFallback(presenceId, cleanName, true);
      return directData || data;
    }
  } catch {
    // Network or server unavailable -> try direct browser Firestore write
  }
  return directWritePresenceFallback(presenceId, cleanName, true);
}

export async function sendPresenceHeartbeat(username) {
  registerActiveTab();
  if (heartbeatInFlight) {
    queuedHeartbeatUsername = username;
    return heartbeatInFlight;
  }
  heartbeatInFlight = (async () => {
    try {
      let result = await performPresenceHeartbeat(username);
      while (queuedHeartbeatUsername !== null) {
        const nextName = queuedHeartbeatUsername;
        queuedHeartbeatUsername = null;
        result = await performPresenceHeartbeat(nextName);
      }
      return result;
    } finally {
      heartbeatInFlight = null;
    }
  })();
  return heartbeatInFlight;
}

export function sendPresenceLeave() {
  const visitorKey = readStorageKey(VISITOR_WEB_KEY_STORAGE);
  const presenceId = getOrCreateClientPresenceId();
  if (!visitorKey && !presenceId) return Promise.resolve();
  const payload = JSON.stringify({ visitorKey, presenceId });
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' });
      navigator.sendBeacon('/api/presence/leave', blob);
    }
  } catch {
    // Ignore sendBeacon error
  }
  try {
    return fetch('/api/presence/leave', {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: payload,
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
    headers: buildAuthHeaders({
      'X-Presence-Id': getOrCreateClientPresenceId(),
    }),
  });
  if (!resp.ok) {
    throw new Error('ログイン状況の取得に失敗しました。');
  }
  const data = await resp.json();
  if (data && data.serverNowMs) {
    updateServerClockOffset(data.serverNowMs);
  }
  return data;
}

export async function subscribePresence(onRecords, onError) {
  try {
    const { db } = await ensureFirebase();
    const presenceId = getOrCreateClientPresenceId();
    const presenceQuery = query(
      collection(db, 'presence'),
      where('presenceScope', '==', PRESENCE_SCOPE)
    );
    return onSnapshot(
      presenceQuery,
      (snapshot) => {
        const records = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (docSnap.id === presenceId) {
            cacheSelfPresenceFromData(presenceId, data);
          }
          records.push(normalizePresenceDoc(docSnap.id, data));
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
