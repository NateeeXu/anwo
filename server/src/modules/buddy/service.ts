// server/src/modules/buddy/service.ts — OWNED BY THE `buddy` MODULE AGENT.
// Stable cross-module exports + the domain logic behind routes.ts (joins, approvals, group chat, calendar, ics).
import type { Request } from 'express';
import type { Buddy, BuddyCard, BuddyEvent, ContextCard, UserPublic } from '@shared/types';
import type { BuddyMemberRole, BuddyMemberStatus, BuddyStatus, BuddyType } from '@shared/enums';
import { q, uid, placeholders } from '../../db';
import type { AuthUser } from '../../lib/types';
import { ApiError, invalidState, notFound } from '../../lib/errors';
import { nowIso, nowMs, HOUR } from '../../lib/time';
import { buddyCards, toBuddyCard, type BuddyCardRow } from '../../lib/cards';
import { getCampus } from '../../lib/campuses';
import { loadUsersPublic, loadUserPublic } from '../../lib/users';
import { addMembers, contextCardFor, isBlockedEither, openConversation, postContextCard, postSystemMessage, removeMember as removeConversationMember, loadConversation } from '../../lib/conversations';
import { notify, notifyMany } from '../../lib/notify';
import { logEvent } from '../../lib/events';
import { hash32 } from '../../lib/ids';

// ------------------------------------------------------------------ rows
export type BuddyPostRow = BuddyCardRow & {
  description: string;
  dest_lat: number | null;
  dest_lng: number | null;
  conversation_id: string | null;
  moderation_status: 'ok' | 'flagged' | 'hidden';
  view_count: number;
  updated_at: string;
};
export type BuddyMemberRow = {
  post_id: string;
  user_id: string;
  role: BuddyMemberRole;
  status: BuddyMemberStatus;
  note: string | null;
  joined_at: string;
  updated_at: string;
};
export type BuddyEventRow = {
  id: string;
  post_id: string;
  campus_id: string;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  lat: number | null;
  lng: number | null;
  status: 'scheduled' | 'cancelled' | 'done';
  reminder_sent_at: string | null;
  created_at: string;
};

export type BuddyDetail = Omit<Buddy, 'members'> & {
  members: BuddyMemberDto[];
  /** Type illustration (seed asset) used as the detail hero. */
  coverUrl: string | null;
  /** Whether the viewer may see the full member list (host / joined member / admin). */
  canSeeMembers: boolean;
  pendingCount: number;
  description: string;
};
export type BuddyMemberDto = Omit<UserPublic, 'role'> & { status: BuddyMemberStatus; role: BuddyMemberRole; joinedAt: string; note?: string | null };

export const PUBLIC_STATUSES: readonly BuddyStatus[] = ['open', 'full'];

export type MemberPreview = Pick<UserPublic, 'id' | 'name' | 'avatarUrl' | 'trustLevel'>;
export type BuddyCardWithMembers = BuddyCard & { memberPreview: MemberPreview[] };
/** Adds the first 3 joined members (host first) to each card — the avatar stack of DESIGN §4.3. */
export function withMemberPreview(cards: BuddyCard[]): BuddyCardWithMembers[] {
  if (!cards.length) return [];
  const ids = cards.map((c) => c.id);
  const rows = q.all<{ post_id: string; user_id: string }>(
    `SELECT post_id, user_id FROM buddy_members WHERE status = 'joined' AND post_id IN (${placeholders(ids.length)}) ORDER BY CASE role WHEN 'host' THEN 0 ELSE 1 END, joined_at ASC`,
    ids,
  );
  const byPost = new Map<string, string[]>();
  for (const r of rows) {
    const list = byPost.get(r.post_id) ?? [];
    if (list.length < 3) list.push(r.user_id);
    byPost.set(r.post_id, list);
  }
  const users = loadUsersPublic(rows.map((r) => r.user_id));
  return cards.map((c) => ({
    ...c,
    memberPreview: (byPost.get(c.id) ?? []).map((id) => users.get(id)).filter((u): u is UserPublic => !!u).map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl, trustLevel: u.trustLevel })),
  }));
}

/** Seed illustrations by post type (ASSETS.md §4) — chosen deterministically per post id. */
const COVERS: Record<BuddyType, string[]> = {
  airport_pickup: ['b01', 'b08', 'b15'],
  carpool: ['b02', 'b09', 'b16'],
  study: ['b03', 'b10', 'b17'],
  gym: ['b04', 'b11', 'b18'],
  dining: ['b05', 'b12', 'b19'],
  costco_run: ['b06', 'b13', 'b20'],
  travel: ['b07', 'b14'],
  roommate: ['b03', 'b10'],
  event: ['b05', 'b12', 'b19'],
  other: ['b02', 'b09'],
};
export function coverUrlFor(type: string, id: string): string | null {
  const list = COVERS[type as BuddyType];
  if (!list?.length) return null;
  return `/uploads/seed/buddy/${list[hash32(id) % list.length]}.svg`;
}

// ------------------------------------------------------------------ loading
export function loadPost(id: string): BuddyPostRow | undefined {
  return q.get<BuddyPostRow>('SELECT * FROM buddy_posts WHERE id = ?', [id]);
}
export function requirePost(id: string): BuddyPostRow {
  const row = loadPost(id);
  if (!row) return notFound('Buddy post');
  return row;
}
export function memberOf(postId: string, userId: string): BuddyMemberRow | undefined {
  return q.get<BuddyMemberRow>('SELECT * FROM buddy_members WHERE post_id = ? AND user_id = ?', [postId, userId]);
}
export function isActiveMember(postId: string, userId: string): boolean {
  const m = memberOf(postId, userId);
  return !!m && m.status === 'joined';
}
export function isHost(post: BuddyPostRow, user: AuthUser | undefined): boolean {
  return !!user && (user.id === post.author_id || user.role === 'admin');
}

/** Hides hidden/removed posts from everyone but the host and admins. */
export function assertVisible(post: BuddyPostRow, user: AuthUser | undefined): void {
  const privileged = isHost(post, user);
  if (privileged) return;
  if (post.moderation_status === 'hidden' || post.status === 'removed') notFound('Buddy post');
}

export function toEventDto(r: BuddyEventRow, post?: BuddyCard): BuddyEvent {
  const dto: BuddyEvent = {
    id: r.id, postId: r.post_id, campusId: r.campus_id, startsAt: r.starts_at, endsAt: r.ends_at, locationName: r.location_name,
    lat: r.lat, lng: r.lng, status: r.status,
  };
  if (post) dto.post = post;
  return dto;
}

export function listMembers(postId: string, opts: { status?: BuddyMemberStatus; withNote?: boolean } = {}): BuddyMemberDto[] {
  const rows = q.all<BuddyMemberRow>(
    `SELECT * FROM buddy_members WHERE post_id = ?${opts.status ? ' AND status = ?' : ''} ORDER BY CASE role WHEN 'host' THEN 0 ELSE 1 END, joined_at ASC`,
    opts.status ? [postId, opts.status] : [postId],
  );
  const users = loadUsersPublic(rows.map((r) => r.user_id));
  const out: BuddyMemberDto[] = [];
  for (const r of rows) {
    const u = users.get(r.user_id);
    if (!u) continue;
    const { role: _userRole, ...rest } = u;
    void _userRole;
    const dto: BuddyMemberDto = { ...rest, status: r.status, role: r.role, joinedAt: r.joined_at };
    if (opts.withNote) dto.note = r.note;
    out.push(dto);
  }
  return out;
}

/** Full DTO for GET /posts/:id. Members are visible to host / joined members / admins; others get the first 3 joined avatars. */
export function toBuddyDetail(row: BuddyPostRow, viewer: AuthUser | undefined): BuddyDetail {
  const card = buddyCards([row], { viewerId: viewer?.id })[0]!;
  const canSeeMembers = !!viewer && (isHost(row, viewer) || isActiveMember(row.id, viewer.id));
  const members = canSeeMembers ? listMembers(row.id, { withNote: isHost(row, viewer) }) : listMembers(row.id, { status: 'joined' }).slice(0, 3);
  const events = q.all<BuddyEventRow>('SELECT * FROM buddy_events WHERE post_id = ? ORDER BY starts_at ASC', [row.id]).map((e) => toEventDto(e));
  const pendingCount = isHost(row, viewer) ? q.count("SELECT COUNT(*) FROM buddy_members WHERE post_id = ? AND status = 'pending'", [row.id]) : 0;
  const detail: BuddyDetail = {
    ...card,
    description: row.description,
    destLat: row.dest_lat,
    destLng: row.dest_lng,
    conversationId: canSeeMembers ? row.conversation_id : null,
    members,
    events,
    viewCount: row.view_count,
    coverUrl: coverUrlFor(row.type, row.id),
    canSeeMembers,
    pendingCount,
  };
  if (isHost(row, viewer)) (detail as BuddyDetail & { moderationStatus: string }).moderationStatus = row.moderation_status;
  return detail;
}

/** Stable export (DATA_MODEL §1): context card for chat threads. */
export function buddyContextCard(id: string): ContextCard | null {
  return contextCardFor('buddy_post', id);
}

// ------------------------------------------------------------------ status helpers
export function touch(postId: string, patch: Record<string, unknown> = {}): void {
  q.update('buddy_posts', { ...patch, updated_at: nowIso() }, 'id = ?', [postId]);
}

/** open ⇄ full depending on member_count vs max_members (trigger keeps member_count current). */
export function syncFullStatus(postId: string): BuddyPostRow {
  const row = requirePost(postId);
  if (row.status === 'open' && row.member_count >= row.max_members) touch(postId, { status: 'full' });
  else if (row.status === 'full' && row.member_count < row.max_members) touch(postId, { status: 'open' });
  return requirePost(postId);
}

const TRANSITIONS: Record<string, BuddyStatus[]> = {
  closed: ['open', 'full'],
  cancelled: ['open', 'full'],
  open: ['closed'], // reopen
};
export function setPostStatus(post: BuddyPostRow, to: 'closed' | 'cancelled' | 'open', actor: AuthUser, reason?: string | null): BuddyPostRow {
  const allowed = TRANSITIONS[to] ?? [];
  if (!allowed.includes(post.status as BuddyStatus)) invalidState(post.status, to);
  if (to === 'open') {
    const end = post.ends_at ?? (post.starts_at ? new Date(new Date(post.starts_at).getTime() + 6 * HOUR).toISOString() : null);
    if (end && end <= nowIso()) invalidState(post.status, to);
  }
  q.tx(() => {
    touch(post.id, { status: to });
    if (to === 'open') syncFullStatus(post.id);
    if (to === 'cancelled') {
      q.run("UPDATE buddy_events SET status = 'cancelled' WHERE post_id = ? AND status = 'scheduled'", [post.id]);
    }
  });
  const fresh = requirePost(post.id);
  if (post.conversation_id && loadConversation(post.conversation_id)) {
    postSystemMessage(post.conversation_id, to === 'cancelled' ? 'post_cancelled' : to === 'closed' ? 'post_closed' : 'post_reopened', { userId: actor.id, postId: post.id, reason: reason ?? null });
  }
  if (to === 'cancelled') {
    const members = q.all<{ user_id: string }>("SELECT user_id FROM buddy_members WHERE post_id = ? AND status IN ('joined','pending') AND user_id <> ?", [post.id, post.author_id]).map((m) => m.user_id);
    notifyMany(members, 'system', {
      title: { zh: `「${post.title}」已取消`, en: `"${post.title}" was cancelled` },
      body: reason ? reason : { zh: '发起人取消了这个搭子活动。', en: 'The organizer cancelled this plan.' },
      link: `/buddy/${post.id}`, entityType: 'buddy_post', entityId: post.id, data: { reason: reason ?? null },
    });
  }
  return fresh;
}

/** "Complete": the plan happened — close the post and mark scheduled occurrences done. */
export function completePost(post: BuddyPostRow, actor: AuthUser): BuddyPostRow {
  if (!['open', 'full', 'closed', 'expired'].includes(post.status)) invalidState(post.status, 'closed');
  q.tx(() => {
    touch(post.id, { status: 'closed' });
    q.run("UPDATE buddy_events SET status = 'done' WHERE post_id = ? AND status = 'scheduled'", [post.id]);
  });
  if (post.conversation_id && loadConversation(post.conversation_id)) postSystemMessage(post.conversation_id, 'post_completed', { userId: actor.id, postId: post.id });
  return requirePost(post.id);
}

// ------------------------------------------------------------------ group chat
/** Creates the group conversation on the first joined member (host = owner) and returns its id. */
export function ensureGroupConversation(post: BuddyPostRow): string {
  if (post.conversation_id && loadConversation(post.conversation_id)) return post.conversation_id;
  const { conversation } = openConversation({
    kind: 'group', memberIds: [post.author_id], campusId: post.campus_id, context: { type: 'buddy_post', id: post.id }, createdBy: post.author_id, title: post.title,
  });
  touch(post.id, { conversation_id: conversation.id });
  const card = contextCardFor('buddy_post', post.id);
  if (card) postContextCard(conversation.id, post.author_id, card);
  return conversation.id;
}
function addToGroup(post: BuddyPostRow, userId: string): string {
  const convId = ensureGroupConversation(post);
  addMembers(convId, [userId]); // posts member_joined
  return convId;
}

// ------------------------------------------------------------------ join / leave / approve
export type JoinResult = { membership: { status: BuddyMemberStatus; role: BuddyMemberRole }; conversationId: string | null };

export function joinPost(req: Request, post: BuddyPostRow, user: AuthUser, note?: string | null): JoinResult {
  if (post.author_id === user.id) throw new ApiError('CONFLICT', 'You host this post');
  if (post.moderation_status === 'hidden' || post.status === 'removed') notFound('Buddy post');
  if (post.status === 'full') throw new ApiError('QUOTA_EXCEEDED', 'This group is full', { data: { limit: post.max_members, current: post.member_count } });
  if (post.status !== 'open') invalidState(post.status, 'join');
  const required = post.verified_only ? Math.max(1, post.min_trust_level) : 1;
  if (user.role !== 'admin' && user.trust_level < required) {
    throw new ApiError('TRUST_REQUIRED', `Trust level ${required} required`, { data: { required, current: user.trust_level, nextStep: user.email_verified_at ? 'id' : 'edu' } });
  }
  if (isBlockedEither(post.author_id, user.id)) throw new ApiError('BLOCKED', 'You cannot join this host');
  if (post.member_count >= post.max_members) throw new ApiError('QUOTA_EXCEEDED', 'This group is full', { data: { limit: post.max_members, current: post.member_count } });

  const existing = memberOf(post.id, user.id);
  if (existing && (existing.status === 'joined' || existing.status === 'pending')) throw new ApiError('CONFLICT', 'Already a member');
  if (existing && existing.status === 'removed') throw new ApiError('FORBIDDEN', 'You were removed from this group');

  const status: BuddyMemberStatus = post.requires_approval ? 'pending' : 'joined';
  const t = nowIso();
  q.tx(() => {
    if (existing) q.run('UPDATE buddy_members SET status = ?, note = ?, joined_at = ?, updated_at = ? WHERE post_id = ? AND user_id = ?', [status, note ?? null, t, t, post.id, user.id]);
    else q.run('INSERT INTO buddy_members (post_id, user_id, role, status, note, joined_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [post.id, user.id, 'member', status, note ?? null, t, t]);
  });
  let conversationId: string | null = null;
  if (status === 'joined') {
    conversationId = addToGroup(requirePost(post.id), user.id);
    syncFullStatus(post.id);
  }
  logEvent(req, 'buddy.join', { entityType: 'buddy_post', entityId: post.id, props: { type: post.type, status, requiresApproval: post.requires_approval === 1 }, campusId: post.campus_id });
  const joiner = loadUserPublic(user.id);
  notify(post.author_id, 'buddy.join', {
    title: status === 'pending'
      ? { zh: `${joiner?.name ?? '有人'} 申请加入「${post.title}」`, en: `${joiner?.name ?? 'Someone'} asked to join "${post.title}"` }
      : { zh: `${joiner?.name ?? '有人'} 加入了「${post.title}」`, en: `${joiner?.name ?? 'Someone'} joined "${post.title}"` },
    body: note ? note : status === 'pending' ? { zh: '去看看并决定是否通过。', en: 'Review the request to approve or decline.' } : { zh: '群聊已就绪，打个招呼吧。', en: 'The group chat is ready — say hi.' },
    link: status === 'pending' ? `/buddy/${post.id}?tab=requests` : conversationId ? `/chat/${conversationId}` : `/buddy/${post.id}`,
    entityType: 'buddy_post', entityId: post.id, data: { userId: user.id, status },
  });
  return { membership: { status, role: 'member' }, conversationId };
}

export function leavePost(req: Request, post: BuddyPostRow, user: AuthUser): void {
  const m = memberOf(post.id, user.id);
  if (!m || !['joined', 'pending'].includes(m.status)) throw new ApiError('NOT_FOUND', 'Not a member');
  if (m.role === 'host') throw new ApiError('INVALID_STATE', 'Hosts cancel the post instead of leaving', { data: { from: 'host', to: 'left' } });
  q.run('UPDATE buddy_members SET status = ?, updated_at = ? WHERE post_id = ? AND user_id = ?', ['left', nowIso(), post.id, user.id]);
  if (m.status === 'joined' && post.conversation_id && loadConversation(post.conversation_id)) removeConversationMember(post.conversation_id, user.id, 'member_left');
  syncFullStatus(post.id);
  logEvent(req, 'buddy.leave', { entityType: 'buddy_post', entityId: post.id, props: { from: m.status }, campusId: post.campus_id });
}

export function approveMember(req: Request, post: BuddyPostRow, userId: string): BuddyMemberDto {
  const m = memberOf(post.id, userId);
  if (!m) throw new ApiError('NOT_FOUND', 'Member not found');
  if (m.status !== 'pending') invalidState(m.status, 'joined');
  if (post.status === 'full' || post.member_count >= post.max_members) throw new ApiError('QUOTA_EXCEEDED', 'This group is full', { data: { limit: post.max_members, current: post.member_count } });
  if (!['open'].includes(post.status)) invalidState(post.status, 'approve');
  q.run("UPDATE buddy_members SET status = 'joined', updated_at = ? WHERE post_id = ? AND user_id = ?", [nowIso(), post.id, userId]);
  const conversationId = addToGroup(requirePost(post.id), userId);
  syncFullStatus(post.id);
  logEvent(req, 'buddy.approve', { entityType: 'buddy_post', entityId: post.id, props: { userId }, campusId: post.campus_id });
  notify(userId, 'buddy.approved', {
    title: { zh: `你已加入「${post.title}」`, en: `You're in: "${post.title}"` },
    body: { zh: '发起人通过了你的申请，群聊已打开。', en: 'The organizer approved your request. The group chat is open.' },
    link: `/chat/${conversationId}`, entityType: 'buddy_post', entityId: post.id, data: { conversationId },
  });
  return listMembers(post.id, { withNote: true }).find((x) => x.id === userId)!;
}

export function declineMember(req: Request, post: BuddyPostRow, userId: string, reason?: string | null): BuddyMemberDto {
  const m = memberOf(post.id, userId);
  if (!m) throw new ApiError('NOT_FOUND', 'Member not found');
  if (m.status !== 'pending') invalidState(m.status, 'declined');
  q.run("UPDATE buddy_members SET status = 'declined', updated_at = ? WHERE post_id = ? AND user_id = ?", [nowIso(), post.id, userId]);
  logEvent(req, 'buddy.decline', { entityType: 'buddy_post', entityId: post.id, props: { userId }, campusId: post.campus_id });
  notify(userId, 'system', {
    title: { zh: `「${post.title}」的申请未通过`, en: `Request for "${post.title}" was declined` },
    body: reason ? reason : { zh: '这次没有合适的位置，看看其他搭子吧。', en: 'No spot this time — browse other plans.' },
    link: `/buddy`, entityType: 'buddy_post', entityId: post.id, data: { reason: reason ?? null },
  });
  return listMembers(post.id, { withNote: true }).find((x) => x.id === userId)!;
}

export function removeMemberFromPost(req: Request, post: BuddyPostRow, userId: string, reason?: string | null): BuddyMemberDto {
  const m = memberOf(post.id, userId);
  if (!m) throw new ApiError('NOT_FOUND', 'Member not found');
  if (m.role === 'host') throw new ApiError('FORBIDDEN', 'Cannot remove the host');
  if (!['joined', 'pending'].includes(m.status)) invalidState(m.status, 'removed');
  q.run("UPDATE buddy_members SET status = 'removed', updated_at = ? WHERE post_id = ? AND user_id = ?", [nowIso(), post.id, userId]);
  if (m.status === 'joined' && post.conversation_id && loadConversation(post.conversation_id)) removeConversationMember(post.conversation_id, userId, 'member_removed');
  syncFullStatus(post.id);
  logEvent(req, 'buddy.remove_member', { entityType: 'buddy_post', entityId: post.id, props: { userId }, campusId: post.campus_id });
  notify(userId, 'system', {
    title: { zh: `你已被移出「${post.title}」`, en: `You were removed from "${post.title}"` },
    body: reason ? reason : null, link: '/buddy', entityType: 'buddy_post', entityId: post.id, data: { reason: reason ?? null },
  });
  return listMembers(post.id, { withNote: true }).find((x) => x.id === userId)!;
}

// ------------------------------------------------------------------ events / calendar
export function replaceEvents(post: BuddyPostRow, events: { startsAt: string; endsAt?: string; locationName?: string; lat?: number; lng?: number }[]): BuddyEvent[] {
  const t = nowIso();
  q.tx(() => {
    q.run("DELETE FROM buddy_events WHERE post_id = ? AND status = 'scheduled'", [post.id]);
    for (const e of events) {
      q.run(
        'INSERT INTO buddy_events (id, post_id, campus_id, starts_at, ends_at, location_name, lat, lng, status, reminder_sent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)',
        [uid(), post.id, post.campus_id, new Date(e.startsAt).toISOString(), e.endsAt ? new Date(e.endsAt).toISOString() : null, e.locationName ?? post.location_name, e.lat ?? post.lat, e.lng ?? post.lng, 'scheduled', t],
      );
    }
    touch(post.id);
  });
  return q.all<BuddyEventRow>('SELECT * FROM buddy_events WHERE post_id = ? ORDER BY starts_at ASC', [post.id]).map((e) => toEventDto(e));
}

export type Occurrence = BuddyEvent & { post: BuddyCard; implicit: boolean };

/** Explicit buddy_events (scheduled) + implicit occurrences (posts with starts_at and no events) inside [fromIso, toIso). */
export function listOccurrences(opts: { campusId: string; fromIso: string; toIso: string; types?: string[]; viewerId?: string | null; mineOnly?: boolean; includeStatuses?: BuddyStatus[] }): Occurrence[] {
  const statuses = opts.includeStatuses ?? ['open', 'full', 'closed'];
  const typeSql = opts.types?.length ? ` AND p.type IN (${placeholders(opts.types.length)})` : '';
  const typeParams = opts.types?.length ? opts.types : [];
  const mineSql = opts.mineOnly && opts.viewerId ? " AND EXISTS (SELECT 1 FROM buddy_members m WHERE m.post_id = p.id AND m.user_id = ? AND m.status IN ('joined','pending'))" : '';
  const mineParams = opts.mineOnly && opts.viewerId ? [opts.viewerId] : [];
  const base = `p.campus_id = ? AND p.moderation_status = 'ok' AND p.status IN (${placeholders(statuses.length)})${typeSql}${mineSql}`;
  const baseParams = [opts.campusId, ...statuses, ...typeParams, ...mineParams];

  const explicit = q.all<BuddyEventRow>(
    `SELECT e.* FROM buddy_events e JOIN buddy_posts p ON p.id = e.post_id WHERE e.status = 'scheduled' AND e.starts_at >= ? AND e.starts_at < ? AND ${base} ORDER BY e.starts_at ASC`,
    [opts.fromIso, opts.toIso, ...baseParams],
  );
  const implicit = q.all<BuddyPostRow>(
    `SELECT p.* FROM buddy_posts p WHERE p.starts_at IS NOT NULL AND p.starts_at >= ? AND p.starts_at < ? AND NOT EXISTS (SELECT 1 FROM buddy_events e WHERE e.post_id = p.id) AND ${base} ORDER BY p.starts_at ASC`,
    [opts.fromIso, opts.toIso, ...baseParams],
  );
  const postIds = [...new Set([...explicit.map((e) => e.post_id), ...implicit.map((p) => p.id)])];
  const postRows = postIds.length ? q.all<BuddyCardRow>(`SELECT * FROM buddy_posts WHERE id IN (${placeholders(postIds.length)})`, postIds) : [];
  const cards = new Map(buddyCards(postRows, { viewerId: opts.viewerId }).map((c) => [c.id, c]));
  const out: Occurrence[] = [];
  for (const e of explicit) {
    const card = cards.get(e.post_id);
    if (card) out.push({ ...toEventDto(e), post: card, implicit: false });
  }
  for (const p of implicit) {
    const card = cards.get(p.id);
    if (card) out.push({ id: `post:${p.id}`, postId: p.id, campusId: p.campus_id, startsAt: p.starts_at!, endsAt: p.ends_at, locationName: p.location_name, lat: p.lat, lng: p.lng, status: 'scheduled', post: card, implicit: true });
  }
  out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return out;
}

// ------------------------------------------------------------------ iCalendar export
function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
function foldLine(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = ' ' + rest.slice(73);
  }
  out.push(rest);
  return out.join('\r\n');
}
export type IcsItem = { uid: string; startsAt: string; endsAt: string | null; title: string; description: string; location: string | null; url: string; lat?: number | null; lng?: number | null };
export function buildIcs(items: IcsItem[], calName: string): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Anwo//Buddy//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEscape(calName)}`];
  const stamp = icsDate(nowIso());
  for (const it of items) {
    const end = it.endsAt ?? new Date(new Date(it.startsAt).getTime() + 2 * HOUR).toISOString();
    lines.push('BEGIN:VEVENT', `UID:${it.uid}@anwo.buddy`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(it.startsAt)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${icsEscape(it.title)}`);
    if (it.description) lines.push(`DESCRIPTION:${icsEscape(it.description)}`);
    if (it.location) lines.push(`LOCATION:${icsEscape(it.location)}`);
    if (typeof it.lat === 'number' && typeof it.lng === 'number') lines.push(`GEO:${it.lat};${it.lng}`);
    lines.push(`URL:${it.url}`, 'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(it.title)}`, 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
export function postIcsItems(post: BuddyPostRow, origin: string): IcsItem[] {
  const url = `${origin}/buddy/${post.id}`;
  const location = [post.location_name, post.destination_name ? `→ ${post.destination_name}` : null].filter(Boolean).join(' ');
  const events = q.all<BuddyEventRow>("SELECT * FROM buddy_events WHERE post_id = ? AND status = 'scheduled' ORDER BY starts_at", [post.id]);
  if (events.length) {
    return events.map((e) => ({ uid: e.id, startsAt: e.starts_at, endsAt: e.ends_at, title: post.title, description: post.description, location: e.location_name ?? location, url, lat: e.lat, lng: e.lng }));
  }
  if (!post.starts_at) return [];
  return [{ uid: post.id, startsAt: post.starts_at, endsAt: post.ends_at, title: post.title, description: post.description, location, url, lat: post.lat, lng: post.lng }];
}

// ------------------------------------------------------------------ reminders (jobs.ts)
/** Sends `buddy.event_reminder` to joined members of every occurrence that starts within `hoursAhead` hours (once per window). */
export function sendReminders(hoursAhead: number, windowKey: 'day' | 'soon'): number {
  const now = nowMs();
  const fromIso = new Date(now).toISOString();
  const toIso = new Date(now + hoursAhead * HOUR).toISOString();
  const rows = q.all<{ post_id: string; starts_at: string; event_id: string | null; title: string; location_name: string | null; campus_id: string }>(
    `SELECT p.id AS post_id, e.starts_at, e.id AS event_id, p.title, COALESCE(e.location_name, p.location_name) AS location_name, p.campus_id
       FROM buddy_events e JOIN buddy_posts p ON p.id = e.post_id
      WHERE e.status = 'scheduled' AND p.status IN ('open','full') AND p.moderation_status = 'ok' AND e.starts_at >= ? AND e.starts_at < ?
     UNION ALL
     SELECT p.id, p.starts_at, NULL, p.title, p.location_name, p.campus_id
       FROM buddy_posts p
      WHERE p.starts_at IS NOT NULL AND p.status IN ('open','full') AND p.moderation_status = 'ok' AND p.starts_at >= ? AND p.starts_at < ?
        AND NOT EXISTS (SELECT 1 FROM buddy_events e WHERE e.post_id = p.id)`,
    [fromIso, toIso, fromIso, toIso],
  );
  let sent = 0;
  for (const r of rows) {
    const members = q.all<{ user_id: string }>("SELECT user_id FROM buddy_members WHERE post_id = ? AND status = 'joined'", [r.post_id]).map((m) => m.user_id);
    const campus = getCampus(r.campus_id);
    const when = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: campus?.timezone ?? 'UTC' }).format(new Date(r.starts_at));
    const whenZh = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: campus?.timezone ?? 'UTC' }).format(new Date(r.starts_at));
    const occurrenceKey = r.event_id ?? r.post_id;
    for (const userId of members) {
      const dup = q.get<{ id: string }>(
        "SELECT id FROM notifications WHERE user_id = ? AND kind = 'buddy.event_reminder' AND entity_id = ? AND json_extract(data_json, '$.occurrence') = ? AND json_extract(data_json, '$.window') = ?",
        [userId, r.post_id, occurrenceKey, windowKey],
      );
      if (dup) continue;
      notify(userId, 'buddy.event_reminder', {
        title: windowKey === 'day' ? { zh: `明天：${r.title}`, en: `Tomorrow: ${r.title}` } : { zh: `快开始了：${r.title}`, en: `Starting soon: ${r.title}` },
        body: { zh: `${whenZh}${r.location_name ? ` · ${r.location_name}` : ''}`, en: `${when}${r.location_name ? ` · ${r.location_name}` : ''}` },
        link: `/buddy/${r.post_id}`, entityType: 'buddy_post', entityId: r.post_id,
        data: { occurrence: occurrenceKey, window: windowKey, startsAt: r.starts_at },
      });
      sent++;
    }
    if (r.event_id && windowKey === 'soon') q.run('UPDATE buddy_events SET reminder_sent_at = ? WHERE id = ? AND reminder_sent_at IS NULL', [nowIso(), r.event_id]);
  }
  return sent;
}

/** Finer-grained expiry than the scaffold's hourly job: open/full → expired once the plan is over. */
export function expireBuddyPosts(): number {
  const t = nowIso();
  const r = q.run(
    "UPDATE buddy_posts SET status = 'expired', updated_at = ? WHERE status IN ('open','full') AND ((ends_at IS NOT NULL AND ends_at <= ?) OR (ends_at IS NULL AND starts_at IS NOT NULL AND datetime(starts_at, '+6 hours') <= datetime(?)))",
    [t, t, t],
  );
  q.run("UPDATE buddy_events SET status = 'done' WHERE status = 'scheduled' AND datetime(COALESCE(ends_at, datetime(starts_at, '+6 hours'))) <= datetime(?)", [t]);
  return r.changes;
}

export { toBuddyCard };
