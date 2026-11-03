// Scheduled jobs — DATA_MODEL §10. Modules export job functions from server/src/modules/<key>/jobs.ts:
//
//   // modules/<key>/jobs.ts
//   export const jobs = [{ name: 'buddyReminders', everyMs: 15 * 60_000, run: () => { ... } }];   // or `export default [...]`
//
// The scaffold registers them with a dynamic import guarded by existence (loadModuleJobs). Scaffold-owned:
//   registerJob(name, everyMs, fn) ; startJobs() ; stopJobs() ; runJob(name) ; listJobs()
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q } from '../db';
import { logger } from './logger';
import { nowIso, nowMs, HOUR, DAY, MINUTE } from './time';
import { cleanupOldCodes } from './mailbox';
import { config } from '../config';

export type JobFn = () => void | Promise<void>;
export type Job = { name: string; everyMs: number; run: JobFn; lastRunAt: string | null; lastError: string | null; runs: number; timer?: NodeJS.Timeout };
const jobs = new Map<string, Job>();
let started = false;

export function registerJob(name: string, everyMs: number, fn: JobFn): void {
  const existing = jobs.get(name);
  if (existing?.timer) clearInterval(existing.timer);
  const job: Job = { name, everyMs: Math.max(5_000, everyMs), run: fn, lastRunAt: null, lastError: null, runs: 0 };
  jobs.set(name, job);
  if (started) schedule(job);
}
export async function runJob(name: string): Promise<void> {
  const job = jobs.get(name);
  if (!job) throw new Error(`unknown job ${name}`);
  try {
    await job.run();
    job.lastRunAt = nowIso();
    job.lastError = null;
    job.runs++;
  } catch (e) {
    job.lastError = (e as Error).message;
    logger.error({ err: e, job: name }, 'job failed');
  }
}
function schedule(job: Job): void {
  job.timer = setInterval(() => void runJob(job.name), job.everyMs);
  job.timer.unref();
}
export function startJobs(opts: { runNow?: boolean } = {}): void {
  if (started || config.jobsDisabled) return;
  started = true;
  for (const job of jobs.values()) schedule(job);
  if (opts.runNow) for (const name of jobs.keys()) void runJob(name);
  logger.info({ jobs: [...jobs.keys()] }, 'jobs started');
}
export function stopJobs(): void {
  for (const job of jobs.values()) if (job.timer) clearInterval(job.timer);
  started = false;
}
export function listJobs(): Omit<Job, 'run' | 'timer'>[] {
  return [...jobs.values()].map(({ name, everyMs, lastRunAt, lastError, runs }) => ({ name, everyMs, lastRunAt, lastError, runs }));
}

/** Imports modules/<key>/jobs.ts when it exists and registers its exported jobs. */
export async function loadModuleJobs(moduleKeys: string[]): Promise<string[]> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const loaded: string[] = [];
  for (const key of moduleKeys) {
    const file = path.join(here, '..', 'modules', key, 'jobs.ts');
    if (!fs.existsSync(file)) continue;
    try {
      const mod = (await import(/* @vite-ignore */ `../modules/${key}/jobs.ts`)) as { jobs?: unknown; default?: unknown };
      const list = (Array.isArray(mod.jobs) ? mod.jobs : Array.isArray(mod.default) ? mod.default : []) as { name: string; everyMs: number; run: JobFn }[];
      for (const j of list) if (j && typeof j.run === 'function') registerJob(`${key}.${j.name}`, j.everyMs, j.run);
      loaded.push(key);
    } catch (e) {
      logger.error({ err: e, module: key }, 'failed to load module jobs');
    }
  }
  return loaded;
}

// ------------------------------------------------------------------ scaffold jobs
/** Hourly: expire time-boxed content + boost lifecycle + stale orders + escrow timers (pure SQL; modules may refine in their own jobs). */
export function expireContent(): void {
  const t = nowIso();
  const stale = new Date(nowMs() - 30 * MINUTE).toISOString();
  q.tx(() => {
    q.run("UPDATE boosts SET status = 'active', updated_at = ? WHERE status = 'scheduled' AND starts_at <= ?", [t, t]);
    q.run("UPDATE boosts SET status = 'expired', updated_at = ? WHERE status = 'active' AND ends_at <= ?", [t, t]);
    q.run("UPDATE listings SET status = 'expired', updated_at = ? WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?", [t, t]);
    q.run("UPDATE wanted_posts SET status = 'expired', updated_at = ? WHERE status = 'active' AND date(move_in_to, '+14 days') < date(?)", [t, t]);
    q.run("UPDATE market_items SET status = 'expired', updated_at = ? WHERE status = 'active' AND ((expires_at IS NOT NULL AND expires_at <= ?) OR (expires_at IS NULL AND updated_at <= ?))", [t, t, new Date(nowMs() - 60 * DAY).toISOString()]);
    q.run("UPDATE buddy_posts SET status = 'expired', updated_at = ? WHERE status IN ('open','full') AND ((ends_at IS NOT NULL AND ends_at <= ?) OR (ends_at IS NULL AND starts_at IS NOT NULL AND datetime(starts_at, '+6 hours') <= datetime(?)))", [t, t, t]);
    q.run("UPDATE orders SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE status IN ('pending','awaiting_payment') AND created_at <= ?", [t, t, stale]);
    q.run("UPDATE escrows SET status = 'expired', updated_at = ? WHERE status = 'proposed' AND expires_at IS NOT NULL AND expires_at <= ?", [t, t]);
  });
}
/** Nightly: delete old codes, expired geocode cache rows and events older than 180 days. */
export function cleanup(): void {
  cleanupOldCodes(7);
  q.run('DELETE FROM geocode_cache WHERE expires_at IS NOT NULL AND expires_at <= ?', [nowIso()]);
  q.run('DELETE FROM events WHERE created_at < ?', [new Date(nowMs() - 180 * DAY).toISOString()]);
}
export function registerScaffoldJobs(): void {
  registerJob('expireContent', HOUR, expireContent);
  registerJob('cleanup', DAY, cleanup);
}
