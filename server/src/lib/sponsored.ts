// Sponsored slots — DATA_MODEL §8 rule 3. Reads v_active_boosts; billing owns boosts writes.
//
//   const slots = sponsoredSlotCount(pageSize);                       // 2 per 10 (positions 0 and 5 of each block)
//   const picks = pickSponsored({ entityType: 'listing', campusId, city, state, excludeIds, slots });   // [{ id, tier, boostId }]
//   ...load full cards for picks (sponsored: true, boostTier)...
//   const items = mergeSponsored(organicCards, sponsoredCards, pageSize);   // dedupes organic, inserts at slot positions
//   recordImpressions(picks.map(p => p.boostId), req);                   // boosts.impressions++ and events boost.impression
import type { Request } from 'express';
import { q } from '../db';
import { logEvent } from './events';
import { nowIso } from './time';

export type SponsoredPick = { id: string; tier: 'basic' | 'plus' | 'max'; boostId: string };
export type PickSponsoredInput = {
  entityType: 'listing' | 'market_item' | 'buddy_post';
  campusId?: string | null;
  city?: string | null;
  state?: string | null;
  excludeIds?: string[];
  slots: number;
  tier?: 'max';
  /** nationwide results: only `boosts.nationwide = 1` (Nationwide Spotlight) picks qualify when no campus/city is given */
  nationwide?: boolean;
};

const ENTITY_TABLE: Record<PickSponsoredInput['entityType'], { table: string; status: string; cityCol: string | null }> = {
  listing: { table: 'listings', status: "e.status = 'active' AND e.moderation_status = 'ok'", cityCol: 'city' },
  market_item: { table: 'market_items', status: "e.status IN ('active','reserved') AND e.moderation_status = 'ok'", cityCol: 'city' },
  buddy_post: { table: 'buddy_posts', status: "e.status IN ('open','full') AND e.moderation_status = 'ok'", cityCol: null },
};

/** Slot positions (0-based) inside a page: 0 and 5 of each block of 10 (DATA_MODEL §8). */
export function sponsoredSlotPositions(pageSize: number): number[] {
  const pos: number[] = [];
  for (let base = 0; base < pageSize; base += 10) {
    const remaining = pageSize - base;
    if (remaining >= 10) pos.push(base, base + 5);
    else if (remaining >= 5) pos.push(base); // partial block of 5..9 → one slot (home block of 8 → position 1)
  }
  return pos;
}
export function sponsoredSlotCount(pageSize: number): number {
  return Math.floor(pageSize / 10) * 2 + (pageSize % 10 >= 5 ? 1 : 0);
}

const TIER_RANK = "CASE b.tier WHEN 'max' THEN 3 WHEN 'plus' THEN 2 ELSE 1 END";

export function pickSponsored(input: PickSponsoredInput): SponsoredPick[] {
  if (input.slots <= 0) return [];
  const meta = ENTITY_TABLE[input.entityType];
  // paused boosts (2+ open reports, billing job) never show; columns from migration 18_billing.sql
  const where: string[] = ['b.entity_type = ?', meta.status, 'b.paused_at IS NULL'];
  const params: (string | number)[] = [input.entityType];
  if (input.tier) { where.push('b.tier = ?'); params.push(input.tier); }
  // boosted entities only appear within their own campus, or in nationwide results for their city;
  // Nationwide Spotlight boosts (b.nationwide = 1) also appear in any nationwide result
  if (input.campusId) { where.push('e.campus_id = ?'); params.push(input.campusId); }
  else if (input.city && input.state && meta.cityCol) { where.push(`((e.${meta.cityCol} = ? AND e.state = ?) OR b.nationwide = 1)`); params.push(input.city, input.state); }
  else if (input.nationwide) where.push('b.nationwide = 1');
  else return [];
  if (input.excludeIds?.length) { where.push(`b.entity_id NOT IN (${input.excludeIds.map(() => '?').join(', ')})`); params.push(...input.excludeIds); }
  const rows = q.all<{ id: string; tier: SponsoredPick['tier']; boost_id: string }>(
    `SELECT b.entity_id AS id, b.tier, b.id AS boost_id
       FROM v_active_boosts b JOIN ${meta.table} e ON e.id = b.entity_id
      WHERE ${where.join(' AND ')}
      GROUP BY b.entity_id
      ORDER BY ${TIER_RANK} DESC, b.impressions ASC, random()
      LIMIT ?`,
    [...params, input.slots],
  );
  return rows.map((r) => ({ id: r.id, tier: r.tier, boostId: r.boost_id }));
}

/** Inserts sponsored cards at slot positions; organic duplicates of sponsored ids are dropped. */
export function mergeSponsored<T extends { id: string }>(organic: T[], sponsored: T[], pageSize: number): T[] {
  if (!sponsored.length) return organic.slice(0, pageSize);
  const sponsoredIds = new Set(sponsored.map((s) => s.id));
  const pool = organic.filter((o) => !sponsoredIds.has(o.id));
  const positions = sponsoredSlotPositions(pageSize);
  const out: T[] = [];
  let si = 0;
  let oi = 0;
  for (let i = 0; i < pageSize; i++) {
    if (positions.includes(i) && si < sponsored.length) out.push(sponsored[si++]!);
    else if (oi < pool.length) out.push(pool[oi++]!);
    else break; // never more sponsored items than slots
  }
  return out;
}

export function recordImpressions(boostIds: string[], req: Request | null = null): void {
  if (!boostIds.length) return;
  const ids = [...new Set(boostIds)];
  q.run(`UPDATE boosts SET impressions = impressions + 1, updated_at = ? WHERE id IN (${ids.map(() => '?').join(', ')})`, [nowIso(), ...ids]);
  for (const id of ids) logEvent(req, 'boost.impression', { entityType: 'boost', entityId: id });
}
export function recordClick(boostId: string, req: Request | null = null): void {
  q.run('UPDATE boosts SET clicks = clicks + 1, updated_at = ? WHERE id = ?', [nowIso(), boostId]);
  logEvent(req, 'boost.click', { entityType: 'boost', entityId: boostId });
}

/** Active boost (tier) for an entity, if any. */
export function activeBoostFor(entityType: PickSponsoredInput['entityType'], entityId: string): { id: string; tier: SponsoredPick['tier']; endsAt: string } | null {
  const r = q.get<{ id: string; tier: SponsoredPick['tier']; ends_at: string }>('SELECT id, tier, ends_at FROM v_active_boosts WHERE entity_type = ? AND entity_id = ? ORDER BY ends_at DESC LIMIT 1', [entityType, entityId]);
  return r ? { id: r.id, tier: r.tier, endsAt: r.ends_at } : null;
}
