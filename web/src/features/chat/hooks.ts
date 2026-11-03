// Chat hooks: React Query caches for the inbox / thread, realtime reducers (WS_EVENTS.md §5.2 + §7 catch-up),
// polling fallback (§8), optimistic sending with clientId (§6), read receipts, typing.
//
// Public for other modules / the shell:
//   useUnreadMessages() → number        (bottom tab 消息 badge; live via `chat.conversation`, 30 s polling fallback)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Message } from '@shared/types';
import type { ChatConversationEvent, ChatLockedEvent, ChatMemberEvent, ChatReadEvent, ChatTypingEvent, ConversationDto, MessagesPage, PresenceEvent } from '@shared/schemas/chat';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { getWs, useWsPolling, useWsStore, WsError } from '@/lib/ws';
import { UNREAD_KEY } from '@/app/shell/useUnread';
import * as chatApi from './api';
import type { ConversationFilter } from './api';
import { useChatStore } from './store';
import { upsertMessage, type LocalMessage } from './utils';

export const CHAT_KEY = ['chat'] as const;
export const CONVERSATIONS_KEY = ['chat', 'conversations'] as const;
export const UNREAD_MESSAGES_KEY = ['chat', 'unread'] as const;
export const conversationKey = (id: string) => ['chat', 'conversation', id] as const;
export const messagesKey = (id: string) => ['chat', 'messages', id] as const;

type LocalPage = Omit<MessagesPage, 'items'> & { items: LocalMessage[] };

// ------------------------------------------------------------------ unread badge
export function useUnreadMessages(): number {
  const { status } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: UNREAD_MESSAGES_KEY,
    queryFn: () => chatApi.unreadCount(),
    enabled: status === 'authed',
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  useEffect(() => {
    if (status !== 'authed') return;
    const ws = getWs();
    const off = ws.on<ChatConversationEvent>('chat.conversation', (d) => {
      if (typeof d?.totalUnread === 'number') qc.setQueryData(UNREAD_MESSAGES_KEY, { total: d.totalUnread });
    });
    const offReady = ws.on('ready', () => qc.invalidateQueries({ queryKey: UNREAD_MESSAGES_KEY }));
    return () => {
      off();
      offReady();
    };
  }, [status, qc]);
  return q.data?.total ?? 0;
}

// ------------------------------------------------------------------ inbox
export function useConversations(filter: ConversationFilter, q: string) {
  const { status } = useAuth();
  return useQuery({
    queryKey: [...CONVERSATIONS_KEY, filter, q],
    queryFn: () => chatApi.listConversations({ filter, q }),
    enabled: status === 'authed',
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useConversation(id: string | undefined) {
  const { status } = useAuth();
  const qc = useQueryClient();
  return useQuery({
    queryKey: conversationKey(id ?? ''),
    queryFn: () => chatApi.getConversation(id!),
    enabled: status === 'authed' && !!id,
    staleTime: 30_000,
    retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    initialData: () => {
      // seed from any loaded inbox page so the header renders instantly
      const pages = qc.getQueriesData<chatApi.ConversationListResult>({ queryKey: CONVERSATIONS_KEY });
      for (const [, data] of pages) {
        const hit = data?.items?.find((c) => c.id === id);
        if (hit) return hit;
      }
      return undefined;
    },
    initialDataUpdatedAt: 0,
  });
}

// ------------------------------------------------------------------ thread messages
export function useMessages(id: string | undefined) {
  const { status } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: messagesKey(id ?? ''),
    queryFn: async (): Promise<LocalPage> => chatApi.getMessages(id!, { limit: 50 }),
    enabled: status === 'authed' && !!id,
    staleTime: 60_000,
    retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
  });
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const loadEarlier = useCallback(async () => {
    if (!id) return;
    const cur = qc.getQueryData<LocalPage>(messagesKey(id));
    if (!cur?.hasMore || !cur.oldestId || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const older = await chatApi.getMessages(id, { before: cur.oldestId, limit: 50 });
      qc.setQueryData<LocalPage>(messagesKey(id), (prev) => {
        if (!prev) return older;
        const seen = new Set(prev.items.map((m) => m.id));
        const items = [...older.items.filter((m) => !seen.has(m.id)), ...prev.items];
        return { ...prev, items, hasMore: older.hasMore, oldestId: older.oldestId ?? prev.oldestId };
      });
    } finally {
      setLoadingEarlier(false);
    }
  }, [id, qc, loadingEarlier]);
  return { ...query, loadEarlier, loadingEarlier };
}

// ------------------------------------------------------------------ cache reducers (idempotent on id)
function applyMessage(qc: QueryClient, msg: LocalMessage): void {
  const key = messagesKey(msg.conversationId);
  const page = qc.getQueryData<LocalPage>(key);
  if (!page) return;
  qc.setQueryData<LocalPage>(key, { ...page, items: upsertMessage(page.items, msg), newestId: msg.status ? page.newestId : msg.id });
}
function applyDeleted(qc: QueryClient, d: { id: string; conversationId: string; deletedAt: string }): void {
  const key = messagesKey(d.conversationId);
  const page = qc.getQueryData<LocalPage>(key);
  if (!page) return;
  qc.setQueryData<LocalPage>(key, { ...page, items: page.items.map((m) => (m.id === d.id ? { ...m, body: null, image: undefined, deleted: true, deletedAt: d.deletedAt } : m)) });
}
function updateConversationEverywhere(qc: QueryClient, id: string, fn: (c: ConversationDto) => ConversationDto): boolean {
  let found = false;
  const single = qc.getQueryData<ConversationDto>(conversationKey(id));
  if (single) {
    qc.setQueryData(conversationKey(id), fn(single));
    found = true;
  }
  for (const [key, data] of qc.getQueriesData<chatApi.ConversationListResult>({ queryKey: CONVERSATIONS_KEY })) {
    if (!data?.items?.some((c) => c.id === id)) continue;
    found = true;
    qc.setQueryData<chatApi.ConversationListResult>(key, { ...data, items: data.items.map((c) => (c.id === id ? fn(c) : c)) });
  }
  return found;
}
function resortLists(qc: QueryClient): void {
  for (const [key, data] of qc.getQueriesData<chatApi.ConversationListResult>({ queryKey: CONVERSATIONS_KEY })) {
    if (!data?.items) continue;
    const items = data.items.slice().sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt));
    qc.setQueryData<chatApi.ConversationListResult>(key, { ...data, items });
  }
}
function applyConversationEvent(qc: QueryClient, d: ChatConversationEvent & { archived?: boolean; left?: boolean }, meId: string | undefined): void {
  if (typeof d.totalUnread === 'number') {
    qc.setQueryData(UNREAD_MESSAGES_KEY, { total: d.totalUnread });
    qc.setQueryData<{ notifications: number; messages: number }>(UNREAD_KEY, (prev) => (prev ? { ...prev, messages: d.totalUnread } : prev));
  }
  const found = updateConversationEverywhere(qc, d.conversationId, (c) => {
    const next: ConversationDto = { ...c, unreadCount: d.unreadCount };
    if (d.lastMessage) {
      const sender = c.members.find((m) => m.id === d.lastMessage!.senderId);
      next.lastMessageAt = d.lastMessageAt ?? d.lastMessage.createdAt;
      next.lastMessage = {
        id: d.lastMessage.id, conversationId: c.id, senderId: d.lastMessage.senderId, kind: d.lastMessage.kind, body: d.lastMessage.preview,
        clientId: null, replyToId: null, editedAt: null, deletedAt: null, createdAt: d.lastMessage.createdAt, sender: sender ?? undefined,
      } as Message;
      next.messageCount = (c.messageCount ?? 0) + (c.lastMessage?.id === d.lastMessage.id ? 0 : 1);
    }
    if (d.context !== undefined) next.context = d.context ?? c.context;
    if (typeof d.archived === 'boolean') next.archived = d.archived;
    return next;
  });
  if (!found || d.archived !== undefined || d.left || (d.lastMessage && d.lastMessage.senderId !== meId && d.unreadCount === 1)) {
    // new thread, moved between tabs, or a thread that may belong to another filter → refetch the inbox
    qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
  } else if (d.lastMessage) resortLists(qc);
}
function applyRead(qc: QueryClient, d: ChatReadEvent, meId: string | undefined): void {
  updateConversationEverywhere(qc, d.conversationId, (c) => ({
    ...c,
    members: c.members.map((m) => (m.id === d.userId ? { ...m, lastReadAt: d.readAt } : m)),
    ...(d.userId === meId ? { unreadCount: 0 } : {}),
  }));
  if (d.userId === meId) return;
  const key = messagesKey(d.conversationId);
  const page = qc.getQueryData<LocalPage>(key);
  if (!page) return;
  qc.setQueryData<LocalPage>(key, {
    ...page,
    items: page.items.map((m) => (m.senderId === meId && m.createdAt <= d.readAt && !(m.readBy ?? []).includes(d.userId) ? { ...m, readBy: [...(m.readBy ?? []), d.userId] } : m)),
  });
}

/** Merge a `/api/chat/sync` result into the caches (reconnect catch-up + polling fallback). */
function applySync(qc: QueryClient, r: chatApi.SyncResult, meId: string | undefined): void {
  for (const c of r.conversations) {
    const found = updateConversationEverywhere(qc, c.id, () => c);
    if (!found) qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    for (const uid of c.typingUserIds ?? []) useChatStore.getState().setTyping(c.id, uid, true);
  }
  if (r.conversations.length) resortLists(qc);
  for (const m of r.messages) {
    if (m.deletedAt) applyDeleted(qc, { id: m.id, conversationId: m.conversationId, deletedAt: m.deletedAt });
    else applyMessage(qc, m);
  }
  for (const rd of r.reads) applyRead(qc, rd, meId);
  if (r.presence.length) useChatStore.getState().setPresence(Object.fromEntries(r.presence.map((p) => [p.userId, { online: p.online, lastSeenAt: p.online ? 'online' : null }])));
  qc.invalidateQueries({ queryKey: UNREAD_MESSAGES_KEY });
}

// ------------------------------------------------------------------ realtime wiring (mounted once by the chat page)
export function useChatRealtime(activeConversationId: string | undefined): void {
  const qc = useQueryClient();
  const { user, status } = useAuth();
  const meId = user?.id;
  const polling = useWsPolling();
  const lastSyncRef = useRef<string | null>(null);
  const activeRef = useRef(activeConversationId);
  activeRef.current = activeConversationId;

  // subscribe to the open thread's topic
  useEffect(() => {
    if (!activeConversationId || status !== 'authed') return;
    const ws = getWs();
    const topic = `conversation:${activeConversationId}`;
    ws.subscribe(topic);
    return () => ws.unsubscribe(topic);
  }, [activeConversationId, status]);

  useEffect(() => {
    if (status !== 'authed') return;
    const ws = getWs();
    const store = useChatStore.getState();
    const offs = [
      ws.on<LocalMessage & { deleted?: boolean; deletedAt?: string | null }>('chat.message', (d) => {
        if (!d?.conversationId) return;
        if (d.deleted) applyDeleted(qc, { id: d.id, conversationId: d.conversationId, deletedAt: d.deletedAt ?? new Date().toISOString() });
        else {
          applyMessage(qc, { ...d, status: undefined });
          if (d.senderId) store.setTyping(d.conversationId, d.senderId, false);
        }
      }),
      ws.on<ChatConversationEvent>('chat.conversation', (d) => d && applyConversationEvent(qc, d, meId)),
      ws.on<ChatTypingEvent>('chat.typing', (d) => d && store.setTyping(d.conversationId, d.userId, d.typing)),
      ws.on<ChatReadEvent>('chat.read', (d) => d && applyRead(qc, d, meId)),
      ws.on<ChatMemberEvent>('chat.member', (d) => {
        if (!d) return;
        qc.invalidateQueries({ queryKey: conversationKey(d.conversationId) });
        qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
      }),
      ws.on<ChatLockedEvent>('chat.locked', (d) => d && updateConversationEverywhere(qc, d.conversationId, (c) => ({ ...c, isLocked: d.locked }))),
      ws.on<PresenceEvent>('presence', (d) => d && store.setPresence({ [d.userId]: { online: d.online, lastSeenAt: d.online ? 'online' : d.lastSeenAt } })),
      ws.on('ready', () => {
        const { lastEventTs, readyData } = useWsStore.getState();
        const since = [lastSyncRef.current, lastEventTs, readyData?.resumeFrom].filter((x): x is string => !!x).sort().pop() ?? new Date(Date.now() - 2 * 60_000).toISOString();
        void chatApi.syncSince(since).then((r) => {
          lastSyncRef.current = r.now;
          applySync(qc, r, meId);
        }).catch(() => {});
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [qc, meId, status]);

  // typing entries expire client-side (5 s)
  useEffect(() => {
    const t = setInterval(() => useChatStore.getState().pruneTyping(), 1000);
    return () => clearInterval(t);
  }, []);

  // polling fallback (§8): /sync every 5 s while visible; the open thread also polls messages?after= every 3 s
  useEffect(() => {
    if (!polling || status !== 'authed') return;
    let stopped = false;
    const tick = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      const since = lastSyncRef.current ?? new Date(Date.now() - 60_000).toISOString();
      try {
        const r = await chatApi.syncSince(since);
        lastSyncRef.current = r.now;
        applySync(qc, r, meId);
      } catch {
        /* keep polling */
      }
    };
    const tickThread = async () => {
      const id = activeRef.current;
      if (stopped || !id || document.visibilityState !== 'visible') return;
      const page = qc.getQueryData<LocalPage>(messagesKey(id));
      if (!page?.newestId) return;
      try {
        const r = await chatApi.getMessages(id, { after: page.newestId, limit: 50 });
        for (const m of r.items) applyMessage(qc, m);
      } catch {
        /* keep polling */
      }
    };
    void tick();
    const a = setInterval(tick, 5000);
    const b = setInterval(tickThread, 3000);
    return () => {
      stopped = true;
      clearInterval(a);
      clearInterval(b);
    };
  }, [polling, qc, meId, status]);
}

// ------------------------------------------------------------------ sending (optimistic, idempotent on clientId)
export function useSendMessage(conversationId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const setFailed = useChatStore((s) => s.setFailed);

  const deliver = useCallback(
    async (payload: chatApi.SendPayload): Promise<Message> => {
      if (!conversationId) throw new Error('no conversation');
      const ws = getWs();
      if (ws.isReady) {
        try {
          const ack = await ws.send<{ messageId: string; clientId: string; createdAt: string; message?: Message }>('chat.send', { conversationId, ...payload });
          if (ack?.message) return ack.message;
        } catch (e) {
          const code = e instanceof WsError ? e.code : 'INTERNAL';
          // transport problems → REST retry with the same clientId; business errors → surface
          if (!['TIMEOUT', 'DISCONNECTED', 'NOT_CONNECTED', 'INTERNAL', 'UNKNOWN_TYPE'].includes(code)) throw e;
        }
      }
      return chatApi.sendMessageRest(conversationId, payload);
    },
    [conversationId],
  );

  const send = useCallback(
    async (input: { kind: 'text' | 'image'; body?: string; uploadId?: string; image?: Message['image']; clientId?: string }) => {
      if (!conversationId || !user) return;
      const clientId = input.clientId ?? crypto.randomUUID();
      const optimistic: LocalMessage = {
        id: `local-${clientId}`, conversationId, senderId: user.id, kind: input.kind, body: input.body ?? null, clientId, replyToId: null,
        editedAt: null, deletedAt: null, createdAt: new Date().toISOString(), status: 'sending', image: input.image, sender: user, readBy: [],
      };
      setFailed(clientId, null);
      applyMessage(qc, optimistic);
      try {
        const saved = await deliver({ kind: input.kind, body: input.body, uploadId: input.uploadId, clientId });
        applyMessage(qc, { ...saved, status: undefined, readBy: saved.readBy ?? [] });
        updateConversationEverywhere(qc, conversationId, (c) => ({ ...c, lastMessage: saved, lastMessageAt: saved.createdAt, messageCount: (c.messageCount ?? 0) + 1 }));
        resortLists(qc);
        return saved;
      } catch (e) {
        const code = e instanceof ApiError || e instanceof WsError ? e.code : 'INTERNAL';
        setFailed(clientId, code);
        applyMessage(qc, { ...optimistic, status: 'failed', errorCode: code });
        throw e;
      }
    },
    [conversationId, user, qc, deliver, setFailed],
  );

  const retry = useCallback(
    (m: LocalMessage) => {
      if (!m.clientId) return Promise.resolve(undefined);
      return send({ kind: m.kind === 'image' ? 'image' : 'text', body: m.body ?? undefined, uploadId: m.image?.id, image: m.image, clientId: m.clientId });
    },
    [send],
  );

  return { send, retry };
}

// ------------------------------------------------------------------ read receipts + typing
export function useMarkRead(conversation: ConversationDto | undefined, newestId: string | null | undefined): void {
  const qc = useQueryClient();
  const { user } = useAuth();
  const lastMarked = useRef<string | null>(null);
  useEffect(() => {
    if (!conversation || !user) return;
    if (conversation.unreadCount === 0 && lastMarked.current === newestId) return;
    if (document.visibilityState !== 'visible') return;
    if (lastMarked.current === newestId && conversation.unreadCount === 0) return;
    lastMarked.current = newestId ?? null;
    const id = conversation.id;
    const run = async () => {
      const ws = getWs();
      try {
        if (ws.isReady) await ws.send('chat.read', { conversationId: id });
        else await chatApi.markReadRest(id);
      } catch {
        try {
          await chatApi.markReadRest(id);
        } catch {
          return;
        }
      }
      updateConversationEverywhere(qc, id, (c) => ({ ...c, unreadCount: 0, members: c.members.map((m) => (m.id === user.id ? { ...m, lastReadAt: new Date().toISOString() } : m)) }));
      qc.invalidateQueries({ queryKey: UNREAD_MESSAGES_KEY });
      qc.invalidateQueries({ queryKey: UNREAD_KEY });
    };
    void run();
  }, [conversation, newestId, user, qc]);
}

export function useTypingSender(conversationId: string | undefined) {
  const last = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signal = useCallback(
    (typing: boolean) => {
      if (!conversationId) return;
      const now = Date.now();
      if (typing && now - last.current < 2000) return;
      last.current = typing ? now : 0;
      const ws = getWs();
      if (ws.isReady) void ws.send('chat.typing', { conversationId, typing }).catch(() => {});
      else void chatApi.typingRest(conversationId, typing).catch(() => {});
      if (stopTimer.current) clearTimeout(stopTimer.current);
      if (typing) stopTimer.current = setTimeout(() => signal(false), 4000);
    },
    [conversationId],
  );
  useEffect(() => () => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
  }, []);
  return signal;
}

/** Ids of other members currently typing in a thread (expires after 5 s). */
export function useTypingUsers(conversationId: string | undefined, meId: string | undefined): string[] {
  const entries = useChatStore((s) => (conversationId ? s.typing[conversationId] : undefined));
  return useMemo(() => {
    if (!entries) return [];
    const now = Date.now();
    return Object.entries(entries).filter(([uid, exp]) => uid !== meId && exp > now).map(([uid]) => uid);
  }, [entries, meId]);
}

export function usePresence(userId: string | undefined) {
  return useChatStore((s) => (userId ? s.presence[userId] : undefined));
}

/** Convenience for pages outside chat: invalidate everything chat-related (e.g. after login switch). */
export function invalidateChat(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: CHAT_KEY });
}
