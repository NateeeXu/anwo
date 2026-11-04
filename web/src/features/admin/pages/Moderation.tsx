// Generic moderation table (房源 / 求租 / 二手 / 搭子 when the owning module has no admin panel, and always for listings):
// moderation-status tabs, search, campus filter, sort by reports, keyboard bulk hide/flag/restore with a required reason.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Eye, EyeOff, FlagTriangleRight, Inbox, Search } from 'lucide-react';
import type { ModeratedEntityType, ModerationRow } from '@shared/schemas/admin';
import { Badge, Button, EmptyState, Input, Pagination, Select, Table, Tabs } from '@/components';
import { useDebounce } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/cn';
import { Head } from '@/app/Head';
import { adminApi, useAdminMutation, useModeration } from '../api';
import { BulkBar, CampusFilter, ErrorState, ExportLink, KeyHints, ModerationBadge, PageTitle, ReasonDialog, useAdminFilters, useRowKeys, useStatusLabel } from '../ui';

type ModTab = 'all' | 'flagged' | 'hidden' | 'ok';
type Target = 'ok' | 'flagged' | 'hidden';

export function ModerationTable({ entityType, titleKey, embedded }: { entityType: ModeratedEntityType; titleKey: string; embedded?: boolean }) {
  const t = useT();
  const { formatMoney, formatRelative, formatNumber } = useLocale();
  const statusLabel = useStatusLabel();
  const f = useAdminFilters();
  const tab = (f.param('mod') as ModTab | null) ?? 'all';
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);
  const [sort, setSort] = useState<'recent' | 'reports' | 'views' | 'price'>('reports');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<{ ids: string[]; to: Target; title?: string } | null>(null);
  useEffect(() => setPage(1), [tab, dq, sort, f.campusId]);
  useEffect(() => setSelected([]), [tab, entityType]);

  const list = useModeration(entityType, { moderationStatus: tab === 'all' ? undefined : tab, q: dq, campusId: f.campusId, sort, page, pageSize: 20 });
  const rows = list.data?.items ?? [];
  const { cursor } = useRowKeys(rows, (r) => r.id, { selected, setSelected });
  const single = useAdminMutation((v: { id: string; to: Target; reason: string }) => adminApi.moderate(entityType, v.id, { moderationStatus: v.to, reason: v.reason }));
  const bulk = useAdminMutation((v: { ids: string[]; to: Target; reason: string }) => adminApi.moderateBulk(entityType, { ids: v.ids, moderationStatus: v.to, reason: v.reason }));
  const counts = list.data?.moderationCounts ?? {};
  const title = t(titleKey);

  return (
    <div className="flex flex-col gap-5">
      {!embedded && <Head title={title} />}
      {!embedded && <PageTitle title={title} subtitle={t('admin.mod.subtitle')} actions={entityType === 'listing' ? <ExportLink table="listings" query={{ campusId: f.campusId }} /> : undefined} />}
      <Tabs<ModTab>
        scrollable
        label={t('admin.mod.status')}
        value={tab}
        onChange={(v) => f.setParam('mod', v === 'all' ? null : v)}
        items={[
          { key: 'all', label: t('admin.mod.tab.all') },
          { key: 'flagged', label: t('admin.moderation.flagged'), count: counts.flagged ?? 0 },
          { key: 'hidden', label: t('admin.moderation.hidden'), count: counts.hidden ?? 0 },
          { key: 'ok', label: t('admin.moderation.ok'), count: counts.ok ?? 0 },
        ]}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Input size="sm" iconLeft={<Search />} placeholder={t('admin.mod.search')} aria-label={t('admin.mod.search')} value={q} onChange={(e) => setQ(e.target.value)} clearable />
        <CampusFilter value={f.campusId} onChange={f.setCampus} />
        <Select
          size="sm"
          aria-label={t('admin.common.sort')}
          value={sort}
          onChange={(v) => setSort(v as typeof sort)}
          options={[
            { value: 'reports', label: t('admin.mod.sortReports') },
            { value: 'recent', label: t('admin.mod.sortRecent') },
            { value: 'views', label: t('admin.mod.sortViews') },
            { value: 'price', label: t('admin.mod.sortPrice') },
          ]}
        />
      </div>
      <KeyHints />
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <Table<ModerationRow>
          rows={rows}
          rowKey="id"
          loading={list.isLoading}
          selectable
          selected={selected}
          onSelectChange={setSelected}
          caption={title}
          data-testid="moderation-table"
          empty={<EmptyState icon={Inbox} title={t('admin.mod.empty')} description={t('admin.mod.emptyHint')} size="sm" />}
          columns={[
            {
              key: 'title',
              header: t('admin.col.content'),
              render: (r, i) => (
                <div className="flex min-w-0 items-center gap-2.5">
                  {r.imageUrl ? <img src={r.imageUrl} alt="" className="size-10 shrink-0 rounded-ctl object-cover dark:brightness-[.92]" /> : <span className="size-10 shrink-0 rounded-ctl bg-sunken" aria-hidden />}
                  <div className="min-w-0">
                    <Link to={r.link} target="_blank" className={cn('block truncate font-medium text-ink hover:underline', i === cursor && 'underline decoration-accent decoration-2 underline-offset-4')}>
                      {r.title}
                    </Link>
                    <p className="truncate text-caption text-ink-3">
                      {r.subtitle}
                      {r.boosted && <Badge variant="boosted" size="sm" className="ml-1.5" />}
                    </p>
                  </div>
                </div>
              ),
            },
            { key: 'owner', header: t('admin.mod.owner'), hideOnMobile: true, render: (r) => (r.owner ? <Link to={`/admin/users?u=${r.owner.id}`} className="text-ink-2 hover:underline">{r.owner.name}</Link> : '—') },
            { key: 'campus', header: t('admin.col.campus'), hideOnMobile: true, render: (r) => r.campus?.shortName ?? '—' },
            { key: 'price', header: t('admin.mod.price'), align: 'right', hideOnMobile: true, render: (r) => (r.priceCents !== null ? formatMoney(r.priceCents) : '—') },
            { key: 'views', header: t('admin.mod.views'), align: 'right', hideOnMobile: true, render: (r) => formatNumber(r.viewCount) },
            { key: 'reports', header: t('admin.users.reports'), align: 'right', render: (r) => (r.openReports ? <Badge size="sm" variant="warning">{r.openReports}</Badge> : <span className="text-ink-3">{r.reportCount}</span>) },
            { key: 'status', header: t('admin.mod.status'), render: (r) => <div className="flex flex-wrap items-center gap-1"><ModerationBadge status={r.moderationStatus} /><span className="text-caption text-ink-3">{statusLabel(r.status)}</span></div> },
            { key: 'created', header: t('admin.mod.created'), hideOnMobile: true, render: (r) => <span className="text-ink-2">{formatRelative(r.createdAt)}</span> },
          ]}
          rowActions={(r) => (
            <div className="flex gap-1">
              {r.moderationStatus === 'ok' ? (
                <Button size="sm" variant="ghost" iconOnly aria-label={t('admin.mod.hide')} onClick={() => setTarget({ ids: [r.id], to: 'hidden', title: r.title })} data-testid="mod-hide">
                  <EyeOff />
                </Button>
              ) : (
                <Button size="sm" variant="ghost" iconOnly aria-label={t('admin.mod.restore')} onClick={() => setTarget({ ids: [r.id], to: 'ok', title: r.title })}>
                  <Eye />
                </Button>
              )}
            </div>
          )}
        />
      )}
      {list.data && list.data.total > list.data.pageSize && <Pagination page={page} pageSize={20} total={list.data.total} onChange={setPage} loading={list.isFetching} />}

      <BulkBar count={selected.length} onClear={() => setSelected([])}>
        <Button size="sm" variant="secondary" iconLeft={<Eye />} onClick={() => setTarget({ ids: selected, to: 'ok' })}>
          {t('admin.mod.restore')}
        </Button>
        <Button size="sm" variant="secondary" iconLeft={<FlagTriangleRight />} onClick={() => setTarget({ ids: selected, to: 'flagged' })}>
          {t('admin.mod.flag')}
        </Button>
        <Button size="sm" variant="danger" iconLeft={<EyeOff />} onClick={() => setTarget({ ids: selected, to: 'hidden' })}>
          {t('admin.mod.hide')}
        </Button>
      </BulkBar>

      <ReasonDialog
        open={!!target}
        danger={target?.to === 'hidden'}
        title={target ? (target.title ? t(`admin.mod.confirm.${target.to}`, { title: target.title }) : t(`admin.mod.confirmBulk.${target.to}`, { count: target.ids.length })) : ''}
        description={target ? t(`admin.mod.effect.${target.to}`) : undefined}
        confirmLabel={target ? t(`admin.mod.verb.${target.to}`) : ''}
        presets={target?.to === 'hidden' ? [t('admin.reason.preset.scam'), t('admin.reason.preset.duplicate'), t('admin.reason.preset.fha')] : [t('admin.reason.preset.cleared')]}
        onClose={() => setTarget(null)}
        onConfirm={async (reason) => {
          if (!target) return;
          if (target.ids.length === 1) await single.mutateAsync({ id: target.ids[0]!, to: target.to, reason });
          else await bulk.mutateAsync({ ids: target.ids, to: target.to, reason });
          toast.success(t('admin.mod.done', { count: target.ids.length }));
          setSelected([]);
        }}
      />
    </div>
  );
}
