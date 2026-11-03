// server/src/modules/admin/jobs.ts — admin scheduled jobs (auto-registered as 'admin.<name>' by lib/jobs loadModuleJobs).
//
// autoFlagReported: requirements §3 — an entity with 2+ pending reports is taken out of public search
// (moderation_status 'ok' → 'flagged', owner still sees it) until an admin reviews it. Audited with actor = system.
import { q, placeholders } from '../../db';
import { audit } from '../../lib/audit';
import { nowIso } from '../../lib/time';
import { publishRole } from '../../realtime/hub';
import { ENTITY } from './service';
import type { ModeratedEntityType } from '@shared/schemas/admin';

export const AUTO_FLAG_THRESHOLD = 2;

export function autoFlagReported(): number {
  let flagged = 0;
  for (const type of Object.keys(ENTITY) as ModeratedEntityType[]) {
    const cfg = ENTITY[type];
    const ids = q
      .all<{ id: string }>(
        `SELECT e.id FROM ${cfg.table} e
          WHERE e.moderation_status = 'ok' AND e.status <> 'removed'
            AND (SELECT COUNT(*) FROM reports r WHERE r.entity_type = ? AND r.entity_id = e.id AND r.status IN ('open','in_review')) >= ?`,
        [type, AUTO_FLAG_THRESHOLD],
      )
      .map((r) => r.id);
    if (!ids.length) continue;
    const now = nowIso();
    if (type === 'listing')
      q.run(`UPDATE listings SET moderation_status = 'flagged', moderation_note = 'auto: ${AUTO_FLAG_THRESHOLD}+ open reports', updated_at = ? WHERE id IN (${placeholders(ids.length)})`, [now, ...ids]);
    else q.run(`UPDATE ${cfg.table} SET moderation_status = 'flagged', updated_at = ? WHERE id IN (${placeholders(ids.length)})`, [now, ...ids]);
    for (const id of ids) audit(null, `${type}.flag`, type, id, { moderationStatus: 'ok' }, { moderationStatus: 'flagged', auto: true }, `${AUTO_FLAG_THRESHOLD}+ open reports`);
    flagged += ids.length;
  }
  if (flagged) publishRole('admin', { type: 'admin.queue', data: { queue: 'reports', delta: 0, count: q.count("SELECT COUNT(*) FROM reports WHERE status IN ('open','in_review')") } });
  return flagged;
}

export const jobs = [{ name: 'autoFlagReported', everyMs: 10 * 60_000, run: () => void autoFlagReported() }];
