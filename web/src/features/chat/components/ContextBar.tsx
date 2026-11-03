// Sticky context card under the thread header (DESIGN.md §4.9): row card linking to the listing / item / post.
import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import type { ContextCard } from '@shared/types';
import { Badge, Button, Price } from '@/components';
import { useLocale, useT } from '@/lib/i18n';
import { contextSubtitle } from '../utils';

export function ContextBar({ card, statusLabel }: { card: ContextCard; statusLabel: string | null }) {
  const t = useT();
  const { formatDate } = useLocale();
  const subtitle = contextSubtitle(card, t, formatDate);
  return (
    <div className="sticky top-0 z-layer-sticky border-b border-line bg-paper/95 px-3 py-2 backdrop-blur-none md:px-4">
      <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-2">
        {card.imageUrl ? (
          <img src={card.imageUrl} alt="" className="size-12 shrink-0 rounded-sm bg-sunken object-cover dark:brightness-[.92]" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-sm bg-sunken text-caption font-medium text-ink-3" aria-hidden>
            {t(`chat.context.${card.type}`)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-caption font-medium text-ink-3">{t(`chat.context.${card.type}`)}</span>
            {statusLabel && (
              <Badge variant="neutral" size="sm">
                {statusLabel}
              </Badge>
            )}
          </div>
          <p className="truncate text-small font-medium text-ink">{card.title}</p>
          <p className="truncate text-caption text-ink-2">
            {typeof card.priceCents === 'number' && card.priceCents > 0 && (
              <>
                <Price cents={card.priceCents} perMonth={card.type === 'listing'} size="inline" />
                {subtitle ? ' · ' : ''}
              </>
            )}
            {subtitle}
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" iconRight={<ArrowUpRight />} className="shrink-0">
          <Link to={card.link}>{t('chat.context.view')}</Link>
        </Button>
      </div>
    </div>
  );
}
