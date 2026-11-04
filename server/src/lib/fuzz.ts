// Deterministic location fuzz (DATA_MODEL §3.1), dependency-free so db/index.ts can register it as the SQL function
// `anwo_fuzz(id, lat, lng, which)` (which 0 = lat, 1 = lng) — list endpoints filter / sort / measure distance on the
// same fuzzed point the card shows, so distances cannot be used to trilaterate a hidden address.
import { hash32 } from './ids';

const toRad = (d: number) => (d * Math.PI) / 180;
/** Deterministic fuzz ≤ 150 m for listings with hide_exact_address. */
export function fuzz(id: string, lat: number, lng: number, maxM = 150): { lat: number; lng: number } {
  const h = hash32(id);
  const angle = ((h & 0xffff) / 0xffff) * Math.PI * 2;
  const dist = 40 + (((h >>> 16) & 0xffff) / 0xffff) * (maxM - 40);
  const dLat = (dist * Math.cos(angle)) / 111_320;
  const dLng = (dist * Math.sin(angle)) / (111_320 * Math.max(0.05, Math.cos(toRad(lat))));
  return { lat: +(lat + dLat).toFixed(6), lng: +(lng + dLng).toFixed(6) };
}
/** Distances shown to viewers without exact access are bucketed to this many metres. */
export const FUZZ_DISTANCE_BUCKET_M = 100;
export function bucketDistance(m: number | null | undefined): number | null {
  if (m === null || m === undefined || !Number.isFinite(m)) return null;
  return Math.max(FUZZ_DISTANCE_BUCKET_M, Math.round(m / FUZZ_DISTANCE_BUCKET_M) * FUZZ_DISTANCE_BUCKET_M);
}
