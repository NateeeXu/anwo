# 安窝 Anwo — 留学生的校园生活平台 / Campus life OS for international students

> **安心落脚，从校园开始。** Settle in safely, starting at campus.

安窝是一个面向全美留学生（首批用户：中国留学生）的 **全国多校区** 平台：转租、求租、站内聊天、身份验证、地图、校车、二手交易、找搭子、商业化与后台，全部围绕一个核心承诺——**真人验证、房源可信、资金安全、校园周边一图尽览**。西北大学（Evanston, IL）是演示数据最丰富的首发校区，但代码中没有任何东西写死到它。

Anwo is a trust-first, **nationwide multi-campus** platform for international students in the US (initial audience: Chinese students). Every listing, item, buddy post and shuttle route belongs to a campus (~66 seeded universities); users pick or switch campus, and sublets can also be browsed nationwide. Northwestern is only the launch campus with the richest demo data.

The single source of truth for scope and rules is [`docs/BRIEF.md`](docs/BRIEF.md). Read it first.

---

## 功能 Features

Every module is wired into one product: shared shell (top nav with 消息 badge, bell, account menu, 发布 sheet, mobile bottom tabs), real module cards on Home / Search / Profile, campus scope everywhere, one admin console. Screenshot links show the integrated build (`npm run e2e` regenerates them).

| # | Module | 中文 | What it does | Screenshots |
|---|---|---|---|---|
| 1 | `listings` | 转租 / 房源 | Post (5-step wizard) and browse sublets campus-scoped or nationwide, filters, map/list, availability calendar, save, report, owner dashboard with Boost sheet, nearest-shuttle chip on cards, 安心付 entry on detail | [browse](docs/screenshots/listings/browse-desktop.png) · [detail](docs/screenshots/listings/detail-desktop.png) · [mobile map](docs/screenshots/listings/browse-mobile-map.png) · [mine](docs/screenshots/listings/mine-desktop.png) |
| 2 | `wanted` | 求租 | Wanted requests, host 「推荐我的房源」, automatic wanted ↔ listing matching with score breakdown, digest preview | [browse](docs/screenshots/wanted/browse-desktop.png) · [matches](docs/screenshots/wanted/matches-page.png) · [offer](docs/screenshots/wanted/offer-modal.png) |
| 3 | `chat` | 站内聊天 | WebSocket 1:1 and group threads, context cards, images, typing, read receipts, scam-warning banner, search, block/report, polling fallback | [inbox](docs/screenshots/chat/inbox-desktop.png) · [thread](docs/screenshots/chat/thread-listing-desktop.png) · [mobile](docs/screenshots/chat/thread-mobile.png) |
| 4 | `verify` | 身份验证 | `.edu` email code (dev mailbox), ID review queue, phone (mock SMS), payment card, trust levels 0–3, public trust profile (also on `/u/:id`) | [center](docs/screenshots/verify/verify-center-desktop.png) · [trust profile](docs/screenshots/verify/trust-profile-desktop.png) · [admin queue](docs/screenshots/verify/admin-queue-desktop.png) |
| 5 | `map` | 地图 | Leaflet/OSM explore page (listings · items · buddy · shuttle · POIs), price pins, clustering, draw-radius search, commute estimates, geocoding proxy, POI suggestions | [explore](docs/screenshots/map/explore-desktop.png) · [mobile](docs/screenshots/map/explore-mobile.png) · [nationwide](docs/screenshots/map/nationwide-desktop.png) |
| 6 | `shuttle` | 校车 | Per-campus routes, stops, timetables, next departures, alerts, favorites, 「申请我的校区」 | [browse](docs/screenshots/shuttle/browse-desktop.png) · [route](docs/screenshots/shuttle/route-detail-desktop.png) · [stop](docs/screenshots/shuttle/stop-desktop.png) |
| 7 | `market` | 二手交易 | Items by category, pickup map (approximate) + commute, wishlist, move-out bundles linked to sublets, price suggestion, Boost from the seller dashboard | [browse](docs/screenshots/market/browse-desktop.png) · [detail](docs/screenshots/market/detail-desktop.png) · [bundle](docs/screenshots/market/bundle-desktop.png) |
| 8 | `buddy` | 找搭子 | Airport pickup, carpool, study, gym, dining, Costco runs, events → group chat, approval flow, calendar, Boost for organizers | [browse](docs/screenshots/buddy/browse-desktop.png) · [detail](docs/screenshots/buddy/detail-desktop.png) · [calendar](docs/screenshots/buddy/browse-calendar.png) |
| 9 | `billing` | 商业化 | Pricing, Boosts (mock Stripe checkout, test mode), Landlord Pro, 安心付 Secure Payment (deposit escrow), Newcomer Kit affiliate links (tracked `/go`), referrals, promo codes, wallet | [pricing](docs/screenshots/billing/pricing-desktop.png) · [boost](docs/screenshots/billing/boost-sheet-desktop.png) · [kit](docs/screenshots/billing/kit-desktop.png) · [wallet](docs/screenshots/billing/wallet-mobile.png) |
| 10 | `admin` | 后台 | One console at `/admin` mounting every module's `admin.tsx`: KPIs, revenue, verification, reports, users, listings, wanted, market, buddy, chat, shuttle, map, campuses, flags, audit, system | [overview](docs/screenshots/admin/overview-desktop.png) · [reports](docs/screenshots/admin/reports-desktop.png) · [revenue](docs/screenshots/admin/revenue-dark.png) |

**End-to-end journey** (register → mailbox code → campus → browse → message host → host reply → wanted + matches → item → buddy → boost + mock checkout → wallet → Newcomer Kit → admin): [`docs/screenshots/journey/`](docs/screenshots/journey/) — 25 screenshots in order, produced by `docs/modules/journey.spec.mjs`.

Cross-cutting (scaffold): auth, profiles, campus selector + onboarding, i18n (zh-CN default + en), uploads, notifications, global search, responsive shell, empty states, skeletons, toasts, dark mode.

## 技术栈 Stack

- **Monorepo** — npm workspaces: `shared/` (`@anwo/shared`), `server/` (`@anwo/server`), `web/` (`@anwo/web`). Shared code is imported as `@shared/*`.
- **web** — Vite 7 · React 19 · TypeScript (strict) · Tailwind CSS v4 (tokens in `web/src/styles/theme.css`) · React Router 7 · React Query · Zustand · react-leaflet 5 + Leaflet · lucide-react.
- **server** — Node 22 · Express 5 · TypeScript via `tsx` · built-in `node:sqlite` (no native deps) · `ws` · `jose` (JWT in httpOnly cookie `sid`) · `bcryptjs` · `zod` · `multer` · `pino`.
- **DB** — one SQLite file `server/data/app.db`; schema in `server/src/db/schema.sql`; seeds in `server/src/db/seed/`.
- **Realtime** — single WebSocket server at `/ws` (`docs/WS_EVENTS.md`).
- **Tests** — Playwright walkthroughs per module (`docs/modules/<key>.spec.mjs`); server unit tests with `node --test`.

## 运行 Run it

```bash
# Node >= 22.5 (node:sqlite). Playwright is expected to be installed globally for the walkthroughs.
npm install                                  # all three workspaces
GEOCODE_OFFLINE=1 npm run seed               # creates server/data/app.db (all modules, idempotent: a 2nd run is a no-op)
npm run dev                                  # API on :4000 + web on :5173 (proxies /api, /uploads, /ws)
```

Open <http://127.0.0.1:5173>. First visit shows the campus picker (`/welcome`). Fresh database: `rm -f server/data/app.db*` then seed again. `GEOCODE_OFFLINE=1` skips Nominatim (seeds carry coordinates; new addresses fall back to the campus centroid with a manual pin) — drop it when outbound HTTPS is available.

Other scripts:

```bash
npm run typecheck                            # shared + server + web (tsc --noEmit)
npm test                                     # server unit tests (node --test, temp DB per file)
npm run i18n:check                           # every dictionary key in zh + en, every literal t('…') key exists
npm run e2e                                  # fresh-seeds server/data/e2e.db, starts API :4000 + web :5173, runs
                                             # core + all 10 module specs + the journey, prints PASS/FAIL, stops the stack
npm run e2e -- chat journey                  # subset (core runs first unless --no-core); logs in server/data/e2e-logs/
WEB_PORT=5173 node docs/modules/<key>.spec.mjs   # one walkthrough against an already running stack
npm run build                                # typecheck shared + vite production build → web/dist
JWT_SECRET=<long random> NODE_ENV=production PORT=4500 GEOCODE_OFFLINE=1 npm start
                                             # API + web/dist with SPA fallback on one port (JWT_SECRET is required in prod;
                                             # cookies are `Secure`, so sign-in needs HTTPS or localhost behind a TLS proxy)
node server/scripts/gen-placeholders.mjs     # regenerate the placeholder SVGs (deterministic)
```

`npm run e2e` refuses to start when :4000 / :5173 are busy (stop `npm run dev` first, or set `PORT` / `VITE_PORT`). It runs the server with `RATE_LIMIT_DISABLED=1`, `ENABLE_DEV_API=1` and `ALLOW_SEED_API=1` because the market and admin specs re-seed their module through `POST /api/dev/seed`.

### 端口与环境变量 Ports & env

| Where | Variable | Default | Notes |
|---|---|---|---|
| server | `PORT` | `4000` | HTTP + WebSocket |
| server | `DB_PATH` | `server/data/app.db` | module agents use `server/data/test-<key>.db` |
| server | `UPLOAD_DIR` | `server/uploads` | served at `/uploads` (1-day cache); seed images live in `server/uploads/seed/` |
| server | `JWT_SECRET`, `NODE_ENV`, `WEB_ORIGIN` | dev values | `JWT_SECRET` (≥ 32 bytes) is mandatory when `NODE_ENV=production` |
| server | `ENABLE_DEV_API`, `HOST`, `TRUST_PROXY` | –, `127.0.0.1`, `1` | `/api/dev/*` + the dev mailbox are opt-in (`ENABLE_DEV_API=1`, set by `npm run dev` / `npm run e2e`), loopback only, never in production; the dev server binds to loopback unless `HOST=0.0.0.0` |
| server | `GEOCODE_OFFLINE`, `RATE_LIMIT_DISABLED`, `ALLOW_SEED_API` | – | `1` = no Nominatim / no rate limits (tests) / allow `POST /api/dev/seed` on non-test DBs |
| web | `VITE_PORT` | `5173` | |
| web | `VITE_API_TARGET` | `http://127.0.0.1:4000` | proxy target for `/api`, `/uploads`, `/ws` |

Per-module development ports (parallel work, BRIEF §7): listings 4101/5101 · wanted 4102/5102 · chat 4103/5103 · verify 4104/5104 · map 4105/5105 · shuttle 4106/5106 · market 4107/5107 · buddy 4108/5108 · billing 4109/5109 · admin 4110/5110.

### 种子账号 Seed accounts

All passwords are `Passw0rd!`.

| Email | Role | Trust | Campus |
|---|---|---|---|
| `admin@example.edu` | admin | 3 | — |
| `alice@u.northwestern.edu` | student | 2 | Northwestern |
| `bob@u.northwestern.edu` | student | 1 | Northwestern |
| `landlord@evanstonhomes.com` | landlord | 3 | Northwestern |
| `newbie@u.northwestern.edu` | student | 0 | Northwestern |

Plus ~42 more students across Northwestern, UIUC, NYU, USC and Michigan (`server/src/db/seed/core.ts`). New accounts: register with any `.edu` address (e.g. `you@u.northwestern.edu`); verification codes sent by the mock mailer are visible at `/dev/mailbox` (and `GET /api/dev/mailbox?email=`). Mock checkout test cards: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` is declined (any future expiry, any CVC).

## 模块归属 Module ownership

Each module is one server folder + one web folder, owned by one agent. Shared components and libs are read-only for module agents (BRIEF §7).

| Module | Server | Web | Also owns | Migration |
|---|---|---|---|---|
| listings | `server/src/modules/listings/` | `web/src/features/listings/` | `shared/src/schemas/listings.ts`, `web/src/i18n/listings.ts`, `server/src/db/seed/listings.ts`, `docs/modules/listings.md` | 10 |
| wanted | `…/wanted/` | `…/wanted/` | same pattern | 11 |
| chat | `…/chat/` | `…/chat/` | `server/src/modules/chat/ws.ts` | 12 |
| verify | `…/verify/` | `…/verify/` | | 13 |
| map | `…/map/` | `…/map/` | may **add** to `web/src/components/map/**` | 14 |
| shuttle | `…/shuttle/` | `…/shuttle/` | | 15 |
| market | `…/market/` | `…/market/` | | 16 |
| buddy | `…/buddy/` | `…/buddy/` | | 17 |
| billing | `…/billing/` | `…/billing/` | | 18 |
| admin | `…/admin/` | `…/admin/` | | 19 |
| scaffold | `server/src/lib/**`, `server/src/realtime/**`, cross-cutting routers | `web/src/components/**`, `web/src/lib/**`, app shell, core pages | `shared/src/**` (except module schema files) | — |

## 文档索引 Docs index

| File | What |
|---|---|
| [`docs/BRIEF.md`](docs/BRIEF.md) | Project contract: vision, roles, modules, stack, parallel-work rules, definition of done |
| [`docs/API.md`](docs/API.md) | REST endpoint contract, envelope, DTOs, error codes |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Enums, state machines, matching score, ranking, campus scoping, jobs |
| [`docs/WS_EVENTS.md`](docs/WS_EVENTS.md) | WebSocket protocol, topics, reconnect and polling fallback |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Design system: brand, tokens, signature elements, components, page blueprints, a11y |
| [`docs/design/theme.css`](docs/design/theme.css) / [`tokens.json`](docs/design/tokens.json) | Design tokens (copied to `web/src/styles/theme.css`) |
| [`docs/ASSETS.md`](docs/ASSETS.md) | Brand, map, illustration components and the placeholder image generator |
| [`docs/data/campuses.json`](docs/data/campuses.json) / [`campuses.md`](docs/data/campuses.md) | Seeded campus list and its caveats |
| [`docs/BUSINESS_PLAN.md`](docs/BUSINESS_PLAN.md), [`docs/MARKET.md`](docs/MARKET.md), `docs/strategy/*` | Commercialization and market research |
| `docs/modules/<key>.md` / `<key>.spec.mjs` | Per-module notes and Playwright walkthroughs; screenshots in `docs/screenshots/<key>/` |
| [`docs/INTEGRATION.md`](docs/INTEGRATION.md) | Integration pass: what was wired together, spec results, open issues |
| `docs/modules/journey.spec.mjs` | Cross-module user journey → `docs/screenshots/journey/` |
| [`docs/tools/shot.mjs`](docs/tools/shot.mjs) | Shared Playwright helper for walkthrough specs |
| [`server/src/db/schema.sql`](server/src/db/schema.sql) | Complete SQLite schema |

## 原则 Principles in one breath

Trust before monetization; one accent colour, spent carefully; free to post, free to browse, free to verify; every paid placement labelled in plain words; nothing hard-coded to a single campus.
