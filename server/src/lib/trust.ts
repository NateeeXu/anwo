// Trust levels — DATA_MODEL §5. `users.trust_level` is derived; only this file writes it.
//
//   recomputeTrust(userId)         // after edu confirm, verification approve/reject, phone confirm, payment method add/remove
//   badgesFor(userRow)             // ['edu','id','phone','payment','pro','landlord','admin'] subset
//   setTrustOverride(userId, level, actorId, reason)   // admin override (audit 'user.trust_override'), never auto-lowered
import { q } from '../db';
import type { Badge } from '@shared/enums';
import { hooks } from './hooks';
import { nowIso } from './time';
import type { AuthUser, UserRow } from './types';
import { audit } from './audit';

type TrustCols = Pick<UserRow, 'id' | 'email_verified_at' | 'id_verified_at' | 'phone_verified_at' | 'payment_verified_at' | 'trust_level' | 'banned'>;

export function computeTrust(u: TrustCols): number {
  if (!u.email_verified_at) return 0;
  const hasApprovedId =
    !!u.id_verified_at ||
    q.count("SELECT COUNT(*) FROM verification_requests WHERE user_id = ? AND status = 'approved'", [u.id]) > 0;
  if (!hasApprovedId) return 1;
  const hasPayment =
    !!u.payment_verified_at || q.count('SELECT COUNT(*) FROM payment_methods WHERE user_id = ? AND deleted_at IS NULL', [u.id]) > 0;
  if (u.phone_verified_at && hasPayment) return 3;
  return 2;
}

function latestOverride(userId: string): number | null {
  const row = q.get<{ after_json: string | null }>(
    "SELECT after_json FROM audit_log WHERE action = 'user.trust_override' AND entity_type = 'user' AND entity_id = ? ORDER BY created_at DESC LIMIT 1",
    [userId],
  );
  if (!row?.after_json) return null;
  try {
    const v = JSON.parse(row.after_json) as { trustLevel?: number };
    return typeof v.trustLevel === 'number' ? v.trustLevel : null;
  } catch {
    return null;
  }
}

/** Recomputes and stores trust_level; returns the new level. Admin overrides are never lowered unless banned. */
export function recomputeTrust(userId: string, reason = 'recompute'): number {
  const u = q.get<TrustCols>('SELECT id, email_verified_at, id_verified_at, phone_verified_at, payment_verified_at, trust_level, banned FROM users WHERE id = ?', [userId]);
  if (!u) return 0;
  let level = computeTrust(u);
  if (u.banned !== 1) {
    const ov = latestOverride(userId);
    if (ov !== null && ov > level) level = ov;
  }
  if (level !== u.trust_level) {
    q.run('UPDATE users SET trust_level = ?, updated_at = ? WHERE id = ?', [level, nowIso(), userId]);
    hooks.emit('user.trustChanged', { userId, from: u.trust_level, to: level, reason });
  }
  return level;
}

export function setTrustOverride(userId: string, level: number, actorId: string | null, reason: string): number {
  const before = q.get<{ trust_level: number }>('SELECT trust_level FROM users WHERE id = ?', [userId]);
  if (!before) return 0;
  audit(actorId, 'user.trust_override', 'user', userId, { trustLevel: before.trust_level }, { trustLevel: level }, reason);
  q.run('UPDATE users SET trust_level = ?, updated_at = ? WHERE id = ?', [level, nowIso(), userId]);
  if (before.trust_level !== level) hooks.emit('user.trustChanged', { userId, from: before.trust_level, to: level, reason: 'override' });
  return level;
}

export function isPro(u: Pick<UserRow, 'pro_until'>): boolean {
  return !!u.pro_until && u.pro_until > nowIso();
}

export function badgesFor(u: Pick<AuthUser, 'email_verified_at' | 'id_verified_at' | 'phone_verified_at' | 'payment_verified_at' | 'pro_until' | 'role' | 'trust_level'>): Badge[] {
  const b: Badge[] = [];
  if (u.email_verified_at || u.trust_level >= 1) b.push('edu');
  if (u.id_verified_at || u.trust_level >= 2) b.push('id');
  if (u.phone_verified_at) b.push('phone');
  if (u.payment_verified_at) b.push('payment');
  if (isPro(u)) b.push('pro');
  if (u.role === 'landlord') b.push('landlord');
  if (u.role === 'admin') b.push('admin');
  return b;
}

/** Daily outbound-message / new-conversation caps by trust (DATA_MODEL §5). null = unlimited. */
export function dailyMessageCap(trustLevel: number): number | null {
  return [0, 50, 200, null][Math.max(0, Math.min(3, trustLevel))] ?? null;
}
export function dailyNewConversationCap(trustLevel: number): number | null {
  return trustLevel <= 0 ? 5 : trustLevel === 1 ? 20 : trustLevel === 2 ? 50 : null;
}
