// /listings — DESIGN.md §7.2. FilterBar + split list/map on desktop, SegmentedControl 地图/列表 on mobile, campus/nationwide scope,
// city search in nationwide mode, saved searches, hover sync between cards and price pins, bbox「在此区域搜索」.
import { Bus, Calendar, CircleAlert, DollarSign, Heart, LayoutGrid, Map as MapIcon, PawPrint, Plus, SlidersHorizontal, Sofa, Bed } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CAMPUSES } from '@shared/campuses';
import { Button, EmptyState, FilterBar, Input, PageHeader, Pagination, SegmentedControl, Select, Sheet, SkeletonList, VisuallyHidden } from '@/components';
import { NoListings, NoMapResults } from '@/components/illustrations';
import { MapView, useMapBounds, type MapMarker } from '@/components/map';
import { useAuth } from '@/lib/auth';
import { useCampus } from '@/lib/campus';
import { campusCenter, US_CENTER, US_ZOOM } from '@/lib/geo';
import { useIsMobile } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { session } from '@/lib/storage';
import { cn } from '@/lib/cn';
import { Head } from '@/app/Head';
import { SecondaryTabs } from '@/app/shell/SecondaryTabs';
import { usePostSheet } from '@/app/shell/shellStore';
import { keys, listingsApi } from '../api';
import { activeCount, EMPTY, fromSearchParams, isPristine, moreCount, SORTS, toQuery, toSearchParams, type Filters } from '../filters';
import { ListingCard } from '../components/ListingCard';
import { BedroomsControl, DatesControl, MoreFilters, PriceControl } from '../components/FilterControls';
import { SavedSearches } from '../components/SavedSearches';

const PAGE_SIZE = 20;
const VISITED_KEY = 'anwo.listings.visited';
const RADII_MI = [5, 10, 25];

function useVisited() {
  const [visited, setVisited] = useState<Set<string>>(() => new Set(session.get<string[]>(VISITED_KEY, [])));
  useEffect(() => {
    const onFocus = () => setVisited(new Set(session.get<string[]>(VISITED_KEY, [])));
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  return visited;
}
export function markVisited(id: string) {
  const list = session.get<string[]>(VISITED_KEY, []);
  if (!list.includes(id)) session.set(VISITED_KEY, [...list, id].slice(-100));
}

/** Matches 「NYU」 / 「Northwestern」 / 「Chicago, IL」 against the campus list for the nationwide city search. */
function resolveCity(input: string): { city: string; state: string; lat?: number; lng?: number } | null {
  const s = input.trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  const campus = CAMPUSES.find((c) => c.shortName.toLowerCase() === lower || c.name.toLowerCase() === lower || c.slug === lower || (c.nameZh && c.nameZh === s));
  if (campus) return { city: campus.city, state: campus.state, lat: campus.lat, lng: campus.lng };
  const m = /^(.+?),\s*([A-Za-z]{2})$/.exec(s);
  if (m) return { city: m[1]!.trim(), state: m[2]!.toUpperCase() };
  const byCity = CAMPUSES.find((c) => c.city.toLowerCase() === lower);
  if (byCity) return { city: byCity.city, state: byCity.state, lat: byCity.lat, lng: byCity.lng };
  return null;
}

export default function Browse() {
  const t = useT();
  const { formatNumber } = useLocale();
  const isMobile = useIsMobile();
  const { status } = useAuth();
  const { campus, campusId, scope, setScope } = useCampus();
  const { open: openPost } = usePostSheet();
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => fromSearchParams(sp), [sp]);
  const nationwide = scope === 'nationwide';
  const visited = useVisited();

  const patch = useCallback((p: Partial<Filters>) => {
    const next = { ...fromSearchParams(new URLSearchParams(window.location.search)), ...p };
    setSp(toSearchParams(next, new URLSearchParams(window.location.search)), { replace: true });
  }, [setSp]);
  const reset = () => setSp(toSearchParams({ ...EMPTY, q: filters.q, city: filters.city, state: filters.state }, sp), { replace: true });

  // ---------------- view + map state
  const [view, setView] = useState<'list' | 'map'>(sp.get('view') === 'map' ? 'map' : 'list');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>(filters);
  const bounds = useMapBounds({ debounceMs: 300 });
  const [bbox, setBbox] = useState<string | null>(null);
  const [cityInput, setCityInput] = useState(filters.city ? `${filters.city}, ${filters.state ?? ''}` : '');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setBbox(null); }, [campusId, scope, filters.city, filters.state]);

  // ---------------- queries
  const cityResolved = useMemo(() => (filters.city ? resolveCity(`${filters.city}, ${filters.state ?? ''}`) : null), [filters.city, filters.state]);
  const scopeParams = useMemo(() => {
    if (nationwide) {
      const base: Record<string, string | number | undefined> = { scope: 'nationwide' };
      if (filters.city && filters.state) { base.city = filters.city; base.state = filters.state; }
      if (filters.radiusKm && cityResolved?.lat !== undefined) { base.lat = cityResolved.lat; base.lng = cityResolved.lng; base.radiusKm = filters.radiusKm; delete base.city; delete base.state; }
      return base;
    }
    return { campusId: campusId ?? undefined, scope: 'campus' as const, radiusKm: filters.radiusKm ?? undefined };
  }, [nationwide, campusId, filters.city, filters.state, filters.radiusKm, cityResolved]);
  const filterQuery = useMemo(() => { const q = toQuery(filters); delete q.city; delete q.state; delete q.radiusKm; return q; }, [filters]);
  const listParams = { ...scopeParams, ...filterQuery, bbox: bbox ?? undefined, page: filters.page, pageSize: PAGE_SIZE };
  const enabled = nationwide || !!campusId;

  const list = useQuery({ queryKey: keys.list(listParams), queryFn: () => listingsApi.list(listParams), enabled, placeholderData: keepPreviousData });
  const pins = useQuery({ queryKey: keys.pins({ ...scopeParams, ...filterQuery, bbox: bbox ?? undefined }), queryFn: () => listingsApi.pins({ ...scopeParams, ...filterQuery, bbox: bbox ?? undefined }), enabled, placeholderData: keepPreviousData });
  const stats = useQuery({ queryKey: keys.stats({ ...scopeParams, ...filterQuery }), queryFn: () => listingsApi.priceStats({ ...scopeParams, ...filterQuery }), enabled, staleTime: 5 * 60_000 });

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  // ---------------- map
  const markers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = (pins.data?.pins ?? []).map((p) => ({
      id: p.id, lat: p.lat, lng: p.lng, kind: 'listing', label: `$${Math.round(p.priceCents / 100).toLocaleString('en-US')}`,
      selected: p.id === activeId, boosted: p.boostTier === 'plus' || p.boostTier === 'max', saved: p.saved, muted: visited.has(p.id) && p.id !== activeId,
    }));
    if (!nationwide && campus) out.push({ id: 'campus', kind: 'campus', lat: campus.lat, lng: campus.lng, label: campus.shortName });
    return out;
  }, [pins.data, activeId, visited, nationwide, campus]);
  const mapCenter = useMemo(() => (nationwide ? (cityResolved?.lat !== undefined ? ([cityResolved.lat, cityResolved.lng!] as [number, number]) : US_CENTER) : campusCenter(campus)), [nationwide, cityResolved, campus]);
  const mapZoom = nationwide ? (cityResolved?.lat !== undefined ? 12 : US_ZOOM) : 14;

  const onMarkerClick = useCallback((id: string) => {
    if (id === 'campus') return;
    setActiveId(id);
    const el = listRef.current?.querySelector<HTMLElement>(`[data-listing-id="${id}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el?.querySelector<HTMLElement>('a')?.focus({ preventScroll: true });
  }, []);
  const searchArea = () => { if (bounds.bboxParam) { setBbox(bounds.bboxParam); bounds.commit(); patch({ page: 1 }); } };

  // ---------------- chips
  const sortOptions = useMemo(() => [...(filters.q ? ['relevance' as const] : []), ...SORTS].map((s) => ({ value: s, label: t(`listings.sort.${s}`) })), [t, filters.q]);
  const chips = [
    { key: 'dates', label: t('listings.filter.dates'), icon: <Calendar className="size-4" />, selected: !!(filters.availableFrom || filters.availableTo), menuTitle: t('listings.filter.dates'), menu: <DatesControl f={filters} patch={patch} /> },
    { key: 'price', label: t('listings.filter.price'), icon: <DollarSign className="size-4" />, selected: filters.priceMin !== null || filters.priceMax !== null, menuTitle: t('listings.filter.priceTitle'), menu: <PriceControl f={filters} patch={patch} stats={stats.data} /> },
    { key: 'bedrooms', label: t('listings.filter.bedrooms'), icon: <Bed className="size-4" />, selected: filters.bedrooms.length > 0 || filters.bathroomsMin !== null, count: filters.bedrooms.length || undefined, menuTitle: t('listings.filter.bedroomsTitle'), menu: <BedroomsControl f={filters} patch={patch} /> },
    { key: 'furnished', label: t('listings.filter.furnished'), icon: <Sofa className="size-4" />, selected: filters.furnished.length > 0, onClick: () => patch({ furnished: filters.furnished.length ? [] : ['full', 'partial'], page: 1 }) },
    { key: 'shuttle', label: t('listings.filter.nearShuttle'), icon: <Bus className="size-4" />, selected: filters.nearShuttle, onClick: () => patch({ nearShuttle: !filters.nearShuttle, page: 1 }) },
    { key: 'pets', label: t('listings.filter.pets'), icon: <PawPrint className="size-4" />, selected: filters.petsAllowed, onClick: () => patch({ petsAllowed: !filters.petsAllowed, page: 1 }) },
    { key: 'more', label: t('listings.browse.moreFilters'), icon: <SlidersHorizontal className="size-4" />, selected: moreCount(filters) > 0, count: moreCount(filters) || undefined, onClick: () => { setDraft(filters); setSheetOpen(true); } },
  ];

  const applyCity = () => {
    const r = resolveCity(cityInput);
    if (!r) { patch({ city: null, state: null, page: 1 }); return; }
    if (!nationwide) setScope('nationwide');
    patch({ city: r.city, state: r.state, page: 1 });
  };

  const pristine = isPristine(filters);
  const viewToggle = (
    <SegmentedControl
      size="sm"
      label={t('listings.browse.view')}
      className="md:hidden"
      value={view}
      onChange={(v) => { setView(v); const next = new URLSearchParams(sp); if (v === 'map') next.set('view', 'map'); else next.delete('view'); setSp(next, { replace: true }); }}
      options={[{ value: 'map', label: t('listings.browse.viewMap'), icon: <MapIcon className="size-4" /> }, { value: 'list', label: t('listings.browse.viewList'), icon: <LayoutGrid className="size-4" /> }]}
    />
  );
  const title = t('listings.title');
  const subtitle = list.data ? (nationwide ? t('listings.browse.subtitleNationwide', { count: formatNumber(total) }) : t('listings.browse.subtitle', { count: formatNumber(total) })) : undefined;

  const empty = (
    <EmptyState
      icon={bbox ? <NoMapResults size={120} /> : <NoListings size={120} />}
      title={pristine && !bbox ? t('empty.listings') : t('listings.browse.emptyFiltered')}
      description={pristine && !bbox ? t('empty.listingsHint') : t('listings.browse.emptyFilteredHint')}
      action={
        pristine && !bbox
          ? nationwide
            ? { label: t('listings.browse.emptyPost'), onClick: () => openPost() }
            : { label: t('listings.browse.emptyNationwide'), onClick: () => setScope('nationwide') }
          : { label: t('listings.browse.emptyReset'), onClick: () => { reset(); setBbox(null); bounds.reset(); } }
      }
      secondaryAction={pristine && !bbox && !nationwide ? <Button variant="ghost" onClick={() => openPost()}>{t('listings.browse.emptyPost')}</Button> : undefined}
    />
  );

  const cards = (
    <div ref={listRef} className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4', isMobile && 'md:grid-cols-3')}>
      {items.map((l) => (
        <ListingCard key={l.id} listing={l} onHover={setHoverId} active={l.id === activeId || l.id === hoverId} visited={visited.has(l.id)} onClick={() => markVisited(l.id)} />
      ))}
    </div>
  );

  const listBody = list.isLoading ? (
    <SkeletonList count={6} variant="listing-card" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4" />
  ) : list.isError ? (
    <EmptyState icon={CircleAlert} title={t('listings.browse.loadError')} description={t('error.generic')} action={{ label: t('common.retry'), onClick: () => void list.refetch() }} />
  ) : items.length === 0 ? (
    empty
  ) : (
    <>
      {cards}
      <Pagination page={filters.page} pageSize={PAGE_SIZE} total={total} onChange={(p) => { patch({ page: p }); listRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }} loading={list.isFetching} className="mt-6" />
    </>
  );

  const map = (
    <MapView
      center={mapCenter}
      zoom={mapZoom}
      height="100%"
      markers={markers}
      hoveredId={hoverId}
      onMarkerHover={setHoverId}
      onMarkerClick={onMarkerClick}
      onBoundsChange={bounds.onBoundsChange}
      fitToMarkers={!bbox}
      clusterThreshold={nationwide ? 1 : 60}
      className="size-full"
      overlay={
        bounds.moved && !bbox ? (
          <Button size="sm" variant="secondary" onClick={searchArea}>{t('listings.browse.searchArea')}</Button>
        ) : bbox ? (
          <Button size="sm" variant="secondary" onClick={() => { setBbox(null); bounds.reset(); }}>{t('listings.browse.reset')}</Button>
        ) : null
      }
    />
  );

  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={title} description={subtitle} />
      <SecondaryTabs />
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2">
            {status === 'authed' && (
              <>
                <Button asChild variant="ghost" size="sm" iconLeft={<Heart className="size-4" />} className="max-md:hidden"><Link to="/listings/saved">{t('listings.browse.saved')}</Link></Button>
                <Button asChild variant="secondary" size="sm" className="max-md:hidden"><Link to="/listings/mine">{t('listings.browse.mine')}</Link></Button>
              </>
            )}
            <Button size="sm" iconLeft={<Plus className="size-4" />} onClick={() => openPost()} className="hidden md:inline-flex">{t('listings.browse.post')}</Button>
            {viewToggle}
          </div>
        }
      />

      <FilterBar
        sticky
        chips={chips}
        onReset={activeCount(filters) ? reset : undefined}
        resultCount={list.data ? total : undefined}
        sort={{ value: filters.sort, options: sortOptions, onChange: (v) => patch({ sort: v as Filters['sort'], page: 1 }) }}
        scopeToggle={{ value: scope, onChange: (v) => { setScope(v); patch({ page: 1 }); }, campusLabel: campus?.shortName }}
        trailing={<div className="hidden md:block"><SavedSearches filters={filters} onApply={(f) => setSp(toSearchParams(f, sp), { replace: true })} pristine={pristine} /></div>}
      />

      {nationwide && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <Input
            label={t('listings.browse.citySearch')}
            hint={t('listings.browse.cityHint')}
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyCity(); }}
            clearable
            size="sm"
            className="sm:w-80"
            iconLeft={<MapIcon className="size-4" />}
          />
          <Select
            label={t('listings.browse.radius')}
            size="sm"
            className="sm:w-32"
            value={filters.radiusKm ? String(Math.round(filters.radiusKm / 1.609)) : 'any'}
            onChange={(v) => patch({ radiusKm: v === 'any' ? null : Math.round(Number(v) * 1.609 * 10) / 10, page: 1 })}
            options={[{ value: 'any', label: t('listings.filter.any') }, ...RADII_MI.map((n) => ({ value: String(n), label: t('listings.browse.radiusMi', { n }) }))]}
          />
          <Button size="sm" variant="secondary" onClick={applyCity} className="self-start sm:self-auto">{t('ui.search')}</Button>
        </div>
      )}

      <VisuallyHidden><p aria-live="polite">{list.data ? t('listings.browse.resultsAnnounce', { count: total }) : ''}</p></VisuallyHidden>

      {isMobile ? (
        <div className="mt-4">
          {view === 'map' ? (
            <div className="relative -mx-4 h-[calc(100dvh-280px)] min-h-[380px]">
              {map}
              {items.length > 0 && (
                <div className="absolute inset-x-0 bottom-3 z-layer-raised flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 no-scrollbar" ref={listRef}>
                  {items.map((l) => (
                    <ListingCard key={l.id} listing={l} variant="row" active={l.id === activeId} visited={visited.has(l.id)} onClick={() => markVisited(l.id)} className="w-[300px] shrink-0 snap-center bg-surface shadow-md" />
                  ))}
                </div>
              )}
              {!list.isLoading && items.length === 0 && <div className="absolute inset-x-4 top-4 z-layer-raised rounded-card bg-surface p-3 text-small text-ink-2 shadow-md">{t('listings.browse.emptyFiltered')}</div>}
            </div>
          ) : (
            listBody
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="min-w-0">{listBody}</div>
          <div className="sticky top-20 h-[calc(100vh-6.5rem)] min-h-[480px] overflow-hidden rounded-card border border-line bg-sunken">{map}</div>
        </div>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t('listings.browse.filters')}
        snap="full"
        footer={
          <div className="flex w-full items-center gap-2">
            <Button variant="ghost" onClick={() => setDraft({ ...EMPTY, q: draft.q, city: draft.city, state: draft.state })}>{t('listings.browse.reset')}</Button>
            <Button fullWidth onClick={() => { setSp(toSearchParams({ ...draft, page: 1 }, sp), { replace: true }); setSheetOpen(false); }}>
              {t('listings.browse.showResults', { count: formatNumber(total) })}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <Select label={t('listings.browse.sort')} size="sm" value={draft.sort} onChange={(v) => setDraft({ ...draft, sort: v as Filters['sort'] })} options={sortOptions} />
          <MoreFilters f={draft} patch={(p) => setDraft((d) => ({ ...d, ...p }))} full={isMobile} stats={stats.data} />
        </div>
      </Sheet>

      <Button className="fixed bottom-20 right-4 z-layer-nav shadow-lg md:hidden" size="md" iconLeft={<Plus className="size-4" />} onClick={() => openPost()}>{t('listings.browse.post')}</Button>
    </div>
  );
}
