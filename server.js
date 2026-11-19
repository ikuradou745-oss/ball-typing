import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Server-side secret verification (never exposed to client scripts)
const ADMIN_CODE_SALT = 'bt_survey_admin_salt_2026_v1';
const ADMIN_CODE_HASH_HEX =
  '360694cf83e1ba53e006adbcc6d0700c9b8b1e8ac0f9890ee3760c85fe0aad24c9628127919e84f5dc321115b7a619dc5a84c9a7dcea47824ef50acc9f320d41';
const SESSION_SECRET = crypto.randomBytes(32);
const ADMIN_TOKEN_TTL_MS = 15 * 60 * 1000;

app.use(express.json({ limit: '8kb' }));

// Prevent static serving of server code, security specs, rules, and package manifests
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
    reqPath.startsWith('/node_modules')
  ) {
    res.status(404).end();
    return;
  }
  next();
});

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

function signAdminToken(uid) {
  const payload = {
    uid: String(uid || ''),
    exp: Date.now() + ADMIN_TOKEN_TTL_MS,
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyAdminToken(token, expectedUid) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return false;
    if (expectedUid && parsed.uid !== expectedUid) return false;
    return true;
  } catch {
    return false;
  }
}

app.post('/api/admin/verify-code', (req, res) => {
  const { code, uid } = req.body || {};
  if (typeof uid !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
    res.status(401).json({ ok: false, error: 'Googleアカウントでログインしてください。' });
    return;
  }
  if (!verifyAdminCodeDigest(typeof code === 'string' ? code.trim() : '')) {
    res.status(403).json({ ok: false, error: '管理者コードが正しくありません。' });
    return;
  }
  const token = signAdminToken(uid);
  res.json({ ok: true, token });
});

app.post('/api/admin/verify-token', (req, res) => {
  const { token, uid } = req.body || {};
  if (typeof uid !== 'string' || !verifyAdminToken(token, uid)) {
    res.status(403).json({ ok: false });
    return;
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
