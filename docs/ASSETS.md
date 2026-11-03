# Assets — brand, map, illustrations, placeholder images

What the assets scaffold built and how to use it. Everything follows `docs/DESIGN.md` (§1 brand, §4.4 pins, §4.7 empty states, §9 dark mode) and uses semantic CSS variables from `theme.css`, so it is correct in both themes without `dark:` utilities.

Contents: 1 Brand · 2 Map · 3 Illustrations · 4 Placeholder images · 5 Public files · 6 Core smoke spec · 7 Gaps

---

## 1. Brand — `web/src/components/brand/`

```tsx
import { Mark, Lockup, markSvgString } from '@/components/brand';

<Mark />                               // 32px pin mark (roof + persimmon dot with tail)
<Mark size={48} variant="nest" />      // without the tail
<Mark tone="inverse" title={null} />   // on bg-inverse surfaces; decorative (aria-hidden)
<Lockup />                             // 132×32 mark + 安窝 Anwo
<Lockup size={40} compact />           // mark + 安窝 only (mobile top bar)
markSvgString({ size: 28 })            // plain SVG string, used by the campus map marker
```

| Prop | `Mark` | `Lockup` |
|---|---|---|
| `size` | square px (min 20) | height px; width = size × 132/32 (× 80/32 when `compact`) |
| `variant` | `'pin' \| 'nest'` | — |
| `tone` | `'default' \| 'inverse'` | `'default' \| 'inverse'` |
| `compact` | — | drop the English word |
| `title` | accessible label; `null` = `aria-hidden` | same |
| `className`, other SVG props | passed through | passed through |

Rules (DESIGN §1.3): never gradient-filled, never rotated, never on a photo without a `surface` plate; clear space = the dot's height.

Brand constants (`NAME_ZH`, `NAME_EN`, `NAME_DISPLAY`, `TAGLINE_ZH`, `TAGLINE_EN`) live in `shared/src/brand.ts`.

## 2. Map — `web/src/components/map/`

```tsx
import { MapView, StaticMapPreview, useMapBounds, type MapMarker } from '@/components/map';
import { campusCenter } from '@/lib/geo';
```

`MapView` wraps react-leaflet's `MapContainer` with OSM tiles (attribution included, `className="map-tiles"` so dark mode dims the tiles through `--map-tile-filter`). It imports `leaflet/dist/leaflet.css` and its own `map.css`; pages import nothing else.

### 2.1 Browse page with list ↔ pin linking

```tsx
function ListingsBrowse() {
  const { campus } = useCampus();
  const { formatMoney } = useLocale();
  const bounds = useMapBounds();                       // debounced bbox for the API
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['listings', 'pins', bounds.bboxParam],
    queryFn: () => api<{ pins: Pin[] }>('/api/listings', { query: { view: 'pins', bbox: bounds.bboxParam } }),
  });

  const markers: MapMarker[] = (data?.pins ?? []).map((p) => ({
    id: p.id, lat: p.lat, lng: p.lng,
    label: formatMoney(p.priceCents),                   // "$1,250"
    selected: p.id === activeId,
    boosted: p.boostTier === 'plus' || p.boostTier === 'max',
    saved: p.saved,
    muted: visited.has(p.id),
  }));

  return (
    <MapView
      center={campusCenter(campus)} zoom={14} height="100%"
      markers={[...markers, { id: 'campus', kind: 'campus', lat: campus.lat, lng: campus.lng, label: campus.shortName }]}
      hoveredId={hoverId} onMarkerHover={setHoverId} onMarkerClick={setActiveId}
      onBoundsChange={bounds.onBoundsChange} fitToMarkers
      overlay={bounds.moved && <Button size="sm" variant="secondary" onClick={() => { refetch(); bounds.commit(); }}>在此区域搜索</Button>}
    />
  );
}
```

Hover the list card → pass its id as `hoveredId`; hover a pin → `onMarkerHover(id)` highlights the card. Clicking a pin (mouse or `Enter`) calls `onMarkerClick`. Pins are keyboard-focusable in DOM order sorted by price (DESIGN §4.4).

### 2.2 Props

| Prop | Type | Notes |
|---|---|---|
| `center`, `zoom` | `[lat, lng]`, `number` | initial view; later changes `flyTo` (or `setView` under `prefers-reduced-motion`) |
| `bounds` | `Bbox \| null` | `{ minLng, minLat, maxLng, maxLat }`; fits on mount and whenever it changes; wins over `center` |
| `markers` | `MapMarker[]` | `{ id, lat, lng, label?, kind?, selected?, muted?, boosted?, saved?, title? }` |
| `kind` | `'listing' \| 'item' \| 'buddy' \| 'stop' \| 'poi' \| 'campus'` | listing = paper pill, item = `sunken` pill, buddy = pill with a date label, stop = 10 px circle, poi = 12 px dot with hover label, campus = mark on a 36 px surface plate (never clustered, not focusable) |
| `onMarkerClick(id)`, `onMarkerHover(id \| null)` | | |
| `hoveredId` | `string \| null` | external hover (list ↔ map) |
| `polylines` | `{ id, points: [lat,lng][], color?, weight?, selected?, muted?, dashed? }[]` | no `color` = ink token; `selected` = accent 4 px (shuttle routes) |
| `onPolylineClick(id)` | | makes polylines interactive |
| `circles` | `{ id, lat, lng, radiusM, kind?: 'area' \| 'pickup' \| 'radius' }[]` | `area` = accent 2 px + 10 % fill (search / wanted areas), `pickup` = dashed ink-2 + sunken fill (approximate item pickup), `radius` = dashed line-strong (campus radius) |
| `onBoundsChange(bbox, zoom)` | | fires on mount and after every pan/zoom; wrap with `useMapBounds` |
| `fitToMarkers` | `boolean` | refit whenever the set of marker ids changes |
| `interactive` | `boolean` (default `true`) | `false` = static preview: no drag/zoom/controls, pins not focusable |
| `locate`, `zoomControl` | `boolean` | default to `interactive`; locate-me button appears bottom-right under the zoom bar |
| `clusterThreshold` | `number` (60) | grid clustering (64 px cells) above this many markers; `Infinity` disables |
| `minZoom`, `maxZoom` | | 3 / 19 |
| `height` | `string \| number` (320) | `'100%'` for full-bleed pages (parent needs a height) |
| `className`, `style` | | add `rounded-card` for cards |
| `children` | react-leaflet layers | e.g. a draw tool, `<Popup>` |
| `overlay` | ReactNode | floating UI above the map (`z-raised`), e.g. 「在此区域搜索」 |
| `onMapReady(map)` | | the `L.Map` instance (for `flyTo`, draw controls) |

Clusters: 36 px `inverse` circle with the count (`99+` above 99); click zooms to the members. Selected markers are never clustered.

### 2.3 Static preview (cards, detail rails)

```tsx
<StaticMapPreview lat={l.lat} lng={l.lng} label="$1,250" height={160}
  campus={{ lat: campus.lat, lng: campus.lng, shortName: campus.shortName }} />   // listing: pin + campus mark, fit to both
<StaticMapPreview lat={item.pickupLat} lng={item.pickupLng} approximateRadiusM={200} />  // market: circle, never an exact pin
```

### 2.4 Pins outside Leaflet, icons, helpers

- `<PricePin label="$980" selected />`, `<ClusterPin count={12} />` — the same DOM/CSS as the map pins, in-flow (legends, docs, kitchen sink).
- `pricePinIcon(state)`, `clusterIcon(n)`, `stopIcon`, `poiIcon`, `campusIcon`, `iconFor(kind, state)` — memoised `L.DivIcon`s for custom react-leaflet `<Marker>` children.
- `pricePinHtml(state)` — the pin as an HTML string.
- `fixLeafletDefaultIcon()` — already called by MapView; replaces Leaflet's broken default marker image paths with an inline SVG pin.
- `useMapBounds({ debounceMs, initial })` → `{ bbox, zoom, bboxParam, onBoundsChange, moved, commit, reset }`.

`web/src/lib/geo.ts`: `haversineM`, `bboxOf(points, padRatio)`, `bboxAround(center, radiusM)`, `bboxToParam` / `parseBbox` / `bboxToLeaflet` / `bboxContains` / `bboxTooLarge`, `campusCenter(campus)`, `campusBounds(campus)`, `zoomForRadius`, `walkMinutes` / `bikeMinutes` (same rules as the server), `bearingDeg`, `nearest`. Distance *formatting* is `formatDistance` from `@/lib/i18n`.

### 2.5 Styling notes

- All colours are tokens: pin rest `surface`/`ink` border, hover `inverse`, selected `accent` with the `pin-pop` scale, muted `ink-3`/`line-strong`, saved dot `accent`, boosted glyph (no colour change).
- Controls (zoom, locate, attribution) are restyled to `surface` + `line-strong` + `radius-ctl` + `shadow-md`.
- `.leaflet-container { z-index: 0 }` keeps Leaflet under `z-raised`; the `overlay` slot is `z-index: 10`.
- The `map` module may add props/exports to `web/src/components/map/**` but must not change or remove existing ones (BRIEF §7).

## 3. Illustrations — `web/src/components/illustrations/`

Eight spot illustrations, inline SVG, ≤ 3 KB each, 160×120 viewBox, 2 px ink strokes, one `accent-vivid` dot, tokens only (`--ink`, `--ink-3`, `--line`, `--line-strong`, `--accent-vivid`, `--accent-soft`). They are decorative by default (`aria-hidden`); pass `title` to expose a label.

```tsx
import { NoListings, NoMessages, NeedVerification, NoMapResults, NoShuttle, NoBuddy, NoItems, Offline } from '@/components/illustrations';

<EmptyState icon={<NoListings size={120} />} title={t('empty.listings')} description={t('empty.listingsHint')} action={…} />
<Offline size={96} title={t('error.offline')} />
```

| Component | Scene | Typical place |
|---|---|---|
| `NoListings` | empty house + blank sign | listings browse / saved |
| `NoMessages` | two bubbles, reply still typing | chat inbox |
| `NeedVerification` | ID card + shield | trust gates, verify centre |
| `NoMapResults` | folded map + empty magnifier | map explore, bbox search with 0 results |
| `NoShuttle` | shuttle front + clock | campus without shuttle data |
| `NoBuddy` | two people + dashed third | buddy browse / my groups |
| `NoItems` | open box + tag | market, wishlist |
| `Offline` | cloud with a cut line | WS/polling offline state, error boundary |

DESIGN §4.7 keeps empty states typographic: a lucide icon in a `sunken` circle is the default; use these spots where a full-page empty state benefits from a little warmth (home with < 4 listings, onboarding, offline screen), never as decoration.

## 4. Placeholder images — `server/scripts/gen-placeholders.mjs`

Deterministic generator (seeded PRNG per file) that writes 210 on-brand SVGs into `server/uploads/seed/`, served at `/uploads/seed/<group>/<file>`. Each file is < 12 KB (largest ≈ 10 KB). Re-running produces identical bytes.

| Group | Files | Size | Content |
|---|---|---|---|
| `avatars/` | `a01`–`a40` | 240×240 | initials on warm tints — odd numbers CJK given-name characters (涵, 宇, …), even numbers Latin initials (AL, BW, …) |
| `rooms/` | `r01`–`r60` | 1200×900 (4:3) | bedroom · study · living room · kitchen · studio · building facade, cycling; window light, bed/desk/sofa, plants, frames, rugs; corner label like `Bedroom · Evanston` (cities cycle through seeded campuses, Evanston weighted) |
| `items/` | `i01`–`i60` | 800×800 (1:1) | 12 products × 5 categories (furniture, electronics, textbooks, kitchen, bikes); name label bottom-left, category chip top-right |
| `buddy/` | `b01`–`b20` | 1600×900 (16:9) | airport pickup · carpool · library · gym · dinner · Costco run · hiking, bilingual label |
| `partners/` | `p01`–`p20` | 600×300 | fictional wordmarks, two per category: bank, SIM, insurance, movers, storage, furniture rental, airport pickup, money transfer, credit card, tuition |
| `campus/` | `c01`–`c10` | 1200×400 | skyline silhouettes with a signature tower per campus, labelled with the first ten campuses of `docs/data/campuses.json` |

`server/uploads/seed/manifest.json` lists every file with `url`, `width`, `height`, `bytes` and a `label` (plus `category` / `type` / `campusId` where relevant) so seeds can fill `uploads` rows without opening the files:

```ts
import manifest from '../../../uploads/seed/manifest.json' with { type: 'json' };
const rooms = manifest.groups.rooms;            // [{ file:'r01.svg', url:'/uploads/seed/rooms/r01.svg', width:1200, height:900, label:'Bedroom · Seattle', type:'bedroom' }, …]
```

Mapping convention used by seeds: listing *n* uses `rooms/r{(n % 60) + 1}` as cover, user *n* uses `avatars/a{(n % 40) + 1}`, item *n* uses `items/i{(n % 60) + 1}` (item category labels are cosmetic; pick by category if you want them to match), buddy post type → the `buddy/` file whose `type` matches, partners by `category`, campus → `campus/` by `campusId` (fallback by index).

Regenerate with `node server/scripts/gen-placeholders.mjs` (`--check` validates sizes without writing, `--out <dir>` writes elsewhere). `.gitignore` keeps `server/uploads/seed/` in the repo while ignoring user uploads.

## 5. Public files — `web/public/`

| File | Purpose |
|---|---|
| `favicon.svg` | mark on a `paper` plate, follows the OS colour scheme via an embedded media query |
| `favicon-dark.svg` | explicit dark variant (`stone-950` plate) for `<link rel="icon" media="(prefers-color-scheme: dark)">` |
| `og.svg` | 1200×630 social card: lockup, both taglines, price-pin motif (static light palette) |
| `robots.txt` | allows everything public; disallows `/api/`, `/admin`, `/chat`, `/settings`, `/notifications`, `/dev/`, `/verify`, `/post/`, auth pages |

## 6. Core smoke spec — `docs/modules/core.spec.mjs`

```bash
WEB_PORT=5173 node docs/modules/core.spec.mjs        # app must be running (npm run dev)
CORE_FULLPAGE=1 CORE_TIMEOUT_MS=30000 node docs/modules/core.spec.mjs
```

Visits `/`, `/welcome`, `/login` logged out; logs in as alice through `POST /api/auth/login`; reads her id from `/api/auth/me`; visits `/`, `/settings`, `/u/<id>`, `/notifications`, `/dev/mailbox`, `/search?q=a` and the ten module routes (`/listings`, `/wanted`, `/chat`, `/verify`, `/map`, `/shuttle`, `/market`, `/buddy`, `/pricing`, `/admin`) at 1280×800 and 390×844, plus one dark-mode and two English shots. Every visit is wrapped in try/catch, waits for `networkidle` and a rendered root, and records `pageerror`s. Screenshots and `summary.json` land in `docs/screenshots/core/`. Exit codes: `0` clean, `1` any page error or failed visit, `2` app not reachable (`GET /api/meta/health`).

It uses `docs/tools/shot.mjs` when that module resolves `playwright`; in environments where the global Playwright is only reachable through `NODE_PATH` (CommonJS resolution), it falls back to an API-identical helper that loads Playwright with `createRequire`. Module specs that import `shot.mjs` directly need `playwright` resolvable as an ES module (e.g. `ln -s "$(npm root -g)/playwright" node_modules/playwright`, no install).

## 7. Known gaps

- OSM tiles are fetched from `tile.openstreetmap.org`; offline or behind a strict proxy the map shows the `sunken` background with pins only (the UI still works).
- Clustering is grid-based (64 px cells per zoom level), not distance-based; good enough for ≤ a few thousand pins and deterministic, but cluster centres can shift slightly on zoom.
- `LocateControl` labels are hard-coded bilingual strings chosen by `useLocale()` rather than `useT()` keys, because the assets scaffold owns no `web/src/i18n/*.ts` dictionary. If a `map.*` key set is added by the map module, switch to `useT()`.
- Illustrations have no animation and no colour beyond the single accent dot by design.
- Placeholder "photos" are flat vector scenes, intentionally not photorealistic; the generator is meant to be re-run, not hand-edited.
