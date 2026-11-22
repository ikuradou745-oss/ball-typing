import crypto from 'crypto';

export const ADMIN_CODE_SALT = 'bt_survey_admin_salt_2026_v1';
export const ADMIN_CODE_HASH_HEX =
  '360694cf83e1ba53e006adbcc6d0700c9b8b1e8ac0f9890ee3760c85fe0aad24c9628127919e84f5dc321115b7a619dc5a84c9a7dcea47824ef50acc9f320d41';

export function normalizeAdminCodeInput(rawCode) {
  if (typeof rawCode !== 'string') return '';
  return rawCode
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

export function verifyAdminCodeDigest(rawCode, envOverride = process.env.SURVEY_ADMIN_CODE) {
  const normalized = normalizeAdminCodeInput(rawCode);
  if (!normalized || normalized.length > 64) {
    return false;
  }

  if (typeof envOverride === 'string' && envOverride.trim().length > 0) {
    const normalizedEnv = normalizeAdminCodeInput(envOverride);
    const a = Buffer.from(normalized, 'utf8');
    const b = Buffer.from(normalizedEnv, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  const derived = crypto.scryptSync(normalized, ADMIN_CODE_SALT, 64);
  const expected = Buffer.from(ADMIN_CODE_HASH_HEX, 'hex');
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}
