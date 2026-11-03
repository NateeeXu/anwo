# Strategy — "Growth-First" lens

> Lens: optimize for user acquisition and network effects across many campuses, then show exactly how density converts into dollars. Companion lenses: `docs/strategy/revenue-first.md`, `docs/strategy/trust-first.md`. Inputs: `docs/BRIEF.md`, `docs/MARKET.md` (all MARKET numbers keep their [fact]/[estimate] tags; everything new here is an **estimate** unless cited), `docs/DATA_MODEL.md` (table and enum names used below are the ones the architect already defined; additions are marked *new*).
>
> Day 0 = 2026-11-03. "Month 6" = April 2027, which is the peak of summer-sublet posting (MARKET §1.3: 45–55% of annual sublet listings post Mar–May). The growth plan is deliberately timed so the network is dense before that peak.

---

## 0. The growth thesis in one paragraph

A sublet marketplace is worth nothing at 50 users per campus and everything at 1,500. The entire plan is therefore organised around one unit, the **campus**, one state machine, **seed → igniting → lit → dense**, and one number per campus, **weekly listing reply rate** (share of live sublets that received at least one in-app message in the last 7 days). Revenue is a *function of density*: a $19 boost at a campus with 2,000 MAU is shown ~10× more than at a campus with 200 MAU; a $250/month sponsor only buys when the campus feed has >5,000 weekly views; a landlord only subscribes when there are leads in the inbox; the Newcomer Kit only converts when the campus 新生群 (freshman group) already trusts the platform. So: light campuses one wave at a time, make every listing a share object that recruits its own viewers, pay ambassadors for verified density, and sell paid features only where the ignition metrics say they will sell. The user owns nothing hard-coded to Northwestern; it is wave 0 of 60.

---

## 1. Positioning and the one-sentence promise

**Positioning.** The verified, bilingual campus network for international students in the US: every sublet, item, ride and roommate near your campus, posted by someone with a verified `.edu` identity, findable in 10 seconds instead of scrolling 12 WeChat groups, and switchable to any other campus when you move for an internship or a job.

**One-sentence promise (user-facing, zh first):**

> **「一个校园一个圈子，全美通用：认证的人，认证的房，钱走平台。」**
> *One circle per campus, usable across all of America: verified people, verified listings, money handled on-platform.*

**Why this is a growth positioning, not just a trust positioning.** "One circle per campus" is the invitation to join the circle (join → verify → you are in); "usable across all of America" is the reason to *stay* registered after you leave the campus (the nationwide toggle is a retention feature: UIUC junior → Seattle intern → NYC OPT job, three cities, one account, MARKET §1.3 puts cross-city at 15–20% of summer demand plus 5–10% OPT relocation); "money walks on the platform" is the reason to bring the counterparty on-platform instead of closing the deal in WeChat, which is where the K-factor comes from.

**Who we are not.** Not a PBSA booking agent (uhomes/Amber), not a landlord ad network (Zillow, campus portals), not a national roommate site (SpareRoom). We are the layer those channels do not have: `.edu`+ID identity, campus scope, zh/en, and the share-into-WeChat/XHS loop that recruits the next user.

---

## 2. Revenue streams, ranked

Ranking is by **month-6 cash revenue weighted by growth contribution** (does the stream add users, or only extract from them?). Streams that tax demand-side users (an "Early Bird" contact paywall, a seeker subscription) are explicitly rejected in this lens: they cut K-factor and are the main thing that made Roomster/Sublet.com feel dead.

### Month-6 operating assumptions (April 2027; every estimate below uses these)

| Variable | Value | How we get there (see §3) |
|---|---|---|
| Campuses with an active ambassador | **30** | Waves 0–4 (Chicago cluster → college towns → coasts → Sun Belt/Midwest) |
| Campuses **lit** (≥1,000 registered, ≥60 live sublets, reply rate ≥40%) | **12** | NU, UChicago, UIUC, NYU, Columbia, Northeastern, BU, USC, UCLA, Berkeley, UW, Michigan |
| Registered users | **36,000** | cumulative; ≈11% of the ~330k international students at the 30 campuses |
| L1 (edu-verified) users | **29,000** (80%) | verification is required to message, so most registrants verify |
| MAU | **20,000** (55% of registered) | April is in-season; off-season MAU/registered ≈ 35–40% |
| Sublet listings published in April | **3,600** (10% of registered) | summer-sublet posting peak |
| Item listings / buddy posts / wanted posts in April | 2,800 / 700 / 1,500 | move-out prep, Costco/airport runs, intern seekers |
| Newcomer Kit openers in April | **2,400** (12% of MAU) | fall-2027 admits joining 新生群 after I-20s (Mar–May), summer interns, OPT movers |

### 2.1 Newcomer Kit (affiliate hub) — rank 1

| | |
|---|---|
| **Pricing** | Free to users. Partner payouts to us per approved conversion (MARKET §5): bank account $75 (Chase/BofA/Wells via CJ/Impact-style publisher programs), student/no-SSN credit card $75 (Discover it Student, Deserve EDU, Zolve), SIM/eSIM $20 (Mint, Visible, Ultra; Airalo/Holafly $2–8), renters insurance $20 (Lemonade $15 lead / $20–25.50 policy [fact]), Wise/Remitly $18, movers/storage/furniture $35 (Dolly/Lugg/PODS/Extra Space/CORT), Amazon Prime Student $3 [fact]. |
| **Who pays** | The partner (publisher CPA). Never the student. |
| **Time to first dollar** | Day 3 (Amazon Associates bounty and Lemonade/Impact approve in 24–72 h). Bank/card programs take 2–6 weeks of publisher approval, so they land in month 2. |
| **Growth role** | This is the **pre-arrival funnel**: the Kit page is the first thing an admitted student sees when the campus ambassador shares it into the 2027 新生群 in April–June, months before they can post a sublet. It converts strangers into registered users with a campus already selected. It is also what funds ambassadors (see §5). |
| **Assumptions** | Peak-season EV per engaged newcomer = $43 (MARKET §5.1). In April the mix is pre-arrival and relocation: eSIM/SIM pre-order 10% × $20 = $2.00; Wise/Remitly 12% × $18 = $2.16; renters insurance (interns, moves) 6% × $20 = $1.20; storage/movers (May move-out bookings open) 4% × $35 = $1.40; Amazon/misc 20% × $3 = $0.60 → $7.36 gross EV, × 80% partner approval rate = **$5.90 per April opener**. |
| **Month-6 estimate** | 30 campuses → 2,400 openers (12% of 20,000 MAU) × $5.90 = **$14,160/month**. (Same funnel in August: ~2,200 engaged true newcomers × $43 ≈ $92k; see §5.2.) |
| **Trust safeguard** | Every card is labelled **"推广 · Sponsored"** (FTC endorsement rules); partner selection rule is published on the page: only products a student without an SSN can actually get, ranked by user rating not payout; payout per partner is visible in admin and the ranking SQL has no payout term; no bank "refer-a-friend" codes belonging to individuals (ToS) — publisher programs only. |

### 2.2 Boosts (sublet / item / buddy) and the credit economy — rank 2

| | |
|---|---|
| **Pricing** (`pricing_plans`, cents) | **Sublet listing:** basic 3d **$9**, basic 7d **$19** (default), basic 14d **$39**; plus 7d **$29**, plus 14d **$59** (top of map pins); max 7d **$49**, max 14d **$89** (home carousel, requires trust ≥2); **Nationwide Spotlight** add-on **+$10** (also shown in nationwide results for the listing's city — the intern-season product). **Item:** basic 3d **$4.99**, 7d **$9.99**, 14d **$14.99**; **Move-out bundle** 7d **$9.99**. **Buddy/event:** 3d **$1.99**, 7d **$4.99**. Anchors: SpareRoom Bold $15/wk–$149/6mo [fact], OfferUp Promote $3.99/day [fact]. |
| **Who pays** | The poster (supply side). Never the seeker. |
| **Time to first dollar** | Day 1 (mock checkout in demo; real Stripe card checkout is a product-key swap — no licensing issue for boosts). |
| **Growth role** | Boosts are priced so that **referral credits buy a real boost** ($5 + $5 welcome = $10 > a $9 three-day boost). Credits are the viral currency: every referral, share milestone and campus-ignition promo is paid in boost credit that costs us ~$0 and trains the paid habit. Boosts also fund the ambassador bounty. |
| **Assumptions** | 12% of April sublet listings buy a boost (SpareRoom-type paid rate, lifted by the "3 similar listings are boosted" upsell at publish). Mix: 55% 7d basic ($19), 25% 3d ($9), 12% 14d ($39), 8% plus/max (avg $45) → weighted **$21**. Items 6% at $6.50 avg; buddy 5% at $3. 90 Nationwide Spotlight add-ons (interns listing in SF/Seattle/NYC). **28% of boost face value is paid with wallet credits** (referral, ignition promos, Pro's free monthly boost). |
| **Month-6 estimate** | Sublets 3,600 × 12% = 432 × $21 = $9,072; Spotlight 90 × $10 = $900; items 2,800 × 6% = 168 × $6.50 = $1,092; buddy 700 × 5% = 35 × $3 = $105 → **$11,169 gross**; minus 28% credits → **$8,040 cash**. |
| **Trust safeguard** | DATA_MODEL §8 is non-negotiable: max 2 sponsored slots per 10 results, always labelled "Sponsored · 推广", boosts never bypass filters and never touch the wanted↔listing match score; `max` tier requires trust ≥2 so a scammer cannot buy the home carousel; a listing that gets reported twice has its boost auto-paused (refund to wallet). |

### 2.3 Sponsored placements and Verified Building pages — rank 3

| | |
|---|---|
| **Pricing** | Local business campus sponsor **$250/month** per campus (bubble tea, 接机 airport-pickup operators, bike shops, movers, Chinese supermarkets, CORT) — one slot in the campus home feed, one in the buddy/event calendar, one in the Kit "local" section; **Verified Building** page for PBSA operators / large landlords **$400/month** per building (listing-grade page with photos, map pin style, "lease directly" CTA; Zillow premium $29.99/90d and uhomes commissions $500–2,000/booking [estimate] are the anchors). Ambassadors earn 20% of first-3-month sponsor revenue they source. |
| **Who pays** | The business / building operator. |
| **Time to first dollar** | Day ~25 (first 接机 operator at Northwestern; they already pay student groups for 新生群 posts). |
| **Growth role** | Sponsors are recruited to **co-host seasonal moments**: the sponsor pays for the "Costco run" van, the airport-pickup welcome, the move-out sale tent — things that create buddy posts and group chats, i.e. users. Verified Buildings bring whole-building supply that students cannot sublet themselves (new arrivals need 9–12-month leases, MARKET §1.3). |
| **Assumptions** | Sponsors are only sellable on lit campuses (feed views >5,000/week). 12 lit × 1.5 sponsors × $250 = $4,500; 6 Verified Building pages × $400 = $2,400. |
| **Month-6 estimate** | **$6,900/month.** |
| **Trust safeguard** | No 中介/agent may buy a sponsor slot for sublets (they are the conflict of interest we are replacing; MARKET §2.2 pt 7); every sponsor and building page is labelled; Verified Building requires ownership/management proof reviewed by admin (badge is "Verified building", not "Verified by students"); sponsor content never appears in search results, only in fixed, labelled surfaces. |

### 2.4 Landlord Pro / Pro+ — rank 4

| | |
|---|---|
| **Pricing** | **Pro $29/month or $249/year** (unlimited listings, analytics, lead inbox, Pro badge, 1 free basic boost/month, priority verification); **Pro+ $79/month** for managers with 5+ units (CSV import, featured building tie-in, API). 14-day trial, card on file (`subscriptions.status='trialing'`). First listing is always free. |
| **Who pays** | Landlords / property managers. Students never. |
| **Time to first dollar** | Day ~40 (trial started day ~25 in Champaign/Evanston, converts after 14 days). |
| **Growth role** | Supply the students cannot create: whole units for incoming cohorts. Landlords are acquired *by the student network*: when a student posts a room in a building we auto-create a "claim this building" invite; when 3+ students at a campus post `wanted` for the same month, the campus page shows landlords "47 verified students are looking for August leases" — that is the sales email. |
| **Assumptions** | Avg 4 Pro subs per campus at month 6 (8–10 in pre-leasing towns Champaign, Ann Arbor, Madison, West Lafayette where leasing runs 6–9 months ahead [MARKET §1.3]; 1–2 in metros); 10 Pro+. |
| **Month-6 estimate** | 120 × $29 = $3,480 + 10 × $79 = $790 → **$4,270/month** (recurring). |
| **Trust safeguard** | Pro badge means "paid subscriber", never "verified"; Pro requires trust 3 **and** an ownership/management proof; Pro listings rank organically like everyone else; a Pro account with a confirmed scam report is cancelled and refunded pro-rata, and the audit log records it. |

### 2.5 Secure Payment service fee (deposits + first month) — rank 5 (gated by counsel)

| | |
|---|---|
| **Pricing** | **3%** of amount held, **min $5, cap $60**, paid by the payer by default (optional 1.5%/1.5% split). Card payments carry a +2% card surcharge; bank debit (ACH) is the default rail so the fee is not eaten by processing. Half of Airbnb's 15.5% host-only fee [fact]. |
| **Who pays** | The subtenant (payer) by default. |
| **Time to first dollar** | Month 5 at the earliest, only after counsel confirms Stripe Connect delayed-payout structure (MARKET §6.3); mock checkout until then. |
| **Growth role** | Mostly retention and *conversion of chats to deals on-platform* (if the money leaves to Zelle, so does the relationship). It is the reason a sublessor brings an off-platform subtenant on-platform ("pay through the app so you're covered"), which is a signup. |
| **Assumptions** | Live at the 12 lit campuses in month 6; 120 funded transactions (≈3% of April sublet listings) × avg held $1,100 (deposit, MARKET §1.4 room rents) × 3% = $33 each. |
| **Month-6 estimate** | 120 × $33 = **$3,960/month** (near-zero margin at this volume, see §5.1). |
| **Trust safeguard** | Never called "escrow" in UI ("Secure Payment / 平台担保支付"); funds held on Stripe's balance via Connect manual payouts, never in our bank account; release only on move-in confirmation or timeout; state machine and system messages per DATA_MODEL §6.10; feature flag `escrow.enabled` per campus, off by default. |

### 2.6 Explicitly not in this lens

Seeker/contact paywalls, "Early Bird" access, per-message fees, data resale. They each reduce the number of counterparties a listing can reach, and the whole growth model depends on that number.

### 2.7 Month-6 summary (April 2027, 30 campuses / 12 lit, 20k MAU)

| Stream | Gross | Cash (after credits) | % of cash |
|---|---|---|---|
| Newcomer Kit | $14,160 | $14,160 | 38% |
| Boosts + Spotlight | $11,169 | $8,040 | 21% |
| Sponsored + Verified Building | $6,900 | $6,900 | 18% |
| Landlord Pro / Pro+ | $4,270 | $4,270 | 11% |
| Secure Payment fee | $3,960 | $3,960 | 11% |
| **Total** | **$40,459** | **$37,330** | 100% |

Revenue per MAU in April ≈ $1.87 cash. The number that matters more for this lens: **$37k/month at 36k registered means each additional lit campus (≈1,500 registered, 900 MAU) is worth ≈ $1,700/month in April and ≈ $4,500 in August** — that is the budget ceiling for lighting a campus (§5.1).

---

## 3. 30 / 60 / 90-day plan

### The campus playbook (reused for all 60 campuses)

| Stage | Entry criteria | What happens | Exit criteria |
|---|---|---|---|
| **seed** (T-14 → T0) | Campus is in `campuses` seed with edu domains, shuttle data (GTFS import or "approximate") | Recruit 1–2 ambassadors (CSSA/学生会 officers, L2 verified, bilingual); ambassador personally invites 30 sublessors they know to post (the "import from WeChat text" tool turns a pasted group message into a draft listing in 60 s); ambassador gets a campus promo code `IGNITE-<CAMPUS>` worth one free 7-day basic boost ($19) for the first 100 sublet listings; shuttle/POI data checked by the ambassador | ≥25 live sublets, ≥15 items, ≥5 buddy posts before anyone outside is invited |
| **igniting** (T0 → T+21) | Exit of seed | T0: ambassador posts the campus **launch card** (image with QR + campus name + "63 verified listings", generated by the app) into every租房群/新生群/二手群 they are in (typically 5–12 groups × 500 = 2,500–6,000 reach) and one XHS post with campus hashtags (#UIUC转租 etc.); daily **digest image** ("今日新房源 Top 8") auto-generated per campus for ambassadors to post at 20:00 local; each new user lands on campus-scoped feed with a 3-step onboarding (verify → pick campus → "post or browse") | ≥150 L1 users, ≥10 chats/day, reply rate ≥30% within 21 days; otherwise go back to seed with a second ambassador |
| **lit** | ≥1,000 registered, ≥60 live sublets, reply rate ≥40% | Sponsors become sellable; Landlord outreach email goes out with live demand numbers; Secure Payment flag may be enabled (after counsel); ambassador base stipend starts | ≥2,500 registered → **dense** |
| **dense** | ≥2,500 registered | Second ambassador, campus "insights" page (median room rent, days-to-rent), Verified Building sales | — |

**Ambassador deal (标准合同):** $150/month base once the campus is lit; **$2 per L1-verified signup** attributed to their code or share links (cap $600/month); $25 per Landlord Pro conversion; 20% of first-3-month revenue of sponsors they source; a monthly $40 boost-credit allowance to give away; must post the daily digest ≥5 days/week in ≥5 groups and run one event per month (Costco run, airport-pickup roster in August, move-out sale in May). Ambassadors are paid through `ambassador_payouts` (*new*, §4.2) and are visible as "校园大使" on their profile. Paid by W-9/1099 as contractors; international students on F-1 cannot be paid cash off-campus without CPT/OPT — so the **default compensation for F-1 ambassadors is boost credits + scholarship-style stipends paid via the university when possible; cash bounties go to ambassadors with work authorization (OPT, domestic, or green card)**. This is a real constraint and is flagged in §6.

### Days 1–30 (Nov 3 – Dec 2): wave 0 + wave 1, first dollars, the share loop

**Ships**
- Listings/wanted/chat/verify/map/shuttle/market/buddy at demo quality (per BRIEF §7 owners); billing with wallet, referral ($5/$5 on L1), promo codes, mock checkout, Kit with tracked links; admin with verification queue and the **Campus Ignition board** (§4.5).
- Growth features with the highest K-factor per engineering day, in this order: (1) **share card** for every listing/item/buddy post (`/s/:token`, OG image + QR, WeChat-safe: image first, link second); (2) "import from WeChat text" draft tool; (3) daily campus **digest image** generator; (4) referral page with personal QR poster; (5) publish-time boost upsell with credit pre-applied.
- Kit live with the day-3 partners: Amazon Prime Student (Associates), Lemonade (Impact), Mint and Visible (Impact), Wise partner program, Airalo. Applications filed for Chase/Discover/BofA publisher programs (CJ/Impact).

**Campuses:** Northwestern (wave 0, richest data) and the **Chicago cluster** (UChicago, UIC, IIT) — same city, same 接机 operators, same Chinese supermarkets, one ambassador cohort who already know each other via Chicago CSSA WeChat groups; the Intercampus shuttle literally links NU's Evanston and Chicago campuses. Target by day 30: 4 campuses igniting, **1,800 registered, 1,400 MAU**, 180 live sublets, first winter-break sublets and Dec-graduate lease takeovers (MARKET §1.3 Nov–Jan window).

**Partnerships to sign first and how**
1. **4 CSSA chapters (NU, UChicago, UIC, IIT)** — not a sponsorship, an ambassador MOU: we provide the housing/secondhand board their 群 lacks and $40/month boost credits for their events; they provide 2 officers as ambassadors and pinning rights in their groups. Approach: in person at the Thanksgiving/New Year event planning meetings; bring the digest image already populated with their campus.
2. **2 Chicago 接机 (airport pickup) operators** as the first sponsors ($250/month, Jan start, 50% off for signing in November) — they are already paying student orgs; we give them the buddy "airport pickup" roster for the January arrivals.
3. **Impact / CJ publisher accounts** — filed on day 1; Lemonade, Mint, Visible, Wise, Airalo approve within the month.
4. **One Evanston landlord with 10+ units** (the seed `landlord@evanstonhomes.com` persona is the model) on a free Pro+ year in exchange for being the Verified Building reference account.

### Days 31–60 (Dec 3 – Jan 1): college towns and the spring-semester moment

**Ships**
- **Wanted → landlord demand email** (weekly auto-report per campus: "N verified students searching for <month>"), Landlord Pro trial checkout, lead inbox.
- **Buddy group-invite loop**: a host can invite non-users by phone/WeChat ID; invitee gets a one-tap join link, must verify `.edu` to join (every invite is a signup).
- Referral second trigger: +$5 to the referrer when the referred user publishes a first listing within 30 days (*new* ledger kind `referral_post_bonus`).
- Admin: ambassador management, share analytics, referral-fraud panel (§4.5).
- Nationwide toggle promoted in UI for the first time: "Spring co-op / internship? Search Seattle, SF, NYC" (Northeastern/Purdue/Georgia Tech/Drexel co-op cycles start January).

**Campuses:** + UIUC (16k international students [fact], MTD GTFS public), Purdue, DePaul, Loyola → **8 campuses, 4,500 registered, 3,200 MAU** by Jan 1. UIUC and Purdue are pre-leasing towns: January is when landlords list for August, so Landlord Pro is sold here first.

**Partnerships**
5. **Champaign and West Lafayette property managers** (5 each): outbound from the ambassador with the wanted-demand email; offer: Pro+ at $79 waived to $29 for 3 months if they bring ≥5 listings before Jan 15.
6. **CORT campus partner** (NU Wildcard already discounts CORT delivery [fact]) for the Kit's furniture card at all 8 campuses.
7. **Chase / Discover publisher approval** (pending from day 1) — the $75 cards go live in the Kit when approved.

### Days 61–90 (Jan 2 – Jan 31): the coasts, intern season set-up, counsel

**Ships**
- **Nationwide Spotlight** boost add-on and the **intern landing pages** (`/city/seattle`, `/city/san-francisco`, `/city/new-york`: "sublets from verified students at UW / Berkeley / NYU", SEO + XHS-shareable).
- Move-out **bundle** flow (sublet + items in one post, one share card) ahead of May.
- **Campus insights** widget (median asking rent by room type, days-to-rent) — the most shared XHS content format ("西雅图实习短租价格表").
- Secure Payment flow finished in mock; **counsel engaged** (state MTL analysis for IL/NY/CA/MA/WA plus Stripe Connect structure) with a go/no-go in month 4.

**Campuses:** + NYU, Columbia (NYC: 75k international students in metro), Northeastern, BU (Boston: 55k), USC, UCLA (LA: 40k) → **14 campuses, 9,500 registered, 6,500 MAU** by Jan 31. Each metro gets a 3-person ambassador cohort spanning its campuses because sublet demand in NYC/Boston/LA is metro-wide, not campus-wide.

**Partnerships**
8. **Metro 接机 / mover sponsors** in NYC, Boston, LA (one each, $250/month, starting when the campus is lit).
9. **One PBSA operator per metro** for Verified Building pages (approach via their leasing managers, offer the student-demand report; uhomes/Amber are competitors-as-partners here and are *not* approached in this lens — they would own the student relationship).
10. **Ultra Mobile and Remitly** added to the Kit (China-calling plans and CNY→USD transfers are the two most-asked 新生群 questions).

After day 90 the same playbook continues at ~7 campuses per month (wave 3: Berkeley, Stanford, SJSU, UW, Michigan, Wisconsin, Ohio State in February; wave 4: ASU, UT Dallas, UNT, CMU, Penn, Cornell, Buffalo, Minnesota, Georgia Tech in March) so that 30 campuses are live before the April posting peak and 52–60 before the August arrival peak.

### Seasonal moment calendar (what every campaign is pinned to)

| Window | Moment | Product/channel action | Revenue it feeds |
|---|---|---|---|
| Nov 15 – Jan 10 | Winter-break and Dec-graduate sublets; spring co-op moves | Launch cards; "lease takeover" listing type promoted; nationwide toggle for co-op cities | Boosts (small), Pro trials |
| Jan 10 – Feb 28 | Pre-leasing in college towns | Wanted-demand emails to landlords; Pro trials; "47 students looking for August" banner | Landlord Pro |
| Mar 1 – May 15 | **Summer-sublet flood** (45–55% of annual listings) | Boost upsell at publish; digest images daily; XHS "本周转租榜" | Boosts (peak), Spotlight |
| Apr 1 – Jun 15 | I-20s arrive, 2027 新生群 form | Ambassadors seed the Kit pre-arrival page into 新生群; airport-pickup buddy roster opens | Kit (pre-arrival), sponsors |
| May 1 – Jun 10 | Move-out | Bundle posts, move-out sale events sponsored by movers/storage | Item boosts, Kit (storage/movers), sponsors |
| May 15 – Aug 31 | Intern relocation (cross-city) | City landing pages; Spotlight; Secure Payment for sight-unseen deposits | Spotlight, Secure Payment |
| Jul 15 – Sep 15 | **Arrival peak** (Chinese arrivals cluster Aug 1–25) | Kit at full EV ($43), airport-pickup, Costco runs, roommate matching, lease takeovers from graduates | Kit (peak), Secure Payment, sponsors |
| Sep 15 – Nov 15 | Settled; roommate changes; secondhand | Buddy events, study groups; referral push ("invite your roommate") | Low revenue, high retention |

---

## 4. Product requirements this implies (billing module + admin dashboard)

Scope boundaries follow BRIEF §7: billing owns `server/src/modules/billing/**`, `web/src/features/billing/**`, migration `18_billing.sql`, `shared/src/schemas/billing.ts`; admin owns `19_admin.sql` and `web/src/features/admin/**`. Share links are a cross-cutting need; this lens asks billing to own them (they resolve to credits) and lists the integration request for the scaffold at the end.

### 4.1 Pricing table (`pricing_plans` seed; money in integer cents USD)

| `code` | `kind` | entity / tier / duration | `price_cents` | Trust req. | Notes |
|---|---|---|---|---|---|
| `boost.listing.basic.3d` | boost | listing / basic / 3 d | 900 | ≥1 | referral credits ($10) cover it — by design |
| `boost.listing.basic.7d` | boost | listing / basic / 7 d | 1900 | ≥1 | default selection; ignition free-boost value |
| `boost.listing.basic.14d` | boost | listing / basic / 14 d | 3900 | ≥1 | |
| `boost.listing.plus.7d` | boost | listing / plus / 7 d | 2900 | ≥1 | top of map pins |
| `boost.listing.plus.14d` | boost | listing / plus / 14 d | 5900 | ≥1 | |
| `boost.listing.max.7d` | boost | listing / max / 7 d | 4900 | ≥2 | home carousel |
| `boost.listing.max.14d` | boost | listing / max / 14 d | 8900 | ≥2 | |
| `boost.listing.spotlight` | boost | add-on, same duration as parent | 1000 | ≥1 | nationwide results for the listing's city; `boosts.nationwide=1` (*new* column) |
| `boost.item.basic.3d` / `.7d` / `.14d` | boost | market_item | 499 / 999 / 1499 | ≥1 | |
| `boost.bundle.basic.7d` | boost | market bundle | 999 | ≥1 | boosts every item in the bundle |
| `boost.buddy.basic.3d` / `.7d` | boost | buddy_post | 199 / 499 | ≥1 | |
| `sub.pro.monthly` / `sub.pro.yearly` | subscription | — | 2900 / 24900 | 3 + ownership proof | 14-day trial; 1 free `boost.listing.basic.7d` credit per renewal |
| `sub.proplus.monthly` | subscription | — | 7900 | 3 + ownership proof | |
| `escrow.standard` | escrow_fee | — | 300 bps, min 500, cap 6000 | 3 both parties | +200 bps card surcharge (`escrow.card_surcharge` service plan) |
| `service.sponsor.campus` | service | per campus-month | 25000 | admin-created invoice | sponsors are invoiced from admin, not self-serve |
| `service.building.verified` | service | per building-month | 40000 | admin-created invoice | |

Credits and promos (`promo_codes`): `REF` (system, $5/$5 on L1, `qualify_rule='edu_verified'`); `IGNITE-<CAMPUS>` (`kind='wallet_credit'`, 1900 cents, `campus_id` set, `max_per_user=1`, `max_redemptions=100`, `applies_to='boost'` *new*); `SHARE5` (auto-issued: 5 distinct verified openers of your share card → 900 cents, once per entity); `AMB-<CODE>` per ambassador (`ambassador_id` *new*, `kind='wallet_credit'`, 500 cents welcome). All credits expire 180 days (existing nightly `walletExpiry`).

### 4.2 Data model additions (all additive in `18_billing.sql`; existing tables unchanged)

```
share_links   (id, user_id, entity_type, entity_id, campus_id, channel ENUM('wechat','xhs','sms','copy','qr','other'),
               token UNIQUE(10 chars), opens INT, signups INT, created_at)
share_opens   (id, share_link_id, viewer_user_id NULL, ip_hash, ua_hash, created_at)   -- dedupe per viewer/day
ambassadors   (id, user_id UNIQUE, campus_id, promo_code_id, status ENUM('applied','active','paused','ended'),
               base_cents INT DEFAULT 15000, bounty_cents INT DEFAULT 200, bounty_cap_cents INT DEFAULT 60000,
               pay_mode ENUM('cash','credits'), started_at, ended_at)
ambassador_attributions (id, ambassador_id, user_id UNIQUE, source ENUM('code','share','qr'), qualified_at NULL, paid_at NULL)
ambassador_payouts (id, ambassador_id, period_month 'YYYY-MM', base_cents, bounty_cents, commission_cents,
               total_cents, status ENUM('draft','approved','paid','void'), approved_by, paid_at)
campus_milestones (campus_id, stage ENUM('seed','igniting','lit','dense'), reached_at, metrics_json)  -- append-only
promo_codes   + campus_id NULL, + ambassador_id NULL, + applies_to ENUM('any','boost','subscription') DEFAULT 'any'
boosts        + nationwide INT DEFAULT 0
wallet_ledger kind += 'referral_post_bonus', 'share_milestone', 'ambassador_allowance', 'ignition_boost'
users         (+ referral_source TEXT NULL: 'ref:<code>' | 'share:<token>' | 'amb:<code>' | 'organic')
```

`referrals` keeps its state machine; the post bonus is a second row in `wallet_ledger` keyed on `ref_type='listing'`, written when the referred user's first listing reaches `status='active'` within 30 days of signup (listener on `listing.publish` events).

### 4.3 Flows and screens (web `features/billing`)

1. **Share card** (`/s/:token` public route; sheet on every listing/item/buddy detail): renders a 1080×1350 image (server-side SVG → `<img>`; client canvas export for PNG save) with photo, price, dates, campus, trust badge, QR, and the poster's referral code baked in. Buttons: "保存图片 / Save image" (WeChat), "复制文案 / Copy text" (pre-formatted group message with the link), "小红书文案" (hashtags for the campus). Opening `/s/:token` sets cookie `ref_share=<token>` (30 days); signup within the cookie window writes `users.referral_source` and `share_links.signups += 1`; viewing is logged to `share_opens` and the listing's `view_count` (existing dedupe rule).
2. **Publish upsell** (after any listing/item/buddy publish): "你的帖子已发布。此校区有 N 个同类帖子正在推广。" Three cards (3d/7d/14d), credit balance shown and pre-applied, "Nationwide Spotlight +$10" toggle when the listing is in an intern city; one-tap mock checkout; skip link is equally prominent. Writes `checkout.start` with `props.surface='publish_upsell'`.
3. **Referral page** (`/billing/referral`): code, personal QR poster (same generator), stats (sent / signed up / verified / credits earned), explanation of both triggers ($5 on verify, $5 when they post). Shareable per channel like the share card.
4. **Wallet** (`/billing/wallet`): balance, ledger with human-readable sources (referral, share milestone, ignition boost, Pro monthly boost, refund), expiry dates, "use credits" toggle default on at checkout.
5. **Campus launch card** (ambassador-only, `/billing/ambassador`): auto-generated image with live counts, daily digest image (Top 8 new listings), allowance balance, attributed signups this month, estimated payout, payout history. The ambassador cannot see any user's PII beyond public profile.
6. **Boost manager**, **Pro checkout/trial**, **Secure Payment** (propose → fund → confirm → release) as already specified in DATA_MODEL §6.6–6.10; test-mode banner everywhere.
7. **Newcomer Kit** (`/kit`, public, campus-scoped, pre-arrival mode when no `.edu` yet): cards grouped by "before you fly / first 7 days / first month"; every outbound link is `/api/billing/partners/:slug/go?campus=…&src=…`; label "推广 · Sponsored" on each card; a "我已办好 / Done" checkbox per card feeds `kit.card_done` (self-reported conversions are the leading indicator for partner payouts that arrive 30–60 days later).

### 4.4 API additions (all under `/api/billing`, JSON envelope per BRIEF §5)

`POST /share-links` {entityType, entityId, channel} → {token, url, imageUrl, text}; `GET /s/:token` (web route) → redirect + cookie + `share.open` event; `POST /share-links/:token/open` (beacon); `GET /referral/stats`; `GET /ambassador/me`, `GET /ambassador/digest?date=` (image), `GET /ambassador/launch-card`; `POST /promo/validate` already exists → add `applies_to` check; `GET /partners?campusId=&stage=pre_arrival|arrival|settled`. Admin-only: `GET/POST /admin/ambassadors`, `POST /admin/ambassadors/:id/payouts/:month/approve`, `GET /admin/growth/campuses`, `GET /admin/growth/shares`, `GET /admin/growth/referral-fraud`.

### 4.5 Admin dashboard additions (web `features/admin`, migration 19)

1. **Campus Ignition board** (the home screen for this lens): one row per campus — stage, registered, L1, L2+, MAU, WAU, live sublets / items / buddy posts, **reply rate (7d)**, chats/day, shares/opens/signups (7d), K-factor estimate (signups attributed to shares+referrals ÷ active users, 28d), boosts sold, credits issued, sponsor count, Pro subs, ambassador name, next milestone. Sortable; click → campus detail with the same metrics as time series and a "promote to lit/dense" button (writes `campus_milestones` + `audit_log`).
2. **Ambassadors**: applications, active list, attributed signups with qualification status, monthly payout draft (base + bounty capped + commissions), approve/void, export CSV; flags for suspicious attribution (see 3).
3. **Referral & credit fraud panel**: clusters by `ip_hash`/`ua_hash`/payment-method fingerprint; edu domain ≠ campus of referrer; >5 referrals from one device; referred accounts with zero events after qualification; one-click `void` of referral + ledger reversal (`admin_adjustment`) + optional ban. Credits issued vs redeemed vs expired per week.
4. **Share analytics**: shares by channel (wechat/xhs/sms/copy/qr) → opens → signups → first action, per campus and per entity type; top shared listings; share-to-signup conversion trend.
5. **Revenue dashboard** (existing `v_revenue`) with a mandatory **credits contra line**: gross, credits redeemed, cash; per stream (`order_kind`), per campus, per month; affiliate clicks → self-reported done → partner-confirmed conversions (manual import of partner CSV into `partner_clicks.converted_at` *new*).
6. **Promo campaigns**: create `IGNITE-<CAMPUS>`, allowance codes, seasonal codes; see redemptions and resulting boosts.
7. **Seasonal calendar** widget: the table in §3 as a timeline with "campaign checklist" per moment.

### 4.6 Data events (appended to the open `eventType` set; `props` keys listed)

`share.create {entityType, entityId, channel, token}` · `share.open {token, channel, viewerKnown}` · `share.signup {token}` · `referral.link_click {code}` · `referral.qualified {referralId, rule}` · `referral.rewarded {referralId, cents}` · `credit.issue {kind, cents, source}` · `credit.redeem {orderId, cents}` · `kit.open {campusId, stage, preArrival}` · `kit.card_click {slug}` (alongside existing `affiliate.click`) · `kit.card_done {slug}` · `ambassador.attribution {ambassadorId, source}` · `campus.stage_change {campusId, from, to}` · `digest.generate {campusId, date}` · `boost.upsell_view {surface}` · `listing.reply` (first inbound message on a listing; feeds reply rate) · `nationwide.search {city}`. Existing `checkout.*`, `boost.impression/click`, `listing.*`, `chat.start` are unchanged.

**KPI definitions for this lens** (SQL in admin): reply rate = listings with ≥1 `listing.reply` in 7d ÷ live listings; K-factor (28d) = `share.signup` + qualified referrals ÷ distinct active users; ignition cost per campus = ambassador payouts + credits redeemed + content spend ÷ L1 users at campus.

### 4.7 Integration requests (for scaffold / other modules)

- Scaffold: public web route `/s/:token` and cookie `ref_share` read at signup (`users.referral_source`); `events` middleware accepts a `beacon` batch endpoint for share opens.
- Listings/market/buddy: emit `listing.publish` / `item.publish` / `buddy.publish` and show the billing `PublishUpsell` component after publish; include `shareToken` in detail responses.
- Chat: emit `listing.reply` on first inbound message per listing.
- Verify: expose `ownership_proof` document type for Pro/Verified Building review.

---

## 5. Unit economics and 12-month P&L sketch

### 5.1 Unit economics (month-6 steady state unless noted)

**Viral loops and K-factor (in-season, estimate).**

| Loop | Mechanics | Math | K contribution |
|---|---|---|---|
| Share card | 10% of users post a sublet/month; each listing is shared 2.4× into groups; each share is opened by ~18 people; 6% of openers sign up (they must, to message) | 0.10 × 2.4 × 18 × 0.06 | **0.26** |
| Buddy invites | 3.5% of users host a buddy post; each invites 4 non-users; 35% join | 0.035 × 4 × 0.35 | **0.05** |
| Referral credits | 8% of users send their code; 1.8 verified signups each | 0.08 × 1.8 | **0.14** |
| Wanted/match + Kit pre-arrival shares | admitted students forward the Kit; small | — | **0.03** |
| **Total K (in-season)** | | | **≈ 0.48** → every seeded user yields 1/(1−0.48) ≈ **1.9 users** |
| Off-season K | shares and posts halve | | ≈ 0.25 → 1.3× |

**Cost to light a campus** (seed → lit, ~60 days, 1,000 registered): ambassador bounty 400 attributed × $2 = $800 + two months base $300 + ignition boosts 100 × $19 face (cash cost ≈ $0; forgone revenue ≈ 12% × $19 × 100 = $228) + referral credits redeemed (~$400 forgone) + content/ads $600 = **≈ $2,100–2,300 per lit campus**, i.e. **$2.10–2.30 per registered user** and ≈ **$1.20 per registered user after the viral multiplier**.

**Blended CAC, April:** 11,000 new signups; ambassador stipends 30 × $150 = $4,500; bounties 11,000 × 40% attributed × $2 = $8,800; content/XHS $3,000; referral/share credits redeemed (forgone cash) $3,100 → $19,400 / 11,000 = **$1.76 per registered user**, ≈ $2.20 per L1 user.

**Revenue per user:** April cash $37.3k / 20k MAU = **$1.87 per MAU-month**; across a year with seasonality ≈ $11–13 per registered user per year (August alone is ≈ $3.60 per MAU). Median user lifetime ≈ 2.5 years (undergrad/grad tenure + OPT relocation keeps them). **LTV ≈ $30 cash, LTV/CAC ≈ 14–17.** Even at half the revenue assumptions the ratio stays above 7, which is why this lens spends on density first.

**Per-stream margins.** Kit: ~100% gross margin (partner pays), cash arrives 30–60 days after conversion. Boosts: card processing 2.9% + $0.30 on a $19 boost = 4.5%; credits are the real cost (28% of face). Pro: ~96% margin. Sponsors: ambassador commission 20% for 3 months then ~100%. Secure Payment: fee $33 on $1,100; ACH cost 0.8% capped $5 → $8.80 (73% margin) but card rail cost 2.9%+$0.30 = $32.20 (3% margin) → ACH-default is a requirement, not an option.

**Ambassador economics:** a lit-campus ambassador earns $150 + 150 × $2 + occasional $25/$50 = ≈ $500–650/month for ~8 h/week, which is competitive with on-campus jobs and keeps churn low; 30 campuses ≈ $13–17k/month fully loaded (see table).

### 5.2 12-month P&L sketch (Nov 2026 – Oct 2027; USD thousands; gross revenue, affiliate recognised when approved, cash lags 1–2 months)

| | Nov | Dec | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | **12-mo** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Campuses live (cum.) | 4 | 8 | 14 | 21 | 30 | 30 | 34 | 38 | 45 | 52 | 56 | 60 | 60 |
| Registered users (k, cum.) | 1.8 | 4.5 | 9.5 | 15.5 | 25 | 36 | 45 | 52 | 64 | 86 | 104 | 114 | 114 |
| MAU (k) | 1.4 | 3.2 | 6.5 | 10 | 15 | 20 | 24 | 19 | 24 | 40 | 46 | 42 | — |
| **Revenue** | | | | | | | | | | | | | |
| Newcomer Kit | 0.2 | 0.5 | 1.6 | 2.8 | 6.5 | 14.2 | 20.0 | 24.0 | 58.0 | 92.0 | 52.0 | 16.0 | **287.8** |
| Boosts + Spotlight (gross) | 0.3 | 0.8 | 2.4 | 4.0 | 8.0 | 11.2 | 12.5 | 6.0 | 9.0 | 19.0 | 13.0 | 5.0 | **91.2** |
| Sponsored + Verified Building | 0 | 0.4 | 1.5 | 3.0 | 5.0 | 6.9 | 7.5 | 5.0 | 8.0 | 14.0 | 15.0 | 12.0 | **78.3** |
| Landlord Pro / Pro+ | 0 | 0.3 | 1.0 | 2.0 | 3.2 | 4.3 | 5.0 | 5.5 | 6.5 | 8.0 | 9.0 | 9.5 | **54.3** |
| Secure Payment fee | 0 | 0 | 0 | 0 | 1.0 | 4.0 | 7.0 | 6.0 | 5.0 | 13.0 | 10.0 | 3.0 | **49.0** |
| **Gross revenue** | 0.5 | 2.0 | 6.5 | 11.8 | 23.7 | 40.6 | 52.0 | 46.5 | 86.5 | 146.0 | 99.0 | 45.5 | **560.6** |
| Credits redeemed (contra, 28% of boosts) | 0.1 | 0.2 | 0.7 | 1.1 | 2.2 | 3.1 | 3.5 | 1.7 | 2.5 | 5.3 | 3.6 | 1.4 | **25.4** |
| **Net revenue** | 0.4 | 1.8 | 5.8 | 10.7 | 21.5 | 37.5 | 48.5 | 44.8 | 84.0 | 140.7 | 95.4 | 44.1 | **535.2** |
| **Costs** | | | | | | | | | | | | | |
| Team (3 → 5 → 6 people, below-market) | 20 | 20 | 20 | 34 | 34 | 34 | 42 | 42 | 42 | 42 | 42 | 42 | **414** |
| Ambassadors (base + $2 bounties + commissions) | 2.0 | 3.4 | 6.1 | 8.0 | 12.1 | 13.3 | 12.3 | 11.3 | 16.4 | 25.4 | 22.8 | 17.0 | **150.1** |
| Content / XHS / WeChat creatives / small ads | 1.0 | 1.5 | 2.0 | 2.5 | 3.0 | 3.0 | 3.0 | 3.0 | 5.0 | 6.0 | 4.0 | 3.0 | **37.0** |
| Hosting, tools, SMS/email | 0.5 | 0.6 | 0.8 | 1.0 | 1.2 | 1.5 | 1.5 | 1.5 | 2.0 | 2.5 | 2.5 | 2.5 | **18.1** |
| Legal (MTL analysis, ToS, BIPA, 1099s) | 0 | 0 | 0 | 8.0 | 15.0 | 12.0 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | **47.0** |
| Payment processing (cards 3.2% of boost/Pro cash; ACH on Secure Payment) | 0 | 0.1 | 0.2 | 0.3 | 0.7 | 1.7 | 2.7 | 2.2 | 2.0 | 4.8 | 3.7 | 1.4 | **19.8** |
| Insurance, admin, misc | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | **12** |
| **Total costs** | 24.5 | 26.6 | 30.1 | 54.8 | 67.0 | 66.5 | 64.5 | 63.0 | 70.4 | 83.7 | 78.0 | 68.9 | **698.0** |
| **Net** | −24.1 | −24.8 | −24.3 | −44.1 | −45.5 | −29.0 | −16.0 | −18.2 | +13.6 | +57.0 | +17.4 | −24.8 | **−162.8** |
| Cumulative | −24 | −49 | −73 | −117 | −163 | −192 | −208 | −226 | −213 | −156 | −138 | −163 | |

Reading it: cumulative loss peaks at ≈ **−$226k in June**, the business is monthly-profitable in **July–September** on the arrival peak, and ends year 1 ≈ −$163k with 60 campuses, 114k registered users and a ~$45k/month off-season run-rate. Because Kit cash arrives 30–60 days late, the **cash need is ≈ $300k**. Base case at 60% of the growth assumptions (35 campuses, 65k registered): gross ≈ $340k, net ≈ −$320k — still fundable, and the stream mix is unchanged. The deliberate bet is that the August peak at 52 campuses (one month ≈ 26% of annual revenue) is worth being early for; the trust-first and revenue-first lenses would spend ~$100k less on ambassadors and reach ~20 fewer campuses by August.

---

## 6. Top 5 risks and mitigations

| # | Risk | Why it bites a growth-first plan specifically | Mitigation (concrete) |
|---|---|---|---|
| 1 | **Holding deposits is money transmission (FinCEN MSB + ~49 state MTLs); Stripe prohibits escrow-like use outside Connect; state deposit statutes (IL, NY, CA, MA)** [MARKET §6.3, fact] | Growth pushes "pay through the app" into every chat; doing that unlicensed at 30 campuses in 5+ states multiplies exposure | Secure Payment stays **mock** until counsel signs off (budgeted $35k in Feb–Apr); structure = Stripe Connect destination charges with delayed/manual payouts, platform never custodies funds; UI never says "escrow"; `escrow.enabled` flag is **per campus/state**, off by default; launch in the states counsel clears first (likely IL + the 9th-Circuit states), not nationally; ACH default so the economics work; the growth plan does not depend on this stream (it is 11% of month-6 revenue; the P&L still works at zero). |
| 2 | **Fraud at growth speed: credit farming (fake `.edu` referrals, self-referrals, ambassador-inflated signups), cloned/scam listings boosted to the top, Kit click fraud** | Every growth incentive is a fraud incentive; a scam that reaches the carousel at one campus kills the ambassador's credibility in every WeChat group | Credits are only **boost credit, non-cashable, 180-day expiry**; referral and ambassador bounty qualify on L1 (`.edu` verified) and the bounty is paid only on *qualified* users that performed ≥1 real action (`listing.view`/`chat.start`) within 14 days; fraud panel (§4.5) with IP/UA/payment-fingerprint clustering and one-click void; `max` tier boost needs trust ≥2; two reports auto-pause a boost; lease-proof badge pushed on every sublet (MARKET §6.2) and shown on the share card; scam banner on first message names the patterns (Zelle/CashApp/Alipay deposits, "I'm abroad", overpayment checks); Kit payouts are reconciled against partner CSVs before ambassadors are paid commission. |
| 3 | **Chicken-and-egg per campus** (the 60th campus is as empty as the 1st; ambassador quality varies; F-1 ambassadors cannot legally take cash off-campus) | Lighting too many campuses at once is how sublet-only startups (Flip/Kopa, MARKET §3) spread themselves thin and died in the off-season | Hard rule: a campus leaves `seed` only with ≥25 live sublets + 15 items + 5 buddy posts, and no more than 7–9 campuses ignite per month; metro cohorts (NYC/Boston/LA) share supply through the city-wide toggle so no single campus has to be dense; supply-side-first incentives (ignition free boost, `SHARE5`); ambassador comp defaults to credits/stipends-through-university for F-1 students and cash only for work-authorised ambassadors (1099), reviewed by counsel in month 4; if a campus fails ignition twice it is parked (data still browsable nationwide) rather than subsidised. |
| 4 | **Seasonality** (June trough, Nov–Jan lull; MARKET §1.3) | Ambassador and team costs are flat while revenue swings 3× between June and August; off-season K-factor halves | Three counter-seasonal engines are built in: buddy/events (year-round, retention), secondhand (move-out May, move-in Aug, but also year-round), and the cross-city intern/OPT use case (May–Aug demand lands in the June trough); ambassador base stipend is paid only while the campus is lit and bounties scale with signups, so ~45% of ambassador cost is variable; Pro is recurring and peaks Jan–Apr when boosts are low; month-by-month cash plan assumes the June low and keeps ≥ $75k buffer going into July. |
| 5 | **Platform dependence on WeChat (and XHS)** — foreign entities cannot run a WeChat 服务号/mini-program easily; group admins (often 中介) can ban the ambassador; links are rate-limited or blocked; XHS suppresses off-platform contact info | The entire top of funnel is other people's groups | Share artefacts are **images with QR codes**, not links (survive WeChat link blocking and XHS contact-info rules); every user leaves with an owned channel (email + optional SMS digest, in-app bell, PWA install prompt); XHS official account per metro posting the campus insights format; Discord/WhatsApp/Telegram templates for the Indian cohort (+10%/yr, MARKET §1.1) from month 4 so the funnel is not single-country; ambassadors create *our own* campus groups (we are the admin) once a campus is lit, with the digest as the only promo content; SEO city/campus landing pages so that "UIUC 转租" and "Seattle intern sublet" rank on Google/Baidu/XHS search without any group access. |

Secondary risks tracked on the admin board but not top-5: BIPA at the Illinois launch campus (manual ID review, no face-match, 30-day deletion — unchanged from MARKET §6.3); fair-housing wording in shared-living listings (optional fields only, 9th-Cir. Roommate.com rule); affiliate partner approval delays for the $75 bank/card cards (plan assumes they arrive in month 2; if they slip, Kit revenue in Jul–Sep is ~35% lower).

---

### Appendix — what this lens says yes and no to

**Yes:** share cards on everything; credits that only buy boosts; ambassadors paid for verified density; metro cohorts; 7–9 campus ignitions per month; nationwide toggle promoted as a retention feature; supply-side pricing only.
**No:** any seeker-side paywall; buying WeChat group admins; scraping groups to seed listings; cash-out of credits; enabling Secure Payment before counsel; lighting a campus without an ambassador and seeded supply.
