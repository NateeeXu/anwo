// server/src/modules/admin/service.ts — admin-only helpers: entity summaries, moderation writes, bans, user admin view.
// Other modules do not import from here (no cross-module contract in DATA_MODEL §1); routes.ts and jobs.ts do.
import type { Request } from 'express';
import type { AnalyticsEvent, AuditEntry, UserPublic } from '@shared/types';
import type { AdminReport, AdminUserDetail, AdminUserRow, EntitySummary, ModeratedEntityType, ModerationRow } from '@shared/schemas/admin';
import { q, parseJson, placeholders } from '../../db';
import { audit, toAuditDto, type AuditRow } from '../../lib/audit';
import { toReportDto, type ReportRow } from '../../lib/reports';
import { loadUsersPublic, toUserPublic, loadUserPublic, USER_PUBLIC_SELECT, USER_PUBLIC_FROM, type UserPublicRow } from '../../lib/users';
import { getCampus, toCampusLite } from '../../lib/campuses';
import { lockConversation } from '../../lib/conversations';
import { notify } from '../../lib/notify';
import { hooks } from '../../lib/hooks';
import { kickUser } from '../../realtime/hub';
import { nowIso, nowMs, HOUR } from '../../lib/time';
import { ApiError } from '../../lib/errors';

// ------------------------------------------------------------------ entity registry
export type EntityConfig = {
  table: string;
  ownerCol: string;
  priceCol: string | null;
  photoTable: string | null;
  photoFk: string | null;
  link: (id: string) => string;
  subtitle: string; // SQL expression over alias e
};
export const ENTITY: Record<ModeratedEntityType, EntityConfig> = {
  listing: {
    table: 'listings', ownerCol: 'owner_id', priceCol: 'price_cents', photoTable: 'listing_photos', photoFk: 'listing_id',
    link: (id) => `/listings/${id}`, subtitle: "COALESCE(e.neighborhood || ' · ', '') || e.city || ', ' || e.state",
  },
  wanted: {
    table: 'wanted_posts', ownerCol: 'user_id', priceCol: 'budget_max_cents', photoTable: null, photoFk: null,
    link: (id) => `/wanted/${id}`, subtitle: "'$' || (e.budget_min_cents / 100) || '–' || (e.budget_max_cents / 100)",
  },
  market_item: {
    table: 'market_items', ownerCol: 'seller_id', priceCol: 'price_cents', photoTable: 'market_item_photos', photoFk: 'item_id',
    link: (id) => `/market/${id}`, subtitle: "e.category || ' · ' || e.condition",
  },
  buddy_post: {
    table: 'buddy_posts', ownerCol: 'author_id', priceCol: 'cost_split_cents', photoTable: null, photoFk: null,
    link: (id) => `/buddy/${id}`, subtitle: "e.type || COALESCE(' · ' || e.location_name, '')",
  },
};
export const isModerated = (t: string): t is ModeratedEntityType => t in ENTITY;

function coverUrl(cfg: EntityConfig, id: string): string | null {
  if (!cfg.photoTable) return null;
  return (
    q.get<{ url: string }>(
      `SELECT u.url FROM ${cfg.photoTable} p JOIN uploads u ON u.id = p.upload_id WHERE p.${cfg.photoFk} = ? ORDER BY p.sort_order LIMIT 1`,
      [id],
    )?.url ?? null
  );
}

/** Small card describing any reportable entity (reports queue, user detail). */
export function entitySummary(type: string, id: string, users?: Map<string, UserPublic>): EntitySummary {
  const base: EntitySummary = { type, id, title: id.slice(0, 8), subtitle: null, imageUrl: null, link: null, status: null, moderationStatus: null, owner: null, campus: null, createdAt: null };
  const ownerOf = (uid: string | null) => (uid ? users?.get(uid) ?? loadUserPublic(uid) : null);
  if (isModerated(type)) {
    const cfg = ENTITY[type];
    const r = q.get<{ id: string; title: string; sub: string | null; status: string; moderation_status: string; owner: string; campus_id: string; created_at: string; description: string | null }>(
      `SELECT e.id, e.title, ${cfg.subtitle} AS sub, e.status, e.moderation_status, e.${cfg.ownerCol} AS owner, e.campus_id, e.created_at, e.description FROM ${cfg.table} e WHERE e.id = ?`,
      [id],
    );
    if (!r) return { ...base, missing: true };
    return {
      type, id, title: r.title, subtitle: r.sub, imageUrl: coverUrl(cfg, id), link: cfg.link(id), status: r.status, moderationStatus: r.moderation_status,
      owner: ownerOf(r.owner), campus: toCampusLite(r.campus_id), createdAt: r.created_at, body: r.description ? r.description.slice(0, 400) : null,
    };
  }
  if (type === 'user') {
    const u = q.get<UserPublicRow & { email: string; banned: number }>(`SELECT ${USER_PUBLIC_SELECT}, u.email FROM ${USER_PUBLIC_FROM} WHERE u.id = ?`, [id]);
    if (!u) return { ...base, missing: true };
    const pub = toUserPublic(u);
    return { ...base, title: u.name, subtitle: u.email, imageUrl: pub.avatarUrl, link: `/u/${id}`, status: u.banned === 1 ? 'banned' : 'active', owner: pub, campus: toCampusLite(u.campus_id), createdAt: u.created_at, body: u.bio ?? null };
  }
  if (type === 'message') {
    const m = q.get<{ id: string; body: string | null; sender_id: string | null; conversation_id: string; created_at: string; deleted_at: string | null; campus_id: string | null; is_locked: number }>(
      'SELECT m.id, m.body, m.sender_id, m.conversation_id, m.created_at, m.deleted_at, c.campus_id, c.is_locked FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = ?',
      [id],
    );
    if (!m) return { ...base, missing: true };
    return {
      ...base, title: (m.body ?? '').slice(0, 80) || '—', subtitle: m.conversation_id, status: m.deleted_at ? 'deleted' : m.is_locked ? 'locked' : 'visible',
      owner: ownerOf(m.sender_id), campus: toCampusLite(m.campus_id), createdAt: m.created_at, body: m.body,
    };
  }
  if (type === 'conversation') {
    const c = q.get<{ id: string; kind: string; title: string | null; campus_id: string | null; is_locked: number; created_at: string; created_by: string | null; members: number }>(
      'SELECT c.*, (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.left_at IS NULL) AS members FROM conversations c WHERE c.id = ?',
      [id],
    );
    if (!c) return { ...base, missing: true };
    const names = q.all<{ name: string }>('SELECT u.name FROM conversation_members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = ? ORDER BY cm.joined_at LIMIT 3', [id]).map((m) => m.name);
    return { ...base, title: c.title ?? (names.join(' ↔ ') || c.kind), subtitle: `${c.kind} · ${c.members}`, status: c.is_locked ? 'locked' : 'open', owner: ownerOf(c.created_by ?? null), campus: toCampusLite(c.campus_id), createdAt: c.created_at };
  }
  if (type === 'partner') {
    const p = q.get<{ id: string; name: string; category: string; is_active: number; created_at: string }>('SELECT id, name, category, is_active, created_at FROM partners WHERE id = ?', [id]);
    if (!p) return { ...base, missing: true };
    return { ...base, title: p.name, subtitle: p.category, link: '/kit', status: p.is_active ? 'active' : 'inactive', createdAt: p.created_at };
  }
  return { ...base, missing: true };
}

/** Owner of a reported entity (for warn / ban actions). */
export function entityOwnerId(type: string, id: string): string | null {
  if (isModerated(type)) {
    const cfg = ENTITY[type];
    return q.get<{ o: string }>(`SELECT ${cfg.ownerCol} AS o FROM ${cfg.table} WHERE id = ?`, [id])?.o ?? null;
  }
  if (type === 'user') return id;
  if (type === 'message') return q.get<{ o: string | null }>('SELECT sender_id AS o FROM messages WHERE id = ?', [id])?.o ?? null;
  if (type === 'conversation') return q.get<{ o: string | null }>('SELECT created_by AS o FROM conversations WHERE id = ?', [id])?.o ?? null;
  return null;
}

// ------------------------------------------------------------------ reports
export function toAdminReports(rows: ReportRow[]): AdminReport[] {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.reporter_id) ids.add(r.reporter_id);
    if (r.reviewer_id) ids.add(r.reviewer_id);
  }
  const users = loadUsersPublic(ids);
  const counts = new Map<string, number>();
  if (rows.length) {
    const keys = [...new Set(rows.map((r) => `${r.entity_type}|${r.entity_id}`))];
    for (const k of keys) {
      const [t, id] = k.split('|') as [string, string];
      counts.set(k, q.count("SELECT COUNT(*) FROM reports WHERE entity_type = ? AND entity_id = ? AND status IN ('open','in_review')", [t, id]));
    }
  }
  const summaries = new Map<string, EntitySummary>();
  return rows.map((r) => {
    const k = `${r.entity_type}|${r.entity_id}`;
    let entity = summaries.get(k);
    if (!entity) summaries.set(k, (entity = entitySummary(r.entity_type, r.entity_id, users)));
    return {
      ...toReportDto(r),
      reporter: r.reporter_id ? users.get(r.reporter_id) : undefined,
      reviewer: r.reviewer_id ? users.get(r.reviewer_id) ?? null : null,
      entity,
      reportCountForEntity: counts.get(k) ?? 0,
      campus: toCampusLite(r.campus_id ?? entity.campus?.id ?? null),
      ageHours: Math.max(0, Math.round((nowMs() - Date.parse(r.created_at)) / HOUR)),
    };
  });
}

// ------------------------------------------------------------------ moderation writes
export function setModeration(req: Request, type: ModeratedEntityType, id: string, status: 'ok' | 'flagged' | 'hidden', reason: string, note?: string | null, opts: { notifyOwner?: boolean } = {}) {
  const cfg = ENTITY[type];
  const row = q.get<{ id: string; title: string; moderation_status: string; owner: string }>(
    `SELECT id, title, moderation_status, ${cfg.ownerCol} AS owner FROM ${cfg.table} WHERE id = ?`,
    [id],
  );
  if (!row) throw new ApiError('NOT_FOUND', `${type} not found`);
  if (row.moderation_status === status) return { changed: false, owner: row.owner, title: row.title };
  const now = nowIso();
  if (type === 'listing') q.run('UPDATE listings SET moderation_status = ?, moderation_note = ?, updated_at = ? WHERE id = ?', [status, note ?? reason, now, id]);
  else q.run(`UPDATE ${cfg.table} SET moderation_status = ?, updated_at = ? WHERE id = ?`, [status, now, id]);
  const action = status === 'hidden' ? `${type}.hide` : status === 'flagged' ? `${type}.flag` : `${type}.unhide`;
  audit(req, { action, entityType: type, entityId: id, before: { moderationStatus: row.moderation_status }, after: { moderationStatus: status, note: note ?? null }, reason });
  if (opts.notifyOwner !== false && status !== 'flagged' && row.owner !== req.user?.id) {
    const hidden = status === 'hidden';
    notify(row.owner, 'system', {
      title: hidden
        ? { zh: `你发布的「${row.title}」已被隐藏`, en: `“${row.title}” has been hidden` }
        : { zh: `你发布的「${row.title}」已恢复展示`, en: `“${row.title}” is visible again` },
      body: hidden
        ? { zh: `原因：${reason}。如有疑问，请在帮助中心联系我们。`, en: `Reason: ${reason}. Contact us from the Help center if you have questions.` }
        : { zh: '审核已完成，感谢你的耐心。', en: 'Review complete. Thanks for your patience.' },
      link: cfg.link(id),
      entityType: type,
      entityId: id,
      data: { moderationStatus: status },
    });
  }
  return { changed: true, owner: row.owner, title: row.title };
}

export function removeEntity(req: Request, type: ModeratedEntityType, id: string, reason: string) {
  const cfg = ENTITY[type];
  const row = q.get<{ status: string; owner: string; title: string }>(`SELECT status, ${cfg.ownerCol} AS owner, title FROM ${cfg.table} WHERE id = ?`, [id]);
  if (!row) throw new ApiError('NOT_FOUND', `${type} not found`);
  if (row.status === 'removed') return;
  q.run(`UPDATE ${cfg.table} SET status = 'removed', updated_at = ? WHERE id = ?`, [nowIso(), id]);
  audit(req, { action: `${type}.remove`, entityType: type, entityId: id, before: { status: row.status }, after: { status: 'removed' }, reason });
  notify(row.owner, 'system', {
    title: { zh: `你发布的「${row.title}」已被移除`, en: `“${row.title}” was removed` },
    body: { zh: `原因：${reason}。`, en: `Reason: ${reason}.` },
    link: '/help',
    entityType: type,
    entityId: id,
  });
}

// ------------------------------------------------------------------ bans
type BanEffects = { pausedListings: string[]; hidden: { type: ModeratedEntityType; id: string }[]; lockedConversations: string[] };

export function banUser(req: Request, userId: string, reason: string): BanEffects {
  const u = q.get<{ id: string; banned: number; role: string; name: string }>('SELECT id, banned, role, name FROM users WHERE id = ?', [userId]);
  if (!u) throw new ApiError('NOT_FOUND', 'User not found');
  if (u.role === 'admin') throw new ApiError('FORBIDDEN', 'Admins cannot be banned');
  if (userId === req.user?.id) throw new ApiError('FORBIDDEN', 'You cannot ban yourself');
  const effects: BanEffects = { pausedListings: [], hidden: [], lockedConversations: [] };
  if (u.banned === 1) return effects;
  const now = nowIso();
  q.tx(() => {
    q.run('UPDATE users SET banned = 1, banned_reason = ?, banned_at = ?, updated_at = ? WHERE id = ?', [reason, now, now, userId]);
    effects.pausedListings = q.all<{ id: string }>("SELECT id FROM listings WHERE owner_id = ? AND status = 'active'", [userId]).map((r) => r.id);
    if (effects.pausedListings.length)
      q.run(`UPDATE listings SET status = 'paused', updated_at = ? WHERE id IN (${placeholders(effects.pausedListings.length)})`, [now, ...effects.pausedListings]);
    for (const type of Object.keys(ENTITY) as ModeratedEntityType[]) {
      const cfg = ENTITY[type];
      const ids = q.all<{ id: string }>(`SELECT id FROM ${cfg.table} WHERE ${cfg.ownerCol} = ? AND moderation_status = 'ok' AND status <> 'removed'`, [userId]).map((r) => r.id);
      if (!ids.length) continue;
      q.run(`UPDATE ${cfg.table} SET moderation_status = 'hidden', updated_at = ? WHERE id IN (${placeholders(ids.length)})`, [now, ...ids]);
      for (const id of ids) effects.hidden.push({ type, id });
    }
    effects.lockedConversations = q
      .all<{ id: string }>(
        "SELECT c.id FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id WHERE cm.user_id = ? AND cm.left_at IS NULL AND c.kind = 'direct' AND c.is_locked = 0",
        [userId],
      )
      .map((r) => r.id);
  });
  for (const cid of effects.lockedConversations) lockConversation(cid, true);
  audit(req, { action: 'user.ban', entityType: 'user', entityId: userId, before: { banned: false }, after: { banned: true, ...effects }, reason });
  hooks.emit('user.banned', { userId, banned: true, reason });
  notify(userId, 'system', {
    title: { zh: '你的账号已被停用', en: 'Your account has been suspended' },
    body: { zh: `原因：${reason}。如需申诉，请联系 support@anwo.app。`, en: `Reason: ${reason}. To appeal, contact support@anwo.app.` },
    link: '/help',
    entityType: 'user',
    entityId: userId,
    silent: true,
  });
  kickUser(userId, 4403, 'banned');
  return effects;
}

export function unbanUser(req: Request, userId: string, reason: string): { restored: number; unlocked: number } {
  const u = q.get<{ banned: number }>('SELECT banned FROM users WHERE id = ?', [userId]);
  if (!u) throw new ApiError('NOT_FOUND', 'User not found');
  if (u.banned !== 1) return { restored: 0, unlocked: 0 };
  const last = q.get<{ after_json: string | null }>("SELECT after_json FROM audit_log WHERE action = 'user.ban' AND entity_id = ? ORDER BY created_at DESC LIMIT 1", [userId]);
  const eff = parseJson<Partial<BanEffects>>(last?.after_json ?? null, {});
  const now = nowIso();
  let restored = 0;
  q.tx(() => {
    q.run('UPDATE users SET banned = 0, banned_reason = NULL, banned_at = NULL, updated_at = ? WHERE id = ?', [now, userId]);
    for (const h of eff.hidden ?? []) {
      const cfg = ENTITY[h.type];
      if (!cfg) continue;
      restored += q.run(`UPDATE ${cfg.table} SET moderation_status = 'ok', updated_at = ? WHERE id = ? AND moderation_status = 'hidden'`, [now, h.id]).changes;
    }
  });
  let unlocked = 0;
  for (const cid of eff.lockedConversations ?? []) {
    if (q.get('SELECT 1 FROM conversations WHERE id = ? AND is_locked = 1', [cid])) {
      lockConversation(cid, false);
      unlocked++;
    }
  }
  audit(req, { action: 'user.unban', entityType: 'user', entityId: userId, before: { banned: true }, after: { banned: false, restored, unlocked }, reason });
  hooks.emit('user.banned', { userId, banned: false, reason: null });
  notify(userId, 'system', {
    title: { zh: '你的账号已恢复', en: 'Your account has been restored' },
    body: { zh: '暂停的房源需要你在「我的房源」里手动恢复上架。', en: 'Paused listings stay paused until you resume them from My listings.' },
    link: '/listings/mine',
    entityType: 'user',
    entityId: userId,
  });
  return { restored, unlocked };
}

// ------------------------------------------------------------------ users
type AdminUserSqlRow = UserPublicRow & {
  email: string; phone: string | null; locale: string; banned_reason: string | null; banned_at: string | null; listing_quota: number;
  wallet_balance_cents: number; last_active_at: string | null;
  n_listings: number; n_items: number; n_buddy: number; n_reports: number; n_orders: number;
};
export const ADMIN_USER_SELECT = `${USER_PUBLIC_SELECT}, u.email, u.phone, u.locale, u.banned_reason, u.banned_at, u.listing_quota, u.wallet_balance_cents,
  COALESCE(u.last_seen_at, (SELECT MAX(e.created_at) FROM events e WHERE e.user_id = u.id)) AS last_active_at,
  (SELECT COUNT(*) FROM listings l WHERE l.owner_id = u.id AND l.status <> 'removed') AS n_listings,
  (SELECT COUNT(*) FROM market_items mi WHERE mi.seller_id = u.id AND mi.status <> 'removed') AS n_items,
  (SELECT COUNT(*) FROM buddy_posts bp WHERE bp.author_id = u.id AND bp.status <> 'removed') AS n_buddy,
  (SELECT COUNT(*) FROM reports r WHERE (r.entity_type = 'user' AND r.entity_id = u.id)
     OR (r.entity_type = 'listing' AND r.entity_id IN (SELECT id FROM listings WHERE owner_id = u.id))
     OR (r.entity_type = 'market_item' AND r.entity_id IN (SELECT id FROM market_items WHERE seller_id = u.id))
     OR (r.entity_type = 'buddy_post' AND r.entity_id IN (SELECT id FROM buddy_posts WHERE author_id = u.id))
     OR (r.entity_type = 'wanted' AND r.entity_id IN (SELECT id FROM wanted_posts WHERE user_id = u.id))) AS n_reports,
  (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.status IN ('paid','fulfilled','refunded')) AS n_orders`;

export function toAdminUserRow(r: AdminUserSqlRow): AdminUserRow {
  return {
    ...toUserPublic(r),
    email: r.email,
    phone: r.phone,
    locale: r.locale,
    banned: r.banned === 1,
    bannedReason: r.banned_reason,
    bannedAt: r.banned_at,
    listingQuota: r.listing_quota,
    walletBalanceCents: r.wallet_balance_cents,
    lastActiveAt: r.last_active_at,
    createdAt: r.created_at,
    counts: { listings: r.n_listings, items: r.n_items, buddy: r.n_buddy, reports: r.n_reports, orders: r.n_orders },
  };
}

export function loadAdminUser(id: string): AdminUserRow | null {
  const r = q.get<AdminUserSqlRow>(`SELECT ${ADMIN_USER_SELECT} FROM ${USER_PUBLIC_FROM} WHERE u.id = ?`, [id]);
  return r ? toAdminUserRow(r) : null;
}

export function auditDtos(rows: AuditRow[]): AuditEntry[] {
  const actors = loadUsersPublic(rows.map((r) => r.actor_id).filter((x): x is string => !!x));
  return rows.map((r) => toAuditDto(r, r.actor_id ? actors.get(r.actor_id) ?? null : null));
}

type EventRow = { id: string; user_id: string | null; session_id: string | null; campus_id: string | null; type: string; entity_type: string | null; entity_id: string | null; props_json: string; path: string | null; created_at: string };
export function toEventDto(r: EventRow): AnalyticsEvent {
  return {
    id: r.id, userId: r.user_id, sessionId: r.session_id, campusId: r.campus_id, type: r.type, entityType: r.entity_type, entityId: r.entity_id,
    props: parseJson<Record<string, unknown>>(r.props_json, {}), path: r.path, createdAt: r.created_at,
  };
}
export type { EventRow };

export function loadAdminUserDetail(id: string): AdminUserDetail | null {
  const base = loadAdminUser(id);
  if (!base) return null;
  const u = q.get<{ edu_email: string | null; email_verified_at: string | null; id_verified_at: string | null; phone_verified_at: string | null; payment_verified_at: string | null; wechat_id: string | null; campus_id: string | null }>(
    'SELECT edu_email, email_verified_at, id_verified_at, phone_verified_at, payment_verified_at, wechat_id, campus_id FROM users WHERE id = ?',
    [id],
  )!;
  const reportRows = q.all<ReportRow>(
    `SELECT * FROM reports r WHERE (r.entity_type = 'user' AND r.entity_id = ?)
       OR (r.entity_type = 'listing' AND r.entity_id IN (SELECT id FROM listings WHERE owner_id = ?))
       OR (r.entity_type = 'market_item' AND r.entity_id IN (SELECT id FROM market_items WHERE seller_id = ?))
       OR (r.entity_type = 'buddy_post' AND r.entity_id IN (SELECT id FROM buddy_posts WHERE author_id = ?))
       OR (r.entity_type = 'wanted' AND r.entity_id IN (SELECT id FROM wanted_posts WHERE user_id = ?))
     ORDER BY r.created_at DESC LIMIT 20`,
    [id, id, id, id, id],
  );
  const auditRows = q.all<AuditRow>(
    "SELECT * FROM audit_log WHERE (entity_type = 'user' AND entity_id = ?) OR actor_id = ? ORDER BY created_at DESC LIMIT 20",
    [id, id],
  );
  return {
    ...base,
    eduEmail: u.edu_email,
    emailVerifiedAt: u.email_verified_at,
    idVerifiedAt: u.id_verified_at,
    phoneVerifiedAt: u.phone_verified_at,
    paymentVerifiedAt: u.payment_verified_at,
    wechatId: u.wechat_id,
    campus: getCampus(u.campus_id),
    recentEvents: q.all<EventRow>('SELECT * FROM events WHERE user_id = ? ORDER BY created_at DESC LIMIT 25', [id]).map(toEventDto),
    reportsAgainst: toAdminReports(reportRows),
    reportsFiled: q.count('SELECT COUNT(*) FROM reports WHERE reporter_id = ?', [id]),
    audit: auditDtos(auditRows),
    orders: q
      .all<{ id: string; kind: string; status: string; total_cents: number; created_at: string }>(
        'SELECT id, kind, status, total_cents, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
        [id],
      )
      .map((o) => ({ id: o.id, kind: o.kind, status: o.status, totalCents: o.total_cents, createdAt: o.created_at })),
    verifications: q
      .all<{ id: string; type: string; status: string; created_at: string; reviewed_at: string | null }>(
        'SELECT id, type, status, created_at, reviewed_at FROM verification_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
        [id],
      )
      .map((v) => ({ id: v.id, type: v.type, status: v.status, createdAt: v.created_at, reviewedAt: v.reviewed_at })),
  };
}

// ------------------------------------------------------------------ moderation list rows
export function moderationRows(type: ModeratedEntityType, rows: { id: string; title: string; sub: string | null; status: string; moderation_status: string; moderation_note?: string | null; price: number | null; view_count: number; owner: string; campus_id: string; created_at: string; n_reports: number; n_open: number; boosted: number }[]): ModerationRow[] {
  const cfg = ENTITY[type];
  const owners = loadUsersPublic(rows.map((r) => r.owner));
  const emails = new Map<string, string>();
  if (rows.length) {
    const ids = [...new Set(rows.map((r) => r.owner))];
    for (const e of q.all<{ id: string; email: string }>(`SELECT id, email FROM users WHERE id IN (${placeholders(ids.length)})`, ids)) emails.set(e.id, e.email);
  }
  return rows.map((r) => {
    const o = owners.get(r.owner);
    return {
      id: r.id,
      entityType: type,
      title: r.title,
      subtitle: r.sub,
      imageUrl: coverUrl(cfg, r.id),
      link: cfg.link(r.id),
      status: r.status,
      moderationStatus: r.moderation_status as ModerationRow['moderationStatus'],
      moderationNote: r.moderation_note ?? null,
      priceCents: r.price,
      viewCount: r.view_count,
      reportCount: r.n_reports,
      openReports: r.n_open,
      campus: toCampusLite(r.campus_id),
      owner: o ? { ...o, email: emails.get(r.owner) ?? '' } : null,
      createdAt: r.created_at,
      boosted: r.boosted === 1,
    };
  });
}
