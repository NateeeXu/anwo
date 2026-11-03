// Analytics firehose (table events) — BRIEF §6.4, DATA_MODEL §2.6.
//
//   logEvent(req, 'listing.view', { entityType: 'listing', entityId: id, props: { source: 'card' } });
//   logEvent(null, 'boost.impression', { userId, campusId, entityType: 'boost', entityId });   // server-side, no request
//   recentlyLogged(userId|sessionId, 'listing.view', 'listing', id, 6 * HOUR)   // view-count dedupe
import type { Request } from 'express';
import { q, uid } from '../db';
import { nowIso, nowMs } from './time';
import { clientIp } from './http';
import { sha256 } from './ids';
import { cookieOf, CAMPUS_COOKIE } from './auth';
import { config } from '../config';

export type EventInput = {
  entityType?: string | null;
  entityId?: string | null;
  props?: Record<string, unknown>;
  path?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  campusId?: string | null;
  ts?: string | null;
};

export function ipHashOf(req: Request): string {
  return sha256(clientIp(req) + '|' + config.jwtSecret).slice(0, 32);
}

export function campusIdOf(req: Request): string | null {
  const qc = req.query?.campusId;
  if (typeof qc === 'string' && qc) return qc;
  return req.user?.campus_id ?? cookieOf(req, CAMPUS_COOKIE) ?? null;
}

export function logEvent(req: Request | null, type: string, input: EventInput = {}): string {
  const id = uid();
  let props = input.props ?? {};
  let propsJson = JSON.stringify(props);
  if (propsJson.length > 1024) {
    props = { _truncated: true };
    propsJson = JSON.stringify(props);
  }
  q.run(
    `INSERT INTO events (id, user_id, session_id, campus_id, type, entity_type, entity_id, props_json, path, ip_hash, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId ?? req?.user?.id ?? null,
      input.sessionId ?? req?.sessionId ?? null,
      input.campusId ?? (req ? campusIdOf(req) : null),
      type.slice(0, 60),
      input.entityType ?? null,
      input.entityId ?? null,
      propsJson,
      input.path ?? (req ? req.originalUrl.slice(0, 300) : null),
      req ? ipHashOf(req) : null,
      req ? String(req.headers['user-agent'] ?? '').slice(0, 200) : null,
      input.ts ?? nowIso(),
    ],
  );
  return id;
}

/** True when the same viewer logged `type` for the entity within `windowMs` (for view_count dedupe). */
export function recentlyLogged(viewerKey: { userId?: string | null; sessionId?: string | null }, type: string, entityType: string, entityId: string, windowMs: number): boolean {
  const since = new Date(nowMs() - windowMs).toISOString();
  if (viewerKey.userId) {
    return q.count('SELECT COUNT(*) FROM events WHERE user_id = ? AND type = ? AND entity_type = ? AND entity_id = ? AND created_at >= ?', [viewerKey.userId, type, entityType, entityId, since]) > 0;
  }
  if (viewerKey.sessionId) {
    return q.count('SELECT COUNT(*) FROM events WHERE session_id = ? AND type = ? AND entity_type = ? AND entity_id = ? AND created_at >= ?', [viewerKey.sessionId, type, entityType, entityId, since]) > 0;
  }
  return false;
}
