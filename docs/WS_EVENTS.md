# WebSocket Protocol — campus-sublet

> Single `ws` server attached to the HTTP server at path **`/ws`** (`server/src/realtime/server.ts`, scaffold-owned). Hub API in `server/src/realtime/hub.ts`. The **chat** module owns all `chat.*` handling (`server/src/modules/chat/ws.ts`, registered through `hub.registerHandler(type, fn)`); every other module only calls `hub.publish(...)`. The web client lives in `web/src/lib/ws.ts` (Zustand store `useWs()`), scaffold-owned.

Contents
1. Connection & authentication
2. Envelope
3. Topics & subscriptions
4. Client → server messages
5. Server → client events
6. Error handling, acks, idempotency
7. Heartbeat, reconnect & backoff
8. Polling fallback (offline / WS blocked)
9. Server hub API (for module authors)
10. Sequence examples

---

## 1. Connection & authentication

- URL: `ws(s)://<host>/ws` (Vite dev proxies `/ws` with `ws: true`). No query-string tokens.
- Auth: the browser sends the `sid` httpOnly cookie on the upgrade request. The server verifies the JWT in the `upgrade` handler, re-reads the user row (`banned`, `deleted_at`), and:
  - valid → completes the upgrade and immediately sends `ready` (§5.1);
  - invalid/missing → responds `HTTP 401` to the upgrade (the socket never opens). The client then stops reconnecting until a login succeeds (`useAuth` store change re-triggers connect).
  - banned → upgrade succeeds then `error { code: 'BANNED' }` followed by close code `4403`.
- `Origin` must match the configured app origin(s) (`APP_ORIGIN`, plus any `localhost:5xxx` in dev) → else `403`.
- Max 5 concurrent sockets per user (multiple tabs). Extra connections are closed with `4429`.
- Max frame size 64 KB; messages are JSON text frames only. Binary frames → `4400`.
- Close codes used by the server: `1000` normal, `1001` server shutdown (client reconnects immediately), `4400` protocol error, `4401` auth expired (client must refresh session: call `GET /api/auth/me`; if 401 → logged out), `4403` banned, `4429` too many connections, `4408` heartbeat timeout.

## 2. Envelope

Every frame in both directions is one JSON object:

```ts
type Frame<T extends string = string, D = unknown> = {
  type: T;            // dotted name, e.g. 'chat.send', 'chat.message'
  id?: string;        // client → server: optional request id echoed in 'ack' / 'error'
  ts: string;         // ISO-8601 UTC when the frame was created (server frames: server time)
  data?: D;           // payload (shape per type)
};
```
Unknown `type` → `error { code: 'UNKNOWN_TYPE' }`. Payload validation uses zod; failures → `error { code: 'VALIDATION', fields }`. Server frames always have `ts`; it is the authoritative clock for ordering and for `since` cursors.

## 3. Topics & subscriptions

A connection is **implicitly** subscribed to its own user topic `user:<myId>` (notifications, presence of contacts, conversation summaries for every conversation I belong to). Clients subscribe explicitly to:

| Topic | Who may subscribe | Delivers |
|---|---|---|
| `conversation:<id>` | members (`left_at IS NULL`) | `chat.message`, `chat.typing`, `chat.read`, `chat.member` for that conversation |
| `campus:<id>` | anyone authenticated | `shuttle.alert`, `system.*` scoped to the campus, `buddy.event` live updates |
| `entity:<type>:<id>` | anyone authenticated | `entity.update` (listing/item/buddy status or price changed — used by detail pages to refresh); `escrow.state` for escrow entities (parties only) |

Rules: subscribing to a topic you may not read → `error { code: 'FORBIDDEN', data: { topic } }`. Max 200 topics per connection. Subscriptions do **not** survive reconnect — the client re-sends `subscribe` after every `ready` (the store keeps the desired set). The server automatically unsubscribes a user from `conversation:<id>` when they leave/are removed.

Note: `chat.message` for conversations the user is a member of is **also** delivered on the implicit `user:` topic as a lightweight `chat.conversation` summary (unread counts for the inbox), so the inbox list stays live without subscribing to every thread. Full messages require the `conversation:` subscription.

## 4. Client → server messages

| type | data (zod) | Effect | Response |
|---|---|---|---|
| `subscribe` | `{ topics: z.array(z.string().regex(/^(conversation|campus|entity):[\w:-]+$/)).min(1).max(50) }` | adds topics | `ack { topics: string[] (accepted), rejected: { topic, code }[] }` |
| `unsubscribe` | `{ topics: string[] }` | removes | `ack` |
| `chat.send` | `{ conversationId: string, clientId: z.string().uuid(), kind: z.enum(['text','image']).default('text'), body: z.string().max(4000).optional(), uploadId: z.string().optional(), replyToId: z.string().optional() }` | same code path as `POST /api/chat/conversations/:id/messages` (membership, blocks, quotas, locked). Persists message, bumps counters (trigger), then publishes `chat.message` to `conversation:<id>` and `chat.conversation` to each member's `user:` topic, and `notification` (`chat.message`) to members **not currently subscribed** to that conversation topic (so a user reading the thread doesn't get a bell for it). | `ack { messageId, clientId, createdAt }` or `error { code: 'BLOCKED'\|'VERIFIED_ONLY'\|'QUOTA_EXCEEDED'\|'FORBIDDEN'\|'NOT_FOUND'\|'VALIDATION', data: { clientId } }` |
| `chat.typing` | `{ conversationId: string, typing: boolean }` | not persisted; fan-out to other members on `conversation:<id>`; throttled server-side to 1 per 2 s per (user, conversation); auto-expires client-side after 5 s | none (fire-and-forget) |
| `chat.read` | `{ conversationId: string, messageId?: string }` | marks read up to `messageId` (default newest): updates `conversation_members.last_read_*`, resets `unread_count` to 0, inserts `message_reads`; publishes `chat.read` to the conversation topic and `chat.conversation` (unread 0) to the reader's own `user:` topic (other tabs) | `ack { conversationId, lastReadMessageId, unreadCount: 0 }` |
| `presence.ping` | `{}` | updates `users.last_seen_at` (throttled 5 min) and marks online | none |
| `ping` | `{}` | heartbeat | `pong {}` |
| `notification.read` | `{ id?: string, all?: boolean }` | same as REST read endpoints (convenience for the bell) | `ack { unreadCount }` |

Any frame may carry `id`; the matching `ack`/`error` echoes it. Client should treat a missing `ack` within 10 s as a timeout and fall back to the REST equivalent (which is idempotent via `clientId`).

## 5. Server → client events

### 5.1 Session
| type | data |
|---|---|
| `ready` | `{ userId, connectionId, serverTime: ISO, unread: { notifications: number, messages: number }, flags: Record<string, boolean> (public feature flags), resumeFrom: ISO (server's suggestion = now - 2 min; client uses `max(lastEventTs, resumeFrom)` for the REST catch-up in §7) }` |
| `pong` | `{}` |
| `ack` | `{ ...per request }` with the request `id` echoed on the frame |
| `error` | `{ code: string, message: string, fields?: Record<string,string>, data?: unknown }` (+ request `id` if applicable). Codes: `UNKNOWN_TYPE`, `VALIDATION`, `FORBIDDEN`, `NOT_FOUND`, `BLOCKED`, `VERIFIED_ONLY`, `QUOTA_EXCEEDED`, `BANNED`, `RATE_LIMITED`, `INTERNAL` |
| `system.flags` | `Record<string, boolean>` — feature flags changed (admin PUT); client invalidates `/api/meta` query |
| `system.banner` | `{ id, severity, title, titleZh, body?, bodyZh?, link?, campusId? }` — maintenance / campus-wide notices |
| `session.expired` | `{}` — sent right before close `4401` |

### 5.2 Chat (topic `conversation:<id>` unless noted)
| type | data |
|---|---|
| `chat.message` | `Message` (API.md DTO, with `sender: UserPublic` embedded; for `deleted` messages `{ id, conversationId, deletedAt, deleted: true }`; for edits the full message with `editedAt`) |
| `chat.typing` | `{ conversationId, userId, typing: boolean }` (never echoed to the sender) |
| `chat.read` | `{ conversationId, userId, lastReadMessageId, readAt }` |
| `chat.member` | `{ conversationId, event: 'joined'\|'left'\|'removed'\|'added', userId, user?: UserPublic }` (accompanies a `system` kind `chat.message`) |
| `chat.conversation` (on `user:<id>`) | `{ conversationId, lastMessage: { id, kind, preview, senderId, createdAt }, lastMessageAt, unreadCount: number (for the recipient user), totalUnread: number, context?: ContextCard, title?, kind }` — inbox row update |
| `chat.locked` (on `user:` of members) | `{ conversationId, locked: boolean }` |

### 5.3 Notifications & presence (topic `user:<id>`)
| type | data |
|---|---|
| `notification` | `Notification` DTO + `{ unreadCount }` (the bell). Kinds in DATA_MODEL §4. |
| `notification.count` | `{ notifications, messages }` (after read-all / cross-tab) |
| `presence` | `{ userId, online: boolean, lastSeenAt: ISO\|null }` — emitted for users the recipient shares an active conversation with (direct) or a group with ≤ 20 members; coalesced at most every 30 s per user. Online = any open socket; offline = last socket closed + 30 s grace. |

### 5.4 Domain events published by other modules
| type | topic | data | Publisher |
|---|---|---|---|
| `match.new` | `user:` | `{ wantedId, listingId, score, listing: ListingCard }` (also creates a `notification`) | wanted |
| `wanted.offer` | `user:` | `{ wantedId, listingId, conversationId, host: UserPublic }` | wanted |
| `entity.update` | `entity:<type>:<id>` | `{ type, id, changes: { status?, priceCents?, boostedUntil?, memberCount?, ... }, updatedAt }` | listings / market / buddy / billing |
| `escrow.state` | `user:` (both parties) and `entity:escrow:<id>` | `{ escrowId, from, to, actorId, escrow: Escrow }` | billing |
| `order.update` | `user:` | `{ orderId, status, payment?: { status, failureCode } }` (mock webhook outcomes) | billing |
| `boost.update` | `user:` | `{ boostId, entityType, entityId, status, endsAt }` | billing |
| `verify.update` | `user:` | `{ requestId, status, reason?, trustLevel }` | verify |
| `shuttle.alert` | `campus:<id>` | `ShuttleAlert & { action: 'created'\|'updated'\|'removed' }` | shuttle |
| `buddy.event` | `campus:<id>` and `user:` of members | `{ postId, event: 'joined'\|'left'\|'full'\|'reopened'\|'cancelled'\|'updated', memberCount, status }` | buddy |
| `admin.queue` | `user:` of admins (role=admin) | `{ queue: 'verification'\|'reports'\|'escrows', delta: +1\|-1, count }` | verify / admin / billing |

## 6. Error handling, acks, idempotency

- `chat.send` is idempotent on `(conversationId, senderId, clientId)` (unique index). A resend after a timeout returns `ack` with the original `messageId`.
- Client keeps an **outbox**: messages are rendered optimistically with `status: 'sending'`; on `ack` → `sent`; on `error` → `failed` with a retry affordance; on reconnect the outbox is flushed in order (WS if open, else REST POST with the same `clientId`).
- Server never throws on a bad frame: it replies `error` and keeps the socket open, except for protocol violations (`4400`) and auth (`4401/4403`).
- Rate limit: 20 frames/s per connection sustained (burst 60) → `error RATE_LIMITED` then `4429` if it continues.

## 7. Heartbeat, reconnect & backoff

- Server sends a WS-level `ping` every 25 s; a client that does not answer (browser auto-pongs) within 10 s is closed with `4408`. Clients additionally send app-level `ping` every 30 s when the tab is visible and use the `pong` to detect half-open sockets (no `pong` in 10 s → force close & reconnect).
- Client reconnect policy (in `web/src/lib/ws.ts`):
  - On close codes `1001`, `1006`, `4408`, network errors: reconnect with exponential backoff `delay = min(30s, 1s * 2^attempt) * (0.5 + random())` (full jitter), attempt resets after a connection stays open ≥ 30 s.
  - On `4401`/HTTP 401: stop; wait for auth store change.
  - On `4403`: stop permanently for this session; UI shows the suspended state.
  - On `4429`: retry once after 5 s, then stop (another tab owns the live connection; this tab uses polling §8).
  - When `document.visibilityState` becomes `visible` or `navigator.onLine` fires, reconnect immediately (attempt = 0).
- **Resume after reconnect** (no server-side replay buffer; REST is the source of truth):
  1. On `ready`, client re-sends `subscribe` for all desired topics.
  2. Client calls `GET /api/chat/sync?since=<lastEventTs>` (where `lastEventTs` = `ts` of the last processed server frame, or `ready.resumeFrom` if none) and merges conversations/messages/reads into React Query caches (dedupe by id).
  3. Client calls `GET /api/notifications/unread-count` and, if the bell is open, `GET /api/notifications?unreadOnly=true`.
  4. For currently open detail pages subscribed to `entity:` topics, the page refetches its query once.
- Exactly-once is not guaranteed; all client reducers must be idempotent on `id`.

## 8. Polling fallback

When the socket is not open (blocked by proxy, `4429` secondary tab, or more than 3 consecutive failed reconnect attempts), the client enters **polling mode** and shows a subtle "reconnecting" pill. It leaves polling mode as soon as a socket reaches `ready`.

| Need | Endpoint | Interval |
|---|---|---|
| New messages / inbox / read receipts / presence | `GET /api/chat/sync?since=<lastSyncTs>` → `{ conversations, messages, reads, presence, now }`; client sets `lastSyncTs = now` | 5 s while a chat view is open and the tab is visible; 20 s otherwise; paused when hidden |
| Messages in the open thread (cheap, cursor-based) | `GET /api/chat/conversations/:id/messages?after=<newestId>` | 3 s while the thread is open (in addition to sync, to minimise latency) |
| Typing indicator (send) | `POST /api/chat/conversations/:id/typing { typing }` | on keystroke, throttled 2 s; receiving side gets `typing` flags inside `/api/chat/sync` (`conversations[].typingUserIds`, computed from a 5-s in-memory window on the server) |
| Read receipts (send) | `POST /api/chat/conversations/:id/read` | on view |
| Notifications | `GET /api/notifications/unread-count`; `GET /api/notifications?unreadOnly=true` when the bell opens | 30 s |
| Shuttle alerts | `GET /api/shuttle/alerts?campusId=` | 60 s on shuttle pages |
| Escrow / order status pages | refetch the page query | 10 s while a non-terminal status is shown |

Sending messages in polling mode uses `POST /api/chat/conversations/:id/messages` with the same `clientId`. The REST and WS paths share one service function so behaviour is identical.

## 9. Server hub API (for module authors)

`server/src/realtime/hub.ts` (read-only for module agents, used via import):

```ts
export type WsEvent = { type: string; data?: unknown; ts?: string };

export function publish(userId: string, event: WsEvent): void;              // → topic user:<userId> (all of that user's sockets)
export function publishMany(userIds: string[], event: WsEvent): void;
export function publishTopic(topic: string, event: WsEvent, opts?: { excludeUserId?: string }): void; // 'conversation:<id>' | 'campus:<id>' | 'entity:<type>:<id>'
export function publishRole(role: 'admin', event: WsEvent): void;
export function isOnline(userId: string): boolean;
export function onlineUsers(userIds: string[]): Record<string, boolean>;
export function subscribersOf(topic: string): Set<string>;                 // userIds currently subscribed (chat uses it to decide notification vs. in-thread delivery)
export function registerHandler<T>(type: string, schema: ZodType<T>, handler: (ctx: WsContext, data: T) => Promise<unknown | void>): void;
export function registerTopicGuard(prefix: 'conversation' | 'campus' | 'entity', guard: (userId: string, topic: string) => Promise<boolean>): void;
export type WsContext = { userId: string; connectionId: string; user: UserRow; subscribe(topic: string): void; unsubscribe(topic: string): void; send(event: WsEvent): void };
```
- Handlers return a value → sent as `ack { ...value }` with the request id; throw `ApiError` → sent as `error` with its code.
- The chat module registers handlers for `chat.send`, `chat.typing`, `chat.read` and the `conversation` topic guard. Scaffold registers `subscribe/unsubscribe/ping/presence.ping/notification.read` and the `campus`/`entity` guards (entity guard: public entities → allowed; `escrow` → parties only).
- `notify()` in `server/src/lib/notify.ts` inserts the notification row and publishes `notification` to the user; modules should use it rather than publishing `notification` directly.
- Single-process only (no Redis); `hub` keeps `Map<userId, Set<socket>>` and `Map<topic, Set<socket>>`.

## 10. Sequence examples

**A. Open app, read a thread, send a message**
```
C → S  (upgrade with cookie sid)
S → C  {type:'ready', data:{userId:'u2', unread:{notifications:1,messages:3}, resumeFrom:'…'}}
C → S  {type:'subscribe', id:'r1', data:{topics:['conversation:c1','campus:northwestern']}}
S → C  {type:'ack', id:'r1', data:{topics:['conversation:c1','campus:northwestern'], rejected:[]}}
C      GET /api/chat/sync?since=<resumeFrom>   (catch-up)
C → S  {type:'chat.read', id:'r2', data:{conversationId:'c1'}}
S → C  {type:'ack', id:'r2', data:{conversationId:'c1', lastReadMessageId:'m9', unreadCount:0}}
S → u1 {type:'chat.read', data:{conversationId:'c1', userId:'u2', lastReadMessageId:'m9', readAt:'…'}}
C → S  {type:'chat.typing', data:{conversationId:'c1', typing:true}}
C → S  {type:'chat.send', id:'r3', data:{conversationId:'c1', clientId:'7f…', kind:'text', body:'明天下午可以看房吗？'}}
S → C  {type:'ack', id:'r3', data:{messageId:'m10', clientId:'7f…', createdAt:'…'}}
S → conversation:c1  {type:'chat.message', data:{id:'m10', …, sender:{…}}}
S → user:u1 {type:'chat.conversation', data:{conversationId:'c1', unreadCount:1, totalUnread:4, lastMessage:{…}}}
S → user:u1 {type:'notification', data:{kind:'chat.message', link:'/chat/c1', …, unreadCount:2}}   (only if u1 is not subscribed to conversation:c1)
```

**B. Host offers a place to a wanted post (REST write → WS fan-out)**
```
host   POST /api/wanted/w1/offer {listingId:'l1'}
server openConversation + postContextCard + matches.status='offered' + listing_leads + notify(seeker,'wanted.offer')
S → user:seeker {type:'wanted.offer', data:{wantedId:'w1', listingId:'l1', conversationId:'c7', host:{…}}}
S → user:seeker {type:'notification', data:{kind:'wanted.offer', …}}
S → user:seeker {type:'chat.conversation', data:{conversationId:'c7', unreadCount:1, …}}
```

**C. Reconnect**
```
socket closes (1006) → backoff 1.3 s → reconnect → ready → subscribe(all desired topics) → GET /api/chat/sync?since=lastEventTs → GET /api/notifications/unread-count
```
