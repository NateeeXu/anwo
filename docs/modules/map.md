# map — 地图 (module doc)

Owner: map module agent. Contract: `docs/API.md` §7, `docs/DATA_MODEL.md` §3.5 + §9, `docs/DESIGN.md` §4.4 + §7.9.
Nationwide by design: every query is bbox- or campus-scoped, and nothing is hard-coded to Northwestern. Northwestern is only the richest seed.

## What was built

**Server** (`server/src/modules/map/`)
- `routes.ts`: every §7 endpoint plus `/layers` (alias of `/explore`), `/campus-suggest`, `/campus-stats` and the place-suggestion workflow.
- `service.ts`: the stable exports `geocode`, `commute` (= `lib/shuttle.commuteEstimate`) and `suggestCampus`, plus:
  - `commuteCached()`, which caches in `commute_cache` with a 4-decimal key and recomputes when the cached stop has been removed.
  - `reverseLocal()`, a reverse lookup with no network call. It tries a nearby warmed geocode within 120 m, then a POI within 150 m, then a shuttle stop within 150 m, and finally falls back to "x km from <campus>". Results are cached as `rev:<lat5>,<lng5>`.
  - `layersFor()`, one bbox query across `listings`, `market_items`, `buddy_posts`, `shuttle_stops` + routes, and `pois`. It returns per-layer counts and `truncated` flags, with up to 300 pins per layer, nearest-first. Listing pins are fuzzed when the address is hidden, and item pickups are rounded to 3 decimals. Each layer degrades to `[]` if its table is empty or broken. The response also includes hydrated `ListingCard`s for the nearest 40 listings, which the drawer uses.
  - `campusStats()` (bubbles for the nationwide view), `campusBounds()`, POI CRUD helpers, and the suggestion service.
- **Place suggestions (「补充地点」)**: a student (L1+) suggests a missing campus place. The server rejects it if it is more than 40 km from the campus, or if a same-named place exists within 120 m (`409 CONFLICT`). Every admin gets a bell notification (`notify`, kind `system`) and a live `admin.queue` frame. An admin then approves (this creates a POI) or rejects with a reason, and the suggester is notified either way. The notification deep-links to `/map?…&sel=poi:<id>`.
- Analytics (`lib/events`): `map.geocode`, `map.commute` (only when computed fresh), `map.explore` (with `source` set to initial, search, draw or layer; pans are not logged) and `map.poi_suggest`. The web side tracks `map.pin_click` (with entity type and id), `map.layer_toggle`, `map.draw`, `map.nationwide` and `map.share`.
- Audit: `poi.create`, `poi.update`, `poi.delete`, `map.cache_clear`, `poi_suggestion.approve` and `poi_suggestion.reject`.
- Migration `14_map.sql` adds a single table, `poi_suggestions` (needed because no existing table can hold a pending place, its suggester and the review trail).

**Shared** (`shared/src/schemas/map.ts`): query and body schemas (`GeocodeQuery`, `ReverseQuery`, `CommuteQuery`, `PoisQuery`, `LayersQuery`, `PoiInput`/`PoiUpdateInput`, `PoiSuggestionInput`, `SuggestionApproveInput`/`SuggestionRejectInput`, …), the DTOs (`MapPin`, `LayersResponse`, `CommuteResponse`, `ReverseResponse`, `GeocodeHit`, `CampusStat`, `PoiSuggestion`, …) and constants (`MAP_LAYERS`, `LAYER_PIN_CAP`, `MAX_BBOX_DEG`, `RADIUS_PRESETS_M`).

**Web** (`web/src/features/map/`)
- `/map` (`pages/MapExplorePage.tsx`, full-bleed layout). It covers:
  - **Search card.** A combobox that finds campuses and POIs locally first, then a geocoded address on Enter. An address result drops a pin and shows the commute card. If the address is closer to another campus, the page offers a switch.
  - **Layer chips** 房源 · 二手 · 搭子 · 校车 · 校园设施, each with its count. They work offline: all layers are fetched once per bbox and filtered on the client.
  - **Scope toggle** 本校区 / 全美.
  - **Search this area.** A 「在此区域搜索」 button appears after a pan. A zoom-in hint replaces it when the bbox is wider than 2°.
  - **Pins and clustering.** The page uses the §4.4 pin family: listings as a paper pill with price, items as a sunken pill, buddy posts as a date pill (`11/08`), stops as small circles, POIs as labelled dots, and the campus mark. Clustering is a grid with zoom-dependent cell size (`clusterCellForZoom`) that groups only listing, item and buddy pins, so stops and POIs stay visible.
  - **Shuttle routes** are drawn as polylines; selecting a stop highlights its routes.
  - **Draw-radius search** 「画圈搜索」. Start it from the toolbar or with 「以此为圆心」 on any selection. Drag the centre or the edge handle, or click the map to move it. Presets are 500 m, 1, 2 and 3 km, shown in the viewer's unit. The count of results inside the circle is shown, and the list is filtered to the circle.
  - **Selection panel**: a summary plus the CommuteCard (到校通勤) and an open/website action. It sits bottom-right on desktop and as a compact card above the drawer on mobile, and the map pans so the pin is never under it.
  - **Results drawer.** On desktop (≥ lg) it is a left rail that can be collapsed. On mobile it is a bottom drawer that peeks with the result count and expands to 62% height. Results are grouped by layer, with `ListingCard` rows from `@/features/listings` for listings and mini cards for everything else. It has loading, error-with-retry and empty states (empty offers 发布 and 补充地点).
  - **Map controls**: campus centre, locate (`useGeolocate`, which adds a me-marker and an accuracy circle), draw, legend, share (copies the URL) and suggest a place.
  - **Nationwide mode** shows one bubble per campus, sized by the total of listings, items and buddy posts. Empty campuses are small dots. A campus list sits in the rail or drawer, and choosing a campus switches `useCampus` and flies there.
  - **URL state**: `?c=lat,lng&z=&layers=&scope=nationwide&r=lat,lng,radiusM&sel=type:id` uses replace-navigation (no history spam). Deep links restore the view, layers, circle and selection.
  - **Accessibility.** Pins are focusable, and Enter now selects them (see the shared-component notes below). Every pin is also reachable in the list. Toolbar buttons have labels and tooltips, chips use `aria-pressed`, the search box is a combobox with active-descendant, and result counts are announced with `aria-live`.
- `SuggestPlaceModal` (submit form plus a 「我的提交」 status tab), with gates for anonymous users (login) and L0 users (verify email).
- `/map/admin` and the `admin.tsx` default export (for `/admin/map`) have three tabs:
  - Suggested places: pending, approved and rejected cards with a mini map; approve, or reject with a reason.
  - Campus places: a table of POIs per campus with category and search filters, a create/edit modal with click-to-place map and a chip category picker, hide/show and delete.
  - Caches: stat tiles, POIs per campus, offline-mode badge, and a clear-cache button.
- i18n: `web/src/i18n/map.ts` has 252 keys, every one in both zh and en.

**Shared map components** (`web/src/components/map/**`). All changes are additive (BRIEF §7 exception):
- `cluster.ts`: `clusterMarkers(map, markers, cellPx, kinds?)` and `clusterCellForZoom(zoom)`.
- `MapView`: new props `clusterCellPx` (number or function of zoom), `clusterKinds`, `onClusterClick` and `onMapClick`. Defaults are unchanged.
- Fix in `MapView`: pressing **Enter** on a focused pin or cluster now selects it or zooms to it. Leaflet 1.9 only maps Enter to popups, so ASSETS.md §2.1's "mouse or Enter" claim did not hold before.
- `DrawSearchControl`, `CommuteBadge`, `useCommute`, `useGeocode`, `useReverse`, `mapQueryKeys` and `meIcon`. `map.css` gains the draw, me and bubble styles.

## Endpoints (`/api/map`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/geocode?q=&near=&campusId=` | user, 30/min | Checks the cache, then Nominatim, then a campus-centroid fallback. Returns `results[0]` with `campusSuggestion`, plus `cached` and `offline`. |
| GET | `/reverse?lat=&lng=` | user | Local data only (cache, POI, stop, campus); response includes `source` and `nearestCampus`. |
| GET | `/commute?lat=&lng=&campusId?` | public | Walk, bike and shuttle minutes plus nearest stop and campus. Cached in `commute_cache`. With no `campusId` it uses the user's campus, then the nearest campus. |
| GET | `/pois?campusId=&category=csv&bbox=&q=` | public | Up to 500 results. |
| GET | `/layers` (alias `/explore`) `?bbox=&campusId=&layers=&priceMin&priceMax&category&buddyType&dateFrom&dateTo&source` | public | Returns `{ listings, listingCards, items, buddy, shuttleStops, shuttleRoutes, pois, counts, truncated, campusId, bbox }`. A bbox wider than 2° returns `400 BAD_REQUEST`. |
| GET | `/campus-suggest?lat=&lng=` | public | `{ suggested (≤ 40 km), nearest[3] }` |
| GET | `/campus-stats?bbox?` | public | One row per active campus with counts and totals. |
| GET | `/campus/:id/bounds` | public | `{ center, bbox, defaultZoom, radiusM }` |
| POST | `/suggestions` | L1+, 10/h | Body is `PoiSuggestionInput`. Returns `201 PoiSuggestion`. Errors: `409 CONFLICT` for a duplicate, `400` for a place more than 40 km away. |
| GET | `/suggestions/mine` | user | |
| GET | `/admin/pois?campusId&category&q` | admin | Includes hidden POIs (`isActive`). |
| POST / PATCH / DELETE | `/admin/pois[/:id]` | admin | Audited. |
| GET | `/admin/suggestions?status&campusId` | admin | `{ items, pending }` |
| POST | `/admin/suggestions/:id/approve` | admin | The body may override fields and tags. Creates the POI and notifies the suggester. `409 INVALID_STATE` if the suggestion is not pending. |
| POST | `/admin/suggestions/:id/reject` | admin | Body `{ reason }`; notifies the suggester. |
| GET | `/admin/stats` | admin | Geocode cache, commute cache, POIs, suggestions, by-campus counts, offline flag. |
| DELETE | `/admin/geocode-cache` | admin | Body `{ olderThanDays? }`. With 0 it also clears `commute_cache`. |

## Components other modules can import

```ts
import { CommuteCard, useGeolocate, LayerChips, MapLegend, mapApi, mapQueryKeys } from '@/features/map';
<CommuteCard lat={l.lat} lng={l.lng} campusId={l.campusId} />                 // three tiles + nearest stop (listing/market detail rails)
<CommuteCard lat={item.pickupLat} lng={item.pickupLng} campusId={item.campusId} variant="inline" />   // chip row
const geo = useGeolocate(); await geo.locate();   // { status, position, errorKey (i18n key), supported, locate, reset }

import { MapView, StaticMapPreview, PricePin, CommuteBadge, DrawSearchControl, useCommute, useGeocode, useReverse, clusterCellForZoom } from '@/components/map';
<MapView … clusterCellPx={clusterCellForZoom} clusterKinds={['listing', 'item']} onMapClick={(p) => setPin(p)} />
```
Server side: `import { geocode, commute, commuteCached, suggestCampus, reverseLocal } from '../map/service'`.

## Seed accounts / data to try

- Run `GEOCODE_OFFLINE=1 DB_PATH=server/data/test-map.db npm run seed -w server -- --modules core,listings,market,buddy,shuttle,map --force`. The map seed is version 3 and idempotent (deterministic ids).
- POIs: 47 at Northwestern, 14 at UIUC, 15 at NYU and 17 at USC. All are bilingual with real-street addresses.
  - Northwestern covers buildings, libraries and dining; grocery (Whole Foods, Trader Joe's, Target, Jewel-Osco, H Mart, Mitsuwa, Tai Nam); 5 CTA Purple Line stops and 2 Metra stations; banks, clinics and pharmacies; gyms (SPAC, Blomquist, LA Fitness); and USPS.
- A warmed forward-geocode cache of 24 rooftop addresses in Evanston, Champaign/Urbana, Manhattan and LA, so address search answers precisely even with `GEOCODE_OFFLINE=1`. Try `1735 Chicago Ave, Evanston, IL 60201`.
- Five place suggestions:
  - Pending: bob's Clarke's, alice's Farmers Market, and a UIUC student's Green St bubble tea.
  - Rejected: alice's bookstore, with a reason.
  - Approved: bob's Kung Fu Tea.
- A handful of `map.*` analytics events.
- Accounts (password `Passw0rd!`): `alice@u.northwestern.edu` (L2) to explore and suggest; `admin@example.edu` for `/map/admin`; `newbie@u.northwestern.edu` (L0) to see the verify gate on 补充地点.

## Verification

- `npm run typecheck` passes for shared, server and web.
- `WEB_PORT=5105 node docs/modules/map.spec.mjs` exits with `map spec: OK`: no page errors, and no console errors apart from the sandbox's blocked OSM tiles and WebSocket proxy noise.
  - The spec runs API contract checks, then the alice desktop flows: layers, POI with commute, draw radius, search this area, address search, nationwide, and switching to UIUC and back.
  - It then exercises two create flows: alice suggests a place; the admin is notified, approves it, and creates a POI through the form. Alice's bell links to the live place.
  - Finally it covers mobile (explore, drawer, selection), dark mode and English.
- Screenshots are in `docs/screenshots/map/`:
  - Desktop, light: `explore-desktop`, `poi-commute-desktop`, `draw-radius-desktop`, `search-address-desktop`, `nationwide-desktop`, `suggest-modal-desktop`, `admin-suggestions-desktop`, `admin-poi-form-desktop`, `approved-place-desktop`.
  - Mobile: `explore-mobile`, `drawer-mobile`, `selection-mobile`.
  - Dark: `explore-dark`.
  - English: `explore-en`, `nationwide-en`.

## Known gaps

- OSM tiles are not reachable in the sandbox, so screenshots show the `sunken` map background with pins, routes and shapes only.
- `/geocode` returns one result: `lib/geo.geocode` resolves a single best hit. The `limit` parameter is accepted but not yet honoured.
- Commute is an estimate based on straight-line distance (DATA_MODEL §3.5 formulas), and the UI says so. It does not use real routing.
- The draw tool is a circle, not a free polygon. DESIGN §7.9 mentions a polygon; the brief's module notes asked for a circle around a dragged point.
- Nationwide bubbles overlap at zoom 4 for nearby campuses (Northwestern / UIUC). The campus list in the rail is the accessible equivalent.
- The buddy layer shows open posts that have coordinates (start ≥ now). `buddy_events` rows are not plotted separately.

## Integration requests

1. **`components/Select` inside `Modal`**: the custom listbox renders at `z-layer-dropdown` (40), under the modal scrim (60), so options cannot be clicked. The map module works around it with a chip `CategoryPicker` and a native `<select>` in its modals. Request: portal the listbox at `z-layer-modal + 1` when it is opened from inside a dialog.
2. **`lib/geo.geocode`**: please return up to `limit` candidates (Nominatim `limit=`) so `/api/map/geocode` can offer a choice list.
3. **ASSETS.md §2.1** should note that Enter-to-select for pins is implemented in `MapView` (keypress handler added by the map module), not by Leaflet.
4. **Admin shell**: mount `features/map/admin.tsx` at `/admin/map` and show `GET /api/map/admin/stats → suggestions.pending` (also pushed as `admin.queue` with `queue: 'poi_suggestions'`) as a nav badge.
5. **Listings / market detail pages**: embed `<CommuteCard>` from `@/features/map` in the right rail (listing) and next to the pickup map (market, `variant="inline"`).
