// Small zustand store for ephemeral chat state that does not belong in React Query: typing indicators and presence.
import { create } from 'zustand';

export type PresenceInfo = { online: boolean; lastSeenAt: 'online' | 'recently' | string | null };

type ChatState = {
  /** conversationId → userId → expiresAt (ms) */
  typing: Record<string, Record<string, number>>;
  presence: Record<string, PresenceInfo>;
  /** failed outbox entries by clientId → error code (so a retry affordance survives re-renders) */
  failed: Record<string, string>;
  setTyping: (conversationId: string, userId: string, on: boolean) => void;
  pruneTyping: () => void;
  setPresence: (entries: Record<string, PresenceInfo>) => void;
  setFailed: (clientId: string, code: string | null) => void;
};

export const TYPING_TTL_MS = 5000;

export const useChatStore = create<ChatState>((set, get) => ({
  typing: {},
  presence: {},
  failed: {},
  setTyping: (conversationId, userId, on) =>
    set((s) => {
      const conv = { ...(s.typing[conversationId] ?? {}) };
      if (on) conv[userId] = Date.now() + TYPING_TTL_MS;
      else delete conv[userId];
      const typing = { ...s.typing };
      if (Object.keys(conv).length) typing[conversationId] = conv;
      else delete typing[conversationId];
      return { typing };
    }),
  pruneTyping: () => {
    const now = Date.now();
    const cur = get().typing;
    let changed = false;
    const next: ChatState['typing'] = {};
    for (const [cid, users] of Object.entries(cur)) {
      const kept: Record<string, number> = {};
      for (const [uid, exp] of Object.entries(users)) {
        if (exp > now) kept[uid] = exp;
        else changed = true;
      }
      if (Object.keys(kept).length) next[cid] = kept;
    }
    if (changed) set({ typing: next });
  },
  setPresence: (entries) => set((s) => ({ presence: { ...s.presence, ...entries } })),
  setFailed: (clientId, code) =>
    set((s) => {
      const failed = { ...s.failed };
      if (code) failed[clientId] = code;
      else delete failed[clientId];
      return { failed };
    }),
}));

/** Typing user ids for a conversation, excluding `meId`; re-renders as entries expire. */
export function selectTyping(conversationId: string, meId: string | undefined) {
  return (s: ChatState) => {
    const users = s.typing[conversationId];
    if (!users) return EMPTY;
    const now = Date.now();
    const ids = Object.entries(users).filter(([uid, exp]) => uid !== meId && exp > now).map(([uid]) => uid);
    return ids.length ? ids : EMPTY;
  };
}
const EMPTY: string[] = [];
