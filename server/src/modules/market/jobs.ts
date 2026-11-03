// server/src/modules/market/jobs.ts — OWNED BY THE `market` MODULE AGENT.
// Registered by the scaffold scheduler as `market.<name>` (lib/jobs.ts). The coarse scaffold `expireContent` job also flips
// stale items to `expired`; this job runs first (every 30 min), tells sellers, and warns them 3 days ahead so they can renew.
import { q } from '../../db';
import { notify } from '../../lib/notify';
import { DAY, nowIso, nowMs } from '../../lib/time';
import { logEvent } from '../../lib/events';

const STALE_DAYS = 60;

type Row = { id: string; seller_id: string; title: string; campus_id: string };

export function expireItems(): { expired: number; warned: number } {
  const t = nowIso();
  const staleBefore = new Date(nowMs() - STALE_DAYS * DAY).toISOString();
  const rows = q.all<Row>(
    "SELECT id, seller_id, title, campus_id FROM market_items WHERE status = 'active' AND ((expires_at IS NOT NULL AND expires_at <= ?) OR (expires_at IS NULL AND updated_at <= ?))",
    [t, staleBefore],
  );
  for (const r of rows) {
    q.run("UPDATE market_items SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'active'", [t, r.id]);
    notify(r.seller_id, 'system', {
      title: { zh: `「${r.title}」已到期下架`, en: `"${r.title}" has expired` },
      body: { zh: '还在出？一键续期 60 天。', en: 'Still selling? Renew it for another 60 days in one tap.' },
      link: '/market/mine', entityType: 'market_item', entityId: r.id, data: { reason: 'expired' },
    });
    logEvent(null, 'item.expire', { entityType: 'market_item', entityId: r.id, userId: r.seller_id, campusId: r.campus_id });
  }
  // 3-day warning, once per item (tracked through the notification itself)
  const soon = new Date(nowMs() + 3 * DAY).toISOString();
  const warnRows = q.all<Row>(
    `SELECT m.id, m.seller_id, m.title, m.campus_id FROM market_items m
      WHERE m.status = 'active' AND m.expires_at IS NOT NULL AND m.expires_at > ? AND m.expires_at <= ?
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.entity_type = 'market_item' AND n.entity_id = m.id AND json_extract(n.data_json, '$.reason') = 'expiring')`,
    [t, soon],
  );
  for (const r of warnRows) {
    notify(r.seller_id, 'system', {
      title: { zh: `「${r.title}」3 天后到期`, en: `"${r.title}" expires in 3 days` },
      body: { zh: '续期一下，继续展示给同学。', en: 'Renew it to keep it visible to other students.' },
      link: '/market/mine', entityType: 'market_item', entityId: r.id, data: { reason: 'expiring' }, silent: true,
    });
  }
  return { expired: rows.length, warned: warnRows.length };
}

export const jobs = [{ name: 'expireItems', everyMs: 30 * 60_000, run: () => { expireItems(); } }];
