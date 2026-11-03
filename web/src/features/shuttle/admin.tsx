// Admin panel for "shuttle" — mounted by the admin shell at /admin/shuttle (and at /shuttle/admin standalone).
// Tabs: service alerts (create / edit / activate / deactivate / delete, audited server-side, notifies users who saved
// the route) · campus requests (status workflow) · JSON import / export so new campuses can be added without code.
import { useEffect, useMemo, useState } from 'react';
import { Download, FileJson, Megaphone, MoreHorizontal, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router';
import type { AlertSeverity } from '@shared/enums';
import type { AlertCreateInput } from '@shared/schemas/shuttle';
import { Badge, Button, Checkbox, DropdownMenu, EmptyState, Input, Modal, PageHeader, Pagination, Select, Table, Tabs, Textarea, type Column } from '@/components';
import { Head } from '@/app/Head';
import { errorMessage, fieldError } from '@/app/errors';
import { useCampus } from '@/lib/campus';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { exportRoutes, useAdminAlerts, useAdminRequests, useAdminRoutes, useCreateAlert, useDeleteAlert, useImportRoutes, usePatchAlert, usePatchRequest, type AdminAlert, type AdminRequest } from './api';
import { alertTitle } from './labels';
import { RouteSwatch } from './components/RouteSwatch';

type AdminTab = 'alerts' | 'requests' | 'import';
const SEVERITIES: AlertSeverity[] = ['info', 'warning', 'critical'];
const SEVERITY_VARIANT: Record<AlertSeverity, 'info' | 'warning' | 'danger'> = { info: 'info', warning: 'warning', critical: 'danger' };

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function ShuttleAdminPanel() {
  const t = useT();
  const { campuses, campusId: myCampus } = useCampus();
  const [params, setParams] = useSearchParams();
  const tab = (['alerts', 'requests', 'import'].includes(params.get('tab') ?? '') ? params.get('tab') : 'alerts') as AdminTab;
  const [campusId, setCampusId] = useState<string>(params.get('campus') ?? myCampus ?? 'northwestern');
  const campusOptions = useMemo(() => campuses.map((c) => ({ value: c.id, label: `${c.shortName} · ${c.city}, ${c.state}`, text: `${c.shortName} ${c.name} ${c.city}` })), [campuses]);
  const setTab = (k: AdminTab) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', k); return n; }, { replace: true });
  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('shuttle.admin.title')} />
      <PageHeader
        title={t('shuttle.admin.title')}
        subtitle={t('shuttle.admin.subtitle')}
        tabs={<Tabs items={[{ key: 'alerts', label: t('shuttle.admin.tabs.alerts'), icon: <Megaphone /> }, { key: 'requests', label: t('shuttle.admin.tabs.requests') }, { key: 'import', label: t('shuttle.admin.tabs.import'), icon: <FileJson /> }]} value={tab} onChange={setTab} label={t('shuttle.admin.title')} />}
        actions={<div className="w-full sm:w-72"><Select label={t('shuttle.admin.campus')} size="sm" searchable options={campusOptions} value={campusId} onChange={(v) => setCampusId(v ?? 'northwestern')} /></div>}
      />
      {tab === 'alerts' ? <AlertsTab campusId={campusId} /> : null}
      {tab === 'requests' ? <RequestsTab /> : null}
      {tab === 'import' ? <ImportTab campusId={campusId} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- alerts
function AlertsTab({ campusId }: { campusId: string }) {
  const t = useT();
  const { locale, formatDate } = useLocale();
  const [page, setPage] = useState(1);
  const q = useAdminAlerts({ campusId, page, pageSize: 20, includeInactive: true });
  const patch = usePatchAlert();
  const del = useDeleteAlert();
  const [editing, setEditing] = useState<AdminAlert | null | 'new'>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminAlert | null>(null);
  useEffect(() => setPage(1), [campusId]);

  const statusOf = (a: AdminAlert) => {
    if (!a.isActive) return { label: t('shuttle.admin.inactive'), variant: 'neutral' as const };
    if (a.live) return { label: t('shuttle.admin.live'), variant: 'success' as const };
    if (a.endsAt && a.endsAt <= new Date().toISOString()) return { label: t('shuttle.admin.expired'), variant: 'neutral' as const };
    return { label: t('shuttle.admin.scheduled'), variant: 'info' as const };
  };
  const columns: Column<AdminAlert>[] = [
    { key: 'severity', header: t('shuttle.admin.col.severity'), width: 110, render: (a) => <Badge variant={SEVERITY_VARIANT[a.severity]} size="sm">{t(`shuttle.alert.${a.severity}`)}</Badge> },
    {
      key: 'title', header: t('shuttle.admin.col.title'),
      render: (a) => (
        <div className="min-w-[240px] max-w-[440px]">
          <p className="text-body text-ink">{alertTitle(a, locale)}</p>
          {locale === 'zh-CN' && a.titleZh ? <p className="truncate text-caption text-ink-3" lang="en">{a.title}</p> : a.titleZh && locale === 'en' ? <p className="truncate text-caption text-ink-3" lang="zh-CN">{a.titleZh}</p> : null}
        </div>
      ),
    },
    { key: 'route', header: t('shuttle.admin.col.route'), width: 200, hideOnMobile: true, render: (a) => a.route ? <span className="flex items-center gap-2"><RouteSwatch color={a.route.color} size="sm" /><span className="truncate text-small">{a.route.name}</span></span> : <span className="text-small text-ink-3">{t('shuttle.admin.form.campusWide')}</span> },
    { key: 'window', header: t('shuttle.admin.col.window'), width: 200, hideOnMobile: true, render: (a) => <span className="block text-small text-ink-2 tnum"><span className="block whitespace-nowrap">{formatDate(a.startsAt, 'datetime')}</span><span className="block whitespace-nowrap">→ {a.endsAt ? formatDate(a.endsAt, 'datetime') : '∞'}</span></span> },
    { key: 'status', header: t('shuttle.admin.col.status'), width: 110, render: (a) => { const s = statusOf(a); return <span className="whitespace-nowrap"><Badge variant={s.variant} size="sm">{s.label}</Badge></span>; } },
  ];
  const rowActions = (a: AdminAlert) => (
    <DropdownMenu
      label={t('shuttle.admin.col.actions')}
      align="end"
      trigger={<Button variant="ghost" size="sm" iconOnly aria-label={t('shuttle.admin.col.actions')}><MoreHorizontal /></Button>}
      items={[
        { label: t('common.edit'), icon: <Pencil />, onSelect: () => setEditing(a) },
        { label: a.isActive ? t('shuttle.admin.deactivate') : t('shuttle.admin.activate'), icon: <Power />, onSelect: () => patch.mutate({ id: a.id, patch: { isActive: !a.isActive } }, { onSuccess: () => toast.success(t('shuttle.admin.updated')), onError: (e) => toast.error(errorMessage(t, e)) }) },
        'separator',
        { label: t('shuttle.admin.delete'), icon: <Trash2 />, danger: true, onSelect: () => setConfirmDelete(a) },
      ]}
    />
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button iconLeft={<Plus />} onClick={() => setEditing('new')}>{t('shuttle.admin.newAlert')}</Button>
      </div>
      <Table<AdminAlert>
        columns={columns}
        rows={q.data?.items ?? []}
        rowKey="id"
        loading={q.isLoading}
        rowActions={rowActions}
        onRowClick={(a) => setEditing(a)}
        empty={<EmptyState icon={Megaphone} title={t('shuttle.admin.alertsEmpty')} description={t('shuttle.admin.alertsEmptyHint')} action={{ label: t('shuttle.admin.newAlert'), onClick: () => setEditing('new') }} />}
        skeletonRows={4}
      />
      {q.data && q.data.total > 20 ? <Pagination page={page} pageSize={20} total={q.data.total} onChange={setPage} /> : null}
      {editing ? <AlertModal campusId={campusId} alert={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      <Modal open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} title={t('shuttle.admin.deleteConfirm')} description={t('shuttle.admin.deleteConfirmHint')} size="sm"
        footer={<><Button variant="ghost" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</Button><Button variant="danger" loading={del.isPending} onClick={() => confirmDelete && del.mutate(confirmDelete.id, { onSuccess: () => { toast.success(t('shuttle.admin.deleted')); setConfirmDelete(null); }, onError: (e) => toast.error(errorMessage(t, e)) })}>{t('shuttle.admin.delete')}</Button></>}>
        {confirmDelete ? <p className="text-body text-ink-2">{alertTitle(confirmDelete, locale)}</p> : null}
      </Modal>
    </div>
  );
}

function AlertModal({ campusId, alert, onClose }: { campusId: string; alert: AdminAlert | null; onClose: () => void }) {
  const t = useT();
  const routes = useAdminRoutes(alert?.campusId ?? campusId);
  const create = useCreateAlert();
  const patch = usePatchAlert();
  const [form, setForm] = useState({
    routeId: alert?.routeId ?? '',
    severity: (alert?.severity ?? 'info') as AlertSeverity,
    title: alert?.title ?? '',
    titleZh: alert?.titleZh ?? '',
    body: alert?.body ?? '',
    bodyZh: alert?.bodyZh ?? '',
    startsAt: toLocalInput(alert?.startsAt ?? new Date().toISOString()),
    endsAt: toLocalInput(alert?.endsAt),
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const err = create.error ?? patch.error;
  const pending = create.isPending || patch.isPending;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: AlertCreateInput = {
      campusId: alert?.campusId ?? campusId,
      routeId: form.routeId || null,
      severity: form.severity,
      title: form.title.trim(),
      titleZh: form.titleZh.trim() || null,
      body: form.body.trim() || null,
      bodyZh: form.bodyZh.trim() || null,
      startsAt: fromLocalInput(form.startsAt) ?? undefined,
      endsAt: fromLocalInput(form.endsAt),
    };
    if (alert) {
      const { campusId: _c, ...rest } = payload;
      patch.mutate({ id: alert.id, patch: rest }, { onSuccess: () => { toast.success(t('shuttle.admin.updated')); onClose(); }, onError: (e2) => toast.error(errorMessage(t, e2)) });
    } else {
      create.mutate(payload, { onSuccess: (d) => { toast.success(d.notified ? t('shuttle.admin.createdNotified', { n: d.notified }) : t('shuttle.admin.created')); onClose(); }, onError: (e2) => toast.error(errorMessage(t, e2)) });
    }
  };
  const routeOptions = [{ value: '', label: t('shuttle.admin.form.campusWide') }, ...(routes.data ?? []).map((r) => ({ value: r.id, label: r.name }))];
  return (
    <Modal open onClose={onClose} title={alert ? t('shuttle.admin.editAlert') : t('shuttle.admin.newAlert')} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="shuttle-alert-form" loading={pending}>{alert ? t('shuttle.admin.form.save') : t('shuttle.admin.form.publish')}</Button></>}>
      <form id="shuttle-alert-form" onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label={t('shuttle.admin.form.route')} options={routeOptions} value={form.routeId} onChange={(v) => set('routeId', v ?? '')} error={fieldError(t, err, 'routeId')} />
          <Select label={t('shuttle.admin.form.severity')} options={SEVERITIES.map((s) => ({ value: s, label: t(`shuttle.alert.${s}`) }))} value={form.severity} onChange={(v) => set('severity', (v ?? 'info') as AlertSeverity)} />
        </div>
        <Input label={t('shuttle.admin.form.title')} value={form.title} onChange={(e) => set('title', e.target.value)} error={fieldError(t, err, 'title')} required maxLength={140} />
        <Input label={t('shuttle.admin.form.titleZh')} value={form.titleZh} onChange={(e) => set('titleZh', e.target.value)} error={fieldError(t, err, 'titleZh')} optional maxLength={140} lang="zh-CN" />
        <Textarea label={t('shuttle.admin.form.body')} rows={2} maxRows={6} value={form.body} onChange={(e) => set('body', e.target.value)} optional maxLength={1000} />
        <Textarea label={t('shuttle.admin.form.bodyZh')} rows={2} maxRows={6} value={form.bodyZh} onChange={(e) => set('bodyZh', e.target.value)} optional maxLength={1000} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t('shuttle.admin.form.startsAt')} type="datetime-local" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} error={fieldError(t, err, 'startsAt')} />
          <Input label={t('shuttle.admin.form.endsAt')} type="datetime-local" hint={t('shuttle.admin.form.endsAtHint')} value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} error={fieldError(t, err, 'endsAt')} optional />
        </div>
        {err && !fieldError(t, err, 'title') && !fieldError(t, err, 'endsAt') && !fieldError(t, err, 'routeId') ? <p className="text-small text-danger" role="alert">{errorMessage(t, err)}</p> : null}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- requests
const REQUEST_STATUSES: AdminRequest['status'][] = ['open', 'planned', 'done', 'rejected'];
function RequestsTab() {
  const t = useT();
  const { formatRelative } = useLocale();
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const q = useAdminRequests({ status: status || undefined, page, pageSize: 20 });
  const patch = usePatchRequest();
  const counts = q.data?.counts ?? {};
  const columns: Column<AdminRequest>[] = [
    { key: 'campus', header: t('shuttle.admin.req.campus'), render: (r) => <div><p className="text-body text-ink">{r.campusName}</p><p className="text-caption text-ink-3">{r.campus ? `${r.campus.city}, ${r.campus.state}` : r.campusHasData ? '' : ''}{r.campusHasData ? <Badge variant="success" size="sm" className="ml-2">{t('shuttle.admin.req.hasData')}</Badge> : null}</p></div> },
    { key: 'contact', header: t('shuttle.admin.req.contact'), width: 220, render: (r) => <div className="text-small"><p className="text-ink">{r.userName ?? t('shuttle.admin.req.anonymous')}</p>{r.email ? <p className="truncate text-ink-3">{r.email}</p> : null}</div> },
    { key: 'url', header: t('shuttle.admin.req.url'), hideOnMobile: true, render: (r) => r.officialUrl ? <a href={r.officialUrl} target="_blank" rel="noreferrer noopener" className="block max-w-[260px] truncate text-small text-accent-text underline-offset-2 hover:underline">{r.officialUrl}</a> : <span className="text-ink-3">—</span> },
    { key: 'note', header: t('shuttle.admin.req.note'), hideOnMobile: true, render: (r) => <span className="line-clamp-2 text-small text-ink-2">{r.note ?? '—'}</span> },
    { key: 'created', header: '', width: 110, hideOnMobile: true, render: (r) => <span className="text-caption text-ink-3">{formatRelative(r.createdAt)}</span> },
    {
      key: 'status', header: t('shuttle.admin.req.status'), width: 150,
      render: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Select size="sm" aria-label={t('shuttle.admin.req.status')} options={REQUEST_STATUSES.map((s) => ({ value: s, label: t(`shuttle.admin.status.${s}`) }))} value={r.status}
            onChange={(v) => v && v !== r.status && patch.mutate({ id: r.id, status: v as AdminRequest['status'] }, { onSuccess: () => toast.success(t('shuttle.admin.statusUpdated')), onError: (e) => toast.error(errorMessage(t, e)) })} />
        </div>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Tabs
        variant="pill"
        items={[{ key: '', label: t('shuttle.admin.allCampuses'), count: Object.values(counts).reduce((a, b) => a + b, 0) }, ...REQUEST_STATUSES.map((s) => ({ key: s, label: t(`shuttle.admin.status.${s}`), count: counts[s] ?? 0 }))]}
        value={status}
        onChange={(k) => { setStatus(k); setPage(1); }}
        label={t('shuttle.admin.req.status')}
        scrollable
      />
      <Table<AdminRequest> columns={columns} rows={q.data?.items ?? []} rowKey="id" loading={q.isLoading} skeletonRows={3}
        empty={<EmptyState icon={Megaphone} title={t('shuttle.admin.requestsEmpty')} description={t('shuttle.admin.requestsEmptyHint')} />} />
      {q.data && q.data.total > 20 ? <Pagination page={page} pageSize={20} total={q.data.total} onChange={setPage} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- import / export
const TEMPLATE = (campusId: string) => JSON.stringify({
  campusId,
  replace: false,
  routes: [
    {
      name: 'Campus Loop', shortName: 'LOOP', color: '#1E7245', description: 'Clockwise loop around campus.', serviceDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      firstDeparture: '07:00', lastDeparture: '22:00', headwayMin: 15, officialUrl: 'https://example.edu/transportation/shuttles', isApproximate: true,
      stops: [
        { key: 'union', name: 'Student Union', nameZh: '学生中心', lat: 40.1095, lng: -88.2273, address: '1401 W Green St', minutesFromStart: 0 },
        { key: 'library', name: 'Main Library', nameZh: '主图书馆', lat: 40.1047, lng: -88.2287, minutesFromStart: 4 },
        { key: 'station', name: 'Transit Center', nameZh: '公交枢纽', lat: 40.116, lng: -88.2425, minutesFromStart: 12 },
      ],
    },
    {
      name: 'Downtown Express', shortName: 'DTX', serviceDays: ['sat', 'sun'],
      stops: [
        { key: 'union', name: 'Student Union', lat: 40.1095, lng: -88.2273, minutesFromStart: 0 },
        { key: 'station', name: 'Transit Center', lat: 40.116, lng: -88.2425, minutesFromStart: 10 },
      ],
      timetable: [{ serviceDay: 'saturday', departures: ['10:00', '12:00', '14:00', '16:00'] }, { serviceDay: 'sunday', departures: ['11:00', '14:00', '17:00'] }],
    },
  ],
}, null, 2);

function ImportTab({ campusId }: { campusId: string }) {
  const t = useT();
  const [json, setJson] = useState('');
  const [replace, setReplace] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const imp = useImportRoutes();
  const routes = useAdminRoutes(campusId);
  const submit = () => {
    setParseError(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json) as Record<string, unknown>;
    } catch (e) {
      setParseError(t('shuttle.admin.import.invalidJson', { msg: (e as Error).message }));
      return;
    }
    const payload = { ...parsed, campusId, replace } as Parameters<typeof imp.mutate>[0];
    imp.mutate(payload, {
      onSuccess: (r) => toast.success(t('shuttle.admin.import.success', { routes: r.routes, stops: r.stops, rows: r.scheduleRows, requests: r.closedRequests })),
      onError: (e) => toast.error(errorMessage(t, e)),
    });
  };
  const doExport = async () => {
    setExporting(true);
    try {
      const data = await exportRoutes(campusId);
      if (!data.routes.length) toast.info(t('shuttle.admin.import.noData'));
      setJson(JSON.stringify({ ...data, replace: true }, null, 2));
      toast.success(t('shuttle.admin.import.exported', { n: data.routes.length }));
    } catch (e) {
      toast.error(errorMessage(t, e));
    } finally {
      setExporting(false);
    }
  };
  const fields = imp.error && 'fields' in imp.error && imp.error.fields ? Object.entries(imp.error.fields) : [];
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-h3 text-ink">{t('shuttle.admin.import.title')}</h2>
          <p className="mt-1 max-w-reading text-small text-ink-2">{t('shuttle.admin.import.description')}</p>
        </div>
        <Textarea label={t('shuttle.admin.import.json')} rows={16} maxRows={32} value={json} onChange={(e) => setJson(e.target.value)} error={parseError ?? undefined} spellCheck={false} className="font-mono text-small" />
        {fields.length ? (
          <ul className="rounded-card bg-danger-soft px-4 py-3 text-small text-danger" role="alert">
            {fields.slice(0, 8).map(([k, v]) => <li key={k}><span className="font-mono">{k}</span>: {v}</li>)}
          </ul>
        ) : null}
        <Checkbox label={t('shuttle.admin.import.replace')} description={t('shuttle.admin.import.replaceHint')} checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" iconLeft={<FileJson />} onClick={() => setJson(TEMPLATE(campusId))}>{t('shuttle.admin.import.template')}</Button>
          <Button variant="secondary" iconLeft={<Download />} onClick={doExport} loading={exporting}>{t('shuttle.admin.import.export')}</Button>
          <Button onClick={submit} loading={imp.isPending} disabled={!json.trim()}>{t('shuttle.admin.import.submit')}</Button>
        </div>
      </div>
      <aside className="rounded-card border border-line bg-surface p-4">
        <h3 className="text-caption uppercase tracking-wide text-ink-3">{t('shuttle.tabs.routes')} · {campusId}</h3>
        {routes.data?.length ? (
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {routes.data.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-2 text-small">
                <RouteSwatch color={r.color} size="sm" />
                <span className="min-w-0 flex-1 truncate text-ink">{r.name}</span>
                <span className="text-ink-3 tnum">{t('shuttle.stopCount', { n: r.stopCount })}</span>
                {!r.isActive ? <Badge variant="neutral" size="sm">{t('shuttle.admin.inactive')}</Badge> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-small text-ink-3">{routes.isLoading ? t('common.loading') : t('shuttle.admin.import.noData')}</p>
        )}
        <p className="mt-3 text-caption text-ink-3">{t('shuttle.admin.import.dedupeHint')}</p>
      </aside>
    </div>
  );
}
