// server/src/modules/admin/kpis.ts — every number on the admin Overview / KPI screens comes from a query here.
//
// Definitions (also shown as tooltips in the UI, i18n keys admin.def.*):
//   DAU / WAU / MAU   distinct events.user_id in the 1 / 7 / 30-day window ending that day (UTC days)
//   visitors          distinct events.session_id per day (includes logged-out traffic)
//   signups           users.created_at per day
//   listingsPublished listings.published_at per day; listingsActive = published on/before the day and not yet closed
//   matches           matches with score >= 50 by computed_at
//   messages          messages (non-system) by created_at; conversation campus for the filter
//   GMV               escrows.amount_cents by funded_at
//   revenue           v_revenue (boost + Pro + escrow fee, net of card refunds) by payment time
//                     + affiliate: partner_conversions approved|paid by occurred_at (falls back to partner_clicks.payout_cents)
//   affiliateClicks   partner_clicks by created_at
import { q, tableExists } from '../../db';
import { nowIso, nowMs, DAY, HOUR } from '../../lib/time';
import { toCampusLite } from '../../lib/campuses';
import type { CampusKpiRow, FunnelStep, KpiKey, KpiPoint, Kpis, Overview, SlaItem } from '@shared/schemas/admin';

// ------------------------------------------------------------------ dates
export function ymd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
export function dayMs(d: string): number {
  return Date.parse(`${d}T00:00:00.000Z`);
}
export function addDays(d: string, n: number): string {
  return ymd(dayMs(d) + n * DAY);
}
export function todayUtc(): string {
  return ymd(nowMs());
}
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = dayMs(from); t <= dayMs(to); t += DAY) out.push(ymd(t));
  return out;
}
/** Normalises a requested range: default last 30 days, max 366 days, from <= to. */
export function resolveRange(from?: string, to?: string): { from: string; to: string } {
  let t = to ?? todayUtc();
  let f = from ?? addDays(t, -29);
  if (f > t) [f, t] = [t, f];
  if (dayMs(t) - dayMs(f) > 365 * DAY) f = addDays(t, -365);
  return { from: f, to: t };
}
const startIso = (d: string) => `${d}T00:00:00.000Z`;
const endIso = (d: string) => `${addDays(d, 1)}T00:00:00.000Z`; // exclusive

// ------------------------------------------------------------------ helpers
type Bin = Map<string, number>;
function bins(sql: string, params: unknown[]): Bin {
  const m: Bin = new Map();
  for (const r of q.all<{ d: string; v: number | null }>(sql, params as never)) m.set(r.d, Number(r.v ?? 0));
  return m;
}
function campusClause(col: string, campusId: string | null): { sql: string; params: string[] } {
  return campusId ? { sql: ` AND ${col} = ?`, params: [campusId] } : { sql: '', params: [] };
}
const hasConversions = () => tableExists('partner_conversions');

/** Revenue rows per day by stream, optional campus. */
function revenueBins(from: string, to: string, campusId: string | null) {
  const c = campusClause('campus_id', campusId);
  const rows = q.all<{ d: string; kind: string; v: number }>(
    `SELECT substr(at, 1, 10) AS d, order_kind AS kind,
            SUM(MAX(0, revenue_cents - CASE WHEN order_kind = 'escrow_deposit' THEN 0 ELSE COALESCE(refunded_cents, 0) END)) AS v
       FROM v_revenue WHERE at >= ? AND at < ?${c.sql} GROUP BY d, kind`,
    [startIso(from), endIso(to), ...c.params],
  );
  const boost: Bin = new Map(), pro: Bin = new Map(), fee: Bin = new Map();
  for (const r of rows) {
    const target = r.kind === 'boost' ? boost : r.kind === 'escrow_deposit' ? fee : r.kind.startsWith('subscription') ? pro : null;
    if (target) target.set(r.d, (target.get(r.d) ?? 0) + Number(r.v ?? 0));
  }
  let affiliate: Bin;
  if (hasConversions()) {
    const cc = campusClause('campus_id', campusId);
    affiliate = bins(
      `SELECT substr(occurred_at, 1, 10) AS d, SUM(payout_cents) AS v FROM partner_conversions
        WHERE status IN ('approved','paid') AND occurred_at >= ? AND occurred_at < ?${cc.sql} GROUP BY d`,
      [startIso(from), endIso(to), ...cc.params],
    );
  } else {
    const cc = campusClause('campus_id', campusId);
    affiliate = bins(
      `SELECT substr(created_at, 1, 10) AS d, SUM(payout_cents) AS v FROM partner_clicks WHERE created_at >= ? AND created_at < ?${cc.sql} GROUP BY d`,
      [startIso(from), endIso(to), ...cc.params],
    );
  }
  return { boost, pro, fee, affiliate };
}

/** distinct users per day within [from - 29, to] → rolling DAU / WAU / MAU per day. */
function activeUsers(from: string, to: string, campusId: string | null) {
  const c = campusClause('campus_id', campusId);
  const rows = q.all<{ d: string; u: string }>(
    `SELECT DISTINCT substr(created_at, 1, 10) AS d, user_id AS u FROM events
      WHERE user_id IS NOT NULL AND created_at >= ? AND created_at < ?${c.sql}`,
    [startIso(addDays(from, -29)), endIso(to), ...c.params],
  );
  const byDay = new Map<string, Set<string>>();
  for (const r of rows) {
    let s = byDay.get(r.d);
    if (!s) byDay.set(r.d, (s = new Set()));
    s.add(r.u);
  }
  const windowCount = (d: string, n: number) => {
    const s = new Set<string>();
    for (let i = 0; i < n; i++) for (const u of byDay.get(addDays(d, -i)) ?? []) s.add(u);
    return s.size;
  };
  const distinctIn = (f: string, t: string) => {
    const s = new Set<string>();
    for (const d of daysBetween(f, t)) for (const u of byDay.get(d) ?? []) s.add(u);
    return s.size;
  };
  return { dau: (d: string) => byDay.get(d)?.size ?? 0, wau: (d: string) => windowCount(d, 7), mau: (d: string) => windowCount(d, 30), distinctIn };
}

/** Rows with an open interval [startAt, endAt) → "active on day" counter. */
function activeCounter(rows: { s: string | null; e: string | null }[]) {
  return (d: string) => {
    const end = endIso(d);
    let n = 0;
    for (const r of rows) if (r.s && r.s < end && (!r.e || r.e >= end)) n++;
    return n;
  };
}
function intervals(table: string, startCol: string, liveStatuses: string[], campusId: string | null) {
  const c = campusClause('campus_id', campusId);
  const live = liveStatuses.map((s) => `'${s}'`).join(',');
  return q.all<{ s: string | null; e: string | null }>(
    `SELECT ${startCol} AS s, CASE WHEN status IN (${live}) THEN NULL ELSE updated_at END AS e FROM ${table}
      WHERE ${startCol} IS NOT NULL AND status <> 'draft'${c.sql}`,
    c.params,
  );
}

// ------------------------------------------------------------------ series
export function computeSeries(from: string, to: string, campusId: string | null): KpiPoint[] {
  const days = daysBetween(from, to);
  const range = [startIso(from), endIso(to)];
  const ev = campusClause('campus_id', campusId);
  const au = activeUsers(from, to, campusId);
  const visitors = bins(
    `SELECT substr(created_at, 1, 10) AS d, COUNT(DISTINCT COALESCE(session_id, user_id)) AS v FROM events WHERE created_at >= ? AND created_at < ?${ev.sql} GROUP BY d`,
    [...range, ...ev.params],
  );
  const signups = bins(
    `SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS v FROM users WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?${ev.sql} GROUP BY d`,
    [...range, ...ev.params],
  );
  const published = bins(
    `SELECT substr(published_at, 1, 10) AS d, COUNT(*) AS v FROM listings WHERE published_at >= ? AND published_at < ?${ev.sql} GROUP BY d`,
    [...range, ...ev.params],
  );
  const lc = campusClause('l.campus_id', campusId);
  const matches = bins(
    `SELECT substr(m.computed_at, 1, 10) AS d, COUNT(*) AS v FROM matches m JOIN listings l ON l.id = m.listing_id
      WHERE m.score >= 50 AND m.computed_at >= ? AND m.computed_at < ?${lc.sql} GROUP BY d`,
    [...range, ...lc.params],
  );
  const cc = campusClause('c.campus_id', campusId);
  const messages = bins(
    `SELECT substr(m.created_at, 1, 10) AS d, COUNT(*) AS v FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE m.kind <> 'system' AND m.created_at >= ? AND m.created_at < ?${cc.sql} GROUP BY d`,
    [...range, ...cc.params],
  );
  const convos = bins(
    `SELECT substr(c.created_at, 1, 10) AS d, COUNT(*) AS v FROM conversations c WHERE c.created_at >= ? AND c.created_at < ?${cc.sql} GROUP BY d`,
    [...range, ...cc.params],
  );
  const gmv = bins(
    `SELECT substr(funded_at, 1, 10) AS d, SUM(amount_cents) AS v FROM escrows WHERE funded_at >= ? AND funded_at < ?${ev.sql} GROUP BY d`,
    [...range, ...ev.params],
  );
  const clicks = bins(
    `SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS v FROM partner_clicks WHERE created_at >= ? AND created_at < ?${ev.sql} GROUP BY d`,
    [...range, ...ev.params],
  );
  const rev = revenueBins(from, to, campusId);
  const listingsActive = activeCounter(intervals('listings', 'published_at', ['active'], campusId));
  const wantedActive = activeCounter(intervals('wanted_posts', 'created_at', ['active'], campusId));
  const itemsActive = activeCounter(intervals('market_items', 'created_at', ['active', 'reserved'], campusId));
  const buddyOpen = activeCounter(intervals('buddy_posts', 'created_at', ['open', 'full'], campusId));

  return days.map((d) => {
    const boostCents = rev.boost.get(d) ?? 0;
    const proCents = rev.pro.get(d) ?? 0;
    const escrowFeeCents = rev.fee.get(d) ?? 0;
    const affiliateCents = rev.affiliate.get(d) ?? 0;
    return {
      date: d,
      dau: au.dau(d),
      wau: au.wau(d),
      visitors: visitors.get(d) ?? 0,
      signups: signups.get(d) ?? 0,
      listingsActive: listingsActive(d),
      listingsPublished: published.get(d) ?? 0,
      wantedActive: wantedActive(d),
      matches: matches.get(d) ?? 0,
      itemsActive: itemsActive(d),
      buddyOpen: buddyOpen(d),
      conversations: convos.get(d) ?? 0,
      messages: messages.get(d) ?? 0,
      gmvCents: gmv.get(d) ?? 0,
      revenueCents: boostCents + proCents + escrowFeeCents + affiliateCents,
      boostCents,
      proCents,
      escrowFeeCents,
      affiliateCents,
      affiliateClicks: clicks.get(d) ?? 0,
    };
  });
}

const FLOW_KEYS: (keyof KpiPoint)[] = ['signups', 'listingsPublished', 'matches', 'conversations', 'messages', 'gmvCents', 'revenueCents', 'boostCents', 'proCents', 'escrowFeeCents', 'affiliateCents', 'affiliateClicks', 'visitors'];
const SNAPSHOT_KEYS: (keyof KpiPoint)[] = ['wau', 'listingsActive', 'wantedActive', 'itemsActive', 'buddyOpen'];

/** Monday-start weekly buckets: flows are summed, DAU averaged, snapshots take the last day. */
export function groupWeekly(series: KpiPoint[]): KpiPoint[] {
  const out: KpiPoint[] = [];
  let cur: { key: string; pts: KpiPoint[] } | null = null;
  const weekKey = (d: string) => {
    const dow = (new Date(dayMs(d)).getUTCDay() + 6) % 7;
    return addDays(d, -dow);
  };
  const flush = () => {
    if (!cur) return;
    const pts = cur.pts;
    const last = pts[pts.length - 1]!;
    const p = { ...last, date: cur.key } as KpiPoint;
    for (const k of FLOW_KEYS) (p as Record<string, unknown>)[k] = pts.reduce((s, x) => s + (x[k] as number), 0);
    for (const k of SNAPSHOT_KEYS) (p as Record<string, unknown>)[k] = last[k];
    p.dau = Math.round(pts.reduce((s, x) => s + x.dau, 0) / pts.length);
    out.push(p);
  };
  for (const pt of series) {
    const k = weekKey(pt.date);
    if (!cur || cur.key !== k) {
      flush();
      cur = { key: k, pts: [] };
    }
    cur.pts.push(pt);
  }
  flush();
  return out;
}

// ------------------------------------------------------------------ funnels / breakdowns
function countEvents(type: string, from: string, to: string, campusId: string | null): number {
  const c = campusClause('campus_id', campusId);
  return q.count(`SELECT COUNT(*) FROM events WHERE type = ? AND created_at >= ? AND created_at < ?${c.sql}`, [type, startIso(from), endIso(to), ...c.params]);
}
function countWhere(sql: string, from: string, to: string, campusCol: string | null, campusId: string | null): number {
  const c = campusCol ? campusClause(campusCol, campusId) : { sql: '', params: [] };
  return q.count(`${sql}${c.sql}`, [startIso(from), endIso(to), ...c.params]);
}

export function computeFunnels(from: string, to: string, campusId: string | null): Kpis['funnels'] {
  const listing: FunnelStep[] = [
    { key: 'views', count: countEvents('listing.view', from, to, campusId) },
    { key: 'contactClicks', count: countEvents('listing.contact_click', from, to, campusId) },
    { key: 'chatsStarted', count: countWhere("SELECT COUNT(*) FROM conversations WHERE context_type = 'listing' AND created_at >= ? AND created_at < ?", from, to, 'campus_id', campusId) },
    { key: 'escrowsProposed', count: countWhere('SELECT COUNT(*) FROM escrows WHERE created_at >= ? AND created_at < ?', from, to, 'campus_id', campusId) },
    { key: 'escrowsFunded', count: countWhere('SELECT COUNT(*) FROM escrows WHERE funded_at >= ? AND funded_at < ?', from, to, 'campus_id', campusId) },
  ];
  const checkout: FunnelStep[] = [
    { key: 'starts', count: countEvents('checkout.start', from, to, campusId) },
    { key: 'pays', count: countEvents('checkout.pay', from, to, campusId) },
    { key: 'successes', count: countEvents('checkout.success', from, to, campusId) },
    { key: 'fails', count: countEvents('checkout.fail', from, to, campusId) },
  ];
  const verification: FunnelStep[] = [
    { key: 'signups', count: countWhere('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?', from, to, 'campus_id', campusId) },
    { key: 'eduVerified', count: countWhere('SELECT COUNT(*) FROM users WHERE email_verified_at >= ? AND email_verified_at < ?', from, to, 'campus_id', campusId) },
    { key: 'idSubmitted', count: countWhere('SELECT COUNT(*) FROM verification_requests WHERE created_at >= ? AND created_at < ?', from, to, 'campus_id', campusId) },
    { key: 'idApproved', count: countWhere("SELECT COUNT(*) FROM verification_requests WHERE status = 'approved' AND reviewed_at >= ? AND reviewed_at < ?", from, to, 'campus_id', campusId) },
  ];
  return { listing, checkout, verification };
}

function statusCounts(table: string, campusId: string | null): Record<string, number> {
  const c = campusClause('campus_id', campusId);
  const out: Record<string, number> = {};
  for (const r of q.all<{ status: string; n: number }>(`SELECT status, COUNT(*) AS n FROM ${table} WHERE 1 = 1${c.sql} GROUP BY status`, c.params)) out[r.status] = r.n;
  return out;
}

export function computeByCampus(from: string, to: string): CampusKpiRow[] {
  const range = [startIso(from), endIso(to)];
  const map = new Map<string, CampusKpiRow>();
  const row = (id: string): CampusKpiRow | null => {
    let r = map.get(id);
    if (!r) {
      const campus = toCampusLite(id);
      if (!campus) return null;
      r = { campus, mau: 0, signups: 0, listingsActive: 0, itemsActive: 0, buddyOpen: 0, revenueCents: 0, revenuePerMauCents: 0, affiliateClicks: 0 };
      map.set(id, r);
    }
    return r;
  };
  const apply = (sql: string, params: unknown[], key: keyof CampusKpiRow) => {
    for (const x of q.all<{ c: string | null; v: number }>(sql, params as never)) {
      if (!x.c) continue;
      const r = row(x.c);
      if (r) (r as Record<string, unknown>)[key] = Number(x.v ?? 0);
    }
  };
  apply('SELECT campus_id AS c, COUNT(DISTINCT user_id) AS v FROM events WHERE user_id IS NOT NULL AND created_at >= ? AND created_at < ? GROUP BY campus_id', range, 'mau');
  apply('SELECT campus_id AS c, COUNT(*) AS v FROM users WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? GROUP BY campus_id', range, 'signups');
  apply("SELECT campus_id AS c, COUNT(*) AS v FROM listings WHERE status = 'active' GROUP BY campus_id", [], 'listingsActive');
  apply("SELECT campus_id AS c, COUNT(*) AS v FROM market_items WHERE status IN ('active','reserved') GROUP BY campus_id", [], 'itemsActive');
  apply("SELECT campus_id AS c, COUNT(*) AS v FROM buddy_posts WHERE status IN ('open','full') GROUP BY campus_id", [], 'buddyOpen');
  apply(
    `SELECT campus_id AS c, SUM(MAX(0, revenue_cents - CASE WHEN order_kind = 'escrow_deposit' THEN 0 ELSE COALESCE(refunded_cents, 0) END)) AS v
       FROM v_revenue WHERE at >= ? AND at < ? GROUP BY campus_id`,
    range,
    'revenueCents',
  );
  apply('SELECT campus_id AS c, COUNT(*) AS v FROM partner_clicks WHERE created_at >= ? AND created_at < ? GROUP BY campus_id', range, 'affiliateClicks');
  const rows = [...map.values()];
  for (const r of rows) r.revenuePerMauCents = r.mau > 0 ? Math.round(r.revenueCents / r.mau) : 0;
  rows.sort((a, b) => b.revenueCents - a.revenueCents || b.mau - a.mau || b.listingsActive - a.listingsActive);
  return rows.slice(0, 25);
}

function topPartners(from: string, to: string, campusId: string | null): Kpis['topPartners'] {
  const c = campusClause('pc.campus_id', campusId);
  const conv = hasConversions()
    ? `(SELECT COUNT(*) FROM partner_conversions x WHERE x.partner_id = p.id AND x.status IN ('approved','paid') AND x.occurred_at >= ? AND x.occurred_at < ?)`
    : '0';
  const convCents = hasConversions()
    ? `(SELECT COALESCE(SUM(payout_cents), 0) FROM partner_conversions x WHERE x.partner_id = p.id AND x.status IN ('approved','paid') AND x.occurred_at >= ? AND x.occurred_at < ?)`
    : '0';
  const extra = hasConversions() ? [startIso(from), endIso(to), startIso(from), endIso(to)] : [];
  return q
    .all<{ id: string; name: string; name_zh: string | null; clicks: number; conversions: number; est: number }>(
      `SELECT p.id, p.name, p.name_zh, COUNT(pc.id) AS clicks, ${conv} AS conversions, COALESCE(SUM(pc.payout_cents), 0) + ${convCents} AS est
         FROM partners p JOIN partner_clicks pc ON pc.partner_id = p.id
        WHERE pc.created_at >= ? AND pc.created_at < ?${c.sql}
        GROUP BY p.id ORDER BY clicks DESC LIMIT 8`,
      [...extra, startIso(from), endIso(to), ...c.params],
    )
    .map((r) => ({ partnerId: r.id, name: r.name, nameZh: r.name_zh, clicks: r.clicks, conversions: r.conversions, estCents: r.est }));
}

export function computeKpis(input: { from?: string; to?: string; campusId?: string | null; groupBy?: 'day' | 'week' }): Kpis {
  const { from, to } = resolveRange(input.from, input.to);
  const campusId = input.campusId || null;
  const daily = computeSeries(from, to, campusId);
  const sum = (k: keyof KpiPoint) => daily.reduce((s, p) => s + (p[k] as number), 0);
  const au = activeUsers(from, to, campusId);
  const revenueCents = sum('revenueCents');
  const gmvCents = sum('gmvCents');
  return {
    from,
    to,
    campusId,
    groupBy: input.groupBy ?? 'day',
    series: input.groupBy === 'week' ? groupWeekly(daily) : daily,
    totals: {
      mau: au.distinctIn(from, to),
      signups: sum('signups'),
      listingsPublished: sum('listingsPublished'),
      matches: sum('matches'),
      messages: sum('messages'),
      gmvCents,
      revenueCents,
      takeRate: gmvCents > 0 ? sum('escrowFeeCents') / gmvCents : null,
      affiliateClicks: sum('affiliateClicks'),
      byStream: { boost: sum('boostCents'), pro: sum('proCents'), escrowFee: sum('escrowFeeCents'), affiliate: sum('affiliateCents') },
      statusCounts: {
        listings: statusCounts('listings', campusId),
        wanted: statusCounts('wanted_posts', campusId),
        items: statusCounts('market_items', campusId),
        buddy: statusCounts('buddy_posts', campusId),
      },
    },
    funnels: computeFunnels(from, to, campusId),
    byCampus: computeByCampus(from, to),
    topPartners: topPartners(from, to, campusId),
  };
}

// ------------------------------------------------------------------ overview (today vs same day last week)
function backlogAt(at: string, campusId: string | null) {
  const c = campusClause('campus_id', campusId);
  return {
    openReports: q.count(
      `SELECT COUNT(*) FROM reports WHERE created_at <= ? AND (status IN ('open','in_review') OR reviewed_at > ?)${c.sql}`,
      [at, at, ...c.params],
    ),
    pendingVerifications: q.count(
      `SELECT COUNT(*) FROM verification_requests WHERE created_at <= ? AND (status IN ('pending','in_review') OR (reviewed_at IS NOT NULL AND reviewed_at > ?))${c.sql}`,
      [at, at, ...c.params],
    ),
    disputedEscrows: q.count(
      `SELECT COUNT(*) FROM escrows WHERE disputed_at IS NOT NULL AND disputed_at <= ? AND (status = 'disputed' OR (resolved_at IS NOT NULL AND resolved_at > ?))${c.sql}`,
      [at, at, ...c.params],
    ),
  };
}

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round(((nowMs() - Date.parse(iso)) / HOUR) * 10) / 10);
}
function slaItem(key: SlaItem['key'], count: number, oldestAt: string | null, targetHours: number, breachHours: number): SlaItem {
  const h = hoursSince(oldestAt);
  const status: SlaItem['status'] = count === 0 || h === null ? 'ok' : h > breachHours ? 'breach' : h > targetHours ? 'warn' : 'ok';
  return { key, count, oldestAt, oldestHours: count ? h : null, targetHours, status };
}

export function computeSla(campusId: string | null): SlaItem[] {
  const c = campusClause('campus_id', campusId);
  const v = q.get<{ n: number; o: string | null }>(`SELECT COUNT(*) AS n, MIN(created_at) AS o FROM verification_requests WHERE status IN ('pending','in_review')${c.sql}`, c.params);
  const r = q.get<{ n: number; o: string | null }>(`SELECT COUNT(*) AS n, MIN(created_at) AS o FROM reports WHERE status IN ('open','in_review')${c.sql}`, c.params);
  const d = q.get<{ n: number; o: string | null }>(`SELECT COUNT(*) AS n, MIN(COALESCE(disputed_at, updated_at)) AS o FROM escrows WHERE status = 'disputed'${c.sql}`, c.params);
  const cr = q.get<{ n: number; o: string | null }>("SELECT COUNT(*) AS n, MIN(created_at) AS o FROM campus_requests WHERE status = 'open'");
  return [
    slaItem('verifications', v?.n ?? 0, v?.o ?? null, 24, 48),
    slaItem('reports', r?.n ?? 0, r?.o ?? null, 4, 12),
    slaItem('disputes', d?.n ?? 0, d?.o ?? null, 48, 72),
    slaItem('campusRequests', cr?.n ?? 0, cr?.o ?? null, 168, 336),
  ];
}

/** Cash of active boosts whose entity has an open report or is flagged/hidden (requirements §2.6). */
export function revenueAtRisk(campusId: string | null): number {
  const c = campusClause('b.campus_id', campusId);
  return (
    q.scalar<number>(
      `SELECT COALESCE(SUM(o.total_cents + o.credit_cents), 0) FROM boosts b JOIN orders o ON o.id = b.order_id
        WHERE b.status = 'active' AND b.ends_at > ?${c.sql} AND (
          EXISTS (SELECT 1 FROM reports r WHERE r.entity_type = b.entity_type AND r.entity_id = b.entity_id AND r.status IN ('open','in_review'))
          OR (b.entity_type = 'listing' AND EXISTS (SELECT 1 FROM listings l WHERE l.id = b.entity_id AND l.moderation_status <> 'ok'))
          OR (b.entity_type = 'market_item' AND EXISTS (SELECT 1 FROM market_items m WHERE m.id = b.entity_id AND m.moderation_status <> 'ok'))
          OR (b.entity_type = 'buddy_post' AND EXISTS (SELECT 1 FROM buddy_posts p WHERE p.id = b.entity_id AND p.moderation_status <> 'ok')))`,
      [nowIso(), ...c.params],
    ) ?? 0
  );
}

/** Flow metrics for an arbitrary [startIso, endIso) window (rolling 24 h tiles). */
function windowFlows(start: string, end: string, campusId: string | null): Pick<Record<KpiKey, number>, 'dau' | 'signups' | 'listingsPublished' | 'matches' | 'messages' | 'revenueCents'> {
  const c = campusClause('campus_id', campusId);
  const lc = campusClause('l.campus_id', campusId);
  const cc = campusClause('c.campus_id', campusId);
  const r = [start, end];
  const revenue =
    (q.scalar<number>(
      `SELECT COALESCE(SUM(MAX(0, revenue_cents - CASE WHEN order_kind = 'escrow_deposit' THEN 0 ELSE COALESCE(refunded_cents, 0) END)), 0) FROM v_revenue WHERE at >= ? AND at < ?${c.sql}`,
      [...r, ...c.params],
    ) ?? 0) +
    (hasConversions()
      ? q.scalar<number>(`SELECT COALESCE(SUM(payout_cents), 0) FROM partner_conversions WHERE status IN ('approved','paid') AND occurred_at >= ? AND occurred_at < ?${c.sql}`, [...r, ...c.params]) ?? 0
      : 0);
  return {
    dau: q.count(`SELECT COUNT(DISTINCT user_id) FROM events WHERE user_id IS NOT NULL AND created_at >= ? AND created_at < ?${c.sql}`, [...r, ...c.params]),
    signups: q.count(`SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?${c.sql}`, [...r, ...c.params]),
    listingsPublished: q.count(`SELECT COUNT(*) FROM listings WHERE published_at >= ? AND published_at < ?${c.sql}`, [...r, ...c.params]),
    matches: q.count(`SELECT COUNT(*) FROM matches m JOIN listings l ON l.id = m.listing_id WHERE m.score >= 50 AND m.computed_at >= ? AND m.computed_at < ?${lc.sql}`, [...r, ...lc.params]),
    messages: q.count(`SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.kind <> 'system' AND m.created_at >= ? AND m.created_at < ?${cc.sql}`, [...r, ...cc.params]),
    revenueCents: revenue,
  };
}

/** Overview tiles: rolling last 24 h vs the same 24 h one week earlier (no UTC-midnight cliff); backlogs now vs 7 days ago. */
export function computeOverview(campusIdIn?: string | null): Overview {
  const campusId = campusIdIn || null;
  const today = todayUtc();
  const series = computeSeries(addDays(today, -29), today, campusId);
  const nowAt = nowMs();
  const iso = (ms: number) => new Date(ms).toISOString();
  const todayVals: Record<KpiKey, number> = { ...windowFlows(iso(nowAt - DAY), iso(nowAt), campusId), ...backlogAt(iso(nowAt), campusId) };
  const prevVals: Record<KpiKey, number> = { ...windowFlows(iso(nowAt - 8 * DAY), iso(nowAt - 7 * DAY), campusId), ...backlogAt(iso(nowAt - 7 * DAY), campusId) };
  const deltas = {} as Record<KpiKey, number | null>;
  for (const k of Object.keys(todayVals) as KpiKey[]) {
    const prev = prevVals[k];
    deltas[k] = prev > 0 ? Math.round(((todayVals[k] - prev) / prev) * 1000) / 10 : todayVals[k] > 0 ? null : 0;
  }
  return {
    date: nowIso(),
    campusId,
    today: todayVals,
    deltas7d: deltas,
    spark30: series.map((p) => ({ date: p.date, dau: p.dau, listingsPublished: p.listingsPublished, revenueCents: p.revenueCents, signups: p.signups })),
    sla: computeSla(campusId),
    revenueAtRiskCents: revenueAtRisk(campusId),
  };
}
