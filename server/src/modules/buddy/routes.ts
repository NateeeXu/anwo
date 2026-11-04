// server/src/modules/buddy/routes.ts — OWNED BY THE `buddy` MODULE AGENT. Mounted at /api/buddy (API.md §10).
import { hooks } from '../../lib/hooks';
import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  BuddyAdminQuery, BuddyCalendarQuery, BuddyEventsPut, BuddyInput, BuddyJoinInput, BuddyListQuery, BuddyMembersQuery, BuddyMineQuery,
  BuddyModerateInput, BuddyPatch, BuddyReasonInput, TIME_OF_DAY_HOURS, type TimeOfDay, type BuddyInput as BuddyInputT,
} from '@shared/schemas/buddy';
import { idParam, ReportInput } from '@shared/schemas/common';
import { BuddyStatus, BuddyType } from '@shared/enums';
import type { BuddyStatus as BuddyStatusT } from '@shared/enums';
import { q, uid, placeholders } from '../../db';
import { ok, created, paginated, parseBody, parseParams, parseQuery, pageWindow } from '../../lib/http';
import { requireAuth, requireTrust, requireAdmin, assertOwner, isAdmin } from '../../lib/auth';
import { ApiError, notFound } from '../../lib/errors';
import { rateLimit } from '../../lib/ratelimit';
import { scopeFromQuery, whereScope, scopeInfo, type ResolvedScope } from '../../lib/geo';
import { getCampus, campusesInCity, requireCampus } from '../../lib/campuses';
import { buddyCards, type BuddyCardRow } from '../../lib/cards';
import { logEvent, recentlyLogged } from '../../lib/events';
import { createReport } from '../../lib/reports';
import { pickSponsored, mergeSponsored, sponsoredSlotCount, recordClick, recordImpressions } from '../../lib/sponsored';
import { audit } from '../../lib/audit';
import { nowIso, nowMs, HOUR } from '../../lib/time';
import { postSystemMessage, loadConversation } from '../../lib/conversations';
import { notify, notifyMany } from '../../lib/notify';
import { config } from '../../config';
import {
  approveMember, assertVisible, buildIcs, completePost, declineMember, joinPost, leavePost, listMembers, listOccurrences, loadPost, postIcsItems, removeMemberFromPost,
  replaceEvents, requirePost, setPostStatus, syncFullStatus, toBuddyDetail, toEventDto, touch, isActiveMember, isHost, withMemberPreview, type BuddyEventRow, type BuddyPostRow,
} from './service';

const router = Router();

// ------------------------------------------------------------------ helpers
/** UTC offset (hours) of an IANA zone at `at` — used to evaluate campus-local hours in SQL. */
function tzOffsetHours(timeZone: string, at: Date = new Date(nowMs())): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
    return Math.round((asUtc - at.getTime()) / HOUR);
  } catch {
    return 0;
  }
}
/** `YYYY-MM-DD` (campus-local) → UTC ISO at local midnight (+ `endOfDay`). ISO inputs pass through. */
function dayBoundary(input: string, timeZone: string, endOfDay: boolean): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split('-').map(Number) as [number, number, number];
    const guess = new Date(Date.UTC(y, m - 1, d, 12));
    const off = tzOffsetHours(timeZone, guess);
    const local = Date.UTC(y, m - 1, d, 0, 0, 0) - off * HOUR;
    return new Date(endOfDay ? local + 24 * HOUR : local).toISOString();
  }
  const t = new Date(input);
  if (Number.isNaN(t.getTime())) throw new ApiError('VALIDATION', 'Invalid date', { fields: { [endOfDay ? 'dateTo' : 'dateFrom']: 'date expected' } });
  return t.toISOString();
}
function originOf(req: Request): string {
  const o = req.headers.origin;
  if (typeof o === 'string' && o) return o;
  const first = config.webOrigins[0];
  return first || `${req.protocol}://${req.get('host')}`;
}
function sanitizeInput(body: BuddyInputT): BuddyInputT {
  const out = { ...body };
  // a roommate search has no fixed time
  if (out.type === 'roommate' && out.startsAt === undefined) out.startsAt = null;
  return out;
}
function campusTimezone(campusId: string | null): string {
  return getCampus(campusId)?.timezone ?? 'America/Chicago';
}

type ListWhere = { where: string; params: (string | number)[]; distanceSql: string | null; distanceParams: number[]; scope: ResolvedScope };

function buildListWhere(req: Request, p: z.infer<typeof BuddyListQuery>): ListWhere {
  const parts: string[] = ["b.moderation_status = 'ok'"];
  const params: (string | number)[] = [];
  const viewer = req.user;

  // statuses (default public: open, full); hosts may request their own other statuses through /posts/mine
  const statuses = (p.status?.length ? p.status : ['open', 'full']).filter((s): s is BuddyStatusT => (BuddyStatus as readonly string[]).includes(s) && s !== 'removed');
  parts.push(`b.status IN (${placeholders(statuses.length || 1)})`);
  params.push(...(statuses.length ? statuses : ['open']));

  // scope: buddy is always campus-scoped; city/state is resolved to the campuses in that city
  let scope: ResolvedScope;
  let distanceSql: string | null = null;
  let distanceParams: number[] = [];
  if (p.city && p.state) {
    const ids = campusesInCity(p.city, p.state).map((c) => c.id);
    scope = { campusId: ids[0] ?? null, scope: 'campus', city: p.city, state: p.state.toUpperCase(), campus: getCampus(ids[0]) ?? null, campusSource: 'query' };
    parts.push(ids.length ? `b.campus_id IN (${placeholders(ids.length)})` : '0');
    params.push(...ids);
  } else {
    scope = scopeFromQuery(req, { ...p, scope: 'campus', city: undefined, state: undefined }, { allowNationwide: false, requireCampus: !p.authorId });
    const w = whereScope(scope, { alias: 'b', allowNationwide: false });
    if (!(p.authorId && scope.campusSource !== 'query')) {
      parts.push(w.sql.replace(/^ AND /, '') || '1');
      params.push(...w.params);
    }
    distanceSql = w.distanceSql;
    distanceParams = w.distanceParams;
  }

  if (p.authorId) {
    parts.push('b.author_id = ?');
    params.push(p.authorId);
  }
  if (p.type?.length) {
    const types = p.type.filter((t) => (BuddyType as readonly string[]).includes(t));
    if (types.length) {
      parts.push(`b.type IN (${placeholders(types.length)})`);
      params.push(...types);
    }
  }
  const tz = campusTimezone(scope.campusId);
  if (p.dateFrom) {
    parts.push('b.starts_at >= ?');
    params.push(dayBoundary(p.dateFrom, tz, false));
  }
  if (p.dateTo) {
    parts.push('b.starts_at < ?');
    params.push(dayBoundary(p.dateTo, tz, true));
  }
  if (p.upcoming) {
    parts.push('(b.starts_at IS NULL OR COALESCE(b.ends_at, b.starts_at) >= ?)');
    params.push(new Date(nowMs() - HOUR).toISOString());
  }
  if (p.timeOfDay?.length) {
    const windows = p.timeOfDay.filter((w): w is TimeOfDay => w in TIME_OF_DAY_HOURS);
    if (windows.length) {
      const off = ((tzOffsetHours(tz) % 24) + 24) % 24;
      const h = `((CAST(strftime('%H', b.starts_at) AS INTEGER) + ${off}) % 24)`;
      const clauses = windows.map((w) => {
        const [a, bEnd] = TIME_OF_DAY_HOURS[w];
        return bEnd <= 24 ? `(${h} >= ${a} AND ${h} < ${bEnd})` : `(${h} >= ${a} OR ${h} < ${bEnd - 24})`;
      });
      parts.push(`(b.starts_at IS NOT NULL AND (${clauses.join(' OR ')}))`);
    }
  }
  if (p.language?.length) {
    const langs = p.language.slice(0, 6);
    parts.push(`EXISTS (SELECT 1 FROM json_each(b.languages_json) WHERE value IN (${placeholders(langs.length)}))`);
    params.push(...langs);
  }
  if (p.verifiedOnly !== undefined) {
    parts.push('b.verified_only = ?');
    params.push(p.verifiedOnly ? 1 : 0);
  }
  if (p.hasSpace) parts.push('b.member_count < b.max_members');
  if (p.q) {
    const like = `%${p.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    parts.push("(b.title LIKE ? ESCAPE '\\' OR b.description LIKE ? ESCAPE '\\' OR b.location_name LIKE ? ESCAPE '\\' OR b.destination_name LIKE ? ESCAPE '\\')");
    params.push(like, like, like, like);
  }
  void viewer;
  return { where: parts.join(' AND '), params, distanceSql, distanceParams, scope };
}

function orderFor(sort: string | undefined, hasQ: boolean, distanceSql: string | null): { sql: string; params: number[] } {
  const effective = sort ?? (hasQ ? 'relevance' : 'upcoming');
  switch (effective) {
    case 'recent':
      return { sql: 'b.created_at DESC', params: [] };
    case 'distance':
      return distanceSql ? { sql: `(b.lat IS NULL), ${distanceSql} ASC, b.starts_at IS NULL, b.starts_at ASC`, params: [] } : { sql: 'b.starts_at IS NULL, b.starts_at ASC', params: [] };
    case 'relevance':
      return { sql: 'b.starts_at IS NULL, b.starts_at ASC, b.created_at DESC', params: [] };
    case 'upcoming':
    default:
      return { sql: 'b.starts_at IS NULL, b.starts_at ASC, b.created_at DESC', params: [] };
  }
}

// ------------------------------------------------------------------ static routes (before /:id)
router.get('/', (_req, res) => ok(res, { module: 'buddy', status: 'ready', endpoints: ['/posts', '/posts/mine', '/calendar', '/calendar.ics', '/safety'] }));

router.get('/posts', rateLimit('reads'), (req, res) => {
  const p = parseQuery(req, BuddyListQuery);
  const { where, params, distanceSql, distanceParams, scope } = buildListWhere(req, p);
  const { limit, offset } = pageWindow(p);
  const order = orderFor(p.sort, !!p.q, distanceSql);
  const needDistance = !!distanceSql && (p.sort === 'distance' || !!scope.center);
  const select = `SELECT b.*${needDistance ? `, ${distanceSql} AS distance_m` : ''} FROM buddy_posts b WHERE ${where}`;
  const total = Math.min(q.count(`SELECT COUNT(*) FROM buddy_posts b WHERE ${where}`, params), 1000);
  const rows = q.all<BuddyCardRow>(`${select} ORDER BY ${order.sql} LIMIT ? OFFSET ?`, [...(needDistance ? distanceParams : []), ...params, ...order.params, limit, offset]);
  let items = buddyCards(rows, { viewerId: req.user?.id });

  // sponsored slots (DATA_MODEL §8) — only inside the campus and only when the boosted post passes the same filters
  if (scope.campusId && !p.authorId) {
    const slots = sponsoredSlotCount(p.pageSize);
    const picks = pickSponsored({ entityType: 'buddy_post', campusId: scope.campusId, excludeIds: items.map((i) => i.id), slots });
    if (picks.length) {
      const ids = picks.map((x) => x.id);
      const sRows = q.all<BuddyCardRow>(`SELECT b.* FROM buddy_posts b WHERE b.id IN (${placeholders(ids.length)}) AND ${where}`, [...ids, ...params]);
      const tierOf = new Map(picks.map((x) => [x.id, x]));
      const sCards = buddyCards(sRows, { viewerId: req.user?.id }).map((c) => ({ ...c, sponsored: true, boostTier: tierOf.get(c.id)!.tier, boostId: tierOf.get(c.id)!.boostId }));
      if (sCards.length) {
        items = mergeSponsored(items, sCards, p.pageSize);
        recordImpressions(sCards.map((c) => tierOf.get(c.id)!.boostId), req);
      }
    }
  }
  if (p.q) logEvent(req, 'search', { props: { module: 'buddy', q: p.q, total }, campusId: scope.campusId });
  paginated(res, { items: withMemberPreview(items), total, page: p.page, pageSize: p.pageSize }, { scope: scopeInfo(scope) });
});

router.get('/posts/mine', requireAuth, (req, res) => {
  const p = parseQuery(req, BuddyMineQuery);
  const me = req.user!;
  const parts = ["m.user_id = ?", "b.status <> 'removed'"];
  const params: (string | number)[] = [me.id];
  if (p.role === 'host') parts.push("m.role = 'host'");
  else if (p.role === 'member') parts.push("m.role = 'member'");
  const mStatuses = p.status?.length ? p.status : ['joined', 'pending'];
  parts.push(`m.status IN (${placeholders(mStatuses.length)})`);
  params.push(...mStatuses);
  const horizon = new Date(nowMs() - HOUR).toISOString();
  if (p.when === 'upcoming') {
    parts.push("b.status IN ('open','full') AND (b.starts_at IS NULL OR COALESCE(b.ends_at, b.starts_at) >= ?)");
    params.push(horizon);
  } else if (p.when === 'past') {
    parts.push("(b.status IN ('closed','cancelled','expired') OR (b.starts_at IS NOT NULL AND COALESCE(b.ends_at, b.starts_at) < ?))");
    params.push(horizon);
  }
  const where = parts.join(' AND ');
  const { limit, offset } = pageWindow(p);
  const total = q.count(`SELECT COUNT(*) FROM buddy_members m JOIN buddy_posts b ON b.id = m.post_id WHERE ${where}`, params);
  const order = p.when === 'past' ? 'b.starts_at DESC, b.updated_at DESC' : 'b.starts_at IS NULL, b.starts_at ASC, b.created_at DESC';
  const rows = q.all<BuddyCardRow>(`SELECT b.* FROM buddy_members m JOIN buddy_posts b ON b.id = m.post_id WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const items = buddyCards(rows, { viewerId: me.id });
  // pending join requests waiting on me as a host (badge on the page)
  const pendingRequests = q.count("SELECT COUNT(*) FROM buddy_members m JOIN buddy_posts b ON b.id = m.post_id WHERE b.author_id = ? AND m.status = 'pending' AND b.status IN ('open','full')", [me.id]);
  paginated(res, { items: withMemberPreview(items), total, page: p.page, pageSize: p.pageSize }, { pendingRequests });
});

router.get('/calendar', rateLimit('reads'), (req, res) => {
  const p = parseQuery(req, BuddyCalendarQuery);
  const scope = scopeFromQuery(req, { campusId: p.campusId, scope: 'campus' }, { allowNationwide: false });
  if (!scope.campusId) throw new ApiError('VALIDATION', 'campusId is required', { fields: { campusId: 'required' } });
  const tz = campusTimezone(scope.campusId);
  const fromIso = dayBoundary(p.from, tz, false);
  const toIso = dayBoundary(p.to, tz, true);
  if (new Date(toIso).getTime() - new Date(fromIso).getTime() > 63 * 24 * HOUR) throw new ApiError('VALIDATION', 'Range too large (max 62 days)', { fields: { to: 'max 62 days' } });
  const occ = listOccurrences({ campusId: scope.campusId, fromIso, toIso, types: p.type, viewerId: req.user?.id, mineOnly: !!p.mine });
  const previews = new Map(withMemberPreview([...new Map(occ.map((o) => [o.post.id, o.post])).values()]).map((c) => [c.id, c]));
  const events = occ.map((o) => ({ ...o, post: previews.get(o.post.id) ?? o.post }));
  ok(res, { events, campusId: scope.campusId, timezone: tz, from: p.from, to: p.to });
});

router.get('/calendar.ics', rateLimit('reads'), (req, res) => {
  const p = parseQuery(req, BuddyCalendarQuery);
  const scope = scopeFromQuery(req, { campusId: p.campusId, scope: 'campus' }, { allowNationwide: false });
  if (!scope.campusId) throw new ApiError('VALIDATION', 'campusId is required', { fields: { campusId: 'required' } });
  const campus = requireCampus(scope.campusId);
  const fromIso = dayBoundary(p.from, campus.timezone, false);
  const toIso = dayBoundary(p.to, campus.timezone, true);
  const occ = listOccurrences({ campusId: campus.id, fromIso, toIso, types: p.type, viewerId: req.user?.id, mineOnly: !!p.mine });
  const origin = originOf(req);
  const ics = buildIcs(
    occ.map((o) => ({ uid: o.id.replace(/^post:/, ''), startsAt: o.startsAt, endsAt: o.endsAt, title: o.post.title, description: '', location: o.locationName, url: `${origin}/buddy/${o.postId}`, lat: o.lat, lng: o.lng })),
    `Anwo · ${campus.shortName} buddies`,
  );
  logEvent(req, 'buddy.calendar_export', { props: { campusId: campus.id, count: occ.length, mine: !!p.mine }, campusId: campus.id });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="anwo-buddy-${campus.slug}-${p.from}.ics"`);
  res.send(ics);
});

const SAFETY_RULES = {
  version: 1,
  rules: {
    zh: [
      '第一次见面选在校园、机场航站楼等公共场所，告诉朋友你的行程。',
      '费用在到达后再分摊；不要提前转账或预付押金。',
      '查看对方的认证等级和成员数，优先加入「仅限已验证」的搭子。',
      '遇到可疑行为请立即举报，我们会在 24 小时内处理。',
    ],
    en: [
      'Meet first in public places (campus, airport terminals) and tell a friend your plan.',
      'Split costs after arrival. Never prepay or send deposits.',
      'Check the organizer\'s verification level and member count; prefer verified-only groups.',
      'Report anything suspicious right away. We act within 24 hours.',
    ],
  },
} as const;
router.get('/safety', (_req, res) => ok(res, SAFETY_RULES));

// ------------------------------------------------------------------ admin (moderation; consumed by admin.tsx)
router.get('/admin/posts', requireAdmin, (req, res) => {
  const p = parseQuery(req, BuddyAdminQuery);
  const parts: string[] = ['1'];
  const params: (string | number)[] = [];
  if (p.campusId) { parts.push('b.campus_id = ?'); params.push(p.campusId); }
  if (p.status) { parts.push('b.status = ?'); params.push(p.status); }
  if (p.moderationStatus) { parts.push('b.moderation_status = ?'); params.push(p.moderationStatus); }
  if (p.q) { const like = `%${p.q}%`; parts.push('(b.title LIKE ? OR b.description LIKE ?)'); params.push(like, like); }
  const where = parts.join(' AND ');
  const { limit, offset } = pageWindow(p);
  const total = q.count(`SELECT COUNT(*) FROM buddy_posts b WHERE ${where}`, params);
  const rows = q.all<BuddyPostRow>(`SELECT b.* FROM buddy_posts b WHERE ${where} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const reports = new Map<string, number>();
  if (rows.length) {
    for (const r of q.all<{ entity_id: string; n: number }>(`SELECT entity_id, COUNT(*) AS n FROM reports WHERE entity_type = 'buddy_post' AND status IN ('open','in_review') AND entity_id IN (${placeholders(rows.length)}) GROUP BY entity_id`, rows.map((r) => r.id))) reports.set(r.entity_id, r.n);
  }
  const items = buddyCards(rows, { viewerId: req.user!.id }).map((c, i) => ({ ...c, moderationStatus: rows[i]!.moderation_status, openReports: reports.get(c.id) ?? 0, viewCount: rows[i]!.view_count }));
  paginated(res, { items, total, page: p.page, pageSize: p.pageSize });
});

router.post('/posts/:id/moderate', requireAdmin, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, BuddyModerateInput);
  const post = requirePost(id);
  const before = { moderationStatus: post.moderation_status, status: post.status };
  q.tx(() => {
    touch(id, { moderation_status: body.moderationStatus, ...(body.moderationStatus === 'hidden' ? { status: 'removed' } : {}) });
    if (body.moderationStatus === 'hidden') q.run("UPDATE buddy_events SET status = 'cancelled' WHERE post_id = ? AND status = 'scheduled'", [id]);
    if (body.moderationStatus === 'ok' && post.status === 'removed') touch(id, { status: 'closed' });
  });
  const fresh = requirePost(id);
  audit(req, { action: 'buddy.moderate', entityType: 'buddy_post', entityId: id, before, after: { moderationStatus: fresh.moderation_status, status: fresh.status }, reason: body.reason ?? null });
  if (body.moderationStatus === 'hidden') {
    notify(post.author_id, 'report.actioned', {
      title: { zh: `「${post.title}」已被下架`, en: `"${post.title}" was taken down` },
      body: body.reason ? body.reason : { zh: '内容不符合社区规范。', en: 'The post did not follow the community rules.' },
      link: '/safety', entityType: 'buddy_post', entityId: id, data: { reason: body.reason ?? null },
    });
  }
  ok(res, toBuddyDetail(fresh, req.user));
});

// ------------------------------------------------------------------ CRUD
router.post('/posts', requireTrust(1), rateLimit('writes'), (req, res) => {
  const body = sanitizeInput(parseBody(req, BuddyInput));
  const me = req.user!;
  const campus = getCampus(body.campusId ?? me.campus_id ?? null);
  if (!campus) throw new ApiError('VALIDATION', 'campusId is required', { fields: { campusId: 'required' } });
  if (body.verifiedOnly && me.role !== 'admin' && me.trust_level < 2) {
    throw new ApiError('TRUST_REQUIRED', 'Verified-only posts need an ID-verified host', { data: { required: 2, current: me.trust_level, nextStep: 'id' } });
  }
  const id = uid();
  const t = nowIso();
  q.tx(() => {
    q.insert('buddy_posts', {
      id, author_id: me.id, campus_id: campus.id, type: body.type, title: body.title, description: body.description,
      starts_at: body.startsAt ? new Date(body.startsAt).toISOString() : null, ends_at: body.endsAt ? new Date(body.endsAt).toISOString() : null,
      is_all_day: body.isAllDay ? 1 : 0, location_name: body.locationName ?? null, lat: body.lat ?? null, lng: body.lng ?? null,
      destination_name: body.destinationName ?? null, dest_lat: body.destLat ?? null, dest_lng: body.destLng ?? null,
      languages_json: JSON.stringify(body.languages), max_members: body.maxMembers, member_count: 1,
      verified_only: body.verifiedOnly ? 1 : 0, min_trust_level: body.verifiedOnly ? Math.max(1, body.minTrustLevel) : body.minTrustLevel,
      requires_approval: body.requiresApproval ? 1 : 0, cost_split_cents: body.costSplitCents ?? null, conversation_id: null,
      status: 'open', moderation_status: 'ok', boosted_until: null, view_count: 0, created_at: t, updated_at: t,
    });
    q.run("INSERT INTO buddy_members (post_id, user_id, role, status, note, joined_at, updated_at) VALUES (?, ?, 'host', 'joined', NULL, ?, ?)", [id, me.id, t, t]);
    if (body.events?.length) {
      for (const e of body.events) {
        q.run('INSERT INTO buddy_events (id, post_id, campus_id, starts_at, ends_at, location_name, lat, lng, status, reminder_sent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)',
          [uid(), id, campus.id, new Date(e.startsAt).toISOString(), e.endsAt ? new Date(e.endsAt).toISOString() : null, e.locationName ?? body.locationName ?? null, e.lat ?? body.lat ?? null, e.lng ?? body.lng ?? null, 'scheduled', t]);
      }
    }
  });
  logEvent(req, 'buddy.create', { entityType: 'buddy_post', entityId: id, props: { type: body.type, verifiedOnly: body.verifiedOnly, requiresApproval: body.requiresApproval, maxMembers: body.maxMembers }, campusId: campus.id });
  hooks.emit('content.published', { userId: req.user!.id, entityType: 'buddy_post', entityId: id });
  created(res, toBuddyDetail(requirePost(id), me));
});

router.get('/posts/:id', rateLimit('reads'), (req, res) => {
  const { id } = parseParams(req, idParam);
  const post = requirePost(id);
  assertVisible(post, req.user);
  const viewerKey = { userId: req.user?.id ?? null, sessionId: req.sessionId ?? null };
  if (!isHost(post, req.user) && !recentlyLogged(viewerKey, 'buddy.view', 'buddy_post', id, 6 * HOUR)) {
    q.run('UPDATE buddy_posts SET view_count = view_count + 1 WHERE id = ?', [id]);
    post.view_count += 1;
  }
  logEvent(req, 'buddy.view', { entityType: 'buddy_post', entityId: id, props: { type: post.type, status: post.status }, campusId: post.campus_id });
  // sponsored click accounting (same contract as GET /api/listings/:id?boost=<boostId>)
  const boostId = typeof req.query.boost === 'string' ? req.query.boost : null;
  if (boostId && !isHost(post, req.user) && q.get('SELECT 1 FROM v_active_boosts WHERE id = ? AND entity_id = ?', [boostId, id])) recordClick(boostId, req);
  ok(res, toBuddyDetail(post, req.user));
});

router.patch('/posts/:id', requireAuth, rateLimit('writes'), (req, res) => {
  const { id } = parseParams(req, idParam);
  const post = requirePost(id);
  assertOwner(req, post.author_id);
  if (['cancelled', 'expired', 'removed'].includes(post.status)) throw new ApiError('INVALID_STATE', 'This post can no longer be edited', { data: { from: post.status, to: 'edit' } });
  const body = parseBody(req, BuddyPatch);
  const me = req.user!;
  if (body.verifiedOnly && me.role !== 'admin' && me.trust_level < 2) {
    throw new ApiError('TRUST_REQUIRED', 'Verified-only posts need an ID-verified host', { data: { required: 2, current: me.trust_level, nextStep: 'id' } });
  }
  if (body.campusId && !getCampus(body.campusId)) throw new ApiError('VALIDATION', 'Unknown campus', { fields: { campusId: 'unknown campus' } });
  if (body.maxMembers !== undefined && body.maxMembers < post.member_count) {
    throw new ApiError('QUOTA_EXCEEDED', 'maxMembers is below the current member count', { data: { limit: body.maxMembers, current: post.member_count } });
  }
  const patch: Record<string, unknown> = {};
  const map: Record<string, string> = {
    type: 'type', title: 'title', description: 'description', campusId: 'campus_id', isAllDay: 'is_all_day', locationName: 'location_name', lat: 'lat', lng: 'lng',
    destinationName: 'destination_name', destLat: 'dest_lat', destLng: 'dest_lng', maxMembers: 'max_members', verifiedOnly: 'verified_only', minTrustLevel: 'min_trust_level',
    requiresApproval: 'requires_approval', costSplitCents: 'cost_split_cents',
  };
  for (const [k, col] of Object.entries(map)) {
    const v = (body as Record<string, unknown>)[k];
    if (v === undefined) continue;
    patch[col] = typeof v === 'boolean' ? (v ? 1 : 0) : v === '' ? null : v;
  }
  if (body.startsAt !== undefined) patch.starts_at = body.startsAt ? new Date(body.startsAt).toISOString() : null;
  if (body.endsAt !== undefined) patch.ends_at = body.endsAt ? new Date(body.endsAt).toISOString() : null;
  if (body.languages) patch.languages_json = JSON.stringify(body.languages);
  const changed = Object.keys(patch);
  q.tx(() => {
    if (changed.length) touch(id, patch);
    if (body.events) replaceEvents(requirePost(id), body.events);
    syncFullStatus(id);
  });
  const fresh = requirePost(id);
  if (fresh.conversation_id && loadConversation(fresh.conversation_id) && (changed.length || body.events)) {
    postSystemMessage(fresh.conversation_id, 'post_updated', { userId: me.id, postId: id, fields: changed });
    if (changed.some((c) => ['starts_at', 'ends_at', 'location_name', 'destination_name'].includes(c))) {
      const members = q.all<{ user_id: string }>("SELECT user_id FROM buddy_members WHERE post_id = ? AND status = 'joined' AND user_id <> ?", [id, me.id]).map((m) => m.user_id);
      notifyMany(members, 'system', {
        title: { zh: `「${fresh.title}」的时间或地点有更新`, en: `"${fresh.title}" changed time or place` },
        link: `/buddy/${id}`, entityType: 'buddy_post', entityId: id, data: { fields: changed },
      });
    }
  }
  logEvent(req, 'buddy.update', { entityType: 'buddy_post', entityId: id, props: { fields: changed }, campusId: fresh.campus_id });
  ok(res, toBuddyDetail(fresh, me));
});

for (const action of ['close', 'cancel', 'reopen'] as const) {
  router.post(`/posts/:id/${action}`, requireAuth, rateLimit('writes'), (req, res) => {
    const { id } = parseParams(req, idParam);
    const post = requirePost(id);
    assertOwner(req, post.author_id);
    const { reason } = parseBody(req, BuddyReasonInput);
    const to = action === 'close' ? 'closed' : action === 'cancel' ? 'cancelled' : 'open';
    const fresh = setPostStatus(post, to, req.user!, reason);
    logEvent(req, `buddy.${action}`, { entityType: 'buddy_post', entityId: id, props: { reason: reason ?? null }, campusId: post.campus_id });
    ok(res, toBuddyDetail(fresh, req.user));
  });
}
router.post('/posts/:id/complete', requireAuth, rateLimit('writes'), (req, res) => {
  const { id } = parseParams(req, idParam);
  const post = requirePost(id);
  assertOwner(req, post.author_id);
  const fresh = completePost(post, req.user!);
  logEvent(req, 'buddy.complete', { entityType: 'buddy_post', entityId: id, campusId: post.campus_id });
  ok(res, toBuddyDetail(fresh, req.user));
});

router.delete('/posts/:id', requireAuth, rateLimit('writes'), (req, res) => {
  const { id } = parseParams(req, idParam);
  const post = requirePost(id);
  assertOwner(req, post.author_id);
  if (['open', 'full'].includes(post.status)) setPostStatus(post, 'cancelled', req.user!, null); // tells members first
  q.run('DELETE FROM buddy_posts WHERE id = ?', [id]); // cascades members + events; the group chat keeps its history
  logEvent(req, 'buddy.delete', { entityType: 'buddy_post', entityId: id, campusId: post.campus_id });
  ok(res, null);
});

// ------------------------------------------------------------------ membership
router.post('/posts/:id/join', requireAuth, rateLimit('writes'), (req, res) => {
  const { id } = parseParams(req, idParam);
  const { note } = parseBody(req, BuddyJoinInput);
  const post = requirePost(id);
  assertVisible(post, req.user);
  ok(res, joinPost(req, post, req.user!, note ?? null));
});
router.post('/posts/:id/leave', requireAuth, rateLimit('writes'), (req, res) => {
  const { id } = parseParams(req, idParam);
  leavePost(req, requirePost(id), req.user!);
  ok(res, null);
});
router.get('/posts/:id/members', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const p = parseQuery(req, BuddyMembersQuery);
  const post = requirePost(id);
  const me = req.user!;
  const host = isHost(post, me);
  if (!host && !isActiveMember(id, me.id)) throw new ApiError('FORBIDDEN', 'Members only');
  const members = listMembers(id, { status: p.status, withNote: host });
  ok(res, host ? members : members.filter((m) => m.status === 'joined'));
});
for (const action of ['approve', 'decline', 'remove'] as const) {
  router.post(`/posts/:id/members/:userId/${action}`, requireAuth, rateLimit('writes'), (req, res) => {
    const { id, userId } = parseParams(req, idParam.extend({ userId: z.string().min(1).max(128) }));
    const post = requirePost(id);
    assertOwner(req, post.author_id);
    const { reason } = parseBody(req, BuddyReasonInput);
    const out = action === 'approve' ? approveMember(req, post, userId) : action === 'decline' ? declineMember(req, post, userId, reason) : removeMemberFromPost(req, post, userId, reason);
    ok(res, out);
  });
}

// ------------------------------------------------------------------ events + ics
router.get('/posts/:id/events', (req, res) => {
  const { id } = parseParams(req, idParam);
  const post = requirePost(id);
  assertVisible(post, req.user);
  ok(res, q.all<BuddyEventRow>('SELECT * FROM buddy_events WHERE post_id = ? ORDER BY starts_at ASC', [id]).map((e) => toEventDto(e)));
});
router.put('/posts/:id/events', requireAuth, rateLimit('writes'), (req, res) => {
  const { id } = parseParams(req, idParam);
  const post = requirePost(id);
  assertOwner(req, post.author_id);
  const { events } = parseBody(req, BuddyEventsPut);
  const out = replaceEvents(post, events);
  if (post.conversation_id && loadConversation(post.conversation_id)) postSystemMessage(post.conversation_id, 'post_updated', { userId: req.user!.id, postId: id, fields: ['events'] });
  ok(res, out);
});
router.get('/posts/:id/calendar.ics', (req, res) => {
  const { id } = parseParams(req, idParam);
  const post = requirePost(id);
  assertVisible(post, req.user);
  const items = postIcsItems(post, originOf(req));
  if (!items.length) notFound('Calendar event');
  logEvent(req, 'buddy.calendar_export', { entityType: 'buddy_post', entityId: id, props: { count: items.length }, campusId: post.campus_id });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="anwo-buddy-${id.slice(0, 8)}.ics"`);
  res.send(buildIcs(items, 'Anwo · ' + post.title));
});

// ------------------------------------------------------------------ report
router.post('/posts/:id/report', requireAuth, rateLimit('writes'), (req, res) => {
  const { id } = parseParams(req, idParam);
  const post = loadPost(id);
  if (!post) notFound('Buddy post');
  const body = parseBody(req, ReportInput);
  const report = createReport(req, { entityType: 'buddy_post', entityId: id, reason: body.reason, details: body.details ?? null, campusId: post!.campus_id });
  logEvent(req, 'buddy.report', { entityType: 'buddy_post', entityId: id, props: { reason: body.reason }, campusId: post!.campus_id });
  ok(res, report);
});

export default router;
