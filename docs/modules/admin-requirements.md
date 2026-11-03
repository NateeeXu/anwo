# Admin module — requirements (revenue dashboard, moderation SLAs, verification rubric, feature flags)

> For the `admin` engineer. Business rules come from `docs/BUSINESS_PLAN.md` (§3 trust rules, §4 campus playbook, §7 KPIs, §8 legal). Data comes from the architect's tables (`docs/DATA_MODEL.md`, `server/src/db/schema.sql`), the billing module's additive tables (`docs/modules/billing-requirements.md` §11) and the routes in `docs/API.md` §12 (admin) and §11.7 (billing admin). The admin module owns `feature_flags`, `19_admin.sql` (additive only), `web/src/features/admin/**`, and every admin write appends `audit_log` via `audit()`.
>
> Nationwide rule: every screen has a **campus filter with a nationwide total** (default = all), a date range, and CSV export. Nothing defaults to Northwestern.

---

## 1. Admin shell

Left nav (DESIGN tokens; `ink` on `sunken`, one accent): Overview · Revenue · Campus Ignition · Trust · Funnels · Verification queue · Reports & moderation · Users · Listings · Secure Payments · Subscribers · Sponsors & Buildings · Kit editor · Pricing & promos · Ambassadors · Feature flags · Shuttle alerts · Audit log. Header: campus `Select` (all / one), date range, language toggle. Every table: sortable, paginated, exportable. Every destructive action: confirm dialog with a required `reason`.

---

## 2. KPIs and charts

### 2.1 Overview (home)

Tiles for **today** with 7-day delta (`GET /api/admin/overview`): DAU · signups · listings published · matches (score ≥ 50) · messages · revenue (cents) · open reports · pending verifications (with oldest age) · disputed Secure Payments (with oldest age) · revenue at risk (boost cash on entities under review). Below: a 30-day sparkline row (DAU, listings, revenue) and the **SLA strip** (§3) coloured by status.

### 2.2 Revenue dashboard (`GET /api/billing/admin/revenue` + additions)

| Chart / table | Definition |
|---|---|
| **Revenue by stream** (stacked bars, day/week/month) | `v_revenue` grouped by `order_kind` (`boost`, `subscription` + `subscription_renewal` = Pro, `escrow_deposit` → `fee_cents` only) + paid `sponsorship_invoices` (sponsors / buildings) + `partner_conversions.status='approved'` (affiliate recognized). Toggle **recognized vs cash** (affiliate pending/approved/reversed/paid). |
| **Credits contra line** | `wallet_ledger kind='order_payment'` (negative) per period; show gross, credits, cash. |
| **MRR** | active + trialing + past_due subscriptions × monthly-equivalent price (yearly ÷ 12) + active sponsorships `monthly_cents` + live Verified Building pages. Shown with net new / churned / expansion. |
| **GMV held** | `escrows.amount_cents` funded per period; **take rate** = fees ÷ GMV. |
| **Revenue per MAU**, **ARPU by trust level** (0–3) | revenue ÷ distinct active users; by `users.trust_level` at order time. |
| **Campus leaderboard** | campus, stage, MAU, live listings, revenue, revenue/MAU, lease-proof %, L2 %, sponsors, Pro subs. |
| **Boost economics** | boosts sold by entity type and tier, avg ticket, Spotlight attach rate, refunds (owner cancel / our error / policy), paused boosts, **featured-density monitor** (served sponsored slots ÷ results, must be ≤ 20%). |
| **Affiliate** | clicks → self-reported done → conversions (pending/approved/reversed/paid) by partner and campus, EPC, approval rate, **alert when a partner's approval rate < 40%** (sign of non-SSN rejections / ToS). |
| **Secure Payment** | proposed → accepted → funded → released counts, median hours held, dispute rate, resolution mix, fee revenue, states enabled. |
| **Seasonal overlay** | the BUSINESS_PLAN §4.4 calendar as a shaded band on every time series. |

### 2.3 Campus Ignition board (`GET /api/admin/growth/campuses`)

One row per campus (all 66): stage (`browsable | seed | igniting | lit | dense | parked`, from the new `campus_milestones` table), days in stage, registered, L1 / L2 / L3, MAU, WAU, live sublets / items / buddy posts / wanted, **weekly reply rate** (live sublets with ≥ 1 inbound message in 7 d ÷ live sublets), chats/day, shares → opens → signups (7 d), K-factor (28 d), boosts sold, credits issued, sponsors, Pro subs, ambassador, next milestone and what is missing (e.g. "needs 7 more live sublets to leave seed"). Click → campus detail with time series and a **Promote / Park** button (writes `campus_milestones` + `audit_log action='campus.stage'`, requires reason). Ignition-cost tile = ambassador payouts + credits redeemed + content spend ÷ L1 users at that campus. Monthly cap monitor: ignitions this month ÷ 6.

### 2.4 Trust dashboard

Verification SLA (median hours to decision by type, backlog by age bucket, approve/reject rate with reasons), lease-proof share of live sublets by campus, fraud rate (upheld reports ÷ live listings), off-platform-payment warnings shown vs Secure Payments started, duplicate-photo matches caught, boosts paused by reports, Secure Payment disputes by reason, admin ID-image views per admin (from `audit_log action='verify.view_document'`).

### 2.5 Funnels

Boost: options viewed → tier selected → checkout start → paid, by campus / entity type / surface. Pro: trial → paid → churn cohorts (monthly). Kit: view → card view → click → done → confirmed conversion, by partner and campus, split pre-arrival vs arrived. Secure Payment: propose → accept → fund → release; dispute branch. Verification: signups → edu verified → ID submitted → ID approved (time between steps). Listing: view → contact click → chat start.

### 2.6 Definitions (SQL lives in `server/src/modules/admin/kpis.ts`; document each in the UI tooltip)

- DAU/WAU/MAU = distinct `user_id` in `events` per 1 / 7 / 30-day window.
- Reply rate (7 d) = listings `status='active'` with ≥ 1 `chat.start` or `chat.message` where the listing is the conversation context and the sender ≠ owner in the last 7 days ÷ active listings.
- K-factor (28 d) = (signups with `referral_source` = share or qualified referrals) ÷ distinct active users.
- Revenue at risk = cash of boosts whose entity has ≥ 1 open report or `moderation_status='flagged'`.
- Fraud rate = reports `actioned` with action ∈ {hide, remove, ban_user} ÷ listings published, trailing 30 d.

---

## 3. Moderation and operations SLAs

| Queue | SLA | Escalation |
|---|---|---|
| L2 verification (student ID / passport / government ID) | **median ≤ 24 h, max 48 h** | > 48 h → red on the SLA strip; backlog > 200 → admin notification |
| L3 inputs (phone, payment method) | automatic | — |
| Lease-proof / landlord-proof review | **≤ 24 h** (it unlocks boosts and Secure Payment receiving) | same |
| Business verification (sponsors, Verified Building) | ≤ 3 business days (EIN, license/storefront, phone call) | — |
| Reports on listings / items / buddy posts / users / messages | **first action ≤ 12 h**; scam-pattern reports (deposit requests, cloned photos) **≤ 4 h** | 2+ open reports on an entity auto-hide the entity from search (not the owner's view) and pause any boost until reviewed |
| Secure Payment disputes | **first response ≤ 72 h**, decision ≤ 5 business days; funds frozen meanwhile | > 72 h → red; admin notification to all admins |
| Partner complaints (`reports entity_type='partner'`) | ≤ 3 business days; 3 upheld complaints → partner delisted regardless of payout | — |
| Campus requests (`campus_requests`) | triage weekly | — |
| Referral / credit fraud flags | ≤ 48 h | void + reverse ledger, optional ban |

Moderation actions (`PATCH /api/admin/reports/:id`): `hide | remove | ban_user | warn_user | lock_conversation | delete_message | none`, each with a required reason, an `audit_log` row, a `report.actioned` notification to the reporter, and — for boosted entities — the refund decision (`our_error` → refund; `policy_violation` → forfeit) recorded on the order. Scam-pattern checklist shown on every report: off-platform deposit request (Zelle/CashApp/Alipay/WeChat Pay/gift card), "can't show it, I'm abroad", below-market price + stock photos, overpayment check, poster not on lease, 中介 impersonation.

Fair-housing linter: runs on listing publish and sponsor creative; flags protected-class terms on whole-unit listings (race, religion, national origin, familial status, disability; state additions) and allows gender/language only on `shared_living = 1`; flagged items go to the moderation queue with the matched phrase highlighted.

---

## 4. Verification review rubric (manual review; no biometric matching)

Reviewer sees: document front/back (+ selfie if uploaded, **no automated face match**), full name typed by the user, campus, edu email, account age, prior requests. Every view of a document writes `audit_log action='verify.view_document'`. Documents are encrypted at rest and auto-deleted 30 days after decision (verify module job); the rubric must be completed inside that window.

| Check | Approve when | Reject reason code (shown to user, bilingual) |
|---|---|---|
| Document type | student ID, passport, or government ID; landlord proof = deed, property-tax page, management agreement, or lease naming the owner | `wrong_document` |
| Legibility | all four corners visible, no glare over name/photo, not a screenshot of a photo | `unreadable` |
| Name match | typed `full_name` matches the document (allow transliteration variants, middle-name omission, 中文/pinyin equivalence) | `name_mismatch` |
| Campus match | student ID institution = selected campus, or passport + edu email domain of that campus | `campus_mismatch` |
| Expiry | passport/government ID not expired; student ID current academic year or no expiry printed | `expired` |
| Tampering | no inconsistent fonts, edited fields, mismatched photo edges | `suspected_tampering` → also flag user for fraud review |
| Duplicate | document hash not already approved on another account (store a salted hash of `doc_number_last4 + name`, never the number) | `duplicate_identity` |
| Lease-proof (supply badge) | lease page shows the applicant's name, the listing address (or building), and a term covering the listing dates; other tenants' names may be redacted | `lease_name_mismatch`, `lease_address_mismatch`, `lease_dates_mismatch` |
| Landlord-proof | ownership/management document names the applicant or their company; company applicants add a business card/email on the company domain | `ownership_not_shown` |
| Selfie (optional) | reviewer eyeballs resemblance only; never a hard requirement, never scored | — |

Decisions: `approve` (note optional) → trust recompute + notification; `reject` (reason code + optional note; user may resubmit after 24 h, max 3 attempts per 30 days); `needs_info` is a reject with reason `unreadable | wrong_document`. Reviewer throughput target 3 min per L2 request. Weekly QA: a second admin re-reviews a 5% random sample; disagreements logged.

---

## 5. Feature flags (`feature_flags`; `PUT /api/admin/flags/:key`; `campus_ids_json` scopes a flag to campuses; `value_json` carries config; every change audited and broadcast `system.flags`)

| key | default | value_json | purpose |
|---|---|---|---|
| `boosts.enabled` | on | `{ maxPerPage: 2 }` | boost purchase + placement; `maxPerPage` can only be lowered (hard cap 2 per 10) |
| `boosts.max_tier_enabled` | on | — | allows the `max` tier (home carousel) |
| `boosts.spotlight.enabled` | on | — | Nationwide Spotlight add-on |
| `pro.enabled` | on | `{ trialDays: 14, freeListingQuota: 2 }` | Landlord Pro |
| `escrow.enabled` | **off** | `{ states: [], minTrustPayee: 3, requireSupplyProof: true, achOnlyAboveCents: 50000, inspectionHoursDefault: 48 }` | Secure Payment; scoped by `campus_ids_json` to campuses in counsel-cleared states; UI label is "Secure Payment" |
| `escrow.mock_demo` | on in dev only | — | lets the mock flow run in test mode without `escrow.enabled` |
| `protection.enabled` | off | `{ claimCapCents: 150000, monthlyCapCents: 2500000, reserveBps: 2000 }` | phase-2 Deposit Protection |
| `affiliate.enabled` | on | `{ clickRateLimitPerDay: 20 }` | Newcomer Kit outbound links |
| `affiliate.no_ssn_label` | on | `{ reverifyDays: 90 }` | shows the "No SSN needed" chip only when verified recently |
| `referrals.enabled` | on | `{ rewardCents: 500, postBonusCents: 500, maxRewardedPer30d: 10 }` | referral credits |
| `promo.ignite.enabled` | on | `{ creditCents: 1900, maxPerCampus: 100 }` | `IGNITE-*` codes |
| `sponsors.enabled` | on | `{ maxFeedPerCampus: 3 }` | sponsor surfaces; sellable only for campuses in stage ≥ lit (enforced by the ignition board) |
| `buildings.enabled` | on | — | Verified Building pages |
| `viewing.enabled` | off | `{ campuses: [] }` | Verified Viewing pilot (plans inactive until on) |
| `nationwide.enabled` | on | — | nationwide toggle |
| `scam_banner.enabled` | on (cannot be turned off, only edited) | `{ patterns: [...] }` | first-message scam banner and off-platform regex |
| `verified_only_default` | off | — | default state of the verified-only filter |
| `fha_linter.enabled` | on | `{ blockOnMatch: false }` | fair-housing wording check (flag vs block) |
| `wallet.pro_allowed` | off | — | whether credits may pay for Pro |
| `campus.ignitions_per_month` | — | `{ max: 6 }` | cadence cap used by the ignition board |
| `billing.live` | off | — | mirrors `BILLING_LIVE` env for display; the server trusts env, not this flag |
| `maintenance_banner` | off | `{ text, textZh }` | site-wide banner |
| `digest.enabled` | on | `{ hourUtc: 9 }` | nightly digest |

Non-configurable (not flags, by design): sponsored labels, verified-only sort integrity, free verification/reporting/badges, "escrow" wording ban, boost slot cap > 2 per 10.

---

## 6. Other admin screens (summary of what each must do)

| Screen | Must do |
|---|---|
| **Verification queue** | claim / approve / reject with rubric codes (§4), oldest-first, type filter, campus filter, SLA timer, document viewer with audit on open, duplicate-hash warning, resubmission history. |
| **Reports & moderation** | queue with entity summary card, report count for entity, scam checklist, actions (§3), boost refund decision, linked conversation viewer (read-only, logged), bulk dismiss of duplicate reports. |
| **Users** | search, role / ban / trust override / listing quota with reason, recent events, reports against, orders, wallet adjust (billing admin API), impersonate (dev only). |
| **Listings** | moderation status (ok / flagged / hidden), flagged-only view, duplicate-photo matches, FHA linter hits, boost status with pause/revoke. |
| **Secure Payments ops** | table by status with ageing and 72 h dispute timer, evidence viewer, resolve (release / refund / split with amounts and reason code), extend inspection, escalate; every action → `escrow_events` + `audit_log`. |
| **Subscribers** | Pro / Pro+ list, trial→paid, churn, suspend with pro-rated refund and report link, seats. |
| **Sponsors & Buildings** | business-verification checklist (EIN, license, phone call, FHA check), slot calendar per campus (Local / Feed ≤ 3 / Campus Partner), creative preview with the mandatory 「赞助 Sponsored」 label baked in, invoices (mark paid), stats, ambassador attribution, Verified Building page editor and leads pipeline (new → toured → applied → signed → lost; attributed-lease statement export). Sponsors only bookable for campuses in stage ≥ lit. |
| **Kit editor** | partners CRUD, `sort_order` vs `payout_cents` shown side by side with a reason required for rank changes (audit), "No-SSN verified on <date>" field, delist with reason, conversion CSV / postback import, reconciliation (clicks vs network-reported), partner complaint count. |
| **Pricing & promos** | `pricing_plans` editor (diff + reason → `audit_log plan.update`), promo codes CRUD with redemptions, `IGNITE-*` generator per campus. |
| **Ambassadors** | applications, active list per campus, pay mode (credits / cash with work-authorization checkbox), attributed signups with qualification status, monthly payout draft (base + capped bounty + commissions), approve / void, export. |
| **Feature flags** | §5 with per-campus scoping and JSON config editor; shows last editor and time. |
| **Audit log** | immutable, searchable by actor / action / entity / date; every ID-document view, money action, flag change, pricing change, stage change. |

---

## 7. Additive migration `19_admin.sql`

```
campus_milestones (campus_id, stage 'browsable'|'seed'|'igniting'|'lit'|'dense'|'parked', reached_at, metrics_json, set_by, reason)   -- append-only
ambassadors (id, user_id UNIQUE, campus_id, promo_code_id NULL, status 'applied'|'active'|'paused'|'ended', pay_mode 'credits'|'cash',
             work_authorized INTEGER DEFAULT 0, base_cents DEFAULT 15000, bounty_cents DEFAULT 200, bounty_cap_cents DEFAULT 60000, started_at, ended_at)
ambassador_attributions (id, ambassador_id, user_id UNIQUE, source 'code'|'share'|'qr', qualified_at NULL, paid_at NULL)
ambassador_payouts (id, ambassador_id, period 'YYYY-MM', base_cents, bounty_cents, commission_cents, total_cents,
                    status 'draft'|'approved'|'paid'|'void', approved_by, paid_at)
admin_notes (id, entity_type, entity_id, author_id, body, created_at)
feature_flags seed rows for every key in §5
```

Seed: flags above; `campus_milestones` rows putting `northwestern` in `lit`, `uiuc` and `uchicago` in `igniting`, `nyu` in `seed`, everything else `browsable`; one ambassador per seeded-active campus; a few admin notes.

---

## 8. Definition of done (admin-specific additions to BRIEF §8)

- Every number on the Overview and Revenue screens can be traced to a query in `kpis.ts` with a tooltip definition.
- SLA strip turns red correctly in a Playwright test by seeding an old pending verification and an old dispute.
- Flag changes propagate without reload (WS `system.flags`).
- No admin screen renders an ID image without writing `audit_log`.
- Sponsor booking is refused for a campus below `lit` (test).
- Grep test: no admin i18n string contains "escrow".
