# Server guide — `server/` (安窝 Anwo API)

> Read this before writing a module. It explains how the server is organised, every scaffold helper you may call (with signatures and examples), how to add your module, and how to seed/test. The REST contract is `docs/API.md`, semantics are `docs/DATA_MODEL.md`, realtime is `docs/WS_EVENTS.md`, DDL is `server/src/db/schema.sql`.

Stack: Node 22 · Express 5 · TypeScript (run with `tsx`, no build step) · `node:sqlite` (`DatabaseSync`, synchronous) · `ws` · `jose` · `bcryptjs` · `zod` 3 · `multer` · `pino`. Imports are extensionless; `@shared/*` resolves to `shared/src/*` (tsconfig paths, honoured by tsx and tsc).

## 1. Layout

```
server/
  package.json            dev / start / typecheck / seed / test
  tsconfig.json           extends ../tsconfig.base.json, paths @shared/* → ../shared/src/*
  src/
    config.ts             env → config (PORT, DB_PATH, UPLOAD_DIR, JWT_SECRET, WEB_ORIGIN, …)
    index.ts              startServer(): openDb → app → ws hub → jobs → listen; graceful shutdown
    app.ts                express app: CORS, cookies, logging, JSON, /uploads static, /api routers, 404 + error envelope, prod SPA
    db/
      schema.sql          ALL tables (architect-owned, never edit)
      index.ts            openDb, q.all/get/run/tx/insert/update, toCamel, uid, now, migrations runner
      migrations/         NN_<module>.sql (10..19, see migrations/README.md) — additive only
      seed/index.ts       runner (core → listings → … → admin), idempotent via seed_meta
      seed/core.ts        campuses, flags, 47 users, avatars, alice's notifications
      seed/<key>.ts       YOUR module seed (stub: default export async seed(db), export const version)
    lib/                  scaffold helpers (READ-ONLY for module agents; request changes in docs/modules/<key>.md)
    realtime/hub.ts       WebSocket hub (/ws): publish / topics / handlers / presence
    modules/
      auth|users|campuses|uploads|notifications|search|meta|events|dev/routes.ts   scaffold cross-cutting routers
      <key>/routes.ts     YOUR router (default export Router), mounted at /api/<key>
      <key>/service.ts    YOUR stable cross-module exports (stubs throw NOT_IMPLEMENTED; keep the signatures)
      <key>/jobs.ts       optional: export const jobs = [{ name, everyMs, run }]
      <key>/ws.ts         optional (chat): hub.registerHandler(...) — import it from your routes.ts so it loads
  test/                   node --test + tsx (helpers.ts boots the real app on a temp DB)
  uploads/                public files (/uploads/*). seed/ assets are committed; the rest is gitignored
  data/                   SQLite files (gitignored). app.db default; test-<key>.db per agent
```

Request pipeline (`app.ts`): `cors → cookieParser → requestLog → json/text → anonSession(aid cookie) → /uploads static → /api: optionalAuth → csrf → globalRateLimit → routers → notFound → errorHandler`.

Because `optionalAuth` runs for every `/api` request, `req.user` is already populated (or undefined) inside every router; `requireAuth` only enforces it.

## 2. Conventions you must follow

- **Envelope**: always `ok(res, data)` / `paginated(res, page, extra)`; throw `ApiError` for failures (`fail('CODE')`). Never `res.json({...})` by hand.
- **Validation**: `parseBody(req, Schema)`, `parseQuery(req, Schema)`, `parseParams(req, idParam)` — zod failures become `400 VALIDATION { fields }` automatically. Put schemas the web needs in `shared/src/schemas/<key>.ts`.
- **Route order**: static paths (`/mine`, `/saved`, `/stats/campus`, …) before `/:id` (Express 5 matches literally).
- **DB**: snake_case SQL; use `q.*` with positional `?` params. Timestamps `nowIso()` (honours the dev clock offset), ids `uid()`. Counters maintained by triggers (DATA_MODEL §10) — never increment them in code.
- **Scope**: every list endpoint: `const scope = scopeFromQuery(req, parsed); const w = whereScope(scope, { alias: 'l' }); … paginated(res, page, { scope: scopeInfo(scope) })`.
- **Cards**: build `ListingCard` / `WantedCard` / `ItemCard` / `BuddyCard` only through `lib/cards.ts` so global search and your list look the same.
- **Trust/ban**: `requireTrust(n)`; banned users already fail writes in `requireAuth`.
- **Events**: log domain events with `logEvent(req, 'listing.view', {...})` (DATA_MODEL §4 eventType list).
- **Realtime**: publish via `hub.publish/publishTopic`; bell notifications via `notify()` (never publish `notification` yourself).
- **Audit**: every admin write → `audit(req, { action, entityType, entityId, before, after, reason })`.

## 3. Lib reference (`server/src/lib/*`)

### db (`src/db/index.ts`, also re-exported from `lib/db.ts`)
```ts
import { q, tx, uid, now, toCamel, parseJson, placeholders, bool } from '../../db';
q.all<T>(sql, params?)            // rows (params: positional array OR named object)
q.get<T>(sql, params?)            // first row | undefined
q.run(sql, params?)               // { changes, lastInsertRowid }
q.scalar<T>(sql, params?) / q.count(sql, params?)
q.tx(() => { ... })               // BEGIN IMMEDIATE … COMMIT, nested → SAVEPOINT; rethrows after ROLLBACK
q.insert('table', { col: v })     // INSERT helper ; q.update('table', { col: v }, 'id = ?', [id])
toCamel(row)                      // snake → camel, parses *_json (price_cents → priceCents, edu_domains_json → eduDomains)
placeholders(n)                   // '?, ?, ?'  for IN (...)
openDb(path) / getDb() / closeDb() / applyMigrations()
```
Binding rules: booleans → 0/1, `undefined` → NULL, Date → ISO, objects/arrays → JSON string. Rows are plain objects with a null prototype (spread/JSON fine).

### errors.ts
```ts
new ApiError(code, message?, { status?, fields?, data? })      // status defaults per API.md §1.5 table (ERROR_STATUS)
fail('NOT_FOUND') ; fail('TRUST_REQUIRED', 403, 'msg', { data: { required, current, nextStep } })
notFound('Listing') ; forbidden() ; invalidState(from, to)      // 409 INVALID_STATE { from, to }
asyncHandler(fn) ; errorHandler ; notFoundHandler ; zodFields(zodError)
```
`UNIQUE constraint failed` SQLite errors are mapped to `409 CONFLICT` automatically.

### http.ts
```ts
ok(res, data, status = 200) ; created(res, data) ; noContent(res)
paginated(res, { items, total, page, pageSize }, { scope, unreadCount, locked, … })
parse(schema, input) ; parseBody(req, schema) ; parseQuery(req, schema) ; parseParams(req, schema)
pageWindow({ page, pageSize }) → { limit, offset } ; clientIp(req)
```

### auth.ts
```ts
optionalAuth, requireAuth, requireRole('admin'|…), requireAdmin, requireTrust(n), requireFlag('escrow.enabled'), requireNotBanned, csrf
assertOwner(req, row.owner_id)            // owner or admin, else 403 FORBIDDEN ; isAdmin(req)
trustError(user, required)                // the TRUST_REQUIRED ApiError with nextStep ; nextTrustStep(user)
hashPassword(p) / verifyPassword(p, hash) ; signSession(user) / verifySession(token)
setSessionCookie(res, token) / clearSessionCookie(res) / setCampusCookie(res, campusId) ; cookieOf(req, 'campus')
loadUser(id) → AuthUser (users row minus password_hash) ; loadUserByEmail(email) ; touchLastSeen(userId)
SESSION_COOKIE='sid', CAMPUS_COOKIE='campus', LANG_COOKIE='lang', ANON_COOKIE='aid'
```
`req.user` type is `AuthUser` (`lib/types.ts`); `req.sessionId` is the anonymous `aid`.
CSRF: writes need `X-Requested-With: fetch`; exempt: `/api/events`, mock-stripe webhook, partner `converted`, `/api/dev/*`.

### ratelimit.ts
```ts
rateLimit('auth'|'codes'|'writes'|'reads')                         // presets from API.md §1.2
rateLimit({ name: 'geocode', limit: 30, windowMs: 60_000, key?: (req) => string })
checkRate(`recompute:${userId}`, 1, 60_000)                        // throws 429 RATE_LIMITED { retryAfterSec }
hit(key, limit, windowMs) → { ok, remaining, retryAfterSec } ; resetRateLimits()
```
`RATE_LIMIT_DISABLED=1` turns everything off (tests).

### geo.ts (DATA_MODEL §9)
```ts
haversineM(a, b) ; bboxAround(lat, lng, radiusM) ; haversineSql('l') + distanceParams(center) ; fuzz(id, lat, lng) ; round3(n) ; parseBbox(s)
scopeFromQuery(req, parsedScopeQuery, { allowNationwide?, requireCampus? }) → ResolvedScope
whereScope(scope, { alias: 'l', latCol, lngCol, cityCol, stateCol, campusCol, allowNationwide }) → { sql, params, distanceSql, distanceParams }
scopeInfo(scope) → ScopeInfo (echo in data.scope) ; resolveCampusId(req, explicit?)
geocode(address, { near?, campusId? }) → GeocodeResult & { cached, approx }   // cache → Nominatim (4 s) → campus-centroid fallback; never throws
suggestCampus(lat, lng) → { suggested (≤ 40 km) | null, nearest[3] } ; nearestCampuses(lat, lng, n) ; cityStateFromAddress(addr) ; stateAbbr('Illinois') → 'IL'
```
Example list query:
```ts
const p = parseQuery(req, ScopeQuery.merge(PaginationQuery).extend({ priceMax: z.coerce.number().int().optional() }));
const scope = scopeFromQuery(req, p);
const w = whereScope(scope, { alias: 'l' });
const where = `l.status = 'active' AND l.moderation_status = 'ok'${w.sql}`;
const params = [...w.params];
const total = q.count(`SELECT COUNT(*) FROM listings l WHERE ${where}`, params);
const order = p.sort === 'distance' && w.distanceSql ? `${w.distanceSql} ASC` : 'l.published_at DESC';
const rows = q.all<ListingCardRow>(`SELECT l.*${w.distanceSql ? `, ${w.distanceSql} AS distance_m` : ''} FROM listings l WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
  [...(w.distanceSql ? w.distanceParams : []), ...params, limit, offset]);   // distance params come FIRST when the expr is in SELECT
paginated(res, { items: listingCards(rows, { viewerId: req.user?.id }), total, page: p.page, pageSize: p.pageSize }, { scope: scopeInfo(scope) });
```
(`whereScope` puts the haversine params inside `w.params` for the WHERE clause; add `distanceParams` again wherever you repeat `distanceSql` in SELECT/ORDER BY, in SQL order.)

### cards.ts (DATA_MODEL §1 "lib/cards.ts")
```ts
listingCards(rows: ListingCardRow[], { viewerId?, exact?, isAdmin? }) → ListingCard[]   // batches owners, covers, saves; fuzzes lat/lng unless exact/owner
toListingCard(row, { owner, coverUrl, saved, sponsored, boostTier, exact })
wantedCards(rows) / toWantedCard(row, { owner, areas }) ; toArea(areaRow)
itemCards(rows, { viewerId?, isAdmin? }) / toItemCard(row, ctx)                           // pickup rounded to 3 decimals unless seller/admin
buddyCards(rows, { viewerId? }) / toBuddyCard(row, ctx)
toUserPublic(row) ; toCampusLite(idOrCampus)
```
Row types (`ListingCardRow` etc.) list the columns a `SELECT l.*` already provides; add `distance_m` when sorting by distance.

### users.ts
```ts
toUserPublic(row, { withStats? })        // badges, isPro, lastSeenAt bucket; withStats adds responseRate/responseMedianMin (detail pages only)
toUserMe(authUser, extra?)               // + private fields, campus, unread counts
loadUserPublic(id, { withStats? }) ; loadUserPublicRow(id) ; loadUsersPublic(ids) → Map<id, UserPublic>
USER_PUBLIC_SELECT / USER_PUBLIC_FROM    // 'SELECT ${USER_PUBLIC_SELECT} FROM ${USER_PUBLIC_FROM} WHERE u.id = ?'
unreadCounts(userId) → { notifications, messages }
```

### trust.ts (DATA_MODEL §5)
```ts
recomputeTrust(userId, reason?) → level     // after edu confirm, verification approve/reject, phone confirm, payment method add/remove
setTrustOverride(userId, level, actorId, reason)   // admin override; audited as user.trust_override; never auto-lowered unless banned
badgesFor(user) → Badge[] ; isPro(user) ; dailyMessageCap(trust) ; dailyNewConversationCap(trust)
```

### notify.ts (DATA_MODEL §2.4, WS_EVENTS §5.3)
```ts
notify(userId, 'wanted.offer', { title: { zh: '…', en: '…' } | 'string', body?, link: '/chat/<id>', entityType?, entityId?, data?, silent? })
notifyMany(userIds, kind, input) ; markRead(userId, id) ; markAllRead(userId, before?) ; pushCounts(userId) ; toNotificationDto(row) ; localize(v, locale)
```
Titles are localized at creation to the recipient's `locale`. Inserts the row and publishes `notification` (+ `unreadCount`) to the user.

### events.ts
```ts
logEvent(req | null, type, { entityType?, entityId?, props?, path?, userId?, campusId?, sessionId?, ts? }) → id
recentlyLogged({ userId, sessionId }, 'listing.view', 'listing', id, 6 * HOUR)   // view_count dedupe
campusIdOf(req) ; ipHashOf(req)
```

### audit.ts
```ts
audit(req, { action, entityType, entityId, before, after, reason })          // actor from req.user
audit(actorId | null, action, entityType, entityId, before, after, reason)     // positional form (jobs / services)
toAuditDto(row, actorUserPublic)
```

### reports.ts
```ts
createReport(req, { entityType, entityId, reason, details?, campusId? }) → Report   // idempotent per reporter+entity while open; pings admins (admin.queue)
toReportDto(row)
```

### conversations.ts (shared chat primitives; chat module builds REST/ws on top — see also `modules/chat/service.ts` stubs)
```ts
openConversation({ kind: 'direct'|'group'|'support', memberIds, campusId?, context?: { type, id }, createdBy?, title? }) → { conversation, created }
   // direct: deduped by direct_key (sorted ids + context); NO block / verified-only / quota checks — the chat service adds them
postMessage(conversationId, senderId | null, 'text'|'image'|'system'|'context_card', body, { uploadId?, context?, clientId?, replyToId?, notify? }) → Message
   // idempotent on clientId; publishes chat.message (topic) + chat.conversation (each member) + bell to members not subscribed
postContextCard(conversationId, senderId, contextCardFor('listing', id)!) ; postSystemMessage(conversationId, 'member_joined', { userId })
contextCardFor(type, id) → ContextCard | null  ; markConversationRead(conversationId, userId, messageId?)
isMember / assertMember / memberRow / conversationMembers(id) / addMembers(id, userIds) / removeMember(id, userId) / lockConversation(id, locked)
toMessageDto(row, { sender, image, readBy }) ; hydrateMessages(rows) ; loadConversation(id) ; loadMessage(id) ; isBlockedEither(a, b) ; directKey(a, b, ctx)
```

### sponsored.ts (DATA_MODEL §8)
```ts
sponsoredSlotCount(pageSize) ; sponsoredSlotPositions(pageSize)                 // 2 per 10 (idx 0,5); 1 for a partial block ≥ 5 (home 8 → idx 0)
pickSponsored({ entityType: 'listing'|'market_item'|'buddy_post', campusId? | city+state?, excludeIds?, slots, tier?: 'max' }) → { id, tier, boostId }[]
mergeSponsored(organicCards, sponsoredCards, pageSize)                         // dedupes organic, fills slot positions, never exceeds slots
recordImpressions(boostIds, req) ; recordClick(boostId, req) ; activeBoostFor(entityType, id)
```
Mark sponsored cards yourself (`sponsored: true, boostTier`) when loading them (cards ctx), e.g. `listingCards(sponsoredRows).map(c => ({ ...c, sponsored: true, boostTier }))`.

### shuttle.ts
```ts
nearestStop(lat, lng, campusId) === nearestStop(campusId, lat, lng) → { stop, distanceM } | null   // ≤ 3 km, active stops
commuteEstimate(campusId, lat, lng) → { distanceM, walkMin, bikeMin, shuttleMin, nearestStop }      // DATA_MODEL §3.5 formulas
```

### uploads.ts
```ts
uploadMiddleware                       // multer memory storage, field `file` (≤ 10 files)
storeUpload({ buffer, originalName, mime, ownerId, purpose, isPrivate?, allowSvg? }) → Upload   // sniffs mime, size limits, writes UPLOAD_DIR/yyyy/mm/<uuid>.<ext>
getUpload(id) → UploadRow ; toUploadDto(row) ; uploadFilePath(row) ; deleteUploadFile(row) ; uploadIsReferenced(id)
insertSeedUpload({ path: 'seed/rooms/r01.svg', purpose: 'seed', ownerId? }) → uploadId   // for seeds; idempotent on path
```
Seed asset naming (assets agent): `/uploads/seed/{avatars/a01..a40, rooms/r01..r60, items/i01..i60, buddy/b01..b20, partners/p01..p20, campus/c01..c10}.svg`.

### campuses.ts
```ts
getCampus(idOrSlug) → Campus | null ; requireCampus(id) ; allCampuses({ activeOnly? }) ; toCampusLite(id) ; campusesInCity(city, state)
campusForEmailDb(email) ; syncCampuses({ overwrite? }) ; ensureCampuses() ; invalidateCampuses()
```

### flags.ts
```ts
isEnabled('escrow.enabled', campusId?)   // missing row = enabled ; getFlag(key) ; flagValue(key, fallback) ; allFlags() ; publicFlags() ; invalidateFlags() ; ensureDefaultFlags()
```
Admin: after writing `feature_flags`, call `invalidateFlags()` and `hub.broadcast({ type: 'system.flags', data: publicFlags() })`.

### mailbox.ts / eduVerify.ts
```ts
sendEmailCode(email, purpose, { userId, campusId, locale }) → { id, code, expiresAt, expiresInSec, devCode? } ; verifyEmailCode(email, purpose, code)
sendSmsCode(userId, phone) ; verifySmsCode(userId, code)        // phone_codes; verify module uses these for /api/verify/phone/*
listMailbox({ email?, phone?, limit? }) ; clearMailbox()
requestEduCode(user, email) ; confirmEduCode(user, email, code)  // /api/verify/edu/* must alias these
```

### jobs.ts
```ts
registerJob(name, everyMs, fn) ; startJobs() ; stopJobs() ; runJob(name) ; listJobs()
// module: export const jobs = [{ name: 'expireBuddy', everyMs: 15 * 60_000, run: () => {...} }] in modules/<key>/jobs.ts (auto-registered as '<key>.<name>')
expireContent()  // scaffold hourly SQL: boosts scheduled→active→expired, listings/wanted/items/buddy → expired, stale orders → cancelled, proposed escrows → expired
```
Run one on demand in dev: `POST /api/dev/jobs/<name>/run`.

### hooks.ts
```ts
hooks.on('user.trustChanged', ({ userId, from, to, reason }) => …)   // billing: qualify referral when to >= 1
hooks.on('user.registered' | 'user.campusChanged' | 'user.banned' | 'flags.changed' | 'notification.created', handler)
```

### time.ts / ids.ts / logger.ts
`nowIso()`, `nowMs()`, `isoPlus(ms)`, `daysFromNow(d)`, `todayYmd(tz)`, `localHHMM(tz)`, `setTimeOffset(sec)` (dev clock), `MINUTE/HOUR/DAY`; `uid()`, `sixDigitCode()`, `referralCode()`, `sha256()`, `hash32()`, `slugify()`; `logger` (pino).

## 4. Realtime hub (`src/realtime/hub.ts`, WS_EVENTS §9)
```ts
import { publish, publishMany, publishTopic, publishRole, broadcast, isOnline, onlineUsers, subscribersOf, registerHandler, registerTopicGuard, unsubscribeUser, kickUser, clientCount } from '../../realtime/hub';
publish(userId, { type: 'entity.update', data })                       // topic user:<id>
publishTopic('conversation:<id>' | 'campus:<id>' | 'entity:<type>:<id>', event, { excludeUserId? })
registerHandler('chat.send', ChatSendSchema, async (ctx, data) => ({ messageId }))   // return → ack ; throw ApiError → error frame
registerTopicGuard('conversation', (userId, topic) => isMember(...))                 // scaffold defaults: campus → all, entity → all except escrow parties, conversation → membership
ctx: { userId, connectionId, user, subscribe(t), unsubscribe(t), isSubscribed(t), send(ev), throttle(key, ms) }
```
Built-in client frames: `subscribe`, `unsubscribe`, `ping`→`pong`, `presence.ping`, `notification.read`. Auth is the `sid` cookie on the upgrade (401/403 otherwise), `ready` is sent on connect, heartbeat 25 s / 4408, max 5 sockets per user (4429), 20 frames/s.

## 5. Adding your module

1. `server/src/modules/<key>/routes.ts` — replace the stub body; keep `export default router`. Mount order is fixed in `app.ts`.
2. `server/src/modules/<key>/service.ts` — implement the stable exports (DATA_MODEL §1 table). Other modules import only from `service.ts`.
3. `shared/src/schemas/<key>.ts` — zod input schemas the web needs (export them; `shared/src/index.ts` re-exports as `<key>Schemas`).
4. `server/src/db/seed/<key>.ts` — set `export const version = 1` and fill `seed(db)`; ≥ 3 campuses; images via `insertSeedUpload`. Re-run with `DB_PATH=server/data/test-<key>.db npm run seed -w server -- --modules core,<key> --force`.
5. Optional `jobs.ts` (`export const jobs = [...]`), `ws.ts` (import it from `routes.ts`), `migrations/NN_<key>.sql` (only if unavoidable; additive).
6. `docs/modules/<key>.md` — what you built, seed accounts, gaps, **integration requests** for `lib/**`.

Reporting endpoints: `router.post('/:id/report', requireAuth, (req, res) => ok(res, createReport(req, { entityType: 'listing', entityId: id, ...parseBody(req, ReportInput), campusId })))`.

Contact / "message host" flows: `chat.service.openConversation(...)` → `listings.service.recordLead(...)` → `logEvent(req, 'listing.contact_click')` → `notify(hostId, …)`.

## 6. Running, seeding, testing

```bash
npm install --no-audit --no-fund                 # root (workspaces: shared, server, web)
npm run dev                                      # server :4000 + web :5173 (concurrently) — not during a parallel phase
PORT=4101 DB_PATH=server/data/test-listings.db npm run dev -w server          # your own server
DB_PATH=server/data/test-listings.db npm run seed -w server                   # all seeds (core first)
DB_PATH=server/data/test-listings.db npm run seed -w server -- --modules core,listings --force
npm run typecheck                                # shared + server + web (tsc --noEmit)
npm test -w server                               # node --test (temp DB per file, rate limits + jobs disabled)
NODE_ENV=production npm start                    # serves web/dist with SPA fallback (run `npm run build` first)
```
Dev helpers (non-production only): `GET /api/dev/mailbox?email=`, `DELETE /api/dev/mailbox`, `POST /api/dev/login-as { email }`, `POST /api/dev/seed { modules?, force? }` (test DBs only), `POST /api/dev/time { offsetSec }`, `GET /api/dev/jobs`, `POST /api/dev/jobs/:name/run`, `POST /api/dev/rate-limits/reset`.

Seed accounts (password `Passw0rd!`): `admin@example.edu` (admin, L3), `alice@u.northwestern.edu` (L2), `bob@u.northwestern.edu` (L1), `landlord@evanstonhomes.com` (landlord, L3), `newbie@u.northwestern.edu` (L0), plus ~42 users across northwestern / uiuc / nyu / usc / umich (see `seed/core.ts`, `SEED_USERS`). User ids are deterministic (`seedUserId(email)`), but look them up by email in your seed.

Writing a test: copy `test/campuses.test.ts` — `boot(name)` starts the real app on an ephemeral port with a temp DB; `client(base)` is a cookie-jar fetch that sets the CSRF header.

## 7. Environment variables

| Var | Default | Notes |
|---|---|---|
| `PORT` | `4000` | HTTP + ws port |
| `HOST` | `0.0.0.0` | |
| `NODE_ENV` | `development` | `production` enables secure cookies, strict origins, SPA serving, hides `/api/dev` and `devCode` |
| `DB_PATH` | `server/data/app.db` | relative to repo root; created with WAL |
| `UPLOAD_DIR` | `server/uploads` | served at `/uploads` (1 day cache) |
| `UPLOAD_PRIVATE_DIR` | `server/data/private-uploads` | verification docs, streamed via `/api/uploads/:id/file` |
| `JWT_SECRET` | dev default | required in production |
| `WEB_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | CORS + ws Origin allow-list (csv); any `localhost:*` allowed outside prod |
| `NOMINATIM_URL` | `https://nominatim.openstreetmap.org` | geocoder (1 req/s, 4 s timeout, User-Agent set) |
| `GEOCODE_OFFLINE` | – | `1` = skip network, campus-centroid fallback (`approx: true`) |
| `LOG_LEVEL` | `info` (`warn` in test) | pino |
| `RATE_LIMIT_DISABLED` / `JOBS_DISABLED` | – | `1` to disable (tests) |
| `ALLOW_SEED_API` | – | allow `POST /api/dev/seed` on non `test-*.db` files |
| `SERVE_WEB` | – | `1` serves `web/dist` outside production |
| `APP_VERSION` | `0.1.0` | shown by `/api/meta` |

## 8. Known gaps / notes for module agents

- `modules/<key>/service.ts` stubs throw `NOT_IMPLEMENTED` (501) until the owner implements them; `shuttle`, `map`, `billing` stubs already re-export the scaffold implementations (`nearestStop`, `geocode`, `pickSponsored`).
- `lib/conversations.ts` deliberately performs no block / verified-only / banned / quota checks — the chat service must add them (DATA_MODEL §3.3) and register the `chat.*` ws handlers (`hub.registerHandler`) and the `conversation` topic guard if it wants different semantics than membership.
- Referral qualification/reward (DATA_MODEL §3.9) is billing's: subscribe to `hooks.on('user.trustChanged')`.
- Nominatim is only reachable when the sandbox allows outbound HTTPS from Node (no proxy support in `fetch`); seeds and tests should set `GEOCODE_OFFLINE=1` and pass explicit coordinates.
- The scaffold `expireContent` job is coarse SQL; modules may register finer jobs (e.g. escrow `funded → in_inspection`, subscription renewals) in their own `jobs.ts`.
