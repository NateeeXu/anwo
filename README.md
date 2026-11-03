# 安窝 Anwo — 留学生的校园生活平台 / Campus life OS for international students

> **安心落脚，从校园开始。** Settle in safely, starting at campus.

安窝是一个面向全美留学生（首批用户：中国留学生）的 **全国多校区** 平台：转租、求租、站内聊天、身份验证、地图、校车、二手交易、找搭子、商业化与后台，全部围绕一个核心承诺——**真人验证、房源可信、资金安全、校园周边一图尽览**。西北大学（Evanston, IL）是演示数据最丰富的首发校区，但代码中没有任何东西写死到它。

Anwo is a trust-first, **nationwide multi-campus** platform for international students in the US (initial audience: Chinese students). Every listing, item, buddy post and shuttle route belongs to a campus (~66 seeded universities); users pick or switch campus, and sublets can also be browsed nationwide. Northwestern is only the launch campus with the richest demo data.

The single source of truth for scope and rules is [`docs/BRIEF.md`](docs/BRIEF.md). Read it first.

---

## 功能 Features

| # | Module | 中文 | What it does |
|---|---|---|---|
| 1 | `listings` | 转租 / 房源 | Post and browse sublets (campus-scoped or nationwide), filters, map/list, availability calendar, save, report, owner dashboard |
| 2 | `wanted` | 求租 | Wanted requests, host "offer my place", automatic wanted ↔ listing matching |
| 3 | `chat` | 站内聊天 | WebSocket 1:1 and group threads, context cards, images, typing, read receipts, scam-warning banner, polling fallback |
| 4 | `verify` | 身份验证 | `.edu` email code (dev mailbox), ID review queue, phone (mock SMS), trust levels 0–3 and badges |
| 5 | `map` | 地图 | Shared Leaflet/OSM map, price pins, clustering, campus POIs, commute estimates, geocoding proxy, explore page |
| 6 | `shuttle` | 校车 | Per-campus routes, stops, timetables, next departures, alerts, "request my campus" |
| 7 | `market` | 二手交易 | Items by category, pickup on map (approximate), wishlist, move-out bundles, price suggestion |
| 8 | `buddy` | 找搭子 | Airport pickup, carpool, study, gym, dining, Costco runs, events → group chat, calendar |
| 9 | `billing` | 商业化 | Boosts, Landlord Pro, deposit escrow (mock Stripe, test mode), Newcomer Kit affiliates, referrals, wallet |
| 10 | `admin` | 后台 | Verification and moderation queues, users, listings, shuttle alerts, revenue/KPI dashboard, feature flags |

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
npm install                      # all three workspaces
npm run seed                     # creates server/data/app.db, seeds campuses, users, demo data and
                                 # points photos at server/uploads/seed/** (SVG placeholders)
npm run dev                      # server on :4000 + web on :5173 (proxies /api, /uploads, /ws)
```

Open <http://127.0.0.1:5173>. First visit shows the campus picker (`/welcome`).

Other scripts:

```bash
npm run typecheck                # shared + server + web
npm test                         # server unit tests
node server/scripts/gen-placeholders.mjs     # regenerate the 210 placeholder SVGs (deterministic)
WEB_PORT=5173 node docs/modules/core.spec.mjs # core smoke walkthrough → docs/screenshots/core/
```

### 端口与环境变量 Ports & env

| Where | Variable | Default | Notes |
|---|---|---|---|
| server | `PORT` | `4000` | HTTP + WebSocket |
| server | `DB_PATH` | `server/data/app.db` | module agents use `server/data/test-<key>.db` |
| server | `UPLOAD_DIR` | `server/uploads` | served at `/uploads` (1-day cache); seed images live in `server/uploads/seed/` |
| server | `JWT_SECRET`, `NODE_ENV`, `WEB_ORIGIN` | dev values | `/api/dev/*` and the dev mailbox exist only when `NODE_ENV !== 'production'` |
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

Verification codes sent by the mock mailer are visible at `/dev/mailbox` (and `GET /api/dev/mailbox`).

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
| [`docs/tools/shot.mjs`](docs/tools/shot.mjs) | Shared Playwright helper for walkthrough specs |
| [`server/src/db/schema.sql`](server/src/db/schema.sql) | Complete SQLite schema |

## 原则 Principles in one breath

Trust before monetization; one accent colour, spent carefully; free to post, free to browse, free to verify; every paid placement labelled in plain words; nothing hard-coded to a single campus.
