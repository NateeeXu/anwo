// /billing/success?order= and /billing/cancel — what was fulfilled (boost schedule + 「推广」 preview, Pro ribbon,
// Secure Payment timeline) and a share card; cancel returns to the entity.
import { useState } from 'react';
import { ArrowRight, Check, Copy, PartyPopper, Share2, XCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components';
import { Head } from '@/app/Head';
import { RequireAuth } from '@/app/guards';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { useOrder } from '../api';
import { BoostStatusBadge, EscrowStatusBadge, MoneyLine, TestModeBand, entityPath, usePlanName } from '../components/shared';

export function CheckoutSuccessPage() {
  return <RequireAuth><Success /></RequireAuth>;
}

function Success() {
  const t = useT();
  const [params] = useSearchParams();
  const { formatDate } = useLocale();
  const planName = usePlanName();
  const q = useOrder(params.get('order') ?? undefined);
  const [copied, setCopied] = useState(false);
  const order = q.data;
  const share = async () => {
    if (!order) return;
    const url = `${window.location.origin}${entityPath(order.entityType, order.entityId)}`;
    const text = t('billing.success.shareText', { title: order.entity && 'title' in order.entity ? order.entity.title : '' });
    try {
      if (navigator.share) await navigator.share({ title: text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); setCopied(true); toast.success(t('billing.success.copied')); }
    } catch { /* dismissed */ }
  };
  return (
    <div className="mx-auto w-full max-w-detail px-4 lg:px-8">
      <Head title={`${t('billing.success.title')} · ${t('common.testMode')}`} />
      <TestModeBand className="mb-4" />
      {q.isLoading && <Skeleton variant="rect" height={280} />}
      {q.isError && <EmptyState title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => q.refetch() }} />}
      {order && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card padding="lg" className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-success-soft text-success"><PartyPopper className="size-5" aria-hidden /></span>
              <div>
                <h1 className="text-h2 text-ink">{t(`billing.success.heading.${order.kind === 'subscription_renewal' ? 'subscription' : order.kind}`)}</h1>
                <p className="text-small text-ink-2">{t('billing.success.subtitle')}</p>
              </div>
            </div>
            {order.kind === 'boost' && (
              <div className="flex flex-col gap-3">
                {order.entity && 'title' in order.entity && (
                  <Link to={entityPath(order.entityType, order.entityId)} className="flex gap-3 rounded-card border border-line bg-surface p-3 hover:border-line-strong">
                    {'coverUrl' in order.entity && order.entity.coverUrl ? <div className="relative size-20 shrink-0 overflow-hidden rounded-sm bg-sunken"><img src={order.entity.coverUrl} alt="" className="size-full object-cover dark:brightness-[.92]" /><Badge variant="boosted" size="sm" className="absolute left-1 top-1" /></div> : <Badge variant="boosted" />}
                    <div className="min-w-0"><div className="truncate text-body font-semibold text-ink">{order.entity.title}</div><div className="text-caption text-ink-3">{t('billing.success.previewHint')}</div></div>
                  </Link>
                )}
                <ul className="flex flex-col gap-2">
                  {order.boosts.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-sunken px-3 py-2 text-small">
                      <span className="flex items-center gap-2 text-ink"><BoostStatusBadge status={b.status} />{t(`billing.tier.${b.tier}`)}{b.nationwide && <Badge variant="accent" size="sm">{t('billing.boost.nationwideBadge')}</Badge>}</span>
                      <span className="tnum text-ink-2">{formatDate(b.startsAt)} → {formatDate(b.endsAt)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-caption text-ink-3">{t('billing.success.boostNote')}</p>
              </div>
            )}
            {(order.kind === 'subscription' || order.kind === 'subscription_renewal') && (
              <div className="flex items-center gap-3 rounded-card bg-sunken p-3">
                <Badge variant="pro" />
                <div className="text-small text-ink-2">{t('billing.success.proNote', { plan: planName(order.plan) })}</div>
              </div>
            )}
            {order.kind === 'escrow_deposit' && order.escrow && (
              <div className="flex flex-col gap-2 rounded-card bg-sunken p-3">
                <div className="flex items-center justify-between"><span className="text-small font-medium text-ink">{t('billing.secure.title')}</span><EscrowStatusBadge status={order.escrow.status} /></div>
                <p className="text-small text-ink-2">{t('billing.success.secureNote', { date: order.escrow.moveInDate ? formatDate(order.escrow.moveInDate) : '—', hours: order.escrow.inspectionHours })}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="primary" iconRight={<ArrowRight />}><Link to={order.kind === 'boost' ? '/billing/boosts' : order.kind === 'escrow_deposit' ? entityPath('escrow', order.entityId) : '/pro'}>{t(`billing.success.cta.${order.kind === 'subscription_renewal' ? 'subscription' : order.kind}`)}</Link></Button>
              {order.kind === 'boost' && <Button variant="secondary" iconLeft={copied ? <Check /> : <Share2 />} onClick={share}>{t('billing.success.share')}</Button>}
            </div>
          </Card>
          <aside>
            <Card padding="lg" className="flex flex-col gap-2">
              <h2 className="text-h3 text-ink">{t('billing.success.receipt')}</h2>
              <MoneyLine label={order.kind === 'escrow_deposit' ? t('billing.secure.deposit') : planName(order.plan)} cents={order.subtotalCents} />
              {order.addons.map((a) => <MoneyLine key={a.id} label={planName(a)} cents={a.priceCents} />)}
              {order.discountCents > 0 && <MoneyLine label={t('billing.checkout.discount')} cents={order.discountCents} negative />}
              {order.creditCents > 0 && <MoneyLine label={t('billing.checkout.walletCredit')} cents={order.creditCents} negative />}
              {order.feeCents > 0 && <MoneyLine label={t('billing.secure.feeLine', { pct: '3%' })} cents={order.feeCents} />}
              <div className="my-1 border-t border-line" />
              <MoneyLine label={t('billing.checkout.paid')} cents={order.totalCents} strong />
              {order.payment?.methodLast4 && <p className="text-caption text-ink-3 capitalize">{order.payment.methodBrand} •••• {order.payment.methodLast4}</p>}
              <p className="text-caption text-ink-3">{t('billing.checkout.orderId')} <span className="tnum">{order.id.slice(0, 8)}</span> · {t('common.testMode')}</p>
              <button type="button" className="mt-1 inline-flex items-center gap-1 self-start text-caption text-accent-text hover:underline" onClick={() => { void navigator.clipboard.writeText(order.id); toast.success(t('billing.success.copied')); }}><Copy className="size-3" aria-hidden />{t('billing.success.copyId')}</button>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}

export function CheckoutCancelPage() {
  const t = useT();
  const [params] = useSearchParams();
  const back = params.get('back') ?? '/pricing';
  return (
    <div className="mx-auto w-full max-w-detail px-4 lg:px-8">
      <Head title={t('billing.cancel.title')} />
      <EmptyState icon={XCircle} title={t('billing.cancel.title')} description={t('billing.cancel.description')} action={<Button asChild variant="primary"><Link to={back}>{t('common.back')}</Link></Button>} secondaryAction={<Button asChild variant="ghost"><Link to="/wallet">{t('billing.wallet.title')}</Link></Button>} />
    </div>
  );
}

export default CheckoutSuccessPage;
