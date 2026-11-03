# Market Research — Nationwide Campus Sublet / Life-OS Platform for International Students

> Scope: the **entire United States** (all universities hosting international students; Northwestern/Evanston is only the launch campus and demo dataset). Initial audience: Chinese international students; secondary: all international students, then domestic students and landlords near campus.
>
> Research date: 2026-11-03. Web search **was available**; ~30 searches were run. Every number carries a tag:
> - **[fact]** — taken from a cited source (URL given); may still be dated, so check before publishing externally.
> - **[estimate]** — researcher's estimate / triangulation from several sources or from knowledge; treat as planning assumption, not citation.
> - **[fact, dated]** — a sourced number whose offer/price has an expiry or was observed before 2025; verify before relying on it.
>
> Companion docs: `docs/BRIEF.md` (product), `docs/BUSINESS_PLAN.md` (monetization plan, consumes §8 of this file).

---

## 1. The market

### 1.1 Size: international students in the US

| Metric | Value | Tag | Source |
|---|---|---|---|
| International students in US higher ed, 2024/25 | **1,177,766** (+4.5–5% YoY; ~6% of all US higher-ed enrollment) | fact | [IIE Open Doors 2025 press release](https://www.iie.org/news/open-doors-2025-press-release/), [OD25 PDF](https://opendoorsdata.org/wp-content/uploads/2025/11/OD25_Open-Doors-2025-Press-Release.pdf) |
| From India (largest source) | **363,019** (+10%) | fact | same |
| From China (2nd) | **265,919** (−4%, third consecutive annual decline) | fact | [Open Doors China fact sheet](https://opendoorsdata.org/wp-content/uploads/2026/01/OD_China_Fact-Sheet-2025.pdf), [India TV summary](https://www.indiatvnews.com/education/higher-studies/india-surpasses-china-has-highest-international-students-in-us-report-2025-11-18-1018010) |
| India + China share of all international students | **53.4%** | fact | [Tribune India](https://www.tribuneindia.com/news/india/us-sees-sharp-dip-in-foreign-students-india-tops-the-list) |
| New international enrollments, fall 2024 | **277,118** (−7%) | fact | IIE press release |
| Fall 2025 snapshot: new international enrollments | **−17%** YoY (projection) | fact | [IIE / The Print](https://theprint.in/india/education/17-drop-in-new-international-students-in-us-in-fall-2025-indians-remain-largest-cohort-open-doors/2785710) |
| Share of Chinese students who are graduate students | ~45–50% | estimate | Open Doors historically ~40% grad / ~35% undergrad / ~20% OPT for China; OPT holders are also sublet-relevant (relocating for jobs) |
| Students on OPT (included in the 1.18M total) | ~290k–300k | estimate | Open Doors 2024 reported 242,782 on OPT (+22%); growth continued in 2025 |

**Implications.** (1) The Chinese cohort is shrinking ~4%/yr while India grows ~10%/yr: the product must be bilingual from day one (brief already says so) and the architecture must not assume Chinese-only — add Hindi/English-first marketing by year 2. (2) New-arrival volume (the Newcomer Kit audience) dropped sharply for fall 2025 (−17%); the **existing** stock of ~1.18M students (sublets, secondhand, buddies) is the more stable base. (3) OPT holders (~25% of the total) relocate for jobs → strong "nationwide" sublet demand outside the campus they studied at.

### 1.2 Top host universities by international enrollment (2024/25, Open Doors 2025)

Ranks 1–15 are from the official Fast Facts sheet; 16–25 are from Open Doors state fact sheets and prior-year rankings and are marked estimate where the 2024/25 figure was not retrieved.

| # | University | City | Intl students | Tag |
|---|---|---|---|---|
| 1 | New York University | New York, NY | 27,532 | fact |
| 2 | Northeastern University | Boston, MA | 22,465 | fact |
| 3 | Columbia University | New York, NY | 20,733 | fact |
| 4 | Arizona State University (Campus Immersion) | Tempe, AZ | 20,368 | fact |
| 5 | University of Southern California | Los Angeles, CA | 17,884 | fact |
| 6 | University of Illinois Urbana-Champaign | Champaign, IL | 16,144 | fact |
| 7 | University of North Texas | Denton, TX | 12,982 | fact |
| 8 | Purdue University (West Lafayette) | West Lafayette, IN | 12,874 | fact |
| 9 | Boston University | Boston, MA | 12,845 | fact |
| 10 | UC Berkeley | Berkeley, CA | 12,020 | fact |
| 11 | University of Michigan – Ann Arbor | Ann Arbor, MI | 11,929 | fact |
| 12 | University of Washington | Seattle, WA | 10,962 | fact |
| 13 | Johns Hopkins University | Baltimore, MD | 10,863 | fact |
| 14 | UCLA | Los Angeles, CA | 10,769 | fact |
| 15 | UC San Diego | La Jolla, CA | 10,545 | fact |
| 16 | UT Dallas | Richardson, TX | ~10,000–10,500 | estimate (10,491 in 2023/24) |
| 17 | Carnegie Mellon University | Pittsburgh, PA | 9,836 | fact (PA state sheet) |
| 18 | University of Pennsylvania | Philadelphia, PA | 9,143 | fact (PA state sheet) |
| 19 | SUNY University at Buffalo | Buffalo, NY | 9,033 | fact (NY state sheet) |
| 20 | Cornell University | Ithaca, NY | 8,790 | fact (NY state sheet) |
| 21 | University of Wisconsin–Madison | Madison, WI | ~8,500–9,000 (ranked #18 by UW's own release) | estimate |
| 22 | Ohio State University | Columbus, OH | ~8,000–8,500 | estimate |
| 23 | University of Minnesota – Twin Cities | Minneapolis, MN | ~7,500–8,000 | estimate |
| 24 | Georgia Tech | Atlanta, GA | ~7,500–8,000 | estimate |
| 25 | Harvard University | Cambridge, MA | ~7,000–7,500 | estimate |

Sources: [OD25 Fast Facts PDF](https://opendoorsdata.org/wp-content/uploads/2025/11/OD25_Fast-Facts.pdf), [UB news on Open Doors](https://www.buffalo.edu/ubnow/stories/2025/11/open-doors-report.html), [PA state sheet](https://opendoorsdata.org/wp-content/uploads/2025/11/OpenDoors_FactSheet_Pennsylvania_-2025.pdf), [NY state sheet](https://opendoorsdata.org/wp-content/uploads/2025/11/OpenDoors_FactSheet_New-York_-2025.pdf), [UW–Madison release](https://international.wisc.edu/2025-open-doors-report-uw-madison-ranked-6-for-study-abroad-and-18-for-international-students/), [OD24 Fast Facts](https://opendoorsdata.org/wp-content/uploads/2024/11/OD24_Fast-Facts_2024-1.pdf).

Other campuses that matter for the seed list of ~60 (all **estimate** 4k–8k international students each): Northwestern (~6.5k incl. Kellogg/grad), U Chicago, Illinois Tech, UCSB/UC Irvine/UC Davis, Stanford, Texas A&M, UT Austin, Georgia State, Rutgers, Penn State, Maryland, Indiana, Michigan State, Iowa State, Florida/UF, FIU, Syracuse, Rochester, Stony Brook, Duke, UNC, Emory, Vanderbilt, Rice, Houston, Oklahoma, Kansas, Nebraska, Colorado Boulder, Utah, Oregon State, San José State, SDSU, Drexel, Temple, BU/Brandeis/Tufts/MIT, Yale, Brown, Princeton, Cincinnati, Pittsburgh, Virginia Tech, George Mason, Georgetown/GWU/American, Minnesota State Mankato (#15 for master's institutions).

**Geographic clustering for launch sequencing (estimate):** Metro clusters by international-student headcount — NYC (~75k across NYU/Columbia/Cornell Tech/Stony Brook/Fordham/New School), Boston (~55k: Northeastern/BU/Harvard/MIT/Tufts/Brandeis/BC), LA (~40k: USC/UCLA/Caltech/CSU LA), Bay Area (~30k: Berkeley/Stanford/SJSU/UCSF/USF/SCU), Chicago (~25k: UIUC-Chicago/U Chicago/Northwestern/IIT/UIC/DePaul/Loyola), Seattle (~15k), Champaign-Urbana (16k), Ann Arbor (12k). A campus-scoped product with a nationwide toggle lets one seed set cover ~300k students in 8 metros.

### 1.3 Seasonality of sublets

No public dataset gives US sublet listing counts by month; the pattern below triangulates landlord guidance ([Apartments.com](https://apartments.com/rental-manager/resources/property-management/what-landlords-should-know-about-renting-college-students)), student newspapers ([Cavalier Daily 2023](https://cavalierdaily.com/article/2023/04/students-face-stressful-subletting-market-as-summer-nears), [Daily Pennsylvanian](https://www.thedp.com/article/2009/04/economic_crunch_makes_subletting_tougher)), a 2025 academic study on student subletting (Sweden) ([Journal of Housing Economics](https://ideas.repec.org/a/eee/jhouse/v68y2025ics1051137725000087.html)) and Google-Trends-style observation. **All shares are estimates.**

| Window | What happens | Est. share of annual sublet listings | Direction of imbalance |
|---|---|---|---|
| **Mar–May (posting), Jun–Aug (occupancy)** — summer sublets | Students leave for internships/home; 12-month leases must be covered. Posting peaks late March–April; prices discounted 20–40% below lease rent | **45–55%** | **Supply > demand** (classic; DP/Post Athens both note oversupply). Demand comes from interns, summer-session students, visiting scholars, incoming grads arriving early |
| **Jun–Aug (posting), Aug–Sep (occupancy)** — fall intake | New international students arrive (I-20 program start dates mid/late Aug; Chinese arrivals cluster Aug 1–25); they want 9–12 month leases or "take over my lease" sublets; also lease takeovers from students who graduated/transferred | **25–30%** | **Demand > supply**; highest willingness to pay; peak for Newcomer Kit affiliate conversions |
| **Nov–Jan** — winter/spring semester | Study-abroad departures, December graduates, spring co-ops (Northeastern, Drexel, Purdue, Georgia Tech, Cincinnati, Waterloo-style co-op schools) | **10–15%** | Balanced; shorter (4–6 mo) terms |
| **Rolling: internship relocations** | Summer interns to SF/Seattle/NYC/Chicago/Austin for 10–12 weeks (May–Aug) — this is the **nationwide** use case: a UIUC student needs a Seattle sublet | counted inside the summer share; estimate **15–20% of summer demand is cross-city** | Demand concentrated in tech metros; supply from local students leaving |
| **Rolling: OPT/job relocations** | Graduates relocate for jobs (Jun–Sep heavy), want 1–3 month furnished bridges | **5–10%** | Demand > supply for furnished 1–3 mo |

Design consequences: (a) the "wanted" (求租) module matters most Jul–Sep and for cross-city interns; (b) Boost demand is highest Apr–May when sublet supply floods; (c) Landlord Pro demand peaks Jan–Apr when landlords list for the next academic year (many college towns pre-lease 6–9 months ahead — Ann Arbor, Champaign, Madison, West Lafayette are notorious).

### 1.4 Typical price points in 8 representative campus cities

Long-term asking rents (1BR unless noted) from Zumper/Zillow/RentCafe/Redfin pages; sublet prices are **estimates** from the general pattern that summer sublets go for 60–80% of lease rent and that private rooms in shared apartments are 45–60% of a 1BR.

| City / campus | 1BR market rent (fact) | Source | Room in shared apt (est.) | Summer sublet, room (est.) | Furnished 1–3 mo bridge (est.) |
|---|---|---|---|---|---|
| **Evanston, IL (Northwestern)** | $1,762 avg 1BR; $2,482 all types (Zillow); Redfin Aug-2025 avg $2,667 | [Zillow](https://www.zillow.com/rental-manager/market-trends/evanston-il/), [Redfin](https://www.redfin.com/city/6331/IL/Evanston/rental-market) | $900–1,300 | $600–1,000 | $1,600–2,400 |
| **Chicago (U Chicago / IIT / UIC / Loop interns)** | ~$1,900–2,200 1BR citywide; Hyde Park lower | estimate (Zumper Chicago 1BR ~$2,000 in 2025 reports) | $800–1,200 | $600–950 | $1,500–2,500 |
| **Champaign-Urbana, IL (UIUC)** | $1,087 avg (Redfin, Mar-2024, dated) | [Redfin](https://www.redfin.com/city/3210/IL/Champaign/rental-market) | $550–850 (Campustown new-build studios $1,100–1,500) | $350–600 | $900–1,400 |
| **New York, NY (NYU / Columbia)** | $4,624 1BR (Zumper, 2025 table) | [Zumper national report](https://www.zumper.com/rent-research/national-rent-report) | $1,500–2,300 (Manhattan), $1,100–1,700 (Brooklyn/Queens) | $1,200–2,000 | $3,000–5,000 |
| **Los Angeles, CA (USC / UCLA)** | $2,260 1BR (Zumper mid-2025, −6.2% YoY) | [Zumper / Apartment Therapy](https://www.apartmenttherapy.com/rent-falling-fastest-june-2025-report-zumper-37492742) | $1,100–1,700 (Westwood higher: $1,400–2,000) | $800–1,400 | $2,000–3,200 |
| **Boston, MA (Northeastern / BU / Harvard / MIT)** | $3,362 1BR (Zumper 2025 table; ended 2025 −7.3%) | [Zumper annual 2025](https://zumpermedia.s3.amazonaws.com/blog/wp-content/uploads/2025/12/16104024/Zumper_Annual_Rent_Report_2025.pdf) | $1,200–1,800 | $900–1,500 | $2,500–3,800 |
| **Bay Area (Berkeley / Stanford / SJSU)** | Berkeley $2,270 1BR (Aug 2025); SF $4,430 1BR (+26% YoY, record) | [NBC Bay Area](https://www.nbcbayarea.com/news/local/making-it-in-the-bay/average-1-bedroom-apartment-rent-bay-area/3929221/), [NBC Bay Area SF](https://www.nbcbayarea.com/news/local/bay-area-rent-prices-apartments-2/3939599/) | $1,200–1,800 (Berkeley), $1,600–2,400 (SF/Palo Alto) | $1,000–1,600 | $2,400–4,500 (intern demand is extreme May–Aug) |
| **Seattle, WA (UW)** | ~$1,900–2,100 1BR citywide; U District studios $1,400–1,800 | estimate (no 2025 U District figure retrieved) | $1,000–1,500 | $800–1,300 | $2,000–3,200 |
| **Ann Arbor, MI (Michigan)** | $1,703 1BR (RentCafe) / $1,815 (rentest) / $1,670 all types Jul-2025 (Apartments.com) | [RentCafe](https://www.rentcafe.com/average-rent-market-trends/us/mi/ann-arbor/), [Apartments.com](https://www.apartments.com/rent-market-trends/ann-arbor-mi/) | $900–1,400 | $500–900 (notorious summer glut) | $1,500–2,200 |

National benchmark: Zumper median 1BR **$1,519**, 2BR **$1,901** (fact, [Zumper](https://www.zumper.com/rent-research/national-rent-report)).

**GMV sizing (estimate).** If 1.18M international students × ~35% live off-campus in sublet-able arrangements and ~40% of those transact one sublet/lease-takeover per year at an average $1,100/mo × 3 months, the annual sublet-rent flow touching international students is roughly **$5–6B**; deposits alone (1 month) ≈ $1.5–2B. A 3% escrow/secure-payment fee on even 2% penetration of that flow is ~$3–4M/yr — meaningful but later-stage; affiliate and boosts come first (see §8).

---

## 2. How international students currently find sublets, sell secondhand, and find companions

### 2.1 Channel map (what Chinese international students actually use)

| Channel | Used for | How it works today | Pain points |
|---|---|---|---|
| **WeChat groups (微信群)** — "XX大学租房群", "XX 新生群", class-year groups, 500-member cap per group, often 5–20 overlapping groups per campus | Sublets, secondhand, 搭子 (carpool/airport/Costco), everything | Posts scroll away in minutes; same listing cross-posted to 10 groups; group admins (often agents/中介) monetize by promoting their own properties; "接龙" lists | **Zero verification** (anyone with a QR code joins), no search, no structure, scams via fake 房东 and deposit requests to Zelle/Alipay, messages lost, 500-cap fragmentation, admin conflicts of interest. [Berkeley PM blog](https://tbgpm.com/?p=7549) notes students wrongly assume Chinese groups are safer than Craigslist |
| **Xiaohongshu (小红书)** — search "#UIUC转租", "#纽约转租", "#西雅图实习短租" | Sublet discovery (increasingly #1 for Gen-Z Chinese students), secondhand, 找搭子, 接机 | Posts with photos; contact moves to WeChat; XHS limits off-platform contact info so people spell WeChat IDs in images | Discovery only, no transaction, no verification; documented rental scams (HK student lost HK$190k via a "licensed agency" found on XHS — [The Standard](https://www.thestandard.com.hk/news/article/321040/Mainland-student-loses-190000-in-Xiaohongshu-rental-scam); Taiwan CIB logged 756 XHS fraud cases in 11 months of 2025 — [Focus Taiwan](https://focustaiwan.tw/society/202512100018)); posts age out; search is content-ranked not availability-ranked |
| **Facebook Groups** ("Northwestern Housing, Sublets & Roommates", "UC Berkeley Housing", "Boston Housing", "Columbia Housing"), **Facebook Marketplace** (rentals + items) | Sublets, roommates, furniture | Groups of 10k–60k members per large campus (e.g. "Northwestern Free & For Sale" ~18,600 members in a c.2020 article — [NBN](https://northbynorthwestern.com/or-best-offer)) | English-only; Chinese students under-use FB (many arrive without accounts); heavy scam presence; Marketplace rentals section is full of fake listings; no escrow; Marketplace boost is an ad buy with unclear minimums |
| **Craigslist** | Sublets (older grad students), furniture | $5/post for apartments in NYC/Chicago/Boston, free elsewhere ([Craigslist fees](https://www.craigslist.org/about/help/posting_fees)) | Scam-heavy, ugly, no identity; largely abandoned by under-25s |
| **Uloop** (campus classifieds; owns Roomsurf) | Sublets, textbooks, tutors | Free listings; white-labelled per campus (northwestern.uloop.com) | Thin inventory, SEO-farm feel, no verification, no chat |
| **Sublet.com** | Sublets, roommates | Free to browse; historically charged tenants a membership to contact (~$30-range, not verified in 2025) | Dated UI, low trust |
| **Leasebreak** (NYC) | Lease breaks, sublets, 1–12 mo furnished | Free to post; "Featured" tag on many listings (pricing not public) ([Leasebreak](https://www.leasebreak.com/)) | NYC-only; mostly brokers/landlords; no student verification |
| **SpareRoom** (US) | Rooms, roommates | Free ads; Bold Ad $15/wk, $27/2wk, $30/4wk, $149/6mo; Early Bird lets paid users contact new ads in their first 7 days ([SpareRoom listing options](https://www.spareroom.com/content/placeditadvert/listing-options/), [Early Bird](https://www.spareroom.com/content/info-faq/early-bird-explained/)) | Strong in NYC/LA/SF, weak in college towns; no student/edu verification; English-only |
| **Roomies.com / Roomster / Roomi** | Roommates | Free to list; optional one-time fees (Roomies) or weekly/monthly subscriptions (Roomster; FTC-sued 2022, $36.2M judgment for fake reviews — [FindMyPlace](https://findmyplace.co/blog/best-apps-find-college-roommate/)) | Trust deficit; not student-specific |
| **Zillow / Apartments.com / StreetEasy** | Long-term leases | Landlord-side listing products (see §4) | Not sublet-friendly; lease-takeover not modeled; no student verification |
| **1point3acres (一亩三分地)** | Forum for Chinese students/workers — 房地产 tag, occasional 转租 posts, renters-insurance Q&A ([1p3a tag](https://www.1point3acres.com/bbs/tag-63-522.html)) | Threads, not listings | No structure, no map, aging user base (job/visa focus) |
| **北美留学生网 / 留学生公寓-type WeChat official accounts, 北美微论坛, 华人资讯网, 北美省钱快报 (Dealmoon)** | Sublet aggregation (agents repost), newcomer guides, SIM/bank deals (Dealmoon's MVNO guide — [Dealmoon](https://www.dealmoon.com/guide/971248)) | Content + affiliate; some run paid "房源推广" | Agent-dominated, no verification, affiliate-driven recommendations not disclosed |
| **uhomes / Amber / Casita / Student.com / universalstudenthomes** | Purpose-built student housing (PBSA) booking agents; UK-born, now US | Commission from operators/landlords ("no fee to students" for partnered properties; service fee per person for non-partner properties; booking/reservation fee deducted from deposit — [uhomes help](https://en.uhomes.com/general-pages/helps/125266), [Dealroom](https://app.dealroom.co/companies/uhouzz)); uhomes also runs an affiliate program ([PostAffiliatePro](https://www.postaffiliatepro.com/affiliate-program-directory/uhomes-com-affiliate-program/)) | Only new-build/PBSA inventory (not sublets or private landlords); Trustpilot complaints about cashback/referral promises ([Trustpilot](https://ca.trustpilot.com/review/uhomes.com?page=9)); steer students toward highest-commission buildings |
| **Campus off-campus housing portals** (Northwestern Off-Campus Life, UIUC Tenant Union, UW, Michigan Beyond the Diag; many run on Places4Students / Off Campus Partners / Rent College Pads white-labels) | Landlord listings, some sublets | Free for students; landlords pay the vendor; some schools require landlord registration | Little sublet inventory, no chat, no map UX, no Chinese, no secondhand/buddy |
| **For secondhand**: WeChat groups, XHS, FB Marketplace, OfferUp, Mercari, Craigslist "free", campus "Free & For Sale" groups | Move-out furniture, textbooks, bikes | Local pickup, cash/Venmo/Zelle | Move-out week dumps (May/Jun); no bundle-with-sublet; shipping fees on Mercari (10%) and OfferUp (12.9%) only apply to shipped items |
| **For 搭子 / companions**: WeChat groups, XHS "#找搭子", campus CSSA (中国学生学者联合会) WeChat, Discord servers, Meetup (rarely), Tandem/HelloTalk | Airport pickup, carpools, Costco runs, gym/study buddies, roommates | Posts in groups; often repeated daily | Safety (meeting strangers), no identity, no scheduling, no event calendar |

### 2.2 Cross-cutting pain points (what the product must solve)

1. **No verification** — anyone can claim to be a tenant/landlord; fake 房东, unauthorized sublessors who are not on the lease ([Berkeley pitfalls](https://tbgpm.com/?p=7549)).
2. **No safe money path** — deposits paid via Zelle/Venmo/CashApp/Alipay/WeChat Pay to strangers; irreversible. University police logs document $1,200 CashApp deposits and $3,850 overpayment-check scams ([UIUC Police](https://police.illinois.edu/fake-apartment-sublet/)).
3. **Fragmentation** — the same unit appears in 10 WeChat groups + XHS + FB; nothing is canonical; "still available?" is 50% of all messages.
4. **Language** — English platforms are unusable for parents paying deposits from China; Chinese channels are invisible to American landlords/subtenants. Bilingual listings double the demand pool for a sublessor.
5. **Pre-arrival blindness** — new students must commit from abroad without viewing (the exact condition that enables scams); they need verified photos, video tours, "verified by a student on campus" and refundable escrow.
6. **No bundling** — the person subletting also sells furniture, needs airport pickup, and wants a roommate; today that's 4 separate posts in 4 apps.
7. **Agent capture** — group admins and 中介 monetize opaque commissions; students don't know which "recommendation" is paid.

---

## 3. Direct and adjacent competitors

| Competitor | Segment | Core features | Pricing / fees (what they charge for) | Verification | Gaps vs. this product |
|---|---|---|---|---|---|
| **SpareRoom (US)** | Roommates/rooms, metro-centric | Ads, messaging, "Bold" ads, Early Bird, team/agents | Free ad; Bold $15/1wk, $27/2wk, $30/4wk, $149/6mo (fact, [SpareRoom](https://www.spareroom.com/content/placeditadvert/listing-options/)); Early Bird = pay to contact new ads early | Email/phone; optional "verified ID" badge in UK | No campus scope, no Chinese, no secondhand/buddy/shuttle, no escrow |
| **Leasebreak** | NYC lease breaks/sublets | Listing search by duration, featured tags, broker-heavy | Free to post; Featured tier (price not public; est. $50–150/listing) | None for students | NYC-only; not student-identity-based |
| **Facebook Groups + Marketplace** | Everything, free | Groups, Marketplace rentals/items, Boost (ads) | Free; Boost = Meta ad spend, est. $1–5/day minimum, no fixed price ([OneShop](https://oneshop.com/blog/facebook-marketplace-boosted-listing), [LeadsBridge](https://leadsbridge.com/blog/how-to-boost-facebook-marketplace/)) | Account age only | Scam-ridden; English; nothing campus-structured; Chinese students often lack accounts |
| **Craigslist** | Classifieds | Posts | $5/apartment post in NYC/Chicago/Boston (fact, [Craigslist](https://www.craigslist.org/about/help/posting_fees)); free elsewhere | None | Trust |
| **Zillow Rental Manager** | Landlords | Listings syndicated to Zillow/Trulia/HotPads, applications, screening, rent collection | First listing free; additional listings $9.99/wk per listing (reports); Premium listing $29.99 one-time for 90 days ([LandlordGurus](https://landlordgurus.com/zillow-rental-manager-review-software-overview/), [Hemlane](https://hemlane.com/resources/zillow-is-charging-for-rentals)); tenants pay $35 application fee (est.) | Landlord identity | No sublets/lease takeovers, no student focus |
| **Apartments.com (CoStar) Rental Manager** | Landlords | Free listings, screening, rent payments | Free basic; monetized via premium ads for large operators (est. $100s–$1,000s/mo) | — | Same |
| **Uloop / Roomsurf** | Campus classifieds | Listings, roommate quiz | Free; Roomsurf premium in-app (price unverified) | Edu email optional | Thin, dated |
| **Roomies.com** | Roommates | Listings, messaging | Free; optional one-time paid features (Roomies.ca FAQ, [Roomies](https://www.roomies.ca/blog/does-roomies-charge-a-subscription-fee)) | — | Not student/intl |
| **Roomster** | Roommates | Listings | Weekly/monthly subscriptions; FTC action 2022 | — | Trust |
| **uhomes / Amber / Casita / Student.com** | PBSA booking agents for international students (strong in China/India marketing; bilingual) | Curated buildings, concierge in Chinese, guarantor products, cashback promos | Commission from operators (est. 5–12% of first-year rent, i.e. $500–2,000 per booking); service fee charged to students for non-partner properties; affiliate programs for referrers ([uhomes help](https://en.uhomes.com/general-pages/helps/125266), [PostAffiliatePro](https://www.postaffiliatepro.com/affiliate-program-directory/uhomes-com-affiliate-program/)) | KYC on booking | Only PBSA; no peer sublets, secondhand, buddy; conflict of interest. **Adjacent partner**: their US inventory could be a sponsored "verified building" layer in our map |
| **Airbnb (monthly stays)** | Furnished 1–3 mo | Full escrow, ID verification, reviews | Host-only fee **15.5%** (moving all hosts to host-only by Dec 1 2025; was 3% host + ~14% guest) ([Hostaway](https://www.hostaway.com/airbnb-host-only-fee-what-to-know-about-the-15-percent-host-fee), [Zeevou](https://zeevou.com/?p=181554)) | Gov ID + selfie | Too expensive for peer sublets; no lease takeover; no campus data |
| **Flip / Caretaker / Leap / Kopa / Flatmates-style sublet startups** | Lease transfer + sublet marketplaces | Lease-takeover flows, landlord approval, payments | Typically 1 month's rent or ~10% service fee to subtenant/sublessor (est.) | KYC | Several pivoted/shut (Flip → Caretaker pivoted to landlord software; Kopa small) — cautionary: sublet-only marketplaces struggle with seasonality; this product's bundling (market/buddy/kit) is the counter |
| **Campus portals (Places4Students, Off Campus Partners, Rent College Pads, College Pads)** | Landlord listings sold to universities | Listings, roommate finder, sublets section | Landlords pay $30–60/listing/yr or university pays SaaS (est.) | University-endorsed | No chat/map UX, no Chinese, no money |
| **WeChat 中介 / 北美租房 official accounts** | Chinese-language brokerage | Listing reposts, "包租" guarantees | Hidden commissions; often charge students $200–500 "服务费" (est.) | None | Opaque; the trust gap we exploit |
| **Chinese 搭子/social apps (Soul, 积目, Tantan, 小红书 群聊)** | Companion matching | Matching, groups, virtual gifts | Soul "超级星人" membership 30 RMB/mo; ARPPU ~104 RMB/mo; paying rate ~6.5% (fact, [36Kr on Soul](https://36kr.com/p/3579723409676424)); XHS tested a 168 RMB/yr local-services card "小红卡" and paused it after 2 months (fact, [36Kr/Huxiu](https://www.36kr.com/p/3855788552492038)) | Phone | Not US-campus; no safety layer; pattern to copy: **low-priced membership + visibility boosts**, not transaction fees, for social features |
| **Meetup** | Events | Groups, RSVPs | Organizer $29.99/mo, $99.99/6mo, $174.99/yr; Pro $47–55/group/mo (fact, [Meetup help](https://help.meetup.com/hc/en-us/articles/28677808413197)) | — | Shows organizer-pays model has a ceiling for students; our buddy module should stay free with paid "featured event" only |

**Competitive gap summary:** no incumbent combines (a) `.edu` + ID verification, (b) campus-scoped + nationwide sublets with lease-takeover semantics, (c) bilingual zh/en, (d) secondhand + companions + shuttle in one map, (e) a safe-payment path. uhomes/Amber have (c) and money handling but zero peer inventory; SpareRoom/Leasebreak have inventory in 3–4 metros but none of (a)(c)(d).

---

## 4. Fee and pricing benchmarks

| Platform | Benchmark | Tag | Source |
|---|---|---|---|
| **Airbnb** | Host-only service fee **15.5%** of subtotal (16% Brazil); legacy split: host ~3% + guest ~14–16%; guest sees no separate fee under host-only; rollout to all hosts by Dec 1, 2025 | fact | [Hostaway](https://www.hostaway.com/airbnb-host-only-fee-what-to-know-about-the-15-percent-host-fee), [Zeevou](https://zeevou.com/?p=181554), [Hospitable](https://help.hospitable.com/en/articles/4703232-airbnb-service-fees-split-fee-vs-host-only-fee) |
| **SpareRoom (US)** | Bold Ad: $15 / 1 wk, $27 / 2 wk, $30 / 4 wk, $149 / 6 mo; Early Bird (contact new ads in first 7 days) sold on same tiers; an older page shows $14/$25/$28 | fact | [SpareRoom listing options](https://www.spareroom.com/content/placeditadvert/listing-options/), [Early Bird](https://www.spareroom.com/content/info-faq/early-bird-explained/) |
| **Leasebreak** | Posting free; "Featured" exists, price not public → assume **$49–99 per featured listing** | estimate | [Leasebreak](https://www.leasebreak.com/) |
| **Facebook Marketplace Boost** | Ad-auction; sources cite **$1/day** to **$5/day** minimums, 1–30 day duration; "Cost per Sale" ads had opaque $400/day budgets set | fact (ranges conflict) | [OneShop](https://oneshop.com/blog/facebook-marketplace-boosted-listing), [LeadsBridge](https://leadsbridge.com/blog/how-to-boost-facebook-marketplace/), [Value Added Resource](https://www.valueaddedresource.net/facebook-marketplace-cost-per-sale-ads/) |
| **Zillow Rental Manager** | First listing free; additional listings **$9.99/week**; Premium listing **$29.99 one-time / 90 days**; (Zillow has flip-flopped between free and paid — verify) | fact, dated | [LandlordGurus](https://landlordgurus.com/zillow-rental-manager-review-software-overview/), [Hemlane](https://hemlane.com/resources/zillow-is-charging-for-rentals), [DoorLoop](https://doorloop.com/blog/zillow-rental-manager-review) |
| **Craigslist** | Apartments in **Boston/Chicago/NYC: $5 per post**; other cities free; jobs $10–75; services $5 | fact | [Craigslist fees](https://www.craigslist.org/about/help/posting_fees) |
| **Mercari (US)** | **10%** selling fee on total sale price incl. buyer-paid shipping; separate payment-processing fee dropped Jan 6, 2025; Promote requires ≥5% price drop (some report 20–30%) | fact | [Crosslist](https://crosslist.com/blog/mercari-seller-fees), [Closo](https://closo.co/blogs/fees/mercari-fee-2025-full-breakdown-comparison-with-ebay-seller-fees) |
| **OfferUp** | Local sales free; shipped: **12.9% or $1.99 min**; Promote **$3.99 / 1 day**, **$7.99 / 3 days**; Promote Plus **$19.99/mo** subscription (30+ days) | fact | [OfferUp help](https://help.offerup.com/hc/en-us/articles/360031994412), [App Store](https://apps.apple.com/app/468996152) |
| **Meetup** | Organizer: **$29.99/mo**, $99.99/6 mo, $174.99/yr; Meetup Pro **$55/group/mo** (1-mo) or **$47/group/mo** (6-mo) | fact | [Meetup help](https://help.meetup.com/hc/en-us/articles/28677808413197), [Meetup upgrade](https://help.meetup.com/hc/en-us/articles/31962211457293-How-to-upgrade-a-Meetup-subscription) |
| **Chinese 搭子/social monetization** | Soul membership **30 RMB/mo (~$4)**; ARPPU **~104 RMB/mo**; paying rate **6.5%**; revenue ~2B RMB/yr from "emotional value"; XHS "小红卡" **168 RMB/yr** local-services membership, paused after 2 months; XHS 2025 revenue ~42B RMB, **76% ads** | fact | [36Kr Soul](https://36kr.com/p/3579723409676424), [36Kr XHS](https://www.36kr.com/p/3855788552492038), [Huxiu](https://www.huxiu.com/article/4821194.html) |
| **Stripe (payments rail)** | Standard cards 2.9% + 30¢; Connect: $0 platform fee if Stripe handles pricing; otherwise **$2/monthly active account + 0.25% + 25¢ per payout**; Stripe-owned pricing for Express accounts (June 2026 changelog) | fact | [Stripe support](https://support.stripe.com/questions/monetizing-payments-with-stripe-connect), [Stripe changelog](https://docs.stripe.com/changelog/dahlia/2026-06-24/express-connected-accounts-v1-stripe-owned-pricing-negative-balance-liability) |
| **Escrow.com** | Fee schedule restructured May 31, 2024; typical **~3.25% for <$5k** transactions (buyer/seller/split selectable) | estimate (schedule page not retrieved) | [DomainInvesting](https://domaininvesting.com/escrow-com-escrow-fee/) |
| **uhomes/Amber** | Operator commission (est. 5–12% of annual rent); student service fee only for non-partner properties | estimate / fact | [uhomes help](https://en.uhomes.com/general-pages/helps/125266) |

### 4.1 Recommended price anchors for this platform (derived; all estimate)

| Product | Anchor | Rationale |
|---|---|---|
| **Boost — sublet** | $9 / 3 days, $19 / 7 days, $39 / 14 days, $69 / 30 days; "Nationwide spotlight" +$10 | Between SpareRoom Bold ($15/wk) and OfferUp Promote ($3.99/day); sublet value ($1k+/mo) justifies $19–39. Highest intent Apr–May |
| **Boost — item** | $2.99 / 1 day, $4.99 / 3 days, $9.99 / 7 days; Move-out bundle boost $9.99 | Matches OfferUp Promote |
| **Boost — buddy / event** | $1.99 / 1 day, $4.99 / 3 days | Students won't pay more than a coffee; ARPPU logic from Soul |
| **Landlord Pro** | $29/mo or $249/yr (unlimited listings, analytics, lead inbox, Pro badge, priority verification); "Pro+" $79/mo for property managers (5+ units, API/CSV import, featured building page) | Below Zillow's $9.99/wk/listing for 3+ units; below Meetup organizer; well below uhomes' commission per booking |
| **Secure payment / deposit escrow** | **3% service fee** (min $5, cap $60) paid by payer, optional 1.5% split; holds via Stripe Connect manual payouts (see §6) | Half of Airbnb-style fees; above Stripe cost (~3.2% + fixed) only at scale — treat as trust feature first, profit later |
| **Newcomer Kit** | Free to users; affiliate payouts (§5) | Time-to-first-dollar #1 |
| **Sponsored placements** | $150–600/mo per campus for local businesses (bubble tea, movers, CORT, bike shops); "Verified building" page for PBSA operators $300–1,000/mo | Local ad benchmarks for campus media (student newspapers charge $200–800/mo for web banners — estimate) |
| **Referral credits** | $5 credit per verified referral, usable on boosts | Chase/Discover referral economics show $50 is the bank-level number; $5 in boost credit costs us ~$0 |

---

## 5. Affiliate / referral economics for the "Newcomer Kit"

Two distinct money sources: (A) **public refer-a-friend programs** (bonus paid to a referring *customer*, often in product credit; usable via a staff/ambassador account but ToS-risky at scale) and (B) **affiliate/partner programs** (Impact, CJ, Rakuten/Awin, FlexOffers, in-house) that pay a *publisher* cash per approved conversion. The platform should sign up as a publisher (B) and use (A) only as the user-facing bonus message ("you get $X").

| Category | Partner | Public referral (user-facing bonus) | Publisher/affiliate payout to us (per conversion) | Tag | Source / notes |
|---|---|---|---|---|---|
| **Bank account** | Chase (College Checking / Total Checking) | New-account bonus $100 (College, expired Jan 2026) / $125 (expired Mar 2026) / $300 (Total Checking, recurring); refer-a-friend **$50 per referral, max 10/yr** | Affiliate (via CJ/FlexOffers-style, "Chase for Business"/card offers): **$50–150** per approved checking account; often requires funded account | fact (referral) / estimate (affiliate) | [NerdWallet](https://www.nerdwallet.com/banking/learn/chase-signup-bonuses), [Finder](https://www.finder.com/chase-new-account-bonus), [Bankrate](https://www.bankrate.com/banking/chase-bank-customer-benefits). Chase is the #1 bank for Chinese students (SSN not required for checking with passport + I-20) |
| | Bank of America (Advantage SafeBalance for students) | New-account bonus $200–300 periodically; no public cash referral | Affiliate **$50–100** per funded account | estimate | Not retrieved; BofA runs offers via Impact-style networks intermittently |
| | Wells Fargo (Clear Access Banking, no SSN needed with ITIN/passport) | $300 Everyday Checking bonus periodically | **$50–100** | estimate | — |
| | Discover (Cashback Debit) | $100-type offers periodically | Discover debit affiliate ~**$50** | estimate | — |
| | SoFi Checking & Savings | Referrer **$75–100**, referee **$50** (requires SoFi Plus); other sources say $25/$25 or $75; referral promo window ended Aug 4, 2026 | SoFi affiliate (Impact): **$50–150** per funded account (historically among the richest fintech payouts) | fact (dated) / estimate | [SoFi bank referral](https://www.sofi.com/offers/bank-referral/), [BankBonus](https://bankbonus.com/promotions/sofi/). Caveat: SoFi requires SSN — poor fit for day-1 arrivals |
| | Capital One 360 | Refer-a-friend typically $20–50 (not retrieved) | Affiliate **$25–75** | estimate | — |
| **Credit card (no SSN / no credit history)** | Discover it Student | Referrer statement credit **$50–100** per approved friend, cap **$500/yr**; terms dated Dec 31, 2025 — verify | Discover affiliate (in-house / CJ): **$50–100** per approved card | fact / estimate | [Discover disclosure](https://discover.com/credit-cards/student-credit-card/student-category-disclosure.html), [Discover refer](https://www.discover.com/refer), [USCreditCardGuide](https://www.uscreditcardguide.com/discover-it/). Discover is historically the most SSN-flexible (applies with SSN but students usually have one via on-campus job) |
| | Capital One Quicksilver/Savor Student, Deserve EDU (no SSN), Zolve, Nova Credit-backed cards (Amex/Chase via Nova Credit import of Chinese credit history) | Deserve/Zolve referral $20–50 | **$25–100** per approved card; Nova Credit partner cards pay card-level affiliate ($75–150) | estimate | Deserve EDU and Zolve explicitly target intl students without SSN |
| **SIM / eSIM** | Mint Mobile (T-Mobile network) | Referral credit **$45 (5GB plan) / $60 (15GB)** to referrer; older figure $15 | Mint affiliate (Impact): **$20–35** per activation | fact (referral) / estimate (affiliate) | [Android Central](https://www.androidcentral.com/phones/mint-mobile/top-mint-mobile-deals-promo-codes-2026) |
| | Visible (Verizon) | **$20** credit each for referrer and friend | Affiliate **$15–30** per activation | fact / estimate | [AJ blog](https://aruljohn.com/blog/visible-referral-promo-code/) |
| | Ultra Mobile (T-Mobile; popular with Chinese students for China-calling plans) | Referral program exists; amount not retrieved | **$10–25** | estimate | [Tom's Guide](https://www.tomsguide.com/phones/network-carriers/nows-a-great-time-to-try-a-discount-phone-carrier-4-great-deals-to-get-you-started) |
| | T-Mobile prepaid / Airalo / Holafly eSIM (pre-arrival) | Airalo gives referral credit $3; Holafly affiliate ~10–15% of sale | **$2–8** per eSIM | estimate | Low-value but very high conversion pre-arrival |
| **Renters insurance** | Lemonade | — | Impact program: **$15 per renters lead/quote**, **$20–25.50 per policy** (sources conflict); 30-day cookie | fact (ranges) | [Lasso](https://getlasso.co/affiliate/lemonade/), [UpPromote](https://uppromote.com/affiliate-directory/lemonade/), [Affilimate](https://affilimate.com/programs/lemonade-affiliate-program/) |
| | Toggle (Farmers), Jetty, Assurant, Sure | — | **$10–25** per policy | estimate | Toggle affiliate not retrieved; Farmers runs via Impact/CJ |
| **Movers / storage** | Dolly, Lugg, PODS, U-Haul, Extra Space/Public Storage, Storage Scholars, Collegeboxes (UPS) | — | Dolly/Lugg **$10–20** per completed job; PODS/U-Haul **$15–50** per booking; storage **$20–40** per rental via Impact; Collegeboxes campus referral programs | estimate | Peak May (move-out) and Aug (move-in) |
| **Furniture rental** | CORT (Student package) | Student pricing **$129/mo** for 3 rooms (12-mo+), $99/mo historical, $199/mo for 6-mo; NU Wildcard perk $50 off delivery | CORT campus/referral partner: **$25–75** per lease | fact (pricing) / estimate (payout) | [CORT students](https://www.cort.com/furniture-rental/how-to-rent-furniture-for-students), [NU Wildcard CORT](https://www.northwestern.edu/wildcard/services/businesses/cort-furniture.html), [UH CORT FAQ](https://www.uh.edu/oisss/resources/files/_housing/cort-faq-english.pdf) |
| | Feather, Fernish, Brook | ~$4,800 over 2 yrs for 1BR package (Feather) | **$50–100** per subscription | estimate | [6sqft](https://www.6sqft.com/fast-interiors-gain-momentum-a-guide-to-furniture-rentals/) |
| **Airport pickup** | Local Chinese-run 接机 services; GO Airport Express; limo cos.; NU Wildcard "My Limo Time" Evanston–ORD **$48** (up to 2 pax, +$4 airport, +$5 extra pax); ELS Chicago pickup **$175**; Evanston sedans **$75–149** | — | Lead fee **$5–15** per booking or **10–15%** of fare via partner; or sell the "buddy" carpool for free and monetize via sponsored pickup partners ($150–300/mo per campus) | fact (prices) / estimate (payout) | [NU My Limo Time](https://www.northwestern.edu/procurement/purchasing/wildcard-advantage-program/businesses/my-limo-time.html), [ILSC/ELS](https://resources.ilsc.com/en/knowledge/arrival-details-els-chicago-il), [Royal Carriage](https://royalcarriagelimo.com/evanston-to-ohare) |
| **Tuition payment** | Flywire, Convera (WU Business Solutions), Easy Transfer (易思汇) | Flywire runs *university* partnerships, not consumer referrals; Easy Transfer/易思汇 targets Chinese parents and runs student-ambassador referral programs ($10–30 per paying referral) | Flywire: **no public affiliate**; Easy Transfer / Convera: **$10–50** per completed tuition payment via ambassador schemes | estimate | Flywire not retrieved; high value per transaction (tuition $20–60k) but platform-to-platform deals only |
| **Money transfer** | Wise | Partner program: **£10 (~$12–13) per referred user** who completes a qualifying cross-currency transfer; CPA model | **$10–25** per qualified new customer (US CPA higher than UK £10) | fact (UK) / estimate (US) | [Wise partner guide](https://wise.com/gb/blog/partner-onboarding-guide), [UpPromote Wise](https://uppromote.com/affiliate-directory/wise/) |
| | Remitly | Refer-a-friend: amount shown in-app (reports $5–25), unlimited referrals, paid after friend's first transfer | Affiliate (Impact): **$15–30** per first transfer | fact / estimate | [Remitly referral](https://remit.ly/au/fi/home/referral-offer-program) |
| | Panda Remit / 熊猫速汇, Alipay Tour Pass, Zelle | Panda Remit referral ~¥30–50 | **$5–15** | estimate | Popular with Chinese students for CNY→USD |
| **Other high-fit** | Costco membership, Amazon Prime Student (**$3/trial** via Amazon Associates bounty — fact, long-standing), Spotify/Apple student, textbook rental (Chegg $5–10/lead), bike shops, health insurance waivers (ISO/PSI student plans pay $20–40/policy) | — | as listed | estimate | Amazon Prime Student bounty is the single easiest first dollar |

### 5.1 Realistic Newcomer Kit revenue per new arrival (estimate)

| Conversion | Probability per newcomer who opens the Kit | Payout | Expected value |
|---|---|---|---|
| Bank account | 25% | $75 | $18.75 |
| Credit card (student / no-SSN) | 10% | $75 | $7.50 |
| SIM/eSIM | 35% | $20 | $7.00 |
| Renters insurance | 15% | $20 | $3.00 |
| Money transfer (Wise/Remitly) | 20% | $18 | $3.60 |
| Movers/storage/furniture | 8% | $35 | $2.80 |
| Amazon Prime Student / misc. | 30% | $3 | $0.90 |
| **Total expected value per engaged newcomer** | | | **≈ $43** |

With ~277k new international enrollments/yr nationally (fact) and a realistic year-1 reach of 1–2% (3–5k engaged newcomers) → **$130–215k/yr**; at 10% reach → ~$1.2M/yr. Peak conversion window is Jul 15–Sep 15; the Kit should be reachable pre-arrival (WeChat mini-share links, XHS posts) since bank/SIM decisions are made in the first 7 days.

**Compliance notes:** FTC endorsement rules require "Sponsored / 推广" labels; bank affiliate programs forbid incentivizing with cash from a third party in some cases (read each IO); referral codes that belong to an individual account cannot be posted platform-wide under most ToS (Chase/Discover explicitly limit to friends) — use publisher programs.

---

## 6. Trust & fraud

### 6.1 Common sublet / housing scam patterns (what the "scam-warning banner" must name)

| Pattern | Mechanics | Evidence |
|---|---|---|
| **Fake landlord / cloned listing** | Scraped photos + below-market price; "I'm abroad, can't show it"; asks for deposit via Zelle/CashApp/Alipay/gift card before viewing | UIUC Police: student paid **$1,200 deposit via CashApp** after moving to texts ([UIUC Police](https://police.illinois.edu/fake-apartment-sublet/)); HK student lost **HK$190k** via XHS "agency" whose address did not exist ([The Standard](https://www.thestandard.com.hk/news/article/321040/Mainland-student-loses-190000-in-Xiaohongshu-rental-scam)) |
| **Unauthorized sublessor** | Tenant not on lease, or lease forbids subletting; subtenant evicted or deposit lost | [Berkeley pitfalls](https://tbgpm.com/?p=7549): verify name on lease, confirm with property manager, written sublease |
| **Overpayment / fake check** | "Subtenant" sends check for **$3,850** covering whole term, asks for partial refund; check bounces | [UIUC Police "fake sublessee"](https://www.police.illinois.edu/category/scams/page/9/) |
| **Double-deposit / multiple tenants** | Legit tenant collects deposits from several would-be subtenants | Common in WeChat groups (estimate) |
| **Agent impersonation** | "Licensed 中介" on XHS/WeChat with official-looking seals; collects "服务费" | HK and Australia cases ([The Citizen](https://www.thecitizen.org.au/articles/rental-crisis-desperate-students-turn-to-chinese-brokers-and-pay-price)) |
| **Roommate / 搭子 safety** | Meeting strangers for airport pickup, carpools; cash robbery, harassment | Qualitative |
| **Account takeover of trusted group admins** | Hijacked WeChat accounts post deposit requests | Qualitative; motivates in-app payment only |
| **Phishing "campus police / Chinese consulate"** (adjacent) | Callers impersonate Chinese officials demanding transfers | [UW ISS alert](https://iss.washington.edu/alert-scam-targets-chinese-students/) — useful for the Kit's safety page |

Scale: FBI IC3 2024 — 859,531 complaints, **$16.6B** losses (+33%) ([HousingWire](https://www.housingwire.com/articles/cybercrime-resulted-in-record-losses-in-2024-fbi-ic3-2024-report/)); IC3 2025 real-estate category (incl. rental fraud) **>12,000 complaints, >$275M** ([RISMedia](https://www.rismedia.com/2026/04/13/report-real-estate-fraud-losses-over-million-2025/)); FTC ~65k rental-scam reports / ~$65M since 2020 (secondary, [uni2study](https://www.uni2study.com/articles/how-to-spot-and-avoid-rental-housing-scams-student-housing)). All fact but from secondary summaries — cite the IC3 PDF when publishing.

### 6.2 Verification practices by competitors (benchmark)

| Platform | What they verify |
|---|---|
| Airbnb | Government ID + selfie match, phone, email, payment; reviews both ways; payouts 24h after check-in (de facto escrow) |
| uhomes/Amber | KYC at booking; passport; contract with operator |
| SpareRoom | Email + phone; UK "ID verified" badge optional; moderation team reviews ads |
| Facebook/Craigslist | Account only |
| Roomies/Roomster | Email/phone; Roomster sanctioned for fake reviews |
| Campus portals | Landlord registration with university; students via SSO |
| Zillow | Landlord phone/ID; tenant screening via application ($35) |

**Our ladder (already in BRIEF):** L1 `.edu` email → L2 student ID / passport reviewed → L3 ID + phone + payment method. Add: **"lease proof" badge** for sublessors (upload lease page with name; admin review) — this is the single highest-leverage anti-scam feature given the unauthorized-sublessor pattern; and **"viewed by a verified student" photo/video attestation** for pre-arrival renters.

### 6.3 Legal notes

**Fair housing wording.** The Fair Housing Act §3604(c) bans ads indicating preference by race, color, religion, sex, familial status, national origin, disability (plus state additions: sexual orientation, source of income, etc.). The **roommate/shared-living carve-out**: *Fair Housing Council v. Roommate.com*, 666 F.3d 1216 (9th Cir. 2012) held the FHA does not regulate the choice of roommates or ads expressing roommate preferences in **shared living** ([Harvard Law summary](https://faculty.law.harvard.edu/joseph-singer/?p=647), [Wikipedia](https://en.wikipedia.com/wiki/Fair_Housing_Council_of_San_Fernando_Valley_v._Roommates.com,_LLC)). But: (1) this binds only the 9th Circuit (CA, WA, OR, AZ, NV, etc.) — HUD's position elsewhere is that the FHA's single-family/owner-occupied exemption (§3603(b)) does *not* exempt advertising; (2) the earlier 9th Circuit ruling (2008) held Roommate.com **lost §230 immunity** for *requiring* users to answer discriminatory questions. **Product rule:** gender preference is allowed only for listings flagged `shared_living = true` (room in occupied unit), presented as an optional free-text/enum field the user chooses, never a required dropdown; whole-unit listings must not show gender/nationality/religion preferences; "Chinese-speaking preferred" should be phrased as language, not national origin, and only in shared-living; show a fair-housing notice on the post form; keep an audit log (already in BRIEF).

**Holding funds / escrow.** Holding another person's money and releasing it later is **money transmission** under federal law (FinCEN MSB registration, 31 CFR 1010.100(ff)) and in ~49 states requires a **money transmitter license** unless an exemption applies. Stripe lists **money transmission, escrow-like and lending services as restricted/prohibited** for direct use ([Stripe restricted businesses](https://stripe.com/legal/restricted-businesses)); Stripe Connect covers the MTL for platforms when funds flow through Stripe's connected accounts and the platform never takes custody ([Stripe Connect](https://stripe.com/connect), [ClearValue](https://clearvaluelending.com/glossary/stripe-connect)). Practical path: (a) **Stripe Connect with destination charges + manual/delayed payouts** (funds sit in Stripe's balance, released on move-in confirmation; Stripe allows holds up to 90 days for most accounts — estimate; confirm per account) — this is "escrow-like", and we must **not call it "escrow"** in UI; (b) for true third-party escrow use a licensed provider (**Escrow.com**, ~3.25% est.; or a bank-sponsored escrow API such as Mangopay/Trustly/"Escrow.com API") ; (c) state **security-deposit statutes** (IL 765 ILCS 710, NY GOL §7-108, CA Civ. Code §1950.5, MA c.186 §15B) regulate landlord deposits — a platform holding a *sublet* deposit on behalf of a sublessor may trigger those too. **Flag for counsel before enabling real money**; the mock Stripe checkout in the brief is fine for demo.

**ID documents / data privacy.** Illinois **BIPA** (740 ILCS 14) makes face-match ID verification a litigation magnet: $28.5M settlement by an ID-verification vendor; $228M BNSF verdict; vendors (Jumio, AWS Rekognition) held liable alongside customers ([Orrick](https://infobytes.orrick.com/2023-05-11/id-verifier-pay-285-million-settle-bipa-allegations/), [Lockton](https://global.lockton.com/news-insights/rogers-v-bnsf-verdict-signals-companies-about-the-cost-of-violating-illinois)); 2024 amendment limits damages to per-person not per-scan but notice + written consent remain mandatory. Launch campus is in Illinois → **do manual human review of ID photos (no face-matching biometrics) at first**; if later using Persona/Stripe Identity/Veriff (~$1–3 per verification, estimate), require BIPA-compliant written consent and a published retention schedule. Also: store ID images encrypted at rest, auto-delete within 30 days of decision, never show them to the counterparty, exclude from backups' long retention, log every admin view (audit log in BRIEF), honor CCPA/CPRA deletion for CA users, and treat passport numbers as PII never written to `events`. Texas/Washington have their own biometric laws; NY SHIELD applies to breaches.

**Other:** CAN-SPAM for digest emails; TCPA for SMS (phone verification OK; marketing SMS needs consent); Section 230 protects hosting user listings but not content we *require* (see Roommate.com); FTC endorsement rules for affiliate labels; FHA also applies to our ranking — paid boosts must not downrank protected classes (they don't, since boosts are seller-side).

---

## 7. Campus shuttle data availability

Most US campus shuttles run on one of four vendors; feed availability by vendor:

| Vendor | Data access | Example campuses (fact unless noted) |
|---|---|---|
| **Passio GO** | Public **GTFS static + GTFS-Realtime** (vehicle positions, trip updates) per agency, CORS-open; unofficial Python API (`PassioGo` on PyPI) lists many campuses | Brown ([busbus repo](https://github.com/nhausspiegel/busbus)), U Georgia ([Transitland](https://www.transit.land/feeds/f-uga~ga~us)), U Chicago UGo (moved from TransLoc Mar 2024 — [UChicago](https://safety-security.uchicago.edu/en/news-alerts/2024-03-21-passio-go-for-ugo-shuttle-tracking)), U Rochester ([Rochester](https://www.rochester.edu/parking/new-passio-go-app-replaces-transloc-to-track-university-shuttles-in-real-time/)), CSU Long Beach; PyPI listing names Columbia, Harvard, NYU, Emory ([PyPI PassioGo](https://pypi.org/project/PassioGo)) |
| **TransLoc (Ford → now Passio/… ownership changes)** | Public GTFS for many agencies; legacy OpenAPI (Mashape) deprecated; Transitland archives | U Virginia ([Transitland UVA](https://www.transit.land/feeds/f-university~of~virginia)), American U ([Transitland AU](https://www.transit.land/data/feeds/f-americanuniversity)), Georgia Tech (moved *to* TransLoc — [GT PTS](https://www.pts.gatech.edu/?p=1780)), Duke, NC State, UNC, Rutgers (estimate) |
| **DoubleMap** (acquired by Ride Systems/… ) | JSON endpoints per subdomain (`<school>.doublemap.com/map/v2/routes`), undocumented but widely scraped | Historically Northwestern (older page), Indiana, Kansas (estimate) |
| **TripShot** | No public feed by default; app + web map; some agencies publish GTFS on request | **Northwestern University** (current tracker — [NU tracker](https://www.northwestern.edu/transportation-parking/shuttles/routes/tracker.html), [NU shuttles](https://www.northwestern.edu/transportation-parking/shuttles)); Stanford Marguerite (GTFS published — fact), Caltech/JPL, Apple/Google corporate shuttles |
| **Official GTFS published by university** | Zip download | UC San Diego ([UCSD GTFS](https://transportation.ucsd.edu/campus/shuttles/gtfs.html)), Stanford Marguerite, UIUC (served by **MTD** public transit, full GTFS + developer API — fact, estimate on API availability), UMich (Magic Bus — TransLoc/Rider feed), UW (served by King County Metro GTFS) |

**Northwestern specifics (fact):** routes = Intercampus (Evanston ↔ Chicago/Ward Building), Evanston Loop (Campus Loop), Ryan Field, Frostbite (winter), Chicago Express (select Saturdays), Safe Ride (on-demand, separate app); schedules published as PDFs effective Sep 1 each year ([NU schedules](https://www.northwestern.edu/transportation-parking/shuttles/routes/schedules/index.html), [Intercampus brochure](https://www.northwestern.edu/transportation-parking/docs/intercampus-shuttle-brochure.pdf)); real-time via **TripShot** app; an older NU page still mentions DoubleMap (stale). Seed plan: hand-transcribe PDF timetables into `shuttle` seed (approximate, as BRIEF allows) + link-out to TripShot. For UIUC seed, MTD GTFS is public; for NYU/USC, check Passio GO GTFS endpoints (`https://passio3.com/...` per the busbus repo pattern) and fall back to approximate.

**Licensing caveat:** Passio's "open API" and CORS-open GTFS signal intent to allow reuse but are not a license; TripShot/DoubleMap scraping violates ToS in some cases. Build the ingest as "GTFS importer" (standard) + admin manual editor, and show "approximate — see official tracker" for non-GTFS campuses. The "request my campus" form in the brief is the right fallback.

---

## 8. One-page summary — the 10 most decision-relevant facts for monetization

1. **Market size is big and concentrated:** 1,177,766 international students (fact), 265,919 Chinese (fact, shrinking 4%/yr) and 363,019 Indian (fact, +10%/yr); the top 25 universities host ~300k, and 8 metros (NYC, Boston, LA, Bay Area, Chicago, Seattle, Champaign, Ann Arbor) cover ~300k — a 60-campus seed reaches most of the addressable base. Build bilingual zh/en but keep i18n ready for Hindi/English-first growth.

2. **New arrivals (the Newcomer Kit audience) fell 17% in fall 2025 (fact)**, while the installed base is stable → prioritize sublet/secondhand/buddy retention features for existing students, and make the Kit convertible pre-arrival via share links into WeChat/XHS.

3. **Newcomer Kit EV ≈ $43 per engaged newcomer (estimate)**, driven by bank accounts ($50–150/conversion, Chase referral $50 is public fact), student/no-SSN credit cards ($50–100), SIM ($15–35; Mint referral credit now $45–60 fact), renters insurance ($15–25.50 fact), Wise/Remitly ($10–30). This is the fastest first dollar and needs no payments licensing.

4. **Boost pricing anchors are well established:** SpareRoom Bold $15/wk–$149/6mo (fact), OfferUp Promote $3.99/day–$19.99/mo (fact), Craigslist $5/post in NYC/Chicago/Boston (fact), Zillow $9.99/wk per extra listing + $29.99 premium (fact, dated). Price sublet boosts at $9–69 and item boosts at $2.99–9.99; expect Apr–May and Jul–Sep spikes.

5. **Landlord Pro at $29/mo undercuts every alternative landlords already pay** (Zillow $9.99/wk/listing ≈ $43/mo per unit; campus-portal fees; uhomes-style commissions of $500–2,000/booking, estimate) and is the only recurring-revenue line; target property managers in Champaign, Ann Arbor, Madison, West Lafayette where pre-leasing runs 6–9 months ahead.

6. **Holding deposits = money transmission unless done through Stripe Connect delayed payouts or a licensed escrow partner (fact).** Stripe prohibits escrow/money-transmission businesses directly; do not use the word "escrow" in UI; charge a 3% "secure payment service fee" (half of Airbnb's 15.5% host-only fee, fact) and get counsel before going live. Mock checkout for now, as the brief specifies.

7. **Scam patterns are specific and nameable:** off-platform deposits (Zelle/CashApp/Alipay), unauthorized sublessors not on the lease, overpayment checks, cloned listings, fake 中介 on XHS/WeChat (facts from university police and HK/AU press). The **"lease-proof badge" + in-app payment only + first-message scam banner** are the trust features that make every paid feature credible.

8. **Illinois BIPA makes biometric ID-matching a liability at the launch campus (fact: $28.5M vendor settlement, $228M verdict).** Use manual admin review of ID photos first, 30-day deletion, encrypted storage, consent + retention policy before any face-match vendor.

9. **Roommate gender/language preferences are legal only in shared-living listings (9th Cir. Roommate.com, 2012, fact) and must be optional free fields, never required** — otherwise §230 protection is lost. Whole-unit listings: no protected-class preferences. This affects the listings form, moderation, and boosts (never rank by protected class).

10. **Shuttle data is cheap where campuses use Passio GO / TransLoc / public GTFS (NYU, Columbia, UChicago, UCSD, UIUC-via-MTD, Stanford) and expensive where they use TripShot (Northwestern) — fact.** Build a generic GTFS importer plus manual timetable editor; the "near shuttle stop" badge on listings is a differentiator that also raises boost value for far-from-campus units. Social-app benchmarks (Soul: ¥30/mo membership, 6.5% paying, fact) say buddy/搭子 features should be monetized with cheap visibility boosts and sponsored events, not transaction fees.

**Revenue stack sanity check (estimate, year 1 at ~5% reach of 8 launch metros ≈ 15k MAU):** Kit affiliates $150–250k; boosts $60–120k (≈ 8k paid boosts × $12 avg); Landlord Pro $40–90k (150–250 subs); secure-payment fees $20–60k once live; sponsored placements $30–80k. Total ≈ **$300–600k**, with affiliates and boosts arriving within weeks of launch and Pro/escrow in months 4–12.

---

### Source index (primary URLs used)

- IIE Open Doors 2025: https://www.iie.org/news/open-doors-2025-press-release/ · https://opendoorsdata.org/wp-content/uploads/2025/11/OD25_Fast-Facts.pdf · https://opendoorsdata.org/wp-content/uploads/2025/11/OD25_Open-Doors-2025-Press-Release.pdf · https://opendoorsdata.org/wp-content/uploads/2026/01/OD_China_Fact-Sheet-2025.pdf · state sheets (PA, NY) under opendoorsdata.org/wp-content/uploads/2025/11/
- Rents: https://www.zumper.com/rent-research/national-rent-report · https://www.zillow.com/rental-manager/market-trends/evanston-il/ · https://www.redfin.com/city/6331/IL/Evanston/rental-market · https://www.redfin.com/city/3210/IL/Champaign/rental-market · https://www.rentcafe.com/average-rent-market-trends/us/mi/ann-arbor/ · https://www.apartments.com/rent-market-trends/ann-arbor-mi/ · https://www.nbcbayarea.com/news/local/making-it-in-the-bay/average-1-bedroom-apartment-rent-bay-area/3929221/ · https://www.apartmenttherapy.com/rent-falling-fastest-june-2025-report-zumper-37492742
- Fees: https://www.spareroom.com/content/placeditadvert/listing-options/ · https://www.craigslist.org/about/help/posting_fees · https://help.offerup.com/hc/en-us/articles/360031994412 · https://crosslist.com/blog/mercari-seller-fees · https://help.meetup.com/hc/en-us/articles/28677808413197 · https://www.hostaway.com/airbnb-host-only-fee-what-to-know-about-the-15-percent-host-fee · https://landlordgurus.com/zillow-rental-manager-review-software-overview/ · https://support.stripe.com/questions/monetizing-payments-with-stripe-connect · https://stripe.com/legal/restricted-businesses
- Affiliates: https://www.nerdwallet.com/banking/learn/chase-signup-bonuses · https://www.sofi.com/offers/bank-referral/ · https://discover.com/credit-cards/student-credit-card/student-category-disclosure.html · https://www.androidcentral.com/phones/mint-mobile/top-mint-mobile-deals-promo-codes-2026 · https://aruljohn.com/blog/visible-referral-promo-code/ · https://getlasso.co/affiliate/lemonade/ · https://uppromote.com/affiliate-directory/lemonade/ · https://www.cort.com/furniture-rental/how-to-rent-furniture-for-students · https://wise.com/gb/blog/partner-onboarding-guide · https://remit.ly/au/fi/home/referral-offer-program · https://www.northwestern.edu/procurement/purchasing/wildcard-advantage-program/businesses/my-limo-time.html
- Trust/legal: https://police.illinois.edu/fake-apartment-sublet/ · https://www.thestandard.com.hk/news/article/321040/Mainland-student-loses-190000-in-Xiaohongshu-rental-scam · https://tbgpm.com/?p=7549 · https://www.housingwire.com/articles/cybercrime-resulted-in-record-losses-in-2024-fbi-ic3-2024-report/ · https://faculty.law.harvard.edu/joseph-singer/?p=647 · https://infobytes.orrick.com/2023-05-11/id-verifier-pay-285-million-settle-bipa-allegations/ · https://global.lockton.com/news-insights/rogers-v-bnsf-verdict-signals-companies-about-the-cost-of-violating-illinois
- Competitors/channels: https://en.uhomes.com/general-pages/helps/125266 · https://www.leasebreak.com/ · https://www.uloop.com/housing · https://roomster.com/ · https://findmyplace.co/blog/best-apps-find-college-roommate/ · https://36kr.com/p/3579723409676424 · https://www.36kr.com/p/3855788552492038 · https://www.1point3acres.com/bbs/tag-63-522.html · https://northbynorthwestern.com/or-best-offer
- Shuttles: https://www.northwestern.edu/transportation-parking/shuttles/routes/tracker.html · https://www.northwestern.edu/transportation-parking/shuttles/routes/schedules/index.html · https://github.com/nhausspiegel/busbus · https://pypi.org/project/PassioGo · https://www.transit.land/feeds/f-university~of~virginia · https://transportation.ucsd.edu/campus/shuttles/gtfs.html · https://safety-security.uchicago.edu/en/news-alerts/2024-03-21-passio-go-for-ugo-shuttle-tracking
