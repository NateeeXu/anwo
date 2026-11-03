# Strategy — "Trust-First" lens

> Lens: optimize for durable trust and defensibility first, and make trust itself the revenue engine (verification tiers, held payments with a platform guarantee, verified viewings, insurance and financial partnerships).
> Scope: **nationwide, all US universities** (66 seeded campuses in `docs/data/campuses.json`; Northwestern/Evanston is only the launch campus and demo dataset — nothing below is Evanston-specific unless marked "wave 1").
> Inputs: `docs/BRIEF.md`, `docs/MARKET.md` (numbers tagged [fact]/[estimate] there are reused here with the same tags; everything new in this file is **[estimate]** unless stated).
> Date: 2026-11-03. Day 0 of the 30/60/90 plan = 2026-11-03; "month 6" = April 2027, which is the peak sublet-posting month (MARKET §1.3), and "month 10" = August 2027, the fall-intake / Newcomer Kit peak.

---

## 1. Positioning and the one-sentence promise

**Positioning.** The only nationwide sublet-and-campus-life platform where every counterparty is a verified student, landlord or manager, every sublessor has proven they are on the lease, and every dollar of deposit moves through a held, guaranteed payment — in 中文 and English. Incumbents either have inventory without trust (WeChat groups, Xiaohongshu, Facebook, Craigslist, SpareRoom) or trust without peer inventory (uhomes/Amber, Airbnb at 15.5%). We sit in the empty quadrant (MARKET §3 gap summary).

**One-sentence promise (user-facing, bilingual):**
> **"你见到的每个人都经过验证，每一笔押金都受保护。" / "Everyone you meet is verified. Every deposit is protected."**

**Why trust is the revenue engine, not a cost center.** Each trust artifact is a thing a counterparty will pay to *obtain*, *signal*, or *rely on*:

| Trust artifact | Who wants it | What it unlocks commercially |
|---|---|---|
| Trust level L1–L3 (free, never paywalled) | Everyone | The audience; gating condition for every paid product below |
| **Lease-proof badge** (free; admin-reviewed lease page with name) | Sublessors | Required to buy a Boost → Boosts only amplify trustworthy supply |
| **Verified Owner / Manager badge** (free review; required for Pro) | Landlords | Landlord Pro subscription |
| **Secure Payment** (held deposit, released on move-in) | Pre-arrival renters, parents paying from abroad | 3% service fee |
| **Deposit Protection** (platform guarantee, funded from fees) | Renters | The reason to pay on-platform instead of Zelle → drives Secure Payment adoption |
| **Verified Viewing** (campus ambassador visits, attests, films) | Pre-arrival renters; sublessors who want to close remotely | $29 service, 38% platform margin |
| Verified, disclosed partners in the Newcomer Kit | New arrivals | Affiliate payouts ($43 EV per engaged newcomer, MARKET §5.1) |
| Verified Building / Verified Sponsor label | PBSA operators, local businesses | Sponsored placements |

Rule inherited from BRIEF §6.3 and applied to every line below: reporting, badges, scam warnings and basic verification are **never** paid; paid products buy *reach*, *speed of money*, *guarantee coverage* and *convenience*, never safety.

---

## 2. Revenue streams, ranked (trust-first order)

Ranking criterion: (defensibility created) × (gross margin) × (how much it compounds the trust graph), then time-to-first-dollar as tiebreaker. The MARKET order (affiliates → boosts → Pro → fees) is the *time-to-dollar* order; this lens reorders it because the two "money" products (#1, #2) are what make the platform un-copyable by a WeChat group admin.

### Month-6 operating assumptions (used in every estimate below)

| Assumption | Value | Basis |
|---|---|---|
| Active campuses (seeded supply + ≥5 ambassadors) | **12** (3 wave-1 + 9 wave-2) | §3 rollout |
| MAU | 3 × 1,800 + 9 × 600 = **10,800 ≈ 11k** | 15–25% of intl students at wave-1 campuses, 5–8% at wave-2 (MARKET §8 sanity check uses 15k at 8 metros) |
| Trust mix | L1 100% · **L2 35%** (3,800) · **L3 12%** (1,300) | L2 is required to message in "verified-only" mode, so it converts |
| Sublet listings posted in April | 12% of MAU = **1,300** (off-season 5%) | April = 45–55% of annual sublet listings land Mar–May (MARKET §1.3) |
| Lease-proof badge share | 60% of sublet listings = 780 | Badge is free and required for Boost |
| Item listings / buddy posts in April | 1,800 / 500 | Move-out season begins |
| On-platform closes | 35% of listings = **455** | Rest close off-platform or never |
| Average deposit | **$1,100** | Blended room-in-shared-apt across 12 metros (MARKET §1.4) |
| Payment rails cost | ACH debit 0.8% cap $5; cards 2.9% + $0.30; Connect payout 0.25% + $0.25 | Stripe public pricing [fact, MARKET §4] |

### 2.1 Secure Payment — held deposit + first month, with Deposit Protection

- **What it is.** Renter pays deposit (and optionally first month) into a Stripe Connect flow with **delayed/manual payout**; funds are released to the sublessor/landlord 24h after the renter confirms move-in (or auto-release 48h after the agreed move-in date if no dispute is opened). UI copy is "Secure Payment / 安心付" — **never "escrow"** (MARKET §6.3; Stripe prohibits escrow businesses; the platform never takes custody).
- **Deposit Protection.** Every Secure Payment carries a platform guarantee: if the listing is fraudulent, the sublessor is not on the lease, or the unit is materially not as listed and the renter reports within 48h of move-in date, the platform refunds the deposit (cap **$1,500 per transaction**, aggregate monthly cap set by admin, initially $25k). Structured as a **platform money-back guarantee funded from fees, not insurance** (same structure as Airbnb's AirCover, which is explicitly "not insurance") — counsel must confirm per state before launch (§6 Risk 1).
- **Pricing (exact).** Service fee **3.0% of amount, min $5.00, cap $60.00**, paid by the **payer** (renter) by default; sublessor may elect "I'll cover the fee" (fee moves to payee) or 50/50 split. Rail: **ACH bank debit is the default** (so a $1,100 deposit costs us $5.00 + $3.00 payout = $8, leaving $25 of the $33 fee); card payments are offered with a separately-shown **"card processing 2.9% + $0.30"** line (pass-through, labelled; not offered on debit where surcharge rules forbid — show as "convenience fee" and get counsel sign-off per state); Alipay/WeChat Pay via Stripe for parents paying from China at the same pass-through (~3% [estimate]).
- **Who pays.** Renter (payer) by default; sublessor opt-in to absorb.
- **Time to first dollar.** **Day ~105** (Feb 2027): needs Stripe Connect platform approval (2–4 weeks), counsel memo on money-transmission posture and the guarantee (4–6 weeks, parallel), and ≥200 L3 users at the wave-1 campuses. Until then the mock checkout in the brief runs in a clearly-labelled test mode.
- **Assumptions.** 455 closes/month in April; **30% adoption** of Secure Payment (adoption is pulled by Deposit Protection applying *only* to on-platform payments and pushed by the first-message scam banner naming Zelle/CashApp/Alipay losses); 20% of those also route first-month rent through it.
- **Month-6 estimate (April 2027).**
  12 campuses × 11k MAU → 1,300 listings × 35% close = 455 closes × 30% = **137 deposits × $1,100 × 3% = $33 → $4,521**
  + 27 first-month payments × $33 = **$891**
  = **≈ $5,400/month gross** (ARPU per transaction $39; processing + payout cost ≈ $8–9 → contribution ≈ $4,200; 20% of gross fee, ≈ $1,080, is swept to the Deposit Protection reserve).
- **Trust safeguard that keeps it honest.** (a) Release requires renter confirmation or a 48h no-dispute window — never sublessor-only; (b) only L3 payees with lease-proof or Verified Owner badge can receive funds; (c) all disputes go to a human admin queue with a 72h SLA and the decision is logged to the audit table; (d) the fee is shown as "Service fee 3% ($33.00)" on every screen before payment (BRIEF §6.3 honesty rule); (e) a renter who pays off-platform after being quoted on-platform is told, in the chat, that Deposit Protection no longer applies — we never pretend coverage.

### 2.2 Verified Spotlight (Boosts), gated by verification

- **What it is.** Featured placement for sublets, items and buddy posts. **A sublet can only be boosted if the poster is ≥L2 and the listing has the lease-proof badge (or poster has Verified Owner/Manager badge).** Items: poster ≥L2. Buddy posts: poster ≥L2. Boosted cards keep the "Sponsored / 推广" label and never outrank the "verified-only" filter.
- **Pricing (exact, from MARKET §4.1).**
  Sublet: **$9 / 3 days, $19 / 7 days, $39 / 14 days, $69 / 30 days**; **Nationwide Spotlight +$10** (shown in the nationwide toggle results and in "matches for you" of cross-city wanted posts).
  Item: **$2.99 / 1 day, $4.99 / 3 days, $9.99 / 7 days**; Move-out bundle (sublet + ≥3 items) **$9.99 / 7 days**.
  Buddy/event: **$1.99 / 1 day, $4.99 / 3 days**.
- **Who pays.** Sublessor / landlord / seller / event organizer.
- **Time to first dollar.** **Day ~25**: Stripe standard Checkout (no Connect, no licensing — we sell a service we deliver) replaces the mock; first wave-1 campuses have ~150 sublet listings by then (winter-sublet season Nov–Jan).
- **Assumptions.** Eligible sublet listings 780; **20% boost conversion** among eligible (they are higher-intent, they already did the lease upload); price mix 40/30/20/10% across the four tiers → avg $24.00, plus 25% attach Nationwide (+$2.50) → **$26.50 avg**. Items 7% × $5.50 avg; buddy 5% × $3.00 avg.
- **Month-6 estimate.** 12 campuses × 11k MAU → 780 eligible × 20% = **156 sublet boosts × $26.50 = $4,134** + 1,800 × 7% = 126 item boosts × $5.50 = **$693** + 500 × 5% = 25 × $3 = **$75** = **≈ $4,900/month** (processing ≈ 4% → contribution ≈ $4,700).
- **Trust safeguard.** Boost eligibility *is* the safeguard: paid reach is only available to supply we have reviewed, so money cannot buy visibility for an unverified listing. Boosts are seller-side and never affect the renter's "verified-only" sort (FHA ranking note, MARKET §6.3). Refund in full if the listing is removed by moderation (we never keep money from a listing we took down).

### 2.3 Landlord Pro (recurring), gated by Verified Owner/Manager

- **What it is.** Subscription for landlords/agents/property managers: unlimited listings, analytics (views, leads, "near shuttle" uplift), lead inbox with verified-renter filters, Pro badge, priority verification queue, CSV import (Pro+), featured building page (Pro+).
- **Pricing (exact).** **Pro $29/month or $249/year**; **Pro+ $79/month or $699/year** (5+ units, CSV/API import, featured building page, 2 team seats). 14-day free trial; trial requires the Verified Owner/Manager badge first (ownership deed/management agreement/property tax page + government ID; manual review).
- **Who pays.** Landlord / PM company.
- **Time to first dollar.** **Day ~45** (trial starts day 31, converts day 45). Pre-leasing season Jan–Apr in Champaign, Ann Arbor, Madison, West Lafayette (MARKET §1.3) is the demand window → UIUC is wave-1 for exactly this reason.
- **Assumptions.** 12 campuses × ~6 paying landlords each by April (wave-1 campuses 12–15, wave-2 3–5): **70 Pro + 12 Pro+**. Annual plans recognized monthly.
- **Month-6 estimate.** 70 × $29 = $2,030 + 12 × $79 = $948 = **≈ $3,000/month** (gross margin >90%; verification review cost ≈ $3 per applicant).
- **Trust safeguard.** Pro badge means "ownership/management verified by a human", so it cannot be bought without the review; a Pro account that receives 2 upheld fraud/misrepresentation reports is suspended with a pro-rated refund; Pro analytics never expose renter PII (only counts and trust-level mix).

### 2.4 Verified Viewing (campus ambassador attestation)

- **What it is.** A ≥L2 campus ambassador (vetted student, paid per job) visits the unit, takes ≥12 timestamped photos + 60s video, checks the sublessor's ID against the lease name on site, and files an attestation that appears on the listing as "Viewed by a verified student on <date> / 已由认证同学实地看房". Solves pre-arrival blindness (MARKET §2.2 pain #5) and the unauthorized-sublessor pattern.
- **Pricing (exact).** **$29 per viewing** when ordered by the sublessor (shows the badge to all renters); **$39** when ordered by a specific renter (private report + 15-min video call with the ambassador). Ambassador payout **$18 / $25**; platform keeps **$11 / $14**.
- **Who pays.** Sublessor (badge) or pre-arrival renter (private report).
- **Time to first dollar.** **Day ~60** (needs 10 vetted ambassadors at Northwestern + UChicago; ambassador agreement, 1099 setup, safety protocol).
- **Assumptions.** 8% of April sublet listings order the badge (sublessors trying to close with remote interns/incoming grads); renter-ordered reports are negligible in April and peak Jul–Aug.
- **Month-6 estimate.** 1,300 listings × 8% = **104 viewings × $29 = $3,016 gross**; payouts 104 × $18 = $1,872 → **net $1,144**. (At month 10, renter-ordered reports add ~150 × $39.)
- **Trust safeguard.** Ambassadors are L3, named on the attestation, rated by both parties, capped at 15 jobs/week, and rotated so no ambassador views the same sublessor twice in a term; photos are EXIF-checked server-side (timestamp/geo within 200m of the listing pin); a false attestation is a termination + the renter's Deposit Protection claim is paid without question.

### 2.5 Newcomer Kit — verified, disclosed partners (affiliate)

- **What it is.** The free pre-arrival/arrival hub (bank, no-SSN credit card, SIM/eSIM, renters insurance, money transfer, movers/storage/furniture, airport pickup, Prime Student). Trust-first rule: every partner card shows "Sponsored / 推广 · we are paid if you sign up", a **"No SSN needed" / "Passport + I-20 accepted"** fact-checked label, and a user rating; partners that generate upheld complaints are delisted regardless of payout.
- **Pricing.** Free to users. Publisher payouts (MARKET §5): bank $50–150, student/no-SSN card $50–100, SIM $15–35, renters insurance $15–25.50, Wise/Remitly $10–30, movers/storage $10–50, CORT $25–75, Prime Student $3.
- **Who pays.** Partners (publisher programs via Impact.com, CJ, FlexOffers, Amazon Associates, Lemonade/Mint/Wise in-house).
- **Time to first dollar.** **Day ~14** (Amazon Associates approval in days; Impact publisher account 1–2 weeks; Lemonade/Mint/Wise applications filed day 1).
- **Assumptions.** April is off-peak: 10% of MAU open the Kit (1,080), 12% take a paid action (130) at **$32 blended payout** (SIM/insurance/transfer-heavy mix); plus renters insurance offered inside the Secure Payment checkout: 137 × 30% × $22.
- **Month-6 estimate.** 130 × $32 = **$4,160** + 41 × $22 = **$904** = **≈ $5,060/month**. (Month 10 estimate: 12 campuses × ~600 engaged newcomers each ≈ 7,000 × $43 EV ≈ $30k — the single biggest month of year 1.)
- **Trust safeguard.** FTC-compliant labels on every card and link; no individual referral codes (publisher programs only, per MARKET §5 compliance note); "No-SSN" claims re-verified quarterly by ops with screenshots; a partner's rank in the Kit is set by user rating and fit, never payout (the admin "Kit editor" screen stores payout and rank separately and logs any rank change with a reason).

### 2.6 Verified Sponsors and Verified Building pages

- **What it is.** Campus-scoped sponsored tiles for local businesses (movers, bike shops, bubble tea, 接机 services) and a "Verified Building" page for PBSA operators / large landlords (verified management, real photos, direct lease link, shuttle-stop distance). Also the sponsored airport-pickup partner inside the buddy module.
- **Pricing (exact).** Local sponsor **$150 / $300 / $600 per campus per month** (1 / 3 / 6 tile slots, 3-month minimum); Verified Building **$500/month per building** ($300 for ≤50 beds; $1,000 for metro-wide feature across all campuses in a metro). Airport-pickup partner **$250/campus/month** + $5 per completed booking lead.
- **Who pays.** Businesses / operators.
- **Time to first dollar.** **Day ~75** (needs traffic proof: 1k MAU at a campus and a one-page media kit from the admin dashboard).
- **Assumptions.** By April: 5 local sponsors (avg $300) + 2 Verified Buildings ($500) across the 12 campuses.
- **Month-6 estimate.** 5 × $300 + 2 × $500 = **≈ $2,500/month**.
- **Trust safeguard.** Every sponsor is a verified business (EIN + business license + a human call); "Sponsored" label; a sponsor cannot buy a place in search results, only in the labelled tile; Verified Building pages require the lease-office contact to be confirmed by phone and the photos to be ambassador-verified (a Verified Viewing is included in the price).

### 2.7 Later (month 9+): Trust & Housing insights for universities — not in month-6 math

International student offices and off-campus-life offices buy an annual **Campus Housing Safety Report** (scam attempts blocked, verified-sublet price index, shuttle-proximity demand) at **$2,500/campus/year**, aggregated and anonymized (no PII, no individual listings). Time to first dollar ≈ month 9; 10 campuses in year 2 = $25k/yr. Listed for completeness; it is the only data product this lens allows.

### 2.8 Month-6 summary (April 2027, 12 campuses, 11k MAU)

| # | Stream | Gross $/mo | Direct cost $/mo | Contribution $/mo |
|---|---|---|---|---|
| 1 | Secure Payment fee (+ reserve sweep) | 5,400 | 1,200 processing + 1,080 reserve | 3,120 |
| 2 | Verified Spotlight boosts | 4,900 | 200 | 4,700 |
| 3 | Landlord Pro | 3,000 | 100 | 2,900 |
| 4 | Verified Viewing | 3,016 | 1,872 payouts | 1,144 |
| 5 | Newcomer Kit + insurance at checkout | 5,060 | 0 | 5,060 |
| 6 | Sponsors / Verified Building | 2,500 | 0 | 2,500 |
| | **Total** | **≈ $23,900** | **≈ $4,450** | **≈ $19,400** |

Sensitivity: every ±1 active campus at wave-2 scale moves the total by ≈ ±$1,100/mo; every ±5 points of Secure Payment adoption moves it by ≈ ±$900/mo; every ±5 points of lease-proof share moves boosts by ≈ ±$350/mo.

---

## 3. 30 / 60 / 90-day plan (Day 0 = 2026-11-03)

### Days 1–30 — "Verified supply + first dollars" (wave 1: Chicago cluster)

**Campuses (3):** Northwestern (Evanston), University of Chicago (Hyde Park), UIUC (Champaign-Urbana). Rationale: one metro for ops density, winter sublet season (Nov–Jan posting for study-abroad/December grads), UIUC pre-leasing starts January, and the admin team can physically vet the first ambassadors and landlords.

**Ships:**
1. Verification ladder L1–L3 with **manual human ID review** (no face-matching — BIPA, Illinois), 24h review SLA, audit log, encrypted storage, 30-day auto-delete after decision.
2. **Lease-proof badge** flow (upload lease page → redact → admin review) and **Verified Owner/Manager badge** flow.
3. First-message **scam banner** naming Zelle/CashApp/Alipay/WeChat Pay deposits, overpayment checks, "can't show it, I'm abroad"; "in-app payment only" policy page in zh/en.
4. **Boosts live on real Stripe Checkout** (one-time payments, test mode until the Stripe account is activated; eligibility gate enforced server-side).
5. **Newcomer Kit v1** with signed programs: Amazon Associates (Prime Student bounty), Impact.com publisher account (Lemonade, Mint Mobile, Wise, SoFi where SSN applies), Visible referral, Remitly; Chase/Discover applications filed via CJ/FlexOffers.
6. Events instrumentation: every funnel in §4.4 emits from day 1 so the day-60 media kit and the Stripe Connect application have real numbers.

**Partnerships to sign first, and how:**
- **Impact.com publisher account** (one application covers Lemonade, Mint, Wise, SoFi, Remitly, PODS, Extra Space): apply day 1 with the live site + traffic plan; expect 7–14 days.
- **Amazon Associates**: apply day 1; needs 3 qualifying sales within 180 days to stay active — Prime Student trial links in the Kit satisfy this.
- **CSSA chapters at the 3 campuses**: offer a co-branded "verified housing" page and $5 boost credit per verified member; ask for one pinned post per WeChat group (not an admin role — we are replacing the group, not joining it).
- **UIUC Tenant Union / Northwestern Off-Campus Life**: ask to be listed as a free resource; share the scam-pattern page; this is the seed of the §2.7 report relationship.
- **Stripe**: activate the standard account (day 1), and **file the Stripe Connect platform application on day 10** with the Secure Payment flow description (delayed payouts, no custody) so approval lands before day 60.
- **Counsel engagement (day 5)**: one fixed-fee memo (~$15–25k) covering (i) money-transmission posture of Stripe Connect delayed payouts in IL/NY/MA/CA/WA/MI, (ii) whether Deposit Protection is a guarantee or insurance in those states, (iii) state security-deposit statutes applied to sublets, (iv) BIPA notice/consent text, (v) FHA shared-living wording.

**Day-30 targets:** 600 L1 users, 150 L2, 40 L3; 180 sublet listings (60% lease-proof); 25 boosts; Kit: 400 opens, 30 conversions (~$900).

### Days 31–60 — "Recurring revenue + the human trust layer" (wave 2a: NYC / Boston / LA)

**Campuses (+5 → 8):** NYU, Columbia, Northeastern, Boston University, USC (ranks 1, 3, 2, 9, 5 by international enrollment — MARKET §1.2). Each launches with: campus seed (shuttle via Passio GO GTFS for NYU/Columbia, approximate otherwise), 5 ambassadors recruited through CSSA + department WeChat groups, and 20 pre-verified landlords (ops cold-outreach to the top 50 student-housing landlords/PMs near each campus with a free Pro trial).

**Ships:**
1. **Landlord Pro** (Stripe Billing subscriptions, trial gated by Verified Owner/Manager badge), Pro analytics, lead inbox with trust-level filters.
2. **Verified Viewing pilot** at Northwestern + UChicago with 10 ambassadors; ambassador app screens (job list, on-site checklist, EXIF-checked upload).
3. Secure Payment **in sandbox end-to-end** (Stripe Connect test mode, ACH + card + Alipay), admin release/refund queue, Deposit Protection claim form — behind a feature flag.
4. Sponsor media kit auto-generated from admin KPIs (per-campus MAU, listing views, Kit opens).
5. Referral credits ($5 boost credit per *verified* referral, paid only when the referee reaches L2).

**Partnerships:** Stripe Connect approval (follow up weekly); **Lemonade** direct/embedded quote (higher payout than Impact when volume >50 policies/mo); **CORT** campus partner agreement (Boston/NYC/LA have CORT student programs); first two **Verified Building** prospects — one PBSA operator per metro (approach uhomes/Amber's US partner buildings and local operators such as the top 3 student-housing managers in each metro, with the free Verified Viewing as the hook); **MyLimoTime-style airport partners** at each campus for the buddy module's airport-pickup sponsor slot.

**Day-60 targets:** 3,500 L1, 1,000 L2, 250 L3; 650 active sublet listings; 110 boosts/mo; 15 Pro trials, 8 paying; 40 Verified Viewings; Kit $2.5k/mo; counsel memo delivered.

### Days 61–90 — "Money moves safely" (wave 2b: Bay Area / Seattle / Ann Arbor + LA #2)

**Campuses (+4 → 12):** UC Berkeley, University of Washington, University of Michigan, UCLA. Rationale: Bay Area/Seattle are the **intern-destination** metros (nationwide-toggle demand from every other campus, May–Aug), Ann Arbor has the most notorious summer glut (boost demand), UCLA completes LA.

**Ships:**
1. **Secure Payment live** (ACH default, cards and Alipay/WeChat Pay with pass-through fees, delayed payouts, 48h auto-release, dispute queue) at all 12 campuses, **only for payees with lease-proof/Verified Owner badge at L3**, subject to counsel's per-state green list (launch in states cleared; others show "coming soon").
2. **Deposit Protection** terms published; reserve ledger live (20% of fees); claim SLA 5 business days.
3. Nationwide Spotlight boost + cross-city "wanted" matching with intern-season landing pages ("西雅图实习短租", "SF summer intern sublet").
4. Renters insurance offer inside Secure Payment checkout (Lemonade), "No-SSN" labels in Kit re-verified.
5. Pro+ tier with CSV import; first Verified Building pages.
6. Trust dashboard in admin (verification SLA, fraud rate, Deposit Protection reserve, claims).

**Partnerships:** sign **2 Verified Buildings** and **5 local sponsors**; open conversations with 3 international-student offices (Northwestern OISS, UIUC ISSS, UW ISS — UW already publishes scam alerts) for the §2.7 report; file for **Chase/Discover** card programs if not yet approved.

**Day-90 targets:** 7,000 L1, 2,200 L2, 700 L3; 1,000 active sublet listings; 60 Secure Payments in the first 3 weeks ($2k fees); 35 Pro subscribers; 80 Verified Viewings/mo; Kit $3.5k/mo; 3 sponsors signed. Then wave 3 (months 4–6): Arizona State, Purdue, Carnegie Mellon, UPenn, Cornell, UW–Madison, Ohio State, Georgia Tech, UT Dallas, UNT, UCSD, Johns Hopkins — ops-light launches (seed + 3 ambassadors + landlord outreach) toward 24 campuses by month 9, before the August peak.

---

## 4. Product requirements this implies (billing module + admin dashboard)

Conventions from BRIEF §5: money in integer cents USD, timestamps ISO-8601 UTC, IDs `crypto.randomUUID()`, `{ ok, data | error }` envelopes, zod on every body, `requireAuth` / `requireRole('admin')` / `requireTrust(n)` middlewares, migration `18_billing.sql` (billing) and `19_admin.sql` (admin), i18n via `useT()`.

### 4.1 Pricing table (`billing_products`, seeded; editable in admin "Pricing" screen, every change audit-logged)

| `sku` | `kind` | `entity_type` | `name_en` / `name_zh` | `price_cents` | `duration_days` | `requires_trust` | `requires_badge` | Notes |
|---|---|---|---|---|---|---|---|---|
| `boost.sublet.3d` | boost | listing | Spotlight 3 days / 推广3天 | 900 | 3 | 2 | `lease_proof` OR `verified_owner` | |
| `boost.sublet.7d` | boost | listing | Spotlight 7 days | 1900 | 7 | 2 | same | |
| `boost.sublet.14d` | boost | listing | Spotlight 14 days | 3900 | 14 | 2 | same | |
| `boost.sublet.30d` | boost | listing | Spotlight 30 days | 6900 | 30 | 2 | same | |
| `boost.sublet.nationwide` | addon | listing | Nationwide Spotlight / 全美曝光 | 1000 | inherits | 2 | same | add-on, requires a parent boost |
| `boost.item.1d` / `.3d` / `.7d` | boost | item | Item spotlight | 299 / 499 / 999 | 1 / 3 / 7 | 2 | — | |
| `boost.bundle.7d` | boost | item_bundle | Move-out bundle spotlight | 999 | 7 | 2 | — | bundle linked to a sublet listing |
| `boost.buddy.1d` / `.3d` | boost | buddy_post | Event spotlight | 199 / 499 | 1 / 3 | 2 | — | |
| `pro.monthly` / `pro.yearly` | subscription | user | Landlord Pro | 2900 / 24900 | 30 / 365 | 3 | `verified_owner` | 14-day trial |
| `proplus.monthly` / `proplus.yearly` | subscription | user | Landlord Pro+ | 7900 / 69900 | 30 / 365 | 3 | `verified_owner` | 2 seats |
| `secure.fee` | fee | secure_payment | Secure Payment service fee / 安心付服务费 | rate 300 bp, `min_cents` 500, `cap_cents` 6000 | — | payer 2, payee 3 | payee `lease_proof` OR `verified_owner` | |
| `secure.card_passthrough` | fee | secure_payment | Card processing | rate 290 bp + 30 | — | — | — | only when rail = card; hidden for ACH |
| `viewing.badge` / `viewing.private` | service | listing | Verified Viewing / 认证看房 | 2900 / 3900 | — | 2 | — | `payout_cents` 1800 / 2500 |
| `sponsor.local.1` / `.3` / `.6` | sponsorship | campus | Verified Sponsor tile(s) | 15000 / 30000 / 60000 | 30 | — | business verified | invoiced, 3-month min |
| `sponsor.building` / `.building.small` / `.building.metro` | sponsorship | building | Verified Building page | 50000 / 30000 / 100000 | 30 | — | business verified | includes 1 Verified Viewing |
| `credit.referral` | credit | user | Referral credit | −500 | — | referee reaches 2 | — | boosts only, 180-day expiry |

Promo codes (`promo_codes`): `code, percent_off | amount_cents, applies_to_sku_prefix, max_uses, per_user_limit, campus_id?, expires_at` — e.g. `CSSA-NU-5` = $5 off first boost.

### 4.2 Data model (migration `18_billing.sql`, additive)

- `billing_products` (above) + `pricing_history(product_sku, old_json, new_json, changed_by, reason, created_at)`.
- `orders(id, user_id, campus_id, sku, entity_type, entity_id, amount_cents, discount_cents, credit_cents, total_cents, currency='usd', status ENUM(created, pending_payment, paid, fulfilled, refunded, cancelled, failed), provider ENUM(stripe_checkout, stripe_billing, stripe_connect, mock), provider_ref, promo_code, created_at, paid_at, fulfilled_at)`.
- `boosts(id, order_id, entity_type, entity_id, campus_id, nationwide INTEGER, starts_at, ends_at, status ENUM(scheduled, active, ended, revoked), revoked_reason, impressions, clicks)` — one row per fulfilled boost; the listings/market/buddy list APIs read `boosts` to place "Sponsored" cards (max 2 per page of 20, always labelled).
- `subscriptions(id, user_id, sku, status ENUM(trialing, active, past_due, cancelled, suspended), trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, provider_ref, seats, suspended_reason)`.
- `secure_payments(id, listing_id, payer_id, payee_id, campus_id, state_code, purpose ENUM(deposit, first_month, deposit_plus_first_month), amount_cents, fee_cents, fee_split ENUM(payer, payee, half), card_fee_cents, rail ENUM(ach, card, alipay, wechat_pay), status ENUM(quoted, awaiting_funds, funded, held, release_requested, released, refund_requested, refunded, disputed, resolved_release, resolved_refund, expired), move_in_date, auto_release_at, provider_payment_intent, provider_transfer, created_at, funded_at, released_at, refunded_at)` + `secure_payment_events(id, secure_payment_id, actor_id, actor_role, from_status, to_status, note, created_at)` (state machine audit).
- `protection_claims(id, secure_payment_id, claimant_id, reason ENUM(fraud_listing, not_on_lease, not_as_described, no_access, other), evidence_json, amount_requested_cents, amount_paid_cents, status ENUM(open, needs_info, approved, denied, paid), decided_by, decided_at, decision_note)`.
- `protection_reserve_ledger(id, secure_payment_id?, claim_id?, delta_cents, balance_after_cents, kind ENUM(sweep, payout, adjustment), created_at)` — 20% of every `fee_cents` sweeps in; claims pay out; admin sees balance and loss ratio.
- `viewings(id, order_id, listing_id, requested_by, kind ENUM(badge, private), ambassador_id, status ENUM(requested, assigned, scheduled, completed, failed, cancelled), scheduled_at, completed_at, report_json(photos[], video, lease_name_matched BOOL, geo_ok BOOL, exif_ok BOOL, notes), payout_cents, payout_status)` + `ambassadors(user_id, campus_id, status, jobs_week, rating, onboarded_at)`.
- `affiliate_partners(id, slug, name_en, name_zh, category, network ENUM(impact, cj, flexoffers, amazon, inhouse), payout_cents_est, no_ssn_ok BOOL, no_ssn_verified_at, rank, rating, status ENUM(active, paused, delisted), delist_reason)`; `affiliate_clicks(id, user_id?, partner_id, campus_id, placement ENUM(kit, checkout, listing_detail, buddy), click_id, created_at)`; `affiliate_conversions(id, click_id?, partner_id, network_ref, payout_cents, status ENUM(pending, approved, reversed), occurred_at, imported_at)` (CSV/Impact API import).
- `sponsors(id, business_name, ein_last4, verified_at, verified_by, contact, campus_ids JSON, sku, slots, starts_at, ends_at, invoice_status)`, `sponsor_impressions(sponsor_id, day, impressions, clicks)`.
- `wallet_ledger(id, user_id, delta_cents, balance_after_cents, kind ENUM(referral_credit, promo, refund_credit, boost_spend, expiry), ref_id, expires_at, created_at)`.
- `revenue_events(id, occurred_at, campus_id, stream ENUM(secure_fee, boost, subscription, viewing, affiliate, sponsorship, credit), gross_cents, cost_cents, net_cents, order_id?, user_id?, meta JSON)` — the single table the admin dashboard aggregates; written by every fulfilment path.

### 4.3 Flows and screens (web `features/billing`)

1. **Pricing page** `/pricing` — three columns (Boost / Landlord Pro / Secure Payment) + Verified Viewing card; every price in zh/en; a "What's always free" box (verification, badges, reporting, scam warnings, browsing, posting).
2. **Boost purchase sheet** (opened from listing/item/buddy owner dashboard): eligibility check first (`GET /api/billing/eligibility?sku=&entityId=`) → if ineligible, show *why* and the free fix ("Upload your lease page to unlock Spotlight — reviewed within 24h") with a deep link to verify; tier picker; Nationwide add-on toggle (sublet only); promo code; credit auto-applied; Stripe Checkout redirect; return page shows the live boost with ends_at and a "Sponsored" preview.
3. **Landlord Pro** `/pro`: badge gate ("Get verified as owner/manager first — free") → plan picker → Stripe Billing Checkout with trial → `/pro/dashboard` (listings, views/leads/boost uplift, lead inbox with trust filter, team seats on Pro+, CSV import on Pro+).
4. **Secure Payment** — entry points: listing detail "Pay deposit securely / 安心付押金" (only if payee eligible; else "This host can't receive Secure Payment yet — ask them to verify" and we message the host); chat context card "Request Secure Payment" (payee side). Screens: (a) Quote: amount, purpose, move-in date, fee line "Service fee 3% ($33.00)", fee split selector, rail selector with cost shown; (b) Deposit Protection summary (what's covered, caps, 48h window, bilingual, link to terms); (c) Pay (Stripe PaymentElement: ACH default); (d) Status timeline (awaiting funds → held → release); (e) "Confirm move-in" (payer) / "Request release" (payee) / "Report a problem" (opens `protection_claims`); (f) Receipts (both sides, PDF). Auto-release job runs hourly.
5. **Verified Viewing** — from listing owner dashboard ("Add a verified viewing badge $29") or renter listing detail ("Request a private viewing report $39"); scheduling picker; status; report viewer (photos, video, lease-name-matched check); ambassador portal `/ambassador` (jobs near me, checklist, upload with EXIF validation, earnings).
6. **Newcomer Kit** `/kit` — categories, partner cards with "Sponsored" + "No SSN needed" labels, outbound links `GET /api/billing/affiliate/out/:partnerId` (302 with `click_id` and `subId` params), campus-specific tips, share card for WeChat/XHS.
7. **Wallet** `/wallet` — credits balance, ledger, referral link, promo redemption.
8. **Mock Stripe mode** — all of the above work with provider `mock` when `STRIPE_SECRET_KEY` is unset: a labelled "TEST MODE — no real money" page simulates success/failure/ACH-pending.

Server routes (`server/src/modules/billing/routes.ts`): `GET /products`, `GET /eligibility`, `POST /orders` (+ `POST /orders/:id/checkout`), `POST /webhooks/stripe` (raw body; idempotent on event id), `POST /subscriptions`, `POST /subscriptions/:id/cancel`, `POST /secure-payments/quote`, `POST /secure-payments`, `POST /secure-payments/:id/confirm-move-in`, `POST /secure-payments/:id/request-release`, `POST /secure-payments/:id/dispute`, `POST /viewings`, `GET /viewings/:id`, `POST /ambassador/viewings/:id/report`, `GET /affiliate/partners`, `GET /affiliate/out/:partnerId`, `POST /promo/validate`, `GET /wallet`, `POST /referrals/claim`. All money endpoints `requireTrust(2)`; payee-side Secure Payment and Pro `requireTrust(3)`.

### 4.4 Events (written to `events(user_id, type, entity, props, created_at)`; names are stable contracts)

`pricing.view` · `boost.eligibility_checked {sku, eligible, reason}` · `boost.sheet_opened` · `boost.checkout_started {sku, nationwide, promo}` · `boost.paid {order_id, total_cents}` · `boost.impression {boost_id}` · `boost.click {boost_id}` · `pro.trial_started` · `pro.converted {sku}` · `pro.cancelled {reason}` · `secure.quote_viewed {amount_cents, rail}` · `secure.started` · `secure.funded {rail}` · `secure.held` · `secure.move_in_confirmed` · `secure.released {hours_held}` · `secure.dispute_opened {reason}` · `secure.refunded` · `secure.offplatform_warning_shown` (when a chat message contains Zelle/Venmo/CashApp/支付宝/微信支付 + a dollar amount) · `protection.claim_opened` · `protection.claim_decided {status, amount_cents}` · `viewing.requested {kind}` · `viewing.completed {lease_name_matched, exif_ok}` · `kit.opened {campus_id, pre_arrival BOOL}` · `kit.partner_click {partner_id, placement}` · `kit.conversion_imported {partner_id, payout_cents}` · `sponsor.impression` · `sponsor.click` · `wallet.credit_granted {kind}` · `verify.level_changed {from, to}` · `badge.granted {badge}`. PII rule: never write passport/ID numbers or lease images' content to `events`.

### 4.5 Admin dashboard (web `features/admin`, migration `19_admin.sql` for `feature_flags`, `admin_actions`)

Screens (all campus-filterable with a nationwide total, date range, export CSV):

1. **Revenue & KPI** — tiles: MRR (subscriptions), gross revenue MTD by stream (stacked), GMV through Secure Payment, take rate, boosts sold, Kit clicks → conversions → payout, ARPU by trust level; funnels: listing → boost sheet → paid; quote → funded → released; Kit open → click → conversion; per-campus table (MAU, listings, lease-proof %, L2/L3 %, revenue, revenue per MAU).
2. **Trust** — verification queue SLA (median hours, backlog by level, approve/reject rate with reasons), lease-proof & owner-badge queues, fraud rate (`upheld reports / listings`), off-platform-payment warnings shown vs. Secure Payments started, Deposit Protection reserve balance and loss ratio (claims paid ÷ fees), ambassador ratings and EXIF-failure rate.
3. **Secure Payment ops** — table by status with ageing; actions: release, refund, split, extend hold, escalate; every action writes `secure_payment_events` and `admin_actions`; 72h dispute SLA timer.
4. **Protection claims** — queue with evidence viewer, decision form (approve amount / deny with reason), auto-suspend payee on approved fraud claim, payout to payer via Stripe refund or transfer.
5. **Subscribers** — Pro/Pro+ list, trial→paid, churn, suspend with pro-rated refund.
6. **Sponsors & Buildings** — business verification checklist (EIN, license, phone call), slot calendar per campus, impressions/clicks, invoice status, media-kit generator (PDF with per-campus MAU and funnel numbers).
7. **Kit editor** — partners CRUD, `rank` vs `payout_cents_est` shown side by side, "No-SSN verified on <date>" field, delist with reason, conversion CSV/API import, reconciliation (clicks vs network-reported conversions).
8. **Pricing & flags** — `billing_products` editor (diff + reason required; writes `pricing_history`), promo codes, feature flags (`secure_payment_states_enabled: ["IL","NY",...]`, `viewing_enabled_campuses`, `boost_max_per_page`, `protection_claim_cap_cents`, `protection_monthly_cap_cents`).
9. **Audit log** — every admin view of an ID image, every money action, every pricing change; immutable; searchable by actor/entity.

---

## 5. Unit economics and 12-month P&L sketch

### 5.1 Unit economics (month-6 steady state unless noted)

| Unit | Revenue | Direct cost | Contribution | Notes |
|---|---|---|---|---|
| L2 verification (manual) | $0 | ≈ $1.00 (3 min × $20/h) | −$1.00 | Cost of the audience; a vendor (Persona/Stripe Identity) is $1–3 and adds BIPA exposure — stay manual until >3k reviews/mo |
| L3 + lease-proof review | $0 | ≈ $2.50 | −$2.50 | Unlocks every paid product below |
| Sublet boost | $26.50 avg | ≈ $1.00 processing | **$25.50** | |
| Pro subscriber / month | $29 (Pro) · $79 (Pro+) | $1.20 Stripe Billing + ≈ $3 one-time review | **$27 / $75** | Expected tenure 7 months (seasonal) → LTV ≈ $190 / $520 |
| Secure Payment (ACH, $1,100) | $33 fee | $5 ACH + $3 transfer + $6.60 reserve sweep | **$18.40** (+ $6.60 to reserve) | Card rail: pass-through covers Stripe; same contribution |
| Secure Payment (ACH, $2,000 cap case) | $60 cap | $5 + $5.25 + $12 reserve | **$37.75** | |
| Verified Viewing (badge / private) | $29 / $39 | $18 / $25 payout + $1 processing | **$10 / $13** | Ambassador earns ≈ $36/h |
| Kit engaged newcomer (Aug/Sep) | $43 EV | $0 | **$43** | Off-season opener ≈ $4 EV |
| Local sponsor tile / month | $300 | ≈ $20 sales/ops time | **$280** | |
| **Verified user, blended** (year 1) | ≈ $21/yr (year-1 revenue ÷ avg verified users) | ≈ $3.50 (verification + $5 credit × 30% referral share + support) | **≈ $17.50/yr** | Blended CAC ≈ $4 (ambassador referrals, CSSA posts, XHS content); payback in the first season |

Revenue per MAU at month 6 ≈ $23,900 ÷ 10,800 = **$2.21/MAU/month**; at month 10 (August) ≈ $3.90 driven by the Kit.

### 5.2 12-month P&L sketch (Nov 2026 – Oct 2027, gross revenue, $k)

| | M1 Nov | M2 Dec | M3 Jan | M4 Feb | M5 Mar | M6 Apr | M7 May | M8 Jun | M9 Jul | M10 Aug | M11 Sep | M12 Oct | **Year** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Active campuses | 3 | 3 | 8 | 12 | 12 | 12 | 16 | 20 | 24 | 24 | 24 | 24 | |
| MAU (k) | 0.6 | 1.5 | 4.0 | 7.0 | 9.5 | 10.8 | 13 | 12 | 15 | 24 | 26 | 20 | |
| Secure Payment fees | 0 | 0 | 0 | 0.8 | 3.0 | 5.4 | 6.5 | 4.0 | 7.0 | 14.0 | 11.0 | 4.5 | 56.2 |
| Boosts | 0.2 | 0.6 | 1.6 | 2.6 | 4.2 | 4.9 | 5.2 | 2.4 | 3.2 | 5.6 | 4.4 | 2.6 | 37.5 |
| Landlord Pro | 0 | 0.3 | 1.0 | 1.8 | 2.5 | 3.0 | 3.3 | 3.4 | 3.8 | 4.6 | 5.0 | 5.0 | 33.7 |
| Verified Viewing | 0 | 0 | 0.5 | 1.5 | 2.5 | 3.0 | 3.4 | 2.3 | 5.0 | 8.0 | 5.0 | 2.0 | 33.2 |
| Newcomer Kit + insurance | 0.3 | 0.9 | 1.8 | 2.4 | 3.8 | 5.1 | 5.5 | 6.0 | 15.0 | 32.0 | 24.0 | 7.0 | 103.8 |
| Sponsors / Buildings | 0 | 0 | 0 | 0.9 | 1.8 | 2.5 | 3.4 | 3.4 | 4.5 | 6.0 | 7.0 | 7.0 | 36.5 |
| **Gross revenue** | **0.5** | **1.8** | **4.9** | **10.0** | **17.8** | **23.9** | **27.3** | **21.5** | **38.5** | **70.2** | **56.4** | **28.1** | **≈ 301** |
| Direct costs (processing, ambassador payouts, reserve sweep) | 0.1 | 0.2 | 0.6 | 1.9 | 3.4 | 4.5 | 5.0 | 3.6 | 6.3 | 11.3 | 8.6 | 3.8 | 49.3 |
| **Contribution** | 0.4 | 1.6 | 4.3 | 8.1 | 14.4 | 19.4 | 22.3 | 17.9 | 32.2 | 58.9 | 47.8 | 24.3 | **≈ 252** |
| Team (2 eng + 1 trust/ops lead + 1 founder-GTM, startup salaries) | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 360 |
| Verification/ops contractors (reviews, dispute handling) | 1 | 1.5 | 3 | 4 | 5 | 5 | 5 | 4 | 6 | 9 | 8 | 5 | 56.5 |
| Legal (counsel memo M1–M3; state follow-ups) | 10 | 10 | 5 | 1 | 1 | 1 | 2 | 1 | 1 | 2 | 1 | 1 | 36 |
| Infra, tooling, Stripe fixed fees, SMS/email | 0.6 | 0.6 | 0.8 | 1.0 | 1.2 | 1.3 | 1.5 | 1.5 | 1.8 | 2.5 | 2.5 | 2.0 | 17.3 |
| Marketing (ambassador stipends, CSSA co-branding, XHS content, referral credits) | 2 | 2 | 4 | 4 | 4 | 4 | 5 | 4 | 8 | 10 | 6 | 3 | 56 |
| **Operating expenses** | 43.6 | 44.1 | 42.8 | 40.0 | 41.2 | 41.3 | 43.5 | 40.5 | 46.8 | 53.5 | 47.5 | 41.0 | **≈ 526** |
| **Net** | −43.2 | −42.5 | −38.5 | −31.9 | −26.8 | −21.9 | −21.2 | −22.6 | −14.6 | **+5.4** | **+0.3** | −16.7 | **≈ −274** |

Reading: gross revenue ≈ $300k (inside MARKET's $300–600k year-1 range; trust gating costs us the top of the range in year 1 and buys defensibility), first contribution-positive months are the August/September intake, cumulative burn ≈ $275k → **raise or allocate ≈ $400k** to reach month 12 with buffer. Year 2 drivers: 24→40 campuses, Secure Payment adoption 30%→50% as Deposit Protection claims get publicized, Pro tenure, and the §2.7 university report. Deposit Protection reserve at month 12 ≈ $11k swept vs. expected claims ≈ 0.3% of $1.9M held GMV ≈ $5.6k — the reserve covers ~2× expected loss; the admin monthly cap protects against a tail event.

---

## 6. Top 5 risks and mitigations

1. **Legal: holding deposits is money transmission; the guarantee may be deemed insurance; state deposit statutes.** Mitigation: (a) no custody — Stripe Connect delayed payouts only, platform balance never holds user funds, UI never says "escrow" (MARKET §6.3); (b) counsel memo before go-live covering IL/NY/MA/CA/WA/MI and a per-state feature flag (`secure_payment_states_enabled`) so unlisted states see "coming soon" instead of a product we can't defend; (c) Deposit Protection drafted as a conditional platform refund policy funded by the platform (AirCover structure), capped at $1,500/claim and $25k/month, re-reviewed when monthly held GMV exceeds $250k; (d) fallback if counsel says no in a state: route that state to a licensed provider (Escrow.com API at ≈3.25%) and keep our 3% fee as a referral/convenience layer; (e) BIPA: manual ID review, written consent text, 30-day deletion, no biometrics until a vendor with BIPA-compliant consent is contracted. Budget: $36k year 1 (above).

2. **Fraud: cloned listings, unauthorized sublessors, double deposits, ambassador collusion, affiliate click fraud.** Mitigation: lease-proof badge required to receive money or buy reach; payee must be L3 (ID + phone + payment method on file → a real bank account identity via Stripe KYC); duplicate-photo hash check across listings nationwide (a cloned listing in Seattle is caught against its Evanston original); one open Secure Payment per listing per move-in date (blocks double-deposit); off-platform-payment regex banner in chat; ambassador rotation + EXIF/geo check; Deposit Protection claim with evidence and 5-day decision; target fraud loss ratio < 0.5% of held GMV, kill-switch flag per campus if > 1.5%. Affiliate: server-side `click_id` → network `subId` reconciliation; conversions imported, never self-reported.

3. **Chicken-and-egg across 66 campuses.** Mitigation: launch in metro clusters (Chicago → NYC/Boston/LA → Bay/Seattle/Ann Arbor), 3–9 campuses per wave, never a campus without ≥5 ambassadors and ≥20 pre-verified landlords on day 1; seed each campus with landlord Pro trials (supply) and CSSA co-branded "verified housing" pages (demand); nationwide toggle means intern-destination supply (Bay Area/Seattle/NYC) is demanded by every other campus, so wave-2b supply has nationwide demand immediately; the free products (Kit, buddy, shuttle) create daily utility before a user needs a sublet. Success gate per campus before spending on the next: 300 L2 users and 60 lease-proof listings.

4. **Seasonality: ~50% of sublet volume is Mar–May; the Kit is Jul–Sep; Pro is Jan–Apr.** Mitigation: the six streams are deliberately counter-cyclical (see P&L: Pro and sponsors carry Nov–Feb, boosts + Secure Payment carry Mar–May, Kit + Viewing carry Jul–Sep, item boosts carry move-out May/June); annual Pro plan at $249 (2 months free) to lock landlords through the summer; Verified Viewing and Nationwide Spotlight sold against the intern cycle (Mar–Apr orders for May–Aug stays); cash plan assumes the trough months (Jun, Oct–Dec) and keeps 3 months of opex in reserve.

5. **Platform dependence on WeChat / Xiaohongshu for distribution (and the risk of being blocked or out-competed inside them).** Mitigation: we never run the WeChat groups — we post *into* them (CSSA pinned post, share cards) and pull users to a verified web product with their own `.edu` identity; every user has an email + phone, so retention channels are ours (digest emails, SMS with consent, in-app bell); listings are SEO pages ("UIUC 转租", "Seattle intern sublet") so Xiaohongshu/Google searches land on us; Kit share links are plain URLs that work inside WeChat's browser without a mini-program; if WeChat blocks our domain, the mobile web app + email/SMS still reach 100% of verified users (unlike incumbents whose only identity is the WeChat ID). Trust itself is the switching cost: badges, lease-proof history, Deposit Protection record and ratings don't exist anywhere else and cannot be exported into a group chat.

---

### Appendix — what this lens says no to

- No paid verification, no paid "fast-track" badges, no paid removal of scam warnings (BRIEF §6.3).
- No boosts for listings we haven't reviewed, and no boost that changes the verified-only sort.
- No individual referral codes in the Kit; no partner ranked by payout.
- No "escrow" wording, no custody of funds, no launch of Secure Payment in a state counsel hasn't cleared.
- No biometric ID matching in Illinois (or anywhere) without BIPA-grade consent and a retention schedule.
- No nationality/religion/gender preferences outside `shared_living = true`, and never as a required field.
