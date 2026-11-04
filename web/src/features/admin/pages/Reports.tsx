// /admin/reports — 举报: queue by status / entity type / reason / campus, keyboard bulk claim + dismiss,
// review drawer with entity card, scam checklist, related reports, read-only (audited) conversation, history, and actions.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, ExternalLink, Flag, Hand, ListChecks, MessageSquareWarning, X } from 'lucide-react';
import { ReportEntityType, ReportReason } from '@shared/enums';
import { ReportActionType, type AdminReport, type EntitySummary } from '@shared/schemas/admin';
import { Avatar, Badge, Button, Card, EmptyState, Modal, Pagination, Select, Skeleton, Table, Tabs, TrustBadge } from '@/components';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/cn';
import { Head } from '@/app/Head';
import { adminApi, useAdminMutation, useAdminReport, useAdminReports } from '../api';
import { BulkBar, CampusFilter, ErrorState, ExportLink, KeyHints, ModerationBadge, PageTitle, ReasonDialog, ReportStatusBadge, useAdminFilters, useAge, useRowKeys, useStatusLabel } from '../ui';

type StatusTab = 'pending' | 'open' | 'in_review' | 'actioned' | 'dismissed' | 'all';
const TABS: StatusTab[] = ['pending', 'in_review', 'actioned', 'dismissed', 'all'];

/** Which actions make sense for an entity type (requirements §3). */
function actionsFor(type: string): (typeof ReportActionType)[number][] {
  if (type === 'message') return ['delete_message', 'lock_conversation', 'warn_user', 'ban_user', 'none'];
  if (type === 'conversation') return ['lock_conversation', 'warn_user', 'ban_user', 'none'];
  if (type === 'user') return ['warn_user', 'ban_user', 'none'];
  if (type === 'partner') return ['none'];
  return ['hide', 'remove', 'warn_user', 'ban_user', 'none'];
}

export function EntityCard({ e }: { e: EntitySummary | null }) {
  const t = useT();
  const statusLabel = useStatusLabel();
  const { formatRelative } = useLocale();
  if (!e) return null;
  if (e.missing) return <p className="rounded-ctl bg-sunken px-3 py-2 text-small text-ink-2">{t('admin.reports.entityMissing')}</p>;
  return (
    <Card variant="sunken" padding="sm" className="flex gap-3">
      {e.imageUrl && <img src={e.imageUrl} alt="" className="size-16 shrink-0 rounded-ctl object-cover dark:brightness-[.92]" />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge size="sm">{t(`admin.entity.${e.type}`)}</Badge>
          {e.status && <span className="text-caption text-ink-3">{t('admin.reports.entityStatus', { status: statusLabel(e.status) })}</span>}
          <ModerationBadge status={e.moderationStatus} />
        </div>
        <p className="truncate font-medium text-ink">{e.title}</p>
        {e.subtitle && <p className="truncate text-caption text-ink-2">{e.subtitle}</p>}
        {e.body && <p className="line-clamp-3 text-small text-ink-2">{e.body}</p>}
        <div className="flex flex-wrap items-center gap-2 text-caption text-ink-3">
          {e.owner && (
            <span className="inline-flex items-center gap-1">
              <Avatar src={e.owner.avatarUrl} name={e.owner.name} size="xs" />
              <Link to={`/admin/users?u=${e.owner.id}`} className="text-ink-2 hover:underline">
                {e.owner.name}
              </Link>
              <TrustBadge level={e.owner.trustLevel} size="inline" />
            </span>
          )}
          {e.campus && <span>{e.campus.shortName}</span>}
          {e.createdAt && <span>{formatRelative(e.createdAt)}</span>}
          {e.link && (
            <Link to={e.link} target="_blank" className="inline-flex items-center gap-0.5 text-accent-text hover:underline">
              {t('admin.common.viewLive')}
              <ExternalLink size={12} aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function Reports() {
  const t = useT();
  const { formatNumber } = useLocale();
  const age = useAge();
  const f = useAdminFilters();
  const status = (f.param('status') as StatusTab | null) ?? 'pending';
  const [entityType, setEntityType] = useState('all');
  const [reason, setReason] = useState('all');
  const [sort, setSort] = useState<'oldest' | 'newest' | 'count'>('oldest');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<'in_review' | 'dismissed' | null>(null);
  const openId = f.param('r');
  useEffect(() => setPage(1), [status, entityType, reason, sort, f.campusId]);
  useEffect(() => setSelected([]), [status]);

  const list = useAdminReports({ status, entityType: entityType === 'all' ? undefined : entityType, reason: reason === 'all' ? undefined : reason, campusId: f.campusId, sort, page, pageSize: 20 });
  const rows = list.data?.items ?? [];
  const { cursor } = useRowKeys(rows, (r) => r.id, { selected, setSelected, onOpen: (r) => f.setParam('r', r.id), enabled: !openId });
  const bulkMut = useAdminMutation((body: { ids: string[]; status: 'in_review' | 'dismissed'; reason: string }) => adminApi.bulkReports(body));
  const by = list.data?.byStatus ?? {};
  const countFor = (s: StatusTab) => (s === 'pending' ? (by.open ?? 0) + (by.in_review ?? 0) : s === 'all' ? Object.values(by).reduce((a, b) => a + b, 0) : by[s] ?? 0);

  return (
    <div className="flex flex-col gap-5">
      <Head title={t('admin.nav.reports')} />
      <PageTitle title={t('admin.nav.reports')} subtitle={t('admin.reports.subtitle')} actions={<ExportLink table="reports" query={{ campusId: f.campusId }} />} />
      <Tabs<StatusTab> scrollable label={t('admin.users.status')} value={status} onChange={(s) => f.setParamsPatch({ status: s === 'pending' ? null : s })} items={TABS.map((s) => ({ key: s, label: t(`admin.reportTab.${s}`), count: countFor(s) }))} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <CampusFilter value={f.campusId} onChange={f.setCampus} />
        <Select size="sm" aria-label={t('admin.col.entity')} value={entityType} onChange={setEntityType} options={[{ value: 'all', label: t('admin.reports.allTypes') }, ...ReportEntityType.map((e) => ({ value: e, label: t(`admin.entity.${e}`) }))]} />
        <Select size="sm" aria-label={t('admin.col.reason')} value={reason} onChange={setReason} options={[{ value: 'all', label: t('admin.reports.allReasons') }, ...ReportReason.map((r) => ({ value: r, label: t(`admin.reason.${r}`) }))]} />
        <Select
          size="sm"
          aria-label={t('admin.common.sort')}
          value={sort}
          onChange={(v) => setSort(v as typeof sort)}
          options={[
            { value: 'oldest', label: t('admin.reports.sortOldest') },
            { value: 'newest', label: t('admin.reports.sortNewest') },
            { value: 'count', label: t('admin.reports.sortCount') },
          ]}
        />
      </div>
      <KeyHints />

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <Table<AdminReport>
          rows={rows}
          rowKey="id"
          loading={list.isLoading}
          selectable
          selected={selected}
          onSelectChange={setSelected}
          onRowClick={(r) => f.setParam('r', r.id)}
          caption={t('admin.nav.reports')}
          data-testid="reports-table"
          empty={<EmptyState icon={CheckCircle2} title={t('admin.reports.empty')} description={t('admin.reports.emptyHint')} size="sm" />}
          columns={[
            {
              key: 'entity',
              header: t('admin.col.entity'),
              render: (r, i) => (
                <div className="flex min-w-0 max-w-[340px] flex-col">
                  <span className={cn('truncate font-medium text-ink', i === cursor && 'underline decoration-accent decoration-2 underline-offset-4')}>{r.entity?.title ?? r.entityId}</span>
                  <span className="text-caption text-ink-3">
                    {t(`admin.entity.${r.entityType}`)}
                    {r.entity?.owner ? ` · ${r.entity.owner.name}` : ''}
                  </span>
                </div>
              ),
            },
            {
              key: 'reason',
              header: t('admin.col.reason'),
              render: (r) => (
                <span className={cn('inline-flex items-center gap-1', r.reason === 'scam' ? 'font-medium text-danger' : 'text-ink-2')}>
                  {r.reason === 'scam' && <MessageSquareWarning size={14} aria-hidden />}
                  {t(`admin.reason.${r.reason}`)}
                </span>
              ),
            },
            { key: 'count', header: t('admin.reports.count'), align: 'right', render: (r) => (r.reportCountForEntity > 1 ? <Badge size="sm" variant="warning">{r.reportCountForEntity}</Badge> : <span className="text-ink-3">{r.reportCountForEntity}</span>) },
            { key: 'campus', header: t('admin.col.campus'), hideOnMobile: true, render: (r) => r.campus?.shortName ?? '—' },
            { key: 'reporter', header: t('admin.reports.reporter'), hideOnMobile: true, render: (r) => <span className="text-ink-2">{r.reporter?.name ?? '—'}</span> },
            {
              key: 'age',
              header: t('admin.reports.age'),
              align: 'right',
              render: (r) => {
                const open = r.status === 'open' || r.status === 'in_review';
                const breach = open && (r.ageHours > 12 || (r.reason === 'scam' && r.ageHours > 4));
                return <span className={cn('tabular-nums', breach ? 'font-medium text-danger' : 'text-ink-2')}>{age(r.ageHours)}</span>;
              },
            },
            { key: 'status', header: t('admin.users.status'), render: (r) => <ReportStatusBadge status={r.status} /> },
          ]}
        />
      )}
      {list.data && list.data.total > list.data.pageSize && <Pagination page={page} pageSize={20} total={list.data.total} onChange={setPage} loading={list.isFetching} />}
      {list.data && <p className="text-caption text-ink-3">{t('admin.reports.total', { count: formatNumber(list.data.total) })}</p>}

      <BulkBar count={selected.length} onClear={() => setSelected([])}>
        <Button size="sm" variant="secondary" iconLeft={<Hand />} onClick={() => setBulk('in_review')}>
          {t('admin.reports.claim')}
        </Button>
        <Button size="sm" variant="secondary" iconLeft={<X />} onClick={() => setBulk('dismissed')} data-testid="bulk-dismiss">
          {t('admin.reports.dismiss')}
        </Button>
      </BulkBar>
      <ReasonDialog
        open={!!bulk}
        title={bulk === 'dismissed' ? t('admin.reports.bulkDismissTitle', { count: selected.length }) : t('admin.reports.bulkClaimTitle', { count: selected.length })}
        confirmLabel={bulk === 'dismissed' ? t('admin.reports.dismiss') : t('admin.reports.claim')}
        presets={bulk === 'dismissed' ? [t('admin.reason.preset.duplicate'), t('admin.reason.preset.noViolation')] : [t('admin.reason.preset.reviewing')]}
        onClose={() => setBulk(null)}
        onConfirm={async (r) => {
          const res = await bulkMut.mutateAsync({ ids: selected, status: bulk!, reason: r });
          toast.success(t('admin.reports.bulkDone', { count: res.updated }));
          setSelected([]);
        }}
      />
      <ReportDrawer id={openId} onClose={() => f.setParam('r', null)} />
    </div>
  );
}

const CHECKLIST = ['offPlatform', 'abroad', 'belowMarket', 'overpayment', 'notOnLease', 'agentImpersonation'] as const;

function ReportDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useT();
  const { formatRelative, formatDate } = useLocale();
  const report = useAdminReport(id);
  const r = report.data;
  const [action, setAction] = useState<string>('hide');
  const [dialog, setDialog] = useState<null | 'claim' | 'dismiss' | 'action'>(null);
  const [checks, setChecks] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (r) setAction(actionsFor(r.entityType)[0]!);
    setChecks(new Set());
  }, [r?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = useAdminMutation((body: Record<string, unknown>) => adminApi.patchReport(id!, body));
  const open = r && (r.status === 'open' || r.status === 'in_review');
  const options = useMemo(() => (r ? actionsFor(r.entityType).map((a) => ({ value: a, label: t(`admin.action.${a}`), description: t(`admin.actionHint.${a}`) })) : []), [r, t]);

  return (
    <Modal open={!!id} onClose={onClose} size="lg" title={t('admin.reports.review')} description={r ? `${t(`admin.reason.${r.reason}`)} · ${formatRelative(r.createdAt)}` : undefined}>
      {report.isError ? (
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      ) : !r ? (
        <div className="flex flex-col gap-3">
          <Skeleton variant="rect" height={88} />
          <Skeleton variant="rect" height={140} />
        </div>
      ) : (
        <div className="flex flex-col gap-5" data-testid="report-drawer">
          <div className="flex flex-wrap items-center gap-2">
            <ReportStatusBadge status={r.status} />
            {r.reportCountForEntity > 1 && <Badge variant="warning" size="sm">{t('admin.reports.openOnEntity', { count: r.reportCountForEntity })}</Badge>}
            {r.campus && <Badge size="sm">{r.campus.shortName}</Badge>}
            {r.reviewer && <span className="text-caption text-ink-3">{t('admin.reports.reviewedBy', { name: r.reviewer.name })}</span>}
          </div>
          <EntityCard e={r.entity} />
          <section className="flex flex-col gap-1">
            <h3 className="text-small font-medium text-ink">{t('admin.reports.details')}</h3>
            <p className="whitespace-pre-line text-small text-ink-2">{r.details || t('admin.reports.noDetails')}</p>
            <p className="text-caption text-ink-3">{t('admin.reports.by', { name: r.reporter?.name ?? '—', date: formatDate(r.createdAt, 'datetime') })}</p>
            {r.resolution && <p className="text-caption text-ink-2">{t('admin.reports.resolution', { text: r.resolution })}</p>}
          </section>

          <section aria-labelledby="scam-h" className="rounded-card border border-line p-3">
            <h3 id="scam-h" className="mb-2 flex items-center gap-1.5 text-small font-medium text-ink">
              <ListChecks size={16} strokeWidth={1.75} aria-hidden />
              {t('admin.scam.title')}
            </h3>
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {CHECKLIST.map((c) => (
                <li key={c}>
                  <label className="flex min-h-9 cursor-pointer items-center gap-2 text-small text-ink-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={checks.has(c)}
                      onChange={(e) => {
                        const n = new Set(checks);
                        if (e.target.checked) n.add(c);
                        else n.delete(c);
                        setChecks(n);
                      }}
                    />
                    {t(`admin.scam.${c}`)}
                  </label>
                </li>
              ))}
            </ul>
          </section>

          {r.messages && (
            <section aria-labelledby="conv-h">
              <h3 id="conv-h" className="mb-1 text-small font-medium text-ink">
                {t('admin.reports.conversation')}
              </h3>
              <p className="mb-2 text-caption text-ink-3">{t('admin.reports.conversationLogged')}</p>
              <ol className="flex max-h-56 flex-col gap-1.5 overflow-y-auto rounded-ctl bg-sunken p-3">
                {r.messages.map((m) => (
                  <li key={m.id} className={cn('text-small', m.id === r.entityId ? 'rounded-xs bg-warning-soft px-1.5' : '')}>
                    <span className="font-medium text-ink">{m.senderName ?? t('admin.common.system')}</span>
                    <span className="mx-1.5 text-caption text-ink-3">{formatDate(m.createdAt, 'time')}</span>
                    <span className={m.deletedAt ? 'text-ink-3 line-through' : 'text-ink-2'}>{m.body}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {r.related.length > 0 && (
            <section>
              <h3 className="mb-1 text-small font-medium text-ink">{t('admin.reports.related', { count: r.related.length })}</h3>
              <ul className="flex flex-col divide-y divide-line">
                {r.related.map((x) => (
                  <li key={x.id} className="flex items-center gap-2 py-1.5 text-small">
                    <ReportStatusBadge status={x.status} />
                    <span className="text-ink">{t(`admin.reason.${x.reason}`)}</span>
                    <span className="truncate text-ink-3">{x.reporter?.name}</span>
                    <span className="ml-auto text-caption text-ink-3">{formatRelative(x.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {r.history.length > 0 && (
            <section>
              <h3 className="mb-1 text-small font-medium text-ink">{t('admin.reports.history')}</h3>
              <ul className="flex flex-col gap-1">
                {r.history.slice(0, 8).map((h) => (
                  <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 text-caption">
                    <code className="font-mono text-ink">{h.action}</code>
                    <span className="text-ink-2">{h.actor?.name ?? t('admin.common.system')}</span>
                    {h.reason && <span className="text-ink-3">— {h.reason}</span>}
                    <span className="ml-auto text-ink-3">{formatRelative(h.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {open && (
            <section aria-label={t('admin.reports.decide')} className="flex flex-col gap-3 border-t border-line pt-4">
              <Select size="md" label={t('admin.reports.action')} value={action} onChange={setAction} options={options} data-testid="report-action" />
              <div className="flex flex-wrap gap-2">
                <Button variant={action === 'ban_user' || action === 'remove' ? 'danger' : 'primary'} iconLeft={<Flag />} onClick={() => setDialog('action')} data-testid="report-apply">
                  {t('admin.reports.applyAction')}
                </Button>
                {r.status === 'open' && (
                  <Button variant="secondary" iconLeft={<Hand />} onClick={() => setDialog('claim')}>
                    {t('admin.reports.claim')}
                  </Button>
                )}
                <Button variant="ghost" iconLeft={<X />} onClick={() => setDialog('dismiss')}>
                  {t('admin.reports.dismiss')}
                </Button>
              </div>
            </section>
          )}
        </div>
      )}
      <ReasonDialog
        open={!!dialog}
        danger={dialog === 'action' && (action === 'ban_user' || action === 'remove')}
        title={dialog === 'action' ? t('admin.reports.confirmAction', { action: t(`admin.action.${action}`) }) : dialog === 'claim' ? t('admin.reports.confirmClaim') : t('admin.reports.confirmDismiss')}
        description={dialog === 'action' ? t(`admin.actionHint.${action}`) : dialog === 'dismiss' ? t('admin.reports.dismissHint') : undefined}
        confirmLabel={dialog === 'action' ? t('admin.common.confirm') : dialog === 'claim' ? t('admin.reports.claim') : t('admin.reports.dismiss')}
        presets={
          dialog === 'action'
            ? [...[...checks].map((c) => t(`admin.scam.${c}`)), t('admin.reason.preset.scam'), t('admin.reason.preset.spam')].slice(0, 5)
            : dialog === 'dismiss'
              ? [t('admin.reason.preset.noViolation'), t('admin.reason.preset.duplicate')]
              : [t('admin.reason.preset.reviewing')]
        }
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          if (dialog === 'action') await patch.mutateAsync({ status: 'actioned', action: { type: action, reason } });
          else if (dialog === 'claim') await patch.mutateAsync({ status: 'in_review', resolution: reason });
          else await patch.mutateAsync({ status: 'dismissed', resolution: reason });
          toast.success(t(`admin.reports.done.${dialog}`));
        }}
      />
    </Modal>
  );
}
