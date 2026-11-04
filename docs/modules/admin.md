# Module: admin (后台)

Admin console for the nationwide platform: KPI dashboard, users, reports and moderation, feature flags, campuses, audit log and system health. It also mounts the other modules' admin panels inside one shell. Nothing is tied to one campus. Every screen has a campus filter whose default is all campuses (the nationwide total).

## What was built

### Server (`server/src/modules/admin/`)
- `routes.ts` is mounted at `/api/admin`. Every route sits behind `requireAdmin`, and every write calls `audit()`.
- `kpis.ts` holds every KPI query, and the UI tooltips document each definition (`admin.def.*`):
  - DAU/WAU/MAU = distinct `events.user_id` per day, per 7-day window and per period.
  - visitors = distinct sessions.
  - signups, listings published, and "active on day" snapshots for sublets, wanted, items and buddy posts.
  - matches = score ≥ 50.
  - messages excludes system messages.
  - GMV = `escrows.amount_cents` by `funded_at`.
  - Revenue by stream comes from `v_revenue` (boost / Pro / Secure Payment fee, net of card refunds). Affiliate revenue is `partner_conversions` approved|paid (falls back to `partner_clicks.payout_cents`).
  - Affiliate clicks, funnels (sublet view → contact → chat → Secure Payment proposed → funded; checkout; verification), the campus leaderboard and top partners.
  - Overview tiles cover a **rolling 24 h** window and compare it with the same window 7 days earlier. Backlog counts (reports, verifications, disputes) are reconstructed as they stood 7 days ago.
  - The SLA strip uses these targets and limits: verification 24 h (red after 48 h), reports 4 h (red after 12 h), disputes 48 h (red after 72 h), campus requests 1 week.
  - Revenue at risk = cash of active boosts on reported or flagged entities.
- `service.ts` contains:
  - Entity summaries for every reportable type.
  - Moderation writes, with an owner notification when content is hidden or restored.
  - Ban and unban. A ban pauses live sublets, hides all of the user's content, locks their direct chats and kicks their sockets. The audit `after_json` records exactly what changed, so unban restores it.
  - The admin user view and the user detail (events, reports against, audit, orders, verifications).
- `jobs.ts` registers `admin.autoFlagReported` (every 10 min). Any listing, wanted post, item or buddy post with 2 or more open reports moves `ok → flagged`, which drops it out of public search. The owner still sees it. The change is audited with actor = system.
- Analytics events logged: `admin.user_ban`, `admin.user_unban`, `admin.users_ban|unban`, `admin.report_resolve`, `admin.reports_bulk`, `admin.moderate`, `admin.flag_update`.
- Notifications sent:
  - `report.actioned` to the reporter (action taken or dismissed; sibling reports are closed too).
  - `system` notices for warn, hide, restore, remove, ban, unban and role change.
  - Campus request outcome to the requester.

### Endpoints (API.md §12 plus additions)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin` | module info |
| GET | `/api/admin/overview?campusId` | 24 h tiles + `deltas7d` + `spark30` + `sla[]` + `revenueAtRiskCents` |
| GET | `/api/admin/kpis?from&to&campusId&groupBy=day\|week` | `series`, `totals` (incl. `byStream`, `takeRate`, `statusCounts`), `funnels`, `byCampus`, `topPartners` |
| GET | `/api/admin/nav-counts` | badge counts for the shell (added) |
| GET | `/api/admin/health` | DB integrity/latency/size, migrations, ws clients, jobs, traffic, table sizes, checks (added) |
| GET | `/api/admin/users` | `q, role, trustLevel, campusId, banned, sort=recent\|active\|name` |
| GET / PATCH | `/api/admin/users/:id` | PATCH `{ role?, banned?, bannedReason?, campusId?, listingQuota?, reason }` (required reason; self role change and banning admins refused) |
| POST | `/api/admin/users/bulk` | `{ ids, action: 'ban'\|'unban', reason }` (added) |
| POST | `/api/admin/users/:id/impersonate` | dev only, audited |
| GET | `/api/admin/reports` | `status=pending(default)\|open\|in_review\|actioned\|dismissed\|all, entityType, reason, campusId, sort=oldest\|newest\|count`; `byStatus` sibling |
| GET / PATCH | `/api/admin/reports/:id` | detail includes `related`, `history`, read-only `messages` for message/conversation reports (viewing is audited `report.view_conversation`). PATCH `{ status, resolution?, action?: { type: hide\|remove\|ban_user\|warn_user\|lock_conversation\|delete_message\|none, reason } }`; `actioned` requires an action; illegal transitions → 409 |
| POST | `/api/admin/reports/bulk` | `{ ids, status: in_review\|dismissed, reason }` (added) |
| GET | `/api/admin/listings` | `q, status, moderationStatus, campusId, ownerId, flaggedOnly, sort=recent\|reports\|views\|price`; `moderationCounts` sibling |
| PATCH | `/api/admin/listings/:id/moderation` | `{ moderationStatus, note?, reason }` |
| GET | `/api/admin/moderation/:entityType` | generic list for `wanted\|market_item\|buddy_post\|listing` (added) |
| PATCH | `/api/admin/moderation/:entityType/:id` | same body |
| POST | `/api/admin/moderation/:entityType/bulk` | `{ ids, moderationStatus, reason }` (added) |
| GET / POST | `/api/admin/flags` | list (with `updatedByUser`, `locked`) / create `{ key, enabled, value?, description?, campusIds?, reason? }` |
| PUT / DELETE | `/api/admin/flags/:key` | PUT `{ enabled, value?, description?, campusIds?, reason? }`; `scam_banner.enabled` cannot be turned off (409); core flags cannot be deleted. Every change: audit, `invalidateFlags()`, ws `system.flags` broadcast, `hooks.emit('flags.changed')` |
| GET | `/api/admin/audit` | `action` (exact or `group.*`), `actorId, entityType, entityId, q, from, to`; `actions` sibling |
| GET | `/api/admin/events` | raw explorer, at most 7 days; `type` (exact or `group.*`), `userId, entityType, entityId, campusId` |
| GET / PATCH | `/api/admin/campuses[/:id]` | list with stats (users, MAU, live counts, open reports); PATCH name/nameZh/shortName/eduDomains/hasShuttle/shuttleOfficialUrl/defaultRadiusM/isActive/sortOrder (audited `campus.update\|activate\|deactivate`) |
| GET / PATCH | `/api/admin/campus-requests[/:id]` | sorted by demand (same school requested repeatedly); PATCH `{ status, note? }` notifies the requester |
| GET | `/api/admin/export/:table.csv` | `events, orders, payments, partner_clicks, listings, users (no password hash), reports, audit_log`; `from, to, campusId`; audited `export.csv` |

Zod schemas and response DTO types live in `shared/src/schemas/admin.ts` and are re-exported as `adminSchemas`.

### Web (`web/src/features/admin/`)
- **Shell** (`AdminShell.tsx`): on desktop, a left rail grouped into Operations / Content / Platform with live badge counts. These refresh on the ws `admin.queue` event, and `system.flags` refreshes the flags page. On mobile, a section `Select` replaces the rail. Campus and date-range filters persist in the URL (`cid`, `range`, `from`, `to`) and carry over between sections. Shown inside `RequireRole('admin')` with layout `full`.
- **概览 Overview**: 9 tiles (24 h, 7-day delta, sparkline, definition tooltip) and a clickable SLA strip that turns red or amber. Below them:
  - totals for the selected period (MAU, revenue, GMV, take rate, sublets published, partner clicks)
  - a trend line chart with a metric picker, day/week toggle and table view
  - funnels
  - the campus leaderboard (CSV export)
  - top partners, content status, and recent events
- **用户 Users**: search and filters. Keyboard bulk actions: `J`/`K` to move, `X` to select, `Enter` to open, `Esc` to clear. Bulk suspend or restore. The detail drawer offers role, trust override (via `POST /api/verify/admin/users/:id/trust`), quota, campus, suspend/restore with reason, and tabs for activity / reports against / admin actions / orders and ID.
- **举报 Reports**: status tabs with counts and filters. Rows that have broken the SLA are red. Keyboard bulk claim and dismiss. The review drawer has:
  - an entity card
  - the scam-pattern checklist (ticked items become reason presets)
  - a read-only chat transcript (audited)
  - related reports and history
  - an action picker limited to the actions that fit the entity type
- **房源 / 求租 / 二手 / 搭子**: each section mounts the module's own `admin.tsx` when it exports one (wanted, market and buddy do). Otherwise it renders the generic `ModerationTable`, which listings uses because its panel is `null`. The generic table has moderation tabs, search, sort by reports, boosted badges, row hide/restore, and keyboard bulk hide/flag/restore.
- **身份审核 / 校车 / 聊天 / 地图**: mount the verify, shuttle, chat and map panels inside an error boundary.
- **营收 Revenue**: revenue per stream as small multiples (one hue, no chart library), GMV, take rate, revenue per active user, a trend with revenue-stream metrics, and revenue by campus. A second tab mounts the billing panel (orders, refunds, disputes).
- **校区 Campuses**: a table with activity stats, an activate/deactivate switch (reason required) and an edit modal. A Requests tab triages campus requests with demand counts.
- **功能开关 Flags**: a switch per row (reason dialog, live broadcast), plus a JSON config and per-campus scope editor, create, and delete (non-core only). Safety flags are locked on.
- **审计 Audit**: a searchable immutable log with action-group filter, date range and a before/after diff dialog, plus an event-stream explorer.
- **系统 System**: health checks, DB, realtime, jobs and table sizes. Refreshes every 30 s.
- Charts (`charts.tsx`) are inline SVG built on tokens:
  - `LineChart`: single series with crosshair, tooltip, ←/→ keys and table fallback.
  - `BarList`, `Funnel` and `MiniColumns`.
- Every destructive action goes through `ReasonDialog`: a required reason, presets, and ⌘/Ctrl+Enter to submit.
- i18n: `web/src/i18n/admin.ts` has 550 keys in each locale. No value contains "escrow"; the spec checks this.

### Components other modules can import (`@/features/admin`)
`LineChart`, `BarList`, `Funnel`, `MiniColumns`, `ReasonDialog`, `AdminPanelCard` (Panel), `DefHint`, `CampusFilter` (campus select with an "all campuses" option), `useAdminFilters`.

## Seed (`server/src/db/seed/admin.ts`, version 1)
Run `DB_PATH=server/data/test-admin.db GEOCODE_OFFLINE=1 npm run seed -w server -- --modules core,listings,wanted,chat,verify,map,shuttle,market,buddy,billing,admin`. The seed is idempotent (deterministic `adm-*` ids) and also re-runs through `POST /api/dev/seed { modules: ['admin'] }`.
- About 2,100 analytics events over the last 30 days: pageviews, listing/item/buddy views, contact clicks, saves, searches, partner clicks, logins, signups and chat starts. They are spread over northwestern, uiuc, nyu, usc, umich, columbia and bu with a weekday rhythm and a growth trend.
- 2 problem accounts (password `Passw0rd!`):
  - `quickrent.chicago@gmail.com` is banned for off-platform deposit requests.
  - `deals4students@outlook.com` is an NYU spammer under report.
- 15 reports across every state and entity type. One scam report is 19 h old, which breaches the 12 h SLA, so the strip shows red. One listing is hidden to match an actioned report. One listing has 2 open reports and is auto-flagged.
- 19 historical audit entries.
- 15 extra feature flags from admin-requirements §5. Some carry JSON config, and `shuttle.live_eta` is scoped to northwestern and uiuc. They are inserted with `INSERT OR IGNORE`; core's 8 flags are untouched.
- 7 campus requests. Stevens was requested 3 times; the others are Case Western, Lehigh, a declined Clark request and an added IIT request.
- Admin login: `admin@example.edu` / `Passw0rd!`.

## Verification
- `npm run typecheck` passes for shared, server and web.
- `docs/modules/admin.spec.mjs` passes. It covers:
  - the role guard
  - the overview SLA turning red
  - trend metric and table view, and the campus filter
  - user suspend and restore (checked in the audit log)
  - report hide action
  - keyboard bulk hide on listings
  - flag create, toggle and delete, and the locked safety flag
  - campus request triage
  - the audit diff
  - system health
  - every module panel mounting
  - mobile without horizontal scroll, dark revenue, and English flags
  - zero page or console errors (OSM tile requests are blocked in the sandbox and ignored)
- Screenshots in `docs/screenshots/admin/`:
  - `overview-desktop`, `overview-mobile`
  - `reports-desktop`, `reports-mobile`, `report-drawer-desktop`
  - `user-drawer-desktop`, `listings-bulk-desktop`
  - `flags-desktop`, `flags-en-desktop`
  - `campus-requests-desktop`, `audit-desktop`, `system-desktop`
  - `revenue-dark`

## Known gaps
- The requirements doc's larger roadmap is not built yet:
  - Campus Ignition board and `campus_milestones`
  - ambassadors and payouts
  - sponsors and Verified Buildings
  - Kit editor
  - Pro/Pro+ subscriber management
  - cohort funnels
  - MRR
  - seasonal overlay
  - fair-housing linter

  These need `19_admin.sql`, which was not created because nothing in the binding scope required it. Pricing, promos, partners, orders and disputes are covered by the billing panel mounted under 营收.
- Auto-flagging runs as a 10-minute job rather than inside `createReport` (the scaffold owns `lib/reports.ts`). Boosts on flagged entities are reported as "revenue at risk" but are not paused automatically: `boosts.paused_at` belongs to billing.
- `listingsActive` and the other daily snapshots are reconstructed from `published_at` / `created_at` and `updated_at`. They are exact for live rows and approximate for rows that closed and reopened.
- The `delete_message` action sets `messages.deleted_at` but does not publish a `chat.message { deleted: true }` frame. Clients see the deletion on their next fetch.

## Integration requests
1. **`web/src/components/Tabs.tsx`**: the underline variant calls `el.scrollIntoView({ block: 'nearest' })` on mount. When a tab row sits below the fold, this scrolls the whole window to it, so a page loads already scrolled down. It should scroll only the tab list horizontally (`root.scrollTo({ left })`). Workaround: the admin trend metric picker uses a `Select`.
2. **`web/src/components/Select.tsx`**: forward `data-*` attributes (e.g. `data-testid`) to the trigger. Workaround: the spec locates selects by `aria-label`.
3. **`web/src/components/Table.tsx`**: render the stacked mobile cards only below `md` (today both layouts are in the DOM, hidden with CSS). Duplicate controls make `getByRole` and `aria-*` lookups ambiguous. Workaround: the spec uses `:visible`.
4. **`server/src/lib/reports.ts`**: emit a hook (e.g. `hooks.emit('report.created', …)`) so admin can auto-flag entities with 2+ open reports immediately instead of on its 10-minute job.
5. **`server/src/lib/flags.ts`**: `DEFAULT_FLAGS` has `escrow.enabled` on, but admin-requirements §5 says off by default and scoped to cleared states. Product should decide; admin can flip it in the UI.
6. **`lib/conversations.ts` / chat**: export a `deleteMessage(id, actorId)` helper that publishes the `chat.message { deleted: true }` frame. Admin would call it for the `delete_message` action.

No new packages were added.
