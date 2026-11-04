// /checkout/:orderId — mock Stripe checkout (billing-requirements §8): order summary, promo line, wallet toggle, saved cards or
// card form, policy text per kind, primary 「支付 $X · 测试模式」; failed state inline with the test-card hint (dev only).
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CircleAlert, CreditCard, Lock, Wallet } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge, Button, Card, EmptyState, Skeleton, Switch } from '@/components';
import { Head } from '@/app/Head';
import { RequireAuth } from '@/app/guards';
import { errorMessage } from '@/app/errors';
import { isApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { useCancelOrder, useOrder, usePayOrder } from '../api';
import { CardForm, EMPTY_CARD, MoneyLine, OrderStatusBadge, TestModeBand, cardValid, entityPath, usePlanName, type CardFormValue } from '../components/shared';

export default function CheckoutPage() {
  return <RequireAuth><Checkout /></RequireAuth>;
}

function Checkout() {
  const t = useT();
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { formatMoney, formatDate } = useLocale();
  const planName = usePlanName();
  const q = useOrder(orderId);
  const pay = usePayOrder();
  const cancel = useCancelOrder();
  const [card, setCard] = useState<CardFormValue>(EMPTY_CARD);
  const [methodId, setMethodId] = useState<string | 'new'>('new');
  const [useWallet, setUseWallet] = useState<boolean>(true);
  const [failure, setFailure] = useState<string | null>(null);
  const order = q.data;
  useEffect(() => {
    if (!order) return;
    const def = order.paymentMethods.find((m) => m.isDefault) ?? order.paymentMethods[0];
    if (def && methodId === 'new' && !card.cardNumber) setMethodId(def.id);
    setUseWallet(order.metadata?.useWallet !== false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);
  useEffect(() => { if (order?.status === 'fulfilled') navigate(`/billing/success?order=${order.id}`, { replace: true }); }, [order?.status, order?.id, navigate]);

  const walletAllowed = order?.kind === 'boost';
  const preview = useMemo(() => {
    if (!order) return null;
    const afterDiscount = Math.max(0, order.subtotalCents - order.discountCents);
    const credit = walletAllowed && useWallet ? Math.min(order.walletBalanceCents, afterDiscount) : 0;
    return { credit, total: Math.max(0, afterDiscount - credit) + order.feeCents };
  }, [order, useWallet, walletAllowed]);

  const submit = async () => {
    if (!order || !preview) return;
    setFailure(null);
    try {
      const body = preview.total === 0 ? { paymentMethodId: 'wallet', useWallet } : methodId === 'new' ? { card, useWallet } : { paymentMethodId: methodId, useWallet };
      const res = await pay.mutateAsync({ id: order.id, body });
      navigate(`/billing/success?order=${res.id}`);
    } catch (e) {
      if (isApiError(e, 'PAYMENT_FAILED')) setFailure((e.data as { failureCode?: string })?.failureCode ?? 'card_declined');
      else toast.error(errorMessage(t, e));
    }
  };
  const doCancel = async () => {
    if (!order) return;
    try { await cancel.mutateAsync(order.id); navigate(order.entityType === 'escrow' ? entityPath('escrow', order.entityId) : '/billing/cancel'); } catch (e) { toast.error(errorMessage(t, e)); }
  };

  return (
    <div className="mx-auto w-full max-w-detail px-4 lg:px-8">
      <Head title={`${t('billing.checkout.title')} · ${t('common.testMode')}`} />
      <TestModeBand className="mb-4" />
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" iconLeft={<ArrowLeft />} onClick={() => navigate(-1)}>{t('common.back')}</Button>
        <h1 className="text-h2 text-ink">{t('billing.checkout.title')}</h1>
        {order && <OrderStatusBadge status={order.status} />}
      </div>
      {q.isLoading && <div className="grid gap-4 lg:grid-cols-[1fr_360px]"><Skeleton variant="rect" height={320} /><Skeleton variant="rect" height={240} /></div>}
      {q.isError && <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => q.refetch() }} />}
      {order && preview && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-4">
            {['cancelled', 'refunded'].includes(order.status) ? (
              <EmptyState icon={CircleAlert} title={t(`billing.orderStatus.${order.status}`)} description={t('billing.checkout.closedDescription')} action={<Button asChild variant="secondary"><Link to={entityPath(order.entityType, order.entityId)}>{t('common.back')}</Link></Button>} />
            ) : (
              <>
                {walletAllowed && (order.walletBalanceCents > 0 || order.creditCents > 0) && (
                  <Card padding="md">
                    <Switch label={<span className="flex items-center gap-2"><Wallet className="size-4 text-ink-2" aria-hidden />{t('billing.checkout.useWallet', { amount: formatMoney(order.walletBalanceCents) })}</span>} description={t('billing.checkout.walletHint')} checked={useWallet} onChange={setUseWallet} />
                  </Card>
                )}
                <Card padding="lg" className="flex flex-col gap-4">
                  <div className="flex items-center gap-2"><Lock className="size-4 text-ink-3" aria-hidden /><h2 className="text-h3 text-ink">{t('billing.checkout.payment')}</h2></div>
                  {preview.total === 0 ? (
                    <p className="rounded-sm bg-success-soft px-3 py-2 text-small text-success">{t('billing.checkout.coveredByWallet')}</p>
                  ) : (
                    <>
                      {order.paymentMethods.length > 0 && (
                        <div role="radiogroup" aria-label={t('billing.checkout.savedCards')} className="flex flex-col gap-2">
                          {order.paymentMethods.map((m) => (
                            <label key={m.id} className={cn('flex cursor-pointer items-center gap-3 rounded-card border px-3 py-2', methodId === m.id ? 'border-accent bg-accent-soft' : 'border-line bg-surface')}>
                              <input type="radio" name="pm" className="accent-[var(--color-accent)]" checked={methodId === m.id} onChange={() => setMethodId(m.id)} />
                              <CreditCard className="size-4 text-ink-2" aria-hidden />
                              <span className="text-small text-ink capitalize">{m.brand}</span>
                              <span className="text-small tnum text-ink-2">•••• {m.last4}</span>
                              <span className="ml-auto text-caption text-ink-3">{String(m.expMonth).padStart(2, '0')}/{String(m.expYear).slice(-2)}</span>
                              {m.isDefault && <Badge variant="neutral" size="sm">{t('billing.checkout.default')}</Badge>}
                            </label>
                          ))}
                          <label className={cn('flex cursor-pointer items-center gap-3 rounded-card border px-3 py-2', methodId === 'new' ? 'border-accent bg-accent-soft' : 'border-line bg-surface')}>
                            <input type="radio" name="pm" className="accent-[var(--color-accent)]" checked={methodId === 'new'} onChange={() => setMethodId('new')} />
                            <span className="text-small text-ink">{t('billing.checkout.newCard')}</span>
                          </label>
                        </div>
                      )}
                      {methodId === 'new' && <CardForm value={card} onChange={setCard} showSave />}
                    </>
                  )}
                  {failure && (
                    <div role="alert" className="flex items-start gap-2 rounded-sm bg-danger-soft px-3 py-2 text-small text-danger">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <div>
                        <div>{t(`billing.payment.failure.${failure}`)}</div>
                      </div>
                    </div>
                  )}
                  <p className="text-caption text-ink-3">{t(`billing.checkout.policy.${order.kind === 'subscription_renewal' ? 'subscription' : order.kind}`)}</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <Button variant="ghost" size="sm" onClick={doCancel} loading={cancel.isPending}>{t('billing.checkout.cancelOrder')}</Button>
                    <Button variant="primary" size="lg" loading={pay.isPending} disabled={preview.total > 0 && methodId === 'new' && !cardValid(card)} onClick={submit}>
                      {t('billing.checkout.payButton', { amount: formatMoney(preview.total) })}
                    </Button>
                  </div>
                </Card>
              </>
            )}
          </div>
          <aside className="flex flex-col gap-4">
            <Card padding="lg" className="flex flex-col gap-3">
              <h2 className="text-h3 text-ink">{t('billing.checkout.summary')}</h2>
              {order.entity && 'title' in order.entity && (
                <Link to={entityPath(order.entityType, order.entityId)} className="flex gap-3 rounded-sm bg-sunken p-2">
                  {'coverUrl' in order.entity && order.entity.coverUrl ? <img src={order.entity.coverUrl} alt="" className="size-14 shrink-0 rounded-xs object-cover dark:brightness-[.92]" /> : null}
                  <div className="min-w-0"><div className="truncate text-small font-medium text-ink">{order.entity.title}</div><div className="text-caption text-ink-3">{t(`billing.entity.${order.entityType}`)}</div></div>
                </Link>
              )}
              {order.escrow && (
                <div className="rounded-sm bg-sunken p-2 text-small text-ink-2">
                  <div className="font-medium text-ink">{t('billing.secure.title')}</div>
                  <div className="text-caption text-ink-3">{order.escrow.listing?.title} · {t('billing.secure.moveIn')} {order.escrow.moveInDate ? formatDate(order.escrow.moveInDate) : '—'}</div>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <MoneyLine label={order.kind === 'escrow_deposit' ? t('billing.secure.deposit') : planName(order.plan)} cents={order.subtotalCents} />
                {order.addons.map((a) => <MoneyLine key={a.id} label={planName(a)} cents={a.priceCents} />)}
                {order.discountCents > 0 && <MoneyLine label={`${t('billing.checkout.discount')}${order.promoCode ? ` · ${order.promoCode}` : ''}`} cents={order.discountCents} negative />}
                {preview.credit > 0 && <MoneyLine label={t('billing.checkout.walletCredit')} cents={preview.credit} negative />}
                {order.feeCents > 0 && <MoneyLine label={t('billing.secure.feeLine', { pct: '3%' })} cents={order.feeCents} hint={order.kind === 'escrow_deposit' && typeof order.metadata.railFeeCents === 'number' && order.metadata.railFeeCents > 0 ? t('billing.secure.railFeeIncluded') : undefined} />}
                <div className="my-1 border-t border-line" />
                <MoneyLine label={t('billing.checkout.total')} cents={preview.total} strong />
              </div>
              <p className="text-caption text-ink-3">{t('billing.checkout.orderId')} <span className="tnum">{order.id.slice(0, 8)}</span></p>
            </Card>
            <p className="text-caption text-ink-3">{t('billing.checkout.secureNote')}</p>
          </aside>
        </div>
      )}
    </div>
  );
}
