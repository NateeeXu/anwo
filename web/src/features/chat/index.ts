// Public surface of the "chat" module — other modules import only from here.
//   openChatWith({ userId, context, message?, source?, navigate })   → opens / reuses a direct thread and navigates to it
//   useUnreadMessages()                                             → number (bottom tab 消息 / bell badge)
//   ConversationDto / Message types re-exported for callers that render previews
export { default as routes } from './routes';
export { default as AdminPanel } from './admin';
export { openChatWith, listConversations, getConversation } from './api';
export type { ConversationDto, ContextType, MessagesPage } from './api';
export { useUnreadMessages, useConversations, invalidateChat, CONVERSATIONS_KEY, UNREAD_MESSAGES_KEY } from './hooks';
export { conversationTitle, previewText } from './utils';
