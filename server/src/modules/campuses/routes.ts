// /api/campuses — API.md §2.3 (scaffold-owned)
import { Router } from 'express';
import { z } from 'zod';
import { zBool, zLatLngCsv } from '@shared/schemas/common';
import type { Campus } from '@shared/types';
import { q, uid } from '../../db';
import { allCampuses, getCampus } from '../../lib/campuses';
import { ApiError } from '../../lib/errors';
import { haversineM, suggestCampus } from '../../lib/geo';
import { ok, parseBody, parseQuery } from '../../lib/http';
import { nowIso } from '../../lib/time';

const router = Router();

const ListQuery = z.object({
  q: z.string().trim().max(80).optional(),
  state: z.string().length(2).optional(),
  near: zLatLngCsv.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  activeOnly: zBool.default(true),
});

function rank(c: Campus, needle: string): number {
  const n = needle.toLowerCase();
  const fields = [c.shortName, c.name, c.nameZh ?? '', c.city, c.slug, c.metro ?? ''].map((s) => s.toLowerCase());
  if (fields[0] === n || fields[4] === n) return 0;
  if (fields.some((f) => f.startsWith(n))) return 1;
  if (fields.some((f) => f.includes(n))) return 2;
  if (c.eduDomains.some((d) => d.includes(n))) return 3;
  return -1;
}

export function campusStats(id: string) {
  return {
    activeListings: q.count("SELECT COUNT(*) FROM listings WHERE campus_id = ? AND status = 'active' AND moderation_status = 'ok'", [id]),
    activeWanted: q.count("SELECT COUNT(*) FROM wanted_posts WHERE campus_id = ? AND status = 'active' AND moderation_status = 'ok'", [id]),
    activeItems: q.count("SELECT COUNT(*) FROM market_items WHERE campus_id = ? AND status IN ('active','reserved') AND moderation_status = 'ok'", [id]),
    openBuddy: q.count("SELECT COUNT(*) FROM buddy_posts WHERE campus_id = ? AND status IN ('open','full') AND moderation_status = 'ok'", [id]),
    shuttleRoutes: q.count('SELECT COUNT(*) FROM shuttle_routes WHERE campus_id = ? AND is_active = 1', [id]),
  };
}

router.get('/', (req, res) => {
  const p = parseQuery(req, ListQuery);
  let list = allCampuses({ activeOnly: p.activeOnly });
  if (p.state) list = list.filter((c) => c.state.toUpperCase() === p.state!.toUpperCase());
  if (p.q) {
    const needle = p.q;
    list = list
      .map((c) => ({ c, r: rank(c, needle) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || (a.c.sortOrder ?? 0) - (b.c.sortOrder ?? 0) || (b.c.intlStudents ?? 0) - (a.c.intlStudents ?? 0))
      .map((x) => x.c);
  }
  if (p.near) {
    const near = p.near;
    list = list
      .map((c) => ({ ...c, distanceM: haversineM(near, { lat: c.lat, lng: c.lng }) }))
      .sort((a, b) => a.distanceM - b.distanceM);
  } else if (!p.q) {
    list = [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (b.intlStudents ?? 0) - (a.intlStudents ?? 0));
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  ok(res, list.slice(0, p.limit));
});

// static paths before /:idOrSlug
router.get('/suggest', (req, res) => {
  const p = parseQuery(req, z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }));
  ok(res, suggestCampus(p.lat, p.lng));
});

router.post('/requests', (req, res) => {
  const body = parseBody(req, z.object({
    schoolName: z.string().trim().min(2).max(120), city: z.string().max(80).optional(), state: z.string().length(2).optional(),
    email: z.string().email().optional(), note: z.string().max(1000).optional(),
  }));
  const id = uid();
  q.run('INSERT INTO campus_requests (id, user_id, school_name, city, state, email, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    id, req.user?.id ?? null, body.schoolName, body.city ?? null, body.state?.toUpperCase() ?? null, body.email ?? null, body.note ?? null, 'open', nowIso(),
  ]);
  ok(res, { id }, 201);
});

router.get('/:idOrSlug', (req, res) => {
  const c = getCampus(String(req.params.idOrSlug));
  if (!c) throw new ApiError('NOT_FOUND', 'Campus not found');
  ok(res, { ...c, stats: campusStats(c.id) });
});

export default router;
