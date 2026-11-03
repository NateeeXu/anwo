// /listings/mine — owner dashboard: summary tiles, status tabs, table (desktop) / cards (mobile) with actions, leads + stats dialogs.
import { ChartColumn, MessageCircle, MoreHorizontal, Pencil, Plus, Rocket, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Listing } from '@shared/types';
import { Button, DropdownMenu, EmptyState, PageHeader, Pagination, StatTile, Table, Tabs, type MenuEntry } from '@/components';
import { NoListings } from '@/components/illustrations';
import { useAuth } from '@/lib/auth';
import { useLocale, useT } from '@/lib/i18n';
import { Head } from '@/app/Head';
import { RequireAuth } from '@/app/guards';
import { keys, listingsApi } from '../api';
import { useListingActions } from '../components/useListingActions';
import { LeadsModal, StatsModal } from '../components/OwnerDialogs';
import { StatusBadge } from '../components/StatusBadge';

const TABS = ['all', 'active', 'draft', 'paused', 'rented', 'expired'] as const;
type Tab = (typeof TABS)[number];

function MineInner() {
  const t = useT();
  const { formatDate, formatNumber } = useLocale();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(1);
  const [leadsFor, setLeadsFor] = useState<Listing | null>(null);
  const [statsFor, setStatsFor] = useState<Listing | null>(null);
  const params = { status: tab === 'all' ? undefined : tab, page, pageSize: 20 };
  const q = useQuery({ queryKey: keys.mine(params), queryFn: () => listingsApi.mine(params) });
  const actions = useListingActions();
  const data = q.data;
  const counts = data?.counts ?? {};
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);
  const quota = data?.quota;

  const menu = (l: Listing): MenuEntry[] => {
    const items: MenuEntry[] = [
      { key: 'view', label: t('listings.mine.action.view'), onSelect: () => navigate(`/listings/${l.id}`) },
      { key: 'edit', label: t('listings.mine.action.edit'), icon: <Pencil className="size-4" />, onSelect: () => navigate(`/listings/${l.id}/edit`) },
    ];
    if (l.status === 'draft') items.push({ key: 'publish', label: t('listings.mine.action.publish'), onSelect: () => actions.run('publish', l) });
    if (l.status === 'active') items.push({ key: 'pause', label: t('listings.mine.action.pause'), onSelect: () => actions.run('pause', l) });
    if (l.status === 'paused') items.push({ key: 'resume', label: t('listings.mine.action.resume'), onSelect: () => actions.run('resume', l) });
    if (l.status === 'active' || l.status === 'paused') items.push({ key: 'rented', label: t('listings.mine.action.rented'), onSelect: () => actions.askRented(l) });
    if (l.status === 'rented') items.push({ key: 'relist', label: t('listings.mine.action.relist'), onSelect: () => actions.run('publish', l) });
    if (l.status === 'expired' || l.status === 'active') items.push({ key: 'renew', label: t('listings.mine.action.renew'), onSelect: () => actions.run('renew', l) });
    items.push('separator');
    items.push({ key: 'leads', label: t('listings.mine.action.leads'), icon: <MessageCircle className="size-4" />, onSelect: () => setLeadsFor(l) });
    items.push({ key: 'stats', label: t('listings.mine.action.stats'), icon: <ChartColumn className="size-4" />, onSelect: () => setStatsFor(l) });
    if (l.status === 'active' && !l.activeBoost) items.push({ key: 'boost', label: t('listings.mine.action.boost'), icon: <Rocket className="size-4" />, onSelect: () => navigate(`/pricing?boost=listing:${l.id}`) });
    items.push('separator');
    items.push({ key: 'delete', label: t('listings.mine.action.delete'), icon: <Trash2 className="size-4" />, danger: true, onSelect: () => actions.askDelete(l) });
    return items;
  };

  const subtitle = quota ? (quota.limit === null || user?.isPro ? t('listings.mine.subtitlePro', { active: quota.active }) : t('listings.mine.subtitle', { active: quota.active, limit: quota.limit })) : undefined;

  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('listings.mine.title')} />
      <PageHeader title={t('listings.mine.title')} subtitle={subtitle} back actions={<Button asChild iconLeft={<Plus className="size-4" />}><Link to="/post/listing">{t('listings.mine.post')}</Link></Button>} />
      {quota && quota.limit !== null && quota.active >= quota.limit && <p className="mb-3 rounded-card bg-warning-soft px-3 py-2 text-small text-warning">{t('listings.mine.quotaFull', { limit: quota.limit })}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t('listings.mine.summary.active')} value={counts.active ?? 0} />
        <StatTile label={t('listings.mine.summary.views')} value={data?.summary.views ?? 0} />
        <StatTile label={t('listings.mine.summary.saves')} value={data?.summary.saves ?? 0} />
        <StatTile label={t('listings.mine.summary.leads')} value={data?.summary.leads ?? 0} />
      </div>
      <Tabs
        className="mt-5"
        variant="underline"
        scrollable
        value={tab}
        onChange={(k) => { setTab(k); setPage(1); }}
        items={TABS.map((k) => ({ key: k, label: k === 'all' ? t('listings.mine.tab.all') : t(`listings.status.${k}`), count: k === 'all' ? totalAll || undefined : counts[k] || undefined }))}
      />
      <Table<Listing>
        className="mt-4"
        rows={data?.items ?? []}
        rowKey="id"
        loading={q.isLoading}
        skeletonRows={4}
        onRowClick={(l) => navigate(`/listings/${l.id}`)}
        rowActions={(l) => <DropdownMenu align="end" label={t('ui.actions')} trigger={<Button variant="ghost" size="sm" iconOnly aria-label={t('ui.actions')}><MoreHorizontal className="size-4" /></Button>} items={menu(l)} />}
        empty={
          <EmptyState
            icon={<NoListings size={120} />}
            title={t('listings.mine.empty')}
            description={t('listings.mine.emptyHint')}
            action={{ label: t('listings.mine.post'), to: '/post/listing' }}
          />
        }
        columns={[
          {
            key: 'listing', header: t('listings.mine.col.listing'),
            render: (l) => (
              <div className="flex items-center gap-3">
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded-sm bg-sunken">{l.coverUrl && <img src={l.coverUrl} alt="" className="size-full object-cover dark:brightness-[.92]" />}</div>
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-ink">{l.title}</p>
                  <p className="truncate text-small text-ink-3">{l.addressDisplay} · {formatNumber(l.priceCents / 100, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}/mo{l.activeBoost ? ` · ${t('common.boosted')}` : ''}</p>
                </div>
              </div>
            ),
          },
          { key: 'status', header: t('listings.mine.col.status'), width: 110, render: (l) => <StatusBadge status={l.status} /> },
          { key: 'dates', header: t('listings.mine.col.dates'), width: 170, hideOnMobile: true, render: (l) => <span className="text-small text-ink-2">{formatDate(l.availableFrom, 'short')}{l.availableTo ? ` – ${formatDate(l.availableTo, 'short')}` : ''}</span> },
          { key: 'views', header: t('listings.mine.col.views'), width: 80, align: 'right', render: (l) => <span className="tabular-nums">{formatNumber(l.viewCount)}</span> },
          { key: 'saves', header: t('listings.mine.col.saves'), width: 80, align: 'right', hideOnMobile: true, render: (l) => <span className="tabular-nums">{formatNumber(l.saveCount)}</span> },
          { key: 'leads', header: t('listings.mine.col.leads'), width: 80, align: 'right', render: (l) => <button type="button" className="tabular-nums underline-offset-2 hover:underline" onClick={(e) => { e.stopPropagation(); setLeadsFor(l); }}>{formatNumber(l.leadCount ?? 0)}</button> },
        ]}
      />
      {data && data.total > 20 && <Pagination page={page} pageSize={20} total={data.total} onChange={setPage} className="mt-4" />}
      {actions.dialogs}
      <LeadsModal listing={leadsFor} open={!!leadsFor} onClose={() => setLeadsFor(null)} />
      <StatsModal listing={statsFor} open={!!statsFor} onClose={() => setStatsFor(null)} />
    </div>
  );
}

export default function Mine() {
  return (
    <RequireAuth>
      <MineInner />
    </RequireAuth>
  );
}
