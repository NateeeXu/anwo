// Inline commute chips (walk / bike / shuttle) for cards and detail rails. Added by the `map` module.
//   <CommuteBadge lat={l.lat} lng={l.lng} campusId={l.campusId} />        fetches /api/map/commute
//   <CommuteBadge walkMin={12} bikeMin={4} shuttleMin={null} />            static (values already on the card)
import { Bike, Bus, Footprints } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { useCommute } from './hooks';

export type CommuteBadgeProps = {
  lat?: number | null;
  lng?: number | null;
  campusId?: string | null;
  walkMin?: number | null;
  bikeMin?: number | null;
  shuttleMin?: number | null;
  /** hide a mode (e.g. no bike on buddy cards) */
  modes?: ('walk' | 'bike' | 'shuttle')[];
  size?: 'sm' | 'md';
  className?: string;
};

export function CommuteBadge({ lat, lng, campusId, walkMin, bikeMin, shuttleMin, modes = ['walk', 'bike', 'shuttle'], size = 'sm', className }: CommuteBadgeProps) {
  const { formatMinutes } = useLocale();
  const needFetch = walkMin === undefined && typeof lat === 'number' && typeof lng === 'number';
  const q = useCommute({ lat, lng, campusId }, needFetch);
  const w = walkMin !== undefined ? walkMin : q.data?.walkMin ?? null;
  const b = bikeMin !== undefined ? bikeMin : q.data?.bikeMin ?? null;
  const s = shuttleMin !== undefined ? shuttleMin : q.data?.shuttleMin ?? null;
  const items = [
    modes.includes('walk') && w != null && { key: 'walk', icon: Footprints, label: formatMinutes(w, 'walk') },
    modes.includes('bike') && b != null && { key: 'bike', icon: Bike, label: formatMinutes(b, 'bike') },
    modes.includes('shuttle') && s != null && { key: 'shuttle', icon: Bus, label: formatMinutes(s, 'shuttle') },
  ].filter(Boolean) as { key: string; icon: typeof Footprints; label: string }[];
  if (!items.length) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      {items.map((it) => (
        <span key={it.key} className={cn('inline-flex items-center gap-1 rounded-pill bg-sunken text-ink-2 tnum', size === 'sm' ? 'h-6 px-2 text-caption' : 'h-7 px-2.5 text-small')}>
          <it.icon className={size === 'sm' ? 'size-3' : 'size-3.5'} aria-hidden strokeWidth={1.75} />
          {it.label}
        </span>
      ))}
    </span>
  );
}

export default CommuteBadge;
