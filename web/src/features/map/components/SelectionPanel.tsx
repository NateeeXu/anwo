// Floating card for the selected thing on the explore map (DESIGN §7.9): what it is, how far campus is
// (CommuteCard = the 「到校通勤」 tool) and the next action. Desktop: bottom-left over the map; mobile: above the drawer.
import { ArrowUpRight, Bus, CircleDot, ExternalLink, LocateFixed, MapPin, Search, X } from 'lucide-react';
import { Link } from 'react-router';
import type { Poi, ShuttleStop } from '@shared/types';
import type { GeocodeHit, MapPin as MapPinDto, ShuttleRouteLite } from '@shared/schemas/map';
import { Badge, Button, Price } from '@/components';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { POI_ICONS, poiCategoryKey } from '../labels';
import { CommuteCard } from './CommuteCard';

export type Selection =
  | { type: 'listing' | 'item' | 'buddy'; pin: MapPinDto }
  | { type: 'stop'; stop: ShuttleStop & { routes: Pick<ShuttleRouteLite, 'id' | 'name' | 'shortName' | 'color'>[] } }
  | { type: 'poi'; poi: Poi }
  | { type: 'search'; hit: GeocodeHit }
  | { type: 'me'; lat: number; lng: number; accuracyM: number };

export function selectionPoint(s: Selection): { lat: number; lng: number } {
  switch (s.type) {
    case 'stop': return { lat: s.stop.lat, lng: s.stop.lng };
    case 'poi': return { lat: s.poi.lat, lng: s.poi.lng };
    case 'search': return { lat: s.hit.lat, lng: s.hit.lng };
    case 'me': return { lat: s.lat, lng: s.lng };
    default: return { lat: s.pin.lat, lng: s.pin.lng };
  }
}

export type SelectionPanelProps = {
  selection: Selection;
  campusId: string | null;
  timeZone?: string;
  onClose: () => void;
  onSearchAround: (point: { lat: number; lng: number }) => void;
  onOpen?: (s: Selection) => void;
  /** mobile: no tags / alt name, commute as one chip row so the map stays visible */
  compact?: boolean;
  className?: string;
};

export function SelectionPanel({ selection: s, campusId, timeZone, onClose, onSearchAround, onOpen, compact, className }: SelectionPanelProps) {
  const t = useT();
  const { isZh, formatDate, formatMoney, formatDistance } = useLocale();
  const point = selectionPoint(s);

  let kicker = '';
  let title = '';
  let sub: React.ReactNode = null;
  let icon: React.ReactNode = <MapPin className="size-5" aria-hidden strokeWidth={1.5} />;
  let image: string | null = null;
  let action: React.ReactNode = null;
  let showCommute = true;
  let approx = false;

  switch (s.type) {
    case 'listing':
    case 'item':
    case 'buddy': {
      const p = s.pin;
      kicker = t(`map.pin.${s.type}`);
      title = p.title;
      image = p.imageUrl ?? null;
      approx = !!p.approx;
      sub = (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {s.type === 'listing' && <Price cents={p.priceCents ?? 0} perMonth size="inline" />}
          {s.type === 'item' && <Price cents={p.priceCents ?? 0} isFree={p.isFree} obo={p.obo} size="inline" />}
          {s.type === 'buddy' && <span className="text-small text-ink">{p.startsAt ? formatDate(p.startsAt, 'datetime', { timeZone }) : t('map.pin.noDate')}</span>}
          {p.boostTier && <Badge variant="boosted" size="sm" />}
          {p.subtitle && <span className="truncate text-small text-ink-2">{p.subtitle}</span>}
          {s.type === 'buddy' && p.priceCents != null && p.priceCents > 0 && <span className="text-small text-ink-2">{t('map.pin.splitCost', { price: formatMoney(p.priceCents) })}</span>}
        </span>
      );
      showCommute = s.type !== 'buddy';
      action = (
        <Button asChild size="sm" iconRight={<ArrowUpRight className="size-4" aria-hidden />}>
          <Link to={p.link} onClick={() => onOpen?.(s)}>{t(s.type === 'listing' ? 'map.pin.viewListing' : s.type === 'item' ? 'map.pin.viewItem' : 'map.pin.viewPost')}</Link>
        </Button>
      );
      break;
    }
    case 'stop': {
      kicker = t('map.stop.title');
      title = isZh ? s.stop.nameZh ?? s.stop.name : s.stop.name;
      icon = <Bus className="size-5" aria-hidden strokeWidth={1.5} />;
      sub = (
        <span className="flex flex-wrap gap-1">
          {s.stop.routes.length ? s.stop.routes.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1 rounded-pill bg-sunken px-2 py-0.5 text-caption text-ink-2">
              <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />{r.shortName ?? r.name}
            </span>
          )) : <span className="text-small text-ink-3">{t('map.stop.noRoutes')}</span>}
        </span>
      );
      action = (
        <Button asChild size="sm" variant="secondary" iconRight={<ArrowUpRight className="size-4" aria-hidden />}>
          <Link to={`/shuttle?stop=${s.stop.id}`} onClick={() => onOpen?.(s)}>{t('map.stop.view')}</Link>
        </Button>
      );
      break;
    }
    case 'poi': {
      const Icon = POI_ICONS[s.poi.category] ?? MapPin;
      kicker = t(poiCategoryKey(s.poi.category));
      title = isZh ? s.poi.nameZh ?? s.poi.name : s.poi.name;
      icon = <Icon className="size-5" aria-hidden strokeWidth={1.5} />;
      sub = (
        <span className="flex flex-col gap-1">
          {isZh && s.poi.nameZh && !compact && <span className="truncate text-small text-ink-2" lang="en">{s.poi.name}</span>}
          {s.poi.address && <span className="truncate text-small text-ink-2">{s.poi.address}</span>}
          {s.poi.tags.length > 0 && !compact && (
            <span className="flex flex-wrap gap-1">
              {s.poi.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-pill bg-sunken px-2 py-0.5 text-caption text-ink-2">{tag}</span>)}
            </span>
          )}
        </span>
      );
      action = s.poi.url ? (
        <Button asChild size="sm" variant="secondary" iconRight={<ExternalLink className="size-4" aria-hidden />}>
          <a href={s.poi.url} target="_blank" rel="noopener noreferrer">{t('map.poi.website')}</a>
        </Button>
      ) : null;
      break;
    }
    case 'search': {
      kicker = t('map.search.pinLabel');
      title = s.hit.addressLine1 ?? s.hit.displayName;
      approx = s.hit.approx;
      sub = <span className="truncate text-small text-ink-2">{s.hit.approx ? t('map.search.approx') : [s.hit.city, s.hit.state, s.hit.zip].filter(Boolean).join(', ')}</span>;
      icon = <Search className="size-5" aria-hidden strokeWidth={1.5} />;
      break;
    }
    case 'me': {
      kicker = t('map.locate');
      title = t('map.me.title');
      sub = <span className="text-small text-ink-2">{t('map.me.accuracy', { distance: formatDistance(Math.round(s.accuracyM)) })}</span>;
      icon = <LocateFixed className="size-5" aria-hidden strokeWidth={1.5} />;
      break;
    }
  }

  return (
    <section
      className={cn('pointer-events-auto flex w-full flex-col rounded-card border border-line bg-surface p-3 shadow-lg animate-rise-in', compact ? 'gap-2.5' : 'gap-3', className)}
      aria-label={title}
      data-testid="map-selection"
    >
      <header className="flex items-start gap-3">
        {image ? (
          <img src={image} alt="" className={cn('shrink-0 rounded-sm bg-sunken object-cover dark:brightness-[.92]', compact ? 'size-12' : 'size-14')} />
        ) : (
          <span className={cn('flex shrink-0 items-center justify-center rounded-sm bg-sunken text-ink-2', compact ? 'size-12' : 'size-14')}>{icon}</span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-caption text-ink-3">{kicker}{approx && <> · {t('map.pin.approx')}</>}</p>
          <h3 className="line-clamp-2 text-body font-semibold text-ink">{title}</h3>
          {sub}
        </div>
        <button type="button" onClick={onClose} className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-pill text-ink-3 hover:bg-sunken hover:text-ink" aria-label={t('map.poi.close')}>
          <X className="size-4" aria-hidden />
        </button>
      </header>
      {showCommute && campusId && (compact ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
          <span className="text-caption text-ink-2">{t('map.commute.title')}</span>
          <CommuteCard lat={point.lat} lng={point.lng} campusId={campusId} variant="inline" />
        </div>
      ) : (
        <CommuteCard lat={point.lat} lng={point.lng} campusId={campusId} className="border-t border-line pt-3" />
      ))}
      <footer className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="ghost" iconLeft={<CircleDot className="size-4" aria-hidden />} onClick={() => onSearchAround(point)}>
          {t('map.poi.searchAround')}
        </Button>
        {action}
      </footer>
    </section>
  );
}

export default SelectionPanel;
