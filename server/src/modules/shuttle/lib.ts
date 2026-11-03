// server/src/modules/shuttle/lib.ts — OWNED BY THE `shuttle` MODULE AGENT.
// Data access + schedule maths shared by routes.ts, service.ts and the seed/import code.
//
// Two kinds of routes (DATA_MODEL §3.6):
//   timetable-based — rows in shuttle_schedule (one per stop × departure), optionally with valid_from/valid_to;
//   headway-based   — no schedule rows for that service day: departures are synthesised from
//                     first_departure + k × headway_min (≤ last_departure) plus each stop's minutes_from_start.
// All times are campus-local 'HH:MM' (may exceed 24:00 for after-midnight trips of the same service day).
import type { ServiceDay } from '@shared/enums';
import { isHoliday } from '@shared/holidays';
import type { Campus, ShuttleAlert, ShuttleDeparture, ShuttleRoute, ShuttleStop } from '@shared/types';
import { parseJson, placeholders, q, uid } from '../../db';
import { getCampus } from '../../lib/campuses';
import { bboxAround, haversineM } from '../../lib/geo';
import { nowDate, nowIso } from '../../lib/time';

// ---------------------------------------------------------------- rows
export type RouteRow = {
  id: string; campus_id: string; name: string; short_name: string | null; color: string; description: string | null;
  polyline_json: string; service_days_json: string; first_departure: string | null; last_departure: string | null;
  headway_min: number | null; official_url: string | null; is_approximate: number; is_active: number; sort_order: number;
};
export type StopRow = {
  id: string; campus_id: string; name: string; name_zh: string | null; code: string | null; lat: number; lng: number;
  address: string | null; is_active: number;
};
export type RouteStopRow = StopRow & { route_id: string; sequence: number; minutes_from_start: number };
export type ScheduleRow = { id: string; route_id: string; stop_id: string; service_day: ServiceDay; departure_time: string; trip_index: number | null; valid_from: string | null; valid_to: string | null };
export type AlertRow = {
  id: string; campus_id: string; route_id: string | null; severity: ShuttleAlert['severity']; title: string; title_zh: string | null;
  body: string | null; body_zh: string | null; starts_at: string; ends_at: string | null; is_active: number; created_by: string | null; created_at: string; updated_at: string;
};
export type RequestRow = { id: string; campus_id: string; user_id: string | null; email: string | null; official_url: string | null; note: string | null; status: string; created_at: string };

export type RouteSummary = Pick<ShuttleRoute, 'id' | 'name' | 'shortName' | 'color'>;
export type RouteWithoutStops = Omit<ShuttleRoute, 'stops'> & { stopCount: number; stopIds: string[] };

// ---------------------------------------------------------------- time helpers
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}
export function fromMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
/** 'HH:MM' with hours ≥ 24 folded into the next calendar day for display (`25:10` → `01:10`). */
export function clockTime(hhmm: string): string {
  const min = toMinutes(hhmm);
  return fromMinutes(min % 1440);
}

const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type LocalInfo = { ymd: string; hhmm: string; minutes: number; dow: (typeof DOW_KEYS)[number]; serviceDay: ServiceDay; date: Date };

/** Campus-local calendar facts for an instant (defaults to the dev-clock "now"). */
export function localInfo(timeZone: string, at: Date = nowDate()): LocalInfo {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const ymd = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = Number(get('hour')) % 24; // some ICU builds print 24 at midnight
  const minute = Number(get('minute'));
  const dow = get('weekday').slice(0, 3).toLowerCase() as (typeof DOW_KEYS)[number];
  const minutes = hour * 60 + minute;
  return { ymd, hhmm: fromMinutes(minutes), minutes, dow, serviceDay: serviceDayFor(ymd, dow), date: at };
}

export function serviceDayFor(ymd: string, dow?: string): ServiceDay {
  if (isHoliday(ymd)) return 'holiday';
  const d = dow ?? DOW_KEYS[new Date(`${ymd}T12:00:00Z`).getUTCDay()];
  if (d === 'sat') return 'saturday';
  if (d === 'sun') return 'sunday';
  return 'weekday';
}

/** Calendar day before a 'YYYY-MM-DD'. */
export function previousYmd(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
/** Weekday key of a 'YYYY-MM-DD'. */
export function dowOf(ymd: string): (typeof DOW_KEYS)[number] {
  return DOW_KEYS[new Date(`${ymd}T12:00:00Z`).getUTCDay()];
}

/** Does the route offer service on that calendar day? service_days_json holds mon…sun (+ 'holiday'). */
export function routeRunsOn(route: Pick<RouteRow, 'service_days_json'>, ymd: string, serviceDay: ServiceDay): boolean {
  const days = parseJson<string[]>(route.service_days_json, []);
  if (serviceDay === 'holiday') return days.includes('holiday');
  return days.includes(dowOf(ymd));
}

// ---------------------------------------------------------------- DTOs
export function toStop(r: StopRow): ShuttleStop {
  return { id: r.id, campusId: r.campus_id, name: r.name, nameZh: r.name_zh, code: r.code, lat: r.lat, lng: r.lng, address: r.address };
}
export function toRouteBase(r: RouteRow): Omit<ShuttleRoute, 'stops'> {
  return {
    id: r.id,
    campusId: r.campus_id,
    name: r.name,
    shortName: r.short_name,
    color: r.color,
    description: r.description,
    polyline: parseJson<[number, number][]>(r.polyline_json, []),
    serviceDays: parseJson<string[]>(r.service_days_json, []),
    firstDeparture: r.first_departure,
    lastDeparture: r.last_departure,
    headwayMin: r.headway_min,
    officialUrl: r.official_url,
    isApproximate: r.is_approximate === 1,
    isActive: r.is_active === 1,
  };
}
export function toRouteSummary(r: Pick<RouteRow, 'id' | 'name' | 'short_name' | 'color'>): RouteSummary {
  return { id: r.id, name: r.name, shortName: r.short_name, color: r.color };
}
export function toAlert(r: AlertRow): ShuttleAlert {
  return {
    id: r.id, campusId: r.campus_id, routeId: r.route_id, severity: r.severity, title: r.title, titleZh: r.title_zh,
    body: r.body, bodyZh: r.body_zh, startsAt: r.starts_at, endsAt: r.ends_at, isActive: r.is_active === 1,
  };
}

// ---------------------------------------------------------------- queries
export function loadRoute(id: string): RouteRow | undefined {
  return q.get<RouteRow>('SELECT * FROM shuttle_routes WHERE id = ?', [id]);
}
export function loadStop(id: string): StopRow | undefined {
  return q.get<StopRow>('SELECT * FROM shuttle_stops WHERE id = ?', [id]);
}
export function campusRoutes(campusId: string, activeOnly = true): RouteRow[] {
  return q.all<RouteRow>(`SELECT * FROM shuttle_routes WHERE campus_id = ?${activeOnly ? ' AND is_active = 1' : ''} ORDER BY sort_order, name`, [campusId]);
}
export function campusStops(campusId: string, activeOnly = true): StopRow[] {
  return q.all<StopRow>(`SELECT * FROM shuttle_stops WHERE campus_id = ?${activeOnly ? ' AND is_active = 1' : ''} ORDER BY name`, [campusId]);
}
export function routeStops(routeId: string): RouteStopRow[] {
  return q.all<RouteStopRow>(
    'SELECT s.*, rs.route_id, rs.sequence, rs.minutes_from_start FROM shuttle_route_stops rs JOIN shuttle_stops s ON s.id = rs.stop_id WHERE rs.route_id = ? ORDER BY rs.sequence',
    [routeId],
  );
}
/** routeId → ordered stops, for many routes in one query. */
export function routeStopsMany(routeIds: string[]): Map<string, RouteStopRow[]> {
  const map = new Map<string, RouteStopRow[]>();
  if (!routeIds.length) return map;
  const rows = q.all<RouteStopRow>(
    `SELECT s.*, rs.route_id, rs.sequence, rs.minutes_from_start FROM shuttle_route_stops rs JOIN shuttle_stops s ON s.id = rs.stop_id WHERE rs.route_id IN (${placeholders(routeIds.length)}) ORDER BY rs.route_id, rs.sequence`,
    routeIds,
  );
  for (const r of rows) {
    const list = map.get(r.route_id) ?? [];
    list.push(r);
    map.set(r.route_id, list);
  }
  return map;
}
/** stopId → route summaries (active routes only). */
export function routesByStop(stopIds: string[]): Map<string, RouteSummary[]> {
  const map = new Map<string, RouteSummary[]>();
  if (!stopIds.length) return map;
  const rows = q.all<{ stop_id: string; id: string; name: string; short_name: string | null; color: string }>(
    `SELECT rs.stop_id, r.id, r.name, r.short_name, r.color FROM shuttle_route_stops rs JOIN shuttle_routes r ON r.id = rs.route_id
     WHERE rs.stop_id IN (${placeholders(stopIds.length)}) AND r.is_active = 1 ORDER BY r.sort_order, r.name`,
    stopIds,
  );
  for (const r of rows) {
    const list = map.get(r.stop_id) ?? [];
    list.push(toRouteSummary(r));
    map.set(r.stop_id, list);
  }
  return map;
}

export function routeDto(r: RouteRow, stops: RouteStopRow[] = routeStops(r.id)): ShuttleRoute {
  return { ...toRouteBase(r), stops: stops.map((s) => ({ ...toStop(s), sequence: s.sequence, minutesFromStart: s.minutes_from_start })) };
}
export function routeListDto(r: RouteRow, stops: RouteStopRow[]): RouteWithoutStops {
  return { ...toRouteBase(r), stopCount: stops.length, stopIds: stops.map((s) => s.id) };
}

export function stopsWithRoutes(rows: StopRow[]): ShuttleStop[] {
  const byStop = routesByStop(rows.map((r) => r.id));
  return rows.map((r) => ({ ...toStop(r), routes: byStop.get(r.id) ?? [] }));
}

export function campusHasData(campusId: string): boolean {
  return q.count('SELECT COUNT(*) FROM shuttle_routes WHERE campus_id = ? AND is_active = 1', [campusId]) > 0;
}

export function activeAlerts(campusId: string, routeIds?: string[], at: string = nowIso()): ShuttleAlert[] {
  const params: unknown[] = [campusId, at, at];
  let routeSql = '';
  if (routeIds && routeIds.length) {
    routeSql = ` AND (route_id IS NULL OR route_id IN (${placeholders(routeIds.length)}))`;
    params.push(...routeIds);
  }
  return q
    .all<AlertRow>(
      `SELECT * FROM shuttle_alerts WHERE campus_id = ? AND is_active = 1 AND starts_at <= ? AND (ends_at IS NULL OR ends_at > ?)${routeSql}
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, starts_at DESC`,
      params as (string | number)[],
    )
    .map(toAlert);
}

export function favoriteSet(userId: string | null | undefined, entityType: 'stop' | 'route'): Set<string> {
  if (!userId) return new Set();
  return new Set(q.all<{ entity_id: string }>('SELECT entity_id FROM shuttle_favorites WHERE user_id = ? AND entity_type = ?', [userId, entityType]).map((r) => r.entity_id));
}

// ---------------------------------------------------------------- schedule maths
export type StopDeparture = { time: string; minutes: number; tripIndex: number | null };

/** Schedule rows of one route valid on `ymd` for `serviceDay`, grouped by stop. Empty map = headway route (or no service). */
export function scheduleByStop(routeId: string, serviceDay: ServiceDay, ymd: string): Map<string, StopDeparture[]> {
  const rows = q.all<ScheduleRow>(
    `SELECT * FROM shuttle_schedule WHERE route_id = ? AND service_day = ? AND (valid_from IS NULL OR valid_from <= ?) AND (valid_to IS NULL OR valid_to >= ?) ORDER BY departure_time`,
    [routeId, serviceDay, ymd, ymd],
  );
  const map = new Map<string, StopDeparture[]>();
  for (const r of rows) {
    const list = map.get(r.stop_id) ?? [];
    list.push({ time: r.departure_time, minutes: toMinutes(r.departure_time), tripIndex: r.trip_index });
    map.set(r.stop_id, list);
  }
  return map;
}

/** Does the route have *any* timetable rows for this service day (regardless of validity)? Used to tell seasonal routes from headway routes. */
export function hasTimetable(routeId: string, serviceDay: ServiceDay): boolean {
  return q.count('SELECT COUNT(*) FROM shuttle_schedule WHERE route_id = ? AND service_day = ?', [routeId, serviceDay]) > 0;
}

/** Headway synthesis: first + k·headway (≤ last) at the first stop, offset by minutes_from_start at every other stop. */
export function synthesizeHeadway(route: RouteRow, stops: RouteStopRow[]): Map<string, StopDeparture[]> {
  const map = new Map<string, StopDeparture[]>();
  if (!route.headway_min || !route.first_departure || !route.last_departure) return map;
  const first = toMinutes(route.first_departure);
  const last = toMinutes(route.last_departure);
  if (last < first) return map;
  let trip = 0;
  for (let t = first; t <= last && trip < 400; t += route.headway_min, trip++) {
    for (const s of stops) {
      const min = t + s.minutes_from_start;
      const list = map.get(s.id) ?? [];
      list.push({ time: fromMinutes(min), minutes: min, tripIndex: trip });
      map.set(s.id, list);
    }
  }
  return map;
}

/**
 * Departures of a route on a given calendar day, grouped by stop. Returns `kind` so the UI can label
 * seasonal timetables ("no service today") differently from a headway loop.
 */
export function routeDepartures(route: RouteRow, stops: RouteStopRow[], ymd: string, serviceDay: ServiceDay = serviceDayFor(ymd)): { byStop: Map<string, StopDeparture[]>; kind: 'timetable' | 'headway' | 'none' } {
  const timetable = scheduleByStop(route.id, serviceDay, ymd);
  if (timetable.size) return { byStop: timetable, kind: 'timetable' };
  if (hasTimetable(route.id, serviceDay)) return { byStop: timetable, kind: 'none' }; // timetable exists but is out of its valid window
  if (!routeRunsOn(route, ymd, serviceDay)) return { byStop: new Map(), kind: 'none' };
  const synthesized = synthesizeHeadway(route, stops);
  return { byStop: synthesized, kind: synthesized.size ? 'headway' : 'none' };
}

export type Timetable = {
  serviceDay: ServiceDay;
  date: string;
  kind: 'timetable' | 'headway' | 'none';
  stops: (ShuttleStop & { sequence: number; minutesFromStart: number })[];
  trips: { tripIndex: number; departures: { stopId: string; time: string }[] }[];
};

export function buildTimetable(route: RouteRow, ymd: string, serviceDay: ServiceDay): Timetable {
  const stops = routeStops(route.id);
  const { byStop, kind } = routeDepartures(route, stops, ymd, serviceDay);
  // group by trip index; rows without trip_index are bucketed by their position in the sorted first-stop list
  const trips = new Map<number, { stopId: string; time: string }[]>();
  for (const s of stops) {
    const deps = byStop.get(s.id) ?? [];
    deps.forEach((d, i) => {
      const idx = d.tripIndex ?? i;
      const list = trips.get(idx) ?? [];
      list.push({ stopId: s.id, time: d.time });
      trips.set(idx, list);
    });
  }
  const sorted = [...trips.entries()]
    .sort((a, b) => toMinutes(a[1][0]!.time) - toMinutes(b[1][0]!.time))
    .map(([tripIndex, departures]) => ({ tripIndex, departures }));
  return {
    serviceDay,
    date: ymd,
    kind,
    stops: stops.map((s) => ({ ...toStop(s), sequence: s.sequence, minutesFromStart: s.minutes_from_start })),
    trips: sorted,
  };
}

/** Next departures at one stop across all active routes serving it (campus-local clock; after-midnight trips of the previous service day included before 04:00). */
export function nextDeparturesAtStop(stop: StopRow, campus: Campus, at: Date, limit: number): { serviceDay: ServiceDay; nowLocal: string; departures: ShuttleDeparture[]; routes: RouteSummary[] } {
  const now = localInfo(campus.timezone, at);
  const routes = q.all<RouteRow>(
    'SELECT r.* FROM shuttle_route_stops rs JOIN shuttle_routes r ON r.id = rs.route_id WHERE rs.stop_id = ? AND r.is_active = 1 ORDER BY r.sort_order',
    [stop.id],
  );
  const stopsByRoute = routeStopsMany(routes.map((r) => r.id));
  const out: (ShuttleDeparture & { minutes: number })[] = [];
  const consider = (ymd: string, serviceDay: ServiceDay, offsetMin: number) => {
    for (const r of routes) {
      const { byStop } = routeDepartures(r, stopsByRoute.get(r.id) ?? [], ymd, serviceDay);
      for (const d of byStop.get(stop.id) ?? []) {
        const inMinutes = d.minutes - offsetMin - now.minutes;
        if (inMinutes < 0 || inMinutes > 24 * 60) continue;
        out.push({ routeId: r.id, routeName: r.name, routeColor: r.color, time: clockTime(d.time), inMinutes, tripIndex: d.tripIndex, minutes: d.minutes - offsetMin });
      }
    }
  };
  consider(now.ymd, now.serviceDay, 0);
  if (now.minutes < 4 * 60) {
    const prev = previousYmd(now.ymd);
    consider(prev, serviceDayFor(prev), 1440); // yesterday's 25:10 is today's 01:10
  }
  out.sort((a, b) => a.minutes - b.minutes || a.routeName.localeCompare(b.routeName));
  return { serviceDay: now.serviceDay, nowLocal: now.hhmm, departures: out.slice(0, limit).map(({ minutes: _m, ...d }) => d), routes: routes.map(toRouteSummary) };
}

// ---------------------------------------------------------------- proximity
export function stopsNear(campusId: string, lat: number, lng: number, radiusM: number, limit: number): (ShuttleStop & { distanceM: number; walkMin: number })[] {
  const box = bboxAround(lat, lng, radiusM);
  const rows = q.all<StopRow>(
    'SELECT * FROM shuttle_stops WHERE campus_id = ? AND is_active = 1 AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?',
    [campusId, box.minLat, box.maxLat, box.minLng, box.maxLng],
  );
  const withD = rows
    .map((r) => ({ row: r, d: haversineM({ lat, lng }, { lat: r.lat, lng: r.lng }) }))
    .filter((x) => x.d <= radiusM)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit);
  const byStop = routesByStop(withD.map((x) => x.row.id));
  return withD.map(({ row, d }) => ({ ...toStop(row), routes: byStop.get(row.id) ?? [], distanceM: Math.round(d), walkMin: Math.max(1, Math.ceil(d / 80)) }));
}

// ---------------------------------------------------------------- import (admin + seed)
export type ImportStopInput = { key?: string; name: string; nameZh?: string | null; code?: string | null; lat: number; lng: number; address?: string | null; minutesFromStart?: number };
export type ImportTimetableInput = { serviceDay: ServiceDay; departures: string[]; validFrom?: string | null; validTo?: string | null };
export type ImportRouteInput = {
  name: string; shortName?: string | null; color?: string; description?: string | null; polyline?: [number, number][]; serviceDays?: string[];
  firstDeparture?: string | null; lastDeparture?: string | null; headwayMin?: number | null; officialUrl?: string | null; isApproximate?: boolean; isActive?: boolean; sortOrder?: number;
  stops: ImportStopInput[]; timetable?: ImportTimetableInput[];
};
export type ImportResult = { campusId: string; routes: number; stops: number; scheduleRows: number; routeIds: string[] };

/** Neutral per-campus route palette (never a school brand color — DESIGN §3.1 keeps one chromatic hue for the UI itself). */
export const ROUTE_PALETTE = ['#2A5D8F', '#1E7245', '#8A5200', '#6B3FA0', '#B42318', '#0E7490', '#4D5B2F', '#7A3E65'];

/** Idempotent import: stops dedupe by `key` (or name) within the campus, routes by name. `replace` wipes the campus's routes/stops/schedule first. */
export function importCampusRoutes(campusId: string, routes: ImportRouteInput[], opts: { replace?: boolean; idPrefix?: string } = {}): ImportResult {
  const campus = getCampus(campusId);
  if (!campus) throw new Error(`unknown campus ${campusId}`);
  const prefix = opts.idPrefix ?? '';
  const makeId = (kind: string, key: string) => (prefix ? `${prefix}${kind}-${campusId}-${slug(key)}` : uid());
  let scheduleRows = 0;
  const routeIds: string[] = [];
  const stopIds = new Set<string>();
  q.tx(() => {
    if (opts.replace) {
      // Routes and stops are matched by name below and updated in place, so their ids stay stable for alerts,
      // favorites and listings.nearest_stop_id; whatever the payload no longer mentions is removed afterwards.
      q.run('DELETE FROM shuttle_schedule WHERE route_id IN (SELECT id FROM shuttle_routes WHERE campus_id = ?)', [campusId]);
      q.run('DELETE FROM shuttle_route_stops WHERE route_id IN (SELECT id FROM shuttle_routes WHERE campus_id = ?)', [campusId]);
    }
    const stopByKey = new Map<string, string>();
    for (const r of q.all<StopRow>('SELECT * FROM shuttle_stops WHERE campus_id = ?', [campusId])) stopByKey.set(r.name.toLowerCase(), r.id);
    routes.forEach((route, idx) => {
      const existing = q.get<{ id: string }>('SELECT id FROM shuttle_routes WHERE campus_id = ? AND name = ?', [campusId, route.name]);
      const routeId = existing?.id ?? makeId('route', route.name);
      const row = {
        campus_id: campusId,
        name: route.name,
        short_name: route.shortName ?? null,
        color: route.color ?? ROUTE_PALETTE[idx % ROUTE_PALETTE.length]!,
        description: route.description ?? null,
        polyline_json: JSON.stringify(route.polyline ?? route.stops.map((s) => [s.lat, s.lng])),
        service_days_json: JSON.stringify(route.serviceDays ?? ['mon', 'tue', 'wed', 'thu', 'fri']),
        first_departure: route.firstDeparture ?? null,
        last_departure: route.lastDeparture ?? null,
        headway_min: route.headwayMin ?? null,
        official_url: route.officialUrl ?? campus.shuttleTrackerUrl ?? null,
        is_approximate: route.isApproximate === false ? 0 : 1,
        is_active: route.isActive === false ? 0 : 1,
        sort_order: route.sortOrder ?? idx,
        updated_at: nowIso(),
      };
      if (existing) {
        q.update('shuttle_routes', row, 'id = ?', [routeId]);
        q.run('DELETE FROM shuttle_schedule WHERE route_id = ?', [routeId]);
        q.run('DELETE FROM shuttle_route_stops WHERE route_id = ?', [routeId]);
      } else {
        q.insert('shuttle_routes', { id: routeId, ...row });
      }
      routeIds.push(routeId);
      const orderedStopIds: { id: string; minutesFromStart: number }[] = [];
      route.stops.forEach((s, seq) => {
        const key = (s.key ?? s.name).toLowerCase();
        let stopId = stopByKey.get(key) ?? stopByKey.get(s.name.toLowerCase());
        if (!stopId) {
          stopId = makeId('stop', s.key ?? s.name);
          q.insert('shuttle_stops', { id: stopId, campus_id: campusId, name: s.name, name_zh: s.nameZh ?? null, code: s.code ?? null, lat: s.lat, lng: s.lng, address: s.address ?? null, is_active: 1 });
          stopByKey.set(key, stopId);
          stopByKey.set(s.name.toLowerCase(), stopId);
        } else {
          const patch: Record<string, string | number | null> = { lat: s.lat, lng: s.lng, is_active: 1 };
          if (s.nameZh !== undefined) patch.name_zh = s.nameZh;
          if (s.code !== undefined) patch.code = s.code;
          if (s.address !== undefined) patch.address = s.address;
          q.update('shuttle_stops', patch, 'id = ?', [stopId]);
        }
        stopIds.add(stopId);
        q.run('INSERT INTO shuttle_route_stops (route_id, stop_id, sequence, minutes_from_start) VALUES (?, ?, ?, ?)', [routeId, stopId, seq, s.minutesFromStart ?? 0]);
        orderedStopIds.push({ id: stopId, minutesFromStart: s.minutesFromStart ?? 0 });
      });
      for (const block of route.timetable ?? []) {
        block.departures.forEach((dep, tripIndex) => {
          const base = toMinutes(dep);
          for (const s of orderedStopIds) {
            q.insert('shuttle_schedule', {
              id: uid(), route_id: routeId, stop_id: s.id, service_day: block.serviceDay, departure_time: fromMinutes(base + s.minutesFromStart),
              trip_index: tripIndex, valid_from: block.validFrom ?? null, valid_to: block.validTo ?? null,
            });
            scheduleRows++;
          }
        });
      }
    });
    if (opts.replace) {
      const staleRoutes = q.all<{ id: string }>('SELECT id FROM shuttle_routes WHERE campus_id = ?', [campusId]).map((r) => r.id).filter((id) => !routeIds.includes(id));
      if (staleRoutes.length) q.run(`DELETE FROM shuttle_routes WHERE id IN (${placeholders(staleRoutes.length)})`, staleRoutes);
      const stale = q.all<{ id: string }>('SELECT id FROM shuttle_stops WHERE campus_id = ?', [campusId]).map((r) => r.id).filter((id) => !stopIds.has(id));
      if (stale.length) q.run(`DELETE FROM shuttle_stops WHERE id IN (${placeholders(stale.length)})`, stale);
    }
  });
  return { campusId, routes: routeIds.length, stops: stopIds.size, scheduleRows, routeIds };
}

/** Inverse of `importCampusRoutes` — the campus's shuttle system as the import JSON shape (for admin export / round-trips). */
export function exportCampusRoutes(campusId: string): { campusId: string; routes: ImportRouteInput[] } {
  const routes = campusRoutes(campusId, false);
  const stopsByRoute = routeStopsMany(routes.map((r) => r.id));
  return {
    campusId,
    routes: routes.map((r) => {
      const base = toRouteBase(r);
      const stops = stopsByRoute.get(r.id) ?? [];
      const timetable: ImportTimetableInput[] = [];
      const rows = q.all<ScheduleRow>('SELECT * FROM shuttle_schedule WHERE route_id = ? AND stop_id = ? ORDER BY service_day, departure_time', [r.id, stops[0]?.id ?? '']);
      const groups = new Map<string, ImportTimetableInput>();
      for (const row of rows) {
        const key = `${row.service_day}|${row.valid_from ?? ''}|${row.valid_to ?? ''}`;
        const g = groups.get(key) ?? { serviceDay: row.service_day, departures: [], validFrom: row.valid_from, validTo: row.valid_to };
        g.departures.push(row.departure_time);
        groups.set(key, g);
      }
      timetable.push(...groups.values());
      return {
        name: base.name, shortName: base.shortName, color: base.color, description: base.description, polyline: base.polyline, serviceDays: base.serviceDays,
        firstDeparture: base.firstDeparture, lastDeparture: base.lastDeparture, headwayMin: base.headwayMin, officialUrl: base.officialUrl,
        isApproximate: base.isApproximate, isActive: base.isActive, sortOrder: r.sort_order,
        stops: stops.map((s) => ({ key: s.id, name: s.name, nameZh: s.name_zh, code: s.code, lat: s.lat, lng: s.lng, address: s.address, minutesFromStart: s.minutes_from_start })),
        timetable: timetable.length ? timetable : undefined,
      };
    }),
  };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
