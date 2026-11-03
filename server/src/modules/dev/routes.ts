// /api/dev — API.md §2.9. Mounted only when NODE_ENV !== 'production'.
import { Router } from 'express';
import path from 'node:path';
import { z } from 'zod';
import { EmailSchema } from '@shared/schemas/common';
import { dbPath } from '../../db';
import { loadUser, loadUserByEmail, setCampusCookie, setSessionCookie, signSession } from '../../lib/auth';
import { ApiError } from '../../lib/errors';
import { ok, parseBody, parseQuery } from '../../lib/http';
import { listJobs, runJob } from '../../lib/jobs';
import { clearMailbox, listMailbox } from '../../lib/mailbox';
import { getTimeOffsetSec, nowIso, setTimeOffset } from '../../lib/time';
import { toUserMe } from '../../lib/users';
import { resetRateLimits } from '../../lib/ratelimit';

const router = Router();

router.get('/mailbox', (req, res) => {
  const p = parseQuery(req, z.object({ email: z.string().max(254).optional(), phone: z.string().max(20).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }));
  ok(res, listMailbox(p));
});
router.delete('/mailbox', (_req, res) => {
  clearMailbox();
  ok(res, null);
});

router.post('/login-as', async (req, res) => {
  const body = parseBody(req, z.object({ email: EmailSchema }));
  const user = loadUserByEmail(body.email);
  if (!user) throw new ApiError('NOT_FOUND', 'No such user');
  setSessionCookie(res, await signSession(user));
  setCampusCookie(res, user.campus_id);
  ok(res, toUserMe(loadUser(user.id)!));
});

router.post('/seed', async (req, res) => {
  const body = parseBody(req, z.object({ modules: z.array(z.string()).optional(), force: z.boolean().optional() }));
  const file = path.basename(dbPath());
  if (!/^test-|^scaffold|^e2e/.test(file) && !process.env.ALLOW_SEED_API) throw new ApiError('FORBIDDEN', 'Seeding via API is only allowed on test DBs (server/data/test-*.db)');
  const { runSeeds } = await import('../../db/seed/index');
  const seeded = await runSeeds({ modules: body.modules, force: body.force ?? true });
  ok(res, { seeded });
});

router.post('/time', (req, res) => {
  const body = parseBody(req, z.object({ offsetSec: z.number().int().min(-10 * 365 * 86400).max(10 * 365 * 86400) }));
  setTimeOffset(body.offsetSec);
  ok(res, { now: nowIso(), offsetSec: getTimeOffsetSec() });
});
router.get('/time', (_req, res) => ok(res, { now: nowIso(), offsetSec: getTimeOffsetSec() }));

router.get('/jobs', (_req, res) => ok(res, listJobs()));
router.post('/jobs/:name/run', async (req, res) => {
  await runJob(String(req.params.name));
  ok(res, listJobs().find((j) => j.name === req.params.name) ?? null);
});

router.post('/rate-limits/reset', (_req, res) => {
  resetRateLimits();
  ok(res, null);
});

export default router;
