// Feature flags (table feature_flags; admin module writes, everyone reads). A missing row counts as ENABLED.
//
//   if (!isEnabled('escrow.enabled', campusId)) fail('FEATURE_DISABLED');
//   router.post('/escrows', requireFlag('escrow.enabled'), ...)   // in lib/auth.ts
import { q, parseJson } from '../db';
import type { FeatureFlag } from '@shared/types';

type FlagRow = {
  key: string;
  enabled: number;
  value_json: string;
  description: string | null;
  campus_ids_json: string;
  updated_by: string | null;
  updated_at: string;
};

let cache: Map<string, FlagRow> | null = null;
let cachedAt = 0;
const TTL = 30_000;

function load(): Map<string, FlagRow> {
  if (cache && Date.now() - cachedAt < TTL) return cache;
  cache = new Map(q.all<FlagRow>('SELECT * FROM feature_flags').map((r) => [r.key, r]));
  cachedAt = Date.now();
  return cache;
}
export function invalidateFlags(): void {
  cache = null;
}

export function toFlagDto(r: FlagRow): FeatureFlag {
  return {
    key: r.key,
    enabled: r.enabled === 1,
    value: parseJson(r.value_json, null),
    description: r.description,
    campusIds: parseJson<string[]>(r.campus_ids_json, []),
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  };
}

/** Enabled when no row exists, or row.enabled=1 and (campus_ids empty or contains campusId). */
export function isEnabled(key: string, campusId?: string | null): boolean {
  const r = load().get(key);
  if (!r) return true;
  if (r.enabled !== 1) return false;
  const ids = parseJson<string[]>(r.campus_ids_json, []);
  if (ids.length === 0 || !campusId) return true;
  return ids.includes(campusId);
}
export function getFlag(key: string): FeatureFlag | null {
  const r = load().get(key);
  return r ? toFlagDto(r) : null;
}
export function flagValue<T = unknown>(key: string, fallback: T): T {
  const r = load().get(key);
  if (!r) return fallback;
  const v = parseJson<T | null>(r.value_json, null);
  return v === null ? fallback : v;
}
export function allFlags(): FeatureFlag[] {
  return [...load().values()].map(toFlagDto);
}
/** Public map for /api/meta and the ws `ready` frame: key -> enabled (maintenance_banner -> value). */
export function publicFlags(): Record<string, boolean | unknown> {
  const out: Record<string, boolean | unknown> = {};
  for (const r of load().values()) {
    const v = parseJson<unknown>(r.value_json, null);
    out[r.key] = r.enabled === 1 && v !== null && typeof v === 'object' ? v : r.enabled === 1;
  }
  return out;
}

export const DEFAULT_FLAGS: { key: string; enabled: boolean; value?: unknown; description: string }[] = [
  { key: 'boosts.enabled', enabled: true, description: 'Boost purchases (featured placement)' },
  { key: 'pro.enabled', enabled: true, description: 'Landlord Pro subscriptions' },
  { key: 'escrow.enabled', enabled: true, description: 'Deposit escrow / secure payment' },
  { key: 'affiliate.enabled', enabled: true, description: 'Newcomer Kit affiliate partners' },
  { key: 'nationwide.enabled', enabled: true, description: 'Nationwide scope on browse pages' },
  { key: 'scam_banner.enabled', enabled: true, description: 'Scam warning banner on new conversations' },
  { key: 'verified_only_default', enabled: false, description: 'New accounts default to verified-only messaging' },
  { key: 'maintenance_banner', enabled: false, value: null, description: 'Site-wide banner { title, titleZh, body?, bodyZh?, severity }' },
];
/** Inserts missing default rows (idempotent). Called by the core seed and on boot. */
export function ensureDefaultFlags(): void {
  for (const f of DEFAULT_FLAGS) {
    q.run(
      'INSERT OR IGNORE INTO feature_flags (key, enabled, value_json, description) VALUES (?, ?, ?, ?)',
      [f.key, f.enabled ? 1 : 0, JSON.stringify(f.value ?? null), f.description],
    );
  }
  invalidateFlags();
}
