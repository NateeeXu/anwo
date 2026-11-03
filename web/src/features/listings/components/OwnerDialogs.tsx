// Owner dialogs: stats (views series, saves, leads, contact rate, boost, rank) and the lead inbox (Pro unlocks all).
import { Lock, MessageCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { LeadStatus } from '@shared/enums';
import type { Listing } from '@shared/types';
import { Avatar, Button, EmptyState, Modal, SegmentedControl, Select, Skeleton, StatTile, TrustBadge } from '@/components';
import { useLocale, useT } from '@/lib/i18n';
import { keys, listingsApi } from '../api';

export function StatsModal({ listing, open, onClose }: { listing: Listing | null; open: boolean; onClose: () => void }) {
  const t = useT();
  const { formatDate, formatNumber, formatPercent } = useLocale();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const id = listing?.id ?? '';
  const q = useQuery({ queryKey: keys.ownerStats(id, Number(days)), queryFn: () => listingsApi.ownerStats(id, Number(days)), enabled: open && !!id });
  const s = q.data;
  const max = Math.max(1, ...(s?.views.map((v) => v.count) ?? [1]));
  return (
    <Modal open={open} onClose={onClose} title={t('listings.mine.stats.title')} description={listing?.title} size="md">
      <div className="flex flex-col gap-4">
        <SegmentedControl size="sm" label={t('listings.mine.stats.days', { n: days })} value={days} onChange={setDays} options={(['7', '30', '90'] as const).map((d) => ({ value: d, label: t('listings.mine.stats.days', { n: d }) }))} />
        {!s ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Skeleton variant="rect" height={72} /><Skeleton variant="rect" height={72} /><Skeleton variant="rect" height={72} /><Skeleton variant="rect" height={72} /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label={t('listings.mine.stats.viewsPeriod', { days })} value={s.viewsInPeriod} hint={`${t('listings.mine.stats.views')} ${formatNumber(s.viewsTotal)}`} />
              <StatTile label={t('listings.mine.stats.saves')} value={s.saves} />
              <StatTile label={t('listings.mine.stats.leads')} value={s.leads} />
              <StatTile label={t('listings.mine.stats.contactRate')} value={s.contactRate} format="percent" />
            </div>
            <div className="flex flex-col gap-2 rounded-card border border-line p-3">
              <div className="flex items-center justify-between text-small text-ink-2">
                <span>{t('listings.mine.stats.chartLabel')}</span>
                <span>{t('listings.mine.stats.rank')}: <strong className="text-ink">{t(`listings.mine.stats.rank.${s.rankHint}`)}</strong></span>
              </div>
              {s.locked ? (
                <EmptyState size="sm" icon={Lock} title={t('listings.mine.stats.locked')} action={{ label: t('listings.mine.leads.upgrade'), to: '/pro', variant: 'secondary' }} />
              ) : (
                <div className="flex h-28 items-end gap-px" role="img" aria-label={t('listings.mine.stats.chartLabel')}>
                  {s.views.map((v) => (
                    <span key={v.date} title={`${formatDate(v.date, 'short')} · ${v.count}`} className="flex-1 rounded-t-xs bg-accent-soft" style={{ height: `${Math.max(2, (v.count / max) * 100)}%`, backgroundColor: v.count ? undefined : 'var(--sunken)' }} />
                  ))}
                </div>
              )}
              <p className="text-caption text-ink-3">{t('listings.mine.stats.boost')}: {formatNumber(s.boostImpressions)} / {formatNumber(s.boostClicks)} · {t('listings.mine.stats.contactRate')} {formatPercent(s.contactRate)}</p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function LeadsModal({ listing, open, onClose }: { listing: Listing | null; open: boolean; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const { formatRelative } = useLocale();
  const id = listing?.id ?? '';
  const q = useQuery({ queryKey: keys.leads(id), queryFn: () => listingsApi.leads(id, { pageSize: 50 }), enabled: open && !!id });
  const m = useMutation({
    mutationFn: ({ leadId, status }: { leadId: string; status: string }) => listingsApi.setLeadStatus(id, leadId, status),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.leads(id) }),
  });
  const items = q.data?.items ?? [];
  return (
    <Modal open={open} onClose={onClose} title={t('listings.mine.leads.title')} description={listing?.title} size="md">
      {q.isLoading ? (
        <div className="flex flex-col gap-2"><Skeleton variant="row" /><Skeleton variant="row" /><Skeleton variant="row" /></div>
      ) : items.length === 0 ? (
        <EmptyState size="sm" icon={MessageCircle} title={t('listings.mine.leads.empty')} />
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {items.map((lead) => (
            <li key={lead.id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar src={lead.user?.avatarUrl} name={lead.user?.name} size="sm" trustLevel={lead.user?.trustLevel} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 truncate text-body font-medium text-ink">
                  {lead.user ? <Link to={`/u/${lead.user.id}`} className="truncate hover:underline">{lead.user.name}</Link> : '—'}
                  {lead.user && <TrustBadge level={lead.user.trustLevel} size="inline" />}
                </span>
                <span className="text-small text-ink-3">{t(`listings.mine.leads.source.${lead.source}`)} · {formatRelative(lead.createdAt)}</span>
              </div>
              <Select size="sm" className="w-32" value={lead.status} onChange={(v) => m.mutate({ leadId: lead.id, status: v })} options={LeadStatus.map((s) => ({ value: s, label: t(`listings.mine.leads.status.${s}`) }))} />
              {lead.conversationId && <Button asChild variant="ghost" size="sm"><Link to={`/chat/${lead.conversationId}`}>{t('listings.mine.leads.open')}</Link></Button>}
            </li>
          ))}
        </ul>
      )}
      {q.data?.locked && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-card bg-sunken px-3 py-2 text-small text-ink-2">
          <span className="flex items-center gap-2"><Lock className="size-4" aria-hidden />{t('listings.mine.leads.locked')} · {t('listings.mine.leads.lockedHint')}</span>
          <Button asChild variant="secondary" size="sm"><Link to="/pro">{t('listings.mine.leads.upgrade')}</Link></Button>
        </div>
      )}
    </Modal>
  );
}
