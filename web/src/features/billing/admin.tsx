// Billing admin panel — mounted by the admin shell at /admin/revenue (default export). Revenue StatTiles + SVG line/bar charts
// (by day, per stream), checkout & Kit funnels, orders table with refunds, open Secure Payment disputes, partner clicks,
// sponsor leads. Every number comes from /api/billing/admin/* (API.md §11.7); every money value is cents.
import { useMemo, useState } from 'react';
import { CircleAlert, Gavel, RotateCcw, Search } from 'lucide-react';
import { Link } from 'react-router';
import { Badge, Button, Card, EmptyState, Input, Modal, Pagination, SegmentedControl, Select, Skeleton, StatTile, Table, Textarea, type Column } from '@/components';
import { errorMessage } from '@/app/errors';
import { useCampus } from '@/lib/campus';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { useAdminOrders, useAdminPartners, useAdminRefund, useAdminRevenue, type AdminOrder, type AdminPartner, type EscrowDto, type RevenuePoint } from './api';
import { BarChart, EscrowStatusBadge, LineChart, OrderStatusBadge, usePlanName } from './components/shared';

type SeriesKey = 'revenueCents' | 'boostCents' | 'proCents' | 'escrowFeeCents' | 'affiliateCents' | 'gmvCents';
const SERIES: SeriesKey[] = ['revenueCents', 'boostCents', 'proCents', 'escrowFeeCents', 'affiliateCents', 'gmvCents'];

function isoDay(offsetDays: number): string {
  return new Date(Date.now() - offsetDays * 86400_000).toISOString().slice(0, 10);
}

export default function BillingAdminPanel() {
  const t = useT();
  const { formatMoney, formatDate, formatNumber, formatPercent } = useLocale();
  const { campuses } = useCampus();
  const [range, setRange] = useState<'7' | '30' | '60' | '90'>('30');
  const [campusId, setCampusId] = useState<string>('');
  const [selected, setSelected] = useState<SeriesKey>('revenueCents');
  const params = useMemo(() => ({ from: isoDay(Number(range) - 1), to: isoDay(0), campusId: campusId || undefined, groupBy: Number(range) > 60 ? 'week' : 'day' }), [range, campusId]);
  const q = useAdminRevenue(params);
  const d = q.data;
  const labels = useMemo(() => (d?.series ?? []).map((p) => formatDate(p.date, 'monthDay')), [d, formatDate]);
  const half = (key: keyof RevenuePoint) => {
    const s = d?.series ?? [];
    const mid = Math.floor(s.length / 2);
    const a = s.slice(0, mid).reduce((x, p) => x + (p[key] as number), 0);
    const b = s.slice(mid).reduce((x, p) => x + (p[key] as number), 0);
    if (!a) return undefined;
    const pct = Math.round(((b - a) / a) * 1000) / 10;
    return { value: Math.abs(pct), direction: pct > 0 ? ('up' as const) : pct < 0 ? ('down' as const) : ('flat' as const) };
  };
  const tileValue: Record<SeriesKey, number> = {
    revenueCents: d?.totals.revenueCents ?? 0,
    boostCents: d?.totals.byKind.boost ?? 0,
    proCents: (d?.totals.byKind.subscription ?? 0) + (d?.totals.byKind.subscription_renewal ?? 0),
    escrowFeeCents: d?.totals.byKind.escrow_deposit ?? 0,
    affiliateCents: d?.totals.affiliateEstCents ?? 0,
    gmvCents: d?.totals.gmvCents ?? 0,
  };
  const checkout = d?.funnel.checkout;
  const kit = d?.funnel.kit;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-ink">{t('billing.admin.title')}</h1>
          <p className="text-small text-ink-2">{t('billing.admin.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select size="sm" aria-label={t('billing.admin.campus')} value={campusId} onChange={(v) => setCampusId(v ?? '')} options={[{ value: '', label: t('billing.admin.allCampuses') }, ...campuses.map((c) => ({ value: c.id, label: c.shortName }))]} searchable />
          <SegmentedControl label={t('billing.admin.range')} size="sm" value={range} onChange={(v) => setRange(v as typeof range)} options={(['7', '30', '60', '90'] as const).map((n) => ({ value: n, label: t('billing.pro.days', { n }) }))} />
        </div>
      </header>

      {q.isError && <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => q.refetch() }} />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {SERIES.map((k) => (
          <button key={k} type="button" className="rounded-card text-left" onClick={() => setSelected(k)} aria-pressed={selected === k}>
            <StatTile label={t(`billing.admin.series.${k}`)} value={tileValue[k]} format="money" selected={selected === k} delta={half(k)} spark={(d?.series ?? []).map((p) => p[k])} className="h-full" />
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card padding="lg" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-h3 text-ink">{t('billing.admin.chartTitle')}</h2>
            <span className="text-caption text-ink-3">{t(`billing.admin.series.${selected}`)} · {t(`billing.admin.groupBy.${params.groupBy}`)}</span>
          </div>
          {q.isLoading || !d ? <Skeleton variant="rect" height={200} /> : (
            <>
              <LineChart labels={labels} height={200} fill={false} formatValue={(v) => formatMoney(v, { compact: true })}
                series={[
                  ...(selected !== 'revenueCents' ? [{ key: 'revenueCents', label: t('billing.admin.series.revenueCents'), values: d.series.map((p) => p.revenueCents), color: 'var(--color-line-strong)', width: 1.5 }] : []),
                  { key: selected, label: t(`billing.admin.series.${selected}`), values: d.series.map((p) => p[selected]), color: selected === 'revenueCents' ? 'var(--color-ink)' : 'var(--color-accent)' },
                ]} />
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-3">
                <span>{t('billing.admin.orders', { n: formatNumber(d.totals.orders) })}</span>
                <span>{t('billing.admin.payingUsers', { n: formatNumber(d.totals.payingUsers) })}</span>
                <span>{t('billing.admin.refunds', { amount: formatMoney(d.totals.refundsCents) })}</span>
                <span>{t('billing.admin.walletContra', { amount: formatMoney(d.totals.walletContraCents) })}</span>
                <span>{t('billing.admin.affiliateRecognized', { amount: formatMoney(d.totals.affiliateRecognizedCents) })}</span>
              </div>
            </>
          )}
        </Card>
        <Card padding="lg" className="flex flex-col gap-3">
          <h2 className="text-h3 text-ink">{t('billing.admin.byKind')}</h2>
          {d ? (
            <BarChart height={180} formatValue={(v) => formatMoney(v, { compact: true })} data={[
              { label: t('billing.admin.kind.boost'), value: tileValue.boostCents, color: 'var(--color-accent)' },
              { label: t('billing.admin.kind.pro'), value: tileValue.proCents, color: 'var(--color-ink-2)' },
              { label: t('billing.admin.kind.escrow'), value: tileValue.escrowFeeCents, color: 'var(--color-success)' },
              { label: t('billing.admin.kind.affiliate'), value: tileValue.affiliateCents, color: 'var(--color-info)' },
            ]} />
          ) : <Skeleton variant="rect" height={180} />}
          {d && d.topCampuses.length > 0 && (
            <ul className="flex flex-col gap-1 border-t border-line pt-2 text-small">
              {d.topCampuses.map((c) => (
                <li key={c.campusId} className="flex justify-between gap-2"><span className="text-ink-2">{c.campus?.shortName ?? t('billing.admin.noCampus')}</span><span className="tnum text-ink">{formatMoney(c.revenueCents)}</span></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card padding="lg" className="flex flex-col gap-2">
          <h2 className="text-h3 text-ink">{t('billing.admin.checkoutFunnel')}</h2>
          {checkout ? <Funnel steps={[[t('billing.admin.funnel.start'), checkout.starts], [t('billing.admin.funnel.pay'), checkout.pays], [t('billing.admin.funnel.success'), checkout.successes]]} /> : <Skeleton variant="text" lines={3} />}
          {checkout && <p className="text-caption text-ink-3">{t('billing.admin.funnel.fails', { n: checkout.fails })}</p>}
        </Card>
        <Card padding="lg" className="flex flex-col gap-2">
          <h2 className="text-h3 text-ink">{t('billing.admin.kitFunnel')}</h2>
          {kit ? <Funnel steps={[[t('billing.admin.funnel.kitView'), kit.views], [t('billing.admin.funnel.click'), kit.clicks], [t('billing.admin.funnel.conversion'), kit.conversions]]} /> : <Skeleton variant="text" lines={3} />}
        </Card>
        <Card padding="lg" className="flex flex-col gap-2 text-small">
          <h2 className="text-h3 text-ink">{t('billing.admin.subsBoosts')}</h2>
          {d ? (
            <dl className="grid grid-cols-2 gap-2">
              <Metric label={t('billing.admin.mrr')} value={formatMoney(d.subscriptions.mrrCents)} />
              <Metric label={t('billing.admin.activeSubs')} value={`${d.subscriptions.active} · ${t('billing.admin.trialing', { n: d.subscriptions.trialing })}`} />
              <Metric label={t('billing.admin.activeBoosts')} value={formatNumber(d.boosts.active)} />
              <Metric label={t('billing.admin.boostCtr')} value={d.boosts.impressions30d ? formatPercent(d.boosts.clicks30d / d.boosts.impressions30d) : '—'} />
            </dl>
          ) : <Skeleton variant="text" lines={3} />}
        </Card>
      </div>

      <Disputes items={d?.disputes ?? []} loading={q.isLoading} />
      <OrdersTable />
      <PartnersTable />
      {d && d.sponsorLeads.length > 0 && (
        <Card padding="none">
          <div className="px-4 py-3"><h2 className="text-h3 text-ink">{t('billing.admin.sponsorLeads')}</h2></div>
          <ul className="divide-y divide-line border-t border-line">
            {d.sponsorLeads.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-small">
                <span className="min-w-0 flex-1"><span className="block truncate text-ink">{l.businessName}</span><span className="text-caption text-ink-3">{l.contact}</span></span>
                <Badge variant="neutral" size="sm">{t(l.interest === 'building' ? 'billing.pricing.biz.interestBuilding' : 'billing.pricing.biz.interestSponsor')}</Badge>
                <Badge variant={l.status === 'new' ? 'warning' : 'neutral'} size="sm">{t(`billing.admin.leadStatus.${l.status}`)}</Badge>
                <span className="text-caption text-ink-3">{formatDate(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-sm bg-sunken px-3 py-2"><dt className="text-caption text-ink-3">{label}</dt><dd className="tnum text-ink">{value}</dd></div>;
}

function Funnel({ steps }: { steps: [string, number][] }) {
  const { formatNumber, formatPercent } = useLocale();
  const max = Math.max(1, ...steps.map((s) => s[1]));
  return (
    <ol className="flex flex-col gap-2">
      {steps.map(([label, n], i) => (
        <li key={label} className="flex flex-col gap-1">
          <div className="flex justify-between text-caption"><span className="text-ink-2">{label}</span><span className="tnum text-ink">{formatNumber(n)}{i > 0 && steps[i - 1]![1] > 0 ? ` · ${formatPercent(n / steps[i - 1]![1])}` : ''}</span></div>
          <div className="h-2 rounded-pill bg-sunken"><div className={i === steps.length - 1 ? 'h-2 rounded-pill bg-accent' : 'h-2 rounded-pill bg-line-strong'} style={{ width: `${Math.max(2, (n / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ol>
  );
}

function Disputes({ items, loading }: { items: EscrowDto[]; loading: boolean }) {
  const t = useT();
  const { formatMoney, formatRelative } = useLocale();
  return (
    <Card padding="none">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><h2 className="text-h3 text-ink">{t('billing.admin.disputes')}</h2><span className="text-caption text-ink-3">{t('billing.admin.disputeSla')}</span></div>
      {loading ? <div className="px-4 pb-4"><Skeleton variant="row" /></div> : items.length === 0 ? <div className="border-t border-line"><EmptyState size="sm" icon={Gavel} title={t('billing.admin.noDisputes')} /></div> : (
        <ul className="divide-y divide-line border-t border-line">
          {items.map((e) => {
            const hours = e.disputedAt ? Math.round((Date.now() - Date.parse(e.disputedAt)) / 3600_000) : 0;
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-small">
                <EscrowStatusBadge status={e.status} />
                <span className="min-w-0 flex-1"><span className="block truncate text-ink">{e.listing?.title ?? e.id.slice(0, 8)}</span><span className="block truncate text-caption text-ink-3">{e.payer.name} → {e.payee.name}{e.disputeReasonCode ? ` · ${t(`billing.secure.disputeReasons.${e.disputeReasonCode}`)}` : ''}</span></span>
                <span className="tnum text-ink">{formatMoney(e.amountCents)}</span>
                <Badge variant={hours >= 48 ? 'danger' : 'warning'} size="sm">{t('billing.admin.slaLeft', { n: Math.max(0, 72 - hours) })}</Badge>
                <span className="text-caption text-ink-3">{e.disputedAt ? formatRelative(e.disputedAt) : ''}</span>
                <Button asChild size="sm" variant="secondary"><Link to={`/escrow/${e.id}`}>{t('billing.secure.action.resolve')}</Link></Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function OrdersTable() {
  const t = useT();
  const { formatMoney, formatDate } = useLocale();
  const planName = usePlanName();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useAdminOrders({ q: search.trim() || undefined, kind: kind || undefined, status: status || undefined, page });
  const [refundFor, setRefundFor] = useState<AdminOrder | null>(null);
  const cols: Column<AdminOrder>[] = [
    { key: 'created', header: t('billing.admin.col.date'), width: 110, render: (o) => <span className="text-caption tnum text-ink-2">{formatDate(o.createdAt)}</span> },
    { key: 'user', header: t('billing.admin.col.user'), render: (o) => <span className="block min-w-0"><span className="block truncate text-small text-ink">{o.user?.name ?? '—'}</span><span className="block truncate text-caption text-ink-3">{o.email}</span></span> },
    { key: 'item', header: t('billing.admin.col.item'), hideOnMobile: true, render: (o) => <span className="truncate text-small text-ink-2">{o.kind === 'escrow_deposit' ? t('billing.secure.title') : planName(o.plan)}</span> },
    { key: 'kind', header: t('billing.admin.col.kind'), width: 120, hideOnMobile: true, render: (o) => <span className="text-caption text-ink-2">{t(`billing.orderKind.${o.kind}`)}</span> },
    { key: 'status', header: t('billing.admin.col.status'), width: 110, render: (o) => <OrderStatusBadge status={o.status} /> },
    { key: 'total', header: t('billing.admin.col.total'), width: 110, align: 'right', render: (o) => <span className="tnum text-small text-ink">{formatMoney(o.totalCents)}{o.creditCents > 0 ? <span className="block text-caption text-ink-3">+{formatMoney(o.creditCents)} {t('billing.admin.credit')}</span> : null}</span> },
    { key: 'actions', header: '', width: 100, render: (o) => (o.status === 'fulfilled' || o.status === 'paid') ? <Button size="sm" variant="ghost" iconLeft={<RotateCcw />} onClick={() => setRefundFor(o)}>{t('billing.admin.refund')}</Button> : null },
  ];
  return (
    <Card padding="none">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <h2 className="mr-auto text-h3 text-ink">{t('billing.admin.ordersTitle')}</h2>
        <Input size="sm" iconLeft={<Search />} placeholder={t('billing.admin.searchOrders')} aria-label={t('billing.admin.searchOrders')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full sm:w-56" />
        <Select size="sm" aria-label={t('billing.admin.col.kind')} value={kind} onChange={(v) => { setKind(v ?? ''); setPage(1); }} options={[{ value: '', label: t('billing.admin.allKinds') }, ...['boost', 'subscription', 'subscription_renewal', 'escrow_deposit'].map((k) => ({ value: k, label: t(`billing.orderKind.${k}`) }))]} />
        <Select size="sm" aria-label={t('billing.admin.col.status')} value={status} onChange={(v) => { setStatus(v ?? ''); setPage(1); }} options={[{ value: '', label: t('billing.admin.allStatuses') }, ...['fulfilled', 'awaiting_payment', 'failed', 'refunded', 'cancelled'].map((k) => ({ value: k, label: t(`billing.orderStatus.${k}`) }))]} />
      </div>
      <Table rows={q.data?.items ?? []} columns={cols} rowKey="id" loading={q.isLoading} empty={<EmptyState size="sm" title={t('billing.admin.noOrders')} />} />
      {q.data && q.data.total > q.data.pageSize && <div className="px-4 py-3"><Pagination page={page} pageSize={q.data.pageSize} total={q.data.total} onChange={setPage} /></div>}
      {refundFor && <RefundModal order={refundFor} onClose={() => setRefundFor(null)} />}
    </Card>
  );
}

function RefundModal({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const t = useT();
  const { formatMoney } = useLocale();
  const refund = useAdminRefund();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const cents = amount ? Math.round(Number(amount) * 100) : undefined;
  const submit = async () => {
    try {
      await refund.mutateAsync({ id: order.id, amountCents: cents, reason: reason.trim() });
      toast.success(t('billing.admin.refunded'));
      onClose();
    } catch (e) { toast.error(errorMessage(t, e)); }
  };
  return (
    <Modal open onClose={onClose} title={t('billing.admin.refundTitle')} description={`${order.user?.name ?? ''} · ${formatMoney(order.totalCents + order.creditCents)}`} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" loading={refund.isPending} disabled={reason.trim().length < 3} onClick={submit}>{t('billing.admin.refund')}</Button></>}>
      <div className="flex flex-col gap-3">
        <Input label={t('billing.admin.refundAmount')} prefix="$" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} hint={t('billing.admin.refundAmountHint')} optional />
        <Textarea label={t('billing.admin.refundReason')} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required />
        <p className="text-caption text-ink-3">{t('billing.admin.refundNote')}</p>
      </div>
    </Modal>
  );
}

function PartnersTable() {
  const t = useT();
  const { formatMoney, isZh } = useLocale();
  const q = useAdminPartners();
  const rows = useMemo(() => [...(q.data ?? [])].sort((a, b) => b.clickCount - a.clickCount), [q.data]);
  const cols: Column<AdminPartner>[] = [
    { key: 'name', header: t('billing.admin.col.partner'), render: (p) => <span className="block min-w-0"><Link to={`/kit/${p.slug}`} className="block truncate text-small text-ink hover:underline">{isZh ? p.nameZh || p.name : p.name}</Link><span className="text-caption text-ink-3">{t(`billing.kit.category.${p.category}`)}{p.isSponsored ? '' : ` · ${t('billing.kit.nonSponsored')}`}</span></span> },
    { key: 'clicks', header: t('billing.admin.col.clicks'), width: 90, align: 'right', render: (p) => <span className="tnum">{p.clickCount}</span> },
    { key: 'conv', header: t('billing.admin.col.conversions'), width: 110, align: 'right', render: (p) => <span className="tnum">{p.conversions}</span> },
    { key: 'cr', header: t('billing.admin.col.cr'), width: 90, align: 'right', hideOnMobile: true, render: (p) => <span className="tnum">{p.clickCount ? `${Math.round((p.conversions / p.clickCount) * 1000) / 10}%` : '—'}</span> },
    { key: 'payout', header: t('billing.admin.col.payout'), width: 130, align: 'right', hideOnMobile: true, render: (p) => <span className="tnum text-ink-2">{formatMoney(p.payoutCents)} · {p.payoutModel.toUpperCase()}</span> },
    { key: 'status', header: '', width: 90, hideOnMobile: true, render: (p) => p.isActive ? null : <Badge variant="neutral" size="sm">{t('billing.admin.inactive')}</Badge> },
  ];
  return (
    <Card padding="none">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><h2 className="text-h3 text-ink">{t('billing.admin.partnersTitle')}</h2><span className="text-caption text-ink-3">{t('billing.admin.partnersNote')}</span></div>
      <Table rows={rows} columns={cols} rowKey="id" loading={q.isLoading} empty={<EmptyState size="sm" title={t('billing.admin.noPartners')} />} />
    </Card>
  );
}
