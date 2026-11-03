// In-app notifications — DATA_MODEL §2.4. Inserts the row AND publishes ws `notification` to the user.
//
//   notify(userId, 'wanted.offer', { title: { zh: '有人向你推荐了房源', en: 'A host offered you a place' }, body?, link: '/chat/<id>', entityType: 'wanted', entityId });
//   notify(userId, 'system', { title: 'Plain string title' })        // string titles are used as-is
//   markRead(userId, id) ; markAllRead(userId, before?) ; toNotificationDto(row)
import type { Notification } from '@shared/types';
import { z } from 'zod';
import { q, uid, parseJson } from '../db';
import { hooks } from './hooks';
import { nowIso } from './time';
import type { NotificationRow } from './types';
import { unreadCounts } from './users';
import { publish, registerHandler } from '../realtime/hub';

export type Localized = string | { zh: string; en: string };
export type NotifyInput = {
  title: Localized;
  body?: Localized | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  data?: Record<string, unknown>;
  /** skip the ws push (e.g. digest batches) */
  silent?: boolean;
};

export function localize(v: Localized | null | undefined, locale: 'zh-CN' | 'en'): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  return locale === 'en' ? v.en : v.zh;
}

export function toNotificationDto(r: NotificationRow): Notification {
  return {
    id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link, entityType: r.entity_type, entityId: r.entity_id,
    data: parseJson<Record<string, unknown>>(r.data_json, {}), readAt: r.read_at, createdAt: r.created_at,
  };
}

export function notify(userId: string, kind: string, input: NotifyInput): Notification | null {
  const u = q.get<{ locale: 'zh-CN' | 'en'; deleted_at: string | null }>('SELECT locale, deleted_at FROM users WHERE id = ?', [userId]);
  if (!u || u.deleted_at) return null;
  const row: NotificationRow = {
    id: uid(), user_id: userId, kind, title: localize(input.title, u.locale) ?? kind, body: localize(input.body, u.locale),
    link: input.link ?? null, entity_type: input.entityType ?? null, entity_id: input.entityId ?? null,
    data_json: JSON.stringify(input.data ?? {}), read_at: null, created_at: nowIso(),
  };
  q.insert('notifications', row as unknown as Record<string, string | number | null>);
  const dto = toNotificationDto(row);
  if (!input.silent) {
    const unread = unreadCounts(userId);
    publish(userId, { type: 'notification', data: { ...dto, unreadCount: unread.notifications } });
  }
  hooks.emit('notification.created', { userId, kind, id: row.id });
  return dto;
}
export function notifyMany(userIds: string[], kind: string, input: NotifyInput): number {
  let n = 0;
  for (const id of new Set(userIds)) if (notify(id, kind, input)) n++;
  return n;
}

export function markRead(userId: string, id: string): Notification | null {
  const r = q.get<NotificationRow>('SELECT * FROM notifications WHERE id = ? AND user_id = ?', [id, userId]);
  if (!r) return null;
  if (!r.read_at) {
    r.read_at = nowIso();
    q.run('UPDATE notifications SET read_at = ? WHERE id = ?', [r.read_at, id]);
    pushCounts(userId);
  }
  return toNotificationDto(r);
}
export function markAllRead(userId: string, before?: string): number {
  const t = nowIso();
  const res = before
    ? q.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND created_at <= ?', [t, userId, before])
    : q.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [t, userId]);
  if (res.changes) pushCounts(userId);
  return Number(res.changes);
}
/** Publishes `notification.count` to the user's sockets (cross-tab sync). */
export function pushCounts(userId: string): void {
  publish(userId, { type: 'notification.count', data: unreadCounts(userId) });
}

// ws convenience for the bell (WS_EVENTS §4)
registerHandler('notification.read', z.object({ id: z.string().optional(), all: z.boolean().optional() }), (ctx, data) => {
  if (data.all) markAllRead(ctx.userId);
  else if (data.id) markRead(ctx.userId, data.id);
  return { unreadCount: unreadCounts(ctx.userId).notifications };
});
