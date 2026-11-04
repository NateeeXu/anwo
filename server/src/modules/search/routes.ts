// /api/search — API.md §2.6 (scaffold-owned). Simple LIKE search across modules using the shared card mappers.
import { Router } from 'express';
import { z } from 'zod';
import { SavedSearchModule } from '@shared/enums';
import { ScopeQuery, zCsv, idParam } from '@shared/schemas/common';
import type { SavedSearch, SearchSuggestion } from '@shared/types';
import { q, uid, parseJson } from '../../db';
import { requireAuth } from '../../lib/auth';
import { allCampuses, getCampus } from '../../lib/campuses';
import { buddyCards, itemCards, listingCards, wantedCards, type BuddyCardRow, type ItemCardRow, type ListingCardRow, type WantedCardRow } from '../../lib/cards';
import { ApiError } from '../../lib/errors';
import { logEvent } from '../../lib/events';
import { scopeFromQuery, scopeInfo, whereScope } from '../../lib/geo';
import { ok, parseBody, parseParams, parseQuery } from '../../lib/http';
import { nowIso } from '../../lib/time';
import { USER_PUBLIC_FROM, USER_PUBLIC_SELECT, toUserPublic, type UserPublicRow } from '../../lib/users';

const router = Router();
const TYPES = ['listing', 'wanted', 'item', 'buddy', 'campus', 'user'] as const;

const SearchQuery = ScopeQuery.extend({
  q: z.string().trim().min(1).max(80),
  types: zCsv.optional(),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

const like = (s: string) => `%${s.replace(/[%_]/g, (c) => '\\' + c)}%`;

router.get('/', (req, res) => {
  const p = parseQuery(req, SearchQuery);
  const types = (p.types?.length ? p.types : ['listing', 'wanted', 'item', 'buddy', 'campus']).filter((t): t is (typeof TYPES)[number] => (TYPES as readonly string[]).includes(t));
  const scope = scopeFromQuery(req, p, { requireCampus: false });
  const needle = like(p.q);
  const viewerId = req.user?.id ?? null;
  const out = { listings: [] as unknown[], wanted: [] as unknown[], items: [] as unknown[], buddy: [] as unknown[], campuses: [] as unknown[], users: [] as unknown[], counts: {} as Record<string, number>, scope: scopeInfo(scope) };

  if (types.includes('listing')) {
    const w = whereScope(scope, { alias: 'l', fuzz: 'listing' });
    const base = `FROM listings l WHERE l.status = 'active' AND l.moderation_status = 'ok' AND (l.title LIKE ? ESCAPE '\\' OR l.description LIKE ? ESCAPE '\\' OR l.neighborhood LIKE ? ESCAPE '\\' OR l.city LIKE ? ESCAPE '\\')${w.sql}`;
    const params = [needle, needle, needle, needle, ...w.params];
    out.counts.listing = q.count(`SELECT COUNT(*) ${base}`, params);
    const rows = q.all<ListingCardRow>(`SELECT l.* ${base} ORDER BY (l.title LIKE ? ESCAPE '\\') DESC, l.is_verified_listing DESC, l.published_at DESC LIMIT ?`, [...params, needle, p.limit]);
    out.listings = listingCards(rows, { viewerId, isAdmin: req.user?.role === 'admin' });
  }
  if (types.includes('wanted')) {
    const w = whereScope(scope, { alias: 'w', latCol: 'lat', lngCol: 'lng' });
    // wanted posts have no lat/lng; only campus / city(by campus) filters apply
    const campusSql = scope.scope === 'nationwide' || scope.bbox || scope.center ? '' : scope.campusId ? ' AND w.campus_id = ?' : '';
    const params: (string | number)[] = [needle, needle];
    if (campusSql) params.push(scope.campusId!);
    void w;
    const base = `FROM wanted_posts w WHERE w.status = 'active' AND w.moderation_status = 'ok' AND (w.title LIKE ? ESCAPE '\\' OR w.description LIKE ? ESCAPE '\\')${campusSql}`;
    out.counts.wanted = q.count(`SELECT COUNT(*) ${base}`, params);
    out.wanted = wantedCards(q.all<WantedCardRow>(`SELECT w.* ${base} ORDER BY w.created_at DESC LIMIT ?`, [...params, p.limit]));
  }
  if (types.includes('item')) {
    const w = whereScope(scope, { alias: 'm', latCol: 'pickup_lat', lngCol: 'pickup_lng', fuzz: 'round3' });
    const base = `FROM market_items m WHERE m.status IN ('active','reserved') AND m.moderation_status = 'ok' AND (m.title LIKE ? ESCAPE '\\' OR m.description LIKE ? ESCAPE '\\' OR m.category LIKE ? ESCAPE '\\')${w.sql}`;
    const params = [needle, needle, needle, ...w.params];
    out.counts.item = q.count(`SELECT COUNT(*) ${base}`, params);
    out.items = itemCards(q.all<ItemCardRow>(`SELECT m.* ${base} ORDER BY (m.title LIKE ? ESCAPE '\\') DESC, m.created_at DESC LIMIT ?`, [...params, needle, p.limit]), { viewerId, isAdmin: req.user?.role === 'admin' });
  }
  if (types.includes('buddy')) {
    const campusScope = { ...scope, scope: 'campus' as const, city: undefined, state: undefined };
    const w = whereScope(campusScope, { alias: 'b', allowNationwide: false });
    const base = `FROM buddy_posts b WHERE b.status IN ('open','full') AND b.moderation_status = 'ok' AND (b.title LIKE ? ESCAPE '\\' OR b.description LIKE ? ESCAPE '\\' OR b.location_name LIKE ? ESCAPE '\\' OR b.destination_name LIKE ? ESCAPE '\\')${scope.campusId ? w.sql : ''}`;
    const params = [needle, needle, needle, needle, ...(scope.campusId ? w.params : [])];
    out.counts.buddy = q.count(`SELECT COUNT(*) ${base}`, params);
    out.buddy = buddyCards(q.all<BuddyCardRow>(`SELECT b.* ${base} ORDER BY b.starts_at IS NULL, b.starts_at ASC LIMIT ?`, [...params, p.limit]), { viewerId });
  }
  if (types.includes('campus')) {
    const n = p.q.toLowerCase();
    const list = allCampuses().filter((c) => [c.name, c.shortName, c.nameZh ?? '', c.city, c.slug, c.metro ?? ''].some((s) => s.toLowerCase().includes(n)));
    out.counts.campus = list.length;
    out.campuses = list.slice(0, p.limit);
  }
  if (types.includes('user')) {
    const rows = q.all<UserPublicRow>(`SELECT ${USER_PUBLIC_SELECT} FROM ${USER_PUBLIC_FROM} WHERE u.deleted_at IS NULL AND u.banned = 0 AND u.name LIKE ? ESCAPE '\\' ORDER BY u.trust_level DESC LIMIT ?`, [needle, p.limit]);
    out.counts.user = rows.length;
    out.users = rows.map((r) => toUserPublic(r));
  }
  logEvent(req, 'search', { props: { q: p.q.slice(0, 80), types, scope: scope.scope }, campusId: scope.campusId });
  ok(res, out);
});

router.get('/suggest', (req, res) => {
  const p = parseQuery(req, z.object({ q: z.string().trim().min(1).max(80), campusId: z.string().max(64).optional() }));
  const n = p.q.toLowerCase();
  const needle = like(p.q);
  const campusId = p.campusId ?? req.user?.campus_id ?? null;
  const suggestions: SearchSuggestion[] = [];
  const seenCities = new Set<string>();
  for (const c of allCampuses()) {
    if (suggestions.length >= 8) break;
    const cityKey = `${c.city}, ${c.state}`;
    if (!seenCities.has(cityKey) && c.city.toLowerCase().startsWith(n)) {
      seenCities.add(cityKey);
      suggestions.push({ type: 'city', id: cityKey, label: cityKey, sublabel: 'City', link: `/listings?scope=nationwide&city=${encodeURIComponent(c.city)}&state=${c.state}` });
    }
    if ([c.name, c.shortName, c.nameZh ?? '', c.slug].some((s) => s.toLowerCase().includes(n)))
      suggestions.push({ type: 'campus', id: c.id, label: `${c.shortName} · ${c.nameZh ?? c.name}`, sublabel: `${c.city}, ${c.state}`, link: `/campus/${c.slug}` });
  }
  if (suggestions.length < 8) {
    const hoods = q.all<{ neighborhood: string }>(`SELECT DISTINCT neighborhood FROM listings WHERE status = 'active' AND neighborhood LIKE ? ESCAPE '\\' ${campusId ? 'AND campus_id = ?' : ''} LIMIT 3`, campusId ? [needle, campusId] : [needle]);
    for (const h of hoods) suggestions.push({ type: 'neighborhood', id: h.neighborhood, label: h.neighborhood, sublabel: 'Neighborhood', link: `/listings?q=${encodeURIComponent(h.neighborhood)}` });
  }
  if (suggestions.length < 8) {
    const titles = q.all<{ id: string; title: string }>(`SELECT id, title FROM listings WHERE status = 'active' AND moderation_status = 'ok' AND title LIKE ? ESCAPE '\\' ${campusId ? 'AND campus_id = ?' : ''} ORDER BY published_at DESC LIMIT ?`, campusId ? [needle, campusId, 8 - suggestions.length] : [needle, 8 - suggestions.length]);
    for (const t of titles) suggestions.push({ type: 'listing', id: t.id, label: t.title, sublabel: 'Listing', link: `/listings/${t.id}` });
  }
  ok(res, { suggestions: suggestions.slice(0, 8) });
});

// ------------------------------------------------------------------ saved searches
type SavedRow = { id: string; user_id: string; module: SavedSearch['module']; campus_id: string | null; scope: SavedSearch['scope']; name: string | null; query_json: string; notify: number; last_run_at: string | null; created_at: string };
const toSaved = (r: SavedRow): SavedSearch => ({ id: r.id, module: r.module, campusId: r.campus_id, scope: r.scope, name: r.name, query: parseJson(r.query_json, {}), notify: r.notify === 1, lastRunAt: r.last_run_at, createdAt: r.created_at });

router.get('/saved', requireAuth, (req, res) => {
  const p = parseQuery(req, z.object({ module: z.enum(SavedSearchModule).optional() }));
  const rows = p.module
    ? q.all<SavedRow>('SELECT * FROM saved_searches WHERE user_id = ? AND module = ? ORDER BY created_at DESC', [req.user!.id, p.module])
    : q.all<SavedRow>('SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC', [req.user!.id]);
  ok(res, rows.map(toSaved));
});

router.post('/saved', requireAuth, (req, res) => {
  const body = parseBody(req, z.object({
    module: z.enum(SavedSearchModule), campusId: z.string().max(64).optional(), scope: z.enum(['campus', 'nationwide']).default('campus'),
    name: z.string().trim().max(60).optional(), query: z.record(z.unknown()).default({}), notify: z.boolean().default(true),
  }));
  if (q.count('SELECT COUNT(*) FROM saved_searches WHERE user_id = ?', [req.user!.id]) >= 20) throw new ApiError('QUOTA_EXCEEDED', 'Max 20 saved searches', { data: { limit: 20, current: 20 } });
  const campusId = body.campusId ?? req.user!.campus_id ?? null;
  if (campusId && !getCampus(campusId)) throw new ApiError('VALIDATION', 'Unknown campus', { fields: { campusId: 'unknown campus' } });
  const row: SavedRow = { id: uid(), user_id: req.user!.id, module: body.module, campus_id: campusId, scope: body.scope, name: body.name ?? null, query_json: JSON.stringify(body.query), notify: body.notify ? 1 : 0, last_run_at: null, created_at: nowIso() };
  q.insert('saved_searches', row as unknown as Record<string, string | number | null>);
  ok(res, toSaved(row), 201);
});

router.delete('/saved/:id', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = q.run('DELETE FROM saved_searches WHERE id = ? AND (user_id = ? OR ? = 1)', [id, req.user!.id, req.user!.role === 'admin' ? 1 : 0]);
  if (!r.changes) throw new ApiError('NOT_FOUND', 'Saved search not found');
  ok(res, null);
});

export default router;
