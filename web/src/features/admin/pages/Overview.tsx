// /admin — 概览: today's tiles with 7-day deltas, SLA strip, trend chart, funnels, campus leaderboard, partners, recent events.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, CheckCircle2, Clock, Table2, TrendingUp } from 'lucide-react';
import type { KpiKey, KpiPoint, SlaItem } from '@shared/schemas/admin';
import { Badge, Button, SegmentedControl, Skeleton, StatTile, Table, Tabs } from '@/components';
import { useLocale, useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { Head } from '@/app/Head';
import { useEvents, useKpis, useOverview } from '../api';
import { BarList, Funnel, LineChart } from '../charts';
import { CampusFilter, ErrorState, ExportLink, PageTitle, Panel, useAdminFilters, useAge, type RangeKey } from '../ui';

const TILE_KEYS: { key: KpiKey; format?: 'money'; invert?: boolean; spark?: 'dau' | 'listingsPublished' | 'revenueCents' | 'signups' }[] = [
  { key: 'dau', spark: 'dau' },
  { key: 'signups', spark: 'signups' },
  { key: 'listingsPublished', spark: 'listingsPublished' },
  { key: 'matches' },
  { key: 'messages' },
  { key: 'revenueCents', format: 'money', spark: 'revenueCents' },
  { key: 'openReports', invert: true },
  { key: 'pendingVerifications', invert: true },
  { key: 'disputedEscrows', invert: true },
];

export const SERIES_KEYS = ['dau', 'wau', 'visitors', 'signups', 'listingsActive', 'listingsPublished', 'matches', 'messages', 'revenueCents', 'gmvCents', 'affiliateClicks'] as const;
export type SeriesKey = (typeof SERIES_KEYS)[number];
export const MONEY_SERIES = new Set<string>(['revenueCents', 'gmvCents', 'boostCents', 'proCents', 'escrowFeeCents', 'affiliateCents']);

export function RangeControls() {
  const t = useT();
  const f = useAdminFilters();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CampusFilter value={f.campusId} onChange={f.setCampus} className="w-[220px]" />
      <SegmentedControl<RangeKey>
        size="sm"
        label={t('admin.filters.range')}
        value={(f.range === 'custom' ? '30d' : f.range) as RangeKey}
        onChange={f.setRange}
        options={[
          { value: '7d', label: t('admin.filters.d7') },
          { value: '30d', label: t('admin.filters.d30') },
          { value: '90d', label: t('admin.filters.d90') },
        ]}
      />
    </div>
  );
}

export function SlaStrip({ items }: { items: SlaItem[] }) {
  const t = useT();
  const age = useAge();
  const link: Record<SlaItem['key'], string> = { verifications: '/admin/verify', reports: '/admin/reports', disputes: '/admin/revenue', campusRequests: '/admin/campuses?tab=requests' };
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('admin.sla.title')} data-testid="sla-strip">
      {items.map((s) => {
        const Icon = s.status === 'ok' ? CheckCircle2 : s.status === 'warn' ? Clock : AlertTriangle;
        return (
          <li key={s.key}>
            <Link
              to={link[s.key]}
              data-sla={s.key}
              data-status={s.status}
              className={cn(
                'flex items-center gap-3 rounded-card border px-3 py-2.5 transition-colors duration-token-fast hover:border-line-strong',
                s.status === 'breach' ? 'border-danger bg-danger-soft' : s.status === 'warn' ? 'border-line bg-warning-soft' : 'border-line bg-surface',
              )}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden className={s.status === 'breach' ? 'text-danger' : s.status === 'warn' ? 'text-warning' : 'text-success'} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-medium text-ink">{t(`admin.sla.${s.key}`)}</p>
                <p className="truncate text-caption text-ink-2">
                  {s.count ? t('admin.sla.detail', { count: s.count, age: age(s.oldestHours) }) : t('admin.sla.clear')} · {t('admin.sla.target', { h: s.targetHours })}
                </p>
              </div>
              <span className="sr-only">{t(`admin.sla.status.${s.status}`)}</span>
              <Badge size="sm" variant={s.status === 'breach' ? 'danger' : s.status === 'warn' ? 'warning' : 'success'}>
                {t(`admin.sla.status.${s.status}`)}
              </Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function useSeriesFormat() {
  const { formatMoney, formatNumber } = useLocale();
  return (key: string) => (v: number) => (MONEY_SERIES.has(key) ? formatMoney(v, { compact: v >= 100000 }) : formatNumber(Math.round(v)));
}

export function TrendPanel({ series, groupBy, onGroupBy, initial = 'dau', keys = SERIES_KEYS as readonly string[] }: { series: KpiPoint[]; groupBy: 'day' | 'week'; onGroupBy: (g: 'day' | 'week') => void; initial?: string; keys?: readonly string[] }) {
  const t = useT();
  const { formatDate } = useLocale();
  const fmt = useSeriesFormat();
  const [metric, setMetric] = useState<string>(initial);
  const [table, setTable] = useState(false);
  const points = series.map((p) => ({ date: p.date, value: Number((p as unknown as Record<string, number>)[metric] ?? 0) }));
  return (
    <Panel
      title={t('admin.trend.title')}
      hint={t(`admin.def.${metric}`)}
      actions={
        <>
          <SegmentedControl<'day' | 'week'>
            size="sm"
            label={t('admin.trend.groupBy')}
            value={groupBy}
            onChange={onGroupBy}
            options={[
              { value: 'day', label: t('admin.trend.day') },
              { value: 'week', label: t('admin.trend.week') },
            ]}
          />
          <Button variant="ghost" size="sm" iconLeft={table ? <TrendingUp /> : <Table2 />} onClick={() => setTable((v) => !v)} aria-pressed={table}>
            {table ? t('admin.trend.chart') : t('admin.trend.table')}
          </Button>
        </>
      }
    >
      <Tabs<string> variant="underline" scrollable label={t('admin.trend.metric')} value={metric} onChange={setMetric} items={keys.map((k) => ({ key: k, label: t(`admin.metric.${k}`) }))} className="mb-4" />
      <LineChart points={points} format={fmt(metric)} label={t(`admin.metric.${metric}`)} dateLabel={(d) => formatDate(d, 'monthDay')} showTable={table} />
    </Panel>
  );
}

export default function Overview() {
  const t = useT();
  const { formatMoney, formatNumber, formatPercent, formatRelative, formatDate, isZh } = useLocale();
  const f = useAdminFilters();
  const [groupBy, setGroupBy] = useState<'day' | 'week'>('day');
  const overview = useOverview(f.campusId);
  const kpis = useKpis({ from: f.from, to: f.to, campusId: f.campusId, groupBy });
  const events = useEvents({ pageSize: 8, campusId: f.campusId });
  const [funnel, setFunnel] = useState<'listing' | 'checkout' | 'verification'>('listing');
  const o = overview.data;
  const k = kpis.data;

  const sparkOf = (key?: 'dau' | 'listingsPublished' | 'revenueCents' | 'signups') => (key && o ? o.spark30.slice(-14).map((p) => p[key]) : undefined);
  const statusRows = useMemo(() => {
    if (!k) return [];
    const sc = k.totals.statusCounts;
    return [
      { key: 'listings', counts: sc.listings, live: (sc.listings.active ?? 0) },
      { key: 'wanted', counts: sc.wanted, live: sc.wanted.active ?? 0 },
      { key: 'items', counts: sc.items, live: (sc.items.active ?? 0) + (sc.items.reserved ?? 0) },
      { key: 'buddy', counts: sc.buddy, live: (sc.buddy.open ?? 0) + (sc.buddy.full ?? 0) },
    ];
  }, [k]);

  return (
    <div className="flex flex-col gap-6">
      <Head title={t('admin.nav.overview')} />
      <PageTitle
        title={t('admin.nav.overview')}
        subtitle={o ? t('admin.overview.subtitle', { date: formatDate(o.date, 'long') }) : undefined}
        actions={<RangeControls />}
      />

      {overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      ) : (
        <section aria-labelledby="today-h" className="flex flex-col gap-3">
          <h2 id="today-h" className="sr-only">
            {t('admin.overview.today')}
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-9">
            {TILE_KEYS.map((tk) =>
              o ? (
                <StatTile
                  key={tk.key}
                  data-testid={`tile-${tk.key}`}
                  label={t(`admin.kpi.${tk.key}`)}
                  value={o.today[tk.key]}
                  format={tk.format ?? 'number'}
                  invertDelta={tk.invert}
                  spark={sparkOf(tk.spark)}
                  hint={t(`admin.def.${tk.key}`)}
                  delta={o.deltas7d[tk.key] === null ? undefined : { value: Math.abs(o.deltas7d[tk.key]!), direction: o.deltas7d[tk.key]! > 0 ? 'up' : o.deltas7d[tk.key]! < 0 ? 'down' : 'flat' }}
                />
              ) : (
                <Skeleton key={tk.key} variant="rect" height={104} />
              ),
            )}
          </div>
          {o ? <SlaStrip items={o.sla} /> : <Skeleton variant="rect" height={56} />}
          {o && o.revenueAtRiskCents > 0 && (
            <p className="flex items-center gap-2 text-small text-ink-2">
              <AlertTriangle size={16} strokeWidth={1.75} className="text-warning" aria-hidden />
              {t('admin.overview.atRisk', { amount: formatMoney(o.revenueAtRiskCents) })}
            </p>
          )}
        </section>
      )}

      {kpis.isError ? (
        <ErrorState error={kpis.error} onRetry={() => void kpis.refetch()} />
      ) : !k ? (
        <Skeleton variant="rect" height={320} />
      ) : (
        <>
          <section aria-label={t('admin.overview.rangeTotals')} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label={t('admin.metric.mau')} value={k.totals.mau} hint={t('admin.def.mau')} />
            <StatTile label={t('admin.metric.revenueCents')} value={k.totals.revenueCents} format="money" hint={t('admin.def.revenueCents')} selected />
            <StatTile label={t('admin.metric.gmvCents')} value={k.totals.gmvCents} format="money" hint={t('admin.def.gmvCents')} />
            <StatTile label={t('admin.metric.takeRate')} value={k.totals.takeRate ?? 0} format="percent" hint={t('admin.def.takeRate')} />
            <StatTile label={t('admin.metric.listingsPublished')} value={k.totals.listingsPublished} hint={t('admin.def.listingsPublished')} />
            <StatTile label={t('admin.metric.affiliateClicks')} value={k.totals.affiliateClicks} hint={t('admin.def.affiliateClicks')} />
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <TrendPanel series={k.series} groupBy={groupBy} onGroupBy={setGroupBy} />
            <Panel title={t('admin.funnel.title')} hint={t(`admin.def.funnel.${funnel}`)}>
              <Tabs<'listing' | 'checkout' | 'verification'>
                variant="pill"
                label={t('admin.funnel.title')}
                value={funnel}
                onChange={setFunnel}
                items={[
                  { key: 'listing', label: t('admin.funnel.listing') },
                  { key: 'checkout', label: t('admin.funnel.checkout') },
                  { key: 'verification', label: t('admin.funnel.verification') },
                ]}
                className="mb-4"
              />
              <Funnel label={t(`admin.funnel.${funnel}`)} steps={k.funnels[funnel].map((s) => ({ key: s.key, label: t(`admin.funnel.step.${s.key}`), count: s.count }))} />
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Panel
              title={t('admin.campusBoard.title')}
              hint={t('admin.campusBoard.hint')}
              bodyClassName="p-0 md:p-0"
              actions={<ExportLink table="listings" query={{ campusId: f.campusId }} />}
            >
              <Table
                rows={k.byCampus}
                rowKey={(r) => r.campus.id}
                caption={t('admin.campusBoard.title')}
                className="[&>div]:rounded-none [&>div]:border-0"
                empty={<p className="p-6 text-center text-small text-ink-3">{t('admin.common.noData')}</p>}
                columns={[
                  {
                    key: 'campus',
                    header: t('admin.col.campus'),
                    render: (r) => (
                      <span className={cn('text-ink', r.campus.id === f.campusId && 'font-semibold')}>
                        {r.campus.shortName} <span className="text-caption text-ink-3">{r.campus.state}</span>
                      </span>
                    ),
                  },
                  { key: 'mau', header: t('admin.metric.mau'), align: 'right', render: (r) => formatNumber(r.mau) },
                  { key: 'signups', header: t('admin.metric.signups'), align: 'right', render: (r) => formatNumber(r.signups), hideOnMobile: true },
                  { key: 'listingsActive', header: t('admin.metric.listingsActive'), align: 'right', render: (r) => formatNumber(r.listingsActive) },
                  { key: 'itemsActive', header: t('admin.metric.itemsActive'), align: 'right', render: (r) => formatNumber(r.itemsActive), hideOnMobile: true },
                  { key: 'buddyOpen', header: t('admin.metric.buddyOpen'), align: 'right', render: (r) => formatNumber(r.buddyOpen), hideOnMobile: true },
                  { key: 'revenueCents', header: t('admin.metric.revenueCents'), align: 'right', render: (r) => formatMoney(r.revenueCents) },
                  { key: 'rpm', header: t('admin.metric.revenuePerMau'), align: 'right', render: (r) => formatMoney(r.revenuePerMauCents), hideOnMobile: true },
                ]}
              />
            </Panel>
            <div className="flex flex-col gap-4">
              <Panel title={t('admin.partners.title')} hint={t('admin.def.affiliateClicks')}>
                <BarList
                  format={(n) => formatNumber(n)}
                  emptyLabel={t('admin.common.noData')}
                  rows={k.topPartners.map((p) => ({ key: p.partnerId, label: isZh && p.nameZh ? p.nameZh : p.name, value: p.clicks, sub: formatMoney(p.estCents) }))}
                />
              </Panel>
              <Panel title={t('admin.content.title')} hint={t('admin.content.hint')}>
                <ul className="flex flex-col divide-y divide-line">
                  {statusRows.map((r) => {
                    const total = Object.values(r.counts).reduce((s, v) => s + v, 0);
                    return (
                      <li key={r.key} className="flex items-center justify-between gap-3 py-2">
                        <span className="text-small text-ink">{t(`admin.content.${r.key}`)}</span>
                        <span className="text-small tabular-nums text-ink-2">
                          {t('admin.content.liveOf', { live: formatNumber(r.live), total: formatNumber(total) })}
                          {total > 0 && <span className="ml-1.5 text-caption text-ink-3">({formatPercent(r.live / total)})</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </div>
          </div>
        </>
      )}

      <Panel
        title={t('admin.events.recent')}
        bodyClassName="p-0"
        actions={
          <Link to="/admin/audit?tab=events" className="text-small text-accent-text hover:underline">
            {t('admin.common.viewAll')}
          </Link>
        }
      >
        <Table
          rows={events.data?.items ?? []}
          loading={events.isLoading}
          rowKey="id"
          caption={t('admin.events.recent')}
          className="[&>div]:rounded-none [&>div]:border-0"
          columns={[
            { key: 'createdAt', header: t('admin.col.time'), width: 140, render: (r) => <span className="text-ink-2">{formatRelative(r.createdAt)}</span> },
            { key: 'type', header: t('admin.col.type'), render: (r) => <code className="font-mono text-caption text-ink">{r.type}</code> },
            { key: 'user', header: t('admin.col.user'), render: (r) => (r.user ? r.user.name : <span className="text-ink-3">{t('admin.events.anonymous')}</span>) },
            { key: 'campus', header: t('admin.col.campus'), hideOnMobile: true, render: (r) => r.campus?.shortName ?? '—' },
            { key: 'entity', header: t('admin.col.entity'), hideOnMobile: true, render: (r) => (r.entityType ? <span className="text-caption text-ink-2">{r.entityType}</span> : r.path ?? '—') },
          ]}
        />
      </Panel>
    </div>
  );
}
