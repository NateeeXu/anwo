// server/src/modules/buddy/routes.ts — OWNED BY THE `buddy` MODULE AGENT (scaffold stub; replace the body, keep the default export).
// Mounted at /api/buddy by server/src/app.ts. See docs/API.md and docs/SERVER.md.
import { Router } from 'express';
import { ok } from '../../lib/http';

const router = Router();

router.get('/', (_req, res) => {
  ok(res, { module: 'buddy', status: 'stub' });
});

export default router;
