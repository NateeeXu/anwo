// /api/meta — API.md §2.7 (scaffold-owned)
import { Router } from 'express';
import { AMENITY_ICONS, Amenity, BUDDY_TYPE_ICONS, BuddyType, CATEGORY_ICONS, ENUMS, MarketCategory } from '@shared/enums';
import { NAME_DISPLAY, NAME_EN, NAME_ZH, TAGLINE_EN, TAGLINE_ZH } from '@shared/brand';
import type { Meta, Plan } from '@shared/types';
import { q, parseJson } from '../../db';
import { config } from '../../config';
import { allCampuses } from '../../lib/campuses';
import { publicFlags } from '../../lib/flags';
import { ok } from '../../lib/http';
import { clientCount } from '../../realtime/hub';

const router = Router();
const startedAt = Date.now();

type PlanRow = {
  id: string; kind: Plan['kind']; key: string; name: string; name_zh: string | null; description: string | null; description_zh: string | null;
  entity_type: Plan['entityType']; tier: Plan['tier']; duration_days: number | null; interval: Plan['interval']; price_cents: number;
  fee_bps: number | null; fee_min_cents: number | null; features_json: string; is_active: number; sort_order: number;
};
export function toPlanDto(r: PlanRow): Plan {
  return {
    id: r.id, kind: r.kind, key: r.key, name: r.name, nameZh: r.name_zh, description: r.description, descriptionZh: r.description_zh, entityType: r.entity_type,
    tier: r.tier, durationDays: r.duration_days, interval: r.interval, priceCents: r.price_cents, feeBps: r.fee_bps, feeMinCents: r.fee_min_cents,
    features: parseJson<string[]>(r.features_json, []), isActive: r.is_active === 1, sortOrder: r.sort_order,
  };
}
export function activePlans(): Plan[] {
  return q.all<PlanRow>('SELECT * FROM pricing_plans WHERE is_active = 1 ORDER BY sort_order, price_cents').map(toPlanDto);
}

router.get('/', (_req, res) => {
  const meta: Meta = {
    enums: ENUMS,
    amenities: Amenity.map((key) => ({ key, icon: AMENITY_ICONS[key] })),
    categories: MarketCategory.map((key) => ({ key, icon: CATEGORY_ICONS[key] })),
    buddyTypes: BuddyType.map((key) => ({ key, icon: BUDDY_TYPE_ICONS[key] })),
    flags: publicFlags(),
    limits: { uploadMaxBytes: config.limits.uploadMaxBytesImage, pageSizeMax: config.limits.pageSizeMax, listingQuotaFree: config.limits.listingQuotaFree },
    plans: activePlans(),
    brand: { name: NAME_EN, nameZh: NAME_ZH, nameDisplay: NAME_DISPLAY, taglineZh: TAGLINE_ZH, taglineEn: TAGLINE_EN },
    campusesCount: allCampuses().length,
    version: config.appVersion,
  };
  res.setHeader('Cache-Control', 'public, max-age=300');
  ok(res, meta);
});

router.get('/health', (_req, res) => {
  let db = false;
  try {
    db = q.scalar<number>('SELECT 1') === 1;
  } catch { /* not ok */ }
  ok(res, { status: db ? 'ok' : 'degraded', db, ws: { clients: clientCount() }, uptimeSec: Math.round((Date.now() - startedAt) / 1000), env: config.nodeEnv, version: config.appVersion });
});

export default router;
