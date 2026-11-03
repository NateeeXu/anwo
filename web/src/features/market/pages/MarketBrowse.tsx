// /market — DESIGN.md §7.11 browse: category chips, FilterBar (condition / price + 免费 / OBO / delivery, sort, scope toggle),
// grid of square ItemCards or map of pickup pins labelled by price. Filters live in the URL so results are shareable.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleAlert, Globe, LayoutGrid, Map as MapIcon, Plus, Search, Truck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import type { MarketCategory } from '@shared/enums';
import { Button, Checkbox, EmptyState, FilterBar, Input, Pagination, PriceRange, SegmentedControl, Skeleton, Switch, type FilterChipItem } from '@/components';
import { NoItems } from '@/components/illustrations';
import { MapView, type MapMarker } from '@/components/map';
import { Head } from '@/app/Head';
import { SecondaryTabs } from '@/app/shell/SecondaryTabs';
import { usePostSheet } from '@/app/shell/shellStore';
import { useAuth } from '@/lib/auth';
import { useCampus } from '@/lib/campus';
import { campusCenter } from '@/lib/geo';
import { useDebounce, useIsMobile } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { useCategories, useItemPins, useItems, type ItemListParams } from '../api';
import { CategoryChips } from '../components/CategoryChips';
import { ItemCard } from '../components/ItemCard';
import { CONDITIONS } from '../components/shared';

const PAGE_SIZE = 24;
const PRICE_BOUNDS: [number, number] = [0, 100_000];

function ConditionMenu({ value, onApply, close }: { value: string[]; onApply: (v: string[]) => void; close: () => void }) {
  const t = useT();
  const [local, setLocal] = useState<string[]>(value);
  return (
    <div className="flex w-64 max-w-full flex-col gap-1 p-2">
      {CONDITIONS.map((c) => (
        <Checkbox key={c} label={t(`market.cond.${c}`)} description={t(`market.cond.hint.${c}`)} checked={local.includes(c)} onChange={(e) => setLocal(e.target.checked ? [...local, c] : local.filter((x) => x !== c))} />
      ))}
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => { onApply([]); close(); }}>{t('market.filter.clear')}</Button>
        <Button size="sm" onClick={() => { onApply(local); close(); }}>{t('market.filter.apply')}</Button>
      </div>
    </div>
  );
}

function PriceMenu({ min, max, free, onApply, close }: { min: number | null; max: number | null; free: boolean; onApply: (v: { min: number | null; max: number | null; free: boolean }) => void; close: () => void }) {
  const t = useT();
  const [range, setRange] = useState<[number, number]>([min ?? PRICE_BOUNDS[0], max ?? PRICE_BOUNDS[1]]);
  const [onlyFree, setOnlyFree] = useState(free);
  return (
    <div className="flex w-80 max-w-full flex-col gap-4 p-3">
      <PriceRange value={range} onChange={setRange} bounds={PRICE_BOUNDS} step={500} unit="" aria-label={t('market.filter.price')} className={cn(onlyFree && 'pointer-events-none opacity-50')} />
      <Switch checked={onlyFree} onChange={setOnlyFree} label={t('market.filter.freeOnly')} size="sm" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => { onApply({ min: null, max: null, free: false }); close(); }}>{t('market.filter.clear')}</Button>
        <Button size="sm" onClick={() => { onApply({ min: onlyFree ? null : range[0] > PRICE_BOUNDS[0] ? range[0] : null, max: onlyFree ? null : range[1] < PRICE_BOUNDS[1] ? range[1] : null, free: onlyFree }); close(); }}>
          {t('market.filter.apply')}
        </Button>
      </div>
    </div>
  );
}

export default function MarketBrowse() {
  const t = useT();
  const { formatMoney, formatPrice } = useLocale();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { campus, campusId, scope, setScope } = useCampus();
  const { status: authStatus } = useAuth();
  const { open: openPost } = usePostSheet();
  const [sp, setSp] = useSearchParams();

  // ---- URL state
  const q = sp.get('q') ?? '';
  const category = (sp.get('category') as MarketCategory | null) || null;
  const conditions = useMemo(() => (sp.get('condition') ?? '').split(',').filter(Boolean), [sp]);
  const free = sp.get('free') === '1';
  const obo = sp.get('obo') === '1';
  const delivery = (sp.get('delivery') as 'pickup' | 'delivery' | null) || null;
  const priceMin = sp.get('min') ? Number(sp.get('min')) * 100 : null;
  const priceMax = sp.get('max') ? Number(sp.get('max')) * 100 : null;
  const sort = sp.get('sort') ?? (q ? 'relevance' : 'recent');
  const view = sp.get('view') === 'map' ? 'map' : 'grid';
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const [searchText, setSearchText] = useState(q);
  const debouncedSearch = useDebounce(searchText, 350);

  const setParams = useCallback(
    (patch: Record<string, string | null>, opts: { keepPage?: boolean } = {}) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (!opts.keepPage) next.delete('page');
      setSp(next, { replace: true });
    },
    [sp, setSp],
  );
  useEffect(() => {
    if (debouncedSearch !== q) setParams({ q: debouncedSearch || null, sort: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);
  useEffect(() => { setSearchText(q); }, [q]);

  const nationwide = scope === 'nationwide';
  const params: ItemListParams = useMemo(
    () => ({
      ...(nationwide ? { scope: 'nationwide' as const } : { campusId: campusId ?? undefined }),
      q: q || undefined, category: category ? [category] : undefined, condition: conditions.length ? conditions : undefined,
      free: free || undefined, obo: obo || undefined, delivery: delivery ?? undefined, priceMin: priceMin ?? undefined, priceMax: priceMax ?? undefined,
      sort, page, pageSize: PAGE_SIZE,
    }),
    [nationwide, campusId, q, category, conditions, free, obo, delivery, priceMin, priceMax, sort, page],
  );
  const enabled = !!campusId || nationwide;
  const list = useItems(params, enabled);
  const pins = useItemPins(params, enabled && view === 'map');
  const cats = useCategories(nationwide ? null : campusId);
  const counts = useMemo(() => Object.fromEntries((cats.data?.categories ?? []).map((c) => [c.key, c.count])), [cats.data]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  useEffect(() => { setActiveId(null); }, [params]);

  const anyFilter = !!(q || category || conditions.length || free || obo || delivery || priceMin !== null || priceMax !== null);
  const reset = () => { setSearchText(''); setSp(new URLSearchParams(view === 'map' ? { view: 'map' } : {}), { replace: true }); };

  const chips: FilterChipItem[] = [
    {
      key: 'condition', label: conditions.length ? `${t('market.filter.condition')} · ${conditions.length}` : t('market.filter.condition'), selected: conditions.length > 0, menuTitle: t('market.filter.condition'),
      menu: (close: () => void) => <ConditionMenu value={conditions} onApply={(v) => setParams({ condition: v.join(',') || null })} close={close} />,
    },
    {
      key: 'price',
      label: free ? t('market.filter.freeOnly') : priceMin !== null || priceMax !== null ? `${formatMoney(priceMin ?? 0)}–${priceMax !== null ? formatMoney(priceMax) : '∞'}` : t('market.filter.price'),
      selected: free || priceMin !== null || priceMax !== null, menuTitle: t('market.filter.price'),
      menu: (close: () => void) => <PriceMenu min={priceMin} max={priceMax} free={free} onApply={(v) => setParams({ min: v.min !== null ? String(v.min / 100) : null, max: v.max !== null ? String(v.max / 100) : null, free: v.free ? '1' : null })} close={close} />,
    },
    { key: 'free', label: t('market.filter.freeOnly'), selected: free, onClick: () => setParams({ free: free ? null : '1', min: null, max: null }) },
    { key: 'obo', label: t('market.filter.obo'), selected: obo, onClick: () => setParams({ obo: obo ? null : '1' }) },
    { key: 'delivery', label: t('market.filter.delivery'), icon: <Truck className="size-4" aria-hidden />, selected: delivery === 'delivery', onClick: () => setParams({ delivery: delivery === 'delivery' ? null : 'delivery' }) },
  ];
  const sortOptions = ['recent', 'relevance', 'price_asc', 'price_desc', 'distance', 'popular'].filter((s) => (s === 'relevance' ? !!q : s === 'distance' ? !nationwide : true)).map((s) => ({ value: s, label: t(`market.sort.${s}`) }));

  const markers: MapMarker[] = useMemo(
    () =>
      (pins.data?.pins ?? []).map((p) => ({
        id: p.id, lat: p.lat, lng: p.lng, kind: 'item' as const, label: formatPrice({ priceCents: p.priceCents, isFree: p.isFree }), title: p.title,
        selected: p.id === activeId, boosted: p.boostTier === 'plus' || p.boostTier === 'max', saved: p.wishlisted,
      })),
    [pins.data, activeId, formatPrice],
  );
  const activeItem = activeId ? list.data?.items.find((i) => i.id === activeId) ?? null : null;
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const title = nationwide ? t('market.subtitleNationwide') : t('market.subtitle', { campus: campus?.shortName ?? '' });

  const onPost = () => (authStatus === 'authed' ? navigate('/post/item') : openPost());

  const grid = (
    <>
      {list.isPending && enabled ? (
        <div aria-busy="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} variant="item-card" />)}
        </div>
      ) : list.isError ? (
        <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => void list.refetch() }} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<NoItems size={120} />}
          title={anyFilter ? t('market.empty.filtered') : t('market.empty.title')}
          description={anyFilter ? t('market.empty.filteredHint') : t('market.empty.hint')}
          action={anyFilter ? { label: t('market.empty.reset'), onClick: reset, variant: 'secondary' } : { label: t('market.post'), onClick: onPost }}
          secondaryAction={!nationwide ? <Button variant="ghost" iconLeft={<Globe className="size-4" aria-hidden />} onClick={() => setScope('nationwide')}>{t('market.empty.nationwide')}</Button> : undefined}
        />
      ) : (
        <>
          <div className={cn('grid gap-3 lg:gap-4', view === 'map' ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6')} aria-live="polite">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} showCampus={nationwide} active={view === 'map' && (item.id === activeId || item.id === hoverId)} onMouseEnter={() => setHoverId(item.id)} onMouseLeave={() => setHoverId(null)} onFocus={() => setHoverId(item.id)} onBlur={() => setHoverId(null)} />
            ))}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={(p) => setParams({ page: p > 1 ? String(p) : null }, { keepPage: true })} loading={list.isFetching} className="mt-6" />
        </>
      )}
    </>
  );

  const map = (
    <MapView
      center={campusCenter(campus)}
      zoom={14}
      height="100%"
      markers={[...markers, ...(campus && !nationwide ? [{ id: 'campus', kind: 'campus' as const, lat: campus.lat, lng: campus.lng, label: campus.shortName }] : [])]}
      hoveredId={hoverId}
      onMarkerHover={setHoverId}
      onMarkerClick={(id) => setActiveId(id === 'campus' ? null : id)}
      fitToMarkers={markers.length > 0}
      className="rounded-card"
      aria-label={t('market.view.map')}
      overlay={
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col items-start gap-2">
          <span className="rounded-pill bg-surface/95 px-3 py-1 text-caption text-ink-2">{pins.data && markers.length === 0 ? t('market.map.noPins') : t('market.map.pickupNear')}</span>
          {activeItem && isMobile && (
            <div className="pointer-events-auto w-full">
              <ItemCard item={activeItem} variant="row" className="shadow-md" />
            </div>
          )}
        </div>
      }
    />
  );

  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('market.title')} description={title} />
      <SecondaryTabs />
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h1 text-ink">{t('market.title')}</h1>
          <p className="text-small text-ink-2">{title}{list.data ? ` · ${t('market.count', { n: total })}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {authStatus === 'authed' && (
            <>
              <Button asChild variant="ghost" size="sm"><a href="/market/wishlist" onClick={(e) => { e.preventDefault(); navigate('/market/wishlist'); }}>{t('market.wishlist')}</a></Button>
              <Button asChild variant="secondary" size="sm"><a href="/market/mine" onClick={(e) => { e.preventDefault(); navigate('/market/mine'); }}>{t('market.mine')}</a></Button>
            </>
          )}
          <Button iconLeft={<Plus className="size-4" aria-hidden />} onClick={onPost}>{t('market.post')}</Button>
        </div>
      </div>

      <div className="mt-4">
        <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder={t('market.search.placeholder')} iconLeft={<Search className="size-4" aria-hidden />} clearable aria-label={t('ui.search')} />
      </div>
      <CategoryChips value={category} onChange={(c) => setParams({ category: c })} counts={nationwide ? undefined : counts} className="mt-3" />
      <FilterBar
        sticky
        chips={chips}
        onReset={anyFilter ? reset : undefined}
        resultCount={list.data ? total : undefined}
        sort={{ value: sort, options: sortOptions, onChange: (v) => setParams({ sort: v }) }}
        scopeToggle={{ value: scope, onChange: setScope, campusLabel: campus?.shortName }}
        trailing={
          <SegmentedControl
            size="sm"
            value={view}
            onChange={(v) => setParams({ view: v === 'map' ? 'map' : null }, { keepPage: true })}
            options={[{ value: 'grid', label: t('market.view.grid'), icon: <LayoutGrid className="size-4" aria-hidden /> }, { value: 'map', label: t('market.view.map'), icon: <MapIcon className="size-4" aria-hidden /> }]}
            label={t('market.view.map')}
          />
        }
        className="mt-2"
      />
      {nationwide && (
        <p className="mb-3 flex items-center gap-2 rounded-card bg-sunken px-3 py-2 text-small text-ink-2">
          <Globe className="size-4 shrink-0" aria-hidden />
          {t('market.nationwideNote')}
        </p>
      )}

      {view === 'map' ? (
        isMobile ? (
          <div className="h-[calc(100dvh-280px)] min-h-[360px]">{map}</div>
        ) : (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-5 max-h-[calc(100dvh-220px)] overflow-y-auto pr-1">{grid}</div>
            <div className="col-span-7 sticky top-16 h-[calc(100dvh-220px)] min-h-[480px]">{map}</div>
          </div>
        )
      ) : (
        grid
      )}
    </div>
  );
}
