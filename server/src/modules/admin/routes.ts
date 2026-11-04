// server/src/modules/admin/routes.ts — OWNED BY THE `admin` MODULE AGENT. Mounted at /api/admin (API.md §12).
// Every route is admin-only; every write appends audit_log via audit().
import fs from 'node:fs';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  AdminAuditQuery, AdminCampusPatch, AdminCampusesQuery, AdminEventsQuery, AdminModerationQuery, AdminReportPatch, AdminReportsBulk,
  AdminReportsQuery, AdminUserPatch, AdminUsersBulk, AdminUsersQuery, CampusRequestPatch, CampusRequestsQuery, EXPORT_TABLES, FlagCreate,
  FlagKey, FlagPut, KpiQuery, LOCKED_ON_FLAGS, ModeratedEntityType, ModerationBulk, ModerationInput, OverviewQuery,
  type AdminCampusRequest, type AdminCampusRow, type AdminFlag, type AdminNavCounts, type AdminReportDetail, type ExportTable, type SystemHealth,
} from '@shared/schemas/admin';
import { idParam } from '@shared/schemas/common';
import { q, dbPath } from '../../db';
import { ok, created, paginated, parseBody, parseParams, parseQuery, pageWindow } from '../../lib/http';
import { requireAdmin, signSession, setSessionCookie, loadUser } from '../../lib/auth';
import { ApiError, invalidState } from '../../lib/errors';
import { audit, type AuditRow } from '../../lib/audit';
import { logEvent } from '../../lib/events';
import { notify } from '../../lib/notify';
import { hooks } from '../../lib/hooks';
import { invalidateFlags, publicFlags, toFlagDto, DEFAULT_FLAGS } from '../../lib/flags';
import { invalidateCampuses, toCampusDto, toCampusLite } from '../../lib/campuses';
import { loadUsersPublic, toUserMe, USER_PUBLIC_FROM } from '../../lib/users';
import { lockConversation } from '../../lib/conversations';
import { listJobs } from '../../lib/jobs';
import { nowIso, nowMs, getTimeOffsetSec, DAY, HOUR } from '../../lib/time';
import { broadcast, publishRole, clientCount, onlineUsers } from '../../realtime/hub';
import { config } from '../../config';
import type { CampusRow } from '../../lib/types';
import type { ReportRow } from '../../lib/reports';
import { computeKpis, computeOverview, addDays, todayUtc } from './kpis';
import {
  ADMIN_USER_SELECT, ENTITY, auditDtos, banUser, entityOwnerId, isModerated, loadAdminUser, loadAdminUserDetail, moderationRows, removeEntity,
  setModeration, toAdminReports, toAdminUserRow, toEventDto, unbanUser, type EventRow,
} from './service';

const router = Router();
const STARTED_AT = new Date().toISOString();

router.use(requireAdmin);

const like = (s: string) => `%${s.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
const dayStart = (d: string) => `${d}T00:00:00.000Z`;
const dayEnd = (d: string) => `${addDays(d, 1)}T00:00:00.000Z`;

function queueCount(): number {
  return q.count("SELECT COUNT(*) FROM reports WHERE status IN ('open','in_review')");
}
function pingReportsQueue(delta: number): void {
  publishRole('admin', { type: 'admin.queue', data: { queue: 'reports', delta, count: queueCount() } });
}

// ================================================================== module root / nav / health
router.get('/', (_req, res) => {
  ok(res, { module: 'admin', status: 'ready', endpoints: ['/overview', '/kpis', '/users', '/reports', '/listings', '/moderation/:type', '/flags', '/audit', '/events', '/campuses', '/campus-requests', '/export/:table.csv', '/health', '/nav-counts'] });
});

router.get('/nav-counts', (_req, res) => {
  const counts: AdminNavCounts = {
    pendingVerifications: q.count("SELECT COUNT(*) FROM verification_requests WHERE status IN ('pending','in_review')"),
    openReports: queueCount(),
    flaggedListings: q.count("SELECT COUNT(*) FROM listings WHERE moderation_status = 'flagged' AND status <> 'removed'"),
    flaggedOther:
      q.count("SELECT COUNT(*) FROM market_items WHERE moderation_status = 'flagged' AND status <> 'removed'") +
      q.count("SELECT COUNT(*) FROM buddy_posts WHERE moderation_status = 'flagged' AND status <> 'removed'") +
      q.count("SELECT COUNT(*) FROM wanted_posts WHERE moderation_status = 'flagged' AND status <> 'removed'"),
    openCampusRequests: q.count("SELECT COUNT(*) FROM campus_requests WHERE status = 'open'"),
    disputedEscrows: q.count("SELECT COUNT(*) FROM escrows WHERE status = 'disputed'"),
    pendingPoiSuggestions: q.count("SELECT COUNT(*) FROM poi_suggestions WHERE status = 'pending'"),
    openShuttleRequests: q.count("SELECT COUNT(*) FROM shuttle_requests WHERE status = 'open'"),
  };
  ok(res, counts);
});

const HEALTH_TABLES = ['users', 'campuses', 'listings', 'wanted_posts', 'matches', 'conversations', 'messages', 'market_items', 'buddy_posts', 'orders', 'payments', 'boosts', 'escrows', 'partner_clicks', 'events', 'notifications', 'reports', 'audit_log', 'feature_flags', 'uploads'];
router.get('/health', (_req, res) => {
  const t0 = performance.now();
  q.get('SELECT 1');
  const latencyMs = Math.round((performance.now() - t0) * 100) / 100;
  const integrity = q.get<{ quick_check: string }>('PRAGMA quick_check')?.quick_check ?? 'unknown';
  const path = dbPath();
  const size = (p: string) => {
    try {
      return fs.statSync(p).size;
    } catch {
      return 0;
    }
  };
  const mem = process.memoryUsage();
  const tables = HEALTH_TABLES.map((name) => ({ name, rows: q.count(`SELECT COUNT(*) FROM ${name}`) }));
  const since = (ms: number) => new Date(nowMs() - ms).toISOString();
  const jobs = listJobs().map((j) => ({ name: j.name, everyMs: j.everyMs, lastRunAt: j.lastRunAt, lastError: j.lastError, runs: j.runs }));
  const onlineIds = q.all<{ id: string }>('SELECT id FROM users WHERE last_seen_at > ?', [since(10 * 60_000)]).map((r) => r.id);
  const online = Object.values(onlineUsers(onlineIds)).filter(Boolean).length;
  const migrations = q.all<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name').map((r) => r.name);
  const failingJobs = jobs.filter((j) => j.lastError);
  const checks = [
    { key: 'db', ok: integrity === 'ok', detail: integrity },
    { key: 'latency', ok: latencyMs < 50, detail: `${latencyMs} ms` },
    { key: 'jobs', ok: failingJobs.length === 0, detail: failingJobs.length ? failingJobs.map((j) => j.name).join(', ') : `${jobs.length}` },
    { key: 'jwt', ok: !config.isProd || config.jwtSecret !== 'dev-secret-change-me', detail: config.isProd ? 'production' : 'development' },
    { key: 'geocoder', ok: true, detail: process.env.GEOCODE_OFFLINE === '1' ? 'offline' : 'nominatim' },
  ];
  const health: SystemHealth = {
    status: checks.every((c) => c.ok) ? 'ok' : 'degraded',
    version: config.appVersion,
    env: process.env.NODE_ENV ?? 'development',
    node: process.version,
    uptimeSec: Math.round(process.uptime()),
    startedAt: STARTED_AT,
    serverTime: nowIso(),
    clockOffsetSec: getTimeOffsetSec(),
    memory: { rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576), heapTotalMb: Math.round(mem.heapTotal / 1048576) },
    db: { path: path.split('/').slice(-3).join('/'), sizeBytes: size(path), walBytes: size(`${path}-wal`), migrations, integrity, latencyMs },
    tables,
    ws: { clients: clientCount(), onlineUsers: online },
    jobs,
    traffic: {
      eventsLastHour: q.count('SELECT COUNT(*) FROM events WHERE created_at > ?', [since(HOUR)]),
      eventsLast24h: q.count('SELECT COUNT(*) FROM events WHERE created_at > ?', [since(DAY)]),
      lastEventAt: q.scalar<string>('SELECT MAX(created_at) FROM events') ?? null,
      notificationsLast24h: q.count('SELECT COUNT(*) FROM notifications WHERE created_at > ?', [since(DAY)]),
      auditLast24h: q.count('SELECT COUNT(*) FROM audit_log WHERE created_at > ?', [since(DAY)]),
    },
    checks,
  };
  ok(res, health);
});

// ================================================================== KPIs
router.get('/overview', (req, res) => {
  const p = parseQuery(req, OverviewQuery);
  ok(res, computeOverview(p.campusId));
});

router.get('/kpis', (req, res) => {
  const p = parseQuery(req, KpiQuery);
  ok(res, computeKpis(p));
});

// ================================================================== users
router.get('/users', (req, res) => {
  const p = parseQuery(req, AdminUsersQuery);
  const where: string[] = ['u.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (p.q) where.push("(u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.id = ?)"), params.push(like(p.q), like(p.q), p.q);
  if (p.role) where.push('u.role = ?'), params.push(p.role);
  if (p.trustLevel !== undefined) where.push('u.trust_level = ?'), params.push(p.trustLevel);
  if (p.campusId) where.push('u.campus_id = ?'), params.push(p.campusId);
  if (p.banned !== undefined) where.push('u.banned = ?'), params.push(p.banned ? 1 : 0);
  const w = where.join(' AND ');
  const total = q.count(`SELECT COUNT(*) FROM users u WHERE ${w}`, params as never);
  const order = p.sort === 'name' ? 'u.name COLLATE NOCASE ASC' : p.sort === 'active' ? 'last_active_at IS NULL, last_active_at DESC' : 'u.created_at DESC';
  const { limit, offset } = pageWindow(p);
  const rows = q.all<Parameters<typeof toAdminUserRow>[0]>(`SELECT ${ADMIN_USER_SELECT} FROM ${USER_PUBLIC_FROM} WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset] as never);
  paginated(res, { items: rows.map(toAdminUserRow), total, page: p.page, pageSize: p.pageSize });
});

router.post('/users/bulk', (req, res) => {
  const body = parseBody(req, AdminUsersBulk);
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of body.ids) {
    try {
      if (body.action === 'ban') banUser(req, id, body.reason);
      else unbanUser(req, id, body.reason);
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: e instanceof ApiError ? e.code : 'INTERNAL' });
    }
  }
  logEvent(req, `admin.users_${body.action}`, { props: { count: results.filter((r) => r.ok).length } });
  ok(res, { results, succeeded: results.filter((r) => r.ok).length });
});

router.get('/users/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const u = loadAdminUserDetail(id);
  if (!u) throw new ApiError('NOT_FOUND', 'User not found');
  ok(res, u);
});

function roleZh(r: string): string {
  return r === 'admin' ? '管理员' : r === 'landlord' ? '房东' : '学生';
}

router.patch('/users/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, AdminUserPatch);
  const cur = q.get<{ id: string; role: string; campus_id: string | null; listing_quota: number; banned: number }>('SELECT id, role, campus_id, listing_quota, banned FROM users WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!cur) throw new ApiError('NOT_FOUND', 'User not found');
  const now = nowIso();
  if (body.role !== undefined && body.role !== cur.role) {
    if (id === req.user!.id) throw new ApiError('FORBIDDEN', 'You cannot change your own role');
    q.run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [body.role, now, id]);
    audit(req, { action: 'user.role', entityType: 'user', entityId: id, before: { role: cur.role }, after: { role: body.role }, reason: body.reason });
    notify(id, 'system', {
      title: { zh: `你的账号角色已更新为「${roleZh(body.role)}」`, en: `Your account role is now ${body.role}` },
      body: { zh: `说明：${body.reason}`, en: `Note: ${body.reason}` },
      link: '/settings',
      entityType: 'user',
      entityId: id,
    });
  }
  if (body.campusId !== undefined && body.campusId !== cur.campus_id) {
    if (body.campusId && !toCampusLite(body.campusId)) throw new ApiError('VALIDATION', 'Unknown campus', { fields: { campusId: 'Unknown campus' } });
    q.run('UPDATE users SET campus_id = ?, updated_at = ? WHERE id = ?', [body.campusId, now, id]);
    audit(req, { action: 'user.campus', entityType: 'user', entityId: id, before: { campusId: cur.campus_id }, after: { campusId: body.campusId }, reason: body.reason });
    hooks.emit('user.campusChanged', { userId: id, from: cur.campus_id, to: body.campusId });
  }
  if (body.listingQuota !== undefined && body.listingQuota !== cur.listing_quota) {
    q.run('UPDATE users SET listing_quota = ?, updated_at = ? WHERE id = ?', [body.listingQuota, now, id]);
    audit(req, { action: 'user.quota', entityType: 'user', entityId: id, before: { listingQuota: cur.listing_quota }, after: { listingQuota: body.listingQuota }, reason: body.reason });
  }
  if (body.banned === true && cur.banned !== 1) {
    banUser(req, id, body.bannedReason || body.reason);
    logEvent(req, 'admin.user_ban', { entityType: 'user', entityId: id });
  } else if (body.banned === false && cur.banned === 1) {
    unbanUser(req, id, body.reason);
    logEvent(req, 'admin.user_unban', { entityType: 'user', entityId: id });
  }
  ok(res, loadAdminUser(id));
});

router.post('/users/:id/impersonate', async (req, res) => {
  if (config.isProd) throw new ApiError('NOT_FOUND');
  const { id } = parseParams(req, idParam);
  const u = loadUser(id);
  if (!u) throw new ApiError('NOT_FOUND', 'User not found');
  if (u.role === 'admin') throw new ApiError('FORBIDDEN', 'Cannot impersonate another admin');
  audit(req, { action: 'user.impersonate', entityType: 'user', entityId: id, reason: 'dev impersonation' });
  setSessionCookie(res, await signSession(u));
  ok(res, toUserMe(u));
});

// ================================================================== reports
router.get('/reports', (req, res) => {
  const p = parseQuery(req, AdminReportsQuery);
  const where: string[] = ['1 = 1'];
  const params: unknown[] = [];
  if (p.status === 'pending') where.push("r.status IN ('open','in_review')");
  else if (p.status !== 'all') where.push('r.status = ?'), params.push(p.status);
  if (p.entityType) where.push('r.entity_type = ?'), params.push(p.entityType);
  if (p.reason) where.push('r.reason = ?'), params.push(p.reason);
  if (p.campusId) where.push('r.campus_id = ?'), params.push(p.campusId);
  const w = where.join(' AND ');
  const total = q.count(`SELECT COUNT(*) FROM reports r WHERE ${w}`, params as never);
  const order =
    p.sort === 'newest'
      ? 'r.created_at DESC'
      : p.sort === 'count'
        ? "(SELECT COUNT(*) FROM reports x WHERE x.entity_type = r.entity_type AND x.entity_id = r.entity_id AND x.status IN ('open','in_review')) DESC, r.created_at ASC"
        : "CASE WHEN r.status IN ('open','in_review') AND r.reason = 'scam' THEN 0 ELSE 1 END, r.created_at ASC";
  const { limit, offset } = pageWindow(p);
  const rows = q.all<ReportRow>(`SELECT r.* FROM reports r WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset] as never);
  const byStatus: Record<string, number> = {};
  for (const s of q.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM reports GROUP BY status')) byStatus[s.status] = s.n;
  paginated(res, { items: toAdminReports(rows), total, page: p.page, pageSize: p.pageSize }, { byStatus });
});

function notifyReporter(r: ReportRow, outcome: 'actioned' | 'dismissed'): void {
  if (!r.reporter_id) return;
  notify(r.reporter_id, 'report.actioned', {
    title:
      outcome === 'actioned'
        ? { zh: '你的举报已处理，感谢你让社区更安全。', en: 'Your report was actioned. Thanks for keeping the community safe.' }
        : { zh: '你的举报已审核', en: 'Your report was reviewed' },
    body:
      outcome === 'actioned'
        ? { zh: '我们已对相关内容采取措施。', en: 'We took action on the content you reported.' }
        : { zh: '这次没有发现违反社区规范的内容。如有新情况，欢迎再次举报。', en: 'We did not find a violation this time. Report again if anything changes.' },
    link: '/notifications',
    entityType: r.entity_type,
    entityId: r.entity_id,
    data: { reportId: r.id, outcome },
  });
}

router.post('/reports/bulk', (req, res) => {
  const body = parseBody(req, AdminReportsBulk);
  const now = nowIso();
  let updated = 0;
  q.tx(() => {
    for (const id of body.ids) {
      const r = q.get<ReportRow>('SELECT * FROM reports WHERE id = ?', [id]);
      if (!r || !['open', 'in_review'].includes(r.status) || r.status === body.status) continue;
      const dismiss = body.status === 'dismissed';
      q.run('UPDATE reports SET status = ?, reviewer_id = ?, resolution = ?, reviewed_at = ? WHERE id = ?', [
        body.status, req.user!.id, dismiss ? body.reason : r.resolution, dismiss ? now : r.reviewed_at, id,
      ]);
      audit(req, { action: dismiss ? 'report.dismiss' : 'report.claim', entityType: 'report', entityId: id, before: { status: r.status }, after: { status: body.status }, reason: body.reason });
      if (dismiss) notifyReporter(r, 'dismissed');
      updated++;
    }
  });
  if (updated) pingReportsQueue(body.status === 'dismissed' ? -updated : 0);
  logEvent(req, 'admin.reports_bulk', { props: { status: body.status, count: updated } });
  ok(res, { updated });
});

function reportDetail(id: string): AdminReportDetail {
  const r = q.get<ReportRow>('SELECT * FROM reports WHERE id = ?', [id]);
  if (!r) throw new ApiError('NOT_FOUND', 'Report not found');
  const [base] = toAdminReports([r]);
  const related = toAdminReports(q.all<ReportRow>('SELECT * FROM reports WHERE entity_type = ? AND entity_id = ? AND id <> ? ORDER BY created_at DESC LIMIT 20', [r.entity_type, r.entity_id, id]));
  const history = auditDtos(
    q.all<AuditRow>(
      "SELECT * FROM audit_log WHERE (entity_type = 'report' AND entity_id = ?) OR (entity_type = ? AND entity_id = ?) ORDER BY created_at DESC LIMIT 30",
      [id, r.entity_type, r.entity_id],
    ),
  );
  let messages: AdminReportDetail['messages'];
  const convId =
    r.entity_type === 'conversation' ? r.entity_id : r.entity_type === 'message' ? q.get<{ c: string }>('SELECT conversation_id AS c FROM messages WHERE id = ?', [r.entity_id])?.c : undefined;
  if (convId) {
    messages = q
      .all<{ id: string; name: string | null; body: string | null; created_at: string; deleted_at: string | null }>(
        "SELECT m.id, u.name, m.body, m.created_at, m.deleted_at FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = ? AND m.kind <> 'system' ORDER BY m.created_at DESC LIMIT 30",
        [convId],
      )
      .reverse()
      .map((m) => ({ id: m.id, senderName: m.name, body: m.body, createdAt: m.created_at, deletedAt: m.deleted_at }));
  }
  return { ...base!, related, history, messages };
}

router.get('/reports/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const d = reportDetail(id);
  // Reading a private conversation is logged (requirements §6: linked conversation viewer is read-only + logged).
  if (d.messages) audit(req, { action: 'report.view_conversation', entityType: 'report', entityId: id, reason: 'moderation review' });
  ok(res, d);
});

function applyReportAction(req: Request, r: ReportRow, type: string, reason: string): string {
  const et = r.entity_type;
  const eid = r.entity_id;
  switch (type) {
    case 'none':
      return 'none';
    case 'hide':
      if (isModerated(et)) {
        setModeration(req, et, eid, 'hidden', reason);
        return 'hidden';
      }
      if (et === 'message') return applyReportAction(req, r, 'delete_message', reason);
      if (et === 'conversation') return applyReportAction(req, r, 'lock_conversation', reason);
      if (et === 'user') return applyReportAction(req, r, 'ban_user', reason);
      throw new ApiError('BAD_REQUEST', `Cannot hide a ${et}`);
    case 'remove':
      if (isModerated(et)) {
        removeEntity(req, et, eid, reason);
        return 'removed';
      }
      if (et === 'message') return applyReportAction(req, r, 'delete_message', reason);
      throw new ApiError('BAD_REQUEST', `Cannot remove a ${et}`);
    case 'ban_user': {
      const owner = entityOwnerId(et, eid);
      if (!owner) throw new ApiError('BAD_REQUEST', 'No owner to ban');
      banUser(req, owner, reason);
      return 'banned';
    }
    case 'warn_user': {
      const owner = entityOwnerId(et, eid);
      if (!owner) throw new ApiError('BAD_REQUEST', 'No owner to warn');
      notify(owner, 'system', {
        title: { zh: '社区规范提醒', en: 'Community guidelines reminder' },
        body: { zh: `我们收到了关于你内容的举报：${reason}。再次违规可能导致内容下架或账号停用。`, en: `We received a report about your content: ${reason}. Repeat violations may lead to removal or suspension.` },
        link: '/safety',
        entityType: et,
        entityId: eid,
        data: { reportId: r.id },
      });
      audit(req, { action: 'user.warn', entityType: 'user', entityId: owner, after: { reportId: r.id }, reason });
      return 'warned';
    }
    case 'lock_conversation': {
      const cid = et === 'conversation' ? eid : et === 'message' ? q.get<{ c: string }>('SELECT conversation_id AS c FROM messages WHERE id = ?', [eid])?.c : null;
      if (!cid) throw new ApiError('BAD_REQUEST', 'No conversation to lock');
      lockConversation(cid, true);
      audit(req, { action: 'conversation.lock', entityType: 'conversation', entityId: cid, before: { locked: false }, after: { locked: true }, reason });
      return 'locked';
    }
    case 'delete_message': {
      if (et !== 'message') throw new ApiError('BAD_REQUEST', 'Not a message');
      const m = q.get<{ deleted_at: string | null }>('SELECT deleted_at FROM messages WHERE id = ?', [eid]);
      if (!m) throw new ApiError('NOT_FOUND', 'Message not found');
      if (!m.deleted_at) {
        q.run('UPDATE messages SET deleted_at = ? WHERE id = ?', [nowIso(), eid]);
        audit(req, { action: 'message.delete', entityType: 'message', entityId: eid, before: { deleted: false }, after: { deleted: true }, reason });
      }
      return 'message_deleted';
    }
    default:
      throw new ApiError('BAD_REQUEST', 'Unknown action');
  }
}

router.patch('/reports/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, AdminReportPatch);
  const r = q.get<ReportRow>('SELECT * FROM reports WHERE id = ?', [id]);
  if (!r) throw new ApiError('NOT_FOUND', 'Report not found');
  if (!['open', 'in_review'].includes(r.status) || r.status === body.status) invalidState(r.status, body.status);
  if (body.status === 'actioned' && !body.action) throw new ApiError('VALIDATION', 'An action is required', { fields: { 'action.type': 'Required' } });
  const now = nowIso();
  let outcome: string | null = body.resolution ?? null;
  let siblings: ReportRow[] = [];
  q.tx(() => {
    if (body.status === 'actioned' && body.action) {
      const applied = applyReportAction(req, r, body.action.type, body.action.reason);
      outcome = body.resolution || applied;
    }
    if (body.status === 'dismissed') outcome = body.resolution || body.action?.reason || 'dismissed';
    q.run('UPDATE reports SET status = ?, reviewer_id = ?, resolution = ?, reviewed_at = ? WHERE id = ?', [body.status, req.user!.id, outcome, body.status === 'in_review' ? null : now, id]);
    audit(req, {
      action: body.status === 'in_review' ? 'report.claim' : body.status === 'dismissed' ? 'report.dismiss' : 'report.action',
      entityType: 'report',
      entityId: id,
      before: { status: r.status },
      after: { status: body.status, action: body.action?.type ?? null, entityType: r.entity_type, entityId: r.entity_id, resolution: outcome },
      reason: body.action?.reason ?? body.resolution ?? null,
    });
    // Actioning an entity closes its other pending reports too (their reporters hear the same outcome).
    if (body.status === 'actioned') {
      siblings = q.all<ReportRow>("SELECT * FROM reports WHERE entity_type = ? AND entity_id = ? AND id <> ? AND status IN ('open','in_review')", [r.entity_type, r.entity_id, id]);
      for (const s of siblings) q.run('UPDATE reports SET status = ?, reviewer_id = ?, resolution = ?, reviewed_at = ? WHERE id = ?', ['actioned', req.user!.id, `merged:${id}`, now, s.id]);
    }
  });
  if (body.status !== 'in_review') notifyReporter(r, body.status === 'actioned' ? 'actioned' : 'dismissed');
  for (const s of siblings) notifyReporter(s, 'actioned');
  logEvent(req, 'admin.report_resolve', { entityType: 'report', entityId: id, props: { status: body.status, action: body.action?.type ?? null, entityType: r.entity_type } });
  pingReportsQueue(body.status === 'in_review' ? 0 : -(1 + siblings.length));
  ok(res, reportDetail(id));
});

// ================================================================== moderation (listings + generic)
type ModRow = Parameters<typeof moderationRows>[1][number];
function modSelect(type: ModeratedEntityType): string {
  const cfg = ENTITY[type];
  return `e.id, e.title, ${cfg.subtitle} AS sub, e.status, e.moderation_status, ${type === 'listing' ? 'e.moderation_note' : 'NULL'} AS moderation_note,
          ${cfg.priceCol ? `e.${cfg.priceCol}` : 'NULL'} AS price, e.view_count, e.${cfg.ownerCol} AS owner, e.campus_id, e.created_at,
          (SELECT COUNT(*) FROM reports r WHERE r.entity_type = '${type}' AND r.entity_id = e.id) AS n_reports,
          (SELECT COUNT(*) FROM reports r WHERE r.entity_type = '${type}' AND r.entity_id = e.id AND r.status IN ('open','in_review')) AS n_open,
          EXISTS (SELECT 1 FROM boosts b WHERE b.entity_type = '${type}' AND b.entity_id = e.id AND b.status = 'active' AND b.ends_at > ?) AS boosted`;
}

function moderationList(req: Request, res: Response, type: ModeratedEntityType) {
  const p = parseQuery(req, AdminModerationQuery);
  const cfg = ENTITY[type];
  const where: string[] = ['1 = 1'];
  const params: unknown[] = [];
  if (p.q) where.push("(e.title LIKE ? ESCAPE '\\' OR e.id = ?)"), params.push(like(p.q), p.q);
  if (p.status) where.push('e.status = ?'), params.push(p.status);
  if (p.moderationStatus) where.push('e.moderation_status = ?'), params.push(p.moderationStatus);
  if (p.flaggedOnly) where.push("e.moderation_status <> 'ok'");
  if (p.campusId) where.push('e.campus_id = ?'), params.push(p.campusId);
  if (p.ownerId) where.push(`e.${cfg.ownerCol} = ?`), params.push(p.ownerId);
  const w = where.join(' AND ');
  const total = q.count(`SELECT COUNT(*) FROM ${cfg.table} e WHERE ${w}`, params as never);
  const order =
    p.sort === 'reports' ? 'n_open DESC, n_reports DESC, e.created_at DESC' : p.sort === 'views' ? 'e.view_count DESC' : p.sort === 'price' && cfg.priceCol ? `e.${cfg.priceCol} DESC` : 'e.created_at DESC';
  const { limit, offset } = pageWindow(p);
  const rows = q.all<ModRow>(`SELECT ${modSelect(type)} FROM ${cfg.table} e WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, [nowIso(), ...params, limit, offset] as never);
  const counts: Record<string, number> = {};
  for (const c of q.all<{ m: string; n: number }>(`SELECT moderation_status AS m, COUNT(*) AS n FROM ${cfg.table} WHERE status <> 'removed' GROUP BY moderation_status`)) counts[c.m] = c.n;
  paginated(res, { items: moderationRows(type, rows), total, page: p.page, pageSize: p.pageSize }, { moderationCounts: counts });
}

function moderationRowById(type: ModeratedEntityType, id: string) {
  const row = q.get<ModRow>(`SELECT ${modSelect(type)} FROM ${ENTITY[type].table} e WHERE e.id = ?`, [nowIso(), id]);
  if (!row) throw new ApiError('NOT_FOUND');
  return moderationRows(type, [row])[0];
}

const TypeParam = z.object({ entityType: z.enum(ModeratedEntityType) });
const TypeIdParam = TypeParam.extend({ id: z.string().min(1).max(128) });

function moderateOne(req: Request, type: ModeratedEntityType, id: string, body: z.infer<typeof ModerationInput>) {
  const r = setModeration(req, type, id, body.moderationStatus, body.reason, body.note);
  if (r.changed) logEvent(req, 'admin.moderate', { entityType: type, entityId: id, props: { to: body.moderationStatus } });
  return r;
}

router.get('/listings', (req, res) => moderationList(req, res, 'listing'));
router.patch('/listings/:id/moderation', (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, ModerationInput);
  moderateOne(req, 'listing', id, body);
  ok(res, moderationRowById('listing', id));
});

router.get('/moderation/:entityType', (req, res) => {
  const { entityType } = parseParams(req, TypeParam);
  moderationList(req, res, entityType);
});
router.post('/moderation/:entityType/bulk', (req, res) => {
  const { entityType } = parseParams(req, TypeParam);
  const body = parseBody(req, ModerationBulk);
  let updated = 0;
  q.tx(() => {
    for (const id of body.ids) if (moderateOne(req, entityType, id, body).changed) updated++;
  });
  ok(res, { updated });
});
router.patch('/moderation/:entityType/:id', (req, res) => {
  const { entityType, id } = parseParams(req, TypeIdParam);
  const body = parseBody(req, ModerationInput);
  moderateOne(req, entityType, id, body);
  ok(res, moderationRowById(entityType, id));
});

// ================================================================== feature flags
type FlagRow = Parameters<typeof toFlagDto>[0];
function adminFlags(): AdminFlag[] {
  const rows = q.all<FlagRow>('SELECT * FROM feature_flags ORDER BY key');
  const users = loadUsersPublic(rows.map((r) => r.updated_by).filter((x): x is string => !!x));
  return rows.map((r) => ({ ...toFlagDto(r), updatedByUser: r.updated_by ? users.get(r.updated_by) ?? null : null, locked: LOCKED_ON_FLAGS.includes(r.key) }));
}
function flagsChanged(key: string): void {
  invalidateFlags();
  broadcast({ type: 'system.flags', data: publicFlags() });
  hooks.emit('flags.changed', { key });
}
function flagSnapshot(key: string) {
  const r = q.get<FlagRow>('SELECT * FROM feature_flags WHERE key = ?', [key]);
  return r ? toFlagDto(r) : null;
}

router.get('/flags', (_req, res) => {
  ok(res, adminFlags());
});

router.post('/flags', (req, res) => {
  const body = parseBody(req, FlagCreate);
  if (flagSnapshot(body.key)) throw new ApiError('CONFLICT', 'Flag already exists', { fields: { key: 'Already exists' } });
  for (const c of body.campusIds ?? []) if (!toCampusLite(c)) throw new ApiError('VALIDATION', 'Unknown campus', { fields: { campusIds: `Unknown campus ${c}` } });
  q.insert('feature_flags', {
    key: body.key, enabled: body.enabled ? 1 : 0, value_json: JSON.stringify(body.value ?? null), description: body.description ?? null,
    campus_ids_json: JSON.stringify(body.campusIds ?? []), updated_by: req.user!.id, updated_at: nowIso(),
  });
  audit(req, { action: 'flag.create', entityType: 'feature_flag', entityId: body.key, before: null, after: flagSnapshot(body.key), reason: body.reason ?? null });
  logEvent(req, 'admin.flag_update', { entityType: 'feature_flag', entityId: body.key, props: { enabled: body.enabled, created: true } });
  flagsChanged(body.key);
  created(res, adminFlags().find((f) => f.key === body.key));
});

router.put('/flags/:key', (req, res) => {
  const { key } = parseParams(req, z.object({ key: FlagKey }));
  const body = parseBody(req, FlagPut);
  const before = flagSnapshot(key);
  if (LOCKED_ON_FLAGS.includes(key) && !body.enabled) throw new ApiError('INVALID_STATE', 'This safety flag cannot be turned off', { data: { from: 'on', to: 'off' } });
  for (const c of body.campusIds ?? []) if (!toCampusLite(c)) throw new ApiError('VALIDATION', 'Unknown campus', { fields: { campusIds: `Unknown campus ${c}` } });
  const row = {
    enabled: body.enabled ? 1 : 0,
    value_json: JSON.stringify(body.value === undefined ? before?.value ?? null : body.value),
    description: body.description ?? before?.description ?? DEFAULT_FLAGS.find((f) => f.key === key)?.description ?? null,
    campus_ids_json: JSON.stringify(body.campusIds ?? before?.campusIds ?? []),
    updated_by: req.user!.id,
    updated_at: nowIso(),
  };
  if (before) q.update('feature_flags', row, 'key = ?', [key]);
  else q.insert('feature_flags', { key, ...row });
  audit(req, { action: 'flag.update', entityType: 'feature_flag', entityId: key, before, after: flagSnapshot(key), reason: body.reason ?? null });
  logEvent(req, 'admin.flag_update', { entityType: 'feature_flag', entityId: key, props: { enabled: body.enabled } });
  flagsChanged(key);
  ok(res, adminFlags().find((f) => f.key === key));
});

router.delete('/flags/:key', (req, res) => {
  const { key } = parseParams(req, z.object({ key: FlagKey }));
  const before = flagSnapshot(key);
  if (!before) throw new ApiError('NOT_FOUND', 'Flag not found');
  if (LOCKED_ON_FLAGS.includes(key) || DEFAULT_FLAGS.some((f) => f.key === key)) throw new ApiError('FORBIDDEN', 'Core flags cannot be deleted');
  q.run('DELETE FROM feature_flags WHERE key = ?', [key]);
  audit(req, { action: 'flag.delete', entityType: 'feature_flag', entityId: key, before, after: null, reason: typeof req.query.reason === 'string' ? req.query.reason.slice(0, 500) : null });
  flagsChanged(key);
  ok(res, { deleted: key });
});

// ================================================================== audit + events
router.get('/audit', (req, res) => {
  const p = parseQuery(req, AdminAuditQuery);
  const where: string[] = ['1 = 1'];
  const params: unknown[] = [];
  if (p.action) {
    if (p.action.endsWith('.*')) where.push("a.action LIKE ? ESCAPE '\\'"), params.push(`${p.action.slice(0, -2).replace(/[%_\\]/g, (m) => `\\${m}`)}.%`);
    else where.push('a.action = ?'), params.push(p.action);
  }
  if (p.actorId) where.push('a.actor_id = ?'), params.push(p.actorId);
  if (p.entityType) where.push('a.entity_type = ?'), params.push(p.entityType);
  if (p.entityId) where.push('a.entity_id = ?'), params.push(p.entityId);
  if (p.q) where.push("(a.action LIKE ? ESCAPE '\\' OR a.reason LIKE ? ESCAPE '\\' OR a.entity_id = ?)"), params.push(like(p.q), like(p.q), p.q);
  if (p.from) where.push('a.created_at >= ?'), params.push(dayStart(p.from));
  if (p.to) where.push('a.created_at < ?'), params.push(dayEnd(p.to));
  const w = where.join(' AND ');
  const total = q.count(`SELECT COUNT(*) FROM audit_log a WHERE ${w}`, params as never);
  const { limit, offset } = pageWindow(p);
  const rows = q.all<AuditRow>(`SELECT a.* FROM audit_log a WHERE ${w} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset] as never);
  const actions = q.all<{ action: string; n: number }>('SELECT action, COUNT(*) AS n FROM audit_log GROUP BY action ORDER BY n DESC LIMIT 60');
  paginated(res, { items: auditDtos(rows), total, page: p.page, pageSize: p.pageSize }, { actions });
});

router.get('/events', (req, res) => {
  const p = parseQuery(req, AdminEventsQuery);
  const to = p.to ?? todayUtc();
  let from = p.from ?? addDays(to, -6);
  if (Date.parse(to) - Date.parse(from) > 6 * DAY || from > to) from = addDays(to, -6);
  const where: string[] = ['e.created_at >= ?', 'e.created_at < ?'];
  const params: unknown[] = [dayStart(from), dayEnd(to)];
  if (p.type) {
    if (p.type.endsWith('.*')) where.push('e.type LIKE ?'), params.push(`${p.type.slice(0, -2)}.%`);
    else where.push('e.type = ?'), params.push(p.type);
  }
  if (p.userId) where.push('e.user_id = ?'), params.push(p.userId);
  if (p.entityType) where.push('e.entity_type = ?'), params.push(p.entityType);
  if (p.entityId) where.push('e.entity_id = ?'), params.push(p.entityId);
  if (p.campusId) where.push('e.campus_id = ?'), params.push(p.campusId);
  const w = where.join(' AND ');
  const total = q.count(`SELECT COUNT(*) FROM events e WHERE ${w}`, params as never);
  const { limit, offset } = pageWindow(p);
  const rows = q.all<EventRow>(`SELECT e.* FROM events e WHERE ${w} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset] as never);
  const users = loadUsersPublic(rows.map((r) => r.user_id).filter((x): x is string => !!x));
  const types = q.all<{ type: string; n: number }>('SELECT e.type, COUNT(*) AS n FROM events e WHERE e.created_at >= ? AND e.created_at < ? GROUP BY e.type ORDER BY n DESC', [dayStart(from), dayEnd(to)]);
  paginated(
    res,
    { items: rows.map((r) => ({ ...toEventDto(r), user: r.user_id ? users.get(r.user_id) ?? null : null, campus: toCampusLite(r.campus_id) })), total, page: p.page, pageSize: p.pageSize },
    { from, to, types },
  );
});

// ================================================================== campuses
router.get('/campuses', (req, res) => {
  const p = parseQuery(req, AdminCampusesQuery);
  const where: string[] = ['1 = 1'];
  const params: unknown[] = [];
  if (p.q)
    where.push("(c.name LIKE ? ESCAPE '\\' OR c.short_name LIKE ? ESCAPE '\\' OR c.city LIKE ? ESCAPE '\\' OR c.state = ? OR c.name_zh LIKE ? ESCAPE '\\')"),
      params.push(like(p.q), like(p.q), like(p.q), p.q.toUpperCase(), like(p.q));
  if (p.active !== 'all') where.push('c.is_active = ?'), params.push(p.active === 'active' ? 1 : 0);
  const w = where.join(' AND ');
  const total = q.count(`SELECT COUNT(*) FROM campuses c WHERE ${w}`, params as never);
  const order = p.sort === 'name' ? 'c.name COLLATE NOCASE' : p.sort === 'users' ? 'n_users DESC, c.sort_order' : p.sort === 'listings' ? 'n_listings DESC, c.sort_order' : 'c.sort_order, c.intl_students DESC';
  const { limit, offset } = pageWindow(p);
  const rows = q.all<CampusRow & { n_users: number; n_listings: number; n_items: number; n_buddy: number; n_wanted: number; n_mau: number; n_reports: number }>(
    `SELECT c.*, (SELECT COUNT(*) FROM users u WHERE u.campus_id = c.id AND u.deleted_at IS NULL) AS n_users,
            (SELECT COUNT(*) FROM listings l WHERE l.campus_id = c.id AND l.status = 'active') AS n_listings,
            (SELECT COUNT(*) FROM market_items m WHERE m.campus_id = c.id AND m.status IN ('active','reserved')) AS n_items,
            (SELECT COUNT(*) FROM buddy_posts b WHERE b.campus_id = c.id AND b.status IN ('open','full')) AS n_buddy,
            (SELECT COUNT(*) FROM wanted_posts w WHERE w.campus_id = c.id AND w.status = 'active') AS n_wanted,
            (SELECT COUNT(DISTINCT e.user_id) FROM events e WHERE e.campus_id = c.id AND e.created_at > ?) AS n_mau,
            (SELECT COUNT(*) FROM reports r WHERE r.campus_id = c.id AND r.status IN ('open','in_review')) AS n_reports
       FROM campuses c WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [new Date(nowMs() - 30 * DAY).toISOString(), ...params, limit, offset] as never,
  );
  const items: AdminCampusRow[] = rows.map((r) => ({
    ...toCampusDto(r),
    shuttleOfficialUrl: r.shuttle_official_url,
    stats: { users: r.n_users, listingsActive: r.n_listings, itemsActive: r.n_items, buddyOpen: r.n_buddy, wantedActive: r.n_wanted, mau: r.n_mau, openReports: r.n_reports },
  }));
  const counts = { all: q.count('SELECT COUNT(*) FROM campuses'), active: q.count('SELECT COUNT(*) FROM campuses WHERE is_active = 1') };
  paginated(res, { items, total, page: p.page, pageSize: p.pageSize }, { counts });
});

router.patch('/campuses/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, AdminCampusPatch);
  const cur = q.get<CampusRow>('SELECT * FROM campuses WHERE id = ?', [id]);
  if (!cur) throw new ApiError('NOT_FOUND', 'Campus not found');
  const set: Record<string, string | number | null> = {};
  if (body.name !== undefined) set.name = body.name;
  if (body.nameZh !== undefined) set.name_zh = body.nameZh;
  if (body.shortName !== undefined) set.short_name = body.shortName;
  if (body.eduDomains !== undefined) set.edu_domains_json = JSON.stringify([...new Set(body.eduDomains)]);
  if (body.hasShuttle !== undefined) set.has_shuttle = body.hasShuttle ? 1 : 0;
  if (body.shuttleOfficialUrl !== undefined) set.shuttle_official_url = body.shuttleOfficialUrl;
  if (body.defaultRadiusM !== undefined) set.default_radius_m = body.defaultRadiusM;
  if (body.isActive !== undefined) set.is_active = body.isActive ? 1 : 0;
  if (body.sortOrder !== undefined) set.sort_order = body.sortOrder;
  if (!Object.keys(set).length) throw new ApiError('VALIDATION', 'Nothing to change', { fields: { name: 'Nothing to change' } });
  set.updated_at = nowIso();
  q.update('campuses', set, 'id = ?', [id]);
  invalidateCampuses();
  const after = q.get<CampusRow>('SELECT * FROM campuses WHERE id = ?', [id])!;
  const changed = Object.keys(set).filter((k) => k !== 'updated_at');
  const pick = (r: CampusRow) => Object.fromEntries(changed.map((k) => [k, (r as unknown as Record<string, unknown>)[k]]));
  const action = body.isActive !== undefined && changed.length === 1 ? (body.isActive ? 'campus.activate' : 'campus.deactivate') : 'campus.update';
  audit(req, { action, entityType: 'campus', entityId: id, before: pick(cur), after: pick(after), reason: body.reason ?? null });
  ok(res, { ...toCampusDto(after), shuttleOfficialUrl: after.shuttle_official_url });
});

type CampusRequestRow = { id: string; user_id: string | null; school_name: string; city: string | null; state: string | null; email: string | null; note: string | null; status: AdminCampusRequest['status']; created_at: string };
router.get('/campus-requests', (req, res) => {
  const p = parseQuery(req, CampusRequestsQuery);
  const where = p.status === 'all' ? '1 = 1' : 'cr.status = ?';
  const params = p.status === 'all' ? [] : [p.status];
  const total = q.count(`SELECT COUNT(*) FROM campus_requests cr WHERE ${where}`, params);
  const { limit, offset } = pageWindow(p);
  const rows = q.all<CampusRequestRow & { similar: number }>(
    `SELECT cr.*, (SELECT COUNT(*) FROM campus_requests x WHERE lower(trim(x.school_name)) = lower(trim(cr.school_name))) AS similar
       FROM campus_requests cr WHERE ${where} ORDER BY similar DESC, cr.created_at ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const users = loadUsersPublic(rows.map((r) => r.user_id).filter((x): x is string => !!x));
  const items: AdminCampusRequest[] = rows.map((r) => ({
    id: r.id, userId: r.user_id, user: r.user_id ? users.get(r.user_id) ?? null : null, schoolName: r.school_name, city: r.city, state: r.state,
    email: r.email, note: r.note, status: r.status, createdAt: r.created_at, similarCount: r.similar,
  }));
  const counts: Record<string, number> = {};
  for (const c of q.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM campus_requests GROUP BY status')) counts[c.status] = c.n;
  paginated(res, { items, total, page: p.page, pageSize: p.pageSize }, { counts });
});

router.patch('/campus-requests/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, CampusRequestPatch);
  const cur = q.get<CampusRequestRow>('SELECT * FROM campus_requests WHERE id = ?', [id]);
  if (!cur) throw new ApiError('NOT_FOUND', 'Request not found');
  if (cur.status !== body.status) {
    q.run('UPDATE campus_requests SET status = ? WHERE id = ?', [body.status, id]);
    audit(req, { action: 'campus_request.update', entityType: 'campus_request', entityId: id, before: { status: cur.status }, after: { status: body.status }, reason: body.note ?? null });
    if (cur.user_id && body.status !== 'open') {
      const added = body.status === 'added';
      notify(cur.user_id, 'system', {
        title: added ? { zh: `${cur.school_name} 已上线`, en: `${cur.school_name} is now on Anwo` } : { zh: `关于你申请的 ${cur.school_name}`, en: `About your request for ${cur.school_name}` },
        body: added
          ? { zh: '去切换校区，看看附近的房源和搭子吧。', en: 'Switch campus to see sublets and buddies nearby.' }
          : { zh: body.note || '暂时还不能开通这个校区，我们会持续关注。', en: body.note || 'We can’t open this campus yet, but it stays on our list.' },
        link: added ? '/welcome' : '/help#campus-request',
        entityType: 'campus_request',
        entityId: id,
      });
    }
  }
  const r = q.get<CampusRequestRow>('SELECT * FROM campus_requests WHERE id = ?', [id])!;
  ok(res, { id: r.id, userId: r.user_id, schoolName: r.school_name, city: r.city, state: r.state, email: r.email, note: r.note, status: r.status, createdAt: r.created_at });
});

// ================================================================== CSV export
const EXPORT_COLUMNS: Record<ExportTable, string> = {
  events: 'id, created_at, type, user_id, session_id, campus_id, entity_type, entity_id, path, props_json',
  orders: 'id, created_at, user_id, campus_id, kind, status, entity_type, entity_id, subtotal_cents, discount_cents, credit_cents, fee_cents, total_cents, paid_at',
  payments: 'id, created_at, order_id, provider, status, amount_cents, refunded_cents, method_brand, succeeded_at',
  partner_clicks: 'id, created_at, partner_id, user_id, campus_id, placement, converted, payout_cents',
  listings: 'id, created_at, published_at, owner_id, campus_id, title, city, state, price_cents, status, moderation_status, view_count, save_count',
  users: 'id, created_at, email, name, role, trust_level, campus_id, locale, banned, email_verified_at, id_verified_at, phone_verified_at, last_seen_at',
  reports: 'id, created_at, reporter_id, entity_type, entity_id, campus_id, reason, status, reviewer_id, resolution, reviewed_at',
  audit_log: 'id, created_at, actor_id, actor_role, action, entity_type, entity_id, reason',
};
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  // neutralise spreadsheet formulas (=HYPERLINK(...) in a user's name runs when the export is opened in Excel / Sheets)
  const raw = String(v);
  const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
router.get('/export/:file', (req, res) => {
  const { file } = parseParams(req, z.object({ file: z.string().regex(/^[a-z_]+\.csv$/) }));
  const table = file.slice(0, -4) as ExportTable;
  if (!(EXPORT_TABLES as readonly string[]).includes(table)) throw new ApiError('NOT_FOUND', 'Unknown export');
  const p = parseQuery(req, z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), campusId: z.string().max(64).optional() }));
  const cols = EXPORT_COLUMNS[table];
  const where: string[] = ['1 = 1'];
  const params: unknown[] = [];
  if (p.from) where.push('created_at >= ?'), params.push(dayStart(p.from));
  if (p.to) where.push('created_at < ?'), params.push(dayEnd(p.to));
  if (p.campusId && /campus_id/.test(cols)) where.push('campus_id = ?'), params.push(p.campusId);
  const rows = q.all<Record<string, unknown>>(`SELECT ${cols} FROM ${table} WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 50000`, params as never);
  const header = cols.split(',').map((c) => c.trim());
  const body = [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n');
  audit(req, { action: 'export.csv', entityType: 'table', entityId: table, after: { rows: rows.length, from: p.from ?? null, to: p.to ?? null, campusId: p.campusId ?? null } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="anwo-${table}-${todayUtc()}.csv"`);
  res.status(200).send(`﻿${body}\n`);
});

export default router;
