import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);

const PORT = 3000;
const DATA_DIR = path.join(__dirname, '.data');
const SURVEYS_FILE = path.join(DATA_DIR, 'surveys.json');
const QUOTAS_FILE = path.join(DATA_DIR, 'quotas.json');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');

const SURVEY_DAILY_LIMIT = 3;
const SURVEY_NAME_MAX = 20;
const SURVEY_CONTENT_MAX = 300;
const ADMIN_SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const VISITOR_COOKIE_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 10;
const CODE_LOCKOUT_MS = 15 * 60 * 1000;

// Server-only scrypt digest (plaintext code is never stored in code or sent to client)
const ADMIN_CODE_SALT = 'bt_survey_admin_salt_2026_v1';
const ADMIN_CODE_HASH_HEX =
  '360694cf83e1ba53e006adbcc6d0700c9b8b1e8ac0f9890ee3760c85fe0aad24c9628127919e84f5dc321115b7a619dc5a84c9a7dcea47824ef50acc9f320d41';

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

// Block HTTP access to server scripts, security files, rules, and local server data
const BLOCKED_STATIC_PATHS = new Set([
  '/server.js',
  '/package.json',
  '/bun.lock',
  '/eslint.config.mjs',
  '/firestore.rules',
  '/firestore.rules.test.ts',
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

function getValidAdminPayload(req) {
  const headerToken = req.get('x-admin-key');
  const cookies = parseCookies(req);
  const admins = readJsonObject(ADMINS_FILE);

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

function isAdminRequest(req) {
  return Boolean(getValidAdminPayload(req));
}

function verifyAdminCodeDigest(inputCode) {
  if (typeof inputCode !== 'string' || inputCode.length === 0 || inputCode.length > 64) {
    return false;
  }
  const envOverride = process.env.SURVEY_ADMIN_CODE;
  if (typeof envOverride === 'string' && envOverride.length > 0) {
    const a = Buffer.from(inputCode, 'utf8');
    const b = Buffer.from(envOverride, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const derived = crypto.scryptSync(inputCode, ADMIN_CODE_SALT, 64);
  const expected = Buffer.from(ADMIN_CODE_HASH_HEX, 'hex');
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

function getJstDayKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

function getClientIpKey(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function getDailyUsedCount(quotas, visitorId, ipKey, dayKey) {
  const vKey = `v:${visitorId}`;
  const iKey = `ip:${ipKey}`;
  const vCount = quotas[vKey] && quotas[vKey].day === dayKey ? quotas[vKey].count : 0;
  const iCount = quotas[iKey] && quotas[iKey].day === dayKey ? quotas[iKey].count : 0;
  return Math.max(vCount, iCount);
}

// Admin Status & Code Verification Endpoints (HttpOnly cookie + signed Web Storage Key + server registry)
app.get('/api/admin/status', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const visitor = getOrIssueVisitor(req, res);
  const adminMatch = getValidAdminPayload(req);
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
    res.json({ isAdmin: true, adminKey, visitorKey: visitor.visitorKey });
    return;
  }
  res.json({ isAdmin: false, visitorKey: visitor.visitorKey });
});

app.post('/api/admin/verify-code', (req, res) => {
  const ipKey = getClientIpKey(req);
  const now = Date.now();
  const attempt = failedCodeAttempts.get(ipKey);
  if (attempt && attempt.lockUntil > now) {
    res.status(429).json({
      ok: false,
      error: '試行回数が上限に達しました。しばらく待ってから再度お試しください。',
    });
    return;
  }

  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!verifyAdminCodeDigest(code)) {
    const nextCount = attempt && attempt.lockUntil <= now ? attempt.count + 1 : 1;
    failedCodeAttempts.set(ipKey, {
      count: nextCount,
      lockUntil: nextCount >= MAX_CODE_ATTEMPTS ? now + CODE_LOCKOUT_MS : 0,
    });
    res.status(403).json({ ok: false, error: 'コードが正しくありません。' });
    return;
  }

  failedCodeAttempts.delete(ipKey);
  const { visitorId, visitorKey } = getOrIssueVisitor(req, res);
  const admins = readJsonObject(ADMINS_FILE);
  admins[visitorId] = {
    verified: true,
    verifiedAt: new Date(now).toISOString(),
  };
  writeJsonAtomic(ADMINS_FILE, admins);

  const adminKey = signPayload({
    role: 'admin',
    vid: visitorId,
    exp: now + ADMIN_SESSION_TTL_MS,
    nonce: crypto.randomBytes(8).toString('hex'),
  });
  setHttpOnlyCookie(req, res, 'bt_admin', adminKey, ADMIN_SESSION_TTL_MS);
  res.json({ ok: true, isAdmin: true, adminKey, visitorKey });
});

app.post('/api/admin/logout', (req, res) => {
  const admins = readJsonObject(ADMINS_FILE);
  let changed = false;

  const adminMatch = getValidAdminPayload(req);
  if (adminMatch && adminMatch.payload?.vid && admins[adminMatch.payload.vid]) {
    delete admins[adminMatch.payload.vid];
    changed = true;
  }
  const visitor = getExistingVisitorFromRequest(req);
  if (visitor && admins[visitor.visitorId]) {
    delete admins[visitor.visitorId];
    changed = true;
  }
  if (changed) {
    writeJsonAtomic(ADMINS_FILE, admins);
  }

  clearCookie(req, res, 'bt_admin');
  res.json({ ok: true, isAdmin: false });
});

// Survey Quota, Submission & Admin-Only Read Endpoints
app.get('/api/surveys/quota', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { visitorId, visitorKey } = getOrIssueVisitor(req, res);
  const ipKey = getClientIpKey(req);
  const dayKey = getJstDayKey();
  const quotas = readJsonObject(QUOTAS_FILE);
  const used = getDailyUsedCount(quotas, visitorId, ipKey, dayKey);
  res.json({
    used,
    remaining: Math.max(0, SURVEY_DAILY_LIMIT - used),
    limit: SURVEY_DAILY_LIMIT,
    visitorKey,
  });
});

app.post('/api/surveys', (req, res) => {
  const { visitorId, visitorKey } = getOrIssueVisitor(req, res);
  const ipKey = getClientIpKey(req);
  const dayKey = getJstDayKey();

  const rawName = typeof req.body?.authorName === 'string' ? req.body.authorName.trim() : '';
  const rawContent = typeof req.body?.content === 'string' ? req.body.content.trim() : '';

  const authorName = (rawName || 'プレイヤー').slice(0, SURVEY_NAME_MAX);
  const content = rawContent.slice(0, SURVEY_CONTENT_MAX);

  if (!content) {
    res.status(400).json({ ok: false, error: '追加して欲しい内容を入力してください。' });
    return;
  }

  const quotas = readJsonObject(QUOTAS_FILE);
  const used = getDailyUsedCount(quotas, visitorId, ipKey, dayKey);
  if (used >= SURVEY_DAILY_LIMIT) {
    res.status(429).json({
      ok: false,
      error: '本日の送信上限（1日3回まで）に達しました。また明日お送りください。',
      used,
      remaining: 0,
      limit: SURVEY_DAILY_LIMIT,
      visitorKey,
    });
    return;
  }

  const nextUsed = used + 1;
  quotas[`v:${visitorId}`] = { day: dayKey, count: nextUsed };
  quotas[`ip:${ipKey}`] = { day: dayKey, count: nextUsed };
  writeJsonAtomic(QUOTAS_FILE, quotas);

  const surveys = readJsonArray(SURVEYS_FILE);
  const entry = {
    id: crypto.randomUUID(),
    authorName,
    content,
    isAdminVerified: isAdminRequest(req),
    createdAt: new Date().toISOString(),
  };
  surveys.unshift(entry);
  writeJsonAtomic(SURVEYS_FILE, surveys.slice(0, 500));

  res.status(201).json({
    ok: true,
    used: nextUsed,
    remaining: Math.max(0, SURVEY_DAILY_LIMIT - nextUsed),
    limit: SURVEY_DAILY_LIMIT,
    visitorKey,
  });
});

app.get('/api/surveys', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isAdminRequest(req)) {
    res.status(403).json({ ok: false, error: '管理者認証が必要です。' });
    return;
  }
  const surveys = readJsonArray(SURVEYS_FILE);
  res.json({ ok: true, items: surveys });
});

app.use(express.static(__dirname));

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Static server listening on http://0.0.0.0:${PORT}`);
});
