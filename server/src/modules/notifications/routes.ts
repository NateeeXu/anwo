// /api/notifications — API.md §2.5 (scaffold-owned)
import { Router } from 'express';
import { z } from 'zod';
import { PaginationQuery, idParam, zBool } from '@shared/schemas/common';
import { q } from '../../db';
import { requireAuth } from '../../lib/auth';
import { ApiError } from '../../lib/errors';
import { ok, pageWindow, paginated, parseBody, parseParams, parseQuery } from '../../lib/http';
import { markAllRead, markRead, toNotificationDto, pushCounts } from '../../lib/notify';
import type { NotificationRow } from '../../lib/types';
import { unreadCounts } from '../../lib/users';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const p = parseQuery(req, PaginationQuery.extend({ unreadOnly: zBool.default(false), kind: z.string().max(40).optional() }));
  const where: string[] = ['user_id = ?'];
  const params: (string | number)[] = [req.user!.id];
  if (p.unreadOnly) where.push('read_at IS NULL');
  if (p.kind) { where.push('kind = ?'); params.push(p.kind); }
  const { limit, offset } = pageWindow(p);
  const total = q.count(`SELECT COUNT(*) FROM notifications WHERE ${where.join(' AND ')}`, params);
  const rows = q.all<NotificationRow>(`SELECT * FROM notifications WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  paginated(res, { items: rows.map(toNotificationDto), total, page: p.page, pageSize: p.pageSize }, { unreadCount: unreadCounts(req.user!.id).notifications });
});

router.get('/unread-count', (req, res) => ok(res, unreadCounts(req.user!.id)));

router.post('/read-all', (req, res) => {
  const body = parseBody(req, z.object({ before: z.string().datetime({ offset: true }).optional() }));
  ok(res, { updated: markAllRead(req.user!.id, body.before) });
});

router.post('/:id/read', (req, res) => {
  const { id } = parseParams(req, idParam);
  const n = markRead(req.user!.id, id);
  if (!n) throw new ApiError('NOT_FOUND', 'Notification not found');
  ok(res, n);
});

router.delete('/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const r = q.run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [id, req.user!.id]);
  if (!r.changes) throw new ApiError('NOT_FOUND', 'Notification not found');
  pushCounts(req.user!.id);
  ok(res, null);
});

export default router;
