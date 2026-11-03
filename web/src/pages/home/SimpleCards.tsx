// SIMPLE generic cards used by the scaffold pages (Home, Search, Profile) until module agents ship the
// real ListingCard / WantedCard / ItemCard / BuddyCard. Module agents own the real cards; these stay
// intentionally plain (Card chassis + price stub) and must not be imported by modules.
import { Bus, CalendarDays, Footprints, MapPin, Users } from 'lucide-react';
import { Link } from 'react-router';
import type { BuddyCard, Campus, ItemCard, ListingCard, UserPublic, WantedCard } from '@shared/types';
import { Avatar, Badge, Card, TrustBadge } from '../../components';
import { useLocale, useT } from '../../lib/i18n';
import { cn } from '../../lib/cn';

function Photo({ src, alt, ratio = 'aspect-[4/3]', className }: { src: string | null; alt: string; ratio?: string; className?: string }) {
  return (
    <div className={cn('relative w-full overflow-hidden bg-sunken', ratio, className)}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" className="size-full object-cover dark:brightness-[.92]" />
      ) : (
        <div className="flex size-full items-center justify-center text-ink-4">
          <MapPin className="size-8" strokeWidth={1.5} aria-hidden />
        </div>
      )}
    </div>
  );
}

function HostRow({ user, className }: { user?: UserPublic | null; className?: string }) {
  if (!user) return null;
  return (
    <div className={cn('flex items-center gap-2 text-small text-ink-2', className)}>
      <Avatar src={user.avatarUrl ?? undefined} name={user.name} size="xs" trustLevel={user.trustLevel as 0 | 1 | 2 | 3} />
      <span className="truncate">{user.name}</span>
      <TrustBadge level={user.trustLevel as 0 | 1 | 2 | 3} size="inline" />
    </div>
  );
}

export function SimpleListingCard({ listing, nationwide, className }: { listing: ListingCard; nationwide?: boolean; className?: string }) {
  const t = useT();
  const { formatMoney, formatDate, formatDistance, formatRooms } = useLocale();
  const rented = listing.status !== 'active';
  return (
    <Card as="article" interactive padding="none" className={cn('flex flex-col overflow-hidden', className)}>
      <Link to={`/listings/${listing.id}`} className="flex flex-1 flex-col rounded-card focus-visible:outline-none">
        <div className={cn(rented && 'opacity-70 grayscale')}>
          <Photo src={listing.coverUrl} alt={listing.title} />
        </div>
        {listing.sponsored && (
          <span className="absolute left-2 top-2">
            <Badge variant="boosted" size="sm">{t('common.boosted')}</Badge>
          </span>
        )}
        <div className="flex flex-1 flex-col gap-1 p-3 lg:p-4">
          <span className="-mt-[26px] mb-1 w-fit rounded-sm bg-inverse px-2.5 py-1 text-price text-ink-inverse tnum">
            {rented ? t('listing.rented') : formatMoney(listing.priceCents, { perMonth: true, compact: true })}
          </span>
          <p className="text-small text-ink-2">
            {formatRooms(listing.bedrooms, listing.bathrooms)}
            {listing.furnished !== 'none' && ` · ${t('listing.furnished')}`}
            {listing.availableFrom && ` · ${formatDate(listing.availableFrom, 'monthDay')}${listing.availableTo ? `–${formatDate(listing.availableTo, 'monthDay')}` : ''}`}
          </p>
          <h3 className="truncate text-body font-semibold text-ink">{listing.title}</h3>
          <p className="flex items-center gap-1.5 text-small text-ink-3">
            {listing.commuteWalkMin != null && (
              <span className="flex items-center gap-1">
                <Footprints className="size-3.5" aria-hidden />
                {t('listing.walkMin', { n: listing.commuteWalkMin })}
              </span>
            )}
            {listing.nearShuttle && (
              <span className="flex items-center gap-1">
                <Bus className="size-3.5" aria-hidden />
                {listing.commuteShuttleMin != null ? t('listing.shuttleMin', { n: listing.commuteShuttleMin }) : t('listing.nearShuttle')}
              </span>
            )}
            {listing.commuteWalkMin == null && !listing.nearShuttle && listing.distanceToCampusM != null && (
              <span>{t('listing.fromCampus', { d: formatDistance(listing.distanceToCampusM) })}</span>
            )}
          </p>
          {nationwide && (
            <p className="text-small text-ink-3">
              {listing.city}, {listing.state} · {listing.campus?.shortName}
            </p>
          )}
        </div>
      </Link>
      <div className="px-3 pb-3 lg:px-4 lg:pb-4">
        <div className="flex items-center gap-2 text-small text-ink-2">
          <TrustBadge level={listing.ownerTrustLevel as 0 | 1 | 2 | 3} size="card" showLabel />
        </div>
      </div>
    </Card>
  );
}

export function SimpleWantedCard({ wanted, className }: { wanted: WantedCard; className?: string }) {
  const t = useT();
  const { formatDate, formatMoneyRange } = useLocale();
  return (
    <Card as="article" interactive padding="sm" className={cn('flex gap-3', className)}>
      <span className="h-fit shrink-0 rounded-sm bg-inverse px-2.5 py-1 text-price text-ink-inverse tnum">
        {formatMoneyRange(wanted.budgetMinCents, wanted.budgetMaxCents)}
      </span>
      <div className="min-w-0 flex-1">
        <Link to={`/wanted/${wanted.id}`} className="block truncate text-body font-semibold text-ink hover:underline">
          {wanted.title}
        </Link>
        <p className="text-small text-ink-2">
          {formatDate(wanted.moveInFrom, 'monthDay')} – {formatDate(wanted.moveInTo, 'monthDay')} · {t('wanted.people', { n: wanted.groupSize })}
          {wanted.matchCount > 0 && ` · ${t('wanted.matches', { n: wanted.matchCount })}`}
        </p>
        <HostRow user={wanted.author} className="mt-1" />
      </div>
    </Card>
  );
}

export function SimpleItemCard({ item, className }: { item: ItemCard; className?: string }) {
  const t = useT();
  const { formatPrice, formatDistance } = useLocale();
  const sold = item.status === 'sold';
  return (
    <Card as="article" interactive padding="none" className={cn('overflow-hidden', className)}>
      <Link to={`/market/${item.id}`} className="block rounded-card focus-visible:outline-none">
        <div className={cn(sold && 'opacity-70')}>
          <Photo src={item.coverUrl} alt={item.title} ratio="aspect-square" />
        </div>
        <div className="p-3">
          <span className={cn('-mt-[26px] mb-1 block w-fit rounded-sm px-2.5 py-1 text-price tnum', sold ? 'bg-sunken text-ink-3' : 'bg-inverse text-ink-inverse')}>
            {sold ? t('item.sold') : formatPrice(item)}
          </span>
          <h3 className="truncate text-body font-semibold text-ink">{item.title}</h3>
          <p className="truncate text-small text-ink-3">
            {t(`item.condition.${item.condition}`)} · {t(`item.category.${item.category}`)}
            {item.distanceToCampusM != null && ` · ${t('listing.fromCampus', { d: formatDistance(item.distanceToCampusM) })}`}
          </p>
        </div>
      </Link>
    </Card>
  );
}

export function SimpleBuddyCard({ post, className }: { post: BuddyCard; className?: string }) {
  const t = useT();
  const { formatDate } = useLocale();
  const d = post.startsAt ? new Date(post.startsAt) : null;
  const today = d && new Date().toDateString() === d.toDateString();
  return (
    <Card as="article" interactive padding="sm" className={cn('flex gap-3', className)}>
      <div className={cn('flex w-14 shrink-0 flex-col items-center justify-center rounded-sm py-1 text-center', today ? 'bg-accent-soft text-accent-text-strong' : 'bg-sunken text-ink')}>
        {d ? (
          <>
            <span className="text-caption">{formatDate(d, 'month', { year: false })}</span>
            <span className="text-h3 tnum">{d.getDate()}</span>
          </>
        ) : (
          <CalendarDays className="size-5 text-ink-3" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Link to={`/buddy/${post.id}`} className="block truncate text-body font-semibold text-ink hover:underline">
          {post.title}
        </Link>
        <p className="truncate text-small text-ink-2">
          {d && formatDate(d, 'time')}
          {post.locationName && ` · ${post.locationName}`}
          {!d && !post.locationName && t(`buddy.type.${post.type}`)}
        </p>
        <p className="mt-1 flex items-center gap-2 text-small text-ink-3">
          <Users className="size-3.5" aria-hidden />
          {t('buddy.members', { n: post.memberCount, max: post.maxMembers })}
          {post.verifiedOnly && <Badge variant="neutral" size="sm">{t('common.verifiedOnly')}</Badge>}
        </p>
      </div>
    </Card>
  );
}

export function SimpleUserRow({ user, className }: { user: UserPublic; className?: string }) {
  return (
    <Card as="article" interactive padding="sm" className={cn('flex items-center gap-3', className)}>
      <Avatar src={user.avatarUrl ?? undefined} name={user.name} size="md" trustLevel={user.trustLevel as 0 | 1 | 2 | 3} />
      <div className="min-w-0 flex-1">
        <Link to={`/u/${user.id}`} className="flex items-center gap-1.5 text-body font-semibold text-ink hover:underline">
          <span className="truncate">{user.name}</span>
          <TrustBadge level={user.trustLevel as 0 | 1 | 2 | 3} size="inline" />
        </Link>
        <p className="truncate text-small text-ink-3">
          {user.campus?.shortName}
          {user.program && ` · ${user.program}`}
        </p>
      </div>
    </Card>
  );
}

export function SimpleCampusRow({ campus, className }: { campus: Campus; className?: string }) {
  const { locale } = useLocale();
  return (
    <Card as="article" interactive padding="sm" className={cn('flex items-center gap-3', className)}>
      <span className="flex size-10 items-center justify-center rounded-pill bg-sunken text-ink-2">
        <MapPin className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <Link to={`/listings?campus=${campus.id}`} className="block truncate text-body font-semibold text-ink hover:underline">
          {locale === 'zh-CN' && campus.nameZh ? `${campus.nameZh} ${campus.shortName}` : campus.name}
        </Link>
        <p className="text-small text-ink-3">
          {campus.city}, {campus.state}
        </p>
      </div>
    </Card>
  );
}
