// DESIGN.md §4.6 Trust Strip — sunken band under the gallery: host avatar + badge + facts; warning rim for L0–1 hosts.
import { Flag } from 'lucide-react';
import { Link } from 'react-router';
import type { UserPublic } from '@shared/types';
import { Avatar, Badge, Button, TrustBadge } from '@/components';
import { useLocale, useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';

export function TrustStrip({ user, onReport, className }: { user: UserPublic; onReport?: () => void; className?: string }) {
  const t = useT();
  const { formatDate, formatPercent } = useLocale();
  const low = user.trustLevel <= 1;
  const facts: string[] = [t('listings.detail.trust.joined', { date: formatDate(user.memberSince, 'month', { year: true }) })];
  if (user.responseRate != null) facts.push(t('listings.detail.trust.responseRate', { rate: formatPercent(user.responseRate) }));
  if (user.responseMedianMin != null) {
    const m = user.responseMedianMin;
    facts.push(t('listings.detail.trust.responseTime', { time: m < 60 ? t('listings.detail.trust.responseTimeMin', { n: Math.max(1, m) }) : t('listings.detail.trust.responseTimeHour', { n: Math.round(m / 60) }) }));
  }
  return (
    <div className={cn('rounded-card bg-sunken', low && 'border-b-2 border-warning-fill', className)}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Avatar src={user.avatarUrl} name={user.name} size="md" trustLevel={user.trustLevel} status={user.lastSeenAt === 'online' ? 'online' : undefined} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/u/${user.id}`} className="truncate text-body font-semibold text-ink hover:underline">{user.name}</Link>
            <TrustBadge level={user.trustLevel} accountRole={user.role} size="card" />
            {user.isPro && <Badge variant="pro" size="sm" />}
            <span className="text-caption text-ink-3">{user.role === 'landlord' ? t('listings.detail.trust.landlord') : t('listings.detail.trust.host')}</span>
          </div>
          <p className="truncate text-small text-ink-2">{facts.join(' · ')}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button asChild variant="secondary" size="sm"><Link to={`/u/${user.id}`}>{t('listings.detail.trust.viewProfile')}</Link></Button>
          {onReport && <Button variant="ghost" size="sm" iconLeft={<Flag className="size-4" />} onClick={onReport}>{t('common.report')}</Button>}
        </div>
      </div>
      {low && <p className="px-4 pb-2 text-small text-warning">{t('listings.detail.trust.warning')}</p>}
    </div>
  );
}
