// server/src/modules/wanted/service.ts — OWNED BY THE `wanted` MODULE AGENT.
// Stable exports consumed by listings (publish/update → recomputeForListing), the scaffold digest job (buildDigest) and
// the wanted routes. Matching semantics: DATA_MODEL §7; state machines §6.3 / §6.12.
import type { Area, ListingCard, Match, Wanted, WantedCard } from '@shared/types';
import { q, parseJson, placeholders, uid } from '../../db';
import { bboxAround } from '../../lib/geo';
import { getCampus } from '../../lib/campuses';
import { listingCards, toArea, toWantedCard, wantedCards, type ListingCardRow, type WantedCardRow } from '../../lib/cards';
import { loadUserPublic } from '../../lib/users';
import { notify } from '../../lib/notify';
import { logger } from '../../lib/logger';
import { nowIso, nowMs, DAY } from '../../lib/time';
import {
  addDays, scoreMatch, MATCH_DIGEST_MIN, MATCH_NOTIFY_MIN, MATCH_PERSIST_MIN, MATCH_SHOW_MIN,
  type AreaForScore, type CampusForScore, type ListingForScore, type ScoreResult, type WantedForScore,
} from './matching';

export { scoreMatch, MATCH_PERSIST_MIN, MATCH_SHOW_MIN, MATCH_NOTIFY_MIN, MATCH_DIGEST_MIN } from './matching';

// ------------------------------------------------------------------ row types
export type WantedRow = WantedCardRow & WantedForScore & {
  description: string;
  nice_to_haves_json: string;
  moderation_status: 'ok' | 'flagged' | 'hidden';
  offer_count: number;
  view_count: number;
  matches_computed_at: string | null;
  expires_at: string | null;
  updated_at: string;
};
export type AreaRow = { id: string; wanted_id: string; label: string; kind: Area['kind']; lat: number | null; lng: number | null; radius_m: number | null; city: string | null; state: string | null; campus_id: string | null; sort_order: number };
export type MatchRow = {
  id: string; wanted_id: string; listing_id: string; score: number; breakdown_json: string;
  status: Match['status']; offered_by_host: number; conversation_id: string | null; computed_at: string; updated_at: string;
};
type CandidateRow = ListingCardRow & ListingForScore & { owner_trust_level: number; moderation_status: string };

export const CANDIDATE_LIMIT = 300;
export const PROTECTED_STATUSES: ReadonlySet<string> = new Set(['offered', 'contacted', 'dismissed']);

// ------------------------------------------------------------------ loaders
export function loadWanted(id: string): WantedRow | undefined {
  return q.get<WantedRow>('SELECT * FROM wanted_posts WHERE id = ?', [id]);
}
export function loadAreas(wantedId: string): AreaRow[] {
  return q.all<AreaRow>('SELECT * FROM wanted_areas WHERE wanted_id = ? ORDER BY sort_order, rowid', [wantedId]);
}
export function loadMatch(wantedId: string, listingId: string): MatchRow | undefined {
  return q.get<MatchRow>('SELECT * FROM matches WHERE wanted_id = ? AND listing_id = ?', [wantedId, listingId]);
}

function campusForScore(id: string | null | undefined): CampusForScore | null {
  const c = getCampus(id);
  return c ? { id: c.id, lat: c.lat, lng: c.lng, defaultRadiusM: c.defaultRadiusM, city: c.city, state: c.state } : null;
}
function areasForScore(areas: AreaRow[]): AreaForScore[] {
  return areas.map((a) => {
    const out: AreaForScore = { kind: a.kind, lat: a.lat, lng: a.lng, radius_m: a.radius_m, city: a.city, state: a.state, campus_id: a.campus_id };
    if (a.kind === 'campus' && a.campus_id) {
      const c = getCampus(a.campus_id);
      if (c) { out.campusLat = c.lat; out.campusLng = c.lng; out.campusRadiusM = c.defaultRadiusM; }
    }
    return out;
  });
}

// ------------------------------------------------------------------ DTOs
export function toWantedDto(r: WantedRow, opts: { areas?: AreaRow[]; viewerId?: string | null } = {}): Wanted {
  const areas = (opts.areas ?? loadAreas(r.id)).map(toArea);
  const card = toWantedCard(r, { owner: loadUserPublic(r.user_id), areas });
  const dto: Wanted = {
    ...card,
    description: r.description,
    flexibleDays: r.flexible_days,
    genderPref: r.gender_pref as Wanted['genderPref'],
    hasPets: r.has_pets === 1,
    needsParking: r.needs_parking === 1,
    propertyTypes: parseJson<string[]>(r.property_types_json, []),
    mustHaves: parseJson<string[]>(r.must_haves_json, []),
    niceToHaves: parseJson<string[]>(r.nice_to_haves_json, []),
    offerCount: r.offer_count,
    viewCount: r.view_count,
    expiresAt: r.expires_at,
  };
  if (opts.viewerId && opts.viewerId !== r.user_id) {
    const mine = q.get<{ id: string; conversation_id: string | null }>(
      'SELECT m.id, m.conversation_id FROM matches m JOIN listings l ON l.id = m.listing_id WHERE m.wanted_id = ? AND m.offered_by_host = 1 AND l.owner_id = ? ORDER BY m.updated_at DESC LIMIT 1',
      [r.id, opts.viewerId],
    );
    if (mine) dto.myOffer = { matchId: mine.id, conversationId: mine.conversation_id };
  }
  return dto;
}

export function toMatchDto(m: MatchRow, extra: { listing?: ListingCard; wanted?: WantedCard } = {}): Match {
  const dto: Match = {
    id: m.id, wantedId: m.wanted_id, listingId: m.listing_id, score: m.score,
    breakdown: parseJson<Record<string, number>>(m.breakdown_json, {}), status: m.status, offeredByHost: m.offered_by_host === 1,
    conversationId: m.conversation_id, computedAt: m.computed_at,
  };
  if (extra.listing) dto.listing = extra.listing;
  if (extra.wanted) dto.wanted = extra.wanted;
  return dto;
}

/** ListingCards keyed by id (viewer-aware: saves, exact coords for owner). */
export function listingCardMap(ids: string[], viewerId?: string | null): Map<string, ListingCard> {
  const uniq = [...new Set(ids)];
  const out = new Map<string, ListingCard>();
  if (!uniq.length) return out;
  const rows = q.all<ListingCardRow>(`SELECT l.* FROM listings l WHERE l.id IN (${placeholders(uniq.length)})`, uniq);
  for (const c of listingCards(rows, { viewerId })) out.set(c.id, c);
  return out;
}
export function wantedCardMap(ids: string[]): Map<string, WantedCard> {
  const uniq = [...new Set(ids)];
  const out = new Map<string, WantedCard>();
  if (!uniq.length) return out;
  const rows = q.all<WantedCardRow>(`SELECT * FROM wanted_posts WHERE id IN (${placeholders(uniq.length)})`, uniq);
  for (const c of wantedCards(rows)) out.set(c.id, c);
  return out;
}

// ------------------------------------------------------------------ candidate prefilter (DATA_MODEL §7)
function areaClauses(areas: AreaRow[], alias = 'l'): { sql: string[]; params: (string | number)[] } {
  const sql: string[] = [];
  const params: (string | number)[] = [];
  for (const a of areas) {
    if (a.kind === 'circle' && a.lat != null && a.lng != null) {
      const b = bboxAround(a.lat, a.lng, (a.radius_m ?? 2000) * 2); // the decay zone (d ≤ 2r) still scores
      sql.push(`(${alias}.lat BETWEEN ? AND ? AND ${alias}.lng BETWEEN ? AND ?)`);
      params.push(b.minLat, b.maxLat, b.minLng, b.maxLng);
    } else if (a.kind === 'city' && a.city && a.state) {
      sql.push(`(${alias}.city = ? AND ${alias}.state = ?)`);
      params.push(a.city, a.state);
    } else if (a.kind === 'campus' && a.campus_id) {
      sql.push(`${alias}.campus_id = ?`);
      params.push(a.campus_id);
    }
  }
  return { sql, params };
}

export function candidateListings(w: WantedRow, areas: AreaRow[]): CandidateRow[] {
  const loc = areaClauses(areas);
  const locationSql = w.scope === 'nationwide' ? loc.sql : ['l.campus_id = ?', ...loc.sql];
  const locationParams = w.scope === 'nationwide' ? loc.params : [w.campus_id, ...loc.params];
  if (!locationSql.length) return [];
  const latest = addDays(w.move_in_to, w.flexible_days ?? 0);
  return q.all<CandidateRow>(
    `SELECT l.*, u.trust_level AS owner_trust_level FROM listings l JOIN users u ON u.id = l.owner_id
     WHERE l.status = 'active' AND l.moderation_status = 'ok' AND u.banned = 0 AND u.deleted_at IS NULL
       AND l.price_cents <= ? AND l.available_from <= ? AND (l.available_to IS NULL OR l.available_to >= ?)
       AND l.owner_id <> ?
       AND (${locationSql.join(' OR ')})
     ORDER BY l.published_at DESC LIMIT ${CANDIDATE_LIMIT}`,
    [Math.floor(w.budget_max_cents * 1.25), latest, w.move_in_from, w.user_id, ...locationParams],
  );
}

/** Reverse prefilter: active wanted posts a listing could match (for recomputeForListing). */
function candidateWanted(l: CandidateRow): WantedRow[] {
  return q.all<WantedRow>(
    `SELECT w.* FROM wanted_posts w JOIN users u ON u.id = w.user_id
     WHERE w.status = 'active' AND w.moderation_status = 'ok' AND u.banned = 0 AND u.deleted_at IS NULL
       AND w.budget_max_cents * 1.25 >= ? AND date(w.move_in_to, '+' || w.flexible_days || ' days') >= date(?)
       AND (? IS NULL OR ? >= w.move_in_from) AND w.user_id <> ?
       AND ((w.scope = 'campus' AND w.campus_id = ?) OR EXISTS (
         SELECT 1 FROM wanted_areas a WHERE a.wanted_id = w.id AND (
           (a.kind = 'campus' AND a.campus_id = ?)
           OR (a.kind = 'city' AND a.city = ? COLLATE NOCASE AND a.state = ? COLLATE NOCASE)
           OR (a.kind = 'circle' AND a.lat IS NOT NULL AND abs(a.lat - ?) * 111320.0 <= a.radius_m * 2
               AND abs(a.lng - ?) * 111320.0 * cos(radians(?)) <= a.radius_m * 2)
         )))
     LIMIT ${CANDIDATE_LIMIT}`,
    [l.price_cents, l.available_from, l.available_to, l.available_to, l.owner_id, l.campus_id, l.campus_id, l.city, l.state, l.lat, l.lng, l.lat],
  );
}

function blockedPairs(userId: string): Set<string> {
  const out = new Set<string>();
  for (const b of q.all<{ blocker_id: string; blocked_id: string }>('SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = ? OR blocked_id = ?', [userId, userId])) {
    out.add(b.blocker_id === userId ? b.blocked_id : b.blocker_id);
  }
  return out;
}
function amenitiesFor(listingIds: string[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (!listingIds.length) return out;
  for (const r of q.all<{ listing_id: string; amenity: string }>(`SELECT listing_id, amenity FROM listing_amenities WHERE listing_id IN (${placeholders(listingIds.length)})`, listingIds)) {
    if (!out.has(r.listing_id)) out.set(r.listing_id, new Set());
    out.get(r.listing_id)!.add(r.amenity);
  }
  return out;
}

// ------------------------------------------------------------------ persistence
type UpsertOutcome = { inserted: boolean; score: number; row: MatchRow | null };

/** Insert / update / delete the (wanted, listing) row per §6.12 (never downgrades protected statuses). */
function upsertMatch(w: WantedRow, listingId: string, result: ScoreResult, existing: MatchRow | undefined, t: string): UpsertOutcome {
  const keep = result.score >= MATCH_PERSIST_MIN && !result.hardFail;
  if (existing) {
    if (!keep && !PROTECTED_STATUSES.has(existing.status)) {
      q.run('DELETE FROM matches WHERE id = ?', [existing.id]);
      return { inserted: false, score: result.score, row: null };
    }
    if (existing.score !== result.score || existing.breakdown_json !== JSON.stringify(result.breakdown)) {
      q.run('UPDATE matches SET score = ?, breakdown_json = ?, computed_at = ?, updated_at = ? WHERE id = ?', [result.score, JSON.stringify(result.breakdown), t, t, existing.id]);
    } else {
      q.run('UPDATE matches SET computed_at = ? WHERE id = ?', [t, existing.id]);
    }
    return { inserted: false, score: result.score, row: { ...existing, score: result.score, breakdown_json: JSON.stringify(result.breakdown), computed_at: t } };
  }
  if (!keep) return { inserted: false, score: result.score, row: null };
  const row: MatchRow = {
    id: uid(), wanted_id: w.id, listing_id: listingId, score: result.score, breakdown_json: JSON.stringify(result.breakdown),
    status: 'new', offered_by_host: 0, conversation_id: null, computed_at: t, updated_at: t,
  };
  q.insert('matches', row as unknown as Record<string, string | number | null>);
  return { inserted: true, score: result.score, row };
}

export type RecomputeResult = { count: number; newStrong: { listingId: string; score: number }[] };
export type NotifyMode = 'none' | 'summary' | 'each';

/** Scores every candidate listing for a wanted post and syncs the `matches` rows. */
export function recomputeForWanted(wantedId: string, opts: { notify?: NotifyMode } = {}): RecomputeResult {
  const w = loadWanted(wantedId);
  if (!w) return { count: 0, newStrong: [] };
  const areas = loadAreas(w.id);
  const campus = campusForScore(w.campus_id);
  const scoreAreas = areasForScore(areas);
  const candidates = w.status === 'active' && w.moderation_status === 'ok' ? candidateListings(w, areas) : [];
  const blocked = blockedPairs(w.user_id);
  const amenities = amenitiesFor(candidates.map((c) => c.id));
  const existing = new Map<string, MatchRow>();
  for (const m of q.all<MatchRow>('SELECT * FROM matches WHERE wanted_id = ?', [w.id])) existing.set(m.listing_id, m);
  const t = nowIso();
  const newStrong: RecomputeResult['newStrong'] = [];
  let count = 0;
  q.tx(() => {
    const seen = new Set<string>();
    for (const l of candidates) {
      seen.add(l.id);
      const result = scoreMatch(w, scoreAreas, l, campus, { amenities: amenities.get(l.id) ?? new Set(), ownerTrustLevel: l.owner_trust_level, blocked: blocked.has(l.owner_id) });
      const out = upsertMatch(w, l.id, result, existing.get(l.id), t);
      if (out.row) count++;
      if (out.inserted && out.score >= MATCH_NOTIFY_MIN) newStrong.push({ listingId: l.id, score: out.score });
    }
    // rows whose listing left the candidate set: drop unless protected
    for (const [listingId, m] of existing) {
      if (seen.has(listingId)) continue;
      if (PROTECTED_STATUSES.has(m.status)) { count++; continue; }
      q.run('DELETE FROM matches WHERE id = ?', [m.id]);
    }
    q.run('UPDATE wanted_posts SET matches_computed_at = ? WHERE id = ?', [t, w.id]);
  });
  if (opts.notify && opts.notify !== 'none' && newStrong.length) notifyNewMatches(w, newStrong, opts.notify);
  return { count, newStrong };
}

function notifyNewMatches(w: WantedRow, strong: RecomputeResult['newStrong'], mode: NotifyMode): void {
  if (mode === 'summary' || strong.length > 1) {
    const n = strong.length;
    notify(w.user_id, 'match.new', {
      title: { zh: `「${w.title}」有 ${n} 个新匹配房源`, en: `${n} new ${n === 1 ? 'match' : 'matches'} for “${w.title}”` },
      body: { zh: '按匹配度排好了，去看看吧。', en: 'Ranked by match score — take a look.' },
      link: `/wanted/${w.id}/matches`, entityType: 'wanted', entityId: w.id, data: { count: n, top: strong[0]?.score ?? 0 },
    });
    return;
  }
  for (const s of strong) {
    const l = q.get<{ title: string; price_cents: number }>('SELECT title, price_cents FROM listings WHERE id = ?', [s.listingId]);
    notify(w.user_id, 'match.new', {
      title: { zh: `新房源匹配度 ${s.score}%：${l?.title ?? ''}`, en: `${s.score}% match: ${l?.title ?? 'a new listing'}` },
      body: { zh: `与你的求租「${w.title}」高度匹配。`, en: `A strong match for your request “${w.title}”.` },
      link: `/wanted/${w.id}/matches`, entityType: 'wanted', entityId: w.id, data: { listingId: s.listingId, score: s.score },
    });
  }
}

/** Called by listings on publish / update (price, dates, location, amenities). Returns the number of wanted posts touched. */
export function recomputeForListing(listingId: string): number {
  const l = q.get<CandidateRow>('SELECT l.*, u.trust_level AS owner_trust_level FROM listings l JOIN users u ON u.id = l.owner_id WHERE l.id = ?', [listingId]);
  if (!l) return 0;
  const t = nowIso();
  if (l.status !== 'active' || l.moderation_status !== 'ok') {
    // listing left the pool: drop fresh rows, keep offered/contacted/dismissed (they carry conversations)
    const res = q.run("DELETE FROM matches WHERE listing_id = ? AND status IN ('new','seen')", [listingId]);
    return res.changes;
  }
  const amenities = amenitiesFor([l.id]).get(l.id) ?? new Set<string>();
  const existingRows = new Map<string, MatchRow>();
  for (const m of q.all<MatchRow>('SELECT * FROM matches WHERE listing_id = ?', [listingId])) existingRows.set(m.wanted_id, m);
  const posts = candidateWanted(l);
  const touched = new Set<string>();
  let n = 0;
  q.tx(() => {
    for (const w of posts) {
      touched.add(w.id);
      const areas = loadAreas(w.id);
      const result = scoreMatch(w, areasForScore(areas), l, campusForScore(w.campus_id), {
        amenities, ownerTrustLevel: l.owner_trust_level, blocked: blockedPairs(w.user_id).has(l.owner_id),
      });
      const out = upsertMatch(w, l.id, result, existingRows.get(w.id), t);
      if (out.row) n++;
      if (out.inserted && out.score >= MATCH_NOTIFY_MIN) notifyNewMatches(w, [{ listingId: l.id, score: out.score }], 'each');
    }
    for (const [wantedId, m] of existingRows) {
      if (touched.has(wantedId) || PROTECTED_STATUSES.has(m.status)) continue;
      q.run('DELETE FROM matches WHERE id = ?', [m.id]);
    }
  });
  return n;
}

/** Host-side panel: seekers whose posts match this listing (score ≥ 50). */
export function seekersForListing(listingId: string, opts: { minScore?: number; limit?: number } = {}): Match[] {
  const min = opts.minScore ?? MATCH_SHOW_MIN;
  const rows = q.all<MatchRow>(
    `SELECT m.* FROM matches m JOIN wanted_posts w ON w.id = m.wanted_id
     WHERE m.listing_id = ? AND m.score >= ? AND w.status = 'active' AND w.moderation_status = 'ok' AND m.status <> 'dismissed'
     ORDER BY m.score DESC, w.created_at DESC LIMIT ?`,
    [listingId, min, opts.limit ?? 50],
  );
  const cards = wantedCardMap(rows.map((r) => r.wanted_id));
  return rows.map((m) => toMatchDto(m, { wanted: cards.get(m.wanted_id) }));
}

/** Top matches for all of a user's active posts ("Matches for you" panel). */
export function matchesForUser(userId: string, opts: { limit?: number; viewerId?: string | null } = {}): { wanted: WantedCard; matches: Match[] }[] {
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 20);
  const posts = q.all<WantedCardRow>("SELECT * FROM wanted_posts WHERE user_id = ? AND status = 'active' AND moderation_status <> 'hidden' ORDER BY created_at DESC", [userId]);
  if (!posts.length) return [];
  const cards = wantedCards(posts);
  const out: { wanted: WantedCard; matches: Match[] }[] = [];
  for (const card of cards) {
    const rows = q.all<MatchRow>(
      `SELECT m.* FROM matches m JOIN listings l ON l.id = m.listing_id
       WHERE m.wanted_id = ? AND m.score >= ? AND m.status <> 'dismissed' AND (l.status = 'active' OR m.status IN ('offered','contacted'))
       ORDER BY m.score DESC, l.published_at DESC LIMIT ?`,
      [card.id, MATCH_SHOW_MIN, limit],
    );
    const listings = listingCardMap(rows.map((r) => r.listing_id), opts.viewerId ?? userId);
    out.push({ wanted: card, matches: rows.map((m) => toMatchDto(m, { listing: listings.get(m.listing_id) })) });
  }
  return out;
}

/** Digest placeholder (DATA_MODEL §3.2): new matches ≥ 60 from the last 7 days, grouped by post. */
export function buildDigest(userId: string): { subject: string; items: { wanted: WantedCard; matches: Match[] }[]; generatedAt: string } {
  const since = new Date(nowMs() - 7 * DAY).toISOString();
  const user = q.get<{ locale: 'zh-CN' | 'en' }>('SELECT locale FROM users WHERE id = ?', [userId]);
  const zh = (user?.locale ?? 'zh-CN') === 'zh-CN';
  const posts = q.all<WantedCardRow>("SELECT * FROM wanted_posts WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC", [userId]);
  const cards = wantedCards(posts);
  const items: { wanted: WantedCard; matches: Match[] }[] = [];
  let total = 0;
  for (const card of cards) {
    const rows = q.all<MatchRow>(
      `SELECT m.* FROM matches m JOIN listings l ON l.id = m.listing_id
       WHERE m.wanted_id = ? AND m.score >= ? AND m.status IN ('new','seen') AND l.status = 'active' AND m.computed_at >= ?
       ORDER BY m.score DESC LIMIT 5`,
      [card.id, MATCH_DIGEST_MIN, since],
    );
    if (!rows.length) continue;
    const listings = listingCardMap(rows.map((r) => r.listing_id), userId);
    items.push({ wanted: card, matches: rows.map((m) => toMatchDto(m, { listing: listings.get(m.listing_id) })) });
    total += rows.length;
  }
  const subject = total
    ? zh ? `本周为你找到 ${total} 个新匹配房源` : `${total} new ${total === 1 ? 'match' : 'matches'} for your wanted ${items.length === 1 ? 'post' : 'posts'} this week`
    : zh ? '本周暂无新的匹配房源' : 'No new matches this week';
  return { subject, items, generatedAt: nowIso() };
}

/** Every active post (10-minute job + nightly). Returns how many posts were recomputed. */
export function recomputeAll(opts: { notify?: boolean } = {}): number {
  const ids = q.all<{ id: string }>("SELECT id FROM wanted_posts WHERE status = 'active' AND moderation_status = 'ok'").map((r) => r.id);
  let n = 0;
  for (const id of ids) {
    try {
      recomputeForWanted(id, { notify: opts.notify ? 'summary' : 'none' });
      n++;
    } catch (e) {
      logger.warn({ err: e, wantedId: id }, 'wanted.recompute failed');
    }
  }
  return n;
}

/** Score one (wanted, listing) pair on demand (used by "offer my place" when no row exists yet). */
export function scorePair(w: WantedRow, listingId: string): ScoreResult | null {
  const l = q.get<CandidateRow>('SELECT l.*, u.trust_level AS owner_trust_level FROM listings l JOIN users u ON u.id = l.owner_id WHERE l.id = ?', [listingId]);
  if (!l) return null;
  const amenities = amenitiesFor([l.id]).get(l.id) ?? new Set<string>();
  return scoreMatch(w, areasForScore(loadAreas(w.id)), l, campusForScore(w.campus_id), { amenities, ownerTrustLevel: l.owner_trust_level, blocked: blockedPairs(w.user_id).has(l.owner_id) });
}
