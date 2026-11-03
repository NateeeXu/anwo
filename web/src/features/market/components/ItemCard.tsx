// DESIGN.md §4.2 Item Card: card chassis, square photo, ink price stub ($40 / 免费 / $40 OBO / 已售出), title,
// condition chip + category, pickup distance, seller row. Wishlist heart is a sibling button (not nested in the link).
import { forwardRef, type HTMLAttributes, type MouseEvent } from 'react';
import { ArrowUpRight, Heart, Truck } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import type { ItemCard as ItemCardDto } from '@shared/types';
import { Avatar, Badge, Card, TrustBadge } from '@/components';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { useWishlistToggle } from '../api';
import { CategoryIcon, statusLabelKey } from './shared';

export interface ItemCardProps extends HTMLAttributes<HTMLElement> {
  item: ItemCardDto;
  /** `grid` (default, square photo) or `row` (96×72 photo left, price inline) */
  variant?: 'grid' | 'row';
  /** Show the campus/city line (nationwide lists) */
  showCampus?: boolean;
  /** Hide the wishlist heart (owner dashboard, wishlist page uses its own) */
  hideWishlist?: boolean;
  /** Highlight (map ↔ list linking) */
  active?: boolean;
  /** Extra line under the meta (e.g. price-drop badge) */
  extra?: React.ReactNode;
  /** Where the card links to (default /market/:id) */
  to?: string;
}

export const ItemCard = forwardRef<HTMLElement, ItemCardProps>(function ItemCard({ item, variant = 'grid', showCampus, hideWishlist, active, extra, to, className, ...rest }, ref) {
  const t = useT();
  const { formatPrice, formatDistance } = useLocale();
  const { status: authStatus } = useAuth();
  const navigate = useNavigate();
  const toggle = useWishlistToggle();
  const sold = item.status === 'sold';
  const muted = sold || item.status === 'expired' || item.status === 'draft';
  const statusKey = statusLabelKey(item.status);
  const href = to ?? `/market/${item.id}${item.sponsored ? '?src=sponsored' : ''}`;
  const alt = t('market.card.photoAlt', { title: item.title, index: 1 });

  const onHeart = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (authStatus !== 'authed') {
      toast.info(t('market.toast.loginToWishlist'));
      navigate(`/login?next=${encodeURIComponent(`/market/${item.id}`)}`);
      return;
    }
    const on = !item.wishlisted;
    toggle.mutate({ id: item.id, on }, { onSuccess: () => toast.success(t(on ? 'market.wishlist.added' : 'market.wishlist.removed')) });
    track(on ? 'item.wishlist' : 'item.unwishlist', { entityType: 'market_item', entityId: item.id });
  };

  const heart = !hideWishlist && !sold && (
    <button
      type="button"
      onClick={onHeart}
      aria-pressed={!!item.wishlisted}
      aria-label={t(item.wishlisted ? 'market.card.unwishlist' : 'market.card.wishlist')}
      className={cn(
        'absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-pill bg-surface/90 text-ink-2 transition-colors duration-token-fast hover:text-ink focus-visible:outline-none',
        item.wishlisted && 'text-accent-text-strong',
      )}
    >
      <Heart className={cn('size-4', item.wishlisted && 'fill-current')} strokeWidth={1.75} aria-hidden />
    </button>
  );

  const stub = (
    <span className={cn('inline-flex h-8 items-center rounded-sm px-2.5 text-price tnum', sold || item.status === 'expired' ? 'bg-sunken text-ink-3' : 'bg-inverse text-ink-inverse')}>
      {statusKey ? t(statusKey) : formatPrice(item)}
    </span>
  );

  const meta = (
    <p className="flex min-w-0 items-center gap-1.5 truncate text-small text-ink-3">
      <span className="text-ink-2">{t(`market.cond.${item.condition}`)}</span>
      <span aria-hidden>·</span>
      <CategoryIcon category={item.category} className="size-3.5 shrink-0" />
      <span className="truncate">{t(`market.cat.${item.category}`)}</span>
      {item.distanceToCampusM != null && !showCampus && (
        <>
          <span aria-hidden>·</span>
          <span className="truncate">{t('market.card.fromCampus', { d: formatDistance(item.distanceToCampusM) })}</span>
        </>
      )}
    </p>
  );

  if (variant === 'row') {
    return (
      <Card ref={ref} as="article" interactive padding="none" data-active={active || undefined} className={cn('flex gap-3 p-2', active && 'border-accent', className)} {...rest}>
        <Link to={href} className="flex min-w-0 flex-1 gap-3 rounded-card focus-visible:outline-none" aria-label={item.title}>
          <div className={cn('relative size-[72px] shrink-0 overflow-hidden rounded-sm bg-sunken', muted && 'opacity-70')}>
            {item.coverUrl ? <img src={item.coverUrl} alt={alt} loading="lazy" className="size-full object-cover dark:brightness-[.92]" /> : <CategoryIcon category={item.category} className="absolute inset-0 m-auto size-6 text-ink-4" />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
            <div className="flex items-center gap-2">
              {item.sponsored && <Badge variant="boosted" size="sm" />}
              <h3 className="truncate text-body font-semibold text-ink">{item.title}</h3>
            </div>
            {meta}
            <span className={cn('text-price tnum', sold ? 'text-ink-3' : 'text-ink')}>{statusKey ? t(statusKey) : formatPrice(item)}</span>
            {extra}
          </div>
        </Link>
        {!hideWishlist && !sold && (
          <button type="button" onClick={onHeart} aria-pressed={!!item.wishlisted} aria-label={t(item.wishlisted ? 'market.card.unwishlist' : 'market.card.wishlist')} className={cn('flex size-9 shrink-0 items-center justify-center self-start rounded-pill text-ink-3 hover:bg-sunken hover:text-ink', item.wishlisted && 'text-accent-text-strong')}>
            <Heart className={cn('size-4', item.wishlisted && 'fill-current')} strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </Card>
    );
  }

  return (
    <Card ref={ref} as="article" interactive padding="none" data-active={active || undefined} className={cn('flex flex-col overflow-hidden', active && 'border-accent', className)} {...rest}>
      <Link to={href} className="flex flex-1 flex-col rounded-card focus-visible:outline-none" aria-label={item.title}>
        <div className={cn('relative aspect-square w-full overflow-hidden bg-sunken', muted && 'opacity-70', sold && 'grayscale')}>
          {item.coverUrl ? (
            <img src={item.coverUrl} alt={alt} loading="lazy" className="size-full object-cover transition-transform duration-token-base ease-out [@media(hover:hover)]:group-hover:scale-[1.02] dark:brightness-[.92]" />
          ) : (
            <div className="flex size-full items-center justify-center text-ink-4">
              <CategoryIcon category={item.category} className="size-10" />
            </div>
          )}
          {item.sponsored && (
            <span className="absolute left-2 top-2">
              <Badge variant="boosted" size="sm" icon={<ArrowUpRight className="size-3" aria-hidden />} />
            </span>
          )}
          {item.bundleId && !item.sponsored && (
            <span className="absolute left-2 top-2">
              <Badge variant="neutral" size="sm">{t('market.card.bundleBadge')}</Badge>
            </span>
          )}
          {item.photoCount > 1 && <span className="absolute bottom-2 right-2 rounded-sm bg-inverse/80 px-1.5 py-0.5 text-caption text-ink-inverse tnum">{item.photoCount}</span>}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3 pt-0">
          <div className="relative -mt-3.5">{stub}</div>
          <h3 className="truncate text-body font-semibold text-ink">{item.title}</h3>
          {meta}
          {showCampus && (
            <p className="truncate text-small text-ink-3">
              {[item.city, item.state].filter(Boolean).join(', ')} · {item.campus.shortName}
              {item.obo ? '' : ''}
            </p>
          )}
          {extra}
          <div className="mt-auto flex items-center gap-2 pt-1 text-small text-ink-2">
            <Avatar src={item.seller.avatarUrl} name={item.seller.name} size="xs" trustLevel={item.seller.trustLevel} />
            <span className="truncate">{item.seller.name}</span>
            <TrustBadge level={item.seller.trustLevel} size="inline" />
            {item.distanceToCampusM == null && item.status === 'active' && <Truck className="ml-auto size-3.5 shrink-0 text-ink-3" aria-label={t('market.card.delivery')} />}
          </div>
        </div>
      </Link>
      {heart}
    </Card>
  );
});

export default ItemCard;
