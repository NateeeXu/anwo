// Admin panel for "wanted" — rendered inside the admin shell at /admin/wanted: moderation list (hide / flag / restore).
import { Eye, EyeOff, Flag, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated } from '@shared/types';
import { Badge, Button, EmptyState, Input, Pagination, Select, Table, type Column } from '@/components';
import { api } from '@/lib/api';
import { useDebounce } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { errorMessage } from '@/app/errors';
import { wantedKeys, type WantedAdminRow } from './api';

const PAGE_SIZE = 20;

export default function WantedAdminPanel() {
  const t = useT();
  const { formatMoneyRange, formatRelative } = useLocale();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [moderation, setModeration] = useState('all');
  const [page, setPage] = useState(1);
  const dq = useDebounce(q, 300);
  const params = { q: dq || undefined, status: status === 'all' ? undefined : status, moderation: moderation === 'all' ? undefined : moderation, page, pageSize: PAGE_SIZE };
  const list = useQuery({ queryKey: wantedKeys.admin(params), queryFn: () => api<Paginated<WantedAdminRow>>('/api/wanted/admin/list', { query: params }), placeholderData: keepPreviousData });
  const moderate = useMutation({
    mutationFn: ({ id, moderationStatus }: { id: string; moderationStatus: 'ok' | 'flagged' | 'hidden' }) => api(`/api/wanted/admin/${id}/moderate`, { method: 'POST', body: { moderationStatus } }),
    onSuccess: () => { toast.success(t('wanted.admin.updated')); qc.invalidateQueries({ queryKey: wantedKeys.all }); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  const columns: Column<WantedAdminRow>[] = [
    { key: 'title', header: t('wanted.admin.col.post'), render: (r) => (
      <div className="min-w-0">
        <Link to={`/wanted/${r.id}`} className="block truncate font-semibold text-ink hover:underline">{r.title}</Link>
        <span className="text-caption text-ink-3">{r.campus.shortName} · {formatMoneyRange(r.budgetMinCents, r.budgetMaxCents)} · {r.author.name}</span>
      </div>
    ) },
    { key: 'status', header: t('wanted.admin.col.status'), width: 120, render: (r) => <Badge variant={r.status === 'active' ? 'success' : 'neutral'} size="sm">{t(`wanted.status.${r.status}`)}</Badge> },
    { key: 'moderation', header: t('wanted.admin.col.moderation'), width: 120, render: (r) => <Badge variant={r.moderationStatus === 'ok' ? 'neutral' : r.moderationStatus === 'flagged' ? 'warning' : 'danger'} size="sm">{t(`wanted.admin.moderation.${r.moderationStatus}`)}</Badge> },
    { key: 'reports', header: t('wanted.admin.col.reports'), width: 90, align: 'right', hideOnMobile: true, render: (r) => <span className="tabular-nums">{r.reportCount}</span> },
    { key: 'matches', header: t('wanted.admin.col.matches'), width: 90, align: 'right', hideOnMobile: true, render: (r) => <span className="tabular-nums">{r.matchCount}</span> },
    { key: 'created', header: t('wanted.admin.col.created'), width: 120, hideOnMobile: true, render: (r) => <span className="text-ink-2">{formatRelative(r.createdAt)}</span> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input size="sm" label={t('wanted.admin.search')} iconLeft={<Search />} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} clearable className="min-w-[220px] flex-1" />
        <Select size="sm" label={t('wanted.admin.col.status')} value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={['all', 'active', 'paused', 'fulfilled', 'expired', 'removed'].map((s) => ({ value: s, label: s === 'all' ? t('wanted.filter.any') : t(`wanted.status.${s}`) }))} />
        <Select size="sm" label={t('wanted.admin.col.moderation')} value={moderation} onChange={(v) => { setModeration(v); setPage(1); }} options={['all', 'ok', 'flagged', 'hidden'].map((s) => ({ value: s, label: s === 'all' ? t('wanted.filter.any') : t(`wanted.admin.moderation.${s}`) }))} />
      </div>
      <Table<WantedAdminRow>
        columns={columns}
        rows={list.data?.items ?? []}
        rowKey="id"
        loading={list.isPending}
        empty={<EmptyState size="sm" title={t('empty.wanted')} />}
        rowActions={(r) => (
          <div className="flex gap-1">
            {r.moderationStatus !== 'hidden' && <Button size="sm" variant="ghost" iconLeft={<EyeOff />} onClick={() => moderate.mutate({ id: r.id, moderationStatus: 'hidden' })}>{t('wanted.admin.hide')}</Button>}
            {r.moderationStatus !== 'flagged' && r.moderationStatus !== 'hidden' && <Button size="sm" variant="ghost" iconLeft={<Flag />} onClick={() => moderate.mutate({ id: r.id, moderationStatus: 'flagged' })}>{t('wanted.admin.flag')}</Button>}
            {r.moderationStatus !== 'ok' && <Button size="sm" variant="ghost" iconLeft={<Eye />} onClick={() => moderate.mutate({ id: r.id, moderationStatus: 'ok' })}>{t('wanted.admin.restore')}</Button>}
          </div>
        )}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={setPage} loading={list.isFetching} />
    </div>
  );
}
