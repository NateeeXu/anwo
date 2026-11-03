// Client-side geo helpers shared by map components and modules.
// Distance *formatting* lives in `@/lib/i18n` (`formatDistance`) — do not duplicate it here.
import type { Campus } from '@shared/types';

export type LatLng = { lat: number; lng: number };
export type LatLngTuple = [lat: number, lng: number];
/** API bbox shape (`minLng,minLat,maxLng,maxLat`, DATA_MODEL.md §9.1). */
export type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

export const EARTH_RADIUS_M = 6371000;
/** Continental-US framing used by nationwide maps before any result arrives. */
export const US_CENTER: LatLngTuple = [39.5, -98.35];
export const US_ZOOM = 4;
/** Default zoom for a campus-scoped map (≈ 3 km radius on a 600 px wide map). */
export const CAMPUS_ZOOM = 14;

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function toLatLng(p: LatLng | LatLngTuple): LatLng {
  return Array.isArray(p) ? { lat: p[0], lng: p[1] } : p;
}

/** Great-circle distance in metres (same formula as the server's `lib/geo.ts`). */
export function haversineM(a: LatLng | LatLngTuple, b: LatLng | LatLngTuple): number {
  const p = toLatLng(a);
  const q = toLatLng(b);
  const dLat = toRad(q.lat - p.lat);
  const dLng = toRad(q.lng - p.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(p.lat)) * Math.cos(toRad(q.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Bounding box of a set of points, optionally padded by a ratio of its own size (0.1 = 10 %). `null` for an empty set. */
export function bboxOf(points: ReadonlyArray<LatLng | LatLngTuple>, padRatio = 0): Bbox | null {
  if (!points.length) return null;
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const raw of points) {
    const { lat, lng } = toLatLng(raw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  if (!Number.isFinite(minLat)) return null;
  // A single point still needs a usable box: pad by ~250 m.
  const padLat = Math.max((maxLat - minLat) * padRatio, maxLat === minLat ? 0.0022 : 0);
  const padLng = Math.max((maxLng - minLng) * padRatio, maxLng === minLng ? 0.003 : 0);
  return { minLat: minLat - padLat, maxLat: maxLat + padLat, minLng: minLng - padLng, maxLng: maxLng + padLng };
}

/** Square-ish bbox around a centre, `radiusM` metres to each side. */
export function bboxAround(center: LatLng | LatLngTuple, radiusM: number): Bbox {
  const { lat, lng } = toLatLng(center);
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.max(0.01, Math.cos(toRad(lat))));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

export function bboxCenter(b: Bbox): LatLng {
  return { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
}

export function bboxContains(b: Bbox, p: LatLng | LatLngTuple): boolean {
  const { lat, lng } = toLatLng(p);
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

/** Leaflet-style `[[south, west], [north, east]]` tuple for `fitBounds`. */
export function bboxToLeaflet(b: Bbox): [LatLngTuple, LatLngTuple] {
  return [[b.minLat, b.minLng], [b.maxLat, b.maxLng]];
}

/** Serialise for the `bbox` query param (`minLng,minLat,maxLng,maxLat`), 5 decimals (~1 m). */
export function bboxToParam(b: Bbox): string {
  const f = (v: number) => v.toFixed(5);
  return `${f(b.minLng)},${f(b.minLat)},${f(b.maxLng)},${f(b.maxLat)}`;
}

export function parseBbox(s: string | null | undefined): Bbox | null {
  if (!s) return null;
  const parts = s.split(',').map(Number);
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts;
  if (minLng > maxLng || minLat > maxLat) return null;
  return { minLng, minLat, maxLng, maxLat };
}

/** True when the bbox is wider than the server's 2°×2° limit (API.md §7: `BAD_REQUEST`). */
export function bboxTooLarge(b: Bbox, maxDeg = 2): boolean {
  return b.maxLat - b.minLat > maxDeg || b.maxLng - b.minLng > maxDeg;
}

/** Campus centre as a Leaflet tuple. Accepts the full DTO or anything with lat/lng. */
export function campusCenter(campus: Pick<Campus, 'lat' | 'lng'> | null | undefined): LatLngTuple {
  if (!campus || !Number.isFinite(campus.lat) || !Number.isFinite(campus.lng)) return US_CENTER;
  return [campus.lat, campus.lng];
}

/** Default framing of a campus: its `defaultRadiusM` (fallback 3 km) around the centre. */
export function campusBounds(campus: Pick<Campus, 'lat' | 'lng'> & { defaultRadiusM?: number | null }, radiusM?: number): Bbox {
  return bboxAround(campusCenter(campus), radiusM ?? campus.defaultRadiusM ?? 3000);
}

/** Approximate Leaflet zoom that shows `radiusM` around the centre in a map `widthPx` wide. */
export function zoomForRadius(radiusM: number, widthPx = 600, lat = 40): number {
  // metres per pixel at zoom z: 156543.03 * cos(lat) / 2^z
  const metersPerPx = (radiusM * 2) / widthPx;
  const z = Math.log2((156543.03 * Math.cos(toRad(lat))) / metersPerPx);
  return Math.max(3, Math.min(18, Math.round(z)));
}

/** Commute estimates mirror the server rules (DATA_MODEL.md §3.5): walk 80 m/min, bike 250 m/min. */
export function walkMinutes(distanceM: number): number {
  return Math.ceil(distanceM / 80);
}
export function bikeMinutes(distanceM: number): number {
  return Math.ceil(distanceM / 250);
}

/** Initial bearing in degrees (0 = north), for arrows along shuttle polylines. */
export function bearingDeg(a: LatLng | LatLngTuple, b: LatLng | LatLngTuple): number {
  const p = toLatLng(a);
  const q = toLatLng(b);
  const y = Math.sin(toRad(q.lng - p.lng)) * Math.cos(toRad(q.lat));
  const x = Math.cos(toRad(p.lat)) * Math.sin(toRad(q.lat)) - Math.sin(toRad(p.lat)) * Math.cos(toRad(q.lat)) * Math.cos(toRad(q.lng - p.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Nearest point of a list to `from` (e.g. nearest shuttle stop), with its distance. */
export function nearest<T extends LatLng>(from: LatLng | LatLngTuple, points: ReadonlyArray<T>): { point: T; distanceM: number } | null {
  let best: { point: T; distanceM: number } | null = null;
  for (const point of points) {
    const distanceM = haversineM(from, point);
    if (!best || distanceM < best.distanceM) best = { point, distanceM };
  }
  return best;
}
