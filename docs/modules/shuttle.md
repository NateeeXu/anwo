# shuttle — 校车 (module doc)

Owner: shuttle module agent. Scope: BRIEF §3 #6, API.md §8, DATA_MODEL §3.6, DESIGN §7.10. Nationwide-ready: every table, endpoint and page is keyed by `campus_id`; nothing refers to Northwestern except the seed data.

## What was built

**Server** (`server/src/modules/shuttle/`)
- `routes.ts` — every endpoint of API.md §8 plus admin import / export (table below). Zod schemas live in `shared/src/schemas/shuttle.ts` (`shuttleSchemas`): query/param/body schemas, the `ImportInput` shape, `HHMM` / `HexColor` helpers.
- `lib.ts` — data access + schedule maths: campus-local clock (`localInfo(timezone, at)` via `Intl`, honours the dev clock), service-day resolution (`holiday` from `shared/src/holidays.ts` → `saturday` / `sunday` / `weekday`), **two kinds of routes**: *timetable-based* (rows in `shuttle_schedule`, optional `valid_from` / `valid_to` for seasonal or game-day service) and *headway-based* (no rows for that service day → departures synthesised from `first_departure + k × headway_min ≤ last_departure`, offset by each stop's `minutes_from_start`). Next departures merge every active route at the stop, sorted by time, and include the previous service day's after-midnight trips (`25:10` → `01:10`) before 04:00. `routeDepartures()` reports `kind: 'timetable' | 'headway' | 'none'` so the UI can say 「季节性运行 / 今日无班次」 rather than show an empty table.
- `importCampusRoutes(campusId, routes, { replace, idPrefix })` — idempotent importer used by both the seed and `POST /admin/import`: stops dedupe by `key` or name within the campus, routes by name, timetable blocks expand into per-stop rows. Matched routes and stops are **updated in place** (ids stay stable, so alerts — which cascade on route delete —, favorites and `listings.nearest_stop_id` survive a re-import); with `replace: true` the routes / stops the payload no longer mentions are deleted afterwards. `exportCampusRoutes()` is the inverse (round-trip through the admin UI; the spec re-imports UIUC and asserts ids are unchanged).
- `service.ts` — keeps the scaffold `nearestStop` / `commuteEstimate` re-exports (DATA_MODEL §1 contract for listings / map) and adds `campusHasData`, `stopsNear`, `nextDeparturesAtStop`, `activeAlerts`, `importCampusRoutes`, `exportCampusRoutes`, `localInfo`, `serviceDayFor`.
- Admin writes are audited (`shuttle.alert.create` / `update` / `activate` / `deactivate` / `delete`, `shuttle.request.status`, `shuttle.import`). Creating a live alert notifies (`shuttle.alert`) every user who saved the route or one of its stops (campus-wide alerts → anyone who saved anything on that campus); the response carries `notified`. A new campus request pings admins (`system` notification, link to `/admin/shuttle?tab=requests`); moving a request to `planned` / `done`, or importing the campus, notifies the requester.
- Analytics (`lib/events`): `shuttle.view` (canonical), `shuttle.route.view`, `shuttle.stop.view`, `shuttle.favorite` / `shuttle.unfavorite`, `shuttle.request`, `shuttle.alert.*`, `shuttle.import`; the web tracks `shuttle.official_click` and `shuttle.route.share`.
- `hasData` is computed from active routes, not from `campuses.has_shuttle` (that column is scaffold-owned and seeded from `shared/src/campuses.ts`), so an admin import makes a campus live immediately.

**Seed** (`server/src/db/seed/shuttle.ts`, version 1) — all routes `isApproximate = true` with `officialUrl`; coordinates follow the real streets.
- **Northwestern (rich)**: Intercampus Shuttle Evanston → Chicago and Chicago → Evanston (timetable: 30-min weekdays, hourly weekends; Sheridan Rd → Lake Shore Dr → Streeterville, ~54 min), Campus Loop (headway 20 min daily, 8 stops: Noyes, Tech, Norris, the Arch, Chicago & Dempster, Davis St station, Foster-Walker, Lincoln), Frostbite Express (timetable every 10 min, valid 2026-11-30 → 2027-03-12 — shows 「今日无班次 / 季节性运行」 until then), Ryan Field Game Day (Saturday timetable, valid Sep 5 → Nov 28), Chicago Campus Loop (headway 12 min weekdays: Abbott Hall, Ward, Lurie, Prentice, Chicago/Michigan Red Line, Erie & Fairbanks). 15 stops, bilingual names + addresses.
- **UIUC**: MTD 22 Illini (daily, 10 min, Illinois Terminal → Green St → PAR → Orchard Downs) and 5 Green (weekdays). **NYU**: Routes A, B, C, E, F (weekend loop until 01:40 — exercises after-midnight times), G. **USC**: Campus Tram, Union Station Express, Health Sciences Express.
- Alerts: 2 live at Northwestern (route-scoped `warning` Lake Shore Dr detour, campus-wide `info` Thanksgiving schedule), 1 live at NYU (Route C), 1 expired (`is_active = 0`) and 1 scheduled `critical` winter-break alert (shows as 「待生效」 in admin).
- Favorites: alice (Campus Loop, Noyes, Davis), bob (Intercampus ↓, Noyes), first NYU student (Route A). Requests: Purdue `open` (email only), Northeastern `planned`, UIUC `done`. A few `shuttle.*` events.
- Re-runnable (verified by seeding twice): campuses are imported with `replace: true` and prefixed ids (`seed-shuttle-route-northwestern-campus-loop`, `seed-shuttle-stop-northwestern-noyes`, …); stale favorites are pruned.

**Web** (`web/src/features/shuttle/`, `web/src/i18n/shuttle.ts` — every string in zh-CN and en)
- `/shuttle` — `ShuttlePage.tsx`: alerts banner (severity-tinted, dismissible per alert id for the session), PageHeader with 「时刻为近似值」 tooltip and the 「官方实时追踪 ↗」 link from campus data, tabs 路线 / 站点 / 收藏 beside a `MapView` with coloured polylines + stop markers + campus mark (selected route = thicker line, others muted; map fits the campus-local stops, the selected route, or the selected stop). Route list → route panel (facts, 「查看时刻表」, official schedule link, ordered stops along a coloured rail). Stop detail (sidebar on desktop, `Sheet` on mobile) with the **next-departure countdown refetched every 30 s** (first departure as `price-lg accent-vivid`, local tick between refetches, 「刚刚更新 / n 秒前更新」), routes at the stop, address + OpenStreetMap link. Stops tab: search + 「离我最近」 (geolocation, sorted by distance). Favorites tab: saved stops with their next departure inline + saved routes; anonymous → login nudge. URL state `?tab=`, `?route=`, `?stop=` (deep-linkable). No-data campus: `NoShuttle` illustration empty state → 「申请添加我的校区」 modal (official URL, email, note; anonymous allowed) → success / duplicate / planned states; link to the official page when the campus record has one. Loading skeletons, error state with retry.
- `/shuttle/:routeId` — `RouteDetailPage.tsx`: breadcrumb, swatch + name, bilingual description, save / share / official link, alerts, facts (headway, hours, service days + 「今日运行」, duration), ordered stops with 「下一班 HH:MM」 at each (from today's timetable), map, timetable by service day (`Tabs` pill: 工作日 / 周六 / 周日 / 假日 as applicable) — `TimetableView` collapses departed trips, highlights the next trip, sticky stop column, seasonal / no-service messaging.
- `/shuttle/admin` (`admin.tsx`, default export; the admin shell mounts it at `/admin/shuttle`): campus selector; **服务通知** table (severity, bilingual title, route, window, live / scheduled / expired / inactive) with create / edit modal (route or campus-wide, severity, title + body in both languages, start / end `datetime-local`), activate / deactivate / delete (confirm) as inline icon buttons per row; **校区申请** with status workflow; **导入线路** JSON editor with template, export of the current campus, replace toggle and zod field errors inline.
- Components other modules can import from `@/features/shuttle` (`index.ts`): **`NearestStopChip`** (`web/src/features/shuttle/components/NearestStopChip.tsx`) — `<NearestStopChip campusId lat lng />` fetches `/api/shuttle/nearby` (limit 1, cached 10 min) or `<NearestStopChip campusId stop={…} distanceM={…} asText />` when the card already carries the stop; renders 「Noyes · 步行 4 分钟」 linking to `/shuttle?stop=<id>`, nothing when no stop within 800 m. Also `AlertsBanner`, `RouteSwatch` / `RouteDot`, `DeparturesList`, hooks `useCampusShuttle`, `useNearbyStops`, `useNextDepartures`, `useRoute`, `shuttleKeys`, helpers `stopName`, `serviceDaysLabel`, `serviceSummary`, `formatShuttleTime`.

## Endpoints (`/api/shuttle`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/campus/:campusId` | public | `{ campus, routes (+stopCount, stopIds, favorited, runsToday), stops (+routes, favorited), alerts (live), serviceDayToday, nowLocal, today, hasData, request? }` |
| GET | `/routes` | public | `campusId`, `activeOnly=true` → route list (no stops detail) |
| GET | `/routes/:id` | public | route + ordered stops + polyline + `alerts`, `campus`, `runsToday`, `favorited` |
| GET | `/routes/:id/timetable` | public | `serviceDay?`, `date?` → `{ route, serviceDay, date, kind, stops, trips[{ tripIndex, departures[{ stopId, time }] }], nowLocal, isToday }` |
| GET | `/stops` | public | `campusId`, `bbox?` or `near=lat,lng&radiusM≤3000` (adds `distanceM`, `walkMin`) |
| GET | `/stops/:id` | public | stop + routes + alerts + `favorited` |
| GET | `/stops/:id/next` | public | `limit≤10`, `at?` ISO → `{ stop, serviceDay, nowLocal, at, departures[{ routeId, routeName, routeColor, time, inMinutes, tripIndex }], alerts }` |
| GET | `/nearby` | public | `lat, lng, campusId, radiusM≤1500, limit≤5` → `{ stops[] }` (listings' near-shuttle badge) |
| GET | `/alerts` | public | `campusId`, `includeInactive` (admin only) |
| GET | `/favorites` | user | `{ stops, routes }` |
| PUT / DELETE | `/favorites/:entityType/:id` | user | `stop` \| `route` |
| POST | `/requests` | public | `{ campusId, email?, officialUrl?, note? }` → `{ id, status }` (`done` when the campus already has data; `duplicate: true` when the user already has an open one) |
| GET | `/admin/alerts` | admin | `campusId?, includeInactive=true, page, pageSize` → paginated with `route`, `campus`, `live` |
| POST | `/admin/alerts` | admin | `AlertCreateInput` → alert + `notified` (audited) |
| PATCH | `/admin/alerts/:id` | admin | partial + `isActive` (audited) |
| DELETE | `/admin/alerts/:id` | admin | audited |
| GET | `/admin/requests` | admin | `status?, campusId?, page, pageSize` → paginated + `counts` |
| PATCH | `/admin/requests/:id` | admin | `{ status }` (notifies the requester on `planned` / `done`) |
| POST | `/admin/import` | admin | `ImportInput` `{ campusId, replace, routes[{ name, color?, serviceDays?, headwayMin?, firstDeparture?, lastDeparture?, stops[{ key?, name, nameZh?, lat, lng, minutesFromStart }], timetable?[{ serviceDay, departures[], validFrom?, validTo? }] }] }` → `{ routes, stops, scheduleRows, routeIds, closedRequests }` |
| GET | `/admin/export/:campusId` | admin | the same JSON shape (round-trip) |

## Seed accounts / data to try

- `alice@u.northwestern.edu` — saved Campus Loop + Noyes + Davis (favorites tab is populated, alerts for Campus Loop notify her).
- `bob@u.northwestern.edu` — saved Intercampus ↓ + Noyes.
- `admin@example.edu` — `/shuttle/admin` (the seed admin has no campus; the spec sets it to Northwestern via `PATCH /api/users/me`).
- Campuses with data: `northwestern`, `uiuc`, `nyu`, `usc`. Switch to `purdue` / `northeastern` for the request-my-campus state.

## Verification

- `npm run typecheck`: shared and server pass. Web currently stops at a syntax error in another agent's in-progress file (`web/src/features/billing/components/BoostSheet.tsx`); because tsc skips semantic checks when any syntax error exists, the shuttle files were checked through the TypeScript API (semantic diagnostics, `noUnusedLocals`) — 0 errors in `web/src/features/shuttle/**` and `web/src/i18n/shuttle.ts`. Remaining web errors at the time were in listings / map / billing files.
- `docs/modules/shuttle.spec.mjs` (`WEB_PORT=5106 node docs/modules/shuttle.spec.mjs`, ports 4106 / 5106, `DB_PATH=server/data/test-shuttle.db`, `GEOCODE_OFFLINE=1`) is built on `docs/tools/shot.mjs` (`openApp`, `login` via `POST /api/auth/login`, `shot`, `finish`; contexts send `X-Requested-With: fetch` so the API login passes CSRF): anonymous browse + API contract checks (`/nearby`, NYU Route F after-midnight `00:40` at Sun 00:30 ET, Campus Loop headway synthesis `08:03` at Tech) → alice route panel → stop countdown → save a stop through the UI and see it in 收藏 → route detail + Saturday timetable → mobile browse + stop sheet → **create flow 1**: request-my-campus on Purdue (asserted through the admin API) → **create flow 2**: admin creates an alert, it appears on the public page, deactivated through the row action (asserted via API), **admin import round-trip** (export UIUC → import → route ids / stop counts unchanged), requests tab → dark mode stop detail → English route detail (mobile, full page). Exits 1 on any `pageerror` or non-network `console.error`; `summary.json` is written next to the screenshots.
- Screenshots (`docs/screenshots/shuttle/`): `browse-desktop`, `admin-import-desktop`, `route-panel-desktop`, `stop-desktop`, `favorites-desktop`, `route-detail-desktop`, `route-detail-saturday-desktop`, `browse-mobile`, `stop-sheet-mobile`, `no-data-desktop`, `request-form-desktop`, `request-success-desktop`, `admin-alert-form-desktop`, `admin-alerts-desktop`, `alert-live-desktop`, `admin-requests-desktop`, `stop-dark-desktop` (dark), `route-detail-en-mobile` (EN).

## Known gaps

- OSM tiles are unreachable from the sandbox, so screenshots show polylines and markers on the `sunken` map background (the UI itself is unaffected; see ASSETS.md §7).
- On mobile, alert bodies collapse behind 「详情 / Details」 so two alerts do not fill the first screen; route-detail actions sit below the title on mobile.
- Route descriptions are stored as one bilingual string in `shuttle_routes.description` (the schema has no `description_zh`); the web splits on the first CJK character (`splitBilingual`). A `description_zh` column would be cleaner — not added to avoid a migration while other agents share the DB.
- Timetables are approximations compiled from public pages; there is no live vehicle position (the official tracker link covers that). `isApproximate` is surfaced everywhere.
- Headway routes show synthesised times; real operators drift. Holidays come from the static `shared/src/holidays.ts` list.
- The admin JSON import validates with zod and dedupes stops by name; it does not geocode addresses (lat / lng are required).
- The `ShuttleRoute` DTO in `shared/src/types.ts` has no `runsToday` / `stopCount` fields; the module types extend it locally (`web/src/features/shuttle/api.ts`).

## Integration requests

1. `shared/src/campuses.ts` / `docs/data/campuses.json`: set `hasShuttle: true` and `shuttleTrackerUrl: "https://mtd.org/maps-and-schedules/routes/"` for `uiuc` (seeded MTD routes exist; `hasData` is computed from routes so the page already works, but the campus switcher / other modules may read `hasShuttle`).
2. `shared/src/types.ts`: add `runsToday?: boolean` and `stopCount?: number` to `ShuttleRoute`, and `favorited?: boolean` to `ShuttleRoute` / `ShuttleStop`, so other modules get the fields without importing the module types.
3. `schema.sql` (next schema revision): `shuttle_routes.description_zh TEXT` (see gaps) and an index on `shuttle_favorites(entity_type, entity_id)` for the alert audience query.
4. Listings / market / buddy cards: render `NearestStopChip` from `@/features/shuttle` next to the commute line (`ListingCard.nearShuttle` is set by the listings module from `nearestStop()`; the chip can take `stop` + `distanceM` from `Listing.commute.nearestStop` to avoid a fetch).
5. Admin shell: mount `features/shuttle/admin.tsx` at `/admin/shuttle` and link the `system` notification `/admin/shuttle?tab=requests` (the panel reads `?tab=` and `?campus=`).
6. `lib/notify.ts`: a `notifyRole('admin', …)` helper would replace the `SELECT id FROM users WHERE role = 'admin'` the request endpoint does itself.
7. `web/src/components/DropdownMenu.tsx` + `lib/hooks.ts` `useAnchorPosition`: the menu is rendered inside `<Portal>`, whose root is set in its own layout effect *after* the hook's layout effect ran with `menuRef.current === null`, and `compute` is never re-run (only on scroll / resize) — the menu stays at `-9999px` and its items are unclickable (reproduced in a table row on `/shuttle/admin`). Fix: recompute once the floating element mounts (e.g. a callback ref or a `requestAnimationFrame(compute)` in the effect). The shuttle admin now uses inline icon buttons instead.
8. `docs/tools/shot.mjs` `login()`: `POST /api/auth/login` without `X-Requested-With: fetch` is rejected by CSRF, so it always falls back to the UI form; add the header to the request (the shuttle spec sets it on the context).
