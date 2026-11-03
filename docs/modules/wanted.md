# Module `wanted` — 求租 (wanted requests + wanted ↔ listing matching)

Owner: wanted module agent. Ports: server **4102**, web **5102**, DB `server/data/test-wanted.db`.

## What was built

**Server** (`server/src/modules/wanted/`)
- `routes.ts` — every endpoint of API.md §4 plus a small admin moderation API (below). Scope-aware browse (campus / nationwide / city / radius / bbox) including nationwide posts whose areas cover the browsed campus. View counting deduped per viewer per 6 h via `events`.
- `matching.ts` — pure `scoreMatch(wanted, areas, listing, campus, extra)` implementing DATA_MODEL §7 exactly: hard fails (gender, pets, bedrooms, blocked, self), price 30 / dates 25 / location 20 / must-haves 15 / fit 10 / trust +5, capped at 100; `BREAKDOWN_MAX` for bars.
- `service.ts` — stable exports: `scoreMatch`, `recomputeForWanted(id, { notify })`, `recomputeForListing(listingId)` (for listings publish/update), `seekersForListing(listingId)`, `buildDigest(userId)`, `matchesForUser`, `recomputeAll`, `scorePair`. Candidate prefilter in SQL (`candidateListings` ≤ 300, `candidateWanted` reverse for a listing), rows persisted at score ≥ 30, §6.12 transitions never downgrade `offered|contacted|dismissed`, `match.new` notifications (summary on create / per listing on listing-triggered / batched by the job), `match_count` left to the schema trigger.
- `jobs.ts` — `wanted.recomputeMatches` every 10 min (`POST /api/dev/jobs/wanted.recomputeMatches/run`).
- Events logged: `wanted.create`, `wanted.update`, `wanted.view`, `wanted.offer`, `wanted.remove`, `wanted.<status>`, `match.view`, `match.dismiss`, `listing.contact_click` (via wanted match), `chat.start`, `search` (module wanted). Notifications: `wanted.offer` (seeker), `match.new` (seeker).
- "Offer my place": `lib/conversations.openConversation` (direct, listing context) + listing **and** wanted context cards + intro message, match upsert `offered`/`offered_by_host=1`, `offer_count`, `listings.service.recordLead({ source: 'wanted_offer' })` (tolerates the stub), `wanted.offer` notification.

**Shared** — `shared/src/schemas/wanted.ts`: `AreaInput`, `WantedInput` / `WantedInputBase` / `WantedPatchInput`, `WantedListQuery`, `MatchesQuery`, `OfferInput`, `ContactInput`, `AreasInput`, `MUST_HAVE_KEYS`, `WantedSort`.

**Seed** — `server/src/db/seed/wanted.ts` (version 1): 35 bilingual posts (Northwestern 20, UIUC 5, NYU 5, USC 5; 4 nationwide relocations: NU→NYC, UIUC→Chicago, NYU→LA, USC→Seattle), circle/city/campus areas, varied budgets/dates/group sizes/must-haves, one paused post, precomputed matches against the listings seed (225 rows on the test DB), some `seen` rows and two host offers with real conversations (Chloe → Alice's post, Yuxuan → Ryan's post). If the listings table has no active listings when the seed runs, a dormant fallback pool of 22 demo listings (`wseed-l-*`) is inserted so the matching UI stays alive; it is deleted automatically once real listings exist.

**Web** (`web/src/features/wanted/`)
- `pages/Browse.tsx` `/wanted` — FilterBar (budget PriceRange, move-in DateRange with presets, people, bedrooms, furnished pref, campus/nationwide scope toggle, sort), WantedCard row list, map toggle (areas as accent circles + campus marks), mobile filter Sheet, pagination, URL-synced filters, host `我有房` CTA → OfferModal.
- `pages/Detail.tsx` `/wanted/:id` — facts grid, area chips + static area map, must/nice-to-haves, description, requester trust strip (L0–1 warning), share/report, host rail (`我有房源，推荐给 TA` → OfferModal; shows `已推荐` + chat link after), owner rail (`为你速配` top-3 with score bars, recompute, view-all, digest switch, edit/pause/resume/fulfilled/extend), mobile sticky CTA bar.
- `pages/Matches.tsx` `/wanted/:id/matches` — ranked list with status chips, min-score toggle, breakdown bars, contact / dismiss / open chat.
- `pages/Mine.tsx` `/wanted/mine` — tabs by status, per-post `为你速配` strip, actions menu (edit, matches, pause, resume, extend, fulfilled, delete with confirm).
- `pages/PostForm.tsx` `/post/wanted` + `/wanted/:id/edit` — single-page form (RequireTrust 1): basics + scope + campus, budget slider, move-in window + move-out + flexibility, needs (people, bedrooms, furnished, gender, home types, pets, parking), must/nice-to-have chips, `AreaPicker` (click-to-draw circles with radius, city + state, campus search), client-side zod validation with an error summary, local draft autosave.
- `pages/ForMyListings.tsx` `/wanted/for-my-listings` — host dashboard: seekers for each of my active listings with score + offer button (`/api/listings/mine`, degrades gracefully while listings is a stub).
- `pages/Digest.tsx` `/wanted/digest` — email-style digest preview + opt-in switch (`PATCH /api/users/me { emailDigestOptIn }`).
- `admin.tsx` — moderation table for `/admin/wanted` (search, status/moderation filters, hide / flag / restore; audited).
- Components exported from `features/wanted/index.ts`: `WantedCard` (DESIGN §7.5 row card with budget stub, dates, group size, area chips, author + trust, match count), `AreaChips`, `OfferButton`, `ScoreBadge`, `ScoreBreakdown`, `ScoreDial`, `MatchRow`, `OfferModal`; hooks `useWanted`, `useMatchesForMe`, `useSeekersForListing`, `wantedKeys`.
- `web/src/i18n/wanted.ts` — zh-CN + en for every string (DESIGN §8 tone).

## Endpoints (`/api/wanted`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/` | public | ScopeQuery + `q, budgetMin, budgetMax, moveInFrom, moveInTo, groupSize, groupSizeMin, bedroomsMin, furnishedPref, genderPref, hasPets, authorId, sort, page, pageSize` → `Paginated<WantedCard> + scope` |
| GET | `/mine` | user | `status?: csv` → `Paginated<Wanted>` |
| GET | `/matches/for-me` | user | `limit ≤ 20` → `{ byWanted: [{ wanted, matches: (Match & { listing })[] }] }` (score ≥ 50) |
| GET | `/matches/for-listing/:listingId` | listing owner | `(Match & { wanted })[]` score ≥ 50 |
| GET | `/digest/preview` | user | `{ subject, items, generatedAt, optIn }` |
| GET | `/admin/list` · POST `/admin/:id/moderate` | admin | moderation list / `{ moderationStatus, reason? }` (audited `wanted.moderate`) |
| POST | `/` | trust ≥ 1 | `WantedInput` → `Wanted` (201, matches computed synchronously) |
| GET | `/:id` | public | `Wanted` (+ `myOffer` for a host who offered); hidden/removed → 404 for non-owners |
| PATCH | `/:id` | owner | `WantedPatchInput` (recomputes) |
| POST | `/:id/pause` · `/resume` · `/fulfilled` · `/extend` | owner | §6.3 transitions (`INVALID_STATE` otherwise); extend pushes the window +30 d |
| DELETE | `/:id` | owner | → `removed` |
| PUT | `/:id/areas` | owner | `{ areas }` ≤ 5 → `Area[]` |
| GET | `/:id/areas` | public | `Area[]` |
| GET | `/:id/matches` | owner | `minScore (50), status csv, page, pageSize` → `Paginated<Match & { listing }>` + `computedAt` |
| POST | `/:id/matches/recompute` | owner | `{ count, computedAt }`, 1/min (`RATE_LIMITED`) |
| POST | `/:id/matches/:listingId/seen` · `/dismiss` | owner | `Match` |
| POST | `/:id/matches/:listingId/contact` | owner, trust ≥ 1 | `{ message? }` → `{ conversationId, match }` (`BLOCKED`, `VERIFIED_ONLY`) |
| POST | `/:id/offer` | host, trust ≥ 1 | `{ listingId, message? }` → `{ conversationId, match }` (`FORBIDDEN` not your listing, `CONFLICT` already offered with `data.conversationId`, `INVALID_STATE`, `BLOCKED`, `VERIFIED_ONLY`) |
| POST | `/:id/report` | user | `ReportInput` → `Report` |

## Seed accounts / data to try

All passwords `Passw0rd!`.
- `alice@u.northwestern.edu` — owns `wseed-w-01` (5 matches, one host offer from Chloe, some seen rows). `/wanted/mine`, `/wanted/wseed-w-01/matches`, `/wanted/digest`.
- `chloe.deng@u.northwestern.edu` — host with active listings; `/wanted/for-my-listings`, offer flow on any Northwestern post (already offered on `wseed-w-01` → `CONFLICT` → "already offered" toast with chat link).
- `ryan.zhu@illinois.edu` — UIUC seeker (`wseed-w-21`) with an offer from Yuxuan.
- Nationwide posts: `wseed-w-20` (NU → NYC), `wseed-w-24` (UIUC → Chicago/Evanston), `wseed-w-30` (NYU → LA), `wseed-w-35` (USC → Seattle). Paused: `wseed-w-34`.
- Posts are `wseed-w-01 … wseed-w-35` (NU 01–20, UIUC 21–25, NYU 26–30, USC 31–35).

Run: `GEOCODE_OFFLINE=1 DB_PATH=server/data/test-wanted.db npm run seed -- --modules core,listings,wanted --force`.

## Verification

- `npm run typecheck`: shared ✓, web ✓, server ✓ for all wanted files (at the time of writing the only server error is in another agent's in-progress `seed/chat.ts`).
- API smoke (all flows incl. create/patch/pause/resume/delete, offer, contact, dismiss, admin moderate, job run) verified with a node script against port 4102.
- `WEB_PORT=5102 node docs/modules/wanted.spec.mjs` → screenshots in `docs/screenshots/wanted/`: `browse-desktop`, `browse-filter-budget`, `browse-map`, `detail-owner-matches`, `matches-page`, `mine`, `digest`, `post-form` (full page), `post-created`, `offer-modal`, `offer-done`, `for-my-listings`, `browse-mobile`, `browse-mobile-filters`, `detail-mobile`, `detail-en`, `matches-dark`. Exits 1 on any page error or failed assertion; the create flow posts a real request through the form and deletes it afterwards.

## Known gaps

- Map tiles are not reachable from this sandbox (`ERR_TUNNEL_CONNECTION_FAILED` in the console for `tile.openstreetmap.org`); circles/pins render on a blank base in the screenshots. Seed avatar SVGs also fail to load as `<img>` in the sandbox browser (initials fallback shows) — the files are valid and served with `image/svg+xml`.
- Digest is a preview only (no email); the scaffold's nightly `digest` job is expected to call `buildDigest(userId)`.
- `listings.service.recordLead` was still a stub when this module was built; the offer/contact flows call it and swallow `NOT_IMPLEMENTED` (leads will be recorded automatically once the listings agent implements it). `GET /api/listings/mine` was live during verification.
- No server unit tests (`node --test`) for the scorer yet; the pure function in `matching.ts` is straightforward to cover if time allows.
- `relevance` sort uses `LIKE` ranking (title 3 / description 1 × recency), no FTS.

## Integration requests

1. **`web/src/components/DateRange.tsx`** — the desktop popover's "next / previous month" buttons do not work: the `focusDate`/`view` sync effect snaps `view` back to the month of `focusDate` (`diff < 0 || diff >= months`), and the `[open, value]` effect re-runs on every render when the parent passes an inline `value` object, resetting the view. Suggested fix: have the arrow buttons also move `focusDate` (or drop the snap when the user navigates), and depend on `value.start` / `value.end` instead of `value`. The wanted post form uses two native date inputs for the move-in window as a workaround; the browse filter still uses DateRange (presets and keyboard navigation work).
2. **listings** — call `wanted.service.recomputeForListing(listingId)` on publish and on updates of price / dates / location / amenities / status (DATA_MODEL §7 recompute triggers); implement `recordLead` (wanted passes `source: 'wanted_offer'` and `'message'`).
3. **chat** — context cards of type `wanted` are posted via `lib/conversations.contextCardFor('wanted', id)`; the thread header should render them (link `/wanted/:id`) next to the listing card.
4. **home / search (scaffold)** — `features/wanted/index.ts` exports the real `WantedCard` (row variant) to replace `SimpleWantedCard`; the Home 「我有房」 host CTA can use `OfferButton` + `OfferModal`.
5. **admin** — mount `features/wanted/admin.tsx` at `/admin/wanted` (uses `GET /api/wanted/admin/list`, `POST /api/wanted/admin/:id/moderate`).
6. **scaffold digest job** — `wanted.service.buildDigest(userId)` returns `{ subject, items, generatedAt }`; create the `notifications kind='digest'` row from it for users with `email_digest_opt_in = 1`.
