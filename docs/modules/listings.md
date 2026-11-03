# Module `listings` — 转租 / 房源

Owner: listings module agent. Ports: server **4101**, web **5101**, test DB `server/data/test-listings.db`.
Run: `GEOCODE_OFFLINE=1 PORT=4101 DB_PATH=server/data/test-listings.db npm run dev -w server` · `VITE_PORT=5101 VITE_API_TARGET=http://127.0.0.1:4101 npx vite --config web/vite.config.ts` · seed `GEOCODE_OFFLINE=1 DB_PATH=server/data/test-listings.db npm run seed -w server -- --modules core,listings --force` · spec `WEB_PORT=5101 node docs/modules/listings.spec.mjs`.

## What was built

**Server** (`server/src/modules/listings/`)
- `routes.ts` — every endpoint of API.md §3 (table below), plus `GET /stats` (price histogram for the FilterBar), `GET /geocode` and `GET /campuses/suggest` for the wizard.
- `service.ts` — domain layer: `ListingRow` → `Listing` DTO (`toListingDto`, built on `lib/cards.listingCards` so cards never diverge), exact-address rules (owner / admin / escrow party see the real pin, everyone else gets `lib/geo.fuzz`), `resolvePlacement` (manual pin wins → `lib/geo.geocode` → `suggestCampus` ≤ 40 km, else nearest with `farFromCampus`), commute caches (`walk 80 m/min`, `bike 250 m/min`, `shuttle = walk to nearest stop + 3 min/km` via `lib/shuttle.nearestStop`), DATA_MODEL §6.2 state machine (`publishListing` checks trust ≥ 1, ≥ 1 photo, lat/lng, price, quota = `users.listing_quota` / landlord ≥ 3 / Pro unlimited; `pause` / `resume` / `markRented` / `renew` (+30 d) / `removeListing`), photo set replacement (array order = `sort_order`, first = cover, uploads must be public images owned by the caller), amenities, availability ranges with overlap validation, `recordView` (one `listing.view` event per viewer per 6 h → `view_count`), share text + QR-style SVG, `runExpiry`.
- Stable exports (DATA_MODEL §1): `recordLead({ listingId, userId, conversationId?, source })` — the only writer of `listing_leads` (idempotent per listing+user, ignores the owner) — and `listingContextCard(id)`.
- `jobs.ts` — `listings.expireListings` every 30 min: flips `active → expired` past `expires_at`, bell-notifies the owner, and sends a 3-day 「即将到期」 warning once per week.
- Analytics via `lib/events.logEvent`: `listing.view`, `listing.contact_click`, `chat.start`, `listing.save`, `listing.share`, `listing.publish`, `listing.create`, `listing.rented`, `listing.remove`, `search` (module=listings), `boost.impression` / `boost.click` (through `lib/sponsored`).
- Notifications via `lib/notify`: new lead (`chat.message` kind, links to the thread), listing expired / expiring (`system`).
- Sponsored slots (DATA_MODEL §8): `pickSponsored` + `mergeSponsored` on page 1 of browse lists (not with `q` or `ownerId`); a boosted listing is only used if it still satisfies the current filters; `pageSize ≤ 8` (home block) restricts to `max` tier; impressions recorded; `GET /:id?boost=<boostId>` records the click.
- Message host: `lib/conversations.openConversation` (direct, context `listing`) + `postContextCard(listingContextCard)` on creation + optional first text message; checks blocks (`isBlockedEither`), `verified_only_messaging`, banned host, and a daily new-conversation cap (5 / 20 / 50 by trust level) before recording the lead and notifying the host. `wanted.recomputeForListing` and `market.closeBundlesForListing` are called through their `service.ts` and tolerated while stubbed (SQL fallback for bundles).

**Shared** (`shared/src/schemas/listings.ts`): `ListingListQuery`, `ListingInput`, `ListingUpdateInput`, `PhotosInput`, `AmenitiesInput`, `AvailabilityInput`, `ContactInput`, `RentedInput`, `LeadStatusInput`, `LeadsQuery`, `MineQuery`, `StatsQuery`, `SimilarQuery`, `CampusStatsQuery`, `GeocodeQuery`, `SuggestCampusQuery`, `LISTING_SORTS`, `BEDROOM_FILTERS`.

**Seed** (`server/src/db/seed/listings.ts`, version 4): 73 listings — Northwestern 45 (Evanston downtown / north / south / west, Rogers Park, Lakeview, Loop / River North / South Loop / Streeterville, Wilmette, Skokie), UIUC 12 (Campustown, Urbana, downtown Champaign), NYU 10 (East / Greenwich Village, LES, Chinatown, Williamsburg, Fort Greene, Downtown Brooklyn), USC 3, UMich 3. Real street names, plausible coordinates, $600–$4,500 (student sublets $650–$3,200, a few Manhattan leases above), summer-2027 / winter / fall dates, 2–8 photos each from `/uploads/seed/rooms/*.svg`, bilingual descriptions, amenities, a booked/blocked availability exception, 12 active boosts (max/plus/basic across 5 campuses), 35 saves, 16 leads, 540 historical `listing.view` events for the owner stats chart; statuses: 64 active, 1 draft, 3 paused, 4 rented, 1 expired; re-runs delete and recreate rows by deterministic seed id.

**Web** (`web/src/features/listings/`)
- `pages/Browse.tsx` `/listings` — PageHeader + SecondaryTabs, sticky FilterBar (dates, price with histogram from `GET /api/listings/stats`, bedrooms/bathrooms, furnished, near shuttle, pets, 「更多筛选」 sheet with lease / listing / property type, gender, min term, parking, utilities, verified host, amenities), sort (recent / price / distance / move-in / relevance when searching), campus ↔ nationwide toggle, nationwide city/school search + radius, split list + MapView on desktop with hover sync both ways, pin click scrolls + highlights the card, 「在此区域搜索」 bbox search, visited pins/titles muted, mobile 地图/列表 SegmentedControl with bottom row-card carousel, saved searches (save modal + dropdown via `/api/search/saved`), skeleton / error / empty states, live result-count announcement.
- `pages/Detail.tsx` `/listings/:id` — breadcrumb, share / save / report actions, PhotoGallery hero, title + commute line, chips, TrustStrip (§4.6, warning rim for L0–1 hosts), facts grid, description, availability calendar (3 months, booked/blocked exceptions, campus timezone), amenities grid with lucide icons, location card (StaticMapPreview + campus mark, approx/exact note, walk/bike/shuttle tiles, nearest stop), roommates & rules, move-out bundle link, similar listings, sticky price rail (联系房东 → ContactModal → `/chat/:id`, 安全支付押金 → `/pricing?escrow=listing:<id>`, stats line), mobile sticky bottom bar, owner panel (status switch, publish / renew / relist, stats, boost link `/pricing?boost=listing:<id>`, edit, mark rented w/ bundle close, delete) with StatsModal.
- `pages/PostWizard.tsx` `/post/listing` (+ `/listings/:id/edit`) — 5 steps with progress caption + accent bar, localStorage autosave (`anwo.listings.draft`, restore + discard), address → 定位 (`GET /api/listings/geocode`) → MapView with draggable price pin → campus Select auto-suggested with distance / far warning, hideExactAddress switch, home facts + amenities, date presets + native date inputs + open-ended / flexible, price / deposit / min term, roommates & rules + description, PhotoUploader (1–10), review card, live ListingCard preview, inline per-step validation + error summary, 保存草稿 / 发布 (create → publish → `/listings/:id/success`), quota errors routed to 我的房源.
- `pages/PostSuccess.tsx` — card, 查看 / 我的房源 / 分享, boost upsell card → `/pricing?boost=listing:<id>`, next steps.
- `pages/Mine.tsx` `/listings/mine` — StatTiles, status tabs with counts, Table (cards on mobile) with status / dates / views / saves / leads, row menu (view, edit, publish, pause, resume, rented, relist, renew, leads, stats, boost, delete), LeadsModal (status select, open chat, Pro lock note), StatsModal (daily views bars, contact rate, boost impressions/clicks, campus rank; series locked for non-Pro).
- `pages/Saved.tsx` `/listings/saved`.
- Components: `ListingCard` (§4.1, grid + row variants), `SaveButton` / `useSaveListing`, `TrustStrip`, `AvailabilityCalendar`, `FilterControls`, `SavedSearches`, `DetailModals` (Share / Report / Contact), `OwnerPanel`, `OwnerDialogs`, `StatusBadge`, `useListingActions`.
- `web/src/i18n/listings.ts` — ~430 keys, both locales.

## Endpoints (`/api/listings`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/` | public | ScopeQuery + all API.md §3 filters, `sort` (`recent` default, `relevance` with `q`, `price_asc`, `price_desc`, `distance`, `date`, `hot`), `view=pins` (≤ 500 `{ id, lat, lng, priceCents, boostTier?, isVerifiedListing, saved? }`), `ownerId` skips the campus filter, sponsored slots on page 1, `data.scope` echo |
| GET | `/stats` | public | `{ histogram[24], bounds, step, count, medianPriceCents }` for the current scope + filters (price filters ignored) |
| GET | `/stats/campus` | public | `{ activeCount, medianPriceCents, p25, p75, byBedrooms }` |
| GET | `/geocode?q=&campusId=` | public, 30/min | `GeocodeResult & { approx, cached, campusSuggestion }` |
| GET | `/campuses/suggest?lat=&lng=` | public | `{ suggested, nearest[3] }` |
| GET | `/mine` | user | `Paginated<Listing>` (owner fields) + `counts`, `summary`, `quota` |
| GET | `/saved` | user | `Paginated<ListingCard>` |
| POST | `/` | user | `ListingInput` → draft `Listing` (+ `placement.farFromCampus/approx`) |
| GET | `/:id` | public | owner/admin/escrow party see the exact address; `?boost=<id>` records a click; drafts/hidden → 404 for others |
| PATCH | `/:id` | owner | partial update, re-geocodes when address/pin/campus changes, recomputes commute, triggers match recompute when active |
| POST | `/:id/publish` `/pause` `/resume` `/rented` `/renew` | owner | state machine; `TRUST_REQUIRED`, `QUOTA_EXCEEDED`, `VALIDATION { photos, lat, priceCents }`, `INVALID_STATE` |
| DELETE | `/:id` | owner | → `removed` |
| PUT | `/:id/photos` `/amenities` `/availability` | owner | replace sets; availability overlap → `VALIDATION` |
| GET | `/:id/availability` | public | |
| POST / DELETE | `/:id/save` | user | idempotent, returns `saveCount` |
| POST | `/:id/report` | user | `lib/reports.createReport` |
| GET | `/:id/share` | public | `{ url, title, text, qrSvg }` |
| POST | `/:id/contact` | trust ≥ 1 | `{ conversationId, created, leadId }` |
| GET / PATCH | `/:id/leads`, `/:id/leads/:leadId` | owner | non-Pro: latest 3 + `locked: true` |
| GET | `/:id/stats?days=` | owner | series locked for non-Pro |
| GET | `/:id/similar?limit=` | public | same campus, ±25 % price, ±1 bedroom |

## Components other modules can import

```ts
import { ListingCard, SaveButton, TrustStrip, ListingStatusBadge, listingsApi, listingsQueryKeys } from '@/features/listings';
<ListingCard listing={card} />                                  // grid card, DESIGN §4.1
<ListingCard listing={card} variant="row" />                    // compact row (chat context cards, map lists)
<ListingCard listing={card} onHover={setHoverId} active={id === activeId} showCity noSave />
```
Props: `{ listing: ListingCard, variant?: 'grid' | 'row', onHover?, active?, showCity?, noSave?, visited?, className?, onClick? }`. The card is one `<Link>`; the save heart is an absolute sibling (not nested). Server side: `recordLead()` and `listingContextCard()` from `server/src/modules/listings/service.ts`.

## Seed accounts / data worth knowing

- `alice@u.northwestern.edu` (L2): 1 active boosted listing (1720 Sherman Ave, 4 leads, 4 saves), 1 draft, 1 rented; 7 saved listings; a saved search is created by the spec.
- `landlord@evanstonhomes.com` (L3, quota 3): Hinman 2B2B (plus boost), Maple Ave room, Ridge Ave house (paused), Loop 1B1B, Wilmette 2B1B.
- `bob@u.northwestern.edu` (L1): Colfax St summer sublet; appears as a lead on alice's listing.
- UIUC `meilin.gao@illinois.edu` (L3), NYU `ziyang.pan@nyu.edu` (L3) and `manhattan.lets@outlook.com` (landlord) host the verified listings on other campuses.

## Screenshots (`docs/screenshots/listings/`)

`browse-desktop`, `browse-price-filter`, `browse-nationwide-en`, `browse-mobile`, `browse-mobile-map`, `browse-mobile-filters`, `detail-desktop`, `detail-share`, `detail-contact`, `detail-dark`, `detail-mobile`, `mine-desktop`, `mine-leads`, `mine-mobile`, `wizard-step1`, `wizard-step5`, `post-success`.

## Known gaps

- `qrSvg` from `GET /:id/share` is a deterministic QR-*styled* SVG, not a scannable QR code (no QR library in the allowed stack); the modal shows it as decoration next to the copyable link.
- Shuttle data: `nearest_stop_m` / `commute_shuttle_min` are computed from `shuttle_stops` when the shuttle seed has run; when it has not (the shuttle seed was a stub at seed time) the listings seed writes plausible cached values for central-Evanston addresses so the 「近校车」 chip is visible. Re-running the listings seed after the shuttle seed uses real stops.
- Boost rows for the 12 boosted seed listings are inserted by this seed (billing's seed was a stub); they use deterministic ids and are deleted/recreated on re-seed only for these listing ids. Billing may overwrite freely.
- Browse map tiles are blocked in the sandbox (OSM), so screenshots show pins on the `sunken` background.
- `GET /:id/stats` views series comes from the `events` table (180-day retention), not a dedicated daily rollup.

## Integration requests

1. **`docs/tools/shot.mjs` `login()`** posts `/api/auth/login` without `X-Requested-With: fetch`, so the API call is rejected by CSRF (403) and it falls back to the UI form; the spec ships its own CSRF-aware login. Add the header there.
2. **`DateRange` desktop popover** never positions when opened from its own trigger: `useAnchorPosition` computes in a layout effect before the `Portal` child exists, `pos` stays `null` and the dialog sits at `top/left -9999`. The wizard uses native date inputs + preset chips instead; the FilterChip menu variant (inline DateRange) is fine.
3. **Home / Search / Profile** can now swap `SimpleListingCard` for `ListingCard` from `@/features/listings` (same props shape).
4. **`lib/cards.listingCards`** has no `exact` per-row override for escrow parties in batch lists; the detail route handles it via `canSeeExact`. A `{ exactIds?: Set<string> }` option would let `/mine`/search reuse it.
5. **`CampusSwitcher` `NATIONWIDE_ROUTES`** already includes `/listings`; `/listings/saved` would also benefit (saved listings span campuses) — optional.
