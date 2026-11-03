// Pure helpers shared by the chat components: titles, previews, system-message text, day grouping.
import type { Message, UserPublic } from '@shared/types';
import type { ChatMember, ConversationDto } from '@shared/schemas/chat';
import type { TFunction } from '@/lib/i18n';

export type SendStatus = 'sending' | 'failed';
export type LocalMessage = Message & { status?: SendStatus; errorCode?: string };

/** Display title of a thread: group title, otherwise the other person's name. */
export function conversationTitle(conv: Pick<ConversationDto, 'kind' | 'title' | 'peer' | 'members'>, meId: string | undefined, t: TFunction): string {
  if (conv.kind !== 'direct') return conv.title ?? t('chat.group');
  if (conv.peer) return conv.peer.name;
  const other = conv.members.find((m) => m.id !== meId);
  return other?.name ?? t('chat.group');
}

export function memberById(conv: Pick<ConversationDto, 'members' | 'peer'>, id: string | null | undefined): ChatMember | UserPublic | undefined {
  if (!id) return undefined;
  return conv.members.find((m) => m.id === id) ?? (conv.peer && conv.peer.id === id ? conv.peer : undefined);
}

/** One-line preview for the inbox row. */
export function previewText(conv: ConversationDto, meId: string | undefined, t: TFunction): string {
  const m = conv.lastMessage;
  if (!m) return '';
  if (m.deleted || m.deletedAt) return t('chat.preview.deleted');
  const mine = m.senderId === meId;
  const senderName = !mine && conv.kind !== 'direct' && m.sender ? `${shortName(m.sender.name)}: ` : '';
  const you = mine ? t('chat.preview.you') : '';
  switch (m.kind) {
    case 'image':
      return `${you}${senderName}${t('chat.preview.image')}`;
    case 'context_card':
      return `${you}${senderName}${t('chat.preview.card')} ${m.body ?? ''}`.trim();
    case 'system':
      return systemText(m, conv, t);
    default:
      return `${you}${senderName}${m.body ?? ''}`;
  }
}

/** "张晓雨 Alice" → "张晓雨"; "Daniel Kim" → "Daniel". */
export function shortName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return first.length > 12 ? first.slice(0, 12) : first;
}

/** Text for a `system` message: `{ event, userId, ... }` in `context`. */
export function systemText(m: Message, conv: Pick<ConversationDto, 'members' | 'peer'> | null, t: TFunction): string {
  const ctx = (m.context ?? {}) as Record<string, unknown>;
  const event = typeof ctx.event === 'string' ? ctx.event : (m.body ?? '');
  const userId = typeof ctx.userId === 'string' ? ctx.userId : null;
  const name = (userId && conv ? memberById(conv, userId)?.name : null) ?? (typeof ctx.name === 'string' ? ctx.name : null) ?? t('chat.system.someone');
  const key = `chat.system.${event}`;
  const text = t(key, { name, event });
  if (text !== key) return text;
  if (typeof ctx.reason === 'string' && ctx.reason) return `${t('chat.system.generic', { event })} · ${ctx.reason}`;
  return t('chat.system.generic', { event });
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** 「今天」/「昨天」/ short date for the day separators. */
export function dayLabel(iso: string, t: TFunction, formatDate: (iso: string, style?: 'short' | 'long' | 'monthDay' | 'weekday') => string, now = new Date()): string {
  const d = new Date(iso);
  if (isSameDay(d, now)) return t('chat.today');
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (isSameDay(d, y)) return t('chat.yesterday');
  return d.getFullYear() === now.getFullYear() ? formatDate(iso, 'monthDay') : formatDate(iso, 'long');
}

export const TIME_GAP_MS = 5 * 60_000;

export type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'message'; key: string; message: LocalMessage; first: boolean; last: boolean; showTime: boolean };

/** Builds render rows: day separators, bubble grouping (same sender within 5 min) and timestamp boundaries. */
export function buildRows(messages: LocalMessage[], t: TFunction, formatDate: (iso: string, style?: 'short' | 'long' | 'monthDay' | 'weekday') => string): Row[] {
  const rows: Row[] = [];
  let prev: LocalMessage | null = null;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    const next = messages[i + 1] ?? null;
    const d = new Date(m.createdAt);
    if (!prev || !isSameDay(new Date(prev.createdAt), d)) rows.push({ kind: 'day', key: `day-${m.createdAt.slice(0, 10)}-${i}`, label: dayLabel(m.createdAt, t, formatDate) });
    const gapPrev = !prev || prev.senderId !== m.senderId || prev.kind === 'system' || m.kind === 'system' || Date.parse(m.createdAt) - Date.parse(prev.createdAt) > TIME_GAP_MS || !isSameDay(new Date(prev.createdAt), d);
    const gapNext = !next || next.senderId !== m.senderId || next.kind === 'system' || m.kind === 'system' || Date.parse(next.createdAt) - Date.parse(m.createdAt) > TIME_GAP_MS || !isSameDay(new Date(next.createdAt), d);
    rows.push({ kind: 'message', key: m.id, message: m, first: gapPrev, last: gapNext, showTime: gapNext });
    prev = m;
  }
  return rows;
}

/** Insert/replace a message in an ascending list (by id, then by clientId for optimistic entries). */
export function upsertMessage(list: LocalMessage[], incoming: LocalMessage): LocalMessage[] {
  const byId = list.findIndex((m) => m.id === incoming.id);
  if (byId >= 0) {
    const next = list.slice();
    next[byId] = { ...list[byId]!, ...incoming, status: incoming.status };
    return next;
  }
  if (incoming.clientId) {
    const byClient = list.findIndex((m) => m.clientId === incoming.clientId && m.senderId === incoming.senderId);
    if (byClient >= 0) {
      const next = list.slice();
      next[byClient] = { ...incoming, status: incoming.status };
      return next;
    }
  }
  // append in order
  const next = list.slice();
  let idx = next.length;
  while (idx > 0 && next[idx - 1]!.createdAt > incoming.createdAt && !next[idx - 1]!.status) idx--;
  next.splice(idx, 0, incoming);
  return next;
}

export function statusLabel(conv: Pick<ConversationDto, 'context'>, t: TFunction): string | null {
  const s = conv.context?.status;
  if (!s) return null;
  const key = `chat.context.status.${s}`;
  const v = t(key);
  return v === key ? null : v;
}
