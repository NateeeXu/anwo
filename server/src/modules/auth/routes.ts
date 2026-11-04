// /api/auth — API.md §2.1 (scaffold-owned)
import { Router } from 'express';
import { z } from 'zod';
import { EmailSchema, PasswordSchema } from '@shared/schemas/common';
import { q, uid } from '../../db';
import {
  clearSessionCookie, hashPassword, loadUser, loadUserByEmail, requireAuth, setCampusCookie, setSessionCookie, signSession, verifyPassword,
} from '../../lib/auth';
import { ApiError } from '../../lib/errors';
import { ok, parseBody } from '../../lib/http';
import { rateLimit } from '../../lib/ratelimit';
import { toUserMe } from '../../lib/users';
import { referralCode } from '../../lib/ids';
import { nowIso } from '../../lib/time';
import { getCampus } from '../../lib/campuses';
import { logEvent } from '../../lib/events';
import { hooks } from '../../lib/hooks';
import { confirmEduCode, eduCampusFor, requestEduCode } from '../../lib/eduVerify';
import { sendEmailCode, verifyEmailCode } from '../../lib/mailbox';
import { kickUser } from '../../realtime/hub';
import type { UserRow } from '../../lib/types';

const router = Router();
const authLimit = rateLimit('auth');

const RegisterInput = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  name: z.string().trim().min(1).max(60),
  locale: z.enum(['zh-CN', 'en']).optional(),
  campusId: z.string().max(64).optional(),
  referralCode: z.string().length(8).optional(),
});

function verifiedOnlyDefault(): boolean {
  return q.get<{ enabled: number }>("SELECT enabled FROM feature_flags WHERE key = 'verified_only_default'")?.enabled === 1;
}

export function uniqueReferralCode(): string {
  for (let i = 0; i < 20; i++) {
    const c = referralCode();
    if (!q.get('SELECT 1 FROM users WHERE referral_code = ?', [c])) return c;
  }
  return referralCode(10);
}

/** Creates a user row (used by register and the seed). Returns the row. */
export async function createUser(input: {
  email: string; password: string; name: string; locale?: 'zh-CN' | 'en'; campusId?: string | null; role?: 'student' | 'landlord' | 'admin';
  referredBy?: string | null; id?: string; passwordHash?: string;
}): Promise<UserRow> {
  const id = input.id ?? uid();
  const t = nowIso();
  const hash = input.passwordHash ?? (await hashPassword(input.password));
  q.run(
    `INSERT INTO users (id, email, password_hash, name, role, trust_level, locale, campus_id, referral_code, referred_by, verified_only_messaging, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.email.toLowerCase(), hash, input.name, input.role ?? 'student', input.locale ?? 'zh-CN', input.campusId ?? null, uniqueReferralCode(), input.referredBy ?? null, verifiedOnlyDefault() ? 1 : 0, t, t],
  );
  if (input.referredBy) {
    q.run('INSERT OR IGNORE INTO referrals (id, referrer_id, referred_id, code, status, created_at) VALUES (?, ?, ?, ?, ?, ?)', [uid(), input.referredBy, id, q.get<{ referral_code: string }>('SELECT referral_code FROM users WHERE id = ?', [input.referredBy])?.referral_code ?? '', 'pending', t]);
  }
  return q.get<UserRow>('SELECT * FROM users WHERE id = ?', [id])!;
}

router.post('/register', authLimit, async (req, res) => {
  const body = parseBody(req, RegisterInput);
  if (loadUserByEmail(body.email)) throw new ApiError('EMAIL_TAKEN', 'An account with this email already exists', { fields: { email: 'taken' } });
  if (body.campusId && !getCampus(body.campusId)) throw new ApiError('VALIDATION', 'Unknown campus', { fields: { campusId: 'unknown campus' } });
  let referredBy: string | null = null;
  if (body.referralCode) referredBy = q.get<{ id: string }>('SELECT id FROM users WHERE referral_code = ? AND deleted_at IS NULL', [body.referralCode.toUpperCase()])?.id ?? null;
  const edu = eduCampusFor(body.email);
  const campusId = body.campusId ?? edu.campusId ?? null;
  const user = await createUser({ email: body.email, password: body.password, name: body.name, locale: body.locale, campusId, referredBy });
  let eduCodeSent = false;
  if (edu.isEdu) {
    try {
      sendEmailCode(body.email, 'edu_verify', { userId: user.id, campusId: edu.campusId, locale: user.locale });
      eduCodeSent = true;
    } catch { /* rate limited — user can request again */ }
  }
  setSessionCookie(res, await signSession(user));
  setCampusCookie(res, user.campus_id);
  logEvent(req, 'signup', { userId: user.id, campusId: user.campus_id, props: { eduCodeSent, referred: !!referredBy } });
  hooks.emit('user.registered', { userId: user.id, email: user.email, campusId: user.campus_id, referredBy });
  ok(res, toUserMe(loadUser(user.id)!, { eduCodeSent }), 201);
});

router.post('/login', authLimit, async (req, res) => {
  const body = parseBody(req, z.object({ email: EmailSchema, password: z.string().min(1).max(72) }));
  const user = loadUserByEmail(body.email);
  if (!user || !(await verifyPassword(body.password, user.password_hash))) throw new ApiError('INVALID_CREDENTIALS', 'Email or password is incorrect');
  setSessionCookie(res, await signSession(user));
  setCampusCookie(res, user.campus_id);
  q.run('UPDATE users SET last_seen_at = ? WHERE id = ?', [nowIso(), user.id]);
  logEvent(req, 'login', { userId: user.id, campusId: user.campus_id });
  ok(res, toUserMe(loadUser(user.id)!));
});

router.post('/logout', requireAuth, (_req, res) => {
  clearSessionCookie(res);
  ok(res, null);
});

// `?optional=1` answers 200 `null` for anonymous visitors (the web app's boot probe), so a signed-out page load does not
// log a 401 in the browser console. Without the flag the contract is unchanged (401 UNAUTHORIZED).
router.get('/me', (req, res, next) => {
  if (!req.user && req.query.optional === '1') return ok(res, null);
  return requireAuth(req, res, () => ok(res, toUserMe(req.user!)));
});

router.post('/request-edu-code', requireAuth, rateLimit({ name: 'edu-code', limit: 5, windowMs: 10 * 60_000 }), (req, res) => {
  const body = parseBody(req, z.object({ email: EmailSchema }));
  ok(res, requestEduCode(req.user!, body.email));
});

router.post('/confirm-edu-code', requireAuth, authLimit, (req, res) => {
  const body = parseBody(req, z.object({ email: EmailSchema, code: z.string().trim().length(6) }));
  const prevCampus = req.user!.campus_id;
  const updated = confirmEduCode(req.user!, body.email, body.code);
  if (updated.campus_id !== prevCampus) setCampusCookie(res, updated.campus_id);
  ok(res, toUserMe(updated));
});

router.post('/request-password-reset', authLimit, (req, res) => {
  const body = parseBody(req, z.object({ email: EmailSchema }));
  const user = loadUserByEmail(body.email);
  if (user) {
    try {
      sendEmailCode(body.email, 'password_reset', { userId: user.id, locale: user.locale });
    } catch { /* rate limited: still no enumeration */ }
  }
  ok(res, { sent: true });
});

router.post('/reset-password', authLimit, async (req, res) => {
  const body = parseBody(req, z.object({ email: EmailSchema, code: z.string().trim().length(6), password: PasswordSchema }));
  const user = loadUserByEmail(body.email);
  if (!user) throw new ApiError('CODE_INVALID', 'Incorrect code');
  verifyEmailCode(body.email, 'password_reset', body.code);
  q.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [await hashPassword(body.password), nowIso(), user.id]);
  kickUser(user.id);
  ok(res, null);
});

router.post('/change-password', requireAuth, authLimit, async (req, res) => {
  const body = parseBody(req, z.object({ currentPassword: z.string().min(1).max(72), newPassword: PasswordSchema }));
  const row = q.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [req.user!.id])!;
  if (!(await verifyPassword(body.currentPassword, row.password_hash))) throw new ApiError('INVALID_CREDENTIALS', 'Current password is incorrect');
  q.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [await hashPassword(body.newPassword), nowIso(), req.user!.id]);
  ok(res, null);
});

export default router;
