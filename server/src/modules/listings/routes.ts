// server/src/modules/listings/routes.ts — OWNED BY THE `listings` MODULE AGENT. Mounted at /api/listings (API.md §3).
import { hooks } from '../../lib/hooks';
import { Router } from 'express';
import { z } from 'zod';
import type { Lead, Listing, ListingCard, ListingPin } from '@shared/types';
import { idParam, ReportInput } from '@shared/schemas/common';
import {
  AmenitiesInput, AvailabilityInput, CampusStatsQuery, ContactInput, GeocodeQuery, LeadStatusInput, LeadsQuery, ListingInput, ListingListQuery,
  ListingUpdateInput, MineQuery, PhotosInput, RentedInput, SimilarQuery, StatsQuery, SuggestCampusQuery,
} from '@shared/schemas/listings';
import { q, placeholders } from '../../db';
import { ok, paginated, parseBody, parseParams, parseQuery, pageWindow } from '../../lib/http';
import { requireAuth, requireTrust, assertOwner, isAdmin, trustError } from '../../lib/auth';
import { rateLimit } from '../../lib/ratelimit';
import { ApiError } from '../../lib/errors';
import { scopeFromQuery, whereScope, scopeInfo, geocode, suggestCampus, haversineM } from '../../lib/geo';
import { listingCards, type ListingCardRow } from '../../lib/cards';
import { pickSponsored, mergeSponsored, sponsoredSlotCount, recordImpressions, recordClick } from '../../lib/sponsored';
import { logEvent } from '../../lib/events';
import { notify } from '../../lib/notify';
import { createReport } from '../../lib/reports';
import { getCampus } from '../../lib/campuses';
import { loadUsersPublic } from '../../lib/users';
import { isPro } from '../../lib/trust';
import { openConversation, postContextCard, isBlockedEither } from '../../lib/conversations';
import { sendMessage as sendChatMessage } from '../chat/service';
import { nowIso, nowMs, DAY } from '../../lib/time';
import { config } from '../../config';
import {
  PUBLIC_WHERE, canSeeExact, createListing, updateListing, loadListingRow, requireListingRow, toListingDto, publishListing, pauseListing, resumeListing,
  markRented, renewListing, removeListing, replacePhotos, replaceAmenities, replaceAvailability, listAvailability, recordLead, listingContextCard, recordView,
  shareQrSvg, type ListingRow, type LeadRow,
} from './service';

const router = Router();
const writes = rateLimit('writes');

// ------------------------------------------------------------------ filters shared by list + pins + stats
type Built = { where: string; params: (string | number)[]; distanceSql: string | null; distanceParams: number[]; scope: ReturnType<typeof scopeFromQuery> };

function buildListWhere(req: Parameters<typeof scopeFromQuery>[0], p: ListingListQuery, opts: { requireCampus?: boolean } = {}): Built {
  const parts: string[] = [PUBLIC_WHERE];
  const params: (string | number)[] = [];
  let scope: ReturnType<typeof scopeFromQuery>;
  let w: ReturnType<typeof whereScope>;
  if (p.ownerId) {
    // a user's public listings: no campus filter (profile page), but scope info still echoed
    scope = scopeFromQuery(req, { ...p, scope: 'nationwide' }, { requireCampus: false });
    w = { sql: '', params: [], distanceSql: null, distanceParams: [] };
    parts.push('l.owner_id = ?');
    params.push(p.ownerId);
  } else {
    scope = scopeFromQuery(req, p, { requireCampus: opts.requireCampus ?? true });
    w = whereScope(scope, { alias: 'l', fuzz: 'listing' });
  }
  if (w.sql) {
    parts.push(w.sql.replace(/^ AND /, ''));
    params.push(...w.params);
  }
  if (p.q) {
    const like = `%${p.q.replace(/[%_]/g, (m) => '\\' + m)}%`;
    parts.push("(l.title LIKE ? ESCAPE '\\' OR l.description LIKE ? ESCAPE '\\' OR l.city LIKE ? ESCAPE '\\' OR l.neighborhood LIKE ? ESCAPE '\\' OR l.address_line1 LIKE ? ESCAPE '\\')");
    params.push(like, like, like, like, like);
  }
  if (p.priceMin !== undefined) { parts.push('l.price_cents >= ?'); params.push(p.priceMin); }
  if (p.priceMax !== undefined) { parts.push('l.price_cents <= ?'); params.push(p.priceMax); }
  if (p.bedrooms?.length) {
    const exact = p.bedrooms.filter((b) => b !== '4+').map(Number).filter((n) => Number.isFinite(n));
    const or: string[] = [];
    if (exact.length) { or.push(`l.bedrooms IN (${placeholders(exact.length)})`); params.push(...exact); }
    if (p.bedrooms.includes('4+')) or.push('l.bedrooms >= 4');
    if (or.length) parts.push(`(${or.join(' OR ')})`);
  }
  if (p.bathroomsMin !== undefined) { parts.push('l.bathrooms >= ?'); params.push(p.bathroomsMin); }
  for (const [key, col] of [['propertyType', 'property_type'], ['listingType', 'listing_type'], ['furnished', 'furnished']] as const) {
    const v = p[key];
    if (v?.length) { parts.push(`l.${col} IN (${placeholders(v.length)})`); params.push(...v); }
  }
  if (p.availableFrom) { parts.push("l.available_from <= date(?, '+14 days')"); params.push(p.availableFrom); }
  if (p.availableTo) { parts.push('(l.available_to IS NULL OR l.available_to >= ?)'); params.push(p.availableTo); }
  if (p.minTermMax !== undefined) { parts.push('l.min_term_months <= ?'); params.push(p.minTermMax); }
  if (p.genderPref && p.genderPref !== 'any') { parts.push("l.gender_pref IN ('any', ?)"); params.push(p.genderPref); }
  else if (p.genderPref === 'any') parts.push("l.gender_pref = 'any'");
  if (p.petsAllowed === true) parts.push('l.pets_allowed = 1');
  if (p.parking === true) parts.push("l.parking != 'none'");
  if (p.utilitiesIncluded === true) parts.push('l.utilities_included = 1');
  if (p.verifiedOnly === true) parts.push('l.is_verified_listing = 1');
  if (p.nearShuttle === true) parts.push('l.nearest_stop_m IS NOT NULL AND l.nearest_stop_m <= 400');
  if (p.ownerRole) { parts.push('(SELECT role FROM users u WHERE u.id = l.owner_id) = ?'); params.push(p.ownerRole); }
  if (p.amenities?.length) {
    const list = [...new Set(p.amenities)];
    parts.push(`(SELECT COUNT(*) FROM listing_amenities a WHERE a.listing_id = l.id AND a.amenity IN (${placeholders(list.length)})) = ?`);
    params.push(...list, list.length);
  }
  return { where: parts.join(' AND '), params, distanceSql: w.distanceSql, distanceParams: w.distanceParams, scope };
}

function orderBy(sort: string | undefined, q: string | undefined, b: Built): { sql: string; selectExtra: string; selectParams: (string | number)[] } {
  const distSel = b.distanceSql ? `, ${b.distanceSql} AS distance_m` : '';
  const distParams = b.distanceSql ? b.distanceParams : [];
  const s = sort ?? (q ? 'relevance' : 'recent');
  switch (s) {
    case 'price_asc': return { sql: 'l.price_cents ASC, l.published_at DESC', selectExtra: distSel, selectParams: distParams };
    case 'price_desc': return { sql: 'l.price_cents DESC, l.published_at DESC', selectExtra: distSel, selectParams: distParams };
    case 'date': return { sql: 'l.available_from ASC, l.published_at DESC', selectExtra: distSel, selectParams: distParams };
    case 'hot': return { sql: '(l.view_count + 5 * l.save_count + 10 * l.lead_count) DESC, l.published_at DESC', selectExtra: distSel, selectParams: distParams };
    case 'distance':
      if (b.distanceSql) return { sql: 'distance_m ASC, l.published_at DESC', selectExtra: distSel, selectParams: distParams };
      return { sql: 'l.distance_to_campus_m ASC, l.published_at DESC', selectExtra: '', selectParams: [] };
    case 'relevance':
      if (q) {
        const like = `%${q}%`;
        return {
          sql: 'relevance DESC, l.is_verified_listing DESC, l.published_at DESC',
          selectExtra: `${distSel}, ((CASE WHEN l.title LIKE ? THEN 3 ELSE 0 END) + (CASE WHEN l.description LIKE ? THEN 1 ELSE 0 END) + (CASE WHEN l.neighborhood LIKE ? OR l.city LIKE ? THEN 1 ELSE 0 END)) / (1.0 + (julianday('now') - julianday(COALESCE(l.published_at, l.created_at))) / 30.0) AS relevance`,
          selectParams: [...distParams, like, like, like, like],
        };
      }
      return { sql: 'l.published_at DESC', selectExtra: distSel, selectParams: distParams };
    default: return { sql: 'l.published_at DESC', selectExtra: distSel, selectParams: distParams };
  }
}

function loadCardRows(ids: string[]): ListingCardRow[] {
  if (!ids.length) return [];
  const rows = q.all<ListingCardRow>(`SELECT l.* FROM listings l WHERE l.id IN (${placeholders(ids.length)})`, ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is ListingCardRow => !!r);
}

// ------------------------------------------------------------------ GET /api/listings (list + pins)
router.get('/', (req, res) => {
  const p = parseQuery(req, ListingListQuery);
  if (p.view === 'pins') {
    const b = buildListWhere(req, p, { requireCampus: false });
    const rows = q.all<ListingCardRow>(`SELECT l.* FROM listings l WHERE ${b.where} ORDER BY l.published_at DESC LIMIT ?`, [...b.params, 500]);
    const cards = listingCards(rows, { viewerId: req.user?.id ?? null, isAdmin: isAdmin(req) });
    const boosted = new Map(
      q.all<{ entity_id: string; tier: ListingPin['boostTier'] }>("SELECT entity_id, tier FROM v_active_boosts WHERE entity_type = 'listing'").map((b) => [b.entity_id, b.tier]),
    );
    const pins: (ListingPin & { saved?: boolean })[] = cards.map((c) => {
      const pin: ListingPin & { saved?: boolean } = { id: c.id, lat: c.lat, lng: c.lng, priceCents: c.priceCents, isVerifiedListing: c.isVerifiedListing };
      const tier = boosted.get(c.id);
      if (tier) pin.boostTier = tier;
      if (c.saved) pin.saved = true;
      return pin;
    });
    return ok(res, { pins, total: q.count(`SELECT COUNT(*) FROM listings l WHERE ${b.where}`, b.params), scope: scopeInfo(b.scope) });
  }
  const b = buildListWhere(req, p);
  const { limit, offset } = pageWindow(p);
  const total = Math.min(q.count(`SELECT COUNT(*) FROM listings l WHERE ${b.where}`, b.params), b.scope.scope === 'nationwide' ? 1000 : 100_000);
  const o = orderBy(p.sort, p.q, b);
  const rows = q.all<ListingCardRow>(`SELECT l.*${o.selectExtra} FROM listings l WHERE ${b.where} ORDER BY ${o.sql} LIMIT ? OFFSET ?`, [...o.selectParams, ...b.params, limit, offset]);
  let items = listingCards(rows, { viewerId: req.user?.id ?? null, isAdmin: isAdmin(req) });

  // sponsored slots (DATA_MODEL §8) — only for browse-style lists (no text query / owner filter); never bypass filters
  if (!p.ownerId && !p.q && p.page === 1) {
    const slots = sponsoredSlotCount(p.pageSize);
    const picks = pickSponsored({
      entityType: 'listing',
      campusId: b.scope.scope === 'campus' ? b.scope.campusId : null,
      city: b.scope.city ?? null,
      state: b.scope.state ?? null,
      nationwide: b.scope.scope === 'nationwide',
      slots,
      tier: p.pageSize <= 8 ? 'max' : undefined,
    });
    if (picks.length) {
      // the boosted listing must still satisfy the current filters
      const eligible = q.all<{ id: string }>(`SELECT l.id FROM listings l WHERE ${b.where} AND l.id IN (${placeholders(picks.length)})`, [...b.params, ...picks.map((x) => x.id)]).map((r) => r.id);
      const chosen = picks.filter((x) => eligible.includes(x.id));
      if (chosen.length) {
        const sponsoredCards = listingCards(loadCardRows(chosen.map((x) => x.id)), { viewerId: req.user?.id ?? null }).map((c) => ({ ...c, sponsored: true, boostTier: chosen.find((x) => x.id === c.id)!.tier, boostId: chosen.find((x) => x.id === c.id)!.boostId }));
        items = mergeSponsored(items, sponsoredCards, p.pageSize);
        recordImpressions(chosen.map((x) => x.boostId), req);
      }
    }
  }
  if (p.q) logEvent(req, 'search', { props: { module: 'listings', q: p.q, total } });
  paginated(res, { items, total, page: p.page, pageSize: p.pageSize }, { scope: scopeInfo(b.scope) });
});

// ------------------------------------------------------------------ GET /api/listings/stats (price histogram for the FilterBar)
router.get('/stats', (req, res) => {
  const p = parseQuery(req, ListingListQuery);
  const b = buildListWhere(req, { ...p, priceMin: undefined, priceMax: undefined }, { requireCampus: false });
  const prices = q.all<{ price_cents: number }>(`SELECT l.price_cents FROM listings l WHERE ${b.where} ORDER BY l.price_cents`, b.params).map((r) => r.price_cents);
  const buckets = 24;
  const min = 0;
  const max = Math.max(350_000, prices.length ? Math.ceil(prices[Math.floor(prices.length * 0.98)]! / 25_000) * 25_000 : 350_000);
  const width = (max - min) / buckets;
  const histogram = Array.from({ length: buckets }, () => 0);
  for (const c of prices) histogram[Math.min(buckets - 1, Math.floor((c - min) / width))]!++;
  const median = prices.length ? prices[Math.floor(prices.length / 2)]! : 0;
  ok(res, { histogram, bounds: [min, max], step: 5000, count: prices.length, medianPriceCents: median, scope: scopeInfo(b.scope) });
});

// ------------------------------------------------------------------ GET /api/listings/stats/campus
router.get('/stats/campus', (req, res) => {
  const p = parseQuery(req, CampusStatsQuery);
  const scope = scopeFromQuery(req, p, { requireCampus: false });
  const w = whereScope(scope, { alias: 'l', fuzz: 'listing' });
  const where = `${PUBLIC_WHERE}${w.sql}`;
  const prices = q.all<{ price_cents: number; bedrooms: number }>(`SELECT l.price_cents, l.bedrooms FROM listings l WHERE ${where} ORDER BY l.price_cents`, w.params);
  const pct = (arr: number[], f: number) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * f))]! : 0);
  const all = prices.map((r) => r.price_cents);
  const byBed = new Map<number, number[]>();
  for (const r of prices) {
    const k = Math.min(4, Math.floor(r.bedrooms));
    if (!byBed.has(k)) byBed.set(k, []);
    byBed.get(k)!.push(r.price_cents);
  }
  ok(res, {
    activeCount: all.length,
    medianPriceCents: pct(all, 0.5),
    p25: pct(all, 0.25),
    p75: pct(all, 0.75),
    byBedrooms: [...byBed.entries()].sort((a, b) => a[0] - b[0]).map(([bedrooms, arr]) => ({ bedrooms, median: pct(arr.sort((x, y) => x - y), 0.5), count: arr.length })),
    scope: scopeInfo(scope),
  });
});

// ------------------------------------------------------------------ helpers for the post wizard
router.get('/geocode', rateLimit({ name: 'listings-geocode', limit: 30, windowMs: 60_000 }), async (req, res) => {
  const p = parseQuery(req, GeocodeQuery);
  const near = p.lat !== undefined && p.lng !== undefined ? { lat: p.lat, lng: p.lng } : undefined;
  const g = await geocode(p.q, { campusId: p.campusId ?? req.user?.campus_id ?? null, near });
  ok(res, { ...g, campusSuggestion: suggestCampus(g.lat, g.lng) });
});
router.get('/campuses/suggest', (req, res) => {
  const p = parseQuery(req, SuggestCampusQuery);
  ok(res, suggestCampus(p.lat, p.lng));
});

// ------------------------------------------------------------------ mine / saved (static before /:id)
router.get('/mine', requireAuth, (req, res) => {
  const p = parseQuery(req, MineQuery);
  const statuses = p.status?.length ? p.status : ['draft', 'active', 'paused', 'rented', 'expired'];
  const { limit, offset } = pageWindow(p);
  const where = `l.owner_id = ? AND l.status IN (${placeholders(statuses.length)})`;
  const params = [req.user!.id, ...statuses];
  const total = q.count(`SELECT COUNT(*) FROM listings l WHERE ${where}`, params);
  const rows = q.all<ListingRow>(`SELECT l.* FROM listings l WHERE ${where} ORDER BY CASE l.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'paused' THEN 2 WHEN 'expired' THEN 3 ELSE 4 END, l.updated_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const owner = loadUsersPublic([req.user!.id]).get(req.user!.id) ?? null;
  const items: Listing[] = rows.map((r) => toListingDto(r, { viewer: req.user, exact: true, ownerView: true, owner }));
  const counts = Object.fromEntries(q.all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM listings WHERE owner_id = ? AND status != 'removed' GROUP BY status", [req.user!.id]).map((r) => [r.status, r.n]));
  const summary = q.get<{ views: number; saves: number; leads: number }>("SELECT COALESCE(SUM(view_count),0) AS views, COALESCE(SUM(save_count),0) AS saves, COALESCE(SUM(lead_count),0) AS leads FROM listings WHERE owner_id = ? AND status != 'removed'", [req.user!.id]);
  paginated(res, { items, total, page: p.page, pageSize: p.pageSize }, { counts, summary, quota: { limit: isPro(req.user!) ? null : (req.user!.role === 'landlord' ? Math.max(req.user!.listing_quota, 3) : req.user!.listing_quota), active: counts.active ?? 0 } });
});

router.get('/saved', requireAuth, (req, res) => {
  const p = parseQuery(req, z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) }));
  const { limit, offset } = pageWindow(p);
  const total = q.count("SELECT COUNT(*) FROM listing_saves s JOIN listings l ON l.id = s.listing_id WHERE s.user_id = ? AND l.status != 'removed' AND l.moderation_status != 'hidden'", [req.user!.id]);
  const rows = q.all<ListingCardRow>("SELECT l.* FROM listing_saves s JOIN listings l ON l.id = s.listing_id WHERE s.user_id = ? AND l.status != 'removed' AND l.moderation_status != 'hidden' ORDER BY s.created_at DESC LIMIT ? OFFSET ?", [req.user!.id, limit, offset]);
  paginated(res, { items: listingCards(rows, { viewerId: req.user!.id }), total, page: p.page, pageSize: p.pageSize });
});

// ------------------------------------------------------------------ create
router.post('/', requireAuth, writes, async (req, res) => {
  const input = parseBody(req, ListingInput);
  const row = await createListing(req.user!, input);
  const dto = toListingDto(row, { viewer: req.user, exact: true, ownerView: true });
  logEvent(req, 'listing.create', { entityType: 'listing', entityId: row.id, campusId: row.campus_id });
  ok(res, { ...dto, placement: { farFromCampus: haversineM({ lat: row.lat, lng: row.lng }, { lat: getCampus(row.campus_id)!.lat, lng: getCampus(row.campus_id)!.lng }) > 40_000, approx: row.geocode_precision === 'city' } }, 201);
});

// ------------------------------------------------------------------ detail
router.get('/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const row = loadListingRow(id);
  if (!row) throw new ApiError('NOT_FOUND', 'Listing not found');
  const owner = req.user?.id === row.owner_id || isAdmin(req);
  const visible = row.status === 'active' || row.status === 'paused' || row.status === 'rented' || row.status === 'expired';
  if (!owner && (!visible || row.moderation_status === 'hidden')) throw new ApiError('NOT_FOUND', 'Listing not found');
  const exact = owner || canSeeExact(req.user, row);
  recordView(req, row);
  const fresh = loadListingRow(id)!;
  const dto = toListingDto(fresh, { viewer: req.user, exact, ownerView: owner });
  const boostId = typeof req.query.boost === 'string' ? req.query.boost : null;
  if (boostId && q.get('SELECT 1 FROM v_active_boosts WHERE id = ? AND entity_id = ?', [boostId, id])) recordClick(boostId, req);
  ok(res, dto);
});

function ownedRow(req: Parameters<typeof assertOwner>[0], id: string): ListingRow {
  const row = requireListingRow(id);
  assertOwner(req, row.owner_id);
  return row;
}

router.patch('/:id', requireAuth, writes, async (req, res) => {
  const { id } = parseParams(req, idParam);
  const row = ownedRow(req, id);
  if (row.status === 'removed') throw new ApiError('INVALID_STATE', 'Listing was removed', { data: { from: 'removed', to: 'edit' } });
  const input = parseBody(req, ListingUpdateInput);
  const updated = await updateListing(req.user!, row, input);
  ok(res, toListingDto(updated, { viewer: req.user, exact: true, ownerView: true }));
});

router.post('/:id/publish', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const row = ownedRow(req, id);
  const u = req.user!;
  if (u.role !== 'admin' && u.trust_level < 1) throw trustError(u, 1);
  const updated = publishListing(u, row);
  logEvent(req, 'listing.publish', { entityType: 'listing', entityId: id, campusId: updated.campus_id, props: { priceCents: updated.price_cents, bedrooms: updated.bedrooms } });
  hooks.emit('content.published', { userId: updated.owner_id, entityType: 'listing', entityId: id });
  ok(res, toListingDto(updated, { viewer: req.user, exact: true, ownerView: true }));
});
router.post('/:id/pause', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  ok(res, toListingDto(pauseListing(ownedRow(req, id)), { viewer: req.user, exact: true, ownerView: true }));
});
router.post('/:id/resume', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  ok(res, toListingDto(resumeListing(req.user!, ownedRow(req, id)), { viewer: req.user, exact: true, ownerView: true }));
});
router.post('/:id/rented', requireAuth, writes, async (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, RentedInput);
  const updated = markRented(ownedRow(req, id));
  let closedBundles = 0;
  if (body.closeBundle) {
    try {
      const m = await import('../market/service');
      closedBundles = m.closeBundlesForListing(id);
    } catch {
      closedBundles = q.run("UPDATE market_bundles SET status = 'closed', updated_at = ? WHERE listing_id = ? AND status = 'active'", [nowIso(), id]).changes;
    }
  }
  logEvent(req, 'listing.rented', { entityType: 'listing', entityId: id, props: { closedBundles } });
  ok(res, toListingDto(updated, { viewer: req.user, exact: true, ownerView: true }));
});
router.post('/:id/renew', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  ok(res, toListingDto(renewListing(req.user!, ownedRow(req, id)), { viewer: req.user, exact: true, ownerView: true }));
});
router.delete('/:id', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  removeListing(ownedRow(req, id));
  logEvent(req, 'listing.remove', { entityType: 'listing', entityId: id });
  ok(res, null);
});

// ------------------------------------------------------------------ photos / amenities / availability
router.put('/:id/photos', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  ownedRow(req, id);
  const body = parseBody(req, PhotosInput);
  ok(res, replacePhotos(id, req.user!, body.photos));
});
router.put('/:id/amenities', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  ownedRow(req, id);
  const body = parseBody(req, AmenitiesInput);
  ok(res, replaceAmenities(id, body.amenities));
});
router.get('/:id/availability', (req, res) => {
  const { id } = parseParams(req, idParam);
  const row = requireListingRow(id);
  if (row.status === 'removed' || row.moderation_status === 'hidden') throw new ApiError('NOT_FOUND', 'Listing not found');
  ok(res, { availableFrom: row.available_from, availableTo: row.available_to, ranges: listAvailability(id) });
});
router.put('/:id/availability', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  ownedRow(req, id);
  const body = parseBody(req, AvailabilityInput);
  ok(res, replaceAvailability(id, body.ranges));
});

// ------------------------------------------------------------------ save / unsave
router.post('/:id/save', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const row = requireListingRow(id);
  if (row.status === 'removed') throw new ApiError('NOT_FOUND', 'Listing not found');
  const r = q.run('INSERT OR IGNORE INTO listing_saves (user_id, listing_id, created_at) VALUES (?, ?, ?)', [req.user!.id, id, nowIso()]);
  if (r.changes) logEvent(req, 'listing.save', { entityType: 'listing', entityId: id, campusId: row.campus_id });
  ok(res, { saved: true, saveCount: q.scalar<number>('SELECT save_count FROM listings WHERE id = ?', [id]) ?? row.save_count });
});
router.delete('/:id/save', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const row = requireListingRow(id);
  q.run('DELETE FROM listing_saves WHERE user_id = ? AND listing_id = ?', [req.user!.id, id]);
  ok(res, { saved: false, saveCount: q.scalar<number>('SELECT save_count FROM listings WHERE id = ?', [id]) ?? row.save_count });
});

// ------------------------------------------------------------------ report / share
router.post('/:id/report', requireAuth, writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const row = requireListingRow(id);
  const body = parseBody(req, ReportInput);
  ok(res, createReport(req, { entityType: 'listing', entityId: id, reason: body.reason, details: body.details, campusId: row.campus_id }));
});
router.get('/:id/share', (req, res) => {
  const { id } = parseParams(req, idParam);
  const row = requireListingRow(id);
  if (row.status === 'removed' || row.moderation_status === 'hidden') throw new ApiError('NOT_FOUND', 'Listing not found');
  const origin = (config.webOrigins[0] ?? '').trim() || `${req.protocol}://${req.get('host')}`;
  const url = `${origin}/listings/${id}`;
  const rooms = row.bedrooms === 0 ? 'Studio' : `${row.bedrooms}B${row.bathrooms}B`;
  const price = `$${Math.round(row.price_cents / 100).toLocaleString('en-US')}/mo`;
  const text = `${row.title} · ${rooms} · ${price} · ${row.neighborhood ? row.neighborhood + ', ' : ''}${row.city}, ${row.state} · ${row.available_from}${row.available_to ? ' – ' + row.available_to : ''}`;
  logEvent(req, 'listing.share', { entityType: 'listing', entityId: id, campusId: row.campus_id });
  ok(res, { url, title: row.title, text, qrSvg: shareQrSvg(url) });
});

// ------------------------------------------------------------------ contact (message host) → lead
router.post('/:id/contact', requireAuth, writes, async (req, res) => {
  const { id } = parseParams(req, idParam);
  const row = requireListingRow(id);
  const me = req.user!;
  if (me.role !== 'admin' && me.trust_level < 1) throw trustError(me, 1);
  if (row.status === 'removed' || row.moderation_status === 'hidden') throw new ApiError('NOT_FOUND', 'Listing not found');
  if (row.owner_id === me.id) throw new ApiError('BAD_REQUEST', 'You cannot message yourself');
  const body = parseBody(req, ContactInput);
  if (isBlockedEither(me.id, row.owner_id)) throw new ApiError('BLOCKED', 'Blocked');
  const host = q.get<{ verified_only_messaging: number; banned: number }>('SELECT verified_only_messaging, banned FROM users WHERE id = ?', [row.owner_id]);
  if (!host || host.banned === 1) throw new ApiError('NOT_FOUND', 'Host unavailable');
  if (host.verified_only_messaging === 1 && me.trust_level < 1) throw new ApiError('VERIFIED_ONLY', 'Host accepts verified users only');
  const since = new Date(nowMs() - DAY).toISOString();
  const cap = me.trust_level >= 2 ? 50 : me.trust_level >= 1 ? 20 : 5;
  const started = q.count('SELECT COUNT(*) FROM conversations WHERE created_by = ? AND created_at >= ?', [me.id, since]);
  const { conversation, created } = openConversation({ kind: 'direct', memberIds: [me.id, row.owner_id], campusId: row.campus_id, context: { type: 'listing', id }, createdBy: me.id });
  // contact goes through the chat service: admin locks, verified-only and the daily message cap apply here too
  if (conversation.is_locked === 1) throw new ApiError('FORBIDDEN', 'This conversation is locked');
  if (created && started >= cap) {
    q.run('DELETE FROM conversations WHERE id = ?', [conversation.id]);
    throw new ApiError('QUOTA_EXCEEDED', 'Daily new conversation cap reached', { data: { limit: cap, current: started } });
  }
  if (created) {
    const card = listingContextCard(id);
    if (card) postContextCard(conversation.id, me.id, card);
  }
  if (body.message) sendChatMessage({ conversationId: conversation.id, senderId: me.id, kind: 'text', body: body.message });
  const lead = recordLead({ listingId: id, userId: me.id, conversationId: conversation.id, source: 'message' });
  logEvent(req, 'listing.contact_click', { entityType: 'listing', entityId: id, campusId: row.campus_id, props: { created, leadCreated: lead.created } });
  if (created) logEvent(req, 'chat.start', { entityType: 'conversation', entityId: conversation.id, props: { context: 'listing', listingId: id } });
  if (lead.created) {
    notify(row.owner_id, 'chat.message', {
      title: { zh: `${me.name} 对「${row.title}」感兴趣`, en: `${me.name} is interested in "${row.title}"` },
      body: body.message ?? null,
      link: `/chat/${conversation.id}`, entityType: 'listing', entityId: id, data: { leadId: lead.id, conversationId: conversation.id },
    });
  }
  ok(res, { conversationId: conversation.id, created, leadId: lead.id || null });
});

// ------------------------------------------------------------------ leads (owner; Pro unlocks the full inbox)
function leadDtos(rows: LeadRow[]): Lead[] {
  const users = loadUsersPublic(rows.map((r) => r.user_id));
  return rows.map((r) => ({ id: r.id, listingId: r.listing_id, userId: r.user_id, user: users.get(r.user_id), conversationId: r.conversation_id, source: r.source as Lead['source'], status: r.status as Lead['status'], createdAt: r.created_at }));
}
router.get('/:id/leads', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  ownedRow(req, id);
  const p = parseQuery(req, LeadsQuery);
  const locked = !(isPro(req.user!) || isAdmin(req));
  const { limit, offset } = pageWindow(p);
  const where = `listing_id = ?${p.status ? ' AND status = ?' : ''}`;
  const params = p.status ? [id, p.status] : [id];
  const total = q.count(`SELECT COUNT(*) FROM listing_leads WHERE ${where}`, params);
  const rows = q.all<LeadRow>(`SELECT * FROM listing_leads WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, locked ? Math.min(limit, 3) : limit, locked ? 0 : offset]);
  paginated(res, { items: leadDtos(rows), total, page: p.page, pageSize: p.pageSize }, { locked });
});
router.patch('/:id/leads/:leadId', requireAuth, writes, (req, res) => {
  const { id, leadId } = parseParams(req, z.object({ id: z.string(), leadId: z.string() }));
  ownedRow(req, id);
  const body = parseBody(req, LeadStatusInput);
  const lead = q.get<LeadRow>('SELECT * FROM listing_leads WHERE id = ? AND listing_id = ?', [leadId, id]);
  if (!lead) throw new ApiError('NOT_FOUND', 'Lead not found');
  q.run('UPDATE listing_leads SET status = ? WHERE id = ?', [body.status, leadId]);
  ok(res, leadDtos([{ ...lead, status: body.status }])[0]);
});

// ------------------------------------------------------------------ owner stats
router.get('/:id/stats', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const row = ownedRow(req, id);
  const p = parseQuery(req, StatsQuery);
  const locked = !(isPro(req.user!) || isAdmin(req));
  const since = new Date(nowMs() - p.days * DAY).toISOString();
  const series = q.all<{ date: string; count: number }>("SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count FROM events WHERE type = 'listing.view' AND entity_type = 'listing' AND entity_id = ? AND created_at >= ? GROUP BY date ORDER BY date", [id, since]);
  const byDate = new Map(series.map((s) => [s.date, s.count]));
  const views: { date: string; count: number }[] = [];
  for (let i = p.days - 1; i >= 0; i--) {
    const d = new Date(nowMs() - i * DAY).toISOString().slice(0, 10);
    views.push({ date: d, count: byDate.get(d) ?? 0 });
  }
  const boost = q.get<{ impressions: number; clicks: number }>("SELECT COALESCE(SUM(impressions),0) AS impressions, COALESCE(SUM(clicks),0) AS clicks FROM boosts WHERE entity_type = 'listing' AND entity_id = ?", [id]);
  const rank = q.count(`SELECT COUNT(*) FROM listings l WHERE ${PUBLIC_WHERE} AND l.campus_id = ? AND (l.view_count + 5 * l.save_count + 10 * l.lead_count) > ?`, [row.campus_id, row.view_count + 5 * row.save_count + 10 * row.lead_count]);
  ok(res, {
    views: locked ? [] : views,
    viewsTotal: row.view_count,
    viewsInPeriod: series.reduce((a, s) => a + s.count, 0),
    saves: row.save_count,
    leads: row.lead_count,
    contactRate: row.view_count ? Math.round((row.lead_count / row.view_count) * 1000) / 1000 : 0,
    boostImpressions: boost?.impressions ?? 0,
    boostClicks: boost?.clicks ?? 0,
    rankHint: rank < 10 ? 'top10' : rank < 50 ? 'top50' : 'other',
    locked,
    days: p.days,
  });
});

// ------------------------------------------------------------------ similar
router.get('/:id/similar', (req, res) => {
  const { id } = parseParams(req, idParam);
  const row = requireListingRow(id);
  const p = parseQuery(req, SimilarQuery);
  const rows = q.all<ListingCardRow>(
    `SELECT l.* FROM listings l WHERE ${PUBLIC_WHERE} AND l.id != ? AND l.campus_id = ? AND l.price_cents BETWEEN ? AND ? AND l.bedrooms BETWEEN ? AND ?
       ORDER BY abs(l.price_cents - ?) ASC, l.is_verified_listing DESC, l.published_at DESC LIMIT ?`,
    [id, row.campus_id, Math.floor(row.price_cents * 0.75), Math.ceil(row.price_cents * 1.25), row.bedrooms - 1, row.bedrooms + 1, row.price_cents, p.limit],
  );
  const cards: ListingCard[] = listingCards(rows, { viewerId: req.user?.id ?? null });
  ok(res, cards);
});

export default router;
