// Sessions + auth middlewares — API.md §1.2.
//
//   router.get('/mine', requireAuth, handler)                 // req.user is the users row (minus password_hash)
//   router.post('/', requireAuth, requireTrust(1), handler)   // 403 TRUST_REQUIRED { required, current, nextStep }
//   router.get('/x', optionalAuth, handler)                   // req.user may be undefined
//   router.post('/escrows', requireAuth, requireFlag('escrow.enabled'), handler)
//   setSessionCookie(res, await signSession(user)); clearSessionCookie(res);
//   assertOwner(req, row.owner_id)                            // owner or admin, else 403
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config';
import { q } from '../db';
import { ApiError } from './errors';
import { isEnabled } from './flags';
import { nowIso, nowMs } from './time';
import type { AuthUser, UserRow } from './types';

export const SESSION_COOKIE = 'sid';
export const CAMPUS_COOKIE = 'campus';
export const LANG_COOKIE = 'lang';
export const ANON_COOKIE = 'aid';
const secret = new TextEncoder().encode(config.jwtSecret);

// ------------------------------------------------------------------ passwords
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.isProd ? 12 : 8);
}
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ JWT session
export type SessionPayload = { sub: string; role: string; iat: number; exp: number; sv: number };
function sessionVersionOf(userId: string): number {
  return q.get<{ session_version: number | null }>('SELECT session_version FROM users WHERE id = ?', [userId])?.session_version ?? 0;
}
/** Invalidates every session of the user (password change / reset, "log out everywhere"); re-sign the current one after. */
export function bumpSessionVersion(userId: string): void {
  q.run('UPDATE users SET session_version = COALESCE(session_version, 0) + 1, updated_at = ? WHERE id = ?', [nowIso(), userId]);
}
export async function signSession(user: Pick<UserRow, 'id' | 'role'>, days = config.sessionDays): Promise<string> {
  const iat = Math.floor(nowMs() / 1000);
  return new SignJWT({ role: user.role, sv: sessionVersionOf(user.id) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt(iat)
    .setExpirationTime(iat + days * 86400)
    .sign(secret);
}
export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'], currentDate: new Date(nowMs()) });
    if (!payload.sub) return null;
    return { sub: payload.sub, role: String(payload.role ?? 'student'), iat: Number(payload.iat), exp: Number(payload.exp), sv: Number(payload.sv ?? 0) };
  } catch {
    return null;
  }
}

const cookieBase = { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: config.isProd };
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieBase, maxAge: config.sessionDays * 86_400_000 });
}
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { ...cookieBase });
}
/** `campus` cookie (slug/id, 1 year, readable by the SPA) — DATA_MODEL §9.4 */
export function setCampusCookie(res: Response, campusId: string | null): void {
  if (campusId) res.cookie(CAMPUS_COOKIE, campusId, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 365 * 86_400_000, secure: config.isProd });
  else res.clearCookie(CAMPUS_COOKIE, { path: '/' });
}
export function cookieOf(req: Request, name: string): string | undefined {
  const c = (req as Request & { cookies?: Record<string, string> }).cookies?.[name];
  return typeof c === 'string' && c.length ? c : undefined;
}

// ------------------------------------------------------------------ user loading
const USER_COLUMNS =
  'id, email, name, role, trust_level, locale, campus_id, bio, avatar_upload_id, phone, phone_verified_at, email_verified_at, edu_email, id_verified_at, payment_verified_at, wechat_id, gender, grad_year, program, languages_json, banned, banned_reason, banned_at, referral_code, referred_by, verified_only_messaging, email_digest_opt_in, pro_until, wallet_balance_cents, listing_quota, session_version, last_seen_at, created_at, updated_at, deleted_at';
export function loadUser(id: string): AuthUser | undefined {
  return q.get<AuthUser>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? AND deleted_at IS NULL`, [id]);
}
export function loadUserByEmail(email: string): UserRow | undefined {
  return q.get<UserRow>('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [email.trim().toLowerCase()]);
}

const lastSeenWritten = new Map<string, number>();
/** Throttled users.last_seen_at update (once per 5 min per user). */
export function touchLastSeen(userId: string): void {
  const t = nowMs();
  const prev = lastSeenWritten.get(userId) ?? 0;
  if (t - prev < 5 * 60_000) return;
  lastSeenWritten.set(userId, t);
  q.run('UPDATE users SET last_seen_at = ? WHERE id = ?', [nowIso(), userId]);
}

async function resolveUser(req: Request): Promise<AuthUser | undefined> {
  if (req.user) return req.user;
  const session = await verifySession(cookieOf(req, SESSION_COOKIE));
  if (!session) return undefined;
  const user = loadUser(session.sub);
  if (!user) return undefined;
  if ((user.session_version ?? 0) !== session.sv) return undefined; // revoked (password changed, logged out everywhere)
  req.user = user;
  touchLastSeen(user.id);
  return user;
}

// ------------------------------------------------------------------ middlewares
export const optionalAuth: RequestHandler = (req, _res, next) => {
  resolveUser(req).then(() => next(), next);
};

const isWrite = (req: Request) => !['GET', 'HEAD', 'OPTIONS'].includes(req.method);

export const requireAuth: RequestHandler = (req, _res, next) => {
  resolveUser(req).then((user) => {
    if (!user) return next(new ApiError('UNAUTHORIZED'));
    if (user.banned === 1 && (isWrite(req) || req.path.startsWith('/chat') || req.baseUrl.includes('/chat')))
      return next(new ApiError('BANNED', 'Account suspended', { data: { reason: user.banned_reason } }));
    next();
  }, next);
};
/** Explicit variant for read endpoints that banned users must not reach. */
export const requireNotBanned: RequestHandler = (req, _res, next) => {
  if (req.user?.banned === 1) return next(new ApiError('BANNED', 'Account suspended', { data: { reason: req.user.banned_reason } }));
  next();
};

export function requireRole(...roles: Array<'student' | 'landlord' | 'admin'>): RequestHandler {
  return (req, _res, next) => {
    requireAuth(req, _res, (err?: unknown) => {
      if (err) return next(err);
      if (!roles.includes(req.user!.role)) return next(new ApiError('FORBIDDEN', 'Insufficient role'));
      next();
    });
  };
}
export const requireAdmin = requireRole('admin');

export function nextTrustStep(u: Pick<AuthUser, 'email_verified_at' | 'id_verified_at' | 'phone_verified_at' | 'payment_verified_at'>): 'edu' | 'id' | 'phone' | 'payment' | null {
  if (!u.email_verified_at) return 'edu';
  if (!u.id_verified_at) return 'id';
  if (!u.phone_verified_at) return 'phone';
  if (!u.payment_verified_at) return 'payment';
  return null;
}
export function trustError(user: AuthUser, required: number): ApiError {
  return new ApiError('TRUST_REQUIRED', `Trust level ${required} required`, {
    data: { required, current: user.trust_level, nextStep: nextTrustStep(user) },
  });
}
export function requireTrust(level: number): RequestHandler {
  return (req, res, next) => {
    requireAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      const u = req.user!;
      if (u.role === 'admin' || u.trust_level >= level) return next();
      next(trustError(u, level));
    });
  };
}
export function requireFlag(key: string): RequestHandler {
  return (req, _res, next) => {
    const campusId = (req.query?.campusId as string | undefined) ?? req.user?.campus_id ?? cookieOf(req, CAMPUS_COOKIE) ?? null;
    if (!isEnabled(key, campusId)) return next(new ApiError('FEATURE_DISABLED', `Feature ${key} is disabled`, { data: { flag: key } }));
    next();
  };
}
/** Throws FORBIDDEN unless req.user is the owner (or an admin). */
export function assertOwner(req: Request, ownerId: string | null | undefined, message = 'Not the owner'): AuthUser {
  const u = req.user;
  if (!u) throw new ApiError('UNAUTHORIZED');
  if (u.role === 'admin' || (ownerId && u.id === ownerId)) return u;
  throw new ApiError('FORBIDDEN', message);
}
export function isAdmin(req: Request): boolean {
  return req.user?.role === 'admin';
}

/** CSRF guard: state-changing requests must carry `X-Requested-With: fetch` (API.md §1.2). Beacons/webhooks are exempt. */
// The webhook and the partner postback are server-to-server and authenticated by an HMAC signature instead.
const CSRF_EXEMPT: RegExp[] = [/^\/api\/events\/?$/, /^\/api\/billing\/mock-stripe\/webhook/, /^\/api\/billing\/partners\/[^/]+\/converted/];
export const csrf: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (!isWrite(req)) return next();
  const path = req.originalUrl.split('?')[0] ?? '';
  if (CSRF_EXEMPT.some((re) => re.test(path))) return next();
  const h = String(req.headers['x-requested-with'] ?? '').toLowerCase();
  if (h === 'fetch' || h === 'xmlhttprequest') return next();
  next(new ApiError('FORBIDDEN', 'Missing X-Requested-With: fetch header'));
};
