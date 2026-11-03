# Strategy — Revenue-First Lens

> Lens: **fastest path to meaningful revenue** (first dollar in week 1, $10k/month as early as realistic) without crossing a trust line. Scope is **nationwide** (66 seeded campuses in `docs/data/campuses.json`, ~1.18M international students); Northwestern is only the first campus switched on.
> Inputs: `docs/BRIEF.md` (product, trust ladder, §6 commercialization principles) and `docs/MARKET.md` (every benchmark below is tagged there as [fact] or [estimate]; this doc inherits those tags and does not re-cite).
> Calendar: Day 0 = **Mon 2026-11-16** (launch). Month 1 = Nov 2026 … Month 6 = **Apr 2027** (sublet posting peak) … Month 12 = Oct 2027. All money in USD.

---

## 1. Positioning and the one-sentence promise

**Positioning.** The verified, bilingual housing-and-arrival marketplace for international students at every US campus — the place where the sublet, the deposit, the furniture, the airport ride and the bank account all happen with verified people, so nobody has to trust a stranger in a 500-person WeChat group.

**One-sentence promise (user-facing):** 认证的人、认证的房源、安全付款，全美校园一张地图。 / *Verified people, verified listings, money handled safely — every US campus on one map.*

**Revenue-first corollary (internal):** every dollar comes from one of three honest sources — (a) a partner pays us for a newcomer we delivered, (b) a seller pays for *labelled* visibility, (c) a landlord/business pays for access to a verified student audience. We never charge a student to see a listing, to message, to report, or to be verified. That rule is what makes (a)–(c) worth paying for.

**Why this lens picks these streams, in this order.** Time-to-first-dollar beats size in the first 90 days because cash funds campus expansion and campus count multiplies every other stream. Ranked by (days to first dollar × gross margin × seasonality fit with a mid-November launch):

| Rank | Stream | First dollar | Why it ranks here |
|---|---|---|---|
| 1 | Newcomer Kit affiliate hub | Day 3–7 | Zero licensing, zero COGS, programs approve in hours (Amazon, Impact); spring intake in Jan, peak Jul–Sep |
| 2 | Boosts (sublet / item / buddy) + Nationwide Spotlight | Day 7–10 | Stripe Checkout as a merchant (no money transmission); demand explodes late Mar–May |
| 3 | Landlord Pro / Pro+ (B2B subscription) | Day 20–45 | Only recurring line; pre-leasing towns buy Jan–Apr; sold by outbound, not waiting for traffic |
| 4 | Sponsored placements (local businesses, per campus) | Day 10–20 | Sold face-to-face in Evanston in week 2; scales via campus ambassadors on commission |
| 5 | Verified Building (PBSA / property-manager referral) | Day 45–75 | $500/mo page + $300 per signed lease; contract cycle is the only delay |
| 6 | Secure Payment service fee (3%) | Day 90–150, gated by counsel | Highest trust value, lowest margin until ACH; must not be called "escrow" |
| 7 | Seeker Pass (alerts + nationwide multi-city search) | Day 75 | Small, but pure margin; must never gate contact or safety |

---

## 2. Revenue streams, ranked

Shared modelling assumptions (used in every month-6 calculation):

- **Campuses live at month 6:** 16 (Chicago metro 4: Northwestern, UChicago, UIC, Illinois Tech; pre-leasing towns 4: UIUC, Michigan, Wisconsin, Purdue; NYC 2: NYU, Columbia; Boston 3: Northeastern, BU, Harvard/MIT counted as Boston cluster; West Coast 3: USC, UC Berkeley, UW). Rest of the 66 are browsable with seed data and a "request my campus" prompt, and all 66 accept nationwide listings.
- **MAU at month 6:** 10,000 (≈3% of the ~330k international students at those 16 campuses). Trajectory: M1 1.2k → M2 2.5k → M3 4.5k → M4 6.5k → M5 8.5k → M6 10k.
- **Attribution leakage** on affiliates: 30% (users copy the link into WeChat, clear cookies, or get declined) — applied to every Kit number.
- Stripe card cost 2.9% + $0.30; ACH 0.8% capped at $5.

### 2.1 Newcomer Kit — affiliate hub (rank 1)

- **Pricing (what partners pay us, per approved conversion, publisher programs only):** bank account $75 (Chase/BofA/Wells via CJ/FlexOffers; range $50–150), student/no-SSN credit card $75 (Discover, Deserve EDU, Zolve; $50–100), SIM/eSIM $20 (Mint, Visible via Impact; Airalo $2–8), renters insurance $20 (Lemonade via Impact: $15/lead, $20–25.50/policy), money transfer $18 (Wise $10–25, Remitly $15–30), movers/storage/furniture $35 (Dolly/Lugg $10–20, PODS/U-Haul $15–50, CORT $25–75), Amazon Prime Student $3 bounty, airport pickup lead $5–15.
- **Who pays:** the partner / the affiliate network (Impact, CJ, FlexOffers, Amazon Associates, Wise Partners). The student pays nothing and sees "推广 / Sponsored" plus the partner's own public bonus ("you get $300").
- **Time to first dollar:** Day 3–7. Amazon Associates and Impact publisher accounts approve in <48h; Lemonade, Mint, Visible, Wise and Remitly are live-in-days programs. Bank cards (CJ/FlexOffers) take 1–3 weeks of approval and are the big-ticket items for the Jan spring intake.
- **Assumptions:** EV per *peak-season* engaged newcomer ≈ $43 (MARKET §5.1) before the 30% leakage haircut → **$30 net**. Off-season Kit openers (summer interns, OPT relocators, Fall-2027 admits browsing pre-arrival) convert mostly on renters insurance, movers/storage, Wise and Prime: **EV ≈ $6 net**. Kit open rate = 11% of MAU in Apr, 35% of newcomer-heavy MAU in Aug.
- **Month-6 (April 2027) estimate:** 16 campuses → 10,000 MAU × 11% Kit openers = 1,100 × $6 net EV = **$6,600**. (Peak month Aug 2027 for comparison: 277k new international enrollments × 1.5% year-1 reach ≈ 4,200 engaged newcomers spread Jun 10% / Jul 25% / **Aug 45%** / Sep 20% → Aug ≈ 1,900 × $30 = ~$55k.)
- **Trust safeguard:** every Kit card carries "推广 / Sponsored — we earn a referral fee"; recommendations are ranked by a published rubric (no-SSN friendly, fee-free, campus branch nearby), never by payout; at least one non-paying option per category (e.g. the campus credit union); referral codes belonging to individuals are never used (publisher programs only, per Chase/Discover ToS); no payout-based re-ordering inside the admin UI — the rubric is data, the payout is a separate column.

### 2.2 Boosts (rank 2)

- **Pricing (exact):**
  - Sublet boost: **$9 / 3 days, $19 / 7 days, $39 / 14 days, $69 / 30 days**. Add-on **Nationwide Spotlight +$10** (listing also appears in the nationwide feed and in "matches for you" for cross-city wanted posts).
  - Item boost: **$2.99 / 1 day, $4.99 / 3 days, $9.99 / 7 days**; Move-out bundle boost (sublet + up to 20 items) **$9.99 / 7 days**.
  - Buddy/event boost: **$1.99 / 1 day, $4.99 / 3 days**.
  - Bundle: "Moving out" pack = 14-day sublet boost + bundle boost = **$44** (saves $5).
- **Who pays:** the sublessor / seller / event host. Landlords on Pro get 2 included 7-day boosts per month; the rest pay per boost.
- **Time to first dollar:** Day 7–10 (live Stripe Checkout keys in the billing module, replacing the demo mock as soon as the entity and Stripe account exist).
- **Assumptions:** 20% of MAU post a sublet in April (posting peak; 45–55% of annual listings land Mar–May, oversupply pushes sellers to pay for visibility); paid-boost rate 12% of new listings (SpareRoom-style Bold uptake; FB Marketplace boost is the alternative at $1–5/day with no campus targeting); tier mix 40% $9 / 30% $19 / 20% $39 / 10% $69 → **avg $24**; 25% of boosters add Nationwide Spotlight. Items: 1,500 posted in April, 6% boosted at avg $5.50. Buddy: 400 posts, 4% at $3.
- **Month-6 estimate:** sublets 10,000 × 20% = 2,000 listings × 12% = 240 boosts × $24 = $5,760; Spotlight 240 × 25% × $10 = $600; items 1,500 × 6% × $5.50 = $495; buddy 400 × 4% × $3 = $48; moving-out packs ~5 × $44 = $220 → **≈ $7,100**.
- **Trust safeguard:** boosted cards are labelled "推广 / Featured" in both languages; at most **2 featured slots per 10 results** (positions 1 and 6), everything else ranked purely by relevance/recency; a boost is only purchasable for a listing that (a) belongs to a trust-level ≥1 user, (b) passed moderation, (c) has no protected-class preference text (whole-unit listings) — boosts ≥14 days additionally require the **lease-proof badge**; boosts never reorder search for unpaid listings and never touch the map's pin density; if we remove a boosted listing for *our* error we auto-refund, if for policy violation we do not (stated at checkout).

### 2.3 Landlord Pro / Pro+ (rank 3 — B2B, outbound-sold)

- **Pricing (exact):** Free landlord account = up to **2 active long-term listings**, basic stats. **Pro $29/mo or $249/yr** (unlimited listings, lead inbox with verified-student badges, analytics, Pro badge, priority verification, 2 × 7-day boosts/month, bilingual auto-translation of listings). **Pro+ $79/mo or $699/yr** for property managers with 5+ units (everything in Pro + CSV/API import, featured building page, team seats ×5, lead export, 6 boosts/month). **Founding Landlord** offer: first 100 landlords who sign before 2027-02-28 get Pro at $14.50/mo for 12 months (50% off) — it buys supply in the pre-leasing towns where it matters.
- **Who pays:** landlords, agents, property managers near campus (the `landlord` role in BRIEF §2).
- **Time to first dollar:** Day 20–45 (60-day founding trials start Day 10; first annual plans close ~Day 20 from managers who want the badge before January pre-leasing).
- **How it's sold:** outbound list built from the public landlord rosters on university off-campus-housing portals (Places4Students / Off Campus Partners white-labels at UIUC, Michigan, Wisconsin, Purdue, Ohio State), Zillow/Apartments.com listings within 1 mile of campus, and Google Maps "student apartments". Pitch: "Chinese/Indian students are 15–25% of your tenants and they're not on Zillow — they're in WeChat groups you can't reach. $29/mo puts your building in front of verified students, in their language, with a lead inbox." Target 60 contacts per town, 15% trial, 50% trial→paid.
- **Assumptions by month 6:** 10 towns worked × 60 contacts = 600 contacts → 90 trials + ~120 inbound sign-ups driven by the 2-listing free cap → **130 Pro** (blended $24/mo after Founding discounts and annual amortization) + **18 Pro+** (blended $65).
- **Month-6 estimate:** 130 × $24 + 18 × $65 = $3,120 + $1,170 = **≈ $4,300 MRR** (monthly churn assumption 6%).
- **Trust safeguard:** Pro buys tools and a badge that says "Pro landlord · identity verified", never ranking (Pro listings rank like any other; their included boosts are labelled like any other boost); every Pro landlord must reach trust level 3 (ID + phone + payment method) before the badge shows; lead inbox shows students' trust badges but never their ID documents; a Pro subscription can be suspended without refund for a confirmed fair-housing or scam report.

### 2.4 Sponsored placements — local businesses, per campus (rank 4)

- **Pricing (exact, per campus per month):** **Local Sponsor $150** (sponsored map POI pin + one Kit category card, e.g. a mover under "Movers", a boba shop under "Near campus"); **Feed Sponsor $350** (one labelled "Sponsored" card in that campus's listings or market feed, capped at 1 per 10 results, plus Local Sponsor benefits); **Campus Partner $600** (both + sponsor slot in the weekly bilingual digest email + "sponsored by" on one buddy event per month). Founding rate for the first 3 sponsors per campus: 50% off for 3 months.
- **Who pays:** boba/restaurants, movers, bike shops, airport car services (the NU "My Limo Time"-type operators already charging $48–149 a run), furniture rental (CORT campus reps), local bank branches, phone stores, Chinese supermarkets, driving schools.
- **Time to first dollar:** Day 10–20 (sold in person on Davis St / Sherman Ave in Evanston; invoice via Stripe Invoicing, card or ACH).
- **Assumptions:** 1 founder sells Evanston + Chicago; from Day 45, campus ambassadors (students, 20% commission + $150/mo stipend) sell their own campus with a one-page rate card. By month 6, 8 of 16 campuses have ≥1 paying sponsor, avg 1.6 sponsors per sold campus, avg ticket $280 after founding discounts.
- **Month-6 estimate:** 8 campuses × 1.6 × $280 = **≈ $3,600**.
- **Trust safeguard:** "Sponsored / 推广" label on every sponsored pin, card and digest line; sponsored cards never displace a listing (they are additional rows, capped 1 in 10); sponsors cannot buy placement in the scam-warning banner, verification pages or safety pages; sponsor content is moderated like any listing and must pass fair-housing wording checks if it is housing-related.

### 2.5 Verified Building — PBSA & property-manager referral (rank 5)

- **Pricing (exact):** **$500/mo** per building page ("Verified building · tours offered in 中文", photos, floor plans, live availability, direct lead form) **+ $300 per signed lease** attributed to us (12-month lease; $150 for ≤6-month). Alternative for operators who prefer pure performance: **$0/mo + 6% of first-year rent** (uhomes/Amber charge operators est. 5–12%).
- **Who pays:** purpose-built student-housing operators and large managers near campus (American Campus Communities, Core Spaces, Landmark, Greystar student portfolios, local 200+ unit managers in Champaign/Ann Arbor/Madison/West Lafayette/Tempe/Denton).
- **Time to first dollar:** Day 45–75 (regional marketing managers sign monthly pilots fast when the pitch is "we are where your Chinese and Indian applicants already are, and you pay only for pages + signed leases").
- **Assumptions by month 6:** 3 buildings on page fees + 4 attributed leases in April (pre-leasing for Aug).
- **Month-6 estimate:** 3 × $500 + 4 × $300 = **≈ $2,700**.
- **Trust safeguard:** Verified Building pages are a separate, clearly labelled layer on the map ("Verified building · partner") and never appear inside peer-sublet results; attributed-lease reporting is shared with the operator via a monthly statement (no hidden commission — the student sees "we receive a referral fee from this building"); we never charge the student a "服务费".

### 2.6 Secure Payment service fee (rank 6 — gated)

- **Pricing (exact):** **3% of the amount sent, min $5, cap $60**, paid by the payer (optional 1.5%/1.5% split chosen by the host). Deposits ≥ $500 are **ACH-only** (Stripe ACH 0.8% capped $5) so the fee is contribution-positive; card allowed under $500. Rent "bridge" payments (1–3 months furnished) use the same fee. The UI calls it **安全付款 / Secure Payment**, never "escrow".
- **Who pays:** the subtenant (payer) by default.
- **Time to first dollar:** Day 90–150, only after (a) counsel memo on Stripe Connect destination charges + delayed payouts (funds in Stripe's balance until move-in confirmation, released ≤90 days) and state deposit statutes (IL 765 ILCS 710, NY GOL §7-108, CA Civ §1950.5, MA c.186 §15B), (b) Stripe Connect platform approval, (c) go-live in **IL first** (launch state), then NY/CA/MA/WA/MI one at a time. Until then the module ships the mock checkout from the brief, labelled "demo".
- **Assumptions:** 1.5% of April sublet matches use Secure Payment in IL only (45 payments), avg deposit $1,100 → avg fee $33.
- **Month-6 estimate:** 45 × $33 = **≈ $1,500** (base case keeps this at $0 if counsel slips; it is upside, not plan).
- **Trust safeguard:** both parties must be trust level 3; release only on payer's move-in confirmation or 7-day auto-release after the move-in date with dispute hold; a dispute freezes funds and routes to the admin moderation queue; we never take custody outside Stripe; the fee is shown as a separate line item before payment; no "pay to unlock contact" anywhere.

### 2.7 Seeker Pass (rank 7)

- **Pricing (exact):** **$4.99/mo or $29.99/yr.** Free users keep: unlimited browsing, messaging, 1 active wanted post, saved searches with a daily digest. Pass adds: instant push/email alerts (<1 min) on saved searches, multi-city nationwide alerts (intern season), 3 active wanted posts, "matches for you" expanded to 20, price-history panel.
- **Who pays:** seekers relocating for internships/OPT who need to be first on a Seattle/SF/NYC sublet.
- **Time to first dollar:** Day 75 (ships with the nationwide-alerts feature in the 60–90 window).
- **Assumptions:** 1.2% of MAU in April (intern season starts) → 120 subscribers.
- **Month-6 estimate:** 120 × $4.99 = **≈ $600**.
- **Trust safeguard:** Pass never gates contacting a host, seeing a listing, or any safety feature; no SpareRoom-style "Early Bird" (pay to contact new ads first) — alerts are about *your* saved search speed, not about locking others out; the free daily digest stays.

### 2.8 Month-6 total and the path to $10k/month

| Stream | Month 6 (Apr 2027) | Math |
|---|---|---|
| Newcomer Kit | $6,600 | 10,000 MAU × 11% × $6 net EV |
| Boosts | $7,100 | 2,000 listings × 12% × $24 + add-ons |
| Landlord Pro / Pro+ | $4,300 | 130 × $24 + 18 × $65 |
| Sponsored placements | $3,600 | 8 campuses × 1.6 × $280 |
| Verified Building | $2,700 | 3 × $500 + 4 × $300 |
| Secure Payment (upside) | $1,500 | 45 × $33 |
| Seeker Pass | $600 | 120 × $4.99 |
| **Total** | **≈ $26,400** (range $18k–32k) | base case without Secure Payment ≈ $24.9k |

**$10k/month is crossed in Month 4 (Feb 2027):** spring-intake Kit $2.4k + boosts $2.0k + Pro $2.6k (pre-leasing season) + sponsors $2.2k + first Verified Building $1.0k = $10.2k. Driver is B2B (Pro + sponsors + PBSA = 57% of that month), which is why the 30/60/90 plan front-loads outbound sales, not traffic.

---

## 3. 30 / 60 / 90-day plan

### Days 0–30 (Nov 16 – Dec 15): first dollars, Chicago + Champaign

**Ships**
- Billing module live with **real Stripe Checkout** (hosted) for boosts and Pro behind a `BILLING_LIVE` flag; mock stays for demo/test. Wallet ledger, promo codes, referral credits ($5 boost credit per verified referral).
- Newcomer Kit hub with tracked `/go/:partner` links, bilingual cards, "Sponsored" labels; conversions ingested via Impact postback + CSV import.
- Sponsored slots data model + admin booking screen (sales happen on paper; admin enters bookings).
- Admin revenue dashboard v1 (daily revenue by stream, affiliate clicks/conversions, boost funnel).
- Lease-proof badge in `verify` (manual review) — required for 14/30-day boosts.

**Campuses switched on:** Northwestern (rich), UChicago, UIC, Illinois Tech, UIUC. Nationwide toggle on for all 66.

**Partnerships to sign first, and how**
1. **Day 1–3 — self-serve affiliate approvals:** Amazon Associates (Prime Student bounty $3 — the literal first dollar), Impact (Lemonade, Mint Mobile, Visible, Remitly), Wise Partner program, Airalo. Apply with the live site + a privacy policy page.
2. **Day 3–10 — apply CJ + FlexOffers** for Chase, Discover, BofA, Capital One; in parallel email Deserve EDU and Zolve partnerships (they *want* no-SSN international students). Target: bank/card live by Jan 5 for spring intake.
3. **Day 7–14 — 3 Evanston founding sponsors** at $75–175/mo (Local Sponsor founding rate): one boba/restaurant on Davis St, one airport car service (the Evanston–ORD $48–149 operators), one mover/storage (Dolly/Lugg are affiliate, so pick a local mover). Sell in person with a one-page rate card and a QR code to their sponsored pin.
4. **Day 10–30 — 20 founding landlords** (10 Evanston, 10 Champaign) on 60-day Pro trials; the ask is "list your 2027–28 units now, in Chinese, before pre-leasing".
5. **Day 14 — CORT campus rep** (CORT already has an NU Wildcard perk) and **Collegeboxes/Storage Scholars** for the May move-out Kit.

**Targets by Day 30:** $800 revenue, 1,200 MAU, 300 sublet/long-term listings, 120 Kit outbound clicks/day, 20 Pro trials, 3 sponsors signed.

### Days 31–60 (Dec 16 – Jan 15): pre-leasing towns + spring intake

**Ships**
- Pro+ (CSV/API import, featured building page, team seats); Verified Building page type.
- Nationwide Spotlight add-on; Move-out bundle boost; boost analytics in owner dashboard ("+312 views from your boost").
- Weekly bilingual digest email per campus (sponsor slot inside).
- Admin: sponsor inventory calendar, invoice status, affiliate reconciliation screen.

**Campuses switched on:** Michigan, Wisconsin, Purdue (pre-leasing towns — Pro sales), NYU, Columbia (largest international headcount; Leasebreak proves NYC pays for "featured").

**Partnerships**
1. **Pro outbound, 300 contacts** across Champaign, Ann Arbor, Madison, West Lafayette, Columbus (OSU is seeded; switch on if 10+ landlords sign). Script: 2-minute call → send bilingual demo listing of *their* building → trial.
2. **2 PBSA operators** for Verified Building pilots (one in Champaign — the Campustown new-build studios at $1,100–1,500 — one in Ann Arbor). Ask for a 3-month pilot at $500/mo + $300/lease; offer the 6%-of-first-year-rent alternative.
3. **Spring-intake Kit push:** XHS posts "#UIUC新生 开户/电话卡 攻略" with the Kit share link, CSSA WeChat-group partnerships at 5 campuses (we give CSSA a co-branded Kit page and a $2/conversion community kickback, disclosed).
4. **Hire 5 campus ambassadors** (UIUC, Michigan, NYU, Columbia, Wisconsin): $150/mo + 20% of sponsor revenue + $20 per Pro landlord they source.

**Targets by Day 60:** $2.2k revenue in Dec and $6k run-rate entering Jan, 2,500 MAU, 40 paying Pro/Pro+, 8 sponsors, 2 PBSA pilots signed, bank/card affiliates live.

### Days 61–90 (Jan 16 – Feb 14): coasts, intern season set-up, counsel for Secure Payment

**Ships**
- Seeker Pass (nationwide alerts) — lands before summer-intern search begins in Feb–Mar.
- Secure Payment behind feature flag with Stripe Connect test mode; counsel memo delivered; Stripe Connect platform application submitted.
- Admin: campus P&L view (revenue and cost per campus), ambassador commission statements, FHA wording linter on sponsor/listing content.

**Campuses switched on:** Northeastern, BU, Harvard/MIT (Boston), USC, UC Berkeley, UW (Seattle). That makes 16 and covers the summer-intern destinations (SF/Seattle/NYC/Chicago/Boston/LA).

**Partnerships**
1. **Big-box Kit upgrades:** negotiate direct (non-network) rates with Mint/Ultra Mobile (China-calling plans) and Discover for a flat $90/approved card during the Jul–Sep peak; lock terms by Mar 31.
2. **Renters insurance co-marketing:** Lemonade or Toggle "required by your building? get it in 2 minutes" card inside the Secure Payment and lease-takeover flows.
3. **Sponsored sales to 8 campuses** via ambassadors with the rate card; target 1.5 sponsors/campus.
4. **Verified Building** 3 more operators (Boston/LA/Seattle), targeting the Aug lease-up.

**Targets by Day 90:** **$10k+ in Feb**, 4,500 MAU, 90 paying Pro/Pro+, 14 sponsors, 5 Verified Buildings, Secure Payment counsel memo in hand, Seeker Pass live.

---

## 4. Product requirements — billing module and admin dashboard

Owner: `billing` agent (migration `18_billing.sql`, server `server/src/modules/billing/**`, web `web/src/features/billing/**`) and `admin` agent (`19_admin.sql`). Everything below is campus-aware (`campus_id` on every revenue-bearing row) because sponsorship, boosts and Pro are reported per campus.

### 4.1 Pricing table (`products` + `prices` seed; money in integer cents)

| SKU | Product | Unit | Price (cents) | Notes |
|---|---|---|---|---|
| `BOOST_SUBLET_3D` | Sublet boost | one-time | 900 | duration 72h |
| `BOOST_SUBLET_7D` | Sublet boost | one-time | 1900 | |
| `BOOST_SUBLET_14D` | Sublet boost | one-time | 3900 | requires lease-proof badge |
| `BOOST_SUBLET_30D` | Sublet boost | one-time | 6900 | requires lease-proof badge |
| `ADDON_NATIONWIDE_7D` | Nationwide Spotlight | add-on | 1000 | attaches to any sublet boost |
| `BOOST_ITEM_1D` / `_3D` / `_7D` | Item boost | one-time | 299 / 499 / 999 | |
| `BOOST_BUNDLE_7D` | Move-out bundle boost | one-time | 999 | sublet + ≤20 items |
| `PACK_MOVING_OUT` | 14D sublet boost + bundle boost | one-time | 4400 | |
| `BOOST_BUDDY_1D` / `_3D` | Buddy/event boost | one-time | 199 / 499 | |
| `PRO_MONTHLY` / `PRO_ANNUAL` | Landlord Pro | subscription | 2900 / 24900 | 2 × `BOOST_SUBLET_7D` credits/month |
| `PROPLUS_MONTHLY` / `PROPLUS_ANNUAL` | Landlord Pro+ | subscription | 7900 / 69900 | 6 boost credits/month, 5 seats |
| `PASS_MONTHLY` / `PASS_ANNUAL` | Seeker Pass | subscription | 499 / 2999 | |
| `SECURE_PAY_FEE` | Secure Payment fee | percent | 300 bps, min 500, cap 6000 | payer pays; ACH-only ≥ 50000 |
| `SPONSOR_LOCAL` / `SPONSOR_FEED` / `SPONSOR_CAMPUS` | Sponsored placement | monthly, invoiced | 15000 / 35000 / 60000 | per campus |
| `VERIFIED_BUILDING_PAGE` | Verified Building page | monthly, invoiced | 50000 | |
| `VERIFIED_BUILDING_LEASE` | Attributed lease | per event | 30000 (≤6 mo: 15000) | |
| `REFERRAL_CREDIT` | Referral credit | wallet credit | 500 | boosts only, expires 180 days |
| `PROMO_FOUNDING_LANDLORD` | Promo code | 50% off `PRO_MONTHLY` ×12 | — | cap 100 redemptions, expires 2027-02-28 |
| `PROMO_FOUNDING_SPONSOR` | Promo code | 50% off any `SPONSOR_*` ×3 | — | cap 3 per campus |

Prices are rows, not constants: `prices(id, product_sku, campus_id NULL, amount_cents, currency, interval, active_from, active_to)` so NYC/Boston/SF can later carry a +$5 sublet-boost premium without a deploy.

### 4.2 Data model (migration 18)

- `products(sku PK, kind ENUM boost|addon|subscription|fee|sponsor|credit, entity_type NULL, duration_hours NULL, meta JSON)`
- `prices(...)` as above.
- `orders(id, user_id, campus_id, total_cents, currency, status ENUM draft|pending|paid|failed|refunded, provider ENUM stripe|mock|invoice, provider_ref, promo_code_id NULL, created_at, paid_at)` + `order_items(id, order_id, sku, price_id, entity_type, entity_id, qty, amount_cents, meta JSON)`.
- `payments(id, order_id, provider, provider_payment_id, method ENUM card|ach|wallet, amount_cents, fee_cents, status, raw JSON, created_at)`.
- `subscriptions(id, user_id, sku, status ENUM trialing|active|past_due|canceled, provider_sub_id, current_period_start, current_period_end, cancel_at, trial_end, seats, created_at)`.
- `boosts(id, order_item_id, entity_type ENUM listing|item|buddy_post|bundle, entity_id, campus_id, nationwide BOOL, starts_at, ends_at, status ENUM scheduled|active|expired|refunded|revoked, impressions INT, clicks INT)`.
- `boost_credits(id, user_id, sku, source ENUM subscription|referral|promo|refund, remaining INT, expires_at)`.
- `wallet_ledger(id, user_id, delta_cents, reason ENUM referral_credit|promo|refund|boost_spend|adjustment, ref_type, ref_id, balance_after_cents, created_at)` — append-only.
- `promo_codes(id, code UNIQUE, kind ENUM percent|fixed|credit, value, applies_to_sku_prefix, max_redemptions, per_user_limit, expires_at, active)` + `promo_redemptions`.
- `referrals(id, referrer_user_id, referee_user_id, status ENUM pending|verified|credited, credited_at)`.
- `affiliate_partners(id, slug UNIQUE, name_zh, name_en, category ENUM bank|card|sim|insurance|transfer|movers|storage|furniture|pickup|misc, network ENUM impact|cj|flexoffers|amazon|direct, outbound_url_template, payout_cents_est, user_bonus_text_zh/en, rubric JSON, disclosure_required BOOL default 1, active)`.
- `affiliate_links(id, partner_id, placement ENUM kit|listing_detail|secure_pay|digest|buddy, campus_id NULL, subid_prefix)`.
- `affiliate_clicks(id, link_id, partner_id, user_id NULL, anon_id, campus_id, placement, subid, ip_hash, ua_hash, created_at)` — `subid = base32(user_or_anon).campus_id.placement.click_id`.
- `affiliate_conversions(id, partner_id, click_id NULL, subid, network_event_id UNIQUE, status ENUM pending|approved|reversed|paid, payout_cents, occurred_at, approved_at, paid_at, source ENUM postback|csv|manual)`.
- `sponsors(id, business_name, contact, campus_id, tier_sku, monthly_cents, starts_on, ends_on, status ENUM proposed|active|paused|ended, creative JSON {pin, card, digest_line}, invoice_ref, ambassador_user_id NULL)`.
- `verified_buildings(id, operator_name, campus_id, page_slug, monthly_cents, lease_fee_cents, status, lead_count, attributed_leases)` + `building_leads(id, building_id, user_id, status ENUM new|toured|applied|signed|lost, signed_at, lease_months)`.
- `secure_payments(id, payer_user_id, payee_user_id, listing_id, amount_cents, fee_cents, fee_split ENUM payer|split, method ENUM ach|card, provider_pi, status ENUM created|funded|held|released|disputed|refunded, move_in_date, release_at, released_at, dispute_id NULL)` — rows exist from day 1 but `BILLING_SECURE_PAY_LIVE` flag gates everything beyond `created` in mock mode.
- `revenue_events(id, stream ENUM affiliate|boost|pro|sponsor|building|secure_pay|pass, campus_id, user_id NULL, amount_cents, cost_cents, status ENUM recognized|pending|reversed, ref_table, ref_id, occurred_at, recognized_at)` — the single table the admin dashboard reads; written by a `recordRevenue()` helper from every stream.

### 4.3 Flows and screens (web `features/billing`)

1. **Pricing page `/pricing`** — three tabs (Students: boosts + Seeker Pass; Landlords: Free/Pro/Pro+ comparison with Founding Landlord banner until Feb 28; Businesses: sponsor rate card + "Verified Building" CTA that opens a lead form). Every price reads from `prices`. Bilingual via `useT()`.
2. **Boost picker (modal, from listing/item/buddy owner dashboard and from the "posted!" success toast)** — tier cards with price, duration, "est. +X views" (from campus-level boost CTR), Nationwide Spotlight toggle, promo field, wallet credit toggle; disabled states with reasons ("需要租约证明 / Needs lease-proof badge", "listing pending moderation"). Submit → `POST /api/billing/orders` → Stripe Checkout (live) or `/billing/mock-checkout` (demo, clearly labelled "测试模式 / Test mode — no real charge").
3. **Checkout result pages** `/billing/success?order=…` and `/billing/cancel` — success shows the boost schedule and a share card ("I'm featured — forward to WeChat").
4. **Pro checkout** `/pro/subscribe` — monthly/annual toggle, promo code, trial badge; Stripe Billing subscription; post-success → landlord dashboard with "Pro" ribbon and boost-credit counter.
5. **Seeker Pass** upsell inline in saved-search drawer and in nationwide search ("get instant alerts for Seattle + SF + NYC").
6. **Secure Payment** `/pay/:listingId` — amount, fee line (3%, min/cap), ACH vs card rule, move-in date, both-parties trust-3 check, consent text, status timeline (funded → held → released); dispute button opens a report with reason enum.
7. **Wallet** `/wallet` — ledger, credits with expiry, referral link + "invite" share card, promo redemption.
8. **Newcomer Kit** `/kit` — categories ordered by rubric, each card: partner, user bonus, "推广 / Sponsored — we may earn a referral fee" line, `/go/:slug` link. Pre-arrival share page `/kit/share/:campusId` with no login required (so WeChat/XHS traffic lands and gets an `anon_id` cookie).
9. **Owner analytics** — per listing: views, contact clicks, boost uplift; per landlord (Pro): lead inbox with badges, CSV export (Pro+).

### 4.4 API (all under `/api/billing`, zod-validated, JSON envelope per BRIEF §5)

`GET /prices?campusId=` · `POST /orders` {items[], promoCode?, useWallet?} → `{checkoutUrl | mock}` · `POST /webhooks/stripe` (checkout.session.completed, invoice.paid, customer.subscription.updated/deleted, payment_intent.* for secure pay) · `POST /mock/complete/:orderId` (dev only) · `GET /subscriptions/me` · `POST /subscriptions/:id/cancel` · `GET /boosts?entity=` · `POST /boosts/:id/revoke` (admin) · `GET /wallet` · `POST /promo/validate` · `POST /referrals/claim` · `GET /kit?campusId=` · `GET /go/:slug` (302 with subid, writes `affiliate_clicks`, sets `anon_id`) · `POST /affiliates/postback/:network` (signed; writes `affiliate_conversions`) · `POST /secure-payments` · `POST /secure-payments/:id/confirm-move-in` · `POST /secure-payments/:id/dispute` · `GET /admin/revenue?from&to&campusId&stream` · `POST /admin/sponsors` · `POST /admin/affiliates/import-csv` · `POST /admin/buildings/:id/leads/:leadId/status`.

### 4.5 Events (written to `events(user_id, type, entity, props)`; the funnel tables derive from these)

`pricing_view{tab}`, `boost_picker_open{entity_type, entity_id, campus_id}`, `boost_tier_select{sku}`, `checkout_start{order_id, total_cents, provider}`, `checkout_complete{order_id}`, `checkout_abandon{order_id, step}`, `boost_impression{boost_id, position}`, `boost_click{boost_id}`, `pro_trial_start`, `pro_subscribe{sku, promo}`, `pro_cancel{reason}`, `pass_subscribe`, `kit_view{campus_id, pre_arrival BOOL}`, `kit_card_view{partner_slug}`, `affiliate_click{partner_slug, placement, subid}`, `affiliate_conversion{partner_slug, payout_cents, status}`, `sponsor_impression{sponsor_id, surface}`, `sponsor_click{sponsor_id}`, `building_page_view{building_id}`, `building_lead{building_id}`, `secure_pay_start/funded/released/disputed{amount_cents, fee_cents, method}`, `referral_sent`, `referral_verified`, `wallet_credit{reason, delta_cents}`, `promo_apply{code, ok}`. Never write passport numbers, ID images or card data to `events`.

### 4.6 Admin dashboard (web `features/admin`)

- **Revenue overview** — today / 7d / 30d / MTD by stream (stacked bars), MRR (Pro + Pro+ + Pass + sponsors + building pages), ARPU, campus leaderboard (revenue, MAU, revenue per MAU), cash vs recognized (affiliate pending vs approved).
- **Funnels** — boost: picker open → tier select → checkout start → paid (by campus, by entity type); Pro: trial → paid → churn cohort table; Kit: kit_view → card_view → click → conversion (by partner, by campus); Secure Pay: start → funded → released, dispute rate.
- **Affiliate reconciliation** — per partner: clicks, conversions pending/approved/reversed/paid, EPC, CSV import, "mark paid" with statement date; alerts when a partner's approval rate drops <40% (sign of ToS/SSN rejections).
- **Sponsor inventory** — calendar per campus (Local/Feed/Campus slots, max 3 Feed per campus), booking form, creative preview with the mandatory "Sponsored" label baked in, invoice status, ambassador attribution.
- **Boost ops** — active boosts with moderation status; one-click revoke + auto-refund reason; cap monitor (featured density never >2/10).
- **Verified Buildings** — pages, leads pipeline, attributed leases, monthly statement export.
- **Pricing & promos** — edit `prices` with effective dates, create promo codes with caps, feature flags `BILLING_LIVE`, `BILLING_SECURE_PAY_LIVE`, `SEEKER_PASS_LIVE`, per-campus sponsor enablement.
- **Trust guardrails on the same screen** — fraud alerts (boost bought on listing later reported; secure pay with >1 dispute; affiliate conversions from one IP hash) feed the moderation queue; revenue dashboard shows "revenue at risk" (boosts on listings under review).

---

## 5. Unit economics and 12-month P&L sketch

### 5.1 Unit economics

| Unit | Price | Direct cost | Contribution | Notes |
|---|---|---|---|---|
| Sublet boost (avg) | $24.00 | Stripe $1.00 | **$23.00 (96%)** | zero delivery cost; refunds <3% |
| Item / buddy boost (avg) | $5.00 | Stripe $0.45 | $4.55 (91%) | |
| Pro subscriber | $29/mo | Stripe $1.14 + support $2 | **$25.90/mo** | CAC ≈ $60 (2.5 sales hours at $25 incl. ambassador bounty); payback 2.3 months; 6% monthly churn → LTV ≈ $430 |
| Pro+ subscriber | $79/mo | $2.59 + $5 | $71.40/mo | CAC ≈ $150; LTV ≈ $1,200 |
| Kit engaged newcomer (peak) | $43 EV | 30% leakage | **$30 net**, $0 COGS | cash lag 30–60 days (net-30/net-60 networks) |
| Kit opener (off-season) | $6 net | — | $6 | |
| Sponsor (avg ticket) | $280/mo | 20% ambassador commission | **$224/mo** | CAC ≈ 2 visits; churn 10%/mo (local businesses are seasonal) |
| Verified Building | $500/mo + $300/lease | 10% ambassador | $450 + $270 | |
| Secure Payment (ACH, $1,100) | $33 fee | ACH $5 + Connect payout ~$3 + Express account $2 amortized | **≈ $23** | card at $1,100 would be ≈ −$0.50 → hence ACH-only ≥ $500 |
| Seeker Pass | $4.99 | $0.44 | $4.55 | |
| Referral credit | $5 credit | ≈ $0.60 expected real cost | — | only ~12% of credits displace a boost that would have been bought anyway |

Blended gross margin at month 6 ≈ **88%** (sponsor commissions and Stripe fees are the only real COGS).

### 5.2 12-month P&L sketch (USD thousands; accrual revenue — affiliate cash arrives 1–2 months later)

| | M1 Nov | M2 Dec | M3 Jan | M4 Feb | M5 Mar | M6 Apr | M7 May | M8 Jun | M9 Jul | M10 Aug | M11 Sep | M12 Oct | **Year** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Campuses live | 5 | 10 | 16 | 16 | 20 | 20 | 24 | 24 | 30 | 30 | 30 | 30 | |
| MAU (k) | 1.2 | 2.5 | 4.5 | 6.5 | 8.5 | 10 | 11 | 9 | 12 | 16 | 15 | 11 | |
| Newcomer Kit | 0.3 | 0.8 | 2.5 | 2.4 | 3.0 | 6.6 | 7.5 | 12.0 | 30.0 | 55.0 | 25.0 | 6.0 | **151.1** |
| Boosts | 0.2 | 0.5 | 1.2 | 2.0 | 4.5 | 7.1 | 7.8 | 4.0 | 4.5 | 5.5 | 5.0 | 3.5 | **45.8** |
| Pro / Pro+ (MRR) | 0.0 | 0.3 | 1.2 | 2.6 | 3.4 | 4.3 | 4.8 | 5.0 | 5.5 | 6.0 | 6.3 | 6.5 | **45.9** |
| Sponsored | 0.3 | 0.6 | 1.2 | 2.2 | 2.8 | 3.6 | 3.9 | 4.0 | 4.5 | 6.0 | 5.5 | 4.5 | **39.1** |
| Verified Building | 0 | 0 | 0 | 1.0 | 1.8 | 2.7 | 3.0 | 3.5 | 4.5 | 5.0 | 4.0 | 2.5 | **28.0** |
| Secure Payment | 0 | 0 | 0 | 0 | 0 | 1.5 | 2.4 | 3.0 | 4.5 | 6.0 | 4.5 | 3.0 | **24.9** |
| Seeker Pass | 0 | 0 | 0 | 0 | 0.3 | 0.6 | 0.8 | 0.8 | 1.0 | 1.4 | 1.5 | 1.4 | **7.8** |
| **Revenue** | **0.8** | **2.2** | **6.1** | **10.2** | **15.8** | **26.4** | **30.2** | **32.3** | **54.5** | **84.9** | **51.8** | **27.4** | **≈ 343** |
| COGS (Stripe, ACH, commissions, SMS/email) | 0.1 | 0.2 | 0.5 | 0.9 | 1.4 | 2.4 | 2.8 | 2.9 | 4.2 | 6.8 | 4.5 | 2.6 | 29.3 |
| **Gross profit** | 0.7 | 2.0 | 5.6 | 9.3 | 14.4 | 24.0 | 27.4 | 29.4 | 50.3 | 78.1 | 47.3 | 24.8 | **≈ 313** |
| Hosting / infra / tools | 0.2 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.6 | 0.7 | 0.9 | 1.2 | 1.0 | 0.8 | 7.4 |
| Ops & verification (part-time, from M3; 2 people from M8) | 0 | 0 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | 4.0 | 4.0 | 4.0 | 4.0 | 4.0 | 30.0 |
| Campus ambassadors (stipends; commissions are in COGS) | 0 | 0.8 | 1.5 | 1.5 | 2.3 | 2.3 | 3.0 | 3.0 | 4.5 | 4.5 | 4.5 | 4.5 | 32.4 |
| Sales lead (base, from M4) | 0 | 0 | 0 | 3.0 | 3.0 | 3.0 | 3.0 | 3.0 | 3.0 | 3.0 | 3.0 | 3.0 | 27.0 |
| Marketing (XHS/WeChat content + paid pushes in peaks) | 0.5 | 0.5 | 1.5 | 1.0 | 1.5 | 1.5 | 1.0 | 2.0 | 4.0 | 5.0 | 2.0 | 1.0 | 21.5 |
| Legal / compliance (counsel memo M3–M4, retainer from M6) + insurance | 0 | 0 | 4.0 | 4.0 | 0.4 | 1.9 | 1.9 | 1.9 | 1.9 | 1.9 | 1.9 | 1.9 | 21.7 |
| Founders (unpaid M1–M6; $4k each from M7) | 0 | 0 | 0 | 0 | 0 | 0 | 8.0 | 8.0 | 8.0 | 8.0 | 8.0 | 8.0 | 48.0 |
| **Opex** | 0.7 | 1.5 | 9.3 | 11.9 | 9.7 | 11.3 | 19.5 | 22.6 | 26.3 | 27.6 | 24.4 | 23.2 | **≈ 188** |
| **Operating profit** | 0.0 | 0.5 | −3.7 | −2.6 | 4.7 | 12.7 | 7.9 | 6.8 | 24.0 | 50.5 | 22.9 | 1.6 | **≈ +125** |

Reading the sketch: cumulative cash trough is about **−$6k in Feb** (plus ~$25k of affiliate receivables lag), so the plan is self-funding on a few months of founder runway; the Aug peak (Kit) is 25% of annual revenue and must be banked for the Nov–Feb trough. Sensitivity: Kit −50% (bank programs decline international applicants without SSN) → year ≈ $267k, still profitable; Secure Payment delayed to year 2 → −$25k; adding 10 more campuses in Jul adds ~$15k Kit in Aug at ~$4k ambassador cost.

---

## 6. Top risks and mitigations

1. **Holding deposits = money transmission (legal / licensing).** Holding and releasing another person's funds triggers FinCEN MSB + ~49 state MTLs; Stripe prohibits escrow businesses directly, and IL/NY/CA/MA deposit statutes may reach sublet deposits. *Mitigation:* ship Secure Payment only via **Stripe Connect destination charges with delayed payouts** (funds never in our custody), never use the word "escrow" in UI or marketing, counsel memo before go-live (budgeted M3–M4, $8k), go live **state by state starting IL**, keep the mock labelled "demo" until then, and keep the P&L valid without this stream (it is 7% of year-1 revenue). Fallback: route true escrow through a licensed provider (Escrow.com-type API, ~3.25%) and keep the 3% fee as a pass-through plus $5 convenience fee.

2. **Fraud riding on paid features (a scammer boosts a cloned listing; fake affiliate conversions; stolen cards).** Paying makes a listing look legitimate, which is exactly what a scammer wants. *Mitigation:* boosts need trust ≥1 and passed moderation; 14/30-day boosts and Nationwide Spotlight need the **lease-proof badge**; any boosted listing that gets 2 reports is auto-paused with the boost held (not refunded) pending review; Stripe Radar rules (velocity, mismatched country, prepaid cards); boosted listings get a stricter duplicate-photo check (perceptual hash against the last 90 days); scam banner on the first message stays regardless of payment; affiliate clicks are rate-limited per IP hash/anon_id and conversions with duplicate `subid`s are flagged before invoicing; Secure Payment both-parties-trust-3 + 7-day dispute hold. Any revenue "at risk" is shown on the admin dashboard, not hidden.

3. **Chicken-and-egg per campus (no listings → no seekers → no boosts, no Pro, no sponsors).** A nationwide platform is 66 cold starts. *Mitigation:* sequence campuses by where money does not depend on peer supply — pre-leasing towns (Pro, Verified Building) and newcomer-heavy metros (Kit) first; seed supply via **concierge posting** (ambassadors re-post WeChat-group listings *with the poster's permission* and a "verified by ambassador" note, never scraping); the Founding Landlord discount and the 2-listing free cap bring 20–60 long-term listings per town in weeks; the wanted (求租) module lets demand exist before supply; the Nationwide toggle means a thin campus still shows cross-city inventory; "request my campus" captures demand and tells us where to switch on next. KPI gate: a campus is "live" only when it has ≥50 listings and ≥1 ambassador.

4. **Seasonality (Kit 25% of revenue in one month; boosts in Mar–May; Nov–Feb trough).** *Mitigation:* the three recurring lines (Pro/Pro+, sponsors, Verified Building pages, Seeker Pass) are built to carry the trough — target 40% of revenue recurring by M12; annual Pro at $249 pulls cash forward in Jan–Apr; December/January are sold as "spring intake + co-op/study-abroad sublets" (Northeastern, Drexel, Purdue, Georgia Tech co-op cycles); OPT relocations are a rolling demand we market to year-round; bank the Aug peak (explicit rule: 3 months of opex reserved).

5. **Channel dependence on WeChat (and XHS) for distribution.** Our growth loop runs through platforms that throttle external links and can block share cards. *Mitigation:* every share surface is a **plain HTTPS link with Open Graph cards** (works in WeChat, XHS bios, Discord, email), no mini-program dependency; capture email + phone on sign-up so we own re-engagement (weekly bilingual digest, TCPA-compliant SMS opt-in); XHS is run as a second channel with campus-specific accounts; university off-campus-housing offices and CSSA chapters are courted as official referral partners (co-branded Kit, disclosed kickback); affiliate `subid` is attached server-side at `/go/:slug` so attribution survives WeChat's in-app browser and cookie loss on return.

Two more that the revenue lens cannot ignore:

6. **Affiliate program dependency and ToS.** Bank programs cap, pause, or reject non-SSN applicants, and some forbid third-party incentives. *Mitigation:* at least 2 partners per Kit category, publisher programs only (never personal referral codes), FTC "Sponsored/推广" labels, read every IO before promising user bonuses, and negotiate direct deals (Discover, Mint/Ultra, Deserve/Zolve) before the Jul–Sep peak.

7. **BIPA / ID-data liability at an Illinois launch campus.** *Mitigation:* manual human review of ID photos (no face-match vendor) until counsel signs off on a BIPA-compliant consent + retention schedule; encrypted at rest, 30-day deletion after decision, audit log on every admin view, never written to `events`.

---

## 7. First-two-weeks checklist (so week 1 really has a dollar in it)

| Day | Action | Owner |
|---|---|---|
| 0 | Entity + bank + Stripe account; privacy policy and affiliate disclosure pages live | founder |
| 1 | Amazon Associates + Impact + Wise applications; `/kit` live with Prime Student, Lemonade, Mint, Visible, Wise, Remitly, Airalo cards | founder + billing |
| 2 | `BILLING_LIVE=true` for boosts and Pro on Northwestern; pricing page live | billing |
| 3 | XHS + 6 Northwestern/UIUC WeChat groups: "新生开户/电话卡/租客保险 攻略" posts with Kit share links | founder |
| 3–5 | **First dollar:** Prime Student bounty or Lemonade quote lead recorded in `affiliate_conversions` | — |
| 5–7 | Walk Davis St / Sherman Ave with the sponsor rate card; sign 1 boba shop + 1 airport car service | founder |
| 7 | First paid sublet boost (Evanston winter/spring sublets); boost "+views" analytics visible to owners | billing |
| 8–14 | 20 founding-landlord trials (Evanston + Champaign); CJ/FlexOffers bank applications submitted; CORT campus rep call | founder + ambassador |
| 14 | Admin revenue dashboard shows ≥ $200 recognized across ≥ 3 streams | admin |
