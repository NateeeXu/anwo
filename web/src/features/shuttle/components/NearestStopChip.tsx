// Reusable 「最近站点」 chip for listing / item / buddy cards and detail pages.
//
//   <NearestStopChip campusId={l.campusId} lat={l.lat} lng={l.lng} />                       // fetches /api/shuttle/nearby (cached 10 min)
//   <NearestStopChip campusId={l.campusId} stop={l.commute.nearestStop} distanceM={…} />    // no fetch when the card already carries the stop
//
// Renders nothing when there is no active stop within `radiusM` (default 800 m). Click → /shuttle?stop=<id>.
import { Bus } from 'lucide-react';
import { Link } from 'react-router';
import { Chip } from '@/components';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { useNearbyStops } from '../api';
import { stopName } from '../labels';

export type NearestStopChipProps = {
  campusId: string | null | undefined;
  lat?: number | null;
  lng?: number | null;
  /** Pre-resolved stop (skips the request). */
  stop?: { id: string; name: string; nameZh?: string | null } | null;
  distanceM?: number | null;
  radiusM?: number;
  size?: 'sm' | 'md';
  /** Plain chip without the link (inside another link, e.g. a card). */
  asText?: boolean;
  className?: string;
};

export function NearestStopChip({ campusId, lat, lng, stop, distanceM, radiusM = 800, size = 'sm', asText = false, className }: NearestStopChipProps) {
  const t = useT();
  const { locale } = useLocale();
  const q = useNearbyStops({ campusId, lat, lng, radiusM, limit: 1 }, { enabled: !stop });
  const resolved = stop ? { stop, distanceM: distanceM ?? null } : q.data?.stops[0] ? { stop: q.data.stops[0], distanceM: q.data.stops[0].distanceM } : null;
  if (!resolved) return null;
  const walk = resolved.distanceM != null ? Math.max(1, Math.ceil(resolved.distanceM / 80)) : null;
  const label = walk != null ? t('shuttle.nearestStopChip', { stop: stopName(resolved.stop, locale), n: walk }) : stopName(resolved.stop, locale);
  const chip = (
    <Chip size={size} icon={<Bus />} className={cn('max-w-full', className)} title={t('shuttle.nearestStop')}>
      <span className="truncate">{label}</span>
    </Chip>
  );
  if (asText) return chip;
  return (
    <Link to={`/shuttle?stop=${encodeURIComponent(resolved.stop.id)}`} className="inline-flex max-w-full rounded-pill focus-visible:outline-none" aria-label={`${t('shuttle.nearestStop')}: ${label}`} onClick={(e) => e.stopPropagation()}>
      {chip}
    </Link>
  );
}

export default NearestStopChip;
