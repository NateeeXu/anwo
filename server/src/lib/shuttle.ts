// Shuttle proximity used by listings (near-shuttle badge) and map commute — DATA_MODEL §3.5/§3.6.
//
//   nearestStop(lat, lng, campusId)  ===  nearestStop(campusId, lat, lng)  → { stop, distanceM } | null
//   commuteEstimate(campusId, lat, lng) → { distanceM, walkMin, bikeMin, shuttleMin, nearestStop }
import type { ShuttleStop } from '@shared/types';
import { q } from '../db';
import { getCampus } from './campuses';
import { bboxAround, haversineM } from './geo';

type StopRow = { id: string; campus_id: string; name: string; name_zh: string | null; code: string | null; lat: number; lng: number; address: string | null };
export function toStopDto(r: StopRow): ShuttleStop {
  return { id: r.id, campusId: r.campus_id, name: r.name, nameZh: r.name_zh, code: r.code, lat: r.lat, lng: r.lng, address: r.address };
}

export type NearestStop = { stop: ShuttleStop; distanceM: number };

export function nearestStop(a: number | string, b: number, c: string | number, maxM = 3000): NearestStop | null {
  const campusId = typeof a === 'string' ? a : (c as string);
  const lat = typeof a === 'string' ? b : a;
  const lng = typeof a === 'string' ? (c as number) : b;
  if (!campusId || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const box = bboxAround(lat, lng, maxM);
  const rows = q.all<StopRow>(
    'SELECT id, campus_id, name, name_zh, code, lat, lng, address FROM shuttle_stops WHERE campus_id = ? AND is_active = 1 AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?',
    [campusId, box.minLat, box.maxLat, box.minLng, box.maxLng],
  );
  let best: NearestStop | null = null;
  for (const r of rows) {
    const d = haversineM({ lat, lng }, { lat: r.lat, lng: r.lng });
    if (d <= maxM && (!best || d < best.distanceM)) best = { stop: toStopDto(r), distanceM: d };
  }
  return best;
}

export type CommuteEstimate = {
  distanceM: number;
  walkMin: number;
  bikeMin: number;
  shuttleMin: number | null;
  nearestStop: (ShuttleStop & { distanceM: number }) | null;
};
/** DATA_MODEL §3.5: walk 80 m/min, bike 250 m/min, shuttle = walk to stop + 5 min wait + stop→campus at 400 m/min (stop ≤ 800 m). */
export function commuteEstimate(campusId: string, lat: number, lng: number): CommuteEstimate | null {
  const campus = getCampus(campusId);
  if (!campus) return null;
  const distanceM = haversineM({ lat, lng }, { lat: campus.lat, lng: campus.lng });
  const walkMin = Math.ceil(distanceM / 80);
  const bikeMin = Math.ceil(distanceM / 250);
  const ns = nearestStop(campusId, lat, lng, 3000);
  let shuttleMin: number | null = null;
  if (ns && ns.distanceM <= 800) {
    const stopToCampus = haversineM({ lat: ns.stop.lat, lng: ns.stop.lng }, { lat: campus.lat, lng: campus.lng });
    shuttleMin = Math.ceil(ns.distanceM / 80) + 5 + Math.ceil(stopToCampus / 400);
  }
  return { distanceM, walkMin, bikeMin, shuttleMin, nearestStop: ns ? { ...ns.stop, distanceM: ns.distanceM } : null };
}
