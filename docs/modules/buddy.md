# Module `buddy` — 留学生找搭子 (Buddies)

Owner: buddy module agent. Ports: server **4108**, web **5108**, test DB `server/data/test-buddy.db`. Contract: API.md §10, DATA_MODEL §3.8 / §6.5, DESIGN §4.3 / §7.12.

## What was built

**Server** (`server/src/modules/buddy/`)
- `routes.ts` — every endpoint of API.md §10 plus moderation + ics export (table below). Campus-scoped lists via `scopeFromQuery` / `whereScope` (`allowNationwide: false`); `city`+`state` resolves to the campuses in that city (buddy_posts has no city column). Filters: `q`, `type` csv, `dateFrom`/`dateTo` (`YYYY-MM-DD` interpreted in the campus timezone, or ISO), `timeOfDay` csv (campus-local hour windows morning 5–12 / afternoon 12–17 / evening 17–21 / night 21–5, evaluated in SQL with the zone offset), `language` csv (`json_each` on `languages_json`), `verifiedOnly`, `hasSpace` (default true → `member_count < max_members`), `status` csv (default `open,full`), `upcoming`, `authorId` (used by the Profile page; skips the campus requirement), `sort` `upcoming|recent|relevance|distance`. Sponsored slots per DATA_MODEL §8 through `pickSponsored` / `mergeSponsored` / `recordImpressions`, only for boosted posts that pass the same filters. `view_count` increments at most once per viewer per 6 h (`recentlyLogged`).
- `service.ts` — join rules (status, cap → `QUOTA_EXCEEDED { limit, current }`, `verified_only` → `TRUST_REQUIRED`, blocks → `BLOCKED`, re-join from `left|declined`, `removed` → `FORBIDDEN`), `requires_approval` → `pending` + host approval/decline/remove, group chat creation on the first joined member (`lib/conversations.openConversation` kind `group`, host = owner, buddy context card posted, `addMembers` → `member_joined` system messages, `removeMember` on leave/remove), `open ⇄ full` sync, close / reopen / cancel (events → cancelled, `post_cancelled` system message, `system` notifications to members) / complete (events → done), explicit + implicit calendar occurrences, iCalendar builder (`VALARM -PT2H`, `GEO`, folded lines), reminder job, finer expiry, deterministic type illustration (`coverUrl`) for the detail hero. Stable exports: `buddyContextCard(id)`, `listOccurrences(...)`, `withMemberPreview(cards)`, `sendReminders`, `expireBuddyPosts`.
- `jobs.ts` — `buddy.reminders` every 15 min: `buddy.event_reminder` to joined members **24 h** and **2 h** before every occurrence (deduped through the notifications table per occurrence/window; `buddy_events.reminder_sent_at` stamped); `buddy.expire` every 15 min (open/full → expired after `ends_at` / `starts_at + 6 h`, scheduled occurrences → done).
- Analytics (`lib/events`): `buddy.view`, `buddy.create`, `buddy.update`, `buddy.join`, `buddy.leave`, `buddy.approve`, `buddy.decline`, `buddy.remove_member`, `buddy.close|cancel|reopen|complete|delete`, `buddy.report`, `buddy.calendar_export`, `search` (module buddy), `boost.impression` via lib/sponsored. Notifications (`lib/notify`): `buddy.join` (host; request or joined), `buddy.approved` (member, links to the chat), `buddy.event_reminder`, `system` (declined / removed / cancelled / time-or-place changed), `report.actioned` (host when hidden by a moderator).

**Shared** — `shared/src/schemas/buddy.ts`: `BuddyInput`, `BuddyPatch`, `BuddyListQuery`, `BuddyMineQuery`, `BuddyCalendarQuery`, `BuddyJoinInput`, `BuddyReasonInput`, `BuddyMembersQuery`, `BuddyEventsPut`, `BuddyModerateInput`, `BuddyAdminQuery`, `TimeOfDay` + `TIME_OF_DAY_HOURS`, `TIMED_BUDDY_TYPES`, `DESTINATION_BUDDY_TYPES`, `COST_SPLIT_BUDDY_TYPES`.

**Web** (`web/src/features/buddy/`)
- `/buddy` — `BuddyBrowse`: SecondaryTabs, type Tabs (全部 · 接机/拼车 · 室友 · 学习 · 健身 · 吃饭 · 旅行 · Costco · 活动), sticky FilterBar (日期 with presets 本周/这个周末/下周 + DateRange, 时间段, 语言, 仅限已验证, 有空位; sort 最近开始/最新发布/离校最近), 列表 ⇄ 日历 SegmentedControl, URL-synced state, 3-column BuddyCard grid, Pagination, typographic empty states (filtered vs. none).
- `BuddyCalendar` — month grid (Monday-first for zh, Sunday for en, campus timezone), accent dots per post type (+ overflow), today ring, selected day inverse, day list of BuddyCards for the tapped day, 只看我的 switch, 导出 .ics for the month.
- `/buddy/:id` — `BuddyDetail`: large date block + h1, type/status chips, facts (when with `CST` when the device tz differs, where, destination, members with spots left, languages, cost), StaticMapPreview (meeting point → destination), description, multi-session schedule, members (host / joined members see the full list with join notes; others see 3 avatars), organizer trust strip with the unverified-host warning, SafetyCard (4 fixed bullets → `/safety`), CTA states: 加入 / 申请加入 (modal with safety rules + note + acknowledgement) → 进入群聊 + 已加入 + 退出; 等待发起人通过; 登录后加入; verified-only gate with 去验证; 人数已满; closed / cancelled. Host: 进入群聊, 编辑, manage menu (关闭招募 / 重新开放 / 标记完成 / 取消活动 / 删除), 申请 tab with 通过 / 拒绝, 移出. 添加到日历 (Google Calendar link + .ics download), 分享 (Web Share / clipboard), 举报 modal.
- `/post/buddy` and `/buddy/:id/edit` — `BuddyForm`: 3 steps (类型 → 详情 → 人数与规则) with the caption progress bar; type-specific fields: airport pickup (direction, flight number, landing/departure time, airport/terminal), destination types (destination + MapView click-to-pin), cost split for ride/dining/event types, 没有固定时间 for roommate searches, multiple sessions for study/gym/costco/event/travel, languages, max members, verified-only (L2 hosts only) with minimum trust level, approval switch, SafetyCard. Wrapped in `RequireTrust level={1}`.
- `/buddy/mine` — `BuddyMine`: 即将开始 / 已结束 tabs, 全部 / 我发起的 / 我加入的 filter, pending-request badge.
- `admin.tsx` — moderation table (search, 全部/已标记/已下架 tabs, open-report counts, 标记 / 下架 / 恢复 with reason → audited, host notified).
- `BuddyCard` (DESIGN §4.3): 56 px date block (month over day, type icon; accent-soft when today), title (sponsored badge when in a slot), time + place line, avatar stack of the first 3 joined members with trust rings, 「3/4 人」, verified-only lock chip, language chips, cost hint, join button (secondary → ghost 已加入 / 待通过 / 发起人 / 已满). `variant="row"` for compact lists.
- i18n: `web/src/i18n/buddy.ts` (≈ 330 keys, zh + en). Dark mode via tokens only; `main h1`, labelled icon buttons, `aria-pressed` chips, `role=grid` calendar, focus rings from the kit.

## Endpoints (`/api/buddy`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/posts` | public | ScopeQuery (campus; `city`+`state` ok) + filters above → `Paginated<BuddyCard & { memberPreview }>` + `scope` |
| GET | `/posts/mine` | user | `role?: host\|member`, `status?` csv (default joined,pending), `when: upcoming\|past\|all` → + `pendingRequests` |
| GET | `/calendar` | public | `campusId?, from, to (≤ 62 d), type?, mine?` → `{ events: (BuddyEvent & { post, implicit })[], timezone }` |
| GET | `/calendar.ics` | public | same params → `text/calendar` attachment |
| GET | `/safety` | public | `{ version, rules: { zh[], en[] } }` |
| GET | `/admin/posts` | admin | `campusId?, status?, moderationStatus?, q?` → cards + `moderationStatus`, `openReports`, `viewCount` |
| POST | `/posts/:id/moderate` | admin | `{ moderationStatus: ok\|flagged\|hidden, reason? }` (hidden ⇒ status removed; audited) |
| POST | `/posts` | trust ≥ 1 | `BuddyInput` (verified-only needs an L2 host) → `BuddyDetail` 201 |
| GET | `/posts/:id` | public | `BuddyDetail` (`members` full for host/members, 3 avatars otherwise; `conversationId` members only; `coverUrl`, `canSeeMembers`, `pendingCount`) |
| PATCH | `/posts/:id` | owner | `BuddyPatch` (+ `events` replaces scheduled); `post_updated` system message; members notified on time/place change |
| POST | `/posts/:id/close` · `/cancel` · `/reopen` · `/complete` | owner | `{ reason? }`; `INVALID_STATE` per §6.5 |
| DELETE | `/posts/:id` | owner | cancels first (notifies members) then deletes; group chat history kept |
| POST | `/posts/:id/join` | user | `{ note? }` → `{ membership, conversationId }`; errors `TRUST_REQUIRED`, `QUOTA_EXCEEDED`, `INVALID_STATE`, `BLOCKED`, `CONFLICT`, `FORBIDDEN` (removed) |
| POST | `/posts/:id/leave` | member | pending or joined → left; full → open |
| GET | `/posts/:id/members` | host/member | `?status=`; notes visible to the host only |
| POST | `/posts/:id/members/:userId/approve` · `/decline` · `/remove` | owner | `{ reason? }` → member DTO |
| GET / PUT | `/posts/:id/events` | public / owner | `{ events: [{ startsAt, endsAt?, locationName?, lat?, lng? }] }` ≤ 20 |
| GET | `/posts/:id/calendar.ics` | public | one post (all scheduled occurrences) |
| POST | `/posts/:id/report` | user | `ReportInput` → `Report` (lib/reports) |

## Components other modules can import (`web/src/features/buddy`)

`BuddyCard` (`post`, `variant: 'default'|'row'`, `occurrenceAt`, `hideJoin`), `BuddyCalendar` (`campusId`, `types`), `BuddyTypeIcon`, `SafetyCard`, `StatusBadge`, `TYPE_ICONS`, `TYPE_TABS`, `useBuddyTime(campusId)` (campus-timezone date parts / labels / ranges), `googleCalendarUrl`, hooks `useBuddyList`, `useBuddyDetail`, `useBuddyMine`, `useBuddyCalendar`, `useBuddyMutations`, `buddyKeys`. Home / Search / Profile can replace `SimpleBuddyCard` with `BuddyCard` (the list DTO now also carries `memberPreview`).

## Seed (`server/src/db/seed/buddy.ts`, version 4)

50 posts: Northwestern 30, UIUC 8, NYU 7, USC 5 — airport pickups with flight numbers/times (ORD T5/T1, MDW, CMI, JFK T4, LGA, LAX TBIT), carpools (Costco Glenview/Champaign/Brooklyn/Los Feliz, Mitsuwa, H Mart, Chinatown, Flushing, 99 Ranch), roommate searches (no fixed time, approval), weekly study groups and gym sessions with explicit `buddy_events`, dinners, weekend trips (Starved Rock, Art Institute, Joshua Tree, Runyon), events (春晚 2027-02-06 with 30 seats, 迎新 closed, career fair with a prep session, Thanksgiving potluck, Black Friday run), one cancelled and one expired post. Dates are relative to "now" in each campus timezone — weekday-based posts land on the next matching weekday so titles like 「周六 Costco」 always agree with the calendar; fixed holidays use absolute dates. 133 memberships (incl. pending requests with notes, hosts), 41 occurrences, 42 group chats with context cards + a few messages, host notifications for pending requests, sample `buddy.view` events. Seed uploads `seed/buddy/b01–b20.svg` are registered; posts show a type illustration as the detail hero.

Useful accounts (`Passw0rd!`): `alice@u.northwestern.edu` (L2, hosts Starved Rock trip + winter ORD ride, member of several), `bob@u.northwestern.edu` (L1, free to join most posts; hosts the cancelled dinner + career-fair post), `yuting.chen@u.northwestern.edu` (L3, hosts the CA 987 approval pickup with 2 pending requests), `zihao.guo@u.northwestern.edu` (hosts the weekly Costco run), `newbie@u.northwestern.edu` (L0 — blocked from joining), `yuxuan.li@illinois.edu`, `anqi.yang@nyu.edu`, `jingyi.cao@usc.edu` for other campuses.

Re-seed: `rm -f server/data/test-buddy.db*; GEOCODE_OFFLINE=1 DB_PATH=server/data/test-buddy.db npm run seed -w server -- --modules core,buddy --force` (the spec mutates data, so re-seed before each run).

## Verification

- `npm run typecheck` — shared, server, web clean.
- `docs/modules/buddy.spec.mjs` (`WEB_PORT=5108 node docs/modules/buddy.spec.mjs`): browse list/filters/calendar, detail, instant join → full → group chat, request-to-join → host approval, create a carpool through the 3-step form, edit, leave (full → open), my groups, dark, English, mobile. 23 assertions, 0 page errors, 0 console errors (OSM tile fetches fail offline and are filtered). 17 screenshots in `docs/screenshots/buddy/`: `browse-desktop`, `browse-filtered-ride-verified`, `browse-calendar`, `browse-dark`, `browse-mobile`, `calendar-mobile`, `detail-desktop`, `detail-join-modal`, `detail-joined`, `detail-pending`, `detail-created-host`, `detail-host-requests`, `detail-en`, `detail-mobile`, `mine-desktop`, `form-step-details`, `form-step-rules`.

## Known gaps

- Flight number has no column: the form stores it in `locationName` (`ORD Terminal 5 · UA 851`) and reads it back on edit with a regex; a dedicated column would be cleaner (migration not added to stay within the schema).
- No photo upload on posts (DESIGN §4.3 cards have no photo); the detail hero is a deterministic type illustration (`coverUrl`).
- Meeting-point coordinates default to the campus centre unless the host pins a destination; only the destination gets a map click-to-pin in the form.
- Time-of-day filter uses the campus UTC offset of "now" in SQL (a DST boundary in the filtered range can shift the window by an hour).
- Reminders are deduped through the notifications table (a `reminder_sent_at`-style column exists only on `buddy_events`, not on implicit post occurrences).
- Group chats are created with `lib/conversations` directly (the chat service stub still throws `NOT_IMPLEMENTED`); once the chat module adds block / verified-only checks to `openGroupConversation`, buddy can switch to it.

## Integration requests

1. **`lib/cards.ts`** — `BuddyCard` could carry `memberPreview` (first 3 joined avatars) natively; today buddy adds it on top of `buddyCards()` (`withMemberPreview`) so global search cards lack the avatar stack.
2. **`lib/geo.whereScope`** — with `city`+`state` it references `<alias>.city/state`, which `buddy_posts` does not have; buddy resolves the city to campus ids itself. A `cityViaCampusOnly` option would remove that special case.
3. **`shared/src/types.ts`** — `Buddy.members` is typed `UserPublic & { role: BuddyMemberRole }`, which collapses to `never` because `UserPublic.role` is the account role; buddy exports `BuddyMemberDto = Omit<UserPublic,'role'> & {...}` instead. Suggest the same in shared.
4. **Scaffold pages** — Home / Search / Profile can import `BuddyCard` from `features/buddy` to replace `SimpleBuddyCard`.
5. **Chat module** — group conversations created by buddy carry `context_type='buddy_post'`; the thread header can render `contextCardFor('buddy_post', id)` (link `/buddy/:id`) and the `post_updated` / `post_cancelled` / `post_closed` / `post_reopened` / `post_completed` system events (centered pills).
6. **Billing** — boosts for `entity_type='buddy_post'` are honoured in `/api/buddy/posts` (sponsored slots, `boostTier`); the pricing page can link 「推广这个搭子」 to `/buddy/:id`.
7. **Admin** — mount `features/buddy/admin.tsx` under `/admin/buddy`; it uses `GET /api/buddy/admin/posts` and `POST /api/buddy/posts/:id/moderate` (audit action `buddy.moderate`).
8. **Tooling** — `docs/tools/shot.mjs` only resolves `playwright` when `node_modules/playwright` is symlinked to the global install (done locally: `ln -s "$(npm root -g)/playwright" node_modules/playwright`); a `createRequire` fallback inside shot.mjs would remove that step.
