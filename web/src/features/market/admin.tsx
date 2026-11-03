// Admin panel for "market" — mounted by the admin module under /admin/market. Moderation of items (ok / flagged / hidden).
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Link } from 'react-router';
import { Badge, Button, DropdownMenu, EmptyState, Input, Pagination, Select, StatTile, Table, type Column } from '@/components';
import { errorMessage } from '@/app/errors';
import { useDebounce } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { useAdminItems, useModerateItem, type AdminItem } from './api';

const MOD_VARIANT = { ok: 'success', flagged: 'warning', hidden: 'danger' } as const;

export default function MarketAdmin() {
  const t = useT();
  const { formatPrice, formatRelative } = useLocale();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [moderation, setModeration] = useState('all');
  const [page, setPage] = useState(1);
  const dq = useDebounce(q, 300);
  const list = useAdminItems({ q: dq || undefined, status, moderation, page, pageSize: 20 });
  const moderate = useModerateItem();
  const act = (id: string, moderationStatus: 'ok' | 'flagged' | 'hidden') => moderate.mutate({ id, moderationStatus }, { onSuccess: () => toast.success(t('market.admin.done')), onError: (e) => toast.error(errorMessage(t, e)) });
  const s = list.data?.stats;

  const columns: Column<AdminItem>[] = [
    { key: 'item', header: t('market.admin.col.item'), render: (r) => (
      <Link to={`/market/${r.id}`} className="flex items-center gap-2 text-ink hover:underline">
        <span className="size-8 shrink-0 overflow-hidden rounded-sm bg-sunken">{r.coverUrl && <img src={r.coverUrl} alt="" className="size-full object-cover" />}</span>
        <span className="truncate">{r.title}</span>
      </Link>
    ) },
    { key: 'seller', header: t('market.admin.col.seller'), render: (r) => <Link to={`/u/${r.seller.id}`} className="hover:underline">{r.seller.name}</Link>, hideOnMobile: true },
    { key: 'campus', header: t('market.admin.col.campus'), render: (r) => r.campus.shortName, hideOnMobile: true },
    { key: 'price', header: t('market.admin.col.price'), align: 'right', render: (r) => <span className="tnum">{formatPrice(r)}</span> },
    { key: 'status', header: t('market.admin.col.status'), render: (r) => <Badge variant="neutral" size="sm">{r.status}</Badge> },
    { key: 'moderation', header: t('market.admin.col.moderation'), render: (r) => <Badge variant={MOD_VARIANT[r.moderationStatus]} size="sm">{t(`market.admin.mod.${r.moderationStatus}`)}</Badge> },
    { key: 'reports', header: t('market.admin.col.reports'), align: 'right', render: (r) => (r.openReports ? <span className="font-semibold text-danger tnum">{r.openReports}</span> : <span className="text-ink-3">0</span>) },
    { key: 'updated', header: t('market.admin.col.updated'), render: (r) => <span className="text-ink-3">{formatRelative(r.createdAt)}</span>, hideOnMobile: true },
  ];

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-h2 text-ink">{t('market.admin.title')}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatTile label={t('market.admin.stat.active')} value={s?.active ?? 0} />
        <StatTile label={t('market.admin.stat.sold30d')} value={s?.sold30d ?? 0} />
        <StatTile label={t('market.admin.stat.bundles')} value={s?.bundles ?? 0} />
        <StatTile label={t('market.admin.stat.flagged')} value={s?.flagged ?? 0} />
        <StatTile label={t('market.admin.stat.hidden')} value={s?.hidden ?? 0} />
        <StatTile label={t('market.admin.stat.reports')} value={s?.openReports ?? 0} invertDelta />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t('market.admin.search')} iconLeft={<Search className="size-4" aria-hidden />} clearable className="min-w-[240px] flex-1" aria-label={t('market.admin.search')} />
        <Select size="sm" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={['all', 'active', 'reserved', 'sold', 'draft', 'expired', 'removed'].map((v) => ({ value: v, label: v === 'all' ? t('market.admin.filter.all') : v }))} label={t('market.admin.col.status')} />
        <Select size="sm" value={moderation} onChange={(v) => { setModeration(v); setPage(1); }} options={['all', 'ok', 'flagged', 'hidden'].map((v) => ({ value: v, label: v === 'all' ? t('market.admin.filter.all') : t(`market.admin.mod.${v}`) }))} label={t('market.admin.col.moderation')} />
      </div>
      <Table<AdminItem>
        columns={columns}
        rows={list.data?.items ?? []}
        rowKey="id"
        loading={list.isPending}
        empty={<EmptyState size="sm" title={t('market.admin.empty')} />}
        stickyHeader
        rowActions={(r) => (
          <DropdownMenu
            label={t('ui.actions')}
            align="end"
            trigger={<Button size="sm" variant="ghost">{t('ui.actions')}</Button>}
            items={[
              { label: t('market.admin.action.flag'), onSelect: () => act(r.id, 'flagged'), disabled: r.moderationStatus === 'flagged' },
              { label: t('market.admin.action.hide'), danger: true, onSelect: () => act(r.id, 'hidden'), disabled: r.moderationStatus === 'hidden' },
              { label: t('market.admin.action.restore'), onSelect: () => act(r.id, 'ok'), disabled: r.moderationStatus === 'ok' },
            ]}
          />
        )}
      />
      {list.data && <Pagination page={page} pageSize={20} total={list.data.total} onChange={setPage} />}
    </div>
  );
}
