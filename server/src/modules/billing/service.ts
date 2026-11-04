// server/src/modules/billing/service.ts — OWNED BY THE `billing` MODULE AGENT. Consumed by listings/market/buddy/admin.
// Plans · wallet ledger · promo codes · orders + mock Stripe fulfilment · boosts (+ placement) · Landlord Pro ·
// Secure Payment (table `escrows`) · referrals · Newcomer Kit partners · admin revenue. Rules: docs/modules/billing-requirements.md.
import type { Request } from 'express';
import type { Boost, BuddyCard, Escrow, EscrowEvent, ItemCard, LedgerEntry, ListingCard, Order, Partner, Payment, PaymentMethod, Plan, PromoCode, Subscription, UserPublic } from '@shared/types';
import type { BoostEntity, EscrowRail } from '@shared/schemas/billing';
import { q, uid, parseJson, placeholders } from '../../db';
import { ApiError, invalidState, notFound } from '../../lib/errors';
import { logEvent } from '../../lib/events';
import { flagValue, isEnabled } from '../../lib/flags';
import { hooks } from '../../lib/hooks';
import { notify } from '../../lib/notify';
import { DAY, HOUR, nowIso, nowMs } from '../../lib/time';
import { loadUsersPublic, loadUserPublic } from '../../lib/users';
import { buddyCards, itemCards, listingCards, type BuddyCardRow, type ItemCardRow, type ListingCardRow } from '../../lib/cards';
import { recordClick, recordImpressions, sponsoredSlotCount, mergeSponsored, type PickSponsoredInput, type SponsoredPick } from '../../lib/sponsored';
import { contextCardFor, isBlockedEither, postContextCard, postSystemMessage, openConversation as openRawConversation } from '../../lib/conversations';
import { getCampus } from '../../lib/campuses';
import { hasSupplyProof } from '../verify/service';
import { recomputeTrust } from '../../lib/trust';
import type { AuthUser } from '../../lib/types';
import { mockStripe, type CardLike } from './mockStripe';
import { logger } from '../../lib/logger';

export { recordImpressions, recordClick, mergeSponsored, sponsoredSlotCount };

// ====================================================================== row types
export type PlanRow = {
  id: string; kind: Plan['kind']; key: string; name: string; name_zh: string | null; description: string | null; description_zh: string | null;
  entity_type: Plan['entityType']; tier: Plan['tier']; duration_days: number | null; interval: Plan['interval']; price_cents: number;
  fee_bps: number | null; fee_min_cents: number | null; features_json: string; is_active: number; sort_order: number;
  fee_cap_cents: number | null; min_trust: number; requires_badge: string | null; addon_for: string | null; self_serve: number;
};
export type OrderRow = {
  id: string; user_id: string; campus_id: string | null; kind: Order['kind']; plan_id: string | null; entity_type: string | null; entity_id: string | null;
  status: Order['status']; currency: string; subtotal_cents: number; discount_cents: number; credit_cents: number; fee_cents: number; total_cents: number;
  promo_code_id: string | null; payment_id: string | null; metadata_json: string; paid_at: string | null; fulfilled_at: string | null; cancelled_at: string | null;
  created_at: string; updated_at: string;
};
export type PaymentRow = {
  id: string; order_id: string; user_id: string; provider: Payment['provider']; provider_intent_id: string | null; provider_charge_id: string | null;
  client_secret: string | null; status: Payment['status']; amount_cents: number; refunded_cents: number; currency: string; payment_method_id: string | null;
  method_brand: string | null; method_last4: string | null; failure_code: string | null; failure_message: string | null; raw_json: string;
  succeeded_at: string | null; created_at: string; updated_at: string;
};
export type BoostRow = {
  id: string; user_id: string; campus_id: string | null; entity_type: BoostEntity; entity_id: string; plan_id: string | null; order_id: string | null;
  tier: Boost['tier']; starts_at: string; ends_at: string; status: Boost['status']; impressions: number; clicks: number; nationwide: number; paused_at: string | null;
  price_cents?: number | null;
  created_at: string; updated_at: string;
};
export type SubscriptionRow = {
  id: string; user_id: string; plan_id: string; status: Subscription['status']; current_period_start: string; current_period_end: string;
  cancel_at_period_end: number; cancelled_at: string | null; trial_ends_at: string | null; last_order_id: string | null; payment_method_id: string | null;
  pending_plan_id?: string | null; plan_changed_at?: string | null;
  created_at: string; updated_at: string;
};
export type EscrowRow = {
  id: string; listing_id: string; campus_id: string | null; conversation_id: string | null; payer_id: string; payee_id: string; amount_cents: number;
  fee_bps: number; fee_cents: number; fee_payer: Escrow['feePayer']; status: Escrow['status']; order_id: string | null; move_in_date: string | null;
  inspection_hours: number; inspection_deadline_at: string | null; funded_at: string | null; released_at: string | null; refunded_at: string | null;
  disputed_at: string | null; dispute_reason: string | null; resolution: Escrow['resolution']; resolution_payee_cents: number | null; resolution_payer_cents: number | null;
  resolved_by: string | null; resolved_at: string | null; expires_at: string | null; created_by: string | null; created_at: string; updated_at: string;
  rail: EscrowRail; card_fee_cents: number; dispute_reason_code: string | null;
};
export type LedgerRow = {
  id: string; user_id: string; delta_cents: number; balance_after_cents: number; kind: LedgerEntry['kind']; ref_type: string | null; ref_id: string | null;
  note: string | null; expires_at: string | null; created_by: string | null; created_at: string;
};
export type PromoRow = {
  id: string; code: string; kind: PromoCode['kind']; value: number; applies_to_json: string; campus_id: string | null; max_redemptions: number | null;
  redeemed_count: number; per_user_limit: number; min_order_cents: number; starts_at: string | null; ends_at: string | null; is_active: number;
  created_by: string | null; created_at: string;
};
export type PartnerRow = {
  id: string; slug: string; name: string; name_zh: string | null; category: Partner['category']; tagline: string | null; tagline_zh: string | null;
  description: string | null; description_zh: string | null; logo_upload_id: string | null; website_url: string; affiliate_url: string; promo_text: string | null;
  promo_text_zh: string | null; payout_model: string; payout_cents: number; campus_id: string | null; states_json: string; is_sponsored: number; is_active: number;
  sort_order: number; click_count: number; created_at: string; updated_at: string; network: string | null; no_ssn_ok: number; no_ssn_verified_at: string | null;
  rubric_json: string; payout_note: string | null; logo_url?: string | null;
};
export type PaymentMethodRow = { id: string; user_id: string; provider_token: string; brand: string; last4: string; exp_month: number; exp_year: number; is_default: number; deleted_at: string | null };

export type PlanDto = Plan & { feeCapCents: number | null; minTrust: number; requiresBadge: string | null; addonFor: string | null; selfServe: boolean };
export type OrderDto = Order & { userId: string; campusId: string | null; addons: PlanDto[]; promoCode?: string; payments?: Payment[] };

// ====================================================================== plans
export function toPlanDto(r: PlanRow): PlanDto {
  return {
    id: r.id, kind: r.kind, key: r.key, name: r.name, nameZh: r.name_zh, description: r.description, descriptionZh: r.description_zh, entityType: r.entity_type,
    tier: r.tier, durationDays: r.duration_days, interval: r.interval, priceCents: r.price_cents, feeBps: r.fee_bps, feeMinCents: r.fee_min_cents,
    features: parseJson<string[]>(r.features_json, []), isActive: r.is_active === 1, sortOrder: r.sort_order,
    feeCapCents: r.fee_cap_cents ?? null, minTrust: r.min_trust ?? 1, requiresBadge: r.requires_badge ?? null, addonFor: r.addon_for ?? null, selfServe: (r.self_serve ?? 1) === 1,
  };
}
export function loadPlan(idOrKey: string): PlanRow | undefined {
  return q.get<PlanRow>('SELECT * FROM pricing_plans WHERE id = ? OR key = ?', [idOrKey, idOrKey]);
}
export function requirePlan(idOrKey: string): PlanRow {
  const p = loadPlan(idOrKey);
  if (!p) throw notFound('Plan');
  return p;
}
export function activePlans(filter: { kind?: string; entityType?: string; selfServe?: boolean } = {}): PlanDto[] {
  const where: string[] = ['is_active = 1'];
  const params: (string | number)[] = [];
  if (filter.kind) { where.push('kind = ?'); params.push(filter.kind); }
  if (filter.entityType) { where.push('entity_type = ?'); params.push(filter.entityType); }
  if (filter.selfServe) where.push('self_serve = 1');
  return q.all<PlanRow>(`SELECT * FROM pricing_plans WHERE ${where.join(' AND ')} ORDER BY sort_order, price_cents`, params).map(toPlanDto);
}
export function escrowPlan(): PlanRow | undefined {
  return q.get<PlanRow>("SELECT * FROM pricing_plans WHERE key = 'escrow.standard'");
}

// ====================================================================== wallet
export function walletBalance(userId: string): number {
  return q.get<{ b: number }>('SELECT wallet_balance_cents AS b FROM users WHERE id = ?', [userId])?.b ?? 0;
}
export function toLedgerDto(r: LedgerRow): LedgerEntry {
  return { id: r.id, deltaCents: r.delta_cents, balanceAfterCents: r.balance_after_cents, kind: r.kind, refType: r.ref_type, refId: r.ref_id, note: r.note, expiresAt: r.expires_at, createdAt: r.created_at };
}
export type LedgerInput = { refType?: string | null; refId?: string | null; note?: string | null; expiresAt?: string | null; createdBy?: string | null; req?: Request | null };
/** Appends a ledger row inside a transaction and returns it (balance_after computed here; users cache via trigger). */
export function ledgerAppend(userId: string, deltaCents: number, kind: LedgerEntry['kind'], input: LedgerInput = {}): LedgerRow {
  return q.tx(() => {
    const balance = walletBalance(userId);
    const after = balance + deltaCents;
    if (after < 0) throw new ApiError('INSUFFICIENT_FUNDS', 'Wallet balance too low', { data: { balanceCents: balance, neededCents: -deltaCents } });
    const row: LedgerRow = {
      id: uid(), user_id: userId, delta_cents: deltaCents, balance_after_cents: after, kind, ref_type: input.refType ?? null, ref_id: input.refId ?? null,
      note: input.note ?? null, expires_at: input.expiresAt ?? null, created_by: input.createdBy ?? null, created_at: nowIso(),
    };
    q.insert('wallet_ledger', row as unknown as Record<string, string | number | null>);
    logEvent(input.req ?? null, deltaCents >= 0 ? 'wallet.credit' : 'wallet.debit', { userId, entityType: 'wallet_ledger', entityId: row.id, props: { kind, deltaCents, note: row.note } });
    return row;
  });
}
export function expiringSoon(userId: string, days = 14): { cents: number; at: string | null } {
  const until = new Date(nowMs() + days * DAY).toISOString();
  const r = q.get<{ c: number | null; at: string | null }>('SELECT COALESCE(SUM(delta_cents), 0) AS c, MIN(expires_at) AS at FROM wallet_ledger WHERE user_id = ? AND delta_cents > 0 AND expires_at IS NOT NULL AND expires_at > ? AND expires_at <= ?', [userId, nowIso(), until]);
  const balance = walletBalance(userId);
  return { cents: Math.min(balance, r?.c ?? 0), at: r?.at ?? null };
}
/** Nightly: credits past `expires_at` that are still unspent (FIFO) become negative `expiry` rows. */
export function expireWalletCredits(): number {
  const t = nowIso();
  const rows = q.all<LedgerRow>("SELECT * FROM wallet_ledger WHERE delta_cents > 0 AND expires_at IS NOT NULL AND expires_at <= ? AND NOT EXISTS (SELECT 1 FROM wallet_ledger x WHERE x.kind = 'expiry' AND x.ref_type = 'ledger' AND x.ref_id = wallet_ledger.id) ORDER BY expires_at ASC", [t]);
  let n = 0;
  for (const r of rows) {
    const balance = walletBalance(r.user_id);
    const spentSince = q.get<{ s: number | null }>('SELECT COALESCE(SUM(-delta_cents), 0) AS s FROM wallet_ledger WHERE user_id = ? AND delta_cents < 0 AND created_at > ?', [r.user_id, r.created_at])?.s ?? 0;
    const unspent = Math.max(0, Math.min(balance, r.delta_cents - spentSince));
    // always record the expiry (0 when fully spent) so the row is not re-processed
    ledgerAppend(r.user_id, -unspent, 'expiry', { refType: 'ledger', refId: r.id, note: 'credit_expired' });
    if (unspent > 0) n++;
  }
  return n;
}

// ====================================================================== promo codes
export type PromoReason = 'expired' | 'exhausted' | 'not_applicable' | 'campus_mismatch' | 'already_used' | 'min_order' | 'unknown' | 'not_started';
export function promoError(reason: PromoReason): ApiError {
  return new ApiError('PROMO_INVALID', `Promo code ${reason}`, { data: { reason } });
}
export function toPromoDto(r: PromoRow): PromoCode {
  return {
    id: r.id, code: r.code, kind: r.kind, value: r.value, appliesTo: parseJson<string[]>(r.applies_to_json, []), campusId: r.campus_id, maxRedemptions: r.max_redemptions,
    redeemedCount: r.redeemed_count, perUserLimit: r.per_user_limit, minOrderCents: r.min_order_cents, startsAt: r.starts_at, endsAt: r.ends_at, isActive: r.is_active === 1, createdAt: r.created_at,
  };
}
export function findPromo(code: string): PromoRow | undefined {
  return q.get<PromoRow>('SELECT * FROM promo_codes WHERE code = ?', [code.trim().toUpperCase()]);
}
/** Validates a code for a user + context. `target` = plan key(s) / kinds the order touches. Returns the discount in cents (0 for wallet_credit codes). */
export function validatePromo(user: AuthUser, code: string, ctx: { orderKind?: string; planKeys?: string[]; subtotalCents?: number; campusId?: string | null; forWallet?: boolean }): { promo: PromoRow; discountCents: number } {
  const p = findPromo(code);
  if (!p || p.is_active !== 1) throw promoError('unknown');
  const t = nowIso();
  if (p.starts_at && p.starts_at > t) throw promoError('not_started');
  if (p.ends_at && p.ends_at < t) throw promoError('expired');
  if (p.max_redemptions !== null && p.redeemed_count >= p.max_redemptions) throw promoError('exhausted');
  const used = q.count('SELECT COUNT(*) FROM promo_redemptions WHERE promo_code_id = ? AND user_id = ?', [p.id, user.id]);
  if (used >= p.per_user_limit) throw promoError('already_used');
  const campusId = ctx.campusId ?? user.campus_id;
  if (p.campus_id && p.campus_id !== campusId) throw promoError('campus_mismatch');
  const applies = parseJson<string[]>(p.applies_to_json, []);
  if (ctx.forWallet) {
    if (p.kind !== 'wallet_credit') throw promoError('not_applicable');
    return { promo: p, discountCents: 0 };
  }
  if (p.kind === 'wallet_credit') throw promoError('not_applicable');
  if (ctx.orderKind === 'escrow_deposit' && !applies.includes('escrow.standard')) throw promoError('not_applicable');
  if (applies.length) {
    const keys = ctx.planKeys ?? [];
    const kind = ctx.orderKind ?? '';
    const match = applies.some((a) => a === kind || keys.includes(a) || keys.some((k) => a.endsWith('*') && k.startsWith(a.slice(0, -1))));
    if (!match) throw promoError('not_applicable');
  }
  const subtotal = ctx.subtotalCents ?? 0;
  if (subtotal < p.min_order_cents) throw promoError('min_order');
  const discount = p.kind === 'percent_off' ? Math.round((subtotal * Math.min(100, p.value)) / 100) : Math.min(subtotal, p.value);
  return { promo: p, discountCents: discount };
}
export function redeemWalletPromo(user: AuthUser, code: string, req: Request | null): { creditedCents: number; balanceCents: number } {
  const { promo } = validatePromo(user, code, { forWallet: true });
  const applies = parseJson<string[]>(promo.applies_to_json, []);
  // ignition codes require at least one active sublet at that campus
  if (promo.code.startsWith('IGNITE-') && applies.includes('boost')) {
    const active = q.count("SELECT COUNT(*) FROM listings WHERE owner_id = ? AND status = 'active' AND campus_id = ?", [user.id, promo.campus_id ?? user.campus_id ?? '']);
    if (active === 0) throw promoError('not_applicable');
  }
  return q.tx(() => {
    const row = ledgerAppend(user.id, promo.value, 'promo_credit', { refType: 'promo_code', refId: promo.id, note: promo.code, expiresAt: new Date(nowMs() + 180 * DAY).toISOString(), req });
    q.run('INSERT INTO promo_redemptions (id, promo_code_id, user_id, order_id, amount_cents, created_at) VALUES (?, ?, ?, NULL, ?, ?)', [uid(), promo.id, user.id, promo.value, nowIso()]);
    logEvent(req, 'promo.apply', { entityType: 'promo_code', entityId: promo.id, props: { code: promo.code, ok: true, wallet: true } });
    return { creditedCents: promo.value, balanceCents: row.balance_after_cents };
  });
}

// ====================================================================== payment methods
export function listPaymentMethods(userId: string): PaymentMethod[] {
  return q.all<PaymentMethodRow>('SELECT * FROM payment_methods WHERE user_id = ? AND deleted_at IS NULL ORDER BY is_default DESC, created_at DESC', [userId]).map(toPaymentMethodDto);
}
export function toPaymentMethodDto(r: PaymentMethodRow): PaymentMethod {
  return { id: r.id, brand: r.brand, last4: r.last4, expMonth: r.exp_month, expYear: r.exp_year, isDefault: r.is_default === 1 };
}
export function savePaymentMethod(userId: string, card: CardLike, opts: { setDefault?: boolean } = {}): PaymentMethodRow {
  const probe = mockStripe.confirm(card);
  if (!probe.ok) throw new ApiError('PAYMENT_FAILED', probe.message, { data: { failureCode: probe.failureCode } });
  const existing = q.count('SELECT COUNT(*) FROM payment_methods WHERE user_id = ? AND deleted_at IS NULL', [userId]);
  const row: PaymentMethodRow = { id: uid(), user_id: userId, provider_token: mockStripe.tokenize(card), brand: probe.brand, last4: probe.last4, exp_month: card.expMonth, exp_year: card.expYear, is_default: opts.setDefault || existing === 0 ? 1 : 0, deleted_at: null };
  q.tx(() => {
    if (row.is_default) q.run('UPDATE payment_methods SET is_default = 0 WHERE user_id = ?', [userId]);
    q.run('INSERT INTO payment_methods (id, user_id, provider, provider_token, brand, last4, exp_month, exp_year, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [row.id, userId, 'mock_stripe', row.provider_token, row.brand, row.last4, row.exp_month, row.exp_year, row.is_default, nowIso()]);
    q.run('UPDATE users SET payment_verified_at = COALESCE(payment_verified_at, ?), updated_at = ? WHERE id = ?', [nowIso(), nowIso(), userId]);
  });
  // a card saved during checkout counts toward trust level 3 just like one added in the verification center
  recomputeTrust(userId, 'payment_method_added');
  return row;
}

// ====================================================================== entities (boost targets)
export type EntityInfo = { type: BoostEntity; id: string; ownerId: string; campusId: string; status: string; moderationStatus: string; title: string; city: string | null; state: string | null; text: string; viewCount: number; sharedLiving: boolean };
export function loadEntity(type: BoostEntity, id: string): EntityInfo | null {
  if (type === 'listing') {
    const r = q.get<{ id: string; owner_id: string; campus_id: string; status: string; moderation_status: string; title: string; city: string; state: string; description: string; view_count: number; roommates_count: number; property_type: string }>('SELECT id, owner_id, campus_id, status, moderation_status, title, city, state, description, view_count, roommates_count, property_type FROM listings WHERE id = ?', [id]);
    return r ? { type, id, ownerId: r.owner_id, campusId: r.campus_id, status: r.status, moderationStatus: r.moderation_status, title: r.title, city: r.city, state: r.state, text: `${r.title}\n${r.description}`, viewCount: r.view_count, sharedLiving: r.roommates_count > 0 || r.property_type === 'room' || r.property_type === 'shared_room' } : null;
  }
  if (type === 'market_item') {
    const r = q.get<{ id: string; seller_id: string; campus_id: string; status: string; moderation_status: string; title: string; city: string | null; state: string | null; description: string | null; view_count: number }>('SELECT id, seller_id, campus_id, status, moderation_status, title, city, state, description, view_count FROM market_items WHERE id = ?', [id]);
    return r ? { type, id, ownerId: r.seller_id, campusId: r.campus_id, status: r.status, moderationStatus: r.moderation_status, title: r.title, city: r.city, state: r.state, text: `${r.title}\n${r.description ?? ''}`, viewCount: r.view_count, sharedLiving: true } : null;
  }
  const r = q.get<{ id: string; author_id: string; campus_id: string; status: string; moderation_status: string; title: string; description: string | null; view_count: number }>('SELECT id, author_id, campus_id, status, moderation_status, title, description, view_count FROM buddy_posts WHERE id = ?', [id]);
  return r ? { type, id, ownerId: r.author_id, campusId: r.campus_id, status: r.status, moderationStatus: r.moderation_status, title: r.title, city: null, state: null, text: `${r.title}\n${r.description ?? ''}`, viewCount: r.view_count, sharedLiving: true } : null;
}
const ENTITY_PUBLIC_STATUS: Record<BoostEntity, string[]> = { listing: ['active'], market_item: ['active', 'reserved'], buddy_post: ['open', 'full'] };
const FHA_PATTERNS = [/\b(no|only)\s+(students?|families|kids|children|christians?|muslims?|asians?|chinese|indians?|whites?|blacks?)\b/i, /\b(christian|muslim|jewish|hindu)s?\s+only\b/i, /\b(females?|males?|women|men|girls?|boys?)\s+only\b/i, /仅限(女|男)生/, /不要(小孩|孩子|家庭)/];
export function fhaViolation(text: string): boolean {
  return FHA_PATTERNS.some((re) => re.test(text));
}
export function entityCard(type: BoostEntity, id: string, ctx: { viewerId?: string | null; sponsored?: boolean; tier?: Boost['tier']; boostId?: string } = {}): ListingCard | ItemCard | BuddyCard | null {
  let card: ListingCard | ItemCard | BuddyCard | undefined;
  if (type === 'listing') card = listingCards(q.all<ListingCardRow>('SELECT l.* FROM listings l WHERE l.id = ?', [id]), { viewerId: ctx.viewerId })[0];
  else if (type === 'market_item') card = itemCards(q.all<ItemCardRow>('SELECT m.* FROM market_items m WHERE m.id = ?', [id]), { viewerId: ctx.viewerId })[0];
  else card = buddyCards(q.all<BuddyCardRow>('SELECT b.* FROM buddy_posts b WHERE b.id = ?', [id]), { viewerId: ctx.viewerId })[0];
  if (!card) return null;
  if (ctx.sponsored) return { ...card, sponsored: true, boostTier: ctx.tier, boostId: ctx.boostId } as typeof card;
  return card;
}
export function entityLink(type: BoostEntity, id: string): string {
  return type === 'listing' ? `/listings/${id}` : type === 'market_item' ? `/market/${id}` : `/buddy/${id}`;
}

// ====================================================================== boosts
export function toBoostDto(r: BoostRow, extra: { plan?: PlanDto; entity?: Boost['entity'] } = {}): Boost & { nationwide: boolean; pausedAt: string | null; campusId: string | null; orderId: string | null; createdAt: string } {
  return {
    id: r.id, entityType: r.entity_type, entityId: r.entity_id, tier: r.tier, startsAt: r.starts_at, endsAt: r.ends_at, status: r.status, impressions: r.impressions, clicks: r.clicks,
    plan: extra.plan, entity: extra.entity, nationwide: r.nationwide === 1, pausedAt: r.paused_at, campusId: r.campus_id, orderId: r.order_id, createdAt: r.created_at,
  };
}
export function loadBoost(id: string): BoostRow | undefined {
  return q.get<BoostRow>('SELECT * FROM boosts WHERE id = ?', [id]);
}
export function currentBoost(type: BoostEntity, id: string): BoostRow | undefined {
  return q.get<BoostRow>("SELECT * FROM boosts WHERE entity_type = ? AND entity_id = ? AND status IN ('scheduled','active') ORDER BY ends_at DESC LIMIT 1", [type, id]);
}
export type Eligibility = { eligible: boolean; reason: string | null; nextStep?: string | null; supplyProof: boolean; trustLevel: number };
/** Entity-level checks (flag, moderation, status, reports, FHA). Plan-level (trust / badge) are evaluated per plan in planLocks(). */
export function entityEligibility(user: AuthUser, e: EntityInfo): Eligibility {
  const supply = hasSupplyProof(user.id);
  const base = { supplyProof: supply, trustLevel: user.trust_level };
  if (!isEnabled('boosts.enabled', e.campusId)) return { ...base, eligible: false, reason: 'FEATURE_DISABLED' };
  if (e.ownerId !== user.id && user.role !== 'admin') return { ...base, eligible: false, reason: 'FORBIDDEN' };
  if (user.trust_level < 1) return { ...base, eligible: false, reason: 'TRUST_REQUIRED', nextStep: 'edu' };
  if (e.moderationStatus !== 'ok' || !ENTITY_PUBLIC_STATUS[e.type].includes(e.status)) return { ...base, eligible: false, reason: 'billing.boost.ineligible.moderation' };
  if (e.type === 'listing' && !e.sharedLiving && fhaViolation(e.text)) return { ...base, eligible: false, reason: 'billing.boost.ineligible.fha' };
  const openReports = q.count("SELECT COUNT(*) FROM reports WHERE entity_type = ? AND entity_id = ? AND status IN ('open','in_review')", [e.type, e.id]);
  if (openReports >= 2) return { ...base, eligible: false, reason: 'billing.boost.ineligible.reported' };
  return { ...base, eligible: true, reason: null };
}
/** Why a specific plan is locked for this user (null = purchasable). */
export function planLock(plan: PlanRow, user: AuthUser, supplyProof: boolean): string | null {
  if (user.role === 'admin') return null;
  const minTrust = plan.min_trust ?? 1;
  if (user.trust_level < minTrust) return 'TRUST_REQUIRED';
  if (plan.requires_badge === 'supply_proof' && !supplyProof) return 'billing.boost.ineligible.lease_proof';
  if (plan.requires_badge === 'landlord_proof' && !supplyProof) return 'billing.boost.ineligible.lease_proof';
  return null;
}
export function estimatedReach(e: EntityInfo, tier: Boost['tier'] = 'basic'): { dailyViews: number; multiplier: number } {
  const ageDays = 7;
  const daily = Math.max(2, Math.round(e.viewCount / ageDays));
  const multiplier = tier === 'max' ? 4.2 : tier === 'plus' ? 3.1 : 2.2;
  return { dailyViews: daily, multiplier };
}
/** Fulfils a paid boost order: one boosts row (or one per bundle item), extension rule, spotlight add-on. */
export function fulfilBoostOrder(order: OrderRow, plan: PlanRow): BoostRow[] {
  const meta = parseJson<{ addons?: string[]; fulfils?: string[] }>(order.metadata_json, {});
  const nationwide = (meta.addons ?? []).includes('boost.listing.spotlight') ? 1 : 0;
  const planKeys = meta.fulfils?.length ? meta.fulfils : [plan.key];
  const t = nowIso();
  const out: BoostRow[] = [];
  // what was actually paid (card + wallet credit, after discount) is apportioned over the boosts this order creates,
  // weighted by each boost's list price (the spotlight add-on belongs to the order's own entity) → boosts.price_cents
  const paidCents = Math.max(0, order.subtotal_cents - order.discount_cents);
  const addonCents = (meta.addons ?? []).reduce((s, k) => s + (loadPlan(k)?.price_cents ?? 0), 0);
  const planned: { p: PlanRow; target: { type: BoostEntity; id: string }; weight: number }[] = [];
  for (const key of planKeys) {
    const p = key === plan.key ? plan : requirePlan(key);
    if (p.kind !== 'boost' || !p.entity_type || !p.tier || !p.duration_days) continue;
    const targets: { type: BoostEntity; id: string }[] = [];
    if (p.key === 'boost.bundle.basic.7d') {
      // the order's entity is the listing (moving-out pack) or the bundle id; boost every item in the linked bundle
      const bundleId = order.entity_type === 'listing'
        ? q.get<{ id: string }>("SELECT id FROM market_bundles WHERE listing_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1", [order.entity_id])?.id
        : q.get<{ id: string }>('SELECT id FROM market_bundles WHERE id = ?', [order.entity_id])?.id;
      if (bundleId) for (const it of q.all<{ id: string }>("SELECT id FROM market_items WHERE bundle_id = ? AND status IN ('active','reserved')", [bundleId])) targets.push({ type: 'market_item', id: it.id });
    } else if (order.entity_type && order.entity_id) targets.push({ type: order.entity_type as BoostEntity, id: order.entity_id });
    for (const target of targets) {
      const own = target.type === order.entity_type && target.id === order.entity_id;
      planned.push({ p, target, weight: Math.max(1, p.price_cents + (own ? addonCents : 0)) });
    }
  }
  const weightSum = planned.reduce((s, x) => s + x.weight, 0);
  let apportioned = 0;
  planned.forEach((x, i) => {
    const share = i === planned.length - 1 ? paidCents - apportioned : Math.floor((paidCents * x.weight) / weightSum);
    apportioned += share;
    (x as typeof x & { price: number }).price = share;
  });
  for (const x of planned as (typeof planned[number] & { price: number })[]) {
    const { p, target } = x;
    {
      const e = loadEntity(target.type, target.id);
      if (!e) continue;
      const existing = currentBoost(target.type, target.id);
      const startsMs = existing ? Math.max(Date.parse(existing.ends_at), nowMs()) : nowMs();
      const starts = new Date(startsMs).toISOString();
      const ends = new Date(startsMs + p.duration_days! * DAY).toISOString();
      const status: Boost['status'] = startsMs <= nowMs() + 1000 ? 'active' : 'scheduled';
      const row: BoostRow = { id: uid(), user_id: order.user_id, campus_id: e.campusId, entity_type: target.type, entity_id: target.id, plan_id: p.id, order_id: order.id, tier: p.tier!, starts_at: starts, ends_at: ends, status, impressions: 0, clicks: 0, nationwide, paused_at: null, price_cents: x.price, created_at: t, updated_at: t };
      q.run('INSERT INTO boosts (id, user_id, campus_id, entity_type, entity_id, plan_id, order_id, tier, starts_at, ends_at, status, impressions, clicks, nationwide, paused_at, price_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, NULL, ?, ?, ?)', [row.id, row.user_id, row.campus_id, row.entity_type, row.entity_id, row.plan_id, row.order_id, row.tier, row.starts_at, row.ends_at, row.status, nationwide, x.price, t, t]);
      out.push(row);
      notify(order.user_id, 'boost.started', {
        title: { zh: status === 'active' ? '推广已开始' : '推广已排期', en: status === 'active' ? 'Your boost is live' : 'Your boost is scheduled' },
        body: { zh: `「${e.title}」将推广到 ${ends.slice(0, 10)}。`, en: `"${e.title}" is featured until ${ends.slice(0, 10)}.` },
        link: entityLink(target.type, target.id), entityType: 'boost', entityId: row.id, data: { tier: p.tier, endsAt: ends },
      });
    }
  }
  return out;
}
/** Owner cancel: prorated wallet credit (kind refund, 180-day expiry). */
export function cancelBoost(row: BoostRow, by: 'owner' | 'moderation' | 'admin', req: Request | null, reason?: string): { boost: BoostRow; refundCents: number } {
  if (!['scheduled', 'active'].includes(row.status)) throw invalidState(row.status, 'cancelled');
  const plan = row.plan_id ? loadPlan(row.plan_id) : undefined;
  const order = row.order_id ? q.get<OrderRow>('SELECT * FROM orders WHERE id = ?', [row.order_id]) : undefined;
  const orderPaid = order ? Math.max(0, order.subtotal_cents - order.discount_cents) : 0;
  // this boost's own share of the order (legacy rows without price_cents: its plan price, never the whole pack)
  const paid = row.price_cents ?? (order ? Math.min(orderPaid, plan?.price_cents ?? orderPaid) : 0);
  const total = Date.parse(row.ends_at) - Date.parse(row.starts_at);
  const remaining = Math.max(0, Math.min(total, Date.parse(row.ends_at) - nowMs()));
  let refund = by === 'moderation' ? 0 : total > 0 ? Math.floor((paid * remaining) / total) : 0;
  if (order && refund > 0) {
    // cumulative refunds for all boosts of one order never exceed what that order paid
    const already = q.get<{ s: number | null }>("SELECT SUM(w.delta_cents) AS s FROM wallet_ledger w JOIN boosts b ON b.id = w.ref_id WHERE w.ref_type = 'boost' AND w.kind = 'refund' AND b.order_id = ?", [order.id])?.s ?? 0;
    refund = Math.max(0, Math.min(refund, orderPaid - already));
  }
  return q.tx(() => {
    const t = nowIso();
    q.run("UPDATE boosts SET status = 'cancelled', updated_at = ? WHERE id = ?", [t, row.id]);
    if (refund > 0) ledgerAppend(row.user_id, refund, 'refund', { refType: 'boost', refId: row.id, note: 'boost_cancel_prorated', expiresAt: new Date(nowMs() + 180 * DAY).toISOString(), req });
    logEvent(req, 'boost.cancelled', { entityType: 'boost', entityId: row.id, props: { refundCents: refund, by, reason: reason ?? null } });
    return { boost: { ...row, status: 'cancelled', updated_at: t }, refundCents: refund };
  });
}
export function boostStats(row: BoostRow): { impressions: number; clicks: number; ctr: number; daily: { date: string; impressions: number; clicks: number }[]; upliftViews: number | null } {
  const daily = q.all<{ date: string; type: string; n: number }>("SELECT substr(created_at, 1, 10) AS date, type, COUNT(*) AS n FROM events WHERE entity_type = 'boost' AND entity_id = ? AND type IN ('boost.impression','boost.click') GROUP BY date, type ORDER BY date", [row.id]);
  const byDate = new Map<string, { date: string; impressions: number; clicks: number }>();
  const start = Date.parse(row.starts_at);
  const end = Math.min(Date.parse(row.ends_at), nowMs());
  for (let d = start; d <= end; d += DAY) {
    const k = new Date(d).toISOString().slice(0, 10);
    byDate.set(k, { date: k, impressions: 0, clicks: 0 });
  }
  for (const r of daily) {
    const d = byDate.get(r.date) ?? { date: r.date, impressions: 0, clicks: 0 };
    if (r.type === 'boost.impression') d.impressions += r.n;
    else d.clicks += r.n;
    byDate.set(r.date, d);
  }
  const series = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const viewType = row.entity_type === 'listing' ? 'listing.view' : row.entity_type === 'market_item' ? 'item.view' : 'buddy.view';
  const during = q.count('SELECT COUNT(*) FROM events WHERE entity_type = ? AND entity_id = ? AND type = ? AND created_at >= ? AND created_at < ?', [row.entity_type, row.entity_id, viewType, row.starts_at, row.ends_at]);
  const windowMs = Date.parse(row.ends_at) - Date.parse(row.starts_at);
  const before = q.count('SELECT COUNT(*) FROM events WHERE entity_type = ? AND entity_id = ? AND type = ? AND created_at >= ? AND created_at < ?', [row.entity_type, row.entity_id, viewType, new Date(start - windowMs).toISOString(), row.starts_at]);
  const impressions = Math.max(row.impressions, series.reduce((s, d) => s + d.impressions, 0));
  const clicks = Math.max(row.clicks, series.reduce((s, d) => s + d.clicks, 0));
  return { impressions, clicks, ctr: impressions ? clicks / impressions : 0, daily: series, upliftViews: before > 0 ? Math.round((during / before) * 100) / 100 : null };
}

// ---------------------------------------------------------------- placement (DATA_MODEL §8 + nationwide spotlight + paused boosts)
const ENTITY_TABLE: Record<BoostEntity, { table: string; status: string; cityCol: string | null }> = {
  listing: { table: 'listings', status: "e.status = 'active' AND e.moderation_status = 'ok'", cityCol: 'city' },
  market_item: { table: 'market_items', status: "e.status IN ('active','reserved') AND e.moderation_status = 'ok'", cityCol: 'city' },
  buddy_post: { table: 'buddy_posts', status: "e.status IN ('open','full') AND e.moderation_status = 'ok'", cityCol: null },
};
const TIER_RANK = "CASE b.tier WHEN 'max' THEN 3 WHEN 'plus' THEN 2 ELSE 1 END";
/** Same contract as lib/sponsored.pickSponsored, plus: `nationwide = 1` boosts appear in nationwide results for any city; paused boosts are skipped. */
export function pickSponsored(input: PickSponsoredInput & { nationwide?: boolean }): SponsoredPick[] {
  if (input.slots <= 0) return [];
  const meta = ENTITY_TABLE[input.entityType];
  const where: string[] = ['b.entity_type = ?', meta.status, 'b.paused_at IS NULL'];
  const params: (string | number)[] = [input.entityType];
  if (input.tier) { where.push('b.tier = ?'); params.push(input.tier); }
  if (input.campusId) { where.push('e.campus_id = ?'); params.push(input.campusId); }
  else if (input.city && input.state && meta.cityCol) { where.push(`((e.${meta.cityCol} = ? AND e.state = ?) OR b.nationwide = 1)`); params.push(input.city, input.state); }
  else if (input.nationwide) where.push('b.nationwide = 1');
  else return [];
  if (input.excludeIds?.length) { where.push(`b.entity_id NOT IN (${placeholders(input.excludeIds.length)})`); params.push(...input.excludeIds); }
  const rows = q.all<{ id: string; tier: SponsoredPick['tier']; boost_id: string }>(
    `SELECT b.entity_id AS id, b.tier, b.id AS boost_id FROM v_active_boosts b JOIN ${meta.table} e ON e.id = b.entity_id WHERE ${where.join(' AND ')} GROUP BY b.entity_id ORDER BY ${TIER_RANK} DESC, b.impressions ASC, random() LIMIT ?`,
    [...params, input.slots],
  );
  return rows.map((r) => ({ id: r.id, tier: r.tier, boostId: r.boost_id }));
}
/** Cards for sponsored picks, marked `sponsored: true`; impressions recorded. */
export function sponsoredCards(input: PickSponsoredInput & { nationwide?: boolean; viewerId?: string | null }, req: Request | null = null): (ListingCard | ItemCard | BuddyCard)[] {
  const picks = pickSponsored(input);
  const out: (ListingCard | ItemCard | BuddyCard)[] = [];
  for (const p of picks) {
    const c = entityCard(input.entityType, p.id, { viewerId: input.viewerId, sponsored: true, tier: p.tier, boostId: p.boostId });
    if (c) out.push(c);
  }
  recordImpressions(picks.map((p) => p.boostId), req);
  return out;
}
/** Keep paused_at in sync with open reports (called by the hourly job). */
export function syncPausedBoosts(): void {
  const t = nowIso();
  q.run(`UPDATE boosts SET paused_at = ?, updated_at = ? WHERE status = 'active' AND paused_at IS NULL AND (SELECT COUNT(*) FROM reports r WHERE r.entity_type = boosts.entity_type AND r.entity_id = boosts.entity_id AND r.status IN ('open','in_review')) >= 2`, [t, t]);
  q.run(`UPDATE boosts SET paused_at = NULL, updated_at = ? WHERE paused_at IS NOT NULL AND (SELECT COUNT(*) FROM reports r WHERE r.entity_type = boosts.entity_type AND r.entity_id = boosts.entity_id AND r.status IN ('open','in_review')) < 2`, [t]);
}

// ====================================================================== orders & payments
/** Provider ids never leave the server except: the client secret on the checkout (order create) response, and the intent id for admins. */
export function toPaymentDto(r: PaymentRow, reveal: { clientSecret?: boolean; intentId?: boolean } = {}): Payment {
  return {
    id: r.id, orderId: r.order_id, provider: r.provider, providerIntentId: reveal.intentId ? r.provider_intent_id : null, clientSecret: reveal.clientSecret ? r.client_secret : null, status: r.status, amountCents: r.amount_cents,
    refundedCents: r.refunded_cents, methodBrand: r.method_brand, methodLast4: r.method_last4, failureCode: r.failure_code, failureMessage: r.failure_message, succeededAt: r.succeeded_at, createdAt: r.created_at,
  };
}
export function loadOrder(id: string): OrderRow | undefined {
  return q.get<OrderRow>('SELECT * FROM orders WHERE id = ?', [id]);
}
export function requireOrder(id: string): OrderRow {
  const o = loadOrder(id);
  if (!o) throw notFound('Order');
  return o;
}
export function latestPayment(orderId: string): PaymentRow | undefined {
  return q.get<PaymentRow>('SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1', [orderId]);
}
export function toOrderDto(r: OrderRow, opts: { withPayments?: boolean; checkout?: boolean; admin?: boolean; party?: boolean } = {}): OrderDto {
  const plan = r.plan_id ? loadPlan(r.plan_id) : undefined;
  const meta = parseJson<Record<string, unknown>>(r.metadata_json, {});
  const addons = (Array.isArray(meta.addons) ? (meta.addons as string[]) : []).map((k) => loadPlan(k)).filter((p): p is PlanRow => !!p).map(toPlanDto);
  const promo = r.promo_code_id ? q.get<{ code: string }>('SELECT code FROM promo_codes WHERE id = ?', [r.promo_code_id])?.code : undefined;
  const pay = latestPayment(r.id);
  return {
    id: r.id, kind: r.kind, status: r.status, planId: r.plan_id, plan: plan ? toPlanDto(plan) : undefined, entityType: r.entity_type, entityId: r.entity_id,
    subtotalCents: r.subtotal_cents, discountCents: r.discount_cents, creditCents: r.credit_cents, feeCents: r.fee_cents, totalCents: r.total_cents,
    promoCode: promo, payment: pay && !opts.party ? toPaymentDto(pay, { clientSecret: opts.checkout, intentId: opts.admin }) : undefined, metadata: meta, paidAt: r.paid_at, fulfilledAt: r.fulfilled_at, createdAt: r.created_at,
    userId: r.user_id, campusId: r.campus_id, addons,
    payments: opts.withPayments && !opts.party ? q.all<PaymentRow>('SELECT * FROM payments WHERE order_id = ? ORDER BY created_at', [r.id]).map((p) => toPaymentDto(p, { intentId: opts.admin })) : undefined,
  };
}
/** The order as the other party of a Secure Payment sees it on the receipt: amounts and status only (no card, no provider ids). */
export function toPartyOrderDto(r: OrderRow): OrderDto {
  const dto = toOrderDto(r, { party: true });
  return { ...dto, metadata: {}, promoCode: undefined, creditCents: 0 };
}
export type OrderDraft = { kind: OrderRow['kind']; plan: PlanRow | null; entityType?: string | null; entityId?: string | null; campusId?: string | null; subtotalCents: number; feeCents?: number; addons?: PlanRow[]; promoCode?: string; useWallet?: boolean; metadata?: Record<string, unknown>; surface?: string };
export type PricedOrder = { subtotal: number; discount: number; credit: number; fee: number; total: number; promo: PromoRow | null; walletAllowed: boolean };
export function priceOrder(user: AuthUser, d: OrderDraft): PricedOrder {
  const subtotal = d.subtotalCents;
  let promo: PromoRow | null = null;
  let discount = 0;
  if (d.promoCode) {
    const v = validatePromo(user, d.promoCode, { orderKind: d.kind, planKeys: [d.plan?.key ?? '', ...(d.addons ?? []).map((a) => a.key)], subtotalCents: d.kind === 'escrow_deposit' ? d.feeCents ?? 0 : subtotal, campusId: d.campusId ?? null });
    promo = v.promo;
    discount = v.discountCents;
  }
  const walletAllowed = d.kind === 'boost' || (d.kind === 'subscription' && isEnabled('wallet.pro_allowed') && !!q.get('SELECT 1 FROM feature_flags WHERE key = ?', ['wallet.pro_allowed']));
  const fee = d.kind === 'escrow_deposit' ? Math.max(0, (d.feeCents ?? 0) - discount) : 0;
  const afterDiscount = d.kind === 'escrow_deposit' ? subtotal : Math.max(0, subtotal - discount);
  const credit = walletAllowed && d.useWallet !== false ? Math.min(walletBalance(user.id), afterDiscount) : 0;
  const total = Math.max(0, afterDiscount - credit) + fee;
  return { subtotal, discount: d.kind === 'escrow_deposit' ? discount : Math.min(discount, subtotal), credit, fee, total, promo, walletAllowed };
}
/** Inserts the order (+ payment intent) and fulfils immediately when wallet credit covers everything. */
export function createOrder(user: AuthUser, d: OrderDraft, req: Request | null): OrderRow {
  const priced = priceOrder(user, d);
  const t = nowIso();
  const id = uid();
  const metadata = { ...(d.metadata ?? {}), addons: (d.addons ?? []).map((a) => a.key), surface: d.surface ?? null, useWallet: d.useWallet !== false, promoCode: priced.promo?.code ?? null };
  const row: OrderRow = {
    id, user_id: user.id, campus_id: d.campusId ?? user.campus_id ?? null, kind: d.kind, plan_id: d.plan?.id ?? null, entity_type: d.entityType ?? null, entity_id: d.entityId ?? null,
    status: 'awaiting_payment', currency: 'USD', subtotal_cents: priced.subtotal, discount_cents: priced.discount, credit_cents: priced.credit, fee_cents: priced.fee, total_cents: priced.total,
    promo_code_id: priced.promo?.id ?? null, payment_id: null, metadata_json: JSON.stringify(metadata), paid_at: null, fulfilled_at: null, cancelled_at: null, created_at: t, updated_at: t,
  };
  return q.tx(() => {
    q.insert('orders', row as unknown as Record<string, string | number | null>);
    logEvent(req, 'checkout.start', { entityType: 'order', entityId: id, props: { kind: d.kind, planKey: d.plan?.key ?? null, totalCents: priced.total, creditCents: priced.credit, discountCents: priced.discount, provider: priced.total === 0 ? 'wallet' : 'mock_stripe', surface: d.surface ?? null } });
    if (priced.total === 0) {
      const pay: PaymentRow = { id: uid(), order_id: id, user_id: user.id, provider: 'wallet', provider_intent_id: null, provider_charge_id: null, client_secret: null, status: 'succeeded', amount_cents: 0, refunded_cents: 0, currency: 'USD', payment_method_id: null, method_brand: null, method_last4: null, failure_code: null, failure_message: null, raw_json: '{}', succeeded_at: t, created_at: t, updated_at: t };
      q.insert('payments', pay as unknown as Record<string, string | number | null>);
      q.run('UPDATE orders SET payment_id = ? WHERE id = ?', [pay.id, id]);
      row.payment_id = pay.id;
      return settleOrder(row, pay, req);
    }
    const intent = mockStripe.createIntent(priced.total);
    const pay: PaymentRow = { id: uid(), order_id: id, user_id: user.id, provider: 'mock_stripe', provider_intent_id: intent.id, provider_charge_id: null, client_secret: intent.clientSecret, status: 'requires_payment_method', amount_cents: priced.total, refunded_cents: 0, currency: 'USD', payment_method_id: null, method_brand: null, method_last4: null, failure_code: null, failure_message: null, raw_json: '{}', succeeded_at: t, created_at: t, updated_at: t };
    pay.succeeded_at = null;
    q.insert('payments', pay as unknown as Record<string, string | number | null>);
    q.run('UPDATE orders SET payment_id = ? WHERE id = ?', [pay.id, id]);
    row.payment_id = pay.id;
    return row;
  });
}
/** Re-prices an awaiting order when the user toggles wallet credit at checkout. */
export function repriceOrder(user: AuthUser, order: OrderRow, useWallet: boolean): OrderRow {
  if (order.status !== 'awaiting_payment' && order.status !== 'failed') return order;
  const meta = parseJson<Record<string, unknown>>(order.metadata_json, {});
  const plan = order.plan_id ? loadPlan(order.plan_id) : null;
  const addons = (Array.isArray(meta.addons) ? (meta.addons as string[]) : []).map((k) => loadPlan(k)).filter((p): p is PlanRow => !!p);
  const priced = priceOrder(user, { kind: order.kind, plan: plan ?? null, subtotalCents: order.subtotal_cents, feeCents: order.fee_cents + (order.kind === 'escrow_deposit' ? order.discount_cents : 0), addons, promoCode: typeof meta.promoCode === 'string' ? meta.promoCode : undefined, useWallet, campusId: order.campus_id });
  q.run('UPDATE orders SET credit_cents = ?, total_cents = ?, metadata_json = ?, updated_at = ? WHERE id = ?', [priced.credit, priced.total, JSON.stringify({ ...meta, useWallet }), nowIso(), order.id]);
  const pay = latestPayment(order.id);
  if (pay && pay.status !== 'succeeded') q.run('UPDATE payments SET amount_cents = ?, updated_at = ? WHERE id = ?', [priced.total, nowIso(), pay.id]);
  return requireOrder(order.id);
}
/** Charges the latest intent with a card or a saved method. Throws PAYMENT_FAILED (order → failed, retryable). */
export function payOrder(user: AuthUser, order: OrderRow, method: { card?: CardLike & { save?: boolean }; paymentMethodId?: string }, req: Request | null): OrderRow {
  if (!['awaiting_payment', 'failed'].includes(order.status)) throw invalidState(order.status, 'paid');
  const t = nowIso();
  let pay = latestPayment(order.id);
  if (!pay || pay.status === 'failed' || pay.status === 'cancelled') {
    const intent = mockStripe.createIntent(order.total_cents);
    pay = { id: uid(), order_id: order.id, user_id: order.user_id, provider: 'mock_stripe', provider_intent_id: intent.id, provider_charge_id: null, client_secret: intent.clientSecret, status: 'requires_payment_method', amount_cents: order.total_cents, refunded_cents: 0, currency: 'USD', payment_method_id: null, method_brand: null, method_last4: null, failure_code: null, failure_message: null, raw_json: '{}', succeeded_at: null, created_at: t, updated_at: t };
    q.insert('payments', pay as unknown as Record<string, string | number | null>);
    q.run('UPDATE orders SET payment_id = ?, status = ?, updated_at = ? WHERE id = ?', [pay.id, 'awaiting_payment', t, order.id]);
  }
  const blocker = settleBlocker(order);
  if (blocker) throw blocker;
  logEvent(req, 'checkout.pay', { entityType: 'order', entityId: order.id, props: { kind: order.kind, totalCents: order.total_cents, provider: 'mock_stripe' } });
  let brand: string | null = null;
  let last4: string | null = null;
  let pmId: string | null = null;
  let result: ReturnType<typeof mockStripe.confirm>;
  if (method.paymentMethodId) {
    const pm = q.get<PaymentMethodRow>('SELECT * FROM payment_methods WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [method.paymentMethodId, user.id]);
    if (!pm) throw notFound('Payment method');
    result = mockStripe.confirmToken(pm.provider_token);
    brand = pm.brand;
    last4 = pm.last4;
    pmId = pm.id;
  } else if (method.card) {
    result = mockStripe.confirm(method.card);
    if (result.ok) {
      brand = result.brand;
      last4 = result.last4;
      if (method.card.save) pmId = savePaymentMethod(user.id, method.card).id;
    }
  } else throw new ApiError('VALIDATION', 'A card or a saved payment method is required');
  if (!result.ok) {
    q.run("UPDATE payments SET status = 'failed', failure_code = ?, failure_message = ?, method_brand = ?, method_last4 = ?, updated_at = ? WHERE id = ?", [result.failureCode, result.message, brand, last4, t, pay.id]);
    q.run("UPDATE orders SET status = 'failed', updated_at = ? WHERE id = ?", [t, order.id]);
    logEvent(req, 'checkout.fail', { entityType: 'order', entityId: order.id, props: { kind: order.kind, failureCode: result.failureCode, totalCents: order.total_cents } });
    throw new ApiError('PAYMENT_FAILED', result.message, { data: { failureCode: result.failureCode, orderId: order.id } });
  }
  return q.tx(() => {
    q.run("UPDATE payments SET status = 'succeeded', provider_charge_id = ?, method_brand = ?, method_last4 = ?, payment_method_id = ?, succeeded_at = ?, updated_at = ? WHERE id = ?", [result.ok ? result.chargeId : null, brand, last4, pmId, t, t, pay!.id]);
    const updated = { ...pay!, status: 'succeeded' as const, succeeded_at: t, method_brand: brand, method_last4: last4 };
    return settleOrder(order, updated, req);
  });
}
/** Limits re-checked when an order is paid (several open orders must not each redeem a once-per-user promo code or
 *  spend the same wallet credit). Called before charging and again inside settlement. */
export function settleBlocker(order: OrderRow): ApiError | null {
  if (order.promo_code_id) {
    const promo = q.get<PromoRow>('SELECT * FROM promo_codes WHERE id = ?', [order.promo_code_id]);
    const used = promo ? q.count('SELECT COUNT(*) FROM promo_redemptions WHERE promo_code_id = ? AND user_id = ? AND order_id IS NOT ?', [promo.id, order.user_id, order.id]) : 0;
    if (!promo || used >= promo.per_user_limit) return new ApiError('PROMO_INVALID', 'This promo code has already been used — cancel this order and check out again', { data: { reason: 'already_used', orderId: order.id } });
    if (promo.max_redemptions !== null && promo.redeemed_count >= promo.max_redemptions) return new ApiError('PROMO_INVALID', 'This promo code has run out — cancel this order and check out again', { data: { reason: 'exhausted', orderId: order.id } });
  }
  if (order.credit_cents > 0 && walletBalance(order.user_id) < order.credit_cents) return new ApiError('CONFLICT', 'Your wallet balance changed — review the order again', { data: { reason: 'wallet_changed', orderId: order.id } });
  return null;
}
/** Payment succeeded → wallet debit → paid → fulfil (same transaction).
 *  Refuses unless the stored payment proves the money arrived: a provider charge id, or a $0 wallet payment for a $0 order. */
export function settleOrder(order: OrderRow, pay: PaymentRow, req: Request | null): OrderRow {
  const t = nowIso();
  return q.tx(() => {
    const fresh = q.get<PaymentRow>('SELECT * FROM payments WHERE id = ?', [pay.id]);
    const charged = !!fresh && fresh.order_id === order.id && fresh.status === 'succeeded' && (!!fresh.provider_charge_id || (fresh.provider === 'wallet' && fresh.amount_cents === 0 && order.total_cents === 0));
    if (!charged) throw new ApiError('PAYMENT_FAILED', 'Payment not confirmed by the provider', { data: { orderId: order.id } });
    const current = requireOrder(order.id);
    if (!['awaiting_payment', 'failed', 'pending'].includes(current.status)) throw invalidState(current.status, 'paid');
    const blocker = settleBlocker(order);
    if (blocker) throw blocker;
    if (order.credit_cents > 0) ledgerAppend(order.user_id, -order.credit_cents, 'order_payment', { refType: 'order', refId: order.id, note: order.kind, req });
    if (order.promo_code_id) q.run('INSERT INTO promo_redemptions (id, promo_code_id, user_id, order_id, amount_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)', [uid(), order.promo_code_id, order.user_id, order.id, order.discount_cents, t]);
    q.run("UPDATE orders SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?", [t, t, order.id]);
    const paidRow = { ...order, status: 'paid' as const, paid_at: t };
    fulfilOrder(paidRow, req);
    q.run("UPDATE orders SET status = 'fulfilled', fulfilled_at = ?, updated_at = ? WHERE id = ?", [t, t, order.id]);
    logEvent(req, 'checkout.success', { entityType: 'order', entityId: order.id, props: { kind: order.kind, totalCents: order.total_cents, creditCents: order.credit_cents, discountCents: order.discount_cents, provider: pay.provider } });
    // referral post-order hook: first paid order of a referred user who is still pending → qualify
    const ref = q.get<{ id: string }>("SELECT id FROM referrals WHERE referred_id = ? AND status = 'pending'", [order.user_id]);
    if (ref) qualifyReferral(order.user_id, 'first_payment');
    return requireOrder(order.id);
  });
}
function fulfilOrder(order: OrderRow, req: Request | null): void {
  if (order.kind === 'boost') {
    const plan = order.plan_id ? requirePlan(order.plan_id) : null;
    if (!plan) throw new ApiError('INTERNAL', 'Boost order without plan');
    fulfilBoostOrder(order, plan);
  } else if (order.kind === 'subscription' || order.kind === 'subscription_renewal') {
    activateSubscription(order, req);
  } else if (order.kind === 'escrow_deposit') {
    if (!order.entity_id) throw new ApiError('INTERNAL', 'Escrow order without escrow');
    const e = requireEscrow(order.entity_id);
    transitionEscrow(e, 'funded', { actorId: order.user_id, note: null, req, data: { orderId: order.id } });
  }
}
export function cancelOrder(order: OrderRow): OrderRow {
  if (!['pending', 'awaiting_payment', 'failed'].includes(order.status)) throw invalidState(order.status, 'cancelled');
  const t = nowIso();
  q.run("UPDATE orders SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?", [t, t, order.id]);
  q.run("UPDATE payments SET status = 'cancelled', updated_at = ? WHERE order_id = ? AND status NOT IN ('succeeded','refunded','partially_refunded','failed')", [t, order.id]);
  return requireOrder(order.id);
}
/** Admin refund: card part refunded on the payment row, wallet part returned as credit; entity side effects reversed. */
export function refundOrder(order: OrderRow, amountCents: number | undefined, actorId: string | null, reason: string, req: Request | null): OrderRow {
  if (!['paid', 'fulfilled'].includes(order.status)) throw invalidState(order.status, 'refunded');
  const pay = q.get<PaymentRow>("SELECT * FROM payments WHERE order_id = ? AND status IN ('succeeded','partially_refunded') ORDER BY created_at DESC LIMIT 1", [order.id]);
  const chargeable = pay ? pay.amount_cents - pay.refunded_cents : 0;
  const cardRefund = Math.min(chargeable, amountCents ?? order.total_cents);
  const walletRefund = amountCents === undefined ? order.credit_cents : Math.max(0, Math.min(order.credit_cents, amountCents - cardRefund));
  const t = nowIso();
  q.tx(() => {
    if (pay && cardRefund > 0) {
      mockStripe.refund(pay.provider_charge_id, cardRefund);
      const newRefunded = pay.refunded_cents + cardRefund;
      q.run('UPDATE payments SET refunded_cents = ?, status = ?, updated_at = ? WHERE id = ?', [newRefunded, newRefunded >= pay.amount_cents ? 'refunded' : 'partially_refunded', t, pay.id]);
    }
    if (walletRefund > 0) ledgerAppend(order.user_id, walletRefund, 'refund', { refType: 'order', refId: order.id, note: 'admin_refund', expiresAt: new Date(nowMs() + 180 * DAY).toISOString(), createdBy: actorId, req });
    const full = cardRefund + walletRefund >= order.total_cents + order.credit_cents;
    q.run('UPDATE orders SET status = ?, metadata_json = json_set(metadata_json, ?, ?), updated_at = ? WHERE id = ?', [full ? 'refunded' : order.status, '$.refund', JSON.stringify({ cardCents: cardRefund, walletCents: walletRefund, reason, at: t }), t, order.id]);
    if (order.kind === 'boost') q.run("UPDATE boosts SET status = 'refunded', updated_at = ? WHERE order_id = ? AND status IN ('scheduled','active')", [t, order.id]);
    if (order.kind === 'subscription' || order.kind === 'subscription_renewal') q.run("UPDATE subscriptions SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE last_order_id = ? AND status IN ('trialing','active','past_due')", [t, t, order.id]);
  });
  notify(order.user_id, 'order.refunded', { title: { zh: '订单已退款', en: 'Your order was refunded' }, body: { zh: `退款 $${((cardRefund + walletRefund) / 100).toFixed(2)}（测试模式）。`, en: `$${((cardRefund + walletRefund) / 100).toFixed(2)} refunded (test mode).` }, link: '/wallet', entityType: 'order', entityId: order.id });
  return requireOrder(order.id);
}

// ====================================================================== subscriptions (Landlord Pro)
export const TRIAL_DAYS = 14;
export function toSubscriptionDto(r: SubscriptionRow): Subscription & { userId: string; lastOrderId: string | null; seats: number; pendingPlan: PlanDto | null; planChangedAt: string | null } {
  const plan = requirePlan(r.plan_id);
  const pending = r.pending_plan_id ? loadPlan(r.pending_plan_id) : undefined;
  const pm = r.payment_method_id ? q.get<PaymentMethodRow>('SELECT * FROM payment_methods WHERE id = ?', [r.payment_method_id]) : undefined;
  return {
    id: r.id, planId: r.plan_id, plan: toPlanDto(plan), status: r.status, currentPeriodStart: r.current_period_start, currentPeriodEnd: r.current_period_end, cancelAtPeriodEnd: r.cancel_at_period_end === 1,
    cancelledAt: r.cancelled_at, trialEndsAt: r.trial_ends_at, paymentMethod: pm ? toPaymentMethodDto(pm) : undefined, userId: r.user_id, lastOrderId: r.last_order_id,
    seats: plan.key.startsWith('proplus') ? 5 : 1,
    pendingPlan: pending ? toPlanDto(pending) : null, planChangedAt: r.plan_changed_at ?? null,
  };
}
export function currentSubscription(userId: string): SubscriptionRow | undefined {
  return q.get<SubscriptionRow>("SELECT * FROM subscriptions WHERE user_id = ? AND status IN ('trialing','active','past_due') ORDER BY current_period_end DESC LIMIT 1", [userId]);
}
export function isProUser(user: Pick<AuthUser, 'id' | 'pro_until' | 'role'>): boolean {
  if (user.role === 'admin') return true;
  return !!user.pro_until && user.pro_until > nowIso();
}
export function hasUsedTrial(userId: string): boolean {
  return q.count('SELECT COUNT(*) FROM subscriptions WHERE user_id = ? AND trial_ends_at IS NOT NULL', [userId]) > 0;
}
function periodEnd(from: number, interval: Plan['interval']): string {
  const d = new Date(from);
  if (interval === 'year') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
}
export function grantProBoostCredit(userId: string, subscriptionId: string, planKey: string, req: Request | null): void {
  const basic = loadPlan('boost.listing.basic.7d');
  const n = planKey.startsWith('proplus') ? 3 : 1;
  const amount = (basic?.price_cents ?? 1900) * n;
  ledgerAppend(userId, amount, 'promo_credit', { refType: 'subscription', refId: subscriptionId, note: 'pro_monthly_boost', expiresAt: new Date(nowMs() + 60 * DAY).toISOString(), req });
}
/** Called from fulfilment of a `subscription` / `subscription_renewal` order. */
export function activateSubscription(order: OrderRow, req: Request | null): SubscriptionRow {
  const plan = order.plan_id ? requirePlan(order.plan_id) : null;
  if (!plan || plan.kind !== 'subscription') throw new ApiError('INTERNAL', 'Subscription order without plan');
  const t = nowIso();
  const meta = parseJson<{ subscriptionId?: string; trial?: boolean; paymentMethodId?: string | null; upgradeFrom?: string }>(order.metadata_json, {});
  const existing = meta.subscriptionId ? q.get<SubscriptionRow>('SELECT * FROM subscriptions WHERE id = ?', [meta.subscriptionId]) : currentSubscription(order.user_id);
  if (existing) {
    // a paid mid-period upgrade starts a fresh period now (the unused part of the old plan was deducted from its price)
    const upgrade = !!meta.upgradeFrom;
    const start = existing.status === 'trialing' || upgrade ? nowMs() : Math.max(Date.parse(existing.current_period_end), nowMs() - DAY);
    const end = periodEnd(start, plan.interval);
    q.run("UPDATE subscriptions SET status = 'active', plan_id = ?, pending_plan_id = NULL, plan_changed_at = CASE WHEN ? THEN ? ELSE plan_changed_at END, current_period_start = ?, current_period_end = ?, last_order_id = ?, cancel_at_period_end = 0, updated_at = ? WHERE id = ?", [plan.id, upgrade ? 1 : 0, t, new Date(start).toISOString(), end, order.id, t, existing.id]);
    grantProBoostCredit(order.user_id, existing.id, plan.key, req);
    logEvent(req, order.kind === 'subscription_renewal' ? 'pro.renew' : 'pro.subscribe', { entityType: 'subscription', entityId: existing.id, props: { planKey: plan.key } });
    return q.get<SubscriptionRow>('SELECT * FROM subscriptions WHERE id = ?', [existing.id])!;
  }
  const id = uid();
  const start = nowMs();
  const trial = !!meta.trial && !hasUsedTrial(order.user_id);
  const end = trial ? new Date(start + TRIAL_DAYS * DAY).toISOString() : periodEnd(start, plan.interval);
  q.run('INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, trial_ends_at, last_order_id, payment_method_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?)', [id, order.user_id, plan.id, trial ? 'trialing' : 'active', new Date(start).toISOString(), end, trial ? end : null, order.id, meta.paymentMethodId ?? null, t, t]);
  q.run('UPDATE users SET listing_quota = 999, updated_at = ? WHERE id = ?', [t, order.user_id]);
  grantProBoostCredit(order.user_id, id, plan.key, req);
  logEvent(req, trial ? 'pro.trial_start' : 'pro.subscribe', { entityType: 'subscription', entityId: id, props: { planKey: plan.key, promo: parseJson<{ promoCode?: string }>(order.metadata_json, {}).promoCode ?? null } });
  notify(order.user_id, 'pro.activated', { title: { zh: trial ? '房东 Pro 试用已开始' : '房东 Pro 已开通', en: trial ? 'Your Landlord Pro trial has started' : 'Landlord Pro is active' }, body: { zh: '房源数量不再受限，线索收件箱已开启。', en: 'Unlimited listings and your lead inbox are now on.' }, link: '/pro', entityType: 'subscription', entityId: id });
  return q.get<SubscriptionRow>('SELECT * FROM subscriptions WHERE id = ?', [id])!;
}
/** Plan change rules: no change while trialing; at most one change per billing period; downgrades (or same price) are
 *  scheduled for the period end; upgrades create a `subscription` order for (new price − unused part of the current
 *  plan) and switch the plan only when that order is paid. Never credits the wallet. */
export function changeSubscriptionPlan(user: AuthUser, sub: SubscriptionRow, plan: PlanRow, req: Request | null): { subscription: SubscriptionRow; order: OrderRow | null } {
  if (plan.kind !== 'subscription' || plan.is_active !== 1) throw new ApiError('BAD_REQUEST', 'Not a subscription plan');
  const reload = () => q.get<SubscriptionRow>('SELECT * FROM subscriptions WHERE id = ?', [sub.id])!;
  if (plan.id === sub.plan_id) {
    // picking the current plan again cancels a scheduled downgrade
    if (sub.pending_plan_id) q.run('UPDATE subscriptions SET pending_plan_id = NULL, updated_at = ? WHERE id = ?', [nowIso(), sub.id]);
    return { subscription: reload(), order: null };
  }
  if (sub.status === 'trialing') throw new ApiError('INVALID_STATE', 'You can change plans after the trial ends', { data: { from: sub.status, to: 'change_plan', reason: 'trialing' } });
  if (sub.status !== 'active') throw invalidState(sub.status, 'change_plan');
  if (sub.plan_changed_at && sub.plan_changed_at >= sub.current_period_start) throw new ApiError('CONFLICT', 'One plan change per billing period', { data: { reason: 'one_change_per_period', nextAt: sub.current_period_end } });
  const current = requirePlan(sub.plan_id);
  const t = nowIso();
  if (plan.price_cents <= current.price_cents) {
    q.run('UPDATE subscriptions SET pending_plan_id = ?, plan_changed_at = ?, updated_at = ? WHERE id = ?', [plan.id, t, t, sub.id]);
    logEvent(req, 'pro.change_plan', { entityType: 'subscription', entityId: sub.id, props: { from: current.key, to: plan.key, scheduled: true } });
    return { subscription: reload(), order: null };
  }
  // drop earlier unpaid upgrade orders so only one can be paid
  for (const o of q.all<OrderRow>("SELECT * FROM orders WHERE user_id = ? AND kind = 'subscription' AND entity_id = ? AND status IN ('awaiting_payment','failed')", [user.id, sub.id])) cancelOrder(o);
  const total = Date.parse(sub.current_period_end) - Date.parse(sub.current_period_start);
  const remaining = Math.max(0, Date.parse(sub.current_period_end) - nowMs());
  const unused = total > 0 ? Math.min(current.price_cents, Math.floor((current.price_cents * remaining) / total)) : 0;
  const order = createOrder(user, { kind: 'subscription', plan, entityType: 'subscription', entityId: sub.id, subtotalCents: Math.max(0, plan.price_cents - unused), useWallet: false, metadata: { subscriptionId: sub.id, upgradeFrom: current.key, prorationCents: unused, listPriceCents: plan.price_cents }, surface: 'pro' }, req);
  logEvent(req, 'pro.change_plan', { entityType: 'subscription', entityId: sub.id, props: { from: current.key, to: plan.key, scheduled: false, orderId: order.id, prorationCents: unused } });
  return { subscription: reload(), order: requireOrder(order.id) };
}
export function cancelSubscription(sub: SubscriptionRow, immediately: boolean, req: Request | null, reason?: string): SubscriptionRow {
  const t = nowIso();
  if (immediately) {
    q.run("UPDATE subscriptions SET status = 'cancelled', cancelled_at = ?, cancel_at_period_end = 1, updated_at = ? WHERE id = ?", [t, t, sub.id]);
    q.run('UPDATE users SET listing_quota = 2, updated_at = ? WHERE id = ?', [t, sub.user_id]);
  } else q.run('UPDATE subscriptions SET cancel_at_period_end = 1, cancelled_at = ?, updated_at = ? WHERE id = ?', [t, t, sub.id]);
  logEvent(req, 'pro.cancel', { entityType: 'subscription', entityId: sub.id, props: { immediately, reason: reason ?? null } });
  return q.get<SubscriptionRow>('SELECT * FROM subscriptions WHERE id = ?', [sub.id])!;
}
export function resumeSubscription(sub: SubscriptionRow): SubscriptionRow {
  if (!['trialing', 'active', 'past_due'].includes(sub.status)) throw invalidState(sub.status, 'active');
  q.run('UPDATE subscriptions SET cancel_at_period_end = 0, cancelled_at = NULL, updated_at = ? WHERE id = ?', [nowIso(), sub.id]);
  return q.get<SubscriptionRow>('SELECT * FROM subscriptions WHERE id = ?', [sub.id])!;
}
/** Hourly: trial ends / period ends → charge the saved card (mock) → new period or past_due → expired. */
export function renewSubscriptions(): { renewed: number; pastDue: number; cancelled: number; expired: number } {
  const t = nowIso();
  const out = { renewed: 0, pastDue: 0, cancelled: 0, expired: 0 };
  const due = q.all<SubscriptionRow>("SELECT * FROM subscriptions WHERE status IN ('trialing','active','past_due') AND current_period_end <= ?", [t]);
  for (const s of due) {
    if (s.cancel_at_period_end === 1) {
      q.run("UPDATE subscriptions SET status = 'cancelled', updated_at = ? WHERE id = ?", [t, s.id]);
      q.run('UPDATE users SET listing_quota = 2, updated_at = ? WHERE id = ?', [t, s.user_id]);
      notify(s.user_id, 'pro.ended', { title: { zh: '房东 Pro 已结束', en: 'Landlord Pro has ended' }, body: { zh: '随时可以重新开通。', en: 'You can resubscribe any time.' }, link: '/pro' });
      out.cancelled++;
      continue;
    }
    if (s.status === 'past_due' && Date.parse(s.current_period_end) < nowMs() - 7 * DAY) {
      q.run("UPDATE subscriptions SET status = 'expired', updated_at = ? WHERE id = ?", [t, s.id]);
      q.run('UPDATE users SET listing_quota = 2, updated_at = ? WHERE id = ?', [t, s.user_id]);
      out.expired++;
      continue;
    }
    const user = q.get<AuthUser>('SELECT * FROM users WHERE id = ?', [s.user_id]);
    // a scheduled downgrade takes effect at renewal
    const plan = requirePlan(s.pending_plan_id ?? s.plan_id);
    const pm = s.payment_method_id ? q.get<PaymentMethodRow>('SELECT * FROM payment_methods WHERE id = ? AND deleted_at IS NULL', [s.payment_method_id]) : q.get<PaymentMethodRow>('SELECT * FROM payment_methods WHERE user_id = ? AND deleted_at IS NULL ORDER BY is_default DESC LIMIT 1', [s.user_id]);
    if (!user || !pm) {
      q.run("UPDATE subscriptions SET status = 'past_due', updated_at = ? WHERE id = ?", [t, s.id]);
      out.pastDue++;
      continue;
    }
    // Founding Landlord discount carried for 12 renewals
    const last = s.last_order_id ? loadOrder(s.last_order_id) : undefined;
    const lastMeta = last ? parseJson<{ promo_renewals_left?: number; promoCode?: string }>(last.metadata_json, {}) : {};
    const left = lastMeta.promo_renewals_left ?? 0;
    const discount = left > 0 && last ? last.discount_cents : 0;
    try {
      const order = createOrder(user, { kind: 'subscription_renewal', plan, entityType: 'subscription', entityId: s.id, subtotalCents: plan.price_cents, useWallet: false, metadata: { subscriptionId: s.id, promo_renewals_left: Math.max(0, left - 1), renewalDiscountCents: discount } }, null);
      if (discount > 0) q.run('UPDATE orders SET discount_cents = ?, total_cents = ?, updated_at = ? WHERE id = ?', [discount, Math.max(0, plan.price_cents - discount), t, order.id]);
      payOrder(user, requireOrder(order.id), { paymentMethodId: pm.id }, null);
      out.renewed++;
    } catch (e) {
      logger.warn({ err: e, subscription: s.id }, 'renewal charge failed');
      q.run("UPDATE subscriptions SET status = 'past_due', updated_at = ? WHERE id = ?", [t, s.id]);
      notify(s.user_id, 'pro.past_due', { title: { zh: '房东 Pro 续费失败', en: 'Landlord Pro renewal failed' }, body: { zh: '请更新支付方式，7 天内会再次尝试。', en: 'Update your payment method; we retry for 7 days.' }, link: '/pro' });
      out.pastDue++;
    }
  }
  return out;
}

// ====================================================================== Secure Payment (escrows)
export type EscrowQuote = { amountCents: number; feeBps: number; feeCents: number; feeMinCents: number; feeCapCents: number; feePayer: Escrow['feePayer']; payerFeeCents: number; payeeFeeCents: number; payerTotalCents: number; payeeNetCents: number; rail: EscrowRail; railFeeCents: number; railAllowed: boolean };
export function quoteEscrowFee(amountCents: number, feePayer: Escrow['feePayer'] = 'payer', rail: EscrowRail = 'ach'): EscrowQuote {
  const plan = escrowPlan();
  const bps = plan?.fee_bps ?? 300;
  const min = plan?.fee_min_cents ?? 500;
  const cap = plan?.fee_cap_cents ?? 6000;
  const fee = Math.min(cap, Math.max(min, Math.round((amountCents * bps) / 10000)));
  const payerFee = feePayer === 'payer' ? fee : feePayer === 'split' ? Math.ceil(fee / 2) : 0;
  const payeeFee = fee - payerFee;
  const railFee = rail === 'card' ? Math.round((amountCents * 290) / 10000) + 30 : rail === 'alipay' || rail === 'wechat_pay' ? Math.round((amountCents * 300) / 10000) : 0;
  const railAllowed = rail !== 'card' || amountCents < 50000;
  return { amountCents, feeBps: bps, feeCents: fee, feeMinCents: min, feeCapCents: cap, feePayer, payerFeeCents: payerFee, payeeFeeCents: payeeFee, payerTotalCents: amountCents + payerFee + railFee, payeeNetCents: amountCents - payeeFee, rail, railFeeCents: railFee, railAllowed };
}
export function loadEscrow(id: string): EscrowRow | undefined {
  return q.get<EscrowRow>('SELECT * FROM escrows WHERE id = ?', [id]);
}
export function requireEscrow(id: string): EscrowRow {
  const e = loadEscrow(id);
  if (!e) throw notFound('Secure Payment');
  return e;
}
export function payeeEligible(payeeId: string): { ok: boolean; reason: string | null } {
  const u = q.get<{ trust_level: number; banned: number }>('SELECT trust_level, banned FROM users WHERE id = ?', [payeeId]);
  if (!u || u.banned) return { ok: false, reason: 'payee_not_eligible' };
  if (u.trust_level < 3) return { ok: false, reason: 'payee_trust' };
  if (!hasSupplyProof(payeeId)) return { ok: false, reason: 'payee_supply_proof' };
  return { ok: true, reason: null };
}
export function escrowActions(e: EscrowRow, viewer: AuthUser | undefined): string[] {
  if (!viewer) return [];
  const admin = viewer.role === 'admin';
  const payer = viewer.id === e.payer_id;
  const payee = viewer.id === e.payee_id;
  const proposer = e.created_by === viewer.id;
  const a: string[] = [];
  switch (e.status) {
    case 'proposed':
      if ((payer || payee) && !proposer) a.push('accept');
      if (payer || payee) a.push('cancel');
      break;
    case 'accepted':
      if (payer) a.push('fund');
      if (payer || payee) a.push('cancel');
      break;
    case 'funded':
    case 'in_inspection':
      if (payer) a.push('release', 'dispute');
      if (payee) a.push('refund');
      break;
    case 'disputed':
      if (admin) a.push('resolve');
      break;
  }
  if (['funded', 'in_inspection', 'released', 'refunded', 'resolved'].includes(e.status) && (payer || payee || admin)) a.push('receipt');
  return a;
}
export function toEscrowDto(e: EscrowRow, viewer?: AuthUser): Escrow & { rail: EscrowRail; cardFeeCents: number; disputeReasonCode: string | null; createdBy: string | null; createdAt: string; quote: EscrowQuote; orderId: string | null; resolutionPayeeCents: number | null; resolutionPayerCents: number | null; campusId: string | null } {
  const users = loadUsersPublic([e.payer_id, e.payee_id]);
  const events = q.all<{ id: string; from_status: string | null; to_status: string; actor_id: string | null; note: string | null; data_json: string; created_at: string }>('SELECT * FROM escrow_events WHERE escrow_id = ? ORDER BY created_at', [e.id]);
  const listing = entityCard('listing', e.listing_id, { viewerId: viewer?.id }) as ListingCard | null;
  const fallbackUser = (id: string): UserPublic => users.get(id) ?? ({ id, name: '—', role: 'student', trustLevel: 0, campusId: null, avatarUrl: null, bio: null, program: null, gradYear: null, languages: [], memberSince: e.created_at, badges: [], isPro: false } as unknown as UserPublic);
  return {
    id: e.id, listingId: e.listing_id, listing: listing ?? undefined, conversationId: e.conversation_id, payer: fallbackUser(e.payer_id), payee: fallbackUser(e.payee_id), amountCents: e.amount_cents, feeBps: e.fee_bps,
    feeCents: e.fee_cents, feePayer: e.fee_payer, status: e.status, moveInDate: e.move_in_date, inspectionHours: e.inspection_hours, inspectionDeadlineAt: e.inspection_deadline_at, fundedAt: e.funded_at,
    releasedAt: e.released_at, refundedAt: e.refunded_at, disputedAt: e.disputed_at, disputeReason: e.dispute_reason, resolution: e.resolution, resolvedAt: e.resolved_at, expiresAt: e.expires_at,
    events: events.map((ev): EscrowEvent => ({ id: ev.id, fromStatus: ev.from_status, toStatus: ev.to_status, actorId: ev.actor_id, note: ev.note, createdAt: ev.created_at })),
    actions: escrowActions(e, viewer), rail: e.rail ?? 'ach', cardFeeCents: e.card_fee_cents ?? 0, disputeReasonCode: e.dispute_reason_code, createdBy: e.created_by, createdAt: e.created_at,
    quote: quoteEscrowFee(e.amount_cents, e.fee_payer, e.rail ?? 'ach'), orderId: e.order_id, resolutionPayeeCents: e.resolution_payee_cents, resolutionPayerCents: e.resolution_payer_cents, campusId: e.campus_id,
  };
}
const ESCROW_TRANSITIONS: Record<string, Escrow['status'][]> = {
  proposed: ['accepted', 'cancelled', 'expired'],
  accepted: ['funded', 'cancelled'],
  funded: ['in_inspection', 'released', 'refunded', 'disputed'],
  in_inspection: ['released', 'refunded', 'disputed'],
  disputed: ['resolved'],
};
export type TransitionOpts = { actorId: string | null; note?: string | null; req?: Request | null; data?: Record<string, unknown>; resolution?: { kind: Escrow['resolution']; payeeCents: number; payerCents: number; reasonCode?: string | null } };
const STATUS_LABEL: Record<string, { zh: string; en: string }> = {
  proposed: { zh: '已发起', en: 'proposed' }, accepted: { zh: '已接受', en: 'accepted' }, funded: { zh: '已存入', en: 'funded' }, in_inspection: { zh: '验房期', en: 'in the inspection window' },
  released: { zh: '已放款', en: 'released' }, refunded: { zh: '已退款', en: 'refunded' }, disputed: { zh: '争议中', en: 'disputed' }, resolved: { zh: '已裁定', en: 'resolved' }, cancelled: { zh: '已取消', en: 'cancelled' }, expired: { zh: '已过期', en: 'expired' },
};
/** Single entry point for every state change: validates, applies money effects, appends escrow_events, posts the chat system message and notifies both parties. */
export function transitionEscrow(e: EscrowRow, to: Escrow['status'], opts: TransitionOpts): EscrowRow {
  const allowed = ESCROW_TRANSITIONS[e.status] ?? [];
  if (!allowed.includes(to)) throw invalidState(e.status, to);
  const t = nowIso();
  const req = opts.req ?? null;
  return q.tx(() => {
    const sets: string[] = ['status = ?', 'updated_at = ?'];
    const params: (string | number | null)[] = [to, t];
    const quote = quoteEscrowFee(e.amount_cents, e.fee_payer, e.rail ?? 'ach');
    const beforeInspection = e.status === 'funded' || e.status === 'accepted' || e.status === 'proposed';
    if (to === 'funded') {
      sets.push('funded_at = ?'); params.push(t);
      if (opts.data?.orderId) { sets.push('order_id = ?'); params.push(String(opts.data.orderId)); }
      // move-in already reached → straight into the inspection window on the next timer tick
    }
    if (to === 'in_inspection') {
      const deadline = new Date(Math.max(nowMs(), Date.parse(`${e.move_in_date}T00:00:00Z`)) + e.inspection_hours * HOUR).toISOString();
      sets.push('inspection_deadline_at = ?'); params.push(deadline);
    }
    if (to === 'released') {
      sets.push('released_at = ?'); params.push(t);
      ledgerAppend(e.payee_id, quote.payeeNetCents, 'topup', { refType: 'escrow', refId: e.id, note: 'secure_payment_release', req });
    }
    if (to === 'refunded') {
      sets.push('refunded_at = ?'); params.push(t);
      refundEscrowDeposit(e, e.amount_cents, beforeInspection ? quote.payerFeeCents : 0, req);
      if (beforeInspection && quote.payeeFeeCents > 0) ledgerAppend(e.payee_id, quote.payeeFeeCents, 'escrow_fee_rebate', { refType: 'escrow', refId: e.id, note: 'fee_rebate', req });
    }
    if (to === 'disputed') {
      sets.push('disputed_at = ?', 'dispute_reason = ?', 'dispute_reason_code = ?'); params.push(t, opts.note ?? null, (opts.data?.reasonCode as string | undefined) ?? null);
    }
    if (to === 'resolved' && opts.resolution) {
      const r = opts.resolution;
      sets.push('resolution = ?', 'resolution_payee_cents = ?', 'resolution_payer_cents = ?', 'resolved_by = ?', 'resolved_at = ?');
      params.push(r.kind, r.payeeCents, r.payerCents, opts.actorId, t);
      const fraud = ['fraud', 'not_on_lease', 'not_as_described'].includes(r.reasonCode ?? '');
      if (r.kind === 'release_to_payee') ledgerAppend(e.payee_id, quote.payeeNetCents, 'topup', { refType: 'escrow', refId: e.id, note: 'resolution_release', req });
      else if (r.kind === 'refund_to_payer') {
        refundEscrowDeposit(e, e.amount_cents, fraud ? quote.payerFeeCents : 0, req);
        if (fraud && quote.payeeFeeCents > 0) ledgerAppend(e.payee_id, quote.payeeFeeCents, 'escrow_fee_rebate', { refType: 'escrow', refId: e.id, note: 'fee_rebate', req });
      } else {
        if (r.payerCents > 0) refundEscrowDeposit(e, r.payerCents, 0, req);
        const payeeShare = Math.max(0, r.payeeCents - Math.round((quote.payeeFeeCents * r.payeeCents) / Math.max(1, e.amount_cents)));
        if (payeeShare > 0) ledgerAppend(e.payee_id, payeeShare, 'topup', { refType: 'escrow', refId: e.id, note: 'resolution_split', req });
      }
    }
    if (to === 'cancelled' || to === 'expired') { /* nothing funded yet */ }
    q.run(`UPDATE escrows SET ${sets.join(', ')} WHERE id = ?`, [...params, e.id]);
    q.run('INSERT INTO escrow_events (id, escrow_id, from_status, to_status, actor_id, note, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [uid(), e.id, e.status, to, opts.actorId, opts.note ?? null, JSON.stringify(opts.data ?? {}), t]);
    const label = STATUS_LABEL[to] ?? { zh: to, en: to };
    if (e.conversation_id) {
      try { postSystemMessage(e.conversation_id, 'escrow_state', { escrowId: e.id, status: to, amountCents: e.amount_cents }); } catch (err) { logger.warn({ err }, 'escrow system message failed'); }
    }
    for (const uidTo of [e.payer_id, e.payee_id]) {
      notify(uidTo, 'escrow.state', { title: { zh: `安心付：${label.zh}`, en: `Secure Payment ${label.en}` }, body: { zh: `押金 $${(e.amount_cents / 100).toFixed(0)}（测试模式）`, en: `Deposit $${(e.amount_cents / 100).toFixed(0)} (test mode)` }, link: `/escrow/${e.id}`, entityType: 'escrow', entityId: e.id, data: { status: to } });
    }
    const evName: Record<string, string> = { accepted: 'escrow.accept', funded: 'escrow.fund', released: 'escrow.release', refunded: 'escrow.refund', disputed: 'escrow.dispute', resolved: 'escrow.resolve', cancelled: 'escrow.cancel', expired: 'escrow.expire', in_inspection: 'escrow.inspection' };
    logEvent(req, evName[to] ?? `escrow.${to}`, { entityType: 'escrow', entityId: e.id, userId: opts.actorId ?? undefined, campusId: e.campus_id, props: { amountCents: e.amount_cents, feeCents: e.fee_cents, feePayer: e.fee_payer, rail: e.rail, state: to, resolution: opts.resolution?.kind ?? null, hoursHeld: e.funded_at ? Math.round((nowMs() - Date.parse(e.funded_at)) / HOUR) : null } });
    return requireEscrow(e.id);
  });
}
function refundEscrowDeposit(e: EscrowRow, amountCents: number, feeCents: number, req: Request | null): void {
  const order = e.order_id ? loadOrder(e.order_id) : undefined;
  const pay = order ? q.get<PaymentRow>("SELECT * FROM payments WHERE order_id = ? AND status IN ('succeeded','partially_refunded') ORDER BY created_at DESC LIMIT 1", [order.id]) : undefined;
  const t = nowIso();
  const total = amountCents + feeCents;
  if (pay) {
    const refundable = Math.min(total, pay.amount_cents - pay.refunded_cents);
    if (refundable > 0) {
      mockStripe.refund(pay.provider_charge_id, refundable);
      const newRefunded = pay.refunded_cents + refundable;
      q.run('UPDATE payments SET refunded_cents = ?, status = ?, updated_at = ? WHERE id = ?', [newRefunded, newRefunded >= pay.amount_cents ? 'refunded' : 'partially_refunded', t, pay.id]);
      if (order) q.run("UPDATE orders SET status = CASE WHEN ? >= total_cents THEN 'refunded' ELSE status END, updated_at = ? WHERE id = ?", [newRefunded, t, order.id]);
      return;
    }
  }
  // seeded / wallet-funded deposits: return the money as a wallet row so the ledger stays consistent
  if (total > 0) ledgerAppend(e.payer_id, total, 'refund', { refType: 'escrow', refId: e.id, note: 'secure_payment_refund', req });
}
/** Hourly timers: proposed → expired; funded → in_inspection at move-in; in_inspection → released 24 h after the deadline. */
export function escrowTimers(): { expired: number; inspecting: number; released: number } {
  const t = nowIso();
  const out = { expired: 0, inspecting: 0, released: 0 };
  for (const e of q.all<EscrowRow>("SELECT * FROM escrows WHERE status = 'proposed' AND expires_at IS NOT NULL AND expires_at <= ?", [t])) { transitionEscrow(e, 'expired', { actorId: null, note: 'proposal_expired' }); out.expired++; }
  for (const e of q.all<EscrowRow>("SELECT * FROM escrows WHERE status = 'funded' AND move_in_date IS NOT NULL")) {
    const tz = getCampus(e.campus_id)?.timezone ?? 'UTC';
    const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs()));
    if (e.move_in_date! <= todayLocal) { transitionEscrow(e, 'in_inspection', { actorId: null, note: 'move_in_reached' }); out.inspecting++; }
  }
  const releaseBefore = new Date(nowMs() - 24 * HOUR).toISOString();
  for (const e of q.all<EscrowRow>("SELECT * FROM escrows WHERE status = 'in_inspection' AND inspection_deadline_at IS NOT NULL AND inspection_deadline_at <= ?", [releaseBefore])) { transitionEscrow(e, 'released', { actorId: null, note: 'auto_release' }); out.released++; }
  return out;
}
export function createEscrow(user: AuthUser, input: { listingId: string; counterpartyId: string; role: 'payer' | 'payee'; amountCents: number; feePayer: Escrow['feePayer']; rail: EscrowRail; moveInDate: string; inspectionHours: number; note?: string }, req: Request | null): EscrowRow {
  const listing = q.get<{ id: string; owner_id: string; campus_id: string; status: string; title: string }>('SELECT id, owner_id, campus_id, status, title FROM listings WHERE id = ?', [input.listingId]);
  if (!listing) throw notFound('Listing');
  if (listing.status !== 'active') throw invalidState(listing.status, 'escrow');
  if (!isEnabled('escrow.enabled', listing.campus_id)) throw new ApiError('FEATURE_DISABLED', 'Secure Payment is not available at this campus yet');
  if (input.counterpartyId === user.id) throw new ApiError('BAD_REQUEST', 'Counterparty must be another user');
  const other = q.get<{ id: string; banned: number }>('SELECT id, banned FROM users WHERE id = ? AND deleted_at IS NULL', [input.counterpartyId]);
  if (!other || other.banned) throw notFound('User');
  const payerId = input.role === 'payer' ? user.id : input.counterpartyId;
  const payeeId = input.role === 'payer' ? input.counterpartyId : user.id;
  if (payeeId !== listing.owner_id && user.role !== 'admin') throw new ApiError('FORBIDDEN', 'The payee must be the listing host');
  // a proposal opens a thread and notifies the other side: same rules as messaging (blocks, a cap on open proposals)
  // and a host asking for money (role payee) must already be talking to that tenant — no "pay me a deposit" requests
  // pushed at strangers. A tenant paying the listing's host needs no prior thread (it is the listing's contact path).
  if (isBlockedEither(payerId, payeeId)) throw new ApiError('BLOCKED', 'You cannot start a Secure Payment with this user');
  if (user.role !== 'admin') {
    const talked = input.role === 'payer' ? true : !!q.get("SELECT 1 FROM conversations c JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ? JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = ? WHERE c.kind = 'direct' AND c.is_locked = 0 LIMIT 1", [payerId, payeeId]);
    if (!talked) throw new ApiError('FORBIDDEN', 'Message each other about this listing before proposing a Secure Payment', { data: { reason: 'no_conversation' } });
    const recipient = q.get<{ verified_only_messaging: number }>('SELECT verified_only_messaging FROM users WHERE id = ?', [input.counterpartyId]);
    if (recipient?.verified_only_messaging === 1 && user.trust_level < 1) throw new ApiError('VERIFIED_ONLY', 'This user accepts verified users only');
    const openByMe = q.count("SELECT COUNT(*) FROM escrows WHERE created_by = ? AND status = 'proposed'", [user.id]);
    if (openByMe >= 5) throw new ApiError('QUOTA_EXCEEDED', 'Too many open Secure Payment proposals', { data: { limit: 5, current: openByMe } });
  }
  const open = q.get<{ id: string }>("SELECT id FROM escrows WHERE listing_id = ? AND move_in_date = ? AND status IN ('proposed','accepted','funded','in_inspection','disputed')", [input.listingId, input.moveInDate]);
  if (open) throw new ApiError('CONFLICT', 'An open Secure Payment already exists for this listing and move-in date', { data: { escrowId: open.id } });
  const quote = quoteEscrowFee(input.amountCents, input.feePayer, input.rail);
  if (!quote.railAllowed) throw new ApiError('BAD_REQUEST', 'Card rail is limited to deposits under $500');
  let conversationId: string | null = null;
  try {
    const conv = openRawConversation({ kind: 'direct', memberIds: [payerId, payeeId], campusId: listing.campus_id, context: { type: 'listing', id: listing.id }, createdBy: user.id });
    conversationId = conv.conversation.id;
  } catch (err) { logger.warn({ err }, 'escrow conversation not opened'); }
  const t = nowIso();
  const id = uid();
  q.run(
    `INSERT INTO escrows (id, listing_id, campus_id, conversation_id, payer_id, payee_id, amount_cents, fee_bps, fee_cents, fee_payer, status, move_in_date, inspection_hours, expires_at, created_by, rail, card_fee_cents, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, listing.id, listing.campus_id, conversationId, payerId, payeeId, input.amountCents, quote.feeBps, quote.feeCents, input.feePayer, input.moveInDate, input.inspectionHours, new Date(nowMs() + 7 * DAY).toISOString(), user.id, input.rail, quote.railFeeCents, t, t],
  );
  q.run('INSERT INTO escrow_events (id, escrow_id, from_status, to_status, actor_id, note, data_json, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)', [uid(), id, 'proposed', user.id, input.note ?? null, JSON.stringify({ role: input.role }), t]);
  if (conversationId) {
    try {
      const card = contextCardFor('escrow', id);
      if (card) postContextCard(conversationId, user.id, card);
      postSystemMessage(conversationId, 'escrow_state', { escrowId: id, status: 'proposed', amountCents: input.amountCents });
    } catch (err) { logger.warn({ err }, 'escrow context card failed'); }
  }
  notify(input.counterpartyId, 'escrow.state', { title: { zh: '收到一笔安心付提议', en: 'You received a Secure Payment proposal' }, body: { zh: `「${listing.title}」押金 $${(input.amountCents / 100).toFixed(0)}，入住 ${input.moveInDate}。`, en: `"${listing.title}" deposit $${(input.amountCents / 100).toFixed(0)}, move-in ${input.moveInDate}.` }, link: `/escrow/${id}`, entityType: 'escrow', entityId: id });
  logEvent(req, 'escrow.propose', { entityType: 'escrow', entityId: id, campusId: listing.campus_id, props: { amountCents: input.amountCents, feeCents: quote.feeCents, feePayer: input.feePayer, rail: input.rail, state: 'proposed' } });
  return requireEscrow(id);
}

// ====================================================================== referrals
export function maskName(name: string): string {
  const s = name.trim();
  if (!s) return '***';
  const head = /[一-鿿]/.test(s[0]!) ? s.slice(0, 1) : s.slice(0, 2);
  return `${head}***`;
}
/** Referee reached L1 (or paid) → qualified → both wallet rows → rewarded (fraud cap: 10 per referrer per 30 d). */
export function qualifyReferral(referredId: string, rule: 'edu_verified' | 'first_payment' | 'first_post'): void {
  const r = q.get<{ id: string; referrer_id: string; referred_id: string; status: string; referrer_reward_cents: number; referred_reward_cents: number; code: string }>("SELECT * FROM referrals WHERE referred_id = ? AND status = 'pending'", [referredId]);
  if (!r) return;
  const referrer = q.get<{ banned: number }>('SELECT banned FROM users WHERE id = ?', [r.referrer_id]);
  if (!referrer || referrer.banned) return;
  const t = nowIso();
  q.run("UPDATE referrals SET status = 'qualified', qualified_at = ?, qualify_rule = ? WHERE id = ?", [t, rule, r.id]);
  logEvent(null, 'referral.qualified', { userId: r.referrer_id, entityType: 'referral', entityId: r.id, props: { code: r.code, rule } });
  const recent = q.count("SELECT COUNT(*) FROM referrals WHERE referrer_id = ? AND status = 'rewarded' AND rewarded_at >= ?", [r.referrer_id, new Date(nowMs() - 30 * DAY).toISOString()]);
  if (recent >= 10) return; // stays qualified for admin review
  q.tx(() => {
    const exp = new Date(nowMs() + 180 * DAY).toISOString();
    ledgerAppend(r.referrer_id, r.referrer_reward_cents, 'referral_reward', { refType: 'referral', refId: r.id, note: 'referral_reward', expiresAt: exp });
    ledgerAppend(r.referred_id, r.referred_reward_cents, 'referral_welcome', { refType: 'referral', refId: r.id, note: 'referral_welcome', expiresAt: exp });
    q.run("UPDATE referrals SET status = 'rewarded', rewarded_at = ? WHERE id = ?", [t, r.id]);
  });
  logEvent(null, 'referral.rewarded', { userId: r.referrer_id, entityType: 'referral', entityId: r.id, props: { code: r.code, rule, cents: r.referrer_reward_cents } });
  const referee = loadUserPublic(r.referred_id);
  notify(r.referrer_id, 'referral.rewarded', { title: { zh: '推荐奖励到账', en: 'Referral reward added' }, body: { zh: `${maskName(referee?.name ?? '')} 完成验证，你获得 $${(r.referrer_reward_cents / 100).toFixed(0)} 推广额度。`, en: `${maskName(referee?.name ?? '')} verified — $${(r.referrer_reward_cents / 100).toFixed(0)} boost credit is yours.` }, link: '/wallet', entityType: 'referral', entityId: r.id });
  notify(r.referred_id, 'referral.rewarded', { title: { zh: '欢迎礼到账', en: 'Welcome credit added' }, body: { zh: `你获得 $${(r.referred_reward_cents / 100).toFixed(0)} 推广额度，可用于推广你的发布。`, en: `$${(r.referred_reward_cents / 100).toFixed(0)} boost credit added to your wallet.` }, link: '/wallet', entityType: 'referral', entityId: r.id });
}
/** billing-requirements §6.3: the referrer earns a second credit when the referee publishes a first post within 30 days
 *  of signing up. Idempotent per referral (ledger note 'post_bonus'); only after the referral itself was rewarded. */
export function awardReferralPostBonus(userId: string, entityType: string, entityId: string): void {
  if (!isEnabled('referrals.enabled')) return;
  const r = q.get<{ id: string; referrer_id: string; code: string; created_at: string }>("SELECT id, referrer_id, code, created_at FROM referrals WHERE referred_id = ? AND status = 'rewarded'", [userId]);
  if (!r || Date.parse(r.created_at) < nowMs() - 30 * DAY) return;
  if (q.get("SELECT 1 FROM wallet_ledger WHERE ref_type = 'referral' AND ref_id = ? AND note = 'post_bonus'", [r.id])) return;
  const referrer = q.get<{ banned: number }>('SELECT banned FROM users WHERE id = ?', [r.referrer_id]);
  if (!referrer || referrer.banned) return;
  const cents = flagValue<{ postBonusCents?: number }>('referrals.enabled', {}).postBonusCents ?? 500;
  const dollars = (cents / 100).toFixed(0);
  ledgerAppend(r.referrer_id, cents, 'referral_reward', { refType: 'referral', refId: r.id, note: 'post_bonus', expiresAt: new Date(nowMs() + 180 * DAY).toISOString() });
  logEvent(null, 'referral.post_bonus', { userId: r.referrer_id, entityType: 'referral', entityId: r.id, props: { code: r.code, cents, postType: entityType, postId: entityId } });
  notify(r.referrer_id, 'referral.rewarded', { title: { zh: '推荐奖励：好友已发布', en: 'Referral bonus: your friend posted' }, body: { zh: '好友发布了第一条内容，你又获得 $' + dollars + ' 推广额度。', en: 'Your friend published their first post: another $' + dollars + ' of boost credit is yours.' }, link: '/wallet', entityType: 'referral', entityId: r.id });
}
let hooksBound = false;
export function bindBillingHooks(): void {
  if (hooksBound) return;
  hooksBound = true;
  hooks.on('user.trustChanged', ({ userId, to }) => { if (to >= 1) qualifyReferral(userId, 'edu_verified'); });
  hooks.on('content.published', ({ userId, entityType, entityId }) => { awardReferralPostBonus(userId, entityType, entityId); });
  hooks.on('user.banned', ({ userId, banned }) => {
    if (!banned) return;
    const t = nowIso();
    q.run("UPDATE boosts SET paused_at = COALESCE(paused_at, ?), updated_at = ? WHERE user_id = ? AND status = 'active'", [t, t, userId]);
  });
}
export function referralSummary(user: AuthUser): { code: string; shareUrl: string; rewardCents: number; stats: { invited: number; qualified: number; rewarded: number; earnedCents: number }; referrals: { user: { name: string; avatarUrl: string | null; trustLevel: number }; status: string; createdAt: string; rewardedAt: string | null }[] } {
  const rows = q.all<{ id: string; referred_id: string; status: string; created_at: string; rewarded_at: string | null; referrer_reward_cents: number }>('SELECT * FROM referrals WHERE referrer_id = ? ORDER BY created_at DESC', [user.id]);
  const users = loadUsersPublic(rows.map((r) => r.referred_id));
  const earned = q.get<{ s: number | null }>("SELECT SUM(delta_cents) AS s FROM wallet_ledger WHERE user_id = ? AND kind IN ('referral_reward') OR (user_id = ? AND kind = 'promo_credit' AND ref_type = 'referral')", [user.id, user.id])?.s ?? 0;
  return {
    code: user.referral_code, shareUrl: `/?ref=${user.referral_code}`, rewardCents: 500,
    stats: { invited: rows.length, qualified: rows.filter((r) => r.status === 'qualified' || r.status === 'rewarded').length, rewarded: rows.filter((r) => r.status === 'rewarded').length, earnedCents: earned },
    referrals: rows.map((r) => { const u = users.get(r.referred_id); return { user: { name: maskName(u?.name ?? ''), avatarUrl: u?.avatarUrl ?? null, trustLevel: u?.trustLevel ?? 0 }, status: r.status, createdAt: r.created_at, rewardedAt: r.rewarded_at }; }),
  };
}

// ====================================================================== partners (Newcomer Kit)
export type PartnerDto = Partner & { network: string | null; noSsnOk: boolean; stages: string[]; subcategory: string | null; feeFree: boolean; campusBranch: boolean; states: string[]; sortOrder: number; needs: string[] };
export function toPartnerDto(r: PartnerRow): PartnerDto {
  const rubric = parseJson<{ subcategory?: string; stages?: string[]; feeFree?: boolean; campusBranch?: boolean; needs?: string[] }>(r.rubric_json ?? '{}', {});
  const noSsnFresh = r.no_ssn_ok === 1 && !!r.no_ssn_verified_at && Date.parse(r.no_ssn_verified_at) >= nowMs() - 90 * DAY;
  const logo = r.logo_url ?? (r.logo_upload_id ? q.get<{ url: string }>('SELECT url FROM uploads WHERE id = ?', [r.logo_upload_id])?.url ?? null : null);
  return {
    id: r.id, slug: r.slug, name: r.name, nameZh: r.name_zh, category: r.category, tagline: r.tagline, taglineZh: r.tagline_zh, description: r.description, descriptionZh: r.description_zh,
    logoUrl: logo, websiteUrl: r.website_url, promoText: r.promo_text, promoTextZh: r.promo_text_zh, isSponsored: r.is_sponsored === 1, campusId: r.campus_id, goUrl: `/api/billing/partners/${r.slug}/go?placement=kit`,
    network: r.network, noSsnOk: noSsnFresh, stages: rubric.stages ?? [], subcategory: rubric.subcategory ?? null, feeFree: !!rubric.feeFree, campusBranch: !!rubric.campusBranch, states: parseJson<string[]>(r.states_json, []), sortOrder: r.sort_order, needs: rubric.needs ?? [],
  };
}
export const PARTNER_SELECT = 'SELECT p.*, u.url AS logo_url FROM partners p LEFT JOIN uploads u ON u.id = p.logo_upload_id';
export function loadPartner(slugOrId: string): PartnerRow | undefined {
  return q.get<PartnerRow>(`${PARTNER_SELECT} WHERE p.slug = ? OR p.id = ?`, [slugOrId, slugOrId]);
}
const STAGE_KEY: Record<string, string> = { pre_arrival: 'before_you_fly', arrival: 'first_7_days', settled: 'first_month' };
/** Nationwide + campus/state partners, grouped by category, ordered by sort_order (never by payout). */
export function listPartners(filter: { campusId?: string | null; state?: string | null; categories?: string[]; stage?: string | null }): { key: string; partners: PartnerDto[] }[] {
  const campus = filter.campusId ? getCampus(filter.campusId) : null;
  const state = filter.state ?? campus?.state ?? null;
  const rows = q.all<PartnerRow>(`${PARTNER_SELECT} WHERE p.is_active = 1 ORDER BY p.sort_order, p.name`);
  const stageKey = filter.stage ? STAGE_KEY[filter.stage] : null;
  const groups = new Map<string, PartnerDto[]>();
  for (const r of rows) {
    const states = parseJson<string[]>(r.states_json, []);
    const scoped = !r.campus_id && states.length === 0;
    const matches = scoped || (r.campus_id && r.campus_id === (filter.campusId ?? null)) || (states.length > 0 && state && states.includes(state));
    if (!matches) continue;
    if (filter.categories?.length && !filter.categories.includes(r.category)) continue;
    const dto = toPartnerDto(r);
    if (stageKey && dto.stages.length && !dto.stages.includes(stageKey)) continue;
    const list = groups.get(r.category) ?? [];
    list.push(dto);
    groups.set(r.category, list);
  }
  const order = ['bank', 'sim', 'insurance', 'other', 'movers', 'storage', 'furniture', 'airport_pickup', 'housing', 'food'];
  return order.filter((k) => groups.has(k)).map((key) => ({ key, partners: groups.get(key)! }));
}

// ====================================================================== admin revenue
export type RevenuePoint = { date: string; revenueCents: number; boostCents: number; proCents: number; escrowFeeCents: number; affiliateCents: number; sponsorCents: number; gmvCents: number; refundsCents: number; orders: number };
export function revenueSummary(filter: { from: string; to: string; campusId?: string | null; groupBy: 'day' | 'week' | 'month' }): { totals: { revenueCents: number; byKind: Record<string, number>; gmvCents: number; affiliateEstCents: number; affiliateRecognizedCents: number; refundsCents: number; walletContraCents: number; orders: number; payingUsers: number }; series: RevenuePoint[]; topCampuses: { campusId: string; campus: { id: string; shortName: string; city: string; state: string } | null; revenueCents: number }[]; byKind: { kind: string; revenueCents: number; orders: number }[] } {
  const fromIso = `${filter.from}T00:00:00.000Z`;
  const toIso = `${filter.to}T23:59:59.999Z`;
  const campusSql = filter.campusId ? ' AND campus_id = ?' : '';
  const cp = filter.campusId ? [filter.campusId] : [];
  const bucket = filter.groupBy === 'month' ? "substr(at, 1, 7) || '-01'" : filter.groupBy === 'week' ? "date(at, 'weekday 0', '-6 days')" : 'substr(at, 1, 10)';
  const rev = q.all<{ date: string; order_kind: string; revenue: number; refunded: number; n: number }>(`SELECT ${bucket} AS date, order_kind, SUM(revenue_cents) AS revenue, SUM(refunded_cents) AS refunded, COUNT(*) AS n FROM v_revenue WHERE at >= ? AND at <= ?${campusSql} GROUP BY date, order_kind ORDER BY date`, [fromIso, toIso, ...cp]);
  const clicks = q.all<{ date: string; est: number; n: number }>(`SELECT ${bucket.replace(/\bat\b/g, 'created_at')} AS date, SUM(CASE WHEN converted = 1 THEN payout_cents ELSE 0 END) AS est, COUNT(*) AS n FROM partner_clicks WHERE created_at >= ? AND created_at <= ?${campusSql} GROUP BY date`, [fromIso, toIso, ...cp]);
  const gmv = q.all<{ date: string; gmv: number }>(`SELECT ${bucket.replace(/\bat\b/g, 'funded_at')} AS date, SUM(amount_cents) AS gmv FROM escrows WHERE funded_at IS NOT NULL AND funded_at >= ? AND funded_at <= ?${campusSql} GROUP BY date`, [fromIso, toIso, ...cp]);
  const points = new Map<string, RevenuePoint>();
  const pt = (d: string) => { let p = points.get(d); if (!p) { p = { date: d, revenueCents: 0, boostCents: 0, proCents: 0, escrowFeeCents: 0, affiliateCents: 0, sponsorCents: 0, gmvCents: 0, refundsCents: 0, orders: 0 }; points.set(d, p); } return p; };
  // dense series
  const step = filter.groupBy === 'day' ? DAY : filter.groupBy === 'week' ? 7 * DAY : 0;
  if (step) for (let d = Date.parse(fromIso); d <= Date.parse(toIso); d += step) pt(new Date(d).toISOString().slice(0, 10));
  const byKind: Record<string, number> = {};
  let refunds = 0;
  let orders = 0;
  for (const r of rev) {
    const p = pt(r.date);
    p.revenueCents += r.revenue;
    p.orders += r.n;
    if (r.order_kind === 'boost') p.boostCents += r.revenue;
    else if (r.order_kind === 'subscription' || r.order_kind === 'subscription_renewal') p.proCents += r.revenue;
    else if (r.order_kind === 'escrow_deposit') p.escrowFeeCents += r.revenue;
    byKind[r.order_kind] = (byKind[r.order_kind] ?? 0) + r.revenue;
    orders += r.n;
  }
  // paid sponsored-placement invoices (sold by the team, invoiced outside checkout) count as revenue on their paid date
  const sponsorRows = q.all<{ date: string; s: number; n: number }>(`SELECT ${bucket.replace(/\bat\b/g, 'paid_at')} AS date, SUM(amount_cents) AS s, COUNT(*) AS n FROM sponsorship_invoices WHERE status = 'paid' AND paid_at >= ? AND paid_at <= ?${campusSql} GROUP BY date`, [fromIso, toIso, ...cp]);
  const sponsorOrders = sponsorRows.reduce((s, r) => s + r.n, 0);
  for (const r of sponsorRows) {
    const p = pt(r.date);
    p.revenueCents += r.s;
    p.sponsorCents += r.s;
    p.orders += r.n;
    byKind.sponsorship = (byKind.sponsorship ?? 0) + r.s;
    orders += r.n;
  }
  let affiliateEst = 0;
  for (const c of clicks) { const p = pt(c.date); p.affiliateCents += c.est; affiliateEst += c.est; }
  let gmvTotal = 0;
  for (const g of gmv) { pt(g.date).gmvCents += g.gmv; gmvTotal += g.gmv; }
  // v_revenue only carries succeeded/partially refunded payments; full refunds live on payments.refunded_cents
  const refundRows = q.all<{ date: string; r: number }>(`SELECT ${bucket.replace(/\bat\b/g, 'p.updated_at')} AS date, SUM(p.refunded_cents) AS r FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.refunded_cents > 0 AND p.updated_at >= ? AND p.updated_at <= ?${filter.campusId ? ' AND o.campus_id = ?' : ''} GROUP BY date`, [fromIso, toIso, ...cp]);
  refunds = 0;
  for (const r of refundRows) { pt(r.date).refundsCents = r.r; refunds += r.r; }
  const recognized = q.get<{ s: number | null }>(`SELECT SUM(payout_cents) AS s FROM partner_conversions WHERE status IN ('approved','paid') AND occurred_at >= ? AND occurred_at <= ?`, [fromIso, toIso])?.s ?? 0;
  const walletContra = q.get<{ s: number | null }>(`SELECT SUM(-delta_cents) AS s FROM wallet_ledger WHERE kind = 'order_payment' AND created_at >= ? AND created_at <= ?`, [fromIso, toIso])?.s ?? 0;
  const payingUsers = q.count(`SELECT COUNT(DISTINCT user_id) FROM v_revenue WHERE at >= ? AND at <= ?${campusSql}`, [fromIso, toIso, ...cp]);
  const top = q.all<{ campus_id: string | null; revenue: number }>(`SELECT campus_id, SUM(revenue_cents) AS revenue FROM v_revenue WHERE at >= ? AND at <= ? GROUP BY campus_id ORDER BY revenue DESC LIMIT 6`, [fromIso, toIso]);
  const series = [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
  const revenueTotal = series.reduce((s, p) => s + p.revenueCents, 0) + affiliateEst;
  return {
    totals: { revenueCents: revenueTotal, byKind, gmvCents: gmvTotal, affiliateEstCents: affiliateEst, affiliateRecognizedCents: recognized, refundsCents: refunds, walletContraCents: walletContra, orders, payingUsers },
    series,
    topCampuses: top.map((r) => { const c = r.campus_id ? getCampus(r.campus_id) : null; return { campusId: r.campus_id ?? 'none', campus: c ? { id: c.id, shortName: c.shortName, city: c.city, state: c.state } : null, revenueCents: r.revenue }; }),
    byKind: Object.entries(byKind).map(([kind, revenueCents]) => ({ kind, revenueCents, orders: kind === 'sponsorship' ? sponsorOrders : rev.filter((r) => r.order_kind === kind).reduce((s, r) => s + r.n, 0) })),
  };
}
