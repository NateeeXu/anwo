// server/src/modules/market/service.ts — OWNED BY THE `market` MODULE AGENT.
// Stable cross-module export: closeBundlesForListing(listingId) (listings calls it on POST /:id/rented { closeBundle }).
// Everything else here is the market domain logic used by routes.ts (row types, DTO mappers, price suggestion, bundles).
import type { Request } from 'express';
import type { Bundle, Item, ItemCard, Photo, PriceSuggestion, UserPublic } from '@shared/types';
import { ItemCondition } from '@shared/enums';
import { q, uid, placeholders } from '../../db';
import { itemCards, listingCards, type ItemCardRow, type ListingCardRow } from '../../lib/cards';
import { getCampus } from '../../lib/campuses';
import { ApiError } from '../../lib/errors';
import { loadUserPublic, loadUsersPublic } from '../../lib/users';
import { nowIso } from '../../lib/time';
import { activeBoostFor } from '../../lib/sponsored';
import { isAdmin } from '../../lib/auth';

// ------------------------------------------------------------------ row types
export type MarketItemRow = ItemCardRow & {
  description: string;
  original_price_cents: number | null;
  brand: string | null;
  delivery_option: 'pickup' | 'delivery' | 'both';
  moderation_status: 'ok' | 'flagged' | 'hidden';
  buyer_id: string | null;
  sold_at: string | null;
  sold_price_cents: number | null;
  view_count: number;
  chat_count: number;
  expires_at: string | null;
  updated_at: string;
};
export type BundleRow = {
  id: string;
  seller_id: string;
  campus_id: string;
  listing_id: string | null;
  title: string;
  description: string | null;
  discount_pct: number;
  move_out_date: string | null;
  status: 'active' | 'closed' | 'removed';
  item_count: number;
  created_at: string;
  updated_at: string;
};
type PhotoRow = { id: string; item_id: string; upload_id: string; sort_order: number; url: string };

export const ITEM_FROM = 'FROM market_items m LEFT JOIN uploads cu ON cu.id = m.cover_upload_id';
export const ITEM_SELECT = `SELECT m.*, cu.url AS cover_url ${ITEM_FROM}`;
/** ITEM_SELECT with extra computed columns (e.g. a haversine distance) placed before FROM. */
export function itemSelect(extraCols = ''): string {
  return `SELECT m.*, cu.url AS cover_url${extraCols} ${ITEM_FROM}`;
}

export function loadItem(id: string): MarketItemRow | undefined {
  return q.get<MarketItemRow>(`${ITEM_SELECT} WHERE m.id = ?`, [id]);
}
export function requireItem(id: string): MarketItemRow {
  const r = loadItem(id);
  if (!r) throw new ApiError('NOT_FOUND', 'Item not found');
  return r;
}
export function loadBundle(id: string): BundleRow | undefined {
  return q.get<BundleRow>('SELECT * FROM market_bundles WHERE id = ?', [id]);
}
export function requireBundle(id: string): BundleRow {
  const r = loadBundle(id);
  if (!r || r.status === 'removed') throw new ApiError('NOT_FOUND', 'Bundle not found');
  return r;
}

/** Can this viewer see the item at all (drafts/removed/hidden are owner+admin only)? */
export function canView(req: Request, r: MarketItemRow): boolean {
  const viewer = req.user?.id;
  if (isAdmin(req) || (viewer && viewer === r.seller_id)) return true;
  if (r.moderation_status === 'hidden') return false;
  return r.status !== 'draft' && r.status !== 'removed';
}

// ------------------------------------------------------------------ photos
export function itemPhotos(itemId: string): Photo[] {
  return q
    .all<PhotoRow>('SELECT p.id, p.item_id, p.upload_id, p.sort_order, u.url FROM market_item_photos p JOIN uploads u ON u.id = p.upload_id WHERE p.item_id = ? ORDER BY p.sort_order, p.created_at', [itemId])
    .map((p) => ({ id: p.id, uploadId: p.upload_id, url: p.url, sortOrder: p.sort_order, caption: null }));
}
function photosFor(itemIds: string[]): Map<string, Photo[]> {
  const out = new Map<string, Photo[]>();
  if (!itemIds.length) return out;
  for (const p of q.all<PhotoRow>(`SELECT p.id, p.item_id, p.upload_id, p.sort_order, u.url FROM market_item_photos p JOIN uploads u ON u.id = p.upload_id WHERE p.item_id IN (${placeholders(itemIds.length)}) ORDER BY p.sort_order, p.created_at`, itemIds)) {
    if (!out.has(p.item_id)) out.set(p.item_id, []);
    out.get(p.item_id)!.push({ id: p.id, uploadId: p.upload_id, url: p.url, sortOrder: p.sort_order, caption: null });
  }
  return out;
}

/** Replaces the item's photos (≤ 10) and refreshes the cover. Upload ids must exist. */
export function setItemPhotos(item: MarketItemRow, uploadIds: string[]): Photo[] {
  const ids = [...new Set(uploadIds)].slice(0, 10);
  if (ids.length) {
    // only the seller's own uploads (or photos already on this item / seed art) — never someone else's chat image
    const found = new Set(q.all<{ id: string }>(`SELECT id FROM uploads WHERE id IN (${placeholders(ids.length)}) AND kind = 'image' AND is_private = 0 AND (owner_id = ? OR purpose = 'seed' OR id IN (SELECT upload_id FROM market_item_photos WHERE item_id = ?))`, [...ids, item.seller_id, item.id]).map((u) => u.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length) throw new ApiError('VALIDATION', 'Unknown upload', { fields: { photos: `unknown upload ${missing[0]}` } });
  }
  const t = nowIso();
  q.tx(() => {
    q.run('DELETE FROM market_item_photos WHERE item_id = ?', [item.id]);
    ids.forEach((uploadId, i) => q.run('INSERT INTO market_item_photos (id, item_id, upload_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?)', [uid(), item.id, uploadId, i, t]));
    q.run('UPDATE market_items SET cover_upload_id = ?, updated_at = ? WHERE id = ?', [ids[0] ?? null, t, item.id]);
  });
  return itemPhotos(item.id);
}

// ------------------------------------------------------------------ DTOs
export function cardsOf(rows: MarketItemRow[], req: Request | null): ItemCard[] {
  return itemCards(rows, { viewerId: req?.user?.id ?? null, isAdmin: req ? isAdmin(req) : false });
}

export type ItemDtoOptions = { withSimilar?: boolean; withSuggestion?: boolean; withBundle?: boolean };
/** Full Item DTO (API.md §1.6). Owner/admin get exact pickup coordinates through itemCards' ctx. */
export function itemDto(r: MarketItemRow, req: Request | null, opts: ItemDtoOptions = {}): Item {
  const card = cardsOf([r], req)[0]!;
  const item: Item = {
    ...card,
    description: r.description,
    originalPriceCents: r.original_price_cents,
    brand: r.brand,
    deliveryOption: r.delivery_option,
    photos: itemPhotos(r.id),
    viewCount: r.view_count,
    chatCount: r.chat_count,
    soldAt: r.sold_at,
    soldPriceCents: r.sold_price_cents,
    buyerId: r.buyer_id,
    expiresAt: r.expires_at,
  };
  const boost = activeBoostFor('market_item', r.id);
  if (boost) item.boostTier = boost.tier;
  if (opts.withBundle !== false && r.bundle_id) {
    const b = loadBundle(r.bundle_id);
    if (b && b.status !== 'removed') item.bundle = bundleDto(b, { withListing: true });
  }
  if (opts.withSuggestion && r.status !== 'sold') {
    const s = priceSuggestion({ category: r.category, condition: r.condition, campusId: r.campus_id, excludeId: r.id, title: r.title });
    if (s) item.suggestedPrice = s;
  }
  if (opts.withSimilar) item.similar = similarItems(r, req);
  return item;
}

export function itemDtos(rows: MarketItemRow[], req: Request | null): Item[] {
  if (!rows.length) return [];
  const cards = cardsOf(rows, req);
  const photos = photosFor(rows.map((r) => r.id));
  const bundleIds = [...new Set(rows.map((r) => r.bundle_id).filter((x): x is string => !!x))];
  const bundles = new Map<string, BundleRow>();
  if (bundleIds.length) for (const b of q.all<BundleRow>(`SELECT * FROM market_bundles WHERE id IN (${placeholders(bundleIds.length)}) AND status <> 'removed'`, bundleIds)) bundles.set(b.id, b);
  return rows.map((r, i) => {
    const item: Item = {
      ...cards[i]!,
      description: r.description, originalPriceCents: r.original_price_cents, brand: r.brand, deliveryOption: r.delivery_option,
      photos: photos.get(r.id) ?? [], viewCount: r.view_count, chatCount: r.chat_count, soldAt: r.sold_at, soldPriceCents: r.sold_price_cents,
      buyerId: r.buyer_id, expiresAt: r.expires_at,
    };
    const b = r.bundle_id ? bundles.get(r.bundle_id) : undefined;
    if (b) item.bundle = bundleDto(b, {});
    return item;
  });
}

/** ≤ 6 active items of the same category on the same campus (then nationwide same category), excluding the item. */
export function similarItems(r: MarketItemRow, req: Request | null, limit = 6): ItemCard[] {
  const base = `${ITEM_SELECT} WHERE m.id <> ? AND m.status IN ('active','reserved') AND m.moderation_status = 'ok' AND m.category = ?`;
  let rows = q.all<MarketItemRow>(`${base} AND m.campus_id = ? ORDER BY ABS(m.price_cents - ?) ASC, m.created_at DESC LIMIT ?`, [r.id, r.category, r.campus_id, r.price_cents, limit]);
  if (rows.length < limit) {
    const have = new Set(rows.map((x) => x.id));
    const more = q.all<MarketItemRow>(`${base} AND m.campus_id <> ? AND m.delivery_option IN ('delivery','both') ORDER BY m.created_at DESC LIMIT ?`, [r.id, r.category, r.campus_id, limit]);
    for (const m of more) if (!have.has(m.id) && rows.length < limit) rows.push(m);
  }
  rows = rows.slice(0, limit);
  return cardsOf(rows, req);
}

// ------------------------------------------------------------------ price suggestion (DATA_MODEL §3.7)
function conditionNeighbours(condition: string): string[] {
  const i = (ItemCondition as readonly string[]).indexOf(condition);
  if (i < 0) return [...ItemCondition];
  return ItemCondition.filter((_, j) => Math.abs(j - i) <= 1);
}
function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return Math.round(sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo));
}
function roundPrice(cents: number): number {
  if (cents >= 10_000) return Math.round(cents / 500) * 500; // ≥ $100 → nearest $5
  if (cents >= 2_000) return Math.round(cents / 100) * 100; // ≥ $20 → whole dollars
  return Math.round(cents / 50) * 50; // nearest 50¢
}
/**
 * Median + IQR of sold (last 180 d, sold price, fallback list price) and active items of the same category and condition ± 1 step.
 * Campus first when it has ≥ 5 samples, otherwise nationwide. Free items are excluded. Returns null when fewer than 3 samples exist.
 */
const TITLE_STOP = new Set(['the', 'and', 'for', 'with', 'size', 'new', 'like', 'good', 'used', 'set', 'free', 'obo', 'black', 'white', 'grey', 'gray', 'blue', 'red', 'inch', 'edition', 'men', 'women', 'mens', 'womens']);
/** Significant latin tokens (≥ 3 chars, not stop words) of a title, for "similar item" matching. */
export function titleTokens(title: string | null | undefined): string[] {
  if (!title) return [];
  return [...new Set(title.toLowerCase().match(/[a-z0-9][a-z0-9+\-]{2,}/g) ?? [])].filter((w) => !TITLE_STOP.has(w) && !/^\d+(e|gb|tb|qt|lb|lbs|cm|mm|ft)?$/.test(w));
}

export function priceSuggestion(input: { category: string; condition: string; campusId?: string | null; excludeId?: string | null; title?: string | null }): PriceSuggestion | null {
  const conds = conditionNeighbours(input.condition);
  const since = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString();
  const sql = (campusFilter: boolean) =>
    `SELECT CASE WHEN m.status = 'sold' AND m.sold_price_cents IS NOT NULL AND m.sold_price_cents > 0 THEN m.sold_price_cents ELSE m.price_cents END AS cents, m.title
       FROM market_items m
      WHERE m.category = ? AND m.condition IN (${placeholders(conds.length)}) AND m.is_free = 0 AND m.price_cents > 0 AND m.moderation_status = 'ok'
        AND ((m.status = 'sold' AND m.sold_at >= ?) OR m.status IN ('active','reserved'))
        ${input.excludeId ? 'AND m.id <> ?' : ''} ${campusFilter ? 'AND m.campus_id = ?' : ''}
      ORDER BY cents`;
  const baseParams: (string | number)[] = [input.category, ...conds, since];
  if (input.excludeId) baseParams.push(input.excludeId);
  type R = { cents: number; title: string };
  // when a title is known, prefer items that share a significant word with it (e.g. "ipad", "trek", "calculus")
  const tokens = titleTokens(input.title);
  const narrow = (rows: R[]): R[] => {
    if (!tokens.length) return rows;
    const hit = rows.filter((r) => { const tt = titleTokens(r.title); return tokens.some((w) => tt.includes(w)); });
    return hit.length >= 3 ? hit : rows;
  };
  let basis: PriceSuggestion['basis'] = 'campus';
  let rows: R[] = [];
  if (input.campusId) rows = narrow(q.all<R>(sql(true), [...baseParams, input.campusId]));
  if (rows.length < 5) {
    basis = 'nationwide';
    const nat = narrow(q.all<R>(sql(false), baseParams));
    if (nat.length > rows.length) rows = nat; else basis = 'campus';
  }
  if (rows.length < 3) return null;
  const sorted = rows.map((r) => r.cents).sort((a, b) => a - b);
  return {
    suggestedCents: roundPrice(quantile(sorted, 0.5)),
    lowCents: roundPrice(quantile(sorted, 0.25)),
    highCents: roundPrice(quantile(sorted, 0.75)),
    sampleSize: sorted.length,
    basis,
  };
}

// ------------------------------------------------------------------ bundles
export type BundleDtoOptions = { withItems?: boolean; withListing?: boolean; withSeller?: boolean; req?: Request | null };
export function bundleDto(b: BundleRow, opts: BundleDtoOptions = {}): Bundle {
  const rows = q.all<MarketItemRow>(`${ITEM_SELECT} WHERE m.bundle_id = ? AND m.status NOT IN ('removed') ORDER BY m.created_at`, [b.id]);
  const totalCents = rows.filter((r) => r.status !== 'sold').reduce((s, r) => s + (r.is_free ? 0 : r.price_cents), 0);
  const dto: Bundle = {
    id: b.id, sellerId: b.seller_id, campusId: b.campus_id, listingId: b.listing_id, title: b.title, description: b.description,
    discountPct: b.discount_pct, moveOutDate: b.move_out_date, status: b.status, itemCount: rows.filter((r) => r.status !== 'sold').length,
    totalCents, bundleCents: Math.round((totalCents * (100 - b.discount_pct)) / 100),
  };
  if (opts.withItems) dto.items = cardsOf(rows, opts.req ?? null);
  if (opts.withListing && b.listing_id) {
    const l = q.get<ListingCardRow>("SELECT l.*, u.url AS cover_url FROM listings l LEFT JOIN uploads u ON u.id = l.cover_upload_id WHERE l.id = ? AND l.status <> 'removed'", [b.listing_id]);
    if (l) dto.listing = listingCards([l], { viewerId: opts.req?.user?.id ?? null })[0];
  }
  if (opts.withSeller) dto.seller = loadUserPublic(b.seller_id, { withStats: true }) ?? undefined;
  return dto;
}
export function bundleDtos(rows: BundleRow[], opts: BundleDtoOptions = {}): Bundle[] {
  const sellers = opts.withSeller ? loadUsersPublic(rows.map((r) => r.seller_id)) : null;
  return rows.map((b) => {
    const d = bundleDto(b, { ...opts, withSeller: false });
    if (sellers) d.seller = sellers.get(b.seller_id);
    return d;
  });
}

/** Replaces the item membership of a bundle; every id must be an active/reserved item of the seller. */
export function setBundleItems(b: BundleRow, itemIds: string[]): void {
  const ids = [...new Set(itemIds)];
  if (ids.length) {
    const owned = q.all<{ id: string }>(`SELECT id FROM market_items WHERE seller_id = ? AND status NOT IN ('removed') AND id IN (${placeholders(ids.length)})`, [b.seller_id, ...ids]).map((r) => r.id);
    if (owned.length !== ids.length) throw new ApiError('FORBIDDEN', 'Only your own items can be bundled');
  }
  const t = nowIso();
  q.tx(() => {
    q.run('UPDATE market_items SET bundle_id = NULL, updated_at = ? WHERE bundle_id = ?', [t, b.id]);
    if (ids.length) q.run(`UPDATE market_items SET bundle_id = ?, updated_at = ? WHERE id IN (${placeholders(ids.length)})`, [b.id, t, ...ids]);
    q.run('UPDATE market_bundles SET updated_at = ? WHERE id = ?', [t, b.id]);
  });
}

/** Stable export (DATA_MODEL §1): listings calls this when a sublet is marked rented with { closeBundle }. Returns the number of bundles closed. */
export function closeBundlesForListing(listingId: string): number {
  const t = nowIso();
  return q.run("UPDATE market_bundles SET status = 'closed', updated_at = ? WHERE listing_id = ? AND status = 'active'", [t, listingId]).changes;
}

/** Active bundle for a listing (shown on listing detail as 「搬家甩卖」). */
export function bundleForListing(listingId: string, req: Request | null): Bundle | null {
  const b = q.get<BundleRow>("SELECT * FROM market_bundles WHERE listing_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1", [listingId]);
  return b ? bundleDto(b, { withItems: true, withSeller: true, req }) : null;
}

// ------------------------------------------------------------------ buyers (mark-sold picker)
/** People the seller has talked to about this item (conversations with the item as context), then other recent chat partners. */
export function buyerCandidates(sellerId: string, itemId: string, limit = 12): (UserPublic & { conversationId: string; aboutThisItem: boolean })[] {
  const rows = q.all<{ user_id: string; conversation_id: string; context_id: string | null; last: string | null }>(
    `SELECT cm.user_id, c.id AS conversation_id, c.context_id, c.last_message_at AS last
       FROM conversations c
       JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = ? AND me.left_at IS NULL
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id <> ? AND cm.left_at IS NULL
      WHERE c.kind = 'direct'
      ORDER BY CASE WHEN c.context_type = 'market_item' AND c.context_id = ? THEN 0 ELSE 1 END, c.last_message_at DESC
      LIMIT ?`,
    [sellerId, sellerId, itemId, limit * 3],
  );
  const seen = new Set<string>();
  const picked: typeof rows = [];
  for (const r of rows) {
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    picked.push(r);
    if (picked.length >= limit) break;
  }
  const users = loadUsersPublic(picked.map((r) => r.user_id));
  return picked.flatMap((r) => {
    const u = users.get(r.user_id);
    return u ? [{ ...u, conversationId: r.conversation_id, aboutThisItem: r.context_id === itemId }] : [];
  });
}

/** Campus → city/state defaults for a new item. */
export function campusCityState(campusId: string): { city: string | null; state: string | null } {
  const c = getCampus(campusId);
  return { city: c?.city ?? null, state: c?.state ?? null };
}
