// In-memory rate limiting — API.md §1.2 (auth 10/min, code requests 3/10 min, writes 60/min, reads 600/min).
//
//   router.post('/login', rateLimit('auth'), handler)                      // preset
//   router.get('/geocode', rateLimit({ name: 'geocode', limit: 30, windowMs: 60_000 }), handler)
//   checkRate(`edu-code:${email}`, 3, 10 * 60_000)                           // throws RATE_LIMITED
import type { RequestHandler, Request } from 'express';
import { ApiError } from './errors';
import { clientIp } from './http';
import { config } from '../config';
import { nowMs } from './time';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(): void {
  const t = nowMs();
  if (t - lastSweep < 60_000) return;
  lastSweep = t;
  for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
}

/** Returns { ok, remaining, retryAfterSec }. Increments the bucket when ok. */
export function hit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number; retryAfterSec: number } {
  if (config.rateLimitDisabled) return { ok: true, remaining: limit, retryAfterSec: 0 };
  sweep();
  const t = nowMs();
  let b = buckets.get(key);
  if (!b || b.resetAt <= t) {
    b = { count: 0, resetAt: t + windowMs };
    buckets.set(key, b);
  }
  if (b.count >= limit) return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - t) / 1000)) };
  b.count++;
  return { ok: true, remaining: limit - b.count, retryAfterSec: 0 };
}

/** Throws RATE_LIMITED when the key is over its limit. */
export function checkRate(key: string, limit: number, windowMs: number): void {
  const r = hit(key, limit, windowMs);
  if (!r.ok) throw new ApiError('RATE_LIMITED', 'Too many requests', { data: { retryAfterSec: r.retryAfterSec } });
}

export function resetRateLimits(): void {
  buckets.clear();
}

export const RATE_PRESETS = {
  auth: { limit: 10, windowMs: 60_000 },
  codes: { limit: 3, windowMs: 10 * 60_000 },
  writes: { limit: 60, windowMs: 60_000 },
  reads: { limit: 600, windowMs: 60_000 },
} as const;
export type RatePreset = keyof typeof RATE_PRESETS;

export type RateLimitOptions = {
  name: string;
  limit: number;
  windowMs: number;
  /** default: ip + user id */
  key?: (req: Request) => string;
};

export function rateKey(req: Request): string {
  return `${clientIp(req)}|${req.user?.id ?? '-'}`;
}

export function rateLimit(opts: RatePreset | RateLimitOptions): RequestHandler {
  const o: RateLimitOptions = typeof opts === 'string' ? { name: opts, ...RATE_PRESETS[opts] } : opts;
  return (req, res, next) => {
    const key = `${o.name}:${(o.key ?? rateKey)(req)}`;
    const r = hit(key, o.limit, o.windowMs);
    res.setHeader('X-RateLimit-Limit', String(o.limit));
    res.setHeader('X-RateLimit-Remaining', String(r.remaining));
    if (!r.ok) {
      res.setHeader('Retry-After', String(r.retryAfterSec));
      next(new ApiError('RATE_LIMITED', 'Too many requests', { data: { retryAfterSec: r.retryAfterSec } }));
      return;
    }
    next();
  };
}

/** Global limiter: reads 600/min, writes 60/min per ip+user (auth routes add their own stricter one). */
export const globalRateLimit: RequestHandler = (req, res, next) => {
  const isRead = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
  const preset = isRead ? RATE_PRESETS.reads : RATE_PRESETS.writes;
  const r = hit(`${isRead ? 'reads' : 'writes'}:${rateKey(req)}`, preset.limit, preset.windowMs);
  if (!r.ok) {
    res.setHeader('Retry-After', String(r.retryAfterSec));
    next(new ApiError('RATE_LIMITED', 'Too many requests', { data: { retryAfterSec: r.retryAfterSec } }));
    return;
  }
  next();
};
