// DESIGN.md §4.1 Listing Card — the signature card. Exported for other modules (home, search, wanted matches, chat context cards).
//   <ListingCard listing={card} />                         grid (photo 4:3 + ink price stub overlapping the photo)
//   <ListingCard listing={card} variant="row" />           compact row (map list, context cards)
//   onHover(id | null) wires list ↔ map pin highlighting; `active` draws the accent border when a pin is selected.
import { ArrowUpRight, Bike, Bus, Footprints, Home, Images } from 'lucide-react';
import { forwardRef, type MouseEvent } from 'react';
import { Link } from 'react-router';
import type { ListingCard as ListingCardDto } from '@shared/types';
import { Badge, Card, Price, TrustBadge } from '@/components';
import { useCampus } from '@/lib/campus';
import { useLocale, useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { SaveButton } from './SaveButton';

export type ListingCardProps = {
  listing: ListingCardDto;
  variant?: 'grid' | 'row';
  onHover?: (id: string | null) => void;
  /** selected on the map → accent border */
  active?: boolean;
  /** force the nationwide third meta line */
  showCity?: boolean;
  /** hide the save heart (owner views, previews) */
  noSave?: boolean;
  /** opened this session → muted title (DESIGN §4.4 visited) */
  visited?: boolean;
  className?: string;
  /** extra link query, e.g. `?boost=<id>` for sponsored click accounting */
  linkState?: Record<string, unknown>;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
};

export function roomsLabel(l: Pick<ListingCardDto, 'bedrooms' | 'bathrooms' | 'propertyType'>, t: ReturnType<typeof useT>, formatRooms: (b: number, ba: number) => string): string {
  if (l.propertyType === 'room') return t('listings.card.room');
  if (l.propertyType === 'shared_room') return t('listings.card.sharedRoom');
  if (l.bedrooms === 0) return t('listings.card.studio');
  return formatRooms(l.bedrooms, l.bathrooms);
}

export const ListingCard = forwardRef<HTMLElement, ListingCardProps>(function ListingCard(
  { listing: l, variant = 'grid', onHover, active, showCity, noSave, visited, className, linkState, onClick },
  ref,
) {
  const t = useT();
  const { formatMoney, formatDate, formatDistance, formatRooms } = useLocale();
  const { scope } = useCampus();
  const inactive = l.status !== 'active';
  const stateLabel = l.status === 'rented' ? t('listings.card.rented') : l.status === 'paused' ? t('listings.card.paused') : l.status === 'draft' ? t('listings.card.draft') : l.status === 'expired' ? t('listings.card.expired') : null;
  const to = `/listings/${l.id}${l.sponsored && l.boostTier ? '?src=sponsored' : ''}`;
  const dates = `${formatDate(l.availableFrom, 'monthDay')}${l.availableTo ? ` – ${formatDate(l.availableTo, 'monthDay')}` : ` ${t('listings.card.openEnded')}`}`;
  const furnished = l.furnished === 'full' ? t('listings.card.furnishedFull') : l.furnished === 'partial' ? t('listings.card.furnishedPartial') : null;
  const meta1 = [roomsLabel(l, t, formatRooms), furnished, dates].filter(Boolean).join(' · ');
  const cityLine = (showCity ?? scope === 'nationwide') ? t('listings.card.campusLine', { city: l.city, state: l.state, campus: l.campus?.shortName ?? l.campusId }) : null;
  const hover = { onMouseEnter: () => onHover?.(l.id), onMouseLeave: () => onHover?.(null), onFocus: () => onHover?.(l.id), onBlur: () => onHover?.(null) };

  const commute = (
    <p className="flex min-w-0 items-center gap-2 text-small text-ink-3">
      {l.commuteWalkMin != null && l.commuteWalkMin <= 45 && (
        <span className="flex items-center gap-1 whitespace-nowrap"><Footprints className="size-3.5 shrink-0" aria-hidden />{t('listings.card.walk', { n: l.commuteWalkMin })}</span>
      )}
      {l.commuteWalkMin != null && l.commuteWalkMin > 45 && l.distanceToCampusM != null && (
        <span className="flex items-center gap-1 whitespace-nowrap"><Bike className="size-3.5 shrink-0" aria-hidden />{t('listings.card.fromCampus', { d: formatDistance(l.distanceToCampusM) })}</span>
      )}
      {l.nearShuttle && (
        <span className="flex items-center gap-1 whitespace-nowrap rounded-pill bg-sunken px-1.5 py-px text-caption text-ink-2"><Bus className="size-3.5 shrink-0" aria-hidden />{l.commuteShuttleMin != null ? t('listings.card.shuttle', { n: l.commuteShuttleMin }) : t('listings.card.nearShuttle')}</span>
      )}
    </p>
  );

  if (variant === 'row') {
    return (
      <Card ref={ref} as="article" interactive padding="none" data-listing-id={l.id} className={cn('flex gap-3 p-2 pr-3', active && 'border-accent', className)} {...hover}>
        <Link to={to} state={linkState} onClick={onClick} className="absolute inset-0 rounded-card" aria-label={l.title} />
        <div className={cn('relative h-[72px] w-24 shrink-0 overflow-hidden rounded-sm bg-sunken', inactive && 'opacity-70 grayscale')}>
          {l.coverUrl ? <img src={l.coverUrl} alt="" loading="lazy" className="size-full object-cover dark:brightness-[.92]" /> : <Home className="m-auto size-6 text-ink-4" aria-hidden />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            {l.sponsored && <Badge variant="boosted" size="sm" icon={<ArrowUpRight className="size-3" aria-hidden />} />}
            <span className="text-price tabular-nums text-ink">{stateLabel ?? formatMoney(l.priceCents, { perMonth: true, compact: true })}</span>
          </div>
          <h3 className={cn('truncate text-body font-semibold', visited ? 'text-ink-2' : 'text-ink')}>{l.title}</h3>
          <p className="truncate text-small text-ink-2">{meta1}</p>
          {cityLine && <p className="truncate text-small text-ink-3">{cityLine}</p>}
        </div>
      </Card>
    );
  }

  return (
    <Card ref={ref} as="article" interactive padding="none" data-listing-id={l.id} className={cn('flex flex-col overflow-hidden', active && 'border-accent', className)} {...hover}>
      <Link to={to} state={linkState} onClick={onClick} className="flex flex-1 flex-col rounded-card focus-visible:outline-none" aria-label={l.title}>
        <div className={cn('relative aspect-[4/3] w-full overflow-hidden bg-sunken', inactive && 'opacity-70 grayscale')}>
          {l.coverUrl ? (
            <img src={l.coverUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-token-base ease-out [@media(hover:hover)]:group-hover:scale-[1.02] dark:brightness-[.92]" />
          ) : (
            <div className="flex size-full items-center justify-center text-ink-4"><Home className="size-8" strokeWidth={1.5} aria-hidden /></div>
          )}
          {l.photoCount > 1 && (
            <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-pill bg-surface/90 px-2 py-0.5 text-caption text-ink-2"><Images className="size-3" aria-hidden />{l.photoCount}</span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3 pt-0 lg:p-4 lg:pt-0">
          <div className="relative -mt-3.5 w-fit">
            {stateLabel ? (
              <span className="relative inline-flex h-8 items-center rounded-sm bg-sunken px-2.5 text-price text-ink-3">{stateLabel}</span>
            ) : (
              <Price cents={l.priceCents} perMonth size="stub" />
            )}
          </div>
          <p className="truncate text-small text-ink-2">{meta1}</p>
          <h3 className={cn('truncate text-body font-semibold', visited ? 'text-ink-2' : 'text-ink')}>{l.title}</h3>
          {commute}
          {cityLine && <p className="truncate text-small text-ink-3">{cityLine}</p>}
          <div className="mt-auto flex items-center gap-2 pt-1 text-small text-ink-2">
            <TrustBadge level={l.ownerTrustLevel} size="card" />
            {l.isVerifiedListing && <span className="ml-auto truncate text-caption text-accent-text">{t('listings.card.verifiedListing')}</span>}
          </div>
        </div>
      </Link>
      {l.sponsored && (
        <span className="pointer-events-none absolute left-2 top-2 z-layer-raised">
          <Badge variant="boosted" size="sm" icon={<ArrowUpRight className="size-3" aria-hidden />} />
        </span>
      )}
      {!noSave && <SaveButton id={l.id} saved={l.saved} />}
    </Card>
  );
});

export default ListingCard;
