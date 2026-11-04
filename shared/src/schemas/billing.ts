// shared/src/schemas/billing.ts — owned by the `billing` module agent. Zod input schemas for /api/billing (API.md §11,
// docs/modules/billing-requirements.md). Re-exported from shared/src/index.ts as `billingSchemas`.
import { z } from 'zod';
import { DateYmd, PaginationQuery, zBool, zCsv } from './common';

export const BoostEntity = z.enum(['listing', 'market_item', 'buddy_post']);
export type BoostEntity = z.infer<typeof BoostEntity>;

export const PlansQuery = z.object({
  kind: z.enum(['boost', 'subscription', 'escrow_fee', 'service']).optional(),
  entityType: BoostEntity.optional(),
});

export const WalletQuery = PaginationQuery.extend({ kind: z.string().max(40).optional() });

const cardNumber = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\d{13,19}$/, 'Card number must be 13–19 digits'));

export const CardInput = z.object({
  cardNumber,
  expMonth: z.coerce.number().int().min(1).max(12),
  expYear: z.coerce.number().int().min(2024).max(2060),
  cvc: z.string().regex(/^\d{3,4}$/, '3 or 4 digits'),
  name: z.string().trim().max(80).optional(),
  save: z.boolean().optional(),
});
export type CardInput = z.infer<typeof CardInput>;

export const PaymentMethodInput = CardInput.omit({ save: true }).extend({ setDefault: z.boolean().optional() });
export type PaymentMethodInput = z.infer<typeof PaymentMethodInput>;

export const PromoValidateInput = z.object({
  code: z.string().trim().min(3).max(24),
  orderKind: z.enum(['boost', 'subscription', 'escrow_deposit']).optional(),
  planId: z.string().max(128).optional(),
  subtotalCents: z.coerce.number().int().min(0).optional(),
});
export type PromoValidateInput = z.infer<typeof PromoValidateInput>;

export const PromoRedeemInput = z.object({ code: z.string().trim().min(3).max(24) });

export const OrderInput = z.object({
  kind: z.enum(['boost', 'subscription', 'escrow_deposit']),
  planId: z.string().max(128).optional(),
  entityType: BoostEntity.optional(),
  entityId: z.string().max(128).optional(),
  escrowId: z.string().max(128).optional(),
  addons: z.array(z.string().max(64)).max(3).optional(),
  promoCode: z.string().trim().max(24).optional(),
  useWallet: z.boolean().optional(),
  surface: z.enum(['publish_upsell', 'owner_panel', 'detail', 'pricing', 'pro', 'escrow']).optional(),
  trial: z.boolean().optional(),
});
export type OrderInput = z.infer<typeof OrderInput>;

export const PayInput = z.union([
  z.object({ paymentMethodId: z.string().min(1).max(128), useWallet: z.boolean().optional() }),
  z.object({ card: CardInput, useWallet: z.boolean().optional() }),
]);
export type PayInput = z.infer<typeof PayInput>;

export const OrdersQuery = PaginationQuery.extend({
  kind: z.enum(['boost', 'subscription', 'subscription_renewal', 'escrow_deposit', 'wallet_topup']).optional(),
  status: z.enum(['pending', 'awaiting_payment', 'paid', 'fulfilled', 'cancelled', 'failed', 'refunded']).optional(),
});

export const WebhookInput = z.object({
  type: z.enum(['payment_intent.succeeded', 'payment_intent.payment_failed']),
  intentId: z.string().min(1).max(128),
  failureCode: z.string().max(40).optional(),
});

export const BoostsQuery = PaginationQuery.extend({
  status: z.enum(['scheduled', 'active', 'expired', 'cancelled', 'refunded', 'ended']).optional(),
});
export const BoostOptionsQuery = z.object({
  entityType: BoostEntity,
  entityId: z.string().min(1).max(128),
  surface: z.enum(['publish_upsell', 'owner_panel', 'detail', 'pricing']).optional(),
});
export const SponsoredQuery = z.object({
  entityType: BoostEntity,
  campusId: z.string().max(64).optional(),
  city: z.string().max(80).optional(),
  state: z.string().length(2).optional(),
  limit: z.coerce.number().int().min(1).max(6).default(6),
  tier: z.enum(['max']).optional(),
});

export const SubscribeInput = z.object({
  planId: z.string().min(1).max(128),
  paymentMethodId: z.string().max(128).optional(),
  trial: z.boolean().optional(),
  promoCode: z.string().trim().max(24).optional(),
});
export type SubscribeInput = z.infer<typeof SubscribeInput>;
export const CancelSubscriptionInput = z.object({ immediately: z.boolean().optional() });
export const ChangePlanInput = z.object({ planId: z.string().min(1).max(128) });
export const ProAnalyticsQuery = z.object({ days: z.coerce.number().int().refine((d) => [7, 30, 90].includes(d), '7, 30 or 90').default(30) });
export const ProLeadsQuery = PaginationQuery.extend({
  status: z.enum(['new', 'replied', 'qualified', 'closed', 'spam']).optional(),
  listingId: z.string().max(128).optional(),
});
export const LeadPatch = z.object({ status: z.enum(['new', 'replied', 'qualified', 'closed', 'spam']) });

export const EscrowRail = z.enum(['ach', 'card', 'alipay', 'wechat_pay']);
export type EscrowRail = z.infer<typeof EscrowRail>;
export const FeePayer = z.enum(['payer', 'payee', 'split']);

export const EscrowQuoteQuery = z.object({
  amountCents: z.coerce.number().int().min(10000).max(1000000),
  feePayer: FeePayer.default('payer'),
  rail: EscrowRail.default('ach'),
});
export const EscrowInput = z.object({
  listingId: z.string().min(1).max(128),
  counterpartyId: z.string().min(1).max(128),
  role: z.enum(['payer', 'payee']),
  amountCents: z.coerce.number().int().min(10000).max(1000000),
  feePayer: FeePayer.default('payer'),
  rail: EscrowRail.default('ach'),
  moveInDate: DateYmd,
  inspectionHours: z.coerce.number().int().min(24).max(168).default(48),
  note: z.string().trim().max(500).optional(),
});
export type EscrowInput = z.infer<typeof EscrowInput>;
export const EscrowsQuery = PaginationQuery.extend({
  role: z.enum(['payer', 'payee']).optional(),
  status: z.string().max(40).optional(),
});
export const EscrowFundInput = z.union([
  z.object({ paymentMethodId: z.string().min(1).max(128), rail: EscrowRail.optional() }),
  z.object({ card: CardInput, rail: EscrowRail.optional() }),
]);
export const EscrowNoteInput = z.object({ note: z.string().trim().max(500).optional() });
export const EscrowCancelInput = z.object({ reason: z.string().trim().max(500).optional() });
export const DisputeReasonCode = z.enum(['fraud_listing', 'not_on_lease', 'not_as_described', 'no_access', 'other']);
export const EscrowDisputeInput = z.object({
  reasonCode: DisputeReasonCode.default('other'),
  reason: z.string().trim().min(10).max(2000),
  evidenceUploadIds: z.array(z.string().max(128)).max(10).optional(),
});
export type EscrowDisputeInput = z.infer<typeof EscrowDisputeInput>;
export const EscrowResolveInput = z.object({
  resolution: z.enum(['release_to_payee', 'refund_to_payer', 'split']),
  payeeCents: z.coerce.number().int().min(0).optional(),
  payerCents: z.coerce.number().int().min(0).optional(),
  reasonCode: z.enum(['fraud', 'not_on_lease', 'not_as_described', 'tenant_fault', 'mutual', 'other']).optional(),
  note: z.string().trim().min(3).max(2000),
});
export type EscrowResolveInput = z.infer<typeof EscrowResolveInput>;
export const EscrowEligibilityQuery = z.object({ listingId: z.string().min(1).max(128) });

export const PartnersQuery = z.object({
  category: zCsv.optional(),
  campusId: z.string().max(64).optional(),
  state: z.string().length(2).optional(),
  stage: z.enum(['pre_arrival', 'arrival', 'settled']).optional(),
});
export const PartnerGoQuery = z.object({
  placement: z.enum(['kit', 'home', 'listing_detail', 'onboarding', 'chat_card', 'banner', 'other']).default('kit'),
  campusId: z.string().max(64).optional(),
});
export const PartnerConvertedInput = z.object({ clickId: z.string().min(1).max(128), payoutCents: z.coerce.number().int().min(0).max(100000).optional() });
export const KitDoneInput = z.object({ slug: z.string().min(1).max(80), done: z.boolean().default(true) });

export const SponsorLeadInput = z.object({
  businessName: z.string().trim().min(2).max(120),
  contact: z.string().trim().min(3).max(200),
  campusId: z.string().max(64).optional(),
  interest: z.enum(['sponsor', 'building']).default('sponsor'),
  note: z.string().trim().max(1000).optional(),
});
export type SponsorLeadInput = z.infer<typeof SponsorLeadInput>;

// ---------------------------------------------------------------- admin
export const RevenueQuery = z.object({
  from: DateYmd.optional(),
  to: DateYmd.optional(),
  campusId: z.string().max(64).optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
});
export const AdminOrdersQuery = PaginationQuery.extend({
  q: z.string().trim().max(80).optional(),
  kind: z.string().max(40).optional(),
  status: z.string().max(40).optional(),
  userId: z.string().max(128).optional(),
  campusId: z.string().max(64).optional(),
  from: DateYmd.optional(),
  to: DateYmd.optional(),
});
export const AdminRefundInput = z.object({ amountCents: z.coerce.number().int().min(1).optional(), reason: z.string().trim().min(3).max(500) });
export const AdminEscrowsQuery = PaginationQuery.extend({ status: z.string().max(40).optional() });
export const PlanPatch = z.object({
  priceCents: z.coerce.number().int().min(0).optional(),
  isActive: zBool.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  nameZh: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  descriptionZh: z.string().trim().max(500).optional(),
  sortOrder: z.coerce.number().int().optional(),
  reason: z.string().trim().min(3).max(300),
});
export const PromoCodeInput = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/),
  kind: z.enum(['percent_off', 'fixed_off', 'wallet_credit']),
  value: z.coerce.number().int().min(1),
  appliesTo: z.array(z.string().max(64)).optional(),
  campusId: z.string().max(64).nullable().optional(),
  maxRedemptions: z.coerce.number().int().min(1).nullable().optional(),
  perUserLimit: z.coerce.number().int().min(1).optional(),
  minOrderCents: z.coerce.number().int().min(0).optional(),
  startsAt: z.string().max(40).nullable().optional(),
  endsAt: z.string().max(40).nullable().optional(),
  isActive: zBool.optional(),
});
export const PromoCodePatch = PromoCodeInput.partial();
export const PartnerInput = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{2,80}$/),
  name: z.string().trim().min(1).max(120),
  nameZh: z.string().trim().max(120).nullable().optional(),
  category: z.enum(['bank', 'sim', 'insurance', 'movers', 'storage', 'airport_pickup', 'furniture', 'housing', 'food', 'other']),
  tagline: z.string().trim().max(200).nullable().optional(),
  taglineZh: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  descriptionZh: z.string().trim().max(2000).nullable().optional(),
  logoUploadId: z.string().max(128).nullable().optional(),
  websiteUrl: z.string().url().max(500),
  affiliateUrl: z.string().url().max(800),
  promoText: z.string().trim().max(200).nullable().optional(),
  promoTextZh: z.string().trim().max(200).nullable().optional(),
  payoutModel: z.enum(['cpc', 'cpa', 'flat', 'rev_share']).optional(),
  payoutCents: z.coerce.number().int().min(0).optional(),
  campusId: z.string().max(64).nullable().optional(),
  states: z.array(z.string().length(2)).optional(),
  isSponsored: zBool.optional(),
  isActive: zBool.optional(),
  sortOrder: z.coerce.number().int().optional(),
  network: z.string().max(40).nullable().optional(),
  noSsnOk: zBool.optional(),
  reason: z.string().trim().max(300).optional(),
});
export const PartnerPatch = PartnerInput.partial();
export const PartnerClicksQuery = z.object({ from: DateYmd.optional(), to: DateYmd.optional(), groupBy: z.enum(['day', 'week']).default('day') });
export const WalletAdjustInput = z.object({ deltaCents: z.coerce.number().int().refine((n) => n !== 0, 'non-zero'), note: z.string().trim().min(3).max(300) });

export const TEST_CARDS = {
  success: '4242424242424242',
  declined: '4000000000000002',
  insufficientFunds: '4000000000009995',
} as const;
