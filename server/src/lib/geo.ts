// Geo helpers + campus scoping — DATA_MODEL §9, §3.5.
//
//   haversineM(a, b)                                  // metres between {lat,lng}
//   bboxAround(lat, lng, radiusM)                     // { minLat, maxLat, minLng, maxLng }
//   haversineSql('l')                                 // SQL expr for distance_m (uses 2 params: lat, lng — see distanceParams)
//   fuzz(id, lat, lng)                                // deterministic ≤150 m offset for hidden addresses
//   const scope = scopeFromQuery(req, parsed);        // precedence: bbox > lat/lng > city/state > campusId (user → cookie)
//   const w = whereScope(scope, { alias: 'l' });      // { sql: ' AND ...', params: [...], distanceSql: '...' | null, distanceParams }
//   const g = await geocode('1234 Chicago Ave, Evanston IL');   // cache → Nominatim → campus centroid fallback (approx: true)
//   suggestCampus(lat, lng)                           // { suggested: Campus|null (≤ 40 km), nearest: (Campus & {distanceM})[] }
import type { Request } from 'express';
import type { Campus, GeocodeResult, ScopeInfo } from '@shared/types';
import type { ScopeQuery } from '@shared/schemas/common';
import { config } from '../config';
import { q, uid } from '../db';
import { allCampuses, campusesInCity, getCampus } from './campuses';
import { CAMPUS_COOKIE, cookieOf } from './auth';
import { ApiError } from './errors';
import { isEnabled } from './flags';
import { fuzz as fuzzPoint } from './fuzz';
import { logger } from './logger';
import { nowIso, isoPlus } from './time';

export type LatLng = { lat: number; lng: number };
export type BBox = { minLat: number; maxLat: number; minLng: number; maxLng: number };
const R = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}
export const haversine = haversineM;

export function bboxAround(lat: number, lng: number, radiusM: number): BBox {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.05, Math.cos(toRad(lat))));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}
export const bbox = bboxAround;

/** SQL haversine in metres for table alias `a` (lat/lng columns). Binds 2 positional params: lat, lng (see distanceParams). */
export function haversineSql(alias = 'l', latCol = 'lat', lngCol = 'lng'): string {
  return haversineExpr(`${alias}.${latCol}`, `${alias}.${lngCol}`);
}
/** Same as haversineSql over arbitrary lat / lng SQL expressions. */
export function haversineExpr(la: string, ln: string): string {
  return `(2 * 6371000 * asin(sqrt(pow(sin(radians(${la} - ?) / 2), 2) + cos(radians(?)) * cos(radians(${la})) * pow(sin(radians(${ln} - ?) / 2), 2))))`;
}
/** Params matching haversineSql: [lat, lat, lng]. */
export function distanceParams(center: LatLng): number[] {
  return [center.lat, center.lat, center.lng];
}

/** Deterministic fuzz ≤ 150 m for listings with hide_exact_address (DATA_MODEL §3.1). */
export function fuzz(id: string, lat: number, lng: number, maxM = 150): LatLng {
  return fuzzPoint(id, lat, lng, maxM);
}
export function round3(n: number | null): number | null {
  return n === null ? null : Math.round(n * 1000) / 1000;
}

export function parseBbox(s: string): [number, number, number, number] {
  const [minLng, minLat, maxLng, maxLat] = s.split(',').map(Number) as [number, number, number, number];
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite) || minLat >= maxLat || minLng >= maxLng)
    throw new ApiError('VALIDATION', 'Invalid bbox', { fields: { bbox: 'minLng,minLat,maxLng,maxLat expected' } });
  if (maxLat - minLat > 2 || maxLng - minLng > 2) throw new ApiError('VALIDATION', 'bbox too large (max 2°×2°)', { fields: { bbox: 'too large' } });
  return [minLng, minLat, maxLng, maxLat];
}

// ------------------------------------------------------------------ scope resolution (§9.1)
export type ResolvedScope = ScopeInfo & {
  campus: Campus | null;
  /** radius in metres when a center applies */
  radiusM?: number;
  /** which input produced campusId: 'query' | 'user' | 'cookie' | 'none' */
  campusSource: 'query' | 'user' | 'cookie' | 'none';
};

export function resolveCampusId(req: Request, explicit?: string | null): { id: string | null; source: ResolvedScope['campusSource'] } {
  if (explicit) {
    const c = getCampus(explicit);
    if (!c) throw new ApiError('VALIDATION', 'Unknown campus', { fields: { campusId: 'unknown campus' } });
    return { id: c.id, source: 'query' };
  }
  if (req.user?.campus_id) return { id: req.user.campus_id, source: 'user' };
  const cookie = cookieOf(req, CAMPUS_COOKIE);
  if (cookie) {
    const c = getCampus(cookie);
    if (c) return { id: c.id, source: 'cookie' };
  }
  return { id: null, source: 'none' };
}

/** Resolves the effective scope for a list endpoint from the parsed ScopeQuery (DATA_MODEL §9.1). */
export function scopeFromQuery(req: Request, p: Partial<ScopeQuery> = {}, opts: { allowNationwide?: boolean; requireCampus?: boolean } = {}): ResolvedScope {
  const allowNationwide = (opts.allowNationwide ?? true) && isEnabled('nationwide.enabled');
  let scope: 'campus' | 'nationwide' = p.scope === 'nationwide' && allowNationwide ? 'nationwide' : 'campus';
  const { id: campusId, source } = resolveCampusId(req, p.campusId);
  const campus = getCampus(campusId);
  const out: ResolvedScope = { campusId, scope, campus, campusSource: source };

  if (p.bbox) {
    const b = parseBbox(p.bbox);
    out.bbox = b;
    out.center = { lat: (b[1] + b[3]) / 2, lng: (b[0] + b[2]) / 2 };
  } else if (p.lat !== undefined && p.lng !== undefined) {
    out.center = { lat: p.lat, lng: p.lng };
    const radiusM = p.radiusKm ? p.radiusKm * 1000 : campus?.defaultRadiusM ?? 5000;
    out.radiusM = Math.min(radiusM, 50_000);
    out.radiusKm = out.radiusM / 1000;
  } else if (p.city && p.state) {
    out.city = p.city.trim();
    out.state = p.state.toUpperCase();
    if (scope === 'campus' && allowNationwide) scope = 'nationwide'; // city search is inherently cross-campus
    out.scope = scope;
  } else if (p.radiusKm && campus) {
    out.center = { lat: campus.lat, lng: campus.lng };
    out.radiusM = p.radiusKm * 1000;
    out.radiusKm = p.radiusKm;
  }
  if (scope === 'campus' && !campusId && !out.bbox && !out.center && !out.city && (opts.requireCampus ?? true))
    throw new ApiError('VALIDATION', 'campusId is required (or scope=nationwide)', { fields: { campusId: 'required' } });
  return out;
}

export type WhereScopeOptions = {
  alias?: string;
  latCol?: string;
  lngCol?: string;
  cityCol?: string;
  stateCol?: string;
  campusCol?: string;
  /** when false (buddy/shuttle), scope is always campus */
  allowNationwide?: boolean;
  /** 'listing': hidden addresses use the fuzzed point (SQL anwo_fuzz); 'round3': coordinates rounded to 3 decimals (market pickup) */
  fuzz?: 'listing' | 'round3';
};
export type WhereScope = {
  /** starts with ' AND ' (or '' when nothing applies) */
  sql: string;
  params: (string | number)[];
  /** haversine expression when a center exists (for ORDER BY distance / distanceM) */
  distanceSql: string | null;
  distanceParams: number[];
};

/** Builds the WHERE fragment every list endpoint appends after its status filters. */
export function whereScope(s: ResolvedScope, o: WhereScopeOptions = {}): WhereScope {
  const a = o.alias ?? 'l';
  const latCol = o.latCol ?? 'lat';
  const lngCol = o.lngCol ?? 'lng';
  const cityCol = o.cityCol ?? 'city';
  const stateCol = o.stateCol ?? 'state';
  const campusCol = o.campusCol ?? 'campus_id';
  const parts: string[] = [];
  const params: (string | number)[] = [];
  const nationwide = s.scope === 'nationwide' && (o.allowNationwide ?? true);
  // public coordinates: filters, sort and distance use the same fuzzed / rounded point the cards show
  const latX = o.fuzz === 'listing' ? `(CASE WHEN ${a}.hide_exact_address = 1 THEN anwo_fuzz(${a}.id, ${a}.${latCol}, ${a}.${lngCol}, 0) ELSE ${a}.${latCol} END)`
    : o.fuzz === 'round3' ? `round(${a}.${latCol}, 3)` : `${a}.${latCol}`;
  const lngX = o.fuzz === 'listing' ? `(CASE WHEN ${a}.hide_exact_address = 1 THEN anwo_fuzz(${a}.id, ${a}.${latCol}, ${a}.${lngCol}, 1) ELSE ${a}.${lngCol} END)`
    : o.fuzz === 'round3' ? `round(${a}.${lngCol}, 3)` : `${a}.${lngCol}`;
  let distanceSql: string | null = null;
  let distanceParams: number[] = [];

  if (s.bbox) {
    const [minLng, minLat, maxLng, maxLat] = s.bbox;
    parts.push(`${latX} BETWEEN ? AND ? AND ${lngX} BETWEEN ? AND ?`);
    params.push(minLat, maxLat, minLng, maxLng);
    // bbox explicitly shows location → no campus filter even in campus scope
  } else if (s.center && s.radiusM) {
    const b = bboxAround(s.center.lat, s.center.lng, s.radiusM);
    parts.push(`${latX} BETWEEN ? AND ? AND ${lngX} BETWEEN ? AND ?`);
    params.push(b.minLat, b.maxLat, b.minLng, b.maxLng);
    parts.push(`${haversineExpr(latX, lngX)} <= ?`);
    params.push(s.center.lat, s.center.lat, s.center.lng, s.radiusM);
    if (!nationwide && s.campusId) {
      parts.push(`${a}.${campusCol} = ?`);
      params.push(s.campusId);
    }
  } else if (s.city && s.state) {
    const campusIds = campusesInCity(s.city, s.state).map((c) => c.id);
    if (campusIds.length) {
      parts.push(`((${a}.${cityCol} = ? AND ${a}.${stateCol} = ?) OR ${a}.${campusCol} IN (${campusIds.map(() => '?').join(', ')}))`);
      params.push(s.city, s.state, ...campusIds);
    } else {
      parts.push(`(${a}.${cityCol} = ? AND ${a}.${stateCol} = ?)`);
      params.push(s.city, s.state);
    }
  } else if (!nationwide && s.campusId) {
    parts.push(`${a}.${campusCol} = ?`);
    params.push(s.campusId);
  }
  if (s.center) {
    distanceSql = haversineExpr(latX, lngX);
    distanceParams = [s.center.lat, s.center.lat, s.center.lng];
  } else if (!nationwide && s.campus) {
    distanceSql = haversineExpr(latX, lngX);
    distanceParams = [s.campus.lat, s.campus.lat, s.campus.lng];
  }
  return { sql: parts.length ? ' AND ' + parts.join(' AND ') : '', params, distanceSql, distanceParams };
}

/** ScopeInfo echo for `data.scope` (strips server-only fields). */
export function scopeInfo(s: ResolvedScope): ScopeInfo {
  const out: ScopeInfo = { campusId: s.campusId, scope: s.scope };
  if (s.city) out.city = s.city;
  if (s.state) out.state = s.state;
  if (s.center) out.center = s.center;
  if (s.radiusKm) out.radiusKm = s.radiusKm;
  if (s.bbox) out.bbox = s.bbox;
  return out;
}

// ------------------------------------------------------------------ campus suggestion (§9.3)
export function nearestCampuses(lat: number, lng: number, n = 3): (Campus & { distanceM: number })[] {
  return allCampuses()
    .map((c) => ({ ...c, distanceM: haversineM({ lat, lng }, { lat: c.lat, lng: c.lng }) }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, n);
}
export function suggestCampus(lat: number, lng: number): { suggested: Campus | null; nearest: (Campus & { distanceM: number })[] } {
  const nearest = nearestCampuses(lat, lng, 3);
  const first = nearest[0];
  return { suggested: first && first.distanceM <= 40_000 ? first : null, nearest };
}

// ------------------------------------------------------------------ geocoding
export function normalizeQuery(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
type CacheRow = {
  id: string; query_key: string; lat: number | null; lng: number | null; display_name: string | null; address_line1: string | null;
  city: string | null; state: string | null; zip: string | null; precision: string | null; raw_json: string; expires_at: string | null;
};
const STATE_ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY',
  louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};
export function stateAbbr(s: string | null | undefined): string | null {
  if (!s) return null;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return STATE_ABBR[s.toLowerCase()] ?? null;
}

function cacheToResult(r: CacheRow): GeocodeResult | null {
  if (r.lat === null || r.lng === null || r.precision === 'none') return null;
  return {
    lat: r.lat, lng: r.lng, displayName: r.display_name ?? '', addressLine1: r.address_line1, city: r.city, state: r.state, zip: r.zip,
    precision: (r.precision as GeocodeResult['precision']) ?? 'street',
  };
}
function cacheWrite(key: string, res: GeocodeResult | null, raw: unknown, ttlMs: number | null): void {
  q.run(
    `INSERT INTO geocode_cache (id, query_key, kind, provider, lat, lng, display_name, address_line1, city, state, zip, country, precision, raw_json, hit_count, created_at, expires_at)
     VALUES (?, ?, 'forward', 'nominatim', ?, ?, ?, ?, ?, ?, ?, 'US', ?, ?, 0, ?, ?)
     ON CONFLICT(query_key) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, display_name=excluded.display_name, address_line1=excluded.address_line1,
       city=excluded.city, state=excluded.state, zip=excluded.zip, precision=excluded.precision, raw_json=excluded.raw_json, expires_at=excluded.expires_at`,
    [uid(), key, res?.lat ?? null, res?.lng ?? null, res?.displayName ?? null, res?.addressLine1 ?? null, res?.city ?? null, res?.state ?? null, res?.zip ?? null, res?.precision ?? 'none', JSON.stringify(raw ?? {}), nowIso(), ttlMs ? isoPlus(ttlMs) : null],
  );
}

type NominatimHit = { lat: string; lon: string; display_name: string; class?: string; type?: string; address?: Record<string, string> };
let lastNominatimAt = 0;
async function nominatim(query: string, near?: LatLng): Promise<GeocodeResult[]> {
  const wait = 1100 - (Date.now() - lastNominatimAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimAt = Date.now();
  const url = new URL('/search', config.nominatimUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'us');
  url.searchParams.set('limit', '5');
  if (near) url.searchParams.set('viewbox', `${near.lng - 0.5},${near.lat + 0.5},${near.lng + 0.5},${near.lat - 0.5}`);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'anwo-campus-sublet/0.1 (dev; contact: admin@example.edu)', Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    const hits = (await res.json()) as NominatimHit[];
    return hits.map((h) => {
      const a = h.address ?? {};
      const house = a.house_number ? `${a.house_number} ` : '';
      const road = a.road ?? a.pedestrian ?? a.footway ?? '';
      const precision: GeocodeResult['precision'] = a.house_number ? 'rooftop' : road ? 'street' : 'city';
      return {
        lat: Number(h.lat), lng: Number(h.lon), displayName: h.display_name,
        addressLine1: road ? `${house}${road}`.trim() : null,
        city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null,
        state: stateAbbr(a.state) ?? null, zip: a.postcode ?? null, precision,
      };
    });
  } finally {
    clearTimeout(t);
  }
}

/** Extracts "City, ST" from a free-form address (used by the offline fallback). */
export function cityStateFromAddress(address: string): { city: string | null; state: string | null; zip: string | null } {
  const zip = /\b(\d{5})(?:-\d{4})?\b/.exec(address)?.[1] ?? null;
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  let state: string | null = null;
  let city: string | null = null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const seg = parts[i]!.replace(/\b\d{5}(?:-\d{4})?\b/, '').replace(/\bUSA?\b/i, '').trim();
    const m = /^([A-Za-z .]+?)\s+([A-Za-z]{2})$/.exec(seg);
    if (!state && m && stateAbbr(m[2]!)) { state = stateAbbr(m[2]!); city = m[1]!.trim(); break; }
    if (!state && stateAbbr(seg)) { state = stateAbbr(seg); city = parts[i - 1]?.replace(/\b\d{5}(?:-\d{4})?\b/, '').trim() ?? null; break; }
  }
  return { city, state, zip };
}

/** Deterministic small jitter (≤ 600 m) around a campus centroid so fallback pins do not stack. */
function jitterAround(seed: string, center: LatLng, maxM = 600): LatLng {
  return fuzz(seed, center.lat, center.lng, maxM);
}

export type GeocodeOptions = { near?: LatLng; campusId?: string | null; useCache?: boolean };
/** Forward geocode: cache → Nominatim (4 s) → campus-centroid fallback `{ approx: true, precision: 'city' }`. Never throws. */
export async function geocode(address: string, opts: GeocodeOptions = {}): Promise<GeocodeResult & { cached: boolean; approx: boolean }> {
  const key = normalizeQuery(address);
  if (opts.useCache !== false) {
    const row = q.get<CacheRow>('SELECT * FROM geocode_cache WHERE query_key = ?', [key]);
    if (row && (!row.expires_at || row.expires_at > nowIso())) {
      q.run('UPDATE geocode_cache SET hit_count = hit_count + 1 WHERE id = ?', [row.id]);
      const r = cacheToResult(row);
      if (r) return { ...r, cached: true, approx: false };
    }
  }
  if (!config.geocodeOffline) {
    try {
      const hits = await nominatim(address, opts.near);
      const best = hits[0];
      if (best) {
        cacheWrite(key, best, hits, null);
        return { ...best, cached: false, approx: false };
      }
    } catch (e) {
      logger.warn({ err: (e as Error).message, address }, 'geocode upstream failed, using fallback');
    }
  }
  // fallback: city/state → a campus in that city, else the given campus, else nearest to `near`, else first campus
  const cs = cityStateFromAddress(address);
  let campus: Campus | null = null;
  if (cs.city && cs.state) campus = campusesInCity(cs.city, cs.state)[0] ?? null;
  if (!campus && opts.campusId) campus = getCampus(opts.campusId);
  if (!campus && opts.near) campus = nearestCampuses(opts.near.lat, opts.near.lng, 1)[0] ?? null;
  if (!campus) campus = allCampuses()[0] ?? null;
  const center = campus ? { lat: campus.lat, lng: campus.lng } : { lat: 39.8283, lng: -98.5795 };
  const p = jitterAround(key, center);
  const result: GeocodeResult = {
    lat: p.lat, lng: p.lng, displayName: address, addressLine1: address.split(',')[0]?.trim() ?? null,
    city: cs.city ?? campus?.city ?? null, state: cs.state ?? campus?.state ?? null, zip: cs.zip, precision: 'city', approx: true,
  };
  cacheWrite(key, result, { fallback: true }, 3_600_000); // retry upstream after 1 h
  return { ...result, cached: false, approx: true };
}
