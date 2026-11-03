// Generic report inserts (every `/report` endpoint calls this; admin owns status changes).
//
//   const report = createReport(req, { entityType: 'listing', entityId: id, reason, details, campusId });
import type { Request } from 'express';
import type { Report } from '@shared/types';
import { q, uid } from '../db';
import { ApiError } from './errors';
import { nowIso } from './time';
import { publishRole } from '../realtime/hub';

export type ReportRow = {
  id: string; reporter_id: string | null; entity_type: Report['entityType']; entity_id: string; campus_id: string | null;
  reason: Report['reason']; details: string | null; status: Report['status']; reviewer_id: string | null; resolution: string | null;
  reviewed_at: string | null; created_at: string;
};
export function toReportDto(r: ReportRow): Report {
  return {
    id: r.id, reporterId: r.reporter_id, entityType: r.entity_type, entityId: r.entity_id, campusId: r.campus_id, reason: r.reason,
    details: r.details, status: r.status, reviewerId: r.reviewer_id, resolution: r.resolution, reviewedAt: r.reviewed_at, createdAt: r.created_at,
  };
}

export function createReport(
  req: Request,
  input: { entityType: Report['entityType']; entityId: string; reason: Report['reason']; details?: string | null; campusId?: string | null },
): Report {
  const reporterId = req.user?.id ?? null;
  if (!reporterId) throw new ApiError('UNAUTHORIZED');
  const dup = q.get<ReportRow>(
    "SELECT * FROM reports WHERE reporter_id = ? AND entity_type = ? AND entity_id = ? AND status IN ('open','in_review')",
    [reporterId, input.entityType, input.entityId],
  );
  if (dup) return toReportDto(dup); // idempotent
  const row: ReportRow = {
    id: uid(), reporter_id: reporterId, entity_type: input.entityType, entity_id: input.entityId, campus_id: input.campusId ?? req.user?.campus_id ?? null,
    reason: input.reason, details: input.details ?? null, status: 'open', reviewer_id: null, resolution: null, reviewed_at: null, created_at: nowIso(),
  };
  q.insert('reports', row as unknown as Record<string, string | number | null>);
  const count = q.count("SELECT COUNT(*) FROM reports WHERE status = 'open'");
  publishRole('admin', { type: 'admin.queue', data: { queue: 'reports', delta: 1, count } });
  return toReportDto(row);
}
