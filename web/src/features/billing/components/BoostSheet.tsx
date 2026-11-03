// BoostSheet — the boost purchase sheet (billing-requirements §10). Exported from features/billing for listings/market/buddy
// owner panels and publish-success upsells:  <BoostSheet open entityType="listing" entityId={id} onClose={…} surface="owner_panel" />
// Eligibility first → tier cards → Spotlight add-on → promo + wallet → creates the order and hands off to /checkout/:orderId.
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CircleAlert, Globe2, Lock, ShieldCheck, Sparkles, Tag, Wallet } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Badge, Button, EmptyState, Input, Modal, Skeleton, Switch } from '@/components';
import { errorMessage } from '@/app/errors';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { isApiError } from '@/lib/api';
import { useBoostOptions, useCreateOrder, useValidatePromo, type PlanDto } from '../api';
import { MoneyLine, TestModeBand, durationLabel, tierLabel, usePlanName } from './shared';

export type BoostSheetProps = {
  open: boolean;
  onClose: () => void;
  entityType: 'listing' | 'market_item' | 'buddy_post';
  entityId: string;
  surface?: 'publish_upsell' | 'owner_panel' | 'detail' | 'pricing';
  /** called with the order id after checkout starts (default: navigate to /checkout/:id) */
  onOrderCreated?: (orderId: string, fulfilled: boolean) => void;
};

export function BoostSheet({ open, onClose, entityType, entityId, surface = 'owner_panel', onOrderCreated }: BoostSheetProps) {
  const t = useT();
  const navigate = useNavigate();
  const { status } = useAuth();
  const { formatMoney, formatDate } = useLocale();
  const planName = usePlanName();
  const q = useBoostOptions(open && status === 'authed' ? entityType : null, open ? entityId : null, surface);
  const [planKey, setPlanKey] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState(false);
  const [useWallet, setUseWallet] = useState(true);
  const [promo, setPromo] = useState('');
  const [promoState, setPromoState] = useState<{ code: string; discountCents: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const validate = useValidatePromo();
  const create = useCreateOrder();

  const plans = useMemo(() => (q.data?.plans ?? []).filter((p) => p.kind === 'boost' && p.tier), [q.data]);
  const addon = useMemo(() => q.data?.plans.find((p) => p.addonFor), [q.data]);
  const pack = useMemo(() => q.data?.plans.find((p) => p.key === 'pack.moving_out'), [q.data]);
  useEffect(() => {
    if (!q.data || planKey) return;
    const def = plans.find((p) => p.key.endsWith('basic.7d') && !p.lock) ?? plans.find((p) => !p.lock) ?? plans[0];
    if (def) setPlanKey(def.key);
  }, [q.data, plans, planKey]);
  useEffect(() => { if (!open) { setPromoState(null); setPromoError(null); setPromo(''); setSpotlight(false); } }, [open]);

  const selected = plans.find((p) => p.key === planKey) ?? pack ?? null;
  const subtotal = (selected?.priceCents ?? 0) + (spotlight && addon ? addon.priceCents : 0);
  const discount = promoState?.discountCents ?? 0;
  const wallet = q.data?.walletBalanceCents ?? 0;
  const credit = useWallet ? Math.min(wallet, Math.max(0, subtotal - discount)) : 0;
  const total = Math.max(0, subtotal - discount - credit);
  const tiers = useMemo(() => {
    const m = new Map<string, typeof plans>();
    for (const p of plans) { const l = m.get(p.tier!) ?? []; l.push(p); m.set(p.tier!, l); }
    return [...m.entries()];
  }, [plans]);

  const applyPromo = async () => {
    if (!promo.trim() || !selected) return;
    setPromoError(null);
    try {
      const r = await validate.mutateAsync({ code: promo.trim(), orderKind: 'boost', planId: selected.id, subtotalCents: subtotal });
      setPromoState({ code: r.code, discountCents: r.discountCents });
      track('promo.apply', { code: r.code, ok: true });
    } catch (e) {
      setPromoState(null);
      setPromoError(isApiError(e, 'PROMO_INVALID') ? t(`billing.promo.reason.${(e.data as { reason?: string })?.reason ?? 'unknown'}`) : errorMessage(t, e));
    }
  };
  const submit = async () => {
    if (!selected) return;
    try {
      const order = await create.mutateAsync({ kind: 'boost', planId: selected.id, entityType, entityId, addons: spotlight && addon ? [addon.key] : undefined, promoCode: promoState?.code, useWallet, surface });
      track('boost.tier_selected', { planKey: selected.key, addons: spotlight && addon ? [addon.key] : [] });
      onClose();
      if (onOrderCreated) onOrderCreated(order.id, order.status === 'fulfilled');
      else navigate(order.status === 'fulfilled' ? `/billing/success?order=${order.id}` : `/checkout/${order.id}`);
    } catch (e) {
      if (isApiError(e, 'TRUST_REQUIRED')) { toast.error(errorMessage(t, e)); navigate('/verify'); return; }
      toast.error(errorMessage(t, e));
    }
  };

  const lockHint = (lock: string | null) => {
    if (!lock) return null;
    if (lock === 'TRUST_REQUIRED') return t('billing.boost.lock.trust');
    if (lock === 'billing.boost.ineligible.bundle') return t('billing.boost.lock.bundle');
    return t('billing.boost.lock.leaseProof');
  };

  return (
    <Modal open={open} onClose={onClose} title={t('billing.boost.sheetTitle')} description={q.data?.entityTitle} size="md" sheetSnap="full"
      footer={q.data?.eligible ? (
        <div className="flex w-full items-center justify-between gap-3">
          <div className="text-small text-ink-2">
            <span className="text-caption text-ink-3">{t('billing.checkout.total')}</span>
            <span className="ml-2 text-price tnum text-ink">{formatMoney(total)}</span>
          </div>
          <Button variant="primary" loading={create.isPending} disabled={!selected || !!selected.lock} onClick={submit} iconRight={<ArrowUpRight />}>
            {total === 0 ? t('billing.boost.applyCredit') : t('billing.boost.continue')}
          </Button>
        </div>
      ) : undefined}
    >
      <TestModeBand compact className="mb-4" />
      {status === 'anon' && <EmptyState icon={Lock} title={t('billing.boost.loginTitle')} description={t('billing.boost.loginDescription')} action={<Button asChild variant="primary"><Link to={`/login?next=${encodeURIComponent(`/pricing?boost=${entityType}:${entityId}`)}`}>{t('nav.login')}</Link></Button>} size="sm" />}
      {q.isLoading && <div className="flex flex-col gap-3"><Skeleton variant="rect" height={72} /><Skeleton variant="rect" height={72} /><Skeleton variant="rect" height={72} /></div>}
      {q.isError && <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => q.refetch() }} size="sm" />}
      {q.data && !q.data.eligible && (
        <EmptyState
          icon={q.data.reason === 'TRUST_REQUIRED' ? ShieldCheck : CircleAlert}
          title={t('billing.boost.ineligibleTitle')}
          description={q.data.reason === 'TRUST_REQUIRED' ? t('billing.boost.ineligible.trust') : q.data.reason === 'FEATURE_DISABLED' ? t('billing.boost.ineligible.disabled') : q.data.reason === 'FORBIDDEN' ? t('billing.boost.ineligible.forbidden') : t(q.data.reason ?? 'billing.boost.ineligible.moderation')}
          action={q.data.reason === 'TRUST_REQUIRED' ? <Button asChild variant="primary"><Link to="/verify-email?reason=boost">{t('billing.boost.verifyEmail')}</Link></Button> : undefined}
          size="sm"
        />
      )}
      {q.data?.eligible && (
        <div className="flex flex-col gap-5">
          {q.data.currentBoost && (
            <p className="rounded-sm bg-sunken px-3 py-2 text-small text-ink-2">
              {t('billing.boost.extendNote', { date: formatDate(q.data.currentBoost.endsAt) })}
            </p>
          )}
          {tiers.map(([tier, list]) => (
            <section key={tier} aria-labelledby={`tier-${tier}`}>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 id={`tier-${tier}`} className="text-small font-semibold text-ink">{tierLabel(t, tier)}</h3>
                <span className="text-caption text-ink-3">{t(`billing.tier.${tier}.hint`)}</span>
              </div>
              <div role="radiogroup" aria-label={tierLabel(t, tier)} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {list.map((p) => <TierCard key={p.id} plan={p} selected={planKey === p.key} onSelect={() => !p.lock && setPlanKey(p.key)} lockHint={lockHint(p.lock)} />)}
              </div>
            </section>
          ))}
          {pack && (
            <TierCard plan={pack} selected={planKey === pack.key} onSelect={() => !pack.lock && setPlanKey(pack.key)} lockHint={lockHint(pack.lock)} wide description={t('billing.boost.packDescription')} />
          )}
          {!q.data.supplyProof && entityType === 'listing' && (
            <p className="flex items-start gap-2 rounded-sm border border-line bg-surface px-3 py-2 text-caption text-ink-2">
              <Lock className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
              <span>{t('billing.boost.lock.leaseProofLong')} <Link to="/verify?next=%2Fpricing" className="text-accent-text underline">{t('billing.boost.lock.leaseProofCta')}</Link></span>
            </p>
          )}
          {addon && entityType === 'listing' && (
            <div className={cn('rounded-card border px-3 py-3', spotlight ? 'border-accent-soft-line bg-accent-soft' : 'border-line bg-surface')}>
              <Switch
                label={<span className="flex items-center gap-2"><Globe2 className="size-4 text-ink-2" aria-hidden />{planName(addon)} · {formatMoney(addon.priceCents)}</span>}
                description={addon.lock ? lockHint(addon.lock) ?? undefined : t('billing.boost.spotlightDescription')}
                checked={spotlight}
                onChange={setSpotlight}
                disabled={!!addon.lock}
              />
            </div>
          )}
          <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3">
            <div className="flex gap-2">
              <Input size="sm" iconLeft={<Tag />} placeholder={t('billing.promo.placeholder')} value={promo} onChange={(e) => { setPromo(e.target.value.toUpperCase()); setPromoState(null); setPromoError(null); }} error={promoError ?? undefined} aria-label={t('billing.promo.label')} className="flex-1" />
              <Button size="sm" variant="secondary" onClick={applyPromo} loading={validate.isPending} disabled={!promo.trim()}>{t('billing.promo.apply')}</Button>
            </div>
            {promoState && <p className="text-caption text-success">{t('billing.promo.applied', { code: promoState.code, amount: formatMoney(promoState.discountCents) })}</p>}
            {wallet > 0 && (
              <Switch label={<span className="flex items-center gap-2"><Wallet className="size-4 text-ink-2" aria-hidden />{t('billing.checkout.useWallet', { amount: formatMoney(wallet) })}</span>} checked={useWallet} onChange={setUseWallet} size="sm" />
            )}
            <div className="flex flex-col gap-1 border-t border-line pt-2">
              {selected && <MoneyLine label={`${planName(selected)}${selected.durationDays ? ` · ${durationLabel(t, selected.durationDays)}` : ''}`} cents={selected.priceCents} />}
              {spotlight && addon && <MoneyLine label={planName(addon)} cents={addon.priceCents} />}
              {discount > 0 && <MoneyLine label={t('billing.checkout.discount')} cents={discount} negative />}
              {credit > 0 && <MoneyLine label={t('billing.checkout.walletCredit')} cents={credit} negative />}
              <MoneyLine label={t('billing.checkout.total')} cents={total} strong />
            </div>
          </div>
          <p className="flex items-start gap-2 text-caption text-ink-3">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{t('billing.boost.policy')} <Badge variant="boosted" size="sm" className="ml-1 align-middle" /></span>
          </p>
        </div>
      )}
    </Modal>
  );
}

function TierCard({ plan, selected, onSelect, lockHint, wide, description }: { plan: PlanDto & { lock: string | null; estimatedReach?: { dailyViews: number; multiplier: number } }; selected: boolean; onSelect: () => void; lockHint: string | null; wide?: boolean; description?: string }) {
  const t = useT();
  const { formatMoney } = useLocale();
  const planName = usePlanName();
  const locked = !!plan.lock;
  const reach = plan.estimatedReach ? Math.round(plan.estimatedReach.dailyViews * plan.estimatedReach.multiplier * (plan.durationDays ?? 7)) : null;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={locked}
      onClick={onSelect}
      title={lockHint ?? undefined}
      className={cn(
        'flex flex-col items-start gap-1 rounded-card border p-3 text-left transition-colors duration-token-fast',
        wide && 'sm:flex-row sm:items-center sm:justify-between',
        selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong',
        locked && 'cursor-not-allowed opacity-70',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-small font-semibold text-ink">
          {locked && <Lock className="size-3.5 text-ink-3" aria-hidden />}
          <span className="truncate">{plan.durationDays ? durationLabel(t, plan.durationDays) : planName(plan)}</span>
        </div>
        {description ? <p className="text-caption text-ink-2">{description}</p> : reach ? <p className="text-caption text-ink-3">{t('billing.boost.estReach', { n: reach })}</p> : null}
        {locked && lockHint && <p className="text-caption text-ink-3">{lockHint}</p>}
      </div>
      <span className="text-price tnum text-ink">{formatMoney(plan.priceCents)}</span>
    </button>
  );
}

export default BoostSheet;
