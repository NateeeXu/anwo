// Mini cards for the result drawer: one row per pin (item / buddy / stop / poi) and a ListingCard row for listings
// when the server hydrated the card (nearest 40), else the same simple row. All rows link to the entity page.
import { forwardRef } from 'react';
import { ArrowUpRight, Bus, Calendar, ExternalLink, Footprints, MapPin, Users } from 'lucide-react';
import { Link } from 'react-router';
import type { ListingCard as ListingCardDto, Poi, ShuttleStop } from '@shared/types';
import type { MapPin as MapPinDto, ShuttleRouteLite } from '@shared/schemas/map';
import { Badge, Price } from '@/components';
import { ListingCard } from '@/features/listings';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { POI_ICONS, poiCategoryKey } from '../labels';

type RowProps = {
  active?: boolean;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
};

const rowClass = (active?: boolean) =>
  cn(
    'group flex w-full items-stretch gap-3 rounded-card border bg-surface p-2.5 text-left transition-colors',
    active ? 'border-accent shadow-sm' : 'border-line hover:border-line-strong hover:shadow-sm',
  );

function Thumb({ src, alt, icon: Icon }: { src?: string | null; alt: string; icon: typeof MapPin }) {
  return src ? (
    <img src={src} alt={alt} className="size-16 shrink-0 rounded-ctl bg-sunken object-cover dark:brightness-[.92]" loading="lazy" />
  ) : (
    <span className="flex size-16 shrink-0 items-center justify-center rounded-ctl bg-sunken text-ink-3" aria-hidden>
      <Icon className="size-5" strokeWidth={1.5} />
    </span>
  );
}

export const ListingRow = forwardRef<HTMLDivElement, RowProps & { pin: MapPinDto; card?: ListingCardDto }>(function ListingRow({ pin, card, active, onHover, onSelect }, ref) {
  const t = useT();
  if (card) {
    return (
      <div ref={ref} data-pin={`listing:${pin.id}`} onClick={() => onSelect?.(pin.id)}>
        <ListingCard listing={card} variant="row" active={active} onHover={onHover} className="w-full" />
      </div>
    );
  }
  return (
    <div ref={ref} data-pin={`listing:${pin.id}`}>
      <Link
        to={pin.link}
        className={rowClass(active)}
        onMouseEnter={() => onHover?.(pin.id)}
        onMouseLeave={() => onHover?.(null)}
        onFocus={() => onHover?.(pin.id)}
        onBlur={() => onHover?.(null)}
        onClick={() => onSelect?.(pin.id)}
      >
        <Thumb src={pin.imageUrl} alt={pin.title} icon={MapPin} />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span className="flex items-center gap-1.5">
            <Price cents={pin.priceCents ?? 0} perMonth size="inline" />
            {pin.boostTier && <ArrowUpRight className="size-3.5 text-ink-3" aria-label={t('map.pin.boosted')} />}
          </span>
          <span className="truncate text-small text-ink">{pin.title}</span>
          <span className="flex items-center gap-2 truncate text-caption text-ink-3">
            {pin.subtitle}
            {pin.nearShuttle && <span className="inline-flex items-center gap-0.5"><Bus className="size-3" aria-hidden />{t('map.pin.nearShuttle')}</span>}
          </span>
        </div>
      </Link>
    </div>
  );
});

export const ItemRow = forwardRef<HTMLDivElement, RowProps & { pin: MapPinDto }>(function ItemRow({ pin, active, onHover, onSelect }, ref) {
  const t = useT();
  return (
    <div ref={ref} data-pin={`item:${pin.id}`}>
      <Link to={pin.link} className={rowClass(active)} onMouseEnter={() => onHover?.(pin.id)} onMouseLeave={() => onHover?.(null)} onFocus={() => onHover?.(pin.id)} onBlur={() => onHover?.(null)} onClick={() => onSelect?.(pin.id)}>
        <Thumb src={pin.imageUrl} alt={pin.title} icon={MapPin} />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span className="flex items-center gap-1.5">
            <Price cents={pin.priceCents ?? 0} isFree={pin.isFree} obo={pin.obo} size="inline" />
            {pin.boostTier && <ArrowUpRight className="size-3.5 text-ink-3" aria-label={t('map.pin.boosted')} />}
          </span>
          <span className="truncate text-small text-ink">{pin.title}</span>
          <span className="truncate text-caption text-ink-3">{pin.subtitle} · {t('map.pin.approx')}</span>
        </div>
      </Link>
    </div>
  );
});

export const BuddyRow = forwardRef<HTMLDivElement, RowProps & { pin: MapPinDto; timeZone?: string }>(function BuddyRow({ pin, timeZone, active, onHover, onSelect }, ref) {
  const t = useT();
  const { formatDate, formatMoney } = useLocale();
  const when = pin.startsAt ? formatDate(pin.startsAt, 'datetime', { timeZone }) : t('map.pin.noDate');
  return (
    <div ref={ref} data-pin={`buddy:${pin.id}`}>
      <Link to={pin.link} className={rowClass(active)} onMouseEnter={() => onHover?.(pin.id)} onMouseLeave={() => onHover?.(null)} onFocus={() => onHover?.(pin.id)} onBlur={() => onHover?.(null)} onClick={() => onSelect?.(pin.id)}>
        <span className="flex size-16 shrink-0 flex-col items-center justify-center rounded-ctl bg-sunken text-ink-2" aria-hidden>
          <Calendar className="size-4" strokeWidth={1.75} />
          <span className="mt-1 text-caption tnum">{pin.startsAt ? when.split(' ')[0] : '—'}</span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span className="truncate text-small font-semibold text-ink">{pin.title}</span>
          <span className="truncate text-caption text-ink-2">{when}</span>
          <span className="flex items-center gap-1 truncate text-caption text-ink-3">
            <Users className="size-3" aria-hidden />{pin.subtitle}
            {pin.priceCents != null && pin.priceCents > 0 && <span>· {t('map.pin.splitCost', { price: formatMoney(pin.priceCents) })}</span>}
          </span>
        </div>
      </Link>
    </div>
  );
});

export const StopRow = forwardRef<HTMLDivElement, RowProps & { stop: ShuttleStop & { routes: Pick<ShuttleRouteLite, 'id' | 'name' | 'shortName' | 'color'>[] } }>(function StopRow({ stop, active, onHover, onSelect }, ref) {
  const t = useT();
  const { isZh } = useLocale();
  return (
    <div ref={ref} data-pin={`stop:${stop.id}`}>
      <Link to={`/shuttle?stop=${stop.id}`} className={rowClass(active)} onMouseEnter={() => onHover?.(stop.id)} onMouseLeave={() => onHover?.(null)} onFocus={() => onHover?.(stop.id)} onBlur={() => onHover?.(null)} onClick={() => onSelect?.(stop.id)}>
        <span className="flex size-16 shrink-0 items-center justify-center rounded-ctl bg-sunken text-ink-2" aria-hidden><Bus className="size-5" strokeWidth={1.5} /></span>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <span className="truncate text-small font-semibold text-ink">{isZh ? stop.nameZh ?? stop.name : stop.name}</span>
          <span className="flex flex-wrap gap-1">
            {stop.routes.length ? stop.routes.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1 rounded-pill bg-sunken px-1.5 py-0.5 text-caption text-ink-2">
                <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />{r.shortName ?? r.name}
              </span>
            )) : <span className="text-caption text-ink-3">{t('map.stop.noRoutes')}</span>}
          </span>
        </div>
      </Link>
    </div>
  );
});

export const PoiRow = forwardRef<HTMLDivElement, RowProps & { poi: Poi; onSearchAround?: (poi: Poi) => void }>(function PoiRow({ poi, active, onHover, onSelect, onSearchAround }, ref) {
  const t = useT();
  const { isZh } = useLocale();
  const Icon = POI_ICONS[poi.category] ?? MapPin;
  return (
    <div ref={ref} data-pin={`poi:${poi.id}`}>
      <div
        role="button"
        tabIndex={0}
        className={cn(rowClass(active), 'cursor-pointer')}
        onMouseEnter={() => onHover?.(poi.id)}
        onMouseLeave={() => onHover?.(null)}
        onFocus={() => onHover?.(poi.id)}
        onBlur={() => onHover?.(null)}
        onClick={() => onSelect?.(poi.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(poi.id); } }}
      >
        <span className="flex size-16 shrink-0 items-center justify-center rounded-ctl bg-sunken text-ink-2" aria-hidden><Icon className="size-5" strokeWidth={1.5} /></span>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span className="flex items-center gap-1.5 truncate text-small font-semibold text-ink">
            {isZh ? poi.nameZh ?? poi.name : poi.name}
          </span>
          <span className="flex items-center gap-1.5 text-caption text-ink-3">
            <Badge variant="neutral" size="sm">{t(poiCategoryKey(poi.category))}</Badge>
            <span className="truncate">{poi.address}</span>
          </span>
          <span className="flex items-center gap-3 text-caption">
            {onSearchAround && (
              <button type="button" className="inline-flex items-center gap-1 text-accent-text hover:underline" onClick={(e) => { e.stopPropagation(); onSearchAround(poi); }}>
                <Footprints className="size-3" aria-hidden />{t('map.poi.searchAround')}
              </button>
            )}
            {poi.url && (
              <a href={poi.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink-2 hover:underline" onClick={(e) => e.stopPropagation()}>
                <ExternalLink className="size-3" aria-hidden />{t('map.poi.website')}
              </a>
            )}
          </span>
        </div>
      </div>
    </div>
  );
});
