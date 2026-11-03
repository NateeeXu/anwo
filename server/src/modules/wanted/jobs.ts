// server/src/modules/wanted/jobs.ts — OWNED BY THE `wanted` MODULE AGENT. Auto-registered by lib/jobs as 'wanted.<name>'.
// recomputeMatches: every 10 minutes re-scores every active wanted post against the current listing pool
// (new rows ≥ 70 produce one batched `match.new` notification per post). Run on demand: POST /api/dev/jobs/wanted.recomputeMatches/run
import { recomputeAll } from './service';

export const jobs = [
  { name: 'recomputeMatches', everyMs: 10 * 60_000, run: () => { recomputeAll({ notify: true }); } },
];
