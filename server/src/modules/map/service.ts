// server/src/modules/map/service.ts — OWNED BY THE `map` MODULE AGENT.
// Stable cross-module exports (DATA_MODEL §1): geocode(q), commute(campusId, lat, lng), suggestCampus(lat, lng).
// The scaffold geocode()/commuteEstimate() stay the implementation; this file adds caching (commute_cache),
// the reverse lookup from local data, POI/layer queries and the nationwide campus stats used by the explore page.
import type { Campus, ListingCard, Poi, ShuttleStop } from '@shared/types';
import type { CampusStat, CommuteResponse, LayerCounts, LayersQuery, LayersResponse, MapLayer, MapPin, ReverseResponse, ShuttleRouteLite } from '@shared/schemas/map';
import { LAYER_CARD_CAP, LAYER_PIN_CAP, MAP_LAYERS, MAX_BBOX_DEG } from '@shared/schemas/map';
import { q, uid, parseJson, placeholders } from '../../db';
import { allCampuses, getCampus } from '../../lib/campuses';
import { listingCards, type ListingCardRow } from '../../lib/cards';
import { ApiError } from '../../lib/errors';
import { bboxAround, fuzz, geocode as geocodeRaw, haversineM, nearestCampuses, round3, suggestCampus, type GeocodeOptions } from '../../lib/geo';
import { logger } from '../../lib/logger';
import { commuteEstimate } from '../../lib/shuttle';
import { nowIso } from '../../lib/time';

export { geocodeRaw as geocode, suggestCampus };
export { commuteEstimate as commute };

export type GeocodeFn = typeof geocodeRaw;
export type { GeocodeOptions };

// ---------------------------------------------------------------- bbox
export type Bbox4 = [minLng: number, minLat: number, maxLng: number, maxLat: number];

/** Parses `minLng,minLat,maxLng,maxLat`; `BAD_REQUEST` when wider than 2° (API.md §7). */
export function parseLayerBbox(s: string): Bbox4 {
  const [minLng, minLat, maxLng, maxLat] = s.split(',').map(Number) as Bbox4;
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite) || minLat >= maxLat || minLng >= maxLng)
    throw new ApiError('VALIDATION', 'Invalid bbox', { fields: { bbox: 'minLng,minLat,maxLng,maxLat expected' } });
  if (maxLat - minLat > MAX_BBOX_DEG || maxLng - minLng > MAX_BBOX_DEG)
    throw new ApiError('BAD_REQUEST', `bbox too large (max ${MAX_BBOX_DEG}°×${MAX_BBOX_DEG}°) — zoom in`, { data: { maxDeg: MAX_BBOX_DEG } });
  return [minLng, minLat, maxLng, maxLat];
}

const inBbox = (alias: string, latCol = 'lat', lngCol = 'lng') => `${alias}.${latCol} BETWEEN ? AND ? AND ${alias}.${lngCol} BETWEEN ? AND ?`;
const bboxParams = (b: Bbox4) => [b[1], b[3], b[0], b[2]];
const bboxCenter = (b: Bbox4) => ({ lat: (b[1] + b[3]) / 2, lng: (b[0] + b[2]) / 2 });

// ---------------------------------------------------------------- commute (cached)
function commuteKey(campusId: string, lat: number, lng: number): string {
  return `${campusId}:${lat.toFixed(4)},${lng.toFixed(4)}`;
}
type CommuteRow = { campus_id: string; lat: number; lng: number; distance_m: number; walk_min: number; bike_min: number; shuttle_min: number | null; nearest_stop_id: string | null; nearest_stop_m: number | null };
type StopRow = { id: string; campus_id: string; name: string; name_zh: string | null; code: string | null; lat: number; lng: number; address: string | null };

function campusLite(c: Campus) {
  return { id: c.id, name: c.name, nameZh: c.nameZh, shortName: c.shortName, lat: c.lat, lng: c.lng };
}

/** Commute estimate to a campus with a `commute_cache` row keyed by the 4-decimal origin (≈ 11 m). */
export function commuteCached(campusId: string, lat: number, lng: number): CommuteResponse | null {
  const campus = getCampus(campusId);
  if (!campus) return null;
  const key = commuteKey(campus.id, lat, lng);
  const row = q.get<CommuteRow>('SELECT * FROM commute_cache WHERE cache_key = ?', [key]);
  if (row) {
    const stop = row.nearest_stop_id ? q.get<StopRow>('SELECT id, campus_id, name, name_zh, code, lat, lng, address FROM shuttle_stops WHERE id = ? AND is_active = 1', [row.nearest_stop_id]) : undefined;
    // a stop that was removed since → recompute
    if (!row.nearest_stop_id || stop) {
      return {
        distanceM: row.distance_m, walkMin: row.walk_min, bikeMin: row.bike_min, shuttleMin: row.shuttle_min,
        nearestStop: stop ? { id: stop.id, name: stop.name, nameZh: stop.name_zh, lat: stop.lat, lng: stop.lng, distanceM: row.nearest_stop_m ?? haversineM({ lat, lng }, stop) } : null,
        campus: campusLite(campus), cached: true,
      };
    }
  }
  const est = commuteEstimate(campus.id, lat, lng);
  if (!est) return null;
  try {
    q.run(
      `INSERT INTO commute_cache (cache_key, campus_id, lat, lng, distance_m, walk_min, bike_min, shuttle_min, nearest_stop_id, nearest_stop_m, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET distance_m = excluded.distance_m, walk_min = excluded.walk_min, bike_min = excluded.bike_min,
         shuttle_min = excluded.shuttle_min, nearest_stop_id = excluded.nearest_stop_id, nearest_stop_m = excluded.nearest_stop_m, created_at = excluded.created_at`,
      [key, campus.id, lat, lng, est.distanceM, est.walkMin, est.bikeMin, est.shuttleMin, est.nearestStop?.id ?? null, est.nearestStop?.distanceM ?? null, nowIso()],
    );
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'commute cache write failed');
  }
  return {
    distanceM: est.distanceM, walkMin: est.walkMin, bikeMin: est.bikeMin, shuttleMin: est.shuttleMin,
    nearestStop: est.nearestStop ? { id: est.nearestStop.id, name: est.nearestStop.name, nameZh: est.nearestStop.nameZh, lat: est.nearestStop.lat, lng: est.nearestStop.lng, distanceM: est.nearestStop.distanceM } : null,
    campus: campusLite(campus), cached: false,
  };
}

// ---------------------------------------------------------------- reverse (local data only, no network)
type GeoCacheRow = { lat: number; lng: number; display_name: string | null; address_line1: string | null; city: string | null; state: string | null; zip: string | null; precision: string | null };
type PoiRow = { id: string; campus_id: string; name: string; name_zh: string | null; category: string; lat: number; lng: number; address: string | null; url: string | null; icon: string | null; tags_json: string; is_active?: number; sort_order?: number };

export function toPoiDto(r: PoiRow): Poi {
  return { id: r.id, campusId: r.campus_id, name: r.name, nameZh: r.name_zh, category: r.category as Poi['category'], lat: r.lat, lng: r.lng, address: r.address, url: r.url, icon: r.icon, tags: parseJson<string[]>(r.tags_json, []) };
}

/**
 * Reverse lookup without Nominatim: nearest cached forward geocode (≤ 120 m) → POI (≤ 150 m) → shuttle stop (≤ 150 m)
 * → "near <campus>" label from the nearest campus. The answer is cached as `rev:<lat5>,<lng5>`.
 */
export function reverseLocal(lat: number, lng: number): ReverseResponse {
  const key = `rev:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const nearest = nearestCampuses(lat, lng, 1)[0] ?? null;
  const nearestCampus = nearest ? { id: nearest.id, shortName: nearest.shortName, name: nearest.name, nameZh: nearest.nameZh, distanceM: nearest.distanceM } : null;

  const hit = q.get<GeoCacheRow & { id: string }>('SELECT * FROM geocode_cache WHERE query_key = ?', [key]);
  if (hit && hit.display_name) {
    q.run('UPDATE geocode_cache SET hit_count = hit_count + 1 WHERE id = ?', [hit.id]);
    return { displayName: hit.display_name, addressLine1: hit.address_line1, city: hit.city, state: hit.state, zip: hit.zip, precision: (hit.precision as ReverseResponse['precision']) ?? 'street', source: 'cache', nearestCampus };
  }

  let out: ReverseResponse | null = null;
  const box = bboxAround(lat, lng, 150);
  const cached = q.all<GeoCacheRow>(
    `SELECT lat, lng, display_name, address_line1, city, state, zip, precision FROM geocode_cache
     WHERE kind = 'forward' AND precision IN ('rooftop','street') AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`,
    [box.minLat, box.maxLat, box.minLng, box.maxLng],
  );
  let best: { d: number; r: GeoCacheRow } | null = null;
  for (const r of cached) {
    const d = haversineM({ lat, lng }, r);
    if (d <= 120 && (!best || d < best.d)) best = { d, r };
  }
  if (best) {
    const r = best.r;
    out = { displayName: r.display_name ?? r.address_line1 ?? '', addressLine1: r.address_line1, city: r.city, state: r.state, zip: r.zip, precision: (r.precision as ReverseResponse['precision']) ?? 'street', source: 'cache', nearestCampus };
  }
  if (!out) {
    const pois = q.all<PoiRow>(`SELECT * FROM pois WHERE is_active = 1 AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`, [box.minLat, box.maxLat, box.minLng, box.maxLng]);
    let bp: { d: number; r: PoiRow } | null = null;
    for (const r of pois) {
      const d = haversineM({ lat, lng }, r);
      if (!bp || d < bp.d) bp = { d, r };
    }
    if (bp) {
      const campus = getCampus(bp.r.campus_id);
      const cs = cityStateFromLine(bp.r.address) ?? { city: campus?.city ?? null, state: campus?.state ?? null, zip: null };
      out = { displayName: bp.r.address ? `${bp.r.name} · ${bp.r.address}` : bp.r.name, addressLine1: bp.r.address?.split(',')[0] ?? bp.r.name, city: cs.city, state: cs.state, zip: cs.zip, precision: 'street', source: 'poi', nearestCampus };
    }
  }
  if (!out) {
    const stops = q.all<StopRow>(`SELECT id, campus_id, name, name_zh, code, lat, lng, address FROM shuttle_stops WHERE is_active = 1 AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`, [box.minLat, box.maxLat, box.minLng, box.maxLng]);
    let bs: { d: number; r: StopRow } | null = null;
    for (const r of stops) {
      const d = haversineM({ lat, lng }, r);
      if (!bs || d < bs.d) bs = { d, r };
    }
    if (bs) {
      const campus = getCampus(bs.r.campus_id);
      const cs = cityStateFromLine(bs.r.address) ?? { city: campus?.city ?? null, state: campus?.state ?? null, zip: null };
      out = { displayName: bs.r.address ?? bs.r.name, addressLine1: bs.r.address?.split(',')[0] ?? bs.r.name, city: cs.city, state: cs.state, zip: cs.zip, precision: 'street', source: 'stop', nearestCampus };
    }
  }
  if (!out) {
    if (nearest) {
      const km = nearest.distanceM / 1000;
      const label = km < 1 ? `${nearest.shortName} campus` : `${km.toFixed(km < 10 ? 1 : 0)} km from ${nearest.shortName} · ${nearest.city}, ${nearest.state}`;
      out = { displayName: label, addressLine1: null, city: nearest.distanceM <= 40_000 ? nearest.city : null, state: nearest.distanceM <= 40_000 ? nearest.state : null, zip: null, precision: 'city', source: 'campus', nearestCampus };
    } else {
      out = { displayName: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, addressLine1: null, city: null, state: null, zip: null, precision: 'none', source: 'campus', nearestCampus };
    }
  }
  try {
    q.run(
      `INSERT INTO geocode_cache (id, query_key, kind, provider, lat, lng, display_name, address_line1, city, state, zip, country, precision, raw_json, hit_count, created_at, expires_at)
       VALUES (?, ?, 'reverse', 'local', ?, ?, ?, ?, ?, ?, ?, 'US', ?, ?, 0, ?, NULL)
       ON CONFLICT(query_key) DO NOTHING`,
      [uid(), key, lat, lng, out.displayName, out.addressLine1, out.city, out.state, out.zip, out.precision === 'none' ? 'none' : out.precision, JSON.stringify({ source: out.source }), nowIso()],
    );
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'reverse cache write failed');
  }
  return out;
}

function cityStateFromLine(address: string | null): { city: string | null; state: string | null; zip: string | null } | null {
  if (!address) return null;
  const m = /,\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s*(\d{5})?/.exec(address);
  if (!m) return null;
  return { city: m[1]!.trim(), state: m[2]!, zip: m[3] ?? null };
}

// ---------------------------------------------------------------- POIs
export function listPois(opts: { campusId?: string | null; categories?: string[]; bbox?: Bbox4; q?: string; limit?: number; includeInactive?: boolean }): Poi[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (!opts.includeInactive) where.push('p.is_active = 1');
  if (opts.campusId) { where.push('p.campus_id = ?'); params.push(opts.campusId); }
  if (opts.categories?.length) { where.push(`p.category IN (${placeholders(opts.categories.length)})`); params.push(...opts.categories); }
  if (opts.bbox) { where.push(inBbox('p')); params.push(...bboxParams(opts.bbox)); }
  if (opts.q) { where.push('(p.name LIKE ? COLLATE NOCASE OR p.name_zh LIKE ? OR p.tags_json LIKE ? COLLATE NOCASE)'); const like = `%${opts.q}%`; params.push(like, like, like); }
  const rows = q.all<PoiRow>(`SELECT p.* FROM pois p${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY p.sort_order, p.name LIMIT ?`, [...params, Math.min(opts.limit ?? 500, 500)]);
  return rows.map(toPoiDto);
}

export function getPoiRow(id: string): PoiRow | undefined {
  return q.get<PoiRow>('SELECT * FROM pois WHERE id = ?', [id]);
}

// ---------------------------------------------------------------- layers (explore)
type ItemRow = { id: string; campus_id: string; title: string; category: string; price_cents: number; is_free: number; obo: number; pickup_label: string | null; pickup_lat: number; pickup_lng: number; boosted_until: string | null; cover_upload_id: string | null; boost_tier?: string | null };
type BuddyRow = { id: string; campus_id: string; type: string; title: string; starts_at: string | null; location_name: string | null; lat: number; lng: number; cost_split_cents: number | null; member_count: number; max_members: number; boosted_until: string | null };
type RouteRow = { id: string; name: string; short_name: string | null; color: string; polyline_json: string };

function coverUrls(ids: (string | null)[]): Map<string, string> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!list.length) return out;
  for (const u of q.all<{ id: string; url: string }>(`SELECT id, url FROM uploads WHERE id IN (${placeholders(list.length)})`, list)) out.set(u.id, u.url);
  return out;
}

function boostTierFor(entityType: 'listing' | 'market_item' | 'buddy_post', ids: string[]): Map<string, 'basic' | 'plus' | 'max'> {
  const out = new Map<string, 'basic' | 'plus' | 'max'>();
  if (!ids.length) return out;
  try {
    const rows = q.all<{ entity_id: string; tier: string }>(
      `SELECT entity_id, tier FROM boosts WHERE entity_type = ? AND status = 'active' AND entity_id IN (${placeholders(ids.length)})`,
      [entityType, ...ids],
    );
    for (const r of rows) out.set(r.entity_id, r.tier as 'basic' | 'plus' | 'max');
  } catch {
    /* boosts table empty or not seeded yet — pins simply carry no tier */
  }
  return out;
}

/** Runs one layer query; any failure (missing seed, schema drift of another module) degrades to an empty array. */
function safe<T>(layer: MapLayer, fn: () => T[]): T[] {
  try {
    return fn();
  } catch (e) {
    logger.warn({ layer, err: (e as Error).message }, 'map layer query failed — returning empty');
    return [];
  }
}

export function layersFor(p: LayersQuery, ctx: { viewerId?: string | null; isAdmin?: boolean } = {}): LayersResponse {
  const bbox = parseLayerBbox(p.bbox);
  const layers = new Set<MapLayer>(p.layers?.length ? p.layers : MAP_LAYERS);
  const bp = bboxParams(bbox);
  const center = bboxCenter(bbox);
  const campus = p.campusId ? getCampus(p.campusId) : null;
  const campusId = campus?.id ?? null;
  const counts: LayerCounts = { listings: 0, items: 0, buddy: 0, shuttle: 0, pois: 0 };
  const truncated: Partial<Record<MapLayer, boolean>> = {};
  const out: LayersResponse = { listings: [], listingCards: [], items: [], buddy: [], shuttleStops: [], shuttleRoutes: [], pois: [], counts, truncated, campusId, bbox };

  // listings — nearest to the viewport centre first so the cap keeps what the user is looking at
  if (layers.has('listings')) {
    const where: string[] = [`l.status = 'active'`, `l.moderation_status = 'ok'`, inBbox('l')];
    const params: (string | number)[] = [...bp];
    if (p.priceMin !== undefined) { where.push('l.price_cents >= ?'); params.push(p.priceMin); }
    if (p.priceMax !== undefined) { where.push('l.price_cents <= ?'); params.push(p.priceMax); }
    const rows = safe('listings', () => {
      counts.listings = q.count(`SELECT COUNT(*) FROM listings l WHERE ${where.join(' AND ')}`, params);
      return q.all<ListingCardRow & { d: number }>(
        `SELECT l.*, ((l.lat - ?) * (l.lat - ?) + (l.lng - ?) * (l.lng - ?)) AS d FROM listings l WHERE ${where.join(' AND ')} ORDER BY (l.boosted_until IS NOT NULL AND l.boosted_until > ?) DESC, d ASC LIMIT ?`,
        [center.lat, center.lat, center.lng, center.lng, ...params, nowIso(), LAYER_PIN_CAP],
      );
    });
    truncated.listings = counts.listings > rows.length;
    const tiers = boostTierFor('listing', rows.map((r) => r.id));
    const covers = coverUrls(rows.map((r) => r.cover_upload_id));
    const saved = new Set<string>();
    if (ctx.viewerId && rows.length) {
      try {
        for (const s of q.all<{ listing_id: string }>(`SELECT listing_id FROM listing_saves WHERE user_id = ? AND listing_id IN (${placeholders(rows.length)})`, [ctx.viewerId, ...rows.map((r) => r.id)])) saved.add(s.listing_id);
      } catch { /* saves table owned by listings; optional */ }
    }
    out.listings = rows.map((r) => {
      const exact = ctx.isAdmin || r.owner_id === ctx.viewerId || r.hide_exact_address !== 1;
      const pos = exact ? { lat: r.lat, lng: r.lng } : fuzz(r.id, r.lat, r.lng);
      const tier = tiers.get(r.id);
      return {
        id: r.id, type: 'listing' as const, lat: pos.lat, lng: pos.lng, title: r.title, priceCents: r.price_cents,
        subtitle: [r.neighborhood, r.city].filter(Boolean).join(' · ') || null, imageUrl: r.cover_upload_id ? covers.get(r.cover_upload_id) ?? null : null,
        ...(tier ? { boostTier: tier } : {}), link: `/listings/${r.id}`, campusId: r.campus_id, approx: !exact,
        nearShuttle: r.nearest_stop_m !== null && r.nearest_stop_m <= 400, saved: saved.has(r.id),
      };
    });
    const cardRows = rows.slice(0, LAYER_CARD_CAP);
    try {
      out.listingCards = listingCards(cardRows, { viewerId: ctx.viewerId ?? null, isAdmin: ctx.isAdmin }).map((c): ListingCard => {
        const tier = tiers.get(c.id);
        return tier ? { ...c, sponsored: false, boostTier: tier } : c;
      });
    } catch (e) {
      logger.warn({ err: (e as Error).message }, 'listingCards failed for map drawer');
    }
  }

  if (layers.has('items')) {
    const where: string[] = [`m.status IN ('active','reserved')`, `m.moderation_status = 'ok'`, 'm.pickup_lat IS NOT NULL', 'm.pickup_lng IS NOT NULL', inBbox('m', 'pickup_lat', 'pickup_lng')];
    const params: (string | number)[] = [...bp];
    if (p.category) { where.push('m.category = ?'); params.push(p.category); }
    if (p.priceMin !== undefined) { where.push('m.price_cents >= ?'); params.push(p.priceMin); }
    if (p.priceMax !== undefined) { where.push('m.price_cents <= ?'); params.push(p.priceMax); }
    const rows = safe('items', () => {
      counts.items = q.count(`SELECT COUNT(*) FROM market_items m WHERE ${where.join(' AND ')}`, params);
      return q.all<ItemRow>(
        `SELECT m.id, m.campus_id, m.title, m.category, m.price_cents, m.is_free, m.obo, m.pickup_label, m.pickup_lat, m.pickup_lng, m.boosted_until, m.cover_upload_id,
                ((m.pickup_lat - ?) * (m.pickup_lat - ?) + (m.pickup_lng - ?) * (m.pickup_lng - ?)) AS d
         FROM market_items m WHERE ${where.join(' AND ')} ORDER BY d ASC LIMIT ?`,
        [center.lat, center.lat, center.lng, center.lng, ...params, LAYER_PIN_CAP],
      );
    });
    truncated.items = counts.items > rows.length;
    const tiers = boostTierFor('market_item', rows.map((r) => r.id));
    const covers = coverUrls(rows.map((r) => r.cover_upload_id));
    out.items = rows.map((r) => {
      const tier = tiers.get(r.id);
      return {
        id: r.id, type: 'item' as const, lat: round3(r.pickup_lat) ?? r.pickup_lat, lng: round3(r.pickup_lng) ?? r.pickup_lng, title: r.title,
        priceCents: r.price_cents, isFree: r.is_free === 1, obo: r.obo === 1, subtitle: r.pickup_label ?? r.category,
        imageUrl: r.cover_upload_id ? covers.get(r.cover_upload_id) ?? null : null, ...(tier ? { boostTier: tier } : {}),
        link: `/market/${r.id}`, campusId: r.campus_id, approx: true,
      };
    });
  }

  if (layers.has('buddy')) {
    const where: string[] = [`b.status IN ('open','full')`, `b.moderation_status = 'ok'`, 'b.lat IS NOT NULL', 'b.lng IS NOT NULL', inBbox('b')];
    const params: (string | number)[] = [...bp];
    if (p.buddyType) { where.push('b.type = ?'); params.push(p.buddyType); }
    if (p.dateFrom) { where.push('(b.starts_at IS NULL OR b.starts_at >= ?)'); params.push(`${p.dateFrom}T00:00:00`); }
    if (p.dateTo) { where.push('(b.starts_at IS NULL OR b.starts_at <= ?)'); params.push(`${p.dateTo}T23:59:59`); }
    if (!p.dateFrom && !p.dateTo) { where.push('(b.starts_at IS NULL OR b.starts_at >= ?)'); params.push(nowIso()); }
    const rows = safe('buddy', () => {
      counts.buddy = q.count(`SELECT COUNT(*) FROM buddy_posts b WHERE ${where.join(' AND ')}`, params);
      return q.all<BuddyRow>(
        `SELECT b.id, b.campus_id, b.type, b.title, b.starts_at, b.location_name, b.lat, b.lng, b.cost_split_cents, b.member_count, b.max_members, b.boosted_until
         FROM buddy_posts b WHERE ${where.join(' AND ')} ORDER BY (b.starts_at IS NULL), b.starts_at ASC LIMIT ?`,
        [...params, LAYER_PIN_CAP],
      );
    });
    truncated.buddy = counts.buddy > rows.length;
    const tiers = boostTierFor('buddy_post', rows.map((r) => r.id));
    out.buddy = rows.map((r) => {
      const tier = tiers.get(r.id);
      return {
        id: r.id, type: 'buddy' as const, lat: r.lat, lng: r.lng, title: r.title, priceCents: r.cost_split_cents ?? undefined,
        subtitle: [r.location_name, `${r.member_count}/${r.max_members}`].filter(Boolean).join(' · '), imageUrl: null, ...(tier ? { boostTier: tier } : {}),
        link: `/buddy/${r.id}`, campusId: r.campus_id, startsAt: r.starts_at,
      };
    });
  }

  if (layers.has('shuttle')) {
    const stops = safe('shuttle', () =>
      q.all<StopRow>(`SELECT s.id, s.campus_id, s.name, s.name_zh, s.code, s.lat, s.lng, s.address FROM shuttle_stops s WHERE s.is_active = 1 AND ${inBbox('s')} ORDER BY s.name LIMIT ?`, [...bp, LAYER_PIN_CAP]),
    );
    const stopIds = stops.map((s) => s.id);
    const routesByStop = new Map<string, Pick<ShuttleRouteLite, 'id' | 'name' | 'shortName' | 'color'>[]>();
    const routeIds = new Set<string>();
    if (stopIds.length) {
      try {
        for (const r of q.all<{ stop_id: string; id: string; name: string; short_name: string | null; color: string }>(
          `SELECT rs.stop_id, r.id, r.name, r.short_name, r.color FROM shuttle_route_stops rs JOIN shuttle_routes r ON r.id = rs.route_id
           WHERE r.is_active = 1 AND rs.stop_id IN (${placeholders(stopIds.length)}) ORDER BY r.sort_order`,
          stopIds,
        )) {
          const list = routesByStop.get(r.stop_id) ?? [];
          if (!list.some((x) => x.id === r.id)) list.push({ id: r.id, name: r.name, shortName: r.short_name, color: r.color });
          routesByStop.set(r.stop_id, list);
          routeIds.add(r.id);
        }
      } catch (e) {
        logger.warn({ err: (e as Error).message }, 'shuttle route join failed');
      }
    }
    out.shuttleStops = stops.map((s): ShuttleStop & { routes: Pick<ShuttleRouteLite, 'id' | 'name' | 'shortName' | 'color'>[] } => ({
      id: s.id, campusId: s.campus_id, name: s.name, nameZh: s.name_zh, code: s.code, lat: s.lat, lng: s.lng, address: s.address, routes: routesByStop.get(s.id) ?? [],
    }));
    counts.shuttle = stops.length;
    const ids = [...routeIds];
    if (ids.length) {
      out.shuttleRoutes = safe('shuttle', () =>
        q.all<RouteRow>(`SELECT id, name, short_name, color, polyline_json FROM shuttle_routes WHERE is_active = 1 AND id IN (${placeholders(ids.length)}) ORDER BY sort_order`, ids),
      ).map((r) => ({ id: r.id, name: r.name, shortName: r.short_name, color: r.color, polyline: parseJson<[number, number][]>(r.polyline_json, []) }));
    }
  }

  if (layers.has('pois')) {
    const rows = safe('pois', () => q.all<PoiRow>(`SELECT p.* FROM pois p WHERE p.is_active = 1 AND ${inBbox('p')} ORDER BY p.sort_order, p.name LIMIT ?`, [...bp, LAYER_PIN_CAP]));
    out.pois = rows.map(toPoiDto);
    counts.pois = rows.length;
  }

  return out;
}

// ---------------------------------------------------------------- nationwide campus bubbles
export function campusStats(opts: { bbox?: Bbox4 } = {}): { campuses: CampusStat[]; totals: CampusStat['counts'] } {
  const count = (sql: string, params: (string | number)[]) => {
    try {
      return q.count(sql, params);
    } catch {
      return 0;
    }
  };
  const perCampus = (sql: string): Map<string, number> => {
    const m = new Map<string, number>();
    try {
      for (const r of q.all<{ campus_id: string; n: number }>(sql)) m.set(r.campus_id, r.n);
    } catch { /* table not seeded by that module yet */ }
    return m;
  };
  const listings = perCampus(`SELECT campus_id, COUNT(*) AS n FROM listings WHERE status = 'active' AND moderation_status = 'ok' GROUP BY campus_id`);
  const items = perCampus(`SELECT campus_id, COUNT(*) AS n FROM market_items WHERE status IN ('active','reserved') AND moderation_status = 'ok' GROUP BY campus_id`);
  const buddy = perCampus(`SELECT campus_id, COUNT(*) AS n FROM buddy_posts WHERE status IN ('open','full') AND moderation_status = 'ok' GROUP BY campus_id`);
  const stops = perCampus(`SELECT campus_id, COUNT(*) AS n FROM shuttle_stops WHERE is_active = 1 GROUP BY campus_id`);
  const pois = perCampus(`SELECT campus_id, COUNT(*) AS n FROM pois WHERE is_active = 1 GROUP BY campus_id`);
  void count;
  const totals = { listings: 0, items: 0, buddy: 0, stops: 0, pois: 0 };
  const campuses = allCampuses({ activeOnly: true })
    .filter((c) => !opts.bbox || (c.lat >= opts.bbox[1] && c.lat <= opts.bbox[3] && c.lng >= opts.bbox[0] && c.lng <= opts.bbox[2]))
    .map((c): CampusStat => {
      const counts = { listings: listings.get(c.id) ?? 0, items: items.get(c.id) ?? 0, buddy: buddy.get(c.id) ?? 0, stops: stops.get(c.id) ?? 0, pois: pois.get(c.id) ?? 0 };
      totals.listings += counts.listings; totals.items += counts.items; totals.buddy += counts.buddy; totals.stops += counts.stops; totals.pois += counts.pois;
      return { id: c.id, name: c.name, nameZh: c.nameZh, shortName: c.shortName, city: c.city, state: c.state, lat: c.lat, lng: c.lng, hasShuttle: c.hasShuttle, counts, total: counts.listings + counts.items + counts.buddy };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { campuses, totals };
}

export function campusBounds(campus: Campus): { center: { lat: number; lng: number }; bbox: Bbox4; defaultZoom: number; radiusM: number } {
  const radiusM = campus.defaultRadiusM ?? 3000;
  const b = bboxAround(campus.lat, campus.lng, radiusM);
  // zoom that shows ~radiusM on a 600 px map (same formula as web/src/lib/geo.ts zoomForRadius)
  const metersPerPx = (radiusM * 2) / 600;
  const z = Math.log2((156543.03 * Math.cos((campus.lat * Math.PI) / 180)) / metersPerPx);
  return { center: { lat: campus.lat, lng: campus.lng }, bbox: [b.minLng, b.minLat, b.maxLng, b.maxLat], defaultZoom: Math.max(3, Math.min(18, Math.round(z))), radiusM };
}
