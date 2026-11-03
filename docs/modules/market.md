# Module `market` — 留学生二手交易 / Marketplace

Owner: market module agent. Spec: BRIEF §3 row 7, API.md §9, DATA_MODEL §3.7 + §6.4, DESIGN §4.2 + §7.11.
Ports used for verification: server `4107`, web `5107`, DB `server/data/test-market.db`.

## What was built

**Server** (`server/src/modules/market/`)
- `routes.ts` — every endpoint of API.md §9 (list with scope / category / condition / price range incl. free / OBO / delivery / search / sort / `sellerId` / `bundleId` / `view=pins`; sponsored-slot merge via `lib/sponsored`; detail with `similar` + `suggestedPrice` + view-count dedupe; create / patch / publish / reserve / unreserve / renew / sold (buyer + sold price) / delete; photos; "buy via chat" contact; wishlist add / remove / list with `priceDropCents`; report; price suggestion; categories with counts; bundles CRUD + `for-listing/:listingId` + `bundles/:id/contact`; `items/:id/buyers` for the mark-sold picker; admin list + moderate).
- `service.ts` — row types, `itemDto` / `itemDtos` / `bundleDto`, `similarItems`, `priceSuggestion` (median + IQR of sold-last-180-days + active items, same category, condition ± 1 step, campus when ≥ 5 samples else nationwide, title-token narrowing when a title is known), `setItemPhotos`, `setBundleItems`, `buyerCandidates`, and the stable cross-module export **`closeBundlesForListing(listingId)`** (listings calls it on `POST /:id/rented { closeBundle }`).
- `jobs.ts` — `market.expireItems` every 30 min: flips stale active items (60 d) to `expired` with a bell to the seller, and a silent 3-day "expiring soon" heads-up (once per item).
- Analytics (`lib/events`): `search` (module market), `item.view`, `item.publish`, `item.draft`, `item.contact_click`, `item.wishlist`, `item.price_drop`, `item.sold`, `item.renew`, `item.delete`, `item.expire`, `bundle.create`, plus `boost.impression` through `recordImpressions`.
- Notifications (`lib/notify`): `market.wishlist_price` (price cut → wishlisters), `chat.message` (buyer opened a chat without a first message), `system` (sold-to-you, item sold, expired, expiring), `report.actioned` (admin hid an item).

**Shared** — `shared/src/schemas/market.ts`: `ItemListQuery`, `MineQuery`, `ItemInput`, `ItemPatch`, `ItemPhotosInput`, `MarkSoldInput`, `ContactInput`, `PriceSuggestionQuery`, `BundleListQuery`, `BundleInput`, `BundlePatch`, `BundleItemsInput`, `MARKET_SORTS`, `MARKET_BROWSE_CATEGORIES`.

**Web** (`web/src/features/market/`)
- `/market` browse — category chips with icons + counts, FilterBar (condition multi-select, price range + 仅免费 switch, 可议价, 可邮寄, sort, 校区 / 全美 scope toggle, 列表 / 地图 toggle), grid of square `ItemCard`s (DESIGN §4.2: ink price stub, 免费 / OBO / 已售出 states, boosted badge, bundle badge, wishlist heart as a sibling button), map view with pickup pins labelled by price (list ↔ pin hover/selection; mobile shows the selected card as an overlay), URL-persisted filters, skeleton / error / empty states (filtered vs. none, "切换到全美").
- `/market/:id` detail — 1:1 gallery (hero for ≥ 3 photos, compact grid otherwise), price-lg + OBO chip + retail price, suggested-price comparison (DESIGN §7.11 「相似物品均价 $45」, verdict suppressed when the peers are too different), condition / category / handover / brand chips, description, pickup `StaticMapPreview` with an approximate circle (never an exact pin), seller TrustStrip (§4.6, unverified warning), rail with 私信购买 (modal with message + optional offer → opens `/chat/:id`), 加入心愿单, 分享, 举报 (modal), bundle link card, similar items; owner bar with 编辑 / 标记售出 / 预留 / 续期 / 删除; sold / reserved / expired / draft states.
- `/post/item` and `/market/:id/edit` — one form: PhotoUploader (`purpose=item`), bilingual title hint, category Select with icons, condition radio chips with hints, price + 免费送 / 可议价 switches, live price-suggestion hint with 「用这个价」, retail price, brand, description, handover SegmentedControl, pickup landmark + tap-on-map pin, campus select, bundle select, 存为草稿 / 发布, live card preview on desktop.
- `/market/mine` — seller dashboard: stat tiles, status tabs with counts, item rows with actions (edit / mark sold / reserve / unreserve / renew / publish / delete), **mark-sold modal** with a buyer picker from recent chats (item-specific first) + final price, and the **搬家甩卖** section (bundles grid + 新建打包).
- `/market/bundles/new`, `/market/bundles/:id/edit` — bundle form: title, details, discount %, move-out date, link to one of the seller's listings (`GET /api/listings?ownerId=` when the listings module answers; `?listingId=` prefill for a listing-page entry point), multi-select of the seller's active items with a live total / bundle price.
- `/market/bundles/:id` — mosaic, discount badge, pick-up-before date, sum vs. bundle price, linked sublet card, seller strip, item grid, 私信卖家 (owner: edit / close / delete).
- `/market/wishlist` — saved items with 降价 badges and "price when saved".
- `admin.tsx` — `/admin/market` panel: stat tiles, search / status / moderation filters, table with open-report counts, flag / hide / restore (audited, seller notified on hide).
- `web/src/i18n/market.ts` — every string in zh-CN and en (DESIGN §8 tone).

## Endpoints

| Method | Path | Auth |
|---|---|---|
| GET | `/api/market/items` (`view=pins` → `{ pins, total, scope }`) | public |
| GET | `/api/market/items/mine` (`status`) → `Paginated<Item> & { counts }` | user |
| GET | `/api/market/items/:id` → `Item & { similar, suggestedPrice?, bundle? }` | public |
| POST | `/api/market/items` | trust ≥ 1 |
| PATCH | `/api/market/items/:id` | owner |
| POST | `/api/market/items/:id/publish` · `reserve` · `unreserve` · `renew` · `sold` | owner |
| DELETE | `/api/market/items/:id` (soft → `removed`) | owner |
| PUT | `/api/market/items/:id/photos` | owner |
| GET | `/api/market/items/:id/buyers` → chat partners for the mark-sold picker | owner |
| POST | `/api/market/items/:id/contact` `{ message?, offerCents? }` → `{ conversationId, created }` | trust ≥ 1 |
| POST / DELETE | `/api/market/items/:id/wishlist` | user |
| GET | `/api/market/wishlist` → items + `priceAtAddCents`, `priceDropCents`, `wishedAt` | user |
| POST | `/api/market/items/:id/report` | user |
| GET | `/api/market/price-suggestion` `{ category, condition, campusId?, title? }` | user |
| GET | `/api/market/categories` → `{ campusId, categories: { key, icon, count }[] }` | public |
| GET | `/api/market/bundles` · `/api/market/bundles/:id` · `/api/market/bundles/for-listing/:listingId` | public |
| POST | `/api/market/bundles` · PATCH `/:id` · PUT `/:id/items` · POST `/:id/close` · DELETE `/:id` | trust ≥ 1 / owner |
| POST | `/api/market/bundles/:id/contact` | trust ≥ 1 |
| GET | `/api/market/admin/items` · POST `/api/market/admin/items/:id/moderate` | admin |

Scope semantics: campus scope filters `campus_id`; nationwide (and city search) shows only items with `delivery_option IN ('delivery','both')` (DESIGN §4.10 / DATA_MODEL §9.1). Pickup coordinates are rounded to 3 decimals for everyone but the seller / admins (`lib/cards`). Sponsored slots follow DATA_MODEL §8 (positions 0 and 5 of each block of 10) and only on the generic browse list.

## Components other modules can import (`web/src/features/market`)

`ItemCard` (`variant="grid" | "row"`, `showCampus`, `hideWishlist`, `active`, `extra`, `to`), `BundleCard`, `BundleMosaic`, `CategoryIcon`, `ConditionChip`, `PriceComparison`, `SellerStrip`, hooks `useItems`, `useItem`, `useBundle`, `useBundles`, `useWishlistToggle`, `useContactSeller`, `marketKeys`. Home / Search / Profile can swap `SimpleItemCard` for `ItemCard`. Listing detail can show the move-out sale with `useBundles` or `GET /api/market/bundles/for-listing/:id` + `BundleCard`, and link sellers to `/market/bundles/new?listingId=<id>`.

## Seed (`server/src/db/seed/market.ts`, version 1)

93 items: Northwestern 56 (47 active, 1 reserved, 6 sold, 1 expired), UIUC 14, NYU 13, USC 10. Categories: furniture, electronics, textbooks (course-style titles such as *Calculus: Early Transcendentals 8e*, *Introduction to Algorithms 4e (CLRS)*, *Organic Chemistry 2e (Clayden)*), kitchen, bikes, home, clothing, other, free. Bilingual titles and descriptions, realistic pickup landmarks with coordinates (Tech, Norris, Davis St Metra, Foster-Walker, Kellogg, Green St, Illini Union, Bobst, Washington Square, USC Village, Expo Park…), 1–3 seed photos each from `/uploads/seed/items/*.svg`, sold items with buyers and sold prices, 14 wishlist rows (incl. price drops for alice / grace), 2 active boosts (`mkt-seed-boost-*`: iPad Air max, Trek FX plus), 3 move-out bundles linked to listings (`mkt-bundle-xinyi` → Sherman Ave 1B1B, `mkt-bundle-yuxuan` → Green St, `mkt-bundle-kevin` → East Village).

Deterministic ids: items `mkt-item-01…93`, bundles `mkt-bundle-<key>`. Because the listings seed was still a stub, the bundle listings are inserted by this seed as `mkt-seed-listing-*` **only when the seller has no active listing**; once the listings seed exists, the seed links to the seller's newest active listing instead. Re-run with `DB_PATH=… npm run seed -- --modules core,market --force` (the file wipes only `mkt-`-prefixed rows).

Accounts used by the spec: `alice@u.northwestern.edu` (seller, L2), `bob@u.northwestern.edu` (buyer, L1); password `Passw0rd!`.

## Verification

- `npm run typecheck`: shared ✓, web ✓, server ✓ (at the time of writing; other modules were still landing).
- `WEB_PORT=5107 node docs/modules/market.spec.mjs` — reseeds market on the test DB, then: browse grid (asserts ≥ 12 cards + a sponsored slot), filters, map view (asserts pins), detail (asserts suggestion line), bundle page, bob: wishlist + buy-via-chat (lands on `/chat/:id`), wishlist page, alice: create flow with a real PNG upload → detail, dashboard → mark sold with buyer picker (bob) + price, bundle form → bundle page, cleanup, EN browse, dark detail, mobile browse / map / detail / post form. 18 screenshots in `docs/screenshots/market/`, 0 page errors.

## Known gaps

- Buy-via-chat uses `lib/conversations` directly when `chat.service.openConversation` still throws `NOT_IMPLEMENTED` (block / verified-only checks are done locally in the route); once chat lands, the service path is used automatically. The `/chat/:id` page itself belongs to chat.
- Nationwide market = shipping-friendly items only; the header campus switcher does not yet offer 全美 on `/market` (see integration requests) — the FilterBar scope toggle on the page does.
- Price suggestion quality depends on data density; the title-token narrowing needs ≥ 3 title-similar samples, otherwise it falls back to category ± condition.
- Items without coordinates (shipping-only) never appear on the map; the list still shows them.
- Map tiles need network access; in the sandbox the map renders pins on the `sunken` background.

## Integration requests

1. `web/src/app/shell/CampusSwitcher.tsx` `NATIONWIDE_ROUTES`: add `/market` so the header switcher offers 全美 (delivery-only mode, DESIGN §4.10).
2. `web/src/components/Input.tsx`: when `optional` is set the label already gets a 「（选填）」 suffix — documented here so other modules don't double it (no change needed).
3. `web/src/components/PhotoGallery.tsx`: `layout="hero"` pads to 5 tiles with empty `sunken` blocks; a `fill="none"` option (or auto-collapse for < 3 photos) would avoid the local fallback in `ItemDetail`.
4. Home / Search / Profile: swap `SimpleItemCard` for `features/market` `ItemCard`.
5. Listings detail: show `GET /api/market/bundles/for-listing/:id` as 「搬家甩卖」 and link the owner to `/market/bundles/new?listingId=<id>`; call `market.service.closeBundlesForListing` on rented.
6. Seed order: when the listings seed lands, it may delete the `mkt-seed-listing-*` rows (bundles then show without a listing); re-running the market seed re-links to real listings.
7. `lib/jobs` `expireContent` already expires items hourly; `market.expireItems` runs first (30 min) so sellers get the bell — fine as is, noting the overlap.
