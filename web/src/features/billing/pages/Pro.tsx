// /pro — Landlord Pro: badge-gate state (not L3 / no landlord proof → steps), plan picker monthly/yearly with yearly savings,
// Founding promo, trial terms → checkout. Subscribed → dashboard: plan card, analytics (SVG line), lead inbox table with trust
// badges + status filter, invoices, cancel/resume, change plan.
import { useMemo, useState } from 'react';
import { ArrowRight, BarChart3, Check, CircleAlert, Download, Inbox, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Avatar, Badge, Button, Card, EmptyState, Modal, Pagination, SegmentedControl, Select, Skeleton, StatTile, Table, Tabs, TrustBadge, type Column } from '@/components';
import { Head } from '@/app/Head';
import { RequireAuth } from '@/app/guards';
import { errorMessage } from '@/app/errors';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { useCancelSubscription, useChangePlan, useLeadStatus, useProAnalytics, useProLeads, useResumeSubscription, useSubscribe, useSubscription, type LeadDto, type PlanDto, type SubscriptionData } from '../api';
import { FeatureList, LineChart, MoneyLine, OrderStatusBadge, TestModeBand, usePlanName } from '../components/shared';

export default function ProPage() {
  return <RequireAuth><Pro /></RequireAuth>;
}

function Pro() {
  const t = useT();
  const q = useSubscription();
  if (q.isLoading) return <div className="mx-auto w-full max-w-content px-4 lg:px-8"><Head title={t('billing.pro.title')} /><Skeleton variant="rect" height={320} /></div>;
  if (q.isError || !q.data) return <div className="mx-auto w-full max-w-content px-4 lg:px-8"><EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => q.refetch() }} /></div>;
  return q.data.subscription ? <ProDashboard data={q.data} /> : <ProLanding data={q.data} />;
}

// ---------------------------------------------------------------- landing / gate / plan picker
function ProLanding({ data }: { data: SubscriptionData }) {
  const t = useT();
  const navigate = useNavigate();
  const { formatMoney, isZh } = useLocale();
  const planName = usePlanName();
  const { user } = useAuth();
  const subscribe = useSubscribe();
  const [tier, setTier] = useState<'pro' | 'proplus'>('pro');
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [promo, setPromo] = useState('');
  const plan = data.plans.find((p) => p.key === `${tier}.${interval === 'month' ? 'monthly' : 'yearly'}`) ?? data.plans[0];
  const monthly = data.plans.find((p) => p.key === `${tier}.monthly`);
  const yearly = data.plans.find((p) => p.key === `${tier}.yearly`);
  const gateOk = data.gate.trustOk && data.gate.supplyProof;
  const trialAvailable = !data.gate.trialUsed;
  const start = async (trial: boolean) => {
    if (!plan) return;
    try {
      const r = await subscribe.mutateAsync({ planId: plan.id, trial, promoCode: promo.trim() || undefined });
      track(trial ? 'pro.trial_start' : 'pro.subscribe', { planKey: plan.key, promo: promo || null });
      navigate(r.order.status === 'fulfilled' ? `/billing/success?order=${r.order.id}` : `/checkout/${r.order.id}`);
    } catch (e) { toast.error(errorMessage(t, e)); }
  };
  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('billing.pro.title')} description={t('billing.pro.subtitle')} />
      <header className="pb-6 text-center">
        <Badge variant="pro" className="mb-2" />
        <h1 className="text-h1 text-ink sm:text-display">{t('billing.pro.headline')}</h1>
        <p className="mt-2 text-small text-ink-2">{t('billing.pro.subtitle')}</p>
      </header>
      {!gateOk && (
        <Card padding="lg" variant="sunken" className="mx-auto mb-6 max-w-form">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden />
            <div className="flex-1">
              <h2 className="text-h3 text-ink">{t('billing.pro.gate.title')}</h2>
              <p className="mt-1 text-small text-ink-2">{t('billing.pro.gate.description')}</p>
              <ol className="mt-3 flex flex-col gap-2">
                <GateStep done={data.gate.trustOk} label={t('billing.pro.gate.trust', { level: user?.trustLevel ?? 0 })} to="/verify" cta={t('billing.pro.gate.goVerify')} />
                <GateStep done={data.gate.supplyProof} label={t('billing.pro.gate.proof')} to="/verify" cta={t('billing.pro.gate.goProof')} />
              </ol>
              <p className="mt-3 text-caption text-ink-3">{t('billing.pro.gate.free')}</p>
            </div>
          </div>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl label={t('billing.pro.tier')} value={tier} onChange={(v) => setTier(v as 'pro' | 'proplus')} options={[{ value: 'pro', label: 'Pro' }, { value: 'proplus', label: 'Pro+' }]} size="sm" />
            <SegmentedControl label={t('billing.pro.interval')} value={interval} onChange={(v) => setInterval(v as 'month' | 'year')} options={[{ value: 'month', label: t('billing.pro.monthly') }, { value: 'year', label: t('billing.pro.yearly') }]} size="sm" />
            {monthly && yearly && <span className="text-caption text-success">{t('billing.pro.yearlySave', { amount: formatMoney(monthly.priceCents * 12 - yearly.priceCents) })}</span>}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <PlanColumn title={t('billing.pro.free.title')} price={t('billing.pro.free.price')} features={['billing.features.freeListings', 'billing.features.freeMessaging', 'billing.features.freeBadges']} muted current={!data.isPro} />
            {(['pro', 'proplus'] as const).map((k) => {
              const p = data.plans.find((x) => x.key === `${k}.${interval === 'month' ? 'monthly' : 'yearly'}`);
              if (!p) return null;
              return <PlanColumn key={k} title={k === 'pro' ? 'Landlord Pro' : 'Landlord Pro+'} price={`${formatMoney(p.priceCents)} ${interval === 'month' ? t('billing.pricing.pro.perMonth') : t('billing.pro.perYear')}`} features={p.features} selected={tier === k} onSelect={() => setTier(k)} />;
            })}
          </div>
          <Card padding="md" className="text-small text-ink-2">
            <h3 className="text-small font-semibold text-ink">{t('billing.pro.ranking.title')}</h3>
            <p>{t('billing.pro.ranking.body')}</p>
          </Card>
        </div>
        <aside className="flex flex-col gap-3">
          <Card padding="lg" variant="outline-accent" className="flex flex-col gap-3">
            <div className="text-caption text-ink-3">{t('billing.pro.selected')}</div>
            <div className="text-h3 text-ink">{planName(plan)}</div>
            <MoneyLine label={interval === 'month' ? t('billing.pro.monthly') : t('billing.pro.yearly')} cents={plan?.priceCents ?? 0} strong />
            {Date.parse('2027-02-28T23:59:59Z') > Date.now() && tier === 'pro' && interval === 'month' && (
              <label className="flex flex-col gap-1 text-caption text-ink-3">
                {t('billing.pro.founding', { date: isZh ? '2027 年 2 月 28 日' : 'Feb 28, 2027' })}
                <input value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder="FOUNDING50" className="h-9 rounded-ctl border border-line bg-surface px-3 text-small text-ink" aria-label={t('billing.promo.label')} />
              </label>
            )}
            {trialAvailable && <p className="text-caption text-ink-2">{t('billing.pro.trialTerms', { days: 14 })}{!data.gate.hasCard && ` ${t('billing.pro.trialCard')}`}</p>}
            <Button variant="primary" size="lg" disabled={!gateOk || !plan} loading={subscribe.isPending} onClick={() => start(trialAvailable && data.gate.hasCard)} iconRight={<ArrowRight />}>
              {trialAvailable && data.gate.hasCard ? t('billing.pro.startTrial') : t('billing.pro.subscribe')}
            </Button>
            {trialAvailable && data.gate.hasCard && <Button variant="ghost" size="sm" disabled={!gateOk} onClick={() => start(false)}>{t('billing.pro.skipTrial')}</Button>}
            {!gateOk && <p className="text-caption text-ink-3">{t('billing.pro.gate.locked')}</p>}
            <TestModeBand compact />
          </Card>
          <p className="text-caption text-ink-3">{t('billing.pro.cancelTerms')}</p>
        </aside>
      </div>
    </div>
  );
}

function GateStep({ done, label, to, cta }: { done: boolean; label: string; to: string; cta: string }) {
  return (
    <li className="flex items-center gap-3 text-small">
      <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-pill border', done ? 'border-success bg-success-soft text-success' : 'border-line-strong text-ink-3')}>{done ? <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> : <span className="size-1.5 rounded-pill bg-current" />}</span>
      <span className={cn('flex-1', done ? 'text-ink-3 line-through' : 'text-ink')}>{label}</span>
      {!done && <Button asChild variant="secondary" size="sm"><Link to={to}>{cta}</Link></Button>}
    </li>
  );
}

function PlanColumn({ title, price, features, selected, onSelect, muted, current }: { title: string; price: string; features: string[]; selected?: boolean; onSelect?: () => void; muted?: boolean; current?: boolean }) {
  const t = useT();
  return (
    <Card padding="lg" variant={selected ? 'outline-accent' : muted ? 'sunken' : 'default'} className={cn('flex flex-col gap-3', onSelect && 'cursor-pointer')} onClick={onSelect} as={onSelect ? 'button' : 'div'} {...(onSelect ? { type: 'button', 'aria-pressed': selected } : {})}>
      <div className="flex items-center justify-between"><h3 className="text-h3 text-ink">{title}</h3>{current && <Badge variant="neutral" size="sm">{t('billing.pro.current')}</Badge>}</div>
      <div className="text-price tnum text-ink">{price}</div>
      <FeatureList features={features} className="text-left" />
    </Card>
  );
}

// ---------------------------------------------------------------- dashboard
function ProDashboard({ data }: { data: SubscriptionData }) {
  const t = useT();
  const { formatMoney, formatDate } = useLocale();
  const planName = usePlanName();
  const sub = data.subscription!;
  const cancel = useCancelSubscription();
  const resume = useResumeSubscription();
  const changePlan = useChangePlan();
  const [tab, setTab] = useState<'overview' | 'leads' | 'billing'>('overview');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [planModal, setPlanModal] = useState(false);
  const endsSoon = sub.cancelAtPeriodEnd;
  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('billing.pro.dashboardTitle')} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="pro" />
          <h1 className="text-h1 text-ink">{t('billing.pro.dashboardTitle')}</h1>
          <Badge variant={sub.status === 'active' ? 'success' : sub.status === 'trialing' ? 'info' : 'warning'} size="sm">{t(`billing.subStatus.${sub.status}`)}</Badge>
        </div>
        <Tabs variant="pill" value={tab} onChange={setTab} label={t('billing.pro.dashboardTitle')} items={[{ key: 'overview', label: t('billing.pro.tab.overview'), icon: <BarChart3 /> }, { key: 'leads', label: t('billing.pro.tab.leads'), icon: <Inbox /> }, { key: 'billing', label: t('billing.pro.tab.billing') }]} />
      </div>
      {endsSoon && <p className="mb-4 rounded-sm bg-warning-soft px-3 py-2 text-small text-warning">{t('billing.pro.endsOn', { date: formatDate(sub.currentPeriodEnd) })} <button type="button" className="underline" onClick={() => resume.mutate(undefined, { onSuccess: () => toast.success(t('billing.pro.resumed')), onError: (e) => toast.error(errorMessage(t, e)) })}>{t('billing.pro.resume')}</button></p>}
      {sub.status === 'trialing' && sub.trialEndsAt && <p className="mb-4 rounded-sm bg-info-soft px-3 py-2 text-small text-info">{t('billing.pro.trialEnds', { date: formatDate(sub.trialEndsAt), amount: formatMoney(sub.plan.priceCents) })}</p>}
      {tab === 'overview' && <Overview data={data} />}
      {tab === 'leads' && <LeadInbox />}
      {tab === 'billing' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card padding="none">
            <div className="px-4 py-3"><h2 className="text-h3 text-ink">{t('billing.pro.invoices')}</h2></div>
            {data.invoices.length === 0 ? <EmptyState size="sm" title={t('billing.pro.noInvoices')} /> : (
              <ul className="divide-y divide-line border-t border-line">
                {data.invoices.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 px-4 py-3 text-small">
                    <div className="min-w-0 flex-1"><div className="truncate text-ink">{planName(o.plan)} · {t(`billing.orderKind.${o.kind}`)}</div><div className="text-caption text-ink-3">{formatDate(o.createdAt)} · {o.id.slice(0, 8)}</div></div>
                    <OrderStatusBadge status={o.status} />
                    <span className="tnum text-ink">{formatMoney(o.totalCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <aside className="flex flex-col gap-3">
            <Card padding="lg" className="flex flex-col gap-2">
              <div className="text-caption text-ink-3">{t('billing.pro.currentPlan')}</div>
              <div className="text-h3 text-ink">{planName(sub.plan)}</div>
              <MoneyLine label={sub.plan.interval === 'year' ? t('billing.pro.perYear') : t('billing.pricing.pro.perMonth')} cents={sub.plan.priceCents} />
              <p className="text-caption text-ink-3">{t('billing.pro.renewsOn', { date: formatDate(sub.currentPeriodEnd) })}{sub.paymentMethod ? ` · ${sub.paymentMethod.brand} •••• ${sub.paymentMethod.last4}` : ''}</p>
              <p className="text-caption text-ink-3">{t('billing.pro.seats', { n: sub.seats })}</p>
              <div className="mt-2 flex flex-col gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPlanModal(true)}>{t('billing.pro.changePlan')}</Button>
                {!endsSoon && <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(true)}>{t('billing.pro.cancel')}</Button>}
              </div>
            </Card>
            <TestModeBand compact />
          </aside>
        </div>
      )}
      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title={t('billing.pro.cancelTitle')} description={t('billing.pro.cancelDescription', { date: formatDate(sub.currentPeriodEnd) })} size="sm"
        footer={<><Button variant="ghost" onClick={() => setConfirmCancel(false)}>{t('billing.pro.keep')}</Button><Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate(undefined, { onSuccess: () => { setConfirmCancel(false); toast.success(t('billing.pro.cancelled')); }, onError: (e) => toast.error(errorMessage(t, e)) })}>{t('billing.pro.confirmCancel')}</Button></>}>
        <p className="text-small text-ink-2">{t('billing.pro.cancelKeeps')}</p>
      </Modal>
      <Modal open={planModal} onClose={() => setPlanModal(false)} title={t('billing.pro.changePlan')} size="sm">
        <ul className="flex flex-col gap-2">
          {data.plans.map((p: PlanDto) => (
            <li key={p.id}>
              <button type="button" disabled={p.id === sub.planId || changePlan.isPending} onClick={() => changePlan.mutate(p.id, { onSuccess: () => { setPlanModal(false); toast.success(t('billing.pro.planChanged')); }, onError: (e) => toast.error(errorMessage(t, e)) })} className={cn('flex w-full items-center justify-between rounded-card border px-3 py-2 text-left text-small', p.id === sub.planId ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface text-ink hover:border-line-strong')}>
                <span>{planName(p)}</span><span className="tnum">{formatMoney(p.priceCents)}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-caption text-ink-3">{t('billing.pro.changePlanNote')}</p>
      </Modal>
    </div>
  );
}

function Overview({ data }: { data: SubscriptionData }) {
  const t = useT();
  const { formatMoney, formatDate } = useLocale();
  const [days, setDays] = useState(30);
  const a = useProAnalytics(days, true);
  const an = a.data;
  const labels = useMemo(() => (an?.series ?? []).map((s) => formatDate(s.date, 'monthDay')), [an, formatDate]);
  const cols: Column<NonNullable<typeof an>['listings'][number]>[] = [
    { key: 'title', header: t('billing.pro.col.listing'), render: (r) => <Link to={`/listings/${r.id}`} className="flex items-center gap-2 text-ink hover:underline"><span className="truncate">{r.title}</span>{r.boosted && <Badge variant="boosted" size="sm" />}</Link> },
    { key: 'status', header: t('billing.pro.col.status'), render: (r) => <span className="text-ink-2">{t(`billing.listingStatus.${r.status}`)}</span>, width: 110, hideOnMobile: true },
    { key: 'views', header: t('billing.pro.col.views'), render: (r) => <span className="tnum">{r.views}</span>, align: 'right', width: 90 },
    { key: 'saves', header: t('billing.pro.col.saves'), render: (r) => <span className="tnum">{r.saves}</span>, align: 'right', width: 80, hideOnMobile: true },
    { key: 'leads', header: t('billing.pro.col.leads'), render: (r) => <span className="tnum">{r.leads}</span>, align: 'right', width: 80 },
    { key: 'rate', header: t('billing.pro.col.contactRate'), render: (r) => <span className="tnum">{r.contactRate}%</span>, align: 'right', width: 100, hideOnMobile: true },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t('billing.pro.stat.views')} value={an?.totals.views ?? 0} spark={an?.series.map((s) => s.views)} />
        <StatTile label={t('billing.pro.stat.leads')} value={an?.totals.leads ?? 0} spark={an?.series.map((s) => s.leads)} />
        <StatTile label={t('billing.pro.stat.active')} value={an?.totals.active ?? data.activeListings} hint={t('billing.pro.stat.unlimited')} />
        <StatTile label={t('billing.pro.stat.saves')} value={an?.totals.saves ?? 0} />
      </div>
      <Card padding="lg" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h3 text-ink">{t('billing.pro.chartTitle')}</h2>
          <SegmentedControl label={t('billing.pro.range')} size="sm" value={String(days)} onChange={(v) => setDays(Number(v))} options={[{ value: '7', label: t('billing.pro.days', { n: 7 }) }, { value: '30', label: t('billing.pro.days', { n: 30 }) }, { value: '90', label: t('billing.pro.days', { n: 90 }) }]} />
        </div>
        {a.isLoading ? <Skeleton variant="rect" height={160} /> : an && (
          <>
            <LineChart labels={labels} height={170} series={[{ key: 'views', label: t('billing.pro.stat.views'), values: an.series.map((s) => s.views), color: 'var(--color-accent)' }, { key: 'leads', label: t('billing.pro.stat.leads'), values: an.series.map((s) => s.leads), color: 'var(--color-ink-3)' }]} />
            <div className="flex flex-wrap gap-4 text-caption text-ink-3">
              <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-accent" />{t('billing.pro.stat.views')}</span>
              <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-ink-3" />{t('billing.pro.stat.leads')}</span>
              {an.topSources.length > 0 && <span>{t('billing.pro.sources')}: {an.topSources.map((s) => `${t(`billing.leadSource.${s.source}`)} ${s.count}`).join(' · ')}</span>}
            </div>
          </>
        )}
      </Card>
      <Card padding="none">
        <div className="flex items-center justify-between px-4 py-3"><h2 className="text-h3 text-ink">{t('billing.pro.listingsTitle')}</h2><Link to="/listings/mine" className="text-caption text-accent-text hover:underline">{t('common.viewAll')}</Link></div>
        <Table rows={an?.listings ?? []} columns={cols} rowKey="id" loading={a.isLoading} empty={<EmptyState size="sm" title={t('billing.pro.noListings')} action={<Button asChild variant="primary"><Link to="/post/listing">{t('common.publish')}</Link></Button>} />} />
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        <Card padding="md" className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden />
          <div className="text-small text-ink-2"><div className="font-semibold text-ink">{t('billing.pro.perk.boostCredit')}</div>{t('billing.pro.perk.boostCreditBody', { amount: formatMoney(data.subscription?.plan.key.startsWith('proplus') ? 5700 : 1900) })} <Link to="/billing/boosts" className="text-accent-text underline">{t('billing.boosts.title')}</Link></div>
        </Card>
        <Card padding="md" className="flex items-start gap-3">
          <Users className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden />
          <div className="text-small text-ink-2"><div className="font-semibold text-ink">{t('billing.pro.perk.seats')}</div>{t('billing.pro.perk.seatsBody', { n: data.subscription?.seats ?? 1 })}</div>
        </Card>
      </div>
    </div>
  );
}

function LeadInbox() {
  const t = useT();
  const { formatRelative } = useLocale();
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const q = useProLeads({ status: status || undefined, page }, true);
  const patch = useLeadStatus();
  const statuses = ['new', 'replied', 'qualified', 'closed', 'spam'];
  const cols: Column<LeadDto>[] = [
    { key: 'user', header: t('billing.pro.lead.user'), render: (r) => r.user ? <span className="flex items-center gap-2"><Avatar src={r.user.avatarUrl} name={r.user.name} size="sm" trustLevel={r.user.trustLevel} /><span className="min-w-0"><span className="block truncate text-small text-ink">{r.user.name}</span><TrustBadge level={r.user.trustLevel} size="card" /></span></span> : <span className="text-ink-3">—</span> },
    { key: 'listing', header: t('billing.pro.lead.listing'), render: (r) => r.listing ? <Link to={`/listings/${r.listing.id}`} className="truncate text-small text-ink hover:underline">{r.listing.title}</Link> : '—', hideOnMobile: true },
    { key: 'source', header: t('billing.pro.lead.source'), render: (r) => <span className="text-caption text-ink-2">{t(`billing.leadSource.${r.source}`)}</span>, width: 120, hideOnMobile: true },
    { key: 'last', header: t('billing.pro.lead.last'), render: (r) => <span className="line-clamp-1 text-caption text-ink-2">{r.conversation?.lastMessage ?? '—'}</span>, hideOnMobile: true },
    { key: 'created', header: t('billing.pro.lead.created'), render: (r) => <span className="text-caption text-ink-3">{formatRelative(r.createdAt)}</span>, width: 110 },
    { key: 'status', header: t('billing.pro.lead.status'), width: 150, render: (r) => <Select size="sm" aria-label={t('billing.pro.lead.status')} value={r.status} onChange={(v) => v && patch.mutate({ id: r.id, status: v }, { onError: (e) => toast.error(errorMessage(t, e)) })} options={statuses.map((s) => ({ value: s, label: t(`billing.leadStatus.${s}`) }))} /> },
    { key: 'chat', header: '', width: 90, render: (r) => r.conversationId ? <Button asChild size="sm" variant="secondary"><Link to={`/chat/${r.conversationId}`}>{t('billing.pro.lead.open')}</Link></Button> : null },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs variant="underline" scrollable value={status} onChange={(k) => { setStatus(k); setPage(1); }} label={t('billing.pro.lead.status')} items={[{ key: '', label: t('billing.pro.lead.all'), count: Object.values(q.data?.counts ?? {}).reduce((s, n) => s + n, 0) }, ...statuses.map((s) => ({ key: s, label: t(`billing.leadStatus.${s}`), count: q.data?.counts?.[s] ?? 0 }))]} />
        <Button asChild variant="ghost" size="sm" iconLeft={<Download />}><a href="/api/billing/pro/leads.csv">{t('billing.pro.lead.export')}</a></Button>
      </div>
      <p className="text-caption text-ink-3">{t('billing.pro.lead.privacy')}</p>
      <Card padding="none">
        <Table rows={q.data?.items ?? []} columns={cols} rowKey="id" loading={q.isLoading} empty={<EmptyState size="sm" icon={Inbox} title={t('billing.pro.lead.empty')} description={t('billing.pro.lead.emptyHint')} />} />
        {q.data && q.data.total > q.data.pageSize && <div className="px-4 py-3"><Pagination page={page} pageSize={q.data.pageSize} total={q.data.total} onChange={setPage} /></div>}
      </Card>
    </div>
  );
}
