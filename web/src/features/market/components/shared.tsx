// Small building blocks shared by the market pages: category icons, condition chips, the seller trust strip,
// the price-suggestion line and a few status helpers. Everything uses semantic tokens only.
import type { ComponentType } from 'react';
import { Bike, Book, Box, CookingPot, Gift, House, Laptop, PackageOpen, Shirt, Sofa, Ticket, TriangleAlert, type LucideProps } from 'lucide-react';
import { Link } from 'react-router';
import type { ItemCondition, MarketCategory } from '@shared/enums';
import type { PriceSuggestion, UserPublic } from '@shared/types';
import { Avatar, Button, Chip, TrustBadge } from '@/components';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';

export const CATEGORY_ICON: Record<MarketCategory, ComponentType<LucideProps>> = {
  furniture: Sofa, electronics: Laptop, textbooks: Book, kitchen: CookingPot, bikes: Bike, clothing: Shirt, home: House, tickets: Ticket, move_out: PackageOpen, free: Gift, other: Box,
};
export const CONDITIONS: ItemCondition[] = ['new', 'like_new', 'good', 'fair', 'poor'];

export function CategoryIcon({ category, className }: { category: MarketCategory; className?: string }) {
  const Icon = CATEGORY_ICON[category] ?? Box;
  return <Icon className={cn('size-4', className)} strokeWidth={1.75} aria-hidden />;
}

export function ConditionChip({ condition, size = 'sm' }: { condition: ItemCondition; size?: 'sm' | 'md' }) {
  const t = useT();
  return (
    <Chip size={size} variant={condition === 'new' || condition === 'like_new' ? 'accent' : 'default'} title={t(`market.cond.hint.${condition}`)}>
      {t(`market.cond.${condition}`)}
    </Chip>
  );
}

/** Price vs. suggested comparison line (DESIGN §7.11 「相似物品均价 $45」). */
export function PriceComparison({ priceCents, isFree, suggestion, className }: { priceCents: number; isFree: boolean; suggestion: PriceSuggestion | undefined; className?: string }) {
  const t = useT();
  const { formatMoney } = useLocale();
  if (!suggestion || suggestion.sampleSize === 0 || isFree) return null;
  const diff = suggestion.suggestedCents > 0 ? Math.round(((priceCents - suggestion.suggestedCents) / suggestion.suggestedCents) * 100) : 0;
  const verdict = Math.abs(diff) < 8 ? t('market.detail.fairPrice') : diff < 0 ? t('market.detail.cheaper', { pct: Math.abs(diff) }) : t('market.detail.pricier', { pct: diff });
  return (
    <div className={cn('text-small text-ink-3', className)}>
      <p>
        <span className="text-ink-2">{t('market.detail.suggested', { price: formatMoney(suggestion.suggestedCents) })}</span>
        <span className={cn('ml-2', Math.abs(diff) >= 8 && diff < 0 ? 'text-success' : 'text-ink-3')}>{verdict}</span>
      </p>
      <p className="text-caption">
        {t('market.detail.suggestedRange', { low: formatMoney(suggestion.lowCents), high: formatMoney(suggestion.highCents), n: suggestion.sampleSize, basis: t(`market.detail.basis.${suggestion.basis}`) })}
      </p>
    </div>
  );
}

/** DESIGN §4.6 Trust Strip for the item seller. */
export function SellerStrip({ seller, onReport, className }: { seller: UserPublic; onReport?: () => void; className?: string }) {
  const t = useT();
  const { formatDate } = useLocale();
  const unverified = seller.trustLevel <= 1;
  const facts: string[] = [];
  if (seller.memberSince) facts.push(t('market.detail.memberSince', { when: formatDate(seller.memberSince, 'month') }));
  if (seller.responseRate != null) facts.push(t('market.detail.responseRate', { pct: Math.round(seller.responseRate * 100) }));
  if (seller.campus?.shortName) facts.push(seller.campus.shortName);
  return (
    <section aria-label={t('market.detail.seller')} className={cn('rounded-card bg-sunken', unverified && 'border-b-2 border-warning-soft', className)}>
      <div className="flex flex-wrap items-center gap-3 p-3 md:min-h-14 md:px-4">
        <Avatar src={seller.avatarUrl} name={seller.name} size="md" trustLevel={seller.trustLevel} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-body font-semibold text-ink">{seller.name}</span>
            <TrustBadge level={seller.trustLevel} size="card" />
          </div>
          {facts.length > 0 && <p className="truncate text-small text-ink-2">{facts.join(' · ')}</p>}
        </div>
        <div className="flex items-center gap-1">
          <Button asChild variant="secondary" size="sm">
            <Link to={`/u/${seller.id}`}>{t('market.detail.viewProfile')}</Link>
          </Button>
          {onReport && (
            <Button variant="ghost" size="sm" onClick={onReport}>
              {t('market.detail.report')}
            </Button>
          )}
        </div>
      </div>
      {unverified && (
        <p className="flex items-center gap-2 px-3 pb-3 text-small text-ink-2 md:px-4">
          <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
          {t('market.detail.unverifiedWarning')}
        </p>
      )}
    </section>
  );
}

export function statusLabelKey(status: string): string | null {
  switch (status) {
    case 'sold': return 'market.card.sold';
    case 'reserved': return 'market.card.reserved';
    case 'expired': return 'market.card.expired';
    case 'draft': return 'market.card.draft';
    default: return null;
  }
}
