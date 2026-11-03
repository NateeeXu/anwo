// server/src/modules/wanted/matching.ts — OWNED BY THE `wanted` MODULE AGENT.
// Pure scoring function for wanted ↔ listing pairs (DATA_MODEL §7). No DB access here; service.ts loads rows and persists.
//
//   scoreMatch(wanted, areas, listing, campus, extra) → { score, breakdown, hardFail? }
//
// Weights: price 30 · dates 25 · location 20 · mustHaves 15 · fit 10 · trust bonus +0..5 (capped at 100). Boosts never count.
import { haversineM } from '../../lib/geo';

export type WantedForScore = {
  id: string;
  user_id: string;
  campus_id: string;
  scope: 'campus' | 'nationwide' | string;
  budget_min_cents: number;
  budget_max_cents: number;
  move_in_from: string;
  move_in_to: string;
  move_out_date: string | null;
  flexible_days: number;
  group_size: number;
  bedrooms_min: number;
  furnished_pref: 'any' | 'partial' | 'full' | string;
  gender_pref: 'any' | 'female' | 'male' | string;
  has_pets: number;
  needs_parking: number;
  property_types_json: string;
  must_haves_json: string;
};

export type AreaForScore = {
  kind: 'circle' | 'city' | 'campus' | string;
  lat: number | null;
  lng: number | null;
  radius_m: number | null;
  city: string | null;
  state: string | null;
  campus_id: string | null;
  /** resolved for campus-kind areas by the caller */
  campusLat?: number | null;
  campusLng?: number | null;
  campusRadiusM?: number | null;
};

export type ListingForScore = {
  id: string;
  owner_id: string;
  campus_id: string;
  price_cents: number;
  bedrooms: number;
  property_type: string;
  furnished: 'none' | 'partial' | 'full' | string;
  available_from: string;
  available_to: string | null;
  gender_pref: 'any' | 'female' | 'male' | string;
  pets_allowed: number;
  parking: 'none' | 'street' | 'lot' | 'garage' | string;
  utilities_included: number;
  lat: number;
  lng: number;
  city: string;
  state: string;
  is_verified_listing: number;
};

export type CampusForScore = { id: string; lat: number; lng: number; defaultRadiusM: number; city: string; state: string };

export type ScoreExtra = {
  /** listing_amenities.amenity keys of the listing */
  amenities: ReadonlySet<string> | string[];
  /** users.trust_level of the listing owner */
  ownerTrustLevel: number;
  /** a block exists in either direction between author and owner */
  blocked?: boolean;
};

export type Breakdown = { price: number; dates: number; location: number; mustHaves: number; fit: number; trust: number };
export type ScoreResult = { score: number; breakdown: Breakdown; hardFail?: string };

export const MATCH_PERSIST_MIN = 30;
export const MATCH_SHOW_MIN = 50;
export const MATCH_NOTIFY_MIN = 70;
export const MATCH_DIGEST_MIN = 60;

const DAY_MS = 86_400_000;
export function ymdToMs(ymd: string): number {
  return Date.parse(ymd + 'T00:00:00Z');
}
export function addDays(ymd: string, days: number): string {
  return new Date(ymdToMs(ymd) + days * DAY_MS).toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((ymdToMs(b) - ymdToMs(a)) / DAY_MS);
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const ROOM_TYPES = new Set(['room', 'shared_room']);

function parseList(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** Hard-fail check (DATA_MODEL §7). Returns the reason key or null. */
export function hardFail(w: WantedForScore, l: ListingForScore, extra: ScoreExtra): string | null {
  if (l.owner_id === w.user_id) return 'self';
  if (extra.blocked) return 'blocked';
  if (l.gender_pref !== 'any' && w.gender_pref !== 'any' && l.gender_pref !== w.gender_pref) return 'gender';
  if (w.has_pets === 1 && l.pets_allowed === 0) return 'pets';
  if (w.bedrooms_min > 0 && !ROOM_TYPES.has(l.property_type) && l.bedrooms < w.bedrooms_min) return 'bedrooms';
  return null;
}

export function priceScore(p: number, lo: number, hi: number): number {
  if (p <= hi) return 30; // inside range or below lo — cheaper is fine
  if (hi <= 0) return 0;
  return round1(30 * Math.max(0, 1 - (p - hi) / (0.25 * hi)));
}

export function datesScore(w: Pick<WantedForScore, 'move_in_from' | 'move_in_to' | 'move_out_date' | 'flexible_days'>, l: Pick<ListingForScore, 'available_from' | 'available_to'>): number {
  const flex = w.flexible_days ?? 0;
  const latest = addDays(w.move_in_to, flex);
  let s = 0;
  if (l.available_from <= latest) s += 15;
  if (l.available_from > w.move_in_from) {
    const gap = daysBetween(w.move_in_from, l.available_from);
    s -= Math.round(Math.min(10, gap / 3));
  }
  if (w.move_out_date && l.available_to) {
    const d = Math.abs(daysBetween(w.move_out_date, l.available_to));
    s += d <= 7 ? 10 : d <= 30 ? 5 : 0;
  } else {
    s += 7;
  }
  return clamp(s, 0, 25);
}

function circleScore(d: number, r: number): number {
  if (r <= 0) return d <= 0 ? 20 : 0;
  if (d <= r) return 20;
  if (d <= 2 * r) return round1(20 * (1 - (d - r) / r));
  return 0;
}

export function locationScore(w: WantedForScore, areas: AreaForScore[], l: ListingForScore, campus: CampusForScore | null): number {
  const nationwide = w.scope === 'nationwide';
  if (!areas.length) {
    if (nationwide) return 0; // nationwide posts match only through areas
    if (!campus) return 10; // unknown campus: neutral
    const d = haversineM({ lat: l.lat, lng: l.lng }, { lat: campus.lat, lng: campus.lng });
    return circleScore(d, campus.defaultRadiusM || 5000);
  }
  let best = 0;
  for (const a of areas) {
    let s = 0;
    if (a.kind === 'circle' && a.lat != null && a.lng != null) {
      const d = haversineM({ lat: l.lat, lng: l.lng }, { lat: a.lat, lng: a.lng });
      s = circleScore(d, a.radius_m ?? 2000);
    } else if (a.kind === 'city') {
      const sameState = !!a.state && a.state.toUpperCase() === l.state.toUpperCase();
      const sameCity = sameState && !!a.city && a.city.trim().toLowerCase() === l.city.trim().toLowerCase();
      s = sameCity ? 20 : sameState ? 6 : 0;
    } else if (a.kind === 'campus') {
      if (a.campus_id && a.campus_id === l.campus_id) s = 20;
      else if (!nationwide && a.campusLat != null && a.campusLng != null) {
        const d = haversineM({ lat: l.lat, lng: l.lng }, { lat: a.campusLat, lng: a.campusLng });
        s = circleScore(d, a.campusRadiusM ?? 5000);
      }
    }
    if (s > best) best = s;
    if (best >= 20) break;
  }
  return best;
}

/** Must-have keys that map to listing columns instead of listing_amenities rows. */
export function listingSatisfies(key: string, l: ListingForScore, amenities: ReadonlySet<string>): boolean {
  switch (key) {
    case 'furnished':
      return l.furnished === 'partial' || l.furnished === 'full';
    case 'parking':
      return l.parking !== 'none';
    case 'utilities_included':
      return l.utilities_included === 1 || amenities.has('utilities_included');
    case 'laundry':
      return amenities.has('laundry_in_unit') || amenities.has('laundry_in_building');
    default:
      return amenities.has(key);
  }
}

export function mustHavesScore(w: WantedForScore, l: ListingForScore, amenities: ReadonlySet<string>): number {
  const keys = [...new Set(parseList(w.must_haves_json))];
  if (!keys.length) return 15;
  const matched = keys.filter((k) => listingSatisfies(k, l, amenities)).length;
  return round1((15 * matched) / keys.length);
}

export function fitScore(w: WantedForScore, l: ListingForScore): number {
  let s = 0;
  if (w.furnished_pref === 'any') s += 3;
  else if (w.furnished_pref === 'full') s += l.furnished === 'full' ? 3 : l.furnished === 'partial' ? 1 : 0;
  else if (w.furnished_pref === 'partial') s += l.furnished === 'partial' || l.furnished === 'full' ? 3 : 0;
  const types = parseList(w.property_types_json);
  if (!types.length || types.includes(l.property_type)) s += 3;
  if (l.bedrooms >= w.group_size || (ROOM_TYPES.has(l.property_type) && w.group_size === 1)) s += 4;
  else s += 1;
  return s;
}

export function trustBonus(l: ListingForScore, ownerTrustLevel: number): number {
  return (l.is_verified_listing === 1 ? 3 : 0) + (ownerTrustLevel >= 3 ? 2 : 0);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** DATA_MODEL §7 — pure. `hardFail` set ⇒ score 0 and no row should be persisted. */
export function scoreMatch(w: WantedForScore, areas: AreaForScore[], l: ListingForScore, campus: CampusForScore | null, extra: ScoreExtra): ScoreResult {
  const amenities = extra.amenities instanceof Set ? (extra.amenities as ReadonlySet<string>) : new Set(extra.amenities as string[]);
  const fail = hardFail(w, l, extra);
  const zero: Breakdown = { price: 0, dates: 0, location: 0, mustHaves: 0, fit: 0, trust: 0 };
  if (fail) return { score: 0, breakdown: zero, hardFail: fail };
  const breakdown: Breakdown = {
    price: priceScore(l.price_cents, w.budget_min_cents, w.budget_max_cents),
    dates: datesScore(w, l),
    location: locationScore(w, areas, l, campus),
    mustHaves: mustHavesScore(w, l, amenities),
    fit: fitScore(w, l),
    trust: trustBonus(l, extra.ownerTrustLevel),
  };
  const raw = breakdown.price + breakdown.dates + breakdown.location + breakdown.mustHaves + breakdown.fit + breakdown.trust;
  const score = clamp(Math.round(raw), 0, 100);
  // persist integer components so the UI bars are stable
  const rounded: Breakdown = {
    price: Math.round(breakdown.price), dates: Math.round(breakdown.dates), location: Math.round(breakdown.location),
    mustHaves: Math.round(breakdown.mustHaves), fit: Math.round(breakdown.fit), trust: Math.round(breakdown.trust),
  };
  return { score, breakdown: rounded };
}

/** Max points per component (for breakdown bars). */
export const BREAKDOWN_MAX: Breakdown = { price: 30, dates: 25, location: 20, mustHaves: 15, fit: 10, trust: 5 };
