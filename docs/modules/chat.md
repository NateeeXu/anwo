# Module `chat` — 站内聊天

Owner: chat module agent. Spec: API.md §5, WS_EVENTS.md (all), DATA_MODEL §3.3, DESIGN §4.9 / §7.6.
Ports used for verification: server `4103`, web `5103`, DB `server/data/test-chat.db`.

## What was built

**Server** (`server/src/modules/chat/`)
- `routes.ts` — every endpoint of API.md §5 plus a small admin surface (below). Static paths before `/:id`; `requireAuth` on the router; `rateLimit('writes')` on mutations; `requireTrust(1)` on `POST /conversations`.
- `service.ts` — domain logic on top of the scaffold `lib/conversations.ts` (not forked): conversation DTOs with batch hydration, inbox list/filter/search, open/dedupe with **BLOCKED / VERIFIED_ONLY / BANNED / TRUST_REQUIRED / QUOTA_EXCEEDED** guards (daily new-conversation cap and daily message cap by trust: L0 can only reply in threads where someone already wrote to them, L1 50/day, L2 200/day, L3 unlimited), one `sendMessage()` code path shared by REST and ws (idempotent on `clientId`, locked / left / blocked / upload ownership checks), read receipts (`readBy` on own messages from `message_reads` + members' `last_read_at`), typing window (5 s in-memory, surfaces in `/sync` as `typingUserIds`), edit/delete within 10 min (admin any time), search (`LIKE`, caller's threads only), `/sync?since=` (conversations updated, messages created/edited/deleted, reads, presence), presence, blocks (archives shared direct threads for the blocker), groups (owner adds/removes members, leave with system message), admin stats / list / lock.
- `ws.ts` — `hub.registerHandler('chat.send' | 'chat.typing' | 'chat.read')` + the `conversation` topic guard. `chat.send` acks `{ messageId, clientId, createdAt, message }`; errors carry `data.clientId`. Typing is throttled 1/2 s per connection.
- Analytics via `lib/events`: `chat.start`, `chat.message`, `chat.block`, `chat.unblock`, `chat.report`. Bell notifications come from `lib/conversations.postMessage` (members not subscribed to the thread topic, muted threads skipped, one per thread per 10 min) and from `notify()` when someone is added to a group.
- Stable exports consumed by other modules (signatures as in the scaffold stub): `openConversation({ initiatorId, recipientId, context?, firstMessage?, source? })`, `openGroupConversation({ ownerId, title, context?, memberIds, campusId? })` (one group per context entity, re-used + members topped up), `postSystemMessage`, `postContextCard`.

**Shared** — `shared/src/schemas/chat.ts`: zod inputs for every endpoint + ws frames, and DTO types `ConversationDto` (superset of `Conversation`: `messageCount`, `peer`, `memberCount`, `blockedByMe`, `blockedMe`, `myRole`, `mutedUntil`, `typingUserIds`), `MessagesPage`, `SearchHit`, `SyncResult`, ws event payload types.

**Seed** — `server/src/db/seed/chat.ts` (version 1): 25 conversations (21 direct, 4 buddy group chats) across Northwestern, UIUC and NYU; 139 messages (bilingual threads, context cards as the first message, 2 image messages, system pills), read states, mutes, archives, one blocked pair (alice → Lakeshore Rentals, off-platform deposit request) with an open `scam` report, and two unread bell notifications for alice. Alice has **8 threads with unread messages** (15 unread total). Context entities are taken from other modules' seeds when present, otherwise minimal fallback rows prefixed `chatseed-` are inserted (10 listings, 3 items, 4 buddy posts); every thread also stores its context card on the first message so it keeps rendering if the entity is later removed. Re-run: `GEOCODE_OFFLINE=1 DB_PATH=server/data/test-chat.db npm run seed -w server -- --modules core,chat --force`.

**Web** (`web/src/features/chat/`)
- `/chat` split layout (DESIGN §7.6): list `w-360` with search + tabs 全部 / 未读 / 群组 / 归档 on the left, thread on the right (empty-state placeholder when nothing is selected); mobile: list page → thread page (shell back chevron, bottom tabs hidden). `/chat/blocks` block list. Route `handle.layout = 'full'`.
- Thread: header (avatar, trust badge, online / recently / program, group member count, lock icon), sticky context card with price + 「查看」, scam-warning banner on fresh threads (≤ 3 messages, not dismissed, flag `scam_banner.enabled`) with 了解更多 → `/safety`, day separators, bubbles per DESIGN §4.9 (inverse mine / surface theirs, tail corner, timestamps on 5-min boundaries and on tap, double-check read receipts turning accent when read), image messages, system pills, typing indicator, 「N 条新消息」 jump pill, load-earlier with scroll anchoring, per-message menu (copy / report / delete ≤ 10 min), in-thread search with highlighted hits and `?m=<id>` deep link.
- Composer: auto-grow textarea (Enter sends, Shift+Enter newline, IME-safe), image send (single file → `uploadFiles(file,'chat')` → image message), per-thread draft in localStorage. Locked / blocked / needs-verification states replace the composer.
- Actions menu: search, profile / members, mute (8 h / 1 week / indefinitely) / unmute, archive / unarchive, block (with reason) / unblock, report (reason + details, optional "also block"), leave group.
- Realtime (`hooks.ts`): subscribes `conversation:<id>` for the open thread; reducers for `chat.message` (incl. deleted), `chat.conversation`, `chat.typing`, `chat.read`, `chat.member`, `chat.locked`, `presence`; optimistic send with `clientId` (ws `chat.send` → REST fallback with the same id; failed state + retry); `ready` → `GET /api/chat/sync?since=max(lastEventTs, resumeFrom)` catch-up; polling fallback (sync every 5 s + `messages?after=` every 3 s) with the 「连接中…」 pill when `useWsPolling()` is true.
- Admin panel (`admin.tsx`, mounted by the admin module at `/admin/chat`): stat tiles, searchable conversation table (members, last message, open reports), lock / unlock with reason, last-50-messages peek.
- i18n: `web/src/i18n/chat.ts`, every string in zh-CN and en.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/chat/conversations` | `page,pageSize,archived,kind(csv),unreadOnly,q,updatedSince` → `Paginated<ConversationDto> & { totalUnread }` |
| POST | `/api/chat/conversations` | trust ≥ 1; `{ userId, context?, message? }` → `ConversationDto & { created }` (201 when created); `?source=` for analytics |
| GET / PATCH | `/api/chat/conversations/:id` | PATCH `{ archived?, mutedUntil?, scamBannerDismissed? }` |
| GET / POST | `/api/chat/conversations/:id/messages` | `before/after/limit` → `MessagesPage`; POST `{ kind, body?, uploadId?, clientId?, replyToId? }` (idempotent) |
| POST | `/api/chat/conversations/:id/read` · `/typing` · `/leave` · `/report` | |
| POST / DELETE | `/api/chat/conversations/:id/members[/:userId]` | group owner / admin |
| PATCH / DELETE | `/api/chat/messages/:id` | sender ≤ 10 min (delete: admin any time) |
| POST | `/api/chat/messages/:id/report` | |
| GET | `/api/chat/search` · `/sync` · `/unread-count` · `/presence` | |
| GET / POST / DELETE | `/api/chat/blocks[/:userId]` | |
| GET | `/api/chat/admin/stats` · `/admin/conversations` · `/admin/conversations/:id/messages` | admin |
| POST | `/api/chat/admin/conversations/:id/lock` | admin, `{ locked, reason? }`, audited |

ws: `chat.send`, `chat.typing`, `chat.read` (WS_EVENTS §4); events per §5.2.

## Components / hooks other modules can import (`@/features/chat`)

```ts
import { openChatWith, useUnreadMessages, conversationTitle, previewText } from '@/features/chat'
// "Message host / seller / buy via chat" CTAs:
await openChatWith({ userId: listing.owner.id, context: { type: 'listing', id: listing.id }, message: { body }, source: 'listing_detail', navigate })
// throws ApiError BLOCKED | VERIFIED_ONLY | TRUST_REQUIRED | QUOTA_EXCEEDED — map with errorMessage(t, e); TRUST_REQUIRED → route to /verify-email
const unread = useUnreadMessages()   // number; live via `chat.conversation`, 30 s polling fallback — for the shell's 消息 tab / bell
```
Server-side: `import { openConversation, openGroupConversation, postSystemMessage, postContextCard } from '../chat/service'` (buddy: call `openGroupConversation` on first join and store `conversationId` on the post; wanted/listings: `openConversation` + `postContextCard`).

## Seed accounts / data to try

- `alice@u.northwestern.edu` — 8 unread threads (landlord 1735 Chicago Ave, Chloe Davis St, Xinyi IKEA desk with photo, Leo bike, Bob, Ruoxi 2B2B, Costco carpool group, O'Hare pickup group), 2 archived (one blocked scam thread), 1 muted.
- `bob@u.northwestern.edu` — threads with Haoran (his Noyes sublet) and Minjae; `landlord@evanstonhomes.com` — two threads on the same listing.
- UIUC: `yuxuan.li@illinois.edu`, `jason.tan@illinois.edu` (carpool group owner); NYU: `anqi.yang@nyu.edu`, `kevin.xie@nyu.edu`, `ziyang.pan@nyu.edu`.
- `newbie@u.northwestern.edu` (L0) — can reply to Alice but cannot start conversations (`TRUST_REQUIRED`).
- Admin lock/unlock: `admin@example.edu`.

## Verification

- `npm run typecheck`: shared ✓, server ✓ (chat files), web ✓ (chat files). Errors present at the time of writing belonged to other agents' in-progress files (`buddy`, `wanted`).
- `docs/modules/chat.spec.mjs` (`WEB_PORT=5103 node docs/modules/chat.spec.mjs` after a fresh `--force` seed): inbox, listing + group threads, filters, message search, **create flow** (new thread with a user alice never chatted with → scam banner → text send → image send), realtime delivery + typing indicator from a second logged-in session, auto read receipts, archive via the actions menu, block list, dark theme, EN, mobile inbox + thread + back. All checks pass with no page errors.
- Screenshots (`docs/screenshots/chat/`): `inbox-desktop`, `thread-listing-desktop`, `thread-group-desktop`, `inbox-search-desktop`, `thread-new-scam-banner`, `thread-realtime-desktop`, `blocks-desktop`, `thread-dark-desktop`, `inbox-en-desktop`, `inbox-mobile`, `thread-mobile`.

## Known gaps

- Reply-to (`replyToId`) is accepted and stored but the composer has no "reply" affordance yet; edit-message UI is also not exposed (API + 10-min rule implemented).
- Group member management UI (add/remove) is API-only; the buddy module owns the join flow.
- `support` conversations are supported by the service but no admin ↔ user "support thread" UI exists.
- The admin panel screenshot is not in the spec because `/admin/*` is still the admin module's placeholder; the component is ready at `web/src/features/chat/admin.tsx`.
- Message search is `LIKE` on `messages.body` (per DATA_MODEL §3.3); no FTS.

## Integration requests

1. **`shared/src/types.ts` `ConversationMember`** is `UserPublic & { role: MemberRole; lastReadAt }` — `role` collides with `UserPublic.role` and the intersection collapses to `'admin'`. The chat DTO uses `memberRole` instead (`ChatMember` in `shared/src/schemas/chat.ts`). Please rename the field in the shared type (the buddy agent hit the same collision with `BuddyMemberDto`).
2. **`web/src/components/DropdownMenu` + `Portal`**: `Portal` renders `null` on its first commit, so `useAnchorPosition` measures a missing element and the menu stays at `(-9999, -9999)` until a scroll/resize happens (reproduced on the shell's account menu too). Chat wraps the menu in `components/ChatMenu.tsx` which dispatches a synthetic `resize` after open. Fix: run `compute()` again when the floating ref mounts (e.g. a callback ref or `useEffect` on `floatingRef.current`).
3. **`lib/conversations.contextCardFor('buddy_post')`** returns `subtitle = "<type> · <ISO>"` and `market_item` returns the raw category; the web localizes these client-side (`utils.contextSubtitle`). Structured fields (`buddyType`, `startsAt`, `category`) on `ContextCard` would be cleaner for every consumer.
4. `lib/conversations.toMessageDto` has no `readBy` source; chat computes it in `service.attachReadBy`. If other modules render messages with receipts, consider moving that helper into the lib.
5. The shell's `useUnread()` already listens to `chat.conversation`; the bottom tab can switch to `useUnreadMessages()` from `@/features/chat` if a single source of truth for the 消息 badge is preferred.
