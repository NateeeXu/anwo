// DESIGN.md §4.2 "Move-out bundle" variant: 2×2 photo mosaic, stub 「打包 · 5 件」, badge linking to the sublet.
import { Home, PackageOpen } from 'lucide-react';
import { Link } from 'react-router';
import type { Bundle } from '@shared/types';
import { Avatar, Badge, Card, TrustBadge } from '@/components';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';

export function BundleMosaic({ bundle, className }: { bundle: Bundle; className?: string }) {
  const covers = (bundle.items ?? []).map((i) => i.coverUrl).filter((u): u is string => !!u).slice(0, 4);
  return (
    <div className={cn('grid aspect-square w-full grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden bg-sunken', className)} aria-hidden>
      {covers.length === 0 && (
        <div className="col-span-2 row-span-2 flex items-center justify-center text-ink-4">
          <PackageOpen className="size-10" strokeWidth={1.5} />
        </div>
      )}
      {covers.map((src, i) => (
        <img key={i} src={src} alt="" loading="lazy" className={cn('size-full object-cover dark:brightness-[.92]', covers.length === 1 && 'col-span-2 row-span-2', covers.length === 2 && 'row-span-2', covers.length === 3 && i === 0 && 'row-span-2')} />
      ))}
    </div>
  );
}

export function BundleCard({ bundle, className }: { bundle: Bundle; className?: string }) {
  const t = useT();
  const { formatMoney, formatDate } = useLocale();
  const closed = bundle.status !== 'active';
  return (
    <Card as="article" interactive padding="none" className={cn('flex flex-col overflow-hidden', className)}>
      <Link to={`/market/bundles/${bundle.id}`} className="flex flex-1 flex-col rounded-card focus-visible:outline-none" aria-label={bundle.title}>
        <div className={cn(closed && 'opacity-70 grayscale')}>
          <BundleMosaic bundle={bundle} />
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3 pt-0">
          <div className="relative -mt-3.5 flex items-center gap-2">
            <span className={cn('inline-flex h-8 items-center rounded-sm px-2.5 text-price tnum', closed ? 'bg-sunken text-ink-3' : 'bg-inverse text-ink-inverse')}>
              {closed ? t('market.bundle.closed') : t('market.card.bundle', { n: bundle.itemCount })}
            </span>
            {bundle.discountPct > 0 && !closed && <Badge variant="accent" size="sm">-{bundle.discountPct}%</Badge>}
          </div>
          <h3 className="line-clamp-2 text-body font-semibold text-ink">{bundle.title}</h3>
          <p className="text-small text-ink-2 tnum">
            {bundle.bundleCents > 0 && bundle.bundleCents < bundle.totalCents ? (
              <>
                <span className="text-ink line-through decoration-ink-3">{formatMoney(bundle.totalCents)}</span> <span className="font-semibold text-ink">{formatMoney(bundle.bundleCents)}</span>
              </>
            ) : (
              formatMoney(bundle.totalCents)
            )}
            {bundle.moveOutDate && ` · ${t('market.bundle.moveOut', { date: formatDate(bundle.moveOutDate, 'monthDay') })}`}
          </p>
          {bundle.listing && (
            <span className="flex items-center gap-1 text-small text-ink-3">
              <Home className="size-3.5" aria-hidden />
              <span className="truncate">{bundle.listing.title}</span>
            </span>
          )}
          {bundle.seller && (
            <div className="mt-auto flex items-center gap-2 pt-1 text-small text-ink-2">
              <Avatar src={bundle.seller.avatarUrl} name={bundle.seller.name} size="xs" trustLevel={bundle.seller.trustLevel} />
              <span className="truncate">{bundle.seller.name}</span>
              <TrustBadge level={bundle.seller.trustLevel} size="inline" />
            </div>
          )}
        </div>
      </Link>
    </Card>
  );
}

export default BundleCard;
