// /admin/revenue — 营收: revenue by stream (small multiples, one hue), GMV + take rate, revenue trend, then the billing
// module's own admin panel (orders, refunds, Secure Payment disputes, plans, promos, partners).
import { useState } from 'react';
import { SegmentedControl, Skeleton, StatTile } from '@/components';
import { useLocale, useT } from '@/lib/i18n';
import { Head } from '@/app/Head';
import { useKpis } from '../api';
import { BarList, MiniColumns } from '../charts';
import { ErrorState, ExportLink, PageTitle, Panel, useAdminFilters } from '../ui';
import { RangeControls, TrendPanel } from './Overview';
import { ModuleSection } from './ModulePanels';

const STREAMS = [
  { key: 'boost', series: 'boostCents' },
  { key: 'pro', series: 'proCents' },
  { key: 'escrowFee', series: 'escrowFeeCents' },
  { key: 'affiliate', series: 'affiliateCents' },
] as const;

export default function Revenue() {
  const t = useT();
  const { formatMoney, formatPercent } = useLocale();
  const f = useAdminFilters();
  const [groupBy, setGroupBy] = useState<'day' | 'week'>('day');
  const [section, setSection] = useState<'kpis' | 'billing'>('kpis');
  const kpis = useKpis({ from: f.from, to: f.to, campusId: f.campusId, groupBy });
  const k = kpis.data;
  const total = k?.totals.revenueCents ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Head title={t('admin.nav.revenue')} />
      <PageTitle
        title={t('admin.nav.revenue')}
        subtitle={t('admin.revenue.subtitle')}
        actions={
          <>
            <RangeControls />
            <ExportLink table="orders" query={{ from: f.from, to: f.to, campusId: f.campusId }} />
          </>
        }
      />
      <SegmentedControl<'kpis' | 'billing'>
        label={t('admin.revenue.section')}
        value={section}
        onChange={setSection}
        options={[
          { value: 'kpis', label: t('admin.revenue.kpis') },
          { value: 'billing', label: t('admin.revenue.operations') },
        ]}
      />
      {section === 'billing' ? (
        <ModuleSection moduleKey="billing" navKey="revenue" />
      ) : kpis.isError ? (
        <ErrorState error={kpis.error} onRetry={() => void kpis.refetch()} />
      ) : !k ? (
        <Skeleton variant="rect" height={360} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label={t('admin.revenue.totals')}>
            <StatTile label={t('admin.metric.revenueCents')} value={total} format="money" selected hint={t('admin.def.revenueCents')} spark={k.series.map((p) => p.revenueCents)} />
            <StatTile label={t('admin.metric.gmvCents')} value={k.totals.gmvCents} format="money" hint={t('admin.def.gmvCents')} />
            <StatTile label={t('admin.metric.takeRate')} value={k.totals.takeRate ?? 0} format="percent" hint={t('admin.def.takeRate')} />
            <StatTile label={t('admin.metric.revenuePerMau')} value={k.totals.mau ? Math.round(total / k.totals.mau) : 0} format="money" hint={t('admin.def.revenuePerMau')} />
          </section>

          <Panel title={t('admin.revenue.byStream')} hint={t('admin.def.byStream')} id="streams-h">
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="revenue-streams">
              {STREAMS.map((s) => {
                const v = k.totals.byStream[s.key];
                return (
                  <li key={s.key} className="flex flex-col gap-2 rounded-card border border-line p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-small text-ink-2">{t(`admin.stream.${s.key}`)}</span>
                      <span className="text-caption tabular-nums text-ink-3">{total ? formatPercent(v / total) : '—'}</span>
                    </div>
                    <span className="text-price tabular-nums text-ink">{formatMoney(v)}</span>
                    <MiniColumns values={k.series.map((p) => p[s.series])} label={t('admin.revenue.streamSeries', { stream: t(`admin.stream.${s.key}`) })} />
                  </li>
                );
              })}
            </ul>
          </Panel>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <TrendPanel series={k.series} groupBy={groupBy} onGroupBy={setGroupBy} initial="revenueCents" keys={['revenueCents', 'boostCents', 'proCents', 'escrowFeeCents', 'affiliateCents', 'gmvCents']} />
            <Panel title={t('admin.revenue.byCampus')} hint={t('admin.campusBoard.hint')}>
              <BarList
                format={(n) => formatMoney(n)}
                emptyLabel={t('admin.common.noData')}
                highlight={f.campusId}
                rows={k.byCampus.filter((c) => c.revenueCents > 0).slice(0, 8).map((c) => ({ key: c.campus.id, label: c.campus.shortName, value: c.revenueCents, sub: c.campus.state }))}
              />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
