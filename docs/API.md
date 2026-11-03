# REST API — campus-sublet

> Authoritative endpoint contract. Server: Express 5 under `/api`. Every module mounts its router at `/api/<module>` from `server/src/modules/<key>/routes.ts`. Cross-cutting routers (§2) are built by the scaffold. Realtime is in `docs/WS_EVENTS.md`; semantics (enums, state machines, ranking, scoping) are in `docs/DATA_MODEL.md`.

Contents

1. Conventions (envelope, auth, pagination, scoping params, errors, DTOs)
2. Cross-cutting endpoints (auth, users, campuses, uploads, notifications, search, meta, events, dev)
3. `listings`
4. `wanted`
5. `chat`
6. `verify`
7. `map`
8. `shuttle`
9. `market`
10. `buddy`
11. `billing`
12. `admin`

---

## 1. Conventions

### 1.1 Envelope
```ts
// success
{ ok: true, data: T }
// paginated success
{ ok: true, data: { items: T[], total: number, page: number, pageSize: number } }
// failure
{ ok: false, error: { code: ErrorCode, message: string, fields?: Record<string, string>, data?: unknown } }
```
`message` is English developer text; the web maps `code` (and `fields` keys) to i18n strings. `data` on errors is optional structured context (e.g. `TRUST_REQUIRED` → `{ required, current, nextStep }`).

### 1.2 Auth
- Cookie `sid` = JWT HS256 (`jose`), 30 d, `httpOnly; SameSite=Lax; Path=/; Secure` in prod. Payload `{ sub: userId, role, iat, exp }`. Role/trust/banned are **re-read from DB** on every request by `requireAuth` (so bans take effect immediately) and attached as `req.user` (full `users` row minus `password_hash`).
- Middlewares: `optionalAuth` (sets `req.user` if cookie valid), `requireAuth` (`401 UNAUTHORIZED`), `requireRole('admin')` (`403 FORBIDDEN`), `requireTrust(n)` (`403 TRUST_REQUIRED`), `requireFlag('escrow.enabled')` (`403 FEATURE_DISABLED`), `requireNotBanned` (part of `requireAuth` for writes: `403 BANNED`).
- Column "Auth" below: `public` (optionalAuth), `user` (requireAuth), `trust≥n`, `owner` (requireAuth + row ownership or admin), `admin`.
- CSRF: all state-changing requests must send header `X-Requested-With: fetch` (checked by middleware; `403 FORBIDDEN` otherwise). The web `api()` helper sets it.
- Rate limits (in-memory, per IP+user): auth endpoints 10/min, code requests 3/10 min per email/phone, writes 60/min, reads 600/min → `429 RATE_LIMITED`.

### 1.3 Pagination & sorting
Query `page` (1-based, default 1), `pageSize` (default 20, max 50; map endpoints max 500 with `view=pins`), `sort` (per endpoint; default noted). Lists return `{ items, total, page, pageSize }`. `total` may be capped at 1000 for nationwide search.

Route order: inside a router, static paths (`/mine`, `/saved`, `/stats/campus`, `/matches/for-me`, `/digest/preview`, `/quote`, `/options`, `/sponsored`, `/bundles/for-listing/:id`, `/campuses/suggest`) are declared **before** any `/:id` route, otherwise Express 5 matches the literal as an id.

### 1.4 Scoping params (all list endpoints of listings/wanted/market/buddy/search)
```ts
const ScopeQuery = z.object({
  campusId: z.string().optional(),            // default: user.campus_id → cookie 'campus' → required unless scope=nationwide
  scope: z.enum(['campus','nationwide']).default('campus'),
  city: z.string().max(80).optional(), state: z.string().length(2).optional(), // city search (both required together)
  lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.2).max(50).optional(),
  bbox: z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/).optional(), // minLng,minLat,maxLng,maxLat
});
```
Precedence and semantics: `DATA_MODEL.md §9`. Every list item includes `campusId` and `campus: { id, shortName, city, state }` so nationwide results are self-describing. Responses also echo the applied scope: `data.scope = { campusId, scope, city?, state?, center?: {lat,lng}, radiusKm? }` (add this sibling to `items` on list responses).

### 1.5 Error codes
| HTTP | code | When |
|---|---|---|
| 400 | `VALIDATION` | zod failure; `fields` = `{ 'path.to.field': 'message' }` |
| 400 | `BAD_REQUEST` | semantically invalid (bbox too large, unknown sort) |
| 401 | `UNAUTHORIZED` | no/invalid session |
| 401 | `INVALID_CREDENTIALS` | login |
| 403 | `FORBIDDEN` | not owner / wrong role / CSRF header missing |
| 403 | `TRUST_REQUIRED` | `data: { required, current, nextStep }` |
| 403 | `BANNED` | |
| 403 | `BLOCKED` | target user blocked you or you blocked them |
| 403 | `VERIFIED_ONLY` | recipient requires trust ≥ 1 |
| 403 | `FEATURE_DISABLED` | feature flag off |
| 404 | `NOT_FOUND` | |
| 409 | `CONFLICT` | unique violation (email taken, already saved, already member) |
| 409 | `EMAIL_TAKEN` | register |
| 409 | `INVALID_STATE` | state machine transition rejected; `data: { from, to }` |
| 409 | `QUOTA_EXCEEDED` | listing quota, member cap, daily message cap; `data: { limit, current }` |
| 400 | `NOT_EDU_EMAIL` | edu code request with non-edu domain |
| 400 | `CODE_INVALID` / `CODE_EXPIRED` / `CODE_ATTEMPTS` | verification codes |
| 402 | `PAYMENT_FAILED` | mock card declined; `data: { failureCode }` |
| 402 | `INSUFFICIENT_FUNDS` | wallet |
| 400 | `PROMO_INVALID` | `data: { reason: 'expired'|'exhausted'|'not_applicable'|'min_order'|'already_used'|'unknown' }` |
| 413 | `UPLOAD_TOO_LARGE` | |
| 415 | `UNSUPPORTED_MEDIA` | |
| 429 | `RATE_LIMITED` | `data: { retryAfterSec }` |
| 502 | `UPSTREAM` | geocoder failure |
| 500 | `INTERNAL` | |

### 1.6 Shared DTOs (camelCase; `*_json` columns parsed; `*_cents` kept as cents)
```ts
type Campus = { id, name, nameZh, shortName, slug, city, state, lat, lng, timezone, eduDomains: string[], hasShuttle: boolean, defaultRadiusM, intlStudents? };
type UserPublic = { id, name, role, trustLevel, campusId, campus?: Pick<Campus,'id'|'shortName'|'city'|'state'>, avatarUrl: string|null, bio, program, gradYear, languages: string[], memberSince, badges: ('edu'|'id'|'phone'|'payment'|'pro'|'landlord'|'admin')[], isPro: boolean, lastSeenAt?: string|null /* only 'recently'/'online' bucket, not exact */, responseRate?: number|null, responseMedianMin?: number|null /* detail endpoints only, DATA_MODEL §2.2 */ };
type UserMe = UserPublic & { email, locale, phone, phoneVerifiedAt, emailVerifiedAt, eduEmail, idVerifiedAt, paymentVerifiedAt, wechatId, gender, verifiedOnlyMessaging, emailDigestOptIn, referralCode, walletBalanceCents, proUntil, listingQuota, unreadNotifications, unreadMessages, banned: boolean, bannedReason: string|null, campus: Campus|null };
type Upload = { id, url, kind, mime, width, height, sizeBytes, isPrivate };
type Photo = { id, uploadId, url, sortOrder, caption };
type Availability = { id, startDate, endDate, status, note };
type ListingCard = { id, title, priceCents, depositCents, bedrooms, bathrooms, propertyType, listingType, furnished, availableFrom, availableTo, city, state, neighborhood, lat, lng /* fuzzed unless owner */, coverUrl, photoCount, status, campusId, campus, isVerifiedListing, nearShuttle: boolean, distanceToCampusM, commuteWalkMin: number|null, commuteShuttleMin: number|null, saveCount, viewCount, ownerTrustLevel, publishedAt, sponsored: boolean, boostTier?: 'basic'|'plus'|'max', saved?: boolean /* viewer */, distanceM? /* when geo sort */ };
type Listing = ListingCard & { description, addressLine1: string|null, addressLine2: string|null, addressDisplay, zip, hideExactAddress, utilitiesIncluded, utilitiesNote, utilitiesEstCents, sqft, minTermMonths, flexibleDates, leaseType, roommatesCount, genderPref, petsAllowed, parking, smokingAllowed, amenities: string[], photos: Photo[], availability: Availability[], owner: UserPublic, commute: { walkMin, bikeMin, shuttleMin, nearestStop: {id,name,distanceM}|null }|null, leadCount /* owner only */, expiresAt, moderationStatus /* owner/admin */, boostedUntil, activeBoost?: Boost, bundle?: { id, title, itemCount } };
type WantedCard = { id, title, budgetMinCents, budgetMaxCents, moveInFrom, moveInTo, moveOutDate, groupSize, bedroomsMin, furnishedPref, status, scope, campusId, campus, areas: Area[], matchCount, createdAt, author: UserPublic };
type Wanted = WantedCard & { description, flexibleDays, genderPref, hasPets, needsParking, propertyTypes: string[], mustHaves: string[], niceToHaves: string[], offerCount, viewCount, expiresAt };
type Area = { id, label, kind: 'circle'|'city'|'campus', lat?, lng?, radiusM?, city?, state?, campusId? };
type Match = { id, wantedId, listingId, score, breakdown: Record<string,number>, status, offeredByHost, conversationId, computedAt, listing?: ListingCard, wanted?: WantedCard };
type Conversation = { id, kind, title, campusId, context: ContextCard|null, members: (UserPublic & { role, lastReadAt })[], lastMessage: Message|null, lastMessageAt, unreadCount, muted: boolean, archived: boolean, isLocked, scamBannerDismissed, createdAt };
type ContextCard = { type: 'listing'|'wanted'|'market_item'|'buddy_post'|'escrow', id, title, subtitle?, priceCents?, imageUrl?, link, status? };
type Message = { id, conversationId, senderId: string|null, sender?: UserPublic, kind, body, image?: Upload, context?: ContextCard|Record<string,unknown>, clientId, replyToId, editedAt, deletedAt, createdAt, readBy?: string[] };
type Notification = { id, kind, title, body, link, entityType, entityId, data, readAt, createdAt };
type ShuttleRoute = { id, campusId, name, shortName, color, description, polyline: [number,number][], serviceDays: string[], firstDeparture, lastDeparture, headwayMin, officialUrl, isApproximate, isActive, stops: (ShuttleStop & { sequence, minutesFromStart })[] };
type ShuttleStop = { id, campusId, name, nameZh, code, lat, lng, address, routes?: Pick<ShuttleRoute,'id'|'name'|'shortName'|'color'>[] };
type ShuttleAlert = { id, campusId, routeId, severity, title, titleZh, body, bodyZh, startsAt, endsAt, isActive };
type ItemCard = { id, title, category, condition, priceCents, isFree, obo, coverUrl, photoCount, status, campusId, campus, pickupLabel, pickupLat, pickupLng /* rounded to 3 decimals unless seller/admin */, distanceToCampusM: number|null, city, state, wishlistCount, createdAt, seller: UserPublic, sponsored, boostTier?, wishlisted?: boolean, bundleId };
type Item = ItemCard & { description, originalPriceCents, brand, deliveryOption, photos: Photo[], viewCount, chatCount, soldAt, soldPriceCents, buyerId, expiresAt, bundle?: Bundle, suggestedPrice?: PriceSuggestion };
type Bundle = { id, sellerId, campusId, listingId, title, description, discountPct, moveOutDate, status, itemCount, items?: ItemCard[], listing?: ListingCard, totalCents, bundleCents };
type PriceSuggestion = { suggestedCents, lowCents, highCents, sampleSize, basis: 'campus'|'nationwide' };
type BuddyCard = { id, type, title, startsAt, endsAt, isAllDay, locationName, lat, lng, destinationName, languages, maxMembers, memberCount, verifiedOnly, minTrustLevel, requiresApproval, status, campusId, campus, costSplitCents, createdAt, author: UserPublic, sponsored, boostTier?, myMembership?: { status, role }|null };
type Buddy = BuddyCard & { description, destLat, destLng, conversationId, members: (UserPublic & { status, role, joinedAt })[], events: BuddyEvent[], viewCount };
type BuddyEvent = { id, postId, campusId, startsAt, endsAt, locationName, lat, lng, status, post?: BuddyCard };
type Plan = { id, kind, key, name, nameZh, description, descriptionZh, entityType, tier, durationDays, interval, priceCents, feeBps, feeMinCents, features: string[], isActive, sortOrder };
type Order = { id, kind, status, planId, plan?: Plan, entityType, entityId, subtotalCents, discountCents, creditCents, feeCents, totalCents, promoCode?: string, payment?: Payment, metadata, paidAt, fulfilledAt, createdAt };
type Payment = { id, orderId, provider, providerIntentId, clientSecret, status, amountCents, refundedCents, methodBrand, methodLast4, failureCode, failureMessage, succeededAt, createdAt };
type Boost = { id, entityType, entityId, tier, startsAt, endsAt, status, impressions, clicks, plan?: Plan, entity?: ListingCard|ItemCard|BuddyCard };
type Subscription = { id, planId, plan: Plan, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, cancelledAt, trialEndsAt, paymentMethod?: PaymentMethod };
type PaymentMethod = { id, brand, last4, expMonth, expYear, isDefault };
type Escrow = { id, listingId, listing?: ListingCard, conversationId, payer: UserPublic, payee: UserPublic, amountCents, feeBps, feeCents, feePayer, status, moveInDate, inspectionHours, inspectionDeadlineAt, fundedAt, releasedAt, refundedAt, disputedAt, disputeReason, resolution, resolvedAt, expiresAt, events: { id, fromStatus, toStatus, actorId, note, createdAt }[], actions: string[] /* transitions the caller may perform now */ };
type LedgerEntry = { id, deltaCents, balanceAfterCents, kind, refType, refId, note, expiresAt, createdAt };
type Partner = { id, slug, name, nameZh, category, tagline, taglineZh, description, descriptionZh, logoUrl, websiteUrl, promoText, promoTextZh, isSponsored, campusId, goUrl: '/api/billing/partners/<slug>/go?placement=kit' };
type Poi = { id, campusId, name, nameZh, category, lat, lng, address, url, icon, tags };
type Report = { id, reporterId, reporter?: UserPublic, entityType, entityId, entity?: unknown, campusId, reason, details, status, reviewerId, resolution, reviewedAt, createdAt };
type Lead = { id, listingId, userId, user?: UserPublic, conversationId, source, status, createdAt };
type SavedSearch = { id, module, campusId, scope, name, query: Record<string, unknown>, notify: boolean, lastRunAt, createdAt };
type CampusRequest = { id, userId, schoolName, city, state, email, note, status, createdAt };
type PromoCode = { id, code, kind, value, appliesTo: string[], campusId, maxRedemptions, redeemedCount, perUserLimit, minOrderCents, startsAt, endsAt, isActive, createdAt };
type Event = { id, userId, sessionId, campusId, type, entityType, entityId, props: Record<string, unknown>, path, createdAt };
type AuditEntry = { id, actor: UserPublic|null, actorRole, action, entityType, entityId, before, after, reason, createdAt };
```

---

## 2. Cross-cutting endpoints (scaffold)

### 2.1 `/api/auth`
| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | public | `{ email: z.string().email(), password: z.string().min(8).max(72), name: z.string().min(1).max(60), locale?: 'zh-CN'\|'en', campusId?: string, referralCode?: z.string().length(8) }` | `UserMe` (sets `sid` cookie; `trustLevel` 0; if the email domain matches a campus edu domain, an `edu_verify` code is **auto-sent** and `data.eduCodeSent = true`) | `EMAIL_TAKEN`, `VALIDATION` |
| POST | `/api/auth/login` | public | `{ email, password }` | `UserMe` (sets cookie) | `INVALID_CREDENTIALS`, `BANNED` (login allowed but flagged: returns UserMe with `banned: true`; writes then fail) |
| POST | `/api/auth/logout` | user | – | `{ ok: true, data: null }` (clears cookie) | |
| GET | `/api/auth/me` | user | – | `UserMe` | `UNAUTHORIZED` |
| POST | `/api/auth/request-edu-code` | user | `{ email: z.string().email() }` (the edu address; may differ from login email) | `{ sent: true, expiresInSec: 600, campusId: string\|null, devCode?: string /* only NODE_ENV!=='production' */ }` | `NOT_EDU_EMAIL`, `RATE_LIMITED`, `CONFLICT` (edu email already verified by another user) |
| POST | `/api/auth/confirm-edu-code` | user | `{ email, code: z.string().length(6) }` | `UserMe` (trust ≥ 1, `campusId` set if it was null) | `CODE_INVALID`, `CODE_EXPIRED`, `CODE_ATTEMPTS` |
| POST | `/api/auth/request-password-reset` | public | `{ email }` | `{ sent: true }` (always, no enumeration) | |
| POST | `/api/auth/reset-password` | public | `{ email, code, password }` | `{ ok: true, data: null }` | `CODE_*` |
| POST | `/api/auth/change-password` | user | `{ currentPassword, newPassword }` | `null` | `INVALID_CREDENTIALS` |

### 2.2 `/api/users`
| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/api/users/me` | user | – | `UserMe` (alias of auth/me) |
| PATCH | `/api/users/me` | user | `{ name?, bio?: max 500, avatarUploadId?: string\|null, locale?, campusId?: string\|null, phone?: E.164 (sets phone, clears phoneVerifiedAt), wechatId?, gender?, gradYear?: int 2000..2040, program?, languages?: string[], verifiedOnlyMessaging?: boolean, emailDigestOptIn?: boolean }` | `UserMe` (also sets `campus` cookie when campusId changes; logs `campus.switch`) |
| GET | `/api/users/:id` | public | – | `UserPublic & { stats: { activeListings, itemsSold, buddyHosted, memberSince }, trustProfile: { eduVerified, idVerified, phoneVerified, paymentOnFile, verifiedAt: {...} } }` |
| POST | `/api/users/:id/report` | user | `{ reason: ReportReason, details?: max 1000 }` | `Report` |
| DELETE | `/api/users/me` | user | `{ password }` | `null` (soft delete: `deleted_at`, email suffixed, sessions invalid) |

Blocking is owned by chat (`/api/chat/blocks`, §5). A user's public listings / items are `GET /api/listings?ownerId=` and `GET /api/market/items?sellerId=` (the campus filter is skipped when an owner / seller id is given), so the scaffold never renders module cards itself.

### 2.3 `/api/campuses`
| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/api/campuses` | public | `q?: string (name/short/city match), state?: string, near?: 'lat,lng', limit?: int ≤ 100 (default 100), activeOnly?: boolean=true` | `Campus[]` (ordered: `near` distance → `q` rank → `sort_order`, `intl_students DESC`) |
| GET | `/api/campuses/:idOrSlug` | public | – | `Campus & { stats: { activeListings, activeWanted, activeItems, openBuddy, shuttleRoutes } }` |
| GET | `/api/campuses/suggest?lat=&lng=` | public | (declared before `/:idOrSlug`) | `{ suggested: Campus\|null, nearest: (Campus & { distanceM })[] }` (see DATA_MODEL §9.3) |
| POST | `/api/campuses/requests` | public | `{ schoolName: max 120, city?, state?, email?, note? }` | `{ id }` |

### 2.4 `/api/uploads`
| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| POST | `/api/uploads` | user | `multipart/form-data`: `file` (1..10 files; field repeatable), `purpose` (UploadPurpose, default `other`), `private` ('1'/'0'; forced 1 for `verification`) | `Upload[]` | `UPLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA` |
| GET | `/api/uploads/:id` | owner/admin for private, public otherwise | | `Upload` |
| GET | `/api/uploads/:id/file` | owner/admin | | binary stream (private files) |
| DELETE | `/api/uploads/:id` | owner | | `null` (refuses `409 CONFLICT` if referenced by a published listing/item photo) |
Public files are served statically from `/uploads/*` (Express static with 1-day cache) — the web proxies `/uploads` to the server.

### 2.5 `/api/notifications`
| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/api/notifications` | user | `page,pageSize, unreadOnly?: boolean, kind?: string` | `Paginated<Notification> & { unreadCount }` |
| GET | `/api/notifications/unread-count` | user | | `{ notifications: number, messages: number }` |
| POST | `/api/notifications/:id/read` | user | | `Notification` |
| POST | `/api/notifications/read-all` | user | `{ before?: ISO }` | `{ updated: number }` |
| DELETE | `/api/notifications/:id` | user | | `null` |

### 2.6 `/api/search` (global)
| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/api/search` | public | `q: min 1 max 80` + ScopeQuery + `types?: csv of listing,wanted,item,buddy,campus,user (default all but user), limit?: ≤10 per type` | `{ listings: ListingCard[], wanted: WantedCard[], items: ItemCard[], buddy: BuddyCard[], campuses: Campus[], users: UserPublic[], counts: Record<type, number> }` |
| GET | `/api/search/suggest` | public | `q, campusId?` | `{ suggestions: { type, id, label, sublabel, link }[] }` (max 8; cities, campuses, neighborhoods, titles) |
| GET | `/api/search/saved` | user | `module?: SavedSearchModule` | `SavedSearch[]` |
| POST | `/api/search/saved` | user | `{ module: SavedSearchModule, campusId?, scope?: 'campus'\|'nationwide', name?: max 60, query: record (the list endpoint's query params), notify?: boolean }` (max 20 per user) | `SavedSearch` (feeds the nightly digest, DATA_MODEL §10) |
| DELETE | `/api/search/saved/:id` | owner | | `null` |

### 2.7 `/api/meta`
| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/meta` | public | `{ enums: Record<string,string[]> (every enum in DATA_MODEL §4), amenities: { key, icon }[], categories: { key, icon }[], buddyTypes: { key, icon }[], flags: Record<string, boolean\|unknown> (public flags only), limits: { uploadMaxBytes, pageSizeMax, listingQuotaFree }, plans: Plan[] (active), brand: { name, nameZh }, version }` (Cache-Control 5 min) |
| GET | `/api/meta/health` | public | `{ status: 'ok', db: true, ws: { clients }, uptimeSec }` |

### 2.8 `/api/events` (analytics beacon)
| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/api/events` | public | `{ events: z.array(z.object({ type: z.string().max(60), entityType?: string, entityId?: string, props?: record (≤1 KB), path?: string, ts?: ISO })).max(50) }` (also accepts `navigator.sendBeacon` text body JSON) | `{ accepted: number }` (204 for beacon) |
Server attaches `user_id`, `campus_id` (from query/cookie), `session_id` (cookie `aid`, set on first visit), `ip_hash`.

### 2.9 `/api/dev` (only when `NODE_ENV !== 'production'`; 404 otherwise)
| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/api/dev/mailbox` | public | `email?: string, phone?: string, limit?: ≤100` | `{ emails: { id, to, subject, body, code, purpose, consumedAt, createdAt }[], sms: { id, to, body, code, purpose, consumedAt, createdAt }[] }` newest first |
| DELETE | `/api/dev/mailbox` | public | | `null` (clears codes) |
| POST | `/api/dev/login-as` | public | `{ email }` | `UserMe` (sets cookie; for Playwright) |
| POST | `/api/dev/seed` | public | `{ modules?: string[] }` | `{ seeded: string[] }` (re-runs seeds; only on `DB_PATH` test DBs) |
| POST | `/api/dev/time` | public | `{ offsetSec }` | `{ now }` (clock offset for jobs/escrow timers in tests) |
Web route `/dev/mailbox` renders the mailbox.

---

## 3. `listings` — `/api/listings`

Sort keys: `recent` (default), `relevance` (default with `q`), `price_asc`, `price_desc`, `distance`, `date` (`available_from ASC`).

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/listings` | public | ScopeQuery + `{ q?: max 80, priceMin?: int cents, priceMax?: int, bedrooms?: csv of 0,1,2,3,'4+', bathroomsMin?: number, propertyType?: csv, listingType?: csv, furnished?: csv, availableFrom?: date (listing available_from ≤ this + 14d), availableTo?: date, minTermMax?: int, genderPref?: 'any'\|'female'\|'male', petsAllowed?: bool, parking?: bool (≠none), utilitiesIncluded?: bool, amenities?: csv (all required), verifiedOnly?: bool (is_verified_listing), nearShuttle?: bool (nearest_stop_m ≤ 400), ownerRole?: 'student'\|'landlord', ownerId?: string (that user's public listings; skips the campus filter), sort?, page?, pageSize?, view?: 'list'\|'pins' }` | `Paginated<ListingCard>` + `scope`; `view=pins` returns `{ pins: { id, lat, lng, priceCents, boostTier?, isVerifiedListing }[], total }` (≤500, no pagination) | `BAD_REQUEST` |
| GET | `/api/listings/mine` | user | `status?: csv, page, pageSize` | `Paginated<Listing>` (owner fields incl. `leadCount`, `viewCount`, `activeBoost`) | |
| GET | `/api/listings/saved` | user | `page,pageSize` | `Paginated<ListingCard>` | |
| GET | `/api/listings/:id` | public | – | `Listing` (owner/admin get exact address + moderation fields; logs `listing.view` once per 6 h per viewer; increments `view_count` accordingly). Draft/removed/hidden → `NOT_FOUND` for non-owners | |
| POST | `/api/listings` | trust≥0 (draft) | `ListingInput` (below) | `Listing` (`status: 'draft'`) | `VALIDATION` |
| PATCH | `/api/listings/:id` | owner | `Partial<ListingInput>` | `Listing` (re-geocodes when address fields change; recomputes commute; triggers match recompute if active) | |
| POST | `/api/listings/:id/publish` | owner, trust≥1 | – | `Listing` (`active`) | `TRUST_REQUIRED`, `QUOTA_EXCEEDED`, `VALIDATION` (needs ≥1 photo, lat/lng, price) , `INVALID_STATE` |
| POST | `/api/listings/:id/pause` | owner | – | `Listing` | `INVALID_STATE` |
| POST | `/api/listings/:id/resume` | owner | – | `Listing` | |
| POST | `/api/listings/:id/rented` | owner | `{ closeBundle?: boolean }` | `Listing` | |
| POST | `/api/listings/:id/renew` | owner | – | `Listing` (`expires_at` +30 d, `active`) | |
| DELETE | `/api/listings/:id` | owner | – | `null` (`removed`) | |
| PUT | `/api/listings/:id/photos` | owner | `{ photos: { uploadId, caption? }[] }` (1..20; order = array order; replaces set) | `Photo[]` | |
| PUT | `/api/listings/:id/amenities` | owner | `{ amenities: string[] }` | `string[]` | |
| GET | `/api/listings/:id/availability` | public | | `{ availableFrom, availableTo, ranges: Availability[] }` | |
| PUT | `/api/listings/:id/availability` | owner | `{ ranges: { startDate, endDate, status, note? }[] }` (replaces) | `Availability[]` | `VALIDATION` (overlaps) |
| POST | `/api/listings/:id/save` | user | – | `{ saved: true, saveCount }` | `CONFLICT` idempotent → still 200 |
| DELETE | `/api/listings/:id/save` | user | – | `{ saved: false, saveCount }` | |
| POST | `/api/listings/:id/report` | user | `{ reason, details? }` | `Report` | |
| GET | `/api/listings/:id/share` | public | | `{ url, title, text, qrSvg }` | |
| POST | `/api/listings/:id/contact` | user, trust≥1 | `{ message?: max 1000 }` | `{ conversationId }` (calls chat `openConversation` with listing context + context card, inserts `listing_leads`, logs `listing.contact_click`/`chat.start`) | `BLOCKED`, `VERIFIED_ONLY`, `QUOTA_EXCEEDED`, `TRUST_REQUIRED` |
| GET | `/api/listings/:id/leads` | owner (Pro or admin; non-Pro gets first 3 + `locked: true`) | `page,pageSize,status?` | `Paginated<{ id, user: UserPublic, conversationId, source, status, createdAt }> & { locked }` | |
| PATCH | `/api/listings/:id/leads/:leadId` | owner | `{ status }` | lead | |
| GET | `/api/listings/:id/stats` | owner | `days?: 7\|30\|90` | `{ views: {date,count}[], saves, leads, contactRate, boostImpressions, boostClicks, rankHint: 'top10'\|'top50'\|'other' }` (non-Pro: totals only, `locked: true` for series) | |
| GET | `/api/listings/:id/similar` | public | `limit?: ≤6` | `ListingCard[]` (same campus, ±25 % price, ±1 bedroom) | |
| GET | `/api/listings/stats/campus` | public | `campusId` | `{ activeCount, medianPriceCents, p25, p75, byBedrooms: {bedrooms, median, count}[] }` | |

```ts
const ListingInput = z.object({
  title: z.string().min(4).max(120),
  description: z.string().max(5000).default(''),
  listingType: z.enum(ListingType).default('sublet'),
  propertyType: z.enum(PropertyType).default('apartment'),
  campusId: z.string().optional(),                      // auto-suggested if omitted
  address: z.object({ line1: z.string().min(3).max(120), line2: z.string().max(60).optional(), city: z.string().min(1).max(80), state: z.string().length(2), zip: z.string().regex(/^\d{5}(-\d{4})?$/).optional() }),
  lat: z.number().optional(), lng: z.number().optional(), geocodePrecision: z.enum(GeocodePrecision).optional(), // manual pin
  hideExactAddress: z.boolean().default(true),
  neighborhood: z.string().max(60).optional(),
  priceCents: z.number().int().min(0).max(5_000_000),
  depositCents: z.number().int().min(0).default(0),
  utilitiesIncluded: z.boolean().default(false), utilitiesNote: z.string().max(200).optional(), utilitiesEstCents: z.number().int().optional(),
  bedrooms: z.number().min(0).max(10), bathrooms: z.number().min(0.5).max(10), sqft: z.number().int().positive().optional(),
  furnished: z.enum(Furnished).default('none'),
  availableFrom: z.string().date(), availableTo: z.string().date().nullable().optional(),
  minTermMonths: z.number().int().min(1).max(24).default(1), flexibleDates: z.boolean().default(false),
  leaseType: z.enum(LeaseType).default('sublease'),
  roommatesCount: z.number().int().min(0).max(10).default(0),
  genderPref: z.enum(GenderPref).default('any'), petsAllowed: z.boolean().default(false),
  parking: z.enum(Parking).default('none'), smokingAllowed: z.boolean().default(false),
  amenities: z.array(z.string()).max(40).optional(),
  photos: z.array(z.object({ uploadId: z.string(), caption: z.string().max(120).optional() })).max(20).optional(),
});
```

---

## 4. `wanted` — `/api/wanted`

Sort keys: `recent` (default), `budget_desc`, `budget_asc`, `move_in` (`move_in_from ASC`), `relevance`.

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/wanted` | public | ScopeQuery + `{ q?, budgetMin?, budgetMax? (post budget range intersects), moveInFrom?: date, moveInTo?: date, groupSize?: int, bedroomsMin?, furnishedPref?, genderPref?, hasPets?: bool, sort?, page, pageSize }` | `Paginated<WantedCard>` + `scope` | |
| GET | `/api/wanted/mine` | user | | `Paginated<Wanted>` | |
| GET | `/api/wanted/:id` | public | | `Wanted` (+ `myOffer?: { matchId, conversationId }` when viewer is a host who offered) | |
| POST | `/api/wanted` | user, trust≥1 | `WantedInput` | `Wanted` (`active`; computes matches synchronously, ≤ 300 candidates) | `TRUST_REQUIRED` |
| PATCH | `/api/wanted/:id` | owner | `Partial<WantedInput>` | `Wanted` (recomputes matches) | |
| POST | `/api/wanted/:id/pause` / `resume` / `fulfilled` / `extend` | owner | – | `Wanted` | `INVALID_STATE` |
| DELETE | `/api/wanted/:id` | owner | | `null` | |
| PUT | `/api/wanted/:id/areas` | owner | `{ areas: AreaInput[] }` (≤5) | `Area[]` | |
| GET | `/api/wanted/:id/matches` | owner | `minScore?: int (default 50), status?: csv, page, pageSize` | `Paginated<Match & { listing: ListingCard }>` sorted score desc | |
| POST | `/api/wanted/:id/matches/recompute` | owner | | `{ count }` | `RATE_LIMITED` (1/min) |
| POST | `/api/wanted/:id/matches/:listingId/seen` | owner | | `Match` | |
| POST | `/api/wanted/:id/matches/:listingId/dismiss` | owner | | `Match` | |
| POST | `/api/wanted/:id/matches/:listingId/contact` | owner, trust≥1 | `{ message? }` | `{ conversationId, match }` (opens chat with listing card; `status='contacted'`) | `BLOCKED`, `VERIFIED_ONLY` |
| POST | `/api/wanted/:id/offer` | user (host), trust≥1 | `{ listingId: string (must be caller's active listing), message?: max 1000 }` | `{ conversationId, match }` (upserts match `offered`, `offered_by_host=1`; inserts `listing_leads(source='wanted_offer')`; notification `wanted.offer` to seeker) | `FORBIDDEN` (not your listing), `CONFLICT` (already offered this listing) |
| GET | `/api/wanted/matches/for-me` | user | `limit?: ≤20` | `{ byWanted: { wanted: WantedCard, matches: (Match & { listing: ListingCard })[] }[] }` ("Matches for you" panel: all my active wanted posts, top 5 each, score ≥ 50) | |
| GET | `/api/wanted/matches/for-listing/:listingId` | listing owner | | `(Match & { wanted: WantedCard })[]` | |
| GET | `/api/wanted/digest/preview` | user | | `{ subject, items: { wanted, matches }[], generatedAt }` (digest placeholder rendering) | |
| POST | `/api/wanted/:id/report` | user | `{ reason, details? }` | `Report` | |

```ts
const AreaInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('circle'), label: z.string().max(60), lat: z.number(), lng: z.number(), radiusM: z.number().int().min(200).max(30000) }),
  z.object({ kind: z.literal('city'), label: z.string().max(60), city: z.string(), state: z.string().length(2) }),
  z.object({ kind: z.literal('campus'), label: z.string().max(60), campusId: z.string() }),
]);
const WantedInput = z.object({
  title: z.string().min(4).max(120), description: z.string().max(3000).default(''),
  campusId: z.string().optional(), scope: z.enum(['campus','nationwide']).default('campus'),
  budgetMinCents: z.number().int().min(0).default(0), budgetMaxCents: z.number().int().min(1),
  moveInFrom: z.string().date(), moveInTo: z.string().date(), moveOutDate: z.string().date().nullable().optional(),
  flexibleDays: z.number().int().min(0).max(60).default(0),
  groupSize: z.number().int().min(1).max(10).default(1), bedroomsMin: z.number().min(0).default(0),
  furnishedPref: z.enum(['any','partial','full']).default('any'), genderPref: z.enum(GenderPref).default('any'),
  hasPets: z.boolean().default(false), needsParking: z.boolean().default(false),
  propertyTypes: z.array(z.enum(PropertyType)).default([]),
  mustHaves: z.array(z.string()).max(15).default([]), niceToHaves: z.array(z.string()).max(15).default([]),
  areas: z.array(AreaInput).max(5).default([]),
}).refine(w => w.budgetMaxCents >= w.budgetMinCents && w.moveInTo >= w.moveInFrom);
```

---

## 5. `chat` — `/api/chat`

Realtime delivery is via WebSocket (`docs/WS_EVENTS.md`); every REST write also publishes the corresponding WS event. All conversation endpoints require membership (`left_at IS NULL`) → else `NOT_FOUND`.

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/chat/conversations` | user | `{ page, pageSize, archived?: bool=false, kind?: csv, unreadOnly?: bool, q?: max 80 (title/member name), updatedSince?: ISO }` | `Paginated<Conversation>` sorted `last_message_at DESC` + `{ totalUnread }` | |
| POST | `/api/chat/conversations` | user, trust≥1 | `{ userId: string, context?: { type: ContextType, id: string }, message?: { kind: 'text'\|'image', body?, uploadId?, clientId? } }` | `Conversation` (dedup via `direct_key`; `created: boolean`; posts context card on creation) | `BLOCKED`, `VERIFIED_ONLY`, `BANNED`, `QUOTA_EXCEEDED` (daily new-conversation cap), `NOT_FOUND` (user) |
| GET | `/api/chat/conversations/:id` | member | | `Conversation` | |
| GET | `/api/chat/conversations/:id/messages` | member | `{ before?: messageId (older page), after?: messageId (newer, for polling), limit?: ≤100 default 50 }` | `{ items: Message[] (ascending), hasMore: boolean, oldestId, newestId }` | |
| POST | `/api/chat/conversations/:id/messages` | member | `{ kind: 'text'\|'image', body?: max 4000 (required for text), uploadId?: string (required for image), clientId?: uuid, replyToId? }` | `Message` (idempotent on `clientId` → returns existing) | `FORBIDDEN` (locked, left), `BLOCKED`, `QUOTA_EXCEEDED` (daily cap by trust: 0→0 outbound to new, 1→50, 2→200, 3→unlimited) |
| POST | `/api/chat/conversations/:id/read` | member | `{ messageId?: string (default newest) }` | `{ unreadCount: 0, lastReadMessageId }` (publishes `chat.read`) | |
| POST | `/api/chat/conversations/:id/typing` | member | `{ typing: boolean }` | `null` (polling fallback for typing; WS preferred) | |
| PATCH | `/api/chat/conversations/:id` | member | `{ archived?: bool, mutedUntil?: ISO\|null, scamBannerDismissed?: bool }` | `Conversation` | |
| POST | `/api/chat/conversations/:id/leave` | member (group) | | `null` (system message `member_left`) | `INVALID_STATE` (direct) |
| POST | `/api/chat/conversations/:id/members` | owner/admin of group | `{ userIds: string[] }` | `Conversation` | |
| DELETE | `/api/chat/conversations/:id/members/:userId` | owner/admin of group | | `Conversation` | |
| DELETE | `/api/chat/messages/:id` | sender (≤ 10 min) or admin | | `Message` (`deletedAt`, body nulled; publishes `chat.message` with `deleted: true`) | |
| PATCH | `/api/chat/messages/:id` | sender (≤ 10 min) | `{ body }` | `Message` | |
| POST | `/api/chat/messages/:id/report` | member | `{ reason, details? }` | `Report` | |
| GET | `/api/chat/search` | user | `{ q: min 2 max 80, conversationId?, page, pageSize }` | `Paginated<Message & { conversation: Pick<Conversation,'id'\|'title'\|'members'> }>` | |
| GET | `/api/chat/sync` | user | `{ since: ISO }` | `{ conversations: Conversation[] (updated since), messages: Message[] (created since, across my conversations, ≤ 500), reads: { conversationId, userId, lastReadMessageId, readAt }[], presence: { userId, online }[], now: ISO }` (polling fallback; see WS doc) | |
| GET | `/api/chat/unread-count` | user | | `{ total: number }` | |
| GET | `/api/chat/presence?userIds=a,b,c` | user | | `{ [userId]: { online: boolean, lastSeenAt: ISO\|null } }` | |
| POST | `/api/chat/blocks/:userId` | user | `{ reason?: max 200 }` | `{ blocked: true }` (archives shared direct conversations for the blocker; idempotent) | `NOT_FOUND`, `BAD_REQUEST` (self) |
| DELETE | `/api/chat/blocks/:userId` | user | | `{ blocked: false }` | |
| GET | `/api/chat/blocks` | user | | `UserPublic[]` | |

Server-side service exports (not HTTP) used by other modules, in `server/src/modules/chat/service.ts`: `openConversation({ initiatorId, recipientId, context?, firstMessage? })`, `openGroupConversation({ ownerId, title, context, memberIds })`, `postSystemMessage(conversationId, event, data)`, `postContextCard(conversationId, senderId, card)`. Chat agent must keep these signatures stable (they are referenced by listings/wanted/market/buddy/billing).

---

## 6. `verify` — `/api/verify`

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/verify/status` | user | | `{ trustLevel, steps: { edu: { done, email, at }, id: { done, at, request?: VerificationRequest (latest) }, phone: { done, phone, at }, payment: { done, at, method?: PaymentMethod } }, nextStep, badges }` | |
| POST | `/api/verify/edu/request` | user | `{ email }` | same as `/api/auth/request-edu-code` (both routes call the scaffold's `lib/eduVerify.ts`; verify only adds the UI) | |
| POST | `/api/verify/edu/confirm` | user | `{ email, code }` | `UserMe` | |
| POST | `/api/verify/id` | user, trust≥1 | `{ type: 'student_id'\|'passport'\|'government_id'\|'landlord_proof', frontUploadId: string, backUploadId?: string, selfieUploadId?: string, fullName: z.string().min(2).max(80), docNumberLast4?: z.string().length(4), campusId? }` (uploads must be `purpose='verification'`, owned by caller) | `VerificationRequest` (`pending`; no admin notification — admins poll the queue) | `CONFLICT` (open request of same type exists), `TRUST_REQUIRED` |
| GET | `/api/verify/id` | user | | `VerificationRequest[]` (mine, newest first) | |
| DELETE | `/api/verify/id/:id` | owner | | `VerificationRequest` (`cancelled`) | `INVALID_STATE` |
| POST | `/api/verify/phone/request` | user | `{ phone: E.164 }` | `{ sent: true, expiresInSec: 300, devCode? }` | `RATE_LIMITED`, `CONFLICT` (phone used by another verified account) |
| POST | `/api/verify/phone/confirm` | user | `{ code }` | `UserMe` | `CODE_*` |
| GET | `/api/verify/profile/:userId` | public | | `{ user: UserPublic, trust: { level, eduVerified, eduDomain (masked: 'u.northwestern.edu'), idVerified, idType, phoneVerified, paymentOnFile, memberSince }, stats: { listings, itemsSold, buddyHosted, responseRate? } }` (public trust profile page) | |

The "verified-only messaging" switch writes `PATCH /api/users/me { verifiedOnlyMessaging }` (scaffold); the audit explorer is `GET /api/admin/audit` (§12).
| GET | `/api/verify/admin/queue` | admin | `{ status?: csv (default pending,in_review), type?: csv, campusId?, q? (name/email), page, pageSize, sort?: 'oldest'\|'newest' }` | `Paginated<VerificationRequest & { user: UserPublic & { email }, front: Upload, back?: Upload, selfie?: Upload }>` | |
| GET | `/api/verify/admin/requests/:id` | admin | | same item + `history: AuditEntry[]` | |
| POST | `/api/verify/admin/requests/:id/claim` | admin | | `VerificationRequest` (`in_review`, reviewer=me) | `INVALID_STATE` |
| POST | `/api/verify/admin/requests/:id/approve` | admin | `{ note?: string }` | `VerificationRequest` (user id_verified_at, trust recompute, notification, audit) | |
| POST | `/api/verify/admin/requests/:id/reject` | admin | `{ reason: z.string().min(3).max(500), note? }` | `VerificationRequest` | |
| POST | `/api/verify/admin/users/:userId/trust` | admin | `{ trustLevel: 0..3, reason: string }` | `UserMe-ish` (override; audit `user.trust_override`) | |

```ts
type VerificationRequest = { id, userId, campusId, type, frontUploadId, backUploadId, selfieUploadId, fullName, docNumberLast4, status, reviewerId, reason, submittedAt, reviewedAt };
```

---

## 7. `map` — `/api/map`

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/map/geocode` | user (rate 30/min) | `{ q: min 3 max 200, near?: 'lat,lng', limit?: ≤5 }` | `{ results: { lat, lng, displayName, addressLine1, city, state, zip, precision, campusSuggestion?: { suggested: Campus\|null, nearest: (Campus & {distanceM})[] } }[], cached: boolean }` | `UPSTREAM` (then UI offers manual pin) |
| GET | `/api/map/reverse` | user | `{ lat, lng }` | `{ displayName, addressLine1, city, state, zip, precision }` | |
| GET | `/api/map/commute` | public | `{ lat, lng, campusId }` | `{ distanceM, walkMin, bikeMin, shuttleMin, nearestStop: { id, name, lat, lng, distanceM }\|null, campus: { id, name, lat, lng } }` | |
| GET | `/api/map/pois` | public | `{ campusId, category?: csv, bbox?, q? }` | `Poi[]` (≤ 500) | |
| GET | `/api/map/explore` | public | `{ campusId, bbox: required, layers: csv of listings,items,buddy,shuttle,pois (default all), priceMin?, priceMax?, category?, buddyType?, dateFrom?, dateTo? }` | `{ listings: Pin[], items: Pin[], buddy: Pin[], shuttleStops: ShuttleStop[], shuttleRoutes: Pick<ShuttleRoute,'id'\|'name'\|'color'\|'polyline'>[], pois: Poi[], counts }` where `Pin = { id, type, lat, lng, title, priceCents?, subtitle?, imageUrl?, boostTier?, link }` (each layer ≤ 300; listings pins fuzzed) | `BAD_REQUEST` (bbox > 2°) |
| GET | `/api/map/campus/:id/bounds` | public | | `{ center: {lat,lng}, bbox, defaultZoom, radiusM }` | |
| POST | `/api/map/admin/pois` | admin | `PoiInput` | `Poi` | |
| PATCH | `/api/map/admin/pois/:id` | admin | `Partial<PoiInput>` | `Poi` | |
| DELETE | `/api/map/admin/pois/:id` | admin | | `null` | |
| DELETE | `/api/map/admin/geocode-cache` | admin | `{ olderThanDays? }` | `{ deleted }` | |

```ts
const PoiInput = z.object({ campusId: z.string(), name: z.string().max(120), nameZh: z.string().max(120).optional(), category: z.enum(PoiCategory), lat: z.number(), lng: z.number(), address: z.string().max(200).optional(), url: z.string().url().optional(), icon: z.string().optional(), tags: z.array(z.string()).default([]), sortOrder: z.number().int().default(0) });
```
Web exports (map agent, `web/src/components/map/**`): `MapView`, `PricePin`, `ClusterLayer`, `DrawSearchControl`, `useGeocode()`, `useCommute()`, `CommuteBadge`, `AddressInput` (geocode + manual pin). Other modules consume only these.

---

## 8. `shuttle` — `/api/shuttle`

All reads are campus-scoped by `campusId` (required unless implied by `:id`).

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/shuttle/campus/:campusId` | public | | `{ campus: Pick<Campus,'id'\|'name'\|'hasShuttle'\|'shuttleOfficialUrl'\|'timezone'>, routes: ShuttleRoute[], stops: ShuttleStop[], alerts: ShuttleAlert[] (active now), serviceDayToday, nowLocal: 'HH:MM', hasData: boolean, request?: { status } (if the caller requested) }` | |
| GET | `/api/shuttle/routes` | public | `{ campusId, activeOnly?: bool=true }` | `ShuttleRoute[]` (without stops detail) | |
| GET | `/api/shuttle/routes/:id` | public | | `ShuttleRoute` (with ordered stops + polyline) | |
| GET | `/api/shuttle/routes/:id/timetable` | public | `{ serviceDay?: ServiceDay (default today), date?: date }` | `{ route, serviceDay, stops: ShuttleStop[], trips: { tripIndex, departures: { stopId, time }[] }[] }` | |
| GET | `/api/shuttle/stops` | public | `{ campusId, bbox?, near?: 'lat,lng', radiusM?: ≤3000 }` | `ShuttleStop[]` (+ `distanceM` when `near`) | |
| GET | `/api/shuttle/stops/:id` | public | | `ShuttleStop & { routes: ShuttleRoute[] (summary), alerts }` | |
| GET | `/api/shuttle/stops/:id/next` | public | `{ limit?: ≤10 (default 5), at?: ISO (default now in campus tz) }` | `{ stop, serviceDay, departures: { routeId, routeName, routeColor, time: 'HH:MM', inMinutes: number, tripIndex }[], alerts: ShuttleAlert[] }` | |
| GET | `/api/shuttle/nearby` | public | `{ lat, lng, campusId, radiusM?: ≤1500 (default 800), limit?: ≤5 }` | `{ stops: (ShuttleStop & { distanceM, walkMin, routes })[] }` (used by listings' "near shuttle stop" + commute) | |
| GET | `/api/shuttle/alerts` | public | `{ campusId, includeInactive?: bool (admin) }` | `ShuttleAlert[]` | |
| GET | `/api/shuttle/favorites` | user | | `{ stops: ShuttleStop[], routes: ShuttleRoute[] }` | |
| PUT | `/api/shuttle/favorites/:entityType/:id` | user | | `{ favorited: true }` | |
| DELETE | `/api/shuttle/favorites/:entityType/:id` | user | | `{ favorited: false }` | |
| POST | `/api/shuttle/requests` | public | `{ campusId, email?: email, officialUrl?: url, note?: max 500 }` | `{ id, status }` | `CONFLICT` (campus already has data → still accepted with `status:'done'`) |
| GET | `/api/shuttle/admin/alerts` | admin | `{ campusId? , page, pageSize }` | `Paginated<ShuttleAlert>` | |
| POST | `/api/shuttle/admin/alerts` | admin | `{ campusId, routeId?: string\|null, severity, title, titleZh?, body?, bodyZh?, startsAt?: ISO, endsAt?: ISO\|null }` | `ShuttleAlert` (notification `shuttle.alert` to users of that campus who favorited the route/stop; audit) | |
| PATCH | `/api/shuttle/admin/alerts/:id` | admin | partial + `isActive` | `ShuttleAlert` | |
| DELETE | `/api/shuttle/admin/alerts/:id` | admin | | `null` | |
| GET | `/api/shuttle/admin/requests` | admin | `{ status?, page, pageSize }` | `Paginated<{ id, campus, userId, email, officialUrl, note, status, createdAt }>` | |
| PATCH | `/api/shuttle/admin/requests/:id` | admin | `{ status }` | request | |

Server-side export for other modules: `nearestStop(campusId, lat, lng) → { stop, distanceM } | null` (used by listings and map commute).

---

## 9. `market` — `/api/market`

Sort keys: `recent` (default), `relevance`, `price_asc`, `price_desc`, `distance`, `popular` (`wishlist_count DESC`).

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/market/items` | public | ScopeQuery + `{ q?, category?: csv, condition?: csv, priceMin?, priceMax?, free?: bool, obo?: bool, delivery?: 'pickup'\|'delivery', status?: 'active'\|'reserved'\|'all' (default active+reserved), sellerId?, bundleId?, sort?, page, pageSize, view?: 'list'\|'pins' }` | `Paginated<ItemCard>` + `scope` | |
| GET | `/api/market/items/mine` | user | `{ status?, page, pageSize }` | `Paginated<Item>` | |
| GET | `/api/market/items/:id` | public | | `Item` (+ `similar: ItemCard[]` ≤ 6; logs `item.view`) | |
| POST | `/api/market/items` | user, trust≥1 | `ItemInput` | `Item` (`active` unless `draft: true`) | |
| PATCH | `/api/market/items/:id` | owner | `Partial<ItemInput>` | `Item` | |
| POST | `/api/market/items/:id/publish` / `reserve` / `unreserve` / `renew` | owner | – | `Item` | `INVALID_STATE` |
| POST | `/api/market/items/:id/sold` | owner | `{ buyerId?: string, soldPriceCents?: int }` | `Item` | |
| DELETE | `/api/market/items/:id` | owner | | `null` | |
| PUT | `/api/market/items/:id/photos` | owner | `{ photos: { uploadId }[] }` (≤ 10) | `Photo[]` | |
| POST | `/api/market/items/:id/contact` | user, trust≥1 | `{ message?: max 1000, offerCents?: int }` | `{ conversationId }` ("buy via chat": opens conversation with item context card; `chat_count++`; logs `item.contact_click`) | `BLOCKED`, `VERIFIED_ONLY` |
| POST | `/api/market/items/:id/wishlist` | user | | `{ wishlisted: true, wishlistCount }` | |
| DELETE | `/api/market/items/:id/wishlist` | user | | `{ wishlisted: false, wishlistCount }` | |
| GET | `/api/market/wishlist` | user | `page,pageSize` | `Paginated<ItemCard & { priceAtAddCents, priceDropCents: number\|null }>` (DATA_MODEL §3.7) | |
| POST | `/api/market/items/:id/report` | user | `{ reason, details? }` | `Report` | |
| GET | `/api/market/price-suggestion` | user | `{ category, condition, campusId?, title? }` | `PriceSuggestion` | |
| GET | `/api/market/bundles` | public | ScopeQuery + `{ page, pageSize, status? }` | `Paginated<Bundle>` | |
| GET | `/api/market/bundles/:id` | public | | `Bundle & { items: ItemCard[], listing?: ListingCard, seller: UserPublic }` | |
| POST | `/api/market/bundles` | user, trust≥1 | `{ title: max 120, description?: max 2000, listingId?: string (must be caller's listing), discountPct?: 0..100, moveOutDate?: date, itemIds?: string[] (caller's items), campusId? }` | `Bundle` | `FORBIDDEN` (listing not yours) |
| PATCH | `/api/market/bundles/:id` | owner | partial | `Bundle` | |
| PUT | `/api/market/bundles/:id/items` | owner | `{ itemIds: string[] }` (replaces membership) | `Bundle` | |
| POST | `/api/market/bundles/:id/close` | owner | | `Bundle` | |
| DELETE | `/api/market/bundles/:id` | owner | | `null` (items unlinked, not deleted) | |
| GET | `/api/market/bundles/for-listing/:listingId` | public | | `Bundle\|null` (shown on listing detail as "Move-out sale") | |
| GET | `/api/market/categories` | public | | `{ key, icon, count (active in campus) }[]` with `campusId` | |

```ts
const ItemInput = z.object({
  title: z.string().min(2).max(120), description: z.string().max(3000).default(''),
  campusId: z.string().optional(), category: z.enum(MarketCategory), condition: z.enum(ItemCondition).default('good'),
  priceCents: z.number().int().min(0).max(1_000_000).default(0), isFree: z.boolean().default(false), obo: z.boolean().default(false),
  originalPriceCents: z.number().int().optional(), brand: z.string().max(60).optional(),
  pickupLabel: z.string().max(80).optional(), pickupLat: z.number().optional(), pickupLng: z.number().optional(),
  city: z.string().max(80).optional(), state: z.string().length(2).optional(),
  deliveryOption: z.enum(DeliveryOption).default('pickup'),
  bundleId: z.string().nullable().optional(),
  photos: z.array(z.object({ uploadId: z.string() })).max(10).optional(),
  draft: z.boolean().default(false),
}).refine(i => i.isFree || i.priceCents > 0 || i.category === 'free');
```

---

## 10. `buddy` — `/api/buddy`

Sort keys: `upcoming` (default: `starts_at ASC` nulls last), `recent`, `relevance`, `distance`.

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/buddy/posts` | public | ScopeQuery (campus only; `city/state` allowed) + `{ q?, type?: csv, dateFrom?: ISO, dateTo?: ISO, timeOfDay?: csv of morning,afternoon,evening,night, language?: csv, verifiedOnly?: bool, hasSpace?: bool (default true), status?: csv (default open,full), sort?, page, pageSize }` | `Paginated<BuddyCard>` + `scope` | |
| GET | `/api/buddy/posts/mine` | user | `{ role?: 'host'\|'member', status? }` | `Paginated<BuddyCard>` ("my groups") | |
| GET | `/api/buddy/posts/:id` | public | | `Buddy` (members list visible to members/host only; others get `memberCount` and avatars of first 3) | |
| POST | `/api/buddy/posts` | user, trust≥1 | `BuddyInput` | `Buddy` (`open`; author becomes `buddy_members(role='host',status='joined')`) | `TRUST_REQUIRED` |
| PATCH | `/api/buddy/posts/:id` | owner | `Partial<BuddyInput>` | `Buddy` (system message `post_updated` to group if exists) | |
| POST | `/api/buddy/posts/:id/close` / `cancel` / `reopen` | owner | `{ reason? }` | `Buddy` | `INVALID_STATE` |
| DELETE | `/api/buddy/posts/:id` | owner | | `null` | |
| POST | `/api/buddy/posts/:id/join` | user, trust ≥ post.minTrustLevel if verifiedOnly else ≥1 | `{ note?: max 300 }` | `{ membership: { status, role }, conversationId: string\|null }` (`joined` or `pending`; creates/extends group chat on `joined`; notification `buddy.join` to host) | `TRUST_REQUIRED`, `QUOTA_EXCEEDED` (full), `INVALID_STATE` (not open), `BLOCKED`, `CONFLICT` (already joined) |
| POST | `/api/buddy/posts/:id/leave` | member | | `null` | |
| GET | `/api/buddy/posts/:id/members` | host/member | `{ status? }` | `(UserPublic & { status, role, note, joinedAt })[]` | |
| POST | `/api/buddy/posts/:id/members/:userId/approve` / `decline` / `remove` | owner | `{ reason? }` | membership | |
| GET | `/api/buddy/posts/:id/events` | public | | `BuddyEvent[]` | |
| PUT | `/api/buddy/posts/:id/events` | owner | `{ events: { startsAt: ISO, endsAt?: ISO, locationName?, lat?, lng? }[] }` (≤ 20, replaces scheduled) | `BuddyEvent[]` | |
| GET | `/api/buddy/calendar` | public | `{ campusId, from: date, to: date (≤ 62 days), type?: csv, mine?: bool }` | `{ events: (BuddyEvent & { post: BuddyCard })[] }` (implicit events from posts with `starts_at` + explicit `buddy_events`) | |
| GET | `/api/buddy/safety` | public | | `{ rules: { zh: string[], en: string[] }, version }` (safety rules shown before join; content from i18n, endpoint lets admin override later) | |
| POST | `/api/buddy/posts/:id/report` | user | `{ reason, details? }` | `Report` | |

```ts
const BuddyInput = z.object({
  type: z.enum(BuddyType), title: z.string().min(2).max(120), description: z.string().max(3000).default(''),
  campusId: z.string().optional(),
  startsAt: z.string().datetime().nullable().optional(), endsAt: z.string().datetime().nullable().optional(), isAllDay: z.boolean().default(false),
  locationName: z.string().max(120).optional(), lat: z.number().optional(), lng: z.number().optional(),
  destinationName: z.string().max(120).optional(), destLat: z.number().optional(), destLng: z.number().optional(),
  languages: z.array(z.enum(['zh','en','ko','ja','es','other'])).default(['zh','en']),
  maxMembers: z.number().int().min(2).max(50).default(4),
  verifiedOnly: z.boolean().default(false), minTrustLevel: z.number().int().min(0).max(3).default(1),
  requiresApproval: z.boolean().default(false), costSplitCents: z.number().int().min(0).optional(),
  events: z.array(z.object({ startsAt: z.string().datetime(), endsAt: z.string().datetime().optional(), locationName: z.string().optional(), lat: z.number().optional(), lng: z.number().optional() })).max(20).optional(),
});
```

---

## 11. `billing` — `/api/billing`

Everything is mock Stripe in test mode. All checkout UI must show "Test mode · no real charges". Feature flags gate each surface (`boosts.enabled`, `pro.enabled`, `escrow.enabled`, `affiliate.enabled`) → `FEATURE_DISABLED`.

### 11.1 Catalog, pricing page, wallet
| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/api/billing/plans` | public | `{ kind?: PlanKind, entityType? }` | `Plan[]` (active, sorted) |
| GET | `/api/billing/pricing` | public | | `{ boosts: { entityType, tiers: { tier, plans: Plan[] }[] }[], pro: Plan[], escrow: Plan, kit: { partnerCount }, faq: i18n keys }` |
| GET | `/api/billing/wallet` | user | `{ page, pageSize }` | `{ balanceCents, expiringSoonCents, expiringAt, entries: Paginated<LedgerEntry> }` |
| GET | `/api/billing/payment-methods` | user | | `PaymentMethod[]` |
| POST | `/api/billing/payment-methods` | user | `{ cardNumber: 13..19 digits, expMonth: 1..12, expYear: ≥ now, cvc: 3..4 digits, name?: string, setDefault?: bool }` | `PaymentMethod` (stores brand/last4 only; mock token; sets `users.payment_verified_at`; trust recompute) | `VALIDATION` (Luhn), `PAYMENT_FAILED` (test decline numbers) |
| DELETE | `/api/billing/payment-methods/:id` | owner | | `null` (trust recompute; refuses `CONFLICT` if an active subscription uses it) |
| POST | `/api/billing/payment-methods/:id/default` | owner | | `PaymentMethod` |
| POST | `/api/billing/promo/validate` | user | `{ code, orderKind?, planId?, subtotalCents? }` | `{ valid: true, kind, value, discountCents, description }` | `PROMO_INVALID` |
| POST | `/api/billing/promo/redeem` | user | `{ code }` (only `wallet_credit` kind; others apply at checkout) | `{ creditedCents, balanceCents }` | `PROMO_INVALID` |

### 11.2 Orders & checkout (mock Stripe)
| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| POST | `/api/billing/orders` | user (trust per kind, see DATA_MODEL §5) | `{ kind: 'boost'\|'subscription'\|'escrow_deposit'\|'wallet_topup', planId?: string, entityType?, entityId? (boost target: must be caller's), escrowId? (for escrow_deposit), amountCents? (topup, 500..50000), promoCode?: string, useWallet?: boolean=true }` | `Order` (`awaiting_payment` with `payment` `requires_payment_method`; or `fulfilled` immediately when wallet covers total; logs `checkout.start`) | `FORBIDDEN`, `TRUST_REQUIRED`, `PROMO_INVALID`, `FEATURE_DISABLED`, `INVALID_STATE` (escrow not `accepted`) |
| GET | `/api/billing/orders` | user | `{ page, pageSize, kind?, status? }` | `Paginated<Order>` | |
| GET | `/api/billing/orders/:id` | owner | | `Order` | |
| POST | `/api/billing/orders/:id/pay` | owner | `{ paymentMethodId?: string } \| { card: { cardNumber, expMonth, expYear, cvc, name?, save?: boolean } }` | `Order` (`fulfilled` on success → boost/subscription/escrow applied; logs `checkout.pay` + `checkout.success|fail`) | `PAYMENT_FAILED { failureCode }`, `INVALID_STATE` |
| POST | `/api/billing/orders/:id/cancel` | owner | | `Order` | `INVALID_STATE` |
| POST | `/api/billing/mock-stripe/webhook` | public (dev) | `{ type: 'payment_intent.succeeded'\|'payment_intent.payment_failed', intentId }` | `{ received: true }` (simulates async outcome; same handler as `/pay`) | |

### 11.3 Boosts
| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/api/billing/boosts` | user | `{ status?, page, pageSize }` | `Paginated<Boost & { entity }>` |
| GET | `/api/billing/boosts/options` | user | `{ entityType, entityId }` | `{ entity, plans: Plan[], currentBoost: Boost\|null, estimatedReach: { dailyViews, multiplier }, eligible: boolean, reason?: string }` |
| POST | `/api/billing/boosts/:id/cancel` | owner | | `Boost` (`cancelled`; prorated wallet refund) |
| GET | `/api/billing/boosts/:id/stats` | owner | | `{ impressions, clicks, ctr, daily: {date, impressions, clicks}[] }` |
| GET | `/api/billing/boosts/sponsored` | public (internal use by list endpoints via service, but exposed for the home page sponsored slot) | `{ entityType, campusId, city?, state?, limit?: ≤6, tier?: 'max' }` | `{ items: (ListingCard\|ItemCard\|BuddyCard)[] }` (logs impressions) |
Service export: `pickSponsored({ entityType, campusId, city, state, excludeIds, slots }) → { id, tier }[]` and `recordImpressions(boostIds[])` — used by listings/market/buddy list endpoints to fill sponsored slots per DATA_MODEL §8.

### 11.4 Landlord Pro
| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/billing/subscription` | user | | `{ subscription: Subscription\|null, isPro, proUntil, perks: string[] }` | |
| POST | `/api/billing/subscription` | user, trust≥3 | `{ planId: 'pro.monthly'\|'pro.yearly' key or id, paymentMethodId?: string, trial?: boolean (7-day trial once per user) }` | `{ subscription, order: Order }` (order fulfilled → `active|trialing`) | `TRUST_REQUIRED`, `CONFLICT` (already subscribed), `PAYMENT_FAILED` |
| POST | `/api/billing/subscription/cancel` | owner | `{ immediately?: boolean=false }` | `Subscription` | |
| POST | `/api/billing/subscription/resume` | owner | | `Subscription` (clears cancel_at_period_end) | |
| POST | `/api/billing/subscription/change-plan` | owner | `{ planId }` | `Subscription` (takes effect next period) | |
| GET | `/api/billing/subscription/invoices` | owner | | `Order[]` (kind subscription*) | |
| GET | `/api/billing/pro/analytics` | user (Pro) | `{ days?: 7\|30\|90 }` | `{ listings: { id, title, views, saves, leads, contactRate }[], totals, series: {date, views, leads}[], topSources }` (non-Pro → `403 FORBIDDEN` with `data: { upsell: 'pro' }`) | |
| GET | `/api/billing/pro/leads` | user (Pro) | `{ status?, listingId?, page, pageSize }` | `Paginated<Lead & { listing: ListingCard, user: UserPublic, conversation: Pick<Conversation,'id'\|'lastMessage'> }>` (lead inbox) | |

### 11.5 Escrow
| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/billing/escrows` | user | `{ role?: 'payer'\|'payee', status?, page, pageSize }` | `Paginated<Escrow>` | |
| GET | `/api/billing/escrows/:id` | party or admin | | `Escrow` | |
| GET | `/api/billing/escrows/quote` | user | `{ amountCents, feePayer? }` | `{ amountCents, feeBps, feeCents, payerTotalCents, payeeNetCents }` | |
| POST | `/api/billing/escrows` | user, trust≥2 (payee) or trust≥3 (payer); flag | `{ listingId, counterpartyId, role: 'payer'\|'payee' (caller's role), amountCents: 10000..1000000, feePayer?: 'payer'\|'payee'\|'split' (default payer), moveInDate: date, inspectionHours?: 24..168 (default 48), note?: max 500 }` | `Escrow` (`proposed`; context card + system message in the listing conversation; notification `escrow.state`) | `TRUST_REQUIRED`, `FEATURE_DISABLED`, `CONFLICT` (open escrow already exists for pair+listing) |
| POST | `/api/billing/escrows/:id/accept` | counterparty | | `Escrow` (`accepted`) | `INVALID_STATE` |
| POST | `/api/billing/escrows/:id/fund` | payer, trust≥3 | `{ paymentMethodId? \| card }` | `{ escrow, order }` (creates+pays `escrow_deposit` order → `funded`) | `PAYMENT_FAILED`, `TRUST_REQUIRED` |
| POST | `/api/billing/escrows/:id/release` | payer | `{ note? }` | `Escrow` (`released`; payee wallet credit) | |
| POST | `/api/billing/escrows/:id/refund` | payee | `{ note? }` | `Escrow` (`refunded`) | |
| POST | `/api/billing/escrows/:id/dispute` | payer | `{ reason: min 10 max 2000, evidenceUploadIds?: string[] (kept in the `escrow_events` row's `data_json`) }` | `Escrow` (`disputed`) | |
| POST | `/api/billing/escrows/:id/cancel` | either party | `{ reason? }` | `Escrow` | `INVALID_STATE` (only proposed/accepted) |
| POST | `/api/billing/escrows/:id/resolve` | admin | `{ resolution: 'release_to_payee'\|'refund_to_payer'\|'split', payeeCents?: int, payerCents?: int, note: string }` | `Escrow` (`resolved`; audit `escrow.resolve`) | |

### 11.6 Referrals & Newcomer Kit
| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/api/billing/referrals` | user | | `{ code, shareUrl: '/?ref=CODE', rewardCents, stats: { invited, qualified, rewarded, earnedCents }, referrals: { user: UserPublic (name masked 'Al***'), status, createdAt, rewardedAt }[] }` |
| GET | `/api/billing/partners` | public | `{ category?: csv, campusId?, state? }` | `{ categories: { key, label, partners: Partner[] }[] }` (nationwide partners + campus/state-specific; `isSponsored` label; order `sort_order`) |
| GET | `/api/billing/partners/:slug` | public | | `Partner & { description }` |
| GET | `/api/billing/partners/:slug/go` | public | `{ placement?: ClickPlacement, campusId? }` | **302 redirect** to `affiliate_url` (inserts `partner_clicks`, logs `affiliate.click`). Sets `rel="sponsored"` semantics in UI anchor. |
| POST | `/api/billing/partners/:slug/converted` | public (dev/mock postback) | `{ clickId, payoutCents? }` | `{ ok }` |

### 11.7 Billing admin (consumed by admin module UI)
| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/api/billing/admin/revenue` | admin | `{ from: date, to: date, campusId?, groupBy?: 'day'\|'week'\|'month' }` | `{ totals: { revenueCents, byKind: Record<orderKind, cents>, gmvCents (escrow funded), affiliateEstCents, refundsCents }, series: { date, revenueCents, boostCents, proCents, escrowFeeCents, affiliateCents, gmvCents }[], topCampuses: { campus, revenueCents }[] }` |
| GET | `/api/billing/admin/orders` | admin | `{ q?, kind?, status?, userId?, from?, to?, page, pageSize }` | `Paginated<Order & { user: UserPublic }>` |
| POST | `/api/billing/admin/orders/:id/refund` | admin | `{ amountCents?: int, reason: string }` | `Order` (audit) |
| GET | `/api/billing/admin/escrows` | admin | `{ status? (default disputed), page, pageSize }` | `Paginated<Escrow>` |
| GET/POST/PATCH | `/api/billing/admin/plans[/:id]` | admin | `PlanInput` | `Plan` (audit `plan.update`) |
| GET/POST/PATCH | `/api/billing/admin/promo-codes[/:id]` | admin | `{ code: 3..20 upper alnum, kind, value, appliesTo?: string[], campusId?, maxRedemptions?, perUserLimit?, minOrderCents?, startsAt?, endsAt?, isActive? }` | `PromoCode & { redeemedCount }` |
| GET/POST/PATCH/DELETE | `/api/billing/admin/partners[/:id]` | admin | `PartnerInput` (all partner columns camelCase; `logoUploadId`) | `Partner & { clickCount, payoutModel, payoutCents, affiliateUrl }` |
| GET | `/api/billing/admin/partners/:id/clicks` | admin | `{ from?, to?, groupBy? }` | `{ total, converted, estCents, series }` |
| POST | `/api/billing/admin/wallet/:userId/adjust` | admin | `{ deltaCents: int ≠ 0, note: string }` | `LedgerEntry` (audit) |

---

## 12. `admin` — `/api/admin`

Admin shell reuses module admin endpoints above (verify queue, shuttle alerts, billing admin, map POIs). The admin module itself owns:

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/api/admin/overview` | admin | `{ campusId? }` | `{ today: { dau, signups, listingsPublished, matches, messages, revenueCents, openReports, pendingVerifications, disputedEscrows }, deltas7d: same keys with % change }` |
| GET | `/api/admin/kpis` | admin | `{ from: date, to: date, campusId?, groupBy?: 'day'\|'week' }` | `{ series: { date, dau, wau, signups, listingsActive, listingsPublished, wantedActive, matches, itemsActive, buddyOpen, messages, gmvCents, revenueCents, boostCents, affiliateClicks }[], funnels: { listing: { views, contactClicks, chatsStarted }, checkout: { starts, pays, successes, fails }, verification: { signups, eduVerified, idSubmitted, idApproved } }, byCampus: { campus, dau, listingsActive, revenueCents }[] }` |
| GET | `/api/admin/users` | admin | `{ q? (name/email), role?, trustLevel?, campusId?, banned?: bool, sort?: 'recent'\|'active'\|'name', page, pageSize }` | `Paginated<UserMe-like (admin view incl. email, phone, banned, counts: { listings, items, reports, orders })>` |
| GET | `/api/admin/users/:id` | admin | | user admin view + `recentEvents`, `reportsAgainst`, `audit` |
| PATCH | `/api/admin/users/:id` | admin | `{ role?: Role, banned?: boolean, bannedReason?: string, campusId?, listingQuota?: int, reason: string }` | user (audit `user.ban|user.role|user.quota`; ban closes active listings/items/posts to `paused`, locks conversations). Trust overrides go through `POST /api/verify/admin/users/:userId/trust` only |
| POST | `/api/admin/users/:id/impersonate` | admin (dev only) | | `UserMe` (sets cookie; audit) |
| GET | `/api/admin/reports` | admin | `{ status? (default open), entityType?, reason?, campusId?, page, pageSize }` | `Paginated<Report & { entity: summary card, reporter: UserPublic, reportCountForEntity }>` |
| GET | `/api/admin/reports/:id` | admin | | `Report` with full entity + history |
| PATCH | `/api/admin/reports/:id` | admin | `{ status: 'in_review'\|'actioned'\|'dismissed', resolution?: string, action?: { type: 'hide'\|'remove'\|'ban_user'\|'warn_user'\|'lock_conversation'\|'delete_message'\|'none', reason: string } }` | `Report` (applies action, audit `report.action`, notification `report.actioned` to reporter) |
| GET | `/api/admin/listings` | admin | `{ q?, status?, moderationStatus?, campusId?, ownerId?, flaggedOnly?: bool, page, pageSize, sort? }` | `Paginated<Listing & { owner: UserPublic & { email }, reportCount }>` |
| PATCH | `/api/admin/listings/:id/moderation` | admin | `{ moderationStatus: 'ok'\|'flagged'\|'hidden', note?: string, reason: string }` | `Listing` (audit `listing.hide|listing.flag|listing.unhide`) |
| PATCH | `/api/admin/moderation/:entityType/:id` | admin | same body | entity (generic for wanted/market_item/buddy_post) |
| GET | `/api/admin/flags` | admin | | `FeatureFlag[]` where `FeatureFlag = { key, enabled, value, description, campusIds, updatedBy, updatedAt }` |
| PUT | `/api/admin/flags/:key` | admin | `{ enabled: boolean, value?: unknown, description?: string, campusIds?: string[] }` | `FeatureFlag` (audit `flag.update`; server flag cache invalidated; WS broadcast `system.flags` to all clients) |
| GET | `/api/admin/audit` | admin | `{ action?, actorId?, entityType?, entityId?, from?, to?, page, pageSize }` | `Paginated<AuditEntry>` (DTO in §1.6) |
| GET | `/api/admin/campuses` | admin | `{ q?, page, pageSize }` | `Paginated<Campus & { stats }>` |
| PATCH | `/api/admin/campuses/:id` | admin | `Partial<Campus>` (name, eduDomains, hasShuttle, shuttleOfficialUrl, defaultRadiusM, isActive, sortOrder) | `Campus` (audit) |
| GET | `/api/admin/campus-requests` | admin | `{ status?, page, pageSize }` | `Paginated<CampusRequest>` |
| PATCH | `/api/admin/campus-requests/:id` | admin | `{ status }` | `CampusRequest` |
| GET | `/api/admin/events` | admin | `{ type?, userId?, entityType?, entityId?, from?, to?, page, pageSize }` | `Paginated<Event>` (raw explorer, ≤ 7-day window) |
| GET | `/api/admin/export/:table.csv` | admin | `{ from?, to? }` | CSV stream (allowed tables: `events`, `orders`, `payments`, `partner_clicks`, `listings`, `users` (no password_hash)) |

Server-side helper for all admins writes: `audit(req, { action, entityType, entityId, before, after, reason })` in `server/src/lib/audit.ts`.

---

### Appendix A — Web proxy & ports
Vite dev proxies `/api`, `/uploads`, `/ws` → `VITE_API_TARGET` (default `http://localhost:4000`). Module agents run server with `PORT=41xx DB_PATH=server/data/test-<key>.db` and web with `VITE_PORT=51xx VITE_API_TARGET=http://localhost:41xx`.

### Appendix B — Request helper contract (web)
`web/src/lib/api.ts` exports `api<T>(path, { method, body, query, signal })` → unwraps envelope, throws `ApiError { code, message, fields, data, status }`; sets `X-Requested-With`, `credentials: 'include'`, JSON body, and `Accept-Language` from the `lang` cookie. React Query keys: `[module, resource, params]`.

### Appendix C — Cross-module services (scaffold-owned, read-only for module agents)

The helpers below live in `server/src/lib/**` (full signatures and examples in `docs/SERVER.md` §3). Module agents import them; they never edit them (request changes under "Integration requests" in `docs/modules/<key>.md`).

| Need | Import | Notes |
|---|---|---|
| Open / reuse a conversation, post a context card / system message | `openConversation`, `postMessage`, `postContextCard`, `postSystemMessage`, `contextCardFor`, `markConversationRead` from `lib/conversations.ts` | Shared primitives on the chat tables; they publish the WS_EVENTS §5.2 frames. The chat module's `modules/chat/service.ts` wraps them with block / verified-only / quota checks (the signatures other modules call). |
| Sponsored slots in a list | `pickSponsored`, `mergeSponsored`, `sponsoredSlotCount`, `recordImpressions`, `recordClick`, `activeBoostFor` from `lib/sponsored.ts` | DATA_MODEL §8 slot rules (2 per 10, positions 1 and 6; home block of 8 → 1). Re-exported by `modules/billing/service.ts`. |
| Nearest shuttle stop / commute | `nearestStop(lat, lng, campusId)`, `commuteEstimate(campusId, lat, lng)` from `lib/shuttle.ts` | Returns `null` when the campus has no stop within 3 km. Re-exported by `modules/shuttle/service.ts`. |
| Geocoding & campus scoping | `geocode`, `suggestCampus`, `scopeFromQuery`, `whereScope`, `scopeInfo`, `haversineM`, `haversineSql`, `bboxAround`, `fuzz` from `lib/geo.ts` | `scopeFromQuery` implements §1.4 / DATA_MODEL §9.1 precedence (bbox > lat/lng > city/state > campusId from query → user → cookie); `whereScope` builds the SQL every list endpoint appends; `geocode` = cache → Nominatim → campus-centroid fallback (`approx: true`). |
| Bell notifications | `notify(userId, kind, { title, body, link, entityType, entityId, data })` from `lib/notify.ts` | Inserts the row and publishes `notification` to the user; titles localized to the recipient's locale. |
| Analytics events | `logEvent(req, type, { entityType, entityId, props })`, `recentlyLogged(...)` from `lib/events.ts` | BRIEF §6.4 instrumentation; `view_count` dedupe helper. |
| Audit log | `audit(req, { action, entityType, entityId, before, after, reason })` from `lib/audit.ts` | Every admin write; positional form for jobs. |
| Trust | `recomputeTrust(userId)`, `setTrustOverride(...)`, `badgesFor(user)` from `lib/trust.ts` | The only writer of `users.trust_level`. |
| Reports | `createReport(req, { entityType, entityId, reason, details, campusId })` from `lib/reports.ts` | Every `/report` endpoint. |
| Cards | `listingCards`, `wantedCards`, `itemCards`, `buddyCards`, `toUserPublic`, `toCampusLite` from `lib/cards.ts` | One mapper per card so list endpoints and global search never diverge. |
| Edu verification | `requestEduCode`, `confirmEduCode` from `lib/eduVerify.ts`; `sendSmsCode`, `verifySmsCode` from `lib/mailbox.ts` | `/api/verify/edu/*` are aliases of the auth endpoints. |
| Feature flags | `isEnabled(key, campusId)`, `requireFlag(key)` (`lib/flags.ts`, `lib/auth.ts`) | Missing row = enabled. |
| Realtime | `publish`, `publishTopic`, `publishRole`, `registerHandler`, `registerTopicGuard` from `realtime/hub.ts` | WS_EVENTS §9. |
| Hooks | `hooks.on('user.trustChanged' \| 'user.registered' \| …)` from `lib/hooks.ts` | e.g. billing qualifies referrals when trust reaches 1. |
