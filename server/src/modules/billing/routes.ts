// server/src/modules/billing/routes.ts — OWNED BY THE `billing` MODULE AGENT. Mounted at /api/billing (API.md §11).
// Sections: catalog · wallet/promo/payment methods · orders + mock Stripe · boosts · Landlord Pro · Secure Payment (escrows) ·
// referrals · Newcomer Kit partners · sponsor leads · admin. Static paths are declared before `/:id` routes.
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { ListingCard, UserPublic } from '@shared/types';
import { idParam } from '@shared/schemas/common';
import {
  AdminEscrowsQuery, AdminOrdersQuery, AdminRefundInput, BoostOptionsQuery, BoostsQuery, CancelSubscriptionInput, ChangePlanInput, EscrowCancelInput, EscrowDisputeInput, EscrowEligibilityQuery,
  EscrowFundInput, EscrowInput, EscrowNoteInput, EscrowQuoteQuery, EscrowResolveInput, EscrowsQuery, KitDoneInput, LeadPatch, OrderInput, OrdersQuery, PartnerClicksQuery, PartnerConvertedInput,
  PartnerGoQuery, PartnerInput, PartnerPatch, PartnersQuery, PayInput, PaymentMethodInput, PlanPatch, PlansQuery, ProAnalyticsQuery, ProLeadsQuery, PromoCodeInput, PromoCodePatch, PromoRedeemInput,
  PromoValidateInput, RevenueQuery, SponsorLeadInput, SponsoredQuery, SubscribeInput, WalletAdjustInput, WalletQuery, WebhookInput,
} from '@shared/schemas/billing';
import { q, uid, placeholders } from '../../db';
import { assertOwner, cookieOf, isAdmin, requireAdmin, requireAuth, requireFlag, requireTrust, trustError, ANON_COOKIE } from '../../lib/auth';
import { audit } from '../../lib/audit';
import { getCampus } from '../../lib/campuses';
import { ApiError, invalidState, notFound } from '../../lib/errors';
import { campusIdOf, ipHashOf, logEvent } from '../../lib/events';
import { isEnabled } from '../../lib/flags';
import { ok, pageWindow, paginated, parseBody, parseParams, parseQuery } from '../../lib/http';
import { notify } from '../../lib/notify';
import { checkRate, rateLimit } from '../../lib/ratelimit';
import { createReport } from '../../lib/reports';
import { listingCards, type ListingCardRow } from '../../lib/cards';
import { postSystemMessage } from '../../lib/conversations';
import { recomputeTrust } from '../../lib/trust';
import { DAY, nowIso, nowMs } from '../../lib/time';
import { loadUsersPublic } from '../../lib/users';
import { hasSupplyProof } from '../verify/service';
import { config } from '../../config';
import { mockStripe, verifyMockWebhook } from './mockStripe';
import { addSponsorshipInvoice, createSponsorship, liveSponsorships, loadSponsorship, patchSponsorship, recordSponsorClick, setInvoiceStatus, SponsorshipInput, SponsorshipInvoiceInput, SponsorshipPatch, SponsorshipsQuery, toSponsorshipAdminDto, type SponsorshipRow } from './sponsorships';
import type { AuthUser } from '../../lib/types';
import {
  activePlans, bindBillingHooks, changeSubscriptionPlan, boostStats, cancelBoost, cancelOrder, cancelSubscription, createEscrow, createOrder, currentBoost, currentSubscription, entityCard, entityEligibility, escrowPlan,
  estimatedReach, expiringSoon, hasUsedTrial, isProUser, latestPayment, ledgerAppend, listPartners, listPaymentMethods, loadBoost, loadEntity, loadEscrow, loadOrder, loadPartner, loadPlan, payOrder,
  payeeEligible, planLock, quoteEscrowFee, recordClick, redeemWalletPromo, referralSummary, refundOrder, repriceOrder, requireEscrow, requireOrder, requirePlan, resumeSubscription, revenueSummary,
  savePaymentMethod, settleOrder, sponsoredCards, toPartyOrderDto, toBoostDto, toEscrowDto, toLedgerDto, toOrderDto, toPartnerDto, toPaymentMethodDto, toPlanDto, toPromoDto, toSubscriptionDto,
  transitionEscrow, validatePromo, walletBalance, PARTNER_SELECT, type BoostRow, type EscrowRow, type LedgerRow, type OrderRow, type PartnerRow, type PaymentMethodRow, type PlanRow, type PromoRow, type SubscriptionRow,
} from './service';

bindBillingHooks();

const router = Router();
const writes = rateLimit('writes');
const slugParam = z.object({ slug: z.string().min(1).max(80) });

function me(req: Request): AuthUser {
  return req.user as AuthUser;
}
function userCards(ids: string[]): Map<string, UserPublic> {
  return loadUsersPublic(ids);
}

// ====================================================================== 11.1 catalog & pricing page
router.get('/', (_req, res) => ok(res, { module: 'billing', status: 'ok' }));

router.get('/plans', (req, res) => {
  const p = parseQuery(req, PlansQuery);
  ok(res, activePlans({ kind: p.kind, entityType: p.entityType }));
});

router.get('/pricing', (req, res) => {
  const plans = activePlans();
  const boostsByEntity = new Map<string, Map<string, ReturnType<typeof toPlanDto>[]>>();
  for (const p of plans) {
    if (p.kind !== 'boost' || !p.entityType || !p.tier) continue;
    const tiers = boostsByEntity.get(p.entityType) ?? new Map<string, ReturnType<typeof toPlanDto>[]>();
    const list = tiers.get(p.tier) ?? [];
    list.push(p);
    tiers.set(p.tier, list);
    boostsByEntity.set(p.entityType, tiers);
  }
  const escrow = plans.find((p) => p.key === 'escrow.standard') ?? null;
  const partnerCount = q.count('SELECT COUNT(*) FROM partners WHERE is_active = 1');
  const campusId = campusIdOf(req);
  logEvent(req, 'pricing.view', { props: { campusId } });
  ok(res, {
    boosts: [...boostsByEntity.entries()].map(([entityType, tiers]) => ({ entityType, tiers: [...tiers.entries()].map(([tier, list]) => ({ tier, plans: list })) })),
    addons: plans.filter((p) => p.addonFor),
    packs: plans.filter((p) => p.key.startsWith('pack.')),
    pro: plans.filter((p) => p.kind === 'subscription'),
    escrow,
    sponsor: plans.filter((p) => p.kind === 'service' && !p.selfServe && (p.key.startsWith('sponsor.') || p.key.startsWith('building.'))),
    kit: { partnerCount },
    flags: { boosts: isEnabled('boosts.enabled', campusId), pro: isEnabled('pro.enabled', campusId), escrow: isEnabled('escrow.enabled', campusId), affiliate: isEnabled('affiliate.enabled', campusId) },
    alwaysFree: ['verification', 'badges', 'reporting', 'scamWarnings', 'browsing', 'posting', 'messaging'],
    faq: ['ranking', 'refund', 'badge', 'secureFee', 'kit', 'testMode'],
    foundingUntil: '2027-02-28T23:59:59Z',
    trialDays: 14,
  });
});

// ====================================================================== wallet, promo, payment methods
router.get('/wallet', requireAuth, (req, res) => {
  const p = parseQuery(req, WalletQuery);
  const user = me(req);
  const { limit, offset } = pageWindow(p);
  const where = p.kind ? 'user_id = ? AND kind = ?' : 'user_id = ?';
  const params = p.kind ? [user.id, p.kind] : [user.id];
  const total = q.count(`SELECT COUNT(*) FROM wallet_ledger WHERE ${where}`, params);
  const rows = q.all<LedgerRow>(`SELECT * FROM wallet_ledger WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const soon = expiringSoon(user.id);
  ok(res, { balanceCents: walletBalance(user.id), expiringSoonCents: soon.cents, expiringAt: soon.at, entries: { items: rows.map(toLedgerDto), total, page: p.page, pageSize: p.pageSize }, payoutPendingCents: q.get<{ s: number | null }>("SELECT SUM(delta_cents) AS s FROM wallet_ledger WHERE user_id = ? AND kind = 'topup'", [user.id])?.s ?? 0 });
});

router.get('/payment-methods', requireAuth, (req, res) => ok(res, listPaymentMethods(me(req).id)));
router.post('/payment-methods', requireAuth, writes, (req, res) => {
  const body = parseBody(req, PaymentMethodInput);
  const row = savePaymentMethod(me(req).id, body, { setDefault: body.setDefault });
  recomputeTrust(me(req).id, 'payment_method_added');
  ok(res, toPaymentMethodDto(row), 201);
});
router.post('/payment-methods/:id/default', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const pm = q.get<PaymentMethodRow>('SELECT * FROM payment_methods WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!pm) throw notFound('Payment method');
  assertOwner(req, pm.user_id);
  q.tx(() => {
    q.run('UPDATE payment_methods SET is_default = 0 WHERE user_id = ?', [pm.user_id]);
    q.run('UPDATE payment_methods SET is_default = 1 WHERE id = ?', [id]);
  });
  ok(res, toPaymentMethodDto({ ...pm, is_default: 1 }));
});
router.delete('/payment-methods/:id', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const pm = q.get<PaymentMethodRow>('SELECT * FROM payment_methods WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!pm) throw notFound('Payment method');
  assertOwner(req, pm.user_id);
  if (q.count("SELECT COUNT(*) FROM subscriptions WHERE payment_method_id = ? AND status IN ('trialing','active','past_due')", [id]) > 0) throw new ApiError('CONFLICT', 'An active subscription uses this card');
  q.run('UPDATE payment_methods SET deleted_at = ?, is_default = 0 WHERE id = ?', [nowIso(), id]);
  if (q.count('SELECT COUNT(*) FROM payment_methods WHERE user_id = ? AND deleted_at IS NULL', [pm.user_id]) === 0) q.run('UPDATE users SET payment_verified_at = NULL WHERE id = ?', [pm.user_id]);
  recomputeTrust(pm.user_id, 'payment_method_removed');
  ok(res, null);
});

router.post('/promo/validate', requireAuth, (req, res) => {
  const body = parseBody(req, PromoValidateInput);
  const plan = body.planId ? loadPlan(body.planId) : undefined;
  try {
    const v = validatePromo(me(req), body.code, { orderKind: body.orderKind, planKeys: plan ? [plan.key] : [], subtotalCents: body.subtotalCents ?? plan?.price_cents ?? 0 });
    logEvent(req, 'promo.apply', { entityType: 'promo_code', entityId: v.promo.id, props: { code: v.promo.code, ok: true } });
    ok(res, { valid: true, kind: v.promo.kind, value: v.promo.value, discountCents: v.discountCents, code: v.promo.code, description: v.promo.kind === 'percent_off' ? `${v.promo.value}% off` : v.promo.kind === 'fixed_off' ? `$${(v.promo.value / 100).toFixed(2)} off` : `$${(v.promo.value / 100).toFixed(2)} credit` });
  } catch (e) {
    if (e instanceof ApiError && e.code === 'PROMO_INVALID') logEvent(req, 'promo.apply', { entityType: 'promo_code', props: { code: body.code.toUpperCase(), ok: false, reason: (e.data as { reason?: string })?.reason } });
    throw e;
  }
});
router.post('/promo/redeem', requireAuth, writes, (req, res) => {
  const body = parseBody(req, PromoRedeemInput);
  ok(res, redeemWalletPromo(me(req), body.code, req));
});

// ====================================================================== 11.2 orders & checkout
router.post('/orders', requireAuth, writes, (req, res) => {
  const body = parseBody(req, OrderInput);
  const user = me(req);
  if (body.kind === 'boost') {
    if (!body.planId || !body.entityType || !body.entityId) throw new ApiError('VALIDATION', 'planId, entityType and entityId are required', { fields: { planId: 'required' } });
    const plan = requirePlan(body.planId);
    const isPack = plan.key === 'pack.moving_out';
    if (!(plan.kind === 'boost' || isPack)) throw new ApiError('BAD_REQUEST', 'Not a boost plan');
    const e = requireEntityForBoost(user, body.entityType, body.entityId);
    if (!isPack && plan.entity_type !== body.entityType) throw new ApiError('BAD_REQUEST', 'Plan does not match the entity type');
    const elig = entityEligibility(user, e);
    if (!elig.eligible) throw eligibilityError(elig, user);
    const lock = planLock(plan, user, elig.supplyProof);
    if (lock === 'TRUST_REQUIRED') throw trustError(user, plan.min_trust ?? 1);
    if (lock) throw new ApiError('FORBIDDEN', 'Upload your lease or ownership proof to unlock this tier', { data: { reason: lock, nextStep: 'lease_proof' } });
    if (isPack && !q.get("SELECT 1 FROM market_bundles WHERE listing_id = ? AND status = 'active'", [e.id])) throw new ApiError('BAD_REQUEST', 'The moving-out pack needs a move-out bundle linked to this listing', { data: { reason: 'billing.boost.ineligible.bundle' } });
    const addons: PlanRow[] = [];
    for (const key of body.addons ?? []) {
      const a = loadPlan(key);
      if (!a || !a.addon_for || a.is_active !== 1) throw new ApiError('BAD_REQUEST', `Unknown add-on ${key}`);
      if (body.entityType !== 'listing') throw new ApiError('BAD_REQUEST', 'Spotlight applies to sublet listings only', { data: { reason: 'billing.boost.ineligible.addon' } });
      const lockA = planLock(a, user, elig.supplyProof);
      if (lockA) throw new ApiError('FORBIDDEN', 'Add-on locked', { data: { reason: lockA, nextStep: 'lease_proof' } });
      addons.push(a);
    }
    const subtotal = plan.price_cents + addons.reduce((s, a) => s + a.price_cents, 0);
    const metadata: Record<string, unknown> = { nationwide: addons.some((a) => a.key === 'boost.listing.spotlight'), entityTitle: e.title };
    if (isPack) metadata.fulfils = ['boost.listing.basic.14d', 'boost.bundle.basic.7d'];
    logEvent(req, 'boost.tier_selected', { entityType: e.type, entityId: e.id, props: { planKey: plan.key, addons: addons.map((a) => a.key) } });
    const order = createOrder(user, { kind: 'boost', plan, entityType: e.type, entityId: e.id, campusId: e.campusId, subtotalCents: subtotal, addons, promoCode: body.promoCode, useWallet: body.useWallet, metadata, surface: body.surface }, req);
    return ok(res, toOrderDto(order, { checkout: true }), 201);
  }
  if (body.kind === 'subscription') {
    const result = startSubscription(user, { planId: body.planId ?? 'pro.monthly', trial: body.trial, promoCode: body.promoCode }, req);
    return ok(res, toOrderDto(result.order, { checkout: true }), 201);
  }
  // escrow_deposit
  if (!body.escrowId) throw new ApiError('VALIDATION', 'escrowId is required', { fields: { escrowId: 'required' } });
  const escrow = requireEscrow(body.escrowId);
  if (escrow.payer_id !== user.id) throw new ApiError('FORBIDDEN', 'Only the payer funds a Secure Payment');
  const order = createEscrowOrder(user, escrow, body.promoCode, req);
  ok(res, toOrderDto(order, { checkout: true }), 201);
});
function requireEntityForBoost(user: AuthUser, type: 'listing' | 'market_item' | 'buddy_post', id: string) {
  const e = loadEntity(type, id);
  if (!e) throw notFound('Entity');
  if (e.ownerId !== user.id && user.role !== 'admin') throw new ApiError('FORBIDDEN', 'You can only boost your own posts');
  return e;
}
function eligibilityError(elig: ReturnType<typeof entityEligibility>, user: AuthUser): ApiError {
  if (elig.reason === 'TRUST_REQUIRED') return trustError(user, 1);
  if (elig.reason === 'FEATURE_DISABLED') return new ApiError('FEATURE_DISABLED', 'Boosts are off at this campus');
  if (elig.reason === 'FORBIDDEN') return new ApiError('FORBIDDEN', 'Not the owner');
  return new ApiError('INVALID_STATE', 'This post cannot be boosted right now', { data: { reason: elig.reason } });
}
function createEscrowOrder(user: AuthUser, escrow: EscrowRow, promoCode: string | undefined, req: Request | null): OrderRow {
  if (escrow.status !== 'accepted') throw invalidState(escrow.status, 'funded');
  if (user.trust_level < 3 && user.role !== 'admin') throw trustError(user, 3);
  const pe = payeeEligible(escrow.payee_id);
  if (!pe.ok) {
    if (escrow.conversation_id) {
      try { postSystemMessage(escrow.conversation_id, 'escrow_payee_nudge', { escrowId: escrow.id }); } catch { /* best effort */ }
    }
    notify(escrow.payee_id, 'escrow.state', { title: { zh: '完成房东验证即可收取安心付', en: 'Verify your lease or ownership to receive Secure Payments' }, body: { zh: '对方已准备付款，验证通常 24 小时内完成。', en: 'Your tenant is ready to pay; review usually takes under 24 hours.' }, link: '/verify', entityType: 'escrow', entityId: escrow.id });
    throw new ApiError('FORBIDDEN', 'The host is not eligible to receive Secure Payments yet', { data: { reason: pe.reason } });
  }
  const existing = q.get<OrderRow>("SELECT * FROM orders WHERE kind = 'escrow_deposit' AND entity_id = ? AND status IN ('awaiting_payment','failed') ORDER BY created_at DESC LIMIT 1", [escrow.id]);
  if (existing) return existing;
  const quote = quoteEscrowFee(escrow.amount_cents, escrow.fee_payer, escrow.rail ?? 'ach');
  const plan = escrowPlan() ?? null;
  return createOrder(user, { kind: 'escrow_deposit', plan, entityType: 'escrow', entityId: escrow.id, campusId: escrow.campus_id, subtotalCents: escrow.amount_cents, feeCents: quote.payerFeeCents + quote.railFeeCents, promoCode, useWallet: false, metadata: { rail: escrow.rail, railFeeCents: quote.railFeeCents, listingId: escrow.listing_id }, surface: 'escrow' }, req);
}
function startSubscription(user: AuthUser, input: { planId: string; trial?: boolean; promoCode?: string; paymentMethodId?: string }, req: Request | null): { order: OrderRow; subscription: SubscriptionRow | null } {
  if (!isEnabled('pro.enabled', user.campus_id)) throw new ApiError('FEATURE_DISABLED', 'Landlord Pro is not available yet');
  if (user.trust_level < 3 && user.role !== 'admin') throw trustError(user, 3);
  if (!hasSupplyProof(user.id) && user.role !== 'admin') throw new ApiError('TRUST_REQUIRED', 'Verify as owner or manager first', { data: { required: 3, current: user.trust_level, nextStep: 'landlord_proof' } });
  const plan = requirePlan(input.planId);
  if (plan.kind !== 'subscription' || plan.is_active !== 1) throw new ApiError('BAD_REQUEST', 'Not a subscription plan');
  if (currentSubscription(user.id)) throw new ApiError('CONFLICT', 'You already have an active subscription');
  const trial = !!input.trial && !hasUsedTrial(user.id);
  if (trial && listPaymentMethods(user.id).length === 0 && !input.paymentMethodId) throw new ApiError('BAD_REQUEST', 'A card on file is required to start the trial', { data: { reason: 'card_required' } });
  const promoMeta = input.promoCode?.toUpperCase() === 'FOUNDING50' ? { promo_renewals_left: 11 } : {};
  const order = createOrder(user, { kind: 'subscription', plan, entityType: 'subscription', subtotalCents: trial ? 0 : plan.price_cents, promoCode: trial ? undefined : input.promoCode, useWallet: false, metadata: { trial, paymentMethodId: input.paymentMethodId ?? null, ...promoMeta }, surface: 'pro' }, req);
  return { order: requireOrder(order.id), subscription: currentSubscription(user.id) ?? null };
}

router.get('/orders', requireAuth, (req, res) => {
  const p = parseQuery(req, OrdersQuery);
  const { limit, offset } = pageWindow(p);
  const where: string[] = ['user_id = ?'];
  const params: (string | number)[] = [me(req).id];
  if (p.kind) { where.push('kind = ?'); params.push(p.kind); }
  if (p.status) { where.push('status = ?'); params.push(p.status); }
  const total = q.count(`SELECT COUNT(*) FROM orders WHERE ${where.join(' AND ')}`, params);
  const rows = q.all<OrderRow>(`SELECT * FROM orders WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  paginated(res, { items: rows.map((r) => toOrderDto(r)), total, page: p.page, pageSize: p.pageSize });
});
router.get('/orders/:id', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const o = requireOrder(id);
  assertOwner(req, o.user_id);
  const dto = toOrderDto(o, { withPayments: true });
  const entity = o.entity_type && o.entity_id && (o.entity_type === 'listing' || o.entity_type === 'market_item' || o.entity_type === 'buddy_post') ? entityCard(o.entity_type, o.entity_id, { viewerId: req.user?.id }) : null;
  const escrow = o.kind === 'escrow_deposit' && o.entity_id ? loadEscrow(o.entity_id) : undefined;
  const boosts = o.kind === 'boost' ? q.all<BoostRow>('SELECT * FROM boosts WHERE order_id = ?', [o.id]).map((b) => toBoostDto(b)) : [];
  ok(res, { ...dto, entity, escrow: escrow ? toEscrowDto(escrow, req.user) : null, boosts, paymentMethods: listPaymentMethods(o.user_id), walletBalanceCents: walletBalance(o.user_id) });
});
router.post('/orders/:id/pay', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, PayInput);
  let o = requireOrder(id);
  assertOwner(req, o.user_id);
  if (body.useWallet !== undefined) o = repriceOrder(me(req), o, body.useWallet);
  if (o.total_cents === 0) {
    const pay = latestPayment(o.id);
    if (pay && pay.status !== 'succeeded') q.run("UPDATE payments SET provider = 'wallet', status = 'succeeded', amount_cents = 0, succeeded_at = ?, updated_at = ? WHERE id = ?", [nowIso(), nowIso(), pay.id]);
    const settled = settleOrder(o, { ...pay!, provider: 'wallet', status: 'succeeded' }, req);
    return ok(res, toOrderDto(settled));
  }
  const paid = 'card' in body ? payOrder(me(req), o, { card: body.card }, req) : payOrder(me(req), o, { paymentMethodId: body.paymentMethodId }, req);
  ok(res, toOrderDto(paid));
});
router.post('/orders/:id/cancel', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const o = requireOrder(id);
  assertOwner(req, o.user_id);
  ok(res, toOrderDto(cancelOrder(o)));
});
// Mock provider webhook: mounted only outside production (or with BILLING_MOCK=1) and only for events signed with the
// mock webhook secret (`Mock-Stripe-Signature`, see mockStripe.signMockWebhook). Unsigned events are rejected.
if (config.billingMock) router.post('/mock-stripe/webhook', (req, res) => {
  const body = parseBody(req, WebhookInput);
  if (!verifyMockWebhook(body.type, body.intentId, req.get('mock-stripe-signature'))) throw new ApiError('UNAUTHORIZED', 'Invalid webhook signature');
  const pay = q.get<{ id: string; order_id: string; status: string; provider: string }>("SELECT id, order_id, status, provider FROM payments WHERE provider_intent_id = ? AND provider = 'mock_stripe'", [body.intentId]);
  if (!pay) throw notFound('Payment intent');
  const o = requireOrder(pay.order_id);
  if (body.type === 'payment_intent.succeeded' && ['awaiting_payment', 'failed'].includes(o.status)) {
    const t = nowIso();
    q.run("UPDATE payments SET status = 'succeeded', provider_charge_id = COALESCE(provider_charge_id, ?), succeeded_at = ?, updated_at = ? WHERE id = ?", [mockStripe.chargeFor(body.intentId), t, t, pay.id]);
    settleOrder(o, { ...(latestPayment(o.id)!), status: 'succeeded' }, req);
  } else if (body.type === 'payment_intent.payment_failed' && o.status === 'awaiting_payment') {
    q.run("UPDATE payments SET status = 'failed', failure_code = ?, updated_at = ? WHERE id = ?", [body.failureCode ?? 'card_declined', nowIso(), pay.id]);
    q.run("UPDATE orders SET status = 'failed', updated_at = ? WHERE id = ?", [nowIso(), o.id]);
  }
  ok(res, { received: true });
});

// ====================================================================== 11.3 boosts
router.get('/boosts/sponsored', (req, res) => {
  const p = parseQuery(req, SponsoredQuery);
  const campus = p.campusId ? getCampus(p.campusId) : null;
  const items = sponsoredCards({ entityType: p.entityType, campusId: p.campusId ?? null, city: p.city ?? campus?.city ?? null, state: p.state ?? campus?.state ?? null, slots: p.limit, tier: p.tier, viewerId: req.user?.id }, req);
  ok(res, { items });
});
router.get('/boosts/options', requireAuth, (req, res) => {
  const p = parseQuery(req, BoostOptionsQuery);
  const user = me(req);
  const e = loadEntity(p.entityType, p.entityId);
  if (!e) throw notFound('Entity');
  if (e.ownerId !== user.id && user.role !== 'admin') throw new ApiError('FORBIDDEN', 'Not the owner');
  const elig = entityEligibility(user, e);
  const plans = activePlans({ entityType: p.entityType, selfServe: true }).filter((pl) => pl.kind === 'boost' || pl.key === 'pack.moving_out' || pl.addonFor);
  const planRows = plans.map((pl) => ({ plan: pl, row: requirePlan(pl.id) }));
  const bundle = p.entityType === 'listing' ? q.get<{ id: string; item_count: number }>("SELECT id, item_count FROM market_bundles WHERE listing_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1", [e.id]) : undefined;
  const cur = currentBoost(p.entityType, p.entityId);
  logEvent(req, 'boost.options_viewed', { entityType: e.type, entityId: e.id, props: { eligible: elig.eligible, reason: elig.reason, surface: p.surface ?? 'owner_panel' } });
  ok(res, {
    entity: entityCard(p.entityType, p.entityId, { viewerId: user.id }),
    entityTitle: e.title,
    plans: planRows.map(({ plan, row }) => ({ ...plan, lock: plan.key === 'pack.moving_out' && !bundle ? 'billing.boost.ineligible.bundle' : planLock(row, user, elig.supplyProof), estimatedReach: estimatedReach(e, plan.tier ?? 'basic') })),
    currentBoost: cur ? toBoostDto(cur) : null,
    estimatedReach: estimatedReach(e),
    eligible: elig.eligible,
    reason: elig.reason,
    nextStep: elig.nextStep ?? null,
    supplyProof: elig.supplyProof,
    trustLevel: user.trust_level,
    walletBalanceCents: walletBalance(user.id),
    bundle: bundle ? { id: bundle.id, itemCount: bundle.item_count } : null,
  });
});
router.get('/boosts', requireAuth, (req, res) => {
  const p = parseQuery(req, BoostsQuery);
  const { limit, offset } = pageWindow(p);
  const where: string[] = ['user_id = ?'];
  const params: (string | number)[] = [me(req).id];
  if (p.status === 'ended') where.push("status IN ('expired','cancelled','refunded')");
  else if (p.status) { where.push('status = ?'); params.push(p.status); }
  const total = q.count(`SELECT COUNT(*) FROM boosts WHERE ${where.join(' AND ')}`, params);
  const rows = q.all<BoostRow>(`SELECT * FROM boosts WHERE ${where.join(' AND ')} ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, ends_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const items = rows.map((b) => toBoostDto(b, { plan: b.plan_id ? toPlanDto(requirePlan(b.plan_id)) : undefined, entity: entityCard(b.entity_type, b.entity_id, { viewerId: req.user?.id }) ?? undefined }));
  const counts = { active: q.count("SELECT COUNT(*) FROM boosts WHERE user_id = ? AND status = 'active'", [me(req).id]), scheduled: q.count("SELECT COUNT(*) FROM boosts WHERE user_id = ? AND status = 'scheduled'", [me(req).id]), ended: q.count("SELECT COUNT(*) FROM boosts WHERE user_id = ? AND status IN ('expired','cancelled','refunded')", [me(req).id]) };
  paginated(res, { items, total, page: p.page, pageSize: p.pageSize }, { counts });
});
router.get('/boosts/:id/stats', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const b = loadBoost(id);
  if (!b) throw notFound('Boost');
  assertOwner(req, b.user_id);
  ok(res, { ...boostStats(b), boost: toBoostDto(b) });
});
router.post('/boosts/:id/cancel', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const b = loadBoost(id);
  if (!b) throw notFound('Boost');
  assertOwner(req, b.user_id);
  const r = cancelBoost(b, isAdmin(req) && b.user_id !== req.user?.id ? 'admin' : 'owner', req);
  ok(res, { ...toBoostDto(r.boost), refundCents: r.refundCents });
});
router.post('/boosts/:id/click', (req, res) => {
  const { id } = parseParams(req, idParam);
  const b = loadBoost(id);
  if (!b) throw notFound('Boost');
  // dedupe on the network address (+ user): the anonymous session id is fresh for every cookieless request
  checkRate(`boostclick:${ipHashOf(req)}:${req.user?.id ?? 'anon'}:${id}`, 5, 60_000);
  if (b.status !== 'active' || (req.user && req.user.id === b.user_id)) return ok(res, { ok: true, counted: false });
  recordClick(id, req);
  ok(res, { ok: true });
});

// ====================================================================== 11.4 Landlord Pro
const PRO_PERKS = ['unlimitedListings', 'leadInbox', 'analytics', 'badge', 'monthlyBoost', 'prioritySupport'];
router.get('/subscription', requireAuth, (req, res) => {
  const user = me(req);
  const sub = currentSubscription(user.id);
  const gate = { trustOk: user.trust_level >= 3 || user.role === 'admin', supplyProof: hasSupplyProof(user.id) || user.role === 'admin', trialUsed: hasUsedTrial(user.id), hasCard: listPaymentMethods(user.id).length > 0 };
  const invoices = q.all<OrderRow>("SELECT * FROM orders WHERE user_id = ? AND kind IN ('subscription','subscription_renewal') ORDER BY created_at DESC LIMIT 12", [user.id]).map((o) => toOrderDto(o));
  ok(res, { subscription: sub ? toSubscriptionDto(sub) : null, isPro: isProUser(user), proUntil: user.pro_until, perks: PRO_PERKS, gate, plans: activePlans({ kind: 'subscription' }), invoices, listingQuota: user.listing_quota, activeListings: q.count("SELECT COUNT(*) FROM listings WHERE owner_id = ? AND status = 'active'", [user.id]) });
});
router.post('/subscription', requireAuth, writes, (req, res) => {
  const body = parseBody(req, SubscribeInput);
  const r = startSubscription(me(req), body, req);
  ok(res, { subscription: r.subscription ? toSubscriptionDto(r.subscription) : null, order: toOrderDto(r.order, { checkout: true }) }, 201);
});
router.post('/subscription/cancel', requireAuth, writes, (req, res) => {
  const body = parseBody(req, CancelSubscriptionInput);
  const sub = currentSubscription(me(req).id);
  if (!sub) throw notFound('Subscription');
  const immediately = !!body.immediately && isAdmin(req);
  ok(res, toSubscriptionDto(cancelSubscription(sub, immediately, req)));
});
router.post('/subscription/resume', requireAuth, writes, (req, res) => {
  const sub = currentSubscription(me(req).id);
  if (!sub) throw notFound('Subscription');
  ok(res, toSubscriptionDto(resumeSubscription(sub)));
});
router.post('/subscription/change-plan', requireAuth, writes, (req, res) => {
  const body = parseBody(req, ChangePlanInput);
  const sub = currentSubscription(me(req).id);
  if (!sub) throw notFound('Subscription');
  const plan = requirePlan(body.planId);
  // upgrades return an order to pay (plan switches on payment); downgrades are scheduled for the period end
  const r = changeSubscriptionPlan(me(req), sub, plan, req);
  ok(res, { ...toSubscriptionDto(r.subscription), order: r.order ? toOrderDto(r.order, { checkout: true }) : null });
});
router.get('/subscription/invoices', requireAuth, (req, res) => {
  ok(res, q.all<OrderRow>("SELECT * FROM orders WHERE user_id = ? AND kind IN ('subscription','subscription_renewal') ORDER BY created_at DESC", [me(req).id]).map((o) => toOrderDto(o)));
});
function requirePro(req: Request): AuthUser {
  const user = me(req);
  if (!isProUser(user)) throw new ApiError('FORBIDDEN', 'Landlord Pro required', { data: { upsell: 'pro' } });
  return user;
}
router.get('/pro/analytics', requireAuth, (req, res) => {
  const user = requirePro(req);
  const p = parseQuery(req, ProAnalyticsQuery);
  const since = new Date(nowMs() - p.days * DAY).toISOString();
  const listings = q.all<{ id: string; title: string; status: string; view_count: number; save_count: number; lead_count: number; boosted_until: string | null }>("SELECT id, title, status, view_count, save_count, lead_count, boosted_until FROM listings WHERE owner_id = ? AND status <> 'removed' ORDER BY view_count DESC", [user.id]);
  const ids = listings.map((l) => l.id);
  const viewsIn = ids.length ? q.all<{ entity_id: string; n: number }>(`SELECT entity_id, COUNT(*) AS n FROM events WHERE type = 'listing.view' AND entity_id IN (${placeholders(ids.length)}) AND created_at >= ? GROUP BY entity_id`, [...ids, since]) : [];
  const viewMap = new Map(viewsIn.map((v) => [v.entity_id, v.n]));
  const leadsIn = ids.length ? q.all<{ listing_id: string; n: number }>(`SELECT listing_id, COUNT(*) AS n FROM listing_leads WHERE listing_id IN (${placeholders(ids.length)}) AND created_at >= ? GROUP BY listing_id`, [...ids, since]) : [];
  const leadMap = new Map(leadsIn.map((v) => [v.listing_id, v.n]));
  const series = new Map<string, { date: string; views: number; leads: number }>();
  for (let d = nowMs() - (p.days - 1) * DAY; d <= nowMs(); d += DAY) { const k = new Date(d).toISOString().slice(0, 10); series.set(k, { date: k, views: 0, leads: 0 }); }
  if (ids.length) {
    for (const r of q.all<{ date: string; n: number }>(`SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS n FROM events WHERE type = 'listing.view' AND entity_id IN (${placeholders(ids.length)}) AND created_at >= ? GROUP BY date`, [...ids, since])) { const s = series.get(r.date); if (s) s.views = r.n; }
    for (const r of q.all<{ date: string; n: number }>(`SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS n FROM listing_leads WHERE listing_id IN (${placeholders(ids.length)}) AND created_at >= ? GROUP BY date`, [...ids, since])) { const s = series.get(r.date); if (s) s.leads = r.n; }
  }
  const sources = ids.length ? q.all<{ source: string; n: number }>(`SELECT source, COUNT(*) AS n FROM listing_leads WHERE listing_id IN (${placeholders(ids.length)}) GROUP BY source ORDER BY n DESC`, ids) : [];
  const rows = listings.map((l) => { const views = viewMap.get(l.id) ?? 0; const leads = leadMap.get(l.id) ?? 0; return { id: l.id, title: l.title, status: l.status, views: views || Math.round(l.view_count / 3), saves: l.save_count, leads: leads || l.lead_count, contactRate: views ? Math.round((leads / views) * 1000) / 10 : 0, boosted: !!l.boosted_until && l.boosted_until > nowIso() }; });
  const totals = { views: rows.reduce((s, r) => s + r.views, 0), saves: rows.reduce((s, r) => s + r.saves, 0), leads: rows.reduce((s, r) => s + r.leads, 0), listings: rows.length, active: rows.filter((r) => r.status === 'active').length };
  const boostUplift = q.get<{ u: number | null }>("SELECT AVG(impressions) AS u FROM boosts WHERE user_id = ? AND status IN ('active','expired')", [user.id])?.u ?? null;
  ok(res, { listings: rows, totals, series: [...series.values()], topSources: sources.map((s) => ({ source: s.source, count: s.n })), boostUplift: boostUplift ? Math.round(boostUplift) : null, days: p.days });
});
router.get('/pro/leads', requireAuth, (req, res) => {
  const user = requirePro(req);
  const p = parseQuery(req, ProLeadsQuery);
  const { limit, offset } = pageWindow(p);
  const where: string[] = ['ll.owner_id = ?'];
  const params: (string | number)[] = [user.id];
  if (p.status) { where.push('ll.status = ?'); params.push(p.status); }
  if (p.listingId) { where.push('ll.listing_id = ?'); params.push(p.listingId); }
  const total = q.count(`SELECT COUNT(*) FROM listing_leads ll WHERE ${where.join(' AND ')}`, params);
  const rows = q.all<{ id: string; listing_id: string; user_id: string; conversation_id: string | null; source: string; status: string; created_at: string; last_message_preview: string | null; last_message_at: string | null }>(`SELECT ll.*, c.last_message_preview, c.last_message_at FROM listing_leads ll LEFT JOIN conversations c ON c.id = ll.conversation_id WHERE ${where.join(' AND ')} ORDER BY ll.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const users = userCards(rows.map((r) => r.user_id));
  const listingIds = [...new Set(rows.map((r) => r.listing_id))];
  const cards = listingIds.length ? listingCards(q.all<ListingCardRow>(`SELECT l.* FROM listings l WHERE l.id IN (${placeholders(listingIds.length)})`, listingIds), { viewerId: user.id }) : [];
  const cardMap = new Map<string, ListingCard>(cards.map((c) => [c.id, c]));
  const counts = Object.fromEntries(q.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM listing_leads WHERE owner_id = ? GROUP BY status', [user.id]).map((r) => [r.status, r.n]));
  paginated(res, { items: rows.map((r) => ({ id: r.id, listingId: r.listing_id, userId: r.user_id, user: users.get(r.user_id) ?? null, listing: cardMap.get(r.listing_id) ?? null, conversationId: r.conversation_id, conversation: r.conversation_id ? { id: r.conversation_id, lastMessage: r.last_message_preview, lastMessageAt: r.last_message_at } : null, source: r.source, status: r.status, createdAt: r.created_at })), total, page: p.page, pageSize: p.pageSize }, { counts });
});
router.patch('/pro/leads/:id', requireAuth, writes, (req, res) => {
  const user = requirePro(req);
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, LeadPatch);
  const lead = q.get<{ id: string; owner_id: string }>('SELECT id, owner_id FROM listing_leads WHERE id = ?', [id]);
  if (!lead) throw notFound('Lead');
  assertOwner(req, lead.owner_id);
  q.run('UPDATE listing_leads SET status = ? WHERE id = ?', [body.status, id]);
  void user;
  ok(res, { id, status: body.status });
});
router.get('/pro/leads.csv', requireAuth, (req, res) => {
  const user = requirePro(req);
  const rows = q.all<{ created_at: string; listing_id: string; title: string; name: string; trust_level: number; source: string; status: string }>('SELECT ll.created_at, ll.listing_id, l.title, u.name, u.trust_level, ll.source, ll.status FROM listing_leads ll JOIN listings l ON l.id = ll.listing_id JOIN users u ON u.id = ll.user_id WHERE ll.owner_id = ? ORDER BY ll.created_at DESC', [user.id]);
  const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
  res.send(['created_at,listing_id,listing_title,name,trust_level,source,status', ...rows.map((r) => [r.created_at, r.listing_id, r.title, r.name, r.trust_level, r.source, r.status].map(esc).join(','))].join('\n'));
});

// ====================================================================== 11.5 Secure Payment (escrows)
router.get('/escrows/quote', requireAuth, (req, res) => {
  const p = parseQuery(req, EscrowQuoteQuery);
  logEvent(req, 'escrow.quote_viewed', { props: { amountCents: p.amountCents, rail: p.rail } });
  ok(res, { ...quoteEscrowFee(p.amountCents, p.feePayer, p.rail), enabled: isEnabled('escrow.enabled', campusIdOf(req)) });
});
router.get('/escrows/eligibility', (req, res) => {
  const p = parseQuery(req, EscrowEligibilityQuery);
  const l = q.get<{ owner_id: string; campus_id: string; status: string; deposit_cents: number }>('SELECT owner_id, campus_id, status, deposit_cents FROM listings WHERE id = ?', [p.listingId]);
  if (!l) throw notFound('Listing');
  const enabled = isEnabled('escrow.enabled', l.campus_id);
  const payee = payeeEligible(l.owner_id);
  const state = getCampus(l.campus_id)?.state ?? null;
  const viewer = req.user;
  const open = q.get<{ id: string; status: string }>("SELECT id, status FROM escrows WHERE listing_id = ? AND status IN ('proposed','accepted','funded','in_inspection','disputed') AND (payer_id = ? OR payee_id = ?) ORDER BY created_at DESC LIMIT 1", [p.listingId, viewer?.id ?? '', viewer?.id ?? '']);
  ok(res, { enabled, state, payeeEligible: payee.ok, payeeReason: payee.reason, viewerCanPropose: !!viewer && viewer.trust_level >= 2 && viewer.id !== l.owner_id, viewerCanFund: !!viewer && viewer.trust_level >= 3, listingActive: l.status === 'active', suggestedAmountCents: Math.min(1000000, Math.max(10000, l.deposit_cents || 0)), existing: open ?? null, quote: quoteEscrowFee(Math.min(1000000, Math.max(10000, l.deposit_cents || 10000))) });
});
router.get('/escrows', requireAuth, (req, res) => {
  const p = parseQuery(req, EscrowsQuery);
  const { limit, offset } = pageWindow(p);
  const user = me(req);
  const where: string[] = [p.role === 'payer' ? 'payer_id = ?' : p.role === 'payee' ? 'payee_id = ?' : '(payer_id = ? OR payee_id = ?)'];
  const params: (string | number)[] = p.role ? [user.id] : [user.id, user.id];
  if (p.status) { where.push('status = ?'); params.push(p.status); }
  const total = q.count(`SELECT COUNT(*) FROM escrows WHERE ${where.join(' AND ')}`, params);
  const rows = q.all<EscrowRow>(`SELECT * FROM escrows WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  paginated(res, { items: rows.map((e) => toEscrowDto(e, user)), total, page: p.page, pageSize: p.pageSize });
});
router.post('/escrows', requireAuth, requireTrust(2), writes, (req, res) => {
  const body = parseBody(req, EscrowInput);
  const user = me(req);
  if (body.role === 'payer' && user.trust_level < 3 && user.role !== 'admin') {
    // a payer may propose at L2 but must be L3 to fund; tell them early
    void 0;
  }
  const e = createEscrow(user, body, req);
  ok(res, toEscrowDto(e, user), 201);
});
function requireParty(req: Request, e: EscrowRow): AuthUser {
  const user = me(req);
  if (user.id !== e.payer_id && user.id !== e.payee_id && user.role !== 'admin') throw new ApiError('FORBIDDEN', 'Not a party of this Secure Payment');
  return user;
}
router.get('/escrows/:id', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const e = requireEscrow(id);
  const user = requireParty(req, e);
  ok(res, toEscrowDto(e, user));
});
router.get('/escrows/:id/receipt', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const e = requireEscrow(id);
  const user = requireParty(req, e);
  const order = e.order_id ? loadOrder(e.order_id) : undefined;
  // the payee (or anyone but the payer) sees amounts and status only — never the payer's card or provider ids
  const orderDto = order ? (order.user_id === user.id ? toOrderDto(order, { withPayments: true }) : user.role === 'admin' ? toOrderDto(order, { withPayments: true, admin: true }) : toPartyOrderDto(order)) : null;
  ok(res, { escrow: toEscrowDto(e, user), order: orderDto, generatedAt: nowIso(), testMode: true });
});
router.post('/escrows/:id/accept', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const e = requireEscrow(id);
  const user = requireParty(req, e);
  if (e.created_by === user.id && user.role !== 'admin') throw new ApiError('FORBIDDEN', 'The counterparty accepts the proposal');
  ok(res, toEscrowDto(transitionEscrow(e, 'accepted', { actorId: user.id, req }), user));
});
router.post('/escrows/:id/fund', requireAuth, requireTrust(3), writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, EscrowFundInput);
  let e = requireEscrow(id);
  const user = me(req);
  if (e.payer_id !== user.id && user.role !== 'admin') throw new ApiError('FORBIDDEN', 'Only the payer funds a Secure Payment');
  if (body.rail && body.rail !== e.rail && e.status === 'accepted') {
    const qt = quoteEscrowFee(e.amount_cents, e.fee_payer, body.rail);
    if (!qt.railAllowed) throw new ApiError('BAD_REQUEST', 'Card rail is limited to deposits under $500');
    q.run('UPDATE escrows SET rail = ?, card_fee_cents = ?, updated_at = ? WHERE id = ?', [body.rail, qt.railFeeCents, nowIso(), id]);
    e = requireEscrow(id);
  }
  const order = createEscrowOrder(user, e, undefined, req);
  const paid = 'card' in body ? payOrder(user, order, { card: body.card }, req) : payOrder(user, order, { paymentMethodId: body.paymentMethodId }, req);
  ok(res, { escrow: toEscrowDto(requireEscrow(id), user), order: toOrderDto(paid) });
});
router.post('/escrows/:id/release', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, EscrowNoteInput);
  const e = requireEscrow(id);
  const user = me(req);
  if (e.payer_id !== user.id && user.role !== 'admin') throw new ApiError('FORBIDDEN', 'Only the payer releases the deposit');
  ok(res, toEscrowDto(transitionEscrow(e, 'released', { actorId: user.id, note: body.note ?? null, req }), user));
});
router.post('/escrows/:id/refund', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, EscrowNoteInput);
  const e = requireEscrow(id);
  const user = me(req);
  if (e.payee_id !== user.id && user.role !== 'admin') throw new ApiError('FORBIDDEN', 'Only the host refunds the deposit');
  ok(res, toEscrowDto(transitionEscrow(e, 'refunded', { actorId: user.id, note: body.note ?? null, req }), user));
});
router.post('/escrows/:id/dispute', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, EscrowDisputeInput);
  const e = requireEscrow(id);
  const user = me(req);
  if (e.payer_id !== user.id && user.role !== 'admin') throw new ApiError('FORBIDDEN', 'Only the payer opens a dispute');
  const next = transitionEscrow(e, 'disputed', { actorId: user.id, note: body.reason, req, data: { reasonCode: body.reasonCode, evidenceUploadIds: body.evidenceUploadIds ?? [] } });
  for (const admin of q.all<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL")) notify(admin.id, 'admin.queue', { title: { zh: '新的安心付争议', en: 'New Secure Payment dispute' }, body: { zh: '72 小时内需要首次回应。', en: 'First response due within 72 hours.' }, link: `/escrow/${id}`, entityType: 'escrow', entityId: id });
  ok(res, toEscrowDto(next, user));
});
router.post('/escrows/:id/cancel', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, EscrowCancelInput);
  const e = requireEscrow(id);
  const user = requireParty(req, e);
  ok(res, toEscrowDto(transitionEscrow(e, 'cancelled', { actorId: user.id, note: body.reason ?? null, req }), user));
});
router.post('/escrows/:id/resolve', requireAuth, requireAdmin, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, EscrowResolveInput);
  const e = requireEscrow(id);
  const user = me(req);
  let payee = 0;
  let payer = 0;
  if (body.resolution === 'release_to_payee') payee = e.amount_cents;
  else if (body.resolution === 'refund_to_payer') payer = e.amount_cents;
  else {
    payee = body.payeeCents ?? Math.floor(e.amount_cents / 2);
    payer = body.payerCents ?? e.amount_cents - payee;
    if (payee + payer !== e.amount_cents) throw new ApiError('VALIDATION', 'Split must add up to the deposit', { fields: { payeeCents: `payee + payer must equal ${e.amount_cents}` } });
  }
  const next = transitionEscrow(e, 'resolved', { actorId: user.id, note: body.note, req, data: { reasonCode: body.reasonCode ?? null }, resolution: { kind: body.resolution, payeeCents: payee, payerCents: payer, reasonCode: body.reasonCode } });
  audit(req, { action: 'escrow.resolve', entityType: 'escrow', entityId: id, before: { status: e.status }, after: { status: 'resolved', resolution: body.resolution, payeeCents: payee, payerCents: payer }, reason: body.note });
  ok(res, toEscrowDto(next, user));
});

// ====================================================================== 11.6 referrals & Newcomer Kit
router.get('/referrals', requireAuth, (req, res) => ok(res, referralSummary(me(req))));

router.get('/partners', (req, res) => {
  const p = parseQuery(req, PartnersQuery);
  const campusId = p.campusId ?? campusIdOf(req);
  if (!isEnabled('affiliate.enabled', campusId)) return ok(res, { categories: [], disclosure: true, campusId, enabled: false });
  const groups = listPartners({ campusId, state: p.state, categories: p.category, stage: p.stage });
  const user = req.user;
  const done = user ? q.all<{ slug: string }>('SELECT slug FROM kit_checklist WHERE user_id = ?', [user.id]).map((r) => r.slug) : [];
  logEvent(req, 'kit.view', { props: { campusId, stage: p.stage ?? null, preArrival: !user } });
  ok(res, { categories: groups.map((g) => ({ key: g.key, partners: g.partners })), done, campusId, enabled: true, disclosure: true });
});
router.get('/partners/:slug/go', (req, res) => {
  const { slug } = parseParams(req, slugParam);
  const p = parseQuery(req, PartnerGoQuery);
  const partner = loadPartner(slug);
  if (!partner || partner.is_active !== 1) throw notFound('Partner');
  const ipHash = ipHashOf(req);
  checkRate(`partnergo:${ipHash}:${partner.id}`, 20, DAY);
  const campusId = p.campusId ?? campusIdOf(req);
  const clickId = uid();
  // partner_clicks.placement predates the home strip: home clicks are stored as 'banner' (the event keeps 'home')
  const storedPlacement = p.placement === 'home' ? 'banner' : p.placement;
  q.run('INSERT INTO partner_clicks (id, partner_id, user_id, campus_id, session_id, placement, referer, ip_hash, user_agent, converted, payout_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)', [
    clickId, partner.id, req.user?.id ?? null, campusId, req.sessionId ?? cookieOf(req, ANON_COOKIE) ?? null, storedPlacement, String(req.headers.referer ?? '').slice(0, 300), ipHash, String(req.headers['user-agent'] ?? '').slice(0, 200), partner.payout_model === 'cpc' ? partner.payout_cents : 0, nowIso(),
  ]);
  logEvent(req, 'affiliate.click', { entityType: 'partner', entityId: partner.id, campusId, props: { slug: partner.slug, category: partner.category, placement: p.placement, campusId, clickId } });
  const target = partner.affiliate_url.replace(/\{\{clickId\}\}/g, clickId).replace(/\{\{campusId\}\}/g, encodeURIComponent(campusId ?? 'none')).replace(/\{\{assocTag\}\}/g, 'anwo-20');
  res.redirect(302, target);
});
router.post('/partners/:slug/converted', (req, res) => {
  const { slug } = parseParams(req, slugParam);
  const body = parseBody(req, PartnerConvertedInput);
  const partner = loadPartner(slug);
  if (!partner) throw notFound('Partner');
  const click = q.get<{ id: string; converted: number; campus_id: string | null }>('SELECT id, converted, campus_id FROM partner_clicks WHERE id = ? AND partner_id = ?', [body.clickId, partner.id]);
  const payout = body.payoutCents ?? partner.payout_cents;
  const t = nowIso();
  if (click) {
    if (click.converted === 1) return ok(res, { ok: true, duplicate: true });
    q.run('UPDATE partner_clicks SET converted = 1, converted_at = ?, payout_cents = ? WHERE id = ?', [t, payout, click.id]);
    q.run("INSERT INTO partner_conversions (id, partner_id, click_id, network_ref, payout_cents, status, source, campus_id, occurred_at) VALUES (?, ?, ?, ?, ?, 'pending', 'postback', ?, ?)", [uid(), partner.id, click.id, `postback:${click.id}`, payout, click.campus_id, t]);
  } else {
    q.run("INSERT OR IGNORE INTO partner_conversions (id, partner_id, click_id, network_ref, payout_cents, status, source, campus_id, occurred_at) VALUES (?, ?, NULL, ?, ?, 'pending', 'postback', NULL, ?)", [uid(), partner.id, `postback:${body.clickId}`, payout, t]);
  }
  logEvent(req, 'affiliate.conversion', { entityType: 'partner', entityId: partner.id, props: { slug: partner.slug, payoutCents: payout, source: 'postback', status: click ? 'matched' : 'unmatched' } });
  ok(res, { ok: true, matched: !!click });
});
router.post('/partners/:slug/report', requireAuth, writes, (req, res) => {
  const { slug } = parseParams(req, slugParam);
  const partner = loadPartner(slug);
  if (!partner) throw notFound('Partner');
  const body = parseBody(req, z.object({ reason: z.enum(['scam', 'spam', 'fake', 'wrong_info', 'other']).default('wrong_info'), details: z.string().max(1000).optional() }));
  ok(res, createReport(req, { entityType: 'partner', entityId: partner.id, reason: body.reason, details: body.details, campusId: campusIdOf(req) }), 201);
});
router.get('/partners/:slug', (req, res) => {
  const { slug } = parseParams(req, slugParam);
  const partner = loadPartner(slug);
  if (!partner || partner.is_active !== 1) throw notFound('Partner');
  const related = q.all<PartnerRow>(`${PARTNER_SELECT} WHERE p.category = ? AND p.id <> ? AND p.is_active = 1 ORDER BY p.sort_order LIMIT 3`, [partner.category, partner.id]).map(toPartnerDto);
  const done = req.user ? q.count('SELECT COUNT(*) FROM kit_checklist WHERE user_id = ? AND slug = ?', [req.user.id, partner.slug]) > 0 : false;
  logEvent(req, 'kit.card_view', { entityType: 'partner', entityId: partner.id, props: { slug: partner.slug, category: partner.category, placement: 'detail' } });
  ok(res, { ...toPartnerDto(partner), related, done, clickCount: partner.click_count });
});
router.post('/kit/done', requireAuth, (req, res) => {
  const body = parseBody(req, KitDoneInput);
  const user = me(req);
  if (body.done) q.run('INSERT OR REPLACE INTO kit_checklist (user_id, slug, done_at) VALUES (?, ?, ?)', [user.id, body.slug, nowIso()]);
  else q.run('DELETE FROM kit_checklist WHERE user_id = ? AND slug = ?', [user.id, body.slug]);
  logEvent(req, 'kit.card_done', { entityType: 'partner', entityId: body.slug, props: { slug: body.slug, done: body.done } });
  ok(res, { done: q.all<{ slug: string }>('SELECT slug FROM kit_checklist WHERE user_id = ?', [user.id]).map((r) => r.slug) });
});
// ---------------------------------------------------------------- sponsored placements (read path; booking is admin-only)
router.get('/sponsorships', (req, res) => {
  const p = parseQuery(req, SponsorshipsQuery);
  const campusId = p.campusId ?? campusIdOf(req);
  if (!isEnabled('sponsors.enabled', campusId)) return ok(res, { items: [] });
  ok(res, { items: liveSponsorships({ campusId, surface: p.surface, kitCategory: p.kitCategory, limit: p.limit }, req) });
});
router.get('/sponsorships/:id/go', (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = loadSponsorship(id);
  if (!r || r.status !== 'active') throw notFound('Sponsorship');
  checkRate(`sponsorclick:${ipHashOf(req)}:${id}`, 10, 60_000);
  recordSponsorClick(r, req);
  if (!/^https?:\/\//i.test(r.url)) throw notFound('Sponsorship');
  res.redirect(302, r.url);
});
router.post('/sponsor-leads', writes, (req, res) => {
  const body = parseBody(req, SponsorLeadInput);
  const id = uid();
  q.run('INSERT INTO sponsor_leads (id, business_name, contact, campus_id, interest, note, status, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, body.businessName, body.contact, body.campusId ?? campusIdOf(req), body.interest, body.note ?? null, 'new', req.user?.id ?? null, nowIso()]);
  for (const admin of q.all<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL")) notify(admin.id, 'admin.queue', { title: { zh: '新的商家合作意向', en: 'New sponsor lead' }, body: body.businessName, link: '/admin/revenue', entityType: 'sponsor_lead', entityId: id, silent: true });
  logEvent(req, 'sponsorship.lead', { entityType: 'sponsor_lead', entityId: id, props: { interest: body.interest } });
  ok(res, { id, status: 'new' }, 201);
});

// ====================================================================== 11.7 admin
const admin = Router();
admin.use(requireAuth, requireAdmin);
admin.get('/revenue', (req, res) => {
  const p = parseQuery(req, RevenueQuery);
  const to = p.to ?? nowIso().slice(0, 10);
  const from = p.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - 29 * DAY).toISOString().slice(0, 10);
  const summary = revenueSummary({ from, to, campusId: p.campusId, groupBy: p.groupBy });
  const funnel = {
    checkout: { starts: q.count("SELECT COUNT(DISTINCT entity_id) FROM events WHERE type = 'checkout.start' AND created_at >= ?", [`${from}T00:00:00Z`]), pays: q.count("SELECT COUNT(DISTINCT entity_id) FROM events WHERE type = 'checkout.pay' AND created_at >= ?", [`${from}T00:00:00Z`]), successes: q.count("SELECT COUNT(DISTINCT entity_id) FROM events WHERE type = 'checkout.success' AND created_at >= ?", [`${from}T00:00:00Z`]), fails: q.count("SELECT COUNT(DISTINCT entity_id) FROM events WHERE type = 'checkout.fail' AND created_at >= ?", [`${from}T00:00:00Z`]) },
    kit: { views: q.count("SELECT COUNT(*) FROM events WHERE type = 'kit.view' AND created_at >= ?", [`${from}T00:00:00Z`]), clicks: q.count('SELECT COUNT(*) FROM partner_clicks WHERE created_at >= ?', [`${from}T00:00:00Z`]), conversions: q.count('SELECT COUNT(*) FROM partner_clicks WHERE converted = 1 AND created_at >= ?', [`${from}T00:00:00Z`]) },
  };
  const subs = { active: q.count("SELECT COUNT(*) FROM subscriptions WHERE status = 'active'"), trialing: q.count("SELECT COUNT(*) FROM subscriptions WHERE status = 'trialing'"), pastDue: q.count("SELECT COUNT(*) FROM subscriptions WHERE status = 'past_due'"), mrrCents: q.get<{ s: number | null }>("SELECT SUM(CASE WHEN p.interval = 'year' THEN p.price_cents / 12 ELSE p.price_cents END) AS s FROM subscriptions s JOIN pricing_plans p ON p.id = s.plan_id WHERE s.status IN ('active','trialing')")?.s ?? 0 };
  const boosts = { active: q.count("SELECT COUNT(*) FROM boosts WHERE status = 'active'"), impressions30d: q.count("SELECT COUNT(*) FROM events WHERE type = 'boost.impression' AND created_at >= ?", [`${from}T00:00:00Z`]), clicks30d: q.count("SELECT COUNT(*) FROM events WHERE type = 'boost.click' AND created_at >= ?", [`${from}T00:00:00Z`]) };
  const disputes = q.all<EscrowRow>("SELECT * FROM escrows WHERE status = 'disputed' ORDER BY disputed_at ASC LIMIT 10").map((e) => toEscrowDto(e, me(req)));
  const sponsorLeads = q.all<{ id: string; business_name: string; contact: string; campus_id: string | null; interest: string; status: string; created_at: string }>('SELECT * FROM sponsor_leads ORDER BY created_at DESC LIMIT 10').map((l) => ({ id: l.id, businessName: l.business_name, contact: l.contact, campusId: l.campus_id, interest: l.interest, status: l.status, createdAt: l.created_at }));
  ok(res, { ...summary, from, to, groupBy: p.groupBy, funnel, subscriptions: subs, boosts, disputes, sponsorLeads });
});
admin.get('/orders', (req, res) => {
  const p = parseQuery(req, AdminOrdersQuery);
  const { limit, offset } = pageWindow(p);
  const where: string[] = ['1 = 1'];
  const params: (string | number)[] = [];
  if (p.kind) { where.push('o.kind = ?'); params.push(p.kind); }
  if (p.status) { where.push('o.status = ?'); params.push(p.status); }
  if (p.userId) { where.push('o.user_id = ?'); params.push(p.userId); }
  if (p.campusId) { where.push('o.campus_id = ?'); params.push(p.campusId); }
  if (p.from) { where.push('o.created_at >= ?'); params.push(`${p.from}T00:00:00Z`); }
  if (p.to) { where.push('o.created_at <= ?'); params.push(`${p.to}T23:59:59Z`); }
  if (p.q) { where.push('(o.id LIKE ? OR u.email LIKE ? OR u.name LIKE ?)'); params.push(`${p.q}%`, `%${p.q}%`, `%${p.q}%`); }
  const total = q.count(`SELECT COUNT(*) FROM orders o JOIN users u ON u.id = o.user_id WHERE ${where.join(' AND ')}`, params);
  const rows = q.all<OrderRow & { email: string }>(`SELECT o.*, u.email FROM orders o JOIN users u ON u.id = o.user_id WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const users = userCards(rows.map((r) => r.user_id));
  paginated(res, { items: rows.map((r) => ({ ...toOrderDto(r, { admin: true }), user: users.get(r.user_id) ?? null, email: r.email })), total, page: p.page, pageSize: p.pageSize });
});
admin.post('/orders/:id/refund', writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, AdminRefundInput);
  const o = requireOrder(id);
  const after = refundOrder(o, body.amountCents, me(req).id, body.reason, req);
  audit(req, { action: 'order.refund', entityType: 'order', entityId: id, before: { status: o.status }, after: { status: after.status, amountCents: body.amountCents ?? o.total_cents }, reason: body.reason });
  ok(res, toOrderDto(after, { withPayments: true, admin: true }));
});
admin.get('/escrows', (req, res) => {
  const p = parseQuery(req, AdminEscrowsQuery);
  const { limit, offset } = pageWindow(p);
  const status = p.status ?? 'disputed';
  const where = status === 'all' ? '1 = 1' : 'status = ?';
  const params = status === 'all' ? [] : [status];
  const total = q.count(`SELECT COUNT(*) FROM escrows WHERE ${where}`, params);
  const rows = q.all<EscrowRow>(`SELECT * FROM escrows WHERE ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  paginated(res, { items: rows.map((e) => toEscrowDto(e, me(req))), total, page: p.page, pageSize: p.pageSize });
});
admin.get('/plans', (_req, res) => ok(res, q.all<PlanRow>('SELECT * FROM pricing_plans ORDER BY sort_order').map(toPlanDto)));
admin.patch('/plans/:id', writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, PlanPatch);
  const before = requirePlan(id);
  const sets: string[] = [];
  const params: (string | number)[] = [];
  if (body.priceCents !== undefined) { sets.push('price_cents = ?'); params.push(body.priceCents); }
  if (body.isActive !== undefined) { sets.push('is_active = ?'); params.push(body.isActive ? 1 : 0); }
  if (body.name !== undefined) { sets.push('name = ?'); params.push(body.name); }
  if (body.nameZh !== undefined) { sets.push('name_zh = ?'); params.push(body.nameZh); }
  if (body.description !== undefined) { sets.push('description = ?'); params.push(body.description); }
  if (body.descriptionZh !== undefined) { sets.push('description_zh = ?'); params.push(body.descriptionZh); }
  if (body.sortOrder !== undefined) { sets.push('sort_order = ?'); params.push(body.sortOrder); }
  if (sets.length) q.run(`UPDATE pricing_plans SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [...params, nowIso(), before.id]);
  const after = requirePlan(before.id);
  audit(req, { action: 'plan.update', entityType: 'pricing_plan', entityId: before.id, before: toPlanDto(before), after: toPlanDto(after), reason: body.reason });
  ok(res, toPlanDto(after));
});
admin.get('/promo-codes', (_req, res) => ok(res, q.all<PromoRow>('SELECT * FROM promo_codes ORDER BY created_at DESC').map(toPromoDto)));
admin.post('/promo-codes', writes, (req, res) => {
  const body = parseBody(req, PromoCodeInput);
  const id = uid();
  q.run('INSERT INTO promo_codes (id, code, kind, value, applies_to_json, campus_id, max_redemptions, per_user_limit, min_order_cents, starts_at, ends_at, is_active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, body.code, body.kind, body.value, JSON.stringify(body.appliesTo ?? []), body.campusId ?? null, body.maxRedemptions ?? null, body.perUserLimit ?? 1, body.minOrderCents ?? 0, body.startsAt ?? null, body.endsAt ?? null, body.isActive === false ? 0 : 1, me(req).id, nowIso()]);
  const row = q.get<PromoRow>('SELECT * FROM promo_codes WHERE id = ?', [id])!;
  audit(req, { action: 'promo.create', entityType: 'promo_code', entityId: id, after: toPromoDto(row) });
  ok(res, toPromoDto(row), 201);
});
admin.patch('/promo-codes/:id', writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, PromoCodePatch);
  const before = q.get<PromoRow>('SELECT * FROM promo_codes WHERE id = ?', [id]);
  if (!before) throw notFound('Promo code');
  const map: Record<string, string> = { code: 'code', kind: 'kind', value: 'value', campusId: 'campus_id', maxRedemptions: 'max_redemptions', perUserLimit: 'per_user_limit', minOrderCents: 'min_order_cents', startsAt: 'starts_at', endsAt: 'ends_at' };
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [k, col] of Object.entries(map)) { const v = (body as Record<string, unknown>)[k]; if (v !== undefined) { sets.push(`${col} = ?`); params.push(v as string | number | null); } }
  if (body.appliesTo !== undefined) { sets.push('applies_to_json = ?'); params.push(JSON.stringify(body.appliesTo)); }
  if (body.isActive !== undefined) { sets.push('is_active = ?'); params.push(body.isActive ? 1 : 0); }
  if (sets.length) q.run(`UPDATE promo_codes SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  const after = q.get<PromoRow>('SELECT * FROM promo_codes WHERE id = ?', [id])!;
  audit(req, { action: 'promo.update', entityType: 'promo_code', entityId: id, before: toPromoDto(before), after: toPromoDto(after) });
  ok(res, toPromoDto(after));
});
admin.get('/partners', (_req, res) => {
  const rows = q.all<PartnerRow>(`${PARTNER_SELECT} ORDER BY p.category, p.sort_order`);
  ok(res, rows.map((r) => ({ ...toPartnerDto(r), isActive: r.is_active === 1, clickCount: r.click_count, payoutModel: r.payout_model, payoutCents: r.payout_cents, affiliateUrl: r.affiliate_url, payoutNote: r.payout_note, noSsnVerifiedAt: r.no_ssn_verified_at, conversions: q.count('SELECT COUNT(*) FROM partner_clicks WHERE partner_id = ? AND converted = 1', [r.id]) })));
});
admin.post('/partners', writes, (req, res) => {
  const body = parseBody(req, PartnerInput);
  const id = uid();
  const t = nowIso();
  q.run(`INSERT INTO partners (id, slug, name, name_zh, category, tagline, tagline_zh, description, description_zh, logo_upload_id, website_url, affiliate_url, promo_text, promo_text_zh, payout_model, payout_cents, campus_id, states_json, is_sponsored, is_active, sort_order, network, no_ssn_ok, no_ssn_verified_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, body.slug, body.name, body.nameZh ?? null, body.category, body.tagline ?? null, body.taglineZh ?? null, body.description ?? null, body.descriptionZh ?? null, body.logoUploadId ?? null, body.websiteUrl, body.affiliateUrl, body.promoText ?? null, body.promoTextZh ?? null, body.payoutModel ?? 'cpa', body.payoutCents ?? 0, body.campusId ?? null, JSON.stringify(body.states ?? []), body.isSponsored === false ? 0 : 1, body.isActive === false ? 0 : 1, body.sortOrder ?? 0, body.network ?? null, body.noSsnOk ? 1 : 0, body.noSsnOk ? t : null, t, t]);
  const row = loadPartner(id)!;
  audit(req, { action: 'partner.create', entityType: 'partner', entityId: id, after: toPartnerDto(row), reason: body.reason });
  ok(res, toPartnerDto(row), 201);
});
admin.patch('/partners/:id', writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, PartnerPatch);
  const before = loadPartner(id);
  if (!before) throw notFound('Partner');
  if (body.sortOrder !== undefined && body.sortOrder !== before.sort_order && !body.reason) throw new ApiError('VALIDATION', 'A reason is required to change the ordering', { fields: { reason: 'required' } });
  const map: Record<string, string> = { slug: 'slug', name: 'name', nameZh: 'name_zh', category: 'category', tagline: 'tagline', taglineZh: 'tagline_zh', description: 'description', descriptionZh: 'description_zh', logoUploadId: 'logo_upload_id', websiteUrl: 'website_url', affiliateUrl: 'affiliate_url', promoText: 'promo_text', promoTextZh: 'promo_text_zh', payoutModel: 'payout_model', payoutCents: 'payout_cents', campusId: 'campus_id', sortOrder: 'sort_order', network: 'network' };
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [k, col] of Object.entries(map)) { const v = (body as Record<string, unknown>)[k]; if (v !== undefined) { sets.push(`${col} = ?`); params.push(v as string | number | null); } }
  if (body.states !== undefined) { sets.push('states_json = ?'); params.push(JSON.stringify(body.states)); }
  if (body.isSponsored !== undefined) { sets.push('is_sponsored = ?'); params.push(body.isSponsored ? 1 : 0); }
  if (body.isActive !== undefined) { sets.push('is_active = ?'); params.push(body.isActive ? 1 : 0); }
  if (body.noSsnOk !== undefined) { sets.push('no_ssn_ok = ?', 'no_ssn_verified_at = ?'); params.push(body.noSsnOk ? 1 : 0, body.noSsnOk ? nowIso() : null); }
  if (sets.length) q.run(`UPDATE partners SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [...params, nowIso(), before.id]);
  const after = loadPartner(before.id)!;
  audit(req, { action: 'partner.update', entityType: 'partner', entityId: before.id, before: toPartnerDto(before), after: toPartnerDto(after), reason: body.reason ?? null });
  ok(res, toPartnerDto(after));
});
admin.delete('/partners/:id', writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const before = loadPartner(id);
  if (!before) throw notFound('Partner');
  q.run('UPDATE partners SET is_active = 0, updated_at = ? WHERE id = ?', [nowIso(), before.id]);
  audit(req, { action: 'partner.update', entityType: 'partner', entityId: before.id, before: { isActive: true }, after: { isActive: false }, reason: 'deactivated' });
  ok(res, null);
});
admin.get('/partners/:id/clicks', (req, res) => {
  const { id } = parseParams(req, idParam);
  const p = parseQuery(req, PartnerClicksQuery);
  const partner = loadPartner(id);
  if (!partner) throw notFound('Partner');
  const to = p.to ?? nowIso().slice(0, 10);
  const from = p.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - 29 * DAY).toISOString().slice(0, 10);
  const bucket = p.groupBy === 'week' ? "date(created_at, 'weekday 0', '-6 days')" : 'substr(created_at, 1, 10)';
  const series = q.all<{ date: string; clicks: number; converted: number; est: number }>(`SELECT ${bucket} AS date, COUNT(*) AS clicks, SUM(converted) AS converted, SUM(CASE WHEN converted = 1 THEN payout_cents ELSE 0 END) AS est FROM partner_clicks WHERE partner_id = ? AND created_at >= ? AND created_at <= ? GROUP BY date ORDER BY date`, [partner.id, `${from}T00:00:00Z`, `${to}T23:59:59Z`]);
  const dup = q.count('SELECT COUNT(*) FROM (SELECT ip_hash FROM partner_clicks WHERE partner_id = ? AND created_at >= ? GROUP BY ip_hash, substr(created_at, 1, 10) HAVING COUNT(*) > 5)', [partner.id, `${from}T00:00:00Z`]);
  ok(res, { total: series.reduce((s, r) => s + r.clicks, 0), converted: series.reduce((s, r) => s + r.converted, 0), estCents: series.reduce((s, r) => s + r.est, 0), series, suspiciousIpDays: dup, from, to });
});
admin.post('/partners/:id/conversions/import', writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const partner = loadPartner(id);
  if (!partner) throw notFound('Partner');
  const body = parseBody(req, z.object({ rows: z.array(z.object({ clickId: z.string().max(128).optional(), networkRef: z.string().max(128), payoutCents: z.coerce.number().int().min(0), occurredAt: z.string().max(40), status: z.enum(['pending', 'approved', 'reversed', 'paid']).default('approved') })).max(500) }));
  let matched = 0;
  let unmatched = 0;
  q.tx(() => {
    for (const r of body.rows) {
      const click = r.clickId ? q.get<{ id: string; campus_id: string | null }>('SELECT id, campus_id FROM partner_clicks WHERE id = ? AND partner_id = ?', [r.clickId, partner.id]) : undefined;
      q.run("INSERT OR IGNORE INTO partner_conversions (id, partner_id, click_id, network_ref, payout_cents, status, source, campus_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, 'csv', ?, ?)", [uid(), partner.id, click?.id ?? null, r.networkRef, r.payoutCents, r.status, click?.campus_id ?? null, r.occurredAt]);
      if (click) { q.run('UPDATE partner_clicks SET converted = 1, converted_at = COALESCE(converted_at, ?), payout_cents = ? WHERE id = ?', [r.occurredAt, r.payoutCents, click.id]); matched++; } else unmatched++;
    }
  });
  audit(req, { action: 'partner.conversions_import', entityType: 'partner', entityId: partner.id, after: { matched, unmatched } });
  ok(res, { matched, unmatched });
});
admin.post('/wallet/:userId/adjust', writes, (req, res) => {
  const { userId } = parseParams(req, z.object({ userId: z.string().min(1).max(128) }));
  const body = parseBody(req, WalletAdjustInput);
  if (!q.get('SELECT 1 FROM users WHERE id = ?', [userId])) throw notFound('User');
  const row = ledgerAppend(userId, body.deltaCents, 'admin_adjustment', { refType: 'admin', refId: me(req).id, note: body.note, createdBy: me(req).id, req });
  audit(req, { action: 'wallet.adjust', entityType: 'user', entityId: userId, after: { deltaCents: body.deltaCents, balanceAfterCents: row.balance_after_cents }, reason: body.note });
  notify(userId, 'wallet.adjusted', { title: { zh: '钱包余额已调整', en: 'Your wallet balance was adjusted' }, body: body.note, link: '/wallet' });
  ok(res, toLedgerDto(row));
});
admin.get('/sponsorships', (req, res) => {
  const campusId = typeof req.query.campusId === 'string' ? req.query.campusId : null;
  const rows = q.all<SponsorshipRow>(`SELECT * FROM sponsorships${campusId ? ' WHERE campus_id = ?' : ''} ORDER BY created_at DESC LIMIT 200`, campusId ? [campusId] : []);
  ok(res, rows.map(toSponsorshipAdminDto));
});
admin.post('/sponsorships', writes, (req, res) => {
  const body = parseBody(req, SponsorshipInput);
  const row = createSponsorship(body, me(req).id);
  audit(req, { action: 'sponsorship.create', entityType: 'sponsorship', entityId: row.id, after: { sponsor: row.sponsor_name, surface: row.surface, campusId: row.campus_id } });
  ok(res, toSponsorshipAdminDto(row), 201);
});
admin.patch('/sponsorships/:id', writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, SponsorshipPatch);
  const before = loadSponsorship(id);
  const row = patchSponsorship(id, body);
  audit(req, { action: 'sponsorship.update', entityType: 'sponsorship', entityId: id, before: before ? { status: before.status, endsAt: before.ends_at } : null, after: body });
  ok(res, toSponsorshipAdminDto(row));
});
admin.post('/sponsorships/:id/invoices', writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = loadSponsorship(id);
  if (!r) throw notFound('Sponsorship');
  const inv = addSponsorshipInvoice(r, parseBody(req, SponsorshipInvoiceInput));
  audit(req, { action: 'sponsorship.invoice', entityType: 'sponsorship', entityId: id, after: inv });
  ok(res, inv, 201);
});
admin.post('/sponsorship-invoices/:id/:status', writes, (req, res) => {
  const { id, status } = parseParams(req, z.object({ id: z.string().min(1).max(128), status: z.enum(['paid', 'void', 'open']) }));
  const inv = setInvoiceStatus(id, status);
  audit(req, { action: `sponsorship.invoice_${status}`, entityType: 'sponsorship', entityId: inv.sponsorshipId, after: inv });
  ok(res, inv);
});
admin.get('/sponsor-leads', (_req, res) => {
  ok(res, q.all<{ id: string; business_name: string; contact: string; campus_id: string | null; interest: string; note: string | null; status: string; created_at: string }>('SELECT * FROM sponsor_leads ORDER BY created_at DESC LIMIT 100').map((l) => ({ id: l.id, businessName: l.business_name, contact: l.contact, campusId: l.campus_id, interest: l.interest, note: l.note, status: l.status, createdAt: l.created_at })));
});
admin.patch('/sponsor-leads/:id', writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, z.object({ status: z.enum(['new', 'contacted', 'won', 'lost']) }));
  q.run('UPDATE sponsor_leads SET status = ? WHERE id = ?', [body.status, id]);
  ok(res, { id, status: body.status });
});
admin.get('/referrals', (req, res) => {
  const rows = q.all<{ id: string; referrer_id: string; referred_id: string; code: string; status: string; created_at: string; rewarded_at: string | null }>('SELECT * FROM referrals ORDER BY created_at DESC LIMIT 100');
  const users = userCards([...rows.map((r) => r.referrer_id), ...rows.map((r) => r.referred_id)]);
  void req;
  ok(res, rows.map((r) => ({ id: r.id, code: r.code, status: r.status, createdAt: r.created_at, rewardedAt: r.rewarded_at, referrer: users.get(r.referrer_id) ?? null, referred: users.get(r.referred_id) ?? null })));
});
admin.post('/referrals/:id/void', writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = q.get<{ id: string; referrer_id: string; referred_id: string; status: string; referrer_reward_cents: number; referred_reward_cents: number }>('SELECT * FROM referrals WHERE id = ?', [id]);
  if (!r) throw notFound('Referral');
  const body = parseBody(req, z.object({ reason: z.string().trim().min(3).max(300) }));
  q.tx(() => {
    if (r.status === 'rewarded') {
      const bal1 = walletBalance(r.referrer_id);
      const bal2 = walletBalance(r.referred_id);
      if (bal1 >= r.referrer_reward_cents) ledgerAppend(r.referrer_id, -r.referrer_reward_cents, 'admin_adjustment', { refType: 'referral', refId: r.id, note: `referral_void: ${body.reason}`, createdBy: me(req).id });
      if (bal2 >= r.referred_reward_cents) ledgerAppend(r.referred_id, -r.referred_reward_cents, 'admin_adjustment', { refType: 'referral', refId: r.id, note: `referral_void: ${body.reason}`, createdBy: me(req).id });
    }
    q.run("UPDATE referrals SET status = 'void' WHERE id = ?", [id]);
  });
  audit(req, { action: 'referral.void', entityType: 'referral', entityId: id, before: { status: r.status }, after: { status: 'void' }, reason: body.reason });
  logEvent(req, 'referral.void', { entityType: 'referral', entityId: id, props: { reason: body.reason } });
  ok(res, { id, status: 'void' });
});
router.use('/admin', admin);

export default router;
export { startSubscription, createEscrowOrder };
