import './lib/consoleGuard.js';
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
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {
  SURVEY_CONTENT_MAX,
  SURVEY_DAILY_LIMIT,
  SURVEY_NAME_MAX,
  computeRemainingQuota,
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
import {
  createStaticAdminWebKey,
  isStaticAdminWebKey,
  verifyStaticAdminCode,
} from './lib/adminCodeStatic.js';

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

const FIRESTORE_SERVER_AUTH = 'bt_srv_auth_8f4c29a7d1e63b0594127a6c8e3d9f1b';
const FIRESTORE_ADMIN_CHANNEL = 'bt_adm_ch_3e91b5c47a08d2f61495b3c7e0a2d84f';
const MAX_STATIC_CODE_ATTEMPTS = 10;
const STATIC_CODE_LOCKOUT_MS = 15 * 60 * 1000;

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
let knownAdminAuthenticated = false;
let detectedBackendMode = 'unknown'; // 'unknown' | 'server' | 'static'
let staticAttemptState = { count: 0, lockUntil: 0 };

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
  if (adminKey && !adminKey.startsWith('static_admin_v1:')) {
    headers['X-Admin-Key'] = adminKey;
  }
  if (visitorKey) headers['X-Visitor-Key'] = visitorKey;
  return headers;
}

function isStaticAdminClientActive() {
  const adminKey = readStorageKey(ADMIN_WEB_KEY_STORAGE);
  return isStaticAdminWebKey(adminKey, getOrCreateClientPresenceId());
}

async function fetchBackendJson(url, options = {}) {
  try {
    const resp = await fetch(url, options);
    const contentType = (resp.headers?.get('content-type') || '').toLowerCase();
    if (
      resp.status === 404 ||
      resp.status === 405 ||
      resp.status === 501 ||
      !contentType.includes('application/json')
    ) {
      detectedBackendMode = 'static';
      return { backendAvailable: false, ok: false, status: resp.status, data: null };
    }
    const data = await resp.json().catch(() => null);
    if (!data || typeof data !== 'object') {
      detectedBackendMode = 'static';
      return { backendAvailable: false, ok: false, status: resp.status, data: null };
    }
    detectedBackendMode = 'server';
    return { backendAvailable: true, ok: resp.ok, status: resp.status, data };
  } catch {
    if (detectedBackendMode === 'unknown') {
      detectedBackendMode = 'static';
    }
    return { backendAvailable: false, ok: false, status: 0, data: null };
  }
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
      testConnection(dbInstance).catch(() => {});
      return { app: appInstance, db: dbInstance };
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

async function syncStaticAdminToFirestore(presenceId, username, verified) {
  try {
    const { db } = await ensureFirebase();
    const cleanName = sanitizePresenceUsername(username);
    const adminsSnap = await getDocs(
      query(collection(db, 'admins'), where('serverAuth', '==', FIRESTORE_SERVER_AUTH))
    );
    let existsInFirestore = false;
    adminsSnap.forEach((docSnap) => {
      if (docSnap.id === presenceId) {
        existsInFirestore = true;
      }
    });
    const adminRef = doc(db, 'admins', presenceId);
    if (existsInFirestore) {
      await updateDoc(adminRef, {
        username: cleanName,
        verified: Boolean(verified),
        updatedAt: serverTimestamp(),
      });
    } else if (verified) {
      await setDoc(adminRef, {
        visitorId: presenceId,
        username: cleanName,
        verified: true,
        serverAuth: FIRESTORE_SERVER_AUTH,
        verifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    // Ignore transient Firestore error on static host
  }
}

function getStaticAdminStatusFallback() {
  if (isStaticAdminClientActive()) {
    knownAdminAuthenticated = true;
    writeStorageKey(ADMIN_CHANNEL_STORAGE, FIRESTORE_ADMIN_CHANNEL);
    return true;
  }
  knownAdminAuthenticated = false;
  return false;
}

export async function fetchAdminStatus() {
  const result = await fetchBackendJson('/api/admin/status', {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: buildAuthHeaders(),
  });

  if (!result.backendAvailable) {
    return getStaticAdminStatusFallback();
  }

  if (!result.ok) {
    return getStaticAdminStatusFallback();
  }

  const data = result.data;
  if (data && data.visitorKey) {
    writeStorageKey(VISITOR_WEB_KEY_STORAGE, data.visitorKey);
  }
  if (data && data.isAdmin) {
    knownAdminAuthenticated = true;
    if (data.adminKey) {
      writeStorageKey(ADMIN_WEB_KEY_STORAGE, data.adminKey);
    }
    if (data.adminChannel) {
      writeStorageKey(ADMIN_CHANNEL_STORAGE, data.adminChannel);
    }
    return true;
  }
  knownAdminAuthenticated = false;
  clearAdminStorageKeys();
  return false;
}

export async function verifyAdminCodeOnServer(code, username = '') {
  const rawCode = String(code || '');
  const cleanName = String(username || '').slice(0, SURVEY_NAME_MAX);

  const result = await fetchBackendJson('/api/admin/verify-code', {
    method: 'POST',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'same-origin',
    body: JSON.stringify({
      code: rawCode,
      username: cleanName,
    }),
  });

  if (result.backendAvailable) {
    const data = result.data || {};
    if (!result.ok || !data.ok) {
      throw new Error(data.error || 'コードが正しくありません。');
    }
    knownAdminAuthenticated = true;
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

  // Static host (e.g. GitHub Pages without Node backend) fallback verification
  const now = Date.now();
  if (staticAttemptState.lockUntil > now) {
    throw new Error('試行回数が上限に達しました。しばらく待ってから再度お試しください。');
  }

  if (!verifyStaticAdminCode(rawCode)) {
    const nextCount = staticAttemptState.lockUntil <= now ? staticAttemptState.count + 1 : 1;
    staticAttemptState = {
      count: nextCount,
      lockUntil: nextCount >= MAX_STATIC_CODE_ATTEMPTS ? now + STATIC_CODE_LOCKOUT_MS : 0,
    };
    throw new Error('コードが正しくありません。');
  }

  staticAttemptState = { count: 0, lockUntil: 0 };
  const presenceId = getOrCreateClientPresenceId();
  knownAdminAuthenticated = true;
  writeStorageKey(ADMIN_WEB_KEY_STORAGE, createStaticAdminWebKey(presenceId));
  writeStorageKey(ADMIN_CHANNEL_STORAGE, FIRESTORE_ADMIN_CHANNEL);
  syncStaticAdminToFirestore(presenceId, cleanName, true).catch(() => {});
  return true;
}

export async function logoutAdminSession() {
  if (detectedBackendMode !== 'static') {
    await fetch('/api/admin/logout', {
      method: 'POST',
      headers: buildAuthHeaders(),
      credentials: 'same-origin',
    }).catch(() => {});
  }
  knownAdminAuthenticated = false;
  clearAdminStorageKeys();
  if (detectedBackendMode === 'static') {
    syncStaticAdminToFirestore(getOrCreateClientPresenceId(), 'プレイヤー', false).catch(() => {});
  }
  return false;
}

async function readFirestoreDailySurveyUsedCount(visitorId, jst) {
  let timerId = null;
  try {
    const queryTask = (async () => {
      const { db } = await ensureFirebase();
      const q = query(
        collection(db, 'surveyQuotas'),
        where('serverAuth', '==', FIRESTORE_SERVER_AUTH)
      );
      const snap = await getDocs(q);
      let fsSameDay = false;
      let fsUsed = 0;
      snap.forEach((docSnap) => {
        if (docSnap.id !== visitorId) return;
        const data = docSnap.data() || {};
        if (
          Number(data.year) === jst.year &&
          Number(data.month) === jst.month &&
          Number(data.day) === jst.day
        ) {
          fsSameDay = true;
          fsUsed = Number(data.count) || 0;
        }
      });
      return { fsSameDay, fsUsed };
    })();
    const timeoutTask = new Promise((resolve) => {
      timerId = setTimeout(() => resolve({ fsSameDay: false, fsUsed: 0 }), 2500);
    });
    return await Promise.race([queryTask, timeoutTask]);
  } catch {
    return { fsSameDay: false, fsUsed: 0 };
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}

export async function getTodaySurveyQuota() {
  const cached = readSurveyStateWebKey();
  if (detectedBackendMode !== 'static') {
    const result = await fetchBackendJson('/api/surveys/quota', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: buildAuthHeaders(),
    });
    if (result.backendAvailable && result.ok && result.data) {
      const data = result.data;
      if (data.visitorKey) {
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
    }
  }

  const jst = getJstDateParts(getSyncedNowMs());
  const visitorId = getOrCreateClientPresenceId();
  const { fsUsed } = await readFirestoreDailySurveyUsedCount(visitorId, jst);
  const used = Math.max(cached.used, fsUsed);
  const quota = computeRemainingQuota(used, SURVEY_DAILY_LIMIT);
  writeSurveyStateWebKey({
    ...cached,
    dayKey: jst.dayKey,
    used: quota.used,
    remaining: quota.remaining,
    limit: quota.limit,
  });
  return quota;
}

export async function submitSurveyFeedback({ authorName, content }) {
  const cleanName = String(authorName || '').trim().slice(0, SURVEY_NAME_MAX) || 'プレイヤー';
  const cleanContent = String(content || '').trim().slice(0, SURVEY_CONTENT_MAX);
  if (!cleanContent) {
    throw new Error('追加して欲しい内容を入力してください。');
  }

  if (detectedBackendMode !== 'static') {
    const result = await fetchBackendJson('/api/surveys', {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify({ authorName: cleanName, content: cleanContent }),
    });

    if (result.backendAvailable) {
      const data = result.data || {};
      if (data.visitorKey) {
        writeStorageKey(VISITOR_WEB_KEY_STORAGE, data.visitorKey);
      }
      if (!result.ok || !data.ok) {
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
  }

  // Static host (GitHub Pages) direct Firestore submission obeying firestore.rules
  const jst = getJstDateParts(getSyncedNowMs());
  const visitorId = getOrCreateClientPresenceId();
  const prevState = readSurveyStateWebKey();
  const { fsSameDay, fsUsed } = await readFirestoreDailySurveyUsedCount(visitorId, jst);
  const used = Math.max(prevState.used, fsUsed);
  if (used >= SURVEY_DAILY_LIMIT) {
    throw new Error('本日の送信上限（1日3回まで）に達しました。また明日お送りください。');
  }

  const surveyId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : generateRandomHexId24();
  const isAdminVerified = Boolean(knownAdminAuthenticated || isStaticAdminClientActive());
  const nextFsCount = fsSameDay ? fsUsed + 1 : 1;
  const nextUsed = used + 1;
  const createdAtIso = new Date().toISOString();

  try {
    const { db } = await ensureFirebase();
    const batch = writeBatch(db);
    batch.set(doc(db, 'surveyQuotas', visitorId), {
      visitorId,
      year: jst.year,
      month: jst.month,
      day: jst.day,
      count: nextFsCount,
      lastSurveyId: surveyId,
      serverAuth: FIRESTORE_SERVER_AUTH,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'surveys', surveyId), {
      visitorId,
      authorName: cleanName,
      content: cleanContent,
      isAdminVerified,
      adminChannel: FIRESTORE_ADMIN_CHANNEL,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch {
    throw new Error('Firebaseへの保存に失敗しました。少し時間をおいて再度お試しください。');
  }

  const quota = computeRemainingQuota(nextUsed, SURVEY_DAILY_LIMIT);
  const nextItems = [
    {
      id: surveyId,
      authorName: cleanName,
      content: cleanContent,
      isAdminVerified,
      createdAt: createdAtIso,
    },
    ...prevState.items,
  ].slice(0, 20);
  writeSurveyStateWebKey({
    dayKey: jst.dayKey,
    ...quota,
    items: nextItems,
  });

  return quota;
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
  let adminChannel = readStorageKey(ADMIN_CHANNEL_STORAGE);
  if (!adminChannel && isStaticAdminClientActive()) {
    adminChannel = FIRESTORE_ADMIN_CHANNEL;
    writeStorageKey(ADMIN_CHANNEL_STORAGE, adminChannel);
  }
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

  const result = await fetchBackendJson('/api/surveys', {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: buildAuthHeaders(),
  });
  if (!result.backendAvailable) {
    const err = new Error('管理者認証が必要です。');
    err.status = 403;
    throw err;
  }
  const data = result.data || {};
  if (!result.ok || !data.ok) {
    const err = new Error(data.error || '管理者認証が必要です。');
    err.status = result.status;
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

    const desiredAdminVerified = Boolean(knownAdminAuthenticated || isStaticAdminClientActive());
    const needsGateBatch = desiredAdminVerified || desiredAdminVerified !== knownPresenceIsAdminVerified;

    if (needsGateBatch) {
      const batch = writeBatch(db);
      batch.set(doc(db, 'presenceGates', presenceId), {
        visitorId: presenceId,
        serverAuth: FIRESTORE_SERVER_AUTH,
        updatedAt: serverTimestamp(),
      });
      if (!knownPresenceExistsInFirestore) {
        batch.set(presenceRef, {
          visitorId: presenceId,
          username: cleanName,
          isAdminVerified: desiredAdminVerified,
          dayKey,
          isOnline: Boolean(isOnline),
          presenceScope: PRESENCE_SCOPE,
          lastLoginAt: serverTimestamp(),
          lastSeenAt: serverTimestamp(),
        });
      } else {
        const isNewDay = knownPresenceDayKey !== dayKey;
        batch.update(presenceRef, {
          username: cleanName,
          isAdminVerified: desiredAdminVerified,
          dayKey,
          isOnline: Boolean(isOnline),
          lastSeenAt: serverTimestamp(),
          lastLoginAt:
            isNewDay || !knownPresenceLastLoginTs
              ? serverTimestamp()
              : knownPresenceLastLoginTs,
        });
      }
      await batch.commit();
      knownPresenceExistsInFirestore = true;
      knownPresenceDayKey = dayKey;
      knownPresenceIsAdminVerified = desiredAdminVerified;
    } else if (!knownPresenceExistsInFirestore) {
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
      await updateDoc(presenceRef, {
        username: cleanName,
        isAdminVerified: Boolean(knownPresenceIsAdminVerified),
        dayKey,
        isOnline: Boolean(isOnline),
        lastSeenAt: serverTimestamp(),
        lastLoginAt:
          isNewDay || !knownPresenceLastLoginTs
            ? serverTimestamp()
            : knownPresenceLastLoginTs,
      });
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

  if (detectedBackendMode !== 'static') {
    const result = await fetchBackendJson('/api/presence/heartbeat', {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify({ username: cleanName, presenceId }),
    });
    if (result.backendAvailable && result.ok && result.data) {
      const data = result.data;
      if (data.serverNowMs) {
        updateServerClockOffset(data.serverNowMs);
      }
      if (data.visitorKey) {
        writeStorageKey(VISITOR_WEB_KEY_STORAGE, data.visitorKey);
      }
      if (data.record) {
        knownPresenceExistsInFirestore = Boolean(data.firestoreSynced);
        knownPresenceDayKey = data.record.dayKey || knownPresenceDayKey;
        knownPresenceIsAdminVerified = Boolean(data.record.isAdminVerified);
      }
      if (data.firestoreSynced) {
        return data;
      }
      const directData = await directWritePresenceFallback(presenceId, cleanName, true);
      return directData || data;
    }
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

  if (detectedBackendMode !== 'static') {
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

  if (knownPresenceExistsInFirestore && presenceId && dbInstance) {
    const jstDay = knownPresenceDayKey || getJstDateParts(getSyncedNowMs()).dayKey;
    return updateDoc(doc(dbInstance, 'presence', presenceId), {
      dayKey: jstDay,
      isOnline: false,
      lastSeenAt: serverTimestamp(),
      lastLoginAt: knownPresenceLastLoginTs || serverTimestamp(),
      username: sanitizePresenceUsername(knownPresenceUsernameFallback()),
      isAdminVerified: Boolean(knownPresenceIsAdminVerified),
    }).catch(() => {});
  }
  return Promise.resolve();
}

function knownPresenceUsernameFallback() {
  try {
    const raw = localStorage.getItem('ball_typing_profile_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.username === 'string') return parsed.username;
    }
  } catch {
    // Ignore
  }
  return 'プレイヤー';
}

export async function fetchPresenceSnapshot() {
  const selfId = getOrCreateClientPresenceId();
  if (detectedBackendMode !== 'static') {
    const result = await fetchBackendJson('/api/presence', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: buildAuthHeaders({
        'X-Presence-Id': selfId,
      }),
    });
    if (result.backendAvailable && result.ok && result.data) {
      const data = result.data;
      if (data.serverNowMs) {
        updateServerClockOffset(data.serverNowMs);
      }
      return data;
    }
  }

  const { db } = await ensureFirebase();
  const snap = await getDocs(
    query(collection(db, 'presence'), where('presenceScope', '==', PRESENCE_SCOPE))
  );
  const records = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (docSnap.id === selfId) {
      cacheSelfPresenceFromData(selfId, data);
    }
    records.push(normalizePresenceDoc(docSnap.id, data));
  });
  const nowMs = getSyncedNowMs();
  const split = splitPresenceRecords(records, nowMs, selfId);
  return { ok: true, serverNowMs: nowMs, records, ...split };
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
