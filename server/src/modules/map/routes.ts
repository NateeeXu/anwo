// server/src/modules/map/routes.ts — OWNED BY THE `map` MODULE AGENT. Mounted at /api/map (docs/API.md §7).
//
//   GET  /geocode            user, 30/min   forward geocode (cache → Nominatim → campus-centroid fallback) + campus suggestion
//   GET  /reverse            user           label for a point from local data (cache / POI / stop / nearest campus), no network
//   GET  /commute            public         walk / bike / shuttle estimate to a campus (commute_cache)
//   GET  /pois               public         campus POIs (category csv, bbox, q)
//   GET  /layers | /explore  public         every explore layer in one bbox call with per-layer counts
//   GET  /campus-suggest     public         nearest campuses for a point (≤ 40 km → suggested)
//   GET  /campus-stats       public         one bubble per campus with counts (nationwide mode)
//   GET  /campus/:id/bounds  public
//   POST /suggestions        user (L1+)     suggest a missing campus place → admin review queue (bell to admins)
//   GET  /suggestions/mine   user           my suggestions with review status
//   admin: /admin/pois (GET, POST, PATCH /:id, DELETE /:id), DELETE /admin/geocode-cache, GET /admin/stats,
//          GET /admin/suggestions, POST /admin/suggestions/:id/approve | /reject (suggester is notified)
import { Router } from 'express';
import { z } from 'zod';
import { idParam } from '@shared/schemas/common';
import { AdminPoisQuery, AdminSuggestionsQuery, CampusStatsQuery, CampusSuggestQuery, CommuteQuery, GeocodeCacheClearInput, GeocodeQuery, LayersQuery, PoiInput, PoiSuggestionInput, PoiUpdateInput, PoisQuery, ReverseQuery, SuggestionApproveInput, SuggestionRejectInput } from '@shared/schemas/map';
import type { GeocodeHit } from '@shared/schemas/map';
import { config } from '../../config';
import { q, uid, type SqlParam } from '../../db';
import { audit } from '../../lib/audit';
import { isAdmin, requireAdmin, requireAuth, requireTrust } from '../../lib/auth';
import { getCampus } from '../../lib/campuses';
import { ApiError, asyncHandler } from '../../lib/errors';
import { logEvent } from '../../lib/events';
import { suggestCampus } from '../../lib/geo';
import { ok, parseBody, parseParams, parseQuery } from '../../lib/http';
import { rateLimit } from '../../lib/ratelimit';
import { nowIso } from '../../lib/time';
import { approveSuggestion, campusBounds, campusStats, commuteCached, createSuggestion, findDuplicatePlace, geocode, getPoiRow, layersFor, listPois, listSuggestions, parseLayerBbox, pendingSuggestionCount, rejectSuggestion, reverseLocal, suggestionInCampusRange, toPoiDto } from './service';

const router = Router();

// ---------------------------------------------------------------- geocode (forward)
router.get('/geocode', requireAuth, rateLimit({ name: 'map-geocode', limit: 30, windowMs: 60_000 }), asyncHandler(async (req, res) => {
  const p = parseQuery(req, GeocodeQuery);
  const campusId = p.campusId ?? req.user?.campus_id ?? null;
  const campus = campusId ? getCampus(campusId) : null;
  const near = p.near ?? (campus ? { lat: campus.lat, lng: campus.lng } : undefined);
  const g = await geocode(p.q, { campusId, near });
  const hit: GeocodeHit = {
    lat: g.lat, lng: g.lng, displayName: g.displayName, addressLine1: g.addressLine1, city: g.city, state: g.state, zip: g.zip,
    precision: g.precision, approx: g.approx, campusSuggestion: suggestCampus(g.lat, g.lng),
  };
  logEvent(req, 'map.geocode', { entityType: 'campus', entityId: campusId, props: { cached: g.cached, approx: g.approx, precision: g.precision, len: p.q.length } });
  ok(res, { results: [hit], cached: g.cached, offline: config.geocodeOffline && !g.cached });
}));

// ---------------------------------------------------------------- reverse (local)
router.get('/reverse', requireAuth, (req, res) => {
  const p = parseQuery(req, ReverseQuery);
  ok(res, reverseLocal(p.lat, p.lng));
});

// ---------------------------------------------------------------- commute
router.get('/commute', (req, res) => {
  const p = parseQuery(req, CommuteQuery);
  const campusId = p.campusId ?? req.user?.campus_id ?? suggestCampus(p.lat, p.lng).nearest[0]?.id ?? null;
  if (!campusId) throw new ApiError('VALIDATION', 'campusId is required', { fields: { campusId: 'required' } });
  const est = commuteCached(campusId, p.lat, p.lng);
  if (!est) throw new ApiError('NOT_FOUND', 'Campus not found');
  if (!est.cached) logEvent(req, 'map.commute', { entityType: 'campus', entityId: campusId, props: { walkMin: est.walkMin, shuttle: est.shuttleMin !== null } });
  ok(res, est);
});

// ---------------------------------------------------------------- POIs
router.get('/pois', (req, res) => {
  const p = parseQuery(req, PoisQuery);
  const campusId = p.campusId ?? req.user?.campus_id ?? null;
  if (!campusId && !p.bbox) throw new ApiError('VALIDATION', 'campusId or bbox is required', { fields: { campusId: 'required' } });
  const bbox = p.bbox ? parseLayerBbox(p.bbox) : undefined;
  ok(res, listPois({ campusId, categories: p.category, bbox, q: p.q, limit: p.limit }));
});

// ---------------------------------------------------------------- layers (explore)
function layersHandler(req: Parameters<Parameters<typeof router.get>[1]>[0], res: Parameters<Parameters<typeof router.get>[1]>[1]) {
  const p = parseQuery(req, LayersQuery);
  const data = layersFor({ ...p, campusId: p.campusId ?? req.user?.campus_id ?? undefined }, { viewerId: req.user?.id ?? null, isAdmin: isAdmin(req) });
  if (p.source && p.source !== 'pan') {
    logEvent(req, 'map.explore', { entityType: 'campus', entityId: data.campusId, props: { source: p.source, layers: p.layers ?? 'all', counts: data.counts } });
  }
  res.setHeader('Cache-Control', 'private, max-age=15');
  ok(res, data);
}
router.get('/layers', layersHandler);
router.get('/explore', layersHandler);

// ---------------------------------------------------------------- campus helpers
router.get('/campus-suggest', (req, res) => {
  const p = parseQuery(req, CampusSuggestQuery);
  ok(res, suggestCampus(p.lat, p.lng));
});

router.get('/campus-stats', (req, res) => {
  const p = parseQuery(req, CampusStatsQuery);
  res.setHeader('Cache-Control', 'public, max-age=60');
  ok(res, campusStats({ bbox: p.bbox ? parseLayerBbox(p.bbox) : undefined }));
});

router.get('/campus/:id/bounds', (req, res) => {
  const { id } = parseParams(req, idParam);
  const campus = getCampus(id);
  if (!campus) throw new ApiError('NOT_FOUND', 'Campus not found');
  ok(res, campusBounds(campus));
});

// ---------------------------------------------------------------- suggestions (students → admin queue)
router.post('/suggestions', requireAuth, requireTrust(1), rateLimit({ name: 'map-suggest', limit: 10, windowMs: 60 * 60_000 }), (req, res) => {
  const body = parseBody(req, PoiSuggestionInput);
  const campus = getCampus(body.campusId);
  if (!campus) throw new ApiError('VALIDATION', 'Unknown campus', { fields: { campusId: 'unknown campus' } });
  if (!suggestionInCampusRange(campus, body.lat, body.lng)) throw new ApiError('VALIDATION', 'Place is too far from this campus', { fields: { lat: 'too far from campus' } });
  const dup = findDuplicatePlace(campus.id, body.name, body.lat, body.lng);
  if (dup) throw new ApiError('CONFLICT', dup.kind === 'poi' ? 'This place is already on the map' : 'Someone already suggested this place', { data: dup });
  const s = createSuggestion(req.user!.id, body);
  logEvent(req, 'map.poi_suggest', { entityType: 'poi_suggestion', entityId: s.id, campusId: campus.id, props: { category: body.category } });
  ok(res, s, 201);
});

router.get('/suggestions/mine', requireAuth, (req, res) => {
  ok(res, listSuggestions({ userId: req.user!.id, limit: 50 }));
});

// ---------------------------------------------------------------- admin
router.get('/admin/suggestions', requireAdmin, (req, res) => {
  const p = parseQuery(req, AdminSuggestionsQuery);
  ok(res, { items: listSuggestions({ status: p.status, campusId: p.campusId }), pending: pendingSuggestionCount() });
});

router.post('/admin/suggestions/:id/approve', requireAdmin, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, SuggestionApproveInput);
  const out = approveSuggestion(id, req.user!.id, body);
  audit(req, { action: 'poi_suggestion.approve', entityType: 'poi_suggestion', entityId: id, after: { poiId: out.poi.id, name: out.poi.name } });
  ok(res, out);
});

router.post('/admin/suggestions/:id/reject', requireAdmin, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, SuggestionRejectInput);
  const s = rejectSuggestion(id, req.user!.id, body.reason);
  audit(req, { action: 'poi_suggestion.reject', entityType: 'poi_suggestion', entityId: id, reason: body.reason });
  ok(res, s);
});

router.get('/admin/pois', requireAdmin, (req, res) => {
  const p = parseQuery(req, AdminPoisQuery);
  const rows = listPois({ campusId: p.campusId, categories: p.category ? [p.category] : undefined, q: p.q, includeInactive: p.includeInactive ?? true, limit: 500 });
  const active = new Set(q.all<{ id: string }>('SELECT id FROM pois WHERE is_active = 1').map((r) => r.id));
  ok(res, rows.map((r) => ({ ...r, isActive: active.has(r.id) })));
});

router.get('/admin/stats', requireAdmin, (_req, res) => {
  ok(res, {
    geocodeCache: {
      rows: q.count('SELECT COUNT(*) FROM geocode_cache'),
      forward: q.count(`SELECT COUNT(*) FROM geocode_cache WHERE kind = 'forward'`),
      reverse: q.count(`SELECT COUNT(*) FROM geocode_cache WHERE kind = 'reverse'`),
      failures: q.count(`SELECT COUNT(*) FROM geocode_cache WHERE precision = 'none'`),
      hits: q.scalar<number>('SELECT COALESCE(SUM(hit_count), 0) FROM geocode_cache') ?? 0,
    },
    commuteCache: q.count('SELECT COUNT(*) FROM commute_cache'),
    pois: { total: q.count('SELECT COUNT(*) FROM pois'), active: q.count('SELECT COUNT(*) FROM pois WHERE is_active = 1') },
    suggestions: { pending: pendingSuggestionCount() },
    byCampus: q.all<{ campusId: string; n: number }>('SELECT campus_id AS campusId, COUNT(*) AS n FROM pois WHERE is_active = 1 GROUP BY campus_id ORDER BY n DESC'),
    offline: config.geocodeOffline,
  });
});

router.post('/admin/pois', requireAdmin, (req, res) => {
  const body = parseBody(req, PoiInput);
  if (!getCampus(body.campusId)) throw new ApiError('VALIDATION', 'Unknown campus', { fields: { campusId: 'unknown campus' } });
  const id = uid();
  q.insert('pois', {
    id, campus_id: body.campusId, name: body.name, name_zh: body.nameZh ?? null, category: body.category, lat: body.lat, lng: body.lng,
    address: body.address ?? null, url: body.url || null, icon: body.icon ?? null, tags_json: JSON.stringify(body.tags), is_active: body.isActive ? 1 : 0,
    sort_order: body.sortOrder, created_at: nowIso(),
  });
  const row = getPoiRow(id)!;
  audit(req, { action: 'poi.create', entityType: 'poi', entityId: id, after: toPoiDto(row) });
  ok(res, toPoiDto(row), 201);
});

router.patch('/admin/pois/:id', requireAdmin, (req, res) => {
  const { id } = parseParams(req, idParam);
  const before = getPoiRow(id);
  if (!before) throw new ApiError('NOT_FOUND', 'POI not found');
  const body = parseBody(req, PoiUpdateInput);
  if (body.campusId && !getCampus(body.campusId)) throw new ApiError('VALIDATION', 'Unknown campus', { fields: { campusId: 'unknown campus' } });
  const patch: Record<string, SqlParam> = {};
  if (body.campusId !== undefined) patch.campus_id = body.campusId;
  if (body.name !== undefined) patch.name = body.name;
  if (body.nameZh !== undefined) patch.name_zh = body.nameZh;
  if (body.category !== undefined) patch.category = body.category;
  if (body.lat !== undefined) patch.lat = body.lat;
  if (body.lng !== undefined) patch.lng = body.lng;
  if (body.address !== undefined) patch.address = body.address;
  if (body.url !== undefined) patch.url = body.url || null;
  if (body.icon !== undefined) patch.icon = body.icon;
  if (body.tags !== undefined) patch.tags_json = JSON.stringify(body.tags);
  if (body.sortOrder !== undefined) patch.sort_order = body.sortOrder;
  if (body.isActive !== undefined) patch.is_active = body.isActive ? 1 : 0;
  if (Object.keys(patch).length) q.update('pois', patch, 'id = ?', [id]);
  const after = getPoiRow(id)!;
  audit(req, { action: 'poi.update', entityType: 'poi', entityId: id, before: toPoiDto(before), after: toPoiDto(after) });
  ok(res, { ...toPoiDto(after), isActive: after.is_active === 1 });
});

router.delete('/admin/pois/:id', requireAdmin, (req, res) => {
  const { id } = parseParams(req, idParam);
  const before = getPoiRow(id);
  if (!before) throw new ApiError('NOT_FOUND', 'POI not found');
  q.run('DELETE FROM pois WHERE id = ?', [id]);
  audit(req, { action: 'poi.delete', entityType: 'poi', entityId: id, before: toPoiDto(before) });
  ok(res, null);
});

router.delete('/admin/geocode-cache', requireAdmin, (req, res) => {
  const body = parseBody(req, GeocodeCacheClearInput.merge(z.object({})));
  const days = body.olderThanDays ?? 0;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const deleted = q.run('DELETE FROM geocode_cache WHERE created_at <= ?', [cutoff]).changes;
  const commute = days === 0 ? q.run('DELETE FROM commute_cache').changes : 0;
  audit(req, { action: 'map.cache_clear', entityType: 'geocode_cache', entityId: null, after: { deleted, commute, olderThanDays: days } });
  ok(res, { deleted: Number(deleted), commuteDeleted: Number(commute) });
});

export default router;
