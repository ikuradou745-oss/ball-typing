import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  doc,
  getDocFromServer,
  getFirestore,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export const SURVEY_DAILY_LIMIT = 3;
export const SURVEY_NAME_MAX = 20;
export const SURVEY_CONTENT_MAX = 300;

const ADMIN_WEB_KEY_STORAGE = 'ball_typing_admin_key_v1';
const VISITOR_WEB_KEY_STORAGE = 'ball_typing_visitor_key_v1';

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
      return true;
    }
    writeStorageKey(ADMIN_WEB_KEY_STORAGE, '');
    return false;
  } catch {
    return false;
  }
}

export async function verifyAdminCodeOnServer(code) {
  let resp;
  try {
    resp = await fetch('/api/admin/verify-code', {
      method: 'POST',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify({ code: String(code || '') }),
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
  return true;
}

export async function logoutAdminSession() {
  await fetch('/api/admin/logout', {
    method: 'POST',
    headers: buildAuthHeaders(),
    credentials: 'same-origin',
  }).catch(() => {});
  writeStorageKey(ADMIN_WEB_KEY_STORAGE, '');
  return false;
}

export async function getTodaySurveyQuota() {
  try {
    const resp = await fetch('/api/surveys/quota', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: buildAuthHeaders(),
    });
    if (!resp.ok) {
      return { used: 0, remaining: SURVEY_DAILY_LIMIT, limit: SURVEY_DAILY_LIMIT };
    }
    const data = await resp.json();
    if (data && data.visitorKey) {
      writeStorageKey(VISITOR_WEB_KEY_STORAGE, data.visitorKey);
    }
    return {
      used: Number(data.used) || 0,
      remaining: Number.isFinite(data.remaining) ? data.remaining : SURVEY_DAILY_LIMIT,
      limit: Number(data.limit) || SURVEY_DAILY_LIMIT,
    };
  } catch {
    return { used: 0, remaining: SURVEY_DAILY_LIMIT, limit: SURVEY_DAILY_LIMIT };
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
  return {
    used: Number(data.used) || 0,
    remaining: Number.isFinite(data.remaining) ? data.remaining : 0,
    limit: Number(data.limit) || SURVEY_DAILY_LIMIT,
  };
}

export async function fetchAdminSurveys() {
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
