// Append-only audit log (any module may append; admin reads via /api/admin/audit).
//
//   audit(req, { action: 'listing.hide', entityType: 'listing', entityId: id, before, after, reason });
//   audit(actorId, 'verify.approve', 'verification_request', id, before, after, reason);   // positional form
import type { Request } from 'express';
import { q, uid, parseJson } from '../db';
import { nowIso } from './time';
import { clientIp } from './http';
import { sha256 } from './ids';
import type { AuditEntry } from '@shared/types';

export type AuditInput = {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

export function audit(req: Request, input: AuditInput): string;
export function audit(
  actorId: string | null,
  action: string,
  entityType?: string | null,
  entityId?: string | null,
  before?: unknown,
  after?: unknown,
  reason?: string | null,
): string;
export function audit(
  a: Request | string | null,
  b: AuditInput | string,
  entityType?: string | null,
  entityId?: string | null,
  before?: unknown,
  after?: unknown,
  reason?: string | null,
): string {
  let actorId: string | null = null;
  let actorRole: string | null = null;
  let ipHash: string | null = null;
  let input: AuditInput;
  if (a !== null && typeof a === 'object') {
    actorId = a.user?.id ?? null;
    actorRole = a.user?.role ?? null;
    ipHash = sha256(clientIp(a)).slice(0, 32);
    input = b as AuditInput;
  } else {
    actorId = a;
    if (actorId) actorRole = q.get<{ role: string }>('SELECT role FROM users WHERE id = ?', [actorId])?.role ?? null;
    input = { action: b as string, entityType, entityId, before, after, reason };
  }
  const id = uid();
  q.run(
    `INSERT INTO audit_log (id, actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason, ip_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      actorId,
      actorRole,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
      input.reason ?? null,
      ipHash,
      nowIso(),
    ],
  );
  return id;
}

export type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before_json: string | null;
  after_json: string | null;
  reason: string | null;
  created_at: string;
};
export function toAuditDto(r: AuditRow, actor: AuditEntry['actor'] = null): AuditEntry {
  return {
    id: r.id,
    actor,
    actorRole: r.actor_role,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    before: parseJson(r.before_json, null),
    after: parseJson(r.after_json, null),
    reason: r.reason,
    createdAt: r.created_at,
  };
}
