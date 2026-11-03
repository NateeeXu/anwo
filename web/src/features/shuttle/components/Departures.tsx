// Next-departure list with the countdown (DESIGN §7.10: first departure as price-lg accent-vivid numeral).
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { ShuttleDeparture } from '@shared/types';
import { Skeleton } from '@/components';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { clock } from '../labels';
import { RouteSwatch } from './RouteSwatch';

/** Seconds since `updatedAt`, ticking once a second. */
export function useSecondsSince(updatedAt: number | undefined): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return updatedAt ? Math.max(0, Math.floor((now - updatedAt) / 1000)) : 0;
}

export function DepartureRow({ d, first, linkRoute = true, secondsSince = 0 }: { d: ShuttleDeparture; first?: boolean; linkRoute?: boolean; secondsSince?: number }) {
  const t = useT();
  const { locale } = useLocale();
  // keep the countdown honest between 30 s refetches
  const mins = Math.max(0, d.inMinutes - Math.floor(secondsSince / 60));
  const countdown = mins <= 0 ? t('shuttle.departsNow') : t('shuttle.departsIn', { n: mins });
  const name = linkRoute ? (
    <Link to={`/shuttle/${d.routeId}`} className="truncate font-medium text-ink hover:underline underline-offset-2">{d.routeName}</Link>
  ) : (
    <span className="truncate font-medium text-ink">{d.routeName}</span>
  );
  return (
    <li className={cn('flex items-center gap-3 py-2', first ? 'py-3' : '')}>
      <RouteSwatch color={d.routeColor} size={first ? 'lg' : 'md'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">{name}</div>
        <div className="text-small text-ink-3 tnum">{t('shuttle.departsAt', { time: clock(d.time, locale) })}</div>
      </div>
      <div className={cn('shrink-0 text-right tnum', first ? 'text-price-lg text-accent-vivid' : 'text-price text-ink')} aria-live={first ? 'polite' : undefined}>
        {countdown}
      </div>
    </li>
  );
}

export function DeparturesList({ departures, loading, firstTomorrow, secondsSince, linkRoute = true, limit }: { departures: ShuttleDeparture[] | undefined; loading?: boolean; firstTomorrow?: string | null; secondsSince?: number; linkRoute?: boolean; limit?: number }) {
  const t = useT();
  const { locale } = useLocale();
  if (loading && !departures) {
    return (
      <div className="flex flex-col gap-2 py-2" aria-busy="true">
        <Skeleton variant="row" />
        <Skeleton variant="row" />
        <Skeleton variant="row" />
      </div>
    );
  }
  const list = (departures ?? []).slice(0, limit ?? departures?.length ?? 0);
  if (!list.length) {
    return (
      <div className="rounded-card bg-sunken px-4 py-4 text-small text-ink-2">
        <p className="font-medium text-ink">{t('shuttle.noMoreToday')}</p>
        {firstTomorrow ? <p className="mt-0.5">{t('shuttle.noMoreHint', { time: clock(firstTomorrow, locale) })}</p> : null}
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {list.map((d, i) => (
        <DepartureRow key={`${d.routeId}-${d.time}-${d.tripIndex ?? i}`} d={d} first={i === 0} linkRoute={linkRoute} secondsSince={secondsSince} />
      ))}
    </ul>
  );
}
