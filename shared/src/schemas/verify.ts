// shared/src/schemas/verify.ts — owned by the `verify` module agent.
// Zod input schemas for /api/verify/* (API.md §6). Re-exported from shared/src/index.ts as `verifySchemas`.
import { z } from 'zod';
import { VerificationStatus, VerificationType } from '../enums';
import { E164, EmailSchema, PaginationQuery, zCsv } from './common';

// ---------------------------------------------------------------- edu (aliases of /api/auth/*-edu-code)
export const EduRequestInput = z.object({ email: EmailSchema });
export type EduRequestInput = z.infer<typeof EduRequestInput>;

export const EduConfirmInput = z.object({ email: EmailSchema, code: z.string().trim().length(6) });
export type EduConfirmInput = z.infer<typeof EduConfirmInput>;

// ---------------------------------------------------------------- student / government ID
export const IdRequestInput = z.object({
  type: z.enum(VerificationType),
  frontUploadId: z.string().min(1).max(128),
  backUploadId: z.string().min(1).max(128).optional(),
  selfieUploadId: z.string().min(1).max(128).optional(),
  fullName: z.string().trim().min(2).max(80),
  docNumberLast4: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4}$/, 'last 4 characters of the document number')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  campusId: z.string().max(64).optional(),
});
export type IdRequestInput = z.infer<typeof IdRequestInput>;

// ---------------------------------------------------------------- phone (mock SMS)
export const PhoneRequestInput = z.object({ phone: E164 });
export type PhoneRequestInput = z.infer<typeof PhoneRequestInput>;

export const PhoneConfirmInput = z.object({ code: z.string().trim().regex(/^\d{6}$/, '6-digit code expected') });
export type PhoneConfirmInput = z.infer<typeof PhoneConfirmInput>;

// ---------------------------------------------------------------- payment method on file (mock card, test mode)
/** Mock card — never a real charge. 4242 4242 4242 4242 succeeds; a number ending in 0002 is declined (PAYMENT_FAILED). */
export const PaymentMethodInput = z.object({
  cardNumber: z
    .string()
    .transform((s) => s.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^\d{13,19}$/, '13–19 digits expected')),
  expMonth: z.coerce.number().int().min(1).max(12),
  expYear: z.coerce.number().int().min(2024).max(2060),
  cvc: z.string().trim().regex(/^\d{3,4}$/, '3–4 digits expected'),
  holderName: z.string().trim().min(2).max(80),
  setDefault: z.boolean().optional(),
});
export type PaymentMethodInput = z.infer<typeof PaymentMethodInput>;

export const CARD_BRANDS = ['visa', 'mastercard', 'amex', 'unionpay', 'discover'] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

/** Brand from the leading digits (mock BIN rules). */
export function cardBrandOf(number: string): CardBrand {
  const n = number.replace(/\D/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^62/.test(n)) return 'unionpay';
  if (/^6(011|5)/.test(n)) return 'discover';
  return 'visa';
}

/** Luhn check used by the mock gateway (and by the web form before submit). */
export function luhnValid(number: string): boolean {
  const n = number.replace(/\D/g, '');
  if (n.length < 13) return false;
  let sum = 0;
  let dbl = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

// ---------------------------------------------------------------- admin review
export const REJECT_REASON_CODES = ['blurry', 'cropped', 'name_mismatch', 'expired', 'not_accepted_doc', 'suspected_edit', 'wrong_side', 'other'] as const;
export type RejectReasonCode = (typeof REJECT_REASON_CODES)[number];

export const AdminQueueQuery = PaginationQuery.extend({
  status: zCsv.pipe(z.array(z.enum(VerificationStatus))).optional(),
  type: zCsv.pipe(z.array(z.enum(VerificationType))).optional(),
  campusId: z.string().max(64).optional(),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(['oldest', 'newest']).default('oldest'),
});
export type AdminQueueQuery = z.infer<typeof AdminQueueQuery>;

export const ApproveInput = z.object({ note: z.string().trim().max(500).optional() });
export type ApproveInput = z.infer<typeof ApproveInput>;

export const RejectInput = z.object({
  reason: z.string().trim().min(3).max(500),
  code: z.enum(REJECT_REASON_CODES).optional(),
  note: z.string().trim().max(500).optional(),
});
export type RejectInput = z.infer<typeof RejectInput>;

export const TrustOverrideInput = z.object({
  trustLevel: z.coerce.number().int().min(0).max(3),
  reason: z.string().trim().min(3).max(500),
});
export type TrustOverrideInput = z.infer<typeof TrustOverrideInput>;

export const DocumentSide = z.enum(['front', 'back', 'selfie']);
export type DocumentSide = z.infer<typeof DocumentSide>;

export const AuditQuery = PaginationQuery.extend({ pageSize: z.coerce.number().int().min(1).max(50).default(20) });
export type AuditQuery = z.infer<typeof AuditQuery>;
