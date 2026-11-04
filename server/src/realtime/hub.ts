// WebSocket hub — WS_EVENTS.md §1–3, §5.1, §5.3, §6, §7, §9. Single process, no Redis.
//
//   attach(httpServer)                                   // called once by index.ts; handles the /ws upgrade
//   publish(userId, { type: 'match.new', data })         // → topic user:<id> (all of that user's sockets)
//   publishMany(userIds, event); publishTopic('conversation:<id>', event, { excludeUserId }); publishRole('admin', event)
//   isOnline(userId); onlineUsers(ids); subscribersOf('conversation:<id>') → Set<userId>
//   registerHandler('chat.send', ChatSendSchema, async (ctx, data) => ({ messageId }))   // return → ack, throw ApiError → error
//   registerTopicGuard('conversation', async (userId, topic) => isMember(...))
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import type { ZodType } from 'zod';
import { z } from 'zod';
import { config } from '../config';
import { q } from '../db';
import { loadUser, verifySession, touchLastSeen } from '../lib/auth';
import { ApiError, isApiError, zodFields } from '../lib/errors';
import { publicFlags } from '../lib/flags';
import { uid } from '../lib/ids';
import { logger } from '../lib/logger';
import { nowIso, nowMs } from '../lib/time';
import type { AuthUser } from '../lib/types';
import { unreadCounts } from '../lib/users';

export type WsEvent = { type: string; data?: unknown; ts?: string };
export type WsFrame = { type: string; id?: string; ts: string; data?: unknown };
export type WsContext = {
  userId: string;
  connectionId: string;
  user: AuthUser;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  isSubscribed(topic: string): boolean;
  send(event: WsEvent): void;
  /** returns false when `key` fired within the last `ms` on this connection (typing throttle) */
  throttle(key: string, ms: number): boolean;
};
type Handler = { schema: ZodType<unknown>; fn: (ctx: WsContext, data: unknown) => Promise<unknown | void> | unknown | void };
type TopicGuard = (userId: string, topic: string) => Promise<boolean> | boolean;

type Meta = {
  connectionId: string;
  userId: string;
  user: AuthUser;
  topics: Set<string>;
  alive: boolean;
  pongTimer: NodeJS.Timeout | null;
  tokens: number;
  lastRefill: number;
  overLimitStrikes: number;
  throttles: Map<string, number>;
  ctx: WsContext;
};
type Socket = WebSocket & { meta?: Meta };

const CLOSE = { NORMAL: 1000, GOING_AWAY: 1001, PROTOCOL: 4400, AUTH_EXPIRED: 4401, BANNED: 4403, HEARTBEAT: 4408, TOO_MANY: 4429 } as const;
const MAX_SOCKETS_PER_USER = 5;
const MAX_TOPICS = 200;
const MAX_FRAME = 64 * 1024;
const PING_EVERY = 25_000;
const PONG_TIMEOUT = 10_000;
const PRESENCE_COALESCE_MS = 30_000;
const OFFLINE_GRACE_MS = 30_000;
const RATE_PER_SEC = 20;
const RATE_BURST = 60;
const TOPIC_RE = /^(conversation|campus|entity):[\w:-]+$/;

const handlers = new Map<string, Handler>();
const guards = new Map<string, TopicGuard>();
const userSockets = new Map<string, Set<Socket>>();
const topicSockets = new Map<string, Set<Socket>>();
const offlineTimers = new Map<string, NodeJS.Timeout>();
const presenceLastEmit = new Map<string, number>();
let wss: WebSocketServer | null = null;
let heartbeat: NodeJS.Timeout | null = null;

// ------------------------------------------------------------------ framing
function frame(event: WsEvent, id?: string): string {
  const f: WsFrame = { type: event.type, ts: event.ts ?? nowIso(), ...(id ? { id } : {}), ...(event.data !== undefined ? { data: event.data } : {}) };
  return JSON.stringify(f);
}
function sendRaw(ws: Socket, payload: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(payload);
    } catch (e) {
      logger.debug({ err: e }, 'ws send failed');
    }
  }
}
function sendEvent(ws: Socket, event: WsEvent, id?: string): void {
  sendRaw(ws, frame(event, id));
}
function sendError(ws: Socket, code: string, message: string, id?: string, extra: { fields?: Record<string, string>; data?: unknown } = {}): void {
  sendEvent(ws, { type: 'error', data: { code, message, ...(extra.fields ? { fields: extra.fields } : {}), ...(extra.data !== undefined ? { data: extra.data } : {}) } }, id);
}

// ------------------------------------------------------------------ public API (§9)
export function publish(userId: string, event: WsEvent): void {
  publishTopic(`user:${userId}`, event);
}
export const publishToUser = publish;
export function publishMany(userIds: string[], event: WsEvent): void {
  const payload = frame(event);
  for (const id of new Set(userIds)) for (const ws of userSockets.get(id) ?? []) sendRaw(ws, payload);
}
export function publishTopic(topic: string, event: WsEvent, opts: { excludeUserId?: string; excludeConnectionId?: string } = {}): void {
  const payload = frame(event);
  const set = topic.startsWith('user:') ? userSockets.get(topic.slice(5)) : topicSockets.get(topic);
  if (!set) return;
  for (const ws of set) {
    if (opts.excludeUserId && ws.meta?.userId === opts.excludeUserId) continue;
    if (opts.excludeConnectionId && ws.meta?.connectionId === opts.excludeConnectionId) continue;
    sendRaw(ws, payload);
  }
}
export const publishToTopic = publishTopic;
export function publishRole(role: 'admin' | 'landlord' | 'student', event: WsEvent): void {
  const payload = frame(event);
  for (const set of userSockets.values()) for (const ws of set) if (ws.meta?.user.role === role) sendRaw(ws, payload);
}
export function broadcast(event: WsEvent): void {
  const payload = frame(event);
  for (const set of userSockets.values()) for (const ws of set) sendRaw(ws, payload);
}
export function isOnline(userId: string): boolean {
  return (userSockets.get(userId)?.size ?? 0) > 0;
}
export function onlineUsers(userIds: string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const id of userIds) out[id] = isOnline(id);
  return out;
}
export function subscribersOf(topic: string): Set<string> {
  const out = new Set<string>();
  for (const ws of topicSockets.get(topic) ?? []) if (ws.meta) out.add(ws.meta.userId);
  return out;
}
export function clientCount(): number {
  let n = 0;
  for (const s of userSockets.values()) n += s.size;
  return n;
}
export function registerHandler<T>(type: string, schema: ZodType<T>, fn: (ctx: WsContext, data: T) => Promise<unknown | void> | unknown | void): void {
  handlers.set(type, { schema: schema as ZodType<unknown>, fn: fn as Handler['fn'] });
}
export function registerTopicGuard(prefix: 'conversation' | 'campus' | 'entity', guard: TopicGuard): void {
  guards.set(prefix, guard);
}
/** Force-unsubscribe every socket of a user from a topic (chat calls it when a member leaves). */
export function unsubscribeUser(userId: string, topic: string): void {
  for (const ws of userSockets.get(userId) ?? []) ws.meta?.ctx.unsubscribe(topic);
}
/** Close every socket of a user (ban / session invalidation). */
export function kickUser(userId: string, code: number = CLOSE.AUTH_EXPIRED, reason = 'session'): void {
  for (const ws of [...(userSockets.get(userId) ?? [])]) {
    if (code === CLOSE.AUTH_EXPIRED) sendEvent(ws, { type: 'session.expired', data: {} });
    if (code === CLOSE.BANNED) sendError(ws, 'BANNED', 'Account suspended');
    ws.close(code, reason);
  }
}
export function closeAll(code: number = CLOSE.GOING_AWAY, reason = 'server shutdown'): void {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  for (const set of userSockets.values()) for (const ws of [...set]) ws.close(code, reason);
  wss?.close();
}
export const CLOSE_CODES = CLOSE;

// ------------------------------------------------------------------ topic guards (defaults; chat may override 'conversation')
guards.set('campus', () => true);
guards.set('entity', (userId, topic) => {
  const [, type, id] = topic.split(':');
  if (type === 'escrow' && id) {
    return q.count('SELECT COUNT(*) FROM escrows WHERE id = ? AND (payer_id = ? OR payee_id = ?)', [id, userId, userId]) > 0;
  }
  return true;
});
guards.set('conversation', (userId, topic) => {
  const id = topic.slice('conversation:'.length);
  return q.count('SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL', [id, userId]) > 0;
});

async function subscribeTopics(ws: Socket, topics: string[]): Promise<{ topics: string[]; rejected: { topic: string; code: string }[] }> {
  const meta = ws.meta!;
  const accepted: string[] = [];
  const rejected: { topic: string; code: string }[] = [];
  for (const topic of topics) {
    if (!TOPIC_RE.test(topic)) { rejected.push({ topic, code: 'VALIDATION' }); continue; }
    if (meta.topics.has(topic)) { accepted.push(topic); continue; }
    if (meta.topics.size >= MAX_TOPICS) { rejected.push({ topic, code: 'QUOTA_EXCEEDED' }); continue; }
    const prefix = topic.split(':')[0]!;
    const guard = guards.get(prefix);
    let okk = false;
    try {
      okk = guard ? await guard(meta.userId, topic) : false;
    } catch (e) {
      logger.warn({ err: e, topic }, 'topic guard failed');
    }
    if (!okk) { rejected.push({ topic, code: 'FORBIDDEN' }); continue; }
    meta.ctx.subscribe(topic);
    accepted.push(topic);
  }
  return { topics: accepted, rejected };
}

// ------------------------------------------------------------------ built-in handlers (§4)
registerHandler('subscribe', z.object({ topics: z.array(z.string()).min(1).max(50) }), async (ctx, data) => {
  const ws = findSocket(ctx.connectionId);
  if (!ws) return { topics: [], rejected: [] };
  const res = await subscribeTopics(ws, data.topics);
  if (res.rejected.length && !res.topics.length) {
    const first = res.rejected[0]!;
    throw new ApiError(first.code, `Cannot subscribe to ${first.topic}`, { data: { topic: first.topic, rejected: res.rejected } });
  }
  return res;
});
registerHandler('unsubscribe', z.object({ topics: z.array(z.string()).min(1).max(200) }), (ctx, data) => {
  for (const t of data.topics) ctx.unsubscribe(t);
  return { topics: data.topics };
});
registerHandler('ping', z.any(), (ctx) => {
  ctx.send({ type: 'pong', data: {} });
  return undefined;
});
registerHandler('presence.ping', z.any(), (ctx) => {
  touchLastSeen(ctx.userId);
  return undefined;
});

// ------------------------------------------------------------------ presence (§5.3)
function relatedUserIds(userId: string): string[] {
  return q
    .all<{ user_id: string }>(
      `SELECT DISTINCT cm2.user_id
         FROM conversation_members cm1
         JOIN conversations c ON c.id = cm1.conversation_id
         JOIN conversation_members cm2 ON cm2.conversation_id = cm1.conversation_id AND cm2.user_id <> cm1.user_id AND cm2.left_at IS NULL
        WHERE cm1.user_id = ? AND cm1.left_at IS NULL
          AND (c.kind = 'direct' OR (SELECT COUNT(*) FROM conversation_members x WHERE x.conversation_id = c.id AND x.left_at IS NULL) <= 20)
        LIMIT 500`,
      [userId],
    )
    .map((r) => r.user_id);
}
function emitPresence(userId: string, online: boolean): void {
  const t = nowMs();
  const last = presenceLastEmit.get(userId) ?? 0;
  if (online && t - last < PRESENCE_COALESCE_MS) return;
  presenceLastEmit.set(userId, t);
  const lastSeenAt = online ? nowIso() : (q.get<{ last_seen_at: string | null }>('SELECT last_seen_at FROM users WHERE id = ?', [userId])?.last_seen_at ?? nowIso());
  const targets = relatedUserIds(userId).filter(isOnline);
  if (targets.length) publishMany(targets, { type: 'presence', data: { userId, online, lastSeenAt } });
}
function onUserConnected(userId: string): void {
  const t = offlineTimers.get(userId);
  if (t) { clearTimeout(t); offlineTimers.delete(userId); return; }
  touchLastSeen(userId);
  emitPresence(userId, true);
}
function onUserDisconnected(userId: string): void {
  if (isOnline(userId)) return;
  const t = setTimeout(() => {
    offlineTimers.delete(userId);
    if (!isOnline(userId)) {
      q.run('UPDATE users SET last_seen_at = ? WHERE id = ?', [nowIso(), userId]);
      presenceLastEmit.delete(userId);
      emitPresence(userId, false);
    }
  }, OFFLINE_GRACE_MS);
  offlineTimers.set(userId, t);
}

// ------------------------------------------------------------------ connection lifecycle
const socketsById = new Map<string, Socket>();
function findSocket(connectionId: string): Socket | undefined {
  return socketsById.get(connectionId);
}

function makeContext(ws: Socket, meta: Omit<Meta, 'ctx'>): WsContext {
  return {
    userId: meta.userId,
    connectionId: meta.connectionId,
    user: meta.user,
    subscribe(topic) {
      if (meta.topics.has(topic)) return;
      meta.topics.add(topic);
      let set = topicSockets.get(topic);
      if (!set) topicSockets.set(topic, (set = new Set()));
      set.add(ws);
    },
    unsubscribe(topic) {
      if (!meta.topics.delete(topic)) return;
      const set = topicSockets.get(topic);
      set?.delete(ws);
      if (set && set.size === 0) topicSockets.delete(topic);
    },
    isSubscribed: (topic) => meta.topics.has(topic),
    send: (event) => sendEvent(ws, event),
    throttle(key, ms) {
      const t = nowMs();
      const last = meta.throttles.get(key) ?? 0;
      if (t - last < ms) return false;
      meta.throttles.set(key, t);
      return true;
    },
  };
}

function allowRate(meta: Meta): boolean {
  const t = nowMs();
  const elapsed = (t - meta.lastRefill) / 1000;
  meta.tokens = Math.min(RATE_BURST, meta.tokens + elapsed * RATE_PER_SEC);
  meta.lastRefill = t;
  if (meta.tokens < 1) return false;
  meta.tokens -= 1;
  return true;
}

async function onMessage(ws: Socket, raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean): Promise<void> {
  const meta = ws.meta!;
  if (isBinary) { ws.close(CLOSE.PROTOCOL, 'binary frames not allowed'); return; }
  const text = Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : Buffer.from(raw as Buffer).toString('utf8');
  if (text.length > MAX_FRAME) { ws.close(CLOSE.PROTOCOL, 'frame too large'); return; }
  if (!allowRate(meta)) {
    meta.overLimitStrikes++;
    sendError(ws, 'RATE_LIMITED', 'Slow down');
    if (meta.overLimitStrikes > 30) ws.close(CLOSE.TOO_MANY, 'rate limit');
    return;
  }
  let parsed: { type?: unknown; id?: unknown; data?: unknown };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    sendError(ws, 'VALIDATION', 'Frame is not valid JSON');
    return;
  }
  const id = typeof parsed?.id === 'string' ? parsed.id : undefined;
  if (!parsed || typeof parsed.type !== 'string') { sendError(ws, 'VALIDATION', 'Missing frame type', id); return; }
  const h = handlers.get(parsed.type);
  if (!h) { sendError(ws, 'UNKNOWN_TYPE', `Unknown frame type ${parsed.type}`, id); return; }
  const v = h.schema.safeParse(parsed.data ?? {});
  if (!v.success) { sendError(ws, 'VALIDATION', 'Invalid payload', id, { fields: zodFields(v.error) }); return; }
  try {
    const out = await h.fn(meta.ctx, v.data);
    if (out !== undefined) sendEvent(ws, { type: 'ack', data: out }, id);
  } catch (e) {
    if (isApiError(e)) {
      const ae = e as ApiError;
      sendError(ws, ae.code, ae.message, id, { fields: ae.fields, data: ae.data });
    } else {
      logger.error({ err: e, type: parsed.type }, 'ws handler failed');
      sendError(ws, 'INTERNAL', 'Internal error', id);
    }
  }
}

function onConnection(ws: Socket, user: AuthUser): void {
  const existing = userSockets.get(user.id) ?? new Set<Socket>();
  if (existing.size >= MAX_SOCKETS_PER_USER) {
    ws.close(CLOSE.TOO_MANY, 'too many connections');
    return;
  }
  const base: Omit<Meta, 'ctx'> = {
    connectionId: uid(), userId: user.id, user, topics: new Set(), alive: true, pongTimer: null,
    tokens: RATE_BURST, lastRefill: nowMs(), overLimitStrikes: 0, throttles: new Map(),
  };
  const meta = base as Meta;
  meta.ctx = makeContext(ws, base);
  ws.meta = meta;
  existing.add(ws);
  userSockets.set(user.id, existing);
  socketsById.set(meta.connectionId, ws);

  ws.on('pong', () => {
    meta.alive = true;
    if (meta.pongTimer) { clearTimeout(meta.pongTimer); meta.pongTimer = null; }
  });
  ws.on('message', (data, isBinary) => { void onMessage(ws, data as Buffer, isBinary); });
  ws.on('error', (err) => logger.debug({ err, user: user.id }, 'ws error'));
  ws.on('close', () => {
    for (const t of [...meta.topics]) meta.ctx.unsubscribe(t);
    if (meta.pongTimer) clearTimeout(meta.pongTimer);
    socketsById.delete(meta.connectionId);
    const set = userSockets.get(user.id);
    set?.delete(ws);
    if (set && set.size === 0) userSockets.delete(user.id);
    onUserDisconnected(user.id);
  });

  if (user.banned === 1) {
    sendError(ws, 'BANNED', 'Account suspended');
    ws.close(CLOSE.BANNED, 'banned');
    return;
  }
  sendEvent(ws, {
    type: 'ready',
    data: {
      userId: user.id,
      connectionId: meta.connectionId,
      serverTime: nowIso(),
      unread: unreadCounts(user.id),
      flags: publicFlags(),
      resumeFrom: new Date(nowMs() - 2 * 60_000).toISOString(),
    },
  });
  onUserConnected(user.id);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}
function originAllowed(origin: string | undefined): boolean {
  if (!origin) return !config.isProd; // non-browser clients (tests) in dev
  if (config.webOrigins.includes(origin)) return true;
  if (!config.isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}
function rejectUpgrade(socket: Duplex, status: number, text: string): void {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/** Attaches the ws server to the HTTP server at path /ws. */
export function attach(server: HttpServer): WebSocketServer {
  wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, clientTracking: false });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== '/ws') { rejectUpgrade(socket, 404, 'Not Found'); return; }
    if (!originAllowed(req.headers.origin)) { rejectUpgrade(socket, 403, 'Forbidden'); return; }
    const cookies = parseCookies(req.headers.cookie);
    verifySession(cookies.sid)
      .then((session) => {
        const found = session ? loadUser(session.sub) : undefined;
        // revoked sessions (password change / logout everywhere) cannot open a socket either
        const user = found && (found.session_version ?? 0) === session!.sv ? found : undefined;
        if (!user) { rejectUpgrade(socket, 401, 'Unauthorized'); return; }
        wss!.handleUpgrade(req, socket, head, (ws) => onConnection(ws as Socket, user));
      })
      .catch((e) => {
        logger.warn({ err: e }, 'ws upgrade failed');
        rejectUpgrade(socket, 500, 'Internal Server Error');
      });
  });
  heartbeat = setInterval(() => {
    for (const set of userSockets.values()) {
      for (const ws of set) {
        const meta = ws.meta!;
        if (ws.readyState !== WebSocket.OPEN) continue;
        meta.alive = false;
        try { ws.ping(); } catch { /* ignore */ }
        if (meta.pongTimer) clearTimeout(meta.pongTimer);
        meta.pongTimer = setTimeout(() => {
          if (!meta.alive) ws.close(CLOSE.HEARTBEAT, 'heartbeat timeout');
        }, PONG_TIMEOUT);
      }
    }
  }, PING_EVERY);
  heartbeat.unref();
  logger.info('ws hub attached at /ws');
  return wss;
}

export const hub = {
  attach, publish, publishToUser, publishMany, publishTopic, publishToTopic, publishRole, broadcast, isOnline, onlineUsers,
  subscribersOf, registerHandler, registerTopicGuard, unsubscribeUser, kickUser, closeAll, clientCount, CLOSE_CODES,
};
export default hub;
