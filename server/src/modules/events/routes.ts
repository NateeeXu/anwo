// /api/events — analytics beacon, API.md §2.8 (scaffold-owned). Accepts JSON or a sendBeacon text body.
import { Router } from 'express';
import { z } from 'zod';
import { logEvent, campusIdOf } from '../../lib/events';
import { ok, parse } from '../../lib/http';
import { rateLimit } from '../../lib/ratelimit';
import { ApiError } from '../../lib/errors';

const router = Router();

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
    logEvent(req, e.type, { entityType: e.entityType, entityId: e.entityId, props: e.props, path: e.path, ts: e.ts, campusId });
    accepted++;
  }
  if (req.query.beacon === '1') {
    res.status(204).end();
    return;
  }
  ok(res, { accepted });
});

export default router;
