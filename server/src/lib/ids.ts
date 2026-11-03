import { randomUUID, randomInt, createHash } from 'node:crypto';

export function uid(): string {
  return randomUUID();
}
/** 6-digit numeric code for email / SMS verification. */
export function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** 8-char upper alnum referral code (no ambiguous chars). */
export function referralCode(len = 8): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALNUM[randomInt(0, ALNUM.length)];
  return s;
}
export function sha256(s: string | Buffer): string {
  return createHash('sha256').update(s).digest('hex');
}
/** Deterministic 32-bit hash of a string (fnv-1a) — used for fuzzing coordinates. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
