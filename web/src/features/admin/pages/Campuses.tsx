// /admin/campuses — 校区: campus table (activity stats, activate/deactivate, edit details) + campus requests triage.
import { useEffect, useState } from 'react';
import { Check, Pencil, School, Search, X } from 'lucide-react';
import type { AdminCampusRequest, AdminCampusRow } from '@shared/schemas/admin';
import { Badge, Button, EmptyState, Input, Modal, Pagination, Select, Switch, Table, Tabs, Textarea } from '@/components';
import { invalidateMeta } from '@/lib/meta';
import { useDebounce } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { errorMessage, fieldError } from '@/app/errors';
import { Head } from '@/app/Head';
import { adminApi, useAdminCampuses, useAdminMutation, useCampusRequests } from '../api';
import { ErrorState, PageTitle, ReasonDialog, useAdminFilters } from '../ui';

export default function Campuses() {
  const t = useT();
  const f = useAdminFilters();
  const tab = (f.param('tab') as 'campuses' | 'requests' | null) ?? 'campuses';
  const req = useCampusRequests({ status: 'open', pageSize: 1 });
  return (
    <div className="flex flex-col gap-5">
      <Head title={t('admin.nav.campuses')} />
      <PageTitle title={t('admin.nav.campuses')} subtitle={t('admin.campuses.subtitle')} />
      <Tabs<'campuses' | 'requests'>
        label={t('admin.nav.campuses')}
        value={tab}
        onChange={(v) => f.setParam('tab', v === 'campuses' ? null : v)}
        items={[
          { key: 'campuses', label: t('admin.campuses.tab') },
          { key: 'requests', label: t('admin.campuses.requests'), count: req.data?.counts.open ?? 0 },
        ]}
      />
      {tab === 'campuses' ? <CampusTable /> : <RequestsTable />}
    </div>
  );
}

function CampusTable() {
  const t = useT();
  const { formatNumber, isZh } = useLocale();
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);
  const [active, setActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [sort, setSort] = useState<'order' | 'name' | 'users' | 'listings'>('users');
  const [page, setPage] = useState(1);
  const [toggle, setToggle] = useState<AdminCampusRow | null>(null);
  const [edit, setEdit] = useState<AdminCampusRow | null>(null);
  useEffect(() => setPage(1), [dq, active, sort]);
  const list = useAdminCampuses({ q: dq, active, sort, page, pageSize: 20 });
  const patch = useAdminMutation((v: { id: string; body: Record<string, unknown> }) => adminApi.patchCampus(v.id, v.body));

  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Input size="sm" iconLeft={<Search />} placeholder={t('admin.campuses.search')} aria-label={t('admin.campuses.search')} value={q} onChange={(e) => setQ(e.target.value)} clearable />
        <Select
          size="sm"
          aria-label={t('admin.users.status')}
          value={active}
          onChange={(v) => setActive(v as typeof active)}
          options={[
            { value: 'all', label: t('admin.campuses.all', { count: list.data?.counts.all ?? '' }) },
            { value: 'active', label: t('admin.campuses.activeOnly', { count: list.data?.counts.active ?? '' }) },
            { value: 'inactive', label: t('admin.campuses.inactiveOnly') },
          ]}
        />
        <Select
          size="sm"
          aria-label={t('admin.common.sort')}
          value={sort}
          onChange={(v) => setSort(v as typeof sort)}
          options={[
            { value: 'users', label: t('admin.campuses.sortUsers') },
            { value: 'listings', label: t('admin.campuses.sortListings') },
            { value: 'name', label: t('admin.campuses.sortName') },
            { value: 'order', label: t('admin.campuses.sortOrder') },
          ]}
        />
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <Table<AdminCampusRow>
          rows={list.data?.items ?? []}
          rowKey="id"
          loading={list.isLoading}
          caption={t('admin.campuses.tab')}
          data-testid="campuses-table"
          empty={<EmptyState icon={School} title={t('admin.campuses.empty')} size="sm" />}
          columns={[
            {
              key: 'name',
              header: t('admin.col.campus'),
              render: (c) => (
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{isZh && c.nameZh ? `${c.nameZh} ${c.shortName}` : c.name}</p>
                  <p className="truncate text-caption text-ink-3">
                    {c.city}, {c.state} · {c.eduDomains.join(', ')}
                  </p>
                </div>
              ),
            },
            { key: 'users', header: t('admin.campuses.users'), align: 'right', render: (c) => formatNumber(c.stats.users) },
            { key: 'mau', header: t('admin.metric.mau'), align: 'right', hideOnMobile: true, render: (c) => formatNumber(c.stats.mau) },
            { key: 'listings', header: t('admin.metric.listingsActive'), align: 'right', render: (c) => formatNumber(c.stats.listingsActive) },
            { key: 'items', header: t('admin.metric.itemsActive'), align: 'right', hideOnMobile: true, render: (c) => formatNumber(c.stats.itemsActive) },
            { key: 'buddy', header: t('admin.metric.buddyOpen'), align: 'right', hideOnMobile: true, render: (c) => formatNumber(c.stats.buddyOpen) },
            { key: 'shuttle', header: t('admin.campuses.shuttle'), hideOnMobile: true, render: (c) => (c.hasShuttle ? <Check size={16} className="text-success" aria-label={t('admin.common.yes')} /> : <span className="text-ink-3">—</span>) },
            {
              key: 'active',
              header: t('admin.campuses.active'),
              render: (c) => <Switch checked={!!c.isActive} onChange={() => setToggle(c)} aria-label={t('admin.campuses.toggle', { name: c.shortName })} size="sm" />,
            },
          ]}
          rowActions={(c) => (
            <Button size="sm" variant="ghost" iconOnly aria-label={t('admin.campuses.edit', { name: c.shortName })} onClick={() => setEdit(c)}>
              <Pencil />
            </Button>
          )}
        />
      )}
      {list.data && list.data.total > list.data.pageSize && <Pagination page={page} pageSize={20} total={list.data.total} onChange={setPage} loading={list.isFetching} />}
      <ReasonDialog
        open={!!toggle}
        danger={!!toggle?.isActive}
        title={toggle ? t(toggle.isActive ? 'admin.campuses.confirmDeactivate' : 'admin.campuses.confirmActivate', { name: toggle.shortName }) : ''}
        description={toggle?.isActive ? t('admin.campuses.deactivateHint') : t('admin.campuses.activateHint')}
        confirmLabel={toggle?.isActive ? t('admin.campuses.deactivate') : t('admin.campuses.activate')}
        onClose={() => setToggle(null)}
        onConfirm={async (reason) => {
          await patch.mutateAsync({ id: toggle!.id, body: { isActive: !toggle!.isActive, reason } });
          invalidateMeta();
          toast.success(t('admin.campuses.saved'));
        }}
      />
      <CampusEditor campus={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function CampusEditor({ campus, onClose }: { campus: AdminCampusRow | null; onClose: () => void }) {
  const t = useT();
  const [form, setForm] = useState({ name: '', nameZh: '', shortName: '', eduDomains: '', defaultRadiusM: '5000', shuttleOfficialUrl: '', hasShuttle: false, sortOrder: '0', reason: '' });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const patch = useAdminMutation((body: Record<string, unknown>) => adminApi.patchCampus(campus!.id, body));
  useEffect(() => {
    if (campus)
      setForm({
        name: campus.name, nameZh: campus.nameZh ?? '', shortName: campus.shortName, eduDomains: campus.eduDomains.join(', '), defaultRadiusM: String(campus.defaultRadiusM),
        shuttleOfficialUrl: campus.shuttleOfficialUrl ?? '', hasShuttle: campus.hasShuttle, sortOrder: String(campus.sortOrder ?? 0), reason: '',
      });
    setErr(null);
  }, [campus]);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await patch.mutateAsync({
        name: form.name, nameZh: form.nameZh || null, shortName: form.shortName,
        eduDomains: form.eduDomains.split(/[\s,]+/).filter(Boolean), defaultRadiusM: Number(form.defaultRadiusM),
        shuttleOfficialUrl: form.shuttleOfficialUrl || null, hasShuttle: form.hasShuttle, sortOrder: Number(form.sortOrder), reason: form.reason || undefined,
      });
      invalidateMeta();
      toast.success(t('admin.campuses.saved'));
      onClose();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };
  const fe = (k: string) => (err ? fieldError(t, err, k) : undefined);
  return (
    <Modal
      open={!!campus}
      onClose={onClose}
      title={t('admin.campuses.editTitle')}
      description={campus ? `${campus.city}, ${campus.state}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={busy} onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label={t('admin.campuses.name')} value={form.name} onChange={set('name')} error={fe('name')} className="sm:col-span-2" />
        <Input label={t('admin.campuses.nameZh')} value={form.nameZh} onChange={set('nameZh')} error={fe('nameZh')} />
        <Input label={t('admin.campuses.shortName')} value={form.shortName} onChange={set('shortName')} error={fe('shortName')} maxLength={24} />
        <Input label={t('admin.campuses.domains')} hint={t('admin.campuses.domainsHint')} value={form.eduDomains} onChange={set('eduDomains')} error={fe('eduDomains') ?? fe('eduDomains.0')} className="sm:col-span-2" />
        <Input label={t('admin.campuses.radius')} type="number" inputMode="numeric" suffix="m" value={form.defaultRadiusM} onChange={set('defaultRadiusM')} error={fe('defaultRadiusM')} />
        <Input label={t('admin.campuses.sortOrderLabel')} type="number" inputMode="numeric" value={form.sortOrder} onChange={set('sortOrder')} error={fe('sortOrder')} />
        <Input label={t('admin.campuses.trackerUrl')} value={form.shuttleOfficialUrl} onChange={set('shuttleOfficialUrl')} error={fe('shuttleOfficialUrl')} className="sm:col-span-2" placeholder="https://" />
        <Switch label={t('admin.campuses.hasShuttle')} checked={form.hasShuttle} onChange={(v) => setForm({ ...form, hasShuttle: v })} className="sm:col-span-2" />
        <Textarea label={t('admin.reason.label')} rows={2} value={form.reason} onChange={set('reason')} className="sm:col-span-2" />
        {!!err && !fe('name') && (
          <p role="alert" className="text-small text-danger sm:col-span-2">
            {errorMessage(t, err)}
          </p>
        )}
      </div>
    </Modal>
  );
}

function RequestsTable() {
  const t = useT();
  const { formatRelative } = useLocale();
  const [status, setStatus] = useState<'open' | 'added' | 'rejected' | 'all'>('open');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<{ r: AdminCampusRequest; to: 'added' | 'rejected' } | null>(null);
  useEffect(() => setPage(1), [status]);
  const list = useCampusRequests({ status, page, pageSize: 20 });
  const patch = useAdminMutation((v: { id: string; status: string; note?: string }) => adminApi.patchCampusRequest(v.id, { status: v.status, note: v.note }));
  const counts = list.data?.counts ?? {};
  return (
    <>
      <Tabs<'open' | 'added' | 'rejected' | 'all'>
        variant="pill"
        label={t('admin.campuses.requests')}
        value={status}
        onChange={setStatus}
        items={(['open', 'added', 'rejected', 'all'] as const).map((s) => ({ key: s, label: t(`admin.campuses.req.${s}`), count: s === 'all' ? undefined : counts[s] ?? 0 }))}
      />
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <Table<AdminCampusRequest>
          rows={list.data?.items ?? []}
          rowKey="id"
          loading={list.isLoading}
          caption={t('admin.campuses.requests')}
          data-testid="requests-table"
          empty={<EmptyState icon={School} title={t('admin.campuses.reqEmpty')} description={t('admin.campuses.reqEmptyHint')} size="sm" />}
          columns={[
            {
              key: 'school',
              header: t('admin.campuses.school'),
              render: (r) => (
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{r.schoolName}</p>
                  <p className="truncate text-caption text-ink-3">{[r.city, r.state].filter(Boolean).join(', ') || '—'}</p>
                </div>
              ),
            },
            { key: 'similar', header: t('admin.campuses.demand'), align: 'right', render: (r) => (r.similarCount > 1 ? <Badge size="sm" variant="accent">{t('admin.campuses.demandN', { n: r.similarCount })}</Badge> : <span className="text-ink-3">1</span>) },
            { key: 'note', header: t('admin.campuses.note'), hideOnMobile: true, render: (r) => <span className="line-clamp-2 text-small text-ink-2">{r.note ?? '—'}</span> },
            { key: 'who', header: t('admin.campuses.contact'), hideOnMobile: true, render: (r) => <span className="text-small text-ink-2">{r.user?.name ?? r.email ?? '—'}</span> },
            { key: 'when', header: t('admin.col.time'), render: (r) => <span className="text-ink-2">{formatRelative(r.createdAt)}</span> },
            { key: 'status', header: t('admin.users.status'), render: (r) => <Badge size="sm" variant={r.status === 'added' ? 'success' : r.status === 'rejected' ? 'neutral' : 'warning'}>{t(`admin.campuses.req.${r.status}`)}</Badge> },
          ]}
          rowActions={(r) =>
            r.status === 'open' ? (
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" iconLeft={<Check />} onClick={() => setTarget({ r, to: 'added' })}>
                  {t('admin.campuses.markAdded')}
                </Button>
                <Button size="sm" variant="ghost" iconOnly aria-label={t('admin.campuses.reject')} onClick={() => setTarget({ r, to: 'rejected' })}>
                  <X />
                </Button>
              </div>
            ) : null
          }
        />
      )}
      {list.data && list.data.total > list.data.pageSize && <Pagination page={page} pageSize={20} total={list.data.total} onChange={setPage} loading={list.isFetching} />}
      <ReasonDialog
        open={!!target}
        title={target ? t(target.to === 'added' ? 'admin.campuses.confirmAdded' : 'admin.campuses.confirmReject', { name: target.r.schoolName }) : ''}
        description={target?.r.userId ? t('admin.campuses.notifyHint') : undefined}
        confirmLabel={target?.to === 'added' ? t('admin.campuses.markAdded') : t('admin.campuses.reject')}
        presets={target?.to === 'rejected' ? [t('admin.reason.preset.tooFew')] : [t('admin.reason.preset.launched')]}
        onClose={() => setTarget(null)}
        onConfirm={async (note) => {
          await patch.mutateAsync({ id: target!.r.id, status: target!.to, note });
          toast.success(t('admin.campuses.reqDone'));
        }}
      />
    </>
  );
}
