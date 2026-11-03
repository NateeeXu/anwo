# Data Model — campus-sublet

> Companion to `server/src/db/schema.sql` (the DDL is authoritative for column names/types; this doc is authoritative for **semantics**: enums, state machines, ranking, matching, trust, scoping). Engineers implement from both without asking.
>
> Platform is **nationwide / multi-campus**. Every browseable entity has `campus_id`. Northwestern is just the launch campus with the richest seed data; nothing is hard-coded to it.

Contents

1. Conventions & table ownership
2. Cross-cutting entities (campuses, users, uploads, notifications, reports)
3. Per-module ER (listings, wanted, chat, verify, map, shuttle, market, buddy, billing, admin)
4. Enum catalogue (also served by `GET /api/meta`)
5. Trust levels — rules and what each unlocks
6. State machines (verification, listing, wanted, market item, buddy post, order, payment, boost, subscription, escrow, report, match)
7. Wanted ↔ listing matching score
8. Ranking rules (sponsored slots, relevance, recency)
9. Campus scoping & geo search (campus filter, nationwide, city, radius bbox + haversine SQL)
10. Counters, caches, triggers, scheduled jobs
11. Migration policy

---

## 1. Conventions & table ownership

See the header of `schema.sql` for storage conventions (TEXT uuid ids, ISO timestamps, integer cents, `0/1` booleans, `*_json` columns, CHECK enums).

**JSON naming**: DB is `snake_case`; the API is `camelCase`. Mapping is mechanical (`price_cents` → `priceCents`, `edu_domains_json` → `eduDomains` parsed). A row mapper in `server/src/lib/db.ts` does `snakeToCamel` and parses `*_json` columns; never hand-map.

**Table ownership** (who may write; everyone may read):

| Table(s) | Writer |
|---|---|
| `schema_migrations`, `campuses`, `campus_requests`, `users`, `uploads`, `email_codes`, `notifications`, `events`, `seed_meta`, `saved_searches`, `audit_log` (append-only via `lib/audit.ts`; any module may append), `reports` inserts (via `lib/reports.ts`) | scaffold (cross-cutting `server/src/lib/**`, `server/src/modules/auth|users|campuses|uploads|notifications|search|meta|events`) |
| `phone_codes`, `verification_requests`; `users.id_verified_at`, `users.phone_verified_at`; `users.trust_level` only through `lib/trust.ts` | verify |
| `listings`, `listing_photos`, `listing_amenities`, `listing_availability`, `listing_saves`, `listing_leads` | listings (`listing_leads` rows are inserted only through listings' exported `recordLead()`, which wanted and billing call; chat never writes leads) |
| `wanted_posts`, `wanted_areas`, `matches` | wanted |
| `conversations`, `conversation_members`, `messages`, `message_reads`, `blocks` | chat (other modules call `chat` service helpers in `server/src/modules/chat/service.ts`, exported for cross-module use: `openConversation()`, `postSystemMessage()`, `postContextCard()`) |
| `reports` (status / reviewer / resolution) | admin (inserts come from the scaffold helper `lib/reports.ts`, which every `/report` endpoint calls) |
| `shuttle_*` | shuttle (admin edits `shuttle_alerts` via shuttle admin API) |
| `market_*`, `wishlists` | market |
| `buddy_*` | buddy |
| `pricing_plans`, `promo_codes`, `promo_redemptions`, `orders`, `payments`, `payment_methods`, `boosts`, `subscriptions`, `escrows`, `escrow_events`, `wallet_ledger`, `referrals`, `partners`, `partner_clicks`; `users.payment_verified_at` | billing (the scaffold inserts the `referrals` `pending` row at signup; billing owns every later transition) |
| `feature_flags` | admin |
| `geocode_cache`, `commute_cache`, `pois` | map |

Polymorphic references (`entity_type` + `entity_id`) are used in `reports`, `boosts`, `notifications`, `events`, `shuttle_favorites`, `audit_log`, `conversations.context_*`. `entity_type` values: `listing | wanted | market_item | buddy_post | user | message | conversation | partner | escrow | subscription`.

**Cross-module service contracts.** A module may import another module only through `server/src/modules/<key>/service.ts` and only the exports listed here. The scaffold pre-creates every `service.ts` below with these exact signatures throwing `ApiError('NOT_IMPLEMENTED')`, so `npm run typecheck` passes while modules are built in parallel. Helpers that several modules need are scaffold-owned in `server/src/lib/**`, never inside a module: `lib/trust.ts` (`recomputeTrust(userId)`, `badgesFor(user)`), `lib/eduVerify.ts` (edu-code request/confirm), `lib/audit.ts`, `lib/reports.ts` (`createReport`), `lib/notify.ts`, `lib/geo.ts`, `lib/flags.ts` (`isEnabled(key, campusId)`; a missing row counts as enabled), and `lib/cards.ts` (row → DTO mappers `toUserPublic`, `toCampusLite`, `toListingCard`, `toWantedCard`, `toItemCard`, `toBuddyCard`, used by every module **and** by the scaffold's global search, so card shapes never diverge).

| Module | Stable exports | Consumers |
|---|---|---|
| chat | `openConversation`, `openGroupConversation`, `postSystemMessage`, `postContextCard` | listings, wanted, market, buddy, billing |
| listings | `recordLead({ listingId, userId, conversationId?, source })` (the only writer of `listing_leads`), `listingContextCard(id)` | wanted, billing, chat |
| wanted | `scoreMatch(...)`, `recomputeForListing(listingId)`, `seekersForListing(listingId)`, `buildDigest(userId)` | listings (publish/update), scaffold digest job |
| shuttle | `nearestStop(campusId, lat, lng)` | listings, map |
| map | `geocode(q)`, `commute(campusId, lat, lng)` | listings |
| market | `closeBundlesForListing(listingId)` | listings (`POST /:id/rented { closeBundle }`) |
| billing | `pickSponsored(...)`, `recordImpressions(ids)`, `quoteEscrowFee(amountCents, feePayer)` | listings, market, buddy, admin |
| every module | optional `jobs.ts` exporting job functions (§10); scaffold registers them with a dynamic import guarded by existence | scaffold scheduler |

---

## 2. Cross-cutting entities

### 2.1 campuses
Seeded with ~60 US universities (`server/src/db/seed/campuses.ts`, data in `shared/src/campuses.ts`). Key fields: `slug` (URL), `lat/lng` (center), `timezone`, `edu_domains_json` (used to auto-assign campus from a verified `.edu` email), `has_shuttle`, `default_radius_m` (campus-scope search radius, default 5 km; dense cities like NYU use 3 km, sprawling like UCLA 8 km).

Campus resolution order for a request: explicit `campusId` query → `users.campus_id` → cookie `campus` → `null` (web then forces the onboarding picker).

### 2.2 users
One row per account. `role` ∈ `student|landlord|admin`. `trust_level` 0–3 (§5). `campus_id` nullable (landlords may be nationwide; admins too). `pro_until` and `wallet_balance_cents` are trigger-maintained caches. `referral_code` unique 8-char upper alnum generated at signup. `verified_only_messaging` blocks trust-0 users from opening a conversation with this user.

Public projection `UserPublic` (never leak email/phone): `id, name, role, trustLevel, campusId, avatarUrl, bio, program, gradYear, languages, memberSince, badges[] (derived), isPro (derived: pro_until > now)`.

`responseRate` / `responseMedianMin` (Trust Strip, public profile) are derived, not stored: over this user's direct conversations of the last 90 days in which the *other* party sent the first message, `responseRate` = share answered by this user within 24 h, `responseMedianMin` = median minutes to that first reply; both `null` with fewer than 3 samples. Computed by `lib/cards.ts` `toUserPublic(row, { withStats: true })` and included only by detail endpoints (`GET /api/users/:id`, `GET /api/verify/profile/:id`, `Listing.owner`, `Item.seller`, `Buddy.author`), never on list cards.

### 2.3 uploads
Multer writes to `server/uploads/YYYY/MM/<id>.<ext>`; seed assets live at `server/uploads/seed/`. `is_private=1` (verification docs) are only streamed through `GET /api/uploads/:id/file` to owner or admin; public ones are static at `/uploads/...`. Max 10 MB image, 20 MB document. Accepted mimes: `image/jpeg, image/png, image/webp, image/svg+xml (seed only), application/pdf (verification)`.

### 2.4 notifications
In-app bell. Created server-side by modules via `notify(userId, {kind,title,body,link,entityType,entityId,data})` in `server/src/lib/notify.ts`, which inserts the row **and** `hub.publish(userId, {type:'notification', data})`. Titles are localized at creation using the recipient's `locale`.

### 2.5 reports
Generic moderation queue. Any user may report any entity; admin resolves. `resolution` free text; the action itself (hide listing, ban user) is applied by admin APIs and written to `audit_log`.

### 2.6 events
Analytics firehose. Server middleware records `pageview` from the client beacon; modules record domain events (`listing.view`, `listing.contact_click`, `affiliate.click`, `checkout.*`, `boost.impression`). Admin KPIs are `GROUP BY type, date(created_at)`.

---

## 3. Per-module ER

Notation: `A 1—* B` = one A has many B. `[poly]` = polymorphic.

### 3.1 listings
```
users 1—* listings *—1 campuses
listings 1—* listing_photos *—1 uploads
listings 1—* listing_amenities
listings 1—* listing_availability
users *—* listings  (listing_saves)
listings 1—* listing_leads *—1 users ; listing_leads *—1 conversations
listings *—1 shuttle_stops (nearest_stop_id, cache)
listings 1—* boosts [poly entity_type='listing']
listings 1—* escrows
listings 1—* matches
listings 0..1—* market_bundles (move-out sale)
```
- Address is geocoded (`map` proxy) at create/update; `campus_id` auto-suggested = nearest campus within 40 km of the geocoded point (else nearest campus with a warning "far from campus"); user may override.
- Public reads of a listing with `hide_exact_address=1` return `address_line1` as `null`, `lat/lng` **fuzzed** deterministically (hash(id) → offset ≤ 150 m) and `addressDisplay = "<neighborhood or street name>, <city>"`. The owner, admins, and users with an `accepted|funded|released` escrow on it see the exact address.
- `distance_to_campus_m`, `commute_*`, `nearest_stop_*` are computed at publish (via `map` commute service) and refreshed when lat/lng change.
- `is_verified_listing` snapshot = owner `trust_level >= 2` at publish; recomputed on each publish.
- Non-Pro quota: `users.listing_quota` (default 2) active listings; Pro = unlimited. Landlord role without Pro gets quota 3.
- Amenity keys (exact strings stored in `listing_amenities.amenity`): `wifi, laundry_in_unit, laundry_in_building, ac, heating, dishwasher, gym, elevator, doorman, balcony, desk, bike_storage, package_room, pool, study_room, private_bath, kitchen, microwave, tv, closet, security, accessible, near_grocery, utilities_included`.

### 3.2 wanted
```
users 1—* wanted_posts *—1 campuses
wanted_posts 1—* wanted_areas (0..n; 0 = campus default radius / nationwide)
wanted_posts *—* listings (matches, score cache, UNIQUE(wanted_id, listing_id))
matches *—1 conversations (when offered/contacted)
```
- `scope='campus'` matches listings with the same `campus_id` **or** within any of its areas; `scope='nationwide'` matches only via `wanted_areas` (city/circle/campus kinds), ignoring campus_id.
- "Offer my place": host picks one of their active listings → `openConversation(host, seeker, {context:'listing', id})` + `postContextCard(listing)` + `matches.status='offered'` + `listings.recordLead({ source: 'wanted_offer' })`.
- Digest placeholder: a nightly job (`server/src/jobs/digest.ts`, scaffold-owned, calls `wanted.buildDigest(userId)`) creates a `notifications` row `kind='digest'` listing new matches ≥ 60. No real email.

### 3.3 chat
```
conversations 1—* conversation_members *—1 users
conversations 1—* messages *—1 users (sender, NULL=system)
messages *—1 uploads (image)
messages 1—* message_reads *—1 users
users *—* users (blocks)
conversations *—1 [poly context] listing | wanted | market_item | buddy_post | escrow
```
- `direct` conversations are deduplicated by `direct_key = sort(userA,userB).join('|') + '|' + (context_type||'') + '|' + (context_id||'')`. Same two people about a *different* listing = different thread; without context = one "general" thread.
- `group` conversations: buddy posts (`buddy_posts.conversation_id`), created on first join with the host as `role='owner'`.
- `support`: reserved for admin ↔ user threads (admin module may use).
- First message guard: sender must not be blocked by recipient; if recipient `verified_only_messaging=1` the sender needs `trust_level >= 1`; sender `banned=0`. Scam-warning banner is shown client-side when `conversation_members.scam_banner_dismissed=0` and `message_count <= 3`.
- `unread_count` incremented by trigger; reset to 0 by the server on `chat.read`/`POST .../read` together with `last_read_message_id/at` and `message_reads` rows (for direct chats one `message_reads` row for the last message suffices; for groups insert rows for all unread messages).
- Message search: `LIKE '%q%'` on `messages.body` restricted to the caller's conversations (no FTS dependency).

### 3.4 verify
```
users 1—* email_codes
users 1—* phone_codes
users 1—* verification_requests *—1 uploads (front/back/selfie) ; *—1 users (reviewer)
users 1—* payment_methods
* —> audit_log
```
- Edu domain check: email domain (and parent domains, e.g. `u.northwestern.edu` → `northwestern.edu`) must appear in some `campuses.edu_domains_json`, or end with `.edu` (generic). On confirm: `users.email_verified_at`, `edu_email`, `trust_level = max(trust_level,1)`, and if `users.campus_id` is null set it from the matched campus. The request/confirm flow is implemented once by the scaffold (`server/src/lib/eduVerify.ts`, mounted at `/api/auth/request-edu-code` and `/api/auth/confirm-edu-code`); verify's `/api/verify/edu/*` routes are thin aliases of it, so there is one code path and one owner of `email_codes`.
- Trust recompute (`recomputeTrust(userId)` in `server/src/lib/trust.ts`, scaffold-owned, shared by auth, verify, billing and admin): see §5. Called after any of: edu confirm, verification approve/reject, phone confirm, payment method add/remove, admin override.

### 3.5 map
```
geocode_cache (standalone, keyed by normalized query)
commute_cache *—1 campuses ; *—1 shuttle_stops
pois *—1 campuses
```
- Geocoding proxy: `GET /api/map/geocode?q=` → cache hit (`query_key`) or Nominatim (1 req/s, UA header, `countrycodes=us`); failures cached 1 h with `precision='none'`. Reverse: `rev:<lat5>,<lng5>`.
- Commute estimate: `distance_m` = haversine to campus center; `walk_min = ceil(distance_m / 80)` (4.8 km/h), `bike_min = ceil(distance_m / 250)` (15 km/h); `shuttle_min` = if nearest stop ≤ 800 m: `ceil(nearest_stop_m/80) + 5 (wait) + ceil(stop→campus distance / 400)` else null.
- Explore page layers: listings, market items, buddy events, shuttle stops/routes, POIs — all bbox-filtered via their lat/lng indexes.

### 3.6 shuttle
```
campuses 1—* shuttle_routes 1—* shuttle_route_stops *—1 shuttle_stops *—1 campuses
shuttle_routes 1—* shuttle_schedule *—1 shuttle_stops
campuses 1—* shuttle_alerts (*—1 shuttle_routes optional)
campuses 1—* shuttle_requests
users 1—* shuttle_favorites [poly stop|route]
```
- `service_day` resolution: campus-local date → `holiday` if in `shared/src/holidays.ts` list, else `saturday|sunday|weekday`.
- Next departures at a stop: `SELECT ... WHERE stop_id=? AND service_day=? AND departure_time >= :nowHHMM AND (valid_from IS NULL OR valid_from <= :today) AND (valid_to IS NULL OR valid_to >= :today) ORDER BY departure_time LIMIT 5`. Times after midnight are stored as `'24:xx'`/`'25:xx'`.
- "Near shuttle stop" badge on listings: `nearest_stop_m <= 400`.

### 3.7 market
```
users 1—* market_items *—1 campuses
market_items 1—* market_item_photos *—1 uploads
market_bundles 1—* market_items ; market_bundles *—1 listings (move-out sale)
users *—* market_items (wishlists)
market_items 1—* boosts [poly 'market_item']
market_items —> conversations [context 'market_item']
```
- Price suggestion: median of `sold_price_cents` (fallback `price_cents`) of items with same `category` and `condition` ± 1 step, `status='sold'`, last 180 days, nationwide (campus first if ≥ 5 samples); return `{suggestedCents, low, high, sampleSize}`.
- Mark sold may set `buyer_id` (optional pick from people in conversations).
- Pickup privacy: `pickup_lat/lng` are returned rounded to 3 decimals (~110 m) to everyone except the seller and admins; the UI draws an approximate circle, never an exact pin.
- Price drop: `wishlists.price_at_add_cents` is set when an item is wishlisted; `GET /api/market/wishlist` returns `priceDropCents = price_at_add_cents - price_cents` (or `null` when not positive), and a seller price cut notifies wishlisters with `market.wishlist_price`.

### 3.8 buddy
```
users 1—* buddy_posts *—1 campuses
buddy_posts 1—* buddy_members *—1 users
buddy_posts 1—* buddy_events *—1 campuses
buddy_posts *—1 conversations (group chat)
buddy_posts 1—* boosts [poly 'buddy_post']
```
- Join rules: post `status='open'`; `member_count < max_members`; if `verified_only=1` require `trust_level >= min_trust_level`; author cannot join own post (already host). `requires_approval=1` → member `status='pending'` until host approves.
- On first `joined` member: create group conversation (`kind='group'`, `title=post.title`, `context_type='buddy_post'`), add host as `owner`; subsequent joins add members and post a system message `member_joined`.
- When `member_count == max_members` → `status='full'` (and back to `open` if someone leaves). After `ends_at` (or `starts_at + 6h`) passes → `expired` by the hourly job.

### 3.9 billing
```
pricing_plans 1—* orders ; 1—* boosts ; 1—* subscriptions
users 1—* orders 1—1 payments (latest; retries create new payment rows)
orders *—1 promo_codes ; promo_codes 1—* promo_redemptions
boosts *—1 orders ; boosts —> [poly] listing | market_item | buddy_post
subscriptions *—1 users ; *—1 payment_methods ; last_order_id —> orders
escrows *—1 listings ; payer/payee —> users ; *—1 orders ; 1—* escrow_events
users 1—* wallet_ledger (append-only, balance_after)
users 1—* referrals (as referrer) ; referred_id UNIQUE
partners 1—* partner_clicks *—1 users
```
- Mock Stripe (`server/src/modules/billing/mockStripe.ts`): creates `pi_mock_*` intents; confirmation with test card numbers: `4242424242424242` succeeds, `4000000000000002` declined (`card_declined`), `4000000000009995` `insufficient_funds`, any other 16-digit Luhn-valid = succeeds. No network. Everything UI-labelled "Test mode — no real charges".
- Order total: `total = max(0, subtotal - discount - credit) + fee`. Credits applied from wallet only if `wallet_balance_cents > 0` and user opted in at checkout; wallet debit is a `wallet_ledger` row with `kind='order_payment'`. If `total == 0` after credits, the payment row has `provider='wallet'` and succeeds immediately.
- Escrow fee: `fee_cents = max(fee_min_cents, round(amount_cents * fee_bps / 10000))`, plan `escrow.standard` = 300 bps, min 500 cents. Revenue recognised = fee only (`v_revenue`).
- Referral: signup with `?ref=CODE` → `users.referred_by` + `referrals(status='pending')`. When the referred user reaches trust 1 (`qualify_rule='edu_verified'`) → `qualified` → both get wallet credits (`referral_reward` / `referral_welcome`, 500 cents each) → `rewarded`. Credits expire after 180 days (`expires_at`), the nightly job writes `kind='expiry'` rows.
- Affiliate: `GET /api/billing/partners/:slug/go` inserts `partner_clicks` (with `payout_cents = partners.payout_cents` if `cpc`), logs `events.type='affiliate.click'`, 302 → `affiliate_url`.

### 3.10 admin
Reads everything; writes `users.role/banned/listing_quota`, `reports`, `feature_flags`, `shuttle_alerts` (via shuttle API), `moderation_status` on `listings` / `wanted_posts` / `market_items` / `buddy_posts`, `pricing_plans`, `promo_codes`, `partners`, `escrows` resolution (via billing API), `verification_requests` (via verify API). Every admin write appends `audit_log`.

KPI definitions (events-based unless noted): DAU/WAU = distinct `user_id` in `events` per day/7-day window; listings = count by status; matches = `matches` with score ≥ 50 created per day; GMV = sum of `escrows.amount_cents` funded per day; boost revenue = `v_revenue` where `order_kind='boost'`; affiliate clicks = `partner_clicks` per day; funnels = `checkout.start → checkout.pay → checkout.success`, `listing.view → listing.contact_click → chat.start`.

---

## 4. Enum catalogue

Served by `GET /api/meta` as `{ enums: { <name>: string[] }, amenities, categories, campusesCount }`. Mirrored in `shared/src/enums.ts` (const arrays + zod `z.enum`). Columns in parentheses.

| Enum | Values |
|---|---|
| `role` (users.role) | `student`, `landlord`, `admin` |
| `locale` | `zh-CN`, `en` |
| `trustLevel` | `0`, `1`, `2`, `3` |
| `gender` | `female`, `male`, `nonbinary`, `undisclosed` |
| `uploadKind` | `image`, `document` |
| `uploadPurpose` | `avatar`, `listing`, `item`, `verification`, `chat`, `partner`, `poi`, `seed`, `other` |
| `emailCodePurpose` | `edu_verify`, `login`, `password_reset`, `email_change` |
| `verificationType` | `student_id`, `passport`, `government_id`, `landlord_proof` |
| `verificationStatus` | `pending`, `in_review`, `approved`, `rejected`, `cancelled` |
| `listingType` | `sublet`, `lease_takeover`, `new_lease`, `short_term` |
| `propertyType` | `studio`, `apartment`, `house`, `townhouse`, `room`, `shared_room` |
| `geocodePrecision` | `rooftop`, `street`, `city`, `manual` |
| `furnished` | `none`, `partial`, `full` |
| `leaseType` | `sublease`, `takeover`, `new_lease`, `month_to_month` |
| `genderPref` | `any`, `female`, `male` |
| `parking` | `none`, `street`, `lot`, `garage` |
| `listingStatus` | `draft`, `active`, `paused`, `rented`, `expired`, `removed` |
| `moderationStatus` | `ok`, `flagged`, `hidden` |
| `availabilityStatus` | `available`, `booked`, `blocked` |
| `leadSource` | `message`, `wanted_offer`, `escrow`, `phone_reveal` |
| `leadStatus` | `new`, `replied`, `qualified`, `closed`, `spam` |
| `scope` | `campus`, `nationwide` |
| `wantedStatus` | `active`, `paused`, `fulfilled`, `expired`, `removed` |
| `areaKind` | `circle`, `city`, `campus` |
| `matchStatus` | `new`, `seen`, `dismissed`, `offered`, `contacted` |
| `conversationKind` | `direct`, `group`, `support` |
| `contextType` | `listing`, `wanted`, `market_item`, `buddy_post`, `escrow` |
| `memberRole` | `owner`, `admin`, `member` |
| `messageKind` | `text`, `image`, `system`, `context_card` |
| `reportEntityType` | `listing`, `wanted`, `market_item`, `buddy_post`, `user`, `message`, `conversation`, `partner` |
| `reportReason` | `scam`, `spam`, `fake`, `harassment`, `inappropriate`, `duplicate`, `wrong_info`, `other` |
| `reportStatus` | `open`, `in_review`, `actioned`, `dismissed` |
| `notificationKind` | `chat.message`, `match.new`, `wanted.offer`, `verify.approved`, `verify.rejected`, `escrow.state`, `boost.expiring`, `boost.started`, `subscription.renewed`, `subscription.past_due`, `report.actioned`, `buddy.join`, `buddy.approved`, `buddy.event_reminder`, `market.wishlist_price`, `shuttle.alert`, `referral.rewarded`, `system`, `digest` |
| `serviceDay` | `weekday`, `saturday`, `sunday`, `holiday` |
| `alertSeverity` | `info`, `warning`, `critical` |
| `shuttleRequestStatus` | `open`, `planned`, `done`, `rejected` |
| `favoriteEntityType` | `stop`, `route` |
| `marketCategory` | `furniture`, `electronics`, `textbooks`, `kitchen`, `bikes`, `clothing`, `home`, `tickets`, `move_out`, `free`, `other` |
| `itemCondition` | `new`, `like_new`, `good`, `fair`, `poor` |
| `deliveryOption` | `pickup`, `delivery`, `both` |
| `itemStatus` | `draft`, `active`, `reserved`, `sold`, `removed`, `expired` |
| `bundleStatus` | `active`, `closed`, `removed` |
| `buddyType` | `airport_pickup`, `carpool`, `roommate`, `study`, `gym`, `dining`, `travel`, `costco_run`, `event`, `other` |
| `buddyStatus` | `open`, `full`, `closed`, `cancelled`, `expired`, `removed` |
| `buddyMemberStatus` | `pending`, `joined`, `left`, `removed`, `declined` |
| `buddyMemberRole` | `host`, `member` |
| `buddyEventStatus` | `scheduled`, `cancelled`, `done` |
| `planKind` | `boost`, `subscription`, `escrow_fee`, `service` |
| `boostEntityType` | `listing`, `market_item`, `buddy_post` |
| `boostTier` | `basic`, `plus`, `max` |
| `planInterval` | `month`, `year` |
| `promoKind` | `percent_off`, `fixed_off`, `wallet_credit` |
| `orderKind` | `boost`, `subscription`, `subscription_renewal`, `escrow_deposit`, `wallet_topup` |
| `orderStatus` | `pending`, `awaiting_payment`, `paid`, `fulfilled`, `cancelled`, `failed`, `refunded` |
| `paymentProvider` | `mock_stripe`, `wallet` |
| `paymentStatus` | `requires_payment_method`, `requires_confirmation`, `processing`, `succeeded`, `failed`, `cancelled`, `refunded`, `partially_refunded` |
| `boostStatus` | `scheduled`, `active`, `expired`, `cancelled`, `refunded` |
| `subscriptionStatus` | `trialing`, `active`, `past_due`, `cancelled`, `expired` |
| `escrowStatus` | `proposed`, `accepted`, `funded`, `in_inspection`, `released`, `refunded`, `disputed`, `resolved`, `cancelled`, `expired` |
| `escrowFeePayer` | `payer`, `payee`, `split` |
| `escrowResolution` | `release_to_payee`, `refund_to_payer`, `split` |
| `ledgerKind` | `referral_reward`, `referral_welcome`, `promo_credit`, `refund`, `order_payment`, `admin_adjustment`, `escrow_fee_rebate`, `topup`, `expiry` |
| `referralStatus` | `pending`, `qualified`, `rewarded`, `void` |
| `partnerCategory` | `bank`, `sim`, `insurance`, `movers`, `storage`, `airport_pickup`, `furniture`, `housing`, `food`, `other` |
| `payoutModel` | `cpc`, `cpa`, `flat`, `rev_share` |
| `clickPlacement` | `kit`, `listing_detail`, `onboarding`, `chat_card`, `banner`, `other` |
| `poiCategory` | `building`, `library`, `dining`, `grocery`, `asian_grocery`, `transit`, `gym`, `health`, `bank`, `pharmacy`, `post`, `landmark`, `other` |
| `savedSearchModule` | `listings`, `wanted`, `market`, `buddy` |
| `eventType` (open set; canonical list) | `pageview`, `signup`, `login`, `search`, `listing.view`, `listing.contact_click`, `listing.save`, `listing.share`, `listing.publish`, `wanted.view`, `wanted.offer`, `match.view`, `chat.start`, `chat.message`, `verify.submit`, `item.view`, `item.contact_click`, `buddy.view`, `buddy.join`, `shuttle.view`, `affiliate.click`, `boost.impression`, `boost.click`, `checkout.start`, `checkout.pay`, `checkout.success`, `checkout.fail`, `escrow.propose`, `escrow.fund`, `campus.switch` |
| `featureFlagKey` (seeded) | `boosts.enabled`, `pro.enabled`, `escrow.enabled`, `affiliate.enabled`, `nationwide.enabled`, `scam_banner.enabled`, `verified_only_default`, `maintenance_banner` |

Sort keys per list endpoint are in `docs/API.md`.

---

## 5. Trust levels

`users.trust_level` is **derived**; `recomputeTrust(userId)` sets it to the highest level whose requirements are all met, except that an admin override (`audit_log action='user.trust_override'`, stored in `users` by setting the level directly and `events` note) is never lowered automatically unless the user is banned.

| Level | Requirements | Badge | Unlocks |
|---|---|---|---|
| 0 | account exists | none ("Unverified") | browse everything; save/wishlist; create **draft** listings/posts; cannot publish; cannot message users with `verified_only_messaging=1`; max 5 outbound new conversations/day |
| 1 | `email_verified_at` set with an edu domain | "Edu verified" (blue) | publish listings/wanted/items/buddy posts; open conversations; join buddy posts (unless post `min_trust_level` higher); redeem promo codes; referral qualifies |
| 2 | level 1 + an **approved** `verification_requests` row of type `student_id|passport|government_id|landlord_proof` | "ID verified" (green shield) | listings show `is_verified_listing`; "verified host" filter; host `verified_only` buddy posts; propose escrow (as payee); Landlord role upgrade without admin; higher daily message cap (50) |
| 3 | level 2 + `phone_verified_at` + at least one non-deleted `payment_methods` row | "Fully verified" (gold) | fund escrow (as payer); buy Landlord Pro; receive escrow payouts; unlimited daily messages; (admin seed account is 3) |

Rules:
- `requireTrust(n)` middleware returns `403 TRUST_REQUIRED` with `data: { required: n, current: m, nextStep: 'edu'|'id'|'phone'|'payment' }`.
- Banned users (`banned=1`) fail `requireAuth` with `403 BANNED` on every write and on chat reads; public profile shows "suspended".
- Boost tiers: `basic|plus` require level ≥ 1, `max` requires level ≥ 2. Landlord Pro requires level ≥ 3. A payment method saved during any checkout is stored in `payment_methods` and counts toward level 3 automatically.
- Badges array in `UserPublic.badges`: `['edu','id','phone','payment','pro','landlord','admin']` subset, derived from timestamps/flags, so the UI never recomputes trust.

---

## 6. State machines

Transitions not listed are rejected with `409 INVALID_STATE`. `(sys)` = scheduled job; `(adm)` = admin only.

### 6.1 Verification request
```
pending ──(adm claim)──▶ in_review ──(adm approve)──▶ approved
   │                         │
   │                         └──(adm reject, reason required)──▶ rejected
   └──(user cancel)──▶ cancelled
pending/in_review ──(adm approve/reject directly)──▶ approved/rejected   (claim optional)
```
Only one `pending|in_review` request per user per type. `approved` → `users.id_verified_at = now`, `recomputeTrust`, notification `verify.approved`, audit `verify.approve`. `rejected` → notification `verify.rejected` with reason; user may resubmit.

### 6.2 Listing
```
draft ──(publish; requires trust≥1, ≥1 photo, quota)──▶ active
active ──(pause)──▶ paused ──(resume)──▶ active
active|paused ──(mark rented)──▶ rented ──(relist)──▶ active
active ──(sys: now > expires_at)──▶ expired ──(renew: sets expires_at +30d)──▶ active
any except removed ──(owner delete | adm)──▶ removed   (terminal; row kept for leads/escrow)
```
`expires_at` default = `max(available_from, published_at) + 45 days`. `moderation_status` is orthogonal: `hidden` removes from all public lists regardless of status; `flagged` keeps it visible but surfaces in admin. Publishing sets `published_at`, snapshots `is_verified_listing`, computes commute caches, (re)computes matches for active wanted posts in the same campus or whose areas contain the point.

### 6.3 Wanted post
```
active ──(pause)──▶ paused ──(resume)──▶ active
active|paused ──(fulfilled)──▶ fulfilled   (terminal for matching)
active ──(sys: now > move_in_to + 14d)──▶ expired ──(extend)──▶ active
any ──(delete | adm)──▶ removed
```

### 6.4 Market item
```
draft ──(publish; trust≥1, ≥1 photo unless category='free')──▶ active
active ──(reserve)──▶ reserved ──(unreserve)──▶ active
active|reserved ──(mark sold)──▶ sold          (terminal; buyer_id optional)
active ──(sys: 60d without update)──▶ expired ──(renew)──▶ active
any ──(delete | adm)──▶ removed
```
Bundle: `active → closed` when listing is rented or seller closes; `removed` on delete. Closing a bundle does not change its items.

### 6.5 Buddy post
```
open ◀──(member leaves & count<max)── full
open ──(member_count == max_members)──▶ full
open|full ──(host close)──▶ closed ──(host reopen, if not past ends_at)──▶ open
open|full ──(host cancel)──▶ cancelled   (system message to group; events → cancelled)
open|full ──(sys: past ends_at or starts_at+6h)──▶ expired
any ──(adm)──▶ removed
```
Member: `pending → joined | declined` (host), `joined → left` (self) | `removed` (host). Re-join allowed from `left|declined` → `pending|joined`.

### 6.6 Order
```
pending ──(checkout creates payment intent)──▶ awaiting_payment
awaiting_payment ──(payment succeeded)──▶ paid ──(fulfil: boost/sub/escrow applied)──▶ fulfilled
awaiting_payment ──(payment failed; may retry with new payment row)──▶ failed ──(retry)──▶ awaiting_payment
pending|awaiting_payment|failed ──(user/sys cancel after 30 min)──▶ cancelled
paid|fulfilled ──(adm refund)──▶ refunded
```
`paid → fulfilled` happens in the same transaction as the payment success handler; `paid` is observable only if fulfilment throws (job retries).

### 6.7 Payment (mock Stripe)
```
requires_payment_method ──(attach card)──▶ requires_confirmation ──(confirm)──▶ processing ──▶ succeeded
                                                                                        └──▶ failed (failure_code)
requires_* | processing ──(cancel)──▶ cancelled
succeeded ──(refund partial)──▶ partially_refunded ──(refund rest)──▶ refunded
succeeded ──(refund full)──▶ refunded
```
In the mock, `processing → succeeded|failed` is synchronous inside confirm.

### 6.8 Boost
```
scheduled ──(sys/at purchase when starts_at <= now)──▶ active ──(sys: now >= ends_at)──▶ expired
scheduled|active ──(owner cancel; prorated wallet credit `refund`)──▶ cancelled
scheduled|active ──(adm refund)──▶ refunded
```
Buying a boost for an already-boosted entity **extends**: new `starts_at = existing ends_at`. The entity's `boosted_until` is trigger-synced. Tier affects slot weight (§8) and badge style: `basic` ("Featured"), `plus` (featured + top of map pins), `max` (featured + top + eligible for the home page sponsored slot). Tier and duration are coupled: `basic` = 3 d, `plus` = 7 d, `max` = 14 d, seeded per entity type (9 plans, keys `boost.<listing|item|buddy>.<3d|7d|14d>`); the pricing page presents them as a duration choice. Boosted entities are only ever shown **within their own campus** or in nationwide results for their city.

### 6.9 Subscription (Landlord Pro)
```
trialing ──(trial_ends_at reached, charge ok)──▶ active
trialing ──(charge fails)──▶ past_due
active ──(period end, renewal charge ok)──▶ active (new period, order kind=subscription_renewal)
active ──(renewal charge fails)──▶ past_due ──(retry ok)──▶ active
past_due ──(3 failed retries / 7d)──▶ expired
active|trialing|past_due ──(user cancel: cancel_at_period_end=1)──▶ ... ──(period end)──▶ cancelled
active|trialing|past_due ──(adm cancel now)──▶ cancelled
```
`users.pro_until` cache = max `current_period_end` among `trialing|active|past_due`. Pro perks: unlimited listings, lead inbox, analytics panel, "Pro" badge, 1 free `basic` boost per month (wallet credit `promo_credit` 1 × basic price issued on each renewal).

### 6.10 Escrow (deposit)
```
proposed ──(counterparty accept)──▶ accepted ──(payer funds: order kind=escrow_deposit succeeded; trust≥3)──▶ funded
proposed ──(either cancel | sys: expires_at)──▶ cancelled | expired
accepted ──(either cancel before funding)──▶ cancelled
funded ──(sys: move_in_date reached)──▶ in_inspection   (inspection_deadline_at = move_in + inspection_hours)
funded|in_inspection ──(payer release early)──▶ released
in_inspection ──(sys: deadline passed with no dispute)──▶ released
funded|in_inspection ──(payee refund / both agree)──▶ refunded
funded|in_inspection ──(payer dispute, reason required)──▶ disputed ──(adm resolve: release_to_payee|refund_to_payer|split)──▶ resolved
```
Money: `funded` = payment succeeded for `amount + (fee if fee_payer=payer)`. `released` = payee receives a wallet credit of `amount - (fee share if fee_payer=payee|split)` as `wallet_ledger kind='topup', ref_type='escrow'` (bank payout is out of scope; in the mock the money stays as wallet balance). `refunded` = payment refund of `amount` to the payer's card (mock); the fee is kept, except when the escrow is cancelled/refunded before `in_inspection`, in which case the fee is refunded too. `resolved` with `split` writes both a partial refund and a partial wallet credit using `resolution_payer_cents / resolution_payee_cents`. Every transition appends `escrow_events` and posts a system message to `conversation_id` and a `notification kind='escrow.state'` to both parties.

### 6.11 Report
`open → in_review → actioned | dismissed`; `open → actioned | dismissed` directly. `actioned` requires an audit entry of what was done.

### 6.12 Match
`new → seen` (seeker views), `new|seen → dismissed` (seeker), `new|seen → offered` (host offers), `offered|seen|new → contacted` (either side opens chat). Recompute never downgrades `offered|contacted|dismissed`; it only updates `score`.

---

## 7. Wanted ↔ listing matching score

`score ∈ [0,100]` integer, computed by `wanted/matching.ts` (pure function `scoreMatch(wanted, areas, listing, campus) → {score, breakdown, hardFail?}`), persisted to `matches` for all pairs with `score ≥ 30` (below that no row). "Matches for you" shows `score ≥ 50`, sorted by score desc, then listing recency.

**Candidate set** (SQL prefilter, before scoring): listings `status='active' AND moderation_status='ok'`, `price_cents <= budget_max * 1.25`, `available_from <= move_in_to + flexible_days` and (`available_to IS NULL OR available_to >= move_in_from`), and location: campus scope → `campus_id = wanted.campus_id` OR inside any area bbox; nationwide → inside any area bbox (areas of kind `city` → `city/state` equality; `campus` → that campus_id).

**Hard fails** (score forced to 0, no row): listing `gender_pref` ≠ `any` and wanted `gender_pref` ≠ `any` and they differ; wanted `has_pets=1` and listing `pets_allowed=0`; listing `bedrooms < bedrooms_min` when `bedrooms_min > 0` and `property_type` not `room|shared_room`; blocked users either direction; listing owner == wanted author.

**Components** (weights sum to 100):

| Component | Weight | Rule |
|---|---|---|
| Price | 30 | `p = price_cents`, `[lo,hi] = [budget_min, budget_max]`. Inside range → 30. Below lo → 30 (cheaper is fine). Above hi: `30 * max(0, 1 - (p-hi)/(0.25*hi))` (linear to 0 at +25%). |
| Dates | 25 | Overlap of listing window `[available_from, available_to or +∞]` with wanted move-in window `[move_in_from - flex, move_in_to + flex]`: move-in feasible (`available_from ≤ move_in_to+flex`) → 15 pts; gap penalty if `available_from > move_in_from`: `-min(10, days/3)` rounded; move-out: if wanted `move_out_date` and listing `available_to`: `|Δdays| ≤ 7` → +10, `≤ 30` → +5, else +0; if either is null → +7. Clamp 0–25. |
| Location | 20 | Distance `d` from listing to the nearest wanted area center (campus scope with no areas: campus center, radius = `campuses.default_radius_m`): `d ≤ r` → 20; `d ≤ 2r` → `20 * (1 - (d-r)/r)`; else 0. `city`-kind areas: same city/state → 20, same state → 6, else 0. Nationwide with campus-kind area: same campus_id → 20 else 0. |
| Must-haves | 15 | `15 * (matched / total)` over `must_haves_json` against `listing_amenities` (+ `furnished` mapping: must-have `furnished` matched by `furnished IN ('partial','full')`; `parking` by `parking != 'none'`; `utilities_included`). Empty list → 15. |
| Fit | 10 | Furnished pref: `any` → +3; `full` requires `full` (+3) / `partial` (+1); `partial` accepts `partial|full` (+3). Property type in `property_types_json` or list empty → +3. Group size: `bedrooms >= group_size` or `property_type IN ('room','shared_room') AND group_size == 1` → +4, else +1. |
| Trust bonus | +0..+5 (bonus, capped at 100) | `is_verified_listing` → +3; owner trust 3 → +2. |
| Boost | 0 | Boosts **never** affect match score (integrity rule). |

`breakdown_json = {"price":30,"dates":22,"location":20,"mustHaves":10,"fit":7,"trust":3}`.

**When recomputed**: on wanted create/update (all candidates), on listing publish/update of price/dates/location/amenities (all active wanted posts whose candidate prefilter it passes), nightly job for everything active (cheap at this scale). Notification `match.new` is sent to the seeker when a *new* row with `score ≥ 70` appears (max 1 per listing per wanted; batched in digest otherwise). Host-side "seekers for your listing" panel = `matches WHERE listing_id=? AND score>=50`.

---

## 8. Ranking rules

Apply to every public list: listings, wanted (no boosts), market items, buddy posts, global search.

1. **Eligibility** first: `status` public (`active`, plus `reserved` for market, `open|full` for buddy), `moderation_status='ok'`, campus/scope filter (§9), user filters. Boosted items that fail filters are **not** shown — a boost never bypasses filters.
2. **Base ordering** by the requested `sort`:
   - `relevance` (default when `q` present): text match rank (title match = 3, description = 1, amenity/category = 1; multiplied by recency factor `1 / (1 + ageDays/30)`), then verified host, then recency.
   - `recent` (default without `q`): `published_at DESC` (listings), `created_at DESC` (others). Buddy default is `starts_at ASC` for upcoming.
   - `price_asc`, `price_desc`, `distance` (requires lat/lng or campus center), `date` (listings `available_from ASC`; buddy `starts_at ASC`), `match` (wanted panel).
3. **Sponsored slots**: within each page of `pageSize` results, up to **2 sponsored slots per 10 results** (positions 1 and 6 of each block of 10, 0-based indices 0 and 5; for `pageSize` not multiple of 10, `floor(pageSize/10)*2 + (pageSize%10 >= 5 ? 1 : 0)` max). Fill from the eligible boosted pool (same campus or, when nationwide, same city), ordered by `tier DESC (max>plus>basic)`, then fewest `impressions` (fair rotation), then random tiebreak. Items used as sponsored are removed from the organic stream for that page to avoid duplicates. Each sponsored item is returned with `sponsored: true` and `boostTier`, and the UI shows a clear "Sponsored · 推广" label. Organic items carry `sponsored: false` and render like any other item even if they happen to be boosted — the Featured/Sponsored treatment appears **only** on an item occupying a sponsored slot.
4. **Map pins**: `plus|max` boosted pins render with the accent price-bubble and z-index on top; counts/clustering unaffected.
5. **Home page**: the 热门房源 block (8 cards) gets the sponsored slots of rule 3 for `pageSize = 8` (one slot, position 1), filled from `max` tier only; there is no separate carousel.
6. Every served sponsored slot logs `events.type='boost.impression'` (batched per response) and increments `boosts.impressions`; clicks log `boost.click`.
7. **Never** influenced by payment: match score (§7), search text relevance, verification badges, safety banners, report handling, ordering within the organic stream.

---

## 9. Campus scoping & geo search

### 9.1 Resolution
Every list/read API accepts:

| Param | Meaning |
|---|---|
| `campusId` | explicit campus; default from user profile, then cookie `campus` |
| `scope` | `campus` (default) or `nationwide`. Only listings, wanted, market (items are campus-only by default but allow nationwide for shipping-friendly categories), and global search honour `nationwide`. Shuttle, POIs, buddy are always campus-scoped (buddy allows `city` search as a convenience). |
| `city` + `state` | city search (used by nationwide search and the "relocating" flow). Matches `listings.city = ? AND listings.state = ?` (case-insensitive, `COLLATE NOCASE`) **plus** listings whose campus is in that city. |
| `lat`, `lng`, `radiusKm` | radius search around a point (max 50 km nationwide, default `campuses.default_radius_m` in campus scope) |
| `bbox` | `minLng,minLat,maxLng,maxLat` — map viewport search; wins over radius when present |

Precedence: `bbox` > `lat/lng/radiusKm` > `city/state` > `campusId`. In `scope=campus` the campus filter is **always** applied in addition to any geo filter (`campus_id = ?`), *except* when `bbox` is present (map pan beyond the campus should still show results, as the map explicitly shows location). In `scope=nationwide` no campus filter; if no geo/city params either, results are nationwide ordered by recency and each card shows its campus/city chip.

Feature flag `nationwide.enabled=0` forces `scope=campus`.

### 9.2 Radius search SQL (bounding box on indexed lat/lng, then haversine)

```sql
-- :lat, :lng in degrees; :radius_m in metres
-- 1 deg lat ≈ 111,320 m; 1 deg lng ≈ 111,320 * cos(lat) m
WITH params AS (
  SELECT :lat AS lat, :lng AS lng, :radius_m AS r,
         :radius_m / 111320.0 AS dlat,
         :radius_m / (111320.0 * cos(radians(:lat))) AS dlng
)
SELECT l.*,
       -- haversine in metres (SQLite ≥ 3.35 has the math functions; node:sqlite ships them)
       2 * 6371000 * asin(sqrt(
           pow(sin(radians(l.lat - p.lat) / 2), 2) +
           cos(radians(p.lat)) * cos(radians(l.lat)) *
           pow(sin(radians(l.lng - p.lng) / 2), 2)
       )) AS distance_m
FROM listings l, params p
WHERE l.status = 'active' AND l.moderation_status = 'ok'
  AND l.lat BETWEEN p.lat - p.dlat AND p.lat + p.dlat       -- uses idx_listings_latlng
  AND l.lng BETWEEN p.lng - p.dlng AND p.lng + p.dlng
  AND distance_m <= p.r                                     -- SQLite allows alias in WHERE
ORDER BY distance_m
LIMIT :limit OFFSET :offset;
```

If the SQLite build lacks math functions (`asin` missing), fall back to the equirectangular approximation, accurate to <0.5 % at city scale:
```sql
111320.0 * sqrt( pow(l.lat - p.lat, 2) + pow((l.lng - p.lng) * cos(radians(p.lat)), 2) ) AS distance_m
```
`server/src/lib/geo.ts` exports `bbox(lat,lng,radiusM)` and `haversineSql(alias)` so modules reuse one implementation. The helper also exports `haversine(a,b)` in TS for post-processing and `fuzz(id, lat, lng)`.

Bbox param search: `l.lat BETWEEN minLat AND maxLat AND l.lng BETWEEN minLng AND maxLng`; clamp bbox to 2°×2° max (else `400 VALIDATION`).

City search uses `idx_listings_city_state`; `listings.city/state` and `market_items.city/state` are declared `COLLATE NOCASE` in the schema, so a plain `=` is case-insensitive **and** still uses the index (do not add `COLLATE NOCASE` in queries, that bypasses it). Nationwide text search uses `LIKE` on title/description/city with `COLLATE NOCASE`.

### 9.3 Campus auto-suggest from address
After geocoding: `SELECT id, name, distance_m FROM campuses ... ORDER BY distance_m LIMIT 3`; suggest the first if `distance_m ≤ 40 km`, else show the three nearest with a "far from campus" hint. The user can always pick any campus.

### 9.4 Cookie / profile
`campus` cookie (slug, 1 year, not httpOnly so the SPA can read it) mirrors `users.campus_id` when logged in; `PATCH /api/users/me {campusId}` updates both; `campus.switch` event logged.

---

## 10. Counters, caches, triggers, scheduled jobs

Trigger-maintained (never touch in app code): `listings.save_count/photo_count/lead_count`, `wanted_posts.match_count`, `conversations.last_message_*/message_count`, `conversation_members.unread_count` (+1 only; reset by app), `market_items.wishlist_count/photo_count`, `market_bundles.item_count`, `buddy_posts.member_count`, `users.wallet_balance_cents`, `promo_codes.redeemed_count`, `partners.click_count`, `*.boosted_until`, `users.pro_until`.

App-maintained: `view_count` (increment at most once per viewer per 6 h; dedupe via `events`), `offer_count`, `chat_count`, `boosts.impressions/clicks`, `distance_to_campus_m`, `commute_*`, `nearest_stop_*`, `users.trust_level`, `listings.is_verified_listing`, `users.last_seen_at` (throttled to once per 5 min).

Scheduled jobs (`server/src/jobs/*.ts`, scaffold registers; each module exports its job functions from `server/src/modules/<key>/jobs.ts`):

| Job | Interval | Does |
|---|---|---|
| `expireContent` | hourly | listings/wanted/items/buddy → `expired`; boosts `scheduled→active`, `active→expired`; escrow `funded→in_inspection`, `in_inspection→released`, `proposed→expired`; orders stale `→cancelled` |
| `renewSubscriptions` | hourly | subscriptions at period end: charge (mock) → new period or `past_due`/`expired` |
| `recomputeMatches` | nightly 03:00 campus-agnostic UTC | all active wanted posts |
| `digest` | nightly 09:00 UTC | `notifications kind='digest'` for users with new matches / wishlist price drops / saved searches |
| `walletExpiry` | nightly | expire credits past `expires_at` |
| `boostExpiringSoon` | hourly | `boost.expiring` notification 24 h before `ends_at` |
| `buddyReminders` | every 15 min | `buddy.event_reminder` 2 h before `starts_at` |
| `cleanup` | nightly | delete `email_codes/phone_codes` older than 7 d, `geocode_cache` expired, `events` older than 180 d |

---

## 11. Migration policy

- `schema.sql` already contains every table the brief needs. Modules should **not** need migrations; if one is unavoidable it must be purely additive (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN` guarded by a check in the migration runner, `CREATE INDEX IF NOT EXISTS`) in `server/src/db/migrations/NN_<module>.sql`, never modifying columns or triggers defined here.
- The migration runner executes files in numeric order and records each in `schema_migrations`. `ALTER TABLE ADD COLUMN` is not idempotent in SQLite, so the runner skips a file already recorded; a module must therefore never edit a migration file after it has been applied to any shared DB — add a new file instead.
- Seeds are idempotent per module: check `seed_meta.key='<module>'` with `version`; re-seed when version increases (delete-and-insert within a transaction, module tables only).

---

## Review log

Skeptical review against `BRIEF.md` (2026-11-03). Method: read all five contract files; loaded `schema.sql` into `node:sqlite` (`DatabaseSync`, in-memory, executed twice for idempotency, FK targets checked, math functions present on SQLite 3.53); smoke-tested every trigger and `v_revenue` with sample rows. Each item below is a fix applied to the named file.

**schema.sql**
1. `v_revenue` counted `wallet_topup` orders as revenue and wallet-paid orders as `0` (verified: a $10 top-up spent on a $4.99 boost reported $10 + $0). Now excludes top-ups and uses `total_cents + credit_cents`; adds `wallet_cents`.
2. `listings.city/state` and `market_items.city/state` were case-sensitive (`city='evanston'` returned 0 rows) although §9.1 promised NOCASE city search; columns are now `COLLATE NOCASE` so `=` is case-insensitive and still uses `idx_listings_city_state`.
3. `shuttle_routes.color` defaulted to `#4E2A84` (Northwestern purple). Default is now the `ink` token; route colors come from seed per campus.
4. `wishlists.price_at_add_cents` added: `GET /api/market/wishlist` promised `priceDropCents` but nothing stored the price at wishlist time.
5. Escrow comment pointed at §6.3; it is §6.10.

**DATA_MODEL.md**
6. Ownership table rewritten where two owners wrote one table: `listing_leads` (was chat + wanted + listings; now only listings' `recordLead()`), `payment_methods`/`users.payment_verified_at` (billing only), `audit_log` and `reports` inserts and `saved_searches` (scaffold `lib/*`), `referrals` pending row (scaffold at signup), `users.trust_level` (through `lib/trust.ts`).
7. New "Cross-module service contracts" table in §1: the exports each module may consume, scaffold-created stubs so parallel typecheck passes, and scaffold-owned `lib/cards.ts` DTO mappers so the global search and every module produce identical cards.
8. `recomputeTrust` moved from the verify module to scaffold `lib/trust.ts` (auth, billing and admin all need it before verify exists); edu-code flow is one scaffold implementation (`lib/eduVerify.ts`) that `/api/verify/edu/*` aliases.
9. `responseRate` / `responseMedianMin` (used by DESIGN Trust Strip and profile) had no definition; now derived from conversations (§2.2).
10. Market: pickup coordinate fuzzing and price-drop semantics defined (§3.7).
11. Admin moderation writes extended to all four `moderation_status` columns (API already had the generic endpoint).
12. Buddy state machine gained `closed → open` (reopen), which the API exposed but §6 rejected.
13. Boost plans: "9 plans" vs independent tier × duration was ambiguous; tier is now coupled to duration (basic 3 d, plus 7 d, max 14 d). Home "carousel" (which DESIGN never had) replaced by the 热门房源 sponsored slot.

**API.md**
14. Added route-ordering rule (static paths before `/:id`), e.g. `/api/billing/escrows/quote` would otherwise be swallowed by `/:id`.
15. `/api/campuses/:id/suggest` took an id it did not use; now `/api/campuses/suggest`.
16. Block endpoints moved from `/api/users` (scaffold) to `/api/chat/blocks` (chat owns `blocks`). `/api/users/:id/listings|items` removed (scaffold would need module card mappers); replaced by `ownerId` on `/api/listings` and existing `sellerId` on `/api/market/items`.
17. Duplicate endpoints removed: `/api/listings/:id/seekers` (use `/api/wanted/matches/for-listing/:id`), `/api/verify/settings` (use `PATCH /api/users/me`), `/api/verify/admin/audit` (use `/api/admin/audit`), `trustLevel` on `PATCH /api/admin/users/:id` (use verify's trust override).
18. `saved_searches` had a table but no endpoint; added `/api/search/saved` (GET/POST/DELETE).
19. DTOs that endpoints referenced but never defined: `Availability`, `Lead`, `SavedSearch`, `CampusRequest`, `PromoCode`, `Event`, `AuditEntry`. `UserMe` gained `banned/bannedReason` (login already returned it). `ListingCard` gained `commuteWalkMin/commuteShuttleMin` (card meta line 2 shows them). `ItemCard` gained `distanceToCampusM` (card shows 「离校 0.6 mi」).
20. Escrow dispute `evidenceUploadIds` now has a storage location (`escrow_events.data_json`).

**DESIGN.md / theme.css**
21. Sponsored slot counts contradicted §8 ("max 1 per 10" / "max 2 of first 8"); aligned to 2 per 10 (positions 1 and 6) and 1 for the 8-card home block.
22. Browse default sort 「推荐」 had no API sort key; defaults to `recent` with a 1:1 sort-key map.
23. Removed UI for data that does not exist: 可议价 switch (no column), zh/en description tabs (one `description`), 评价 reviews tab/stat (no reviews system), server-persisted Kit checklist and theme-in-profile (no columns; `localStorage`).
24. Buddy join gate said "< L2"; schema uses `min_trust_level` (default 1).
25. Dark mode: `dark:` variant keys off `data-theme` but the doc allowed following the OS with no attribute, so utilities and variables could disagree; the app now always writes `data-theme`.
26. `display`/`h1` mobile sizes existed only in prose and `tokens.json`; `theme.css` gained `text-display-sm` and `text-h1-sm` (Tailwind v4 `@theme inline` values cannot switch at runtime).
27. Appendix B named `shared/src/constants/campuses.ts` with `nameEn/tz` fields; now `shared/src/campuses.ts` with the `Campus` DTO shape, matching §2.1 and `docs/data/campuses.json`.
28. Nationwide switcher row: DESIGN disabled it for market while §9.1 allows it; aligned (allowed on market for delivery items, disabled on buddy/shuttle).

**Checked and left unchanged**: WS_EVENTS.md (consistent with chat API, notify helper and hub exports); all other DESIGN tokens vs `theme.css` (color, radius, shadow, motion, z-index, breakpoints, containers all match); every BRIEF §3 feature has tables and endpoints after the fixes above.

**Unresolved (outside this review's files)**: BRIEF §8.2 still says "realistic Evanston addresses" while §7 requires seed data for ≥ 3 campuses; read §8.2 as "realistic addresses for each seeded campus". BRIEF §3 `chat` lists "block/report" under chat while reports are generic; resolved here by the `lib/reports.ts` helper, which the BRIEF does not mention.
