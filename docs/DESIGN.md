# 安窝 Anwo — Design System

> Contract for every UI built in this repo. Tokens live in two ready-to-paste twins:
> `docs/design/theme.css` (Tailwind v4 `@theme` + light/dark variables) and `docs/design/tokens.json`.
> Names in this document are the names in those files. If you need a token that is not here, use the closest one — do not invent hex values in components.
>
> Scope reminder: the platform is **nationwide / multi-campus** (US). Every screen is campus-scoped with a Nationwide option for sublets. Northwestern is the launch campus for demo data only. Nothing in the UI may say "Evanston" or "Northwestern" as fixed copy; the campus name always comes from `useCampus()`.

Contents: 0 How to use · 1 Brand · 2 Principles · 3 Tokens · 4 Signature elements · 5 Component inventory · 6 Layout & navigation · 7 Page blueprints · 8 Bilingual typography & microcopy · 9 Accessibility & dark mode · 10 Do this, not that

---

## 0. How to use this document

1. Scaffold copies `docs/design/theme.css` to `web/src/styles/theme.css` and imports it once in `web/src/main.tsx`. Module agents never edit it.
2. Use Tailwind utilities generated from the tokens (`bg-paper`, `text-ink-2`, `border-line`, `rounded-card`, `text-h2`, `shadow-md`, `ease-out`, `z-layer-modal`, `duration-token-base`, `max-w-content`). Arbitrary hex values (`bg-[#…]`) are forbidden; a lint rule may be added.
3. Shared components in `web/src/components/**` are built by scaffold from §5. Modules compose them; they do not re-style them.
4. Dark mode is automatic when you use semantic tokens. If you find yourself writing `dark:` for colors, you have used a raw token (`persimmon-500`, `stone-*`) where a semantic one was needed.
5. Every user-visible string goes through `useT()`. §8 gives the tone and formatting rules for both languages.

---

## 1. Brand

### 1.1 Name candidates

| # | 中文 | English | Meaning | Verdict |
|---|---|---|---|---|
| 1 | **安窝** | **Anwo** | 安 = settle / peace of mind (安心, 安居), 窝 = nest, a cosy place of one's own. "安窝" reads as "settle into your nest". Two strokes-light characters, 2 syllables in both languages, pronounceable by English speakers (AHN-woh). No known brand collision. | **Chosen** |
| 2 | 校边 | Campuside | "Beside campus" — accurately describes the geography. "-side" is a crowded suffix (Riverside, Parkside), and 校边 reads as "edge of campus", slightly peripheral. | No |
| 3 | 落脚 | Landing | 落脚 = "a place to land" — lovely verb for newcomers. "Landing" is a generic UI term and an existing real-estate brand family. | No |
| 4 | 栖所 | Perchly | 栖 = perch/roost, literary and warm. 栖 is uncommon to type for many students; "Perch" is an existing fintech brand. | No |
| 5 | 同屋 | Tongwu | "Same house / roommate". Memorable, but too narrow: the platform also sells sofas, finds Costco buddies and shows shuttles. | No |

### 1.2 Tagline

- 中文：**安心落脚，从校园开始。**
- English: **Settle in safely, starting at campus.**

Short forms for tight spots (tab bar, meta title): 「安心落脚」 / "Settle in safely".

### 1.3 Wordmark & mark

Concept: the roof radical **宀** of 安 drawn as a two-stroke chevron, sheltering a persimmon dot that is both the **nest** and the **map pin** of the platform. The dot's short tail turns it into a pin; without the tail it is a nest. Monochrome ink for the roof, accent for the dot — the only place the vivid accent appears at small size.

Rules: the mark is never gradient-filled, never rotated, never placed on a photo without the `surface` plate. Minimum size 20 px. Clear space = height of the dot on all sides.

```svg
<!-- Mark: 32×32. Uses CSS variables so it is correct in both themes. -->
<svg viewBox="0 0 32 32" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="安窝 Anwo">
  <path d="M6 15 L16 7 L26 15" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M16 3.5 V6"        stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="16" cy="20" r="5.5" fill="var(--accent-vivid)"/>
  <path d="M16 25.5 V28.5"    stroke="var(--accent-vivid)" stroke-width="2.5" stroke-linecap="round"/>
</svg>
```

```svg
<!-- Horizontal lockup: mark + bilingual wordmark. Width 132, height 32. -->
<svg viewBox="0 0 132 32" width="132" height="32" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="安窝 Anwo">
  <g fill="none">
    <path d="M6 15 L16 7 L26 15" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M16 3.5 V6" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="16" cy="20" r="5.5" fill="var(--accent-vivid)"/>
    <path d="M16 25.5 V28.5" stroke="var(--accent-vivid)" stroke-width="2.5" stroke-linecap="round"/>
  </g>
  <text x="38" y="22" font-family="var(--font-display)" font-size="19" font-weight="700" letter-spacing="-0.01em" fill="var(--ink)">安窝</text>
  <text x="80" y="22" font-family="var(--font-display)" font-size="17" font-weight="600" letter-spacing="-0.02em" fill="var(--ink-2)">Anwo</text>
</svg>
```

Favicon: the mark alone on `paper` (light) / `stone-950` (dark), 32 px, `rounded-sm` plate.
`brand.ts` constants: `NAME_ZH = "安窝"`, `NAME_EN = "Anwo"`, `TAGLINE_ZH`, `TAGLINE_EN`, `NAME_DISPLAY = "安窝 Anwo"`.

---

## 2. Design principles

1. **Warm editorial minimalism.** The page is paper, the content is ink, and photos and prices are the illustrations. Warm neutrals (`paper #FBF8F3`, `ink #1C1917`), not blue-grays. Air between things does the work that boxes and shadows usually do.
2. **One accent, spent carefully.** Persimmon appears on: the primary action, the selected state, the map pin, trust badges L2–L3, and the logo dot. Nothing else. If a screen has two persimmon things competing, one of them is wrong.
3. **Type carries the hierarchy.** Size, weight and ink level (`ink` → `ink-2` → `ink-3`) distinguish title / meta / hint. Never color, never boxes. Chinese and English must look equally designed: same sizes, same weights, line-height tuned per language (§8).
4. **Honest surfaces.** Cards are `surface` with a 1 px `line` hairline and the signature 14 px radius. Shadows appear only on things that float (popovers, sheets, pins). Monetized placements are labelled in plain words, in the same type as everything else.
5. **Quiet motion, obvious state.** 120–320 ms, ease-out, movement ≤ 8 px. Every interactive element has visible hover, focus (2 px persimmon ring), active and disabled states; nothing changes meaning on hover alone.

**Do NOT:**
- No gradients for decoration (the only gradient in the system is the skeleton shimmer).
- No glassmorphism / backdrop-blur panels.
- No generic SaaS hero (giant headline + two buttons + floating dashboard mock). The home page starts with real listings.
- No Tailwind default palette (`blue-500`, `indigo-600`, `purple-*`, `slate-*`, `gray-*`). `theme.css` deletes them; `--color-*: initial`.
- No stock 3D illustrations, no emoji as icons, no confetti.
- No drop shadows on resting cards, no colored card borders for "featured".
- No `font-weight: 300` (thin weights fall apart in CJK system fonts).
- No all-caps Chinese "labels" — Chinese has no capitals; use `caption` weight 500 instead of letter-spaced caps for CJK.

---

## 3. Tokens

All values below are in `theme.css` / `tokens.json`. Semantic tokens are what you use; raw ramps exist for charts and the logo.

### 3.1 Color

**Raw accent ramp — persimmon (the only chromatic hue)**

| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|
| #FFF3EC | #FFE1D1 | #FFCDB5 | #FFAB85 | #FB8A5A | #E35A2B | #C2410C | #A23A12 | #822F11 | #67280F | #3B1508 |

**Raw neutral ramp — stone (warm)**

| 0 | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 850 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| #FFFFFF | #FBF8F3 | #F3EEE6 | #E7E0D5 | #CFC6B8 | #A39B90 | #6F6861 | #57514A | #3A3531 | #272320 | #1D1A17 | #1C1917 | #141210 |

**Semantic tokens (use these)**

| Token (`bg-…` / `text-…` / `border-…`) | Role | Light | Dark |
|---|---|---|---|
| `paper` | page background | #FBF8F3 | #141210 |
| `surface` | cards, inputs, popovers, nav | #FFFFFF | #1D1A17 |
| `sunken` | wells, chips, table header, thumbnails bg | #F3EEE6 | #272320 |
| `overlay` | scrim behind modal/sheet | rgba(28,25,23,.48) | rgba(0,0,0,.6) |
| `inverse` | inverse chips, selected pin, tooltip, price stub | #1C1917 | #F2EDE6 |
| `line` | hairline borders, dividers | #E7E0D5 | #2F2A26 |
| `line-strong` | input borders, hover card border, avatar ring L1 | #CFC6B8 | #4A433D |
| `ink` | primary text, icons | #1C1917 | #F2EDE6 |
| `ink-2` | secondary text, metadata | #57514A | #BDB5AB |
| `ink-3` | tertiary text, placeholders, captions | #6F6861 | #948C82 |
| `ink-4` | disabled text, decorative icons only (not for readable text) | #A39B90 | #6B645C |
| `ink-inverse` | text on `inverse` | #FBF8F3 | #141210 |
| `accent` | primary button fill, selected tab underline, active toggle | #C2410C | #C2410C |
| `accent-hover` / `accent-active` | button hover / pressed | #A23A12 / #822F11 | #E35A2B / #FB8A5A |
| `accent-text` | links, accent text on `paper`/`surface` | #C2410C | #FB8A5A |
| `accent-text-strong` | accent text on `sunken` or `accent-soft` | #A23A12 | #FFAB85 |
| `accent-soft` / `accent-soft-line` | tinted chip/label bg and its border | #FFF3EC / #FFCDB5 | #3B1508 / #67280F |
| `accent-vivid` | logo dot, map pin fill, decorative, display numerals ≥ 24 px | #E35A2B | #E35A2B |
| `on-accent` | text on `accent` | #FFFFFF | #FFFFFF |
| `success` / `success-soft` / `on-success` | positive | #1E7245 / #E2F3E9 / #FFF | #5FCB8F / #12291C / #141210 |
| `warning` / `warning-soft` / `warning-fill` | caution, scam banner | #8A5200 / #FBEFD4 / #F2B84B | #F2B84B / #2E2108 / #F2B84B |
| `danger` / `danger-soft` / `on-danger` | destructive, errors | #B42318 / #FDE8E6 / #FFF | #F47F75 / #3A1512 / #141210 |
| `info` / `info-soft` | neutral notices (shuttle alerts, tips) | #2A5D8F / #E4EEF7 | #82B4E3 / #13233A |
| `focus` | focus ring | #E35A2B | #FB8A5A |

**Verified contrast (WCAG 2.x relative luminance; all text pairs ≥ 4.5:1)**

| Pair | Light | Dark |
|---|---|---|
| `ink` on `paper` | 16.51 | 16.05 |
| `ink` on `surface` | 17.49 | 14.87 |
| `ink` on `sunken` | 15.14 | 13.38 |
| `ink-2` on `paper` | 7.39 | 9.22 |
| `ink-3` on `paper` | 5.18 | 5.64 |
| `ink-3` on `sunken` | 4.75 | 4.70 |
| `accent-text` on `paper` | 4.89 | 7.91 |
| `accent-text` on `surface` | 5.18 | 7.33 |
| `accent-text-strong` on `paper` | 6.29 | 10.16 |
| `accent-text-strong` on `accent-soft` | 6.12 | 8.80 |
| `on-accent` on `accent` (buttons, pins) | 5.18 | 5.18 |
| `ink-inverse` on `inverse` | 16.51 | 16.05 |
| `success` on `paper` / on `success-soft` | 5.59 / 5.14 | 9.28 / 7.67 |
| `warning` on `paper` / on `warning-soft` | 6.03 / 5.60 | 10.44 / 8.77 |
| `danger` on `paper` / on `danger-soft` | 6.21 / 5.59 | 7.24 / 6.28 |
| `on-danger` on `danger` | 6.57 | 7.24 |
| `info` on `paper` / on `info-soft` | 6.48 / 5.84 | 8.53 / 7.21 |
| `focus` ring on `paper` (non-text, needs 3:1) | 3.44 | 7.91 |

Known edges (and the rule that avoids them):
- `accent-text` (#C2410C) on `sunken` is **4.48** in light → on `sunken` or `accent-soft`, always use `accent-text-strong`.
- `accent-vivid` (#E35A2B) with white text is 3.64 → never put text on `accent-vivid`; the pin fill is `accent`, not `accent-vivid`. `accent-vivid` is for the logo dot, big numerals ≥ 24 px bold (large-text threshold 3:1) and non-text shapes.
- `ink-4` is 2.59 → disabled text and decorative icons only. Placeholders use `ink-3`.
- `ink-3` on `sunken` is 4.75 / 4.70 — fine, but do not use `ink-3` at `caption` size on `sunken` inside a hover-tinted row; use `ink-2`.

### 3.2 Typography

**Stacks** (`font-sans`, `font-display`, `font-mono`): no webfont is fetched; system fonts render immediately offline. Inter and Noto Sans SC are named first so they are used where installed; PingFang SC (macOS/iOS), Microsoft YaHei (Windows), Source Han / Noto Sans CJK (Linux/Android) carry Chinese.

```
sans:    "Inter", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
display: same as sans (hierarchy by weight/tracking, not by a second family — CJK serif system fonts are unreliable)
mono:    "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, "Noto Sans Mono CJK SC", monospace   → verification codes, IDs
```

**Scale** (`text-<name>` utilities set size, line-height, weight, tracking):

| Token | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 40 / 44 (mobile 32 / 36) | 700 | −0.02em | Pricing page headline, onboarding "选择你的学校" |
| `h1` | 28 / 34 (mobile 24 / 30) | 700 | −0.015em | Page title, listing title on detail |
| `h2` | 22 / 28 | 600 | −0.01em | Section titles (热门房源) |
| `h3` | 18 / 24 | 600 | 0 | Card titles on detail pages, modal titles |
| `body-lg` | 17 / 1.5 (zh 1.65) | 400 | 0 | Listing description |
| `body` | 15 / 1.5 (zh 1.65) | 400 | 0 | Default |
| `small` | 13 / 18 | 400 | 0 | Metadata, chat timestamps |
| `caption` | 12 / 16 | 500 | +0.01em | Labels, badges, tab bar |
| `price-lg` | 24 / 28 | 700 | −0.01em | Price on detail page, tabular nums |
| `price` | 17 / 22 | 700 | 0 | Price on cards, tabular nums |

Mobile sizes for `display` and `h1` are their own tokens, used as `text-display-sm md:text-display` (32 / 36) and `text-h1-sm md:text-h1` (24 / 30), because `@theme inline` values cannot change at runtime.
Weights: 400 / 500 / 600 / 700 only. Card titles are 600 at `body` size. Body copy is never bold for emphasis — use `ink` vs `ink-2`.
Digits: prices, counters, tables use `tabular-nums` (`.tnum` / `.price`). Inputs on mobile are 16 px (prevents iOS zoom). Max line length 72 ch for English, 40 em for Chinese (`max-w-reading`).

### 3.3 Spacing
4 px base. Allowed steps: 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96. Semantic: card padding 16 (20 on `lg`), grid gap 12 mobile / 20 desktop, section gap 32 mobile / 48 desktop, inline icon gap 6–8, stack 4 / 8 / 16. Side gutter 16 mobile, 32 desktop.

### 3.4 Radius
`xs 4` (focus ring corners, skeleton lines) · `sm 6` (badges, nested images, tooltip) · `ctl 10` (buttons, inputs, chips that are not pills, segmented control) · **`card 14` — the signature radius**: every card, modal, sheet top, popover, image hero · `lg 20` (photo gallery hero, onboarding panel) · `pill 999` (filter chips, map pin, campus switcher, toggle).
Nesting rule: inner radius = outer radius − inset. An image flush to the card edge shares the card's 14; an image inset 8 px uses 6.

### 3.5 Shadows
Only four, all soft: `shadow-sm` (hover card), `shadow-md` (dropdown, popover, campus switcher), `shadow-lg` (modal, sheet, map overlay card), `shadow-pin` (map pins). Resting cards have **no** shadow — a hairline is the card. Dark mode shadows add a 1 px white-4% rim instead of relying on blur.

### 3.6 Borders
Hairline `1px line` is the default edge for cards, dividers, table rows. `line-strong` for inputs at rest and hovered cards. Focus: input border → `accent` plus the global focus ring. No 2 px decorative borders except the selected `SegmentedControl` thumb (which is a fill, not a border).

### 3.7 Motion
Durations `fast 120` (color/opacity), `base 180` (chips, dropdown, toggle), `slow 280` (modal, page section rise), `sheet 320`. Easing `ease-out cubic-bezier(.2,0,0,1)` for everything that appears, `ease-in-out` for things that move while visible, `ease-emphasis cubic-bezier(.3,1.2,.4,1)` only for the pin select pop. Movement ≤ 8 px translate, ≤ 1.08 scale. Keyframes: `fade-in`, `rise-in`, `sheet-up`, `pin-pop`, `shimmer`.
**Reduced motion:** `prefers-reduced-motion: reduce` zeroes all durations, keeps opacity fades, and Leaflet `flyTo` becomes `setView`.

### 3.8 Z-index
`base 0 · raised 10 (pins, card hover controls) · sticky 20 (filter bar, page header) · nav 30 (top nav, tab bar) · dropdown 40 · overlay 50 (scrim) · modal 60 (modal/sheet/drawer) · toast 70 · tooltip 80`. Use `z-layer-<name>`. Leaflet's own panes stay below 10 (set `.leaflet-container { z-index: 0 }`).

### 3.9 Breakpoints & containers
`sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1440`. Containers: `content 1200` (feeds, browse), `detail 1120` (detail pages), `reading 720` (text pages), `form 576` (wizards, auth). Mobile-first: below `md` is the mobile shell; `lg` and up is the desktop shell.

---

## 4. Signature elements

### 4.1 Listing Card (sublet)
```
┌───────────────────────────────┐  card: bg-surface, border line, rounded-card, overflow-hidden
│ [推广 Boosted]        ♡       │  photo 4:3, object-cover, bg-sunken while loading
│                               │  top-left: Boosted label (only if boosted) — §4.8
│          photo                │  top-right: save button 32px circle bg-surface/90 (no blur), icon heart
│                               │
│ ┏━━━━━━━━━━━━━┓               │  PRICE STUB: bg-inverse text-ink-inverse, text-price, px-10 py-4,
│ ┃ $1,250/mo   ┃               │  rounded-sm, overlaps photo bottom-left by 50% (margin-top -14px),
├─┻━━━━━━━━━━━━━┻───────────────┤  ml-12. This stub is the signature; nothing else in the UI looks like it.
│ 2B1B · 带家具 · 6/15–8/31     │  meta line 1: text-small text-ink-2, "·" separators (U+00B7 with spaces)
│ 1735 Chicago Ave, Evanston    │  title: text-body font-semibold text-ink, 1 line, truncate
│ 步行 8 分钟到校 · 校车 2 分钟  │  meta line 2: text-small text-ink-3, lucide "footprints" / "bus" 14px
│ ◉ 李同学  ✓学生认证           │  host row: Avatar xs with trust ring + name text-small + Badge L2 (§4.5)
└───────────────────────────────┘  padding 12 (sm) / 16 (lg); row gap 4
```
Sizes: grid cell min 260 px; photo height = width×3/4. Compact variant (`variant="row"`, used in map list and chat context card): photo 96×72 left, content right, no stub (price inline `text-price`).
States: rest — hairline, no shadow. hover (pointer only) — `border-line-strong`, `shadow-sm`, photo `scale(1.02)` over `duration-base`. focus-visible — global ring on the whole card (card is one `<a>`; inner buttons are siblings positioned absolute, not nested). pressed — `translateY(1px)`. paused/rented — photo `grayscale` + `opacity-70`, stub reads 「已出租」/ "Rented". skeleton — §5 Skeleton with stub-shaped block.
Nationwide scope adds a third meta line: `city, ST · 校区 Northwestern` in `text-small text-ink-3`.

### 4.2 Item Card (secondhand)
Same card chassis, **square** photo (1:1), price stub shows `$40` / `免费 Free` / `$40 OBO`. Below: title (1 line), condition chip (`九成新 / Like new`) + category as plain `text-small text-ink-3`, pickup distance 「离校 0.6 mi」. Sold state: stub becomes `bg-sunken text-ink-3` 「已售出 Sold」 with photo dimmed. "Move-out bundle" variant: 2×2 photo mosaic, stub 「打包 · 5 件」 and a `Badge` linking to the sublet.

### 4.3 Buddy Post Card
No photo. Left column 56 px: date block (`caption` month over `h3` day in `ink`, e.g. 11月 / 08), with type icon below (plane / car / dumbbell / shopping-cart / book). Right: title `body font-semibold`, time + place `small ink-2`, bottom row: stacked avatars (max 3, overlap −8 px, trust rings) + 「3/4 人」 count + `Chip` 「仅限已验证」 if verified-only. Join button is `Button secondary sm` at right, becomes 「已加入」 ghost when joined. Full card height 104–120 px. Event-today variant: left date block `bg-accent-soft text-accent-text-strong`.

### 4.4 Map Price Pin
```
   ┌──────────┐    pill: h-28, px-10, rounded-pill, text-small font-semibold tabular
   │ $1,250   │    rest:     bg-surface, text-ink, border 1.5px ink, shadow-pin
   └────┬─────┘    hover:    bg-inverse, text-ink-inverse, border inverse
        ▾          selected: bg-accent, text-on-accent, border accent, scale 1.08 (pin-pop), z-raised+1
                   visited:  text-ink-3, border line-strong (listing already opened this session)
                   saved:    small heart dot 8px bg-accent at top-right corner
                   boosted:  tiny up-right arrow before price (no color change — search integrity)
```
Tail: 6 px rotated square sharing the pin's background and border, centered, anchor at tail tip. Cluster: 36 px circle `bg-inverse text-ink-inverse` with count, `border 2px surface`; > 99 shows "99+". Non-listing layers on explore map: item pins are the same pill with `bg-sunken`; buddy events use the pill with a date 「11/08」; shuttle stops are 10 px circles `bg-surface border-2 ink` (route color = ink, selected route = accent).
Keyboard: pins are buttons in DOM order sorted by price; `Enter` selects, which scrolls the list to the card and highlights it with `border-accent`.

### 4.5 Verified Badge system (trust levels 0–3)
| Level | Shape (lucide) | Color | 中文 | English | Where |
|---|---|---|---|---|---|
| 0 | none inline; profile shows dashed `circle` 16 px `ink-4` | `ink-4` | 未验证 | Unverified | Profile + trust strip only |
| 1 | `circle-check` outline | `ink-2` | 邮箱已验证 | Email verified | Everywhere a user appears |
| 2 | `shield-check` filled | `accent` | 学生认证 | Student verified | Everywhere |
| 3 | `shield` filled + 4-point star glyph inside | `accent` | 完全认证 | Fully verified | Everywhere |
Inline size 14 px next to name (no label), card size 16 px with label (`caption`, `ink-2` for L1, `accent-text` for L2–3), profile size 20 px with label. Tooltip on hover/focus explains what was verified. Badges are never purchasable and never hidden behind a paywall; Pro landlords get a separate `Badge variant="pro"` 「房东 Pro」 in `ink` on `sunken`, which must never look like a trust badge.
Avatar trust ring (§5 Avatar): L0 none · L1 `line-strong` 2 px · L2 `accent-vivid` 2 px · L3 `accent-vivid` 2 px + 2 px gap + 1 px `accent-vivid` outer ring.

### 4.6 Trust Strip (detail pages)
A full-width `sunken` band directly under the gallery/hero, 56 px tall (`md`) / wraps on mobile, `rounded-card`. Contents left→right: Avatar `md` with ring → name + Badge with label → `small ink-2` facts separated by `·` (「加入 2024 年 9 月 · 回复率 96% · 通常 1 小时内回复」) → right: `Button secondary sm` 「查看档案」 and `ghost sm` 「举报」. If host is L0–1 the strip gains a `warning-soft` bottom border and one line 「尚未完成身份认证，请勿线下转账」 / "Identity not yet verified — never transfer money off-platform". Same strip for item sellers and buddy organizers (role word changes).

### 4.7 Empty States
Not illustrations. A **typographic** empty state: a single large lucide icon 40 px in `ink-4` set inside a 72 px `sunken` circle, then `h3` title, one `body ink-2` sentence, one primary or secondary button. Max width 360, centered, padding 48 vertical. Title is a fact plus a nudge: 「这里还没有房源」 / "No listings here yet" → 「换个校区看看，或者第一个发布。」. For nationwide searches the button is 「切换到全美」. Never say "Oops". Loading never shows an empty state — skeleton first, then empty or data.

### 4.8 Boosted / Sponsored labels
- **Boosted** (paid placement by a user): `Badge` with `bg-accent-soft text-accent-text-strong border accent-soft-line`, 12 px `arrow-up-right` icon, text 「推广」/ "Boosted". Top-left of the card photo at 8 px inset; in row/list variants inline before the title. On map pins: arrow glyph only.
- **Sponsored** (partner, e.g. Newcomer Kit): `Badge` with `bg-sunken text-ink-2 border line`, text 「赞助」/ "Sponsored", no icon.
- Rules: visible at all sizes and states, never removed on hover, never gold/gradient/"premium" styling, never changes ranking of unpaid cards beyond the documented slots (DATA_MODEL §8: 2 sponsored slots per 10 results at positions 1 and 6; an 8-card block gets 1). A long-press/hover tooltip explains 「推广房源由发布者付费置顶，审核标准相同。」.

### 4.9 Chat bubble + context card
Bubbles: max-width 72% (`md`) / 85% (mobile), `rounded-card` with the corner nearest the sender's avatar at `rounded-sm` (tail by geometry, no SVG tail). Mine: `bg-inverse text-ink-inverse`. Theirs: `bg-surface border line text-ink`. Timestamps `caption ink-3` shown on group boundaries (> 5 min) and on tap. Read receipt: two 12 px checks in `ink-3` → `accent-text` when read. Images: `rounded-sm` inside bubble, max 240 px. System messages (scam warning, joined group) are centered `small ink-2` on `sunken` pills.
**Context card** pinned at top of a thread (and sent as the first message when a thread starts from a listing/item/post): `variant="row"` card from §4.1/4.2/4.3 with price inline and a `Button ghost sm` 「查看」. Stays sticky under the thread header at `z-sticky`.
**Scam-warning banner** on first message: `warning-soft` background, `warning` icon `triangle-alert`, 2 lines max, dismissible, cannot be disabled by payment.

### 4.10 Campus Switcher
Header pill: `h-36 px-12 rounded-pill bg-sunken text-ink border line` → `map-pin` 16 px + campus short name (`Northwestern`, `UIUC`, `NYU`; `全美 / Nationwide` with `globe` icon) + `chevron-down`. Hover `border-line-strong`. On `md` and below only the icon + short name; on `sm` the pill moves into the mobile top bar at left.
Popover (desktop, `w-360 shadow-md rounded-card z-dropdown`) / bottom Sheet (mobile): search input autofocused 「搜索学校或城市 / Search school or city」 → first row **全美 Nationwide** (globe, description 「跨城市搜索转租」) → 「最近 Recent」 (up to 3) → full list grouped by state (A–Z), each row: school name (zh + en on two lines when `lang=zh`: 西北大学 / Northwestern University), `small ink-3` city, ST; selected row has `check` icon in `accent-text`. Keyboard: ↑↓ navigate, Enter select, Esc close. Selecting updates the cookie `campus`, the URL (`?campus=`) and the header pill with a `fade-in`. Page toasts 「已切换到 UIUC」. Nationwide is only offered where it makes sense (sublets, wanted); on buddy/shuttle the row is disabled with 「仅限校区」 hint; on market it is allowed but switches the list to 可邮寄 (delivery) items only (DATA_MODEL §9.1).

---

## 5. Component inventory

Path: `web/src/components/<Name>.tsx`. Every component: accepts `className`, forwards `ref`, supports `data-state`. Icons are `lucide-react` at 16/18/20 px with `stroke-width 1.75`.

| Component | Props | Variants / notes |
|---|---|---|
| **Button** | `variant: 'primary' \| 'secondary' \| 'ghost' \| 'danger'`, `size: 'sm' \| 'md' \| 'lg'`, `iconLeft`, `iconRight`, `iconOnly` (requires `aria-label`), `loading`, `disabled`, `asChild`, `fullWidth` | primary: `bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-active`; secondary: `bg-surface border line-strong text-ink hover:bg-sunken`; ghost: transparent, `text-ink-2 hover:bg-sunken hover:text-ink`; danger: `bg-danger text-on-danger` (confirm dialogs only; in menus use `text-danger` ghost). Heights 32/40/48, radius `ctl`, font 13/15/16 weight 600. Loading swaps icon for 16 px spinner, keeps width. Disabled `opacity-50 cursor-not-allowed`. Min touch target 44 on mobile (`sm` gets invisible padding). |
| **Input** | `size`, `label`, `hint`, `error`, `prefix` (e.g. `$`), `suffix` (`/mo`), `iconLeft`, `clearable`, `type` | `h-40 px-12 rounded-ctl bg-surface border line-strong text-body`, placeholder `ink-3`; focus `border-accent` + ring; error `border-danger` + `small text-danger` message with `circle-alert`. Label `caption ink-2` above, hint `small ink-3` below. Mobile font 16. |
| **Textarea** | same as Input + `rows`, `maxLength`, `showCount` | auto-grow to 8 rows; counter `caption ink-3` bottom-right 「120/500」 |
| **Select** | `options: {value,label,description?,icon?}[]`, `value`, `placeholder`, `searchable`, `size`, `error` | native `<select>` on mobile when not searchable; custom listbox (`shadow-md rounded-card`) on desktop; keyboard: type-ahead |
| **Checkbox** | `checked`, `indeterminate`, `label`, `description` | 18 px box `rounded-xs border line-strong`; checked `bg-accent` white check; 44 px row hit area |
| **Switch** | `checked`, `label`, `size: 'sm' \| 'md'` | track 36×20 `bg-line-strong` → `bg-accent`; thumb 16 `bg-white shadow-sm`; `duration-base` |
| **DateRange** | `value: {start,end}`, `min`, `max`, `presets` (「整个暑假」「秋季学期」), `locale` | two inputs + popover calendar (desktop) / sheet (mobile); range fill `accent-soft`, ends `bg-accent text-on-accent rounded-pill`; week starts Monday for zh, Sunday for en |
| **PriceRange** | `value: [min,max]`, `bounds`, `step`, `histogram?: number[]`, `unit: '/mo' \| ''` | dual slider: track `line`, range `accent`, thumbs 20 px `bg-surface border-2 accent shadow-sm`; optional 24-bar histogram above in `line-strong` (in-range bars `accent`); two inputs below with `$` prefix |
| **Chip** | `variant: 'default' \| 'accent' \| 'inverse'`, `size: 'sm' \| 'md'`, `icon`, `onRemove` | pill, `h-28/32`, `bg-sunken text-ink-2`; accent `bg-accent-soft text-accent-text-strong border accent-soft-line`; inverse `bg-inverse text-ink-inverse`. Used for conditions, tags, categories. |
| **FilterChip** | `selected`, `count?`, `icon`, `onClick`, `menu?` (opens popover) | toggle chip: rest `bg-surface border line-strong`; selected `bg-inverse text-ink-inverse border-inverse`; with menu shows `chevron-down`; `aria-pressed` |
| **Card** | `as`, `interactive`, `padding: 'none' \| 'sm' \| 'md' \| 'lg'`, `variant: 'default' \| 'sunken' \| 'outline-accent'` | chassis of §4.1–4.3; `interactive` adds hover/pressed/focus; `outline-accent` only for "selected on map" |
| **Badge** | `variant: 'neutral' \| 'accent' \| 'success' \| 'warning' \| 'danger' \| 'info' \| 'boosted' \| 'sponsored' \| 'pro'`, `icon`, `size: 'sm' \| 'md'` | 22 px, `rounded-sm`, `caption`; soft bg + strong text per semantic pair |
| **TrustBadge** | `level: 0 \| 1 \| 2 \| 3`, `size: 'inline' \| 'card' \| 'profile'`, `showLabel` | §4.5; always `title` + `aria-label` |
| **Tabs** | `items: {key,label,count?,icon?}[]`, `value`, `onChange`, `variant: 'underline' \| 'pill'`, `scrollable` | underline: `h-44`, text `ink-2`, selected `ink` + 2 px `accent` underline sliding (`duration-base`); pill variant = SegmentedControl look for ≤ 3 items; `role=tablist`, arrow keys |
| **Modal** | `open`, `onClose`, `title`, `description`, `size: 'sm' \| 'md' \| 'lg'`, `footer`, `dismissible`, `initialFocus` | 420/560/760, `rounded-card shadow-lg bg-surface p-24`, `rise-in`; scrim `overlay`; focus trap, Esc, return focus; on `< md` automatically renders as **Sheet** |
| **Sheet** | `open`, `onClose`, `title`, `snap: 'half' \| 'full'`, `handle` | bottom sheet, `rounded-t-card`, 36×4 handle `line-strong`, max-height 88dvh, `sheet-up`, drag-to-dismiss, safe-area padding |
| **Toast** | `variant: 'info' \| 'success' \| 'error'`, `title`, `description?`, `action?: {label,onClick}`, `duration` | bottom-center mobile / bottom-right desktop, `bg-inverse text-ink-inverse rounded-card shadow-lg`, 360 wide, icon in semantic color (dark variants), `role=status` (error: `role=alert`), max 3 stacked, pause on hover |
| **Avatar** | `src`, `name` (initials fallback, 2 chars; CJK uses last char), `size: xs\|sm\|md\|lg\|xl` (24/32/40/56/88), `trustLevel`, `status?: 'online'` | circle, `bg-sunken text-ink-2` initials; trust ring per §4.5 via `box-shadow` so it doesn't change layout |
| **Skeleton** | `variant: 'text' \| 'rect' \| 'circle' \| 'listing-card' \| 'item-card' \| 'buddy-card' \| 'row'`, `lines`, `width`, `height` | `skeleton` utility (shimmer); card presets mirror real card anatomy incl. a stub-shaped block; `aria-busy` on the container, `aria-hidden` on skeletons |
| **EmptyState** | `icon`, `title`, `description`, `action?`, `secondaryAction?`, `size: 'sm' \| 'md'` | §4.7 |
| **PageHeader** | `title`, `subtitle?`, `breadcrumb?`, `actions?`, `tabs?`, `back?` (mobile) | `h1`, `pb-16`, hairline below when `tabs` absent; sticky on mobile with `back` chevron |
| **FilterBar** | `chips: FilterChip[]`, `sort`, `resultCount`, `onReset`, `sticky`, `scopeToggle?` (校区 / 全美) | horizontally scrollable chip row with fade edges, `h-56`, `bg-paper/95` (no blur) sticky at `z-sticky`; right: result count `small ink-2` + `Select` sort; 「重置」 ghost appears when any chip selected |
| **PhotoGallery** | `photos: {src,alt}[]`, `layout: 'hero' \| 'grid'`, `onOpen` | detail hero: 1 large + 4 small (`rounded-lg` outer), 「查看全部 12 张」 button; mobile: swipeable 4:3 with dots; lightbox `Modal lg` with arrows and counter |
| **PhotoUploader** | `files`, `max` (10), `onChange`, `onReorder`, `accept`, `maxSizeMB` | dashed `line-strong` drop zone `rounded-card` with `image-plus` icon; thumbnails 96 px `rounded-sm` draggable; first thumb marked 「封面」; progress bar `accent` 2 px; errors inline per file |
| **Pagination** | `page`, `pageSize`, `total`, `onChange`, `variant: 'numbers' \| 'loadMore'` | numbers on desktop (ghost buttons, current `bg-inverse`), 「加载更多」 secondary button on mobile; announces page change |
| **Tooltip** | `content`, `side`, `delay` (400) | `bg-inverse text-ink-inverse caption rounded-sm px-8 py-6 z-layer-tooltip`, no arrow; shown on hover and focus; never holds essential info |
| **DropdownMenu** | `trigger`, `items: {label,icon?,shortcut?,danger?,disabled?,onSelect}[] \| separators`, `align` | `shadow-md rounded-card bg-surface p-4 min-w-200`, item `h-36 rounded-sm hover:bg-sunken`, danger item `text-danger`; typeahead + arrows; on mobile becomes Sheet |
| **SegmentedControl** | `options: {value,label,icon?}[]`, `value`, `size: 'sm' \| 'md'` | `bg-sunken rounded-ctl p-2`, thumb `bg-surface shadow-sm rounded-sm` sliding (`duration-base`); used for 地图/列表, 周/月, zh/EN |
| **StatTile** (admin) | `label`, `value`, `delta?: {value, direction}`, `spark?: number[]`, `hint?`, `format: 'number' \| 'money' \| 'percent'` | `Card` with `caption ink-2` label, `price-lg` value tabular, delta `small` in `success`/`danger` with arrow, 56×20 sparkline in `ink-3` (`accent` when selected) |
| **Table** (admin) | `columns: {key,header,width?,align?,sortable?,render?}[]`, `rows`, `rowKey`, `selectable`, `onSort`, `loading`, `empty`, `stickyHeader`, `rowActions` | header `sunken caption ink-2 h-40`, rows `h-52` hairline, hover `bg-sunken/60`, numeric right-aligned tabular; `< md` collapses to stacked cards |

Shared behaviors: all overlays close on Esc and outside click, trap focus, and restore focus. All lists support `loading` → Skeleton, `error` → inline retry, `empty` → EmptyState. All icon-only controls have `aria-label` and a Tooltip.

---

## 6. Layout & navigation

### 6.1 Desktop app shell (`lg` and up)
```
┌──────────────────────────────────────────────────────────────────────────────┐ h-64, bg-surface, border-b line, z-nav, sticky
│ [mark 安窝 Anwo]  (⌖ Northwestern ▾)   [ 🔍 搜索房源、物品、搭子…          ]   │
│                                              [+ 发布]  中/EN  🔔(3)  (avatar) │
└──────────────────────────────────────────────────────────────────────────────┘
   logo 132 → gap 16 → CampusSwitcher pill → search `max-w-520 flex-1 mx-24` (Input md, icon-left, ⌘K)
   → Post button (Button primary md, icon plus) → language SegmentedControl sm (中 / EN) → bell (ghost icon-only, count badge 16 px bg-accent)
   → Avatar sm with trust ring (DropdownMenu: 我的档案 / 我的发布 / 收藏 / 钱包 / 设置 / 退出)
```
Secondary nav lives in the page, not the shell: a `Tabs underline` row under the header on browse pages (转租 · 求租 · 二手 · 搭子 · 校车 · 地图).
Content width `max-w-content` (1200) with `px-32`; detail pages `max-w-detail`; wizards/auth `max-w-form`.

### 6.2 Mobile shell (`< md`)
Top bar `h-56 bg-surface border-b line`: left CampusSwitcher (icon + short name) or back chevron on sub-pages; center page title (`h3`); right: search icon + bell.
Bottom tab bar `h-60 + safe-area`, `bg-surface border-t line z-nav`, 5 tabs, icon 24 + `caption` label:
```
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│  ⌂ 首页  │  ⌖ 地图  │  (+) 发布 │  ◌ 消息 ③ │  ◯ 我的  │
│   Home   │   Map    │   Post   │   Chat   │    Me    │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```
Active tab: icon `fill` + `text-ink`; inactive `text-ink-3`. The middle **发布** tab is a 44 px `bg-accent rounded-pill` circle with white `plus`, raised 6 px — the one accent in the shell. Tapping it opens the Post sheet (§6.4), not a page. Unread count on 消息 as 16 px `bg-accent` badge.

### 6.3 Content widths & grid
- Card grids: 1 col `< sm`, 2 `sm`, 3 `lg`, 4 `xl`; gap 12 / 20. Row variant lists: single column, hairline separated.
- Browse with map (`lg`+): list `w-560` (`xl` 640) scrollable + map fills the rest, min 480. Below `lg`: SegmentedControl 地图/列表 in the FilterBar switches full-screen views; map view shows a horizontally swipeable row-card carousel over the bottom of the map (`shadow-lg`).
- Detail: 2 columns `lg`+ — main `flex-1` + sticky right rail `w-360` (price card + CTA). Mobile: rail becomes a sticky bottom bar `h-64` with price + 「联系房东」 primary button.
- Vertical rhythm: sections separated by 48 (desktop) / 32 (mobile), `h2` + optional 「查看全部 →」 ghost link right-aligned.

### 6.4 Post flow entry
Tapping 发布 (any shell) opens a **Sheet** (mobile) / **Modal sm** (desktop) titled 「你要发布什么？」 / "What are you posting?" with four large option rows (`h-64`, icon 24 in `sunken` circle, title + `small ink-2` description, chevron):
```
┌─────────────────────────────────────┐
│ 你要发布什么？                   ✕  │
│ ┌─────────────────────────────────┐ │
│ │ ⌂  转租 Sublet                  │ │ 我有房要转租 / 出租
│ │ ◎  求租 Wanted                  │ │ 我在找房
│ │ ▣  二手 Item                    │ │ 出售或免费送
│ │ ☺  搭子 Buddy                   │ │ 找人一起：接机、拼车、学习…
│ └─────────────────────────────────┘ │
│ 当前校区：Northwestern  更改         │ caption ink-3 footer; Nationwide not allowed here — a post belongs to a campus
└─────────────────────────────────────┘
```
Unverified (L0) users see the same sheet; choosing an option routes to the verification nudge first (《发布前请先验证 .edu 邮箱》), never a dead end.

---

## 7. Page blueprints

Notation: `[ ]` button, `( )` chip/pill, `▣` photo, `…` truncated, `» ` link. Mobile is the same content stacked in one column unless noted. All page titles in `h1`; section titles `h2`.

### 7.1 Home `/`
```
┌ shell ───────────────────────────────────────────────────────────────┐
│ h1  Northwestern 的本周                        (全美 Nationwide ↗ ghost)│  "本周" = this week; subtitle small ink-2: 「246 条房源 · 58 个求租 · 112 件二手」
│ [🔍 搜索房源、地址、物品…                 ]  (6/15–8/31) ($ ≤ 1,500) │  search + 2 quick chips, FilterBar not sticky here
│                                                                       │
│ h2 热门房源 Hot sublets                               » 全部房源 →     │
│ ▣ListingCard  ▣ListingCard  ▣ListingCard  ▣ListingCard                │  4 cols xl, 1 sponsored slot (position 1, `max` tier only, DATA_MODEL §8); mobile: horizontal scroll, cards w-260
│ ▣ListingCard  ▣ListingCard  ▣ListingCard  ▣ListingCard                │
│                                                                       │
│ h2 求租速配 Wanted · quick match                      » 全部求租 →     │
│ ┌ row ──────────────┐ ┌ row ──────────────┐ ┌ row ──────────────┐     │  WantedCard row variant: budget stub `$900–1,200`, dates, "2 人", avatar; host sees [我有房 →] secondary sm
│ └───────────────────┘ └───────────────────┘ └───────────────────┘     │
│                                                                       │
│ h2 二手好物 Secondhand finds                          » 逛逛市场 →     │
│ ▣Item ▣Item ▣Item ▣Item ▣Item ▣Item                                  │  6 cols xl square cards (smaller: min 180); mobile 2 cols
│                                                                       │
│ h2 本周搭子 Buddies this week                         » 所有搭子 →     │
│ ┌BuddyCard┐ ┌BuddyCard┐ ┌BuddyCard┐                                    │  3 cols, upcoming-first
│                                                                       │
│ ┌ 新生礼包 Newcomer Kit ─────────────────────────── (赞助 Sponsored) ┐ │  partner strip: Card sunken, logo-less text tiles: 银行 · SIM · 租房保险 · 搬家 · 接机
│ │ 🏦 开户  📱 手机卡  🛡 租房保险  🚚 搬家  ✈ 接机      » 全部 →      │ │  each tile = ghost button w/ icon; tracked outbound. Label visible, per §4.8
│ └─────────────────────────────────────────────────────────────────────┘ │
│ footer: 安窝 Anwo · 关于 · 安全指南 · 隐私 · 中/EN · © 2026              │
└───────────────────────────────────────────────────────────────────────┘
```
Rules: no hero banner; first paint is listings. Campus name in the title comes from `useCampus()`. If the campus has < 4 listings, 热门房源 shows what exists plus one EmptyState-sized "招募" card 「成为第一个发布的人」.

### 7.2 Listings browse `/listings`
```
┌ PageHeader: h1 转租房源            (校区 Northwestern | 全美 Nationwide) SegmentedControl ┐
│ FilterBar (sticky): (日期 ▾)(价格 ▾)(户型 ▾)(带家具)(近校车)(允许宠物)(更多筛选 ▾)   246 条 · 排序: 最新 ▾  [地图|列表] │
├──────────────────────────────────────┬──────────────────────────────────────────┤
│ list w-560                           │ map                                      │
│ ▣ListingCard  ▣ListingCard           │     ($1,250)        ($980)               │
│ ▣ListingCard  ▣ListingCard           │           ($1,400)      [12]             │  cluster
│ …                                    │   ($1,100)         ⌖ campus marker       │  campus marker = mark icon 28px on surface plate
│ Pagination                           │  ┌ 在此区域搜索 ┐ (secondary sm, top-center, appears after pan)
│                                      │  └──────────────┘  [⊕][⊖]  [⌖ 定位]     │
└──────────────────────────────────────┴──────────────────────────────────────────┘
```
- Nationwide mode: FilterBar gains a city/campus Input (「城市或学校」, geocoded) + radius Select (5/10/25 mi); cards show city line; map starts at US extent with clusters per metro; the list sort defaults to 「最新 Recent」. Campus mode: map starts at campus bounds; sort default is also 「最新 Recent」 (`recent`; sponsored slots are inserted by the server per DATA_MODEL §8, never by a sort key). Sort options map 1:1 to API sort keys: 最新 `recent` · 价格 `price_asc` / `price_desc` · 距离 `distance` · 入住日期 `date`.
- Hover card ↔ pin hover is bidirectional. Selected pin scrolls list.
- Mobile: full-screen list by default; 「地图」 in SegmentedControl swaps to full map with bottom carousel; filters open a Sheet with all controls + sticky 「显示 246 条」 primary button.

### 7.3 Listing detail `/listings/:id`
```
┌ breadcrumb: 转租 › Northwestern › 1735 Chicago Ave                     [分享][♡ 收藏][举报] ghost │
│ PhotoGallery hero: ▣ big (2/3)  ▣▣ small                                [查看全部 12 张]        │
│ h1 1735 Chicago Ave 2B1B 整租                       小 ink-2: Evanston, IL · 步行 8 分钟到校 · 校车 Noyes 站 2 分钟 │
│ (带家具)(含水电)(允许宠物)(有车位)(仅限女生)  chips                                                 │
│ TrustStrip  ◉ 李同学 ✓学生认证 · 加入 2024 年 9 月 · 回复率 96% · 通常 1 小时内回复   [查看档案][举报] │
├───────────────────────────────────────────────┬─────────────────────────────────────────────┐
│ h3 房源信息       2 室 · 1 卫 · 850 sqft · 整租 │ sticky rail Card:                           │
│ body-lg 描述…                                  │   price-lg $1,250 /mo   small ink-3 押金 $1,250 │
│ h3 可租时间   calendar strip 6/15 – 8/31 (accent)│   小 ink-2 6 月 15 日 – 8 月 31 日 · 2.5 个月 │
│ h3 设施      icon grid 2×n (wifi, laundry …)    │   [联系房东 Message host] primary lg fullWidth │
│ h3 位置      MapView 320h, pin + campus + stops │   [安全支付押金 Secure deposit] secondary     │
│              小 ink-2 「距 Tech 1.1 mi · Noyes 站 0.2 mi」 │   小 ink-3 「服务费 3% · 托管至入住后 48 小时」 │
│ h3 室友 / 偏好  avatars + text                   │   divider                                   │
│ h3 搬离甩卖  ItemCard ×3 (if bundle linked)      │   small 浏览 312 · 联系 14 · 已发布 3 天     │
│ h2 附近相似房源  ▣▣▣                              │   (Boosted owner sees [推广此房源] ghost)   │
└───────────────────────────────────────────────┴─────────────────────────────────────────────┘
mobile: rail → sticky bottom bar [$1,250/mo ……… 联系房东]
```
Owner view swaps the rail for an owner panel: status Switch 暂停/上线, 「标记已出租」, stats, 「编辑」, 「推广」.

### 7.4 Post listing wizard `/post/listing` (max-w-form; 5 steps; progress as `caption` 「第 2 步 / 共 5 步」 + 2 px accent bar)
```
Step 1 位置 Location    Input 地址 (autocomplete via geocode proxy) → MapView 240h w/ draggable pin 「拖动微调」 → Select 校区 (auto-suggested, editable, shows distance) 
Step 2 房源 Home        户型 Select · 整租/单间 SegmentedControl · 面积 · 带家具 Switch · 水电 Select · 租约类型 · 设施 Checkbox grid
Step 3 时间与价格       DateRange (presets 整个暑假 / 秋季学期) · PriceRange single input $ /mo · 押金 · 最短租期
Step 4 室友与规则       现有室友人数 · 性别偏好 · 宠物 · 车位 · 描述 Textarea (one field; 中文, English or both; 5000 max)
Step 5 照片与发布       PhotoUploader (1–10, first = cover) · Preview ListingCard live on the right (lg+) · [发布 Publish] primary lg
```
Footer: `[上一步]` ghost left, `[下一步]` primary right, both sticky on mobile. Autosaves draft to localStorage; 「草稿已保存 ✓」 `caption ink-3`. Validation inline on blur; step cannot advance with errors; errors list at top on submit. After publish: success Modal with the card and `[推广房源 $x]` secondary + `[查看房源]` primary — the upsell is after the free action, never blocking it.

### 7.5 Wanted browse `/wanted` & detail `/wanted/:id`
Browse: same FilterBar (预算 / 日期 / 人数 / 区域) over a **row list** (no map by default; 「地图」 toggles areas as shaded circles). WantedCard row: left budget stub `$900–1,200`, title 「2 人找 2B 秋季学期」, dates, areas as chips, avatar + badge, right `[我有房 Offer my place]` secondary sm (hosts) or `[聊聊]`.
Detail: `max-w-reading`; h1 title; facts grid (预算 / 日期 / 人数 / 区域 / 必须有); description; TrustStrip for the requester; right rail (lg) 「为你匹配的房源 Matches」 — top 3 ListingCards row variant with match score as `Badge accent` 「匹配 92%」, 「查看全部匹配」; CTA `[我有房 →]` opens chat with the host's chosen listing as context card. Requester sees 「为你推荐」 panel + 「每日摘要」 Switch (placeholder digest).

### 7.6 Chat `/chat`, `/chat/:threadId`
```
┌ list w-360 (lg) ────────────┬ thread ──────────────────────────────────────────────┐
│ h2 消息   [🔍]              │ header: ◉ 李同学 ✓  在线 · 1735 Chicago Ave   [⋯ 屏蔽/举报] │
│ Tabs: 全部 · 未读 · 群组     │ context card (sticky)  ▣ 1735 Chicago Ave 2B1B  $1,250/mo [查看] │
│ ┌ row: ◉ 李同学 ✓  2m ●   ┐ │ ─ 警告 banner: 「请勿线下转账…」 warning-soft (first message only) │
│ │ 房子还在吗？            │ │          ┌ theirs ─────────────┐                               │
│ └──────────────────────────┘ │          │ 房子还在，6/15 可以入住 │ 14:02                        │
│ ┌ row: 🛫 周六接机 (4) 1h  ┐ │          └──────────────────────┘                               │
│ │ 王: 我到了航站楼 B      │ │                               ┌ mine ─────────────┐             │
│ └──────────────────────────┘ │                               │ 好的，我周五可以看房吗？│ ✓✓     │
│ …                            │                               └────────────────────┘             │
│                              │ (typing… `small ink-3`)                                           │
│                              │ composer: [📷] [Textarea auto-grow …………………………………] [发送 primary icon] │
└──────────────────────────────┴───────────────────────────────────────────────────────────────┘
mobile: list page → thread page (back chevron); composer sticky above safe-area; tab bar hidden on thread page
```
Offline/polling fallback shows a `info-soft` pill 「连接中…」 top-center. Message search is in the thread header `[🔍]`; results highlight with `accent-soft` background.

### 7.7 Verification center `/verify`
```
h1 身份验证            small ink-2 「完成验证，解锁托管支付与更高曝光」
┌ ladder Card ─────────────────────────────────────────────────────────┐
│ ● L1 邮箱验证 .edu          已完成 ✓        (success)                │
│ ○ L2 学生证 / 证件审核      审核中 · 预计 24 小时内    [查看]        │  current step expanded below
│ ○ L3 手机 + 支付方式        未开始                     [开始]        │
└──────────────────────────────────────────────────────────────────────┘
expanded L2: PhotoUploader (1–2 张, 「学生证或护照首页」) · 小 ink-3 隐私说明 · [提交审核] primary
expanded L1: Input 邮箱 + [发送验证码] → 6-cell mono code input (dev mailbox link 「打开开发邮箱」 caption) 
right rail (lg): 「你的徽章」 TrustBadge profile size + what each level unlocks (bullets) · 「仅接受已验证用户私信」 Switch
```
Status language: 审核中 / 已通过 / 未通过（原因：照片模糊）; rejection shows `danger-soft` note and `[重新提交]`.

### 7.8 Trust profile `/u/:id`
`max-w-reading`. Header: Avatar xl with ring, name `h1`, TrustBadge profile with label, `small ink-2` 「Northwestern · 加入 2024 年 9 月」; stats row 3 StatTile-lite (回复率 / 成交 / 搭子). Tabs: 在租房源 · 二手 · 搭子. (There is no reviews / ratings system; trust comes from verification, not stars.) Actions: `[发消息]` primary, `[举报]` ghost. Verification log (public part): 「邮箱 ✓ 2024-09」「学生证 ✓ 2025-01」. Own profile adds `[编辑]` and the unverified banner 「完成验证后你的发布曝光提升 2×」.

### 7.9 Map explore `/map`
Full-bleed map under the shell (height `100dvh − nav`). Floating top-left Card (`shadow-lg`, w-320, `lg`+): search Input + layer FilterChips 「转租 · 二手 · 搭子 · 校车 · 校园地点」 (multi-select, each layer has its pin style from §4.4). Bottom (mobile) / left rail (desktop): results carousel of the visible layer's row cards. Clicking a campus POI shows a small popover with name/type/hours. Commute tool: `[到校通勤]` opens a popover: walk / bike / shuttle estimates for the selected listing as three `Chip`s with minutes. Controls bottom-right: zoom, locate, `[画圈搜索]` draw tool (draws a polygon in `accent` 2 px with 10 % fill).

### 7.10 Shuttle `/shuttle`
```
alert banner (admin-editable): info-soft 「Intercampus 线今晚 10 点后停运」  (dismissible per alert id)
PageHeader h1 校车 · Northwestern              [官方实时追踪 ↗] secondary sm
Tabs: 路线 Routes · 站点 Stops · 收藏
┌ routes list w-360 ──────────┬ map ─────────────────────────┐
│ ━ Intercampus   每 10 min  │   polylines ink 3px;         │  selected route accent 4px; stops 10px circles
│ ━ Frostbite     每 15 min  │   stops; listing pins hidden │
│ ━ Ryan Field    赛事日     │                              │
├ selected route ────────────┤                              │
│ timetable: Table small;    │                              │
│ next departures at ⌖ Noyes:│                              │
│   3 min · 13 min · 23 min  │  (price-lg accent-vivid for first)
└────────────────────────────┴──────────────────────────────┘
no data campus: EmptyState 「还没有 UIUC 的校车数据」 + [申请添加我的校区] primary → form (campus, link to official schedule, email)
```

### 7.11 Market browse `/market` & detail `/market/:id`
Browse: category Tabs (scrollable: 全部 · 家具 · 电子 · 课本 · 厨房 · 自行车 · 搬离打包 · 免费) + FilterBar (价格 / 成色 / 距离 / 仅免费). Grid of square ItemCards (6 cols xl). Map toggle shows pickup pins (sunken pills). Detail: gallery (1:1 hero), `h1` title, price-lg with 「可议价 OBO」 chip, condition + category chips, description, 「取货地点」 MapView 240h with approximate circle (not exact pin — privacy), TrustStrip (seller), rail: `[通过聊天购买 Buy via chat]` primary, `[加入心愿单]` secondary, `small ink-3` 「相似物品均价 $45」 (price suggestion), 「来自搬离甩卖」 link card to the sublet when bundled. Sold state: everything dimmed, stub 「已售出」, CTA replaced with 「看看相似物品」.

### 7.12 Buddy browse `/buddy` & detail `/buddy/:id`
Browse: type Tabs (全部 · 接机/拼车 · 室友 · 学习 · 健身 · 吃饭 · 旅行 · Costco · 活动) + FilterBar (日期 / 时间段 / 地点 / 语言 / 仅限已验证) + SegmentedControl 列表 / 日历. Calendar view: month grid with `caption` dots per day; day tap lists cards. BuddyCards in 3 cols. Detail: `max-w-reading`; date block large (left), `h1` title, when/where facts, description, members row (avatars with rings, `n/N 人`), safety rules Card `sunken` (fixed 4 bullets, always visible), organizer TrustStrip, CTA `[加入 → 进入群聊]` primary (disabled with hint when verified-only and user trust < post.minTrustLevel), `[分享]`. 「我的搭子」 at `/buddy/mine`: upcoming / past Tabs.

### 7.13 Pricing `/pricing`
```
display 「免费发布，按需加速。」  small ink-2 「所有安全功能永久免费。」
Tabs pill: 学生 · 房东
┌ 3 Cards ─────────────────┬──────────────────────────┬──────────────────────────┐
│ h3 推广 Boost             │ h3 房东 Pro (outline-accent)│ h3 安全支付 Secure deposit │
│ price-lg $4.99 / 3 天     │ price-lg $29 / 月          │ price-lg 服务费 3%          │
│ ✓ 置顶首页与搜索          │ ✓ 不限房源数量              │ ✓ 押金托管至入住 48 小时后   │
│ ✓ 标注「推广」            │ ✓ 数据分析与线索收件箱       │ ✓ 争议处理                   │
│ [推广我的发布] primary    │ [开通 Pro] primary          │ [了解流程] secondary          │
└──────────────────────────┴───────────────────────────┴──────────────────────────┘
Boost tiers inline SegmentedControl: 3 天 $4.99 · 7 天 $9.99 · 14 天 $16.99; FAQ accordion (hairline rows); mock checkout Modal with a `warning-soft` top band 「测试模式 Test mode · 不会真实扣款」; promo code Input; referral credits balance `Badge neutral` 「余额 $10」.
```
Only one card is `outline-accent` (Pro on 房东 tab, Boost on 学生 tab). No "most popular" ribbons.

### 7.14 Newcomer Kit `/kit`
`max-w-content`. h1 「新生礼包 Newcomer Kit」 + `Badge sponsored` beside the title + one-sentence disclosure 「我们可能从合作伙伴获得佣金，不影响你的价格。」. Sections as `h2` (开户 · 手机卡 · 租房保险 · 搬家与仓储 · 接机): each a 3-col grid of partner Cards: partner name `h3` (text, no logos required), 2-line `small ink-2` pitch, perk `Chip accent` 「新生 $50 奖励」, `[前往 ↗]` secondary (tracked outbound), `caption ink-3` 「赞助」 inside every card. Left rail (lg): checklist 「落地第一周」 with Checkbox items persisted in `localStorage` (per device; no server state).

### 7.15 Admin dashboard `/admin`
```
admin shell: left rail w-240 (bg-surface border-r): 总览 · 验证队列 (12) · 举报 (3) · 用户 · 房源审核 · 校车提醒 · 营收 · 功能开关
h1 总览   DateRange (preset 7 天 / 30 天)   CampusSwitcher (adds 「全部校区」 option)
StatTile ×6: DAU · WAU · 新房源 · 匹配数 · GMV · 推广收入   (grid 6 → 3 → 2)
Card: 营收 line chart (ink line, accent for selected series; no fills)   Card: 漏斗 (浏览 → 联系 → 聊天 → 成交) horizontal bars `line-strong`, current `accent`
Table: 最近事件 (time · user · type · entity)   Table: 联盟点击 by partner
```
Verification queue: Table with row click → side Drawer (`Modal lg` on desktop as right panel 560 wide) showing uploads at full size, user facts, `[通过]` primary / `[拒绝]` danger with reason Select + Textarea. Moderation: same pattern. Feature flags: Table with Switch per row.

### 7.16 Campus onboarding (first visit) `/welcome`
```
┌ centered panel max-w-form, rounded-lg, bg-surface, p-32 (full-screen on mobile) ───┐
│ [mark]  display 「你在哪所学校？」 / "Which campus are you at?"                      │
│ small ink-2 「我们会优先展示你学校附近的房源、二手和搭子。随时可以切换。」            │
│ [🔍 搜索学校或城市 ……………………………………………………]  (autofocus)                          │
│ 推荐（基于定位 / 邮箱域名）: (Northwestern) (UIUC) (NYU)   chips                     │
│ list grouped by state … rows: 西北大学 Northwestern University · Evanston, IL  ›     │
│ ───────────────────────────────────────────────────────────────                     │
│ » 我在全美找转租 (Nationwide)      [继续 Continue] primary (enabled after choice)     │
│ footer caption: 中 / EN toggle                                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```
Shown once (cookie `campus` empty). If the user signs in with a `.edu` domain that maps to a campus, the step is pre-selected and the primary reads 「就是这里 That's me」.

---

## 8. Bilingual typography & microcopy

**Tone.** Friendly, precise, short. One sentence does one thing. No exclamation marks except in a success toast at most (and never two). No "Oops", no "Yay", no "亲". Address the user as 你 (never 您) in Chinese and "you" in English.

**Chinese rules.**
- Full-width punctuation only: ，。：；！？「」（）— never half-width `, . : ( )` in Chinese strings. Use 「」 for quotes, not “”.
- Put a space between Chinese and Latin letters/digits: 「步行 8 分钟」「6 月 15 日入住」「$1,250 / 月」. No space before full-width punctuation.
- Line-height 1.65 for body (`html[lang^="zh"]` sets it). Never justify. Never letter-space Chinese headings.
- Prefer two-character verbs for buttons: 发布、保存、联系、加入、取消、继续、重试. Max 4 characters per button.
- Numbers stay Arabic (「2 室 1 卫」, not 「两室一卫」) except in idioms.

**English rules.** Sentence case everywhere (buttons, titles, tabs): "Message host", not "Message Host". No Title Case, no ALL CAPS except abbreviations (ID, OBO). Oxford comma. Avoid "please".

**Pairs for the same slot** (zh / en) must fit the same component; test the longer one. Typical lengths: en ≈ 1.6× zh characters. Buttons and tabs never truncate — shorten the copy instead.

**Numbers, units, money, dates.**
| Thing | zh-CN | en |
|---|---|---|
| Monthly price | $1,250 / 月 (card stub: `$1,250/mo` is accepted in both, as the stub is a "global" glyph) | $1,250/mo |
| One-time price | $40 · 免费 · $40 可议价 | $40 · Free · $40 OBO |
| Range | $900–1,200 (en dash, no spaces) | $900–1,200 |
| Deposit / fee | 押金 $1,250 · 服务费 3%（$37.50） | Deposit $1,250 · 3% service fee ($37.50) |
| Distance | 0.6 mi · 步行 8 分钟 | 0.6 mi · 8 min walk |
| Area | 850 sqft | 850 sq ft |
| Rooms | 2 室 1 卫 | 2 bd · 1 ba |
| Date (short) | 6 月 15 日 · 2026 年 6 月 15 日 | Jun 15 · Jun 15, 2026 |
| Date range | 6 月 15 日 – 8 月 31 日（2.5 个月） | Jun 15 – Aug 31 (2.5 months) |
| Time | 14:02 (24 h) | 2:02 PM |
| Relative time | 刚刚 · 5 分钟前 · 昨天 14:02 · 3 天前 | just now · 5 min ago · yesterday 2:02 PM · 3 days ago |
| Count | 246 条房源 · 3/4 人 | 246 listings · 3 of 4 |
| Campus names | 西北大学 Northwestern（first mention）, then Northwestern | Northwestern University, then Northwestern |
Money is always USD, integer cents from the API, formatted with `Intl.NumberFormat('en-US', {style:'currency', currency:'USD', maximumFractionDigits: 0})` for whole dollars; show cents only when non-zero. Dates: `Intl.DateTimeFormat` with the user's locale and the **campus** timezone (listings) or device timezone (chat), never raw ISO. Timezone shown as `caption` when it differs from the device: 「CT」.

**Microcopy library (zh / en)** — keys live in `web/src/i18n/common.ts`:
- `common.messageHost` 联系房东 / Message host · `common.save` 收藏 / Save · `common.saved` 已收藏 / Saved · `common.share` 分享 / Share · `common.report` 举报 / Report
- `common.viewAll` 查看全部 / View all · `common.loadMore` 加载更多 / Load more · `common.retry` 重试 / Retry · `common.back` 返回 / Back · `common.next` 下一步 / Next · `common.publish` 发布 / Publish
- `common.verifiedOnly` 仅限已验证用户 / Verified users only · `common.boosted` 推广 / Boosted · `common.sponsored` 赞助 / Sponsored · `common.testMode` 测试模式 / Test mode
- `empty.listings` 这里还没有房源 / No listings here yet · `empty.listingsHint` 换个校区看看，或者第一个发布。 / Try another campus, or be the first to post.
- `error.generic` 出了点问题，请重试。 / Something went wrong. Try again. · `error.offline` 网络已断开，正在重连… / You're offline — reconnecting…
- `scam.banner` 请勿在平台外转账或预付押金。安窝的押金托管会在你入住后再放款。 / Never pay deposits off-platform. Anwo's escrow releases funds only after you move in.
- `toast.campusSwitched` 已切换到 {campus} / Switched to {campus}

---

## 9. Accessibility checklist & dark-mode rules

**Checklist (each module ticks this before "done")**
- [ ] All text pairs use tokens from §3.1 (≥ 4.5:1). No `ink-4` for readable text. No text on `accent-vivid`.
- [ ] Every interactive element: visible focus (`:focus-visible` ring, global), hover, active, disabled states; min 44×44 touch target on mobile.
- [ ] Keyboard: Tabs (arrows), DropdownMenu/Select (arrows, type-ahead, Esc), Modal/Sheet (focus trap, Esc, focus return), map pins (Tab order by price, Enter selects), FilterChips (`aria-pressed`), SegmentedControl (`role=radiogroup`).
- [ ] Icon-only buttons have `aria-label` in the current language; decorative icons `aria-hidden`.
- [ ] Images: listing photos `alt` = title + index 「1735 Chicago Ave，照片 2」; uploaded photos require no alt but get the item title.
- [ ] Live regions: Toast `role=status`/`alert`; chat new message `aria-live=polite`; result count after filtering announced.
- [ ] Forms: `<label for>`, errors linked via `aria-describedby`, error summary focused on submit, never color-only error.
- [ ] Map: every pin's listing is also reachable in the list; map-only actions (draw) have list equivalents (filter by area chip). Leaflet controls get `aria-label`s.
- [ ] `lang` attribute switches with the UI language; mixed-language strings mark spans (`<span lang="en">Northwestern</span>` inside zh is optional but preferred for screen readers).
- [ ] `prefers-reduced-motion` respected (theme.css handles global; `flyTo` → `setView` in MapView).
- [ ] Zoom to 200 %: no horizontal scroll, no clipped controls; mobile layout kicks in.
- [ ] Color is never the only signal: trust badges have shapes + labels; selected pin also scales; success/danger have icons.

**Dark-mode rules**
1. Set `data-theme` on `<html>`: `"light" | "dark"`, or omit it to follow the OS. The toggle in Settings offers 跟随系统 / 浅色 / 深色; persisted in `localStorage` only (no profile column). The app resolves 跟随系统 with `matchMedia('(prefers-color-scheme: dark)')` at boot and on change and **always** writes an explicit `data-theme`, so the CSS variables and the `dark:` variant (which keys off the attribute) can never disagree; the `prefers-color-scheme` block in `theme.css` only covers the first paint before that script runs.
2. Semantic tokens only. The only `dark:` utilities allowed are for images/maps (e.g. `dark:map-tiles` to apply the tile filter, `dark:opacity-90` on photos).
3. Elevation in dark = lighter surface + 1 px rim, not bigger shadows: `paper #141210` → `surface #1D1A17` → `sunken #272320`.
4. Accent text in dark uses `accent-text` (#FB8A5A); fills keep `accent` (#C2410C) with white text so buttons look the same in both themes.
5. Photos get `brightness(.92)` in dark via `dark:brightness-[.92]`; never invert. Map tiles use `--map-tile-filter`; pins and polylines use tokens so they stay legible.
6. Skeleton shimmer uses `sunken`/`line`, so it works unchanged.
7. Test both themes in the Playwright walkthrough (`page.emulateMedia({ colorScheme: 'dark' })` on at least one screenshot).

---

## 10. Do this, not that

| # | Do this | Not that |
|---|---|---|
| 1 | Listing price as the ink **price stub** overlapping the photo, `$1,250/mo` in `price` tabular. | Price in persimmon text above the title, or a gradient "pill" on the photo. |
| 2 | Card at rest: `bg-surface border line rounded-card`, hover → `border-line-strong shadow-sm`. | `shadow-xl` on every card, `hover:-translate-y-2`, colored border for "featured". |
| 3 | Section header: `h2` 热门房源 + ghost link 「查看全部 →」 on the right. | Centered uppercase eyebrow "FEATURED LISTINGS" with a gradient underline. |
| 4 | Boosted card: small `accent-soft` label 「推广」 top-left, same card chassis, same rank rules. | Gold "PREMIUM ★" ribbon, larger card, placed above every organic result. |
| 5 | Empty state: `sunken` circle + `ink-4` icon, `h3` 「这里还没有房源」, one sentence, one button. | 3D illustration of a sad box, "Oops! Nothing here 😢", three buttons. |
| 6 | Trust: `shield-check` in persimmon + 「学生认证」 label; L1 is a neutral outline check. | Five different badge colors (blue verified, green ID, gold VIP), a star rating standing in for trust. |
| 7 | Chinese copy: 「步行 8 分钟到校，6 月 15 日可入住。」 full-width punctuation, spaces around digits. | 「步行8分钟到校,6月15日可入住!」 half-width comma, no spaces, exclamation. |
| 8 | Map pin: paper pill with ink border; selected → persimmon fill, 1.08 scale; cluster = ink circle. | Default Leaflet blue teardrop markers; rainbow clusters; price shown only on hover. |

---

### Appendix A — token → Tailwind quick map
`bg-paper bg-surface bg-sunken bg-inverse bg-accent bg-accent-soft` · `text-ink text-ink-2 text-ink-3 text-ink-inverse text-accent-text text-accent-text-strong text-on-accent text-success text-danger` · `border-line border-line-strong border-accent-soft-line` · `rounded-xs rounded-sm rounded-ctl rounded-card rounded-lg rounded-pill` · `shadow-sm shadow-md shadow-lg shadow-pin` · `text-display text-h1 text-h2 text-h3 text-body-lg text-body text-small text-caption text-price-lg text-price` · `font-sans font-mono` · `ease-out ease-in-out ease-emphasis` · `animate-fade-in animate-rise-in animate-sheet-up animate-pin-pop` · `z-layer-nav z-layer-dropdown z-layer-modal z-layer-toast z-layer-tooltip` · `duration-token-fast duration-token-base duration-token-slow` · `max-w-content max-w-detail max-w-reading max-w-form` · `skeleton hairline map-tiles`.

### Appendix B — campus data the UI expects (from `shared/src/campuses.ts`)
`CAMPUSES: Campus[]` with the same shape as the API `Campus` DTO: `{ id, slug, name, nameZh, shortName, city, state, lat, lng, timezone, eduDomains[], hasShuttle, defaultRadiusM, intlStudents? }`; the seed inserts it into `campuses`. The switcher sorts by `state` then `name`; `shortName` is what the header pill shows (≤ 14 chars). `nameZh` may equal `name` for schools without a common Chinese name; the UI then shows one line.
