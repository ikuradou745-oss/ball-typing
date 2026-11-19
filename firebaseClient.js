import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export const SURVEY_DAILY_LIMIT = 3;
export const SURVEY_NAME_MAX = 20;
export const SURVEY_CONTENT_MAX = 300;

export const OperationType = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
});

let appInstance = null;
let authInstance = null;
let dbInstance = null;
let initPromise = null;
let connectionTested = false;

function handleFirestoreError(error, operationType, path) {
  const user = authInstance ? authInstance.currentUser : null;
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: user ? user.uid : null,
      email: user ? user.email : null,
      emailVerified: user ? user.emailVerified : null,
      isAnonymous: user ? user.isAnonymous : null,
      tenantId: user ? user.tenantId : null,
      providerInfo: user && Array.isArray(user.providerData)
        ? user.providerData.map((p) => ({
            providerId: p.providerId,
            email: p.email,
          }))
        : [],
    },
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  const wrapped = new Error(JSON.stringify(errInfo));
  wrapped.originalCode = error && error.code ? error.code : '';
  throw wrapped;
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
  if (dbInstance && authInstance) {
    return { app: appInstance, auth: authInstance, db: dbInstance };
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
      authInstance = getAuth(appInstance);
      await testConnection(dbInstance);
      return { app: appInstance, auth: authInstance, db: dbInstance };
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export function getCurrentFirebaseUser() {
  return authInstance ? authInstance.currentUser : null;
}

export async function subscribeAuth(callback) {
  const { auth } = await ensureFirebase();
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  const { auth } = await ensureFirebase();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser() {
  const { auth } = await ensureFirebase();
  await signOut(auth);
}

function getCurrentJstDateParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date());

  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      map[p.type] = Number(p.value);
    }
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
  };
}

export async function getTodaySurveyQuota(uid) {
  if (!uid) {
    return { used: 0, remaining: SURVEY_DAILY_LIMIT, limit: SURVEY_DAILY_LIMIT };
  }
  const { db } = await ensureFirebase();
  const path = `surveyQuotas/${uid}`;
  let snap;
  try {
    snap = await getDocFromServer(doc(db, 'surveyQuotas', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const today = getCurrentJstDateParts();
  if (!snap || !snap.exists()) {
    return { used: 0, remaining: SURVEY_DAILY_LIMIT, limit: SURVEY_DAILY_LIMIT };
  }

  const data = snap.data();
  const isToday =
    data.year === today.year && data.month === today.month && data.day === today.day;
  const used = isToday && typeof data.count === 'number' ? Math.max(0, data.count) : 0;
  return {
    used,
    remaining: Math.max(0, SURVEY_DAILY_LIMIT - used),
    limit: SURVEY_DAILY_LIMIT,
  };
}

export async function submitSurveyFeedback({ authorName, content }) {
  const { auth, db } = await ensureFirebase();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('アンケートを送信するにはGoogleログインが必要です。');
  }

  const cleanName = String(authorName || '').trim().slice(0, SURVEY_NAME_MAX);
  const cleanContent = String(content || '').trim().slice(0, SURVEY_CONTENT_MAX);
  if (cleanName.length < 1) {
    throw new Error('名前を入力してください。');
  }
  if (cleanContent.length < 1) {
    throw new Error('追加して欲しい内容を入力してください。');
  }

  const quota = await getTodaySurveyQuota(user.uid);
  if (quota.remaining <= 0) {
    throw new Error('本日の送信上限（1日3回まで）に達しました。また明日お送りください。');
  }

  const today = getCurrentJstDateParts();
  const nextCount = quota.used + 1;
  const surveyRef = doc(collection(db, 'surveys'));
  const quotaRef = doc(db, 'surveyQuotas', user.uid);

  const batch = writeBatch(db);
  batch.set(quotaRef, {
    uid: user.uid,
    year: today.year,
    month: today.month,
    day: today.day,
    count: nextCount,
    lastSurveyId: surveyRef.id,
    updatedAt: serverTimestamp(),
  });
  batch.set(surveyRef, {
    uid: user.uid,
    authorName: cleanName,
    content: cleanContent,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `surveys/${surveyRef.id}`);
  }

  return {
    used: nextCount,
    remaining: Math.max(0, SURVEY_DAILY_LIMIT - nextCount),
    limit: SURVEY_DAILY_LIMIT,
  };
}

export async function verifyAdminCodeOnServer(code) {
  const user = getCurrentFirebaseUser();
  if (!user) {
    throw new Error('先にGoogleアカウントでログインしてください。');
  }
  let resp;
  try {
    resp = await fetch('/api/admin/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: String(code || ''), uid: user.uid }),
    });
  } catch {
    throw new Error('管理者認証サーバーに接続できません。');
  }

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok || !data.token) {
    throw new Error(data.error || '管理者コードが正しくありません。');
  }
  return data.token;
}

export async function fetchAdminSurveys(adminToken) {
  const { auth, db } = await ensureFirebase();
  const user = auth.currentUser;
  if (!user || !adminToken) {
    throw new Error('管理者認証が必要です。');
  }

  const verifyResp = await fetch('/api/admin/verify-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: adminToken, uid: user.uid }),
  }).catch(() => null);

  if (!verifyResp || !verifyResp.ok) {
    const authErr = new Error('管理者セッションの有効期限が切れました。再度コードを入力してください。');
    authErr.sessionExpired = true;
    throw authErr;
  }

  const path = 'surveys';
  try {
    const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(100));
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        authorName: d.authorName || '名無し',
        content: d.content || '',
        createdAt: d.createdAt && typeof d.createdAt.toDate === 'function' ? d.createdAt.toDate() : null,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
