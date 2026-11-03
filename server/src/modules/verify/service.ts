// server/src/modules/verify/service.ts — stable cross-module exports of the `verify` module.
// Other modules import ONLY from here (DATA_MODEL §1). Routes live in ./routes.ts.
//
//   hasSupplyProof(userId)                 // approved landlord_proof row → billing "supply badge" eligibility
//   latestRequest(userId, type?)           // newest verification request (any status)
//   addPaymentMethod(userId, card)         // mock card → payment_methods row (+ users.payment_verified_at, trust recompute)
//   removePaymentMethod(userId, id)        // soft delete; clears payment_verified_at when none left
//   listPaymentMethods(userId)             // PaymentMethod[] (API.md §1.6 DTO, shared with billing)
//   verificationStatus(user)               // GET /api/verify/status payload
//   trustProfile(userId)                   // GET /api/verify/profile/:userId payload
import type { PaymentMethod, VerificationRequest } from '@shared/types';
import { cardBrandOf, luhnValid, type PaymentMethodInput } from '@shared/schemas/verify';
import { q, uid } from '../../db';
import { ApiError } from '../../lib/errors';
import { nextTrustStep } from '../../lib/auth';
import { badgesFor, recomputeTrust } from '../../lib/trust';
import { nowIso } from '../../lib/time';
import { loadUserPublic } from '../../lib/users';
import { toUploadDto, getUpload } from '../../lib/uploads';
import type { AuthUser } from '../../lib/types';

// ---------------------------------------------------------------- rows + DTOs
export type VerificationRow = {
  id: string;
  user_id: string;
  campus_id: string | null;
  type: VerificationRequest['type'];
  front_upload_id: string | null;
  back_upload_id: string | null;
  selfie_upload_id: string | null;
  full_name: string | null;
  doc_number_last4: string | null;
  status: VerificationRequest['status'];
  reviewer_id: string | null;
  reason: string | null;
  internal_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function toRequestDto(r: VerificationRow): VerificationRequest {
  return {
    id: r.id,
    userId: r.user_id,
    campusId: r.campus_id,
    type: r.type,
    frontUploadId: r.front_upload_id,
    backUploadId: r.back_upload_id,
    selfieUploadId: r.selfie_upload_id,
    fullName: r.full_name,
    docNumberLast4: r.doc_number_last4,
    status: r.status,
    reviewerId: r.reviewer_id,
    reason: r.reason,
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
  };
}

export function loadRequest(id: string): VerificationRow | undefined {
  return q.get<VerificationRow>('SELECT * FROM verification_requests WHERE id = ?', [id]);
}

export function latestRequest(userId: string, type?: VerificationRequest['type']): VerificationRow | undefined {
  return type
    ? q.get<VerificationRow>('SELECT * FROM verification_requests WHERE user_id = ? AND type = ? ORDER BY submitted_at DESC LIMIT 1', [userId, type])
    : q.get<VerificationRow>('SELECT * FROM verification_requests WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1', [userId]);
}

export function listRequests(userId: string): VerificationRow[] {
  return q.all<VerificationRow>('SELECT * FROM verification_requests WHERE user_id = ? ORDER BY submitted_at DESC', [userId]);
}

/** Open (pending | in_review) request of the given type, if any — only one may exist per user per type. */
export function openRequest(userId: string, type: VerificationRequest['type']): VerificationRow | undefined {
  return q.get<VerificationRow>("SELECT * FROM verification_requests WHERE user_id = ? AND type = ? AND status IN ('pending','in_review') ORDER BY submitted_at DESC LIMIT 1", [userId, type]);
}

/** billing's "supply badge": an approved landlord_proof row (lease_proof type is an integration request, see docs/modules/verify.md). */
export function hasSupplyProof(userId: string): boolean {
  return q.count("SELECT COUNT(*) FROM verification_requests WHERE user_id = ? AND type = 'landlord_proof' AND status = 'approved'", [userId]) > 0;
}

/** Type of the newest approved ID document, or null. */
export function approvedIdType(userId: string): VerificationRequest['type'] | null {
  return q.get<{ type: VerificationRequest['type'] }>("SELECT type FROM verification_requests WHERE user_id = ? AND status = 'approved' ORDER BY reviewed_at DESC LIMIT 1", [userId])?.type ?? null;
}

// ---------------------------------------------------------------- payment methods (mock, shared with billing)
export type PaymentMethodRow = {
  id: string;
  user_id: string;
  provider: string;
  provider_token: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: number;
  created_at: string;
  deleted_at: string | null;
};

export function toPaymentMethodDto(r: PaymentMethodRow): PaymentMethod {
  return { id: r.id, brand: r.brand, last4: r.last4, expMonth: r.exp_month, expYear: r.exp_year, isDefault: r.is_default === 1 };
}

export function listPaymentMethods(userId: string): PaymentMethod[] {
  return q
    .all<PaymentMethodRow>('SELECT * FROM payment_methods WHERE user_id = ? AND deleted_at IS NULL ORDER BY is_default DESC, created_at DESC', [userId])
    .map(toPaymentMethodDto);
}

/**
 * Mock gateway: validates the card (Luhn + expiry), declines numbers ending in 0002 (`PAYMENT_FAILED { failureCode }`),
 * stores brand/last4 only, sets users.payment_verified_at and recomputes trust. Billing's checkout "save card" calls this too.
 */
export function addPaymentMethod(userId: string, card: PaymentMethodInput): PaymentMethod {
  const number = card.cardNumber;
  if (!luhnValid(number)) throw new ApiError('PAYMENT_FAILED', 'Card number failed validation', { data: { failureCode: 'incorrect_number' }, fields: { cardNumber: 'invalid card number' } });
  const now = new Date(nowIso());
  const expEnd = new Date(Date.UTC(card.expYear, card.expMonth, 1)); // first day after the expiry month
  if (expEnd <= now) throw new ApiError('PAYMENT_FAILED', 'Card has expired', { data: { failureCode: 'expired_card' }, fields: { expMonth: 'card expired' } });
  if (number.endsWith('0002')) throw new ApiError('PAYMENT_FAILED', 'Card declined (test number)', { data: { failureCode: 'card_declined' } });
  if (number.endsWith('0069')) throw new ApiError('PAYMENT_FAILED', 'Card declined (test number)', { data: { failureCode: 'expired_card' } });
  const last4 = number.slice(-4);
  const brand = cardBrandOf(number);
  const existing = q.get<PaymentMethodRow>('SELECT * FROM payment_methods WHERE user_id = ? AND deleted_at IS NULL AND brand = ? AND last4 = ? AND exp_month = ? AND exp_year = ?', [userId, brand, last4, card.expMonth, card.expYear]);
  if (existing) throw new ApiError('CONFLICT', 'This card is already on file', { data: { paymentMethodId: existing.id } });
  const count = q.count('SELECT COUNT(*) FROM payment_methods WHERE user_id = ? AND deleted_at IS NULL', [userId]);
  const makeDefault = card.setDefault || count === 0;
  const row: PaymentMethodRow = {
    id: uid(),
    user_id: userId,
    provider: 'mock_stripe',
    provider_token: `pm_mock_${uid().replace(/-/g, '').slice(0, 24)}`,
    brand,
    last4,
    exp_month: card.expMonth,
    exp_year: card.expYear,
    is_default: makeDefault ? 1 : 0,
    created_at: nowIso(),
    deleted_at: null,
  };
  q.tx(() => {
    if (makeDefault) q.run('UPDATE payment_methods SET is_default = 0 WHERE user_id = ? AND deleted_at IS NULL', [userId]);
    q.insert('payment_methods', row as unknown as Record<string, string | number | null>);
    q.run('UPDATE users SET payment_verified_at = COALESCE(payment_verified_at, ?), updated_at = ? WHERE id = ?', [row.created_at, row.created_at, userId]);
  });
  recomputeTrust(userId, 'payment_method_added');
  return toPaymentMethodDto(row);
}

export function setDefaultPaymentMethod(userId: string, id: string): PaymentMethod {
  const row = q.get<PaymentMethodRow>('SELECT * FROM payment_methods WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [id, userId]);
  if (!row) throw new ApiError('NOT_FOUND', 'Payment method not found');
  q.tx(() => {
    q.run('UPDATE payment_methods SET is_default = 0 WHERE user_id = ? AND deleted_at IS NULL', [userId]);
    q.run('UPDATE payment_methods SET is_default = 1 WHERE id = ?', [id]);
  });
  return toPaymentMethodDto({ ...row, is_default: 1 });
}

export function removePaymentMethod(userId: string, id: string): PaymentMethod {
  const row = q.get<PaymentMethodRow>('SELECT * FROM payment_methods WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [id, userId]);
  if (!row) throw new ApiError('NOT_FOUND', 'Payment method not found');
  const t = nowIso();
  q.tx(() => {
    q.run('UPDATE payment_methods SET deleted_at = ?, is_default = 0 WHERE id = ?', [t, id]);
    const left = q.get<{ id: string }>('SELECT id FROM payment_methods WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1', [userId]);
    if (left) q.run('UPDATE payment_methods SET is_default = 1 WHERE id = ?', [left.id]);
    else q.run('UPDATE users SET payment_verified_at = NULL, updated_at = ? WHERE id = ?', [t, userId]);
  });
  recomputeTrust(userId, 'payment_method_removed');
  return toPaymentMethodDto({ ...row, deleted_at: t });
}

// ---------------------------------------------------------------- status payload (GET /api/verify/status)
export type VerifyStatus = {
  trustLevel: number;
  steps: {
    edu: { done: boolean; email: string | null; at: string | null; campusId: string | null };
    id: { done: boolean; at: string | null; type: VerificationRequest['type'] | null; request?: VerificationRequest };
    phone: { done: boolean; phone: string | null; maskedPhone: string | null; at: string | null };
    payment: { done: boolean; at: string | null; method?: PaymentMethod; methods: PaymentMethod[] };
  };
  nextStep: 'edu' | 'id' | 'phone' | 'payment' | null;
  badges: ReturnType<typeof badgesFor>;
  verifiedOnlyMessaging: boolean;
  openRequests: number;
};

export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return phone;
  return `${phone.slice(0, phone.length - digits.length + 1)}•••• ${digits.slice(-4)}`;
}

export function verificationStatus(user: AuthUser): VerifyStatus {
  const latest = latestRequest(user.id);
  const methods = listPaymentMethods(user.id);
  const idDone = !!user.id_verified_at || q.count("SELECT COUNT(*) FROM verification_requests WHERE user_id = ? AND status = 'approved'", [user.id]) > 0;
  return {
    trustLevel: user.trust_level,
    steps: {
      edu: { done: !!user.email_verified_at, email: user.edu_email, at: user.email_verified_at, campusId: user.campus_id },
      id: { done: idDone, at: user.id_verified_at, type: approvedIdType(user.id), ...(latest ? { request: toRequestDto(latest) } : {}) },
      phone: { done: !!user.phone_verified_at, phone: user.phone, maskedPhone: maskPhone(user.phone), at: user.phone_verified_at },
      payment: { done: !!user.payment_verified_at || methods.length > 0, at: user.payment_verified_at, ...(methods[0] ? { method: methods[0] } : {}), methods },
    },
    nextStep: nextTrustStep(user),
    badges: badgesFor(user),
    verifiedOnlyMessaging: user.verified_only_messaging === 1,
    openRequests: q.count("SELECT COUNT(*) FROM verification_requests WHERE user_id = ? AND status IN ('pending','in_review')", [user.id]),
  };
}

// ---------------------------------------------------------------- public trust profile (GET /api/verify/profile/:userId)
export function maskedEduDomain(eduEmail: string | null): string | null {
  if (!eduEmail || !eduEmail.includes('@')) return null;
  return eduEmail.split('@')[1] ?? null;
}

export function trustProfile(userId: string) {
  const row = q.get<{
    id: string; email_verified_at: string | null; edu_email: string | null; id_verified_at: string | null; phone_verified_at: string | null;
    payment_verified_at: string | null; created_at: string; banned: number; deleted_at: string | null; trust_level: number;
  }>('SELECT id, email_verified_at, edu_email, id_verified_at, phone_verified_at, payment_verified_at, created_at, banned, deleted_at, trust_level FROM users WHERE id = ?', [userId]);
  if (!row || row.deleted_at) throw new ApiError('NOT_FOUND', 'User not found');
  const user = loadUserPublic(userId, { withStats: true })!;
  const paymentOnFile = !!row.payment_verified_at || q.count('SELECT COUNT(*) FROM payment_methods WHERE user_id = ? AND deleted_at IS NULL', [userId]) > 0;
  const approvedAt = row.id_verified_at ?? q.get<{ reviewed_at: string | null }>("SELECT reviewed_at FROM verification_requests WHERE user_id = ? AND status = 'approved' ORDER BY reviewed_at DESC LIMIT 1", [userId])?.reviewed_at ?? null;
  return {
    user,
    suspended: row.banned === 1,
    trust: {
      level: row.banned === 1 ? 0 : row.trust_level,
      eduVerified: !!row.email_verified_at,
      eduDomain: row.email_verified_at ? maskedEduDomain(row.edu_email) : null,
      idVerified: !!approvedAt,
      idType: approvedIdType(userId),
      phoneVerified: !!row.phone_verified_at,
      paymentOnFile,
      memberSince: row.created_at,
      verifiedAt: { edu: row.email_verified_at, id: approvedAt, phone: row.phone_verified_at, payment: row.payment_verified_at },
    },
    stats: {
      listings: q.count("SELECT COUNT(*) FROM listings WHERE owner_id = ? AND status = 'active' AND moderation_status = 'ok'", [userId]),
      itemsSold: q.count("SELECT COUNT(*) FROM market_items WHERE seller_id = ? AND status = 'sold'", [userId]),
      buddyHosted: q.count("SELECT COUNT(*) FROM buddy_posts WHERE author_id = ? AND status <> 'removed'", [userId]),
      responseRate: user.responseRate ?? null,
      responseMedianMin: user.responseMedianMin ?? null,
    },
  };
}

/** Upload DTO for a request side, or undefined when the upload is missing. */
export function uploadDtoOrNull(id: string | null) {
  if (!id) return undefined;
  const up = getUpload(id);
  return up ? toUploadDto(up) : undefined;
}
