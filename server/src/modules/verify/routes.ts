// /api/verify — API.md §6 (verify module). Mounted by server/src/app.ts.
//
// User:   GET /status · POST /edu/request · POST /edu/confirm · POST /id · GET /id · DELETE /id/:id
//         POST /phone/request · POST /phone/confirm · GET/POST /payment-methods · DELETE /payment-methods/:id · POST /payment-methods/:id/default
//         GET /audit (my verification timeline) · GET /profile/:userId (public trust profile)
// Admin:  GET /admin/stats · GET /admin/queue · GET /admin/requests/:id · GET /admin/requests/:id/files/:side (audited stream)
//         POST /admin/requests/:id/claim|approve|reject · POST /admin/users/:userId/trust
import { Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import type { AuditEntry, UserPublic, VerificationRequest } from '@shared/types';
import { idParam } from '@shared/schemas/common';
import {
  AdminQueueQuery, ApproveInput, AuditQuery, DocumentSide, EduConfirmInput, EduRequestInput, IdRequestInput,
  PaymentMethodInput, PhoneConfirmInput, PhoneRequestInput, RejectInput, TrustOverrideInput,
} from '@shared/schemas/verify';
import { q, uid } from '../../db';
import { loadUser, requireAdmin, requireAuth, requireTrust } from '../../lib/auth';
import { audit, toAuditDto, type AuditRow } from '../../lib/audit';
import { getCampus, toCampusLite } from '../../lib/campuses';
import { confirmEduCode, requestEduCode } from '../../lib/eduVerify';
import { ApiError, invalidState } from '../../lib/errors';
import { logEvent } from '../../lib/events';
import { ok, paginated, parseBody, parseParams, parseQuery, pageWindow } from '../../lib/http';
import { sendSmsCode, verifySmsCode } from '../../lib/mailbox';
import { notify } from '../../lib/notify';
import { rateLimit } from '../../lib/ratelimit';
import { nowIso, nowMs, HOUR } from '../../lib/time';
import { recomputeTrust, setTrustOverride } from '../../lib/trust';
import { getUpload, uploadFilePath } from '../../lib/uploads';
import { loadUserPublic, loadUsersPublic, toUserMe } from '../../lib/users';
import {
  addPaymentMethod, latestRequest, listPaymentMethods, listRequests, loadRequest, openRequest, removePaymentMethod,
  setDefaultPaymentMethod, toRequestDto, trustProfile, uploadDtoOrNull, verificationStatus, type VerificationRow,
} from './service';

const router = Router();
const TYPE_LABEL: Record<VerificationRequest['type'], { zh: string; en: string }> = {
  student_id: { zh: '学生证', en: 'student ID' },
  passport: { zh: '护照', en: 'passport' },
  government_id: { zh: '身份证件', en: 'government ID' },
  landlord_proof: { zh: '租约或产权证明', en: 'lease or ownership proof' },
};

// =====================================================================================================
// User endpoints
// =====================================================================================================

router.get('/status', requireAuth, (req, res) => {
  ok(res, verificationStatus(req.user!));
});

// ---- edu (thin aliases of /api/auth/*-edu-code — one code path in lib/eduVerify.ts)
router.post('/edu/request', requireAuth, rateLimit('codes'), (req, res) => {
  const body = parseBody(req, EduRequestInput);
  const r = requestEduCode(req.user!, body.email);
  logEvent(req, 'verify.edu_request', { entityType: 'user', entityId: req.user!.id, props: { campusId: r.campusId } });
  ok(res, r);
});
router.post('/edu/confirm', requireAuth, (req, res) => {
  const body = parseBody(req, EduConfirmInput);
  const updated = confirmEduCode(req.user!, body.email, body.code);
  logEvent(req, 'verify.edu_confirm', { entityType: 'user', entityId: updated.id, props: { trustLevel: updated.trust_level } });
  ok(res, toUserMe(updated));
});

// ---- ID documents
router.get('/id', requireAuth, (req, res) => {
  ok(res, listRequests(req.user!.id).map(toRequestDto));
});

router.post('/id', requireTrust(1), rateLimit('writes'), (req, res) => {
  const u = req.user!;
  const body = parseBody(req, IdRequestInput);
  const open = openRequest(u.id, body.type);
  if (open) throw new ApiError('CONFLICT', 'You already have an open request of this type', { data: { requestId: open.id, status: open.status } });
  if (body.selfieUploadId && body.selfieConsent !== true) throw new ApiError('VALIDATION', 'Consent is required to submit a selfie', { fields: { selfieConsent: 'required with a selfie' } });

  const sides = { front: body.frontUploadId, back: body.backUploadId, selfie: body.selfieUploadId } as const;
  const fields: Record<string, string> = {};
  for (const [side, id] of Object.entries(sides)) {
    if (!id) continue;
    const up = getUpload(id);
    if (!up || up.owner_id !== u.id) fields[`${side}UploadId`] = 'upload not found or not yours';
    else if (up.purpose !== 'verification' || up.is_private !== 1) fields[`${side}UploadId`] = "upload must have purpose 'verification'";
    else if (q.count("SELECT COUNT(*) FROM verification_requests WHERE (front_upload_id = ? OR back_upload_id = ? OR selfie_upload_id = ?) AND status IN ('pending','in_review','approved')", [id, id, id]) > 0)
      fields[`${side}UploadId`] = 'upload already used by another request';
  }
  if (Object.keys(fields).length) throw new ApiError('VALIDATION', 'Invalid document uploads', { fields });
  const campusId = body.campusId && getCampus(body.campusId) ? body.campusId : u.campus_id;
  const t = nowIso();
  const row: VerificationRow = {
    id: uid(), user_id: u.id, campus_id: campusId, type: body.type,
    front_upload_id: body.frontUploadId, back_upload_id: body.backUploadId ?? null, selfie_upload_id: body.selfieUploadId ?? null,
    full_name: body.fullName, doc_number_last4: body.docNumberLast4 ?? null, status: 'pending', reviewer_id: null, reason: null,
    // the consent the user ticked is recorded with the request (selfies are optional; review-only, deleted with the documents)
    internal_note: body.selfieUploadId ? `selfie consent v1 given ${t}` : null,
    submitted_at: t, reviewed_at: null, created_at: t, updated_at: t,
  };
  q.insert('verification_requests', row as unknown as Record<string, string | number | null>);
  logEvent(req, 'verify.submit', { entityType: 'verification_request', entityId: row.id, props: { type: body.type, hasBack: !!body.backUploadId, hasSelfie: !!body.selfieUploadId } });
  ok(res, toRequestDto(row), 201);
});

router.delete('/id/:id', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const row = loadRequest(id);
  if (!row || (row.user_id !== req.user!.id && req.user!.role !== 'admin')) throw new ApiError('NOT_FOUND', 'Request not found');
  if (row.status !== 'pending') invalidState(row.status, 'cancelled');
  const t = nowIso();
  q.run("UPDATE verification_requests SET status = 'cancelled', updated_at = ? WHERE id = ?", [t, id]);
  logEvent(req, 'verify.cancel', { entityType: 'verification_request', entityId: id, props: { type: row.type } });
  ok(res, toRequestDto({ ...row, status: 'cancelled', updated_at: t }));
});

// ---- phone (mock SMS via lib/mailbox)
router.post('/phone/request', requireAuth, rateLimit('codes'), (req, res) => {
  const u = req.user!;
  const { phone } = parseBody(req, PhoneRequestInput);
  const other = q.get<{ id: string }>('SELECT id FROM users WHERE phone = ? AND phone_verified_at IS NOT NULL AND id <> ? AND deleted_at IS NULL', [phone, u.id]);
  if (other) throw new ApiError('CONFLICT', 'This phone number is already verified by another account', { fields: { phone: 'already in use' } });
  const sent = sendSmsCode(u.id, phone, 'phone_verify', { locale: u.locale });
  // remember the number being verified (phone_verified_at is cleared until the code is confirmed)
  if (u.phone !== phone) q.run('UPDATE users SET phone = ?, phone_verified_at = NULL, updated_at = ? WHERE id = ?', [phone, nowIso(), u.id]);
  logEvent(req, 'verify.phone_request', { entityType: 'user', entityId: u.id });
  ok(res, { sent: true, expiresInSec: sent.expiresInSec, ...(sent.devCode ? { devCode: sent.devCode } : {}) });
});

router.post('/phone/confirm', requireAuth, (req, res) => {
  const u = req.user!;
  const { code } = parseBody(req, PhoneConfirmInput);
  const row = verifySmsCode(u.id, code, 'phone_verify');
  const t = nowIso();
  q.run('UPDATE users SET phone = ?, phone_verified_at = ?, updated_at = ? WHERE id = ?', [row.phone, t, t, u.id]);
  const before = u.trust_level;
  const level = recomputeTrust(u.id, 'phone_confirm');
  logEvent(req, 'verify.phone_confirm', { entityType: 'user', entityId: u.id, props: { trustLevel: level } });
  if (level === 3 && before < 3) notifyFullyVerified(u.id);
  ok(res, toUserMe(loadUser(u.id)!));
});

// ---- payment method on file (mock card; billing's PaymentMethod DTO)
router.get('/payment-methods', requireAuth, (req, res) => {
  ok(res, listPaymentMethods(req.user!.id));
});
router.post('/payment-methods', requireAuth, rateLimit('writes'), (req, res) => {
  const u = req.user!;
  const body = parseBody(req, PaymentMethodInput);
  const before = u.trust_level;
  try {
    const pm = addPaymentMethod(u.id, body);
    const level = loadUser(u.id)!.trust_level;
    logEvent(req, 'verify.payment_add', { entityType: 'user', entityId: u.id, props: { brand: pm.brand, trustLevel: level } });
    if (level === 3 && before < 3) notifyFullyVerified(u.id);
    ok(res, { method: pm, methods: listPaymentMethods(u.id), trustLevel: level }, 201);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'PAYMENT_FAILED') logEvent(req, 'verify.payment_fail', { entityType: 'user', entityId: u.id, props: { failureCode: (e.data as { failureCode?: string })?.failureCode } });
    throw e;
  }
});
router.post('/payment-methods/:id/default', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  ok(res, setDefaultPaymentMethod(req.user!.id, id));
});
router.delete('/payment-methods/:id', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const pm = removePaymentMethod(req.user!.id, id);
  logEvent(req, 'verify.payment_remove', { entityType: 'user', entityId: req.user!.id, props: { brand: pm.brand } });
  ok(res, { removed: pm, methods: listPaymentMethods(req.user!.id), trustLevel: loadUser(req.user!.id)!.trust_level });
});

// ---- my verification timeline (audit entries about me + my verify events)
export type TimelineEntry = {
  id: string;
  source: 'audit' | 'event';
  action: string;
  entityType: string | null;
  entityId: string | null;
  reason: string | null;
  actorRole: string | null;
  data: Record<string, unknown>;
  createdAt: string;
};
router.get('/audit', requireAuth, (req, res) => {
  const u = req.user!;
  const p = parseQuery(req, AuditQuery);
  const { limit, offset } = pageWindow(p);
  const where = `(
      (a.entity_type = 'user' AND a.entity_id = ?)
      OR (a.entity_type = 'verification_request' AND a.entity_id IN (SELECT id FROM verification_requests WHERE user_id = ?))
      OR (a.entity_type = 'payment_method' AND a.entity_id IN (SELECT id FROM payment_methods WHERE user_id = ?))
    ) AND a.action NOT IN ('verify.view_document')`;
  const auditRows = q.all<AuditRow>(`SELECT a.* FROM audit_log a WHERE ${where} ORDER BY a.created_at DESC LIMIT 200`, [u.id, u.id, u.id]);
  const eventRows = q.all<{ id: string; type: string; entity_type: string | null; entity_id: string | null; props_json: string; created_at: string }>(
    "SELECT id, type, entity_type, entity_id, props_json, created_at FROM events WHERE user_id = ? AND type LIKE 'verify.%' AND type NOT IN ('verify.payment_fail') ORDER BY created_at DESC LIMIT 200",
    [u.id],
  );
  const items: TimelineEntry[] = [
    ...auditRows.map((r) => {
      const dto = toAuditDto(r);
      const after = (dto.after ?? {}) as Record<string, unknown>;
      return { id: r.id, source: 'audit' as const, action: r.action, entityType: r.entity_type, entityId: r.entity_id, reason: r.reason, actorRole: r.actor_role, data: { ...after, type: (dto.before as { type?: string } | null)?.type ?? after.type }, createdAt: r.created_at };
    }),
    ...eventRows.map((r) => {
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(r.props_json) as Record<string, unknown>; } catch { /* ignore */ }
      return { id: r.id, source: 'event' as const, action: r.type, entityType: r.entity_type, entityId: r.entity_id, reason: null, actorRole: null, data, createdAt: r.created_at };
    }),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  paginated(res, { items: items.slice(offset, offset + limit), total: items.length, page: p.page, pageSize: p.pageSize });
});

// ---- public trust profile
router.get('/profile/:userId', (req, res) => {
  const { userId } = parseParams(req, z.object({ userId: z.string().min(1).max(128) }));
  ok(res, trustProfile(userId));
});

// =====================================================================================================
// Admin review queue
// =====================================================================================================

type QueueRow = VerificationRow & { email: string; edu_email: string | null; user_created_at: string; user_trust: number; front_sha: string | null };
type QueueItem = VerificationRequest & {
  user: UserPublic & { email: string; eduEmail: string | null; memberSince: string; priorRequests: number };
  campus: ReturnType<typeof toCampusLite>;
  reviewer: UserPublic | null;
  front?: ReturnType<typeof uploadDtoOrNull>;
  back?: ReturnType<typeof uploadDtoOrNull>;
  selfie?: ReturnType<typeof uploadDtoOrNull>;
  ageHours: number;
  overdue: boolean;
  duplicateDocument: boolean;
  internalNote: string | null;
};

const SLA_HOURS = 24;

function queueItems(rows: QueueRow[]): QueueItem[] {
  const users = loadUsersPublic(rows.flatMap((r) => [r.user_id, ...(r.reviewer_id ? [r.reviewer_id] : [])]));
  return rows.map((r) => {
    const base = users.get(r.user_id)!;
    const ageHours = Math.max(0, Math.round((nowMs() - Date.parse(r.submitted_at)) / HOUR));
    const duplicateDocument = !!r.front_sha && q.count('SELECT COUNT(*) FROM uploads WHERE sha256 = ? AND owner_id <> ? AND owner_id IS NOT NULL', [r.front_sha, r.user_id]) > 0;
    return {
      ...toRequestDto(r),
      user: {
        ...base,
        email: r.email,
        eduEmail: r.edu_email,
        memberSince: r.user_created_at,
        priorRequests: q.count('SELECT COUNT(*) FROM verification_requests WHERE user_id = ? AND id <> ?', [r.user_id, r.id]),
      },
      campus: toCampusLite(r.campus_id),
      reviewer: r.reviewer_id ? users.get(r.reviewer_id) ?? null : null,
      front: uploadDtoOrNull(r.front_upload_id),
      back: uploadDtoOrNull(r.back_upload_id),
      selfie: uploadDtoOrNull(r.selfie_upload_id),
      ageHours,
      overdue: (r.status === 'pending' || r.status === 'in_review') && ageHours > SLA_HOURS,
      duplicateDocument,
      internalNote: r.internal_note,
    };
  });
}

const QUEUE_SELECT = `SELECT v.*, u.email, u.edu_email, u.created_at AS user_created_at, u.trust_level AS user_trust, fu.sha256 AS front_sha
  FROM verification_requests v JOIN users u ON u.id = v.user_id LEFT JOIN uploads fu ON fu.id = v.front_upload_id`;

router.get('/admin/stats', requireAdmin, (_req, res) => {
  const dayAgo = new Date(nowMs() - 24 * HOUR).toISOString();
  const oldest = q.get<{ submitted_at: string }>("SELECT submitted_at FROM verification_requests WHERE status IN ('pending','in_review') ORDER BY submitted_at ASC LIMIT 1", []);
  const byType = q.all<{ type: string; n: number }>("SELECT type, COUNT(*) AS n FROM verification_requests WHERE status IN ('pending','in_review') GROUP BY type", []);
  const byCampus = q.all<{ campus_id: string | null; n: number }>("SELECT campus_id, COUNT(*) AS n FROM verification_requests WHERE status IN ('pending','in_review') GROUP BY campus_id ORDER BY n DESC LIMIT 8", []);
  const decided = q.all<{ submitted_at: string; reviewed_at: string }>("SELECT submitted_at, reviewed_at FROM verification_requests WHERE status IN ('approved','rejected') AND reviewed_at >= ? ORDER BY reviewed_at DESC LIMIT 200", [new Date(nowMs() - 7 * 24 * HOUR).toISOString()]);
  const hours = decided.map((d) => (Date.parse(d.reviewed_at) - Date.parse(d.submitted_at)) / HOUR).sort((a, b) => a - b);
  ok(res, {
    pending: q.count("SELECT COUNT(*) FROM verification_requests WHERE status = 'pending'", []),
    inReview: q.count("SELECT COUNT(*) FROM verification_requests WHERE status = 'in_review'", []),
    overdue: q.count("SELECT COUNT(*) FROM verification_requests WHERE status IN ('pending','in_review') AND submitted_at < ?", [dayAgo]),
    approved24h: q.count("SELECT COUNT(*) FROM verification_requests WHERE status = 'approved' AND reviewed_at >= ?", [dayAgo]),
    rejected24h: q.count("SELECT COUNT(*) FROM verification_requests WHERE status = 'rejected' AND reviewed_at >= ?", [dayAgo]),
    oldestPendingHours: oldest ? Math.round((nowMs() - Date.parse(oldest.submitted_at)) / HOUR) : null,
    medianDecisionHours7d: hours.length ? Math.round(hours[Math.floor(hours.length / 2)]! * 10) / 10 : null,
    slaHours: SLA_HOURS,
    byType: Object.fromEntries(byType.map((r) => [r.type, r.n])),
    byCampus: byCampus.map((r) => ({ campus: toCampusLite(r.campus_id), count: r.n })),
  });
});

router.get('/admin/queue', requireAdmin, (req, res) => {
  const p = parseQuery(req, AdminQueueQuery);
  const { limit, offset } = pageWindow(p);
  const statuses = p.status?.length ? p.status : ['pending', 'in_review'];
  const where: string[] = [`v.status IN (${statuses.map(() => '?').join(', ')})`];
  const params: (string | number)[] = [...statuses];
  if (p.type?.length) {
    where.push(`v.type IN (${p.type.map(() => '?').join(', ')})`);
    params.push(...p.type);
  }
  if (p.campusId) {
    where.push('v.campus_id = ?');
    params.push(p.campusId);
  }
  if (p.q) {
    where.push('(u.name LIKE ? OR u.email LIKE ? OR v.full_name LIKE ?)');
    const like = `%${p.q}%`;
    params.push(like, like, like);
  }
  const w = where.join(' AND ');
  const total = q.count(`SELECT COUNT(*) FROM verification_requests v JOIN users u ON u.id = v.user_id WHERE ${w}`, params);
  const order = p.sort === 'newest' ? 'v.submitted_at DESC' : 'v.submitted_at ASC';
  const rows = q.all<QueueRow>(`${QUEUE_SELECT} WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  paginated(res, { items: queueItems(rows), total, page: p.page, pageSize: p.pageSize }, { slaHours: SLA_HOURS });
});

function loadQueueItem(id: string): QueueItem {
  const row = q.get<QueueRow>(`${QUEUE_SELECT} WHERE v.id = ?`, [id]);
  if (!row) throw new ApiError('NOT_FOUND', 'Verification request not found');
  return queueItems([row])[0]!;
}

router.get('/admin/requests/:id', requireAdmin, (req, res) => {
  const { id } = parseParams(req, idParam);
  const item = loadQueueItem(id);
  const auditRows = q.all<AuditRow>("SELECT * FROM audit_log WHERE entity_type = 'verification_request' AND entity_id = ? ORDER BY created_at DESC LIMIT 100", [id]);
  const actors = loadUsersPublic(auditRows.map((r) => r.actor_id).filter((x): x is string => !!x));
  const history: AuditEntry[] = auditRows.map((r) => toAuditDto(r, r.actor_id ? actors.get(r.actor_id) ?? null : null));
  const userRequests = listRequests(item.userId).filter((r) => r.id !== id).map(toRequestDto);
  ok(res, { ...item, history, userRequests });
});

/** Streams a document side to an admin and writes `verify.view_document` (once per admin / upload / 10 min). */
router.get('/admin/requests/:id/files/:side', requireAdmin, (req, res) => {
  const { id, side } = parseParams(req, z.object({ id: z.string().min(1).max(128), side: DocumentSide }));
  const row = loadRequest(id);
  if (!row) throw new ApiError('NOT_FOUND', 'Verification request not found');
  const uploadId = side === 'front' ? row.front_upload_id : side === 'back' ? row.back_upload_id : row.selfie_upload_id;
  const up = uploadId ? getUpload(uploadId) : undefined;
  if (!up) throw new ApiError('NOT_FOUND', 'Document not found');
  const abs = uploadFilePath(up);
  if (!fs.existsSync(abs)) throw new ApiError('NOT_FOUND', 'File missing on disk');
  const recently = q.count(
    "SELECT COUNT(*) FROM audit_log WHERE action = 'verify.view_document' AND actor_id = ? AND entity_type = 'verification_request' AND entity_id = ? AND json_extract(after_json, '$.side') = ? AND created_at >= ?",
    [req.user!.id, id, side, new Date(nowMs() - 10 * 60_000).toISOString()],
  );
  if (!recently) audit(req, { action: 'verify.view_document', entityType: 'verification_request', entityId: id, after: { side, uploadId: up.id, userId: row.user_id } });
  res.setHeader('Content-Type', up.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(up.filename)}"`);
  fs.createReadStream(abs).pipe(res);
});

router.post('/admin/requests/:id/claim', requireAdmin, (req, res) => {
  const { id } = parseParams(req, idParam);
  const row = loadRequest(id);
  if (!row) throw new ApiError('NOT_FOUND', 'Verification request not found');
  if (row.status !== 'pending') invalidState(row.status, 'in_review');
  const t = nowIso();
  q.run("UPDATE verification_requests SET status = 'in_review', reviewer_id = ?, updated_at = ? WHERE id = ?", [req.user!.id, t, id]);
  audit(req, { action: 'verify.claim', entityType: 'verification_request', entityId: id, before: { status: row.status, type: row.type }, after: { status: 'in_review', type: row.type, reviewerId: req.user!.id } });
  ok(res, loadQueueItem(id));
});

router.post('/admin/requests/:id/approve', requireAdmin, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, ApproveInput);
  const row = loadRequest(id);
  if (!row) throw new ApiError('NOT_FOUND', 'Verification request not found');
  if (row.status !== 'pending' && row.status !== 'in_review') invalidState(row.status, 'approved');
  const t = nowIso();
  const target = loadUser(row.user_id);
  const before = target?.trust_level ?? 0;
  q.tx(() => {
    q.run("UPDATE verification_requests SET status = 'approved', reviewer_id = ?, reviewed_at = ?, internal_note = COALESCE(?, internal_note), reason = NULL, updated_at = ? WHERE id = ?", [req.user!.id, t, body.note ?? null, t, id]);
    q.run('UPDATE users SET id_verified_at = COALESCE(id_verified_at, ?), updated_at = ? WHERE id = ?', [t, t, row.user_id]);
  });
  const level = recomputeTrust(row.user_id, 'verification_approved');
  audit(req, { action: 'verify.approve', entityType: 'verification_request', entityId: id, before: { status: row.status, type: row.type, trustLevel: before }, after: { status: 'approved', type: row.type, trustLevel: level, userId: row.user_id }, reason: body.note ?? null });
  logEvent(req, 'verify.approve', { entityType: 'verification_request', entityId: id, props: { type: row.type, userId: row.user_id, trustLevel: level } });
  const label = TYPE_LABEL[row.type];
  notify(row.user_id, 'verify.approved', {
    title: { zh: `${label.zh}验证已通过`, en: `Your ${label.en} was verified` },
    body: level >= 2
      ? { zh: `你的信任等级提升到 L${level}，发布的内容会显示「已验证」标识。`, en: `Your trust level is now L${level}. Your posts show the verified badge.` }
      : { zh: '审核已通过。', en: 'Review complete.' },
    link: '/verify',
    entityType: 'verification_request',
    entityId: id,
    data: { type: row.type, trustLevel: level },
  });
  if (level === 3 && before < 3) notifyFullyVerified(row.user_id);
  ok(res, loadQueueItem(id));
});

router.post('/admin/requests/:id/reject', requireAdmin, (req, res) => {
  const { id } = parseParams(req, idParam);
  const body = parseBody(req, RejectInput);
  const row = loadRequest(id);
  if (!row) throw new ApiError('NOT_FOUND', 'Verification request not found');
  if (row.status !== 'pending' && row.status !== 'in_review') invalidState(row.status, 'rejected');
  const t = nowIso();
  q.run("UPDATE verification_requests SET status = 'rejected', reviewer_id = ?, reviewed_at = ?, reason = ?, internal_note = COALESCE(?, internal_note), updated_at = ? WHERE id = ?", [req.user!.id, t, body.reason, body.note ?? null, t, id]);
  const level = recomputeTrust(row.user_id, 'verification_rejected');
  audit(req, { action: 'verify.reject', entityType: 'verification_request', entityId: id, before: { status: row.status, type: row.type }, after: { status: 'rejected', type: row.type, code: body.code ?? null, userId: row.user_id }, reason: body.reason });
  logEvent(req, 'verify.reject', { entityType: 'verification_request', entityId: id, props: { type: row.type, userId: row.user_id, code: body.code ?? null } });
  const label = TYPE_LABEL[row.type];
  notify(row.user_id, 'verify.rejected', {
    title: { zh: `${label.zh}验证未通过`, en: `Your ${label.en} could not be verified` },
    body: { zh: `原因：${body.reason}。你可以重新提交。`, en: `Reason: ${body.reason}. You can resubmit.` },
    link: '/verify',
    entityType: 'verification_request',
    entityId: id,
    data: { type: row.type, reason: body.reason, code: body.code ?? null, trustLevel: level },
  });
  ok(res, loadQueueItem(id));
});

router.post('/admin/users/:userId/trust', requireAdmin, (req, res) => {
  const { userId } = parseParams(req, z.object({ userId: z.string().min(1).max(128) }));
  const body = parseBody(req, TrustOverrideInput);
  const target = loadUser(userId);
  if (!target) throw new ApiError('NOT_FOUND', 'User not found');
  const before = target.trust_level;
  setTrustOverride(userId, body.trustLevel, req.user!.id, body.reason);
  logEvent(req, 'verify.trust_override', { entityType: 'user', entityId: userId, props: { from: before, to: body.trustLevel } });
  if (body.trustLevel !== before) {
    notify(userId, 'system', {
      title: { zh: `你的信任等级已调整为 L${body.trustLevel}`, en: `Your trust level was set to L${body.trustLevel}` },
      body: { zh: `平台审核团队：${body.reason}`, en: `Trust & Safety: ${body.reason}` },
      link: '/verify',
      entityType: 'user',
      entityId: userId,
      data: { from: before, to: body.trustLevel },
    });
  }
  ok(res, { ...toUserMe(loadUser(userId)!), public: loadUserPublic(userId) });
});

// ---- helpers
function notifyFullyVerified(userId: string): void {
  notify(userId, 'system', {
    title: { zh: '你已完成全部验证', en: 'You are fully verified' },
    body: { zh: '信任等级 L3：可以使用安心付、购买房东 Pro，私信不再限量。', en: 'Trust level 3 unlocks Secure Payment, Landlord Pro, and unlimited messaging.' },
    link: '/verify',
    entityType: 'user',
    entityId: userId,
    data: { trustLevel: 3 },
  });
}

router.get('/', (_req, res) => {
  ok(res, { module: 'verify', status: 'ready', endpoints: ['/status', '/edu/*', '/id', '/phone/*', '/payment-methods', '/audit', '/profile/:userId', '/admin/*'] });
});

export default router;
