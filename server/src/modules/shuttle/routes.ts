// server/src/modules/shuttle/routes.ts — OWNED BY THE `shuttle` MODULE AGENT.
// Mounted at /api/shuttle by server/src/app.ts. Contract: docs/API.md §8 (+ admin import/export, see docs/modules/shuttle.md).
import { Router } from 'express';
import { z } from 'zod';
import { idParam } from '@shared/schemas/common';
import {
  AdminAlertsQuery, AdminRequestsQuery, AlertCreateInput, AlertPatchInput, AlertsQuery, FavoriteParams, ImportInput, NearbyQuery, NextQuery,
  RequestInput, RequestPatchInput, RoutesQuery, StopsQuery, TimetableQuery,
} from '@shared/schemas/shuttle';
import type { ShuttleAlert } from '@shared/types';
import { q, uid } from '../../db';
import { audit } from '../../lib/audit';
import { isAdmin, requireAdmin, requireAuth } from '../../lib/auth';
import { getCampus, toCampusLite } from '../../lib/campuses';
import { ApiError, fail, notFound } from '../../lib/errors';
import { logEvent } from '../../lib/events';
import { parseBbox } from '../../lib/geo';
import { ok, pageWindow, paginated, parseBody, parseParams, parseQuery } from '../../lib/http';
import { notifyMany } from '../../lib/notify';
import { rateLimit } from '../../lib/ratelimit';
import { nowDate, nowIso } from '../../lib/time';
import {
  activeAlerts, buildTimetable, campusHasData, campusRoutes, campusStops, exportCampusRoutes, favoriteSet, importCampusRoutes, loadRoute, loadStop,
  localInfo, nextDeparturesAtStop, routeDepartures, routeDto, routeListDto, routeStops, routeStopsMany, routesByStop, serviceDayFor, stopsNear, stopsWithRoutes, toAlert, toRouteSummary, toStop,
  type AlertRow, type RequestRow, type StopRow,
} from './lib';

const router = Router();

function requireCampusOr404(campusId: string) {
  const campus = getCampus(campusId);
  if (!campus) throw notFound('Campus');
  return campus;
}

function campusPublic(c: NonNullable<ReturnType<typeof getCampus>>) {
  return {
    id: c.id, name: c.name, nameZh: c.nameZh, shortName: c.shortName, city: c.city, state: c.state, lat: c.lat, lng: c.lng, timezone: c.timezone,
    hasShuttle: c.hasShuttle, shuttleOfficialUrl: c.shuttleTrackerUrl ?? null, shuttleTrackerUrl: c.shuttleTrackerUrl ?? null,
  };
}

// ---------------------------------------------------------------- campus overview
router.get('/campus/:campusId', (req, res) => {
  const { campusId } = parseParams(req, z.object({ campusId: z.string().min(1).max(64) }));
  const campus = requireCampusOr404(campusId);
  const routeRows = campusRoutes(campus.id, true);
  const stopsByRoute = routeStopsMany(routeRows.map((r) => r.id));
  const stops = stopsWithRoutes(campusStops(campus.id, true));
  const favRoutes = favoriteSet(req.user?.id, 'route');
  const favStops = favoriteSet(req.user?.id, 'stop');
  const now = localInfo(campus.timezone);
  const request = req.user
    ? q.get<{ status: string }>('SELECT status FROM shuttle_requests WHERE campus_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1', [campus.id, req.user.id])
    : undefined;
  logEvent(req, 'shuttle.view', { entityType: 'campus', entityId: campus.id, campusId: campus.id, props: { hasData: routeRows.length > 0 } });
  ok(res, {
    campus: campusPublic(campus),
    routes: routeRows.map((r) => {
      const stops = stopsByRoute.get(r.id) ?? [];
      return { ...routeListDto(r, stops), favorited: favRoutes.has(r.id), runsToday: routeDepartures(r, stops, now.ymd, now.serviceDay).kind !== 'none' };
    }),
    stops: stops.map((s) => ({ ...s, favorited: favStops.has(s.id) })),
    alerts: activeAlerts(campus.id),
    serviceDayToday: now.serviceDay,
    nowLocal: now.hhmm,
    today: now.ymd,
    hasData: routeRows.length > 0,
    request: request ? { status: request.status } : undefined,
  });
});

// ---------------------------------------------------------------- routes
router.get('/routes', (req, res) => {
  const p = parseQuery(req, RoutesQuery);
  const campus = requireCampusOr404(p.campusId);
  const rows = campusRoutes(campus.id, p.activeOnly);
  const stopsByRoute = routeStopsMany(rows.map((r) => r.id));
  const fav = favoriteSet(req.user?.id, 'route');
  const now = localInfo(campus.timezone);
  ok(res, rows.map((r) => {
    const stops = stopsByRoute.get(r.id) ?? [];
    return { ...routeListDto(r, stops), favorited: fav.has(r.id), runsToday: routeDepartures(r, stops, now.ymd, now.serviceDay).kind !== 'none' };
  }));
});

router.get('/routes/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const row = loadRoute(id);
  if (!row || (row.is_active !== 1 && !isAdmin(req))) throw notFound('Route');
  const campus = requireCampusOr404(row.campus_id);
  const now = localInfo(campus.timezone);
  const stops = routeStops(row.id);
  const favStops = favoriteSet(req.user?.id, 'stop');
  const dto = routeDto(row, stops);
  logEvent(req, 'shuttle.route.view', { entityType: 'shuttle_route', entityId: row.id, campusId: row.campus_id });
  ok(res, {
    ...dto,
    stops: dto.stops.map((s) => ({ ...s, favorited: favStops.has(s.id) })),
    favorited: favoriteSet(req.user?.id, 'route').has(row.id),
    alerts: activeAlerts(row.campus_id, [row.id]),
    campus: campusPublic(campus),
    serviceDayToday: now.serviceDay,
    nowLocal: now.hhmm,
    today: now.ymd,
    runsToday: buildTimetable(row, now.ymd, now.serviceDay).kind !== 'none',
  });
});

router.get('/routes/:id/timetable', (req, res) => {
  const { id } = parseParams(req, idParam);
  const p = parseQuery(req, TimetableQuery);
  const row = loadRoute(id);
  if (!row) throw notFound('Route');
  const campus = requireCampusOr404(row.campus_id);
  const now = localInfo(campus.timezone);
  const date = p.date ?? now.ymd;
  const serviceDay = p.serviceDay ?? serviceDayFor(date);
  const table = buildTimetable(row, date, serviceDay);
  ok(res, { route: toRouteSummary(row), ...table, nowLocal: now.hhmm, isToday: date === now.ymd });
});

// ---------------------------------------------------------------- stops
router.get('/stops', (req, res) => {
  const p = parseQuery(req, StopsQuery);
  const campus = requireCampusOr404(p.campusId);
  if (p.near) {
    ok(res, stopsNear(campus.id, p.near.lat, p.near.lng, p.radiusM, 50));
    return;
  }
  let rows = campusStops(campus.id, true);
  if (p.bbox) {
    const [minLng, minLat, maxLng, maxLat] = parseBbox(p.bbox);
    rows = rows.filter((s) => s.lat >= minLat && s.lat <= maxLat && s.lng >= minLng && s.lng <= maxLng);
  }
  ok(res, stopsWithRoutes(rows));
});

router.get('/stops/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const stop = loadStop(id);
  if (!stop || stop.is_active !== 1) throw notFound('Stop');
  const campus = requireCampusOr404(stop.campus_id);
  const routes = routesByStop([stop.id]).get(stop.id) ?? [];
  ok(res, {
    ...toStop(stop),
    routes,
    alerts: activeAlerts(stop.campus_id, routes.map((r) => r.id)),
    favorited: favoriteSet(req.user?.id, 'stop').has(stop.id),
    campus: campusPublic(campus),
  });
});

router.get('/stops/:id/next', (req, res) => {
  const { id } = parseParams(req, idParam);
  const p = parseQuery(req, NextQuery);
  const stop = loadStop(id);
  if (!stop || stop.is_active !== 1) throw notFound('Stop');
  const campus = requireCampusOr404(stop.campus_id);
  const at = p.at ? new Date(p.at) : nowDate();
  const result = nextDeparturesAtStop(stop, campus, at, p.limit);
  if (!p.at) logEvent(req, 'shuttle.stop.view', { entityType: 'shuttle_stop', entityId: stop.id, campusId: stop.campus_id });
  ok(res, {
    stop: { ...toStop(stop), routes: result.routes },
    serviceDay: result.serviceDay,
    nowLocal: result.nowLocal,
    at: at.toISOString(),
    departures: result.departures,
    alerts: activeAlerts(stop.campus_id, result.routes.map((r) => r.id)),
  });
});

router.get('/nearby', (req, res) => {
  const p = parseQuery(req, NearbyQuery);
  const campus = requireCampusOr404(p.campusId);
  ok(res, { stops: stopsNear(campus.id, p.lat, p.lng, p.radiusM, p.limit) });
});

// ---------------------------------------------------------------- alerts (public)
router.get('/alerts', (req, res) => {
  const p = parseQuery(req, AlertsQuery);
  const campus = requireCampusOr404(p.campusId);
  if (p.includeInactive && isAdmin(req)) {
    ok(res, q.all<AlertRow>('SELECT * FROM shuttle_alerts WHERE campus_id = ? ORDER BY is_active DESC, starts_at DESC', [campus.id]).map(toAlert));
    return;
  }
  ok(res, activeAlerts(campus.id));
});

// ---------------------------------------------------------------- favorites
router.get('/favorites', requireAuth, (req, res) => {
  const userId = req.user!.id;
  const stopIds = [...favoriteSet(userId, 'stop')];
  const routeIds = [...favoriteSet(userId, 'route')];
  const stopRows = stopIds.length ? q.all<StopRow>(`SELECT * FROM shuttle_stops WHERE id IN (${stopIds.map(() => '?').join(',')}) AND is_active = 1`, stopIds) : [];
  const routeRows = routeIds.length ? q.all<Parameters<typeof routeListDto>[0]>(`SELECT * FROM shuttle_routes WHERE id IN (${routeIds.map(() => '?').join(',')}) AND is_active = 1 ORDER BY sort_order`, routeIds) : [];
  const stopsByRoute = routeStopsMany(routeRows.map((r) => r.id));
  ok(res, {
    stops: stopsWithRoutes(stopRows).map((s) => ({ ...s, favorited: true })),
    routes: routeRows.map((r) => ({ ...routeListDto(r, stopsByRoute.get(r.id) ?? []), favorited: true })),
  });
});

function assertFavoriteTarget(entityType: 'stop' | 'route', id: string): string {
  const row = entityType === 'stop' ? loadStop(id) : loadRoute(id);
  if (!row || row.is_active !== 1) throw notFound(entityType === 'stop' ? 'Stop' : 'Route');
  return row.campus_id;
}

router.put('/favorites/:entityType/:id', requireAuth, (req, res) => {
  const { entityType, id } = parseParams(req, FavoriteParams);
  const campusId = assertFavoriteTarget(entityType, id);
  q.run('INSERT OR IGNORE INTO shuttle_favorites (user_id, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?)', [req.user!.id, entityType, id, nowIso()]);
  logEvent(req, 'shuttle.favorite', { entityType: `shuttle_${entityType}`, entityId: id, campusId });
  ok(res, { favorited: true });
});

router.delete('/favorites/:entityType/:id', requireAuth, (req, res) => {
  const { entityType, id } = parseParams(req, FavoriteParams);
  q.run('DELETE FROM shuttle_favorites WHERE user_id = ? AND entity_type = ? AND entity_id = ?', [req.user!.id, entityType, id]);
  logEvent(req, 'shuttle.unfavorite', { entityType: `shuttle_${entityType}`, entityId: id });
  ok(res, { favorited: false });
});

// ---------------------------------------------------------------- "request my campus"
router.post('/requests', rateLimit('writes'), (req, res) => {
  const p = parseBody(req, RequestInput);
  const campus = requireCampusOr404(p.campusId);
  const hasData = campusHasData(campus.id);
  const userId = req.user?.id ?? null;
  const email = p.email || req.user?.email || null;
  if (userId && !hasData) {
    const existing = q.get<{ id: string; status: string }>('SELECT id, status FROM shuttle_requests WHERE campus_id = ? AND user_id = ? AND status IN (\'open\', \'planned\') ORDER BY created_at DESC LIMIT 1', [campus.id, userId]);
    if (existing) {
      ok(res, { id: existing.id, status: existing.status, duplicate: true });
      return;
    }
  }
  const id = uid();
  const status = hasData ? 'done' : 'open';
  q.insert('shuttle_requests', { id, campus_id: campus.id, user_id: userId, email, official_url: p.officialUrl || null, note: p.note || null, status, created_at: nowIso() });
  logEvent(req, 'shuttle.request', { entityType: 'campus', entityId: campus.id, campusId: campus.id, props: { status, hasUrl: Boolean(p.officialUrl) } });
  if (!hasData) {
    const admins = q.all<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND banned = 0").map((r) => r.id);
    notifyMany(admins, 'system', {
      title: { zh: `校车数据申请：${campus.nameZh ?? campus.name}`, en: `Shuttle data request: ${campus.name}` },
      body: { zh: p.note ? `备注：${p.note.slice(0, 120)}` : '有用户希望添加这个校区的校车数据。', en: p.note ? `Note: ${p.note.slice(0, 120)}` : 'A user asked for shuttle data for this campus.' },
      link: '/admin/shuttle?tab=requests',
      entityType: 'shuttle_request',
      entityId: id,
      data: { campusId: campus.id },
    });
  }
  ok(res, { id, status }, 201);
});

// ---------------------------------------------------------------- admin
const admin = Router();
admin.use(requireAdmin);

admin.get('/alerts', (req, res) => {
  const p = parseQuery(req, AdminAlertsQuery);
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (p.campusId) { where.push('campus_id = ?'); params.push(p.campusId); }
  if (!p.includeInactive) where.push('is_active = 1');
  const sql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const total = q.count(`SELECT COUNT(*) FROM shuttle_alerts${sql}`, params);
  const { limit, offset } = pageWindow(p);
  const rows = q.all<AlertRow>(`SELECT * FROM shuttle_alerts${sql} ORDER BY is_active DESC, starts_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const routeIds = rows.map((r) => r.route_id).filter((x): x is string => Boolean(x));
  const routeNames = new Map<string, { id: string; name: string; short_name: string | null; color: string }>();
  if (routeIds.length) for (const r of q.all<{ id: string; name: string; short_name: string | null; color: string }>(`SELECT id, name, short_name, color FROM shuttle_routes WHERE id IN (${routeIds.map(() => '?').join(',')})`, routeIds)) routeNames.set(r.id, r);
  const now = nowIso();
  ok(res, {
    items: rows.map((r) => ({
      ...toAlert(r),
      route: r.route_id && routeNames.has(r.route_id) ? toRouteSummary(routeNames.get(r.route_id)!) : null,
      campus: toCampusLite(r.campus_id),
      live: r.is_active === 1 && r.starts_at <= now && (!r.ends_at || r.ends_at > now),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    total, page: p.page, pageSize: p.pageSize,
  });
});

/** Users who favorited the route, one of its stops, or (campus-wide) anything on the campus. */
function alertAudience(campusId: string, routeId: string | null): string[] {
  const rows = routeId
    ? q.all<{ user_id: string }>(
        `SELECT DISTINCT f.user_id FROM shuttle_favorites f
         WHERE (f.entity_type = 'route' AND f.entity_id = ?)
            OR (f.entity_type = 'stop' AND f.entity_id IN (SELECT stop_id FROM shuttle_route_stops WHERE route_id = ?))`,
        [routeId, routeId],
      )
    : q.all<{ user_id: string }>(
        `SELECT DISTINCT f.user_id FROM shuttle_favorites f
         WHERE (f.entity_type = 'route' AND f.entity_id IN (SELECT id FROM shuttle_routes WHERE campus_id = ?))
            OR (f.entity_type = 'stop' AND f.entity_id IN (SELECT id FROM shuttle_stops WHERE campus_id = ?))`,
        [campusId, campusId],
      );
  return rows.map((r) => r.user_id);
}

function notifyAlert(alert: ShuttleAlert, routeName: string | null): number {
  const live = alert.isActive && alert.startsAt <= nowIso() && (!alert.endsAt || alert.endsAt > nowIso());
  if (!live) return 0;
  const audience = alertAudience(alert.campusId, alert.routeId);
  if (!audience.length) return 0;
  const prefix = routeName ? `${routeName}: ` : '';
  return notifyMany(audience, 'shuttle.alert', {
    title: { zh: `校车通知 · ${prefix}${alert.titleZh || alert.title}`, en: `Shuttle alert · ${prefix}${alert.title}` },
    body: alert.body || alert.bodyZh ? { zh: alert.bodyZh || alert.body || '', en: alert.body || alert.bodyZh || '' } : null,
    link: alert.routeId ? `/shuttle/${alert.routeId}` : '/shuttle',
    entityType: 'shuttle_alert',
    entityId: alert.id,
    data: { severity: alert.severity, campusId: alert.campusId, routeId: alert.routeId },
  });
}

admin.post('/alerts', (req, res) => {
  const p = parseBody(req, AlertCreateInput);
  const campus = requireCampusOr404(p.campusId);
  let routeName: string | null = null;
  if (p.routeId) {
    const route = loadRoute(p.routeId);
    if (!route || route.campus_id !== campus.id) throw new ApiError('VALIDATION', 'Route does not belong to this campus', { fields: { routeId: 'Route does not belong to this campus' } });
    routeName = route.name;
  }
  if (p.startsAt && p.endsAt && p.endsAt <= p.startsAt) throw new ApiError('VALIDATION', 'endsAt must be after startsAt', { fields: { endsAt: 'must be after start' } });
  const id = uid();
  const ts = nowIso();
  q.insert('shuttle_alerts', {
    id, campus_id: campus.id, route_id: p.routeId ?? null, severity: p.severity, title: p.title, title_zh: p.titleZh ?? null, body: p.body ?? null, body_zh: p.bodyZh ?? null,
    starts_at: p.startsAt ?? ts, ends_at: p.endsAt ?? null, is_active: 1, created_by: req.user!.id, created_at: ts, updated_at: ts,
  });
  const alert = toAlert(q.get<AlertRow>('SELECT * FROM shuttle_alerts WHERE id = ?', [id])!);
  const notified = notifyAlert(alert, routeName);
  audit(req, { action: 'shuttle.alert.create', entityType: 'shuttle_alert', entityId: id, after: alert });
  logEvent(req, 'shuttle.alert.create', { entityType: 'shuttle_alert', entityId: id, campusId: campus.id, props: { severity: p.severity, routeId: p.routeId ?? null, notified } });
  ok(res, { ...alert, notified }, 201);
});

admin.patch('/alerts/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const p = parseBody(req, AlertPatchInput);
  const row = q.get<AlertRow>('SELECT * FROM shuttle_alerts WHERE id = ?', [id]);
  if (!row) throw notFound('Alert');
  if (p.routeId) {
    const route = loadRoute(p.routeId);
    if (!route || route.campus_id !== row.campus_id) throw new ApiError('VALIDATION', 'Route does not belong to this campus', { fields: { routeId: 'Route does not belong to this campus' } });
  }
  const set: Record<string, string | number | null> = { updated_at: nowIso() };
  if (p.routeId !== undefined) set.route_id = p.routeId;
  if (p.severity !== undefined) set.severity = p.severity;
  if (p.title !== undefined) set.title = p.title;
  if (p.titleZh !== undefined) set.title_zh = p.titleZh;
  if (p.body !== undefined) set.body = p.body;
  if (p.bodyZh !== undefined) set.body_zh = p.bodyZh;
  if (p.startsAt !== undefined) set.starts_at = p.startsAt;
  if (p.endsAt !== undefined) set.ends_at = p.endsAt;
  if (p.isActive !== undefined) set.is_active = p.isActive ? 1 : 0;
  const startsAt = (set.starts_at as string | undefined) ?? row.starts_at;
  const endsAt = set.ends_at === undefined ? row.ends_at : (set.ends_at as string | null);
  if (endsAt && endsAt <= startsAt) throw new ApiError('VALIDATION', 'endsAt must be after startsAt', { fields: { endsAt: 'must be after start' } });
  q.update('shuttle_alerts', set, 'id = ?', [id]);
  const after = toAlert(q.get<AlertRow>('SELECT * FROM shuttle_alerts WHERE id = ?', [id])!);
  const action = p.isActive === false && row.is_active === 1 ? 'shuttle.alert.deactivate' : p.isActive === true && row.is_active === 0 ? 'shuttle.alert.activate' : 'shuttle.alert.update';
  audit(req, { action, entityType: 'shuttle_alert', entityId: id, before: toAlert(row), after });
  logEvent(req, action, { entityType: 'shuttle_alert', entityId: id, campusId: row.campus_id });
  ok(res, after);
});

admin.delete('/alerts/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const row = q.get<AlertRow>('SELECT * FROM shuttle_alerts WHERE id = ?', [id]);
  if (!row) throw notFound('Alert');
  q.run('DELETE FROM shuttle_alerts WHERE id = ?', [id]);
  audit(req, { action: 'shuttle.alert.delete', entityType: 'shuttle_alert', entityId: id, before: toAlert(row) });
  logEvent(req, 'shuttle.alert.delete', { entityType: 'shuttle_alert', entityId: id, campusId: row.campus_id });
  ok(res, null);
});

admin.get('/requests', (req, res) => {
  const p = parseQuery(req, AdminRequestsQuery);
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (p.status) { where.push('r.status = ?'); params.push(p.status); }
  if (p.campusId) { where.push('r.campus_id = ?'); params.push(p.campusId); }
  const sql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const total = q.count(`SELECT COUNT(*) FROM shuttle_requests r${sql}`, params);
  const { limit, offset } = pageWindow(p);
  const rows = q.all<RequestRow & { user_name: string | null }>(
    `SELECT r.*, u.name AS user_name FROM shuttle_requests r LEFT JOIN users u ON u.id = r.user_id${sql}
     ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END, r.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const counts = Object.fromEntries(q.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM shuttle_requests GROUP BY status').map((r) => [r.status, r.n]));
  paginated(res, { items: rows.map(requestDto), total, page: p.page, pageSize: p.pageSize }, { counts });
});

function requestDto(r: RequestRow & { user_name?: string | null }) {
  const campus = getCampus(r.campus_id);
  return {
    id: r.id, campus: toCampusLite(r.campus_id), campusName: campus?.name ?? r.campus_id, campusHasData: campusHasData(r.campus_id), userId: r.user_id, userName: r.user_name ?? null,
    email: r.email, officialUrl: r.official_url, note: r.note, status: r.status, createdAt: r.created_at,
  };
}

admin.patch('/requests/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const p = parseBody(req, RequestPatchInput);
  const row = q.get<RequestRow>('SELECT * FROM shuttle_requests WHERE id = ?', [id]);
  if (!row) throw notFound('Request');
  q.update('shuttle_requests', { status: p.status }, 'id = ?', [id]);
  audit(req, { action: 'shuttle.request.status', entityType: 'shuttle_request', entityId: id, before: { status: row.status }, after: { status: p.status } });
  if (row.user_id && (p.status === 'done' || p.status === 'planned') && row.status !== p.status) {
    const campus = getCampus(row.campus_id);
    const name = campus?.name ?? row.campus_id;
    notifyMany([row.user_id], 'system', {
      title: p.status === 'done'
        ? { zh: `${campus?.nameZh ?? name} 的校车数据已上线`, en: `Shuttle data for ${name} is live` }
        : { zh: `${campus?.nameZh ?? name} 的校车数据已排期`, en: `Shuttle data for ${name} is planned` },
      body: p.status === 'done' ? { zh: '谢谢你的申请，现在可以查看路线和站点了。', en: 'Thanks for asking — routes and stops are now available.' } : { zh: '我们正在整理官方时刻表，上线后会再通知你。', en: 'We are preparing the official timetable and will let you know.' },
      link: '/shuttle',
      entityType: 'shuttle_request',
      entityId: id,
    });
  }
  ok(res, requestDto({ ...row, status: p.status }));
});

admin.post('/import', (req, res) => {
  const p = parseBody(req, ImportInput);
  const campus = requireCampusOr404(p.campusId);
  let result;
  try {
    result = importCampusRoutes(campus.id, p.routes, { replace: p.replace });
  } catch (e) {
    throw fail('BAD_REQUEST', 400, (e as Error).message);
  }
  audit(req, { action: 'shuttle.import', entityType: 'campus', entityId: campus.id, after: { ...result, replace: p.replace } });
  logEvent(req, 'shuttle.import', { entityType: 'campus', entityId: campus.id, campusId: campus.id, props: { routes: result.routes, stops: result.stops, replace: p.replace } });
  // anyone who asked for this campus gets told it is live
  const openRequests = q.all<RequestRow>("SELECT * FROM shuttle_requests WHERE campus_id = ? AND status IN ('open', 'planned')", [campus.id]);
  for (const r of openRequests) {
    q.update('shuttle_requests', { status: 'done' }, 'id = ?', [r.id]);
    if (r.user_id) notifyMany([r.user_id], 'system', { title: { zh: `${campus.nameZh ?? campus.name} 的校车数据已上线`, en: `Shuttle data for ${campus.name} is live` }, link: '/shuttle', entityType: 'shuttle_request', entityId: r.id });
  }
  ok(res, { ...result, closedRequests: openRequests.length }, 201);
});

admin.get('/export/:campusId', (req, res) => {
  const { campusId } = parseParams(req, z.object({ campusId: z.string().min(1).max(64) }));
  const campus = requireCampusOr404(campusId);
  ok(res, exportCampusRoutes(campus.id));
});

router.use('/admin', admin);

export default router;
