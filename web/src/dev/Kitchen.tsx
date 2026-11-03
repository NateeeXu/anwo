/* Kitchen sink: every shared component in every variant/state, both locales and both themes. Dev-only (kitchen.html). */
import { useEffect, useState, type ReactNode } from 'react'
import {
  Bus,
  Calendar,
  Footprints,
  Heart,
  Home,
  Languages,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Pencil,
  Plus,
  Search,
  Settings,
  Share2,
  Sun,
  Trash2,
  User,
  Users,
} from 'lucide-react'
import { useLocale, useT } from '@/lib/i18n'
import { toast } from '@/lib/toast'
import { storage } from '@/lib/storage'
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  DateRange,
  Divider,
  DropdownMenu,
  EmptyState,
  Field,
  FilterBar,
  FilterChip,
  Input,
  Kbd,
  Modal,
  PageHeader,
  Pagination,
  PhotoGallery,
  PhotoUploader,
  Price,
  PriceRange,
  Section,
  SegmentedControl,
  Select,
  Sheet,
  Skeleton,
  Spinner,
  StatTile,
  Switch,
  Table,
  Tabs,
  Textarea,
  Tooltip,
  TrustBadge,
  type DateRangeValue,
  type UploaderFile,
} from '@/components'

const svgPhoto = (label: string, hue: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="hsl(${hue} 30% 86%)"/><rect x="120" y="180" width="560" height="300" rx="16" fill="hsl(${hue} 25% 70%)"/><text x="400" y="340" font-family="sans-serif" font-size="40" text-anchor="middle" fill="hsl(${hue} 30% 30%)">${label}</text></svg>`,
  )}`
const PHOTOS = Array.from({ length: 6 }, (_, i) => ({ src: svgPhoto(`Photo ${i + 1}`, 20 + i * 25), alt: `1735 Chicago Ave, photo ${i + 1}` }))

function Block({ title, children, cols }: { title: string; children: ReactNode; cols?: boolean }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6" id={title.toLowerCase().replace(/\W+/g, '-')}>
      <h2 className="text-h3 text-ink">{title}</h2>
      <div className={cols ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'flex flex-wrap items-start gap-3'}>{children}</div>
    </section>
  )
}

type Row = { id: string; name: string; email: string; trust: number; listings: number; gmv: number }
const ROWS: Row[] = [
  { id: '1', name: '李同学 Alice', email: 'alice@u.northwestern.edu', trust: 2, listings: 3, gmv: 125000 },
  { id: '2', name: 'Bob', email: 'bob@u.northwestern.edu', trust: 1, listings: 1, gmv: 0 },
  { id: '3', name: 'Evanston Homes', email: 'landlord@evanstonhomes.com', trust: 3, listings: 12, gmv: 980000 },
]

export function Kitchen() {
  const t = useT()
  const { locale, setLocale, formatMoney, formatDate, formatRelative, formatDistance, formatDateRange, formatMinutes, formatRooms } = useLocale()
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'))
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    storage.set('theme', theme)
  }, [theme])
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    const th = p.get('theme')
    if (th === 'dark' || th === 'light') setTheme(th)
    const lg = p.get('lang')
    if (lg === 'en' || lg === 'zh-CN') setLocale(lg)
  }, [setLocale])

  const [checked, setChecked] = useState(true)
  const [sw, setSw] = useState(true)
  const [sel, setSel] = useState<string | null>('recent')
  const [tab, setTab] = useState('all')
  const [seg, setSeg] = useState('list')
  const [scope, setScope] = useState<'campus' | 'nationwide'>('campus')
  const [modal, setModal] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [dates, setDates] = useState<DateRangeValue>({ start: '2026-06-15', end: '2026-08-31' })
  const [price, setPrice] = useState<[number, number]>([80000, 150000])
  const [page, setPage] = useState(3)
  const [files, setFiles] = useState<UploaderFile[]>([{ id: 'a', url: PHOTOS[0].src, uploadId: 'u1' }, { id: 'b', url: PHOTOS[1].src, progress: 0.6 }, { id: 'c', url: PHOTOS[2].src, error: 'File is over 10 MB' }])
  const [chips, setChips] = useState<Record<string, boolean>>({ furnished: true, shuttle: false, pets: false })
  const [tsel, setTsel] = useState<string[]>(['1'])
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>({ key: 'gmv', dir: 'desc' })
  const [val, setVal] = useState('')

  const options = [
    { value: 'recent', label: locale === 'zh-CN' ? '最新' : 'Recent' },
    { value: 'price_asc', label: locale === 'zh-CN' ? '价格从低到高' : 'Price: low to high', description: '$' },
    { value: 'price_desc', label: locale === 'zh-CN' ? '价格从高到低' : 'Price: high to low' },
    { value: 'distance', label: locale === 'zh-CN' ? '距离' : 'Distance', icon: <MapPin />, disabled: true },
  ]
  const campuses = ['Northwestern', 'UIUC', 'NYU', 'USC', 'UCLA', 'Columbia', 'UW', 'Purdue'].map((c) => ({ value: c.toLowerCase(), label: c, description: 'Evanston, IL' }))

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-8 px-4 pb-24 md:px-8">
      <header className="sticky top-0 z-layer-sticky -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper/95 px-4 py-3 md:-mx-8 md:px-8">
        <div className="flex items-center gap-3">
          <h1 className="text-h3 text-ink">安窝 Anwo · UI kitchen</h1>
          <span className="text-small text-ink-3">DESIGN.md §5</span>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            size="sm"
            label="Language"
            value={locale}
            onChange={(v) => setLocale(v)}
            options={[
              { value: 'zh-CN', label: t('ui.locale.zh'), icon: <Languages /> },
              { value: 'en', label: t('ui.locale.en') },
            ]}
          />
          <SegmentedControl
            size="sm"
            label="Theme"
            value={theme}
            onChange={(v) => setTheme(v)}
            options={[
              { value: 'light', label: t('ui.theme.light'), icon: <Sun /> },
              { value: 'dark', label: t('ui.theme.dark'), icon: <Moon /> },
            ]}
          />
        </div>
      </header>

      <Block title="Typography">
        <div className="flex flex-col gap-2">
          <p className="text-display-sm md:text-display">安心落脚，从校园开始。</p>
          <p className="text-h1-sm md:text-h1">h1 · 1735 Chicago Ave 2B1B 整租</p>
          <p className="text-h2">h2 · 热门房源 Hot sublets</p>
          <p className="text-h3">h3 · 房源信息 Details</p>
          <p className="text-body-lg text-ink">body-lg · 步行 8 分钟到校，6 月 15 日可入住。Settle in safely, starting at campus.</p>
          <p className="text-body text-ink-2">body ink-2 · 2 室 1 卫 · 带家具 · 6 月 15 日 – 8 月 31 日</p>
          <p className="text-small text-ink-3">small ink-3 · 0.6 mi · 步行 8 分钟 · 校车 2 分钟</p>
          <p className="text-caption text-ink-2">caption · 标签 LABEL</p>
          <p className="flex items-baseline gap-4">
            <span className="text-price-lg">$1,250</span>
            <span className="text-price">$1,250/mo</span>
            <span className="font-mono text-body">A7K2-9Q</span>
            <Kbd>⌘K</Kbd>
          </p>
        </div>
      </Block>

      <Block title="Formatters">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-small">
          <dt className="text-ink-3">formatMoney</dt>
          <dd>{formatMoney(125000, { perMonth: true })} · {formatMoney(4050)} · {formatMoney(90000, { perMonth: true, compact: true })}</dd>
          <dt className="text-ink-3">formatDate</dt>
          <dd>{formatDate('2026-06-15')} · {formatDate('2024-09-01', 'long')} · {formatDate('2026-06-15T14:02:00Z', 'time')}</dd>
          <dt className="text-ink-3">formatDateRange</dt>
          <dd>{formatDateRange('2026-06-15', '2026-08-31', { months: true })}</dd>
          <dt className="text-ink-3">formatRelative</dt>
          <dd>
            {formatRelative(new Date(Date.now() - 20_000))} · {formatRelative(new Date(Date.now() - 5 * 60_000))} · {formatRelative(new Date(Date.now() - 26 * 3600_000))} ·{' '}
            {formatRelative(new Date(Date.now() - 3 * 86400_000))}
          </dd>
          <dt className="text-ink-3">formatDistance</dt>
          <dd>{formatDistance(965)} · {formatDistance(80)} · {formatMinutes(8, 'walk')} · {formatRooms(2, 1)}</dd>
        </dl>
      </Block>

      <Block title="Button">
        {(['primary', 'secondary', 'ghost', 'danger'] as const).map((v) => (
          <div key={v} className="flex flex-wrap items-center gap-2">
            <Button variant={v} size="sm">
              {v} sm
            </Button>
            <Button variant={v} iconLeft={<Plus />}>
              {v} md
            </Button>
            <Button variant={v} size="lg" iconRight={<Share2 />}>
              {v} lg
            </Button>
            <Button variant={v} loading>
              loading
            </Button>
            <Button variant={v} disabled>
              disabled
            </Button>
            <Button variant={v} iconOnly aria-label="Settings">
              <Settings />
            </Button>
          </div>
        ))}
        <Button fullWidth variant="primary" size="lg">
          {locale === 'zh-CN' ? '联系房东' : 'Message host'} (fullWidth)
        </Button>
        <Button asChild variant="secondary" iconLeft={<Home />}>
          <a href="#button">asChild link</a>
        </Button>
      </Block>

      <Block title="Input / Textarea / Select" cols>
        <Input label={locale === 'zh-CN' ? '邮箱' : 'Email'} placeholder="you@u.northwestern.edu" iconLeft={<Mail />} hint={locale === 'zh-CN' ? '请使用 .edu 邮箱' : 'Use your .edu address'} clearable value={val} onChange={(e) => setVal(e.target.value)} />
        <Input label={locale === 'zh-CN' ? '月租' : 'Monthly rent'} prefix="$" suffix="/mo" type="number" defaultValue="1250" required />
        <Input label="Error" error={locale === 'zh-CN' ? '密码至少 8 位' : 'Password must be at least 8 characters'} defaultValue="abc" type="password" />
        <Input size="sm" placeholder="sm search" iconLeft={<Search />} />
        <Input size="lg" placeholder="lg" />
        <Input placeholder="disabled" disabled />
        <Textarea label={locale === 'zh-CN' ? '描述' : 'Description'} maxLength={500} showCount defaultValue="带家具，步行 8 分钟到校，6 月 15 日可入住。" optional />
        <Select label="Sort" options={options} value={sel} onChange={setSel} />
        <Select label="Campus (searchable)" options={campuses} value={null} onChange={() => {}} searchable placeholder={locale === 'zh-CN' ? '搜索学校或城市' : 'Search school or city'} />
        <Select label="Error" options={options} value={null} onChange={() => {}} error="Required" placeholder="—" />
        <Field label="Field wrapper" hint="hint text">
          <div className="rounded-ctl border border-line-strong bg-surface p-3 text-small text-ink-2">custom control</div>
        </Field>
      </Block>

      <Block title="Checkbox / Switch">
        <div className="flex flex-col">
          <Checkbox label={locale === 'zh-CN' ? '带家具' : 'Furnished'} checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <Checkbox label="Indeterminate" indeterminate checked={false} onChange={() => {}} description="some selected" />
          <Checkbox label="Disabled" disabled checked onChange={() => {}} />
          <Checkbox label="Error" error />
        </div>
        <div className="flex w-72 flex-col">
          <Switch label={locale === 'zh-CN' ? '仅接受已验证用户私信' : 'Verified-only messaging'} description="L1+" checked={sw} onChange={setSw} />
          <Switch label="sm" size="sm" checked={!sw} onChange={(v) => setSw(!v)} />
          <Switch label="disabled" checked disabled />
          <Switch checked={sw} onChange={setSw} aria-label="bare" />
        </div>
      </Block>

      <Block title="Chip / FilterChip / Badge / TrustBadge">
        <div className="flex flex-wrap gap-2">
          <Chip>九成新 Like new</Chip>
          <Chip variant="accent" icon={<Heart />}>
            新生 $50 奖励
          </Chip>
          <Chip variant="inverse" size="sm">
            inverse sm
          </Chip>
          <Chip onRemove={() => toast.info('removed')}>removable</Chip>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip selected={chips.furnished} onClick={() => setChips({ ...chips, furnished: !chips.furnished })}>
            {locale === 'zh-CN' ? '带家具' : 'Furnished'}
          </FilterChip>
          <FilterChip selected={chips.shuttle} icon={<Bus />} count={12} onClick={() => setChips({ ...chips, shuttle: !chips.shuttle })}>
            {locale === 'zh-CN' ? '近校车' : 'Near shuttle'}
          </FilterChip>
          <FilterChip menu={(close) => <div className="flex flex-col gap-3"><PriceRange value={price} onChange={setPrice} bounds={[0, 300000]} /><Button size="sm" onClick={close}>{t('ui.apply')}</Button></div>} selected={price[0] > 0}>
            {locale === 'zh-CN' ? '价格' : 'Price'}
          </FilterChip>
          <FilterChip disabled>disabled</FilterChip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['neutral', 'accent', 'success', 'warning', 'danger', 'info'] as const).map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
          <Badge variant="boosted" />
          <Badge variant="sponsored" />
          <Badge variant="pro" />
          <Badge variant="accent" icon={<Heart />} size="sm">
            匹配 92%
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {([0, 1, 2, 3] as const).map((l) => (
            <span key={l} className="flex items-center gap-2">
              <TrustBadge level={l} size="profile" />
              <TrustBadge level={l} size="card" />
              <TrustBadge level={l} size="inline" />
            </span>
          ))}
        </div>
      </Block>

      <Block title="Avatar">
        {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((s, i) => (
          <Avatar key={s} size={s} name={i % 2 ? '李同学' : 'Alice Wang'} trustLevel={i % 4} status={i === 2 ? 'online' : undefined} />
        ))}
        <Avatar size="lg" name="Photo" src={PHOTOS[0].src} trustLevel={3} />
        <AvatarStack users={[{ id: '1', name: '王' }, { id: '2', name: 'Bob', trustLevel: 2 }, { id: '3', name: 'Cy' }, { id: '4', name: 'D' }]} />
      </Block>

      <Block title="Card / Price">
        <Card className="w-64" padding="md">
          <p className="text-body font-semibold">default</p>
          <p className="text-small text-ink-2">bg-surface border line rounded-card</p>
        </Card>
        <Card className="w-64" interactive as="a" href="#card">
          <p className="text-body font-semibold">interactive</p>
          <p className="text-small text-ink-2">hover → line-strong + shadow-sm</p>
        </Card>
        <Card className="w-64" variant="sunken">
          <p className="text-body font-semibold">sunken</p>
        </Card>
        <Card className="w-64" variant="outline-accent">
          <p className="text-body font-semibold">outline-accent</p>
        </Card>
        <Card className="w-64 overflow-hidden" padding="none" interactive>
          <div className="aspect-[4/3] bg-sunken">
            <img src={PHOTOS[0].src} alt="" className="size-full object-cover dark:brightness-[.92]" />
            <Badge variant="boosted" className="absolute left-2 top-2" />
          </div>
          <div className="relative -mt-3.5 ml-3">
            <Price cents={125000} perMonth size="stub" />
          </div>
          <div className="flex flex-col gap-1 p-3 pt-2">
            <p className="text-small text-ink-2">2B1B · 带家具 · 6/15–8/31</p>
            <p className="truncate text-body font-semibold">1735 Chicago Ave, Evanston</p>
            <p className="flex items-center gap-1 text-small text-ink-3">
              <Footprints size={14} aria-hidden /> 步行 8 分钟 <Bus size={14} aria-hidden /> 2 分钟
            </p>
            <p className="flex items-center gap-2 text-small">
              <Avatar size="xs" name="李同学" trustLevel={2} /> 李同学 <TrustBadge level={2} size="card" />
            </p>
          </div>
        </Card>
        <div className="flex flex-col gap-2">
          <Price cents={125000} perMonth size="lg" />
          <Price cents={4000} obo />
          <Price cents={0} isFree />
          <Price cents={90000} maxCents={120000} />
          <Price cents={4050} size="inline" />
        </div>
      </Block>

      <Block title="Tabs / SegmentedControl">
        <Tabs
          className="w-full"
          items={[
            { key: 'all', label: locale === 'zh-CN' ? '全部' : 'All', count: 24 },
            { key: 'unread', label: locale === 'zh-CN' ? '未读' : 'Unread', count: 3 },
            { key: 'groups', label: locale === 'zh-CN' ? '群组' : 'Groups', icon: <Users /> },
            { key: 'archived', label: 'Archived', disabled: true },
          ]}
          value={tab}
          onChange={setTab}
        />
        <Tabs variant="pill" items={[{ key: 'all', label: '全部' }, { key: 'unread', label: '未读' }, { key: 'groups', label: '群组' }]} value={tab} onChange={setTab} />
        <SegmentedControl value={seg} onChange={setSeg} options={[{ value: 'map', label: locale === 'zh-CN' ? '地图' : 'Map', icon: <MapPin /> }, { value: 'list', label: locale === 'zh-CN' ? '列表' : 'List' }]} />
        <SegmentedControl size="sm" value={seg} onChange={setSeg} options={[{ value: 'map', label: '周' }, { value: 'list', label: '月' }]} />
      </Block>

      <Block title="FilterBar">
        <FilterBar
          className="w-full"
          scopeToggle={{ value: scope, onChange: setScope, campusLabel: 'Northwestern' }}
          chips={[
            { key: 'date', label: locale === 'zh-CN' ? '日期' : 'Dates', icon: <Calendar />, menu: <DateRange value={dates} onChange={setDates} /> },
            { key: 'furnished', label: locale === 'zh-CN' ? '带家具' : 'Furnished', selected: chips.furnished, onClick: () => setChips({ ...chips, furnished: !chips.furnished }) },
            { key: 'shuttle', label: locale === 'zh-CN' ? '近校车' : 'Near shuttle', selected: chips.shuttle, onClick: () => setChips({ ...chips, shuttle: !chips.shuttle }) },
            { key: 'pets', label: locale === 'zh-CN' ? '允许宠物' : 'Pets OK', selected: chips.pets, onClick: () => setChips({ ...chips, pets: !chips.pets }) },
          ]}
          onReset={() => setChips({ furnished: false, shuttle: false, pets: false })}
          resultCount={246}
          sort={{ value: sel ?? 'recent', options, onChange: setSel }}
          trailing={<SegmentedControl size="sm" value={seg} onChange={setSeg} options={[{ value: 'map', label: '地图' }, { value: 'list', label: '列表' }]} />}
        />
      </Block>

      <Block title="DateRange / PriceRange" cols>
        <DateRange label={locale === 'zh-CN' ? '可租时间' : 'Dates'} value={dates} onChange={setDates} presets={[{ label: locale === 'zh-CN' ? '整个暑假' : 'Whole summer', start: '2026-06-15', end: '2026-08-31' }, { label: locale === 'zh-CN' ? '秋季学期' : 'Fall quarter', start: '2026-09-15', end: '2026-12-15' }]} />
        <PriceRange label="Price" value={price} onChange={setPrice} bounds={[0, 300000]} histogram={[1, 2, 4, 6, 9, 12, 15, 14, 12, 10, 8, 7, 6, 5, 4, 4, 3, 2, 2, 1, 1, 1, 0, 1]} />
        <PriceRange value={[2000, 8000]} onChange={() => {}} bounds={[0, 20000]} step={500} unit="" disabled />
      </Block>

      <Block title="Modal / Sheet / Tooltip / DropdownMenu / Toast">
        <Button variant="secondary" onClick={() => setModal(true)}>
          Modal
        </Button>
        <Button variant="secondary" onClick={() => setSheet(true)}>
          Sheet
        </Button>
        <Tooltip content={locale === 'zh-CN' ? '推广房源由发布者付费置顶' : 'Boosted = paid placement'}>
          <Button variant="ghost" iconOnly aria-label="Tooltip">
            <Heart />
          </Button>
        </Tooltip>
        <DropdownMenu
          label="User menu"
          trigger={
            <Button variant="secondary" iconLeft={<User />}>
              Menu
            </Button>
          }
          items={[
            { label: locale === 'zh-CN' ? '我的档案' : 'My profile', icon: <User />, onSelect: () => toast.info('profile') },
            { label: locale === 'zh-CN' ? '编辑' : 'Edit', icon: <Pencil />, shortcut: 'E' },
            { label: 'Disabled', disabled: true },
            'separator',
            { label: locale === 'zh-CN' ? '退出' : 'Log out', icon: <LogOut />, danger: true },
            { label: locale === 'zh-CN' ? '删除' : 'Delete', icon: <Trash2 />, danger: true },
          ]}
        />
        <Button variant="ghost" onClick={() => toast.success(locale === 'zh-CN' ? '已切换到 UIUC' : 'Switched to UIUC')}>
          toast.success
        </Button>
        <Button variant="ghost" onClick={() => toast.error(locale === 'zh-CN' ? '出了点问题' : 'Something went wrong', locale === 'zh-CN' ? '请重试。' : 'Try again.', { label: t('ui.retry'), onClick: () => {} })}>
          toast.error
        </Button>
        <Button variant="ghost" onClick={() => toast.info('Info', 'description')}>
          toast.info
        </Button>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title={locale === 'zh-CN' ? '你要发布什么？' : 'What are you posting?'}
          description="Modal sm → Sheet below md"
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setModal(false)}>
                {t('ui.cancel')}
              </Button>
              <Button onClick={() => setModal(false)}>{t('ui.confirm')}</Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <Input label="Name" placeholder="…" />
            <Checkbox label="Agree" />
          </div>
        </Modal>
        <Sheet open={sheet} onClose={() => setSheet(false)} title="Sheet" footer={<Button fullWidth onClick={() => setSheet(false)}>{t('ui.confirm')}</Button>}>
          <p className="text-body text-ink-2">Drag the handle down to dismiss.</p>
          <div className="h-64" />
        </Sheet>
      </Block>

      <Block title="Skeleton / Spinner / EmptyState" cols>
        <Skeleton variant="listing-card" />
        <Skeleton variant="item-card" />
        <Skeleton variant="buddy-card" />
        <Skeleton variant="row" />
        <Skeleton variant="text" lines={3} />
        <div className="flex items-center gap-4">
          <Skeleton variant="circle" width={40} />
          <Skeleton variant="rect" height={40} />
          <Spinner />
          <Spinner size={24} className="text-accent" />
        </div>
        <Card className="sm:col-span-2 lg:col-span-3">
          <EmptyState icon={Home} title={locale === 'zh-CN' ? '这里还没有房源' : 'No listings here yet'} description={locale === 'zh-CN' ? '换个校区看看，或者第一个发布。' : 'Try another campus, or be the first to post.'} action={{ label: locale === 'zh-CN' ? '切换到全美' : 'Go nationwide' }} secondaryAction={<Button variant="ghost">{t('ui.retry')}</Button>} />
          <EmptyState size="sm" icon={Search} title="sm" />
        </Card>
      </Block>

      <Block title="PageHeader / Section / Divider">
        <div className="w-full">
          <PageHeader
            title={locale === 'zh-CN' ? '转租房源' : 'Sublets'}
            subtitle="246 条房源 · 58 个求租"
            breadcrumb={[{ label: '转租', to: '#' }, { label: 'Northwestern', to: '#' }, { label: '1735 Chicago Ave' }]}
            back
            actions={
              <>
                <Button variant="ghost" size="sm" iconLeft={<Share2 />}>
                  {locale === 'zh-CN' ? '分享' : 'Share'}
                </Button>
                <Button size="sm" iconLeft={<Plus />}>
                  {locale === 'zh-CN' ? '发布' : 'Post'}
                </Button>
              </>
            }
          />
          <Section title="热门房源 Hot sublets" to="#" className="mt-6">
            <p className="text-small text-ink-3">section body</p>
          </Section>
          <Divider className="my-4" label="或 / or" />
        </div>
      </Block>

      <Block title="Pagination">
        <Pagination page={page} pageSize={20} total={246} onChange={setPage} variant="numbers" />
        <Pagination page={1} pageSize={20} total={246} onChange={() => {}} variant="loadMore" />
      </Block>

      <Block title="PhotoGallery / PhotoUploader">
        <div className="w-full">
          <PhotoGallery photos={PHOTOS} />
        </div>
        <div className="w-full">
          <PhotoGallery photos={PHOTOS.slice(0, 4)} layout="grid" />
        </div>
        <div className="w-full">
          <PhotoUploader files={files} onChange={setFiles} max={10} upload={async (file) => ({ id: 'mock', url: URL.createObjectURL(file) })} />
        </div>
      </Block>

      <Block title="StatTile / Table">
        <div className="grid w-full grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatTile label="DAU" value={1240} delta={{ value: 12.5, direction: 'up' }} spark={[3, 4, 3, 5, 6, 7, 6, 8]} />
          <StatTile label="GMV" value={1250000} format="money" delta={{ value: 3.1, direction: 'down' }} spark={[8, 7, 7, 6, 6, 5, 6, 5]} selected />
          <StatTile label="转化率" value={0.034} format="percent" delta={{ value: 0, direction: 'flat' }} hint="浏览 → 联系" />
          <StatTile label="举报" value={3} delta={{ value: 40, direction: 'down' }} invertDelta />
          <StatTile label="新房源" value={58} />
          <StatTile label="推广收入" value={48900} format="money" />
        </div>
        <Table<Row>
          className="w-full"
          caption="Users"
          columns={[
            { key: 'name', header: locale === 'zh-CN' ? '用户' : 'User', render: (r) => <span className="flex items-center gap-2"><Avatar size="xs" name={r.name} trustLevel={r.trust} />{r.name}<TrustBadge level={r.trust} /></span>, sortable: true },
            { key: 'email', header: 'Email', hideOnMobile: true },
            { key: 'listings', header: locale === 'zh-CN' ? '房源' : 'Listings', align: 'right', sortable: true },
            { key: 'gmv', header: 'GMV', align: 'right', sortable: true, render: (r) => formatMoney(r.gmv) },
          ]}
          rows={[...ROWS].sort((a, b) => (sort ? ((a[sort.key as keyof Row] > b[sort.key as keyof Row] ? 1 : -1) * (sort.dir === 'asc' ? 1 : -1)) : 0))}
          rowKey="id"
          selectable
          selected={tsel}
          onSelectChange={setTsel}
          sort={sort}
          onSort={(key, dir) => setSort({ key, dir })}
          rowActions={() => (
            <Button variant="ghost" size="sm" iconOnly aria-label="Edit">
              <Pencil />
            </Button>
          )}
        />
        <Table<Row> className="w-full" columns={[{ key: 'name', header: 'Loading' }, { key: 'email', header: 'Email' }]} rows={[]} rowKey="id" loading skeletonRows={2} />
        <Table<Row> className="w-full" columns={[{ key: 'name', header: 'Empty' }]} rows={[]} rowKey="id" />
      </Block>
    </div>
  )
}
