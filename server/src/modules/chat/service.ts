// server/src/modules/chat/service.ts — OWNED BY THE `chat` MODULE AGENT. Stable exports consumed by listings/wanted/market/buddy/billing.
// Scaffold stub: keep these signatures; implement on top of server/src/lib/conversations.ts (openConversation / postMessage / postContextCard / postSystemMessage).
import type { ContextCard } from '@shared/types';
import { ApiError } from '../../lib/errors';

export type OpenConversationArgs = {
  initiatorId: string;
  recipientId: string;
  context?: { type: ContextCard['type']; id: string } | null;
  firstMessage?: { kind?: 'text' | 'image'; body?: string; uploadId?: string; clientId?: string } | null;
};
/** Opens (or reuses) a direct conversation after block / verified-only / banned / quota checks. */
export async function openConversation(_args: OpenConversationArgs): Promise<{ conversationId: string; created: boolean }> {
  throw new ApiError('NOT_IMPLEMENTED', 'chat.openConversation not implemented yet');
}
export async function openGroupConversation(_args: { ownerId: string; title: string; context?: { type: ContextCard['type']; id: string } | null; memberIds: string[]; campusId?: string | null }): Promise<{ conversationId: string; created: boolean }> {
  throw new ApiError('NOT_IMPLEMENTED', 'chat.openGroupConversation not implemented yet');
}
export async function postSystemMessage(_conversationId: string, _event: string, _data: Record<string, unknown> = {}): Promise<void> {
  throw new ApiError('NOT_IMPLEMENTED', 'chat.postSystemMessage not implemented yet');
}
export async function postContextCard(_conversationId: string, _senderId: string | null, _card: ContextCard): Promise<void> {
  throw new ApiError('NOT_IMPLEMENTED', 'chat.postContextCard not implemented yet');
}
