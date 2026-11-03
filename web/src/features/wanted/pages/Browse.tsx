// /wanted — browse wanted posts (DESIGN §7.5): FilterBar (预算 / 日期 / 人数 / 户型 / 家具 / 校区|全美), row list, optional area map.
import { CalendarDays, CircleAlert, Home, List, Map as MapIcon, Plus, SlidersHorizontal, Users, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { WantedCard as WantedCardDto } from '@shared/types';
import { Button, DateRange, EmptyState, FilterBar, Pagination, PriceRange, SegmentedControl, Select, Sheet, Skeleton, type FilterChipItem } from '@/components';
import { MapView, type MapCircle, type MapMarker } from '@/components/map';
import { NoListings } from '@/components/illustrations';
import { useAuth } from '@/lib/auth';
import { useCampus } from '@/lib/campus';
import { campusCenter } from '@/lib/geo';
import { useIsMobile } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { Head } from '@/app/Head';
import { SecondaryTabs } from '@/app/shell/SecondaryTabs';
import { usePostSheet } from '@/app/shell/shellStore';
import { fetchWantedList, wantedKeys, type WantedFilters } from '../api';
import { BUDGET_BOUNDS, BUDGET_STEP } from '../lib';
import { OfferButton, WantedCard } from '../components/WantedCard';
import { OfferModal } from '../components/OfferModal';

const PAGE_SIZE = 20;
const SORTS = ['recent', 'budget_desc', 'budget_asc', 'move_in'] as const;

function readFilters(sp: URLSearchParams): WantedFilters {
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);
  const str = (k: string) => sp.get(k) || undefined;
  return {
    q: str('q'), budgetMin: num('budgetMin'), budgetMax: num('budgetMax'), moveInFrom: str('moveInFrom'), moveInTo: str('moveInTo'),
    groupSize: num('groupSize'), groupSizeMin: num('groupSizeMin'), bedroomsMin: num('bedroomsMin'),
    furnishedPref: str('furnishedPref') as WantedFilters['furnishedPref'], sort: (str('sort') as WantedFilters['sort']) ?? 'recent', page: num('page') ?? 1,
  };
}

export default function WantedBrowse() {
  const t = useT();
  const { formatMoneyRange, formatDate } = useLocale();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { campus, campusId, scope, setScope } = useCampus();
  const { open: openPostSheet } = usePostSheet();
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => readFilters(sp), [sp]);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [sheet, setSheet] = useState(false);
  const [offerFor, setOfferFor] = useState<WantedCardDto | null>(null);
  const nationwide = scope === 'nationwide';

  const setFilters = (patch: Partial<WantedFilters>, resetPage = true) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === null || v === '' || (k === 'sort' && v === 'recent')) next.delete(k);
      else next.set(k, String(v));
    }
    if (resetPage) next.delete('page');
    setSp(next, { replace: true });
  };
  const reset = () => {
    const next = new URLSearchParams();
    if (sp.get('campus')) next.set('campus', sp.get('campus')!);
    setSp(next, { replace: true });
  };

  const params = { ...(nationwide ? { scope: 'nationwide' } : { scope: 'campus', campusId: campusId ?? undefined }), ...filters, pageSize: PAGE_SIZE };
  const query = useQuery({
    queryKey: wantedKeys.list(params),
    queryFn: () => fetchWantedList(params),
    placeholderData: keepPreviousData,
    enabled: nationwide || !!campusId,
  });

  useEffect(() => {
    if (!nationwide && !campusId) navigate('/welcome?next=/wanted', { replace: true });
  }, [nationwide, campusId, navigate]);

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const budgetSelected = filters.budgetMin !== undefined || filters.budgetMax !== undefined;
  const dateSelected = !!(filters.moveInFrom || filters.moveInTo);
  const groupSelected = filters.groupSize !== undefined || filters.groupSizeMin !== undefined;
  const anySelected = budgetSelected || dateSelected || groupSelected || filters.bedroomsMin !== undefined || !!filters.furnishedPref;

  const budgetMenu = (close: () => void) => (
    <div className="flex w-[320px] max-w-full flex-col gap-3">
      <PriceRange
        value={[filters.budgetMin ?? BUDGET_BOUNDS[0], filters.budgetMax ?? BUDGET_BOUNDS[1]]}
        bounds={BUDGET_BOUNDS}
        step={BUDGET_STEP}
        unit="/mo"
        label={t('wanted.filter.budget')}
        onChange={([lo, hi]) => setFilters({ budgetMin: lo > BUDGET_BOUNDS[0] ? lo : undefined, budgetMax: hi < BUDGET_BOUNDS[1] ? hi : undefined })}
      />
      <p className="text-caption text-ink-3">{t('wanted.filter.budgetHint')}</p>
      <Button size="sm" variant="secondary" onClick={close}>{t('wanted.filter.done')}</Button>
    </div>
  );
  const dateMenu = (close: () => void) => (
    <div className="flex w-[560px] max-w-full flex-col gap-3">
      <DateRange
        label={t('wanted.filter.dates')}
        value={{ start: filters.moveInFrom ?? null, end: filters.moveInTo ?? null }}
        onChange={(v) => setFilters({ moveInFrom: v.start ?? undefined, moveInTo: v.end ?? undefined })}
        months={isMobile ? 1 : 2}
        presets={[
          { label: t('wanted.filter.presetWinter'), start: '2027-01-01', end: '2027-01-31' },
          { label: t('wanted.filter.presetSummer'), start: '2027-06-01', end: '2027-06-30' },
          { label: t('wanted.filter.presetFall'), start: '2027-08-15', end: '2027-09-30' },
        ]}
      />
      <Button size="sm" variant="secondary" onClick={close}>{t('wanted.filter.done')}</Button>
    </div>
  );
  const groupMenu = (close: () => void) => (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        size="sm"
        fullWidth
        label={t('wanted.filter.group')}
        value={filters.groupSizeMin === 3 ? '3+' : filters.groupSize ? String(filters.groupSize) : 'any'}
        onChange={(v) => { setFilters(v === 'any' ? { groupSize: undefined, groupSizeMin: undefined } : v === '3+' ? { groupSize: undefined, groupSizeMin: 3 } : { groupSize: Number(v), groupSizeMin: undefined }); close(); }}
        options={[{ value: 'any', label: t('wanted.filter.any') }, { value: '1', label: t('wanted.group.one') }, { value: '2', label: t('wanted.group.n', { n: 2 }) }, { value: '3+', label: t('wanted.group.plus', { n: 3 }) }]}
      />
    </div>
  );
  const bedroomsMenu = (close: () => void) => (
    <SegmentedControl
      size="sm"
      fullWidth
      label={t('wanted.filter.bedrooms')}
      value={filters.bedroomsMin ? String(filters.bedroomsMin) : 'any'}
      onChange={(v) => { setFilters({ bedroomsMin: v === 'any' ? undefined : Number(v) }); close(); }}
      options={[{ value: 'any', label: t('wanted.filter.any') }, { value: '1', label: '1+' }, { value: '2', label: '2+' }, { value: '3', label: '3+' }]}
    />
  );
  const furnishedMenu = (close: () => void) => (
    <SegmentedControl
      size="sm"
      fullWidth
      label={t('wanted.filter.furnished')}
      value={filters.furnishedPref ?? 'any'}
      onChange={(v) => { setFilters({ furnishedPref: v === 'any' ? undefined : (v as WantedFilters['furnishedPref']) }); close(); }}
      options={[{ value: 'any', label: t('wanted.filter.any') }, { value: 'partial', label: t('wanted.furnished.partial') }, { value: 'full', label: t('wanted.furnished.full') }]}
    />
  );

  const chips: FilterChipItem[] = [
    { key: 'budget', label: budgetSelected ? formatMoneyRange(filters.budgetMin ?? 0, filters.budgetMax ?? BUDGET_BOUNDS[1]) : t('wanted.filter.budget'), icon: <Wallet />, selected: budgetSelected, menu: budgetMenu, menuTitle: t('wanted.filter.budget') },
    { key: 'dates', label: dateSelected ? `${filters.moveInFrom ? formatDate(filters.moveInFrom, 'monthDay') : '…'} – ${filters.moveInTo ? formatDate(filters.moveInTo, 'monthDay') : '…'}` : t('wanted.filter.dates'), icon: <CalendarDays />, selected: dateSelected, menu: dateMenu, menuTitle: t('wanted.filter.dates') },
    { key: 'group', label: groupSelected ? (filters.groupSizeMin ? t('wanted.group.plus', { n: filters.groupSizeMin }) : t('wanted.group.n', { n: filters.groupSize! })) : t('wanted.filter.group'), icon: <Users />, selected: groupSelected, menu: groupMenu, menuTitle: t('wanted.filter.group') },
    { key: 'bedrooms', label: filters.bedroomsMin ? `${filters.bedroomsMin}+ ${t('wanted.filter.bedroomsShort')}` : t('wanted.filter.bedrooms'), icon: <Home />, selected: filters.bedroomsMin !== undefined, menu: bedroomsMenu, menuTitle: t('wanted.filter.bedrooms') },
    { key: 'furnished', label: filters.furnishedPref ? t(`wanted.furnished.${filters.furnishedPref}`) : t('wanted.filter.furnished'), selected: !!filters.furnishedPref, menu: furnishedMenu, menuTitle: t('wanted.filter.furnished') },
  ];
  const sortOptions = SORTS.map((s) => ({ value: s, label: t(`wanted.sort.${s}`) }));

  // map of areas (circles) + campus markers
  const circles: MapCircle[] = items.flatMap((w) => w.areas.filter((a) => a.kind === 'circle' && a.lat != null && a.lng != null).map((a) => ({ id: `${w.id}:${a.id}`, lat: a.lat!, lng: a.lng!, radiusM: a.radiusM ?? 1500, kind: 'area' as const })));
  const markers: MapMarker[] = useMemo(() => {
    const seen = new Map<string, MapMarker>();
    for (const w of items) {
      for (const a of w.areas) if (a.kind === 'circle' && a.lat != null && a.lng != null) seen.set(`${w.id}:${a.id}`, { id: `${w.id}:${a.id}`, lat: a.lat, lng: a.lng, kind: 'poi', label: `${a.label} · ${formatMoneyRange(w.budgetMinCents, w.budgetMaxCents)}` });
    }
    if (campus && !nationwide) seen.set('campus', { id: 'campus', kind: 'campus', lat: campus.lat, lng: campus.lng, label: campus.shortName });
    return [...seen.values()];
  }, [items, campus, nationwide, formatMoneyRange]);

  const title = t('wanted.browse.title');
  const subtitle = nationwide ? t('wanted.browse.subtitleNationwide') : campus ? t('wanted.browse.subtitle', { campus: campus.shortName }) : undefined;

  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={title} description={t('wanted.browse.metaDescription')} />
      <SecondaryTabs />
      <div className="flex items-end justify-between gap-3 py-4">
        <div className="min-w-0">
          <h1 className="text-h1 text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-small text-ink-2">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {user && (
            <Button asChild variant="ghost" size="sm" className="max-md:hidden"><Link to="/wanted/mine">{t('wanted.nav.mine')}</Link></Button>
          )}
          <Button variant="primary" size="sm" iconLeft={<Plus />} onClick={() => (user ? navigate('/post/wanted') : openPostSheet())}>
            {t('wanted.browse.post')}
          </Button>
        </div>
      </div>
      <FilterBar
        sticky
        scopeToggle={{ value: scope, onChange: (v) => setScope(v), campusLabel: campus?.shortName }}
        chips={isMobile ? [] : chips}
        onReset={anySelected ? reset : undefined}
        resultCount={query.data ? total : undefined}
        sort={{ value: filters.sort ?? 'recent', options: sortOptions, onChange: (v) => setFilters({ sort: v as WantedFilters['sort'] }), label: t('wanted.sort.label') }}
        trailing={
          <SegmentedControl
            size="sm"
            value={view}
            onChange={(v) => setView(v)}
            label={t('wanted.browse.view')}
            options={[{ value: 'list', label: t('wanted.browse.list'), icon: <List /> }, { value: 'map', label: t('wanted.browse.map'), icon: <MapIcon /> }]}
          />
        }
      >
        {isMobile && (
          <Button size="sm" variant={anySelected ? 'primary' : 'secondary'} iconLeft={<SlidersHorizontal />} onClick={() => setSheet(true)} className="shrink-0">
            {t('wanted.filter.title')}{anySelected ? ` · ${[budgetSelected, dateSelected, groupSelected, filters.bedroomsMin !== undefined, !!filters.furnishedPref].filter(Boolean).length}` : ''}
          </Button>
        )}
      </FilterBar>

      <div className={cn('grid gap-4 py-4', view === 'map' && 'lg:grid-cols-[minmax(0,1fr)_minmax(360px,42%)]')}>
        <div className="flex flex-col gap-3">
          {query.isPending ? (
            <div className="flex flex-col gap-3" aria-busy>
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} variant="row" height={120} />)}
            </div>
          ) : query.isError ? (
            <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => query.refetch() }} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<NoListings />}
              title={t('empty.wanted')}
              description={anySelected ? t('wanted.browse.emptyFiltered') : nationwide ? t('wanted.browse.emptyNationwide') : t('empty.wantedHint')}
              action={anySelected ? { label: t('wanted.filter.reset'), onClick: reset, variant: 'secondary' } : nationwide ? { label: t('wanted.browse.post'), onClick: () => (user ? navigate('/post/wanted') : openPostSheet()) } : { label: t('campus.switchNationwide'), onClick: () => setScope('nationwide'), variant: 'secondary' }}
            />
          ) : (
            <>
              <ul className={cn('flex flex-col gap-3', query.isFetching && 'opacity-70 transition-opacity')} aria-live="polite" aria-busy={query.isFetching}>
                {items.map((w) => (
                  <li key={w.id}>
                    <WantedCard
                      wanted={w}
                      nationwide={nationwide}
                      action={user && user.id !== w.author.id ? <OfferButton onClick={() => setOfferFor(w)} /> : undefined}
                    />
                  </li>
                ))}
              </ul>
              <Pagination page={filters.page ?? 1} pageSize={PAGE_SIZE} total={total} onChange={(p) => setFilters({ page: p }, false)} loading={query.isFetching} className="pt-2" />
            </>
          )}
        </div>
        {view === 'map' && (
          <div className="h-[360px] lg:sticky lg:top-20 lg:h-[calc(100dvh-10rem)]">
            <MapView
              center={nationwide ? [39.5, -98.35] : campusCenter(campus)}
              zoom={nationwide ? 4 : 13}
              height="100%"
              markers={markers}
              circles={circles}
              fitToMarkers={nationwide && markers.length > 1}
              clusterThreshold={Infinity}
              className="rounded-card"
              aria-label={t('wanted.browse.mapLabel')}
              onMarkerClick={(id) => { const wid = id.split(':')[0]; if (wid && wid !== 'campus') navigate(`/wanted/${wid}`); }}
            />
          </div>
        )}
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title={t('wanted.filter.title')} snap="full" footer={<Button fullWidth variant="primary" onClick={() => setSheet(false)}>{t('wanted.filter.show', { n: total })}</Button>}>
        <div className="flex flex-col gap-5">
          <Select label={t('wanted.sort.label')} value={filters.sort ?? 'recent'} options={sortOptions} onChange={(v) => setFilters({ sort: v as WantedFilters['sort'] })} />
          {budgetMenu(() => undefined)}
          {dateMenu(() => undefined)}
          {groupMenu(() => undefined)}
          {bedroomsMenu(() => undefined)}
          {furnishedMenu(() => undefined)}
          {anySelected && <Button variant="ghost" onClick={reset}>{t('wanted.filter.reset')}</Button>}
        </div>
      </Sheet>

      {offerFor && <OfferModal open onClose={() => setOfferFor(null)} wanted={offerFor} />}
    </div>
  );
}
