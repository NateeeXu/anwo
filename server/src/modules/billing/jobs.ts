// Billing scheduled jobs (DATA_MODEL §10) — registered by lib/jobs.loadModuleJobs as `billing.<name>`.
import { q } from '../../db';
import { notify } from '../../lib/notify';
import { DAY, HOUR, nowIso, nowMs } from '../../lib/time';
import { entityLink, escrowTimers, expireWalletCredits, renewSubscriptions, syncPausedBoosts, type BoostRow } from './service';

export const jobs = [
  { name: 'renewSubscriptions', everyMs: HOUR, run: () => { renewSubscriptions(); } },
  { name: 'escrowTimers', everyMs: HOUR, run: () => { escrowTimers(); } },
  { name: 'walletExpiry', everyMs: DAY, run: () => { expireWalletCredits(); } },
  { name: 'boostLifecycle', everyMs: HOUR, run: () => {
      const t = nowIso();
      q.run("UPDATE boosts SET status = 'active', updated_at = ? WHERE status = 'scheduled' AND starts_at <= ?", [t, t]);
      q.run("UPDATE boosts SET status = 'expired', updated_at = ? WHERE status = 'active' AND ends_at <= ?", [t, t]);
      syncPausedBoosts();
      // boost.expiring 24 h before ends_at (once per boost)
      const soon = new Date(nowMs() + 24 * HOUR).toISOString();
      const rows = q.all<BoostRow>("SELECT * FROM boosts WHERE status = 'active' AND ends_at <= ? AND ends_at > ? AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.kind = 'boost.expiring' AND n.entity_id = boosts.id)", [soon, t]);
      for (const b of rows) notify(b.user_id, 'boost.expiring', { title: { zh: '推广即将结束', en: 'Your boost ends soon' }, body: { zh: '24 小时内结束，可以续期保持置顶。', en: 'Ends within 24 hours — extend it to stay featured.' }, link: entityLink(b.entity_type, b.entity_id), entityType: 'boost', entityId: b.id });
    } },
];
export default jobs;
