// server/src/modules/market/routes.ts — OWNED BY THE `market` MODULE AGENT. Mounted at /api/market (API.md §9).
// Static paths (/items/mine, /wishlist, /price-suggestion, /categories, /bundles/for-listing/:id) are declared before /:id routes.
import { hooks } from '../../lib/hooks';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { ItemCard, UserPublic } from '@shared/types';
import { CATEGORY_ICONS, MarketCategory } from '@shared/enums';
import { ReportInput, idParam } from '@shared/schemas/common';
import {
  BundleInput, BundleItemsInput, BundleListQuery, BundlePatch, ContactInput, ItemInput, ItemListQuery, ItemPatch, ItemPhotosInput, MarkSoldInput, MineQuery,
  PriceSuggestionQuery, WishlistQuery,
} from '@shared/schemas/market';
import { q, uid, placeholders } from '../../db';
import { assertOwner, isAdmin, requireAdmin, requireAuth, requireTrust } from '../../lib/auth';
import { audit } from '../../lib/audit';
import { getCampus } from '../../lib/campuses';
import { contextCardFor, isBlockedEither, openConversation as openConversationRaw, postContextCard, postMessage } from '../../lib/conversations';
import { ApiError, invalidState } from '../../lib/errors';
import { logEvent, recentlyLogged } from '../../lib/events';
import { fuzz, geocode, resolveCampusId, scopeFromQuery, scopeInfo, whereScope } from '../../lib/geo';
import { ok, pageWindow, paginated, parseBody, parseParams, parseQuery } from '../../lib/http';
import { notify, notifyMany } from '../../lib/notify';
import { rateLimit } from '../../lib/ratelimit';
import { createReport } from '../../lib/reports';
import { mergeSponsored, pickSponsored, recordClick, recordImpressions, sponsoredSlotCount } from '../../lib/sponsored';
import { HOUR, daysFromNow, nowIso } from '../../lib/time';
import { loadUserPublic } from '../../lib/users';
import { openConversation as openChatConversation } from '../chat/service';
import {
  ITEM_SELECT, itemSelect, buyerCandidates, bundleDto, bundleDtos, bundleForListing, campusCityState, canView, cardsOf, itemDto, itemDtos, loadBundle,
  priceSuggestion, requireBundle, requireItem, setBundleItems, setItemPhotos, type BundleRow, type MarketItemRow,
} from './service';

const router = Router();
const writes = rateLimit('writes');

const ITEM_TTL_DAYS = 60;
const PINS_LIMIT = 500;

function itemTitleLocalized(title: string): { zh: string; en: string } {
  return { zh: `「${title}」`, en: `"${title}"` };
}

// ====================================================================== items: list
router.get('/items', (req, res) => {
  const p = parseQuery(req, ItemListQuery);
  const scope = scopeFromQuery(req, p, { requireCampus: !p.sellerId && !p.bundleId });
  const w = whereScope(scope, { alias: 'm', latCol: 'pickup_lat', lngCol: 'pickup_lng', fuzz: 'round3' });
  const viewerId = req.user?.id ?? null;
  const admin = isAdmin(req);

  const where: string[] = [];
  const params: (string | number)[] = [];
  // eligibility (DATA_MODEL §8 rule 1)
  const ownSeller = !!p.sellerId && (p.sellerId === viewerId || admin);
  if (p.status === 'all') where.push(ownSeller ? "m.status <> 'removed'" : "m.status IN ('active','reserved','sold')");
  else if (p.status === 'sold') where.push("m.status = 'sold'");
  else if (p.status === 'active') where.push("m.status = 'active'");
  else if (p.status === 'reserved') where.push("m.status = 'reserved'");
  else where.push("m.status IN ('active','reserved')");
  if (!admin) where.push(ownSeller ? "m.moderation_status <> 'hidden'" : "m.moderation_status = 'ok'");
  if (p.sellerId) { where.push('m.seller_id = ?'); params.push(p.sellerId); }
  if (p.bundleId) { where.push('m.bundle_id = ?'); params.push(p.bundleId); }
  const cats = (p.category ?? []).filter((c) => (MarketCategory as readonly string[]).includes(c));
  if (cats.length) { where.push(`m.category IN (${placeholders(cats.length)})`); params.push(...cats); }
  const conds = (p.condition ?? []).filter((c) => ['new', 'like_new', 'good', 'fair', 'poor'].includes(c));
  if (conds.length) { where.push(`m.condition IN (${placeholders(conds.length)})`); params.push(...conds); }
  if (p.free === true) where.push("(m.is_free = 1 OR m.category = 'free' OR m.price_cents = 0)");
  else if (p.free === false) where.push('m.is_free = 0 AND m.price_cents > 0');
  if (p.obo) where.push('m.obo = 1');
  if (p.priceMin !== undefined) { where.push('m.price_cents >= ?'); params.push(p.priceMin); }
  if (p.priceMax !== undefined) { where.push('m.price_cents <= ?'); params.push(p.priceMax); }
  if (p.delivery === 'delivery') where.push("m.delivery_option IN ('delivery','both')");
  else if (p.delivery === 'pickup') where.push("m.delivery_option IN ('pickup','both')");
  // Nationwide market = shipping-friendly items only (DESIGN §4.10 / DATA_MODEL §9.1), unless a seller/bundle page asked for everything.
  if (scope.scope === 'nationwide' && !p.sellerId && !p.bundleId && p.delivery !== 'pickup') where.push("m.delivery_option IN ('delivery','both')");
  const qText = p.q?.trim();
  if (qText) {
    const like = `%${qText.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    where.push("(m.title LIKE ? ESCAPE '\\' OR m.description LIKE ? ESCAPE '\\' OR m.brand LIKE ? ESCAPE '\\' OR m.category LIKE ? ESCAPE '\\')");
    params.push(like, like, like, like);
  }
  const whereSql = `${where.join(' AND ')}${w.sql}`;
  const allParams = [...params, ...w.params];

  // pins view: up to 500 points, no pagination
  if (p.view === 'pins') {
    const rows = q.all<MarketItemRow>(`${ITEM_SELECT} WHERE ${whereSql} AND m.pickup_lat IS NOT NULL AND m.pickup_lng IS NOT NULL ORDER BY m.created_at DESC LIMIT ?`, [...allParams, PINS_LIMIT]);
    const cards = cardsOf(rows, req);
    const pins = cards.map((c) => ({ id: c.id, lat: c.pickupLat!, lng: c.pickupLng!, priceCents: c.priceCents, isFree: c.isFree, obo: c.obo, title: c.title, status: c.status, boostTier: c.boostTier, wishlisted: c.wishlisted }));
    ok(res, { pins, total: pins.length, scope: scopeInfo(scope) });
    return;
  }

  const sort = p.sort ?? (qText ? 'relevance' : 'recent');
  const selectExtra = w.distanceSql ? `, ${w.distanceSql} AS distance_m` : '';
  const selectParams = w.distanceSql ? w.distanceParams : [];
  let order = 'm.created_at DESC';
  const orderParams: (string | number)[] = [];
  switch (sort) {
    case 'price_asc': order = 'm.is_free DESC, m.price_cents ASC, m.created_at DESC'; break;
    case 'price_desc': order = 'm.price_cents DESC, m.created_at DESC'; break;
    case 'popular': order = 'm.wishlist_count DESC, m.view_count DESC, m.created_at DESC'; break;
    case 'distance': order = w.distanceSql ? `${w.distanceSql} ASC, m.created_at DESC` : 'm.created_at DESC'; if (w.distanceSql) orderParams.push(...w.distanceParams); break;
    case 'relevance':
      if (qText) {
        const like = `%${qText.replace(/[%_]/g, (c) => `\\${c}`)}%`;
        order = `((CASE WHEN m.title LIKE ? ESCAPE '\\' THEN 3 ELSE 0 END) + (CASE WHEN m.description LIKE ? ESCAPE '\\' THEN 1 ELSE 0 END) + (CASE WHEN m.category LIKE ? ESCAPE '\\' OR m.brand LIKE ? ESCAPE '\\' THEN 1 ELSE 0 END)) / (1.0 + (julianday('now') - julianday(m.created_at)) / 30.0) DESC, m.created_at DESC`;
        orderParams.push(like, like, like, like);
      }
      break;
    default: order = 'm.created_at DESC';
  }
  const { limit, offset } = pageWindow(p);
  const total = q.count(`SELECT COUNT(*) FROM market_items m WHERE ${whereSql}`, allParams);
  const rows = q.all<MarketItemRow>(`${itemSelect(selectExtra)} WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, [...selectParams, ...allParams, ...orderParams, limit, offset]);
  let items: ItemCard[] = cardsOf(rows, req);

  // sponsored slots (DATA_MODEL §8 rule 3) — only on the generic browse list
  const sponsoredEligible = !p.sellerId && !p.bundleId && !p.status && (scope.campusId || (scope.city && scope.state));
  if (sponsoredEligible) {
    const picks = pickSponsored({
      entityType: 'market_item', campusId: scope.scope === 'campus' ? scope.campusId : null, city: scope.city, state: scope.state,
      slots: sponsoredSlotCount(p.pageSize),
    });
    if (picks.length) {
      const ids = picks.map((x) => x.id);
      const srows = q.all<MarketItemRow>(`${ITEM_SELECT} WHERE m.id IN (${placeholders(ids.length)}) AND ${whereSql}`, [...ids, ...allParams]);
      const byId = new Map(srows.map((r) => [r.id, r]));
      const ordered = picks.filter((x) => byId.has(x.id));
      if (ordered.length) {
        const scards = cardsOf(ordered.map((x) => byId.get(x.id)!), req).map((c, i) => ({ ...c, sponsored: true, boostTier: ordered[i]!.tier, boostId: ordered[i]!.boostId }));
        items = mergeSponsored(items, scards, p.pageSize);
        recordImpressions(ordered.map((x) => x.boostId), req);
      }
    }
  }
  if (qText) logEvent(req, 'search', { props: { module: 'market', q: qText.slice(0, 80), total } });
  paginated(res, { items, total, page: p.page, pageSize: p.pageSize }, { scope: scopeInfo(scope) });
});

// ====================================================================== items: mine (dashboard)
router.get('/items/mine', requireAuth, (req, res) => {
  const p = parseQuery(req, MineQuery);
  const where = ['m.seller_id = ?', "m.status <> 'removed'"];
  const params: (string | number)[] = [req.user!.id];
  if (p.status !== 'all') { where.push('m.status = ?'); params.push(p.status); }
  const { limit, offset } = pageWindow(p);
  const total = q.count(`SELECT COUNT(*) FROM market_items m WHERE ${where.join(' AND ')}`, params);
  const rows = q.all<MarketItemRow>(`${ITEM_SELECT} WHERE ${where.join(' AND ')} ORDER BY CASE m.status WHEN 'active' THEN 0 WHEN 'reserved' THEN 1 WHEN 'draft' THEN 2 WHEN 'expired' THEN 3 ELSE 4 END, m.updated_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const counts = Object.fromEntries(q.all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM market_items WHERE seller_id = ? AND status <> 'removed' GROUP BY status", [req.user!.id]).map((r) => [r.status, r.n]));
  paginated(res, { items: itemDtos(rows, req), total, page: p.page, pageSize: p.pageSize }, { counts });
});

// ====================================================================== wishlist (static before /items/:id)
router.get('/wishlist', requireAuth, (req, res) => {
  const p = parseQuery(req, WishlistQuery);
  const { limit, offset } = pageWindow(p);
  const userId = req.user!.id;
  const total = q.count("SELECT COUNT(*) FROM wishlists w JOIN market_items m ON m.id = w.item_id WHERE w.user_id = ? AND m.status <> 'removed' AND m.moderation_status <> 'hidden'", [userId]);
  const rows = q.all<MarketItemRow & { price_at_add_cents: number | null; wished_at: string }>(
    `SELECT m.*, cu.url AS cover_url, w.price_at_add_cents, w.created_at AS wished_at
       FROM wishlists w JOIN market_items m ON m.id = w.item_id LEFT JOIN uploads cu ON cu.id = m.cover_upload_id
      WHERE w.user_id = ? AND m.status <> 'removed' AND m.moderation_status <> 'hidden'
      ORDER BY w.created_at DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset],
  );
  const cards = cardsOf(rows, req);
  const items = cards.map((c, i) => {
    const r = rows[i]!;
    const drop = r.price_at_add_cents !== null && r.price_at_add_cents > r.price_cents ? r.price_at_add_cents - r.price_cents : null;
    return { ...c, wishlisted: true, priceAtAddCents: r.price_at_add_cents, priceDropCents: drop, wishedAt: r.wished_at };
  });
  paginated(res, { items, total, page: p.page, pageSize: p.pageSize });
});

// ====================================================================== price suggestion
router.get('/price-suggestion', requireAuth, (req, res) => {
  const p = parseQuery(req, PriceSuggestionQuery);
  const campusId = p.campusId ?? resolveCampusId(req).id;
  const s = priceSuggestion({ category: p.category, condition: p.condition, campusId, title: p.title });
  ok(res, s ?? { suggestedCents: 0, lowCents: 0, highCents: 0, sampleSize: 0, basis: 'nationwide' });
});

// ====================================================================== categories
router.get('/categories', (req, res) => {
  const p = parseQuery(req, z.object({ campusId: z.string().max(64).optional() }));
  const campusId = resolveCampusId(req, p.campusId).id;
  const rows = campusId
    ? q.all<{ category: string; n: number }>("SELECT category, COUNT(*) AS n FROM market_items WHERE campus_id = ? AND status IN ('active','reserved') AND moderation_status = 'ok' GROUP BY category", [campusId])
    : q.all<{ category: string; n: number }>("SELECT category, COUNT(*) AS n FROM market_items WHERE status IN ('active','reserved') AND moderation_status = 'ok' GROUP BY category");
  const counts = new Map(rows.map((r) => [r.category, r.n]));
  ok(res, { campusId, categories: MarketCategory.map((key) => ({ key, icon: CATEGORY_ICONS[key], count: counts.get(key) ?? 0 })) });
});

// ====================================================================== bundles (static paths first)
router.get('/bundles/for-listing/:listingId', (req, res) => {
  const { listingId } = parseParams(req, z.object({ listingId: z.string().min(1).max(128) }));
  ok(res, bundleForListing(listingId, req));
});

router.get('/bundles', (req, res) => {
  const p = parseQuery(req, BundleListQuery);
  const scope = scopeFromQuery(req, p, { requireCampus: !p.sellerId });
  const w = whereScope(scope, { alias: 'b', latCol: 'lat', lngCol: 'lng', cityCol: 'city', stateCol: 'state' });
  // bundles have no coordinates: only the campus / nationwide part of the scope applies
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (p.status === 'all') where.push("b.status <> 'removed'");
  else where.push('b.status = ?'), params.push(p.status);
  if (p.sellerId) where.push('b.seller_id = ?'), params.push(p.sellerId);
  if (scope.scope === 'campus' && scope.campusId && !p.sellerId) where.push('b.campus_id = ?'), params.push(scope.campusId);
  void w;
  const { limit, offset } = pageWindow(p);
  const total = q.count(`SELECT COUNT(*) FROM market_bundles b WHERE ${where.join(' AND ')}`, params);
  const rows = q.all<BundleRow>(`SELECT b.* FROM market_bundles b WHERE ${where.join(' AND ')} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  paginated(res, { items: bundleDtos(rows, { withItems: true, withSeller: true, withListing: true, req }), total, page: p.page, pageSize: p.pageSize }, { scope: scopeInfo(scope) });
});

router.post('/bundles', requireTrust(1), writes, (req, res) => {
  const body = parseBody(req, BundleInput);
  const user = req.user!;
  const campusId = body.campusId ?? resolveCampusId(req).id;
  if (!campusId || !getCampus(campusId)) throw new ApiError('VALIDATION', 'campusId is required', { fields: { campusId: 'required' } });
  if (body.listingId) {
    const l = q.get<{ owner_id: string }>('SELECT owner_id FROM listings WHERE id = ?', [body.listingId]);
    if (!l) throw new ApiError('NOT_FOUND', 'Listing not found');
    if (l.owner_id !== user.id && !isAdmin(req)) throw new ApiError('FORBIDDEN', 'Listing is not yours');
  }
  const t = nowIso();
  const row: BundleRow = {
    id: uid(), seller_id: user.id, campus_id: campusId, listing_id: body.listingId ?? null, title: body.title, description: body.description ?? null,
    discount_pct: body.discountPct, move_out_date: body.moveOutDate ?? null, status: 'active', item_count: 0, created_at: t, updated_at: t,
  };
  q.tx(() => {
    q.insert('market_bundles', row as unknown as Record<string, string | number | null>);
    if (body.itemIds?.length) setBundleItems(row, body.itemIds);
  });
  logEvent(req, 'bundle.create', { entityType: 'market_bundle', entityId: row.id, props: { listingId: row.listing_id, items: body.itemIds?.length ?? 0, discountPct: row.discount_pct } });
  ok(res, bundleDto(requireBundle(row.id), { withItems: true, withListing: true, withSeller: true, req }), 201);
});

router.get('/bundles/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const b = requireBundle(id);
  ok(res, bundleDto(b, { withItems: true, withListing: true, withSeller: true, req }));
});

router.patch('/bundles/:id', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const b = requireBundle(id);
  assertOwner(req, b.seller_id);
  const body = parseBody(req, BundlePatch);
  if (body.listingId) {
    const l = q.get<{ owner_id: string }>('SELECT owner_id FROM listings WHERE id = ?', [body.listingId]);
    if (!l) throw new ApiError('NOT_FOUND', 'Listing not found');
    if (l.owner_id !== b.seller_id && !isAdmin(req)) throw new ApiError('FORBIDDEN', 'Listing is not yours');
  }
  const patch: Record<string, string | number | null> = { updated_at: nowIso() };
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.listingId !== undefined) patch.listing_id = body.listingId;
  if (body.discountPct !== undefined) patch.discount_pct = body.discountPct;
  if (body.moveOutDate !== undefined) patch.move_out_date = body.moveOutDate;
  q.tx(() => {
    q.update('market_bundles', patch, 'id = ?', [b.id]);
    if (body.itemIds) setBundleItems(b, body.itemIds);
  });
  ok(res, bundleDto(requireBundle(b.id), { withItems: true, withListing: true, withSeller: true, req }));
});

router.put('/bundles/:id/items', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const b = requireBundle(id);
  assertOwner(req, b.seller_id);
  const body = parseBody(req, BundleItemsInput);
  setBundleItems(b, body.itemIds);
  ok(res, bundleDto(requireBundle(b.id), { withItems: true, withListing: true, withSeller: true, req }));
});

router.post('/bundles/:id/close', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const b = requireBundle(id);
  assertOwner(req, b.seller_id);
  if (b.status !== 'active') throw invalidState(b.status, 'closed');
  q.update('market_bundles', { status: 'closed', updated_at: nowIso() }, 'id = ?', [b.id]);
  ok(res, bundleDto(requireBundle(b.id), { withItems: true, withListing: true, withSeller: true, req }));
});

// "message seller" from a bundle page: opens the direct conversation with the bundle's first item as context card
router.post('/bundles/:id/contact', requireTrust(1), writes, async (req, res) => {
  const { id } = parseParams(req, idParam);
  const b = requireBundle(id);
  const me = req.user!;
  if (b.seller_id === me.id) throw new ApiError('BAD_REQUEST', 'This is your own bundle');
  if (b.status !== 'active') throw invalidState(b.status, 'contact');
  const first = q.get<{ id: string }>("SELECT id FROM market_items WHERE bundle_id = ? AND status IN ('active','reserved') ORDER BY price_cents DESC LIMIT 1", [b.id]);
  if (!first) throw new ApiError('INVALID_STATE', 'Bundle has no items', { data: { from: 'empty', to: 'contact' } });
  const seller = q.get<{ verified_only_messaging: number; banned: number }>('SELECT verified_only_messaging, banned FROM users WHERE id = ?', [b.seller_id]);
  if (!seller || seller.banned) throw new ApiError('NOT_FOUND', 'Seller unavailable');
  if (isBlockedEither(me.id, b.seller_id)) throw new ApiError('BLOCKED', 'You cannot message this user');
  if (seller.verified_only_messaging && me.trust_level < 1) throw new ApiError('VERIFIED_ONLY', 'Seller only accepts verified users');
  const intro = me.locale === 'en' ? `Hi, I'm interested in your move-out bundle "${b.title}".` : `你好，我对你的搬家甩卖「${b.title}」感兴趣。`;
  let conversationId: string;
  let created = false;
  try {
    const r2 = await openChatConversation({ initiatorId: me.id, recipientId: b.seller_id, context: { type: 'market_item', id: first.id }, firstMessage: { kind: 'text', body: intro } });
    conversationId = r2.conversationId; created = r2.created;
  } catch (e) {
    if (!(e instanceof ApiError && e.code === 'NOT_IMPLEMENTED')) throw e;
    const r3 = openConversationRaw({ kind: 'direct', memberIds: [me.id, b.seller_id], campusId: b.campus_id, context: { type: 'market_item', id: first.id }, createdBy: me.id });
    conversationId = r3.conversation.id; created = r3.created;
    if (created) { const card = contextCardFor('market_item', first.id); if (card) postContextCard(conversationId, me.id, card); }
    if (created) postMessage(conversationId, me.id, 'text', intro);
  }
  logEvent(req, 'item.contact_click', { entityType: 'market_bundle', entityId: b.id, campusId: b.campus_id, props: { created, conversationId, bundle: true } });
  ok(res, { conversationId, created });
});

router.delete('/bundles/:id', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const b = requireBundle(id);
  assertOwner(req, b.seller_id);
  const t = nowIso();
  q.tx(() => {
    q.run('UPDATE market_items SET bundle_id = NULL, updated_at = ? WHERE bundle_id = ?', [t, b.id]);
    q.update('market_bundles', { status: 'removed', updated_at: t }, 'id = ?', [b.id]);
  });
  if (isAdmin(req) && req.user!.id !== b.seller_id) audit(req, { action: 'market.bundle_remove', entityType: 'market_bundle', entityId: b.id, before: { status: b.status }, after: { status: 'removed' } });
  ok(res, null);
});

// ====================================================================== items: create
async function resolvePickup(input: { pickupLat?: number | null; pickupLng?: number | null; pickupLabel?: string | null }, campusId: string, itemId: string): Promise<{ lat: number; lng: number }> {
  if (typeof input.pickupLat === 'number' && typeof input.pickupLng === 'number') return { lat: input.pickupLat, lng: input.pickupLng };
  const campus = getCampus(campusId);
  if (input.pickupLabel) {
    const g = await geocode(`${input.pickupLabel}, ${campus?.city ?? ''} ${campus?.state ?? ''}`.trim(), { campusId, near: campus ? { lat: campus.lat, lng: campus.lng } : undefined });
    if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) return g.approx ? fuzz(itemId, g.lat, g.lng, 600) : { lat: g.lat, lng: g.lng };
  }
  if (campus) return fuzz(itemId, campus.lat, campus.lng, 800);
  return { lat: 0, lng: 0 };
}

function assertPublishable(r: MarketItemRow, photoCount: number): void {
  if (photoCount === 0 && !(r.is_free || r.category === 'free')) throw new ApiError('VALIDATION', 'Add at least one photo', { fields: { photos: 'at least one photo is required' } });
}

router.post('/items', requireTrust(1), writes, async (req, res) => {
  const body = parseBody(req, ItemInput);
  const user = req.user!;
  const campusId = body.campusId ?? resolveCampusId(req).id;
  if (!campusId || !getCampus(campusId)) throw new ApiError('VALIDATION', 'campusId is required', { fields: { campusId: 'required' } });
  if (body.bundleId) {
    const b = loadBundle(body.bundleId);
    if (!b || b.status === 'removed' || b.seller_id !== user.id) throw new ApiError('FORBIDDEN', 'Bundle is not yours');
  }
  const id = uid();
  const t = nowIso();
  const pickup = await resolvePickup(body, campusId, id);
  const cityState = campusCityState(campusId);
  const isFree = body.isFree || body.category === 'free' || body.priceCents === 0;
  const status = body.draft ? 'draft' : 'active';
  const row = {
    id, seller_id: user.id, campus_id: campusId, bundle_id: body.bundleId ?? null, title: body.title, description: body.description,
    category: body.category, condition: body.condition, price_cents: isFree ? 0 : body.priceCents, is_free: isFree ? 1 : 0, obo: body.obo && !isFree ? 1 : 0,
    original_price_cents: body.originalPriceCents ?? null, brand: body.brand ?? null, pickup_label: body.pickupLabel ?? null, pickup_lat: pickup.lat, pickup_lng: pickup.lng,
    city: body.city ?? cityState.city, state: body.state?.toUpperCase() ?? cityState.state, delivery_option: body.deliveryOption, status, moderation_status: 'ok',
    boosted_until: null, buyer_id: null, sold_at: null, sold_price_cents: null, cover_upload_id: null, photo_count: 0, view_count: 0, wishlist_count: 0, chat_count: 0,
    expires_at: status === 'active' ? daysFromNow(ITEM_TTL_DAYS) : null, created_at: t, updated_at: t,
  };
  q.tx(() => {
    q.insert('market_items', row);
    const item = requireItem(id);
    if (body.photos?.length) setItemPhotos(item, body.photos.map((p) => p.uploadId));
    if (status === 'active') assertPublishable(item, body.photos?.length ?? 0);
  });
  logEvent(req, status === 'active' ? 'item.publish' : 'item.draft', { entityType: 'market_item', entityId: id, props: { category: row.category, priceCents: row.price_cents, isFree, campusId } });
  ok(res, itemDto(requireItem(id), req, { withSuggestion: true }), 201);
});

// ====================================================================== items: detail
router.get('/items/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = requireItem(id);
  if (!canView(req, r)) throw new ApiError('NOT_FOUND', 'Item not found');
  const viewerId = req.user?.id ?? null;
  if (viewerId !== r.seller_id) {
    const key = { userId: viewerId, sessionId: req.sessionId ?? null };
    if (!recentlyLogged(key, 'item.view', 'market_item', r.id, 6 * HOUR)) {
      q.run('UPDATE market_items SET view_count = view_count + 1 WHERE id = ?', [r.id]);
      r.view_count += 1;
    }
    logEvent(req, 'item.view', { entityType: 'market_item', entityId: r.id, campusId: r.campus_id, props: { category: r.category, sponsored: req.query.src === 'sponsored' || typeof req.query.boost === 'string' } });
  }
  // sponsored click accounting (same contract as GET /api/listings/:id?boost=<boostId>)
  const boostId = typeof req.query.boost === 'string' ? req.query.boost : null;
  if (boostId && viewerId !== r.seller_id && q.get('SELECT 1 FROM v_active_boosts WHERE id = ? AND entity_id = ?', [boostId, r.id])) recordClick(boostId, req);
  ok(res, itemDto(r, req, { withSimilar: true, withSuggestion: true }));
});

// ====================================================================== items: update / lifecycle
router.patch('/items/:id', requireAuth, writes, async (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = requireItem(id);
  assertOwner(req, r.seller_id);
  if (r.status === 'removed' || r.status === 'sold') throw invalidState(r.status, 'edit');
  const body = parseBody(req, ItemPatch);
  if (body.bundleId) {
    const b = loadBundle(body.bundleId);
    if (!b || b.status === 'removed' || b.seller_id !== r.seller_id) throw new ApiError('FORBIDDEN', 'Bundle is not yours');
  }
  const patch: Record<string, string | number | null> = { updated_at: nowIso() };
  const nextCategory = body.category ?? r.category;
  const nextFree = body.isFree ?? (nextCategory === 'free' ? true : r.is_free === 1);
  const nextPrice = nextFree ? 0 : body.priceCents ?? r.price_cents;
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.category !== undefined) patch.category = body.category;
  if (body.condition !== undefined) patch.condition = body.condition;
  patch.is_free = nextFree ? 1 : 0;
  patch.price_cents = nextPrice;
  if (body.obo !== undefined || nextFree) patch.obo = nextFree ? 0 : body.obo ? 1 : 0;
  if (body.originalPriceCents !== undefined) patch.original_price_cents = body.originalPriceCents;
  if (body.brand !== undefined) patch.brand = body.brand;
  if (body.pickupLabel !== undefined) patch.pickup_label = body.pickupLabel;
  if (body.pickupLat !== undefined && body.pickupLng !== undefined && body.pickupLat !== null && body.pickupLng !== null) { patch.pickup_lat = body.pickupLat; patch.pickup_lng = body.pickupLng; }
  else if (body.pickupLabel && body.pickupLabel !== r.pickup_label && body.pickupLat === undefined) {
    const p = await resolvePickup({ pickupLabel: body.pickupLabel }, r.campus_id, r.id);
    patch.pickup_lat = p.lat; patch.pickup_lng = p.lng;
  }
  if (body.city !== undefined) patch.city = body.city;
  if (body.state !== undefined) patch.state = body.state?.toUpperCase() ?? null;
  if (body.deliveryOption !== undefined) patch.delivery_option = body.deliveryOption;
  if (body.bundleId !== undefined) patch.bundle_id = body.bundleId;
  q.tx(() => {
    q.update('market_items', patch, 'id = ?', [r.id]);
    if (body.photos) setItemPhotos(r, body.photos.map((p) => p.uploadId));
  });
  // price drop → wishlisters (DATA_MODEL §3.7)
  if (nextPrice < r.price_cents && r.status === 'active') {
    const watchers = q.all<{ user_id: string }>('SELECT user_id FROM wishlists WHERE item_id = ? AND user_id <> ?', [r.id, r.seller_id]).map((w) => w.user_id);
    if (watchers.length) {
      const dollars = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
      notifyMany(watchers, 'market.wishlist_price', {
        title: { zh: `心愿单降价：${itemTitleLocalized(r.title).zh}`, en: `Price drop: ${itemTitleLocalized(r.title).en}` },
        body: nextFree ? { zh: '现在免费送', en: 'Now free' } : { zh: `${dollars(r.price_cents)} → ${dollars(nextPrice)}`, en: `${dollars(r.price_cents)} → ${dollars(nextPrice)}` },
        link: `/market/${r.id}`, entityType: 'market_item', entityId: r.id, data: { fromCents: r.price_cents, toCents: nextPrice },
      });
    }
    logEvent(req, 'item.price_drop', { entityType: 'market_item', entityId: r.id, props: { fromCents: r.price_cents, toCents: nextPrice, notified: watchers.length } });
  }
  if (isAdmin(req) && req.user!.id !== r.seller_id) audit(req, { action: 'market.item_edit', entityType: 'market_item', entityId: r.id, before: { title: r.title, price_cents: r.price_cents }, after: patch });
  ok(res, itemDto(requireItem(r.id), req, { withSuggestion: true }));
});

function transition(req: Request, from: MarketItemRow['status'][], to: MarketItemRow['status'], extra: Record<string, string | number | null> = {}) {
  const { id } = parseParams(req, idParam);
  const r = requireItem(id);
  assertOwner(req, r.seller_id);
  if (!from.includes(r.status)) throw invalidState(r.status, to);
  q.update('market_items', { status: to, updated_at: nowIso(), ...extra }, 'id = ?', [r.id]);
  return requireItem(r.id);
}

router.post('/items/:id/publish', requireTrust(1), writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = requireItem(id);
  assertOwner(req, r.seller_id);
  if (r.status !== 'draft') throw invalidState(r.status, 'active');
  assertPublishable(r, r.photo_count);
  q.update('market_items', { status: 'active', expires_at: daysFromNow(ITEM_TTL_DAYS), updated_at: nowIso() }, 'id = ?', [r.id]);
  logEvent(req, 'item.publish', { entityType: 'market_item', entityId: r.id, props: { category: r.category, priceCents: r.price_cents, campusId: r.campus_id } });
  hooks.emit('content.published', { userId: r.seller_id, entityType: 'market_item', entityId: r.id });
  ok(res, itemDto(requireItem(r.id), req));
});
router.post('/items/:id/reserve', requireAuth, writes, (req, res) => ok(res, itemDto(transition(req, ['active'], 'reserved'), req)));
router.post('/items/:id/unreserve', requireAuth, writes, (req, res) => ok(res, itemDto(transition(req, ['reserved'], 'active'), req)));
router.post('/items/:id/renew', requireAuth, writes, (req, res) => {
  const item = transition(req, ['expired', 'active'], 'active', { expires_at: daysFromNow(ITEM_TTL_DAYS) });
  logEvent(req, 'item.renew', { entityType: 'market_item', entityId: item.id });
  ok(res, itemDto(item, req));
});

router.post('/items/:id/sold', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = requireItem(id);
  assertOwner(req, r.seller_id);
  if (r.status !== 'active' && r.status !== 'reserved') throw invalidState(r.status, 'sold');
  const body = parseBody(req, MarkSoldInput);
  let buyer: UserPublic | null = null;
  if (body.buyerId) {
    if (body.buyerId === r.seller_id) throw new ApiError('VALIDATION', 'Buyer cannot be the seller', { fields: { buyerId: 'cannot be yourself' } });
    buyer = loadUserPublic(body.buyerId);
    if (!buyer) throw new ApiError('VALIDATION', 'Unknown buyer', { fields: { buyerId: 'unknown user' } });
  }
  const soldPrice = body.soldPriceCents ?? (r.is_free ? 0 : r.price_cents);
  const t = nowIso();
  q.update('market_items', { status: 'sold', buyer_id: buyer?.id ?? null, sold_at: t, sold_price_cents: soldPrice, updated_at: t }, 'id = ?', [r.id]);
  logEvent(req, 'item.sold', { entityType: 'market_item', entityId: r.id, campusId: r.campus_id, props: { category: r.category, listCents: r.price_cents, soldCents: soldPrice, hasBuyer: !!buyer, daysListed: Math.round((Date.now() - Date.parse(r.created_at)) / 86_400_000) } });
  if (buyer) {
    notify(buyer.id, 'system', {
      title: { zh: `${req.user!.name} 已将 ${itemTitleLocalized(r.title).zh} 标记为售出给你`, en: `${req.user!.name} marked ${itemTitleLocalized(r.title).en} as sold to you` },
      body: { zh: '交易愉快。如有问题可以在聊天里继续联系。', en: 'Enjoy it. You can keep talking in your chat if anything comes up.' },
      link: `/market/${r.id}`, entityType: 'market_item', entityId: r.id, data: { soldPriceCents: soldPrice },
    });
  }
  // wishlisters learn the item is gone (one quiet notification, no bell spam: silent)
  const watchers = q.all<{ user_id: string }>('SELECT user_id FROM wishlists WHERE item_id = ? AND user_id <> ? AND user_id <> ?', [r.id, r.seller_id, buyer?.id ?? '']).map((w) => w.user_id);
  if (watchers.length) notifyMany(watchers, 'system', { title: { zh: `${itemTitleLocalized(r.title).zh} 已售出`, en: `${itemTitleLocalized(r.title).en} has been sold` }, body: { zh: '看看相似的物品。', en: 'Browse similar items.' }, link: `/market/${r.id}`, entityType: 'market_item', entityId: r.id, silent: true });
  ok(res, itemDto(requireItem(r.id), req));
});

router.delete('/items/:id', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = requireItem(id);
  assertOwner(req, r.seller_id);
  if (r.status === 'removed') throw invalidState(r.status, 'removed');
  const t = nowIso();
  q.update('market_items', { status: 'removed', bundle_id: null, updated_at: t }, 'id = ?', [r.id]);
  if (isAdmin(req) && req.user!.id !== r.seller_id) audit(req, { action: 'market.item_remove', entityType: 'market_item', entityId: r.id, before: { status: r.status }, after: { status: 'removed' } });
  logEvent(req, 'item.delete', { entityType: 'market_item', entityId: r.id });
  ok(res, null);
});

router.put('/items/:id/photos', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = requireItem(id);
  assertOwner(req, r.seller_id);
  const body = parseBody(req, ItemPhotosInput);
  ok(res, setItemPhotos(r, body.photos.map((p) => p.uploadId)));
});

// ====================================================================== buy via chat
router.get('/items/:id/buyers', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = requireItem(id);
  assertOwner(req, r.seller_id);
  ok(res, buyerCandidates(r.seller_id, r.id));
});

router.post('/items/:id/contact', requireTrust(1), writes, async (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = requireItem(id);
  const me = req.user!;
  if (!canView(req, r)) throw new ApiError('NOT_FOUND', 'Item not found');
  if (r.seller_id === me.id) throw new ApiError('BAD_REQUEST', 'This is your own item');
  if (r.status !== 'active' && r.status !== 'reserved') throw invalidState(r.status, 'contact');
  const body = parseBody(req, ContactInput);
  const seller = q.get<{ verified_only_messaging: number; banned: number }>('SELECT verified_only_messaging, banned FROM users WHERE id = ?', [r.seller_id]);
  if (!seller || seller.banned) throw new ApiError('NOT_FOUND', 'Seller unavailable');
  if (isBlockedEither(me.id, r.seller_id)) throw new ApiError('BLOCKED', 'You cannot message this user');
  if (seller.verified_only_messaging && me.trust_level < 1) throw new ApiError('VERIFIED_ONLY', 'Seller only accepts verified users');

  const offerText = body.offerCents !== undefined && body.offerCents > 0 ? `${me.locale === 'en' ? 'My offer' : '我的出价'}: $${(body.offerCents / 100).toFixed(body.offerCents % 100 ? 2 : 0)}` : null;
  const firstBody = [body.message, offerText].filter(Boolean).join('\n') || null;
  let conversationId: string;
  let created = false;
  try {
    // chat module adds block / verified-only / quota checks on top of the shared primitives
    const r2 = await openChatConversation({ initiatorId: me.id, recipientId: r.seller_id, context: { type: 'market_item', id: r.id }, firstMessage: firstBody ? { kind: 'text', body: firstBody } : null });
    conversationId = r2.conversationId;
    created = r2.created;
  } catch (e) {
    if (!(e instanceof ApiError && e.code === 'NOT_IMPLEMENTED')) throw e;
    const r3 = openConversationRaw({ kind: 'direct', memberIds: [me.id, r.seller_id], campusId: r.campus_id, context: { type: 'market_item', id: r.id }, createdBy: me.id });
    conversationId = r3.conversation.id;
    created = r3.created;
    if (created) {
      const card = contextCardFor('market_item', r.id);
      if (card) postContextCard(conversationId, me.id, card);
    }
    if (firstBody) postMessage(conversationId, me.id, 'text', firstBody);
  }
  if (created) {
    q.run('UPDATE market_items SET chat_count = chat_count + 1 WHERE id = ?', [r.id]);
    if (!firstBody) {
      notify(r.seller_id, 'chat.message', {
        title: { zh: `${me.name} 想买 ${itemTitleLocalized(r.title).zh}`, en: `${me.name} is interested in ${itemTitleLocalized(r.title).en}` },
        body: { zh: '到聊天里聊聊取货时间吧。', en: 'Open the chat to arrange a pickup.' },
        link: `/chat/${conversationId}`, entityType: 'conversation', entityId: conversationId, data: { itemId: r.id },
      });
    }
  }
  logEvent(req, 'item.contact_click', { entityType: 'market_item', entityId: r.id, campusId: r.campus_id, props: { created, offerCents: body.offerCents ?? null, conversationId } });
  ok(res, { conversationId, created });
});

// ====================================================================== wishlist add/remove
router.post('/items/:id/wishlist', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = requireItem(id);
  if (!canView(req, r)) throw new ApiError('NOT_FOUND', 'Item not found');
  const userId = req.user!.id;
  const existing = q.get<{ user_id: string }>('SELECT user_id FROM wishlists WHERE user_id = ? AND item_id = ?', [userId, r.id]);
  if (!existing) {
    q.run('INSERT INTO wishlists (user_id, item_id, price_at_add_cents, created_at) VALUES (?, ?, ?, ?)', [userId, r.id, r.is_free ? 0 : r.price_cents, nowIso()]);
    logEvent(req, 'item.wishlist', { entityType: 'market_item', entityId: r.id, campusId: r.campus_id, props: { on: true } });
  }
  ok(res, { wishlisted: true, wishlistCount: q.scalar<number>('SELECT wishlist_count FROM market_items WHERE id = ?', [r.id]) ?? r.wishlist_count });
});
router.delete('/items/:id/wishlist', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = requireItem(id);
  const changed = q.run('DELETE FROM wishlists WHERE user_id = ? AND item_id = ?', [req.user!.id, r.id]).changes;
  if (changed) logEvent(req, 'item.wishlist', { entityType: 'market_item', entityId: r.id, props: { on: false } });
  ok(res, { wishlisted: false, wishlistCount: q.scalar<number>('SELECT wishlist_count FROM market_items WHERE id = ?', [r.id]) ?? 0 });
});

// ====================================================================== report
router.post('/items/:id/report', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = requireItem(id);
  const body = parseBody(req, ReportInput);
  ok(res, createReport(req, { entityType: 'market_item', entityId: r.id, reason: body.reason, details: body.details, campusId: r.campus_id }));
});

// ====================================================================== admin (consumed by web/src/features/market/admin.tsx)
const AdminItemsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['active', 'reserved', 'sold', 'draft', 'expired', 'removed', 'all']).default('all'),
  moderation: z.enum(['ok', 'flagged', 'hidden', 'all']).default('all'),
  q: z.string().trim().max(120).optional(), campusId: z.string().max(64).optional(),
});
router.get('/admin/items', requireAdmin, (req, res) => {
  const p = parseQuery(req, AdminItemsQuery);
  const where: string[] = ['1 = 1'];
  const params: (string | number)[] = [];
  if (p.status !== 'all') where.push('m.status = ?'), params.push(p.status);
  if (p.moderation !== 'all') where.push('m.moderation_status = ?'), params.push(p.moderation);
  if (p.campusId) where.push('m.campus_id = ?'), params.push(p.campusId);
  if (p.q) { const like = `%${p.q}%`; where.push('(m.title LIKE ? OR m.id = ?)'); params.push(like, p.q); }
  const { limit, offset } = pageWindow(p);
  const total = q.count(`SELECT COUNT(*) FROM market_items m WHERE ${where.join(' AND ')}`, params);
  const rows = q.all<MarketItemRow>(`${ITEM_SELECT} WHERE ${where.join(' AND ')} ORDER BY m.updated_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const reportCounts = new Map(q.all<{ entity_id: string; n: number }>("SELECT entity_id, COUNT(*) AS n FROM reports WHERE entity_type = 'market_item' AND status IN ('open','in_review') GROUP BY entity_id").map((r) => [r.entity_id, r.n]));
  const items = itemDtos(rows, req).map((it, i) => ({ ...it, moderationStatus: rows[i]!.moderation_status, openReports: reportCounts.get(it.id) ?? 0 }));
  const stats = {
    active: q.count("SELECT COUNT(*) FROM market_items WHERE status = 'active'"),
    sold30d: q.count("SELECT COUNT(*) FROM market_items WHERE status = 'sold' AND sold_at >= ?", [new Date(Date.now() - 30 * 86_400_000).toISOString()]),
    flagged: q.count("SELECT COUNT(*) FROM market_items WHERE moderation_status = 'flagged'"),
    hidden: q.count("SELECT COUNT(*) FROM market_items WHERE moderation_status = 'hidden'"),
    bundles: q.count("SELECT COUNT(*) FROM market_bundles WHERE status = 'active'"),
    openReports: q.count("SELECT COUNT(*) FROM reports WHERE entity_type = 'market_item' AND status IN ('open','in_review')"),
  };
  paginated(res, { items, total, page: p.page, pageSize: p.pageSize }, { stats });
});
router.post('/admin/items/:id/moderate', requireAdmin, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = requireItem(id);
  const body = parseBody(req, z.object({ moderationStatus: z.enum(['ok', 'flagged', 'hidden']), reason: z.string().max(500).optional() }));
  q.update('market_items', { moderation_status: body.moderationStatus, updated_at: nowIso() }, 'id = ?', [r.id]);
  audit(req, { action: 'market.item_moderate', entityType: 'market_item', entityId: r.id, before: { moderation_status: r.moderation_status }, after: { moderation_status: body.moderationStatus }, reason: body.reason ?? null });
  if (body.moderationStatus === 'hidden' && r.moderation_status !== 'hidden') {
    notify(r.seller_id, 'report.actioned', {
      title: { zh: `${itemTitleLocalized(r.title).zh} 已被下架`, en: `${itemTitleLocalized(r.title).en} was hidden` },
      body: body.reason ?? { zh: '违反了社区规则。如有疑问请联系我们。', en: 'It broke the community rules. Contact us if you think this is a mistake.' },
      link: `/market/${r.id}`, entityType: 'market_item', entityId: r.id,
    });
  }
  ok(res, { ...itemDto(requireItem(r.id), req), moderationStatus: body.moderationStatus });
});

export default router;
