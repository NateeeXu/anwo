// WantedCard — DESIGN.md §7.5: the Listing Card inverted. Budget stub left, title, dates, group size, area chips,
// author row with trust badge, match count; right-side host CTA (我有房) rendered as a sibling of the link, never nested.
import { CalendarDays, Globe, MapPin, School, Sparkles, Users } from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Area, WantedCard as WantedCardDto } from '@shared/types';
import { Avatar, Badge, Button, Card, Chip, Price, TrustBadge } from '@/components';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { bedroomsLabel, groupLabel } from '../lib';

export function AreaChips({ areas, max = 3, size = 'sm', className }: { areas: Area[]; max?: number; size?: 'sm' | 'md'; className?: string }) {
  const t = useT();
  if (!areas.length) return null;
  const shown = areas.slice(0, max);
  const rest = areas.length - shown.length;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {shown.map((a) => (
        <Chip key={a.id} size={size} icon={a.kind === 'city' ? <Globe /> : a.kind === 'campus' ? <School /> : <MapPin />}>
          {a.label}
        </Chip>
      ))}
      {rest > 0 && <span className="text-caption text-ink-3">{t('wanted.areas.more', { n: rest })}</span>}
    </div>
  );
}

export interface WantedCardProps {
  wanted: WantedCardDto;
  /** show the campus / city line (nationwide lists) */
  nationwide?: boolean;
  /** right-side CTA (hosts): 「我有房」 — omitted for the author */
  action?: ReactNode;
  /** compact variant: no author row, used in rails and lists of matches for a listing */
  variant?: 'row' | 'compact';
  highlighted?: boolean;
  className?: string;
}

export const WantedCard = forwardRef<HTMLElement, WantedCardProps>(function WantedCard({ wanted, nationwide, action, variant = 'row', highlighted, className }, ref) {
  const t = useT();
  const { formatDate, formatRelative } = useLocale();
  const closed = wanted.status !== 'active';
  const compact = variant === 'compact';
  return (
    <Card
      as="article"
      ref={ref}
      interactive
      padding="none"
      variant={highlighted ? 'outline-accent' : 'default'}
      className={cn('flex min-w-0 gap-3 p-3 lg:gap-4 lg:p-4', closed && 'opacity-70', className)}
      data-status={wanted.status}
    >
      <Link to={`/wanted/${wanted.id}`} className="absolute inset-0 rounded-card" aria-label={wanted.title} />
      <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:gap-3 lg:gap-4">
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-start sm:gap-1">
          <Price cents={wanted.budgetMinCents} maxCents={wanted.budgetMaxCents} size="stub" className={cn(closed && 'bg-sunken text-ink-3')} />
          <span className="text-caption text-ink-3 sm:pl-0.5">{t('wanted.card.perMonth')}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="truncate text-body font-semibold text-ink">
            {closed && <span className="mr-1.5 text-ink-3">{t(`wanted.status.${wanted.status}`)} ·</span>}
            {wanted.title}
          </h3>
          <p className="flex flex-wrap items-center gap-x-1.5 text-small text-ink-2">
            <CalendarDays className="size-3.5 shrink-0 text-ink-3" aria-hidden />
            <span>
              {t('wanted.card.moveIn', { from: formatDate(wanted.moveInFrom, 'monthDay'), to: formatDate(wanted.moveInTo, 'monthDay') })}
              {wanted.moveOutDate ? ` · ${t('wanted.card.until', { date: formatDate(wanted.moveOutDate, 'monthDay') })}` : ` · ${t('wanted.card.openEnded')}`}
            </span>
            <span aria-hidden>·</span>
            <Users className="size-3.5 shrink-0 text-ink-3" aria-hidden />
            <span>{groupLabel(t, wanted.groupSize)}</span>
            {wanted.bedroomsMin > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{bedroomsLabel(t, wanted.bedroomsMin)}</span>
              </>
            )}
            {wanted.furnishedPref !== 'any' && (
              <>
                <span aria-hidden>·</span>
                <span>{t(`wanted.furnished.${wanted.furnishedPref}`)}</span>
              </>
            )}
          </p>
          {wanted.areas.length > 0 ? (
            <AreaChips areas={wanted.areas} />
          ) : (
            <p className="text-small text-ink-3">{wanted.scope === 'nationwide' ? t('wanted.scope.nationwide') : t('wanted.areas.campusDefault', { campus: wanted.campus.shortName })}</p>
          )}
          {nationwide && (
            <p className="text-small text-ink-3">
              {wanted.campus.city}, {wanted.campus.state} · {wanted.campus.shortName}
              {wanted.scope === 'nationwide' && ` · ${t('wanted.scope.nationwide')}`}
            </p>
          )}
          {!compact && (
            <div className="mt-1 flex items-center gap-2 text-small text-ink-2">
              <Avatar src={wanted.author.avatarUrl} name={wanted.author.name} size="xs" trustLevel={wanted.author.trustLevel} className="shrink-0" />
              <span className="min-w-0 truncate">{wanted.author.name}</span>
              <TrustBadge level={wanted.author.trustLevel} size="inline" className="shrink-0" />
              <span className="shrink-0 text-ink-3" aria-hidden>·</span>
              <span className="shrink-0 whitespace-nowrap text-ink-3">{formatRelative(wanted.createdAt)}</span>
              {wanted.matchCount > 0 && (
                <Badge variant="accent" size="sm" icon={<Sparkles />} className="ml-auto shrink-0">
                  {t('wanted.matches', { n: wanted.matchCount })}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
      {action && <div className="relative z-[1] hidden shrink-0 self-center sm:block">{action}</div>}
    </Card>
  );
});

/** The host CTA used by browse / detail rails. */
export function OfferButton({ onClick, size = 'sm', offered, className }: { onClick: () => void; size?: 'sm' | 'md' | 'lg'; offered?: boolean; className?: string }) {
  const t = useT();
  return (
    <Button variant={offered ? 'ghost' : 'secondary'} size={size} onClick={onClick} className={className}>
      {offered ? t('wanted.offer.offered') : t('wanted.offer.cta')}
    </Button>
  );
}

export default WantedCard;
