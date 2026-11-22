import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  initializeFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  SURVEY_DAILY_LIMIT,
  SURVEY_NAME_MAX,
  computeRemainingQuota,
  getJstDateParts,
  normalizeSurveyDoc,
  sanitizeSurveyInput,
  sortSurveysDesc,
} from './lib/surveyHelpers.js';
import {
  PRESENCE_SCOPE,
  normalizePresenceDoc,
  sanitizePresenceUsername,
  splitPresenceRecords,
} from './lib/presenceHelpers.js';
import { verifyAdminCodeDigest } from './lib/adminAuthHelpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);

const PORT = 3000;
const DATA_DIR = path.join(__dirname, '.data');
const SURVEYS_FILE = path.join(DATA_DIR, 'surveys.json');
const QUOTAS_FILE = path.join(DATA_DIR, 'quotas.json');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const PRESENCE_FILE = path.join(DATA_DIR, 'presence.json');

const ADMIN_SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const VISITOR_COOKIE_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 10;
const CODE_LOCKOUT_MS = 15 * 60 * 1000;
const FIRESTORE_CACHE_TTL_MS = 15000;
const PRESENCE_CACHE_TTL_MS = 2000;

// Server-gated Firestore capability keys matching firestore.rules
const FIRESTORE_SERVER_AUTH =
  process.env.FIRESTORE_SERVER_AUTH || 'bt_srv_auth_8f4c29a7d1e63b0594127a6c8e3d9f1b';
const FIRESTORE_ADMIN_CHANNEL =
  process.env.FIRESTORE_ADMIN_CHANNEL || 'bt_adm_ch_3e91b5c47a08d2f61495b3c7e0a2d84f';

function initFirestoreClient() {
  try {
    const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
    if (!fs.existsSync(cfgPath)) return null;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const fbApp = initializeApp(cfg, 'server-sync');
    try {
      return cfg.firestoreDatabaseId
        ? initializeFirestore(
            fbApp,
            { experimentalAutoDetectLongPolling: true },
            cfg.firestoreDatabaseId
          )
        : initializeFirestore(fbApp, { experimentalAutoDetectLongPolling: true });
    } catch {
      return cfg.firestoreDatabaseId
        ? getFirestore(fbApp, cfg.firestoreDatabaseId)
        : getFirestore(fbApp);
    }
  } catch (err) {
    console.error('Failed to initialize server Firestore client:', err);
    return null;
  }
}

const firestoreDb = initFirestoreClient();
let adminsCache = { fetchedAt: 0, map: null };
let quotasCache = { fetchedAt: 0, map: null };
let presenceCache = { fetchedAt: 0, map: null };

function loadOrCreateServerSecret() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const secretFile = path.join(DATA_DIR, 'hmac.key');
    if (fs.existsSync(secretFile)) {
      const hex = fs.readFileSync(secretFile, 'utf8').trim();
      if (/^[0-9a-f]{64}$/i.test(hex)) {
        return Buffer.from(hex, 'hex');
      }
    }
    const generated = crypto.randomBytes(32);
    fs.writeFileSync(secretFile, generated.toString('hex'), { mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(32);
  }
}

const SESSION_SECRET = loadOrCreateServerSecret();
const failedCodeAttempts = new Map();

app.use(express.json({ limit: '8kb' }));
app.use(express.text({ type: 'text/plain', limit: '8kb' }));

// Block HTTP access to server scripts, security files, rules, tests, and local server data
const BLOCKED_STATIC_PATHS = new Set([
  '/server.js',
  '/package.json',
  '/bun.lock',
  '/eslint.config.mjs',
  '/firestore.rules',
  '/firestore.rules.test.ts',
  '/draft_firestore.rules',
  '/security_spec.md',
  '/firebase-blueprint.json',
]);

app.use((req, res, next) => {
  const reqPath = (req.path || '').toLowerCase();
  if (
    BLOCKED_STATIC_PATHS.has(reqPath) ||
    reqPath.startsWith('/.env') ||
    reqPath.startsWith('/.aistudio') ||
    reqPath.startsWith('/.data') ||
    reqPath.startsWith('/tests') ||
    reqPath.startsWith('/node_modules')
  ) {
    res.status(404).end();
    return;
  }
  next();
});

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

function isHttpsRequest(req) {
  const xfProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return req.secure || xfProto.includes('https');
}

function signPayload(payloadObj) {
  const encoded = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySignedPayload(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function setHttpOnlyCookie(req, res, name, value, maxAgeMs) {
  const sameSiteAttrs = isHttpsRequest(req)
    ? 'SameSite=None; Secure; Partitioned'
    : 'SameSite=Lax';
  res.append(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; ${sameSiteAttrs}; Max-Age=${Math.floor(maxAgeMs / 1000)}`
  );
}

function clearCookie(req, res, name) {
  const sameSiteAttrs = isHttpsRequest(req)
    ? 'SameSite=None; Secure; Partitioned'
    : 'SameSite=Lax';
  res.append('Set-Cookie', `${name}=; Path=/; HttpOnly; ${sameSiteAttrs}; Max-Age=0`);
}

function readJsonArray(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readJsonObject(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function getExistingVisitorFromRequest(req) {
  const headerToken = req.get('x-visitor-key');
  const cookies = parseCookies(req);
  for (const candidate of [headerToken, cookies.bt_visitor]) {
    const parsed = verifySignedPayload(candidate);
    if (parsed && typeof parsed.vid === 'string' && /^[a-f0-9]{24}$/.test(parsed.vid)) {
      return { visitorId: parsed.vid, visitorKey: candidate };
    }
  }
  return null;
}

function getOrIssueVisitor(req, res) {
  const existing = getExistingVisitorFromRequest(req);
  if (existing) {
    setHttpOnlyCookie(req, res, 'bt_visitor', existing.visitorKey, VISITOR_COOKIE_TTL_MS);
    return existing;
  }
  const vid = crypto.randomBytes(12).toString('hex');
  const visitorKey = signPayload({ vid, iat: Date.now() });
  setHttpOnlyCookie(req, res, 'bt_visitor', visitorKey, VISITOR_COOKIE_TTL_MS);
  return { visitorId: vid, visitorKey };
}

async function loadAdminsMap(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && adminsCache.map && now - adminsCache.fetchedAt < FIRESTORE_CACHE_TTL_MS) {
    return adminsCache.map;
  }

  const localAdmins = readJsonObject(ADMINS_FILE);
  if (!firestoreDb) {
    return localAdmins;
  }

  try {
    const q = query(
      collection(firestoreDb, 'admins'),
      where('serverAuth', '==', FIRESTORE_SERVER_AUTH)
    );
    const snap = await getDocs(q);
    const map = {};
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      map[docSnap.id] = {
        verified: Boolean(data.verified),
        username: typeof data.username === 'string' ? data.username : 'プレイヤー',
        existsInFirestore: true,
      };
    });
    // Merge locally verified entries not yet visible in Firestore (e.g., transient write failure)
    for (const [vid, localEntry] of Object.entries(localAdmins)) {
      if (!map[vid] && localEntry && localEntry.verified === true) {
        map[vid] = {
          verified: true,
          username: typeof localEntry.username === 'string' ? localEntry.username : 'プレイヤー',
          existsInFirestore: false,
        };
      }
    }

    adminsCache = { fetchedAt: now, map };

    // Keep local cache synchronized with Firestore source of truth
    const syncedLocal = {};
    for (const [vid, entry] of Object.entries(map)) {
      if (entry.verified) {
        syncedLocal[vid] = { verified: true, username: entry.username };
      }
    }
    writeJsonAtomic(ADMINS_FILE, syncedLocal);
    return map;
  } catch (err) {
    console.warn('Firestore admins read fallback to local cache:', err?.message || err);
    return localAdmins;
  }
}

async function loadQuotasMap(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && quotasCache.map && now - quotasCache.fetchedAt < FIRESTORE_CACHE_TTL_MS) {
    return quotasCache.map;
  }
  if (!firestoreDb) {
    return {};
  }
  try {
    const q = query(
      collection(firestoreDb, 'surveyQuotas'),
      where('serverAuth', '==', FIRESTORE_SERVER_AUTH)
    );
    const snap = await getDocs(q);
    const map = {};
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      map[docSnap.id] = {
        year: Number(data.year),
        month: Number(data.month),
        day: Number(data.day),
        count: Number(data.count) || 0,
        existsInFirestore: true,
      };
    });
    quotasCache = { fetchedAt: now, map };
    return map;
  } catch (err) {
    console.warn('Firestore quotas read fallback to local cache:', err?.message || err);
    return {};
  }
}

async function loadPresenceMap(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && presenceCache.map && now - presenceCache.fetchedAt < PRESENCE_CACHE_TTL_MS) {
    return presenceCache.map;
  }

  const localPresence = readJsonObject(PRESENCE_FILE);
  if (!firestoreDb) {
    return localPresence;
  }

  try {
    const q = query(
      collection(firestoreDb, 'presence'),
      where('presenceScope', '==', PRESENCE_SCOPE)
    );
    const snap = await getDocs(q);
    const map = {};
    snap.forEach((docSnap) => {
      const normalized = normalizePresenceDoc(docSnap.id, docSnap.data());
      map[docSnap.id] = {
        ...normalized,
        existsInFirestore: true,
      };
    });
    presenceCache = { fetchedAt: now, map };
    writeJsonAtomic(PRESENCE_FILE, map);
    return map;
  } catch (err) {
    console.warn('Firestore presence read fallback to local cache:', err?.message || err);
    return localPresence;
  }
}

async function getValidAdminPayloadAsync(req) {
  const headerToken = req.get('x-admin-key');
  const cookies = parseCookies(req);
  const admins = await loadAdminsMap();

  for (const candidate of [headerToken, cookies.bt_admin]) {
    const payload = verifySignedPayload(candidate);
    if (
      payload &&
      payload.role === 'admin' &&
      typeof payload.vid === 'string' &&
      typeof payload.exp === 'number' &&
      payload.exp > Date.now() &&
      admins[payload.vid] &&
      admins[payload.vid].verified === true
    ) {
      return { payload, token: candidate };
    }
  }

  const visitor = getExistingVisitorFromRequest(req);
  if (visitor && admins[visitor.visitorId] && admins[visitor.visitorId].verified === true) {
    return { payload: { role: 'admin', vid: visitor.visitorId }, token: null };
  }
  return null;
}

async function isAdminRequestAsync(req) {
  return Boolean(await getValidAdminPayloadAsync(req));
}

function getClientIpKey(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function getLocalDailyUsedCount(localQuotas, visitorId, ipKey, dayKey) {
  const vKey = `v:${visitorId}`;
  const iKey = `ip:${ipKey}`;
  const vCount = localQuotas[vKey] && localQuotas[vKey].day === dayKey ? localQuotas[vKey].count : 0;
  const iCount = localQuotas[iKey] && localQuotas[iKey].day === dayKey ? localQuotas[iKey].count : 0;
  return Math.max(vCount, iCount);
}

// Admin Status & Code Verification Endpoints (HttpOnly cookie + signed Web Storage Key + Firestore)
app.get('/api/admin/status', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const visitor = getOrIssueVisitor(req, res);
  const adminMatch = await getValidAdminPayloadAsync(req);
  if (adminMatch) {
    const adminKey =
      adminMatch.token ||
      signPayload({
        role: 'admin',
        vid: adminMatch.payload.vid,
        exp: Date.now() + ADMIN_SESSION_TTL_MS,
        nonce: crypto.randomBytes(8).toString('hex'),
      });
    setHttpOnlyCookie(req, res, 'bt_admin', adminKey, ADMIN_SESSION_TTL_MS);
    res.json({
      isAdmin: true,
      adminKey,
      visitorKey: visitor.visitorKey,
      adminChannel: FIRESTORE_ADMIN_CHANNEL,
    });
    return;
  }
  res.json({ isAdmin: false, visitorKey: visitor.visitorKey });
});

app.post('/api/admin/verify-code', async (req, res) => {
  const existingVisitor = getExistingVisitorFromRequest(req);
  const ipKey = getClientIpKey(req);
  const attemptKey = `${ipKey}:${existingVisitor?.visitorId || 'anon'}`;
  const now = Date.now();
  const attempt = failedCodeAttempts.get(attemptKey);
  if (attempt && attempt.lockUntil > now) {
    res.status(429).json({
      ok: false,
      error: '試行回数が上限に達しました。しばらく待ってから再度お試しください。',
    });
    return;
  }

  const rawCode = typeof req.body?.code === 'string' ? req.body.code : '';
  if (!verifyAdminCodeDigest(rawCode)) {
    const nextCount = attempt && attempt.lockUntil <= now ? attempt.count + 1 : 1;
    failedCodeAttempts.set(attemptKey, {
      count: nextCount,
      lockUntil: nextCount >= MAX_CODE_ATTEMPTS ? now + CODE_LOCKOUT_MS : 0,
    });
    res.status(403).json({ ok: false, error: 'コードが正しくありません。' });
    return;
  }

  failedCodeAttempts.delete(attemptKey);
  const { visitorId, visitorKey } = getOrIssueVisitor(req, res);
  const username =
    (typeof req.body?.username === 'string' ? req.body.username.trim() : '').slice(
      0,
      SURVEY_NAME_MAX
    ) || 'プレイヤー';

  const existingAdmins = await loadAdminsMap(true);
  let persistedInFirestore = Boolean(existingAdmins[visitorId]?.existsInFirestore);
  if (firestoreDb) {
    try {
      const adminRef = doc(firestoreDb, 'admins', visitorId);
      if (existingAdmins[visitorId]?.existsInFirestore) {
        await updateDoc(adminRef, {
          username,
          verified: true,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(adminRef, {
          visitorId,
          username,
          verified: true,
          serverAuth: FIRESTORE_SERVER_AUTH,
          verifiedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      persistedInFirestore = true;
    } catch (err) {
      console.error('Failed to persist admin verification in Firestore:', err);
    }
  }

  const localAdmins = readJsonObject(ADMINS_FILE);
  localAdmins[visitorId] = {
    verified: true,
    username,
    verifiedAt: new Date(now).toISOString(),
  };
  writeJsonAtomic(ADMINS_FILE, localAdmins);

  adminsCache = {
    fetchedAt: now,
    map: {
      ...(existingAdmins && typeof existingAdmins === 'object' ? existingAdmins : {}),
      [visitorId]: {
        verified: true,
        username,
        existsInFirestore: persistedInFirestore,
      },
    },
  };

  const adminKey = signPayload({
    role: 'admin',
    vid: visitorId,
    exp: now + ADMIN_SESSION_TTL_MS,
    nonce: crypto.randomBytes(8).toString('hex'),
  });
  setHttpOnlyCookie(req, res, 'bt_admin', adminKey, ADMIN_SESSION_TTL_MS);
  res.json({
    ok: true,
    isAdmin: true,
    adminKey,
    visitorKey,
    adminChannel: FIRESTORE_ADMIN_CHANNEL,
  });
});

app.post('/api/admin/logout', async (req, res) => {
  const localAdmins = readJsonObject(ADMINS_FILE);
  const targetVids = new Set();

  const adminMatch = await getValidAdminPayloadAsync(req);
  if (adminMatch?.payload?.vid) targetVids.add(adminMatch.payload.vid);
  const visitor = getExistingVisitorFromRequest(req);
  if (visitor?.visitorId) targetVids.add(visitor.visitorId);

  const existingAdmins = await loadAdminsMap(true);
  let localChanged = false;
  for (const vid of targetVids) {
    if (localAdmins[vid]) {
      delete localAdmins[vid];
      localChanged = true;
    }
    if (existingAdmins[vid]) {
      existingAdmins[vid] = { ...existingAdmins[vid], verified: false };
    }
    if (firestoreDb && existingAdmins[vid]?.existsInFirestore) {
      try {
        await updateDoc(doc(firestoreDb, 'admins', vid), {
          verified: false,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Failed to update admin logout in Firestore:', err);
      }
    }
  }
  adminsCache = { fetchedAt: Date.now(), map: existingAdmins };
  if (localChanged) {
    writeJsonAtomic(ADMINS_FILE, localAdmins);
  }

  clearCookie(req, res, 'bt_admin');
  res.json({ ok: true, isAdmin: false });
});

// Survey Quota, Real-Time Firestore Submission & Admin-Only Read Endpoints
app.get('/api/surveys/quota', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { visitorId, visitorKey } = getOrIssueVisitor(req, res);
  const ipKey = getClientIpKey(req);
  const jst = getJstDateParts();

  const localQuotas = readJsonObject(QUOTAS_FILE);
  const localUsed = getLocalDailyUsedCount(localQuotas, visitorId, ipKey, jst.dayKey);

  const fsQuotas = await loadQuotasMap();
  const fsDoc = fsQuotas[visitorId];
  const fsSameDay =
    fsDoc && fsDoc.year === jst.year && fsDoc.month === jst.month && fsDoc.day === jst.day;
  const fsUsed = fsSameDay ? fsDoc.count : 0;

  const used = Math.max(localUsed, fsUsed);
  const quota = computeRemainingQuota(used, SURVEY_DAILY_LIMIT);
  res.json({
    ...quota,
    dayKey: jst.dayKey,
    visitorKey,
  });
});

app.post('/api/surveys', async (req, res) => {
  const { visitorId, visitorKey } = getOrIssueVisitor(req, res);
  const ipKey = getClientIpKey(req);
  const jst = getJstDateParts();

  const parsed = sanitizeSurveyInput(req.body?.authorName, req.body?.content);
  if (!parsed.isValid) {
    res.status(400).json({ ok: false, error: '追加して欲しい内容を入力してください。' });
    return;
  }

  const localQuotas = readJsonObject(QUOTAS_FILE);
  const localUsed = getLocalDailyUsedCount(localQuotas, visitorId, ipKey, jst.dayKey);

  const fsQuotas = await loadQuotasMap(true);
  const fsDoc = fsQuotas[visitorId];
  const fsSameDay =
    fsDoc && fsDoc.year === jst.year && fsDoc.month === jst.month && fsDoc.day === jst.day;
  const fsUsed = fsSameDay ? fsDoc.count : 0;

  const used = Math.max(localUsed, fsUsed);
  if (used >= SURVEY_DAILY_LIMIT) {
    res.status(429).json({
      ok: false,
      error: '本日の送信上限（1日3回まで）に達しました。また明日お送りください。',
      ...computeRemainingQuota(used, SURVEY_DAILY_LIMIT),
      dayKey: jst.dayKey,
      visitorKey,
    });
    return;
  }

  const surveyId = crypto.randomUUID();
  const isAdminVerified = await isAdminRequestAsync(req);
  const nextLocalUsed = used + 1;
  const nextFsCount = fsSameDay ? fsUsed + 1 : 1;
  const createdAtIso = new Date().toISOString();

  if (firestoreDb) {
    try {
      const batch = writeBatch(firestoreDb);
      const quotaRef = doc(firestoreDb, 'surveyQuotas', visitorId);
      const surveyRef = doc(firestoreDb, 'surveys', surveyId);

      batch.set(quotaRef, {
        visitorId,
        year: jst.year,
        month: jst.month,
        day: jst.day,
        count: nextFsCount,
        lastSurveyId: surveyId,
        serverAuth: FIRESTORE_SERVER_AUTH,
        updatedAt: serverTimestamp(),
      });

      batch.set(surveyRef, {
        visitorId,
        authorName: parsed.authorName,
        content: parsed.content,
        isAdminVerified,
        adminChannel: FIRESTORE_ADMIN_CHANNEL,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      quotasCache = { fetchedAt: 0, map: null };
    } catch (err) {
      console.error('Failed to save survey in Firestore:', err);
      res.status(502).json({
        ok: false,
        error: 'Firebaseへの保存に失敗しました。少し時間をおいて再度お試しください。',
      });
      return;
    }
  }

  localQuotas[`v:${visitorId}`] = { day: jst.dayKey, count: nextLocalUsed };
  localQuotas[`ip:${ipKey}`] = { day: jst.dayKey, count: nextLocalUsed };
  writeJsonAtomic(QUOTAS_FILE, localQuotas);

  const surveys = readJsonArray(SURVEYS_FILE);
  const entry = {
    id: surveyId,
    authorName: parsed.authorName,
    content: parsed.content,
    isAdminVerified,
    createdAt: createdAtIso,
  };
  surveys.unshift(entry);
  writeJsonAtomic(SURVEYS_FILE, surveys.slice(0, 500));

  res.status(201).json({
    ok: true,
    id: surveyId,
    authorName: parsed.authorName,
    content: parsed.content,
    isAdminVerified,
    createdAt: createdAtIso,
    ...computeRemainingQuota(nextLocalUsed, SURVEY_DAILY_LIMIT),
    dayKey: jst.dayKey,
    visitorKey,
  });
});

app.get('/api/surveys', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!(await isAdminRequestAsync(req))) {
    res.status(403).json({ ok: false, error: '管理者認証が必要です。' });
    return;
  }

  if (firestoreDb) {
    try {
      const q = query(
        collection(firestoreDb, 'surveys'),
        where('adminChannel', '==', FIRESTORE_ADMIN_CHANNEL)
      );
      const snap = await getDocs(q);
      const items = [];
      snap.forEach((docSnap) => {
        items.push(normalizeSurveyDoc(docSnap.id, docSnap.data()));
      });
      res.json({ ok: true, items: sortSurveysDesc(items) });
      return;
    } catch (err) {
      console.warn('Firestore surveys list fallback to local cache:', err?.message || err);
    }
  }

  const surveys = readJsonArray(SURVEYS_FILE);
  res.json({ ok: true, items: surveys });
});

function resolvePresenceDocId(rawPresenceId, fallbackVisitorId = '') {
  if (typeof rawPresenceId === 'string' && /^[a-f0-9]{24}$/.test(rawPresenceId.trim())) {
    return rawPresenceId.trim();
  }
  return fallbackVisitorId;
}

// Real-Time Presence (Online + Daily JST Login Reset at 00:00 JST)
app.get('/api/presence', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const existingVisitor = getExistingVisitorFromRequest(req);
  const headerPresenceId = resolvePresenceDocId(req.get('x-presence-id'), '');
  const selfId = headerPresenceId || existingVisitor?.visitorId || '';
  const map = await loadPresenceMap(true);
  const records = Object.values(map);
  const serverNowMs = Date.now();
  const split = splitPresenceRecords(records, serverNowMs, selfId);
  res.json({ ok: true, serverNowMs, records, ...split });
});

app.post('/api/presence/heartbeat', async (req, res) => {
  const { visitorId, visitorKey } = getOrIssueVisitor(req, res);
  const presenceDocId = resolvePresenceDocId(req.body?.presenceId, visitorId);
  const username = sanitizePresenceUsername(req.body?.username);
  const isAdminVerified = await isAdminRequestAsync(req);
  const nowMs = Date.now();
  const dayKey = getJstDateParts(nowMs).dayKey;
  const nowIso = new Date(nowMs).toISOString();

  let existingMap = await loadPresenceMap();
  if (!existingMap[presenceDocId]) {
    existingMap = await loadPresenceMap(true);
  }
  const existingDoc = existingMap[presenceDocId];
  let firestoreSynced = false;

  if (firestoreDb) {
    try {
      const batch = writeBatch(firestoreDb);
      const gateRef = doc(firestoreDb, 'presenceGates', presenceDocId);
      const presenceRef = doc(firestoreDb, 'presence', presenceDocId);

      batch.set(gateRef, {
        visitorId: presenceDocId,
        serverAuth: FIRESTORE_SERVER_AUTH,
        updatedAt: serverTimestamp(),
      });

      if (!existingDoc || !existingDoc.existsInFirestore) {
        batch.set(presenceRef, {
          visitorId: presenceDocId,
          username,
          isAdminVerified,
          dayKey,
          isOnline: true,
          presenceScope: PRESENCE_SCOPE,
          lastLoginAt: serverTimestamp(),
          lastSeenAt: serverTimestamp(),
        });
      } else if (existingDoc.dayKey !== dayKey) {
        batch.update(presenceRef, {
          username,
          isAdminVerified,
          dayKey,
          isOnline: true,
          lastLoginAt: serverTimestamp(),
          lastSeenAt: serverTimestamp(),
        });
      } else {
        batch.update(presenceRef, {
          username,
          isAdminVerified,
          isOnline: true,
          lastSeenAt: serverTimestamp(),
        });
      }

      await batch.commit();
      presenceCache = { fetchedAt: 0, map: null };
      firestoreSynced = true;
    } catch (err) {
      console.error('Failed to persist presence heartbeat in Firestore:', err);
    }
  }

  const localPresence = readJsonObject(PRESENCE_FILE);
  const prevLocal = localPresence[presenceDocId];
  const lastLoginAt =
    existingDoc && existingDoc.dayKey === dayKey && existingDoc.lastLoginAt
      ? existingDoc.lastLoginAt
      : prevLocal && prevLocal.dayKey === dayKey && prevLocal.lastLoginAt
        ? prevLocal.lastLoginAt
        : nowIso;
  const lastLoginAtMs =
    existingDoc && existingDoc.dayKey === dayKey && existingDoc.lastLoginAtMs
      ? existingDoc.lastLoginAtMs
      : prevLocal && prevLocal.dayKey === dayKey && prevLocal.lastLoginAtMs
        ? prevLocal.lastLoginAtMs
        : nowMs;

  const record = {
    visitorId: presenceDocId,
    username,
    isAdminVerified,
    dayKey,
    isOnline: true,
    lastLoginAt,
    lastLoginAtMs,
    lastSeenAt: nowIso,
    lastSeenAtMs: nowMs,
    existsInFirestore: Boolean(existingDoc?.existsInFirestore || firestoreSynced),
  };
  localPresence[presenceDocId] = record;
  writeJsonAtomic(PRESENCE_FILE, localPresence);

  res.json({
    ok: true,
    serverNowMs: nowMs,
    visitorId: presenceDocId,
    visitorKey,
    dayKey,
    firestoreSynced,
    record,
  });
});

app.post('/api/presence/leave', async (req, res) => {
  let parsedBody = req.body;
  if (typeof parsedBody === 'string') {
    try {
      parsedBody = JSON.parse(parsedBody);
    } catch {
      parsedBody = {};
    }
  }
  const bodyToken = typeof parsedBody?.visitorKey === 'string' ? parsedBody.visitorKey : '';
  const candidate = req.get('x-visitor-key') || parseCookies(req).bt_visitor || bodyToken;
  const parsed = verifySignedPayload(candidate);
  const signedVisitorId =
    parsed && typeof parsed.vid === 'string' && /^[a-f0-9]{24}$/.test(parsed.vid)
      ? parsed.vid
      : '';
  const presenceDocId = resolvePresenceDocId(parsedBody?.presenceId, signedVisitorId);
  if (!presenceDocId) {
    res.json({ ok: true });
    return;
  }

  let existingMap = await loadPresenceMap();
  if (!existingMap[presenceDocId]) {
    existingMap = await loadPresenceMap(true);
  }
  const existingDoc = existingMap[presenceDocId];

  if (firestoreDb && existingDoc?.existsInFirestore) {
    try {
      const batch = writeBatch(firestoreDb);
      batch.set(doc(firestoreDb, 'presenceGates', presenceDocId), {
        visitorId: presenceDocId,
        serverAuth: FIRESTORE_SERVER_AUTH,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(firestoreDb, 'presence', presenceDocId), {
        isOnline: false,
        lastSeenAt: serverTimestamp(),
      });
      await batch.commit();
      presenceCache = { fetchedAt: 0, map: null };
    } catch (err) {
      console.error('Failed to update presence leave in Firestore:', err);
    }
  }

  const localPresence = readJsonObject(PRESENCE_FILE);
  if (localPresence[presenceDocId]) {
    localPresence[presenceDocId].isOnline = false;
    localPresence[presenceDocId].lastSeenAt = new Date().toISOString();
    localPresence[presenceDocId].lastSeenAtMs = Date.now();
    writeJsonAtomic(PRESENCE_FILE, localPresence);
  }

  res.json({ ok: true });
});

app.use(express.static(__dirname));

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Static server listening on http://0.0.0.0:${PORT}`);
});
