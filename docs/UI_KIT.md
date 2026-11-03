# UI Kit & web lib reference — 安窝 Anwo

> For module agents. Everything here lives in `web/src/components/**` (UI kit) and `web/src/lib/**` (hooks, API, i18n, ws).
> These folders are **read-only** for modules; request changes in `docs/modules/<key>.md` → "Integration requests".
> Visual QA page: `web/kitchen.html` → `npx vite --port 5200 --config web/vite.config.ts` then open `http://127.0.0.1:5200/kitchen.html?theme=dark&lang=en`. Screenshots: `docs/screenshots/ui-kit/`.
> Tokens / variants / anatomy: `docs/DESIGN.md` §3–§5. This file documents the **exact prop names**.

```ts
import { Button, Input, Card, ... } from '@/components'          // barrel (also '@/components/Button')
import { Mark, Lockup } from '@/components/brand/...'              // assets agent
import { MapView, StaticMapPreview, PricePin } from '@/components/map/...' // assets/map agent
import { NoListings, NoMessages, ... } from '@/components/illustrations/...' // assets agent
import { api, ApiError, uploadFiles } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useCampus, scopeQuery } from '@/lib/campus'
import { useT, useLocale, t as tStatic, formatMoney, ... } from '@/lib/i18n'
import { getWs, useWsStatus, useWsPolling } from '@/lib/ws'
import { toast } from '@/lib/toast'
import { track } from '@/lib/track'
import { cn } from '@/lib/cn'
import { queryClient } from '@/lib/query'
import { useMeta, useFlag } from '@/lib/meta'
import { useIsMobile, useDebounce, useLockBody, useOnClickOutside, useFocusTrap, useEscape, useAnchorPosition, useControllable, mergeRefs } from '@/lib/hooks'
import { getCookie, setCookie, storage, session } from '@/lib/storage'
```

Conventions shared by every component: `className` is merged with `cn()`, `ref` is forwarded, state is exposed as `data-state`, every string inside the kit goes through `useT()` with `ui.*` keys (`web/src/i18n/ui.ts`). Colors are semantic tokens only — never `dark:` color classes, never hex. Icons are `lucide-react` at 16–20 px, `strokeWidth 1.75`.

---

## 1. Lib

### `api<T>(path, opts?)` — `@/lib/api`
```ts
const data = await api<Paginated<ListingCard> & { scope: ScopeInfo }>('/api/listings', { query: { ...scopeQuery(), page: 1, sort: 'recent' } })
await api('/api/listings/:id/save', { method: 'POST' })          // method defaults to POST when `body` is given, else GET
await api('/api/users/me', { method: 'PATCH', body: { bio } })
// opts: { method?, body?: unknown | FormData, query?: Record<string, string|number|boolean|string[]|null|undefined>, signal?, headers? }
```
Unwraps `{ ok, data }`; throws `ApiError { code, message, fields?, data?, status }` (`status: 0` = network, `isNetwork`). `isApiError(e, 'TRUST_REQUIRED')` narrows. Sends `X-Requested-With: fetch` + cookies. A 401 `UNAUTHORIZED` dispatches `anwo:unauthorized` on `window` so the auth store resets.

`uploadFiles(files: File[] | FileList, purpose: string, isPrivate = false, { onProgress?, signal? })` → `Upload[]` (multipart `file`×N to `POST /api/uploads`; XHR with progress when `onProgress` is passed).

### `useAuth()` — `@/lib/auth` (zustand)
```ts
const { user, status, login, register, logout, refresh, setUser } = useAuth()
// user: UserMe | null · status: 'loading' | 'anon' | 'authed'
// login(email, password) → UserMe · register({ email, password, name, locale?, campusId?, referralCode? }) → UserMe & { eduCodeSent? }
// logout() · refresh() → UserMe | null · setUser(u)
```
Non-hook: `authStore.getState()`; boot is automatic on first `useAuth()` (`bootAuth()` to force).

### `useCampus()` — `@/lib/campus`
```ts
const { campus, campusId, scope, setCampus, setScope, campuses, recent, isNationwide } = useCampus()
// campus: Campus | null · scope: 'campus' | 'nationwide' · campuses: Campus[] (from @shared/campuses) · recent: string[] (≤3 ids)
scopeQuery()               // → { campusId?, scope } for list endpoints (API.md §1.4)
getCampusById(id)          // → Campus | null
```
`setCampus(id)` writes cookie `campus`, syncs `?campus=`, PATCHes `/api/users/me` when logged in, tracks `campus.switch`. Toast 「已切换到 X」 is the shell's job (`toast.campusSwitched`).

### i18n — `@/lib/i18n`
```ts
const t = useT()                    // t('listings.title') · t('ui.showAllPhotos', { count: 12 }) — missing key returns the key (warns once in dev)
const { locale, setLocale, isZh, intl, formatMoney, formatMoneyRange, formatPrice, formatDate, formatDateRange, formatRelative, formatDistance, formatMinutes, formatNumber, formatPercent, formatRooms, formatArea } = useLocale()
// locale: 'zh-CN' | 'en' — cookie `lang`, <html lang>, PATCH /api/users/me when authed
```
Formatters (also importable as pure functions with an explicit `locale` arg — `formatMoney(cents, { perMonth, compact, locale })`):

| call | zh-CN | en |
|---|---|---|
| `formatMoney(125000, { perMonth: true })` | `$1,250 / 月` | `$1,250/mo` |
| `formatMoney(125000, { perMonth: true, compact: true })` | `$1,250/mo` (card stub) | `$1,250/mo` |
| `formatMoney(4050)` | `$40.50` | `$40.50` |
| `formatMoneyRange(90000, 120000)` | `$900–1,200` | same |
| `formatPrice({ priceCents, isFree, obo })` | `免费` · `$40 可议价` | `Free` · `$40 OBO` |
| `formatDate('2026-06-15')` / `(…, 'long')` / `(…, 'time')` / `'datetime'` / `'monthDay'` / `'weekday'` | `6 月 15 日` · `2026 年 6 月 15 日` · `14:02` | `Jun 15` · `Jun 15, 2026` · `2:02 PM` |
| `formatDateRange(start, end, { months: true })` | `6 月 15 日 – 8 月 31 日（2.5 个月）` | `Jun 15 – Aug 31 (2.5 months)` |
| `formatRelative(iso)` | `刚刚 · 5 分钟前 · 昨天 14:02 · 3 天前` | `just now · 5 min ago · yesterday 2:02 PM · 3 days ago` |
| `formatDistance(965)` / `(80)` | `0.6 mi` / `80 米` | `0.6 mi` / `260 ft` |
| `formatMinutes(8, 'walk')` | `步行 8 分钟` | `8 min walk` |
| `formatRooms(2, 1)` · `formatArea(850)` | `2 室 1 卫` · `850 sqft` | `2 bd · 1 ba` · `850 sq ft` |
`formatDate` accepts `{ timeZone }` (use the campus timezone for listings). `pickLang(locale, en, zh)` picks a bilingual DTO field. `t` (non-hook, `import { t } from '@/lib/i18n'`) for stores/ws handlers. `spaceCjk(s)` inserts spaces between CJK and Latin.
Dictionaries: `web/src/i18n/<module>.ts` → `export default { zh: { 'listings.title': '转租房源' }, en: { 'listings.title': 'Sublets' } }` (dotted keys; nested objects are flattened too).

### WebSocket — `@/lib/ws`
```ts
const ws = getWs()                                   // singleton; connects while useAuth().status === 'authed'
ws.subscribe('conversation:c1'); ws.unsubscribe('conversation:c1')   // desired set is re-sent after every `ready`
const ack = await ws.send<{ messageId: string }>('chat.send', { conversationId, clientId, body })  // rejects WsError { code } on `error`/timeout (10 s)
const off = ws.on<Message>('chat.message', (data, frame) => …); off()   // '*' = every frame; 'ready' fires on (re)connect → run the REST catch-up
ws.status · ws.isReady · ws.lastEventTs · ws.reconnect()
const status = useWsStatus()  // 'idle'|'connecting'|'open'|'ready'|'polling'|'closed'|'suspended'
const polling = useWsPolling() // true → show the 「连接中…」 pill and poll REST (WS_EVENTS.md §8)
```
Backoff, heartbeat (`ping` 30 s / `pong` 10 s), close-code policy (4401/4403/4429) and visibility/online reconnects are built in. `useWsStore.getState().readyData` holds the last `ready` payload.

### Others
- `toast.success(title, description?, action?: { label, onClick }, durationMs?)` · `.error` · `.info` · `toast.dismiss(id)`. `<Toaster />` is mounted by the shell.
- `track(type, props?)` — `track('listing.view', { entityType: 'listing', entityId: id })`; batched to `POST /api/events` (sendBeacon on hide). `trackPageview()`.
- `cn(...classes)` — clsx + tailwind-merge aware of our token names (`text-body` vs `text-ink` both kept).
- `queryClient` — staleTime 30 s, no retry on 4xx. Query keys: prefix with your module, e.g. `['listings', 'list', params]`.
- `useMeta()` → `UseQueryResult<Meta>` (`enums`, `amenities`, `categories`, `buddyTypes`, `flags`, `limits`, `plans`, `brand`); `useFlag('escrow.enabled')`; `invalidateMeta()`.
- Hooks: `useMediaQuery(q)`, `useIsMobile()` (< 768), `usePrefersReducedMotion()`, `useDebounce(value, ms)`, `useDebouncedCallback(fn, ms)`, `useLockBody(locked)`, `useOnClickOutside(refOrRefs, handler, enabled)`, `useEscape(handler, enabled)`, `useFocusTrap(ref, active, { initialFocus?, returnFocus? })`, `useControllable(value, default, onChange)`, `useAnchorPosition(anchorRef, floatingRef, open, { side, align, gap })`, `usePrevious(v)`, `mergeRefs(...refs)`, `getFocusable(root)`.
- Storage: `getCookie(name)`, `setCookie(name, value, { days, path, sameSite })`, `deleteCookie(name)`, `storage.get(key, fallback) / set / remove / getString` (localStorage, JSON, never throws), `session.*` (sessionStorage).

---

## 2. Components

### Button
```tsx
<Button variant="primary" size="md" iconLeft={<Plus />} loading={saving} onClick={save}>发布</Button>
<Button variant="ghost" iconOnly aria-label={t('common.share')}><Share2 /></Button>
<Button asChild variant="secondary"><Link to="/listings">…</Link></Button>
```
Props: `variant: 'primary' | 'secondary' | 'ghost' | 'danger'` (default primary) · `size: 'sm' | 'md' | 'lg'` (32/40/48) · `iconLeft` · `iconRight` · `iconOnly` (needs `aria-label`) · `loading` · `disabled` · `asChild` · `fullWidth` · native button props (`type` defaults to `button`). `buttonClasses({ variant, size })` returns the class string for custom anchors.

### Input · Textarea · Select · Field
```tsx
<Input label="邮箱" type="email" iconLeft={<Mail />} hint="…" error={errors.email} clearable value={v} onChange={e => setV(e.target.value)} />
<Input prefix="$" suffix="/mo" type="number" inputMode="numeric" size="lg" />
<Textarea label="描述" rows={4} maxRows={8} maxLength={5000} showCount />
<Select label="排序" options={[{ value: 'recent', label: '最新', description?, icon?, disabled?, text? }]} value={sort} onChange={setSort} placeholder="…" searchable size="sm" error={…} />
<Field label="自定义" hint="…" error="…" htmlFor={id} required optional labelEnd={<a>忘记密码？</a>}>{children}</Field>
```
Input props: `size 'sm'|'md'|'lg'`, `label`, `hint`, `error`, `prefix`, `suffix`, `iconLeft`, `clearable`, `required`, `optional`, `inputClassName`, + native input props. Textarea: `label hint error rows maxRows maxLength showCount optional`. Select: native `<select>` on mobile when not `searchable`; `onChange(value)` receives the value string; `value` may be `null`. Set `text` on an option when `label` is not a plain string (used for type-ahead and native select).

### Checkbox · Switch
```tsx
<Checkbox label="带家具" description="…" checked={v} onChange={e => setV(e.target.checked)} indeterminate error />
<Switch label="仅接受已验证用户私信" description="…" checked={v} onChange={setV} size="md" labelPosition="start" />
```
Checkbox is a native input (`onChange(event)`), Switch is a `role=switch` button (`onChange(boolean)`).

### DateRange · PriceRange
```tsx
<DateRange label="可租时间" value={{ start: '2026-06-15', end: '2026-08-31' }} onChange={setRange} min="2026-01-01" max="2027-12-31"
  presets={[{ label: '整个暑假', start: '2026-06-15', end: '2026-08-31' }]} months={2} />
<PriceRange value={[80000, 150000]} onChange={setPrice} bounds={[0, 300000]} step={5000} histogram={counts24} unit="/mo" />
```
DateRange values are `YYYY-MM-DD` strings or `null`; week starts Monday for zh, Sunday for en; popover on desktop, Sheet with 「应用」 on mobile. PriceRange values are **cents**.

### Chip · FilterChip · Badge · TrustBadge
```tsx
<Chip variant="accent" size="sm" icon={<Heart />} onRemove={() => …}>新生 $50 奖励</Chip>     // 'default' | 'accent' | 'inverse'
<FilterChip selected={f.furnished} count={12} icon={<Bus />} onClick={toggle}>带家具</FilterChip>
<FilterChip menu={(close) => <PriceRange … />} menuTitle="价格">价格</FilterChip>             // popover (desktop) / Sheet (mobile)
<Badge variant="boosted" />  <Badge variant="sponsored" />  <Badge variant="pro" />  <Badge variant="success" icon={<Check />} size="sm">已通过</Badge>
// variants: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'boosted' | 'sponsored' | 'pro' (last three carry default labels + tooltips)
<TrustBadge level={user.trustLevel} size="inline" />   // 'inline' (14 px, no label) | 'card' (16 px + label) | 'profile' (20 px + label); showLabel, noTooltip
```
L0 renders nothing except at `profile` size (or with `showLabel`).

### Card · Price · Avatar
```tsx
<Card as={Link} to={`/listings/${id}`} interactive padding="none" className="overflow-hidden">
  <div className="aspect-[4/3] bg-sunken"><img … className="size-full object-cover dark:brightness-[.92]" /><Badge variant="boosted" className="absolute left-2 top-2" /></div>
  <div className="relative -mt-3.5 ml-3"><Price cents={priceCents} perMonth size="stub" /></div>   // the signature stub; keep `relative` on the wrapper
  <div className="flex flex-col gap-1 p-3 pt-2">…</div>
</Card>
// Card props: as (element/component), interactive, padding 'none'|'sm'|'md'|'lg' (0/12/16/20), variant 'default'|'sunken'|'outline-accent'
<Price cents={125000} perMonth size="lg" />  <Price cents={4000} obo />  <Price cents={0} isFree />  <Price cents={90000} maxCents={120000} />
// size: 'inline' | 'md' (text-price) | 'lg' (text-price-lg) | 'stub'
<Avatar src={u.avatarUrl} name={u.name} size="sm" trustLevel={u.trustLevel} status={online ? 'online' : undefined} />   // xs 24 · sm 32 · md 40 · lg 56 · xl 88
<AvatarStack users={[{ id, name, avatarUrl, trustLevel }]} max={3} size="xs" />
```

### Tabs · SegmentedControl
```tsx
<Tabs items={[{ key: 'all', label: '全部', count: 24, icon?, disabled? }]} value={tab} onChange={setTab} variant="underline" scrollable label="…" />
<Tabs variant="pill" … />   // SegmentedControl look (≤ 3 items)
<SegmentedControl options={[{ value: 'map', label: '地图', icon: <MapPin /> }, { value: 'list', label: '列表' }]} value={view} onChange={setView} size="sm" fullWidth label="视图" />
```
Both are generic over the key/value string type; arrow keys supported.

### Modal · Sheet · DropdownMenu · Tooltip
```tsx
<Modal open={open} onClose={close} title="你要发布什么？" description="…" size="sm" footer={<><Button variant="ghost" onClick={close}>取消</Button><Button>确认</Button></>}
  dismissible initialFocus={inputRef} hideClose forceModal sheetSnap="full" bodyClassName="p-0">…</Modal>   // renders as Sheet below md
<Sheet open={open} onClose={close} title="筛选" snap="half" handle footer={…} dismissible initialFocus hideClose bodyClassName>…</Sheet>
<DropdownMenu label="更多" align="end" trigger={<Button variant="ghost" iconOnly aria-label="更多"><MoreHorizontal /></Button>}
  items={[{ label: '编辑', icon: <Pencil />, shortcut: 'E', onSelect }, 'separator', { label: '删除', icon: <Trash2 />, danger: true, disabled?, onSelect }]} />
<Tooltip content="推广房源由发布者付费置顶" side="top" delay={400}><button …/></Tooltip>   // child must take a ref + mouse/focus handlers
```
All overlays: Esc, outside click, focus trap, focus return, body scroll lock. Unmounted when `open` is false.

### Toast
`toast.success('已保存')` — rendered by the shell's `<Toaster />`. `<Toast item={…} />` is exported for previews only.

### Skeleton · EmptyState · Spinner
```tsx
<Skeleton variant="listing-card" />   // 'text' (lines) | 'rect' (width,height) | 'circle' (width) | 'listing-card' | 'item-card' | 'buddy-card' | 'row'
<SkeletonList count={8} variant="listing-card" className="grid …" />      // sets aria-busy
<EmptyState icon={Home} title="这里还没有房源" description="换个校区看看，或者第一个发布。" action={{ label: '切换到全美', onClick }} secondaryAction={<Button variant="ghost">重试</Button>} size="md" />
// icon: lucide component OR an element (e.g. <NoListings /> from components/illustrations); action/secondaryAction: ReactNode or { label, onClick, variant? }
<Spinner size={16} label="加载中" />
```

### PageHeader · Section · FilterBar · Pagination
```tsx
<PageHeader title="转租房源" subtitle="246 条房源" breadcrumb={[{ label: '转租', to: '/listings' }, { label: 'Northwestern' }]} actions={<Button>发布</Button>} tabs={<Tabs … />} back sticky />
<Section title="热门房源" to="/listings" linkLabel="全部房源" subtitle="…" headingLevel="h2" actions={…}>{cards}</Section>
<FilterBar sticky scopeToggle={{ value: scope, onChange: setScope, campusLabel: campus?.shortName, nationwideDisabled }}
  chips={[{ key: 'date', label: '日期', icon: <Calendar />, menu: <DateRange … /> }, { key: 'furnished', label: '带家具', selected, onClick }]}
  onReset={reset} resultCount={total} sort={{ value: sort, options, onChange: setSort }} trailing={<SegmentedControl … />}>{extraChips}</FilterBar>
<Pagination page={page} pageSize={20} total={total} onChange={setPage} variant="numbers" loading />   // default: numbers ≥ md, 「加载更多」 below
```
FilterBar hides `resultCount` and `sort` below `md` — put them in your mobile filter Sheet (DESIGN.md §7.2). `trailing` stays visible.

### PhotoGallery · PhotoUploader
```tsx
<PhotoGallery photos={photos.map((p, i) => ({ src: p.url, alt: t('ui.photoAlt', { title, index: i + 1 }), id: p.id }))} layout="hero" onOpen={i => track(…)} aspect="4/3" noLightbox />
<PhotoUploader files={files} onChange={setFiles} onReorder={setFiles} max={10} accept="image/*" maxSizeMB={10} purpose="listing" isPrivate upload={customFn} label="…" />
// UploaderFile: { id, url, name?, progress?, error?, uploadId?, file? } — send `files.filter(f => f.uploadId).map(f => ({ uploadId: f.uploadId }))` to the API
```
The uploader uploads immediately (via `uploadFiles(file, purpose)`), reports progress/errors inline, marks the first thumb 「封面」, supports drag reorder and ← → buttons.

### StatTile · Table (admin)
```tsx
<StatTile label="DAU" value={1240} delta={{ value: 12.5, direction: 'up' }} spark={[3, 4, 5, 6]} hint="…" format="number" selected invertDelta />   // format: 'number' | 'money' (cents) | 'percent' (fraction)
<Table<Row> columns={[{ key: 'name', header: '用户', render: r => …, sortable, width: 240, align: 'left', hideOnMobile }]} rows={rows} rowKey="id"
  selectable selected={ids} onSelectChange={setIds} sort={{ key, dir }} onSort={(key, dir) => …} loading empty={<EmptyState … />} stickyHeader
  rowActions={r => <DropdownMenu … />} onRowClick={r => open(r)} skeletonRows={5} caption="…" />
```
Below `md` the table becomes stacked cards (`hideOnMobile` columns dropped).

### Small helpers
`<Divider orientation="horizontal" label="或" />` · `<Kbd>⌘K</Kbd>` · `<VisuallyHidden>` · `<Portal>` · `initialsOf(name)` · `inputBoxClasses({ size, error, disabled })` (style a custom trigger like an Input).

---

## 3. Patterns

- **Lists**: `loading` → `<SkeletonList>`, `error` → `<EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: refetch }} />`, empty → `<EmptyState>`; never show an empty state while loading.
- **Scoped queries**: `useQuery({ queryKey: ['listings', scopeQuery(), filters], queryFn: () => api('/api/listings', { query: { ...scopeQuery(), ...filters } }) })` and re-run when `useCampus().campusId / scope` change.
- **Forms**: map `ApiError.fields['title']` to `error` props; `TRUST_REQUIRED` → route to `/verify` with a toast.
- **Realtime**: subscribe in `useEffect`, unsubscribe on cleanup; handle `'ready'` to refetch (idempotent reducers by `id`).
- **Theme**: the app writes `data-theme` on `<html>` at boot (`index.html` inline script, `localStorage.theme`). Components never branch on theme.
- **Base CSS helpers**: `.no-scrollbar`, `.fade-x` (scroll-row fade edges), `.pb-safe`, `.max-w-reading-text`, `.on-inverse` (semantic colors for content on `bg-inverse`), `.skeleton`, `.hairline`, `.map-tiles`, `.tnum`.
