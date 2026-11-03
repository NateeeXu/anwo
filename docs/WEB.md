# Web app shell — conventions for module agents

> Owner: scaffold (app shell agent). Covers `web/src/main.tsx`, `web/src/App.tsx`, `web/src/app/**`, `web/src/pages/**`, the module route stubs in `web/src/features/<key>/` and the core dictionaries `web/src/i18n/common.ts` / `core.ts`. The UI kit (`web/src/components/**`) and `web/src/lib/**` are documented in their own files; this page is about how pages plug into the shell.

Contents: 1 Boot & providers · 2 Routing · 3 Adding a module · 4 Shell APIs · 5 Head / titles · 6 Guards · 7 Core pages · 8 SimpleCards · 9 i18n · 10 Dev & verification · 11 Integration notes

---

## 1. Boot & providers

`web/src/main.tsx` → `bootTheme()` (writes an explicit `data-theme` on `<html>` from `localStorage.theme` or the OS; follows OS changes while on "system") → `<StrictMode><App/></StrictMode>`.

`App.tsx` = `<Providers><RouterProvider router={router} /></Providers>`. `app/providers.tsx` stacks `QueryClientProvider` (`lib/query`), `I18nProvider` (`lib/i18n`), the top-level `ErrorBoundary` and `<Toaster />`. Nothing else is global; auth and campus are zustand stores that boot lazily on first `useAuth()` / `useCampus()`.

Styles: `main.tsx` imports `./styles/base.css` (foundation-owned; it imports `theme.css`). Module code never imports CSS files.

## 2. Routing

React Router 7 **data mode** (`createBrowserRouter`) in `web/src/app/router.tsx`:

```
/                      AppShell (layout route, errorElement = ErrorFallback)
├─ core routes         index, welcome, login, register, forgot, verify-email, u/:id, settings,
│                      notifications, search, help, safety, terms, privacy, dev/mailbox, dev/kitchen
├─ module routes       ...listings, ...wanted, ...chat, ...verify, ...map, ...shuttle, ...market,
│                      ...buddy, ...billing, ...admin   (each = default export of features/<key>/routes.tsx)
└─ *                   NotFound
```

- Every core page is `React.lazy` and wrapped in `<Suspense fallback={<PageSkeleton/>}>`; module route elements are wrapped the same way by `withSuspense()`, so modules can `React.lazy` their pages without adding their own Suspense.
- Admin routes are additionally wrapped in `<RequireRole role="admin">`.
- Module paths from the contract: listings → `listings/*`, `post/listing`; wanted → `wanted/*`, `post/wanted`; chat → `chat/*`; verify → `verify/*`; map → `map`; shuttle → `shuttle/*`; market → `market/*`, `post/item`; buddy → `buddy/*`, `post/buddy`; billing → `pricing`, `kit`, `checkout/*`, `wallet`, `pro`; admin → `admin/*`.
- Paths are **relative** (no leading slash). A splat route (`listings/*`) may render its own nested `<Routes>` inside, or you can replace it with a tree of `children` route objects — both work. Prefer `children` when you need per-route `handle` (see §4) or `errorElement`.
- Route `handle` (optional): `{ layout?: 'default' | 'full' | 'bare', hideTabs?: boolean }`.
  - `default` — content inside `<main>` with vertical padding, desktop footer, mobile bottom tabs.
  - `full` — no padding and no footer (full-bleed map, chat, admin shell); tabs still shown unless `hideTabs`.
  - `bare` — no shell at all (used by `/welcome`).
- The shell does **not** add a horizontal container. Pages wrap themselves: `<div className="mx-auto w-full max-w-content px-4 lg:px-8">` (browse), `max-w-detail`, `max-w-reading` (text), `max-w-form` (auth/wizards).

## 3. Adding a module (what each module agent fills in)

| File | Contract |
|---|---|
| `web/src/features/<key>/routes.tsx` | `export default routes: RouteObject[]`. Replace the `ModulePlaceholder` elements with your pages. Lazy-load heavy pages. |
| `web/src/features/<key>/admin.tsx` | `export default` a React component for `/admin/<key>` **or** `null`. The admin agent imports it by path and mounts it inside the admin shell. |
| `web/src/features/<key>/index.ts` | Public surface (cards, hooks) other modules may import. Keep it small. |
| `web/src/i18n/<key>.ts` | `export default { zh: {...}, en: {...} }` with keys prefixed `<key>.` — loaded automatically by `import.meta.glob`. The stub already defines `<key>.title` and the placeholder strings; keep `<key>.title` (the shell may use it for breadcrumbs). |

Browse pages render `<SecondaryTabs />` at the top (see §4). Post wizards live at `/post/<thing>` and are reached through the shell's PostSheet (§4), which already handles anon → login and L0 → `/verify-email?reason=post&next=…`. Wizards should still wrap themselves in `<RequireTrust level={1} reason="post">` so deep links behave.

## 4. Shell APIs (`web/src/app/shell/*`)

| Export | From | Use |
|---|---|---|
| `SecondaryTabs` (`{ className?, counts? }`) | `app/shell/SecondaryTabs` | Underline tabs 转租 · 求租 · 二手 · 搭子 · 校车 · 地图; active tab follows the URL prefix; `counts` adds numbers. Also exports `BROWSE_TABS`. |
| `usePostSheet()` → `{ open, close, isOpen }` | `app/shell/shellStore` | Open the 「你要发布什么？」 sheet from anywhere (e.g. an empty state). |
| `useShellOptions({ title?, hideTabs?, layout?, back? })` | `app/shell/shellStore` | Runtime equivalent of route `handle` for the lifetime of a page (e.g. chat thread: `hideTabs: true`; `back: true` forces the mobile back chevron). |
| `useShellStore` | `app/shell/shellStore` | Raw store (title, hideTabs, layout, postSheetOpen). |
| `CampusSwitcher` (`{ compact? }`), `CampusList`, `useCampusRows`, `useCampusListNav`, `nationwideAllowed(pathname)`, `NATIONWIDE_ROUTES` | `app/shell/CampusSwitcher` | The header pill + popover/sheet. `CampusList` is the reusable grouped-by-state list (used by `/welcome`). Nationwide row is enabled only on `/listings`, `/wanted`, `/search` — extend `NATIONWIDE_ROUTES` if a module legitimately supports `scope=nationwide` (market agent: delivery-only mode). |
| `GlobalSearch` (`{ autoFocus?, size? }`) | `app/shell/GlobalSearch` | ⌘K search box with suggestions from `GET /api/search/suggest`; Enter → `/search?q=`. |
| `LangToggle` | `app/shell/LangToggle` | 中/EN SegmentedControl bound to `useLocale()`. |
| `useUnread()` → `{ notifications, messages }`, `UNREAD_KEY` | `app/shell/useUnread` | Unread counters (REST + ws `notification` / `notification.count` / `chat.conversation` + 30 s polling). Invalidate `UNREAD_KEY` after you mark things read. |
| `NotificationBell`, `UserMenu`, `TopNav`, `MobileTopBar`, `BottomTabs`, `Footer`, `PostSheet`, `AppShell` | `app/shell/*` | Shell internals; modules do not render these. |

Mobile shell rules: the top bar shows the campus pill on root pages (`/`, `/map`, `/chat`, `/settings`, `/listings`, `/wanted`, `/market`, `/buddy`, `/shuttle`, `/search`, `/notifications`) and a back chevron elsewhere; the centre title is whatever `<Head title>` set (the mark on `/`). The bottom tab 我的 goes to `/settings` (or login).

## 5. Head / document titles

`import { Head, useHead } from '../app/Head'` — `<Head title={t('listings.title')} description? />` sets `document.title = "<title> · 安窝 Anwo"` (from `@shared/brand` `NAME_DISPLAY`), the mobile top-bar title and the meta description. Put it at the top of every page; it resets on unmount.

## 6. Guards (`web/src/app/guards.tsx`)

- `<RequireAuth>` — `loading` → `PageSkeleton`; `anon` → `/login?next=<path>`.
- `<RequireRole role="admin">` — anon → login; wrong role → forbidden empty state.
- `<RequireTrust level={n} reason?>` — below `n` renders `<VerificationNudge required={n}/>` (never a dead end: L1 → `/verify-email`, L2+ → `/verify`, both with `next=`).
- `loginPath(next)` helper builds the redirect URL.
- `app/errors.ts`: `errorMessage(t, err)` maps `ApiError.code` → `error.<CODE>` (with `data` interpolated, e.g. `TRUST_REQUIRED` → `{required,current}`), `fieldError(t, err, 'email')` for zod field errors.

## 7. Core pages (`web/src/pages/`)

Home (`/`) · Welcome (`/welcome`, bare layout, redirect target when no `campus` cookie and scope ≠ nationwide) · Login · Register (edu-domain hint via `campusForEmail`, `?ref=` referral, `eduCodeSent` → `/verify-email`) · Forgot (`?step=reset`) · VerifyEmail (`?email=&reason=post&next=`; dev code hint in `import.meta.env.DEV`) · Profile (`/u/:id`, tabs call `/api/listings?ownerId=`, `/api/market/items?sellerId=`, `/api/buddy/posts?authorId=`; report modal) · Settings (`?tab=profile|account|preferences|privacy`; theme preference lives in `localStorage.theme`) · Notifications · Search (`?q=`, scope toggle) · Help (FAQ + campus request form, `#campus-request`) · Safety · Terms · Privacy · DevMailbox (`/dev/mailbox`) · DevKitchen (`/dev/kitchen` → redirects to `/kitchen.html`) · NotFound.

Static text pages read sections from i18n keys `<prefix>.s<n>.title/body` (`pages/static/TextPage.tsx`; `- ` lines become bullet lists).

`pages/home/Section.tsx` exports `Section`, `CardGrid`, `QueryState` and `isStub()`/`isNotImplemented()`: `QueryState` renders skeleton → "under construction" (HTTP 501, `NOT_FOUND` on a missing router, or a `{ module, status: 'stub' }` body) → inline error with retry → empty → data. Modules may import these helpers but should prefer their own list components.

## 8. SimpleCards (temporary)

`web/src/pages/home/SimpleCards.tsx` — `SimpleListingCard`, `SimpleWantedCard`, `SimpleItemCard`, `SimpleBuddyCard`, `SimpleUserRow`, `SimpleCampusRow`. Plain `Card`-based renderings of the DTOs used by Home, Search and Profile only. **Module agents own the real cards** (DESIGN.md §4.1–4.3) and should export them from `features/<key>/index.ts`; the scaffold can then swap the imports in Home/Search/Profile. Do not import SimpleCards from a module.

## 9. i18n

- `useT()` **returns the `t` function** (`const t = useT()`), not an object. `t(key, vars)` returns the key itself when missing and warns once in dev.
- Locale-bound formatters come from `useLocale()`: `const { formatMoney, formatDate, formatRelative, formatDistance, formatRooms, formatNumber, locale } = useLocale()`. The raw functions exported from `lib/i18n` take an explicit `locale` argument/option.
- Dictionaries: `common.ts` (nav, tabs, auth words, generic actions, `error.<CODE>` for every API error code, `empty.*`, `scam.banner`, `toast.campusSwitched`, generic card words `listing.*`, `item.condition.*`, `item.category.*`, `buddy.type.*`), `core.ts` (every core page incl. Help/Safety/Terms/Privacy text). Module strings go in `<key>.ts` only.

## 10. Dev & verification

- Ports: `VITE_PORT` / `VITE_API_TARGET` (default 5173 / `http://127.0.0.1:4000`). Shell verification used `PORT=4901 DB_PATH=server/data/test-shell.db` and `VITE_PORT=5201`.
- Typecheck: `npx tsc --noEmit -p web` (passes).
- Screenshots: `docs/screenshots/shell/*.png` (1280×800 and 390×844 for `/`, `/welcome`, `/login`, `/register`, `/settings`, `/notifications`, `/search?q=a`, `/help`, plus campus switcher, post sheet, verify-email flow, profile, module placeholder, dev mailbox, EN safety page, dark help page, 404). Playwright is loaded with `createRequire(import.meta.url)('playwright')` from scripts outside the repo.

## 11. Integration notes

- **`useT()` shape**: the foundation lib returns `t` directly; the cross-agent contract text read as `{ t }`. All scaffold files use `const t = useT()`. Module agents: do the same.
- **Formatters**: `formatMoney/formatDate/...` exported from `lib/i18n` are the unbound versions (`locale` as a parameter); use `useLocale()` for bound ones (see §9).
- **Server stubs** answer `200 { ok: true, data: { module, status: 'stub' } }` (not 501, and not a `Paginated` shape). `QueryState` treats that body as "under construction"; any page reading `data.items` directly must guard with `Array.isArray`. Missing routers answer `404 NOT_FOUND`, handled the same way.
- **Seeds**: `server/src/db/seed/index.ts` referenced `./core`, which did not exist at verification time, so the seed could not run against `test-shell.db`; logged-in screenshots used an account registered through `POST /api/auth/register` (`shell-test@u.northwestern.edu`). Re-run the shell spec once seeds land to check Home with real data.
- **EmptyState `action`** accepts both a `<Button>` element and `{ label, onClick, to?, variant? }`; the scaffold passes elements.
- **`Lockup`** takes `size` (height in px), not `height`.
- **Campus `recent` list** is owned by `lib/campus` (`useCampus().recent`, key `anwo.recentCampuses`); the switcher reads it, nothing else writes it.
- **Nationwide scope persistence**: `lib/campus` stores `scope` in `localStorage['anwo.scope']`. Home shows nationwide listings when scope is nationwide; the switcher only offers Nationwide on `/listings`, `/wanted`, `/search`.
- **`/dev/kitchen`** redirects to the foundation's standalone `web/kitchen.html`.
- Not done by the scaffold (module work): URL `?campus=` sync on browse pages after a switch (the `lib/campus` effect updates it only when the param already exists), 「我有房」 host CTA on Home wanted rows, sponsored slot insertion (server-side per DATA_MODEL §8).
