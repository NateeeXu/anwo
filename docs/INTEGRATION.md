# Integration pass — 安窝 Anwo

> 2026-11-04. Goal: every module wired into one coherent product, from a fresh database, with zero type errors and zero
> page errors. This file records what the integration pass changed, how to run the checks, and what is still open.

## 1. How to check everything

```bash
npm run typecheck                    # shared + server + web
npm test                             # server unit tests (9)
npm run i18n:check                   # zh/en dictionary parity + every literal t('…') key exists
rm -f server/data/app.db* && GEOCODE_OFFLINE=1 npm run seed   # fresh DB; running it again is a no-op
npm run e2e                          # fresh e2e DB → API :4000 + web :5173 → core + 10 module specs + journey → stop
npm run build                        # vite production build → web/dist
JWT_SECRET=<secret> NODE_ENV=production PORT=4500 GEOCODE_OFFLINE=1 npm start   # serves web/dist + SPA fallback
```

`npm run e2e` (`scripts/e2e.mjs`) seeds `server/data/e2e.db` from scratch, starts the API (`npm start -w server` with
`GEOCODE_OFFLINE=1 RATE_LIMIT_DISABLED=1 ALLOW_SEED_API=1`) and Vite (`--strictPort`), waits for both, runs
`docs/modules/core.spec.mjs`, every `docs/modules/<key>.spec.mjs` and `docs/modules/journey.spec.mjs` with
`WEB_PORT`, prints PASS/FAIL per spec, kills the process groups and exits 1 on any failure. Logs:
`server/data/e2e-logs/<spec>.log`. Subsets: `npm run e2e -- chat journey` (`--no-core` skips core). It refuses to start
when :4000 or :5173 is taken.

### Results of the final run

| Check | Result |
|---|---|
| `npm run typecheck` (shared, server, web) | pass — 0 errors |
| `npm test` | pass — 9/9 |
| `npm run i18n:check` | pass — 4,219 keys in each locale, 0 missing |
| Fresh seed (`GEOCODE_OFFLINE=1 npm run seed`) | pass — all 11 seeds; second run: `ran: []` |
| core.spec | pass (39 page visits, 0 page errors) |
| listings · wanted · chat · verify · map · shuttle · market · buddy · billing · admin specs | pass (all 10) |
| journey.spec (25 screenshots) | pass |
| `npm run build` | pass (one >500 kB chunk warning, see §4) |
| Production smoke (`NODE_ENV=production`, :4500) | pass — `/` and `/listings/:id` deep link render from `web/dist` (SPA fallback), unknown `/api/*` → JSON 404, `/api/dev/*` hidden, `/uploads/*` served |

Console noise that remains in spec logs is `net::ERR_TUNNEL_CONNECTION_FAILED` for OpenStreetMap tiles — the sandbox
has no outbound access to the tile servers; it is not our code. The specs and the journey filter it out.

## 2. What changed

### Seed / data
- **Seed order** (`server/src/db/seed/index.ts`): `core → shuttle → map → listings → wanted → chat → verify → market →
  buddy → billing → admin`. Shuttle used to run after listings, so every listing's cached `nearest_stop_id` was empty
  (0/83 listings had a stop; now 60/83, 34 within 400 m).
- **Buddy seed** no longer wipes the chat seed's demo group threads (`chatseed-*` conversations and their fallback buddy
  posts); before, the 4 chat group chats disappeared in the integrated DB.
- Fresh seed is idempotent (`seed_meta` versions) — a second `npm run seed` runs nothing.
- `shared/src/campuses.ts` + `docs/data/campuses.json`: UIUC `hasShuttle: true` + MTD tracker URL (shuttle request #1).

### Server
- `lib/cards.listingCards` resolves `nearestStop { id, name, nameZh, distanceM }` (≤ 400 m, active stops, one batched
  query) onto `ListingCard`; `shared/src/types.ts` gained the optional field.
- `lib/sponsored.pickSponsored` honours `boosts.paused_at` and `boosts.nationwide` (Nationwide Spotlight now appears in
  nationwide listing results; paused boosts never show) — billing requests #3/#6. Listings passes `nationwide`.
- `lib/conversations.contextCardFor('escrow')`: link `/escrow/:id`, fallback title 「Secure Payment · 安心付」 — the word
  "escrow" no longer reaches users (billing #5).
- `GET /api/auth/me?optional=1` answers `200 null` for anonymous visitors (contract without the flag unchanged); the web
  boot probe uses it, which removed the `401` console error on every signed-out page load.
- Billing: a card saved during checkout now calls `recomputeTrust` (it previously set `payment_verified_at` without
  re-evaluating trust level 3) — verify request #4 in spirit.
- Admin `GET /api/admin/nav-counts` adds `pendingPoiSuggestions` and `openShuttleRequests` → nav badges for 地图 / 校车
  (map #4, shuttle #5).
- Tests: `auth.test.ts` covers the optional probe; new `i18n.test.ts` guards that billing copy never says "escrow" (billing #7).

### Web — shell
- Desktop top nav: new 消息 button with chat's unread badge; mobile bottom 消息 tab now uses chat's `useUnreadMessages()`
  (live `chat.conversation.totalUnread`) — chat #5.
- Account menu links every module surface: profile, messages, my listings / wanted / items / groups, saved, wallet,
  pricing, Newcomer Kit, verification, admin (admins only), settings. Every link was checked against the router.
- `CampusSwitcher` offers 全美 on `/market` too (market #1; `/listings/saved` was already covered by the `/listings` prefix).
- Map explore rail renders `SecondaryTabs`, so all six browse pages share the tabs.

### Web — module components on other modules' pages
- Home, Search, Profile use the real `ListingCard`, `WantedCard`, `ItemCard`, `BuddyCard` instead of SimpleCards
  (listings #3, wanted #4, market #4, buddy #4). Imported from the component files, not the barrels, to keep admin panels
  out of the main chunk.
- Profile: verify's `TrustProfileCard` replaces the inline verified rows and duplicate stats (verify #2); 「发消息」 now
  opens a real thread via `openChatWith` (it pointed at a non-existent `/chat/new`).
- `ListingCard` renders shuttle's `NearestStopChip` (pre-resolved, no per-card fetch); listing detail shows the chip under
  the commute grid (shuttle #4).
- Listing detail price rail: billing's `SecurePaymentCta` (eligibility-aware) replaces the static `/pricing?escrow=` link
  (billing #3).
- Market item detail: map's `CommuteCard` (inline) next to the pickup map (map #5).
- `BoostSheet` is mounted in place on every owner surface: listing owner panel + 「我的房源」 menu, market item owner bar +
  「我的二手」 menu, buddy detail manage menu + 「我的搭子」 (billing #3). The `/pricing?boost=` deep link still works.
- Admin shell already mounted every module's `admin.tsx` (verify, wanted, market, buddy, chat, shuttle, map, billing under
  营收); verified all 17 admin routes render.

### Web — UI kit fixes (requests from several modules)
- `Portal` resolves its root synchronously, so `DropdownMenu` / `Select` / `DateRange` popovers are positioned in the same
  commit (chat #2, shuttle #7, listings #2 — menus used to sit at −9999 px until a scroll/resize).
- New `--z-popover: 65` layer for the portaled `Select` listbox, `DropdownMenu`, `DateRange` and `FilterChip` popovers —
  they now work inside modals (map #1). Mirrored in `docs/design/theme.css`.
- `Tabs` keeps the active tab visible by scrolling only the tab strip (no more window jump) — admin #1.
- `Table` mounts only one layout (desktop table or mobile cards) — admin #3; its scroller is `relative`, which fixed a
  132 px horizontal page overflow on `/admin/listings` (an absolutely positioned `sr-only` header escaped the scroller).
- `Avatar` initials for mixed names take the first CJK run (「林小安 Journey」 → 安, was "y").

### Specs / tooling
- `docs/tools/shot.mjs` resolves Playwright with `createRequire` (+ global root fallback) and sends the CSRF header on
  login (buddy #8, listings #1, shuttle #8).
- All specs already read `WEB_PORT` (module port as default); they were run with `WEB_PORT=5173`.
- `chat.spec.mjs`: picks the chat seed's own group thread and counts only `chatseed-*` unread rows (the integrated DB also
  has buddy groups). `verify.spec.mjs`: waits for the review dialog's detail before pressing R (the dialog now mounts
  one commit earlier, which exposed the race).
- New `docs/modules/journey.spec.mjs` (cross-module journey) and `scripts/e2e.mjs`, `scripts/i18n-check.mjs`
  (`npm run e2e`, `npm run i18n:check`).

### Journey (`docs/screenshots/journey/`)
01 first visit → campus picker · 02 register · 03 verify-email sent · 04 /dev/mailbox · 05 verified · 06 pick campus ·
07 listings (campus) · 08 listings (nationwide) · 09 map explore · 10 listing detail · 11 message host · 12 host reply (EN,
dark, second browser) · 13 reply received live · 14 wanted → matches · 15 item posted · 16 buddy joined · 17 boost sheet ·
18 mock checkout (4242) · 19 boost started · 20 wallet · 21 Newcomer Kit (mobile) · 22 partner page (mobile; tracked
`/go` link answers 302) · 23 admin overview · 24 admin revenue · 25 admin mobile (EN, dark).

A sweep of 48 routes × {mobile zh light, mobile en dark, desktop en} as admin, 22 routes anonymous and 10 detail pages as
a student found no page errors, no visible dotted i18n keys and no horizontal overflow at 390 px after the fixes above.

## 3. Integration requests — status

| Module | Request | Status |
|---|---|---|
| admin | 1 Tabs scroll · 3 Table single layout | done |
| admin | 2 Select `data-*` passthrough | open (spec uses `aria-label`; harmless) |
| admin | 4 `report.created` hook · 6 `deleteMessage` helper | open — the 10-min job / admin route cover it today |
| admin | 5 `escrow.enabled` default | product decision — left on; admin can flip it |
| billing | 1 mount at /admin/revenue | done (by admin) |
| billing | 2 `lease_proof` verification type | open — needs a `schema.sql` CHECK change (see §4) |
| billing | 3 BoostSheet in owner panels, SecurePaymentCta, sponsored picker | done; `*.publish` referral bonus events: open |
| billing | 4 chat banner → SecurePaymentCta | open |
| billing | 5 escrow context card · 6 lib/sponsored · 7 escrow-copy test | done |
| billing | 8 API.md additions · 9 WEB.md routes | open (docs only); `/kit/share` never hits the welcome redirect (only Home redirects) |
| buddy | 4 cards on core pages · 7 admin mount · 8 shot.mjs | done |
| buddy | 1 `memberPreview` in lib/cards · 2 `cityViaCampusOnly` · 3 shared `Buddy.members` type | open (module works around) |
| chat | 2 DropdownMenu positioning · 5 unread hook | done |
| chat | 1 `ConversationMember.role` collision · 3 structured context fields · 4 `readBy` in lib | open (module works around) |
| listings | 1 shot.mjs CSRF · 2 DateRange positioning · 3 real cards · 5 nationwide saved | done |
| listings | 4 `exactIds` for batch cards | open |
| map | 1 Select in Modal · 4 admin mount + badge · 5 CommuteCard on market detail | done (listing detail keeps its own commute grid + NearestStopChip) |
| map | 2 multi-candidate geocode · 3 ASSETS.md note | open |
| market | 1 nationwide switcher · 4 real cards | done; 5 bundles on listing detail already rendered by listings |
| market | 3 PhotoGallery `fill="none"` | open (module fallback) |
| shuttle | 1 UIUC hasShuttle · 4 NearestStopChip · 5 admin mount · 7 menu positioning · 8 shot.mjs | done |
| shuttle | 2 shared route fields · 3 schema additions · 6 `notifyRole` | open |
| verify | 1 admin mount + count · 2 TrustProfileCard on Profile · 4 trust recompute on checkout card | done |
| verify | 3 TrustStrip on detail pages | listings + market have their own strips (same DESIGN §4.6 band); not unified |
| verify | 6 `/api/admin/audit` | done (admin module) · 7 private seed uploads helper: open |
| wanted | 2 listings → recompute / recordLead | done (listings module) |
| wanted | 1 DateRange month navigation · 6 digest notifications job | open |
| wanted | 3 chat wanted context card · 5 admin mount | done |

## 4. Open issues

1. **Main bundle size** — `main-*.js` is ~1.0 MB (310 kB gzip); all 13 i18n dictionaries (≈4,200 keys × 2 locales)
   and the shell/chat hooks are eager. Split dictionaries per locale / per route.
2. **Chat seed fallback rows** — the chat seed references its own hashed ids, so it always inserts a few `chatseed-*`
   listings / items / buddy posts as context entities; they show up in browse lists as ordinary posts. Point the chat
   seed at the real seeded entities (look them up by owner + title) to remove them.
3. **`lease_proof` verification type** (billing #2) — student sublet posters cannot unlock 14/30-day, Plus/Max and Spotlight
   boosts. Requires extending `verification_requests.type` CHECK in `schema.sql` (not possible in an additive migration).
4. **Referral post bonus** — nothing consumes `listing.publish` / `item.publish`; buddy logs `buddy.create`, not
   `buddy.publish`. Referral qualification on trust change and first order works.
5. **Wanted digest** — `wanted.service.buildDigest` exists, but no job creates `kind='digest'` notifications.
6. **DateRange** desktop popover month navigation (wanted #1) still snaps back; forms use native date inputs.
7. **Map tiles** need outbound access to OpenStreetMap; offline the map renders pins, routes and clusters on a blank
   background. Nominatim is likewise skipped with `GEOCODE_OFFLINE=1`.
8. **Production cookies are `Secure`** — signing in on plain `http://` in production mode does not work (by design);
   the production smoke covered anonymous rendering only.
9. Small UX nits seen in the walkthrough: the mobile admin top bar has no centre title (the section select carries it);
   `SimpleListingCard/WantedCard/ItemCard/BuddyCard` in `pages/home/SimpleCards.tsx` are now unused.
10. Remaining module-level requests marked "open" in §3 (shared type collisions, `notifyRole`, geocode candidates,
    `exactIds`, `PhotoGallery fill`, Select `data-*`).
