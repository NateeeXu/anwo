// shared/src/schemas/chat.ts — owned by the `chat` module agent.
// zod input schemas for /api/chat (API.md §5) and the chat.* ws frames (WS_EVENTS.md §4), plus the DTO
// extensions the chat web uses on top of the shared `Conversation` type. Re-exported as `chatSchemas`.
import { z } from 'zod';
import { PaginationQuery, zBool, zCsv } from './common';
import type { Conversation, Message, UserPublic } from '../types';
import type { MemberRole } from '../enums';

export const ContextTypeSchema = z.enum(['listing', 'wanted', 'market_item', 'buddy_post', 'escrow']);
export const ContextRefInput = z.object({ type: ContextTypeSchema, id: z.string().min(1).max(128) });
export type ContextRefInput = z.infer<typeof ContextRefInput>;

const uuidish = z.string().min(8).max(64);

export const ConversationListQuery = PaginationQuery.extend({
  archived: zBool.default(false),
  kind: zCsv.optional(),
  unreadOnly: zBool.default(false),
  q: z.string().trim().max(80).optional(),
  updatedSince: z.string().datetime({ offset: true }).optional(),
});
export type ConversationListQuery = z.infer<typeof ConversationListQuery>;

export const FirstMessageInput = z.object({
  kind: z.enum(['text', 'image']).default('text'),
  body: z.string().trim().max(4000).optional(),
  uploadId: z.string().max(128).optional(),
  clientId: uuidish.optional(),
});
export const OpenConversationInput = z.object({
  userId: z.string().min(1).max(128),
  context: ContextRefInput.optional().nullable(),
  message: FirstMessageInput.optional().nullable(),
});
export type OpenConversationInput = z.infer<typeof OpenConversationInput>;

export const MessagesQuery = z.object({
  before: z.string().max(128).optional(),
  after: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type MessagesQuery = z.infer<typeof MessagesQuery>;

export const SendMessageInput = z.object({
  kind: z.enum(['text', 'image']).default('text'),
  body: z.string().trim().max(4000).optional(),
  uploadId: z.string().max(128).optional(),
  clientId: uuidish.optional(),
  replyToId: z.string().max(128).optional(),
});
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const ReadInput = z.object({ messageId: z.string().max(128).optional() });
export const TypingInput = z.object({ typing: z.boolean() });
export const PatchConversationInput = z.object({
  archived: z.boolean().optional(),
  mutedUntil: z.string().datetime({ offset: true }).nullable().optional(),
  scamBannerDismissed: z.boolean().optional(),
});
export type PatchConversationInput = z.infer<typeof PatchConversationInput>;
export const MembersInput = z.object({ userIds: z.array(z.string().min(1).max(128)).min(1).max(50) });
export const EditMessageInput = z.object({ body: z.string().trim().min(1).max(4000) });
export const SearchQuery = PaginationQuery.extend({
  q: z.string().trim().min(2).max(80),
  conversationId: z.string().max(128).optional(),
});
export type SearchQuery = z.infer<typeof SearchQuery>;
export const SyncQuery = z.object({ since: z.string().datetime({ offset: true }) });
export const PresenceQuery = z.object({ userIds: zCsv });
export const BlockInput = z.object({ reason: z.string().trim().max(200).optional() });
export const LockInput = z.object({ locked: z.boolean(), reason: z.string().trim().max(300).optional() });
export const AdminConversationsQuery = PaginationQuery.extend({
  q: z.string().trim().max(80).optional(),
  locked: zBool.optional(),
  kind: z.enum(['direct', 'group', 'support']).optional(),
});

// ws frames (WS_EVENTS.md §4)
export const ChatSendWs = z.object({
  conversationId: z.string().min(1).max(128),
  clientId: uuidish,
  kind: z.enum(['text', 'image']).default('text'),
  body: z.string().trim().max(4000).optional(),
  uploadId: z.string().max(128).optional(),
  replyToId: z.string().max(128).optional(),
});
export type ChatSendWs = z.infer<typeof ChatSendWs>;
export const ChatTypingWs = z.object({ conversationId: z.string().min(1).max(128), typing: z.boolean() });
export type ChatTypingWs = z.infer<typeof ChatTypingWs>;
export const ChatReadWs = z.object({ conversationId: z.string().min(1).max(128), messageId: z.string().max(128).optional() });
export type ChatReadWs = z.infer<typeof ChatReadWs>;

// DTO extensions returned by /api/chat (superset of the shared Conversation / Message types).
// `members` uses `memberRole` because `UserPublic.role` (student|landlord|admin) and `MemberRole` collide in the
// shared `ConversationMember` intersection (see docs/modules/chat.md → Integration requests).
export type ChatMember = UserPublic & { memberRole: MemberRole; lastReadAt: string | null };
export type ConversationDto = Omit<Conversation, 'members'> & {
  members: ChatMember[];
  /** total messages in the thread (scam banner shows while ≤ 3 and not dismissed) */
  messageCount: number;
  /** the other member in a direct thread (null for groups) */
  peer: UserPublic | null;
  /** group threads: number of active members */
  memberCount: number;
  /** viewer has blocked the peer / the peer has blocked the viewer (direct only) */
  blockedByMe: boolean;
  blockedMe: boolean;
  /** viewer's role in the thread */
  myRole: 'owner' | 'admin' | 'member';
  mutedUntil: string | null;
};
export type MessagesPage = { items: Message[]; hasMore: boolean; oldestId: string | null; newestId: string | null };
export type SearchHit = Message & { conversation: { id: string; title: string | null; kind: Conversation['kind']; members: ChatMember[]; peer: UserPublic | null } };
export type SyncResult = {
  conversations: ConversationDto[];
  messages: Message[];
  reads: { conversationId: string; userId: string; lastReadMessageId: string | null; readAt: string }[];
  presence: { userId: string; online: boolean }[];
  now: string;
};
export type ChatConversationEvent = {
  conversationId: string;
  kind?: Conversation['kind'];
  title?: string;
  context?: Conversation['context'];
  lastMessage: { id: string; kind: Message['kind']; preview: string; senderId: string | null; createdAt: string } | null;
  lastMessageAt: string | null;
  unreadCount: number;
  totalUnread: number;
};
export type ChatReadEvent = { conversationId: string; userId: string; lastReadMessageId: string | null; readAt: string };
export type ChatTypingEvent = { conversationId: string; userId: string; typing: boolean };
export type ChatMemberEvent = { conversationId: string; event: 'joined' | 'left' | 'removed' | 'added'; userId: string; user?: UserPublic };
export type ChatLockedEvent = { conversationId: string; locked: boolean };
export type PresenceEvent = { userId: string; online: boolean; lastSeenAt: string | null };
