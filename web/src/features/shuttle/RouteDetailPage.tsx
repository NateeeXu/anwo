// /shuttle/:routeId — route facts, alerts, ordered stops with the next departure at each, map, timetable by service day.
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, CircleAlert, ExternalLink, Share2 } from 'lucide-react';
import { Link, useParams } from 'react-router';
import type { ServiceDay } from '@shared/enums';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, Tabs, Tooltip } from '@/components';
import { MapView, type MapMarker } from '@/components/map';
import { Head } from '@/app/Head';
import { SecondaryTabs } from '@/app/shell/SecondaryTabs';
import { cn } from '@/lib/cn';
import { bboxOf } from '@/lib/geo';
import { useIsMobile } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { useRoute, useTimetable } from './api';
import { SERVICE_DAYS, clock, hhmmToMinutes, serviceDayLabel, serviceDaysLabel, splitBilingual, stopName } from './labels';
import { AlertsBanner } from './components/AlertsBanner';
import { FavoriteButton } from './components/FavoriteButton';
import { RouteDot, RouteSwatch } from './components/RouteSwatch';
import { TimetableView } from './components/TimetableView';

export default function RouteDetailPage() {
  const t = useT();
  const { locale } = useLocale();
  const { routeId } = useParams<{ routeId: string }>();
  const isMobile = useIsMobile();
  const q = useRoute(routeId);
  const route = q.data;
  const [day, setDay] = useState<ServiceDay | null>(null);
  const serviceDay = day ?? route?.serviceDayToday;
  const tt = useTimetable(routeId, serviceDay);

  useEffect(() => {
    if (routeId) track('shuttle.route.view', { entityType: 'shuttle_route', entityId: routeId });
  }, [routeId]);

  const dayTabs = useMemo(() => {
    if (!route) return [];
    const days = new Set(route.serviceDays);
    const has: ServiceDay[] = [];
    if (['mon', 'tue', 'wed', 'thu', 'fri'].some((d) => days.has(d))) has.push('weekday');
    if (days.has('sat')) has.push('saturday');
    if (days.has('sun')) has.push('sunday');
    if (days.has('holiday')) has.push('holiday');
    if (!has.includes(route.serviceDayToday)) has.push(route.serviceDayToday);
    return SERVICE_DAYS.filter((d) => has.includes(d)).map((d) => ({ key: d, label: serviceDayLabel(t, d) }));
  }, [route, t]);

  // next departure per stop from today's timetable (only when the tab shows today)
  const nextByStop = useMemo(() => {
    const map = new Map<string, string>();
    if (!tt.data || !tt.data.isToday) return map;
    const nowMin = hhmmToMinutes(tt.data.nowLocal);
    for (const s of tt.data.stops) {
      for (const trip of tt.data.trips) {
        const dep = trip.departures.find((d) => d.stopId === s.id);
        if (dep && hhmmToMinutes(dep.time) >= nowMin) { map.set(s.id, dep.time); break; }
      }
    }
    return map;
  }, [tt.data]);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: route?.name, url });
      else { await navigator.clipboard.writeText(url); toast.success(t('shuttle.route.copied')); }
      track('shuttle.route.share', { entityType: 'shuttle_route', entityId: routeId });
    } catch { /* cancelled */ }
  };

  const wrap = (children: React.ReactNode, title: string) => (
    <div className="mx-auto w-full max-w-detail px-4 lg:px-8">
      <Head title={title} />
      <SecondaryTabs className="mb-4" />
      {children}
    </div>
  );

  if (q.isError) {
    return wrap(<EmptyState icon={CircleAlert} title={t('shuttle.route.notFound')} description={t('shuttle.route.notFoundHint')} action={<Button asChild variant="secondary"><Link to="/shuttle">{t('shuttle.backToList')}</Link></Button>} />, t('shuttle.title'));
  }
  if (q.isLoading || !route) {
    return wrap(
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton variant="text" />
        <Skeleton variant="rect" height={isMobile ? 220 : 360} className="rounded-card" />
        <Skeleton variant="row" /><Skeleton variant="row" />
      </div>,
      t('shuttle.title'),
    );
  }

  const markers: MapMarker[] = route.stops.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, kind: 'stop', label: stopName(s, locale), title: stopName(s, locale) }));
  const bounds = bboxOf(route.polyline.length ? route.polyline : route.stops.map((s) => [s.lat, s.lng] as [number, number]), 0.12);
  const duration = route.stops.length ? route.stops[route.stops.length - 1]!.minutesFromStart : null;
  const description = splitBilingual(route.description, locale);
  const campusName = locale === 'zh-CN' && route.campus.nameZh ? route.campus.nameZh : route.campus.shortName;

  return wrap(
    <>
      <PageHeader
        breadcrumb={[{ label: t('shuttle.pageTitle', { campus: campusName }), to: '/shuttle' }, { label: route.name }]}
        title={
          <span className="flex items-center gap-3">
            <RouteSwatch color={route.color} shortName={route.shortName} size="lg" />
            <span>{route.name}</span>
          </span>
        }
        subtitle={description || undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FavoriteButton entityType="route" id={route.id} favorited={route.favorited} size="sm" label />
            <Button variant="ghost" size="sm" iconLeft={<Share2 />} onClick={share}>{t('shuttle.route.share')}</Button>
            {route.officialUrl ? (
              <Button asChild variant="secondary" size="sm" iconRight={<ExternalLink />}>
                <a href={route.officialUrl} target="_blank" rel="noreferrer noopener" onClick={() => track('shuttle.official_click', { entityType: 'shuttle_route', entityId: route.id })}>{t('shuttle.officialSchedule')}</a>
              </Button>
            ) : null}
          </div>
        }
      />
      <AlertsBanner alerts={route.alerts} routes={[route]} linkRoutes={false} className="mb-4" />

      <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label={t('shuttle.route.headway')} value={route.headwayMin ? t('shuttle.everyMin', { n: route.headwayMin }) : '—'} />
        <Fact label={t('shuttle.route.hours')} value={route.firstDeparture && route.lastDeparture ? `${clock(route.firstDeparture, locale)}–${clock(route.lastDeparture, locale)}` : '—'} />
        <Fact label={t('shuttle.route.days')} value={serviceDaysLabel(t, route.serviceDays)} extra={route.runsToday ? <Badge variant="success" size="sm">{t('shuttle.runsToday')}</Badge> : <Badge variant="neutral" size="sm">{t('shuttle.notToday')}</Badge>} />
        <Fact label={t('shuttle.stopCount', { n: route.stops.length })} value={duration != null && duration > 0 ? t('shuttle.route.duration', { n: duration }) : '—'} extra={route.isApproximate ? (
          <Tooltip content={t('shuttle.approximateHint')}><span className="text-caption text-ink-3" tabIndex={0}>{t('shuttle.approximate')}</span></Tooltip>
        ) : null} />
      </dl>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_minmax(0,1.3fr)]">
        <section aria-labelledby="route-stops">
          <h2 id="route-stops" className="mb-2 text-h3 text-ink">{t('shuttle.route.stops')} <span className="text-small font-normal text-ink-3">· {t('shuttle.route.direction')}</span></h2>
          <ol className="relative ml-2 flex flex-col border-l-2 pl-4" style={{ borderColor: route.color }}>
            {route.stops.map((s, i) => {
              const next = nextByStop.get(s.id);
              return (
                <li key={s.id} className="relative py-1">
                  <RouteDot color={route.color} className="absolute -left-[25px] top-3.5" />
                  <Link to={`/shuttle?stop=${encodeURIComponent(s.id)}`} className="flex items-center gap-3 rounded-ctl px-2 py-1.5 hover:bg-sunken">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-ink">{stopName(s, locale)}</span>
                      <span className="block text-caption text-ink-3 tnum">
                        {i === 0 ? t('shuttle.route.firstStop') : i === route.stops.length - 1 ? t('shuttle.route.lastStop') : t('shuttle.minFromStart', { n: s.minutesFromStart })}
                      </span>
                    </span>
                    {next ? <span className="shrink-0 text-small text-accent-text-strong tnum">{t('shuttle.route.nextHere', { time: clock(next, locale) })}</span> : null}
                    <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
        <div className={cn('overflow-hidden rounded-card border border-line', isMobile ? 'h-[260px]' : 'sticky top-20 h-[420px]')}>
          <MapView bounds={bounds} markers={markers} polylines={[{ id: route.id, points: route.polyline, color: route.color, weight: 4 }]} height="100%" clusterThreshold={Infinity} />
        </div>
      </div>

      <section className="mt-8" aria-labelledby="route-timetable">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="route-timetable" className="text-h3 text-ink">{t('shuttle.tabs.timetable')}</h2>
          {dayTabs.length > 1 && serviceDay ? <Tabs variant="pill" items={dayTabs} value={serviceDay} onChange={(k) => setDay(k)} label={t('shuttle.tabs.timetable')} /> : null}
        </div>
        {tt.isError ? (
          <EmptyState size="sm" icon={CircleAlert} title={t('shuttle.error')} action={{ label: t('common.retry'), onClick: () => void tt.refetch(), variant: 'secondary' }} />
        ) : tt.data?.kind === 'none' && route.serviceDays.length && route.stops.length && !route.runsToday && serviceDay === route.serviceDayToday ? (
          <Card variant="sunken" padding="md" className="text-body text-ink-2">
            <p>{t('shuttle.timetableNone', { day: serviceDayLabel(t, serviceDay ?? 'weekday') })}</p>
            <p className="mt-1 text-small text-ink-3">{t('shuttle.timetableSeasonal')}</p>
          </Card>
        ) : (
          <TimetableView data={tt.data} loading={tt.isLoading} headwayMin={route.headwayMin} />
        )}
      </section>
    </>,
    route.name,
  );
}

function Fact({ label, value, extra }: { label: string; value: string; extra?: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface px-3 py-2.5">
      <dt className="text-caption text-ink-3">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-body font-medium text-ink tnum">{value}{extra}</dd>
    </div>
  );
}
