// Sponsored placements (BUSINESS_PLAN §2.5): Local / Feed / Campus Partner bookings sold by the team, their invoices,
// and the public read path. Cards are always labelled 「赞助 Sponsored」, max 3 per campus on the home feed, one per Kit
// category, and are never mixed into search results. Impressions / clicks are logged as sponsorship.impression /
// sponsorship.click events (plus counters on the row); paid invoices are unioned into admin revenue.
import type { Request } from 'express';
import { z } from 'zod';
import { q, uid, placeholders } from '../../db';
import { ApiError, notFound } from '../../lib/errors';
import { logEvent } from '../../lib/events';
import { nowIso } from '../../lib/time';

export const SPONSOR_FEED_MAX = 3;
export type SponsorshipRow = {
  id: string; sponsor_name: string; plan_key: string | null; campus_id: string | null; surface: 'home_feed' | 'kit' | 'map'; kit_category: string | null;
  title: string; title_zh: string | null; body: string | null; body_zh: string | null; url: string; logo_upload_id: string | null; lat: number | null; lng: number | null;
  starts_at: string; ends_at: string; status: 'draft' | 'active' | 'paused' | 'ended'; impressions: number; clicks: number; price_cents: number;
  created_by: string | null; created_at: string; updated_at: string;
};
export type SponsorshipDto = {
  id: string; sponsorName: string; planKey: string | null; campusId: string | null; surface: SponsorshipRow['surface']; kitCategory: string | null;
  title: string; titleZh: string | null; body: string | null; bodyZh: string | null; logoUrl: string | null; lat: number | null; lng: number | null;
  goUrl: string; sponsored: true; startsAt: string; endsAt: string; status: SponsorshipRow['status'];
};
export type SponsorshipAdminDto = SponsorshipDto & { url: string; impressions: number; clicks: number; priceCents: number; invoices: SponsorshipInvoiceDto[]; createdAt: string };
export type SponsorshipInvoiceDto = { id: string; sponsorshipId: string; amountCents: number; status: 'open' | 'paid' | 'void'; issuedAt: string; paidAt: string | null; note: string | null };

const httpUrl = z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'http(s) URL required');
export const SponsorshipInput = z.object({
  sponsorName: z.string().trim().min(2).max(120),
  planKey: z.string().max(64).optional(),
  campusId: z.string().max(64).nullable().optional(),
  surface: z.enum(['home_feed', 'kit', 'map']).default('home_feed'),
  kitCategory: z.string().max(40).nullable().optional(),
  title: z.string().trim().min(2).max(120),
  titleZh: z.string().trim().max(120).nullable().optional(),
  body: z.string().trim().max(300).nullable().optional(),
  bodyZh: z.string().trim().max(300).nullable().optional(),
  url: httpUrl,
  logoUploadId: z.string().max(128).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  status: z.enum(['draft', 'active', 'paused', 'ended']).default('active'),
  priceCents: z.number().int().min(0).max(10_000_000).default(0),
});
export const SponsorshipPatch = SponsorshipInput.partial();
export const SponsorshipInvoiceInput = z.object({ amountCents: z.number().int().min(0).max(10_000_000), note: z.string().trim().max(300).optional(), paid: z.boolean().optional() });
export const SponsorshipsQuery = z.object({ campusId: z.string().max(64).optional(), surface: z.enum(['home_feed', 'kit', 'map']).default('home_feed'), kitCategory: z.string().max(40).optional(), limit: z.coerce.number().int().min(1).max(SPONSOR_FEED_MAX).default(SPONSOR_FEED_MAX) });

function logoUrl(id: string | null): string | null {
  return id ? q.get<{ url: string }>('SELECT url FROM uploads WHERE id = ?', [id])?.url ?? null : null;
}
export function toSponsorshipDto(r: SponsorshipRow): SponsorshipDto {
  return {
    id: r.id, sponsorName: r.sponsor_name, planKey: r.plan_key, campusId: r.campus_id, surface: r.surface, kitCategory: r.kit_category, title: r.title, titleZh: r.title_zh,
    body: r.body, bodyZh: r.body_zh, logoUrl: logoUrl(r.logo_upload_id), lat: r.lat, lng: r.lng, goUrl: `/api/billing/sponsorships/${r.id}/go`, sponsored: true,
    startsAt: r.starts_at, endsAt: r.ends_at, status: r.status,
  };
}
export function toInvoiceDto(r: { id: string; sponsorship_id: string; amount_cents: number; status: SponsorshipInvoiceDto['status']; issued_at: string; paid_at: string | null; note: string | null }): SponsorshipInvoiceDto {
  return { id: r.id, sponsorshipId: r.sponsorship_id, amountCents: r.amount_cents, status: r.status, issuedAt: r.issued_at, paidAt: r.paid_at, note: r.note };
}
export function toSponsorshipAdminDto(r: SponsorshipRow): SponsorshipAdminDto {
  const invoices = q.all<Parameters<typeof toInvoiceDto>[0]>('SELECT * FROM sponsorship_invoices WHERE sponsorship_id = ? ORDER BY issued_at DESC', [r.id]).map(toInvoiceDto);
  return { ...toSponsorshipDto(r), url: r.url, impressions: r.impressions, clicks: r.clicks, priceCents: r.price_cents, invoices, createdAt: r.created_at };
}
export function loadSponsorship(id: string): SponsorshipRow | undefined {
  return q.get<SponsorshipRow>('SELECT * FROM sponsorships WHERE id = ?', [id]);
}
/** Live bookings for a campus surface (campus-specific first, then platform-wide), capped, impressions logged. */
export function liveSponsorships(input: { campusId: string | null; surface: SponsorshipRow['surface']; kitCategory?: string | null; limit?: number }, req: Request | null): SponsorshipDto[] {
  const t = nowIso();
  const limit = Math.min(input.limit ?? SPONSOR_FEED_MAX, input.surface === 'kit' ? 1 : SPONSOR_FEED_MAX);
  const where = ["status = 'active'", 'starts_at <= ?', 'ends_at > ?', 'surface = ?', '(campus_id = ? OR campus_id IS NULL)'];
  const params: (string | number)[] = [t, t, input.surface, input.campusId ?? ''];
  if (input.surface === 'kit' && input.kitCategory) { where.push('kit_category = ?'); params.push(input.kitCategory); }
  const rows = q.all<SponsorshipRow>(`SELECT * FROM sponsorships WHERE ${where.join(' AND ')} ORDER BY (campus_id IS NULL) ASC, impressions ASC LIMIT ?`, [...params, limit]);
  if (rows.length) {
    q.run(`UPDATE sponsorships SET impressions = impressions + 1 WHERE id IN (${placeholders(rows.length)})`, rows.map((r) => r.id));
    for (const r of rows) logEvent(req, 'sponsorship.impression', { entityType: 'sponsorship', entityId: r.id, campusId: input.campusId, props: { surface: input.surface } });
  }
  return rows.map(toSponsorshipDto);
}
export function recordSponsorClick(r: SponsorshipRow, req: Request | null): void {
  q.run('UPDATE sponsorships SET clicks = clicks + 1 WHERE id = ?', [r.id]);
  logEvent(req, 'sponsorship.click', { entityType: 'sponsorship', entityId: r.id, campusId: r.campus_id, props: { surface: r.surface } });
}
export function createSponsorship(input: z.infer<typeof SponsorshipInput>, actorId: string): SponsorshipRow {
  if (input.endsAt <= input.startsAt) throw new ApiError('VALIDATION', 'endsAt must be after startsAt', { fields: { endsAt: 'after startsAt' } });
  if (input.surface === 'kit' && !input.kitCategory) throw new ApiError('VALIDATION', 'kitCategory is required for Kit placements', { fields: { kitCategory: 'required' } });
  if (input.surface === 'home_feed' && input.status === 'active' && input.campusId) {
    const live = q.count("SELECT COUNT(*) FROM sponsorships WHERE surface = 'home_feed' AND status = 'active' AND campus_id = ? AND ends_at > ? AND starts_at < ?", [input.campusId, input.startsAt, input.endsAt]);
    if (live >= SPONSOR_FEED_MAX) throw new ApiError('CONFLICT', `At most ${SPONSOR_FEED_MAX} home-feed sponsors per campus at a time`);
  }
  const id = uid();
  const t = nowIso();
  q.insert('sponsorships', {
    id, sponsor_name: input.sponsorName, plan_key: input.planKey ?? null, campus_id: input.campusId ?? null, surface: input.surface, kit_category: input.kitCategory ?? null,
    title: input.title, title_zh: input.titleZh ?? null, body: input.body ?? null, body_zh: input.bodyZh ?? null, url: input.url, logo_upload_id: input.logoUploadId ?? null,
    lat: input.lat ?? null, lng: input.lng ?? null, starts_at: input.startsAt, ends_at: input.endsAt, status: input.status, price_cents: input.priceCents, created_by: actorId, created_at: t, updated_at: t,
  });
  return loadSponsorship(id)!;
}
const PATCH_COLS: Record<string, string> = { sponsorName: 'sponsor_name', planKey: 'plan_key', campusId: 'campus_id', surface: 'surface', kitCategory: 'kit_category', title: 'title', titleZh: 'title_zh', body: 'body', bodyZh: 'body_zh', url: 'url', logoUploadId: 'logo_upload_id', lat: 'lat', lng: 'lng', startsAt: 'starts_at', endsAt: 'ends_at', status: 'status', priceCents: 'price_cents' };
export function patchSponsorship(id: string, patch: z.infer<typeof SponsorshipPatch>): SponsorshipRow {
  const row = loadSponsorship(id);
  if (!row) throw notFound('Sponsorship');
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && PATCH_COLS[k]) set[PATCH_COLS[k]!] = v;
  if (Object.keys(set).length) q.update('sponsorships', { ...set, updated_at: nowIso() } as Record<string, string | number | null>, 'id = ?', [id]);
  return loadSponsorship(id)!;
}
export function addSponsorshipInvoice(r: SponsorshipRow, input: z.infer<typeof SponsorshipInvoiceInput>): SponsorshipInvoiceDto {
  const id = uid();
  const t = nowIso();
  q.run('INSERT INTO sponsorship_invoices (id, sponsorship_id, amount_cents, status, campus_id, issued_at, paid_at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, r.id, input.amountCents, input.paid ? 'paid' : 'open', r.campus_id, t, input.paid ? t : null, input.note ?? null]);
  return toInvoiceDto(q.get('SELECT * FROM sponsorship_invoices WHERE id = ?', [id])!);
}
export function setInvoiceStatus(id: string, status: 'paid' | 'void' | 'open'): SponsorshipInvoiceDto {
  const inv = q.get<Parameters<typeof toInvoiceDto>[0]>('SELECT * FROM sponsorship_invoices WHERE id = ?', [id]);
  if (!inv) throw notFound('Invoice');
  q.run('UPDATE sponsorship_invoices SET status = ?, paid_at = ? WHERE id = ?', [status, status === 'paid' ? inv.paid_at ?? nowIso() : null, id]);
  return toInvoiceDto(q.get('SELECT * FROM sponsorship_invoices WHERE id = ?', [id])!);
}
