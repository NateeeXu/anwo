# Campus seed data — sources and caveats

`campuses.json` holds 66 US universities, chosen from the Open Doors (IIE) "leading host institutions" tables as a guide: every campus the brief asked for, plus five more that consistently sit in the Open Doors top 40–60 (UT Arlington, Cincinnati, NC State, UIC, UMass Amherst). Northwestern is first; otherwise the order follows the brief's list and carries no meaning. Sort in the app.

## Field by field

| Field | Status | Notes |
|---|---|---|
| `id` | stable | kebab slug; validated unique. Treat as a permanent key (DB rows reference it). |
| `name`, `shortName` | fact | Official English name; `shortName` is the everyday name students use (UIUC, Penn, WashU…). |
| `nameZh` | fact | Common Simplified Chinese name as used by Chinese student communities. |
| `city`, `state` | fact | City of the main campus mailing address (e.g. UIUC → Urbana, UCSD → La Jolla, Notre Dame → Notre Dame, IN). |
| `lat`, `lng` | approx (±100 m) | Center of the main campus (quad / landmark building), 4 decimals, from well-known landmark coordinates. Good enough for map centering and "near campus" radius; not surveyed. Least sure: Rochester (River Campus), Iowa (Pentacrest), UT Austin, Notre Dame. |
| `timezone` | fact | IANA zone, validated with `Intl.DateTimeFormat`. Michigan campuses use `America/Detroit`, Indiana campuses `America/Indiana/Indianapolis`, ASU `America/Phoenix` (no DST). |
| `eduDomains` | mostly fact | Primary `.edu` domain plus student-mail subdomains known to be in use (e.g. `u.northwestern.edu`, `g.ucla.edu`, `terpmail.umd.edu`, `buckeyemail.osu.edu`). Match by suffix (`endsWith("." + domain)` or equality) so any unlisted departmental subdomain of the primary domain still verifies. Older student domains (`husky.neu.edu`, `umail.ucsb.edu`) are kept for alumni/legacy inboxes. |
| `intlStudentsApprox` | **estimate** | Rounded total international students (all levels, including OPT) from Open Doors 2024/2025 as best recalled; opendoorsdata.org and iie.org could not be fetched from this session, so only a few figures were confirmed via search snippets (NYU ≈27k #1, Northeastern ≈20.6k, Columbia ≈19k, ASU ≈18k, UIUC 16,144 #6, UW–Madison #18, Ohio State #30). Use for sorting/weighting only; never display as a fact without re-checking against the current Open Doors table. |
| `hasShuttle` | judgment | `true` when the university itself runs (or contracts) a university-branded shuttle/bus network. `false` when students rely on the city transit agency even if routes are campus-funded: UIUC (MTD), Purdue (CityBus), Cornell (TCAT), Wisconsin (Madison Metro campus routes 80–84), Iowa State (CyRide), Florida (RTS), UCSB (SBMTD), Michigan State (CATA), Northeastern Boston (MBTA; RedEye is on-demand only). Borderline, set `true`: UT Austin (UT Shuttle operated by CapMetro), UT Dallas (Comet Cruiser = DART 883), UC Davis (Unitrans, ASUCD-run), Penn State (PSU Campus Shuttle + CATA loops), Cincinnati (UC Shuttle operated by Metro), UMass (UMass Transit/PVTA). |
| `shuttleTrackerUrl` | verified where present | Official university shuttle/tracker page confirmed by web search in Nov 2026 unless listed below. Where the vendor (Passio GO, TransLoc, TripShot, ETA Spot, Citymapper…) has changed recently, the university's own shuttle page is linked instead of the vendor URL, because vendor URLs churn (Harvard, Rochester, Columbia, Georgia Tech and UChicago all switched vendors in 2024–2026). `null` means no fixed-route tracker was confirmed; the shuttle module should show its "request my campus" / generic transit fallback. |
| `metro` | judgment | Grouping label for the nationwide view. Big cities absorb nearby campuses (Boston ← Harvard/MIT/Tufts/Brandeis; Chicago ← UChicago/IIT/UIC; Washington DC ← Maryland; Los Angeles ← UC Irvine; Dallas-Fort Worth ← UT Dallas/UT Arlington; Raleigh-Durham ← Duke/NC State; New Jersey ← Rutgers/Princeton). College towns stand alone (Champaign-Urbana, State College, College Station, Ann Arbor…). Rename freely; nothing keys on it. |

## Tracker URLs not directly confirmed (treat as "probably right")

- `penn-state` → transportation.psu.edu/campus-shuttle (page name from memory)
- `iowa` → transportation.uiowa.edu/cambus (page name from memory; tracking is via the Transit app)
- `nc-state` → transportation.ncsu.edu/wolfline/ (Wolfline moved to Passio GO in Aug 2024)
- `uchicago` → the Passio GO page still exists, but UChicago added Citymapper in Feb 2026; re-check
- `georgetown` → site root only; GUTS GPS tracking was reported paused in 2026
- `umich` → mbus.ltp.umich.edu (address from the 2020 launch notice; still the published one)
- `vanderbilt` → the odd `coummutecampus` path is what the live site actually uses

## `hasShuttle: true` with `shuttleTrackerUrl: null` (shuttle exists, tracker page not confirmed)

ut-austin, ut-dallas, rice, illinois-tech, tufts, ut-arlington, cincinnati, uic, umass-amherst.

## Regenerating

The file was produced by a small generator with built-in checks (unique ids, 4-decimal coordinates inside the continental US, valid IANA timezones, `.edu` domains, no tracker URL without `hasShuttle`). Edit `campuses.json` directly for small fixes; keep `id` values unchanged.
