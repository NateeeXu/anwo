// server/src/modules/chat/ws.ts — chat.* WebSocket handlers (WS_EVENTS.md §4). Imported by routes.ts so it registers at boot.
// chat.send / chat.read share the REST code path in service.ts; chat.typing is fire-and-forget and throttled per connection.
import { ChatReadWs, ChatSendWs, ChatTypingWs } from '@shared/schemas/chat';
import { ApiError, isApiError } from '../../lib/errors';
import { registerHandler, registerTopicGuard } from '../../realtime/hub';
import { q } from '../../db';
import { broadcastTyping, readConversation, sendMessage } from './service';

registerHandler('chat.send', ChatSendWs, (ctx, data) => {
  try {
    const msg = sendMessage({
      conversationId: data.conversationId, senderId: ctx.userId, kind: data.kind ?? 'text', body: data.body, uploadId: data.uploadId,
      clientId: data.clientId, replyToId: data.replyToId, isAdmin: ctx.user.role === 'admin',
    });
    return { messageId: msg.id, clientId: data.clientId, createdAt: msg.createdAt, message: msg };
  } catch (e) {
    if (isApiError(e)) {
      const ae = e as ApiError;
      throw new ApiError(ae.code, ae.message, { status: ae.status, fields: ae.fields, data: { ...(typeof ae.data === 'object' && ae.data ? (ae.data as Record<string, unknown>) : {}), clientId: data.clientId } });
    }
    throw e;
  }
});

registerHandler('chat.typing', ChatTypingWs, (ctx, data) => {
  if (data.typing && !ctx.throttle(`typing:${data.conversationId}`, 2000)) return undefined;
  try {
    broadcastTyping(data.conversationId, ctx.userId, data.typing);
  } catch {
    /* fire-and-forget: not a member → ignore silently */
  }
  return undefined;
});

registerHandler('chat.read', ChatReadWs, (ctx, data) => {
  const r = readConversation(data.conversationId, ctx.userId, data.messageId ?? null);
  return { conversationId: data.conversationId, lastReadMessageId: r.lastReadMessageId, unreadCount: 0 };
});

// Membership guard (same semantics as the scaffold default, kept explicit so the chat module owns it).
registerTopicGuard('conversation', (userId, topic) => {
  const id = topic.slice('conversation:'.length);
  return q.count('SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL', [id, userId]) > 0;
});
