// Trust Strip (DESIGN.md §4.6) — full-width sunken band under a gallery/hero on detail pages.
//   <TrustStrip user={listing.owner} role="host" onReport={() => setReport(true)} />
// `user` is the UserPublic a detail endpoint returns (responseRate / responseMedianMin are only present there).
import { Flag, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import type { UserPublic } from '@shared/types';
import { Avatar, Badge, Button, TrustBadge } from '@/components';
import { useLocale, useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { roughDuration } from './labels';

export interface TrustStripProps {
  user: UserPublic;
  /** which word to use for the person (host / seller / organizer) */
  role?: 'host' | 'seller' | 'organizer';
  onReport?: () => void;
  className?: string;
}

export function TrustStrip({ user, role = 'host', onReport, className }: TrustStripProps) {
  const t = useT();
  const { formatDate, locale } = useLocale();
  const unverified = user.trustLevel < 2;
  const facts = [
    t('verify.strip.joined', { date: formatDate(user.memberSince, 'month', { year: true }) }),
    user.responseRate != null ? t('verify.strip.responseRate', { rate: `${Math.round(user.responseRate * 100)}%` }) : null,
    user.responseMedianMin != null ? t('verify.strip.replies', { min: roughDuration(user.responseMedianMin, locale) }) : null,
  ].filter(Boolean) as string[];

  return (
    <div className={cn('flex flex-col rounded-card bg-sunken', unverified && 'border-b-2 border-warning-soft', className)} data-trust={user.trustLevel}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 md:min-h-14 md:flex-nowrap">
        <Avatar src={user.avatarUrl} name={user.name} size="md" trustLevel={user.trustLevel} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-caption text-ink-3">{t(`verify.strip.${role}`)}</span>
            <span className="truncate text-body font-semibold text-ink">{user.name}</span>
            <TrustBadge level={user.trustLevel} accountRole={user.role} size="card" />
            {user.isPro && <Badge variant="pro" size="sm" />}
          </p>
          <p className="text-small text-ink-2">{facts.join(' · ')}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" asChild><Link to={`/u/${user.id}`}>{t('verify.strip.viewProfile')}</Link></Button>
          {onReport && <Button variant="ghost" size="sm" iconLeft={<Flag />} onClick={onReport}>{t('common.report')}</Button>}
        </div>
      </div>
      {unverified && (
        <p className="flex items-center gap-2 px-4 pb-2.5 text-small text-ink">
          <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
          {t('verify.strip.warning')}
        </p>
      )}
    </div>
  );
}
