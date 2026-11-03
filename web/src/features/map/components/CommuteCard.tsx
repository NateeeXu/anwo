// CommuteCard — embeddable walk / bike / shuttle estimate to campus (DESIGN §7.9 「到校通勤」 popover content).
//   <CommuteCard lat={listing.lat} lng={listing.lng} campusId={listing.campusId} />
//   <CommuteCard … variant="inline" />        one-line chips, for cards and rails
// Listing / market / buddy pages import it from '@/features/map'.
import { Bike, Bus, CircleAlert, Footprints, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import type { CommuteResponse } from '@shared/schemas/map';
import { Skeleton } from '@/components';
import { useCommute } from '@/components/map';
import { useCampus } from '@/lib/campus';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';

export type CommuteCardProps = {
  lat: number | null | undefined;
  lng: number | null | undefined;
  campusId?: string | null;
  /** `card` (default): three tiles + nearest stop · `inline`: compact chip row */
  variant?: 'card' | 'inline';
  /** Already-known estimate (skips the request) */
  data?: CommuteResponse | null;
  showTitle?: boolean;
  className?: string;
};

function Tile({ icon: Icon, label, minutes, muted, hint }: { icon: typeof Footprints; label: string; minutes: number | null; muted?: boolean; hint?: string }) {
  const t = useT();
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col items-center gap-1 rounded-ctl border px-2 py-2.5 text-center', muted ? 'border-line bg-sunken text-ink-3' : 'border-line bg-surface text-ink')} title={hint}>
      <Icon className="size-4" aria-hidden strokeWidth={1.75} />
      <span className={cn('tnum font-semibold leading-none', muted ? 'text-small' : 'text-price')}>{minutes == null ? '—' : t('map.commute.min', { n: minutes })}</span>
      <span className="text-caption text-ink-3">{label}</span>
    </div>
  );
}

export function CommuteCard({ lat, lng, campusId, variant = 'card', data, showTitle = true, className }: CommuteCardProps) {
  const t = useT();
  const { formatDistance, isZh } = useLocale();
  const { campus } = useCampus();
  const cid = campusId ?? campus?.id ?? null;
  const q = useCommute({ lat, lng, campusId: cid }, !data);
  const est = data ?? q.data ?? null;
  const campusName = est ? (isZh ? est.campus.nameZh ?? est.campus.shortName : est.campus.shortName) : campus?.shortName ?? '';

  if (variant === 'inline') {
    if (!est) {
      if (q.isLoading) return <Skeleton variant="text" className={cn('h-5 w-40', className)} />;
      return null;
    }
    return (
      <span className={cn('inline-flex flex-wrap items-center gap-1.5 text-caption text-ink-2', className)}>
        <span className="inline-flex items-center gap-1 rounded-pill bg-sunken px-2 py-0.5 tnum"><Footprints className="size-3" aria-hidden />{t('map.commute.min', { n: est.walkMin })}</span>
        <span className="inline-flex items-center gap-1 rounded-pill bg-sunken px-2 py-0.5 tnum"><Bike className="size-3" aria-hidden />{t('map.commute.min', { n: est.bikeMin })}</span>
        {est.shuttleMin != null && <span className="inline-flex items-center gap-1 rounded-pill bg-sunken px-2 py-0.5 tnum"><Bus className="size-3" aria-hidden />{t('map.commute.min', { n: est.shuttleMin })}</span>}
      </span>
    );
  }

  return (
    <section className={cn('flex flex-col gap-3', className)} aria-label={t('map.commute.title')}>
      {showTitle && (
        <header className="flex items-baseline justify-between gap-2">
          <h3 className="text-small font-semibold text-ink">{t('map.commute.title')}</h3>
          {campusName && <span className="truncate text-caption text-ink-3">{t('map.commute.to', { campus: campusName })}</span>}
        </header>
      )}
      {q.isLoading && !est ? (
        <div className="flex gap-2" aria-busy="true">
          <Skeleton variant="rect" height={64} className="flex-1" /><Skeleton variant="rect" height={64} className="flex-1" /><Skeleton variant="rect" height={64} className="flex-1" />
        </div>
      ) : q.isError && !est ? (
        <p className="flex items-center gap-1.5 text-small text-ink-3"><CircleAlert className="size-4" aria-hidden />{t('map.commute.error')}</p>
      ) : est ? (
        <>
          <div className="flex gap-2">
            <Tile icon={Footprints} label={t('map.commute.walk')} minutes={est.walkMin} />
            <Tile icon={Bike} label={t('map.commute.bike')} minutes={est.bikeMin} />
            <Tile icon={Bus} label={t('map.commute.shuttle')} minutes={est.shuttleMin} muted={est.shuttleMin == null} hint={est.shuttleMin == null ? t('map.commute.noShuttle') : undefined} />
          </div>
          <dl className="flex flex-col gap-1 text-small text-ink-2">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink-3">{t('map.commute.distance', { distance: '' }).trim()}</dt>
              <dd className="tnum">{formatDistance(est.distanceM)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink-3">{t('map.commute.nearestStop')}</dt>
              <dd className="flex min-w-0 items-center gap-1 text-right">
                {est.nearestStop ? (
                  <Link to={`/shuttle?stop=${est.nearestStop.id}`} className="flex min-w-0 items-center gap-1 text-ink hover:underline">
                    <MapPin className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                    <span className="truncate">{isZh ? est.nearestStop.nameZh ?? est.nearestStop.name : est.nearestStop.name}</span>
                    <span className="shrink-0 tnum text-ink-3">· {formatDistance(est.nearestStop.distanceM)}</span>
                  </Link>
                ) : (
                  <span className="text-ink-3">{t('map.commute.noShuttle')}</span>
                )}
              </dd>
            </div>
          </dl>
          <p className="text-caption text-ink-4">{t('map.commute.approxNote')}</p>
        </>
      ) : null}
    </section>
  );
}

export default CommuteCard;
