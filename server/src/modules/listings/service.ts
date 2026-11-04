// server/src/modules/listings/service.ts — OWNED BY THE `listings` MODULE AGENT.
// Stable cross-module exports (DATA_MODEL §1): recordLead(), listingContextCard().
// Everything else here is the listings domain layer used by routes.ts / jobs.ts (DTO mapping, geocoding + campus suggestion,
// commute caches, state machine, quota, leads, share text).
import { bucketDistance } from '../../lib/fuzz';
import type { Request } from 'express';
import type { Availability, Boost, ContextCard, Listing, Photo, UserPublic } from '@shared/types';
import type { ListingInput, ListingUpdateInput } from '@shared/schemas/listings';
import { q, uid, placeholders } from '../../db';
import { ApiError, invalidState } from '../../lib/errors';
import { nowIso, nowMs, DAY } from '../../lib/time';
import { geocode, haversineM, suggestCampus, fuzz } from '../../lib/geo';
import { getCampus } from '../../lib/campuses';
import { nearestStop } from '../../lib/shuttle';
import { listingCards, type ListingCardRow } from '../../lib/cards';
import { loadUserPublic } from '../../lib/users';
import { activeBoostFor } from '../../lib/sponsored';
import { isPro } from '../../lib/trust';
import { isAdmin } from '../../lib/auth';
import { logEvent, recentlyLogged } from '../../lib/events';
import { notify } from '../../lib/notify';
import type { AuthUser } from '../../lib/types';

// ------------------------------------------------------------------ rows
export type ListingRow = ListingCardRow & {
  description: string;
  address_line1: string;
  address_line2: string | null;
  zip: string | null;
  country: string;
  geocode_precision: string;
  utilities_included: number;
  utilities_note: string | null;
  utilities_est_cents: number | null;
  sqft: number | null;
  min_term_months: number;
  flexible_dates: number;
  lease_type: string;
  roommates_count: number;
  gender_pref: string;
  pets_allowed: number;
  parking: string;
  smoking_allowed: number;
  moderation_status: string;
  moderation_note: string | null;
  expires_at: string | null;
  rented_at: string | null;
  lead_count: number;
  commute_bike_min: number | null;
  nearest_stop_id: string | null;
  created_at: string;
  updated_at: string;
};
type PhotoRow = { id: string; listing_id: string; upload_id: string; sort_order: number; caption: string | null; url: string | null };
type AvailRow = { id: string; listing_id: string; start_date: string; end_date: string; status: Availability['status']; note: string | null };
export type LeadRow = { id: string; listing_id: string; owner_id: string; user_id: string; conversation_id: string | null; source: string; status: string; created_at: string };

export const PUBLIC_WHERE = "l.status = 'active' AND l.moderation_status = 'ok'";
export const EXPIRY_DAYS = 45;
export const RENEW_DAYS = 30;

export function loadListingRow(id: string): ListingRow | undefined {
  return q.get<ListingRow>('SELECT l.* FROM listings l WHERE l.id = ?', [id]);
}
export function requireListingRow(id: string): ListingRow {
  const r = loadListingRow(id);
  if (!r) throw new ApiError('NOT_FOUND', 'Listing not found');
  return r;
}

export function listPhotos(listingId: string): Photo[] {
  return q
    .all<PhotoRow>('SELECT p.id, p.listing_id, p.upload_id, p.sort_order, p.caption, u.url FROM listing_photos p LEFT JOIN uploads u ON u.id = p.upload_id WHERE p.listing_id = ? ORDER BY p.sort_order, p.created_at', [listingId])
    .map((p) => ({ id: p.id, uploadId: p.upload_id, url: p.url ?? '', sortOrder: p.sort_order, caption: p.caption }));
}
export function listAmenities(listingId: string): string[] {
  return q.all<{ amenity: string }>('SELECT amenity FROM listing_amenities WHERE listing_id = ? ORDER BY amenity', [listingId]).map((a) => a.amenity);
}
export function listAvailability(listingId: string): Availability[] {
  return q
    .all<AvailRow>('SELECT * FROM listing_availability WHERE listing_id = ? ORDER BY start_date', [listingId])
    .map((a) => ({ id: a.id, startDate: a.start_date, endDate: a.end_date, status: a.status, note: a.note }));
}

/** Owner, admin, or a party of an accepted/funded/in-inspection/released escrow sees the exact address (DATA_MODEL §3.1). */
export function canSeeExact(user: AuthUser | undefined, row: Pick<ListingRow, 'id' | 'owner_id'>): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.id === row.owner_id) return true;
  return (
    q.count("SELECT COUNT(*) FROM escrows WHERE listing_id = ? AND (payer_id = ? OR payee_id = ?) AND status IN ('accepted','funded','in_inspection','released')", [row.id, user.id, user.id]) > 0
  );
}

function toBoostDto(b: { id: string; tier: Boost['tier']; endsAt: string }, listingId: string): Boost {
  const row = q.get<{ starts_at: string; status: Boost['status']; impressions: number; clicks: number }>('SELECT starts_at, status, impressions, clicks FROM boosts WHERE id = ?', [b.id]);
  return { id: b.id, entityType: 'listing', entityId: listingId, tier: b.tier, startsAt: row?.starts_at ?? b.endsAt, endsAt: b.endsAt, status: row?.status ?? 'active', impressions: row?.impressions ?? 0, clicks: row?.clicks ?? 0 };
}

export type DtoOptions = { viewer?: AuthUser | undefined; exact?: boolean; ownerView?: boolean; owner?: UserPublic | null };

/** Full Listing DTO (API.md §1.6). `ownerView` adds leadCount / moderation fields / activeBoost; `exact` returns the real address + pin. */
export function toListingDto(r: ListingRow, opts: DtoOptions = {}): Listing {
  const exact = opts.exact ?? false;
  const [card] = listingCards([r], { viewerId: opts.viewer?.id ?? null, exact });
  const owner = opts.owner ?? loadUserPublic(r.owner_id, { withStats: true }) ?? placeholderOwner(r.owner_id);
  const streetName = r.address_line1.replace(/^\d+[a-zA-Z]?\s+/, '').replace(/,.*$/, '').trim();
  const showExact = exact || r.hide_exact_address === 0;
  const addressDisplay = showExact ? `${r.address_line1}, ${r.city}, ${r.state}${r.zip ? ' ' + r.zip : ''}` : `${r.neighborhood || streetName || r.city}, ${r.city}`;
  const commute: Listing['commute'] =
    r.commute_walk_min !== null
      ? {
          walkMin: r.commute_walk_min,
          bikeMin: r.commute_bike_min ?? Math.ceil((r.distance_to_campus_m ?? 0) / 250),
          shuttleMin: r.commute_shuttle_min,
          nearestStop: r.nearest_stop_id && r.nearest_stop_m !== null ? nearestStopDto(r.nearest_stop_id, showExact ? r.nearest_stop_m : bucketDistance(r.nearest_stop_m)!) : null,
        }
      : null;
  const bundle = q.get<{ id: string; title: string; item_count: number }>("SELECT id, title, item_count FROM market_bundles WHERE listing_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1", [r.id]);
  const dto: Listing = {
    ...card!,
    description: r.description,
    addressLine1: showExact ? r.address_line1 : null,
    addressLine2: showExact ? r.address_line2 : null,
    addressDisplay,
    zip: r.zip,
    hideExactAddress: r.hide_exact_address === 1,
    utilitiesIncluded: r.utilities_included === 1,
    utilitiesNote: r.utilities_note,
    utilitiesEstCents: r.utilities_est_cents,
    sqft: r.sqft,
    minTermMonths: r.min_term_months,
    flexibleDates: r.flexible_dates === 1,
    leaseType: r.lease_type as Listing['leaseType'],
    roommatesCount: r.roommates_count,
    genderPref: r.gender_pref as Listing['genderPref'],
    petsAllowed: r.pets_allowed === 1,
    parking: r.parking as Listing['parking'],
    smokingAllowed: r.smoking_allowed === 1,
    amenities: listAmenities(r.id),
    photos: listPhotos(r.id),
    availability: listAvailability(r.id),
    owner,
    commute,
    expiresAt: r.expires_at,
    boostedUntil: r.boosted_until,
  };
  if (bundle) dto.bundle = { id: bundle.id, title: bundle.title, itemCount: bundle.item_count };
  if (opts.ownerView) {
    dto.leadCount = r.lead_count;
    dto.moderationStatus = r.moderation_status as Listing['moderationStatus'];
    const boost = activeBoostFor('listing', r.id);
    if (boost) dto.activeBoost = toBoostDto(boost, r.id);
  }
  return dto;
}
function placeholderOwner(id: string): UserPublic {
  return { id, name: '—', role: 'student', trustLevel: 0, campusId: null, campus: null, avatarUrl: null, bio: null, program: null, gradYear: null, languages: [], memberSince: nowIso(), badges: [], isPro: false, lastSeenAt: null };
}
function nearestStopDto(stopId: string, distanceM: number): { id: string; name: string; distanceM: number } | null {
  const s = q.get<{ id: string; name: string }>('SELECT id, name FROM shuttle_stops WHERE id = ?', [stopId]);
  return s ? { id: s.id, name: s.name, distanceM } : null;
}

// ------------------------------------------------------------------ placement: geocode, campus suggestion, commute caches
export type Placement = {
  lat: number;
  lng: number;
  precision: string;
  approx: boolean;
  campusId: string;
  farFromCampus: boolean;
  city: string;
  state: string;
  zip: string | null;
  neighborhood: string | null;
};

/** Resolves lat/lng (manual pin wins; otherwise geocode) and the campus (explicit wins; otherwise nearest ≤ 40 km, else nearest with a warning). */
export async function resolvePlacement(input: Pick<ListingInput, 'address' | 'lat' | 'lng' | 'geocodePrecision' | 'campusId' | 'neighborhood'>, fallbackCampusId?: string | null): Promise<Placement> {
  const addr = input.address;
  const full = [addr.line1, addr.city, `${addr.state} ${addr.zip ?? ''}`.trim()].join(', ');
  let lat = input.lat;
  let lng = input.lng;
  let precision = input.geocodePrecision ?? 'manual';
  let approx = false;
  let city = addr.city;
  let state = addr.state.toUpperCase();
  let zip = addr.zip ?? null;
  let neighborhood = input.neighborhood ?? null;
  if (lat === undefined || lng === undefined) {
    const g = await geocode(full, { campusId: input.campusId ?? fallbackCampusId ?? null });
    lat = g.lat;
    lng = g.lng;
    precision = g.precision === 'none' ? 'city' : g.precision;
    approx = !!g.approx;
    zip = zip ?? g.zip;
    if (!neighborhood && g.displayName && !g.approx) {
      const parts = g.displayName.split(',').map((s) => s.trim());
      // Nominatim: "123, Street, Neighbourhood, City, County, State, ZIP, USA"
      const candidate = parts.find((p, i) => i >= 2 && p && p.toLowerCase() !== city.toLowerCase() && !/^\d/.test(p) && p.length <= 40);
      if (candidate && candidate.toLowerCase() !== state.toLowerCase()) neighborhood = candidate;
    }
  }
  let campusId = input.campusId ?? null;
  let farFromCampus = false;
  if (campusId && !getCampus(campusId)) throw new ApiError('VALIDATION', 'Unknown campus', { fields: { campusId: 'unknown campus' } });
  if (!campusId) {
    const s = suggestCampus(lat, lng);
    if (s.suggested) campusId = s.suggested.id;
    else {
      campusId = s.nearest[0]?.id ?? fallbackCampusId ?? 'northwestern';
      farFromCampus = true;
    }
  } else {
    const c = getCampus(campusId)!;
    farFromCampus = haversineM({ lat, lng }, { lat: c.lat, lng: c.lng }) > 40_000;
  }
  city = city || getCampus(campusId)?.city || '';
  state = state || getCampus(campusId)?.state || '';
  return { lat, lng, precision, approx, campusId: campusId!, farFromCampus, city, state, zip, neighborhood };
}

/** Commute caches — walk 80 m/min, bike 250 m/min, shuttle = walk to the nearest stop + 3 min/km stop→campus (stop ≤ 1.2 km). */
export function computeCommute(campusId: string, lat: number, lng: number): { distanceM: number | null; walkMin: number | null; bikeMin: number | null; shuttleMin: number | null; stopId: string | null; stopM: number | null } {
  const campus = getCampus(campusId);
  if (!campus) return { distanceM: null, walkMin: null, bikeMin: null, shuttleMin: null, stopId: null, stopM: null };
  const distanceM = haversineM({ lat, lng }, { lat: campus.lat, lng: campus.lng });
  const ns = nearestStop(campusId, lat, lng, 3000);
  let shuttleMin: number | null = null;
  if (ns && ns.distanceM <= 1200) {
    const stopToCampus = haversineM({ lat: ns.stop.lat, lng: ns.stop.lng }, { lat: campus.lat, lng: campus.lng });
    shuttleMin = Math.ceil(ns.distanceM / 80) + Math.ceil((stopToCampus / 1000) * 3);
  }
  return { distanceM, walkMin: Math.ceil(distanceM / 80), bikeMin: Math.ceil(distanceM / 250), shuttleMin, stopId: ns?.stop.id ?? null, stopM: ns?.distanceM ?? null };
}
export function writeCommute(listingId: string, campusId: string, lat: number, lng: number): void {
  const c = computeCommute(campusId, lat, lng);
  q.run(
    'UPDATE listings SET distance_to_campus_m = ?, commute_walk_min = ?, commute_bike_min = ?, commute_shuttle_min = ?, nearest_stop_id = ?, nearest_stop_m = ? WHERE id = ?',
    [c.distanceM, c.walkMin, c.bikeMin, c.shuttleMin, c.stopId, c.stopM, listingId],
  );
}

// ------------------------------------------------------------------ create / update
const COLUMN_MAP: Partial<Record<keyof ListingUpdateInput, string>> = {
  title: 'title', description: 'description', listingType: 'listing_type', propertyType: 'property_type', hideExactAddress: 'hide_exact_address',
  neighborhood: 'neighborhood', priceCents: 'price_cents', depositCents: 'deposit_cents', utilitiesIncluded: 'utilities_included', utilitiesNote: 'utilities_note',
  utilitiesEstCents: 'utilities_est_cents', bedrooms: 'bedrooms', bathrooms: 'bathrooms', sqft: 'sqft', furnished: 'furnished', availableFrom: 'available_from',
  availableTo: 'available_to', minTermMonths: 'min_term_months', flexibleDates: 'flexible_dates', leaseType: 'lease_type', roommatesCount: 'roommates_count',
  genderPref: 'gender_pref', petsAllowed: 'pets_allowed', parking: 'parking', smokingAllowed: 'smoking_allowed',
};

export async function createListing(user: AuthUser, input: ListingInput): Promise<ListingRow> {
  const place = await resolvePlacement(input, user.campus_id);
  const id = uid();
  const t = nowIso();
  q.tx(() => {
    q.run(
      `INSERT INTO listings (id, owner_id, campus_id, title, description, listing_type, property_type, address_line1, address_line2, city, state, zip, country, lat, lng,
         geocode_precision, hide_exact_address, neighborhood, price_cents, deposit_cents, utilities_included, utilities_note, utilities_est_cents, bedrooms, bathrooms, sqft,
         furnished, available_from, available_to, min_term_months, flexible_dates, lease_type, roommates_count, gender_pref, pets_allowed, parking, smoking_allowed,
         status, moderation_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'US', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'ok', ?, ?)`,
      [
        id, user.id, place.campusId, input.title, input.description, input.listingType, input.propertyType, input.address.line1, input.address.line2 ?? null, place.city, place.state, place.zip,
        place.lat, place.lng, place.precision, input.hideExactAddress ? 1 : 0, place.neighborhood, input.priceCents, input.depositCents, input.utilitiesIncluded ? 1 : 0,
        input.utilitiesNote ?? null, input.utilitiesEstCents ?? null, input.bedrooms, input.bathrooms, input.sqft ?? null, input.furnished, input.availableFrom, input.availableTo ?? null,
        input.minTermMonths, input.flexibleDates ? 1 : 0, input.leaseType, input.roommatesCount, input.genderPref, input.petsAllowed ? 1 : 0, input.parking, input.smokingAllowed ? 1 : 0, t, t,
      ],
    );
    if (input.amenities) replaceAmenities(id, input.amenities);
    if (input.photos?.length) replacePhotos(id, user, input.photos);
    writeCommute(id, place.campusId, place.lat, place.lng);
  });
  return requireListingRow(id);
}

export async function updateListing(user: AuthUser, row: ListingRow, input: ListingUpdateInput): Promise<ListingRow> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [key, col] of Object.entries(COLUMN_MAP) as [keyof ListingUpdateInput, string][]) {
    const v = input[key];
    if (v === undefined) continue;
    sets.push(`${col} = ?`);
    params.push(typeof v === 'boolean' ? (v ? 1 : 0) : (v as string | number | null));
  }
  const addressChanged = !!input.address || input.lat !== undefined || input.lng !== undefined || (input.campusId !== undefined && input.campusId !== row.campus_id);
  let place: Placement | null = null;
  if (addressChanged) {
    const address = input.address ?? { line1: row.address_line1, line2: row.address_line2 ?? undefined, city: row.city, state: row.state, zip: row.zip ?? undefined };
    const sameAddress = !input.address || (input.address.line1 === row.address_line1 && input.address.city === row.city && input.address.state === row.state);
    place = await resolvePlacement(
      {
        address,
        lat: input.lat ?? (sameAddress ? row.lat : undefined),
        lng: input.lng ?? (sameAddress ? row.lng : undefined),
        geocodePrecision: input.geocodePrecision ?? (input.lat !== undefined ? 'manual' : sameAddress ? (row.geocode_precision as ListingInput['geocodePrecision']) : undefined),
        campusId: input.campusId ?? (sameAddress ? row.campus_id : undefined),
        neighborhood: input.neighborhood ?? row.neighborhood ?? undefined,
      },
      user.campus_id,
    );
    sets.push('address_line1 = ?', 'address_line2 = ?', 'city = ?', 'state = ?', 'zip = ?', 'lat = ?', 'lng = ?', 'geocode_precision = ?', 'campus_id = ?', 'neighborhood = ?');
    params.push(address.line1, address.line2 ?? null, place.city, place.state, place.zip, place.lat, place.lng, place.precision, place.campusId, place.neighborhood);
  }
  sets.push('updated_at = ?');
  params.push(nowIso());
  q.tx(() => {
    q.run(`UPDATE listings SET ${sets.join(', ')} WHERE id = ?`, [...params, row.id]);
    if (input.amenities) replaceAmenities(row.id, input.amenities);
    if (input.photos) replacePhotos(row.id, user, input.photos);
    if (place) writeCommute(row.id, place.campusId, place.lat, place.lng);
  });
  const updated = requireListingRow(row.id);
  if (updated.status === 'active') safeRecomputeMatches(updated.id);
  return updated;
}

export function replaceAmenities(listingId: string, amenities: string[]): string[] {
  const list = [...new Set(amenities)];
  q.tx(() => {
    q.run('DELETE FROM listing_amenities WHERE listing_id = ?', [listingId]);
    for (const a of list) q.run('INSERT INTO listing_amenities (listing_id, amenity) VALUES (?, ?)', [listingId, a]);
  });
  return list;
}

/** Replaces the photo set; order = array order; first photo becomes the cover. Uploads must be public images owned by the user (or seed/admin). */
export function replacePhotos(listingId: string, user: AuthUser, photos: { uploadId: string; caption?: string }[]): Photo[] {
  const ids = [...new Set(photos.map((p) => p.uploadId))];
  const uploads = ids.length ? q.all<{ id: string; owner_id: string | null; kind: string; is_private: number }>(`SELECT id, owner_id, kind, is_private FROM uploads WHERE id IN (${placeholders(ids.length)})`, ids) : [];
  const byId = new Map(uploads.map((u) => [u.id, u]));
  const fields: Record<string, string> = {};
  photos.forEach((p, i) => {
    const u = byId.get(p.uploadId);
    if (!u) fields[`photos.${i}.uploadId`] = 'unknown upload';
    else if (u.kind !== 'image' || u.is_private === 1) fields[`photos.${i}.uploadId`] = 'must be a public image';
    else if (u.owner_id && u.owner_id !== user.id && user.role !== 'admin') fields[`photos.${i}.uploadId`] = 'not your upload';
  });
  if (Object.keys(fields).length) throw new ApiError('VALIDATION', 'Invalid photos', { fields });
  const t = nowIso();
  q.tx(() => {
    q.run('DELETE FROM listing_photos WHERE listing_id = ?', [listingId]);
    const seen = new Set<string>();
    let order = 0;
    for (const p of photos) {
      if (seen.has(p.uploadId)) continue;
      seen.add(p.uploadId);
      q.run('INSERT INTO listing_photos (id, listing_id, upload_id, sort_order, caption, created_at) VALUES (?, ?, ?, ?, ?, ?)', [uid(), listingId, p.uploadId, order++, p.caption ?? null, t]);
    }
    q.run('UPDATE listings SET cover_upload_id = ?, updated_at = ? WHERE id = ?', [photos[0]?.uploadId ?? null, t, listingId]);
  });
  return listPhotos(listingId);
}

export function replaceAvailability(listingId: string, ranges: { startDate: string; endDate: string; status: Availability['status']; note?: string }[]): Availability[] {
  const sorted = [...ranges].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const fields: Record<string, string> = {};
  sorted.forEach((r, i) => {
    if (r.endDate < r.startDate) fields[`ranges.${i}.endDate`] = 'end before start';
    const prev = sorted[i - 1];
    if (prev && r.startDate <= prev.endDate) fields[`ranges.${i}.startDate`] = 'overlaps the previous range';
  });
  if (Object.keys(fields).length) throw new ApiError('VALIDATION', 'Availability ranges overlap', { fields });
  const t = nowIso();
  q.tx(() => {
    q.run('DELETE FROM listing_availability WHERE listing_id = ?', [listingId]);
    for (const r of sorted) q.run('INSERT INTO listing_availability (id, listing_id, start_date, end_date, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [uid(), listingId, r.startDate, r.endDate, r.status, r.note ?? null, t]);
    q.run('UPDATE listings SET updated_at = ? WHERE id = ?', [t, listingId]);
  });
  return listAvailability(listingId);
}

// ------------------------------------------------------------------ quota + state machine (DATA_MODEL §6.2)
export function listingQuota(user: AuthUser): number {
  if (user.role === 'admin' || isPro(user)) return Number.MAX_SAFE_INTEGER;
  if (user.role === 'landlord') return Math.max(user.listing_quota, 3);
  return user.listing_quota;
}
export function activeListingCount(ownerId: string, excludeId?: string): number {
  return q.count("SELECT COUNT(*) FROM listings WHERE owner_id = ? AND status = 'active' AND id != ?", [ownerId, excludeId ?? '']);
}

export function publishListing(user: AuthUser, row: ListingRow): ListingRow {
  if (!['draft', 'paused', 'rented', 'expired'].includes(row.status)) invalidState(row.status, 'active');
  const fields: Record<string, string> = {};
  if (row.photo_count < 1) fields.photos = 'at least one photo';
  if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) fields.lat = 'location required';
  if (row.price_cents <= 0) fields.priceCents = 'price required';
  if (Object.keys(fields).length) throw new ApiError('VALIDATION', 'Listing is not ready to publish', { fields });
  const quota = listingQuota(user);
  const current = activeListingCount(row.owner_id, row.id);
  if (current >= quota) throw new ApiError('QUOTA_EXCEEDED', 'Active listing quota reached', { data: { limit: quota, current } });
  const t = nowIso();
  const owner = q.get<{ trust_level: number }>('SELECT trust_level FROM users WHERE id = ?', [row.owner_id]);
  const base = Math.max(new Date(row.available_from + 'T00:00:00Z').getTime(), nowMs());
  const expiresAt = new Date(base + EXPIRY_DAYS * DAY).toISOString();
  q.tx(() => {
    q.run(
      "UPDATE listings SET status = 'active', published_at = COALESCE(published_at, ?), expires_at = ?, is_verified_listing = ?, rented_at = NULL, updated_at = ? WHERE id = ?",
      [t, expiresAt, (owner?.trust_level ?? 0) >= 2 ? 1 : 0, t, row.id],
    );
    if (row.status === 'draft' || row.status === 'rented' || row.status === 'expired') q.run('UPDATE listings SET published_at = ? WHERE id = ?', [t, row.id]);
    writeCommute(row.id, row.campus_id, row.lat, row.lng);
  });
  safeRecomputeMatches(row.id);
  return requireListingRow(row.id);
}
export function pauseListing(row: ListingRow): ListingRow {
  if (row.status !== 'active') invalidState(row.status, 'paused');
  q.run("UPDATE listings SET status = 'paused', updated_at = ? WHERE id = ?", [nowIso(), row.id]);
  return requireListingRow(row.id);
}
export function resumeListing(user: AuthUser, row: ListingRow): ListingRow {
  if (row.status !== 'paused') invalidState(row.status, 'active');
  const quota = listingQuota(user);
  const current = activeListingCount(row.owner_id, row.id);
  if (current >= quota) throw new ApiError('QUOTA_EXCEEDED', 'Active listing quota reached', { data: { limit: quota, current } });
  const t = nowIso();
  const expiresAt = row.expires_at && row.expires_at > t ? row.expires_at : new Date(nowMs() + RENEW_DAYS * DAY).toISOString();
  q.run("UPDATE listings SET status = 'active', expires_at = ?, updated_at = ? WHERE id = ?", [expiresAt, t, row.id]);
  return requireListingRow(row.id);
}
export function markRented(row: ListingRow): ListingRow {
  if (!['active', 'paused'].includes(row.status)) invalidState(row.status, 'rented');
  const t = nowIso();
  q.run("UPDATE listings SET status = 'rented', rented_at = ?, updated_at = ? WHERE id = ?", [t, t, row.id]);
  return requireListingRow(row.id);
}
export function renewListing(user: AuthUser, row: ListingRow): ListingRow {
  if (!['active', 'expired'].includes(row.status)) invalidState(row.status, 'active');
  if (row.status === 'expired') {
    const quota = listingQuota(user);
    const current = activeListingCount(row.owner_id, row.id);
    if (current >= quota) throw new ApiError('QUOTA_EXCEEDED', 'Active listing quota reached', { data: { limit: quota, current } });
  }
  const t = nowIso();
  const from = Math.max(nowMs(), row.expires_at ? new Date(row.expires_at).getTime() : 0);
  q.run("UPDATE listings SET status = 'active', expires_at = ?, updated_at = ? WHERE id = ?", [new Date(from + RENEW_DAYS * DAY).toISOString(), t, row.id]);
  return requireListingRow(row.id);
}
export function removeListing(row: ListingRow): void {
  if (row.status === 'removed') invalidState(row.status, 'removed');
  q.run("UPDATE listings SET status = 'removed', updated_at = ? WHERE id = ?", [nowIso(), row.id]);
}

/** wanted.recomputeForListing is another module's export; tolerate its stub during parallel work. */
function safeRecomputeMatches(listingId: string): void {
  void import('../wanted/service')
    .then((m) => m.recomputeForListing(listingId))
    .catch(() => undefined);
}

// ------------------------------------------------------------------ leads (DATA_MODEL §1: the ONLY writer of listing_leads)
export function recordLead(args: { listingId: string; userId: string; conversationId?: string | null; source: 'message' | 'wanted_offer' | 'escrow' | 'phone_reveal' }): { id: string; created: boolean } {
  const row = q.get<{ id: string; owner_id: string }>('SELECT id, owner_id FROM listings WHERE id = ?', [args.listingId]);
  if (!row) throw new ApiError('NOT_FOUND', 'Listing not found');
  if (row.owner_id === args.userId) return { id: '', created: false };
  const existing = q.get<LeadRow>('SELECT * FROM listing_leads WHERE listing_id = ? AND user_id = ?', [args.listingId, args.userId]);
  if (existing) {
    if (args.conversationId && !existing.conversation_id) q.run('UPDATE listing_leads SET conversation_id = ? WHERE id = ?', [args.conversationId, existing.id]);
    return { id: existing.id, created: false };
  }
  const id = uid();
  q.run('INSERT INTO listing_leads (id, listing_id, owner_id, user_id, conversation_id, source, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    id, args.listingId, row.owner_id, args.userId, args.conversationId ?? null, args.source, 'new', nowIso(),
  ]);
  return { id, created: true };
}

export function listingContextCard(id: string): ContextCard | null {
  const r = q.get<{ id: string; title: string; price_cents: number; neighborhood: string | null; city: string; state: string; status: string; bedrooms: number; bathrooms: number; cover_url: string | null }>(
    'SELECT l.id, l.title, l.price_cents, l.neighborhood, l.city, l.state, l.status, l.bedrooms, l.bathrooms, u.url AS cover_url FROM listings l LEFT JOIN uploads u ON u.id = l.cover_upload_id WHERE l.id = ?',
    [id],
  );
  if (!r) return null;
  const rooms = r.bedrooms === 0 ? 'Studio' : `${r.bedrooms}B${r.bathrooms}B`;
  return { type: 'listing', id: r.id, title: r.title, subtitle: [rooms, r.neighborhood, r.city].filter(Boolean).join(' · '), priceCents: r.price_cents, imageUrl: r.cover_url, link: `/listings/${r.id}`, status: r.status };
}

// ------------------------------------------------------------------ views, share
/** Logs listing.view once per viewer per 6 h and bumps view_count accordingly. */
export function recordView(req: Request, row: ListingRow): void {
  const viewer = { userId: req.user?.id ?? null, sessionId: req.sessionId ?? null };
  if (!viewer.userId && !viewer.sessionId) return;
  if (req.user?.id === row.owner_id) return;
  if (recentlyLogged(viewer, 'listing.view', 'listing', row.id, 6 * 3_600_000)) return;
  logEvent(req, 'listing.view', { entityType: 'listing', entityId: row.id, campusId: row.campus_id, props: { campusId: row.campus_id, priceCents: row.price_cents } });
  q.run('UPDATE listings SET view_count = view_count + 1 WHERE id = ?', [row.id]);
}
/** Tiny deterministic QR-looking SVG (not a real QR code — a scannable code would need a library; documented in docs/modules/listings.md). */
export function shareQrSvg(text: string, size = 160): string {
  const n = 21;
  const cell = size / n;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  const rects: string[] = [];
  const finder = (x: number, y: number) => {
    rects.push(`<rect x="${x * cell}" y="${y * cell}" width="${7 * cell}" height="${7 * cell}" fill="currentColor"/>`);
    rects.push(`<rect x="${(x + 1) * cell}" y="${(y + 1) * cell}" width="${5 * cell}" height="${5 * cell}" fill="var(--surface, #fff)"/>`);
    rects.push(`<rect x="${(x + 2) * cell}" y="${(y + 2) * cell}" width="${3 * cell}" height="${3 * cell}" fill="currentColor"/>`);
  };
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
  let s = h;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const inFinder = (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
      if (inFinder) continue;
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      if ((s >>> 16) & 1) rects.push(`<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="currentColor"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="share code">${rects.join('')}</svg>`;
}

// ------------------------------------------------------------------ expiry job helpers
/** Expires active listings past expires_at and tells owners; warns owners 3 days before expiry (once). Returns counts. */
export function runExpiry(): { expired: number; warned: number } {
  const t = nowIso();
  const expiring = q.all<{ id: string; owner_id: string; title: string }>("SELECT id, owner_id, title FROM listings WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?", [t]);
  for (const l of expiring) {
    q.run("UPDATE listings SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'active'", [t, l.id]);
    notify(l.owner_id, 'system', {
      title: { zh: '房源已到期', en: 'Your listing expired' },
      body: { zh: `「${l.title}」已下线，点击续期即可重新上线。`, en: `"${l.title}" is no longer visible. Renew it to go live again.` },
      link: `/listings/mine`, entityType: 'listing', entityId: l.id, data: { reason: 'expired' },
    });
  }
  const soon = new Date(nowMs() + 3 * DAY).toISOString();
  const warnRows = q.all<{ id: string; owner_id: string; title: string; expires_at: string }>(
    `SELECT id, owner_id, title, expires_at FROM listings l WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ? AND expires_at > ?
       AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = l.owner_id AND n.entity_type = 'listing' AND n.entity_id = l.id AND n.kind = 'system' AND n.data_json LIKE '%"expiring"%' AND n.created_at >= ?)`,
    [soon, t, new Date(nowMs() - 7 * DAY).toISOString()],
  );
  for (const l of warnRows) {
    notify(l.owner_id, 'system', {
      title: { zh: '房源 3 天后到期', en: 'Listing expires in 3 days' },
      body: { zh: `「${l.title}」即将到期，续期后再展示 30 天。`, en: `"${l.title}" expires soon. Renew for another 30 days.` },
      link: `/listings/mine`, entityType: 'listing', entityId: l.id, data: { reason: 'expiring' },
    });
  }
  return { expired: expiring.length, warned: warnRows.length };
}

export { fuzz, isAdmin };
