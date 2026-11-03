// Cross-cutting zod schemas — API.md §1.3/§1.4. Import from '@shared/schemas/common'.
import { z } from 'zod';

const bool = z.preprocess((v) => {
  if (typeof v === 'string') {
    if (['1', 'true', 'yes', 'on'].includes(v.toLowerCase())) return true;
    if (['0', 'false', 'no', 'off', ''].includes(v.toLowerCase())) return false;
  }
  return v;
}, z.boolean());
/** Query-string boolean: accepts 1/0/true/false. */
export const zBool = bool;
/** Comma-separated list → string[] (also accepts a real array). */
export const zCsv = z.preprocess((v) => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return v;
}, z.array(z.string()));

export const ScopeQuery = z.object({
  campusId: z.string().max(64).optional(),
  scope: z.enum(['campus', 'nationwide']).default('campus'),
  city: z.string().max(80).optional(),
  state: z.string().length(2).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.2).max(50).optional(),
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    .optional(), // minLng,minLat,maxLng,maxLat
});
export type ScopeQuery = z.infer<typeof ScopeQuery>;

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 50;
export const PINS_MAX = 500;

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export const idParam = z.object({ id: z.string().min(1).max(128) });
export type IdParam = z.infer<typeof idParam>;

export const ReportInput = z.object({
  reason: z.enum(['scam', 'spam', 'fake', 'harassment', 'inappropriate', 'duplicate', 'wrong_info', 'other']),
  details: z.string().max(1000).optional(),
});
export type ReportInput = z.infer<typeof ReportInput>;

export const EmailSchema = z.string().trim().toLowerCase().email().max(254);
export const PasswordSchema = z.string().min(8).max(72);
export const E164 = z.string().regex(/^\+[1-9]\d{6,14}$/, 'E.164 phone number expected');
export const DateYmd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD expected');
export const LatLng = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

/** `near=lat,lng` query param */
export const zLatLngCsv = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
  .transform((s) => {
    const [lat, lng] = s.split(',').map(Number) as [number, number];
    return { lat, lng };
  });
