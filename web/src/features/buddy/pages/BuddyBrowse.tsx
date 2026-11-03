// /buddy — browse: type tabs + FilterBar (date / time of day / language / verified-only / has space) + list ⇄ calendar toggle.
import { useCallback, useMemo, useState } from 'react';
import { CalendarDays, CircleAlert, Clock, Globe, List, Lock, Plus, Users } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, Checkbox, DateRange, EmptyState, FilterBar, PageHeader, Pagination, SegmentedControl, SkeletonList, Tabs, type DateRangeValue } from '@/components';
import { NoBuddy } from '@/components/illustrations';
import { Head } from '@/app/Head';
import { SecondaryTabs } from '@/app/shell/SecondaryTabs';
import { useCampus } from '@/lib/campus';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { useBuddyList, type BuddyListParams } from '../api';
import { BuddyCard } from '../BuddyCard';
import { BuddyCalendar } from '../BuddyCalendar';
import { LANGUAGES, TIMES_OF_DAY, TYPE_TABS, shiftYmd, useBuddyTime } from '../shared';

const PAGE_SIZE = 18;

function weekendOf(todayYmd: string): { start: string; end: string } {
  const dow = new Date(`${todayYmd}T00:00:00Z`).getUTCDay(); // 0 = Sun
  const toSat = dow === 6 ? 0 : (6 - dow) % 7;
  const sat = shiftYmd(todayYmd, toSat);
  return { start: dow === 0 ? todayYmd : sat, end: dow === 0 ? todayYmd : shiftYmd(sat, 1) };
}

export default function BuddyBrowse() {
  const t = useT();
  const navigate = useNavigate();
  const { campus, campusId } = useCampus();
  const { status } = useAuth();
  const time = useBuddyTime();
  const [params, setParams] = useSearchParams();

  const tab = params.get('tab') ?? 'all';
  const view = (params.get('view') === 'calendar' ? 'calendar' : 'list') as 'list' | 'calendar';
  const dateFrom = params.get('from') ?? undefined;
  const dateTo = params.get('to') ?? undefined;
  const timeOfDay = params.get('time')?.split(',').filter(Boolean) ?? [];
  const language = params.get('lang')?.split(',').filter(Boolean) ?? [];
  const verifiedOnly = params.get('verified') === '1';
  const hasSpace = params.get('space') === '1';
  const sort = params.get('sort') ?? 'upcoming';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const q = params.get('q') ?? '';

  const set = useCallback(
    (patch: Record<string, string | null | undefined>, opts: { keepPage?: boolean } = {}) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (!opts.keepPage) next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const types = useMemo(() => TYPE_TABS.find((x) => x.key === tab)?.types ?? [], [tab]);
  const listParams: BuddyListParams = useMemo(
    () => ({ campusId: campusId ?? undefined, type: types, dateFrom, dateTo, timeOfDay, language, verifiedOnly, hasSpace, sort, page, pageSize: PAGE_SIZE, q, upcoming: !dateFrom && !dateTo && sort !== 'recent' }),
    [campusId, types, dateFrom, dateTo, timeOfDay.join(','), language.join(','), verifiedOnly, hasSpace, sort, page, q], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const list = useBuddyList(listParams, view === 'list' && !!campusId);
  const anyFilter = !!dateFrom || !!dateTo || timeOfDay.length > 0 || language.length > 0 || verifiedOnly || hasSpace || !!q;
  const [hoverId, setHoverId] = useState<string | null>(null);
  void hoverId;

  const dateLabel = dateFrom && dateTo ? (dateFrom === dateTo ? dateFrom.slice(5).replace('-', '/') : `${dateFrom.slice(5).replace('-', '/')}–${dateTo.slice(5).replace('-', '/')}`) : t('buddy.filter.date');
  const weekend = weekendOf(time.todayYmd);
  const presets = [
    { key: 'week', label: t('buddy.filter.thisWeek'), start: time.todayYmd, end: shiftYmd(time.todayYmd, 6) },
    { key: 'weekend', label: t('buddy.filter.weekend'), start: weekend.start, end: weekend.end },
    { key: 'next', label: t('buddy.filter.nextWeek'), start: shiftYmd(time.todayYmd, 7), end: shiftYmd(time.todayYmd, 13) },
  ];

  const toggleCsv = (key: 'time' | 'lang', value: string, current: string[]) => {
    const next = current.includes(value) ? current.filter((x) => x !== value) : [...current, value];
    set({ [key]: next.join(',') });
  };

  const reset = () => set({ from: null, to: null, time: null, lang: null, verified: null, space: null, q: null, sort: null });
  const total = list.data?.total ?? 0;
  const postAction = () => navigate(status === 'authed' ? '/post/buddy' : `/login?next=${encodeURIComponent('/post/buddy')}`);

  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('buddy.title')} description={t('buddy.subtitle')} />
      <SecondaryTabs />
      <PageHeader
        title={t('buddy.title')}
        subtitle={campus ? `${campus.shortName} · ${t('buddy.subtitle')}` : t('buddy.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            {status === 'authed' && (
              <Button variant="ghost" size="sm" iconLeft={<Users />} onClick={() => navigate('/buddy/mine')}>
                {t('buddy.browse.mine')}
              </Button>
            )}
            <Button variant="primary" size="sm" iconLeft={<Plus />} onClick={postAction}>
              {t('buddy.browse.post')}
            </Button>
          </div>
        }
        tabs={
          <Tabs
            variant="underline"
            scrollable
            label={t('buddy.form.typeLabel')}
            items={TYPE_TABS.map((x) => ({ key: x.key, label: t(x.labelKey) }))}
            value={tab}
            onChange={(k) => set({ tab: k === 'all' ? null : k })}
          />
        }
      />

      <FilterBar
        sticky
        resultCount={view === 'list' ? total : undefined}
        onReset={anyFilter ? reset : undefined}
        chips={[
          {
            key: 'date',
            label: dateLabel,
            icon: <CalendarDays />,
            selected: !!dateFrom,
            menuTitle: t('buddy.filter.date'),
            menu: (close) => (
              <div className="flex w-full flex-col gap-3 p-3 md:w-[360px]">
                <div className="flex flex-wrap gap-2">
                  {presets.map((p) => (
                    <Button key={p.key} size="sm" variant={dateFrom === p.start && dateTo === p.end ? 'primary' : 'secondary'} onClick={() => { set({ from: p.start, to: p.end }); close(); }}>
                      {p.label}
                    </Button>
                  ))}
                </div>
                <DateRange
                  value={{ start: dateFrom ?? null, end: dateTo ?? null } as DateRangeValue}
                  onChange={(v) => set({ from: v.start ?? null, to: v.end ?? v.start ?? null })}
                  min={time.todayYmd}
                  months={1}
                />
                <div className="flex justify-between">
                  <Button size="sm" variant="ghost" onClick={() => { set({ from: null, to: null }); close(); }}>
                    {t('buddy.filter.clearDate')}
                  </Button>
                  <Button size="sm" onClick={close}>{t('buddy.filter.apply')}</Button>
                </div>
              </div>
            ),
          },
          {
            key: 'time',
            label: timeOfDay.length ? timeOfDay.map((x) => t(`buddy.time.${x}`)).join(' · ') : t('buddy.filter.timeOfDay'),
            icon: <Clock />,
            selected: timeOfDay.length > 0,
            menuTitle: t('buddy.filter.timeOfDay'),
            menu: (
              <div className="flex w-full flex-col gap-2 p-3 md:w-56">
                {TIMES_OF_DAY.map((x) => (
                  <Checkbox key={x} label={t(`buddy.time.${x}`)} checked={timeOfDay.includes(x)} onChange={() => toggleCsv('time', x, timeOfDay)} />
                ))}
              </div>
            ),
          },
          {
            key: 'lang',
            label: language.length ? language.map((x) => t(`buddy.lang.${x}`)).join(' · ') : t('buddy.filter.language'),
            icon: <Globe />,
            selected: language.length > 0,
            menuTitle: t('buddy.filter.language'),
            menu: (
              <div className="flex w-full flex-col gap-2 p-3 md:w-56">
                {LANGUAGES.map((x) => (
                  <Checkbox key={x} label={t(`buddy.lang.${x}`)} checked={language.includes(x)} onChange={() => toggleCsv('lang', x, language)} />
                ))}
              </div>
            ),
          },
          { key: 'verified', label: t('buddy.filter.verifiedOnly'), icon: <Lock />, selected: verifiedOnly, onClick: () => set({ verified: verifiedOnly ? null : '1' }) },
          { key: 'space', label: t('buddy.filter.hasSpace'), icon: <Users />, selected: hasSpace, onClick: () => set({ space: hasSpace ? null : '1' }) },
        ]}
        sort={
          view === 'list'
            ? {
                value: sort,
                onChange: (v) => set({ sort: v === 'upcoming' ? null : v }),
                options: [
                  { value: 'upcoming', label: t('buddy.sort.upcoming') },
                  { value: 'recent', label: t('buddy.sort.recent') },
                  { value: 'distance', label: t('buddy.sort.distance') },
                ],
              }
            : undefined
        }
        trailing={
          <SegmentedControl
            size="sm"
            label={t('buddy.view.list')}
            value={view}
            onChange={(v) => set({ view: v === 'list' ? null : v }, { keepPage: true })}
            options={[
              { value: 'list', label: t('buddy.view.list'), icon: <List /> },
              { value: 'calendar', label: t('buddy.view.calendar'), icon: <CalendarDays /> },
            ]}
          />
        }
      />

      <div className="mt-4 pb-10">
        {view === 'calendar' ? (
          <BuddyCalendar campusId={campusId} types={types} />
        ) : list.isPending ? (
          <SkeletonList count={6} variant="buddy-card" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" />
        ) : list.isError ? (
          <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => list.refetch() }} />
        ) : list.data.items.length === 0 ? (
          anyFilter || tab !== 'all' ? (
            <EmptyState icon={<NoBuddy size={120} />} title={t('buddy.empty.filtered')} description={t('buddy.empty.filteredHint')} action={{ label: t('buddy.empty.reset'), onClick: () => { reset(); set({ tab: null }); }, variant: 'secondary' }} />
          ) : (
            <EmptyState icon={<NoBuddy size={120} />} title={t('buddy.empty.title')} description={t('buddy.empty.hint')} action={{ label: t('buddy.browse.post'), onClick: postAction }} />
          )
        ) : (
          <>
            <ul className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-3', list.isFetching && 'opacity-80')} aria-busy={list.isFetching}>
              {list.data.items.map((post) => (
                <li key={post.id} className="min-w-0">
                  <BuddyCard post={post} onHover={setHoverId} />
                </li>
              ))}
            </ul>
            <Pagination className="mt-6" page={page} pageSize={PAGE_SIZE} total={total} onChange={(p) => set({ page: p > 1 ? String(p) : null }, { keepPage: true })} loading={list.isFetching} />
          </>
        )}
      </div>
    </div>
  );
}
