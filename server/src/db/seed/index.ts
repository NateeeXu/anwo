// Seed runner. Order: core → listings → wanted → chat → verify → map → shuttle → market → buddy → billing → admin.
// Idempotent via seed_meta (key = module, version = the module's exported `version`); `--force` re-runs.
//
//   npm run seed                                    # everything (uses DB_PATH)
//   npm run seed -- --modules core,listings         # subset
//   npm run seed -- --force                         # re-run even when versions match
//   DB_PATH=server/data/test-listings.db npm run seed -- --modules core,listings
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { config } from '../../config';
import { getDb, openDb, q } from '../index';
import { logger } from '../../lib/logger';
import { nowIso } from '../../lib/time';

export const SEED_ORDER = ['core', 'listings', 'wanted', 'chat', 'verify', 'map', 'shuttle', 'market', 'buddy', 'billing', 'admin'] as const;
export type SeedKey = (typeof SEED_ORDER)[number];
export type SeedModule = { default: (db: DatabaseSync) => Promise<void> | void; version?: number };

async function loadSeed(key: SeedKey): Promise<SeedModule> {
  switch (key) {
    case 'core': return import('./core');
    case 'listings': return import('./listings');
    case 'wanted': return import('./wanted');
    case 'chat': return import('./chat');
    case 'verify': return import('./verify');
    case 'map': return import('./map');
    case 'shuttle': return import('./shuttle');
    case 'market': return import('./market');
    case 'buddy': return import('./buddy');
    case 'billing': return import('./billing');
    case 'admin': return import('./admin');
  }
}

export function seedVersion(key: string): number | null {
  return q.get<{ version: number }>('SELECT version FROM seed_meta WHERE key = ?', [key])?.version ?? null;
}
export function recordSeed(key: string, version: number, value: Record<string, unknown> = {}): void {
  q.run('INSERT INTO seed_meta (key, version, value_json, seeded_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET version = excluded.version, value_json = excluded.value_json, seeded_at = excluded.seeded_at', [key, version, JSON.stringify(value), nowIso()]);
}

/** Runs the requested seeds (default: all, in order). Returns the keys that actually ran. */
export async function runSeeds(opts: { modules?: string[]; force?: boolean } = {}): Promise<string[]> {
  openDb(config.dbPath);
  const wanted = opts.modules?.length ? opts.modules : [...SEED_ORDER];
  const unknown = wanted.filter((m) => !(SEED_ORDER as readonly string[]).includes(m));
  if (unknown.length) throw new Error(`unknown seed module(s): ${unknown.join(', ')}`);
  const ran: string[] = [];
  for (const key of SEED_ORDER) {
    if (!wanted.includes(key)) continue;
    const mod = await loadSeed(key);
    const version = mod.version ?? 0;
    const current = seedVersion(key);
    if (version === 0 && typeof mod.default === 'function' && !opts.force && current !== null) {
      logger.info({ seed: key }, 'seed is a stub (version 0) — skipped');
      continue;
    }
    if (!opts.force && current !== null && current >= version) {
      logger.info({ seed: key, version }, 'seed already applied — skipped');
      continue;
    }
    const t0 = Date.now();
    await mod.default(getDb());
    recordSeed(key, version);
    ran.push(key);
    logger.info({ seed: key, version, ms: Date.now() - t0 }, 'seed applied');
  }
  return ran;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const modulesArg = args.find((a) => a.startsWith('--modules='))?.slice('--modules='.length) ?? (args.includes('--modules') ? args[args.indexOf('--modules') + 1] : undefined);
  const force = args.includes('--force');
  runSeeds({ modules: modulesArg?.split(',').map((s) => s.trim()).filter(Boolean), force })
    .then((ran) => {
      logger.info({ ran, db: config.dbPath }, 'seed finished');
      process.exit(0);
    })
    .catch((e) => {
      logger.error({ err: e }, 'seed failed');
      process.exit(1);
    });
}
