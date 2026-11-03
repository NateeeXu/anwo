// server/src/modules/wanted/routes.ts — OWNED BY THE `wanted` MODULE AGENT (scaffold stub; replace the body, keep the default export).
// Mounted at /api/wanted by server/src/app.ts. See docs/API.md and docs/SERVER.md.
import { Router } from 'express';
import { ok } from '../../lib/http';

const router = Router();

router.get('/', (_req, res) => {
  ok(res, { module: 'wanted', status: 'stub' });
});

export default router;
