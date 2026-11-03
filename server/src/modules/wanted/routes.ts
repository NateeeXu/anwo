// server/src/modules/wanted/routes.ts — OWNED BY THE `wanted` MODULE AGENT. Mounted at /api/wanted (API.md §4).
import { Router, type Request } from 'express';
import { z } from 'zod';
import { AreasInput, ContactInput, ForMeQuery, MatchesQuery, MineQuery, OfferInput, WantedInput, WantedListQuery, WantedPatchInput, type AreaInput } from '@shared/schemas/wanted';
import { ReportInput, idParam } from '@shared/schemas/common';
import type { Match } from '@shared/types';
import { q, placeholders, uid } from '../../db';
import { ok, paginated, pageWindow, parseBody, parseParams, parseQuery } from '../../lib/http';
import { ApiError, invalidState, notFound } from '../../lib/errors';
import { assertOwner, isAdmin, requireAdmin, requireAuth, requireTrust } from '../../lib/auth';
import { checkRate } from '../../lib/ratelimit';
import { scopeFromQuery, scopeInfo, haversineM, type ResolvedScope } from '../../lib/geo';
import { campusesInCity, getCampus, requireCampus } from '../../lib/campuses';
import { wantedCards, type WantedCardRow } from '../../lib/cards';
import { logEvent, recentlyLogged } from '../../lib/events';
import { createReport } from '../../lib/reports';
import { notify } from '../../lib/notify';
import { audit } from '../../lib/audit';
import { contextCardFor, isBlockedEither, openConversation, postContextCard, postMessage } from '../../lib/conversations';
import { nowIso, HOUR } from '../../lib/time';
import { logger } from '../../lib/logger';
import * as listingsService from '../listings/service';
import {
  buildDigest, listingCardMap, loadAreas, loadMatch, loadWanted, matchesForUser, recomputeForWanted, scorePair, seekersForListing,
  toMatchDto, toWantedDto, wantedCardMap, type AreaRow, type MatchRow, type WantedRow,
} from './service';
import { addDays } from './matching';

const router = Router();

// ------------------------------------------------------------------ helpers
const EXPIRES_AFTER_DAYS = 14;

function loadOrThrow(id: string, req: Request, opts: { allowHidden?: boolean } = {}): WantedRow {
  const w = loadWanted(id);
  if (!w) return notFound('Wanted post');
  const owner = req.user && (req.user.id === w.user_id || isAdmin(req));
  if (!owner && !opts.allowHidden && (w.status === 'removed' || w.moderation_status === 'hidden')) return notFound('Wanted post');
  return w;
}

function insertAreas(wantedId: string, areas: AreaInput[]): AreaRow[] {
  q.run('DELETE FROM wanted_areas WHERE wanted_id = ?', [wantedId]);
  areas.forEach((a, i) => {
    const row: AreaRow = {
      id: uid(), wanted_id: wantedId, label: a.label, kind: a.kind,
      lat: a.kind === 'circle' ? a.lat : null, lng: a.kind === 'circle' ? a.lng : null, radius_m: a.kind === 'circle' ? a.radiusM : null,
      city: a.kind === 'city' ? a.city : null, state: a.kind === 'city' ? a.state : null,
      campus_id: a.kind === 'campus' ? requireCampus(a.campusId).id : null, sort_order: i,
    };
    q.insert('wanted_areas', row as unknown as Record<string, string | number | null>);
  });
  return loadAreas(wantedId);
}

/** Campus-scoped browse also surfaces nationwide posts whose areas cover the campus (city, campus or circle within reach). */
function wantedScopeWhere(s: ResolvedScope): { sql: string; params: (string | number)[] } {
  const params: (string | number)[] = [];
  // subquery over wanted_posts w2 + its areas a: posts "covering" any of the given campuses / cities / centers
  const covering = (campusIds: string[], cities: { city: string; state: string }[], centers: { lat: number; lng: number }[]): string | null => {
    const ors: string[] = [];
    if (campusIds.length) {
      ors.push(`w2.campus_id IN (${placeholders(campusIds.length)})`, `(a.kind = 'campus' AND a.campus_id IN (${placeholders(campusIds.length)}))`);
      params.push(...campusIds, ...campusIds);
    }
    for (const c of cities) {
      ors.push(`(a.kind = 'city' AND a.city = ? COLLATE NOCASE AND a.state = ? COLLATE NOCASE)`);
      params.push(c.city, c.state);
    }
    for (const c of centers) {
      ors.push(`(a.kind = 'circle' AND a.lat IS NOT NULL AND abs(a.lat - ?) * 111320.0 <= a.radius_m + 3000 AND abs(a.lng - ?) * 111320.0 * cos(radians(?)) <= a.radius_m + 3000)`);
      params.push(c.lat, c.lng, c.lat);
    }
    return ors.length ? `w.id IN (SELECT w2.id FROM wanted_posts w2 LEFT JOIN wanted_areas a ON a.wanted_id = w2.id WHERE ${ors.join(' OR ')})` : null;
  };
  let clause: string | null = null;
  if (s.bbox) {
    const [minLng, minLat, maxLng, maxLat] = s.bbox;
    const inBox = q.all<{ id: string }>('SELECT id FROM campuses WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?', [minLat, maxLat, minLng, maxLng]).map((r) => r.id);
    clause = `(w.id IN (SELECT a.wanted_id FROM wanted_areas a WHERE a.kind = 'circle' AND a.lat BETWEEN ? AND ? AND a.lng BETWEEN ? AND ?)${inBox.length ? ` OR w.campus_id IN (${placeholders(inBox.length)})` : ''})`;
    params.push(minLat, maxLat, minLng, maxLng, ...inBox);
  } else if (s.center && s.radiusM) {
    const center = s.center;
    const radiusM = s.radiusM;
    const near = q.all<{ id: string; lat: number; lng: number }>('SELECT id, lat, lng FROM campuses').filter((c) => haversineM(c, center) <= radiusM).map((c) => c.id);
    clause = covering(near, [], [center]) ?? '0';
  } else if (s.city && s.state) {
    clause = covering(campusesInCity(s.city, s.state).map((c) => c.id), [{ city: s.city, state: s.state }], []);
  } else if (s.scope === 'campus' && s.campus) {
    const c = s.campus;
    clause = covering([c.id], [{ city: c.city, state: c.state }], [{ lat: c.lat, lng: c.lng }]);
  }
  return { sql: clause ? ' AND ' + clause : '', params };
}

function recordLeadSafe(args: { listingId: string; userId: string; conversationId: string | null; source: 'message' | 'wanted_offer' }): void {
  try {
    listingsService.recordLead(args);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'NOT_IMPLEMENTED') logger.debug({ listingId: args.listingId }, 'listings.recordLead not implemented yet — lead not recorded');
    else logger.warn({ err: e }, 'listings.recordLead failed');
  }
}

function matchListFor(wantedId: string, p: { minScore: number; status?: string[]; page: number; pageSize: number }, viewerId: string) {
  const where: string[] = ['m.wanted_id = ?', 'm.score >= ?'];
  const params: (string | number)[] = [wantedId, p.minScore];
  if (p.status?.length) {
    where.push(`m.status IN (${placeholders(p.status.length)})`);
    params.push(...p.status);
  } else {
    where.push("m.status <> 'dismissed'");
  }
  where.push("(l.status = 'active' OR m.status IN ('offered','contacted'))");
  const { limit, offset } = pageWindow(p);
  const total = q.count(`SELECT COUNT(*) FROM matches m JOIN listings l ON l.id = m.listing_id WHERE ${where.join(' AND ')}`, params);
  const rows = q.all<MatchRow>(`SELECT m.* FROM matches m JOIN listings l ON l.id = m.listing_id WHERE ${where.join(' AND ')} ORDER BY m.score DESC, l.published_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const listings = listingCardMap(rows.map((r) => r.listing_id), viewerId);
  const items: Match[] = rows.map((m) => toMatchDto(m, { listing: listings.get(m.listing_id) }));
  return { items, total, page: p.page, pageSize: p.pageSize };
}

// ------------------------------------------------------------------ static routes first (Express 5)
router.get('/mine', requireAuth, (req, res) => {
  const p = parseQuery(req, MineQuery);
  const where = ['w.user_id = ?', "w.status <> 'removed'"];
  const params: (string | number)[] = [req.user!.id];
  if (p.status?.length) {
    where.push(`w.status IN (${placeholders(p.status.length)})`);
    params.push(...p.status);
  }
  const { limit, offset } = pageWindow(p);
  const total = q.count(`SELECT COUNT(*) FROM wanted_posts w WHERE ${where.join(' AND ')}`, params);
  const rows = q.all<WantedRow>(`SELECT w.* FROM wanted_posts w WHERE ${where.join(' AND ')} ORDER BY CASE w.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, w.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  paginated(res, { items: rows.map((r) => toWantedDto(r)), total, page: p.page, pageSize: p.pageSize });
});

router.get('/matches/for-me', requireAuth, (req, res) => {
  const p = parseQuery(req, ForMeQuery);
  ok(res, { byWanted: matchesForUser(req.user!.id, { limit: p.limit }) });
});

router.get('/matches/for-listing/:listingId', requireAuth, (req, res) => {
  const { listingId } = parseParams(req, z.object({ listingId: z.string().min(1) }));
  const l = q.get<{ owner_id: string }>('SELECT owner_id FROM listings WHERE id = ?', [listingId]);
  if (!l) return notFound('Listing');
  assertOwner(req, l.owner_id);
  ok(res, seekersForListing(listingId));
});

router.get('/digest/preview', requireAuth, (req, res) => {
  const digest = buildDigest(req.user!.id);
  ok(res, { ...digest, optIn: req.user!.email_digest_opt_in === 1 });
});

// admin moderation list (used by features/wanted/admin.tsx)
router.get('/admin/list', requireAdmin, (req, res) => {
  const p = parseQuery(req, MineQuery.extend({ q: z.string().max(80).optional(), moderation: z.enum(['ok', 'flagged', 'hidden']).optional() }));
  const where: string[] = ['1 = 1'];
  const params: (string | number)[] = [];
  if (p.status?.length) { where.push(`w.status IN (${placeholders(p.status.length)})`); params.push(...p.status); }
  if (p.moderation) { where.push('w.moderation_status = ?'); params.push(p.moderation); }
  if (p.q) { where.push('(w.title LIKE ? OR w.description LIKE ?)'); params.push(`%${p.q}%`, `%${p.q}%`); }
  const { limit, offset } = pageWindow(p);
  const total = q.count(`SELECT COUNT(*) FROM wanted_posts w WHERE ${where.join(' AND ')}`, params);
  const rows = q.all<WantedRow>(`SELECT w.* FROM wanted_posts w WHERE ${where.join(' AND ')} ORDER BY w.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const items = rows.map((r) => ({ ...toWantedDto(r), moderationStatus: r.moderation_status, reportCount: q.count("SELECT COUNT(*) FROM reports WHERE entity_type = 'wanted' AND entity_id = ? AND status IN ('open','in_review')", [r.id]) }));
  paginated(res, { items, total, page: p.page, pageSize: p.pageSize });
});

router.post('/admin/:id/moderate', requireAdmin, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, z.object({ moderationStatus: z.enum(['ok', 'flagged', 'hidden']), reason: z.string().max(500).optional() }));
  const w = loadWanted(id);
  if (!w) return notFound('Wanted post');
  q.run('UPDATE wanted_posts SET moderation_status = ?, updated_at = ? WHERE id = ?', [body.moderationStatus, nowIso(), id]);
  audit(req, { action: 'wanted.moderate', entityType: 'wanted', entityId: id, before: { moderationStatus: w.moderation_status }, after: { moderationStatus: body.moderationStatus }, reason: body.reason ?? null });
  if (body.moderationStatus === 'hidden') q.run("DELETE FROM matches WHERE wanted_id = ? AND status IN ('new','seen')", [id]);
  else if (w.moderation_status === 'hidden') recomputeForWanted(id, { notify: 'none' });
  ok(res, { ...toWantedDto(loadWanted(id)!), moderationStatus: body.moderationStatus });
});

// ------------------------------------------------------------------ browse
router.get('/', (req, res) => {
  const p = parseQuery(req, WantedListQuery);
  const scope = scopeFromQuery(req, p, { requireCampus: !p.authorId });
  const where: string[] = ["w.status = 'active'", "w.moderation_status = 'ok'"];
  const params: (string | number)[] = [];
  if (p.authorId) {
    where.push('w.user_id = ?');
    params.push(p.authorId);
  } else {
    const ws = wantedScopeWhere(scope);
    if (ws.sql) { where.push(ws.sql.slice(5)); params.push(...ws.params); }
  }
  if (p.q) {
    where.push('(w.title LIKE ? OR w.description LIKE ?)');
    params.push(`%${p.q}%`, `%${p.q}%`);
  }
  if (p.budgetMin !== undefined) { where.push('w.budget_max_cents >= ?'); params.push(p.budgetMin); }
  if (p.budgetMax !== undefined) { where.push('w.budget_min_cents <= ?'); params.push(p.budgetMax); }
  if (p.moveInFrom) { where.push('w.move_in_to >= ?'); params.push(p.moveInFrom); }
  if (p.moveInTo) { where.push('w.move_in_from <= ?'); params.push(p.moveInTo); }
  if (p.groupSize !== undefined) { where.push('w.group_size = ?'); params.push(p.groupSize); }
  if (p.groupSizeMin !== undefined) { where.push('w.group_size >= ?'); params.push(p.groupSizeMin); }
  if (p.bedroomsMin !== undefined) { where.push('w.bedrooms_min >= ?'); params.push(p.bedroomsMin); }
  if (p.furnishedPref) { where.push('w.furnished_pref = ?'); params.push(p.furnishedPref); }
  if (p.genderPref) { where.push('w.gender_pref = ?'); params.push(p.genderPref); }
  if (p.hasPets !== undefined) { where.push('w.has_pets = ?'); params.push(p.hasPets ? 1 : 0); }
  const sort = p.sort === 'relevance' && !p.q ? 'recent' : p.sort;
  const order = {
    recent: 'w.created_at DESC',
    budget_desc: 'w.budget_max_cents DESC, w.created_at DESC',
    budget_asc: 'w.budget_max_cents ASC, w.created_at DESC',
    move_in: 'w.move_in_from ASC, w.created_at DESC',
    relevance: `(CASE WHEN w.title LIKE ? THEN 3 ELSE 0 END + CASE WHEN w.description LIKE ? THEN 1 ELSE 0 END) * (1.0 / (1 + (julianday('now') - julianday(w.created_at)) / 30)) DESC, w.created_at DESC`,
  }[sort];
  const orderParams = sort === 'relevance' ? [`%${p.q}%`, `%${p.q}%`] : [];
  const { limit, offset } = pageWindow(p);
  const total = q.count(`SELECT COUNT(*) FROM wanted_posts w WHERE ${where.join(' AND ')}`, params);
  const rows = q.all<WantedCardRow>(`SELECT w.* FROM wanted_posts w WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, ...orderParams, limit, offset]);
  if (p.q) logEvent(req, 'search', { props: { module: 'wanted', q: p.q, total } });
  paginated(res, { items: wantedCards(rows), total, page: p.page, pageSize: p.pageSize }, { scope: scopeInfo(scope) });
});

// ------------------------------------------------------------------ create
router.post('/', requireAuth, requireTrust(1), (req, res) => {
  const body = parseBody(req, WantedInput);
  const campusId = body.campusId ?? req.user!.campus_id ?? null;
  const campus = getCampus(campusId);
  if (!campus) throw new ApiError('VALIDATION', 'campusId is required', { fields: { campusId: 'required' } });
  if (body.scope === 'nationwide' && !body.areas.length) throw new ApiError('VALIDATION', 'A nationwide request needs at least one area', { fields: { areas: 'required for nationwide' } });
  const id = uid();
  const t = nowIso();
  q.tx(() => {
    q.insert('wanted_posts', {
      id, user_id: req.user!.id, campus_id: campus.id, scope: body.scope, title: body.title, description: body.description,
      budget_min_cents: body.budgetMinCents, budget_max_cents: body.budgetMaxCents, move_in_from: body.moveInFrom, move_in_to: body.moveInTo,
      move_out_date: body.moveOutDate ?? null, flexible_days: body.flexibleDays, group_size: body.groupSize, bedrooms_min: body.bedroomsMin,
      furnished_pref: body.furnishedPref, gender_pref: body.genderPref, has_pets: body.hasPets ? 1 : 0, needs_parking: body.needsParking ? 1 : 0,
      property_types_json: JSON.stringify(body.propertyTypes), must_haves_json: JSON.stringify(body.mustHaves), nice_to_haves_json: JSON.stringify(body.niceToHaves),
      status: 'active', moderation_status: 'ok', expires_at: addDays(body.moveInTo, EXPIRES_AFTER_DAYS) + 'T00:00:00.000Z', created_at: t, updated_at: t,
    });
    insertAreas(id, body.areas);
  });
  const result = recomputeForWanted(id, { notify: 'summary' });
  logEvent(req, 'wanted.create', { entityType: 'wanted', entityId: id, campusId: campus.id, props: { scope: body.scope, budgetMax: body.budgetMaxCents, groupSize: body.groupSize, matches: result.count } });
  ok(res, toWantedDto(loadWanted(id)!), 201);
});

// ------------------------------------------------------------------ detail
router.get('/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const w = loadOrThrow(id, req);
  const viewerId = req.user?.id ?? null;
  if (viewerId !== w.user_id && !recentlyLogged({ userId: viewerId, sessionId: req.sessionId }, 'wanted.view', 'wanted', id, 6 * HOUR)) {
    logEvent(req, 'wanted.view', { entityType: 'wanted', entityId: id, campusId: w.campus_id });
    q.run('UPDATE wanted_posts SET view_count = view_count + 1 WHERE id = ?', [id]);
    w.view_count += 1;
  }
  ok(res, toWantedDto(w, { viewerId }));
});

router.patch('/:id', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const w = loadOrThrow(id, req);
  assertOwner(req, w.user_id);
  const body = parseBody(req, WantedPatchInput);
  const merged = {
    budgetMinCents: body.budgetMinCents ?? w.budget_min_cents, budgetMaxCents: body.budgetMaxCents ?? w.budget_max_cents,
    moveInFrom: body.moveInFrom ?? w.move_in_from, moveInTo: body.moveInTo ?? w.move_in_to,
    moveOutDate: body.moveOutDate === undefined ? w.move_out_date : body.moveOutDate,
  };
  if (merged.budgetMaxCents < merged.budgetMinCents) throw new ApiError('VALIDATION', 'budget range invalid', { fields: { budgetMaxCents: 'must be >= budgetMinCents' } });
  if (merged.moveInTo < merged.moveInFrom) throw new ApiError('VALIDATION', 'dates invalid', { fields: { moveInTo: 'must be >= moveInFrom' } });
  const scope = body.scope ?? w.scope;
  const areasNext = body.areas ?? loadAreas(id);
  if (scope === 'nationwide' && !areasNext.length) throw new ApiError('VALIDATION', 'A nationwide request needs at least one area', { fields: { areas: 'required for nationwide' } });
  const set: Record<string, string | number | null> = { updated_at: nowIso() };
  if (body.title !== undefined) set.title = body.title;
  if (body.description !== undefined) set.description = body.description;
  if (body.campusId !== undefined) set.campus_id = requireCampus(body.campusId).id;
  if (body.scope !== undefined) set.scope = body.scope;
  set.budget_min_cents = merged.budgetMinCents;
  set.budget_max_cents = merged.budgetMaxCents;
  set.move_in_from = merged.moveInFrom;
  set.move_in_to = merged.moveInTo;
  set.move_out_date = merged.moveOutDate;
  if (body.moveInTo !== undefined && w.status !== 'expired') set.expires_at = addDays(merged.moveInTo, EXPIRES_AFTER_DAYS) + 'T00:00:00.000Z';
  if (body.flexibleDays !== undefined) set.flexible_days = body.flexibleDays;
  if (body.groupSize !== undefined) set.group_size = body.groupSize;
  if (body.bedroomsMin !== undefined) set.bedrooms_min = body.bedroomsMin;
  if (body.furnishedPref !== undefined) set.furnished_pref = body.furnishedPref;
  if (body.genderPref !== undefined) set.gender_pref = body.genderPref;
  if (body.hasPets !== undefined) set.has_pets = body.hasPets ? 1 : 0;
  if (body.needsParking !== undefined) set.needs_parking = body.needsParking ? 1 : 0;
  if (body.propertyTypes !== undefined) set.property_types_json = JSON.stringify(body.propertyTypes);
  if (body.mustHaves !== undefined) set.must_haves_json = JSON.stringify(body.mustHaves);
  if (body.niceToHaves !== undefined) set.nice_to_haves_json = JSON.stringify(body.niceToHaves);
  q.tx(() => {
    q.update('wanted_posts', set, 'id = ?', [id]);
    if (body.areas) insertAreas(id, body.areas);
  });
  recomputeForWanted(id, { notify: 'none' });
  logEvent(req, 'wanted.update', { entityType: 'wanted', entityId: id, props: { fields: Object.keys(body) } });
  ok(res, toWantedDto(loadWanted(id)!));
});

function transition(req: Request, id: string, allowedFrom: string[], to: WantedRow['status']): WantedRow {
  const w = loadOrThrow(id, req);
  assertOwner(req, w.user_id);
  if (!allowedFrom.includes(w.status)) invalidState(w.status, to);
  const set: Record<string, string | number | null> = { status: to, updated_at: nowIso() };
  if (to === 'active' && w.status === 'expired') {
    // extend: push the window 30 days out so the post is matchable again
    const today = nowIso().slice(0, 10);
    const moveInTo = w.move_in_to < today ? addDays(today, 30) : addDays(w.move_in_to, 30);
    set.move_in_to = moveInTo;
    if (w.move_in_from < today) set.move_in_from = today;
    set.expires_at = addDays(moveInTo, EXPIRES_AFTER_DAYS) + 'T00:00:00.000Z';
  }
  q.update('wanted_posts', set, 'id = ?', [id]);
  logEvent(req, `wanted.${to}`, { entityType: 'wanted', entityId: id });
  if (to === 'active') recomputeForWanted(id, { notify: 'none' });
  else q.run("DELETE FROM matches WHERE wanted_id = ? AND status IN ('new','seen')", [id]);
  return loadWanted(id)!;
}

router.post('/:id/pause', requireAuth, (req, res) => ok(res, toWantedDto(transition(req, parseParams(req, idParam).id, ['active'], 'paused'))));
router.post('/:id/resume', requireAuth, (req, res) => ok(res, toWantedDto(transition(req, parseParams(req, idParam).id, ['paused'], 'active'))));
router.post('/:id/fulfilled', requireAuth, (req, res) => ok(res, toWantedDto(transition(req, parseParams(req, idParam).id, ['active', 'paused'], 'fulfilled'))));
router.post('/:id/extend', requireAuth, (req, res) => ok(res, toWantedDto(transition(req, parseParams(req, idParam).id, ['expired', 'active'], 'active'))));

router.delete('/:id', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const w = loadOrThrow(id, req);
  assertOwner(req, w.user_id);
  q.tx(() => {
    q.run("UPDATE wanted_posts SET status = 'removed', updated_at = ? WHERE id = ?", [nowIso(), id]);
    q.run("DELETE FROM matches WHERE wanted_id = ? AND status IN ('new','seen','dismissed')", [id]);
  });
  logEvent(req, 'wanted.remove', { entityType: 'wanted', entityId: id });
  ok(res, null);
});

router.put('/:id/areas', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const w = loadOrThrow(id, req);
  assertOwner(req, w.user_id);
  const body = parseBody(req, AreasInput);
  if (w.scope === 'nationwide' && !body.areas.length) throw new ApiError('VALIDATION', 'A nationwide request needs at least one area', { fields: { areas: 'required for nationwide' } });
  const rows = q.tx(() => {
    q.run('UPDATE wanted_posts SET updated_at = ? WHERE id = ?', [nowIso(), id]);
    return insertAreas(id, body.areas);
  });
  recomputeForWanted(id, { notify: 'none' });
  ok(res, rows.map((a) => ({ id: a.id, label: a.label, kind: a.kind, lat: a.lat, lng: a.lng, radiusM: a.radius_m, city: a.city, state: a.state, campusId: a.campus_id })));
});

// ------------------------------------------------------------------ matches (seeker side)
router.get('/:id/matches', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const w = loadOrThrow(id, req);
  assertOwner(req, w.user_id);
  const p = parseQuery(req, MatchesQuery);
  const page = matchListFor(id, p, req.user!.id);
  logEvent(req, 'match.view', { entityType: 'wanted', entityId: id, props: { count: page.total, minScore: p.minScore } });
  paginated(res, page, { computedAt: w.matches_computed_at });
});

router.post('/:id/matches/recompute', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const w = loadOrThrow(id, req);
  assertOwner(req, w.user_id);
  checkRate(`wanted.recompute:${req.user!.id}`, 1, 60_000);
  const r = recomputeForWanted(id, { notify: 'none' });
  ok(res, { count: r.count, computedAt: loadWanted(id)!.matches_computed_at });
});

const pairParams = z.object({ id: z.string().min(1), listingId: z.string().min(1) });

function ownMatch(req: Request): { w: WantedRow; m: MatchRow } {
  const { id, listingId } = parseParams(req, pairParams);
  const w = loadOrThrow(id, req);
  assertOwner(req, w.user_id);
  const m = loadMatch(id, listingId);
  if (!m) return notFound('Match');
  return { w, m };
}
function matchWithListing(m: MatchRow, viewerId: string): Match {
  return toMatchDto(m, { listing: listingCardMap([m.listing_id], viewerId).get(m.listing_id) });
}

router.post('/:id/matches/:listingId/seen', requireAuth, (req, res) => {
  const { m } = ownMatch(req);
  if (m.status === 'new') q.run("UPDATE matches SET status = 'seen', updated_at = ? WHERE id = ?", [nowIso(), m.id]);
  ok(res, matchWithListing(loadMatch(m.wanted_id, m.listing_id)!, req.user!.id));
});

router.post('/:id/matches/:listingId/dismiss', requireAuth, (req, res) => {
  const { m } = ownMatch(req);
  if (!['new', 'seen'].includes(m.status)) invalidState(m.status, 'dismissed');
  q.run("UPDATE matches SET status = 'dismissed', updated_at = ? WHERE id = ?", [nowIso(), m.id]);
  logEvent(req, 'match.dismiss', { entityType: 'wanted', entityId: m.wanted_id, props: { listingId: m.listing_id, score: m.score } });
  ok(res, matchWithListing(loadMatch(m.wanted_id, m.listing_id)!, req.user!.id));
});

router.post('/:id/matches/:listingId/contact', requireAuth, requireTrust(1), (req, res) => {
  const { w, m } = ownMatch(req);
  const body = parseBody(req, ContactInput);
  const l = q.get<{ id: string; owner_id: string; campus_id: string; status: string; title: string }>('SELECT id, owner_id, campus_id, status, title FROM listings WHERE id = ?', [m.listing_id]);
  if (!l) return notFound('Listing');
  if (isBlockedEither(req.user!.id, l.owner_id)) throw new ApiError('BLOCKED');
  const host = q.get<{ verified_only_messaging: number; banned: number }>('SELECT verified_only_messaging, banned FROM users WHERE id = ?', [l.owner_id]);
  if (host?.verified_only_messaging === 1 && (req.user!.trust_level ?? 0) < 1) throw new ApiError('VERIFIED_ONLY');
  const { conversation, created } = openConversation({ kind: 'direct', memberIds: [req.user!.id, l.owner_id], campusId: l.campus_id, context: { type: 'listing', id: l.id }, createdBy: req.user!.id });
  if (created) {
    const card = contextCardFor('listing', l.id);
    if (card) postContextCard(conversation.id, req.user!.id, card);
    const wcard = contextCardFor('wanted', w.id);
    if (wcard) postContextCard(conversation.id, req.user!.id, wcard);
  }
  if (body.message) postMessage(conversation.id, req.user!.id, 'text', body.message);
  q.run("UPDATE matches SET status = 'contacted', conversation_id = ?, updated_at = ? WHERE id = ?", [conversation.id, nowIso(), m.id]);
  recordLeadSafe({ listingId: l.id, userId: req.user!.id, conversationId: conversation.id, source: 'message' });
  logEvent(req, 'listing.contact_click', { entityType: 'listing', entityId: l.id, props: { via: 'wanted_match', wantedId: w.id, score: m.score } });
  if (created) logEvent(req, 'chat.start', { entityType: 'conversation', entityId: conversation.id, props: { context: 'listing', via: 'wanted_match' } });
  ok(res, { conversationId: conversation.id, match: matchWithListing(loadMatch(w.id, l.id)!, req.user!.id) });
});

// ------------------------------------------------------------------ "offer my place" (host side)
router.post('/:id/offer', requireAuth, requireTrust(1), (req, res) => {
  const { id } = parseParams(req, idParam);
  const w = loadOrThrow(id, req);
  const body = parseBody(req, OfferInput);
  const hostId = req.user!.id;
  if (w.user_id === hostId) throw new ApiError('BAD_REQUEST', 'You cannot offer a place on your own request');
  if (w.status !== 'active') invalidState(w.status, 'offered');
  const l = q.get<{ id: string; owner_id: string; campus_id: string; status: string; moderation_status: string; title: string }>('SELECT id, owner_id, campus_id, status, moderation_status, title FROM listings WHERE id = ?', [body.listingId]);
  if (!l || l.owner_id !== hostId) throw new ApiError('FORBIDDEN', 'Pick one of your own listings');
  if (l.status !== 'active' || l.moderation_status !== 'ok') throw new ApiError('INVALID_STATE', 'Only active listings can be offered', { data: { from: l.status, to: 'offered' } });
  if (isBlockedEither(hostId, w.user_id)) throw new ApiError('BLOCKED');
  const seeker = q.get<{ verified_only_messaging: number }>('SELECT verified_only_messaging FROM users WHERE id = ?', [w.user_id]);
  if (seeker?.verified_only_messaging === 1 && (req.user!.trust_level ?? 0) < 1) throw new ApiError('VERIFIED_ONLY');
  const existing = loadMatch(w.id, l.id);
  if (existing && existing.offered_by_host === 1) throw new ApiError('CONFLICT', 'You already offered this listing', { data: { conversationId: existing.conversation_id } });

  const { conversation, created } = openConversation({ kind: 'direct', memberIds: [hostId, w.user_id], campusId: l.campus_id, context: { type: 'listing', id: l.id }, createdBy: hostId });
  if (created) {
    const lc = contextCardFor('listing', l.id);
    if (lc) postContextCard(conversation.id, hostId, lc);
    const wc = contextCardFor('wanted', w.id);
    if (wc) postContextCard(conversation.id, hostId, wc);
  }
  const t = nowIso();
  const intro = body.message?.trim();
  postMessage(conversation.id, hostId, 'text', intro || (req.user!.locale === 'en' ? `Hi! I saw your request “${w.title}” — my place might fit. Happy to share details.` : `你好！看到你的求租「${w.title}」，我这边有一套房源可能合适，欢迎了解。`));

  q.tx(() => {
    if (existing) {
      const nextStatus = existing.status === 'contacted' ? 'contacted' : 'offered';
      q.run('UPDATE matches SET status = ?, offered_by_host = 1, conversation_id = ?, updated_at = ? WHERE id = ?', [nextStatus, conversation.id, t, existing.id]);
    } else {
      const s = scorePair(w, l.id);
      const row: MatchRow = {
        id: uid(), wanted_id: w.id, listing_id: l.id, score: s?.score ?? 0, breakdown_json: JSON.stringify(s?.breakdown ?? {}),
        status: 'offered', offered_by_host: 1, conversation_id: conversation.id, computed_at: t, updated_at: t,
      };
      q.insert('matches', row as unknown as Record<string, string | number | null>);
    }
    q.run('UPDATE wanted_posts SET offer_count = offer_count + 1, updated_at = ? WHERE id = ?', [t, w.id]);
  });
  recordLeadSafe({ listingId: l.id, userId: w.user_id, conversationId: conversation.id, source: 'wanted_offer' });
  notify(w.user_id, 'wanted.offer', {
    title: { zh: `${req.user!.name} 向你推荐了一套房源`, en: `${req.user!.name} offered you a place` },
    body: { zh: `针对你的求租「${w.title}」：${l.title}`, en: `For your request “${w.title}”: ${l.title}` },
    link: `/chat/${conversation.id}`, entityType: 'wanted', entityId: w.id, data: { listingId: l.id, conversationId: conversation.id },
  });
  logEvent(req, 'wanted.offer', { entityType: 'wanted', entityId: w.id, campusId: w.campus_id, props: { listingId: l.id, created } });
  if (created) logEvent(req, 'chat.start', { entityType: 'conversation', entityId: conversation.id, props: { context: 'listing', via: 'wanted_offer' } });
  ok(res, { conversationId: conversation.id, match: toMatchDto(loadMatch(w.id, l.id)!, { listing: listingCardMap([l.id], hostId).get(l.id) }) });
});

// ------------------------------------------------------------------ report
router.post('/:id/report', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const w = loadOrThrow(id, req);
  const body = parseBody(req, ReportInput);
  ok(res, createReport(req, { entityType: 'wanted', entityId: id, reason: body.reason, details: body.details, campusId: w.campus_id }));
});

// expose a tiny read of areas for map previews of other modules
router.get('/:id/areas', (req, res) => {
  const { id } = parseParams(req, idParam);
  loadOrThrow(id, req);
  const cards = wantedCardMap([id]);
  ok(res, cards.get(id)?.areas ?? []);
});

export default router;
