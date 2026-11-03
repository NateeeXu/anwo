// /wallet — balance, expiring-soon callout, ledger with human-readable sources, referral block (code, share URL, stats),
// promo redemption input. Credits are boost-only and never cashable (billing-requirements §7).
import { useState } from 'react';
import { Check, Copy, Gift, Share2, Tag, Users, Wallet as WalletIcon } from 'lucide-react';
import { Link } from 'react-router';
import type { LedgerEntry } from '@shared/types';
import { Avatar, Badge, Button, Card, EmptyState, Input, Pagination, Skeleton } from '@/components';
import { Head } from '@/app/Head';
import { RequireAuth } from '@/app/guards';
import { errorMessage } from '@/app/errors';
import { isApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { useRedeemPromo, useReferrals, useWallet } from '../api';
import { TestModeBand } from '../components/shared';

export default function WalletPage() {
  return <RequireAuth><Wallet /></RequireAuth>;
}

function ledgerLabel(t: ReturnType<typeof useT>, e: LedgerEntry): string {
  if (e.kind === 'promo_credit') {
    if (e.note === 'pro_monthly_boost') return t('billing.ledger.proMonthlyBoost');
    if (e.note === 'post_bonus') return t('billing.ledger.postBonus');
    if (e.refType === 'promo_code' && e.note) return t('billing.ledger.promoCode', { code: e.note });
  }
  if (e.kind === 'order_payment') return t(`billing.ledger.orderPayment.${e.note === 'boost' || e.note === 'subscription' || e.note === 'subscription_renewal' ? e.note : 'other'}`);
  if (e.kind === 'refund') return e.note === 'boost_cancel_prorated' ? t('billing.ledger.boostRefund') : e.note === 'plan_upgrade_proration' ? t('billing.ledger.upgradeProration') : t('billing.ledger.refund');
  if (e.kind === 'topup') return t('billing.ledger.securePayout');
  return t(`billing.ledger.${e.kind}`);
}

function Wallet() {
  const t = useT();
  const { formatMoney, formatDate, formatRelative } = useLocale();
  const [page, setPage] = useState(1);
  const wallet = useWallet(page);
  const referrals = useReferrals();
  const redeem = useRedeemPromo();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const data = wallet.data;
  const submitCode = async () => {
    setCodeError(null);
    try {
      const r = await redeem.mutateAsync(code.trim());
      toast.success(t('billing.wallet.redeemed', { amount: formatMoney(r.creditedCents) }));
      setCode('');
    } catch (e) {
      setCodeError(isApiError(e, 'PROMO_INVALID') ? t(`billing.promo.reason.${(e.data as { reason?: string })?.reason ?? 'unknown'}`) : errorMessage(t, e));
    }
  };
  const copy = async (what: 'code' | 'link') => {
    if (!referrals.data) return;
    const text = what === 'code' ? referrals.data.code : `${window.location.origin}${referrals.data.shareUrl}`;
    await navigator.clipboard.writeText(text);
    setCopied(what);
    track('referral.link_click', { code: referrals.data.code, source: 'wallet_copy' });
    toast.success(t('billing.success.copied'));
    setTimeout(() => setCopied(null), 2000);
  };
  const share = async () => {
    if (!referrals.data) return;
    const url = `${window.location.origin}${referrals.data.shareUrl}`;
    const text = t('billing.referral.shareText', { amount: formatMoney(referrals.data.rewardCents) });
    try { if (navigator.share) await navigator.share({ title: text, url }); else await copy('link'); } catch { /* dismissed */ }
  };

  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('billing.wallet.title')} />
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-h1 text-ink">{t('billing.wallet.title')}</h1>
        <Button asChild variant="secondary" size="sm"><Link to="/billing/boosts">{t('billing.boosts.title')}</Link></Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card padding="lg" className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-caption text-ink-3">{t('billing.wallet.balance')}</div>
                {wallet.isLoading ? <Skeleton variant="text" width={120} height={36} /> : <div className="text-display tnum text-ink">{formatMoney(data?.balanceCents ?? 0)}</div>}
                <div className="mt-1 text-caption text-ink-3">{t('billing.wallet.balanceHint')}</div>
              </div>
              <span className="flex size-10 items-center justify-center rounded-pill bg-sunken text-ink-2"><WalletIcon className="size-5" aria-hidden /></span>
            </div>
            {data && data.expiringSoonCents > 0 && (
              <p className="rounded-sm bg-warning-soft px-3 py-2 text-small text-warning">{t('billing.wallet.expiringSoon', { amount: formatMoney(data.expiringSoonCents), date: data.expiringAt ? formatDate(data.expiringAt) : '' })}</p>
            )}
            {data && data.payoutPendingCents > 0 && (
              <p className="rounded-sm bg-sunken px-3 py-2 text-small text-ink-2">{t('billing.wallet.payoutPending', { amount: formatMoney(data.payoutPendingCents) })}</p>
            )}
            <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-end">
              <Input label={t('billing.wallet.promoLabel')} iconLeft={<Tag />} placeholder="WELCOME5" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(null); }} error={codeError ?? undefined} className="flex-1" onKeyDown={(e) => { if (e.key === 'Enter') void submitCode(); }} />
              <Button variant="secondary" onClick={submitCode} loading={redeem.isPending} disabled={code.trim().length < 3}>{t('billing.wallet.redeem')}</Button>
            </div>
          </Card>

          <Card padding="none">
            <div className="flex items-center justify-between px-4 py-3"><h2 className="text-h3 text-ink">{t('billing.wallet.ledger')}</h2><span className="text-caption text-ink-3">{t('billing.wallet.ledgerCount', { n: data?.entries.total ?? 0 })}</span></div>
            {wallet.isLoading && <div className="px-4 pb-4"><Skeleton variant="row" /><Skeleton variant="row" /><Skeleton variant="row" /></div>}
            {wallet.isError && <div className="px-4 pb-4"><EmptyState size="sm" title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => wallet.refetch() }} /></div>}
            {data && data.entries.items.length === 0 && <EmptyState size="sm" icon={WalletIcon} title={t('billing.wallet.emptyTitle')} description={t('billing.wallet.emptyDescription')} />}
            {data && data.entries.items.length > 0 && (
              <ul className="divide-y divide-line border-t border-line">
                {data.entries.items.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-small text-ink">{ledgerLabel(t, e)}</div>
                      <div className="text-caption text-ink-3">{formatRelative(e.createdAt)}{e.expiresAt && e.deltaCents > 0 ? ` · ${t('billing.wallet.expires', { date: formatDate(e.expiresAt) })}` : ''}</div>
                    </div>
                    <div className="text-right">
                      <div className={cn('text-small tnum font-medium', e.deltaCents >= 0 ? 'text-success' : 'text-ink')}>{e.deltaCents >= 0 ? '+' : '−'}{formatMoney(Math.abs(e.deltaCents))}</div>
                      <div className="text-caption tnum text-ink-3">{formatMoney(e.balanceAfterCents)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data && data.entries.total > data.entries.pageSize && <div className="px-4 py-3"><Pagination page={page} pageSize={data.entries.pageSize} total={data.entries.total} onChange={setPage} /></div>}
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          <Card padding="lg" className="flex flex-col gap-3">
            <div className="flex items-center gap-2"><Gift className="size-5 text-accent-text" aria-hidden /><h2 className="text-h3 text-ink">{t('billing.referral.title')}</h2></div>
            <p className="text-small text-ink-2">{t('billing.referral.description', { amount: formatMoney(referrals.data?.rewardCents ?? 500) })}</p>
            {referrals.isLoading && <Skeleton variant="rect" height={120} />}
            {referrals.data && (
              <>
                <div className="flex items-center justify-between rounded-card border border-dashed border-line-strong bg-sunken px-3 py-2">
                  <span className="font-mono text-h3 tracking-wider text-ink">{referrals.data.code}</span>
                  <Button variant="ghost" size="sm" iconLeft={copied === 'code' ? <Check /> : <Copy />} onClick={() => copy('code')}>{t('common.copy')}</Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" iconLeft={<Share2 />} onClick={share} className="flex-1">{t('billing.referral.share')}</Button>
                  <Button variant="secondary" size="sm" iconLeft={copied === 'link' ? <Check /> : <Copy />} onClick={() => copy('link')}>{t('billing.referral.copyLink')}</Button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {([['invited', referrals.data.stats.invited], ['rewarded', referrals.data.stats.rewarded], ['earned', referrals.data.stats.earnedCents]] as const).map(([k, v]) => (
                    <div key={k} className="rounded-sm bg-sunken py-2"><div className="text-price tnum text-ink">{k === 'earned' ? formatMoney(v) : v}</div><div className="text-caption text-ink-3">{t(`billing.referral.stat.${k}`)}</div></div>
                  ))}
                </div>
                {referrals.data.referrals.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {referrals.data.referrals.slice(0, 6).map((r, i) => (
                      <li key={i} className="flex items-center gap-2 text-small">
                        <Avatar src={r.user.avatarUrl} name={r.user.name} size="xs" trustLevel={r.user.trustLevel} />
                        <span className="flex-1 truncate text-ink">{r.user.name}</span>
                        <Badge variant={r.status === 'rewarded' ? 'success' : r.status === 'void' ? 'neutral' : 'warning'} size="sm">{t(`billing.referral.status.${r.status}`)}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="flex items-center gap-2 text-caption text-ink-3"><Users className="size-4" aria-hidden />{t('billing.referral.empty')}</p>
                )}
                <p className="text-caption text-ink-3">{t('billing.referral.rules')}</p>
              </>
            )}
          </Card>
          <TestModeBand compact />
        </aside>
      </div>
    </div>
  );
}
