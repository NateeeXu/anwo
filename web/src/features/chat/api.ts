// Chat REST client (API.md §5) + the `openChatWith` helper other modules use for "Message host / seller / join" CTAs.
//
//   import { openChatWith } from '@/features/chat'
//   const conv = await openChatWith({ userId: listing.owner.id, context: { type: 'listing', id: listing.id }, navigate })
import type { NavigateFunction } from 'react-router';
import type { Message, Paginated, Report, UserPublic } from '@shared/types';
import type { ConversationDto, MessagesPage, SearchHit, SyncResult } from '@shared/schemas/chat';
import { api } from '@/lib/api';
import { track } from '@/lib/track';

export type { ConversationDto, MessagesPage, SearchHit, SyncResult } from '@shared/schemas/chat';
export type ContextType = 'listing' | 'wanted' | 'market_item' | 'buddy_post' | 'escrow';
export type ConversationFilter = 'all' | 'unread' | 'groups' | 'archived';

export type ConversationListResult = Paginated<ConversationDto> & { totalUnread: number };

export function listConversations(opts: { filter?: ConversationFilter; q?: string; page?: number; pageSize?: number } = {}): Promise<ConversationListResult> {
  const { filter = 'all', q, page = 1, pageSize = 50 } = opts;
  return api<ConversationListResult>('/api/chat/conversations', {
    query: {
      page, pageSize,
      archived: filter === 'archived' ? 1 : 0,
      unreadOnly: filter === 'unread' ? 1 : undefined,
      kind: filter === 'groups' ? 'group' : undefined,
      q: q?.trim() || undefined,
    },
  });
}

export function getConversation(id: string): Promise<ConversationDto> {
  return api<ConversationDto>(`/api/chat/conversations/${encodeURIComponent(id)}`);
}

export function getMessages(id: string, opts: { before?: string; after?: string; limit?: number } = {}): Promise<MessagesPage> {
  return api<MessagesPage>(`/api/chat/conversations/${encodeURIComponent(id)}/messages`, { query: { before: opts.before, after: opts.after, limit: opts.limit ?? 50 } });
}

export type SendPayload = { kind: 'text' | 'image'; body?: string; uploadId?: string; clientId: string; replyToId?: string };
export function sendMessageRest(conversationId: string, payload: SendPayload): Promise<Message> {
  return api<Message>(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', body: payload });
}

export function markReadRest(conversationId: string, messageId?: string): Promise<{ unreadCount: 0; lastReadMessageId: string | null; readAt: string }> {
  return api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/read`, { method: 'POST', body: messageId ? { messageId } : {} });
}

export function typingRest(conversationId: string, typing: boolean): Promise<null> {
  return api<null>(`/api/chat/conversations/${encodeURIComponent(conversationId)}/typing`, { method: 'POST', body: { typing } });
}

export function patchConversation(id: string, patch: { archived?: boolean; mutedUntil?: string | null; scamBannerDismissed?: boolean }): Promise<ConversationDto> {
  return api<ConversationDto>(`/api/chat/conversations/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
}

export function leaveConversation(id: string): Promise<null> {
  return api<null>(`/api/chat/conversations/${encodeURIComponent(id)}/leave`, { method: 'POST', body: {} });
}

export function reportConversation(id: string, input: { reason: string; details?: string }): Promise<Report> {
  return api<Report>(`/api/chat/conversations/${encodeURIComponent(id)}/report`, { method: 'POST', body: input });
}
export function reportMessage(id: string, input: { reason: string; details?: string }): Promise<Report> {
  return api<Report>(`/api/chat/messages/${encodeURIComponent(id)}/report`, { method: 'POST', body: input });
}
export function deleteMessage(id: string): Promise<Message> {
  return api<Message>(`/api/chat/messages/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export function editMessage(id: string, body: string): Promise<Message> {
  return api<Message>(`/api/chat/messages/${encodeURIComponent(id)}`, { method: 'PATCH', body: { body } });
}

export function searchMessages(q: string, opts: { conversationId?: string; page?: number; pageSize?: number } = {}): Promise<Paginated<SearchHit>> {
  return api<Paginated<SearchHit>>('/api/chat/search', { query: { q, conversationId: opts.conversationId, page: opts.page ?? 1, pageSize: opts.pageSize ?? 20 } });
}

export function syncSince(since: string): Promise<SyncResult> {
  return api<SyncResult>('/api/chat/sync', { query: { since } });
}

export function unreadCount(): Promise<{ total: number }> {
  return api<{ total: number }>('/api/chat/unread-count');
}

export type BlockedUser = UserPublic & { blockedAt: string; reason: string | null };
export function listBlocks(): Promise<BlockedUser[]> {
  return api<BlockedUser[]>('/api/chat/blocks');
}
export function blockUser(userId: string, reason?: string): Promise<{ blocked: true }> {
  return api(`/api/chat/blocks/${encodeURIComponent(userId)}`, { method: 'POST', body: reason ? { reason } : {} });
}
export function unblockUser(userId: string): Promise<{ blocked: false }> {
  return api(`/api/chat/blocks/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

export function presenceOf(userIds: string[]): Promise<Record<string, { online: boolean; lastSeenAt: 'online' | 'recently' | null }>> {
  return api('/api/chat/presence', { query: { userIds: userIds.join(',') } });
}

/** POST /api/chat/conversations then navigate to the thread. Throws ApiError (BLOCKED / VERIFIED_ONLY / TRUST_REQUIRED / QUOTA_EXCEEDED). */
export async function openChatWith(opts: {
  userId: string;
  context?: { type: ContextType; id: string } | null;
  message?: { kind?: 'text' | 'image'; body?: string; uploadId?: string } | null;
  /** analytics source, e.g. 'listing_detail' */
  source?: string;
  navigate?: NavigateFunction | ((to: string) => void);
}): Promise<ConversationDto & { created: boolean }> {
  const conv = await api<ConversationDto & { created: boolean }>('/api/chat/conversations', {
    method: 'POST',
    query: opts.source ? { source: opts.source } : undefined,
    body: {
      userId: opts.userId,
      context: opts.context ?? undefined,
      message: opts.message && (opts.message.body?.trim() || opts.message.uploadId) ? { ...opts.message, clientId: crypto.randomUUID() } : undefined,
    },
  });
  track('chat.start', { entityType: opts.context?.type ?? 'user', entityId: opts.context?.id ?? opts.userId, conversationId: conv.id, created: conv.created, source: opts.source ?? null });
  if (opts.navigate) (opts.navigate as (to: string) => void)(`/chat/${conv.id}`);
  return conv;
}
