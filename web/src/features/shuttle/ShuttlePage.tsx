// /shuttle — DESIGN §7.10: alerts banner · PageHeader with the official tracker link · tabs 路线 / 站点 / 收藏 ·
// route list (colored lines) beside a MapView with polylines + stop markers · stop detail with the 30 s countdown ·
// "no data for this campus → request" state with the NoShuttle illustration.
// URL state: ?tab=routes|stops|favorites · ?route=<id> · ?stop=<id> (NearestStopChip deep-links to ?stop=).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bus, ChevronRight, CircleAlert, ExternalLink, LocateFixed, Map as MapIcon, Search, Star } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Sheet, Skeleton, Tabs, Tooltip } from '@/components';
import { NoShuttle } from '@/components/illustrations';
import { MapView, type MapMarker, type MapPolyline } from '@/components/map';
import { Head } from '@/app/Head';
import { loginPath } from '@/app/guards';
import { SecondaryTabs } from '@/app/shell/SecondaryTabs';
import { useAuth } from '@/lib/auth';
import { useCampus } from '@/lib/campus';
import { cn } from '@/lib/cn';
import { bboxOf, campusCenter, haversineM, type Bbox } from '@/lib/geo';
import { useIsMobile } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { useCampusShuttle, useFavorites, useNextDepartures, type CampusShuttle, type RouteListItem, type StopItem } from './api';
import { clock, serviceDayLabel, serviceDaysLabel, serviceSummary, stopName } from './labels';
import { AlertsBanner } from './components/AlertsBanner';
import { FavoriteButton } from './components/FavoriteButton';
import { RequestCampusForm } from './components/RequestCampusForm';
import { RouteDot, RouteSwatch } from './components/RouteSwatch';
import { StopDetail } from './components/StopDetail';

type Tab = 'routes' | 'stops' | 'favorites';
const TABS: Tab[] = ['routes', 'stops', 'favorites'];

export default function ShuttlePage() {
  const t = useT();
  const { locale, isZh } = useLocale();
  const { campus, campusId } = useCampus();
  const [params, setParams] = useSearchParams();
  const isMobile = useIsMobile();
  const q = useCampusShuttle(campusId);

  const tabParam = params.get('tab');
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'routes';
  const routeId = params.get('route');
  const stopId = params.get('stop');
  const [mapOpen, setMapOpen] = useState(true);

  const setParam = useCallback((patch: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      return next;
    }, { replace: true });
  }, [setParams]);

  useEffect(() => {
    if (campusId) track('shuttle.view', { entityType: 'campus', entityId: campusId, props: { tab } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusId]);

  const data = q.data;
  const title = t('shuttle.pageTitle', { campus: campus ? (isZh && campus.nameZh ? campus.nameZh : campus.shortName) : '' });
  const selectedRoute = useMemo(() => data?.routes.find((r) => r.id === routeId) ?? null, [data, routeId]);
  const selectedStop = useMemo(() => data?.stops.find((s) => s.id === stopId) ?? null, [data, stopId]);
  const campusCenterPt = campusCenter(campus);

  // ---- map derived state
  const localStops = useMemo(() => {
    if (!data) return [];
    const near = data.stops.filter((s) => haversineM([s.lat, s.lng], campusCenterPt) <= 4000);
    return near.length ? near : data.stops;
  }, [data, campusCenterPt]);
  const bounds: Bbox | null = useMemo(() => {
    if (selectedRoute) return bboxOf(selectedRoute.polyline.length ? selectedRoute.polyline : data?.stops.filter((s) => selectedRoute.stopIds.includes(s.id)).map((s) => [s.lat, s.lng] as [number, number]) ?? [], 0.12);
    if (selectedStop && !isMobile) return { minLat: selectedStop.lat - 0.004, maxLat: selectedStop.lat + 0.004, minLng: selectedStop.lng - 0.006, maxLng: selectedStop.lng + 0.006 };
    return bboxOf(localStops.map((s) => [s.lat, s.lng] as [number, number]), 0.15);
  }, [selectedRoute, selectedStop, localStops, data, isMobile]);
  const markers: MapMarker[] = useMemo(() => {
    if (!data) return [];
    const onRoute = selectedRoute ? new Set(selectedRoute.stopIds) : null;
    const list: MapMarker[] = data.stops.map((s) => ({
      id: s.id, lat: s.lat, lng: s.lng, kind: 'stop', label: stopName(s, locale), title: stopName(s, locale),
      selected: s.id === stopId, muted: Boolean(onRoute && !onRoute.has(s.id)),
    }));
    if (campus) list.push({ id: 'campus', kind: 'campus', lat: campus.lat, lng: campus.lng, label: campus.shortName });
    return list;
  }, [data, selectedRoute, stopId, campus, locale]);
  const polylines: MapPolyline[] = useMemo(() => (data?.routes ?? []).map((r) => ({
    id: r.id, points: r.polyline, color: r.color, weight: r.id === routeId ? 5 : 3, selected: r.id === routeId, muted: Boolean(routeId && r.id !== routeId),
  })), [data, routeId]);

  const openStop = (id: string | null) => setParam({ stop: id });
  const openRoute = (id: string | null) => setParam({ route: id, stop: null });

  // ---- render
  if (!campusId || !campus) {
    return (
      <Shell title={title}>
        <EmptyState icon={<NoShuttle size={120} />} title={t('shuttle.empty.title', { campus: '' })} />
      </Shell>
    );
  }
  if (q.isError) {
    return (
      <Shell title={title}>
        <EmptyState icon={CircleAlert} title={t('shuttle.error')} action={{ label: t('common.retry'), onClick: () => void q.refetch() }} />
      </Shell>
    );
  }
  if (q.isLoading || !data) {
    return (
      <Shell title={title}>
        <PageHeader title={title} />
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <div className="flex flex-col gap-3" aria-busy="true"><Skeleton variant="row" /><Skeleton variant="row" /><Skeleton variant="row" /><Skeleton variant="row" /></div>
          <Skeleton variant="rect" height={isMobile ? 240 : 560} className="rounded-card" />
        </div>
      </Shell>
    );
  }
  if (!data.hasData) {
    return (
      <Shell title={title}>
        <NoDataState data={data} />
      </Shell>
    );
  }

  const officialUrl = data.campus.shuttleTrackerUrl ?? data.routes.find((r) => r.officialUrl)?.officialUrl ?? null;
  const subtitle = `${t('shuttle.subtitle', { routes: data.routes.length, stops: data.stops.length })} · ${t('shuttle.today', { day: serviceDayLabel(t, data.serviceDayToday), time: clock(data.nowLocal, locale) })}`;
  const sidebar = selectedStop ? (
    <div className="flex flex-col gap-3">
      <Button variant="ghost" size="sm" iconLeft={<ArrowLeft />} onClick={() => openStop(null)} className="self-start">{selectedRoute ? selectedRoute.name : t('shuttle.backToList')}</Button>
      <StopDetail stop={selectedStop} onSelectRoute={(id) => openRoute(id)} />
    </div>
  ) : selectedRoute ? (
    <RoutePanel route={selectedRoute} stops={data.stops} onBack={() => openRoute(null)} onStop={openStop} />
  ) : (
    <>
      <Tabs
        items={[
          { key: 'routes', label: t('shuttle.tabs.routes'), count: data.routes.length },
          { key: 'stops', label: t('shuttle.tabs.stops'), count: data.stops.length },
          { key: 'favorites', label: t('shuttle.tabs.favorites'), icon: <Star /> },
        ]}
        value={tab}
        onChange={(k) => setParam({ tab: k === 'routes' ? null : k })}
        label={t('shuttle.title')}
      />
      {tab === 'routes' ? <RouteList routes={data.routes} onSelect={openRoute} /> : null}
      {tab === 'stops' ? <StopList stops={data.stops} onSelect={openStop} /> : null}
      {tab === 'favorites' ? <FavoritesTab campusId={data.campus.id} onRoute={openRoute} onStop={openStop} /> : null}
    </>
  );

  const map = (
    <MapView
      center={campusCenterPt}
      zoom={14}
      bounds={bounds}
      markers={markers}
      polylines={polylines}
      onMarkerClick={(id) => { if (id !== 'campus') openStop(id); }}
      onPolylineClick={(id) => openRoute(id)}
      height="100%"
      className="rounded-card"
      clusterThreshold={Infinity}
    />
  );

  return (
    <Shell title={title}>
      <AlertsBanner alerts={data.alerts} routes={data.routes} className="mb-4" />
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2">
            {data.routes.some((r) => r.isApproximate) ? (
              <Tooltip content={t('shuttle.approximateHint')}>
                <span className="hidden text-caption text-ink-3 sm:inline-flex" tabIndex={0}>{t('shuttle.approximate')}</span>
              </Tooltip>
            ) : null}
            {officialUrl ? (
              <Button asChild variant="secondary" size="sm" iconRight={<ExternalLink />}>
                <a href={officialUrl} target="_blank" rel="noreferrer noopener" onClick={() => track('shuttle.official_click', { entityType: 'campus', entityId: data.campus.id })}>{t('shuttle.official')}</a>
              </Button>
            ) : null}
          </div>
        }
      />
      {isMobile ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" iconLeft={<MapIcon />} onClick={() => setMapOpen((v) => !v)} aria-expanded={mapOpen}>{mapOpen ? t('shuttle.hideMap') : t('shuttle.showMap')}</Button>
            {selectedRoute ? <RouteSwatch color={selectedRoute.color} shortName={selectedRoute.shortName} /> : null}
          </div>
          {mapOpen ? <div className="h-[240px] overflow-hidden rounded-card">{map}</div> : null}
          <div>{selectedStop ? (selectedRoute ? <RoutePanel route={selectedRoute} stops={data.stops} onBack={() => openRoute(null)} onStop={openStop} /> : sidebarListFor(tab, data, setParam, openRoute, openStop, t)) : sidebar}</div>
          <Sheet open={Boolean(selectedStop)} onClose={() => openStop(null)} title={selectedStop ? stopName(selectedStop, locale) : ''} snap="half" handle>
            {selectedStop ? <StopDetail stop={selectedStop} showHeader={false} onSelectRoute={(id) => openRoute(id)} /> : null}
          </Sheet>
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[360px_1fr]">
          <div className="flex flex-col gap-3">{sidebar}</div>
          <div className="sticky top-20 h-[calc(100vh-200px)] min-h-[480px] overflow-hidden rounded-card border border-line">{map}</div>
        </div>
      )}
    </Shell>
  );
}

function sidebarListFor(tab: Tab, data: CampusShuttle, setParam: (p: Record<string, string | null>) => void, openRoute: (id: string | null) => void, openStop: (id: string | null) => void, t: ReturnType<typeof useT>) {
  return (
    <>
      <Tabs
        items={[
          { key: 'routes', label: t('shuttle.tabs.routes'), count: data.routes.length },
          { key: 'stops', label: t('shuttle.tabs.stops'), count: data.stops.length },
          { key: 'favorites', label: t('shuttle.tabs.favorites'), icon: <Star /> },
        ]}
        value={tab}
        onChange={(k) => setParam({ tab: k === 'routes' ? null : k })}
        label={t('shuttle.title')}
      />
      {tab === 'routes' ? <RouteList routes={data.routes} onSelect={openRoute} /> : null}
      {tab === 'stops' ? <StopList stops={data.stops} onSelect={openStop} /> : null}
      {tab === 'favorites' ? <FavoritesTab campusId={data.campus.id} onRoute={openRoute} onStop={openStop} /> : null}
    </>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={title} />
      <SecondaryTabs className="mb-4" />
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- no data
function NoDataState({ data }: { data: CampusShuttle }) {
  const t = useT();
  const { isZh } = useLocale();
  const [open, setOpen] = useState(false);
  const name = isZh && data.campus.nameZh ? data.campus.nameZh : data.campus.shortName;
  const status = data.request?.status;
  const requested = status === 'open' || status === 'planned';
  return (
    <>
      <EmptyState
        icon={<NoShuttle size={140} />}
        title={t('shuttle.empty.title', { campus: name })}
        description={requested ? (status === 'planned' ? t('shuttle.empty.plannedHint') : t('shuttle.empty.requestedHint')) : t('shuttle.empty.description')}
        action={requested ? (
          <Badge variant={status === 'planned' ? 'info' : 'success'} size="md">{status === 'planned' ? t('shuttle.empty.planned') : t('shuttle.empty.requested')}</Badge>
        ) : (
          <Button iconLeft={<Bus />} onClick={() => setOpen(true)}>{t('shuttle.empty.request')}</Button>
        )}
        secondaryAction={data.campus.shuttleTrackerUrl ? (
          <Button asChild variant="ghost" iconRight={<ExternalLink />}>
            <a href={data.campus.shuttleTrackerUrl} target="_blank" rel="noreferrer noopener">{t('shuttle.empty.officialLink')}</a>
          </Button>
        ) : undefined}
        className="py-16"
      />
      <RequestCampusForm open={open} onClose={() => setOpen(false)} campus={{ id: data.campus.id, name: data.campus.name, nameZh: data.campus.nameZh, shortName: data.campus.shortName, shuttleTrackerUrl: data.campus.shuttleTrackerUrl }} />
    </>
  );
}

// ---------------------------------------------------------------- route list
function RouteRow({ route, onSelect, selected }: { route: RouteListItem; onSelect: (id: string) => void; selected?: boolean }) {
  const t = useT();
  const { locale } = useLocale();
  const summary = serviceSummary(t, route, locale);
  const days = serviceDaysLabel(t, route.serviceDays);
  return (
    <Card as="div" interactive padding="none" className={cn('relative', selected && 'border-accent')}>
      <button type="button" onClick={() => onSelect(route.id)} className="flex w-full items-center gap-3 rounded-card px-3 py-3 text-left focus-visible:outline-none" aria-current={selected ? 'true' : undefined}>
        <RouteSwatch color={route.color} shortName={route.shortName} size="lg" className="w-[72px] flex-col items-start gap-0.5" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-ink">{route.name}</span>
          <span className="block truncate text-small text-ink-2 tnum">{summary || days}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-caption text-ink-3">
            <span>{days}</span>
            <span aria-hidden="true">·</span>
            <span>{t('shuttle.stopCount', { n: route.stopCount })}</span>
            {route.runsToday === false ? <Badge variant="neutral" size="sm">{t('shuttle.notToday')}</Badge> : null}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
      </button>
      <FavoriteButton entityType="route" id={route.id} favorited={Boolean(route.favorited)} className="absolute right-9 top-2" />
    </Card>
  );
}

function RouteList({ routes, onSelect }: { routes: RouteListItem[]; onSelect: (id: string) => void }) {
  return (
    <ul className="flex flex-col gap-2" aria-label="routes">
      {routes.map((r) => (
        <li key={r.id}><RouteRow route={r} onSelect={onSelect} /></li>
      ))}
    </ul>
  );
}

function RoutePanel({ route, stops, onBack, onStop }: { route: RouteListItem; stops: StopItem[]; onBack: () => void; onStop: (id: string) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const ordered = route.stopIds.map((id) => stops.find((s) => s.id === id)).filter((s): s is StopItem => Boolean(s));
  return (
    <div className="flex flex-col gap-3">
      <Button variant="ghost" size="sm" iconLeft={<ArrowLeft />} onClick={onBack} className="self-start">{t('shuttle.allRoutes')}</Button>
      <Card padding="md" className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <RouteSwatch color={route.color} shortName={route.shortName} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-h3 text-ink">{route.name}</h2>
            <p className="text-small text-ink-2 tnum">{serviceSummary(t, route, locale) || serviceDaysLabel(t, route.serviceDays)}</p>
            <p className="text-caption text-ink-3">{serviceDaysLabel(t, route.serviceDays)}{route.isApproximate ? ` · ${t('shuttle.approximate')}` : ''}</p>
          </div>
          <FavoriteButton entityType="route" id={route.id} favorited={Boolean(route.favorited)} size="md" />
        </div>
        {route.runsToday === false ? <Badge variant="neutral" size="sm" className="self-start">{t('shuttle.notToday')}</Badge> : null}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm"><Link to={`/shuttle/${route.id}`}>{t('shuttle.viewTimetable')}</Link></Button>
          {route.officialUrl ? (
            <Button asChild variant="ghost" size="sm" iconRight={<ExternalLink />}><a href={route.officialUrl} target="_blank" rel="noreferrer noopener">{t('shuttle.officialSchedule')}</a></Button>
          ) : null}
        </div>
      </Card>
      <h3 className="text-caption uppercase tracking-wide text-ink-3">{t('shuttle.stopsOnRoute', { n: ordered.length })} · {t('shuttle.route.direction')}</h3>
      <ol className="relative ml-2 flex flex-col border-l-2 pl-4" style={{ borderColor: route.color }}>
        {ordered.map((s) => (
          <li key={s.id} className="relative py-1.5">
            <RouteDot color={route.color} className="absolute -left-[25px] top-3" />
            <button type="button" onClick={() => onStop(s.id)} className="flex w-full items-center gap-2 rounded-ctl px-2 py-1.5 text-left hover:bg-sunken focus-visible:outline-none">
              <span className="min-w-0 flex-1 truncate text-body text-ink">{stopName(s, locale)}</span>
              <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- stop list
function StopList({ stops, onSelect }: { stops: StopItem[]; onSelect: (id: string) => void }) {
  const t = useT();
  const { locale, formatDistance } = useLocale();
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const locate = () => {
    if (!navigator.geolocation) { toast.error(t('shuttle.locateFailed')); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false); },
      () => { setLocating(false); toast.error(t('shuttle.locateFailed')); },
      { timeout: 8000, maximumAge: 60_000 },
    );
  };
  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let out = stops.filter((s) => !needle || s.name.toLowerCase().includes(needle) || (s.nameZh ?? '').toLowerCase().includes(needle) || (s.code ?? '').toLowerCase().includes(needle));
    if (pos) out = out.map((s) => ({ ...s, distanceM: haversineM(pos, { lat: s.lat, lng: s.lng }) })).sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
    else out = [...out].sort((a, b) => stopName(a, locale).localeCompare(stopName(b, locale), locale));
    return out;
  }, [stops, query, pos, locale]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input size="sm" iconLeft={<Search />} placeholder={t('shuttle.searchStops')} value={query} onChange={(e) => setQuery(e.target.value)} clearable aria-label={t('shuttle.searchStops')} className="flex-1" />
        <Button variant={pos ? 'secondary' : 'ghost'} size="sm" iconLeft={<LocateFixed />} onClick={locate} loading={locating} aria-pressed={Boolean(pos)}>{t('shuttle.nearMe')}</Button>
      </div>
      {pos ? <p className="text-caption text-ink-3">{t('shuttle.sortedByDistance')}</p> : null}
      {list.length === 0 ? (
        <EmptyState size="sm" icon={Bus} title={t('shuttle.noStopsMatch')} />
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
          {list.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onSelect(s.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-sunken focus-visible:outline-none">
                <span className="flex shrink-0 -space-x-1">{s.routes.slice(0, 4).map((r) => <RouteDot key={r.id} color={r.color} />)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-ink">{stopName(s, locale)}</span>
                  <span className="block truncate text-caption text-ink-3">{s.routes.map((r) => r.shortName ?? r.name).join(' · ')}</span>
                </span>
                {typeof s.distanceM === 'number' ? <span className="shrink-0 text-small text-ink-2 tnum">{formatDistance(s.distanceM)}</span> : null}
                {s.favorited ? <Star className="size-4 shrink-0 fill-current text-accent-text" aria-label={t('shuttle.favorited')} /> : null}
                <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- favorites
function FavoritesTab({ campusId, onRoute, onStop }: { campusId: string; onRoute: (id: string) => void; onStop: (id: string) => void }) {
  const t = useT();
  const { status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fav = useFavorites(status === 'authed');
  if (status === 'anon') {
    return <EmptyState size="sm" icon={Star} title={t('shuttle.favoritesLogin')} description={t('shuttle.favoritesLoginHint')} action={{ label: t('shuttle.login'), onClick: () => navigate(loginPath(location.pathname + location.search)) }} />;
  }
  if (fav.isLoading || status === 'loading') return <div className="flex flex-col gap-2" aria-busy="true"><Skeleton variant="row" /><Skeleton variant="row" /></div>;
  if (fav.isError) return <EmptyState size="sm" icon={CircleAlert} title={t('shuttle.error')} action={{ label: t('common.retry'), onClick: () => void fav.refetch() }} />;
  const routes = (fav.data?.routes ?? []).filter((r) => r.campusId === campusId);
  const stops = (fav.data?.stops ?? []).filter((s) => s.campusId === campusId);
  if (!routes.length && !stops.length) return <EmptyState size="sm" icon={Star} title={t('shuttle.favoritesEmpty')} description={t('shuttle.favoritesHint')} />;
  return (
    <div className="flex flex-col gap-4">
      {stops.length ? (
        <section>
          <h3 className="mb-1 text-caption uppercase tracking-wide text-ink-3">{t('shuttle.favoriteStops')}</h3>
          <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
            {stops.map((s) => <FavoriteStopRow key={s.id} stop={s} onSelect={onStop} />)}
          </ul>
        </section>
      ) : null}
      {routes.length ? (
        <section>
          <h3 className="mb-1 text-caption uppercase tracking-wide text-ink-3">{t('shuttle.favoriteRoutes')}</h3>
          <ul className="flex flex-col gap-2">{routes.map((r) => <li key={r.id}><RouteRow route={r} onSelect={onRoute} /></li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}

function FavoriteStopRow({ stop, onSelect }: { stop: StopItem; onSelect: (id: string) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const next = useNextDepartures(stop.id, { limit: 2 });
  const first = next.data?.departures[0];
  return (
    <li>
      <button type="button" onClick={() => onSelect(stop.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-sunken focus-visible:outline-none">
        <span className="flex shrink-0 -space-x-1">{stop.routes.slice(0, 4).map((r) => <RouteDot key={r.id} color={r.color} />)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body text-ink">{stopName(stop, locale)}</span>
          <span className="block truncate text-caption text-ink-3">{first ? `${first.routeName} · ${clock(first.time, locale)}` : next.isLoading ? t('common.loading') : t('shuttle.noMoreToday')}</span>
        </span>
        {first ? <span className="shrink-0 text-price text-accent-vivid tnum">{first.inMinutes <= 0 ? t('shuttle.departsNow') : t('shuttle.departsIn', { n: first.inMinutes })}</span> : null}
        <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
      </button>
    </li>
  );
}
