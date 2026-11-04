// server/src/modules/chat/routes.ts — OWNED BY THE `chat` MODULE AGENT. Mounted at /api/chat (API.md §5).
// Every conversation endpoint requires membership (left_at IS NULL) → NOT_FOUND otherwise. All writes publish ws events.
import { Router } from 'express';
import { z } from 'zod';
import { idParam, ReportInput } from '@shared/schemas/common';
import {
  AdminConversationsQuery, BlockInput, ConversationListQuery, EditMessageInput, LockInput, MembersInput, MessagesQuery,
  OpenConversationInput, PatchConversationInput, PresenceQuery, ReadInput, SearchQuery, SendMessageInput, SyncQuery, TypingInput,
} from '@shared/schemas/chat';
import { requireAdmin, requireAuth, requireTrust, isAdmin } from '../../lib/auth';
import { ApiError } from '../../lib/errors';
import { ok, paginated, parseBody, parseParams, parseQuery } from '../../lib/http';
import { rateLimit } from '../../lib/ratelimit';
import { createReport } from '../../lib/reports';
import { audit } from '../../lib/audit';
import { logEvent } from '../../lib/events';
import { unreadCounts } from '../../lib/users';
import { loadMessage, loadConversation } from '../../lib/conversations';
import * as svc from './service';
import './ws';

const router = Router();
router.use(requireAuth);

const writes = rateLimit('writes');
const convParam = z.object({ id: z.string().min(1).max(128) });
const memberParam = z.object({ id: z.string().min(1).max(128), userId: z.string().min(1).max(128) });
const userParam = z.object({ userId: z.string().min(1).max(128) });

// ---------------------------------------------------------------- static paths first (Express 5)
router.get('/unread-count', (req, res) => ok(res, { total: unreadCounts(req.user!.id).messages }));

router.get('/sync', (req, res) => {
  const p = parseQuery(req, SyncQuery);
  ok(res, svc.sync(req.user!.id, p.since));
});

router.get('/search', (req, res) => {
  const p = parseQuery(req, SearchQuery);
  const r = svc.searchMessages(req.user!.id, p);
  paginated(res, { items: r.items, total: r.total, page: p.page, pageSize: p.pageSize });
});

router.get('/presence', (req, res) => {
  const p = parseQuery(req, PresenceQuery);
  ok(res, svc.presenceOf(p.userIds));
});

router.get('/blocks', (req, res) => ok(res, svc.listBlocks(req.user!.id)));
router.post('/blocks/:userId', writes, (req, res) => {
  const { userId } = parseParams(req, userParam);
  const body = parseBody(req, BlockInput);
  svc.blockUser(req.user!.id, userId, body.reason ?? null);
  ok(res, { blocked: true });
});
router.delete('/blocks/:userId', writes, (req, res) => {
  const { userId } = parseParams(req, userParam);
  svc.unblockUser(req.user!.id, userId);
  ok(res, { blocked: false });
});

// messages by id
router.delete('/messages/:id', writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  ok(res, svc.deleteMessage(id, req.user!.id, isAdmin(req)));
});
router.patch('/messages/:id', writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, EditMessageInput);
  ok(res, svc.editMessage(id, req.user!.id, body.body));
});
router.post('/messages/:id/report', writes, (req, res) => {
  const { id } = parseParams(req, idParam);
  const m = loadMessage(id);
  if (!m) throw new ApiError('NOT_FOUND', 'Message not found');
  const { conversation } = svc.requireMember(m.conversation_id, req.user!.id);
  const body = parseBody(req, ReportInput);
  const report = createReport(req, { entityType: 'message', entityId: id, reason: body.reason, details: body.details, campusId: conversation.campus_id });
  logEvent(req, 'chat.report', { entityType: 'message', entityId: id, props: { reason: body.reason, conversationId: m.conversation_id } });
  ok(res, report);
});

// ---------------------------------------------------------------- admin (moderation helpers used by /admin/chat)
router.get('/admin/stats', requireAdmin, (_req, res) => ok(res, svc.adminStats()));
router.get('/admin/conversations', requireAdmin, (req, res) => {
  const p = parseQuery(req, AdminConversationsQuery);
  const r = svc.adminListConversations(p);
  paginated(res, { items: r.items, total: r.total, page: p.page, pageSize: p.pageSize });
});
router.get('/admin/conversations/:id/messages', requireAdmin, (req, res) => {
  const { id } = parseParams(req, convParam);
  if (!loadConversation(id)) throw new ApiError('NOT_FOUND', 'Conversation not found');
  audit(req, { action: 'chat.view_conversation', entityType: 'conversation', entityId: id }); // private DMs: every admin read is logged
  ok(res, { items: svc.adminMessages(id) });
});
router.post('/admin/conversations/:id/lock', requireAdmin, writes, (req, res) => {
  const { id } = parseParams(req, convParam);
  const body = parseBody(req, LockInput);
  const before = loadConversation(id);
  if (!before) throw new ApiError('NOT_FOUND', 'Conversation not found');
  svc.setLocked(id, body.locked, body.reason ?? null);
  audit(req, { action: body.locked ? 'conversation.lock' : 'conversation.unlock', entityType: 'conversation', entityId: id, before: { isLocked: before.is_locked === 1 }, after: { isLocked: body.locked }, reason: body.reason ?? null });
  ok(res, { id, locked: body.locked });
});

// ---------------------------------------------------------------- conversations
router.get('/conversations', (req, res) => {
  const p = parseQuery(req, ConversationListQuery);
  const r = svc.listConversations(req.user!.id, p);
  paginated(res, { items: r.items, total: r.total, page: p.page, pageSize: p.pageSize }, { totalUnread: r.totalUnread });
});

router.post('/conversations', requireTrust(1), writes, async (req, res) => {
  const body = parseBody(req, OpenConversationInput);
  const { conversationId, created } = await svc.openConversation({
    initiatorId: req.user!.id, recipientId: body.userId, context: body.context ?? null,
    firstMessage: body.message ? { kind: body.message.kind, body: body.message.body, uploadId: body.message.uploadId, clientId: body.message.clientId } : null,
    source: typeof req.query.source === 'string' ? req.query.source : 'chat',
  });
  const dto = svc.getConversationDto(conversationId, req.user!.id);
  ok(res, { ...dto, created }, created ? 201 : 200);
});

router.get('/conversations/:id', (req, res) => {
  const { id } = parseParams(req, convParam);
  ok(res, svc.getConversationDto(id, req.user!.id));
});

router.patch('/conversations/:id', writes, (req, res) => {
  const { id } = parseParams(req, convParam);
  const body = parseBody(req, PatchConversationInput);
  ok(res, svc.patchConversation(id, req.user!.id, body));
});

router.get('/conversations/:id/messages', (req, res) => {
  const { id } = parseParams(req, convParam);
  const p = parseQuery(req, MessagesQuery);
  ok(res, svc.listMessages(id, req.user!.id, p));
});

router.post('/conversations/:id/messages', writes, (req, res) => {
  const { id } = parseParams(req, convParam);
  const body = parseBody(req, SendMessageInput);
  const msg = svc.sendMessage({ conversationId: id, senderId: req.user!.id, kind: body.kind, body: body.body, uploadId: body.uploadId, clientId: body.clientId, replyToId: body.replyToId, isAdmin: isAdmin(req) });
  ok(res, msg, 201);
});

router.post('/conversations/:id/read', (req, res) => {
  const { id } = parseParams(req, convParam);
  const body = parseBody(req, ReadInput);
  const r = svc.readConversation(id, req.user!.id, body.messageId ?? null);
  ok(res, { unreadCount: 0, lastReadMessageId: r.lastReadMessageId, readAt: r.readAt });
});

router.post('/conversations/:id/typing', (req, res) => {
  const { id } = parseParams(req, convParam);
  const body = parseBody(req, TypingInput);
  svc.broadcastTyping(id, req.user!.id, body.typing);
  ok(res, null);
});

router.post('/conversations/:id/leave', writes, (req, res) => {
  const { id } = parseParams(req, convParam);
  svc.leaveConversation(id, req.user!.id);
  ok(res, null);
});

router.post('/conversations/:id/members', writes, (req, res) => {
  const { id } = parseParams(req, convParam);
  const body = parseBody(req, MembersInput);
  ok(res, svc.addGroupMembers(id, req.user!.id, body.userIds, isAdmin(req)));
});
router.delete('/conversations/:id/members/:userId', writes, (req, res) => {
  const { id, userId } = parseParams(req, memberParam);
  ok(res, svc.removeGroupMember(id, req.user!.id, userId, isAdmin(req)));
});

router.post('/conversations/:id/report', writes, (req, res) => {
  const { id } = parseParams(req, convParam);
  const { conversation } = svc.requireMember(id, req.user!.id);
  const body = parseBody(req, ReportInput);
  const report = createReport(req, { entityType: 'conversation', entityId: id, reason: body.reason, details: body.details, campusId: conversation.campus_id });
  logEvent(req, 'chat.report', { entityType: 'conversation', entityId: id, props: { reason: body.reason } });
  ok(res, report);
});

export default router;
