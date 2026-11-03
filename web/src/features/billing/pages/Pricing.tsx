// /pricing — DESIGN §7.13: display 「免费发布，按需加速。」, Students / Landlords / Businesses tabs, three cards
// (Boost · Landlord Pro · Secure Payment), "always free" box, FAQ accordion. `?boost=listing:<id>` opens the BoostSheet.
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, Building2, ChevronDown, Gift, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Badge, Button, Card, EmptyState, Input, Select, Skeleton, Tabs, Textarea } from '@/components';
import { Head } from '@/app/Head';
import { errorMessage } from '@/app/errors';
import { useAuth } from '@/lib/auth';
import { useCampus } from '@/lib/campus';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { usePricing, useSponsorLead, useSubscription, useWallet, type PlanDto } from '../api';
import { BoostSheet } from '../components/BoostSheet';
import { FeatureList, TestModeBand, durationLabel, tierLabel, usePlanName } from '../components/shared';

type Tab = 'students' | 'landlords' | 'businesses';

export default function PricingPage() {
  const t = useT();
  const { formatMoney, isZh } = useLocale();
  const planName = usePlanName();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { status, user } = useAuth();
  const { campus } = useCampus();
  const q = usePricing();
  const wallet = useWallet(1, status === 'authed');
  const sub = useSubscription(status === 'authed');
  const tab = (params.get('tab') as Tab) || (user?.role === 'landlord' ? 'landlords' : 'students');
  const setTab = (k: Tab) => { const p = new URLSearchParams(params); p.set('tab', k); setParams(p, { replace: true }); track('pricing.view', { tab: k }); };
  const boostParam = params.get('boost');
  const boostTarget = useMemo(() => {
    if (!boostParam) return null;
    const [type, id] = boostParam.split(':');
    return type && id && ['listing', 'market_item', 'buddy_post'].includes(type) ? { type: type as 'listing' | 'market_item' | 'buddy_post', id } : null;
  }, [boostParam]);
  const closeBoost = () => { const p = new URLSearchParams(params); p.delete('boost'); setParams(p, { replace: true }); };
  const [entity, setEntity] = useState<'listing' | 'market_item' | 'buddy_post'>('listing');
  useEffect(() => { track('pricing.view', { tab, campusId: campus?.id ?? null }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const data = q.data;
  const boostGroup = data?.boosts.find((b) => b.entityType === entity) ?? data?.boosts[0];
  const cheapest = (plans: PlanDto[]) => plans.reduce<PlanDto | null>((m, p) => (!m || p.priceCents < m.priceCents ? p : m), null);
  const proMonthly = data?.pro.find((p) => p.key === 'pro.monthly');
  const proYearly = data?.pro.find((p) => p.key === 'pro.yearly');
  const plusMonthly = data?.pro.find((p) => p.key === 'proplus.monthly');
  const foundingOpen = data ? Date.parse(data.foundingUntil) > Date.now() : false;

  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('billing.pricing.title')} description={t('billing.pricing.tagline')} />
      <header className="pt-2 pb-6 text-center lg:pt-6">
        <h1 className="text-display text-ink">{t('billing.pricing.headline')}</h1>
        <p className="mt-2 text-small text-ink-2">{t('billing.pricing.tagline')}</p>
        {status === 'authed' && wallet.data && wallet.data.balanceCents > 0 && (
          <div className="mt-3 inline-flex items-center gap-2">
            <Badge variant="neutral" icon={<Wallet />}>{t('billing.pricing.walletBalance', { amount: formatMoney(wallet.data.balanceCents) })}</Badge>
            <Link to="/wallet" className="text-caption text-accent-text underline">{t('billing.wallet.title')}</Link>
          </div>
        )}
      </header>
      <div className="mb-6 flex justify-center">
        <Tabs variant="pill" value={tab} onChange={setTab} label={t('billing.pricing.audience')} items={[{ key: 'students', label: t('billing.pricing.tab.students') }, { key: 'landlords', label: t('billing.pricing.tab.landlords') }, { key: 'businesses', label: t('billing.pricing.tab.businesses') }]} />
      </div>

      {q.isLoading && <div className="grid gap-4 md:grid-cols-3"><Skeleton variant="rect" height={360} /><Skeleton variant="rect" height={360} /><Skeleton variant="rect" height={360} /></div>}
      {q.isError && <EmptyState title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => q.refetch() }} />}
      {data && tab !== 'businesses' && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Boost */}
          <Card padding="lg" variant={tab === 'students' ? 'outline-accent' : 'default'} className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2"><Sparkles className="size-5 text-accent-text" aria-hidden /><h2 className="text-h3 text-ink">{t('billing.pricing.boost.title')}</h2></div>
              <p className="mt-1 text-small text-ink-2">{t('billing.pricing.boost.subtitle')}</p>
            </div>
            <div>
              <span className="text-price-lg tnum text-ink">{boostGroup ? formatMoney(cheapest(boostGroup.tiers.flatMap((x) => x.plans))?.priceCents ?? 0) : '—'}</span>
              <span className="ml-1 text-small text-ink-3">{t('billing.pricing.boost.from', { days: boostGroup ? cheapest(boostGroup.tiers.flatMap((x) => x.plans))?.durationDays ?? 3 : 3 })}</span>
            </div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('billing.pricing.boost.entity')}>
              {data.boosts.map((b) => (
                <button key={b.entityType} type="button" role="radio" aria-checked={entity === b.entityType} onClick={() => setEntity(b.entityType)} className={cn('rounded-pill border px-3 py-1 text-caption', entity === b.entityType ? 'border-ink bg-inverse text-ink-inverse' : 'border-line bg-surface text-ink-2 hover:border-line-strong')}>
                  {t(`billing.entity.${b.entityType}`)}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {boostGroup?.tiers.map((tier) => (
                <div key={tier.tier} className="rounded-sm bg-sunken px-3 py-2">
                  <div className="flex items-center justify-between text-caption text-ink-3"><span className="font-medium text-ink-2">{tierLabel(t, tier.tier)}</span><span>{t(`billing.tier.${tier.tier}.hint`)}</span></div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-small text-ink tnum">
                    {tier.plans.map((p) => <span key={p.id}>{durationLabel(t, p.durationDays)} <span className="text-ink-2">{formatMoney(p.priceCents)}</span></span>)}
                  </div>
                </div>
              ))}
              {entity === 'listing' && data.addons[0] && <p className="text-caption text-ink-3">{t('billing.pricing.boost.spotlight', { price: formatMoney(data.addons[0].priceCents) })}</p>}
            </div>
            <FeatureList features={['billing.features.featuredSlots', 'billing.features.boostedLabel', 'billing.features.sameRules']} />
            <div className="mt-auto flex flex-col gap-2">
              <Button variant="primary" fullWidth iconRight={<ArrowUpRight />} onClick={() => navigate(status === 'authed' ? '/billing/boosts' : '/login?next=%2Fbilling%2Fboosts')}>{t('billing.pricing.boost.cta')}</Button>
              <p className="text-center text-caption text-ink-3">{t('billing.pricing.boost.ctaHint')}</p>
            </div>
          </Card>

          {/* Landlord Pro */}
          <Card padding="lg" variant={tab === 'landlords' ? 'outline-accent' : 'default'} className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2"><Badge variant="pro" /><h2 className="text-h3 text-ink">{t('billing.pricing.pro.title')}</h2></div>
              <p className="mt-1 text-small text-ink-2">{t('billing.pricing.pro.subtitle')}</p>
            </div>
            <div>
              <span className="text-price-lg tnum text-ink">{proMonthly ? formatMoney(proMonthly.priceCents) : '—'}</span>
              <span className="ml-1 text-small text-ink-3">{t('billing.pricing.pro.perMonth')}</span>
              {proYearly && proMonthly && <p className="text-caption text-ink-3">{t('billing.pricing.pro.yearly', { price: formatMoney(proYearly.priceCents), save: formatMoney(proMonthly.priceCents * 12 - proYearly.priceCents) })}</p>}
            </div>
            {foundingOpen && <div className="rounded-sm bg-accent-soft px-3 py-2 text-caption text-accent-text-strong">{t('billing.pricing.pro.founding', { date: isZh ? '2027 年 2 月 28 日' : 'Feb 28, 2027' })}</div>}
            <FeatureList features={(proMonthly?.features ?? []).slice(0, 5)} />
            {plusMonthly && <p className="text-caption text-ink-3">{t('billing.pricing.pro.plus', { price: formatMoney(plusMonthly.priceCents) })}</p>}
            <p className="text-caption text-ink-3">{t('billing.pricing.pro.trial', { days: data.trialDays })}</p>
            <div className="mt-auto">
              <Button asChild variant="primary" fullWidth iconRight={<ArrowRight />}><Link to="/pro">{sub.data?.isPro ? t('billing.pricing.pro.manage') : t('billing.pricing.pro.cta')}</Link></Button>
              <p className="mt-2 text-center text-caption text-ink-3">{t('billing.pricing.pro.gate')}</p>
            </div>
          </Card>

          {/* Secure Payment */}
          <Card padding="lg" className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-success" aria-hidden /><h2 className="text-h3 text-ink">{t('billing.pricing.secure.title')}</h2></div>
              <p className="mt-1 text-small text-ink-2">{t('billing.pricing.secure.subtitle')}</p>
            </div>
            <div>
              <span className="text-price-lg tnum text-ink">{data.escrow ? `${(data.escrow.feeBps ?? 300) / 100}%` : '3%'}</span>
              <span className="ml-1 text-small text-ink-3">{t('billing.pricing.secure.fee')}</span>
              <p className="text-caption text-ink-3">{t('billing.pricing.secure.feeRange', { min: formatMoney(data.escrow?.feeMinCents ?? 500), max: formatMoney(data.escrow?.feeCapCents ?? 6000) })}</p>
            </div>
            <FeatureList features={data.escrow?.features ?? ['billing.features.heldUntilMoveIn', 'billing.features.inspectionWindow', 'billing.features.disputes']} />
            <p className="rounded-sm bg-sunken px-3 py-2 text-caption text-ink-2">{t('billing.pricing.secure.partnerNote')}</p>
            <div className="mt-auto">
              <Button asChild variant="secondary" fullWidth><Link to="/billing/escrows">{t('billing.pricing.secure.cta')}</Link></Button>
            </div>
          </Card>
        </div>
      )}

      {data && tab === 'businesses' && <BusinessesTab plans={data.sponsor} />}

      {data && (
        <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Card padding="lg" variant="sunken" className="flex flex-col gap-3">
            <h2 className="text-h3 text-ink">{t('billing.pricing.free.title')}</h2>
            <p className="text-small text-ink-2">{t('billing.pricing.free.subtitle')}</p>
            <FeatureList features={data.alwaysFree.map((k) => `billing.free.${k}`)} />
            {status === 'authed' && (
              <Link to="/wallet" className="mt-2 inline-flex items-center gap-1 text-small text-accent-text hover:underline"><Gift className="size-4" aria-hidden />{t('billing.pricing.referralCta')}</Link>
            )}
          </Card>
          <div>
            <h2 className="mb-2 text-h3 text-ink">{t('billing.pricing.faq.title')}</h2>
            <Faq keys={data.faq} />
          </div>
        </section>
      )}

      <div className="mt-8"><TestModeBand compact /></div>
      <p className="mt-6 pb-4 text-center text-caption text-ink-3">{t('billing.pricing.footnote', { partners: data?.kit.partnerCount ?? 0 })} <Link to="/kit" className="text-accent-text underline">{t('billing.kit.title')}</Link></p>

      {boostTarget && <BoostSheet open entityType={boostTarget.type} entityId={boostTarget.id} onClose={closeBoost} surface="pricing" />}
    </div>
  );
}

function Faq({ keys }: { keys: string[] }) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(keys[0] ?? null);
  return (
    <ul className="divide-y divide-line border-y border-line">
      {keys.map((k) => {
        const isOpen = open === k;
        return (
          <li key={k}>
            <button type="button" aria-expanded={isOpen} aria-controls={`faq-${k}`} onClick={() => setOpen(isOpen ? null : k)} className="flex w-full items-center justify-between gap-3 py-3 text-left text-body text-ink hover:text-accent-text">
              <span>{t(`billing.faq.${k}.q`)}</span>
              <ChevronDown className={cn('size-4 shrink-0 text-ink-3 transition-transform duration-token-fast', isOpen && 'rotate-180')} aria-hidden />
            </button>
            {isOpen && <p id={`faq-${k}`} className="pb-3 text-small text-ink-2">{t(`billing.faq.${k}.a`)}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function BusinessesTab({ plans }: { plans: PlanDto[] }) {
  const t = useT();
  const { formatMoney } = useLocale();
  const planName = usePlanName();
  const { campus, campuses } = useCampus();
  const lead = useSponsorLead();
  const [form, setForm] = useState({ businessName: '', contact: '', interest: 'sponsor' as 'sponsor' | 'building', note: '', campusId: campus?.id ?? '' });
  const [sent, setSent] = useState(false);
  const sponsor = plans.filter((p) => p.key.startsWith('sponsor.'));
  const building = plans.filter((p) => p.key.startsWith('building.'));
  const submit = async () => {
    try {
      await lead.mutateAsync({ businessName: form.businessName, contact: form.contact, interest: form.interest, note: form.note || undefined, campusId: form.campusId || undefined });
      setSent(true);
      toast.success(t('billing.pricing.biz.sent'));
    } catch (e) { toast.error(errorMessage(t, e)); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="flex flex-col gap-4">
        <Card padding="lg" className="flex flex-col gap-3">
          <div className="flex items-center gap-2"><Building2 className="size-5 text-ink-2" aria-hidden /><h2 className="text-h3 text-ink">{t('billing.pricing.biz.sponsorTitle')}</h2></div>
          <p className="text-small text-ink-2">{t('billing.pricing.biz.sponsorSubtitle')}</p>
          <ul className="divide-y divide-line">
            {sponsor.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div><div className="text-small font-medium text-ink">{planName(p)}</div><div className="text-caption text-ink-3">{t(`billing.sponsor.${p.key.split('.')[1]}`)}</div></div>
                <div className="text-right"><span className="text-price tnum text-ink">{formatMoney(p.priceCents)}</span><span className="text-caption text-ink-3"> {t('billing.pricing.biz.perMonth')}</span></div>
              </li>
            ))}
          </ul>
          <p className="text-caption text-ink-3">{t('billing.pricing.biz.sponsorNote')}</p>
        </Card>
        <Card padding="lg" className="flex flex-col gap-3">
          <h2 className="text-h3 text-ink">{t('billing.pricing.biz.buildingTitle')}</h2>
          <p className="text-small text-ink-2">{t('billing.pricing.biz.buildingSubtitle')}</p>
          <ul className="divide-y divide-line">
            {building.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-small text-ink">{planName(p)}</span>
                <span className="text-price tnum text-ink">{formatMoney(p.priceCents)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card padding="lg" variant="outline-accent" className="flex flex-col gap-3">
        <h2 className="text-h3 text-ink">{t('billing.pricing.biz.formTitle')}</h2>
        <p className="text-small text-ink-2">{t('billing.pricing.biz.formSubtitle')}</p>
        {sent ? (
          <EmptyState size="sm" icon={ShieldCheck} title={t('billing.pricing.biz.sentTitle')} description={t('billing.pricing.biz.sentDescription')} />
        ) : (
          <>
            <Input label={t('billing.pricing.biz.businessName')} value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} required />
            <Input label={t('billing.pricing.biz.contact')} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="name@business.com · WeChat" required />
            <Select label={t('billing.pricing.biz.campus')} value={form.campusId} onChange={(v) => setForm({ ...form, campusId: v ?? '' })} options={campuses.map((c) => ({ value: c.id, label: c.shortName }))} searchable />
            <Select label={t('billing.pricing.biz.interest')} value={form.interest} onChange={(v) => setForm({ ...form, interest: (v as 'sponsor' | 'building') ?? 'sponsor' })} options={[{ value: 'sponsor', label: t('billing.pricing.biz.interestSponsor') }, { value: 'building', label: t('billing.pricing.biz.interestBuilding') }]} />
            <Textarea label={t('billing.pricing.biz.note')} rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} optional />
            <Button variant="primary" onClick={submit} loading={lead.isPending} disabled={form.businessName.trim().length < 2 || form.contact.trim().length < 3}>{t('billing.pricing.biz.submit')}</Button>
          </>
        )}
      </Card>
    </div>
  );
}
