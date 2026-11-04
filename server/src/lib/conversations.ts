// Shared chat primitives on the conversations/messages tables (chat module builds REST + ws handlers on top).
// Every write publishes the WS_EVENTS §5.2 events so other modules get realtime for free.
//
//   const { conversation, created } = openConversation({ kind: 'direct', memberIds: [me, host], campusId, context: { type: 'listing', id }, createdBy: me });
//   postContextCard(conversation.id, me, contextCardFor('listing', id)!);
//   postMessage(conversation.id, me, 'text', '明天下午可以看房吗？', { clientId });
//   postSystemMessage(conversation.id, 'member_joined', { userId });
//   isMember(conversationId, userId) ; assertMember(...) ; conversationMembers(id) ; toMessageDto(row) ; lockConversation(id, true)
import type { ContextCard, Message, UserPublic, Upload } from '@shared/types';
import { q, uid, parseJson, placeholders } from '../db';
import { ApiError } from './errors';
import { nowIso, nowMs } from './time';
import type { ConversationMemberRow, ConversationRow, MessageRow } from './types';
import { loadUsersPublic, toUserPublic, loadUserPublicRow } from './users';
import { getUpload, toUploadDto } from './uploads';
import { publish, publishTopic, subscribersOf } from '../realtime/hub';
import { notify } from './notify';
import { unreadCounts } from './users';
import { getCampus } from './campuses';

export type ContextRef = { type: ContextCard['type']; id: string };

export function directKey(a: string, b: string, context?: ContextRef | null): string {
  return [...[a, b].sort(), context?.type ?? '', context?.id ?? ''].join('|');
}

export function loadConversation(id: string): ConversationRow | undefined {
  return q.get<ConversationRow>('SELECT * FROM conversations WHERE id = ?', [id]);
}
export function conversationMembers(conversationId: string, opts: { activeOnly?: boolean } = {}): ConversationMemberRow[] {
  return q.all<ConversationMemberRow>(
    `SELECT * FROM conversation_members WHERE conversation_id = ? ${opts.activeOnly === false ? '' : 'AND left_at IS NULL'} ORDER BY joined_at`,
    [conversationId],
  );
}
export function memberRow(conversationId: string, userId: string): ConversationMemberRow | undefined {
  return q.get<ConversationMemberRow>('SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [conversationId, userId]);
}
export function isMember(conversationId: string, userId: string): boolean {
  const m = memberRow(conversationId, userId);
  return !!m && m.left_at === null;
}
export function assertMember(conversationId: string, userId: string): ConversationMemberRow {
  const m = memberRow(conversationId, userId);
  if (!m || m.left_at !== null) throw new ApiError('NOT_FOUND', 'Conversation not found');
  return m;
}
export function isBlockedEither(a: string, b: string): boolean {
  return q.count('SELECT COUNT(*) FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', [a, b, b, a]) > 0;
}

export type OpenConversationInput = {
  kind: 'direct' | 'group' | 'support';
  memberIds: string[];
  campusId?: string | null;
  context?: ContextRef | null;
  createdBy?: string | null;
  title?: string | null;
};
/** Creates (or returns the existing direct) conversation. Does NOT check blocks/trust — callers do (chat service does). */
export function openConversation(input: OpenConversationInput): { conversation: ConversationRow; created: boolean } {
  const members = [...new Set(input.memberIds)];
  if (input.kind === 'direct') {
    if (members.length !== 2) throw new ApiError('BAD_REQUEST', 'Direct conversations need exactly 2 members');
    const key = directKey(members[0]!, members[1]!, input.context);
    const existing = q.get<ConversationRow>('SELECT * FROM conversations WHERE direct_key = ?', [key]);
    if (existing) {
      // re-activate members who left
      q.run('UPDATE conversation_members SET left_at = NULL WHERE conversation_id = ? AND left_at IS NOT NULL', [existing.id]);
      return { conversation: existing, created: false };
    }
    return { conversation: insertConversation(input, members, key), created: true };
  }
  return { conversation: insertConversation(input, members, null), created: true };
}
function insertConversation(input: OpenConversationInput, members: string[], directKeyValue: string | null): ConversationRow {
  const t = nowIso();
  const row: ConversationRow = {
    id: uid(), kind: input.kind, title: input.title ?? null, campus_id: input.campusId ?? null,
    context_type: input.context?.type ?? null, context_id: input.context?.id ?? null, created_by: input.createdBy ?? null,
    direct_key: directKeyValue, last_message_id: null, last_message_at: null, last_message_preview: null, message_count: 0,
    is_locked: 0, created_at: t, updated_at: t,
  };
  q.tx(() => {
    q.insert('conversations', row as unknown as Record<string, string | number | null>);
    for (const m of members) {
      const role = input.kind !== 'direct' && m === input.createdBy ? 'owner' : 'member';
      q.run('INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)', [row.id, m, role, t]);
    }
  });
  return row;
}
/** Adds members to a group (idempotent); returns the ids that were newly added. */
export function addMembers(conversationId: string, userIds: string[], opts: { role?: 'owner' | 'admin' | 'member'; system?: boolean } = {}): string[] {
  const added: string[] = [];
  const t = nowIso();
  for (const id of new Set(userIds)) {
    const m = memberRow(conversationId, id);
    if (m && m.left_at === null) continue;
    if (m) q.run('UPDATE conversation_members SET left_at = NULL, joined_at = ?, unread_count = 0 WHERE conversation_id = ? AND user_id = ?', [t, conversationId, id]);
    else q.run('INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)', [conversationId, id, opts.role ?? 'member', t]);
    added.push(id);
    if (opts.system !== false) postSystemMessage(conversationId, 'member_joined', { userId: id });
  }
  return added;
}
export function removeMember(conversationId: string, userId: string, event: 'member_left' | 'member_removed' = 'member_left'): void {
  q.run('UPDATE conversation_members SET left_at = ? WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL', [nowIso(), conversationId, userId]);
  postSystemMessage(conversationId, event, { userId });
}
export function lockConversation(conversationId: string, locked: boolean): void {
  q.run('UPDATE conversations SET is_locked = ?, updated_at = ? WHERE id = ?', [locked ? 1 : 0, nowIso(), conversationId]);
  for (const m of conversationMembers(conversationId)) publish(m.user_id, { type: 'chat.locked', data: { conversationId, locked } });
}

// ------------------------------------------------------------------ context cards
/** Builds a ContextCard from the entity tables (null when the entity does not exist). */
export function contextCardFor(type: ContextCard['type'], id: string): ContextCard | null {
  switch (type) {
    case 'listing': {
      const r = q.get<{ id: string; title: string; price_cents: number; neighborhood: string | null; city: string; status: string; cover_url: string | null }>(
        'SELECT l.id, l.title, l.price_cents, l.neighborhood, l.city, l.status, u.url AS cover_url FROM listings l LEFT JOIN uploads u ON u.id = l.cover_upload_id WHERE l.id = ?', [id]);
      return r ? { type, id, title: r.title, subtitle: [r.neighborhood, r.city].filter(Boolean).join(', '), priceCents: r.price_cents, imageUrl: r.cover_url, link: `/listings/${id}`, status: r.status } : null;
    }
    case 'wanted': {
      const r = q.get<{ title: string; budget_max_cents: number; move_in_from: string; status: string }>('SELECT title, budget_max_cents, move_in_from, status FROM wanted_posts WHERE id = ?', [id]);
      return r ? { type, id, title: r.title, subtitle: `≤ $${Math.round(r.budget_max_cents / 100)} · ${r.move_in_from}`, priceCents: r.budget_max_cents, link: `/wanted/${id}`, status: r.status } : null;
    }
    case 'market_item': {
      const r = q.get<{ title: string; price_cents: number; is_free: number; status: string; cover_url: string | null; category: string }>(
        'SELECT m.title, m.price_cents, m.is_free, m.status, m.category, u.url AS cover_url FROM market_items m LEFT JOIN uploads u ON u.id = m.cover_upload_id WHERE m.id = ?', [id]);
      return r ? { type, id, title: r.title, subtitle: r.category, priceCents: r.is_free ? 0 : r.price_cents, imageUrl: r.cover_url, link: `/market/${id}`, status: r.status } : null;
    }
    case 'buddy_post': {
      const r = q.get<{ title: string; type: string; starts_at: string | null; status: string }>('SELECT title, type, starts_at, status FROM buddy_posts WHERE id = ?', [id]);
      return r ? { type, id, title: r.title, subtitle: [r.type, r.starts_at].filter(Boolean).join(' · '), link: `/buddy/${id}`, status: r.status } : null;
    }
    case 'escrow': {
      const r = q.get<{ amount_cents: number; status: string; listing_title: string | null }>('SELECT e.amount_cents, e.status, l.title AS listing_title FROM escrows e LEFT JOIN listings l ON l.id = e.listing_id WHERE e.id = ?', [id]);
      return r ? { type, id, title: r.listing_title ?? 'Secure Payment · 安心付', subtitle: r.status, priceCents: r.amount_cents, link: `/escrow/${id}`, status: r.status } : null;
    }
    default:
      return null;
  }
}

// ------------------------------------------------------------------ messages
export function toMessageDto(r: MessageRow, extra: { sender?: UserPublic | null; image?: Upload | null; readBy?: string[] } = {}): Message {
  const deleted = !!r.deleted_at;
  const ctx = parseJson<Record<string, unknown> | null>(r.context_json, null);
  const m: Message = {
    id: r.id, conversationId: r.conversation_id, senderId: r.sender_id, kind: r.kind, body: deleted ? null : r.body,
    clientId: r.client_id, replyToId: r.reply_to_id, editedAt: r.edited_at, deletedAt: r.deleted_at, createdAt: r.created_at,
  };
  if (deleted) m.deleted = true;
  if (extra.sender) m.sender = extra.sender;
  if (extra.image) m.image = extra.image;
  if (ctx && !deleted) m.context = ctx as ContextCard | Record<string, unknown>;
  if (extra.readBy) m.readBy = extra.readBy;
  return m;
}
export function loadMessage(id: string): MessageRow | undefined {
  return q.get<MessageRow>('SELECT * FROM messages WHERE id = ?', [id]);
}
export function hydrateMessages(rows: MessageRow[]): Message[] {
  const senders = loadUsersPublic(rows.map((r) => r.sender_id).filter((x): x is string => !!x));
  const uploadIds = rows.map((r) => r.upload_id).filter((x): x is string => !!x);
  const uploads = new Map<string, Upload>();
  if (uploadIds.length)
    for (const u of q.all<import('./types').UploadRow>(`SELECT * FROM uploads WHERE id IN (${placeholders(uploadIds.length)})`, uploadIds)) uploads.set(u.id, toUploadDto(u));
  return rows.map((r) => toMessageDto(r, { sender: r.sender_id ? senders.get(r.sender_id) ?? null : null, image: r.upload_id ? uploads.get(r.upload_id) ?? null : null }));
}

export type PostMessageOptions = {
  uploadId?: string | null;
  context?: Record<string, unknown> | ContextCard | null;
  clientId?: string | null;
  replyToId?: string | null;
  /** default true for user messages: bell notification to members not subscribed to the thread */
  notify?: boolean;
};
export function postMessage(conversationId: string, senderId: string | null, kind: MessageRow['kind'], body: string | null, opts: PostMessageOptions = {}): Message {
  if (opts.clientId && senderId) {
    const existing = q.get<MessageRow>('SELECT * FROM messages WHERE conversation_id = ? AND sender_id = ? AND client_id = ?', [conversationId, senderId, opts.clientId]);
    if (existing) return hydrateMessages([existing])[0]!;
  }
  const row: MessageRow = {
    id: uid(), conversation_id: conversationId, sender_id: senderId, kind, body, upload_id: opts.uploadId ?? null,
    context_json: opts.context ? JSON.stringify(opts.context) : null, client_id: opts.clientId ?? null, reply_to_id: opts.replyToId ?? null,
    edited_at: null, deleted_at: null, created_at: nowIso(),
  };
  q.insert('messages', row as unknown as Record<string, string | number | null>); // trigger bumps conversation + unread counts
  const dto = hydrateMessages([row])[0]!;
  fanOutMessage(conversationId, dto, senderId, opts.notify ?? (senderId !== null && kind !== 'system'));
  return dto;
}
export function postContextCard(conversationId: string, senderId: string | null, card: ContextCard): Message {
  return postMessage(conversationId, senderId, 'context_card', card.title, { context: card, notify: false });
}
export function postSystemMessage(conversationId: string, event: string, data: Record<string, unknown> = {}): Message {
  const msg = postMessage(conversationId, null, 'system', event, { context: { event, ...data }, notify: false });
  const memberEvents: Record<string, 'joined' | 'left' | 'removed' | 'added'> = { member_joined: 'joined', member_left: 'left', member_removed: 'removed', member_added: 'added' };
  const ev = memberEvents[event];
  if (ev && typeof data.userId === 'string') {
    const u = loadUserPublicRow(data.userId);
    publishTopic(`conversation:${conversationId}`, { type: 'chat.member', data: { conversationId, event: ev, userId: data.userId, user: u ? toUserPublic(u) : undefined } });
  }
  return msg;
}

/** chat.message → conversation topic; chat.conversation → each member's user topic; bell for non-subscribed members. */
function fanOutMessage(conversationId: string, msg: Message, senderId: string | null, bell: boolean): void {
  const conv = loadConversation(conversationId);
  if (!conv) return;
  publishTopic(`conversation:${conversationId}`, { type: 'chat.message', data: msg });
  const subscribed = subscribersOf(`conversation:${conversationId}`);
  const members = conversationMembers(conversationId);
  const context = conv.context_type && conv.context_id ? contextCardFor(conv.context_type as ContextCard['type'], conv.context_id) : null;
  const preview = msg.kind === 'text' ? (msg.body ?? '').slice(0, 120) : msg.kind === 'image' ? '[image]' : msg.kind === 'context_card' ? '[card]' : (msg.body ?? '');
  const senderName = msg.sender?.name ?? null;
  for (const m of members) {
    const totalUnread = unreadCounts(m.user_id).messages;
    publish(m.user_id, {
      type: 'chat.conversation',
      data: {
        conversationId, kind: conv.kind, title: conv.title ?? undefined, context: context ?? undefined,
        lastMessage: { id: msg.id, kind: msg.kind, preview, senderId: msg.senderId, createdAt: msg.createdAt },
        lastMessageAt: msg.createdAt, unreadCount: m.user_id === senderId ? 0 : m.unread_count, totalUnread,
      },
    });
    if (bell && m.user_id !== senderId && !subscribed.has(m.user_id) && (!m.muted_until || m.muted_until < nowIso())) {
      const recent = q.get<{ id: string }>(
        "SELECT id FROM notifications WHERE user_id = ? AND kind = 'chat.message' AND entity_id = ? AND read_at IS NULL AND created_at >= ?",
        [m.user_id, conversationId, new Date(nowMs() - 10 * 60_000).toISOString()],
      );
      if (recent) continue; // one unread bell per thread per 10 min
      notify(m.user_id, 'chat.message', {
        title: senderName ? { zh: `${senderName} 发来新消息`, en: `New message from ${senderName}` } : { zh: '新消息', en: 'New message' },
        body: preview, link: `/chat/${conversationId}`, entityType: 'conversation', entityId: conversationId,
        data: { messageId: msg.id, senderId, campusId: conv.campus_id, campus: getCampus(conv.campus_id)?.shortName ?? null },
      });
    }
  }
}

/** Marks the conversation read for a user (up to messageId or newest) and publishes chat.read + chat.conversation. */
export function markConversationRead(conversationId: string, userId: string, messageId?: string | null): { lastReadMessageId: string | null; readAt: string } {
  const m = assertMember(conversationId, userId);
  const newest = messageId
    ? q.get<{ id: string; created_at: string }>('SELECT id, created_at FROM messages WHERE id = ? AND conversation_id = ?', [messageId, conversationId])
    : q.get<{ id: string; created_at: string }>('SELECT id, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1', [conversationId]);
  const readAt = nowIso();
  q.tx(() => {
    q.run('UPDATE conversation_members SET unread_count = 0, last_read_message_id = ?, last_read_at = ? WHERE conversation_id = ? AND user_id = ?', [newest?.id ?? m.last_read_message_id, readAt, conversationId, userId]);
    if (newest) {
      const unreadRows = q.all<{ id: string }>(
        `SELECT id FROM messages WHERE conversation_id = ? AND created_at <= ? AND (sender_id IS NULL OR sender_id <> ?) AND id NOT IN (SELECT message_id FROM message_reads WHERE user_id = ?) ORDER BY created_at DESC LIMIT 200`,
        [conversationId, newest.created_at, userId, userId],
      );
      for (const r of unreadRows) q.run('INSERT OR IGNORE INTO message_reads (message_id, user_id, read_at) VALUES (?, ?, ?)', [r.id, userId, readAt]);
    }
  });
  publishTopic(`conversation:${conversationId}`, { type: 'chat.read', data: { conversationId, userId, lastReadMessageId: newest?.id ?? null, readAt } }, { excludeUserId: userId });
  publish(userId, { type: 'chat.conversation', data: { conversationId, unreadCount: 0, totalUnread: unreadCounts(userId).messages, lastMessageAt: newest?.created_at ?? null, lastMessage: null } });
  return { lastReadMessageId: newest?.id ?? null, readAt };
}
