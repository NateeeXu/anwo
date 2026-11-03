// server/src/modules/chat/service.ts — OWNED BY THE `chat` MODULE AGENT.
// Chat domain logic on top of server/src/lib/conversations.ts: guards (block / verified-only / banned / quota / lock),
// conversation DTOs, read receipts, typing window, search, sync, blocks. Stable exports consumed by other modules:
//   openConversation({ initiatorId, recipientId, context?, firstMessage? })   → { conversationId, created }
//   openGroupConversation({ ownerId, title, context?, memberIds, campusId? }) → { conversationId, created }
//   postSystemMessage(conversationId, event, data)
//   postContextCard(conversationId, senderId, card)
import type { ContextCard, Conversation, Message, UserPublic } from '@shared/types';
import type { ChatMember, ConversationDto, ConversationListQuery, MessagesPage, SearchHit, SyncResult } from '@shared/schemas/chat';
import { q, parseJson, placeholders } from '../../db';
import { ApiError } from '../../lib/errors';
import { nowIso, nowMs, DAY } from '../../lib/time';
import type { ConversationMemberRow, ConversationRow, MessageRow, AuthUser, UploadRow } from '../../lib/types';
import { loadUser, trustError } from '../../lib/auth';
import { dailyMessageCap, dailyNewConversationCap } from '../../lib/trust';
import { loadUsersPublic, loadUserPublic, unreadCounts, lastSeenBucket } from '../../lib/users';
import { getUpload } from '../../lib/uploads';
import { notify } from '../../lib/notify';
import { logEvent } from '../../lib/events';
import { isOnline, publish, publishTopic, unsubscribeUser } from '../../realtime/hub';
import {
  openConversation as libOpenConversation,
  postMessage as libPostMessage,
  postContextCard as libPostContextCard,
  postSystemMessage as libPostSystemMessage,
  contextCardFor,
  markConversationRead,
  memberRow,
  conversationMembers,
  loadConversation,
  loadMessage,
  isBlockedEither,
  hydrateMessages,
  addMembers as libAddMembers,
  removeMember as libRemoveMember,
  lockConversation as libLockConversation,
  type ContextRef,
} from '../../lib/conversations';

const PREVIEW_LEN = 120;
const EDIT_WINDOW_MS = 10 * 60_000;
const TYPING_WINDOW_MS = 5_000;

// ------------------------------------------------------------------ typing window (in-memory, WS_EVENTS §8)
const typing = new Map<string, Map<string, number>>(); // conversationId → userId → expiresAt (ms)
export function setTyping(conversationId: string, userId: string, on: boolean): void {
  let m = typing.get(conversationId);
  if (!m) typing.set(conversationId, (m = new Map()));
  if (on) m.set(userId, nowMs() + TYPING_WINDOW_MS);
  else m.delete(userId);
  if (!m.size) typing.delete(conversationId);
}
export function typingUserIds(conversationId: string, excludeUserId?: string): string[] {
  const m = typing.get(conversationId);
  if (!m) return [];
  const t = nowMs();
  const out: string[] = [];
  for (const [uid, exp] of m) {
    if (exp <= t) m.delete(uid);
    else if (uid !== excludeUserId) out.push(uid);
  }
  if (!m.size) typing.delete(conversationId);
  return out;
}
/** Shared by REST + ws: validates membership, throttles, publishes `chat.typing` to the other members. */
export function broadcastTyping(conversationId: string, userId: string, on: boolean): void {
  requireMember(conversationId, userId);
  setTyping(conversationId, userId, on);
  publishTopic(`conversation:${conversationId}`, { type: 'chat.typing', data: { conversationId, userId, typing: on } }, { excludeUserId: userId });
}

// ------------------------------------------------------------------ guards
export function requireMember(conversationId: string, userId: string): { conversation: ConversationRow; member: ConversationMemberRow } {
  const conversation = loadConversation(conversationId);
  const member = memberRow(conversationId, userId);
  if (!conversation || !member || member.left_at !== null) throw new ApiError('NOT_FOUND', 'Conversation not found');
  return { conversation, member };
}

function loadUserOrThrow(id: string): AuthUser {
  const u = loadUser(id);
  if (!u || u.deleted_at) throw new ApiError('NOT_FOUND', 'User not found');
  return u;
}

/** Direct-thread guards between two people: blocks, bans, verified-only (DATA_MODEL §3.3). */
function assertCanMessage(sender: AuthUser, recipient: AuthUser, opts: { firstMessage: boolean }): void {
  if (sender.banned === 1) throw new ApiError('BANNED', 'Account suspended');
  if (isBlockedEither(sender.id, recipient.id)) throw new ApiError('BLOCKED', 'You cannot message this user');
  if (recipient.banned === 1 && opts.firstMessage) throw new ApiError('NOT_FOUND', 'User not found');
  if (opts.firstMessage && recipient.verified_only_messaging === 1 && sender.trust_level < 1 && sender.role !== 'admin')
    throw new ApiError('VERIFIED_ONLY', 'This user only accepts messages from verified students', { data: { required: 1, current: sender.trust_level } });
}

function assertMessageQuota(sender: AuthUser, conversationId: string): void {
  if (sender.role === 'admin') return;
  const cap = dailyMessageCap(sender.trust_level);
  if (cap === null) return;
  if (cap === 0) {
    // L0 may only reply where someone else has already written to them
    const replies = q.count("SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND sender_id IS NOT NULL AND sender_id <> ? AND kind IN ('text','image')", [conversationId, sender.id]);
    if (replies === 0) throw new ApiError('QUOTA_EXCEEDED', 'Verify your edu email to start conversations', { data: { limit: 0, current: 0, required: 1 } });
    return;
  }
  const since = new Date(nowMs() - DAY).toISOString();
  const sent = q.count("SELECT COUNT(*) FROM messages WHERE sender_id = ? AND kind IN ('text','image') AND created_at >= ?", [sender.id, since]);
  if (sent >= cap) throw new ApiError('QUOTA_EXCEEDED', 'Daily message limit reached', { data: { limit: cap, current: sent } });
}

function assertNewConversationQuota(initiator: AuthUser): void {
  if (initiator.role === 'admin') return;
  const cap = dailyNewConversationCap(initiator.trust_level);
  if (cap === null) return;
  const since = new Date(nowMs() - DAY).toISOString();
  const opened = q.count("SELECT COUNT(*) FROM conversations WHERE created_by = ? AND kind = 'direct' AND created_at >= ?", [initiator.id, since]);
  if (opened >= cap) throw new ApiError('QUOTA_EXCEEDED', 'Daily new-conversation limit reached', { data: { limit: cap, current: opened } });
}

function assertUploadUsable(uploadId: string, userId: string, isAdmin: boolean): UploadRow {
  const u = getUpload(uploadId);
  if (!u || u.kind !== 'image') throw new ApiError('VALIDATION', 'Invalid image', { fields: { uploadId: 'Upload not found or not an image' } });
  if (u.is_private === 1) throw new ApiError('VALIDATION', 'Private uploads cannot be sent', { fields: { uploadId: 'Private uploads cannot be sent in chat' } });
  if (u.owner_id && u.owner_id !== userId && !isAdmin) throw new ApiError('FORBIDDEN', 'Not your upload');
  return u;
}

// ------------------------------------------------------------------ DTOs
type ConvExtra = { members: ConversationMemberRow[]; users: Map<string, UserPublic>; lastMessage: Message | null };

/** Latest stored context card in a thread — fallback when the entity row was removed (other modules' seeds re-run). */
function storedContextCard(conversationId: string): ContextCard | null {
  const r = q.get<{ context_json: string | null }>("SELECT context_json FROM messages WHERE conversation_id = ? AND kind = 'context_card' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1", [conversationId]);
  const c = r ? parseJson<ContextCard | null>(r.context_json, null) : null;
  return c && typeof c === 'object' && 'type' in c && 'link' in c ? c : null;
}
export function conversationContext(conv: ConversationRow): ContextCard | null {
  if (!conv.context_type || !conv.context_id) return null;
  return contextCardFor(conv.context_type as ContextCard['type'], conv.context_id) ?? storedContextCard(conv.id);
}

function buildConversationDto(conv: ConversationRow, viewerId: string, me: ConversationMemberRow, extra: ConvExtra): ConversationDto {
  const active = extra.members.filter((m) => m.left_at === null);
  const members: ChatMember[] = active
    .map((m) => {
      const u = extra.users.get(m.user_id);
      return u ? { ...u, memberRole: m.role, lastReadAt: m.last_read_at } : null;
    })
    .filter((x): x is ChatMember => !!x);
  const peerRow = conv.kind === 'direct' ? extra.members.find((m) => m.user_id !== viewerId) ?? null : null;
  const peer = peerRow ? extra.users.get(peerRow.user_id) ?? null : null;
  let blockedByMe = false;
  let blockedMe = false;
  if (peer) {
    blockedByMe = q.count('SELECT COUNT(*) FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [viewerId, peer.id]) > 0;
    blockedMe = q.count('SELECT COUNT(*) FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [peer.id, viewerId]) > 0;
  }
  const muted = !!me.muted_until && me.muted_until > nowIso();
  return {
    id: conv.id,
    kind: conv.kind,
    title: conv.title,
    campusId: conv.campus_id,
    context: conversationContext(conv),
    members,
    lastMessage: extra.lastMessage,
    lastMessageAt: conv.last_message_at,
    unreadCount: me.unread_count,
    muted,
    mutedUntil: muted ? me.muted_until : null,
    archived: me.archived === 1,
    isLocked: conv.is_locked === 1,
    scamBannerDismissed: me.scam_banner_dismissed === 1,
    createdAt: conv.created_at,
    typingUserIds: typingUserIds(conv.id, viewerId),
    messageCount: conv.message_count,
    peer,
    memberCount: active.length,
    blockedByMe,
    blockedMe,
    myRole: me.role,
  };
}

/** Batch-hydrates conversation DTOs for a viewer (members, users, last messages). */
export function toConversationDtos(rows: ConversationRow[], viewerId: string): ConversationDto[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const memberRows = q.all<ConversationMemberRow>(`SELECT * FROM conversation_members WHERE conversation_id IN (${placeholders(ids.length)}) ORDER BY joined_at`, ids);
  const byConv = new Map<string, ConversationMemberRow[]>();
  for (const m of memberRows) {
    let arr = byConv.get(m.conversation_id);
    if (!arr) byConv.set(m.conversation_id, (arr = []));
    arr.push(m);
  }
  const users = loadUsersPublic(memberRows.map((m) => m.user_id));
  const lastIds = rows.map((r) => r.last_message_id).filter((x): x is string => !!x);
  const lastRows = lastIds.length ? q.all<MessageRow>(`SELECT * FROM messages WHERE id IN (${placeholders(lastIds.length)})`, lastIds) : [];
  const lastMap = new Map(hydrateMessages(lastRows).map((m) => [m.id, m]));
  const out: ConversationDto[] = [];
  for (const conv of rows) {
    const members = byConv.get(conv.id) ?? [];
    const me = members.find((m) => m.user_id === viewerId);
    if (!me) continue;
    out.push(buildConversationDto(conv, viewerId, me, { members, users, lastMessage: conv.last_message_id ? lastMap.get(conv.last_message_id) ?? null : null }));
  }
  return out;
}
export function getConversationDto(conversationId: string, viewerId: string): ConversationDto {
  const { conversation } = requireMember(conversationId, viewerId);
  const dto = toConversationDtos([conversation], viewerId)[0];
  if (!dto) throw new ApiError('NOT_FOUND', 'Conversation not found');
  return dto;
}

// ------------------------------------------------------------------ list
export function listConversations(viewerId: string, p: ConversationListQuery): { items: ConversationDto[]; total: number; totalUnread: number } {
  const where: string[] = ['cm.user_id = ?', 'cm.left_at IS NULL', 'cm.archived = ?'];
  const params: (string | number)[] = [viewerId, p.archived ? 1 : 0];
  if (p.kind?.length) {
    where.push(`c.kind IN (${placeholders(p.kind.length)})`);
    params.push(...p.kind);
  }
  if (p.unreadOnly) where.push('cm.unread_count > 0');
  if (p.updatedSince) {
    where.push('c.updated_at >= ?');
    params.push(p.updatedSince);
  }
  if (p.q) {
    where.push(`(c.title LIKE ? ESCAPE '\\' OR c.last_message_preview LIKE ? ESCAPE '\\' OR EXISTS (
      SELECT 1 FROM conversation_members cm2 JOIN users u2 ON u2.id = cm2.user_id
       WHERE cm2.conversation_id = c.id AND cm2.user_id <> ? AND cm2.left_at IS NULL AND u2.name LIKE ? ESCAPE '\\'))`);
    const like = `%${escapeLike(p.q)}%`;
    params.push(like, like, viewerId, like);
  }
  const sql = `FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id WHERE ${where.join(' AND ')}`;
  const total = q.count(`SELECT COUNT(*) ${sql}`, params);
  const rows = q.all<ConversationRow>(`SELECT c.* ${sql} ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT ? OFFSET ?`, [...params, p.pageSize, (p.page - 1) * p.pageSize]);
  return { items: toConversationDtos(rows, viewerId), total, totalUnread: unreadCounts(viewerId).messages };
}
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ------------------------------------------------------------------ open / create
export type OpenConversationArgs = {
  initiatorId: string;
  recipientId: string;
  context?: { type: ContextCard['type']; id: string } | null;
  firstMessage?: { kind?: 'text' | 'image'; body?: string; uploadId?: string; clientId?: string } | null;
  /** analytics source (listing_detail, wanted_offer, item_detail, profile, …) */
  source?: string;
};
/** Opens (or reuses) a direct conversation after block / verified-only / banned / quota checks. */
export async function openConversation(args: OpenConversationArgs): Promise<{ conversationId: string; created: boolean }> {
  const initiator = loadUserOrThrow(args.initiatorId);
  if (args.initiatorId === args.recipientId) throw new ApiError('BAD_REQUEST', 'You cannot message yourself');
  const recipient = loadUserOrThrow(args.recipientId);
  if (initiator.trust_level < 1 && initiator.role !== 'admin') throw trustError(initiator, 1);
  assertCanMessage(initiator, recipient, { firstMessage: true });
  const context: ContextRef | null = args.context ? { type: args.context.type, id: args.context.id } : null;
  const card = context ? contextCardFor(context.type, context.id) : null;
  if (context && !card) throw new ApiError('NOT_FOUND', 'Context entity not found');
  const campusId = initiator.campus_id ?? recipient.campus_id ?? null;

  // quota applies to brand-new threads only
  const existing = context
    ? q.get<{ id: string }>('SELECT id FROM conversations WHERE direct_key = ?', [[...[initiator.id, recipient.id].sort(), context.type, context.id].join('|')])
    : q.get<{ id: string }>('SELECT id FROM conversations WHERE direct_key = ?', [[...[initiator.id, recipient.id].sort(), '', ''].join('|')]);
  if (!existing) assertNewConversationQuota(initiator);

  const { conversation, created } = libOpenConversation({ kind: 'direct', memberIds: [initiator.id, recipient.id], campusId, context, createdBy: initiator.id });
  if (created) {
    if (card) libPostContextCard(conversation.id, initiator.id, card);
    logEvent(null, 'chat.start', { userId: initiator.id, campusId, entityType: context?.type ?? 'user', entityId: context?.id ?? recipient.id, props: { conversationId: conversation.id, recipientId: recipient.id, source: args.source ?? null } });
  }
  if (args.firstMessage && (args.firstMessage.body?.trim() || args.firstMessage.uploadId)) {
    sendMessage({
      conversationId: conversation.id, senderId: initiator.id, kind: args.firstMessage.kind ?? (args.firstMessage.uploadId ? 'image' : 'text'),
      body: args.firstMessage.body, uploadId: args.firstMessage.uploadId, clientId: args.firstMessage.clientId,
    });
  }
  return { conversationId: conversation.id, created };
}

export async function openGroupConversation(args: { ownerId: string; title: string; context?: { type: ContextCard['type']; id: string } | null; memberIds: string[]; campusId?: string | null }): Promise<{ conversationId: string; created: boolean }> {
  const owner = loadUserOrThrow(args.ownerId);
  const members = [...new Set([args.ownerId, ...args.memberIds])];
  const context: ContextRef | null = args.context ? { type: args.context.type, id: args.context.id } : null;
  // one group per context entity (buddy post) — reuse and top-up members
  if (context) {
    const existing = q.get<ConversationRow>("SELECT * FROM conversations WHERE kind = 'group' AND context_type = ? AND context_id = ? ORDER BY created_at LIMIT 1", [context.type, context.id]);
    if (existing) {
      const current = new Set(conversationMembers(existing.id).map((m) => m.user_id));
      const toAdd = members.filter((id) => !current.has(id));
      if (toAdd.length) libAddMembers(existing.id, toAdd);
      return { conversationId: existing.id, created: false };
    }
  }
  const { conversation } = libOpenConversation({ kind: 'group', memberIds: members, campusId: args.campusId ?? owner.campus_id ?? null, context, createdBy: owner.id, title: args.title });
  const card = context ? contextCardFor(context.type, context.id) : null;
  if (card) libPostContextCard(conversation.id, owner.id, card);
  libPostSystemMessage(conversation.id, 'group_created', { userId: owner.id, title: args.title });
  logEvent(null, 'chat.start', { userId: owner.id, campusId: conversation.campus_id, entityType: context?.type ?? 'group', entityId: context?.id ?? conversation.id, props: { conversationId: conversation.id, kind: 'group', members: members.length } });
  return { conversationId: conversation.id, created: true };
}

export async function postSystemMessage(conversationId: string, event: string, data: Record<string, unknown> = {}): Promise<void> {
  libPostSystemMessage(conversationId, event, data);
}
export async function postContextCard(conversationId: string, senderId: string | null, card: ContextCard): Promise<void> {
  libPostContextCard(conversationId, senderId, card);
}

// ------------------------------------------------------------------ messages
export function listMessages(conversationId: string, viewerId: string, p: { before?: string; after?: string; limit: number }): MessagesPage {
  requireMember(conversationId, viewerId);
  const params: (string | number)[] = [conversationId];
  let where = 'conversation_id = ?';
  let order = 'DESC';
  if (p.after) {
    const anchor = loadMessage(p.after);
    if (anchor && anchor.conversation_id === conversationId) {
      where += ' AND (created_at > ? OR (created_at = ? AND id > ?))';
      params.push(anchor.created_at, anchor.created_at, anchor.id);
    }
    order = 'ASC';
  } else if (p.before) {
    const anchor = loadMessage(p.before);
    if (anchor && anchor.conversation_id === conversationId) {
      where += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
      params.push(anchor.created_at, anchor.created_at, anchor.id);
    }
  }
  const rows = q.all<MessageRow>(`SELECT * FROM messages WHERE ${where} ORDER BY created_at ${order}, id ${order} LIMIT ?`, [...params, p.limit + 1]);
  const hasMore = rows.length > p.limit;
  const page = hasMore ? rows.slice(0, p.limit) : rows;
  if (order === 'DESC') page.reverse();
  const items = hydrateMessages(page);
  attachReadBy(conversationId, items, viewerId);
  return { items, hasMore, oldestId: items[0]?.id ?? null, newestId: items[items.length - 1]?.id ?? null };
}

/** readBy: for the viewer's own messages, which other members have read them (via last_read_at or message_reads). */
function attachReadBy(conversationId: string, items: Message[], viewerId: string): void {
  const mine = items.filter((m) => m.senderId === viewerId);
  if (!mine.length) return;
  const others = conversationMembers(conversationId).filter((m) => m.user_id !== viewerId);
  const ids = mine.map((m) => m.id);
  const reads = q.all<{ message_id: string; user_id: string }>(`SELECT message_id, user_id FROM message_reads WHERE message_id IN (${placeholders(ids.length)})`, ids);
  const readMap = new Map<string, Set<string>>();
  for (const r of reads) {
    let s = readMap.get(r.message_id);
    if (!s) readMap.set(r.message_id, (s = new Set()));
    s.add(r.user_id);
  }
  for (const m of mine) {
    const set = readMap.get(m.id) ?? new Set<string>();
    for (const o of others) if (o.last_read_at && o.last_read_at >= m.createdAt) set.add(o.user_id);
    m.readBy = [...set];
  }
}

export type SendMessageArgs = {
  conversationId: string;
  senderId: string;
  kind: 'text' | 'image';
  body?: string | null;
  uploadId?: string | null;
  clientId?: string | null;
  replyToId?: string | null;
  isAdmin?: boolean;
};
/** One code path for REST + ws (WS_EVENTS §4 chat.send). Idempotent on clientId. */
export function sendMessage(args: SendMessageArgs): Message {
  const sender = loadUserOrThrow(args.senderId);
  const { conversation, member } = requireMember(args.conversationId, sender.id);
  if (args.clientId) {
    const existing = q.get<MessageRow>('SELECT * FROM messages WHERE conversation_id = ? AND sender_id = ? AND client_id = ?', [conversation.id, sender.id, args.clientId]);
    if (existing) {
      const [dto] = hydrateMessages([existing]);
      attachReadBy(conversation.id, [dto!], sender.id);
      return dto!;
    }
  }
  if (sender.banned === 1) throw new ApiError('BANNED', 'Account suspended');
  if (conversation.is_locked === 1) throw new ApiError('FORBIDDEN', 'This conversation is locked');
  if (conversation.kind === 'direct') {
    const other = conversationMembers(conversation.id, { activeOnly: false }).find((m) => m.user_id !== sender.id);
    if (other) {
      const recipient = loadUser(other.user_id);
      if (!recipient || recipient.deleted_at) throw new ApiError('FORBIDDEN', 'This user is no longer available');
      assertCanMessage(sender, recipient, { firstMessage: !hasMessagesFrom(conversation.id, sender.id) });
    }
  }
  const body = (args.body ?? '').trim();
  if (args.kind === 'text' && !body) throw new ApiError('VALIDATION', 'Message is empty', { fields: { body: 'Message cannot be empty' } });
  if (args.kind === 'image' && !args.uploadId) throw new ApiError('VALIDATION', 'Image required', { fields: { uploadId: 'uploadId is required for images' } });
  if (args.kind === 'image') assertUploadUsable(args.uploadId!, sender.id, !!args.isAdmin);
  if (args.replyToId) {
    const r = loadMessage(args.replyToId);
    if (!r || r.conversation_id !== conversation.id) throw new ApiError('NOT_FOUND', 'Reply target not found');
  }
  assertMessageQuota(sender, conversation.id);
  const msg = libPostMessage(conversation.id, sender.id, args.kind, args.kind === 'text' ? body : body || null, {
    uploadId: args.kind === 'image' ? args.uploadId : null, clientId: args.clientId ?? null, replyToId: args.replyToId ?? null,
  });
  // sender's own thread is read up to its own message
  q.run('UPDATE conversation_members SET last_read_message_id = ?, last_read_at = ?, unread_count = 0 WHERE conversation_id = ? AND user_id = ?', [msg.id, msg.createdAt, conversation.id, sender.id]);
  logEvent(null, 'chat.message', { userId: sender.id, campusId: conversation.campus_id, entityType: 'conversation', entityId: conversation.id, props: { kind: args.kind, context: conversation.context_type, length: body.length } });
  msg.readBy = [];
  return msg;
}
function hasMessagesFrom(conversationId: string, userId: string): boolean {
  return q.count("SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND sender_id = ? AND kind IN ('text','image')", [conversationId, userId]) > 0;
}

export function readConversation(conversationId: string, userId: string, messageId?: string | null): { unreadCount: 0; lastReadMessageId: string | null; readAt: string } {
  requireMember(conversationId, userId);
  const r = markConversationRead(conversationId, userId, messageId ?? null);
  return { unreadCount: 0, lastReadMessageId: r.lastReadMessageId, readAt: r.readAt };
}

export function patchConversation(conversationId: string, userId: string, patch: { archived?: boolean; mutedUntil?: string | null; scamBannerDismissed?: boolean }): ConversationDto {
  requireMember(conversationId, userId);
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.archived !== undefined) { sets.push('archived = ?'); params.push(patch.archived ? 1 : 0); }
  if (patch.mutedUntil !== undefined) { sets.push('muted_until = ?'); params.push(patch.mutedUntil); }
  if (patch.scamBannerDismissed !== undefined) { sets.push('scam_banner_dismissed = ?'); params.push(patch.scamBannerDismissed ? 1 : 0); }
  if (sets.length) q.run(`UPDATE conversation_members SET ${sets.join(', ')} WHERE conversation_id = ? AND user_id = ?`, [...params, conversationId, userId]);
  if (patch.archived !== undefined) publish(userId, { type: 'chat.conversation', data: { conversationId, unreadCount: 0, totalUnread: unreadCounts(userId).messages, lastMessage: null, lastMessageAt: null, archived: patch.archived } });
  return getConversationDto(conversationId, userId);
}

export function leaveConversation(conversationId: string, userId: string): void {
  const { conversation } = requireMember(conversationId, userId);
  if (conversation.kind === 'direct') throw new ApiError('INVALID_STATE', 'Direct conversations cannot be left', { data: { from: 'direct', to: 'left' } });
  libRemoveMember(conversationId, userId, 'member_left');
  unsubscribeUser(userId, `conversation:${conversationId}`);
  publish(userId, { type: 'chat.conversation', data: { conversationId, unreadCount: 0, totalUnread: unreadCounts(userId).messages, lastMessage: null, lastMessageAt: null, left: true } });
}

function requireGroupManager(conversationId: string, userId: string, isAdmin: boolean): ConversationRow {
  const { conversation, member } = requireMember(conversationId, userId);
  if (conversation.kind === 'direct') throw new ApiError('INVALID_STATE', 'Not a group', { data: { from: 'direct', to: 'group' } });
  if (!isAdmin && member.role === 'member') throw new ApiError('FORBIDDEN', 'Only the group owner can manage members');
  return conversation;
}
export function addGroupMembers(conversationId: string, actorId: string, userIds: string[], isAdmin = false): ConversationDto {
  const conversation = requireGroupManager(conversationId, actorId, isAdmin);
  const valid = userIds.filter((id) => id !== actorId && !!loadUser(id));
  const added = libAddMembers(conversationId, valid);
  for (const id of added) {
    notify(id, 'system', {
      title: { zh: '你被加入了一个群聊', en: 'You were added to a group chat' },
      body: conversation.title ?? null, link: `/chat/${conversationId}`, entityType: 'conversation', entityId: conversationId,
    });
  }
  return getConversationDto(conversationId, actorId);
}
export function removeGroupMember(conversationId: string, actorId: string, targetId: string, isAdmin = false): ConversationDto {
  requireGroupManager(conversationId, actorId, isAdmin);
  if (targetId === actorId) throw new ApiError('BAD_REQUEST', 'Use leave to remove yourself');
  const m = memberRow(conversationId, targetId);
  if (!m || m.left_at !== null) throw new ApiError('NOT_FOUND', 'Member not found');
  if (m.role === 'owner') throw new ApiError('FORBIDDEN', 'The owner cannot be removed');
  libRemoveMember(conversationId, targetId, 'member_removed');
  unsubscribeUser(targetId, `conversation:${conversationId}`);
  return getConversationDto(conversationId, actorId);
}

export function deleteMessage(messageId: string, actorId: string, isAdmin: boolean): Message {
  const row = loadMessage(messageId);
  if (!row) throw new ApiError('NOT_FOUND', 'Message not found');
  requireMember(row.conversation_id, actorId);
  if (!isAdmin) {
    if (row.sender_id !== actorId) throw new ApiError('FORBIDDEN', 'Not your message');
    if (nowMs() - Date.parse(row.created_at) > EDIT_WINDOW_MS) throw new ApiError('FORBIDDEN', 'Messages can only be deleted within 10 minutes');
  }
  if (row.deleted_at) return hydrateMessages([row])[0]!;
  const t = nowIso();
  q.run('UPDATE messages SET deleted_at = ?, body = NULL, upload_id = NULL WHERE id = ?', [t, messageId]);
  const conv = loadConversation(row.conversation_id);
  if (conv?.last_message_id === messageId) q.run("UPDATE conversations SET last_message_preview = ?, updated_at = ? WHERE id = ?", ['[deleted]', t, row.conversation_id]);
  const updated = loadMessage(messageId)!;
  const dto = hydrateMessages([updated])[0]!;
  publishTopic(`conversation:${row.conversation_id}`, { type: 'chat.message', data: { id: messageId, conversationId: row.conversation_id, deletedAt: t, deleted: true } });
  return dto;
}
export function editMessage(messageId: string, actorId: string, body: string): Message {
  const row = loadMessage(messageId);
  if (!row) throw new ApiError('NOT_FOUND', 'Message not found');
  requireMember(row.conversation_id, actorId);
  if (row.sender_id !== actorId) throw new ApiError('FORBIDDEN', 'Not your message');
  if (row.kind !== 'text' || row.deleted_at) throw new ApiError('INVALID_STATE', 'Only text messages can be edited', { data: { from: row.kind, to: 'edited' } });
  if (nowMs() - Date.parse(row.created_at) > EDIT_WINDOW_MS) throw new ApiError('FORBIDDEN', 'Messages can only be edited within 10 minutes');
  const t = nowIso();
  q.run('UPDATE messages SET body = ?, edited_at = ? WHERE id = ?', [body, t, messageId]);
  const conv = loadConversation(row.conversation_id);
  if (conv?.last_message_id === messageId) q.run('UPDATE conversations SET last_message_preview = ?, updated_at = ? WHERE id = ?', [body.slice(0, PREVIEW_LEN), t, row.conversation_id]);
  const dto = hydrateMessages([loadMessage(messageId)!])[0]!;
  publishTopic(`conversation:${row.conversation_id}`, { type: 'chat.message', data: dto });
  return dto;
}

// ------------------------------------------------------------------ search / sync / presence
export function searchMessages(viewerId: string, p: { q: string; conversationId?: string; page: number; pageSize: number }): { items: SearchHit[]; total: number } {
  const where: string[] = ['m.deleted_at IS NULL', "m.kind IN ('text','image','context_card')", "m.body LIKE ? ESCAPE '\\'", 'cm.user_id = ?', 'cm.left_at IS NULL'];
  const params: (string | number)[] = [`%${escapeLike(p.q)}%`, viewerId];
  if (p.conversationId) { where.push('m.conversation_id = ?'); params.push(p.conversationId); }
  const sql = `FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id WHERE ${where.join(' AND ')}`;
  const total = q.count(`SELECT COUNT(*) ${sql}`, params);
  const rows = q.all<MessageRow>(`SELECT m.* ${sql} ORDER BY m.created_at DESC LIMIT ? OFFSET ?`, [...params, p.pageSize, (p.page - 1) * p.pageSize]);
  const msgs = hydrateMessages(rows);
  const convIds = [...new Set(rows.map((r) => r.conversation_id))];
  const convs = convIds.length ? q.all<ConversationRow>(`SELECT * FROM conversations WHERE id IN (${placeholders(convIds.length)})`, convIds) : [];
  const dtos = new Map(toConversationDtos(convs, viewerId).map((c) => [c.id, c]));
  const items: SearchHit[] = msgs.map((m) => {
    const c = dtos.get(m.conversationId);
    return { ...m, conversation: { id: m.conversationId, title: c?.title ?? null, kind: c?.kind ?? 'direct', members: c?.members ?? [], peer: c?.peer ?? null } };
  });
  return { items, total };
}

export function sync(viewerId: string, since: string): SyncResult {
  const now = nowIso();
  const convRows = q.all<ConversationRow>(
    `SELECT c.* FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id
      WHERE cm.user_id = ? AND cm.left_at IS NULL AND (c.updated_at >= ? OR cm.last_read_at >= ?) ORDER BY c.updated_at DESC LIMIT 100`,
    [viewerId, since, since],
  );
  const conversations = toConversationDtos(convRows, viewerId);
  const msgRows = q.all<MessageRow>(
    `SELECT m.* FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE cm.user_id = ? AND cm.left_at IS NULL AND (m.created_at >= ? OR m.edited_at >= ? OR m.deleted_at >= ?) ORDER BY m.created_at ASC LIMIT 500`,
    [viewerId, since, since, since],
  );
  const messages = hydrateMessages(msgRows);
  const reads = q.all<{ conversation_id: string; user_id: string; last_read_message_id: string | null; last_read_at: string }>(
    `SELECT cm2.conversation_id, cm2.user_id, cm2.last_read_message_id, cm2.last_read_at FROM conversation_members cm2
      JOIN conversation_members me ON me.conversation_id = cm2.conversation_id AND me.user_id = ? AND me.left_at IS NULL
     WHERE cm2.user_id <> ? AND cm2.last_read_at >= ? LIMIT 500`,
    [viewerId, viewerId, since],
  ).map((r) => ({ conversationId: r.conversation_id, userId: r.user_id, lastReadMessageId: r.last_read_message_id, readAt: r.last_read_at }));
  const peerIds = new Set<string>();
  for (const c of conversations) if (c.peer) peerIds.add(c.peer.id);
  const presence = [...peerIds].map((id) => ({ userId: id, online: isOnline(id) }));
  return { conversations, messages, reads, presence, now };
}

export function presenceOf(userIds: string[]): Record<string, { online: boolean; lastSeenAt: 'online' | 'recently' | null }> {
  const out: Record<string, { online: boolean; lastSeenAt: 'online' | 'recently' | null }> = {};
  const ids = [...new Set(userIds)].slice(0, 100);
  if (!ids.length) return out;
  const rows = q.all<{ id: string; last_seen_at: string | null }>(`SELECT id, last_seen_at FROM users WHERE id IN (${placeholders(ids.length)})`, ids);
  for (const r of rows) out[r.id] = { online: isOnline(r.id), lastSeenAt: isOnline(r.id) ? 'online' : lastSeenBucket(r.last_seen_at) };
  return out;
}

// ------------------------------------------------------------------ blocks
export function blockUser(blockerId: string, blockedId: string, reason?: string | null): void {
  if (blockerId === blockedId) throw new ApiError('BAD_REQUEST', 'You cannot block yourself');
  loadUserOrThrow(blockedId);
  q.run('INSERT INTO blocks (blocker_id, blocked_id, reason, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(blocker_id, blocked_id) DO UPDATE SET reason = COALESCE(excluded.reason, blocks.reason)', [blockerId, blockedId, reason ?? null, nowIso()]);
  // archive shared direct threads for the blocker (and clear their unread)
  const shared = q.all<{ conversation_id: string }>(
    `SELECT a.conversation_id FROM conversation_members a JOIN conversation_members b ON b.conversation_id = a.conversation_id
       JOIN conversations c ON c.id = a.conversation_id WHERE a.user_id = ? AND b.user_id = ? AND c.kind = 'direct'`,
    [blockerId, blockedId],
  );
  for (const s of shared) {
    q.run('UPDATE conversation_members SET archived = 1, unread_count = 0 WHERE conversation_id = ? AND user_id = ?', [s.conversation_id, blockerId]);
    publish(blockerId, { type: 'chat.conversation', data: { conversationId: s.conversation_id, unreadCount: 0, totalUnread: unreadCounts(blockerId).messages, lastMessage: null, lastMessageAt: null, archived: true } });
  }
  logEvent(null, 'chat.block', { userId: blockerId, entityType: 'user', entityId: blockedId, props: { reason: reason ?? null } });
}
export function unblockUser(blockerId: string, blockedId: string): void {
  q.run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [blockerId, blockedId]);
  logEvent(null, 'chat.unblock', { userId: blockerId, entityType: 'user', entityId: blockedId });
}
export function listBlocks(blockerId: string): (UserPublic & { blockedAt: string; reason: string | null })[] {
  const rows = q.all<{ blocked_id: string; reason: string | null; created_at: string }>('SELECT blocked_id, reason, created_at FROM blocks WHERE blocker_id = ? ORDER BY created_at DESC', [blockerId]);
  const users = loadUsersPublic(rows.map((r) => r.blocked_id));
  return rows.map((r) => ({ ...(users.get(r.blocked_id) as UserPublic), blockedAt: r.created_at, reason: r.reason })).filter((u) => !!u.id);
}

// ------------------------------------------------------------------ admin
export function adminListConversations(p: { page: number; pageSize: number; q?: string; locked?: boolean; kind?: Conversation['kind'] }): { items: (Omit<ConversationDto, 'unreadCount' | 'muted' | 'archived' | 'scamBannerDismissed' | 'myRole' | 'blockedByMe' | 'blockedMe' | 'mutedUntil'> & { reportCount: number })[]; total: number } {
  const where: string[] = ['1 = 1'];
  const params: (string | number)[] = [];
  if (p.locked !== undefined) { where.push('c.is_locked = ?'); params.push(p.locked ? 1 : 0); }
  if (p.kind) { where.push('c.kind = ?'); params.push(p.kind); }
  if (p.q) {
    where.push(`(c.id = ? OR c.title LIKE ? ESCAPE '\\' OR c.last_message_preview LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM conversation_members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = c.id AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')))`);
    const like = `%${escapeLike(p.q)}%`;
    params.push(p.q, like, like, like, like);
  }
  const sql = `FROM conversations c WHERE ${where.join(' AND ')}`;
  const total = q.count(`SELECT COUNT(*) ${sql}`, params);
  const rows = q.all<ConversationRow>(`SELECT c.* ${sql} ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT ? OFFSET ?`, [...params, p.pageSize, (p.page - 1) * p.pageSize]);
  const ids = rows.map((r) => r.id);
  const memberRows = ids.length ? q.all<ConversationMemberRow>(`SELECT * FROM conversation_members WHERE conversation_id IN (${placeholders(ids.length)}) ORDER BY joined_at`, ids) : [];
  const users = loadUsersPublic(memberRows.map((m) => m.user_id));
  const lastIds = rows.map((r) => r.last_message_id).filter((x): x is string => !!x);
  const lastMap = new Map(hydrateMessages(lastIds.length ? q.all<MessageRow>(`SELECT * FROM messages WHERE id IN (${placeholders(lastIds.length)})`, lastIds) : []).map((m) => [m.id, m]));
  const reportCounts = new Map<string, number>();
  if (ids.length)
    for (const r of q.all<{ entity_id: string; n: number }>(`SELECT entity_id, COUNT(*) AS n FROM reports WHERE entity_type = 'conversation' AND entity_id IN (${placeholders(ids.length)}) AND status IN ('open','in_review') GROUP BY entity_id`, ids))
      reportCounts.set(r.entity_id, r.n);
  const items = rows.map((conv) => {
    const members = memberRows.filter((m) => m.conversation_id === conv.id);
    const active = members.filter((m) => m.left_at === null);
    const dtoMembers: ChatMember[] = active.map((m) => ({ ...(users.get(m.user_id) as UserPublic), memberRole: m.role, lastReadAt: m.last_read_at })).filter((u) => !!u.id);
    return {
      id: conv.id, kind: conv.kind, title: conv.title, campusId: conv.campus_id, context: conversationContext(conv), members: dtoMembers,
      lastMessage: conv.last_message_id ? lastMap.get(conv.last_message_id) ?? null : null, lastMessageAt: conv.last_message_at,
      isLocked: conv.is_locked === 1, createdAt: conv.created_at, messageCount: conv.message_count, peer: null, memberCount: active.length,
      reportCount: reportCounts.get(conv.id) ?? 0,
    };
  });
  return { items, total };
}
export function adminStats(): { conversations: number; groups: number; messages7d: number; locked: number; openReports: number; blocks: number } {
  const since = new Date(nowMs() - 7 * DAY).toISOString();
  return {
    conversations: q.count('SELECT COUNT(*) FROM conversations'),
    groups: q.count("SELECT COUNT(*) FROM conversations WHERE kind = 'group'"),
    messages7d: q.count("SELECT COUNT(*) FROM messages WHERE created_at >= ? AND kind IN ('text','image')", [since]),
    locked: q.count('SELECT COUNT(*) FROM conversations WHERE is_locked = 1'),
    openReports: q.count("SELECT COUNT(*) FROM reports WHERE entity_type IN ('message','conversation') AND status IN ('open','in_review')"),
    blocks: q.count('SELECT COUNT(*) FROM blocks'),
  };
}
export function setLocked(conversationId: string, locked: boolean, reason?: string | null): void {
  const conv = loadConversation(conversationId);
  if (!conv) throw new ApiError('NOT_FOUND', 'Conversation not found');
  libLockConversation(conversationId, locked);
  libPostSystemMessage(conversationId, locked ? 'locked' : 'unlocked', { reason: reason ?? null });
}
export function adminMessages(conversationId: string, limit = 50): Message[] {
  const rows = q.all<MessageRow>('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?', [conversationId, limit]);
  return hydrateMessages(rows.reverse());
}
