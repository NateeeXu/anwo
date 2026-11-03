# Business Plan — Nationwide Campus Sublet / Life-OS Platform for International Students

> Final synthesized plan. Inputs: `docs/BRIEF.md` (product, trust ladder, §6 principles), `docs/MARKET.md` (every benchmark keeps its [fact]/[estimate] tag from there), and the three strategy lenses in `docs/strategy/` (`trust-first.md`, `revenue-first.md`, `growth-first.md`). Everything new in this file is an **estimate** unless tagged.
> Scope: **all US universities** — 66 campuses are seeded in `docs/data/campuses.json`, every campus is browsable and accepts listings from day 1, and the nationwide toggle works everywhere. **Northwestern/Evanston is only the first campus switched on and the richest demo dataset; nothing in this plan is Evanston-specific.**
> Calendar: Day 0 = **2026-11-16** (public launch). Month 1 = Nov 2026 … Month 6 = Apr 2027 (sublet posting peak) … Month 10 = Aug 2027 (arrival peak) … Month 12 = Oct 2027.
> Companion implementation specs: `docs/modules/billing-requirements.md` (billing engineer) and `docs/modules/admin-requirements.md` (admin engineer). Table/enum names used here are the architect's (`docs/DATA_MODEL.md`, `server/src/db/schema.sql`).

---

## 0. Judgement: scoring the three lenses

Scale 1–10 (10 = best). "Legal risk" is scored so that 10 = lowest risk.

| Criterion | Trust-first | Revenue-first | Growth-first | Why |
|---|---|---|---|---|
| **Speed to revenue** | 5 | 9 | 6 | Revenue-first has a dollar on day 3 (Prime Student bounty), boosts on day 7, sponsors sold in person in week 2, and crosses $10k/mo in Feb on B2B. Trust-first gates boosts behind lease-proof and delays Secure Payment to day ~105 ($0.5k in M1). Growth-first has boosts on day 1 but spends months 1–3 lighting campuses rather than selling. |
| **Revenue ceiling** | 6 | 7 | 9 | Growth-first's $560k gross at 60 campuses is the only plan that captures the August arrival peak at scale (Kit alone $92k in Aug). Revenue-first ($343k) is capped by a 30-campus footprint. Trust-first ($300k) trades ceiling for defensibility, but its Deposit Protection / Verified Viewing / university-report streams are the strongest year-2+ moat. |
| **Trust preservation** | 10 | 7 | 6 | Trust-first makes every paid product conditional on a human-reviewed badge and refunds any boost it moderates away. Revenue-first adds a Seeker Pass (borderline: a demand-side paywall) and lets L1 users buy short boosts without lease-proof. Growth-first's credit economy (referral/ignition/share credits, 28% of boost face) and 7–9 ignitions/month invite credit farming and thin moderation. |
| **Feasibility for a small team** | 6 | 8 | 4 | Revenue-first is self-funding (cash trough ≈ −$6k) with founders selling. Trust-first needs a 4-person team plus an ambassador ops layer for Verified Viewing and claims (~$526k opex). Growth-first needs 30+ paid ambassadors by April, $150k ambassador cost, F-1 payment workarounds, and ~$700k cost base. |
| **Legal risk (10 = lowest)** | 7 | 8 | 5 | All three keep Secure Payment behind counsel and Stripe Connect delayed payouts. Trust-first adds a platform guarantee that could be deemed insurance (but mitigates it best). Revenue-first keeps the P&L valid with Secure Payment at $0 and goes IL-first. Growth-first enables Secure Payment at 12 campuses in 5+ states by month 6 and pays F-1 ambassadors — both are real exposure. |
| **Total** | **34** | **39** | **30** | |

**Verdict.** Run **revenue-first sequencing** (Kit → boosts → B2B outbound → Secure Payment last) under **trust-first gating rules** (badges gate reach and money; nothing safety-related is ever paid), using **growth-first's campus state machine and share loop** at a sustainable cadence (≤6 ignitions/month, ambassadors paid mostly in credits/stipends, no cash-out). Rejected: Seeker Pass / any seeker-side paywall (growth-first and BRIEF §6.3 are right), Verified Viewing in year-1 base (ops-heavy; kept as an aggressive-scenario pilot), Deposit Protection guarantee before counsel (phase 2), cash referral bounties, 7–9 ignitions per month.

---

## 1. Positioning

**Positioning statement.** The verified, bilingual (中文 / English) housing-and-arrival network for international students at every US campus: sublets, lease takeovers, secondhand, companions, campus shuttles and the newcomer kit — posted by people with a verified `.edu` identity, scoped to your campus, switchable to any city when you move for an internship or a job, with deposits handled on-platform instead of in a 500-person WeChat group.

**One-sentence promise (user-facing, zh first):**

> **「认证的人、认证的房、钱走平台——全美校园，一张地图。」**
> *Verified people, verified listings, money handled safely — every US campus on one map.*

**Who we are not.** Not a PBSA booking agent (uhomes/Amber — they have money handling but zero peer inventory), not a landlord ad network (Zillow, campus portals), not a metro roommate site (SpareRoom — inventory in 4 metros, no `.edu`/zh/campus), not a WeChat 中介. We sit in the empty quadrant of MARKET §3: `.edu`+ID verification × campus-scoped + nationwide × zh/en × bundled life modules × a safe payment path.

**Three honest money sources (internal rule).** (a) A partner pays us for a newcomer we delivered; (b) a poster pays for *labelled* visibility; (c) a landlord or local business pays for access to a verified student audience. Students never pay to browse, message, report, or be verified. That rule is what makes (a)–(c) worth paying for.

**Audience sequencing.** Chinese international students first (265,919 [fact], the group with the deepest WeChat/XHS fragmentation pain), with i18n built so Hindi/English-first marketing for the Indian cohort (363,019 [fact], +10%/yr) can start in month 4 without product changes.

---

## 2. Revenue stack (exact pricing)

Order = time-to-first-dollar (BRIEF §6.2). All prices USD; stored in `pricing_plans` as integer cents and read by the UI from `GET /api/billing/pricing` — never hard-coded (the sample prices in `docs/DESIGN.md` §7 are placeholders and must be replaced by the API values).

### 2.1 Newcomer Kit — affiliate hub (first dollar: Day 3)

Free to users. Publisher programs only (Impact, CJ, FlexOffers, Amazon Associates, Wise/Remitly partner programs) — never an individual's refer-a-friend code (Chase/Discover ToS, MARKET §5). Every card: `Badge sponsored` 「赞助 Sponsored」 + the one-line disclosure 「我们可能从合作伙伴获得佣金，不影响你的价格。」. Ranking is by a published rubric (no-SSN friendly → fee-free → campus branch nearby → user rating); `payout_cents` is never a ranking term and lives in a separate admin column.

**Partner list and payout assumptions** (per approved conversion; tags from MARKET §5; `[est]` = planning assumption to be replaced by the signed IO):

| Category | Partner | User-facing bonus (what the student sees) | Payout to us | Tag | Network / notes |
|---|---|---|---|---|---|
| Bank | Chase College / Total Checking | $100–300 new-account bonus (varies by offer) | $75 | est ($50–150) | CJ/FlexOffers; #1 bank for Chinese students, passport + I-20 accepted |
| Bank | Bank of America Advantage SafeBalance | $200–300 periodic bonus | $60 | est | Impact-style, intermittent |
| Bank | Wells Fargo Clear Access | $300 periodic bonus | $60 | est | no SSN with ITIN/passport |
| Bank (no-SSN fintech) | Zolve | $25–50 welcome | $50 | est | direct partnership; targets intl students |
| Credit card | Discover it Student | up to $100 referral credit (dated Dec 31 2025 — verify) | $75 | fact (referral) / est (affiliate) | Discover in-house / CJ |
| Credit card (no SSN) | Deserve EDU | $30 welcome | $50 | est | direct |
| SIM | Mint Mobile | $45–60 referral credit | $25 | fact (referral) / est (affiliate) | Impact |
| SIM | Visible (Verizon) | $20 credit | $20 | fact / est | Impact |
| SIM (China-calling plans) | Ultra Mobile | — | $15 | est | direct |
| eSIM (pre-arrival) | Airalo | $3 referral credit | $5 | est | Airalo partners |
| Renters insurance | Lemonade | from $5/mo | $20 ($15/lead) | fact (ranges) | Impact; also offered inside the Secure Payment flow |
| Renters insurance | Toggle (Farmers) | — | $15 | est | Impact/CJ |
| Money transfer | Wise | fee-free first transfer up to a cap | $15 | fact (UK £10) / est (US) | Wise partner program |
| Money transfer | Remitly | $5–25 in-app bonus | $20 | fact / est | Impact |
| Money transfer (CNY) | Panda Remit 熊猫速汇 | ¥30–50 | $10 | est | direct |
| Movers | Dolly / Lugg | — | $15 | est | per completed job |
| Storage | PODS / Extra Space / Collegeboxes | student rates | $30 | est | peak May + Aug |
| Furniture rental | CORT Student Package | $129/mo 3-room package; campus perks | $50 | fact (pricing) / est (payout) | CORT campus partner |
| Misc | Amazon Prime Student | 6-month free trial | $3 | fact | Amazon Associates bounty — the literal first dollar |
| Airport pickup | Local 接机 operators per metro | fixed fares ($48 Evanston–ORD [fact]) | $0 affiliate; sold as a **Local Sponsor** ($150/mo) + $5/lead | est | see §2.5 |

**EV per engaged newcomer (peak Jul–Sep):** ≈ $43 gross (MARKET §5.1) → **$30 net** after 30% attribution leakage (cookie loss in WeChat's browser, declines, non-SSN rejections). Off-season opener: **$6 net** (SIM/insurance/transfer/Prime mix). Kit opens: 11% of MAU off-season, 35% of newcomer-heavy MAU in August.

### 2.2 Boosts 「推广 Boosted」 (first dollar: Day 7, real Stripe Checkout; mock from Day 1)

Seller-side only; never a seeker-side product. Tiers follow `boostTier` (`basic` = featured slots; `plus` = + top of map pins; `max` = + home carousel). Placement rules are DATA_MODEL §8: **max 2 sponsored slots per 10 results (positions 0 and 5), organic ordering untouched, boosts never bypass filters or the match score**, every served slot labelled 「推广 Boosted」 (DESIGN §4.8), impressions/clicks logged.

| Entity | Tier | Duration | Price | Eligibility |
|---|---|---|---|---|
| Sublet (`listing`) | basic | 3 d / 7 d / 14 d / 30 d | **$9 / $19 / $39 / $69** | L1 + moderation `ok`; **14 d and 30 d require lease-proof or landlord-proof badge** |
| Sublet | plus | 7 d / 14 d | **$29 / $59** | L2 + lease-proof/landlord-proof |
| Sublet | max | 7 d / 14 d | **$49 / $89** | L2 + lease-proof/landlord-proof (home carousel is the most scam-sensitive surface) |
| Sublet add-on | Nationwide Spotlight | same as parent boost | **+$10** | parent boost required; listing shown in nationwide results for every city and in cross-city "matches for you" |
| Item (`market_item`) | basic | 1 d / 3 d / 7 d | **$2.99 / $4.99 / $9.99** | L1 |
| Move-out bundle | basic | 7 d | **$9.99** (boosts every item in the bundle; bundle must link to a sublet) | L1 |
| Buddy / event (`buddy_post`) | basic | 1 d / 3 d | **$1.99 / $4.99** | L1 |
| Pack | "Moving out" = sublet basic 14 d + bundle 7 d | — | **$44** (saves $5) | as for 14 d |

Anchors: SpareRoom Bold $15/wk–$149/6mo [fact], OfferUp Promote $3.99/day [fact], Craigslist $5/post [fact]. Expected tier mix for sublets 40% $9 / 35% $19 / 15% $39 / 10% plus-max → **avg ≈ $22**; 20% attach Nationwide Spotlight in intern cities. Buying a boost for an already-boosted entity extends it (DATA_MODEL §6.8). A boost on a listing that moderation removes for **our** error is auto-refunded to card; for a policy violation it is forfeited (stated at checkout); two reports auto-pause the boost with the money held pending review.

### 2.3 Landlord Pro / Pro+ (first dollar: Day 20–45; outbound-sold)

| Plan | Price | Includes |
|---|---|---|
| Free landlord | $0 | up to **2 active long-term listings**, basic stats, first listing always free |
| **Pro** | **$29/mo or $249/yr** | unlimited listings, analytics, lead inbox with verified-student badges, 「房东 Pro」 badge (DESIGN: never looks like a trust badge), priority verification, **1 × 7-day basic sublet boost credit per renewal**, bilingual auto-translation of listings |
| **Pro+** | **$79/mo or $699/yr** | Pro + CSV import, 5 team seats, lead export, Verified Building tie-in, **3 boost credits/month** |
| Founding Landlord | **50% off Pro for 12 months** | first 100 landlords who sign before **2027-02-28** (promo `FOUNDING50`) |

Gates: trust L3 (ID + phone + payment method) **and** an approved `landlord_proof` verification before the badge shows or the trial starts; 14-day trial, card on file. Pro buys tools and a *paid* badge, never ranking: Pro listings rank organically; included boosts are labelled like any other boost. A Pro account with a confirmed scam or fair-housing report is cancelled with a pro-rated refund and an audit entry.

Sold by outbound: landlord rosters on university off-campus-housing portals, Zillow/Apartments.com listings within 1 mile of campus, Google Maps "student apartments"; pitch = "Chinese and Indian students are 15–25% of your tenants and they are in WeChat groups you cannot reach — $29/mo puts your building in front of verified students in their language." Target 60 contacts per pre-leasing town, 15% trial, 50% trial→paid. Pre-leasing towns (UIUC, Michigan, Wisconsin, Purdue, Ohio State) are worked Dec–Feb when landlords list for August (MARKET §1.3).

### 2.4 Secure Payment 「安心付 Secure Payment」 — service fee (first dollar: Day 90–150, counsel-gated)

- **Fee: 3% of the amount sent, min $5, cap $60** (`escrow.standard`: 300 bps, `fee_min_cents` 500, cap 6000), **paid by the payer by default**; payee may absorb it or choose a 50/50 split (`escrowFeePayer`). Half of Airbnb's 15.5% host-only fee [fact].
- **Rail:** ACH bank debit is the default; **deposits ≥ $500 are ACH-only** so the fee is contribution-positive (ACH 0.8% capped $5 vs card 2.9% + $0.30 [fact]); cards allowed under $500; Alipay/WeChat Pay via Stripe for parents paying from China with the processing cost shown as a separate line.
- **Structure:** Stripe Connect destination charges with **delayed/manual payouts** — funds sit in Stripe's balance, the platform never takes custody; released 24 h after the payer confirms move-in, or automatically when the inspection window (default 48 h after move-in) closes with no dispute. **The UI never says "escrow"** (MARKET §6.3; the DB table is named `escrows` but no user-facing string may use the word).
- **Eligibility:** payee proposes at L2; payer funds at L3; payee receives at **L3 + lease-proof or landlord-proof badge**. One open Secure Payment per listing per move-in date (blocks double deposits).
- **Go-live order:** mock (test mode) from day 1 → Stripe Connect sandbox end-to-end by day 60 → counsel memo (money-transmission posture, state deposit statutes IL 765 ILCS 710 / NY GOL §7-108 / CA Civ §1950.5 / MA c.186 §15B) → **Illinois first**, then one state at a time via `escrow.enabled` with `campus_ids_json`. The base projection assumes IL+NY+CA+MA+WA+MI live by May; the conservative projection assumes **$0** from this stream in year 1.
- **Phase 2 (after counsel, month 7+): Deposit Protection** — a conditional platform refund policy (AirCover structure, explicitly "not insurance") funded by sweeping 20% of fees into a reserve; cap $1,500/claim, $25k/month; evidence-based claims with a 5-business-day decision. Not in the base projection.

### 2.5 Sponsored placements 「赞助 Sponsored」 and Verified Building (first dollar: Day 10–20)

Local businesses buy fixed, labelled surfaces — **never a place in search results** (this is the line that separates sponsors from boosts):

| Product | Price per campus per month | Surfaces |
|---|---|---|
| **Local Sponsor** | **$150** | sponsored map POI pin + one card in the matching Kit category (e.g. a mover under 搬家) |
| **Feed Sponsor** | **$350** | Local + one labelled card on the campus home feed strip (max 3 feed sponsors per campus) |
| **Campus Partner** | **$600** | Feed + a slot in the weekly bilingual digest email + "sponsored by" on one buddy event per month |
| **Airport-pickup partner** | **$150 Local Sponsor + $5 per completed booking lead** | buddy module "接机" roster |
| **Verified Building** | **$500/mo per building** (or $300 for ≤ 50 beds; metro-wide feature $1,000) **+ $300 per attributed 12-month lease** ($150 for ≤ 6 months); alternative $0/mo + 6% of first-year rent | separate, labelled "Verified building · partner" layer on the map and a building page; never mixed into peer-sublet results |
| Founding rate | 50% off for 3 months | first 3 sponsors per campus |

Business verification before any sponsor goes live: EIN, business license or storefront, a phone call, and a fair-housing wording check if housing-related. No 中介/agent may sponsor sublets. Sponsors are only sellable on **lit** campuses (§4), which is what keeps the rate card credible. Ambassadors earn 20% of the first 3 months of sponsor revenue they source.

### 2.6 Referral and promo credits (viral currency, not a revenue line)

- **Referral:** `?ref=CODE` → both sides receive **$5 boost credit** when the referee reaches L1 (`qualify_rule='edu_verified'`); the referrer receives **a further $5** when the referee publishes a first listing/item/post within 30 days. $5 + $5 welcome = $10 > a $9 three-day boost, by design.
- **Ignition:** `IGNITE-<CAMPUS>` = one free 7-day basic sublet boost ($19 credit) for the first 100 sublet listings at a campus in `seed`/`igniting`.
- **Rules:** credits are **boost-only, non-cashable, expire after 180 days**, never apply to Secure Payment amounts, and are shown as a contra line on the revenue dashboard. Expected real cost ≈ $0.60 per $5 credit (only ~12% displace a boost that would have been bought anyway).

### 2.7 Deferred / rejected

| Item | Decision |
|---|---|
| Seeker Pass / Early-Bird contact access / per-message fees | **Rejected** — demand-side paywalls cut reach and K-factor (growth lens) and violate BRIEF §6.3 spirit |
| Verified Viewing ($29 badge / $39 private report, ambassador attestation) | **Pilot in month 5–6 at 2 campuses** if ambassador supply allows; only in the aggressive scenario |
| University "Campus Housing Safety Report" ($2,500/campus/yr) | Year 2 |
| Data resale, buying WeChat group admins, scraping groups to seed listings | Never |

### 2.8 Month-6 snapshot (April 2027, base case: 28 campuses live / 12 lit, ~14k MAU)

| Stream | $/month | Math |
|---|---|---|
| Newcomer Kit | 8,000 | 14k MAU × 11% openers × $5.2 off-season net EV |
| Boosts + Spotlight (cash after credits) | 8,500 | 2,500 April sublets × 13% × $22 + items/buddy/Spotlight, −20% credits |
| Landlord Pro / Pro+ | 4,500 | 125 Pro (blended $26 after Founding/annual) + 15 Pro+ ($78) |
| Sponsors + Verified Building | 5,500 | 12 lit campuses × 1.3 sponsors × $280 + 3 buildings × $500 |
| Secure Payment fee | 2,500 | 75 funded deposits × $33 (IL/NY/MA live) |
| **Total** | **≈ $29,000** | $10k/month is crossed in **February** (B2B + spring-intake Kit) |

---

## 3. Trust rules that are non-negotiable

These are enforced server-side and are not configurable by feature flag (only *off*, never *looser*):

1. **Nothing safety-related is ever paid.** Verification, badges, reporting, scam warnings, the verified-only filter, browsing, messaging and posting are free forever. No paid "fast-track" verification.
2. **Money cannot buy visibility for unreviewed supply.** Any boost requires L1 + `moderation_status='ok'`; 14 d/30 d sublet boosts and the `plus`/`max` tiers require the lease-proof or landlord-proof badge; `max` additionally requires L2. Nationwide Spotlight inherits the parent's gate.
3. **Boosts never change ranking for unpaid listings.** Max 2 labelled slots per 10 results (positions 0 and 5), organic stream untouched, boosts never bypass filters, never touch the wanted↔listing match score, never affect map clustering. Home carousel = `max` only, ≤ 6, labelled.
4. **Every paid placement is labelled honestly, in both languages, at every size**: 「推广 Boosted」 for user boosts, 「赞助 Sponsored」 for partners and sponsors, 「服务费 3%」 as a separate line before any payment. Labels are never removed on hover and never styled as "premium".
5. **Sponsors buy fixed surfaces, never search results.** No sponsor on scam-warning, verification or safety surfaces. No 中介 may sponsor sublets. Housing-related sponsor content passes the fair-housing wording check.
6. **Pro is a paid badge, not a trust badge.** Requires L3 + landlord-proof; Pro listings rank organically; lead inbox shows badges, never ID documents; confirmed scam/fair-housing report → cancellation, pro-rated refund, audit entry.
7. **Secure Payment: no custody, no "escrow" wording, no launch in an uncleared state.** Stripe Connect delayed payouts only; release requires payer confirmation or the inspection window; disputes freeze funds and go to a human queue with a 72 h first-response SLA; payee must be L3 with a supply badge; fee shown before payment; a user who is quoted on-platform and pays off-platform is told in chat that protection no longer applies.
8. **Kit integrity.** FTC 「赞助 Sponsored」 label on every card; publisher programs only; ranking by rubric with no payout term; at least one non-paying option per category (e.g. the campus credit union); "No SSN needed" claims re-verified quarterly; partners with upheld complaints are delisted regardless of payout; rank changes are audit-logged with a reason.
9. **Credits are boost credit only** — non-cashable, 180-day expiry, voidable on fraud; referral/ambassador rewards qualify only on `.edu`-verified users with a real action; fraud panel can void and reverse.
10. **ID handling:** manual human review of ID photos (no face-matching biometrics — Illinois BIPA), encrypted at rest, auto-deleted 30 days after decision, never shown to a counterparty, every admin view audit-logged, never written to `events`.
11. **Fair housing:** gender/language preferences only on `shared_living = true` listings and only as optional fields; whole-unit listings carry no protected-class preferences; fair-housing notice on the post form; paid products never rank by any protected class.
12. **Moderation removes a boosted listing → the boost is handled per the stated policy (refund for our error, forfeit for violation) and the revenue is shown as "at risk" on the dashboard, never hidden.**

---

## 4. Campus-by-campus launch playbook

### 4.1 The campus state machine (reused for all 66)

| Stage | Entry criteria | What happens | Exit criteria |
|---|---|---|---|
| **browsable** (all 66 from day 1) | in `campuses` seed with edu domains, coordinates, timezone, shuttle data or "approximate" | listings accepted; nationwide toggle shows cross-city supply; "request my campus" captures demand | — |
| **seed** (T-14 → T0) | ambassador recruited (CSSA/学生会 officer, L2, bilingual); ≥ 10 pre-verified landlords contacted with a free Pro trial | ambassador personally invites 30 sublessors to post ("import from WeChat text" draft tool); `IGNITE-<CAMPUS>` promo live; shuttle/POI data checked | **≥ 25 live sublets, ≥ 15 items, ≥ 5 buddy posts, ≥ 1 ambassador, ≥ 10 landlord trials invited** before anyone outside is invited |
| **igniting** (T0 → T+21) | exit of seed | launch card (image + QR + "63 verified listings") posted into every 租房群/新生群/二手群 the ambassador is in, one XHS post with campus hashtags; daily digest image at 20:00 local; 3-step onboarding (verify → campus → post or browse) | ≥ 150 L1 users, ≥ 10 chats/day, **reply rate ≥ 30%** within 21 days; otherwise back to seed with a second ambassador; **fail twice → parked** (still browsable) |
| **lit** | ≥ 1,000 registered, ≥ 60 live sublets, reply rate ≥ 40% | sponsors become sellable; landlord outreach email goes out with live demand numbers ("47 verified students are looking for August leases"); ambassador base stipend starts; `escrow.enabled` may be switched on for the campus if its state is cleared | ≥ 2,500 registered → dense |
| **dense** | ≥ 2,500 registered | second ambassador; campus insights page (median rent, days-to-rent) for XHS content; Verified Building sales | — |

**Cadence rule:** at most **6 ignitions per month**; a campus never ignites without an ambassador and seeded supply. Metro cohorts (NYC, Boston, LA, Bay Area, Chicago) share supply through the city-wide toggle, so no single campus must be dense on its own.

### 4.2 Waves (base case)

| Wave | When | Campuses (ids from `campuses.json`) | Why these |
|---|---|---|---|
| 0 | Nov 16 – Dec 15 | `northwestern`, `uchicago`, `uic`, `illinois-tech`, `uiuc` | one metro for ops density (Chicago CSSA groups overlap; Intercampus shuttle links NU's two campuses); UIUC = 16k intl [fact] + MTD GTFS public + pre-leasing starts in January; winter sublet / Dec-graduate window |
| 1 | Dec 16 – Jan 15 | `umich`, `purdue`, `wisconsin`, `nyu`, `columbia` | pre-leasing towns for Landlord Pro (Jan–Apr demand); NYC = #1 and #3 by intl headcount [fact]; Leasebreak proves NYC pays for "featured" |
| 2 | Jan 16 – Feb 28 | `northeastern`, `bu`, `harvard`, `mit`, `usc`, `ucla`, `uc-berkeley`, `stanford`, `uw`, `ohio-state` | summer-intern destinations (Boston/LA/Bay/Seattle) must be live before Feb–Mar intern searches; metro cohorts of 3 ambassadors |
| 3 | Mar – Apr | `asu`, `ut-dallas`, `cmu`, `upenn`, `cornell`, `buffalo`, `minnesota`, `georgia-tech`, `ucsd`, `jhu` | dense before the April posting peak → 30 live |
| 4 | May – Aug | `penn-state`, `texas-am`, `ut-austin`, `rutgers`, `maryland`, `indiana`, `michigan-state`, `uc-irvine`, `uc-davis`, `drexel`, `temple`, `pitt`, `stony-brook`, `syracuse`, `rochester` | ops-light launches (seed + ambassador + landlord outreach) → ~45 by the August arrival peak |
| 5 | Sep – Oct and year 2 | remaining 21 | as demand from "request my campus" dictates |

Conservative scenario stops at 30; aggressive reaches 60 by October.

### 4.3 Ambassador deal (标准合同)

$150/month base once the campus is lit; $2 per L1-verified signup attributed to their code/share links (cap $600/month), paid only on users with ≥ 1 real action within 14 days; $25 per Landlord Pro conversion; 20% of first-3-month sponsor revenue sourced; $40/month boost-credit allowance to give away; duties: daily digest ≥ 5 days/week in ≥ 5 groups, one event per month (Costco run, airport-pickup roster in August, move-out sale in May). **F-1 students cannot be paid cash for off-campus work**: the default for F-1 ambassadors is boost credits plus stipends routed through the university/CSSA where possible; cash (W-9/1099) only for ambassadors with work authorization (OPT/CPT, domestic, permanent residents). Counsel reviews the template in month 4.

### 4.4 Seasonal moment calendar

| Window | Moment | Action | Revenue it feeds |
|---|---|---|---|
| Nov 15 – Jan 10 | winter-break / Dec-graduate sublets, spring co-op moves | launch cards; "lease takeover" type promoted; nationwide toggle for co-op cities | boosts (small), Pro trials |
| Jan 10 – Feb 28 | pre-leasing in college towns | wanted-demand emails to landlords; Founding Landlord offer ends Feb 28 | Landlord Pro |
| Mar 1 – May 15 | **summer-sublet flood** (45–55% of annual listings) | boost upsell at publish; daily digests; XHS "本周转租榜" | boosts (peak), Spotlight |
| Apr 1 – Jun 15 | I-20s arrive, 2027 新生群 form | ambassadors seed the Kit pre-arrival page; airport-pickup roster opens | Kit (pre-arrival), sponsors |
| May 1 – Jun 10 | move-out | bundle posts; move-out sale events sponsored by movers/storage | item boosts, Kit storage, sponsors |
| May 15 – Aug 31 | intern relocation (cross-city) | city landing pages (`/city/seattle` …); Spotlight; Secure Payment for sight-unseen deposits | Spotlight, Secure Payment |
| Jul 15 – Sep 15 | **arrival peak** (Chinese arrivals cluster Aug 1–25) | Kit at full EV; airport pickup; roommate matching; lease takeovers | Kit (peak), Secure Payment, sponsors |
| Sep 15 – Nov 15 | settled; roommate changes; secondhand | buddy events; "invite your roommate" referral push | retention |

---

## 5. 30 / 60 / 90-day plan (Day 0 = 2026-11-16)

### Days 0–30 — first dollars, Chicago + Champaign

**Ships:** billing module with mock checkout (test-mode banner) and, behind `BILLING_LIVE`, real Stripe Checkout for boosts and Pro; wallet ledger, promo codes, referral credits; Newcomer Kit with tracked `/api/billing/partners/:slug/go` links and bilingual cards; sponsor booking model (sales on paper, admin enters bookings); admin revenue dashboard v1; lease-proof badge (`verify`, manual review); first-message scam banner naming Zelle/CashApp/Alipay/WeChat Pay deposits, "I'm abroad", overpayment checks; share card (image + QR) on every listing/item/buddy post; publish-time boost upsell with credits pre-applied.
**Campuses:** wave 0 (5). Nationwide toggle on for all 66.
**Partnerships:** Day 1–3 Amazon Associates, Impact (Lemonade, Mint, Visible, Remitly), Wise, Airalo; Day 3–10 CJ/FlexOffers applications for Chase/Discover/BofA, direct emails to Deserve EDU and Zolve; Day 7–14 three Evanston founding sponsors (boba on Davis St, one airport car service, one local mover) at the founding rate; Day 10–30 twenty founding landlords (10 Evanston, 10 Champaign) on trials; Day 14 CORT campus rep and Collegeboxes/Storage Scholars for the May Kit; Day 10 Stripe Connect platform application filed; Day 5 counsel engaged on a fixed-fee memo.
**Targets by Day 30:** ≥ $800 recognized across ≥ 3 streams; 1,200 MAU; 300 listings; 120 Kit outbound clicks/day; 20 Pro trials; 3 sponsors signed; 600 L1 / 150 L2 / 40 L3.

### Days 31–60 — pre-leasing towns, spring intake, recurring revenue

**Ships:** Pro+ (CSV import, seats, lead export); Verified Building page type; Nationwide Spotlight; move-out bundle boost; boost analytics in the owner dashboard ("+312 views from your boost"); weekly bilingual digest per campus (sponsor slot inside); wanted → landlord demand email; buddy group-invite loop (invitee must verify `.edu` to join); referral second trigger; Secure Payment in Stripe Connect **sandbox** end-to-end behind `escrow.enabled=false`; admin: sponsor inventory calendar, affiliate reconciliation, ambassador management, referral-fraud panel.
**Campuses:** wave 1 (+5 → 10).
**Partnerships:** Pro outbound to 300 contacts across Champaign, Ann Arbor, Madison, West Lafayette, Columbus; 2 PBSA operators for Verified Building pilots (Campustown new-builds, Ann Arbor); spring-intake Kit push on XHS + 5 CSSA chapters (co-branded Kit page, disclosed $2/conversion community kickback); 5 campus ambassadors hired; CORT at all live campuses; bank/card programs targeted live by Jan 5.
**Targets by Day 60:** $2.2k in Dec and a $6k run-rate entering January; 2,800 MAU; 40 paying Pro/Pro+; 8 sponsors; 2 PBSA pilots; 3,500 L1 / 1,000 L2 / 250 L3.

### Days 61–90 — coasts, intern-season set-up, counsel

**Ships:** city landing pages (`/city/seattle`, `/city/san-francisco`, `/city/new-york`, …) with SEO + XHS-shareable price tables; campus insights widget; FHA wording linter on listings and sponsor creative; campus P&L view; ambassador commission statements; Secure Payment ready for IL go-live pending the counsel memo; Kit "No-SSN" labels verified with screenshots.
**Campuses:** wave 2 (+10 → 20), covering every summer-intern destination.
**Partnerships:** direct (non-network) rates with Mint/Ultra Mobile and Discover for the Jul–Sep peak, locked by Mar 31; Lemonade/Toggle "required by your building?" card inside the Secure Payment and lease-takeover flows; sponsor sales to 8 lit campuses via ambassadors; 3 more Verified Building operators (Boston/LA/Seattle) for the August lease-up; conversations with 3 international-student offices (NU OISS, UIUC ISSS, UW ISS) about the scam-pattern page and the year-2 report.
**Targets by Day 90:** **$10k+ in February**; 5,500 MAU; 90 paying Pro/Pro+; 14 sponsors; 5 Verified Buildings; counsel memo in hand; Stripe Connect approved; 7,000 L1 / 2,200 L2 / 700 L3.

---

## 6. 12-month revenue projection (Nov 2026 – Oct 2027, USD thousands, recognized revenue; affiliate cash lags 30–60 days)

Boosts are shown **net of credits redeemed** (cash). Secure Payment = fee only (GMV held is not revenue).

### 6.1 Base case (45 campuses by Oct, 30 by April; Secure Payment live in 6 states from May)

| | Nov | Dec | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | **Year** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Campuses live | 5 | 10 | 16 | 20 | 24 | 28 | 30 | 32 | 36 | 40 | 42 | 45 | |
| MAU (k) | 1.2 | 2.8 | 5.5 | 8 | 11 | 14 | 15 | 12 | 16 | 26 | 24 | 16 | |
| Newcomer Kit | 0.3 | 0.8 | 2.5 | 2.8 | 4 | 8 | 10 | 14 | 36 | 62 | 30 | 8 | **178.4** |
| Boosts + Spotlight (cash) | 0.2 | 0.6 | 1.5 | 2.5 | 5.5 | 8.5 | 9 | 4.5 | 5.5 | 9 | 7 | 3.5 | **57.3** |
| Landlord Pro / Pro+ | 0 | 0.3 | 1.2 | 2.6 | 3.5 | 4.5 | 5 | 5.3 | 5.8 | 6.5 | 7 | 7.2 | **48.9** |
| Sponsors + Verified Building | 0.2 | 0.5 | 1.5 | 3 | 4 | 5.5 | 6 | 6 | 7.5 | 10 | 10 | 8 | **62.2** |
| Secure Payment fee | 0 | 0 | 0 | 0 | 0.5 | 2.5 | 4 | 3.5 | 4.5 | 9 | 7 | 2.5 | **33.5** |
| **Total** | **0.7** | **2.2** | **6.7** | **10.9** | **17.5** | **29** | **34** | **33.3** | **59.3** | **96.5** | **61** | **29.2** | **≈ 380** |
| Cumulative | 0.7 | 2.9 | 9.6 | 20.5 | 38 | 67 | 101 | 134 | 194 | 290 | 351 | 380 | |

### 6.2 Conservative (30 campuses; bank/card affiliate programs decline non-SSN applicants or approve late — Kit at 50%; Secure Payment stays in test mode all year)

| | Nov | Dec | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | **Year** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Campuses live | 4 | 8 | 12 | 16 | 18 | 20 | 22 | 24 | 26 | 28 | 30 | 30 | |
| Newcomer Kit | 0.1 | 0.4 | 1.2 | 1.4 | 2 | 4 | 5 | 7 | 18 | 31 | 15 | 4 | **89.1** |
| Boosts + Spotlight (cash) | 0.1 | 0.4 | 1 | 1.6 | 3.6 | 5.5 | 5.9 | 2.9 | 3.6 | 5.9 | 4.5 | 2.3 | **37.3** |
| Landlord Pro / Pro+ | 0 | 0.2 | 0.8 | 1.7 | 2.3 | 2.9 | 3.2 | 3.4 | 3.8 | 4.2 | 4.5 | 4.7 | **31.7** |
| Sponsors + Verified Building | 0.1 | 0.3 | 0.8 | 1.7 | 2.2 | 3 | 3.3 | 3.3 | 4.1 | 5.5 | 5.5 | 4.4 | **34.2** |
| Secure Payment fee | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| **Total** | **0.3** | **1.3** | **3.8** | **6.4** | **10.1** | **15.4** | **17.4** | **16.6** | **29.5** | **46.6** | **29.5** | **15.4** | **≈ 192** |

### 6.3 Aggressive (60 campuses by Oct; direct bank/card deals land before the peak; Secure Payment in 8 states; Verified Viewing pilot from Feb)

| | Nov | Dec | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | **Year** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Campuses live | 5 | 12 | 20 | 26 | 30 | 34 | 38 | 42 | 48 | 55 | 58 | 60 | |
| Newcomer Kit | 0.5 | 1.2 | 3.9 | 4.3 | 6.2 | 12.4 | 15.5 | 21.7 | 55.8 | 96.1 | 46.5 | 12.4 | **276.5** |
| Boosts + Spotlight (cash) | 0.3 | 0.9 | 2.2 | 3.6 | 8 | 12.3 | 13 | 6.5 | 8 | 13 | 10.2 | 5.1 | **83.1** |
| Landlord Pro / Pro+ | 0 | 0.4 | 1.6 | 3.4 | 4.5 | 5.9 | 6.5 | 6.9 | 7.5 | 8.5 | 9.1 | 9.4 | **63.7** |
| Sponsors + Verified Building | 0.3 | 0.7 | 2 | 4.1 | 5.4 | 7.4 | 8.1 | 8.1 | 10.1 | 13.5 | 13.5 | 10.8 | **84** |
| Secure Payment fee | 0 | 0 | 0 | 0 | 0.8 | 3.8 | 6 | 5.2 | 6.8 | 13.5 | 10.5 | 3.8 | **50.4** |
| Verified Viewing (pilot) | 0 | 0 | 0 | 0.5 | 1.5 | 2.5 | 3 | 2 | 4 | 7 | 4 | 1.5 | **26** |
| **Total** | **1.1** | **3.2** | **9.7** | **15.9** | **26.4** | **44.3** | **52.1** | **50.4** | **92.2** | **151.6** | **93.8** | **43** | **≈ 584** |

### 6.4 Cost side and cash need (base case)

| Line | Year 1 | Notes |
|---|---|---|
| COGS (Stripe/ACH fees, ambassador commissions, SMS/email) | ≈ $34k | blended gross margin ≈ 91% |
| Ambassadors (stipends + bounties; commissions in COGS) | ≈ $60k | 45% variable; paid only while a campus is lit |
| Ops & verification (part-time from M3, 2 people from M8) | ≈ $30k | manual ID review ≈ $1/L2, $2.50/L3 + lease-proof |
| Sales lead (from M4) + marketing (XHS/WeChat content, peak pushes) | ≈ $50k | |
| Legal (counsel memo M2–M3, state follow-ups, BIPA/ToS/1099 templates, retainer) | ≈ $30k | |
| Hosting / tools | ≈ $8k | |
| Founders (unpaid M1–M6; $4k each from M7) + 1 engineer from M4 | ≈ $100k | |
| **Total costs** | **≈ $310k** | |
| **Operating result** | **≈ +$70k** | cash trough ≈ −$35k in Mar (affiliate receivables lag + legal) → **plan for $100k of runway**; the August peak (25% of annual revenue) must be banked for the Nov–Feb trough |

Sensitivities: Kit −50% → year ≈ $290k, still positive; Secure Payment at $0 → −$33k; +10 campuses lit by July → +$15k Kit in August at ≈ $5k ambassador cost; every ±5 points of lease-proof share moves boost revenue ≈ ±$400/month in April.

---

## 7. KPIs and dashboards

**North-star:** verified on-platform closes per month (listings marked rented with ≥ 1 in-app conversation, plus funded Secure Payments). Everything else is a driver of it.

| Area | KPI | Definition / target |
|---|---|---|
| Density (per campus) | **Weekly listing reply rate** | live sublets with ≥ 1 inbound message in 7 d ÷ live sublets; ≥ 40% = lit |
| | registered, L1/L2/L3 share, MAU/WAU/DAU, live sublets / items / buddy posts, chats/day | L2 ≥ 35%, L3 ≥ 12% of MAU by month 6 |
| | campus stage, days in stage, ignition cost | ≤ $2,300 per lit campus |
| Growth | K-factor (28 d) | (share signups + qualified referrals) ÷ distinct active users; ≥ 0.4 in season |
| | shares → opens → signups by channel (wechat/xhs/sms/copy/qr) | |
| Trust | verification SLA (median hours, backlog by type), approve/reject rate with reasons | L2 median ≤ 24 h |
| | lease-proof share of live sublets | ≥ 60% at lit campuses |
| | fraud rate = upheld reports ÷ live listings; off-platform-payment warnings shown vs Secure Payments started; dispute rate; "revenue at risk" (boosts on listings under review) | fraud rate < 0.5% |
| Revenue | gross by stream (stacked), credits contra line, cash vs recognized (affiliate pending/approved/reversed), MRR (Pro, Pro+, sponsors, building pages), ARPU by trust level, revenue per MAU, per-campus revenue leaderboard | revenue/MAU ≥ $2.0 in April, ≥ $3.5 in August |
| Funnels | boost: picker open → tier select → checkout start → paid (by campus, entity type, surface) | ≥ 12% of eligible sublets boosted in April |
| | Pro: trial → paid → churn cohorts | trial→paid ≥ 50%, churn ≤ 6%/mo |
| | Kit: view → card view → click → self-reported done → partner-confirmed conversion (by partner, campus) | approval rate alert < 40% |
| | Secure Payment: proposed → accepted → funded → released; disputes | dispute rate < 3% |
| Sponsors | slot inventory per campus, impressions/clicks, invoice status, churn | |

Dashboards (admin module; spec in `docs/modules/admin-requirements.md`): Overview, Revenue, Campus Ignition board, Trust, Funnels, Affiliate reconciliation, Sponsor inventory, Secure Payment ops, Audit log. All campus-filterable with a nationwide total, date range, CSV export.

---

## 8. Legal and compliance checklist

| # | Item | Rule | Owner / when |
|---|---|---|---|
| 1 | **Secure Payment structure** | Stripe Connect destination charges + delayed/manual payouts, platform never custodies; no "escrow" in any UI/marketing string; fallback for states counsel will not clear = licensed provider (Escrow.com API, ~3.25% [est]) with our 3% as a convenience/referral layer | counsel memo by Day 75; Stripe Connect application Day 10 |
| 2 | **Money-transmission posture** | FinCEN MSB and state MTL analysis for IL, NY, CA, MA, WA, MI (and 9th-Circuit states); state-by-state `escrow.enabled` flag, IL first | counsel; go-live per state only on written clearance |
| 3 | **State security-deposit statutes** | IL 765 ILCS 710, NY GOL §7-108, CA Civ §1950.5, MA c.186 §15B applied to sublet deposits held on behalf of a sublessor; receipt and interest rules where applicable | counsel memo |
| 4 | **Deposit Protection (phase 2)** | drafted as a conditional platform refund policy (not insurance), capped, reserve-funded; re-reviewed when monthly held GMV > $250k | counsel before month 7 |
| 5 | **Fair Housing Act §3604(c)** | no protected-class preferences on whole-unit listings; gender/language preferences only on `shared_living = true` as optional fields (9th Cir. *Roommate.com*; §230 is lost if we *require* the answer); fair-housing notice on the post form; FHA wording linter for listings and sponsor creative; paid products never rank by protected class | listings + admin modules; Day 60 |
| 6 | **ID documents / BIPA (740 ILCS 14)** | manual human review, no face-matching vendor until BIPA-grade written consent + published retention schedule; encrypted at rest; delete 30 days after decision; never shown to counterparties; every admin view audit-logged; passport numbers never in `events`; CCPA/CPRA deletion honored; TX/WA biometric laws, NY SHIELD on breaches | verify module; from day 1 |
| 7 | **Affiliate disclosure (FTC Endorsement Guides)** | 「赞助 Sponsored」 label on every card, link and digest line; page-level disclosure; publisher programs only; `rel="sponsored"` on anchors; read every IO for bans on third-party incentives before promising user bonuses | billing + ops; day 1 and quarterly |
| 8 | **Stripe acceptable use** | boosts/Pro/sponsors are merchant sales of our own service (no licensing); Stripe Radar rules for velocity, prepaid cards, mismatched country | billing |
| 9 | **CAN-SPAM / TCPA** | digest emails with unsubscribe; phone verification SMS OK; marketing SMS only with express consent | scaffold/notifications |
| 10 | **Section 230** | we host user listings; never require discriminatory inputs; moderation decisions logged | all modules |
| 11 | **Ambassadors / tax** | W-9/1099 for cash-paid ambassadors; F-1 students default to credits/university-routed stipends; template reviewed by counsel month 4 | ops |
| 12 | **Terms, privacy, refund policy** | ToS, privacy policy (incl. ID retention), boost refund policy, Secure Payment terms, sponsor IO template, bilingual | before Day 0 (affiliate approvals require them) |
| 13 | **Shuttle data licensing** | GTFS importer for open feeds; "approximate — see official tracker" for TripShot/DoubleMap campuses; no ToS-violating scraping | shuttle module |

---

## 9. Risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Holding deposits is money transmission; Stripe prohibits escrow businesses; the guarantee may be insurance** | No custody (Connect delayed payouts), no "escrow" wording, counsel before go-live, state-by-state flag, mock labelled "test mode" until then; the P&L is valid with this stream at **$0** (conservative case); Deposit Protection only in phase 2 as a capped refund policy; licensed-provider fallback |
| 2 | **Fraud riding on paid features** — cloned listings boosted to the top, unauthorized sublessors, double deposits, fake affiliate conversions, stolen cards, credit farming | lease-proof/landlord-proof gates for 14 d+ and plus/max boosts; L2 for `max`; moderation `ok` for any boost; two reports auto-pause with funds held; nationwide perceptual-hash duplicate-photo check; one open Secure Payment per listing per move-in date; payee L3 + badge; scam banner on first message; Stripe Radar; affiliate `subid` reconciliation against network CSVs; credits boost-only with IP/UA/payment-fingerprint clustering and one-click void; fraud loss ratio target < 0.5%, per-campus kill switch at 1.5% |
| 3 | **Chicken-and-egg across 66 campuses** | the state machine (§4): no ignition without an ambassador and seeded supply; ≤ 6 ignitions/month; sequence by where revenue does not depend on peer supply (pre-leasing towns for Pro/Verified Building, newcomer metros for Kit); concierge posting only with the poster's permission; Founding Landlord discount and 2-listing free cap; wanted module and nationwide toggle make a thin campus useful; metro cohorts share supply; a campus that fails ignition twice is parked |
| 4 | **Seasonality** — Kit ≈ 25% of annual revenue in August; boosts Mar–May; Nov–Feb trough; June low | recurring lines (Pro/Pro+, sponsors, building pages) targeted at 35% of revenue by M12; annual Pro pulls cash forward Jan–Apr; co-op/spring-intake and OPT relocations marketed year-round; ambassador base paid only while lit, ~45% variable; bank 3 months of opex from the August peak; cash plan assumes the June low |
| 5 | **Distribution dependence on WeChat / Xiaohongshu** (link throttling, blocked share cards, group admins who are 中介, XHS contact-info suppression) | share artefacts are **images with QR codes** plus plain HTTPS links with Open Graph cards (no mini-program); every user has an owned channel (email + opt-in SMS digest, in-app bell, PWA); XHS official account per metro; SEO campus/city landing pages so "UIUC 转租" and "Seattle intern sublet" rank without any group; ambassadors create our own campus groups once lit; Discord/WhatsApp/Telegram templates for the Indian cohort from month 4; CSSA chapters and off-campus-housing offices as official referral partners; trust artifacts (badges, lease-proof history, protection record) are a switching cost that cannot be exported to a group chat |
| 6 | **Affiliate program dependency** — bank programs cap, pause or reject non-SSN applicants; some forbid third-party incentives | ≥ 2 partners per category; publisher programs only; direct deals (Discover, Mint/Ultra, Deserve/Zolve) negotiated before the Jul–Sep peak; approval-rate alerts; conservative case already assumes Kit at 50% |
| 7 | **BIPA / ID-data liability at an Illinois launch campus** | manual review, 30-day deletion, encryption, audit log, no biometrics until consent + retention schedule are in place |
| 8 | **Small-team execution load** (sales + ops + moderation + 45 campuses) | revenue-first sequencing funds hires from M4; ambassadors do campus ops; admin tooling (queues, SLAs, fraud panel) specified before scale; cadence caps are hard rules, not aspirations |

---

### Appendix — what this plan says no to

No paid verification or fast-track badges · no boosts for unreviewed supply · no boost that changes organic ranking · no sponsor in search results or on safety surfaces · no seeker-side paywall of any kind · no individual referral codes in the Kit · no partner ranked by payout · no "escrow" wording, no custody, no Secure Payment in an uncleared state · no biometric ID matching without BIPA-grade consent · no protected-class preferences outside `shared_living` · no cash-out of credits · no buying WeChat group admins · no scraping groups to seed listings · no more than 6 campus ignitions per month.
