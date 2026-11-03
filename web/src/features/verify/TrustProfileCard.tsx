// Public 「信任档案」 section (DESIGN.md §7.8) — the core Profile page can adopt this later.
//   <TrustProfileCard userId={id} />            fetches GET /api/verify/profile/:userId
//   <TrustProfileCard profile={data} />         when the parent already has the payload
import { CircleCheck, CircleDashed, MessageCircle, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar, Badge, Button, Card, Skeleton, TrustBadge } from '@/components';
import { useAuth } from '@/lib/auth';
import { useLocale, useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { loginPath } from '@/app/guards';
import type { TrustProfile } from './api';
import { useTrustProfile } from './api';
import { roughDuration, typeLabel } from './labels';

export interface TrustProfileCardProps {
  userId?: string;
  profile?: TrustProfile;
  /** hide the header (avatar + name) when the parent page already renders one */
  compact?: boolean;
  className?: string;
}

export function TrustProfileCard({ userId, profile: given, compact, className }: TrustProfileCardProps) {
  const t = useT();
  const { formatDate, formatNumber, locale } = useLocale();
  const { user: me, status } = useAuth();
  const q = useTrustProfile(given ? undefined : userId);
  const profile = given ?? q.data;

  if (!profile) {
    if (q.isError) return <Card padding="md" className={className}><p className="text-small text-ink-2">{t('verify.profile.notFound')}</p></Card>;
    return (
      <Card padding="md" className={cn('flex flex-col gap-3', className)} aria-busy>
        <Skeleton variant="text" width={160} height={22} />
        <Skeleton variant="row" />
        <Skeleton variant="row" />
      </Card>
    );
  }
  const { user, trust, stats } = profile;
  const isMe = me?.id === user.id;
  const rows = [
    { key: 'edu', ok: trust.eduVerified, at: trust.verifiedAt.edu, detail: trust.eduDomain ? t('verify.profile.eduDomain', { domain: trust.eduDomain }) : null },
    { key: 'id', ok: trust.idVerified, at: trust.verifiedAt.id, detail: trust.idType ? typeLabel(t, trust.idType) : null },
    { key: 'phone', ok: trust.phoneVerified, at: trust.verifiedAt.phone, detail: null },
    { key: 'payment', ok: trust.paymentOnFile, at: trust.verifiedAt.payment, detail: null },
  ];
  const statTiles = [
    { key: 'responseRate', value: stats.responseRate != null ? `${Math.round(stats.responseRate * 100)}%` : '—' },
    { key: 'listings', value: formatNumber(stats.listings) },
    { key: 'itemsSold', value: formatNumber(stats.itemsSold) },
    { key: 'buddyHosted', value: formatNumber(stats.buddyHosted) },
  ];

  return (
    <Card padding="md" className={cn('flex flex-col gap-4', className)}>
      {!compact && (
        <header className="flex items-start gap-3">
          <Avatar src={user.avatarUrl} name={user.name} size="lg" trustLevel={trust.level} />
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 text-h3 text-ink">
              <span className="truncate">{user.name}</span>
              {user.isPro && <Badge variant="pro" />}
              {profile.suspended && <Badge variant="danger" size="sm">{t('verify.profile.suspended')}</Badge>}
            </h2>
            <TrustBadge level={trust.level} size="card" />
            <p className="mt-0.5 text-small text-ink-2">
              {user.campus?.shortName ? `${user.campus.shortName} · ` : ''}{t('verify.profile.memberSince', { date: formatDate(trust.memberSince, 'month', { year: true }) })}
            </p>
          </div>
          {!isMe && (
            <Button variant="primary" size="sm" iconLeft={<MessageCircle />} asChild>
              <Link to={status === 'authed' ? `/chat/new?userId=${user.id}` : loginPath(`/u/${user.id}`)}>{t('verify.profile.message')}</Link>
            </Button>
          )}
        </header>
      )}
      {isMe && <p className="text-caption text-ink-3">{t('verify.profile.mine')}</p>}

      <div className="flex items-center justify-between gap-3 rounded-card bg-sunken px-3 py-2">
        <span className="text-small text-ink-2">{t('verify.profile.level')}</span>
        <TrustBadge level={trust.level} size="profile" showLabel noTooltip />
      </div>

      <section aria-label={t('verify.profile.log')}>
        <h3 className="text-caption text-ink-3">{t('verify.profile.log')}</h3>
        <ul className="mt-1 divide-y divide-line">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-2.5 py-2 text-small">
              {r.ok ? <CircleCheck className="size-4 shrink-0 text-success" aria-hidden /> : <CircleDashed className="size-4 shrink-0 text-ink-4" aria-hidden />}
              <span className={cn('flex-1', r.ok ? 'text-ink' : 'text-ink-3')}>
                {t(`verify.profile.${r.key}`)}
                {r.detail && <span className="text-ink-3"> · {r.detail}</span>}
              </span>
              <span className="text-caption text-ink-3 tnum">{r.ok && r.at ? formatDate(r.at, 'month', { year: true }) : t('verify.profile.notYet')}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {statTiles.map((s) => (
          <div key={s.key} className="rounded-card border border-line px-3 py-2">
            <p className="text-caption text-ink-3">{t(`verify.profile.stats.${s.key}`)}</p>
            <p className="text-price text-ink tnum">{s.value}</p>
          </div>
        ))}
      </div>
      {stats.responseMedianMin != null && <p className="text-caption text-ink-3">{t('verify.profile.responseMedian', { min: roughDuration(stats.responseMedianMin, locale) })}</p>}

      {trust.level < 2 && !isMe && (
        <p className="flex items-start gap-2 rounded-card border border-warning-soft bg-warning-soft/40 p-3 text-small text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          {t('verify.profile.warning')}
        </p>
      )}
      {!compact && (
        <div>
          <Button variant="ghost" size="sm" asChild><Link to={`/u/${user.id}`}>{t('verify.profile.fullProfile')}</Link></Button>
        </div>
      )}
    </Card>
  );
}
