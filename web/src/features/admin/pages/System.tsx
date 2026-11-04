// /admin/system — 系统: health checks, DB, realtime, jobs, traffic, table sizes (GET /api/admin/health, refreshes every 30 s).
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Badge, Button, Skeleton, StatTile, Table } from '@/components';
import { useLocale, useT } from '@/lib/i18n';
import { Head } from '@/app/Head';
import { useHealth } from '../api';
import { ErrorState, PageTitle, Panel } from '../ui';

function bytes(n: number, locale: string): string {
  const mb = n / 1048576;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(mb)} MB`;
}

export default function System() {
  const t = useT();
  const { formatRelative, formatNumber, intl } = useLocale();
  const h = useHealth();
  const d = h.data;
  const uptime = (s: number) => (s < 3600 ? t('admin.age.minutes', { n: Math.round(s / 60) }) : s < 172800 ? t('admin.age.hours', { n: Math.round(s / 3600) }) : t('admin.age.days', { n: Math.round(s / 86400) }));
  return (
    <div className="flex flex-col gap-5">
      <Head title={t('admin.nav.system')} />
      <PageTitle
        title={t('admin.nav.system')}
        subtitle={d ? t('admin.system.subtitle', { version: d.version, env: d.env, node: d.node }) : undefined}
        actions={
          <Button variant="secondary" size="sm" iconLeft={<RefreshCw />} loading={h.isFetching} onClick={() => void h.refetch()}>
            {t('admin.system.refresh')}
          </Button>
        }
      />
      {h.isError ? (
        <ErrorState error={h.error} onRetry={() => void h.refetch()} />
      ) : !d ? (
        <Skeleton variant="rect" height={320} />
      ) : (
        <>
          <div role="status" data-testid="health-status" className={d.status === 'ok' ? 'flex items-center gap-2 rounded-card border border-line bg-success-soft px-4 py-3 text-success' : 'flex items-center gap-2 rounded-card border border-danger bg-danger-soft px-4 py-3 text-danger'}>
            {d.status === 'ok' ? <CheckCircle2 size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}
            <span className="text-small font-medium">{t(`admin.system.status.${d.status}`)}</span>
            <span className="ml-auto text-caption">{t('admin.system.checked', { time: formatRelative(d.serverTime) })}</span>
          </div>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label={t('admin.system.vitals')}>
            <StatTile label={t('admin.system.uptime')} value={d.uptimeSec} hint={uptime(d.uptimeSec)} />
            <StatTile label={t('admin.system.ws')} value={d.ws.clients} hint={t('admin.system.online', { n: d.ws.onlineUsers })} />
            <StatTile label={t('admin.system.events1h')} value={d.traffic.eventsLastHour} hint={t('admin.system.events24h', { n: formatNumber(d.traffic.eventsLast24h) })} />
            <StatTile label={t('admin.system.heap')} value={d.memory.heapUsedMb} hint={t('admin.system.rss', { n: d.memory.rssMb })} />
          </section>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title={t('admin.system.checks')}>
              <ul className="flex flex-col divide-y divide-line">
                {d.checks.map((c) => (
                  <li key={c.key} className="flex items-center gap-2 py-2">
                    {c.ok ? <CheckCircle2 size={16} className="text-success" aria-hidden /> : <AlertTriangle size={16} className="text-danger" aria-hidden />}
                    <span className="text-small text-ink">{t(`admin.system.check.${c.key}`)}</span>
                    <span className="sr-only">{c.ok ? t('admin.system.pass') : t('admin.system.fail')}</span>
                    <span className="ml-auto text-caption text-ink-2">{c.detail}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title={t('admin.system.database')}>
              <dl className="grid grid-cols-2 gap-3 text-small">
                <div>
                  <dt className="text-caption text-ink-3">{t('admin.system.dbFile')}</dt>
                  <dd className="break-all text-ink">{d.db.path}</dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-3">{t('admin.system.dbSize')}</dt>
                  <dd className="text-ink">{bytes(d.db.sizeBytes, intl)} · WAL {bytes(d.db.walBytes, intl)}</dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-3">{t('admin.system.latency')}</dt>
                  <dd className="text-ink">{d.db.latencyMs} ms</dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-3">{t('admin.system.migrations')}</dt>
                  <dd className="flex flex-wrap gap-1">{d.db.migrations.length ? d.db.migrations.map((m) => <Badge key={m} size="sm">{m}</Badge>) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-3">{t('admin.system.lastEvent')}</dt>
                  <dd className="text-ink">{d.traffic.lastEventAt ? formatRelative(d.traffic.lastEventAt) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-3">{t('admin.system.writes24h')}</dt>
                  <dd className="text-ink">{t('admin.system.writesValue', { audit: d.traffic.auditLast24h, notes: d.traffic.notificationsLast24h })}</dd>
                </div>
              </dl>
            </Panel>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title={t('admin.system.jobs')} bodyClassName="p-0">
              <Table
                rows={d.jobs}
                rowKey="name"
                caption={t('admin.system.jobs')}
                className="[&>div]:rounded-none [&>div]:border-0"
                empty={<p className="p-6 text-center text-small text-ink-3">{t('admin.system.noJobs')}</p>}
                columns={[
                  { key: 'name', header: t('admin.system.job'), render: (j) => <code className="font-mono text-caption text-ink">{j.name}</code> },
                  { key: 'every', header: t('admin.system.every'), align: 'right', render: (j) => t('admin.age.minutes', { n: Math.round(j.everyMs / 60000) }) },
                  { key: 'last', header: t('admin.system.lastRun'), render: (j) => (j.lastRunAt ? formatRelative(j.lastRunAt) : '—') },
                  { key: 'state', header: t('admin.users.status'), render: (j) => (j.lastError ? <Badge size="sm" variant="danger">{t('admin.system.fail')}</Badge> : <Badge size="sm" variant="success">{t('admin.system.pass')}</Badge>) },
                ]}
              />
            </Panel>
            <Panel title={t('admin.system.tables')} bodyClassName="p-0">
              <Table
                rows={d.tables}
                rowKey="name"
                caption={t('admin.system.tables')}
                className="[&>div]:rounded-none [&>div]:border-0"
                columns={[
                  { key: 'name', header: t('admin.system.table'), render: (r) => <code className="font-mono text-caption text-ink">{r.name}</code> },
                  { key: 'rows', header: t('admin.system.rows'), align: 'right', render: (r) => formatNumber(r.rows) },
                ]}
              />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
