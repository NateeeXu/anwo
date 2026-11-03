# Billing module — implementation requirements

> For the `billing` engineer. Source of truth for prices and rules: `docs/BUSINESS_PLAN.md` §2–§3. Tables, enums, state machines and routes are the architect's: `docs/DATA_MODEL.md` §3.9 / §6.6–6.10 / §8, `server/src/db/schema.sql`, `docs/API.md` §11. This file adds the seed data, the exact business rules, the additive migration you own (`server/src/db/migrations/18_billing.sql`), the mock-checkout UX and the screens. Where this file and `API.md` differ (noted inline), this file wins and you list the change under "Integration requests" in `docs/modules/billing.md`.
>
> Conventions (BRIEF §5): money in **integer cents USD**, ISO-8601 UTC timestamps, `{ ok, data | error }` envelopes, zod on every body, `requireAuth` / `requireTrust(n)` / `requireFlag(key)`, i18n via `useT()` for every string, campus-aware rows (`campus_id` on every revenue-bearing row). The platform is **nationwide**: nothing may be hard-coded to Northwestern; seed data must cover ≥ 3 campuses (Northwestern rich, UIUC and NYU lighter).

---

## 0. Scope checklist

| Area | Must ship |
|---|---|
| Catalog | `pricing_plans` seed (§1), `GET /api/billing/plans`, `GET /api/billing/pricing` |
| Boosts | purchase flow (§2), placement service `pickSponsored()` / `recordImpressions()` per DATA_MODEL §8, Nationwide Spotlight add-on, bundle boost, "Moving out" pack, owner stats, cancel with prorated credit |
| Landlord Pro | subscription flow (§3), trial, renewals job, perks (listing quota, lead inbox, analytics, badge, monthly boost credit), Founding Landlord promo |
| Secure Payment | `escrows` state machine (§4) with fee math, rails, eligibility, refunds, disputes, system messages, auto-release job; flag-gated per campus/state |
| Newcomer Kit | `partners` seed (§5), categories page, tracked outbound redirect, conversion import, "done" checklist |
| Referrals & promos | rules in §6; `IGNITE-<CAMPUS>`, `FOUNDING50`, founding-sponsor codes |
| Wallet | ledger rules in §7; nightly expiry |
| Mock Stripe | §8 UX, test cards, webhook simulator, `BILLING_LIVE` switch design |
| Analytics | events in §9 written to `events` |
| Screens | §10 |
| Admin-facing | billing admin routes (`API.md` §11.7) + the additive tables the admin dashboard reads (§11) |

---

## 1. `pricing_plans` seed rows

Seed ids are fixed UUID-shaped strings so re-seeding is idempotent (`seed_meta.key='billing'`, bump `version` to re-seed). `key` is the stable reference used in code and promo `applies_to_json`; never reference a plan by name. All `features_json` entries are i18n keys under `billing.features.*`.

| id | key | kind | entity_type | tier | duration_days | interval | price_cents | fee_bps / min / cap | name (en) | name_zh | sort | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `b1110000-0000-4000-8000-000000000001` | `boost.listing.basic.3d` | boost | listing | basic | 3 | — | 900 | — | Boost · 3 days | 推广 · 3 天 | 10 | min_trust 1 |
| `…0002` | `boost.listing.basic.7d` | boost | listing | basic | 7 | — | 1900 | — | Boost · 7 days | 推广 · 7 天 | 11 | default selection; ignition credit value |
| `…0003` | `boost.listing.basic.14d` | boost | listing | basic | 14 | — | 3900 | — | Boost · 14 days | 推广 · 14 天 | 12 | requires_badge `supply_proof` |
| `…0004` | `boost.listing.basic.30d` | boost | listing | basic | 30 | — | 6900 | — | Boost · 30 days | 推广 · 30 天 | 13 | requires_badge `supply_proof` |
| `…0005` | `boost.listing.plus.7d` | boost | listing | plus | 7 | — | 2900 | — | Boost Plus · 7 days (top of map) | 推广 Plus · 7 天（地图置顶） | 20 | min_trust 2, requires_badge |
| `…0006` | `boost.listing.plus.14d` | boost | listing | plus | 14 | — | 5900 | — | Boost Plus · 14 days | 推广 Plus · 14 天 | 21 | min_trust 2, requires_badge |
| `…0007` | `boost.listing.max.7d` | boost | listing | max | 7 | — | 4900 | — | Boost Max · 7 days (home carousel) | 推广 Max · 7 天（首页轮播） | 30 | min_trust 2, requires_badge |
| `…0008` | `boost.listing.max.14d` | boost | listing | max | 14 | — | 8900 | — | Boost Max · 14 days | 推广 Max · 14 天 | 31 | min_trust 2, requires_badge |
| `…0009` | `boost.listing.spotlight` | service | listing | — | — | — | 1000 | — | Nationwide Spotlight (add-on) | 全美曝光（加购） | 40 | `addon_for='boost.listing.*'`; duration = parent boost |
| `…0010` | `boost.market_item.basic.1d` | boost | market_item | basic | 1 | — | 299 | — | Item boost · 1 day | 二手推广 · 1 天 | 50 | |
| `…0011` | `boost.market_item.basic.3d` | boost | market_item | basic | 3 | — | 499 | — | Item boost · 3 days | 二手推广 · 3 天 | 51 | |
| `…0012` | `boost.market_item.basic.7d` | boost | market_item | basic | 7 | — | 999 | — | Item boost · 7 days | 二手推广 · 7 天 | 52 | |
| `…0013` | `boost.bundle.basic.7d` | boost | market_item | basic | 7 | — | 999 | — | Move-out bundle boost · 7 days | 打包推广 · 7 天 | 53 | target = `market_bundles.id`; fulfilment creates one `boosts` row per item in the bundle, all on the same `order_id` |
| `…0014` | `boost.buddy_post.basic.1d` | boost | buddy_post | basic | 1 | — | 199 | — | Event boost · 1 day | 搭子推广 · 1 天 | 60 | |
| `…0015` | `boost.buddy_post.basic.3d` | boost | buddy_post | basic | 3 | — | 499 | — | Event boost · 3 days | 搭子推广 · 3 天 | 61 | |
| `…0016` | `pack.moving_out` | service | listing | — | — | — | 4400 | — | Moving-out pack (14-day boost + bundle boost) | 搬家打包（14 天推广 + 打包推广） | 70 | fulfils `…0003` + `…0013`; requires a bundle linked to the listing; requires_badge |
| `…0017` | `pro.monthly` | subscription | — | — | — | month | 2900 | — | Landlord Pro · monthly | 房东 Pro · 月付 | 100 | min_trust 3, requires_badge `landlord_proof` |
| `…0018` | `pro.yearly` | subscription | — | — | — | year | 24900 | — | Landlord Pro · yearly | 房东 Pro · 年付 | 101 | same |
| `…0019` | `proplus.monthly` | subscription | — | — | — | month | 7900 | — | Landlord Pro+ · monthly | 房东 Pro+ · 月付 | 110 | same; `seats` 5 in features |
| `…0020` | `proplus.yearly` | subscription | — | — | — | year | 69900 | — | Landlord Pro+ · yearly | 房东 Pro+ · 年付 | 111 | same |
| `…0021` | `escrow.standard` | escrow_fee | — | — | — | — | 0 | 300 / 500 / **6000** | Secure Payment service fee | 安心付服务费 | 200 | cap needs the new `fee_cap_cents` column (§11) |
| `…0022` | `sponsor.local` | service | — | — | 30 | — | 15000 | — | Local Sponsor (per campus / month) | 校园赞助 · 基础 | 300 | admin-invoiced only (not in self-serve checkout) |
| `…0023` | `sponsor.feed` | service | — | — | 30 | — | 35000 | — | Feed Sponsor | 校园赞助 · 首页 | 301 | admin-invoiced |
| `…0024` | `sponsor.campus` | service | — | — | 30 | — | 60000 | — | Campus Partner | 校园赞助 · 合作伙伴 | 302 | admin-invoiced |
| `…0025` | `building.verified` | service | — | — | 30 | — | 50000 | — | Verified Building page | 认证楼盘页 | 310 | admin-invoiced |
| `…0026` | `building.verified.small` | service | — | — | 30 | — | 30000 | — | Verified Building page (≤ 50 beds) | 认证楼盘页（≤50 床位） | 311 | admin-invoiced |
| `…0027` | `building.verified.metro` | service | — | — | 30 | — | 100000 | — | Verified Building · metro-wide | 认证楼盘页 · 全都市圈 | 312 | admin-invoiced |
| `…0028` | `building.lease_fee` | service | — | — | — | — | 30000 | — | Attributed lease fee (12 mo) | 签约归因费（12 个月） | 320 | per event, admin-invoiced |
| `…0029` | `building.lease_fee.short` | service | — | — | — | — | 15000 | — | Attributed lease fee (≤ 6 mo) | 签约归因费（≤6 个月） | 321 | per event |
| `…0030` | `viewing.badge` | service | listing | — | — | — | 2900 | — | Verified Viewing badge | 认证实地看房 | 400 | `is_active = 0` until `viewing.enabled` flag; payout 1800 in features |
| `…0031` | `viewing.private` | service | listing | — | — | — | 3900 | — | Private viewing report | 私人看房报告 | 401 | `is_active = 0`; payout 2500 |

Rules:
- `GET /api/billing/pricing` returns boosts grouped by `entity_type` → `tier` → plans, `pro` (4 plans), `escrow` (with `feeCapCents`), `kit.partnerCount`, and `alwaysFree: string[]` (i18n keys: verification, badges, reporting, scam warnings, browsing, posting, messaging).
- Prices are rows, not constants. Admin edits via `PATCH /api/billing/admin/plans/:id` write `audit_log action='plan.update'` with before/after and a required `reason`.
- `docs/DESIGN.md` §7 shows sample prices ($4.99/$9.99/$16.99); the pricing page must render the API values, not those.

---

## 2. Boost purchase flow

**Entities:** `listing`, `market_item` (incl. bundle target), `buddy_post`. Caller must own the entity (or be admin).

**Eligibility** (`GET /api/billing/boosts/options?entityType&entityId` → `{ eligible, reason, plans, currentBoost, estimatedReach }`); evaluated server-side again at order creation and at fulfilment:

| Check | Rule | `reason` code (i18n key) |
|---|---|---|
| Flag | `boosts.enabled` for the entity's campus | `FEATURE_DISABLED` |
| Trust | `basic` ≥ L1; `plus`/`max` ≥ L2 | `TRUST_REQUIRED` (`nextStep`) |
| Moderation | entity `moderation_status = 'ok'` and status public (`active`; `open` for buddy) | `billing.boost.ineligible.moderation` |
| Supply badge | sublet 14 d / 30 d, `plus`, `max`, `spotlight`, `pack.moving_out` require **`supply_proof`** = an approved `verification_requests` row of type `lease_proof` (new type — integration request to `verify`) **or** `landlord_proof` | `billing.boost.ineligible.lease_proof` → UI shows "Upload your lease page to unlock — reviewed within 24 h" with a deep link to `/verify` |
| Fair housing | whole-unit listing (`shared_living = 0`) must not contain protected-class preference text (reuse the listings FHA linter if exported; else regex list in `billing/fha.ts`) | `billing.boost.ineligible.fha` |
| Reports | entity has < 2 open reports | `billing.boost.ineligible.reported` |
| Add-on | `boost.listing.spotlight` only with a parent listing boost in the same order or an active listing boost | `billing.boost.ineligible.addon` |

**Order creation** `POST /api/billing/orders { kind:'boost', planId, entityType, entityId, addons?: ['boost.listing.spotlight'], promoCode?, useWallet? }` (extend the API body with `addons`): `subtotal = plan.price + Σ addon prices`; apply promo (§6) → `discount_cents`; apply wallet (§7) → `credit_cents`; `total = max(0, subtotal − discount − credit)`; `metadata_json = { addons, nationwide: bool, surface }`. `pack.moving_out` is one order with `plan_id = …0016` and `metadata_json.fulfils = ['boost.listing.basic.14d','boost.bundle.basic.7d']`.

**Fulfilment** (same transaction as payment success): create `boosts` row(s) with `tier`, `starts_at = now` (or `existing.ends_at` if the entity already has a scheduled/active boost — extension rule, DATA_MODEL §6.8), `ends_at = starts_at + duration_days`, `nationwide = 1` when the Spotlight add-on was bought, `campus_id` = entity's campus; bundle → one row per item; emit `boost.started` notification; log `checkout.success`.

**Placement** (`pickSponsored`, consumed by listings/market/buddy list endpoints): DATA_MODEL §8 verbatim — ≤ 2 slots per 10 results at indices 0 and 5; pool = active boosts of the same `entity_type` whose entity passes the caller's filters, same campus, or when `scope=nationwide` same city **or `nationwide = 1`**; order `tier DESC`, `impressions ASC`, random; sponsored items removed from the organic stream for that page; response items carry `sponsored: true, boostTier`; impressions batched to `events` and `boosts.impressions`. Home carousel: `max` only, ≤ 6. Map pins: `plus|max` get the accent bubble and z-index only. **Never** touch match score, text relevance, badges, safety banners or organic order.

**Labelling:** every served sponsored slot renders `Badge variant="boosted"` 「推广 Boosted」 (DESIGN §4.8) in both languages, at every size, never removed on hover; tooltip 「推广房源由发布者付费置顶，审核标准相同。」.

**Cancellation / refunds:**
- Owner cancel (`POST /api/billing/boosts/:id/cancel`): prorated **wallet credit** (`kind='refund'`, 180-day expiry) = `price × remaining_seconds / total_seconds`, floor to cents; add-on prorated the same way.
- Moderation hides/removes the entity: boost → `cancelled`; if the admin marks the action `our_error` → full refund to the original payment (`payments.refunded_cents`, order `refunded`); if `policy_violation` → no refund, note on the order; either way `audit_log` and a `revenue_at_risk` flag while a report is open (2+ open reports → boost `status` stays but `paused_at` set via `metadata_json`; placement skips paused boosts).
- Admin refund (`POST /api/billing/admin/orders/:id/refund`) always allowed with a reason.

**Owner stats** (`GET /api/billing/boosts/:id/stats`): impressions, clicks, CTR, daily series, and `upliftViews` = views during boost ÷ views in the same-length window before.

---

## 3. Landlord Pro subscription flow

- **Plans:** `pro.monthly`, `pro.yearly`, `proplus.monthly`, `proplus.yearly` (§1). Free landlord account = 2 active long-term listings (`users.listing_quota` default 2 for role `landlord`; `null` = unlimited for Pro).
- **Gates:** `requireTrust(3)` **and** approved `landlord_proof` verification. Missing badge → `403 TRUST_REQUIRED` with `data.nextStep = 'landlord_proof'` and the UI shows "Get verified as owner/manager first — it's free".
- **Trial:** **14 days**, once per user, card on file (`API.md` §11.4 says 7 — use 14 and note the change). `subscriptions.status='trialing'`, `trial_ends_at = now + 14 d`, `current_period_end = trial_ends_at`. `renewSubscriptions` job charges at trial end per DATA_MODEL §6.9.
- **Founding Landlord:** promo `FOUNDING50` = `percent_off` 50, `applies_to_json = ['pro.monthly']`, `max_redemptions = 100`, `per_user_limit = 1`, `ends_at = 2027-02-28T23:59:59Z`; the discount persists for 12 renewals (store `metadata_json.promo_renewals_left = 11` on the subscription's last order and decrement in `renewSubscriptions`).
- **Perks on activation / each renewal:** `users.pro_until` cache (trigger); listing quota unlimited; lead inbox (`GET /api/billing/pro/leads`) shows trust badges only — never ID documents; analytics (`GET /api/billing/pro/analytics`); `Badge variant="pro"` 「房东 Pro」 (never styled like a trust badge); **1** wallet credit of 1900 cents (`kind='promo_credit'`, `ref_type='subscription'`, note `pro_monthly_boost`, `expires_at = +60 d`) for Pro, **3** for Pro+; Pro+ adds `seats` 5 (team members listed in `subscriptions` → new table `subscription_seats`, §11), CSV import endpoint `POST /api/listings/import` (integration request to `listings`), lead export CSV.
- **Change plan:** takes effect next period; upgrade to Pro+ mid-period is prorated as a wallet credit of the unused Pro portion.
- **Cancel:** `cancel_at_period_end = 1`; immediate cancel by admin only. **Suspension for a confirmed scam or fair-housing report:** admin cancels now, issues a prorated card refund, writes `audit_log action='subscription.suspend'` with the report id; the Pro badge disappears immediately.
- **Ranking:** Pro listings rank organically; the included boost credit buys a normal labelled boost. Nothing in `pickSponsored` reads `pro_until`.

---

## 4. Secure Payment (`escrows`) — state machine, fee math, refunds

**Naming:** DB/table name stays `escrows`; **every user-facing string says 「安心付 Secure Payment」; the word "escrow" must not appear in any i18n value, email, notification or marketing copy.** Add a unit test that greps `web/src/i18n/billing.ts` values for `/escrow/i` and fails.

**Flag:** `requireFlag('escrow.enabled')` with `campus_ids_json` = campuses in cleared states; off by default. When off, listing detail shows "Secure Payment is coming to <state>" and the mock still runs in the dev DB only when `BILLING_MOCK_ESCROW=true`.

**States** (DATA_MODEL §6.10; transitions not listed → `409 INVALID_STATE`):

```
proposed ──(counterparty accept)──────────────▶ accepted
proposed ──(either cancel | sys expires_at 7d)─▶ cancelled | expired
accepted ──(either cancel before funding)─────▶ cancelled
accepted ──(payer funds; payer L3; payee L3+supply badge)──▶ funded
funded ──(sys: move_in_date reached)──────────▶ in_inspection   (deadline = move_in + inspection_hours, default 48, 24..168)
funded | in_inspection ──(payer "confirm move-in" / release early)──▶ released
in_inspection ──(sys: deadline passed, no dispute)──▶ released
funded | in_inspection ──(payee refund | both agree)──▶ refunded
funded | in_inspection ──(payer dispute, reason ≥ 10 chars)──▶ disputed
disputed ──(admin resolve: release_to_payee | refund_to_payer | split)──▶ resolved
```

**Eligibility:** propose: caller L2, counterparty exists, listing `active`, no open escrow for the same `(listing_id, move_in_date)` (any payer) → `CONFLICT` (blocks double deposits); fund: payer L3 (`requireTrust(3)`), payee L3 **and** `supply_proof` badge — checked at fund time, else `403` with `data.reason='payee_not_eligible'` and a system message to the payee "Verify your lease/ownership to receive Secure Payments". `amount_cents` 10000..1000000.

**Fee math** (plan `escrow.standard`):
```
fee     = clamp(round(amount × 300 / 10000), 500, 6000)
payer   : charge = amount + fee            ; release = amount
payee   : charge = amount                  ; release = amount − fee
split   : payer_fee = ceil(fee/2), payee_fee = floor(fee/2)
          charge = amount + payer_fee      ; release = amount − payee_fee
```
`GET /api/billing/escrows/quote` returns `{ amountCents, feeBps, feeCents, feeCapCents, feePayer, payerTotalCents, payeeNetCents, rail, railFeeCents }` and the UI shows the fee as its own line 「服务费 3%（$33.00）」 before any payment.

**Rails** (new `escrows.rail` column, §11): `ach` (default; required when `amount ≥ 50000`), `card` (allowed < 50000; `card_fee_cents = round(amount × 290/10000) + 30` shown as a separate pass-through line), `alipay` / `wechat_pay` (pass-through ≈ 3%, shown). In the mock, rail only changes the labels and the simulated settlement delay (ACH = `processing` for 60 s via the webhook simulator).

**Money effects (mock):** `funded` = order `kind='escrow_deposit'` succeeded for the charge amount (`orders.subtotal = amount`, `fee_cents = payer share`). `released` = payee wallet credit `kind='topup', ref_type='escrow'` of the release amount (bank payout out of scope in mock; in live mode this is the Stripe Connect transfer). `refunded` = payment refund of `amount` to the payer; **fee kept, except**: cancelled/refunded before `in_inspection` → fee refunded too (`escrow_fee_rebate` ledger row or card refund of the fee). `resolved`: `release_to_payee` = as released; `refund_to_payer` = refund amount **and** fee (`escrow_fee_rebate`) when the admin reason is `fraud | not_on_lease | not_as_described`; `split` = partial refund `resolution_payer_cents` + wallet credit `resolution_payee_cents`, fee kept and split pro rata.

**Timers (`expireContent` hourly):** `proposed → expired` after 7 days; `funded → in_inspection` at `move_in_date 00:00` local campus time; `in_inspection → released` 24 h after the deadline passes with no dispute. Disputes freeze all timers.

**Dispute:** payer only, reason enum in `data_json` (`fraud_listing | not_on_lease | not_as_described | no_access | other`) + free text + `evidenceUploadIds`; 72 h admin first-response SLA (admin dashboard timer); resolution requires a note; every transition appends `escrow_events`, posts a system message to `conversation_id` and a `notification kind='escrow.state'` to both parties (`chat` service exports).

**Off-platform warning:** when a chat message contains `(zelle|venmo|cash ?app|支付宝|alipay|微信支付|wechat pay|gift card|礼品卡)` plus a dollar amount, the chat module shows the scam banner (owned by `chat`); billing exposes `GET /api/billing/escrows/eligibility?listingId` so the banner can add "Pay through Secure Payment instead" when eligible, and logs `escrow.offplatform_warning_shown`.

**Receipts:** both parties get a PDF-less HTML receipt page `/billing/secure/:id/receipt` with amount, fee, rail, timeline.

---

## 5. Newcomer Kit — `partners` seed rows

Categories must use the schema enum (`bank, sim, insurance, movers, storage, airport_pickup, furniture, housing, food, other`); credit cards are `bank` with `rubric_json.subcategory='credit_card'`, money transfer is `other` with `subcategory='transfer'`, Prime Student is `other`. Columns below map 1:1 to `partners` plus the additive columns in §11 (`network`, `no_ssn_ok`, `no_ssn_verified_at`, `rubric_json`, `payout_note`). `affiliate_url` is the tracked outbound template; `{{clickId}}` and `{{campusId}}` are substituted by `GET /api/billing/partners/:slug/go` (the real network links replace these after approval; until then they point at the partner's public page with a `utm_source=campus-sublet` query). `campus_id = NULL` = nationwide unless noted. `promo_text` is the **user-facing bonus**; `tagline` is the pitch; `payout_cents` is our **assumption** (`payout_model='cpa'` unless noted).

| slug | name / name_zh | category | tagline (en) / tagline_zh | promo_text / promo_text_zh (user bonus) | payout_cents | network | no_ssn_ok | affiliate_url template | sort |
|---|---|---|---|---|---|---|---|---|---|
| `chase-college-checking` | Chase College Checking / 大通学生支票账户 | bank | Passport + I-20 accepted at branch; largest ATM network / 凭护照+I-20 即可开户，网点最多 | New-account bonus up to $100–300 (varies) / 新开户奖励最高 $100–300（以官网为准） | 7500 | cj | 1 | `https://www.chase.com/personal/checking/college-checking?utm_source=campus-sublet&subid={{clickId}}` | 10 |
| `bofa-safebalance` | Bank of America Advantage SafeBalance / 美国银行学生账户 | bank | No overdraft fees; campus branches / 无透支费 | Periodic $200–300 bonus / 不定期开户奖励 | 6000 | impact | 1 | `https://www.bankofamerica.com/deposits/checking/advantage-banking/?utm_source=campus-sublet&subid={{clickId}}` | 11 |
| `wells-fargo-clear-access` | Wells Fargo Clear Access Banking / 富国银行 | bank | Open with passport + ITIN or I-20 / 护照+I-20 可开户 | Periodic $300 bonus / 不定期奖励 | 6000 | flexoffers | 1 | `https://www.wellsfargo.com/checking/clear-access-banking/?utm_source=campus-sublet&subid={{clickId}}` | 12 |
| `zolve` | Zolve / Zolve 留学生账户 | bank | Account + credit card before you land, no SSN / 落地前即可开户，无需 SSN | $25–50 welcome / 新用户奖励 | 5000 | direct | 1 | `https://www.zolve.com/?ref=campus-sublet&subid={{clickId}}` | 13 |
| `discover-it-student` | Discover it Student Card / Discover 学生信用卡 | bank (credit_card) | First credit card, cashback match / 第一张信用卡，返现翻倍 | Up to $100 referral credit (verify current terms) / 最高 $100 奖励 | 7500 | cj | 0 | `https://www.discover.com/credit-cards/student-credit-card/?utm_source=campus-sublet&subid={{clickId}}` | 20 |
| `deserve-edu` | Deserve EDU Mastercard / Deserve 留学生信用卡 | bank (credit_card) | No SSN, no credit history needed / 无需 SSN 与信用记录 | $30 welcome / 新卡奖励 | 5000 | direct | 1 | `https://www.deserve.com/edu?ref=campus-sublet&subid={{clickId}}` | 21 |
| `mint-mobile` | Mint Mobile / Mint 手机卡 | sim | T-Mobile network, from $15/mo / T-Mobile 网络，$15 起 | $45–60 referral credit / 推荐返 $45–60 | 2500 | impact | 1 | `https://www.mintmobile.com/?utm_source=campus-sublet&subid={{clickId}}` | 30 |
| `visible` | Visible by Verizon / Visible 手机卡 | sim | Unlimited on Verizon, $25/mo / Verizon 无限流量 | $20 credit each / 双方各 $20 | 2000 | impact | 1 | `https://www.visible.com/?utm_source=campus-sublet&subid={{clickId}}` | 31 |
| `ultra-mobile` | Ultra Mobile / Ultra 手机卡（含中国通话） | sim | Plans with free calls to China / 含免费拨打中国 | — | 1500 | direct | 1 | `https://www.ultramobile.com/?utm_source=campus-sublet&subid={{clickId}}` | 32 |
| `airalo` | Airalo eSIM / Airalo 旅行 eSIM | sim | Data from the moment you land / 落地即有流量 | $3 credit / $3 抵扣 | 500 | direct | 1 | `https://www.airalo.com/?ref=campus-sublet&subid={{clickId}}` | 33 |
| `lemonade-renters` | Lemonade Renters Insurance / Lemonade 租房保险 | insurance | From $5/mo; often required by your lease / $5 起，很多租约要求 | — | 2000 | impact | 1 | `https://www.lemonade.com/renters?utm_source=campus-sublet&subid={{clickId}}` | 40 |
| `toggle-renters` | Toggle (Farmers) / Toggle 租房保险 | insurance | Month-to-month, covers roommates' stuff optionally / 按月付 | — | 1500 | cj | 1 | `https://www.gettoggle.com/?utm_source=campus-sublet&subid={{clickId}}` | 41 |
| `wise` | Wise / Wise 跨境汇款 | other (transfer) | Real exchange rate, CNY→USD / 真实汇率 | Fee-free first transfer up to a cap / 首笔免手续费 | 1500 | direct | 1 | `https://wise.com/?ref=campus-sublet&subid={{clickId}}` | 50 |
| `remitly` | Remitly / Remitly 汇款 | other (transfer) | Fast transfers, mobile first / 到账快 | $5–25 in-app bonus / 应用内奖励 | 2000 | impact | 1 | `https://www.remitly.com/?utm_source=campus-sublet&subid={{clickId}}` | 51 |
| `panda-remit` | Panda Remit / 熊猫速汇 | other (transfer) | CNY→USD with WeChat support / 微信直达客服 | ¥30–50 referral / 推荐返 ¥30–50 | 1000 | direct | 1 | `https://www.pandaremit.com/?ref=campus-sublet&subid={{clickId}}` | 52 |
| `dolly` | Dolly / Dolly 搬运 | movers | On-demand truck + helper for move-out day / 随叫随到搬家 | — | 1500 | impact | 1 | `https://dolly.com/?utm_source=campus-sublet&subid={{clickId}}` | 60 |
| `pods-storage` | PODS Student Storage / PODS 学生仓储 | storage | Summer storage, campus pickup / 暑期寄存 | Student rates / 学生价 | 3000 | impact | 1 | `https://www.pods.com/student-storage?utm_source=campus-sublet&subid={{clickId}}` | 61 |
| `collegeboxes` | Collegeboxes (UPS) / Collegeboxes 寄存 | storage | Door-to-door summer storage / 上门取件 | — | 2000 | direct | 1 | `https://www.collegeboxes.com/?utm_source=campus-sublet&subid={{clickId}}` | 62 |
| `cort-student` | CORT Student Furniture Rental / CORT 学生家具租赁 | furniture | 3-room package from $129/mo / 三房套餐 $129/月起 | Campus delivery perks / 校园配送优惠 | 5000 | direct | 1 | `https://www.cort.com/furniture-rental/how-to-rent-furniture-for-students?utm_source=campus-sublet&subid={{clickId}}` | 70 |
| `amazon-prime-student` | Amazon Prime Student / 亚马逊学生 Prime | other | 6-month free trial / 6 个月免费试用 | Free 6 months / 免费 6 个月 | 300 | amazon | 1 | `https://www.amazon.com/joinstudent?tag={{assocTag}}&subid={{clickId}}` | 80 |
| `chicago-airport-pickup` (campus `northwestern`, also `uchicago`,`uic`,`illinois-tech` via `states_json=['IL']`) | Evanston–ORD Airport Pickup / 芝加哥接机 | airport_pickup | Fixed fares, Chinese-speaking drivers / 一口价，中文司机 | $5 off with code / 优惠码减 $5 | 500 (`payout_model='flat'`, lead fee) | direct | 1 | `https://example-pickup-chicago.test/book?src=campus-sublet&subid={{clickId}}` | 90 |
| `nyc-airport-pickup` (campus `nyu`) | JFK/EWR Pickup / 纽约接机 | airport_pickup | same | — | 500 (flat) | direct | 1 | placeholder | 91 |
| `champaign-airport-shuttle` (campus `uiuc`) | ORD → Champaign Shuttle / 芝加哥—香槟班车 | airport_pickup | Peoria Charter-style shuttle / 机场班车 | — | 500 (flat) | direct | 1 | placeholder | 92 |
| `campus-credit-union` | Campus credit union (non-paying option) / 校园信用社 | bank | Member-owned, no bonus, no referral fee / 无佣金选项 | — | 0, `is_sponsored = 0` | — | 1 | `https://www.mycreditunion.gov/?utm_source=campus-sublet` | 14 |

Rules:
- Every card renders `Badge variant="sponsored"` 「赞助 Sponsored」 and `caption` 「赞助」 inside the card **when `is_sponsored = 1`**; the page header carries the disclosure 「我们可能从合作伙伴获得佣金，不影响你的价格。」 / "We may earn a referral fee. It never changes your price." At least one `is_sponsored = 0` option per category (the credit-union row is the seed example).
- Ordering inside a category: `sort_order` only, maintained by admin from the rubric (no-SSN friendly → fee-free → campus branch → user rating). **The SQL must not reference `payout_cents`.** Admin changes to `sort_order` require a `reason` and write `audit_log action='partner.update'`.
- `GET /api/billing/partners?campusId&state&stage=pre_arrival|arrival|settled` groups by category and merges nationwide + campus/state rows. `stage` filters by `rubric_json.stages` (`before_you_fly`, `first_7_days`, `first_month`).
- Outbound: `GET /api/billing/partners/:slug/go?placement&campusId` inserts `partner_clicks` (`session_id` from the `aid` cookie for anonymous pre-arrival visitors, `ip_hash`, `user_agent`), logs `affiliate.click`, substitutes `{{clickId}}`, 302. Anchors use `rel="sponsored noopener"`.
- Conversions: `POST /api/billing/partners/:slug/converted { clickId, payoutCents? }` (dev postback) and admin CSV import (`POST /api/billing/admin/partners/:id/conversions/import`, §11) set `partner_clicks.converted = 1, converted_at, payout_cents`; conversions without a matching click go to `partner_conversions` (§11) with `click_id NULL`. Rate-limit `/go` to 20 clicks per `ip_hash` per partner per day; flag duplicates on the admin reconciliation screen.
- "Done" checklist: `POST /api/billing/kit/done { slug }` → `events kit.card_done`; persisted per user (anonymous: localStorage), shown as the 「落地第一周」 checklist.
- Pre-arrival share page `/kit/share/:campusId` is public (no login), sets the `aid` cookie, and renders an OG image + QR so WeChat/XHS traffic lands with attribution.
- "No SSN needed" label shows only when `no_ssn_ok = 1` and `no_ssn_verified_at` is within 90 days; otherwise the label is hidden and the admin Kit editor shows a "re-verify" warning.

---

## 6. Referral and promo-code rules

**Referral** (`referrals`, `users.referral_code`, `?ref=CODE`):
1. Signup with a valid code → `referrals(status='pending', qualify_rule='edu_verified', referrer_reward_cents=500, referred_reward_cents=500)`; self-referral and a referrer who is banned → ignored.
2. Referee reaches L1 → `qualified` → in one transaction both wallet rows (`referral_reward` to referrer, `referral_welcome` to referee, `expires_at = +180 d`) → `rewarded`; notification `referral.rewarded`.
3. **Post bonus:** when the referee's first listing/item/buddy post becomes `active` within 30 days of signup (listen for `listing.publish` / `item.publish` / `buddy.publish` events — integration request), the referrer gets a second 500-cent row (`kind='promo_credit'`, `ref_type='referral'`, `note='post_bonus'`), once per referral.
4. **Fraud controls:** max 10 rewarded referrals per referrer per 30 days (further ones stay `qualified` for admin review); referee `ip_hash`/`user_agent` identical to the referrer at signup → `pending` with a fraud flag; edu domain of the referee must belong to a seeded campus; admin `void` reverses both ledger rows with `admin_adjustment` and sets `status='void'`.
5. Referral page shows code, `shareUrl`, QR poster, stats `{ invited, qualified, rewarded, earnedCents }`, masked names.

**Promo codes** (`promo_codes`; stored upper-case; `applies_to_json` = plan keys or kinds; `[]` = any):

| code | kind | value | applies_to | campus | max_redemptions | per_user | ends_at | purpose |
|---|---|---|---|---|---|---|---|---|
| `FOUNDING50` | percent_off | 50 | `['pro.monthly']` | — | 100 | 1 | 2027-02-28 | Founding Landlord; discount carried for 12 renewals (§3) |
| `IGNITE-<CAMPUSID>` (one per campus, e.g. `IGNITE-UIUC`) | wallet_credit | 1900 | `['boost']` | that campus | 100 | 1 | campus leaves `igniting` + 30 d | one free 7-day basic boost for early sublet posters; redeemable only if the user has ≥ 1 active sublet at that campus |
| `SPONSOR50-<CAMPUSID>` | percent_off | 50 | `['sponsor.local','sponsor.feed','sponsor.campus']` | that campus | 3 | 1 | — | founding sponsor rate (applied by admin on invoices) |
| `CSSA-<CAMPUSID>` | wallet_credit | 500 | `['boost']` | that campus | 500 | 1 | — | CSSA co-branded page |
| `WELCOME5` | wallet_credit | 500 | `['boost']` | — | ∞ | 1 | — | optional onboarding credit, off by default (admin enables) |

Rules: `percent_off`/`fixed_off` apply at checkout to the matching plan only (never to `escrow_deposit` amounts; a promo may reduce the **fee** only if `applies_to_json` contains `'escrow.standard'`); `wallet_credit` codes are redeemed on `/wallet` and become `promo_credit` rows with 180-day expiry; `min_order_cents`, `starts_at/ends_at`, `is_active`, `max_redemptions` (trigger-maintained `redeemed_count`) and `per_user_limit` are all enforced server-side; `POST /api/billing/promo/validate` returns `discountCents` for a given `planId/subtotalCents`; every redemption writes `promo_redemptions`; invalid → `PROMO_INVALID` with an i18n reason (`expired | exhausted | not_applicable | campus_mismatch | already_used | min_order`).

---

## 7. Wallet ledger rules

- Append-only `wallet_ledger`; `balance_after_cents` computed inside the same transaction with `BEGIN IMMEDIATE`; `users.wallet_balance_cents` is trigger-maintained — never write it.
- **Credits are boost-only and non-cashable.** Wallet may pay for orders of kind `boost` and (optionally, flag `wallet.pro_allowed`, default off) `subscription`; **never** for `escrow_deposit` amounts or fees. No withdrawal endpoint exists. `topup` rows from Secure Payment releases are the one exception that can be paid out (live mode: Stripe Connect transfer; mock: stays as balance and is labelled "Payout pending — test mode").
- Application order at checkout: oldest-expiring credit first (FIFO by `expires_at`), then non-expiring. `credit_cents = min(balance, subtotal − discount)` when `useWallet` is true (default true; toggle on the checkout screen).
- Kinds: `referral_reward`, `referral_welcome`, `promo_credit` (incl. Pro monthly boost, ignition, CSSA, post bonus — distinguished by `note`), `refund` (prorated boost cancel), `order_payment` (negative), `admin_adjustment` (both signs, requires `note`), `escrow_fee_rebate`, `topup`, `expiry` (negative, nightly `walletExpiry` job for rows past `expires_at`, applied FIFO against remaining unspent credit).
- Expiry: 180 days for all credits except Pro monthly boost credit (60 days). The wallet screen shows `expiringSoonCents` (next 14 days).
- Admin adjustment via `POST /api/billing/admin/wallet/:userId/adjust` writes `audit_log`.
- Reporting: credits issued / redeemed / expired per week per campus feed the admin "credits contra line" (`revenue_cents` in `v_revenue` already excludes wallet-paid amounts because `payments.provider='wallet'` rows carry `amount_cents = 0` for the card part — confirm by filtering `provider='mock_stripe'` for cash).

---

## 8. Mock Stripe checkout UX (test mode)

- Provider `mock_stripe` (`server/src/modules/billing/mockStripe.ts`): `pi_mock_*` intents, test cards `4242 4242 4242 4242` succeed, `4000 0000 0000 0002` → `card_declined`, `4000 0000 0000 9995` → `insufficient_funds`, any other Luhn-valid number succeeds; `POST /api/billing/mock-stripe/webhook` simulates async outcomes (used for ACH `processing`).
- **Every checkout surface carries a `warning-soft` top band 「测试模式 Test mode · 不会真实扣款 / no real charges」** plus the same text in the page `<title>` suffix and in the order receipt. The band is not dismissible.
- Checkout modal/page: order summary (plan name zh/en, duration, add-ons, promo line, wallet-credit line with toggle, fee lines for Secure Payment, total), saved payment methods (brand + last4 only) or a card form (number / exp / cvc / name / "save card"), the rail selector for Secure Payment, the policy text relevant to the kind (boost refund policy; Pro trial terms; Secure Payment terms), primary button `Pay $X · Test mode`.
- Success page `/billing/success?order=` shows what was fulfilled (boost schedule with `endsAt` and a 「推广」 preview of the card; Pro ribbon; Secure Payment timeline) and a share card ("I'm featured — forward to WeChat"). Cancel page `/billing/cancel` returns to the entity.
- Failure: inline error from `PAYMENT_FAILED { failureCode }` with the test-card hint in dev builds only.
- `BILLING_LIVE` design: when `STRIPE_SECRET_KEY` is set and the flag is on, `POST /api/billing/orders` returns `{ checkoutUrl }` (Stripe Checkout) instead of a mock intent; the same fulfilment handler runs from the real webhook. Keep the provider interface (`createIntent`, `confirm`, `refund`, `createSubscription`) so the swap is one file. Escrow/live Connect is **not** in this scope.

---

## 9. Analytics events (`events(user_id, type, entity, props)`)

Canonical names already in DATA_MODEL §4 are reused; new names are additive. **Never** write card numbers, ID images/numbers, passport numbers or lease images to `events`.

| type | entity | props |
|---|---|---|
| `pricing.view` | — | `{ tab, campusId }` |
| `boost.options_viewed` | listing/market_item/buddy_post | `{ eligible, reason, surface: 'publish_upsell'|'owner_panel'|'detail' }` |
| `boost.tier_selected` | same | `{ planKey, addons }` |
| `checkout.start` / `checkout.pay` / `checkout.success` / `checkout.fail` | order | `{ kind, planKey, totalCents, creditCents, discountCents, provider, surface, failureCode? }` |
| `boost.impression` / `boost.click` | boost | `{ position, scope: 'campus'|'nationwide', surface: 'list'|'map'|'carousel' }` |
| `boost.cancelled` | boost | `{ refundCents, by: 'owner'|'moderation'|'admin', reason }` |
| `pro.trial_start` / `pro.subscribe` / `pro.renew` / `pro.cancel` / `pro.suspend` | subscription | `{ planKey, promo?, reason? }` |
| `escrow.propose` / `escrow.accept` / `escrow.fund` / `escrow.release` / `escrow.refund` / `escrow.dispute` / `escrow.resolve` | escrow | `{ amountCents, feeCents, feePayer, rail, state, hoursHeld?, resolution? }` |
| `escrow.quote_viewed` | listing | `{ amountCents, rail }` |
| `escrow.offplatform_warning_shown` | conversation | `{ eligible }` |
| `kit.view` | — | `{ campusId, stage, preArrival: bool }` |
| `kit.card_view` / `affiliate.click` / `kit.card_done` | partner | `{ slug, category, placement, campusId }` |
| `affiliate.conversion` | partner | `{ slug, payoutCents, source: 'postback'|'csv'|'manual', status }` |
| `referral.link_click` / `referral.qualified` / `referral.rewarded` / `referral.void` | referral | `{ code, rule, cents }` |
| `wallet.credit` / `wallet.debit` / `wallet.expiry` | wallet_ledger | `{ kind, deltaCents, note }` |
| `promo.apply` | promo_code | `{ code, ok, reason? }` |
| `sponsorship.impression` / `sponsorship.click` | sponsorship | `{ surface: 'home_feed'|'kit'|'map_poi'|'digest'|'buddy_event', campusId }` |

Funnels the admin dashboard derives: `boost.options_viewed → boost.tier_selected → checkout.start → checkout.success`; `pro.trial_start → pro.subscribe → pro.cancel`; `kit.view → kit.card_view → affiliate.click → kit.card_done → affiliate.conversion`; `escrow.propose → escrow.accept → escrow.fund → escrow.release`.

---

## 10. Screens (web `features/billing`, all bilingual via `useT()`, DESIGN tokens)

| Route | Screen | Contents / behaviour |
|---|---|---|
| `/pricing` | **Pricing page** | Three tabs: 学生 Students (boost tiers by entity as `SegmentedControl` reading the API, Nationwide Spotlight explainer, referral credits), 房东 Landlords (Free / Pro / Pro+ comparison, Founding Landlord banner until 2027-02-28, badge-gate explainer), 商家 Businesses (sponsor rate card, Verified Building CTA → lead form `POST /api/billing/sponsor-leads`). Secure Payment column: 「安心付 · 服务费 3%，最低 $5，最高 $60」 + 「了解流程」. "What's always free" box. FAQ accordion. |
| sheet from owner panel / publish success / detail | **Boost sheet** | Eligibility first; ineligible → reason + the free fix with deep link. Tier cards (price, duration, "est. +X views" from `estimatedReach`), Spotlight toggle (listing only, shows "also appears in nationwide results for every city"), promo input, wallet toggle with balance, policy line ("removed by moderation for a policy violation: no refund"), primary → checkout. After publish the sheet is an upsell, never a blocker (DESIGN §6.4). |
| `/pro` | **Pro page** | Badge gate state (not L3 / no landlord_proof → steps with links), plan picker monthly/yearly with yearly savings, Founding promo, trial terms, → checkout. Post-success → `/pro/dashboard` (listings, views/leads/boost uplift series, lead inbox with trust badges and filters, team seats + CSV import on Pro+, invoices, cancel/resume). |
| `/billing/checkout/:orderId` | **Checkout** | §8. |
| `/billing/success`, `/billing/cancel` | result pages | §8. |
| `/wallet` | **Wallet** | balance, expiring-soon callout, ledger with human-readable sources, referral block (code, share URL, QR poster, stats), promo redemption input. |
| `/kit` (+ `/kit/share/:campusId` public) | **Newcomer Kit page** | h1 + `Badge sponsored` + disclosure; stage switcher 出发前 / 落地 7 天 / 第一个月; sections per category as 3-col grids of partner cards (name, 2-line pitch, perk chip = `promo_text`, 「无需 SSN」 chip when verified, `[前往 ↗]` tracked, `caption` 「赞助」 inside every sponsored card, `Checkbox` 「我已办好」); left rail checklist 「落地第一周」; campus selector; share card button. |
| `/kit/:slug` | **Partner detail** | full description zh/en, what you need (passport / I-20 / SSN?), user bonus, our disclosure line, 「前往」 tracked button, "report a problem with this partner" (creates `reports entity_type='partner'`), related partners. |
| `/billing/secure/:id` | **Secure Payment** | quote (amount, purpose, move-in date, fee line, fee-split selector, rail selector with cost), terms summary (what release/refund mean, inspection window), pay (test-mode band), status timeline (proposed → accepted → funded → in inspection → released), actions by role (`actions[]` from the API): accept / fund / confirm move-in / request refund / report a problem (dispute form with reason enum + evidence uploads) / cancel; receipt. Entry points: listing detail 「安心付押金」 (only when payee eligible, else "This host can't receive Secure Payment yet" + nudge message), chat context card 「发起安心付」. |
| `/billing/boosts` | **My boosts** | active/scheduled/ended, stats per boost, cancel with prorated credit preview. |
| admin (consumed by `admin` module) | billing admin | routes in `API.md` §11.7 plus §11 additions; UI lives in `web/src/features/admin`. |

---

## 11. Additive migration `18_billing.sql` (you own it; `CREATE TABLE IF NOT EXISTS` / guarded `ADD COLUMN` only)

```
pricing_plans  + fee_cap_cents INTEGER            -- escrow cap (6000)
               + min_trust INTEGER DEFAULT 1
               + requires_badge TEXT              -- 'supply_proof' | 'landlord_proof' | NULL
               + addon_for TEXT                   -- 'boost.listing.*' for spotlight
               + self_serve INTEGER DEFAULT 1     -- 0 for sponsor/building/viewing plans
boosts         + nationwide INTEGER NOT NULL DEFAULT 0
               + paused_at TEXT                   -- set when ≥ 2 open reports; placement skips
escrows        + rail TEXT DEFAULT 'ach'          -- ach | card | alipay | wechat_pay
               + card_fee_cents INTEGER DEFAULT 0
               + dispute_reason_code TEXT         -- fraud_listing | not_on_lease | not_as_described | no_access | other
partners       + network TEXT                     -- impact | cj | flexoffers | amazon | direct
               + no_ssn_ok INTEGER DEFAULT 0
               + no_ssn_verified_at TEXT
               + rubric_json TEXT DEFAULT '{}'    -- subcategory, stages[], feeFree, campusBranch
               + payout_note TEXT                 -- 'assumption; IO signed 2027-01-05' etc.
partner_conversions (id, partner_id, click_id NULL, network_ref UNIQUE, payout_cents, status 'pending'|'approved'|'reversed'|'paid',
                     occurred_at, imported_at, source 'postback'|'csv'|'manual', campus_id NULL)
sponsorships   (id, business_name, contact_json, campus_id, plan_id, monthly_cents, discount_promo_id NULL, starts_on, ends_on,
                status 'proposed'|'active'|'paused'|'ended', creative_json, surfaces_json, verified_at, verified_by, ambassador_user_id NULL,
                created_by, created_at, updated_at)
sponsorship_invoices (id, sponsorship_id, period 'YYYY-MM', amount_cents, status 'unpaid'|'paid'|'void', paid_at, external_ref)
sponsorship_stats (sponsorship_id, day, impressions, clicks)
verified_buildings (id, sponsorship_id, operator_name, campus_id, page_slug UNIQUE, name, name_zh, address, lat, lng, photos_json,
                    lease_url, lease_fee_cents, status 'draft'|'live'|'paused', lead_count, attributed_leases)
building_leads (id, building_id, user_id, status 'new'|'toured'|'applied'|'signed'|'lost', lease_months, signed_at, created_at)
subscription_seats (id, subscription_id, user_id, role 'member', created_at)
sponsor_leads  (id, business_name, contact, campus_id, interest 'sponsor'|'building', note, status, created_at)
```

Revenue reads: the admin revenue endpoint unions `v_revenue` (cash from `payments.provider='mock_stripe'`), paid `sponsorship_invoices`, approved `partner_conversions` (recognized) and `partner_clicks.payout_cents` where `converted = 1` (estimated), with a credits contra line from `wallet_ledger kind='order_payment'`.

**Integration requests to record in `docs/modules/billing.md`:** `verify` adds verification type `lease_proof` (approved row = `supply_proof` badge) and exposes `hasSupplyProof(userId)`; `listings`/`market`/`buddy` emit `*.publish` events and mount `PublishUpsell`; `chat` exports the off-platform regex banner hook; scaffold adds public route `/kit/share/:campusId` and the `aid` cookie; `API.md` §11.4 trial length 7 → 14 days; `orders` body gains `addons[]`.

---

## 12. Seed data for the demo (`server/src/db/seed/billing.ts`)

- All plans and promo codes above (`IGNITE-*` for `northwestern`, `uiuc`, `nyu`, `uchicago`, `uic`, `illinois-tech`).
- ≥ 20 partners above (nationwide) + the 3 campus-scoped airport-pickup rows.
- Northwestern (rich): 6 boosts across tiers (2 with `nationwide = 1`), 1 Pro and 1 Pro+ subscription (`landlord@evanstonhomes.com` is Pro+ trialing → active), 4 escrows in different states (`funded`, `in_inspection`, `released`, `disputed`), 30 days of `partner_clicks` with 10 conversions, a Local Sponsor + a Feed Sponsor with invoices, 1 Verified Building, referral chain alice → bob (rewarded) and bob → newbie (pending), wallet history for alice.
- UIUC and NYU (light): 2 boosts each, 1 Pro each, 1 escrow each, a handful of clicks, 1 sponsorship at UIUC.
- All amounts in cents; all timestamps relative to seed time so the demo never looks stale.
