// Timetable: trips × stops grid with a sticky stop column, the next trip highlighted when the day is today.
import { useMemo, useState } from 'react';
import { Button, Skeleton } from '@/components';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import type { Timetable } from '../api';
import { clock, hhmmToMinutes, serviceDayLabel, stopName } from '../labels';

const UPCOMING = 8;

export function TimetableView({ data, loading, headwayMin }: { data: Timetable | undefined; loading?: boolean; headwayMin?: number | null }) {
  const t = useT();
  const { locale } = useLocale();
  const [showAll, setShowAll] = useState(false);
  const nowMin = data ? hhmmToMinutes(data.nowLocal) : 0;
  const nextIdx = useMemo(() => {
    if (!data || !data.isToday) return -1;
    return data.trips.findIndex((trip) => hhmmToMinutes(trip.departures[0]?.time ?? '00:00') >= nowMin);
  }, [data, nowMin]);
  if (loading || !data) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton variant="rect" height={36} />
        <Skeleton variant="rect" height={36} />
        <Skeleton variant="rect" height={36} />
      </div>
    );
  }
  if (data.kind === 'none' || !data.trips.length) {
    return (
      <div className="rounded-card bg-sunken px-4 py-6 text-center text-body text-ink-2">
        <p>{t('shuttle.timetableNone', { day: serviceDayLabel(t, data.serviceDay) })}</p>
      </div>
    );
  }
  // when today, collapse already-departed trips (keep the previous one for context) unless showAll
  const start = !showAll && nextIdx > 1 ? nextIdx - 1 : 0;
  const end = !showAll && nextIdx >= 0 ? Math.min(data.trips.length, start + UPCOMING) : data.trips.length;
  const trips = data.trips.slice(start, end);
  const hiddenCount = data.trips.length - trips.length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-small text-ink-3">
        <span>{t('shuttle.timetableTrips', { n: data.trips.length })}{data.kind === 'headway' && headwayMin ? ` · ${t('shuttle.timetableHeadway', { n: headwayMin })}` : ''}</span>
        {hiddenCount > 0 || showAll ? (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>{showAll ? t('shuttle.showFewer') : t('shuttle.showAllTrips', { n: data.trips.length })}</Button>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full border-collapse text-small tnum">
          <caption className="sr-only">{t('shuttle.timetableFor', { day: serviceDayLabel(t, data.serviceDay) })}</caption>
          <thead>
            <tr className="bg-sunken text-caption text-ink-3">
              <th scope="col" className="sticky left-0 z-raised bg-sunken px-3 py-2 text-left font-medium">{t('shuttle.route.stops')}</th>
              {trips.map((trip, i) => {
                const idx = start + i;
                const isNext = idx === nextIdx;
                return (
                  <th key={trip.tripIndex} scope="col" className={cn('px-3 py-2 text-right font-medium whitespace-nowrap', isNext && 'text-accent-text-strong')}>
                    {isNext ? t('shuttle.nextTrip') : `${t('shuttle.trip')} ${trip.tripIndex + 1}`}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.stops.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <th scope="row" className="sticky left-0 z-raised max-w-[200px] truncate bg-surface px-3 py-2 text-left font-medium text-ink">{stopName(s, locale)}</th>
                {trips.map((trip, i) => {
                  const idx = start + i;
                  const dep = trip.departures.find((d) => d.stopId === s.id);
                  const departed = data.isToday && dep ? hhmmToMinutes(dep.time) < nowMin : false;
                  return (
                    <td key={trip.tripIndex} className={cn('px-3 py-2 text-right whitespace-nowrap', idx === nextIdx ? 'bg-accent-soft text-accent-text-strong font-medium' : departed ? 'text-ink-3' : 'text-ink')}>
                      {dep ? clock(dep.time, locale) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
