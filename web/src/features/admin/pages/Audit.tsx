// /admin/audit — 审计: immutable audit log (search by action / actor / entity / date, before→after diff) + raw event explorer (≤ 7 days).
import { useEffect, useState } from 'react';
import { ClipboardList, Search } from 'lucide-react';
import type { AuditEntry } from '@shared/types';
import { Avatar, Badge, Button, DateRange, EmptyState, Input, Modal, Pagination, Select, Table, Tabs } from '@/components';
import { useDebounce } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { Head } from '@/app/Head';
import { useAudit, useEvents, type EventRowDto } from '../api';
import { CampusFilter, ErrorState, ExportLink, PageTitle, useAdminFilters } from '../ui';

export default function Audit() {
  const t = useT();
  const f = useAdminFilters();
  const tab = (f.param('tab') as 'audit' | 'events' | null) ?? 'audit';
  return (
    <div className="flex flex-col gap-5">
      <Head title={t('admin.nav.audit')} />
      <PageTitle title={t('admin.nav.audit')} subtitle={t('admin.audit.subtitle')} actions={<ExportLink table={tab === 'events' ? 'events' : 'audit_log'} />} />
      <Tabs<'audit' | 'events'>
        label={t('admin.nav.audit')}
        value={tab}
        onChange={(v) => f.setParam('tab', v === 'audit' ? null : v)}
        items={[
          { key: 'audit', label: t('admin.audit.tab') },
          { key: 'events', label: t('admin.events.tab') },
        ]}
      />
      {tab === 'audit' ? <AuditLog /> : <EventsExplorer />}
    </div>
  );
}

function prettyJson(v: unknown): string {
  return v === null || v === undefined ? '—' : JSON.stringify(v, null, 2);
}

function AuditLog() {
  const t = useT();
  const { formatDate, formatRelative } = useLocale();
  const f = useAdminFilters();
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);
  const [action, setAction] = useState('all');
  const [range, setRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const entityId = f.param('entityId');
  useEffect(() => setPage(1), [dq, action, range.start, range.end, entityId]);
  const list = useAudit({ q: dq, action: action === 'all' ? undefined : action, from: range.start, to: range.end, entityId, page, pageSize: 25 });
  const actions = list.data?.actions ?? [];
  const groups = [...new Set(actions.map((a) => a.action.split('.')[0]))];

  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Input size="sm" iconLeft={<Search />} placeholder={t('admin.audit.search')} aria-label={t('admin.audit.search')} value={q} onChange={(e) => setQ(e.target.value)} clearable />
        <Select
          size="sm"
          searchable
          aria-label={t('admin.audit.action')}
          value={action}
          onChange={setAction}
          options={[
            { value: 'all', label: t('admin.audit.allActions') },
            ...groups.map((g) => ({ value: `${g}.*`, label: t('admin.audit.group', { group: g }), text: `${g}.*` })),
            ...actions.map((a) => ({ value: a.action, label: `${a.action} · ${a.n}`, text: a.action })),
          ]}
        />
        <DateRange value={range} onChange={setRange} label={t('admin.audit.dates')} />
      </div>
      {entityId && (
        <div className="flex items-center gap-2">
          <Badge size="sm">{t('admin.audit.entityFilter', { id: entityId.slice(0, 8) })}</Badge>
          <Button size="sm" variant="ghost" onClick={() => f.setParam('entityId', null)}>
            {t('admin.bulk.clear')}
          </Button>
        </div>
      )}
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <Table<AuditEntry>
          rows={list.data?.items ?? []}
          rowKey="id"
          loading={list.isLoading}
          onRowClick={setOpen}
          caption={t('admin.audit.tab')}
          data-testid="audit-table"
          empty={<EmptyState icon={ClipboardList} title={t('admin.audit.empty')} size="sm" />}
          columns={[
            { key: 'time', header: t('admin.col.time'), width: 150, render: (a) => <span className="text-ink-2" title={formatDate(a.createdAt, 'datetime')}>{formatRelative(a.createdAt)}</span> },
            {
              key: 'actor',
              header: t('admin.audit.actor'),
              render: (a) =>
                a.actor ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar src={a.actor.avatarUrl} name={a.actor.name} size="xs" />
                    <span className="truncate text-ink">{a.actor.name}</span>
                  </span>
                ) : (
                  <span className="text-ink-3">{t('admin.common.system')}</span>
                ),
            },
            { key: 'action', header: t('admin.audit.action'), render: (a) => <span className="flex flex-col"><span className="text-small text-ink">{t(`admin.audit.action.${a.action}`) !== `admin.audit.action.${a.action}` ? t(`admin.audit.action.${a.action}`) : a.action}</span><code className="font-mono text-caption text-ink-3">{a.action}</code></span> },
            { key: 'entity', header: t('admin.col.entity'), hideOnMobile: true, render: (a) => <span className="text-caption text-ink-2">{a.entityType ? `${a.entityType} · ${(a.entityId ?? '').slice(0, 14)}` : '—'}</span> },
            { key: 'reason', header: t('admin.col.reason'), render: (a) => <span className="line-clamp-2 text-small text-ink-2">{a.reason ?? '—'}</span> },
          ]}
        />
      )}
      {list.data && list.data.total > list.data.pageSize && <Pagination page={page} pageSize={25} total={list.data.total} onChange={setPage} loading={list.isFetching} />}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.action} description={open ? formatDate(open.createdAt, 'datetime') : undefined} size="md">
        {open && (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-3 text-small">
              <div>
                <dt className="text-caption text-ink-3">{t('admin.audit.actor')}</dt>
                <dd className="text-ink">{open.actor?.name ?? t('admin.common.system')}{open.actorRole ? ` · ${open.actorRole}` : ''}</dd>
              </div>
              <div>
                <dt className="text-caption text-ink-3">{t('admin.col.entity')}</dt>
                <dd className="break-all text-ink">{open.entityType} · {open.entityId}</dd>
              </div>
            </dl>
            {open.reason && <p className="rounded-ctl bg-sunken px-3 py-2 text-small text-ink">{open.reason}</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-caption text-ink-3">{t('admin.audit.before')}</p>
                <pre className="max-h-64 overflow-auto rounded-ctl bg-sunken p-3 font-mono text-caption text-ink-2">{prettyJson(open.before)}</pre>
              </div>
              <div>
                <p className="mb-1 text-caption text-ink-3">{t('admin.audit.after')}</p>
                <pre className="max-h-64 overflow-auto rounded-ctl bg-sunken p-3 font-mono text-caption text-ink">{prettyJson(open.after)}</pre>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function EventsExplorer() {
  const t = useT();
  const { formatDate } = useLocale();
  const f = useAdminFilters();
  const [type, setType] = useState('all');
  const [userId, setUserId] = useState('');
  const dUser = useDebounce(userId, 400);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [type, dUser, f.campusId]);
  const list = useEvents({ type: type === 'all' ? undefined : type, userId: dUser || undefined, campusId: f.campusId, page, pageSize: 30 });
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select size="sm" searchable aria-label={t('admin.col.type')} value={type} onChange={setType} options={[{ value: 'all', label: t('admin.events.allTypes') }, ...(list.data?.types ?? []).map((x) => ({ value: x.type, label: `${x.type} · ${x.n}`, text: x.type }))]} />
        <CampusFilter value={f.campusId} onChange={f.setCampus} />
        <Input size="sm" placeholder={t('admin.events.userId')} aria-label={t('admin.events.userId')} value={userId} onChange={(e) => setUserId(e.target.value.trim())} clearable />
      </div>
      {list.data && <p className="text-caption text-ink-3">{t('admin.events.window', { from: formatDate(list.data.from), to: formatDate(list.data.to), count: list.data.total })}</p>}
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <Table<EventRowDto>
          rows={list.data?.items ?? []}
          rowKey="id"
          loading={list.isLoading}
          caption={t('admin.events.tab')}
          data-testid="events-table"
          empty={<EmptyState icon={ClipboardList} title={t('admin.events.empty')} size="sm" />}
          columns={[
            { key: 'time', header: t('admin.col.time'), width: 150, render: (e) => <span className="text-ink-2">{formatDate(e.createdAt, 'datetime')}</span> },
            { key: 'type', header: t('admin.col.type'), render: (e) => <code className="font-mono text-caption text-ink">{e.type}</code> },
            { key: 'user', header: t('admin.col.user'), render: (e) => (e.user ? e.user.name : <span className="text-ink-3">{t('admin.events.anonymous')}</span>) },
            { key: 'campus', header: t('admin.col.campus'), hideOnMobile: true, render: (e) => e.campus?.shortName ?? '—' },
            { key: 'entity', header: t('admin.col.entity'), hideOnMobile: true, render: (e) => <span className="text-caption text-ink-2">{e.entityType ? `${e.entityType} · ${(e.entityId ?? '').slice(0, 10)}` : e.path ?? '—'}</span> },
            { key: 'props', header: t('admin.events.props'), hideOnMobile: true, render: (e) => <code className="line-clamp-1 max-w-[220px] font-mono text-caption text-ink-3">{Object.keys(e.props).length ? JSON.stringify(e.props) : ''}</code> },
          ]}
        />
      )}
      {list.data && list.data.total > list.data.pageSize && <Pagination page={page} pageSize={30} total={list.data.total} onChange={setPage} loading={list.isFetching} />}
    </>
  );
}
