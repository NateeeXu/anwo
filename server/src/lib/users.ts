// User DTO mappers — API.md §1.6 UserPublic / UserMe.
//
//   toUserPublic(row)                       // list cards (never leaks email/phone)
//   toUserPublic(row, { withStats: true })  // detail endpoints: adds responseRate / responseMedianMin
//   toUserMe(row)                           // /api/auth/me — adds private fields, campus, unread counts
//   loadUsersPublic(ids)                    // Map<id, UserPublic> batch for cards
import type { Campus, UserMe, UserPublic } from '@shared/types';
import { q, parseJson, placeholders } from '../db';
import { getCampus, toCampusLite } from './campuses';
import { badgesFor, isPro } from './trust';
import { nowMs } from './time';
import type { AuthUser, UserRow } from './types';

export type UserPublicRow = Pick<
  UserRow,
  | 'id' | 'name' | 'role' | 'trust_level' | 'campus_id' | 'avatar_upload_id' | 'bio' | 'program' | 'grad_year'
  | 'languages_json' | 'created_at' | 'email_verified_at' | 'id_verified_at' | 'phone_verified_at' | 'payment_verified_at'
  | 'pro_until' | 'last_seen_at' | 'banned' | 'deleted_at'
> & { avatar_url?: string | null };

export const USER_PUBLIC_SELECT =
  'u.id, u.name, u.role, u.trust_level, u.campus_id, u.avatar_upload_id, u.bio, u.program, u.grad_year, u.languages_json, u.created_at, u.email_verified_at, u.id_verified_at, u.phone_verified_at, u.payment_verified_at, u.pro_until, u.last_seen_at, u.banned, u.deleted_at, au.url AS avatar_url';
export const USER_PUBLIC_FROM = 'users u LEFT JOIN uploads au ON au.id = u.avatar_upload_id';

export function avatarUrlFor(row: { avatar_upload_id?: string | null; avatar_url?: string | null }): string | null {
  if (row.avatar_url !== undefined) return row.avatar_url ?? null;
  if (!row.avatar_upload_id) return null;
  return q.get<{ url: string }>('SELECT url FROM uploads WHERE id = ?', [row.avatar_upload_id])?.url ?? null;
}

/** 'online' (seen < 5 min) | 'recently' (< 24 h) | null — never the exact timestamp. */
export function lastSeenBucket(lastSeenAt: string | null): 'online' | 'recently' | null {
  if (!lastSeenAt) return null;
  const age = nowMs() - Date.parse(lastSeenAt);
  if (age < 5 * 60_000) return 'online';
  if (age < 24 * 3_600_000) return 'recently';
  return null;
}

/** DATA_MODEL §2.2: responseRate / responseMedianMin over direct conversations of the last 90 days. */
export function responseStats(userId: string): { responseRate: number | null; responseMedianMin: number | null } {
  const since = new Date(nowMs() - 90 * 86_400_000).toISOString();
  const rows = q.all<{ conversation_id: string; first_at: string; first_sender: string; reply_at: string | null }>(
    `SELECT c.id AS conversation_id,
            (SELECT created_at FROM messages m WHERE m.conversation_id = c.id AND m.sender_id IS NOT NULL ORDER BY created_at LIMIT 1) AS first_at,
            (SELECT sender_id FROM messages m WHERE m.conversation_id = c.id AND m.sender_id IS NOT NULL ORDER BY created_at LIMIT 1) AS first_sender,
            (SELECT created_at FROM messages m WHERE m.conversation_id = c.id AND m.sender_id = ? ORDER BY created_at LIMIT 1) AS reply_at
       FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
      WHERE c.kind = 'direct' AND c.created_at >= ?`,
    [userId, userId, since],
  ).filter((r) => r.first_at && r.first_sender && r.first_sender !== userId);
  if (rows.length < 3) return { responseRate: null, responseMedianMin: null };
  const mins: number[] = [];
  let answered = 0;
  for (const r of rows) {
    if (!r.reply_at) continue;
    const m = (Date.parse(r.reply_at) - Date.parse(r.first_at)) / 60_000;
    if (m <= 24 * 60) answered++;
    mins.push(m);
  }
  mins.sort((a, b) => a - b);
  const median = mins.length ? mins[Math.floor(mins.length / 2)]! : null;
  return { responseRate: Math.round((answered / rows.length) * 100) / 100, responseMedianMin: median === null ? null : Math.round(median) };
}

export function toUserPublic(row: UserPublicRow, opts: { withStats?: boolean } = {}): UserPublic {
  const deleted = !!row.deleted_at;
  const u: UserPublic = {
    id: row.id,
    name: deleted ? '已注销用户 / Deleted user' : row.name,
    role: row.role,
    trustLevel: row.banned === 1 ? 0 : row.trust_level,
    campusId: row.campus_id,
    campus: toCampusLite(row.campus_id),
    avatarUrl: deleted ? null : avatarUrlFor(row),
    bio: deleted ? null : row.bio,
    program: row.program,
    gradYear: row.grad_year,
    languages: parseJson<string[]>(row.languages_json, []),
    memberSince: row.created_at,
    badges: row.banned === 1 ? [] : badgesFor(row),
    isPro: isPro(row),
    lastSeenAt: lastSeenBucket(row.last_seen_at),
  };
  if (opts.withStats) Object.assign(u, responseStats(row.id));
  return u;
}

export function loadUserPublicRow(id: string): UserPublicRow | undefined {
  return q.get<UserPublicRow>(`SELECT ${USER_PUBLIC_SELECT} FROM ${USER_PUBLIC_FROM} WHERE u.id = ?`, [id]);
}
export function loadUserPublic(id: string, opts: { withStats?: boolean } = {}): UserPublic | null {
  const r = loadUserPublicRow(id);
  return r ? toUserPublic(r, opts) : null;
}
export function loadUsersPublic(ids: Iterable<string>): Map<string, UserPublic> {
  const list = [...new Set(ids)].filter(Boolean);
  const out = new Map<string, UserPublic>();
  for (let i = 0; i < list.length; i += 400) {
    const chunk = list.slice(i, i + 400);
    for (const r of q.all<UserPublicRow>(`SELECT ${USER_PUBLIC_SELECT} FROM ${USER_PUBLIC_FROM} WHERE u.id IN (${placeholders(chunk.length)})`, chunk))
      out.set(r.id, toUserPublic(r));
  }
  return out;
}

export function unreadCounts(userId: string): { notifications: number; messages: number } {
  const notifications = q.count('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL', [userId]);
  const messages = q.count('SELECT COALESCE(SUM(unread_count), 0) FROM conversation_members WHERE user_id = ? AND left_at IS NULL AND archived = 0', [userId]);
  return { notifications, messages };
}

export function toUserMe(row: AuthUser, extra: Partial<UserMe> = {}): UserMe {
  const base = toUserPublic({ ...row, avatar_url: undefined } as UserPublicRow);
  const unread = unreadCounts(row.id);
  const campus: Campus | null = getCampus(row.campus_id);
  return {
    ...base,
    email: row.email,
    locale: row.locale,
    phone: row.phone,
    phoneVerifiedAt: row.phone_verified_at,
    emailVerifiedAt: row.email_verified_at,
    eduEmail: row.edu_email,
    idVerifiedAt: row.id_verified_at,
    paymentVerifiedAt: row.payment_verified_at,
    wechatId: row.wechat_id,
    gender: row.gender,
    verifiedOnlyMessaging: row.verified_only_messaging === 1,
    emailDigestOptIn: row.email_digest_opt_in === 1,
    referralCode: row.referral_code,
    walletBalanceCents: row.wallet_balance_cents,
    proUntil: row.pro_until,
    listingQuota: isPro(row) ? Number.MAX_SAFE_INTEGER : row.listing_quota,
    unreadNotifications: unread.notifications,
    unreadMessages: unread.messages,
    banned: row.banned === 1,
    bannedReason: row.banned_reason,
    trustLevel: row.trust_level,
    badges: badgesFor(row),
    campus,
    ...extra,
  };
}
