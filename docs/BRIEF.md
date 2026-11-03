# Project Brief — Campus Sublet Platform for International Students

> This file is the single source of truth for every agent working on this repo. Read it fully before touching anything.
> Product name is a placeholder until `docs/DESIGN.md` picks one; all code reads the name from `web/src/brand.ts` and `shared/src/brand.ts` so renaming is a one-line change.

## 1. Vision

A trust-first "life OS" for international students across **all of the United States** (initial audience: Chinese international students at US universities). It is a **nationwide, multi-campus** platform from day one: every listing, item, buddy post and shuttle route belongs to a `campus` (seeded with the ~60 US universities that host the most international students, each with coordinates, city, state, timezone, edu email domains), users pick/switch campus, and all browse pages are campus-scoped with a "nationwide" toggle for sublets (students relocating for internships/transfers search across cities). **Northwestern University (Evanston, IL)** is the launch campus used for the richest demo data; nothing may be hard-coded to it. It replaces the messy WeChat-group / Facebook-group workflow with one clean, verified, bilingual (中文 / English) platform.

Core promise: **verified people, verified listings, money handled safely, everything near campus on one map.**

Owner's instruction (verbatim intent): build it fast and comprehensively, in a unique **clean** visual style, and push commercialization as far as possible so the platform **maximizes profit in the shortest time while keeping user trust**. Trust is a precondition for every monetization feature, never a trade-off.

## 2. Users & roles

| Role | Who | Notes |
|---|---|---|
| `student` | Any user with a verified `.edu` email | Default role after email verification |
| `landlord` | Property owners / agents / property managers | Can post multiple long-term listings; target of Pro subscription |
| `admin` | Platform operators | Verification review, moderation, revenue dashboard |

Verification levels (`users.trust_level`): `0` unverified → `1` edu email verified → `2` student ID / government ID reviewed → `3` ID + phone + payment method on file (required for escrow / Pro). Badges are shown everywhere a user appears.

## 3. Feature modules (10)

Every module = one server folder + one web folder owned by exactly one agent (see §7).

| # | Module key | 中文 | Must-have scope |
|---|---|---|---|
| 1 | `listings` | 转租 / 房源 | Post sublet (photos, address → geocode anywhere in the US, campus auto-suggested from address, dates, price, rooms, furnished, utilities, lease type, roommates/gender pref, pets, parking, amenities), browse campus-scoped or nationwide (city/campus search, radius), filters + sort + map/list toggle, detail page with gallery, calendar availability, "near shuttle stop" badge, save/favorite, report, share, "message host" CTA, owner dashboard (edit/pause/mark rented), view/lead counters (feed billing analytics) |
| 2 | `wanted` | 求租 | Post wanted-request (budget range, dates, areas, must-haves, group size), browse, host can "offer my place" (opens chat with listing card), auto-matching: wanted ↔ listings score, "matches for you" panel, email-style digest placeholder |
| 3 | `chat` | 站内聊天 | WebSocket real-time 1:1 + group threads, conversation list with unread counts, context cards (listing / item / buddy post), image attachments, typing indicator, read receipts, block/report, scam-warning banner on first message, message search, offline fallback via polling |
| 4 | `verify` | 身份验证 | `.edu` email code flow (dev mailbox UI shows codes), student-ID / passport photo upload → admin review queue → approve/reject with reason, phone verification (mock SMS), trust-level badges component, public trust profile page, "verified-only messaging" setting, audit log |
| 5 | `map` | 地图 | Shared `MapView` (Leaflet + OSM), listing pins w/ price bubbles + clustering, draw/zoom-to-search, campus POIs (buildings, libraries, grocery, transit), commute estimate to campus (walk/bike/shuttle), geocoding proxy (Nominatim) with caching + manual pin fallback, "explore" map page combining listings / items / buddy events / shuttle stops layers |
| 6 | `shuttle` | 校车 | Per-campus shuttle routes & stops (data model campus-scoped; seed Northwestern fully from public schedules (approximate) plus 2–3 other campuses lightly, e.g. UIUC, USC, NYU), route polylines on map, timetable, "next departures" at a stop, stop proximity for listings, favorites, service alerts banner (admin-editable), link-out to each campus's official tracker, "request my campus" form when a campus has no data |
| 7 | `market` | 留学生二手交易 | Item listings (categories: furniture, electronics, textbooks, kitchen, bikes, move-out bundles, free), condition, price / OBO / free, photos, pickup location on map, search/filter, "buy via chat", mark sold, move-out sale bundle linked to a sublet listing, wishlist, price suggestion from similar items |
| 8 | `buddy` | 找搭子 | Posts by type: airport pickup / carpool, roommate search, study group, gym, dining, travel, Costco run, events; filters by date/time/location/language; join → group chat; "my groups"; safety rules + verified-only join option; event calendar view |
| 9 | `billing` | 商业化 | Pricing page; **Boost** (featured placement: sublet / item / buddy post, tiered durations); **Landlord Pro** subscription (unlimited listings, analytics, lead inbox, badge); **Deposit escrow / secure payment** with service fee; **Newcomer Kit** affiliate hub (bank, SIM, renters insurance, movers, storage, airport pickup partners) with tracked outbound links; referral credits; promo codes; mock Stripe checkout (test mode, no keys; clearly labelled); wallet/credits ledger; revenue events table consumed by admin dashboard |
| 10 | `admin` | 后台 | Admin shell + nav; verification queue (uses verify APIs); reports/moderation queue; user management (ban/role); listing moderation; shuttle alerts editor; revenue & KPI dashboard (DAU/WAU, listings, matches, GMV, boost revenue, affiliate clicks, conversion funnels); feature flags |

Cross-cutting (built in scaffold, shared by all): auth, user profiles, campus selector (header + onboarding; persisted in cookie `campus` and user profile; `useCampus()` hook; every list API takes `campusId` or `scope=nationwide`), i18n (zh-CN default + en), upload service, notifications (in-app bell), search bar, responsive layout (mobile-first, desktop enhanced), empty states, skeleton loaders, toasts, error boundary, SEO-friendly titles.

## 4. Design direction (details in `docs/DESIGN.md`)

- **Clean, warm, editorial.** Lots of air, one accent color, strong typographic hierarchy, no gradients-for-the-sake-of-it, no glassmorphism, no stock-illustration clutter.
- Must feel **unique**, not a Tailwind-template clone: a signature card treatment, a signature map/price-pin style, distinctive empty states, bilingual typography that looks good in both 中文 and English (Noto Sans SC / Inter or similar via system fallbacks — fonts must not block rendering offline).
- Light theme first, dark theme supported via CSS variables.
- Accessibility: 4.5:1 contrast, focus rings, keyboard nav for menus and dialogs.

## 5. Tech stack (fixed — do not substitute)

- **Monorepo** with npm workspaces: `web/`, `server/`, `shared/`.
- `web/`: Vite 7 + React 19 + TypeScript (strict) + Tailwind CSS v4 + React Router 7 (data mode or declarative — scaffold decides, agents follow) + `react-leaflet` + `leaflet` + `lucide-react` icons. State: React Query (`@tanstack/react-query`) for server state; small Zustand store only where needed (auth/session, ws).
- `server/`: Node 22 + Express 5 + TypeScript (run via `tsx`) + **`node:sqlite`** (built-in; no native deps) + `ws` + `jose` (JWT) + `bcryptjs` + `zod` + `multer` (uploads to `server/uploads/`) + `pino` logging.
- `shared/`: TS types, zod schemas, constants (campuses, categories, enums), brand constants. Imported as `@shared/*`.
- DB: single SQLite file `server/data/app.db` (gitignored). Schema at `server/src/db/schema.sql` (all tables, created by the architect). Per-module additive migrations in `server/src/db/migrations/NN_<module>.sql` (NN assigned in §7). Seed: `server/src/db/seed/index.ts` calls each `seed/<module>.ts`.
- Realtime: single `ws` server on the HTTP server at path `/ws`, authenticated via the session cookie; hub at `server/src/realtime/hub.ts` with `publish(userId, event)` and topic subscriptions. Chat agent owns chat events; other modules may `publish` notifications.
- Auth: email + password, `bcryptjs`, JWT (HS256, `jose`) in httpOnly cookie `sid`, 30-day expiry; `requireAuth`, `requireRole('admin')`, `requireTrust(level)` middlewares.
- API shape: all JSON. Success `{ ok: true, data: ... }`, failure `{ ok: false, error: { code: string, message: string, fields?: Record<string,string> } }`. Paginated lists: `{ ok: true, data: { items, total, page, pageSize } }`. Money in **integer cents USD**. Timestamps ISO-8601 UTC strings. IDs: `crypto.randomUUID()`.
- Validation: zod on every request body/query; shared schemas live in `shared/src/schemas/<module>.ts` when the web needs them too.
- i18n: `web/src/i18n/<module>.ts` exporting `{ zh: {...}, en: {...} }`; loader merges all; hook `useT()` returns `t('listings.title')`. Language in cookie `lang` + user profile.
- Dev: `npm run dev` at root runs server (port **4000**) and web (port **5173**, proxies `/api`, `/uploads`, `/ws` to server). Agents testing in parallel use their assigned ports via env `PORT` / `VITE_PORT` / `VITE_API_TARGET` (see §7).
- Tests: Playwright is pre-installed globally (`require('playwright')` works anywhere; do **not** install it). Server unit tests with `node --test` + `tsx` where cheap.

## 6. Commercialization principles (details in `docs/BUSINESS_PLAN.md`)

1. Free to post, free to browse, free basic verification — supply + trust first.
2. Revenue stack, in order of time-to-first-dollar: (a) Newcomer Kit affiliate partnerships, (b) Boosts, (c) Landlord Pro, (d) Escrow / secure-payment service fee, (e) local sponsored placements, (f) data/insights later.
3. Every monetization surface must be labelled honestly ("Sponsored", "Service fee 3%"), never degrade search integrity for unpaid listings, and never gate safety features (reporting, verification badges, scam warnings) behind payment.
4. Instrument everything: `events` table (`user_id, type, entity, props, created_at`) — pageviews, listing views, contact clicks, affiliate clicks, checkout funnel.

## 7. Parallel-work rules (mandatory)

- Each module agent edits **only**: `server/src/modules/<key>/**`, `web/src/features/<key>/**`, `web/src/i18n/<key>.ts`, `shared/src/schemas/<key>.ts`, `server/src/db/migrations/NN_<key>.sql`, `server/src/db/seed/<key>.ts`, `docs/modules/<key>.md`, `docs/screenshots/<key>/**`. Nothing else, unless the brief explicitly says so below.
- Pre-created stubs (by scaffold) that you fill in but never rename: `server/src/modules/<key>/routes.ts` (default export: Express `Router`), `web/src/features/<key>/routes.tsx` (default export: array of React Router route objects), `web/src/features/<key>/admin.tsx` (default export: React component or `null`), `server/src/db/seed/<key>.ts` (default export `async function seed(db)`), `web/src/i18n/<key>.ts`.
- Shared components (`web/src/components/**`, `web/src/lib/**`, `server/src/lib/**`, `server/src/realtime/**`, `shared/src/**` except your schema file) are **read-only** for module agents. If you need something changed there, write the request to `docs/modules/<key>.md` under "Integration requests" and work around it locally. Exception: the `map` agent may edit `web/src/components/map/**` but may only **add** props/exports, never change or remove existing ones.
- Never run `vite build`, `npm run build`, or `npm run dev` on the default ports in a parallel phase. Run type checks (`npm run typecheck`) freely. Run your own server+web on your assigned ports for Playwright verification.
- Do not `npm install` new packages without need; if you must, add to the right workspace `package.json` and note it in your module doc. Native-build packages are forbidden.
- Do not touch git (no commits, no branches). The orchestrator commits.
- Migration numbers & ports:

| Module | Migration | Server port | Web port |
|---|---|---|---|
| listings | 10 | 4101 | 5101 |
| wanted | 11 | 4102 | 5102 |
| chat | 12 | 4103 | 5103 |
| verify | 13 | 4104 | 5104 |
| map | 14 | 4105 | 5105 |
| shuttle | 15 | 4106 | 5106 |
| market | 16 | 4107 | 5107 |
| buddy | 17 | 4108 | 5108 |
| billing | 18 | 4109 | 5109 |
| admin | 19 | 4110 | 5110 |

- Seed data must cover **at least 3 campuses** (Northwestern rich; e.g. UIUC and NYU lighter) so campus switching visibly works. Addresses/coordinates must be realistic for each city.
- Each agent uses its **own SQLite file** for testing: `DB_PATH=server/data/test-<key>.db` (gitignored) so parallel seeds don't collide.

## 8. Definition of done (per module)

1. `npm run typecheck` passes for `web`, `server`, `shared`.
2. All must-have scope in §3 implemented end-to-end (API + UI + seed data that makes the UI look alive: realistic Evanston addresses, bilingual sample text, photos as local placeholder SVG/JPG generated into `server/uploads/seed/` or inline SVG — no hot-linking external images).
3. Playwright walkthrough script at `docs/modules/<key>.spec.mjs` that exercises the main flow on your ports and saves ≥4 screenshots to `docs/screenshots/<key>/` (desktop 1280×800 and mobile 390×844 for the main page).
4. `docs/modules/<key>.md`: what was built, API list, seed accounts, known gaps, integration requests.
5. Follows `docs/DESIGN.md` tokens/components; uses `useT()` for every user-visible string in both languages.

## 9. Seed accounts (created by scaffold; all passwords `Passw0rd!`)

| Email | Role | Trust |
|---|---|---|
| admin@example.edu | admin | 3 |
| alice@u.northwestern.edu | student | 2 |
| bob@u.northwestern.edu | student | 1 |
| landlord@evanstonhomes.com | landlord | 3 |
| newbie@u.northwestern.edu | student | 0 |
