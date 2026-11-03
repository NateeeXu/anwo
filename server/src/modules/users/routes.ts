// /api/users — API.md §2.2 (scaffold-owned)
import { Router } from 'express';
import { z } from 'zod';
import { E164, ReportInput, idParam } from '@shared/schemas/common';
import { q } from '../../db';
import { clearSessionCookie, loadUser, requireAuth, setCampusCookie, verifyPassword } from '../../lib/auth';
import { ApiError } from '../../lib/errors';
import { ok, parseBody, parseParams } from '../../lib/http';
import { loadUserPublicRow, toUserMe, toUserPublic } from '../../lib/users';
import { getCampus } from '../../lib/campuses';
import { getUpload } from '../../lib/uploads';
import { logEvent } from '../../lib/events';
import { hooks } from '../../lib/hooks';
import { nowIso } from '../../lib/time';
import { createReport } from '../../lib/reports';
import { kickUser } from '../../realtime/hub';
import { recomputeTrust } from '../../lib/trust';

const router = Router();

const PatchMe = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  bio: z.string().max(500).nullable().optional(),
  avatarUploadId: z.string().nullable().optional(),
  locale: z.enum(['zh-CN', 'en']).optional(),
  campusId: z.string().max(64).nullable().optional(),
  phone: E164.nullable().optional(),
  wechatId: z.string().max(60).nullable().optional(),
  gender: z.enum(['female', 'male', 'nonbinary', 'undisclosed']).nullable().optional(),
  gradYear: z.number().int().min(2000).max(2040).nullable().optional(),
  program: z.string().max(80).nullable().optional(),
  languages: z.array(z.string().max(10)).max(10).optional(),
  verifiedOnlyMessaging: z.boolean().optional(),
  emailDigestOptIn: z.boolean().optional(),
});

router.get('/me', requireAuth, (req, res) => ok(res, toUserMe(req.user!)));

router.patch('/me', requireAuth, (req, res) => {
  const body = parseBody(req, PatchMe);
  const u = req.user!;
  const set: Record<string, string | number | null> = {};
  if (body.name !== undefined) set.name = body.name;
  if (body.bio !== undefined) set.bio = body.bio;
  if (body.locale !== undefined) set.locale = body.locale;
  if (body.wechatId !== undefined) set.wechat_id = body.wechatId;
  if (body.gender !== undefined) set.gender = body.gender;
  if (body.gradYear !== undefined) set.grad_year = body.gradYear;
  if (body.program !== undefined) set.program = body.program;
  if (body.languages !== undefined) set.languages_json = JSON.stringify(body.languages);
  if (body.verifiedOnlyMessaging !== undefined) set.verified_only_messaging = body.verifiedOnlyMessaging ? 1 : 0;
  if (body.emailDigestOptIn !== undefined) set.email_digest_opt_in = body.emailDigestOptIn ? 1 : 0;
  if (body.avatarUploadId !== undefined) {
    if (body.avatarUploadId) {
      const up = getUpload(body.avatarUploadId);
      if (!up || (up.owner_id !== u.id && u.role !== 'admin') || up.kind !== 'image' || up.is_private === 1)
        throw new ApiError('VALIDATION', 'Invalid avatar upload', { fields: { avatarUploadId: 'must be your own public image upload' } });
    }
    set.avatar_upload_id = body.avatarUploadId;
  }
  if (body.phone !== undefined && body.phone !== u.phone) {
    set.phone = body.phone;
    set.phone_verified_at = null;
  }
  let campusChanged = false;
  if (body.campusId !== undefined && body.campusId !== u.campus_id) {
    if (body.campusId && !getCampus(body.campusId)) throw new ApiError('VALIDATION', 'Unknown campus', { fields: { campusId: 'unknown campus' } });
    set.campus_id = body.campusId;
    campusChanged = true;
  }
  if (Object.keys(set).length) {
    set.updated_at = nowIso();
    q.update('users', set, 'id = ?', [u.id]);
  }
  const updated = loadUser(u.id)!;
  if (campusChanged) {
    setCampusCookie(res, updated.campus_id);
    logEvent(req, 'campus.switch', { userId: u.id, campusId: updated.campus_id, props: { from: u.campus_id, to: updated.campus_id } });
    hooks.emit('user.campusChanged', { userId: u.id, from: u.campus_id, to: updated.campus_id });
  }
  if (body.phone !== undefined && body.phone !== u.phone) recomputeTrust(u.id, 'phone_changed');
  ok(res, toUserMe(loadUser(u.id)!));
});

router.delete('/me', requireAuth, async (req, res) => {
  const body = parseBody(req, z.object({ password: z.string().min(1).max(72) }));
  const row = q.get<{ password_hash: string; email: string }>('SELECT password_hash, email FROM users WHERE id = ?', [req.user!.id])!;
  if (!(await verifyPassword(body.password, row.password_hash))) throw new ApiError('INVALID_CREDENTIALS', 'Password is incorrect');
  const t = nowIso();
  q.tx(() => {
    q.run("UPDATE users SET deleted_at = ?, email = email || '.deleted.' || substr(?, 1, 8), edu_email = NULL, phone = NULL, updated_at = ? WHERE id = ?", [t, req.user!.id, t, req.user!.id]);
    q.run("UPDATE listings SET status = 'removed', updated_at = ? WHERE owner_id = ? AND status <> 'removed'", [t, req.user!.id]);
    q.run("UPDATE market_items SET status = 'removed', updated_at = ? WHERE seller_id = ? AND status <> 'removed'", [t, req.user!.id]);
    q.run("UPDATE wanted_posts SET status = 'removed', updated_at = ? WHERE user_id = ? AND status <> 'removed'", [t, req.user!.id]);
  });
  kickUser(req.user!.id);
  clearSessionCookie(res);
  ok(res, null);
});

router.get('/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const row = loadUserPublicRow(id);
  if (!row || row.deleted_at) throw new ApiError('NOT_FOUND', 'User not found');
  const user = toUserPublic(row, { withStats: true });
  const stats = {
    activeListings: q.count("SELECT COUNT(*) FROM listings WHERE owner_id = ? AND status = 'active' AND moderation_status = 'ok'", [id]),
    itemsSold: q.count("SELECT COUNT(*) FROM market_items WHERE seller_id = ? AND status = 'sold'", [id]),
    buddyHosted: q.count("SELECT COUNT(*) FROM buddy_posts WHERE author_id = ? AND status <> 'removed'", [id]),
    memberSince: row.created_at,
  };
  const trustProfile = {
    eduVerified: !!row.email_verified_at,
    idVerified: !!row.id_verified_at,
    phoneVerified: !!row.phone_verified_at,
    paymentOnFile: !!row.payment_verified_at,
    verifiedAt: { edu: row.email_verified_at, id: row.id_verified_at, phone: row.phone_verified_at, payment: row.payment_verified_at },
  };
  ok(res, { ...user, suspended: row.banned === 1, stats, trustProfile });
});

router.post('/:id/report', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  if (id === req.user!.id) throw new ApiError('BAD_REQUEST', 'You cannot report yourself');
  const target = q.get<{ id: string; campus_id: string | null }>('SELECT id, campus_id FROM users WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!target) throw new ApiError('NOT_FOUND', 'User not found');
  const body = parseBody(req, ReportInput);
  ok(res, createReport(req, { entityType: 'user', entityId: id, reason: body.reason, details: body.details, campusId: target.campus_id }), 201);
});

export default router;
