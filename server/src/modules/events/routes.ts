// /api/events — analytics beacon, API.md §2.8 (scaffold-owned). Accepts JSON or a sendBeacon text body.
import { Router } from 'express';
import { z } from 'zod';
import { logEvent, campusIdOf } from '../../lib/events';
import { ok, parse } from '../../lib/http';
import { rateLimit } from '../../lib/ratelimit';
import { ApiError } from '../../lib/errors';
import { nowMs } from '../../lib/time';

const router = Router();

/** Event types the server logs itself (they feed owner analytics, boost reports, revenue funnels and the verification
 *  timeline). The anonymous beacon must not be able to forge them; client duplicates are dropped. */
const SERVER_OWNED: RegExp[] = [
  /^(listing|item|buddy)\.view$/, /^boost\./, /^checkout\./, /^affiliate\./, /^escrow\./, /^wallet\./, /^pro\./, /^order\./, /^promo\./,
  /^partner\./, /^sponsorship\./, /^referral\.(qualified|rewarded)$/, /^pricing\.view$/, /^kit\.card_view$/, /^login$/, /^signup$/,
  /^verify\.(?!.*_ui$)/,
];
export function clientMayLog(type: string): boolean {
  return !SERVER_OWNED.some((re) => re.test(type));
}
const TS_SKEW_MS = 5 * 60_000;

const Body = z.object({
  events: z.array(z.object({
    type: z.string().min(1).max(60),
    entityType: z.string().max(40).optional(),
    entityId: z.string().max(128).optional(),
    props: z.record(z.unknown()).optional(),
    path: z.string().max(300).optional(),
    ts: z.string().datetime({ offset: true }).optional(),
  })).max(50),
});

router.post('/', rateLimit({ name: 'events', limit: 120, windowMs: 60_000 }), (req, res) => {
  let raw: unknown = req.body;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new ApiError('BAD_REQUEST', 'Beacon body must be JSON');
    }
  }
  const body = parse(Body, raw);
  const campusId = campusIdOf(req);
  let accepted = 0;
  for (const e of body.events) {
    if (e.props && JSON.stringify(e.props).length > 1024) continue;
    if (!clientMayLog(e.type)) continue;
    // client clocks are only trusted within ±5 min (no backdated events)
    const ts = e.ts && Math.abs(Date.parse(e.ts) - nowMs()) <= TS_SKEW_MS ? e.ts : undefined;
    logEvent(req, e.type, { entityType: e.entityType, entityId: e.entityId, props: e.props, path: e.path, ts, campusId });
    accepted++;
  }
  if (req.query.beacon === '1') {
    res.status(204).end();
    return;
  }
  ok(res, { accepted });
});

export default router;
