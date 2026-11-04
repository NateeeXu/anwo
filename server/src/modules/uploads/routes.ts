// /api/uploads — API.md §2.4 (scaffold-owned)
import { Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import { UploadPurpose } from '@shared/enums';
import { idParam } from '@shared/schemas/common';
import { q } from '../../db';
import { requireAuth } from '../../lib/auth';
import { ApiError } from '../../lib/errors';
import { ok, parseParams } from '../../lib/http';
import { rateLimit } from '../../lib/ratelimit';
import { deleteUploadFile, getUpload, storeUpload, toUploadDto, uploadFilePath, uploadIsReferenced, uploadMiddleware } from '../../lib/uploads';

const router = Router();

router.post('/', requireAuth, rateLimit({ name: 'uploads', limit: 60, windowMs: 60_000 }), (req, res, next) => {
  uploadMiddleware(req, res, (err?: unknown) => {
    if (err) return next(err);
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!files.length) throw new ApiError('VALIDATION', 'No files received', { fields: { file: 'required (multipart field `file`)' } });
      const purpose = z.enum(UploadPurpose).catch('other').parse(req.body?.purpose);
      if (purpose === 'seed' && req.user!.role !== 'admin') throw new ApiError('FORBIDDEN', 'seed purpose is reserved');
      const isPrivate = req.body?.private === '1' || req.body?.private === 'true' || purpose === 'verification';
      const out = files.map((f) =>
        storeUpload({ buffer: f.buffer, originalName: f.originalname, mime: f.mimetype, ownerId: req.user!.id, purpose, isPrivate, allowSvg: purpose === 'seed' }),
      );
      ok(res, out, 201);
    } catch (e) {
      next(e);
    }
  });
});

router.get('/:id', (req, res) => {
  const { id } = parseParams(req, idParam);
  const up = getUpload(id);
  if (!up) throw new ApiError('NOT_FOUND', 'Upload not found');
  if (up.is_private === 1 && !(req.user && (req.user.id === up.owner_id || req.user.role === 'admin'))) throw new ApiError('NOT_FOUND', 'Upload not found');
  ok(res, toUploadDto(up));
});

router.get('/:id/file', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const up = getUpload(id);
  if (!up) throw new ApiError('NOT_FOUND', 'Upload not found');
  const u = req.user!;
  const allowed = u.role === 'admin' || u.id === up.owner_id || up.is_private === 0;
  if (!allowed) throw new ApiError('FORBIDDEN', 'Not your file');
  // ID documents: admins read them only through the audited /api/verify/admin/requests/:id/files/:side endpoint
  if (up.purpose === 'verification' && u.id !== up.owner_id) throw new ApiError('FORBIDDEN', 'Open verification documents from the review queue');
  const abs = uploadFilePath(up);
  if (!fs.existsSync(abs)) throw new ApiError('NOT_FOUND', 'File missing on disk');
  res.setHeader('Content-Type', up.mime);
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(up.filename)}"`);
  fs.createReadStream(abs).pipe(res);
});

router.delete('/:id', requireAuth, (req, res) => {
  const { id } = parseParams(req, idParam);
  const up = getUpload(id);
  if (!up) throw new ApiError('NOT_FOUND', 'Upload not found');
  if (up.owner_id !== req.user!.id && req.user!.role !== 'admin') throw new ApiError('FORBIDDEN', 'Not your file');
  if (uploadIsReferenced(id)) throw new ApiError('CONFLICT', 'Upload is used by a published listing or item');
  q.run('DELETE FROM uploads WHERE id = ?', [id]);
  deleteUploadFile(up);
  ok(res, null);
});

export default router;
