// Upload service — API.md §2.4, DATA_MODEL §2.3.
//
//   router.post('/', requireAuth, uploadMiddleware, handler)   // multer memory storage, field `file` (1..10)
//   const dto = storeUpload({ buffer, originalName, mime, ownerId, purpose, isPrivate });
//   getUpload(id) -> UploadRow | undefined ; toUploadDto(row) ; uploadFilePath(row) ; deleteUploadFile(row)
//   insertSeedUpload({ path: 'seed/rooms/r01.svg', ownerId, purpose: 'seed' })   // used by seeds (file already on disk)
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import type { Upload } from '@shared/types';
import { config } from '../config';
import { q, uid } from '../db';
import { ApiError } from './errors';
import { sha256 } from './ids';
import { nowDate, nowIso } from './time';
import type { UploadRow } from './types';

export const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const DOC_MIMES = new Set(['application/pdf']);
export const SVG_MIME = 'image/svg+xml';
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf',
};

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limits.uploadMaxBytesDoc, files: 10, fields: 10 },
}).array('file', 10);

/** Best-effort pixel size from headers (png/jpeg/gif/webp/svg). */
export function probeImageSize(buf: Buffer, mime: string): { width: number | null; height: number | null } {
  try {
    if (mime === 'image/png' && buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (mime === 'image/gif' && buf.length >= 10) return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (mime === 'image/jpeg') {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1]!;
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    if (mime === 'image/webp' && buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF') {
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
      if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
    if (mime === SVG_MIME) {
      const head = buf.toString('utf8', 0, Math.min(buf.length, 600));
      const w = /\swidth="(\d+)/.exec(head)?.[1];
      const h = /\sheight="(\d+)/.exec(head)?.[1];
      const vb = /viewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/.exec(head);
      return { width: w ? Number(w) : vb ? Math.round(Number(vb[1])) : null, height: h ? Number(h) : vb ? Math.round(Number(vb[2])) : null };
    }
  } catch { /* ignore */ }
  return { width: null, height: null };
}

export function sniffMime(buf: Buffer, declared: string): string {
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6 && buf.toString('ascii', 0, 6).startsWith('GIF8')) return 'image/gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  const head = buf.toString('utf8', 0, Math.min(buf.length, 300)).trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return declared;
}

export type StoreUploadInput = {
  buffer: Buffer;
  originalName: string;
  mime: string;
  ownerId: string | null;
  purpose: string;
  isPrivate?: boolean;
  /** allow svg (seed/dev only) */
  allowSvg?: boolean;
};

export function toUploadDto(r: UploadRow): Upload {
  return {
    id: r.id,
    url: r.is_private === 1 ? `/api/uploads/${r.id}/file` : r.url,
    kind: r.kind,
    mime: r.mime,
    width: r.width,
    height: r.height,
    sizeBytes: r.size_bytes,
    isPrivate: r.is_private === 1,
  };
}
export function getUpload(id: string): UploadRow | undefined {
  return q.get<UploadRow>('SELECT * FROM uploads WHERE id = ?', [id]);
}
export function uploadFilePath(r: Pick<UploadRow, 'path' | 'is_private'>): string {
  return path.join(r.is_private === 1 ? config.uploadPrivateDir : config.uploadDir, r.path);
}

/** Validates, writes the file to UPLOAD_DIR/<yyyy>/<mm>/<uuid>.<ext> (private: UPLOAD_PRIVATE_DIR) and inserts the row. */
export function storeUpload(input: StoreUploadInput): Upload {
  const mime = sniffMime(input.buffer, input.mime);
  const isPrivate = input.isPrivate || input.purpose === 'verification';
  const isImage = IMAGE_MIMES.has(mime) || (mime === SVG_MIME && !!input.allowSvg);
  const isDoc = DOC_MIMES.has(mime) && (input.purpose === 'verification' || input.purpose === 'other');
  if (!isImage && !isDoc) throw new ApiError('UNSUPPORTED_MEDIA', `Unsupported file type ${mime}`);
  const max = isImage ? config.limits.uploadMaxBytesImage : config.limits.uploadMaxBytesDoc;
  if (input.buffer.length > max) throw new ApiError('UPLOAD_TOO_LARGE', `File exceeds ${Math.round(max / 1048576)} MB`);
  const id = uid();
  const d = nowDate();
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const rel = `${yyyy}/${mm}/${id}.${EXT[mime] ?? 'bin'}`;
  const base = isPrivate ? config.uploadPrivateDir : config.uploadDir;
  const abs = path.join(base, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, input.buffer);
  const { width, height } = isImage ? probeImageSize(input.buffer, mime) : { width: null, height: null };
  const row: UploadRow = {
    id,
    owner_id: input.ownerId,
    kind: isImage ? 'image' : 'document',
    purpose: input.purpose,
    filename: (input.originalName || 'file').slice(0, 200),
    path: rel,
    url: `/uploads/${rel}`,
    mime,
    size_bytes: input.buffer.length,
    width,
    height,
    sha256: sha256(input.buffer),
    is_private: isPrivate ? 1 : 0,
    created_at: nowIso(),
  };
  q.insert('uploads', row as unknown as Record<string, string | number | null>);
  return toUploadDto(row);
}

/** Registers a file that already exists under UPLOAD_DIR (seed assets). Idempotent on (path). Returns the upload id. */
export function insertSeedUpload(input: { path: string; ownerId?: string | null; purpose?: string; width?: number; height?: number; id?: string }): string {
  const existing = q.get<{ id: string }>('SELECT id FROM uploads WHERE path = ?', [input.path]);
  if (existing) return existing.id;
  const id = input.id ?? uid();
  const abs = path.join(config.uploadDir, input.path);
  let size = 0;
  let w = input.width ?? null;
  let h = input.height ?? null;
  const ext = path.extname(input.path).slice(1).toLowerCase();
  const mime = ext === 'svg' ? SVG_MIME : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  if (fs.existsSync(abs)) {
    const buf = fs.readFileSync(abs);
    size = buf.length;
    if (w === null || h === null) ({ width: w, height: h } = probeImageSize(buf, mime));
  }
  q.run(
    `INSERT INTO uploads (id, owner_id, kind, purpose, filename, path, url, mime, size_bytes, width, height, sha256, is_private, created_at)
     VALUES (?, ?, 'image', ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)`,
    [id, input.ownerId ?? null, input.purpose ?? 'seed', path.basename(input.path), input.path, `/uploads/${input.path}`, mime, size, w, h, nowIso()],
  );
  return id;
}

export function deleteUploadFile(r: Pick<UploadRow, 'path' | 'is_private'>): void {
  try {
    fs.unlinkSync(uploadFilePath(r));
  } catch { /* already gone */ }
}

/** True when a published listing/item photo references the upload (DELETE refuses with CONFLICT). */
export function uploadIsReferenced(id: string): boolean {
  return (
    q.count("SELECT COUNT(*) FROM listing_photos lp JOIN listings l ON l.id = lp.listing_id WHERE lp.upload_id = ? AND l.status IN ('active','paused')", [id]) > 0 ||
    q.count("SELECT COUNT(*) FROM market_item_photos mp JOIN market_items m ON m.id = mp.item_id WHERE mp.upload_id = ? AND m.status IN ('active','reserved')", [id]) > 0
  );
}
