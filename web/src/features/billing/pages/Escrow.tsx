// Secure Payment (「安心付」, table `escrows`) pages — billing-requirements §4 / §10:
//   /escrow            my Secure Payments (as tenant / as host)
//   /escrow/new        propose one for a listing (?listingId=&counterpartyId=) — quote with the fee as its own line
//   /escrow/:id        status timeline + actions by role (accept · fund · confirm move-in · refund · report a problem · cancel),
//                      receipt, admin resolve. Every pay surface carries the test-mode band.
// User-facing copy never says "escrow" — always 安心付 / Secure Payment.
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarClock, Check, CircleAlert, FileText, Gavel, Home, Lock, ShieldCheck, Undo2, XCircle } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { Listing } from '@shared/types';
import type { EscrowRail } from '@shared/schemas/billing';
import { Avatar, Badge, Button, Card, EmptyState, Input, Modal, PhotoUploader, Select, Skeleton, Tabs, Textarea, TrustBadge, type UploaderFile } from '@/components';
import { Head } from '@/app/Head';
import { RequireAuth } from '@/app/guards';
import { errorMessage } from '@/app/errors';
import { api, isApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { useQuery } from '@tanstack/react-query';
import { useCreateEscrow, useEscrow, useEscrowAction, useEscrowEligibility, useEscrowQuote, useEscrows, useFundEscrow, usePaymentMethods, type EscrowDto, type EscrowQuote } from '../api';
import { CardForm, EMPTY_CARD, EscrowStatusBadge, MoneyLine, TestModeBand, cardValid, type CardFormValue } from '../components/shared';

const RAILS: EscrowRail[] = ['ach', 'card', 'alipay', 'wechat_pay'];
/** Secure Payment limits (mirror EscrowInput on the server: $100 – $10,000; card rail under $500). */
const DEPOSIT_MIN_CENTS = 10_000;
const DEPOSIT_MAX_CENTS = 1_000_000;
const CARD_RAIL_MAX_CENTS = 50_000;
const TIMELINE = ['proposed', 'accepted', 'funded', 'in_inspection', 'released'] as const;

// ---------------------------------------------------------------- list
export function EscrowListPage() {
  return <RequireAuth><EscrowList /></RequireAuth>;
}

function EscrowList() {
  const t = useT();
  const { formatMoney, formatDate } = useLocale();
  const { user } = useAuth();
  const [role, setRole] = useState<'all' | 'payer' | 'payee'>('all');
  const q = useEscrows({ role: role === 'all' ? undefined : role });
  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('billing.secure.listTitle')} />
      <header className="mb-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-h1 text-ink">{t('billing.secure.listTitle')}</h1>
          <Button asChild variant="secondary" size="sm"><Link to="/pricing#secure">{t('billing.secure.howItWorks')}</Link></Button>
        </div>
        <p className="text-small text-ink-2">{t('billing.secure.listSubtitle')}</p>
      </header>
      <Tabs variant="underline" value={role} onChange={setRole} label={t('billing.secure.listTitle')} items={[{ key: 'all', label: t('billing.secure.role.all') }, { key: 'payer', label: t('billing.secure.role.payer') }, { key: 'payee', label: t('billing.secure.role.payee') }]} className="mb-4" />
      {q.isLoading && <div className="flex flex-col gap-3"><Skeleton variant="row" /><Skeleton variant="row" /><Skeleton variant="row" /></div>}
      {q.isError && <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => q.refetch() }} />}
      {q.data && q.data.items.length === 0 && <EmptyState icon={ShieldCheck} title={t('billing.secure.emptyTitle')} description={t('billing.secure.emptyDescription')} action={<Button asChild variant="primary"><Link to="/listings">{t('billing.secure.browse')}</Link></Button>} />}
      {q.data && q.data.items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {q.data.items.map((e) => (
            <li key={e.id}>
              <Card as={Link} to={`/escrow/${e.id}`} interactive padding="md" className="flex items-center gap-3">
                {e.listing?.coverUrl ? <img src={e.listing.coverUrl} alt="" className="size-14 shrink-0 rounded-sm object-cover dark:brightness-[.92]" /> : <span className="flex size-14 shrink-0 items-center justify-center rounded-sm bg-sunken"><Home className="size-5 text-ink-3" aria-hidden /></span>}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-semibold text-ink">{e.listing?.title ?? t('billing.secure.title')}</div>
                  <div className="text-caption text-ink-3">{t('billing.secure.moveIn')} {e.moveInDate ? formatDate(e.moveInDate) : '—'} · {t('billing.secure.with', { name: e.payer.id === user?.id ? e.payee.name : e.payer.name })}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-price tnum text-ink">{formatMoney(e.amountCents)}</span>
                  <EscrowStatusBadge status={e.status} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- quote box (shared by propose + fund)
export function QuoteLines({ quote, feePayer }: { quote: EscrowQuote; feePayer: 'payer' | 'payee' | 'split' }) {
  const t = useT();
  const pct = `${quote.feeBps / 100}%`;
  return (
    <div className="flex flex-col gap-1.5">
      <MoneyLine label={t('billing.secure.deposit')} cents={quote.amountCents} />
      <MoneyLine label={t('billing.secure.feeLine', { pct })} cents={quote.feeCents} hint={t(`billing.secure.feePaidBy.${feePayer}`)} />
      {quote.railFeeCents > 0 && <MoneyLine label={t(`billing.secure.railFee.${quote.rail}`)} cents={quote.railFeeCents} hint={t('billing.secure.passThrough')} />}
      <div className="my-1 border-t border-line" />
      <MoneyLine label={t('billing.secure.payerTotal')} cents={quote.payerTotalCents} strong />
      <MoneyLine label={t('billing.secure.payeeNet')} cents={quote.payeeNetCents} muted />
    </div>
  );
}

function RailPicker({ value, onChange, amountCents }: { value: EscrowRail; onChange: (r: EscrowRail) => void; amountCents: number }) {
  const t = useT();
  const { formatMoney } = useLocale();
  return (
    <div role="radiogroup" aria-label={t('billing.secure.rail')} className="grid grid-cols-2 gap-2">
      {RAILS.map((r) => {
        const disabled = r === 'card' && amountCents >= 50000;
        return (
          <button key={r} type="button" role="radio" aria-checked={value === r} disabled={disabled} onClick={() => onChange(r)}
            className={cn('flex flex-col items-start rounded-card border px-3 py-2 text-left', value === r ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong', disabled && 'cursor-not-allowed opacity-60')}>
            <span className="text-small font-medium text-ink">{t(`billing.secure.rails.${r}`)}</span>
            <span className="text-caption text-ink-3">{disabled ? t('billing.secure.cardLimit', { achThreshold: formatMoney(CARD_RAIL_MAX_CENTS) }) : t(`billing.secure.railsHint.${r}`)}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- propose (create flow)
export function EscrowNewPage() {
  return <RequireAuth><EscrowNew /></RequireAuth>;
}

function EscrowNew() {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { formatMoney } = useLocale();
  const [params] = useSearchParams();
  const listingId = params.get('listingId');
  const counterpartyParam = params.get('counterpartyId');
  const listing = useQuery({ queryKey: ['billing', 'escrow-listing', listingId], queryFn: () => api<Listing>(`/api/listings/${listingId}`), enabled: !!listingId });
  const elig = useEscrowEligibility(listingId);
  const create = useCreateEscrow();
  const isHost = !!listing.data && listing.data.owner.id === user?.id;
  const [amount, setAmount] = useState('');
  const [feePayer, setFeePayer] = useState<'payer' | 'payee' | 'split'>('payer');
  const [rail, setRail] = useState<EscrowRail>('ach');
  const [moveIn, setMoveIn] = useState('');
  const [hours, setHours] = useState('48');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (listing.data && !amount) setAmount(String(Math.round((listing.data.depositCents || listing.data.priceCents) / 100)));
    if (listing.data && !moveIn) setMoveIn(listing.data.availableFrom && listing.data.availableFrom > new Date().toISOString().slice(0, 10) ? listing.data.availableFrom : new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.data?.id]);
  const amountCents = Math.round(Number(amount || 0) * 100);
  const amountOk = amountCents >= DEPOSIT_MIN_CENTS && amountCents <= DEPOSIT_MAX_CENTS;
  const effectiveRail: EscrowRail = rail === 'card' && amountCents >= 50000 ? 'ach' : rail;
  const quote = useEscrowQuote(amountOk ? amountCents : 0, feePayer, effectiveRail, amountOk);
  useEffect(() => { if (amountOk) track('escrow.quote_viewed', { amountCents, rail: effectiveRail }); }, [amountOk, amountCents, effectiveRail]);
  const counterpartyId = isHost ? counterpartyParam : listing.data?.owner.id;
  const submit = async () => {
    if (!listingId || !counterpartyId) return;
    try {
      const e = await create.mutateAsync({ listingId, counterpartyId, role: isHost ? 'payee' : 'payer', amountCents, feePayer, rail: effectiveRail, moveInDate: moveIn, inspectionHours: Number(hours), note: note.trim() || undefined });
      toast.success(t('billing.secure.proposed'));
      navigate(`/escrow/${e.id}`, { replace: true });
    } catch (err) {
      if (isApiError(err, 'CONFLICT')) {
        const existing = (err.data as { escrowId?: string } | undefined)?.escrowId;
        toast.error(t('billing.secure.conflict'), undefined, existing ? { label: t('billing.secure.open'), onClick: () => navigate(`/escrow/${existing}`) } : undefined);
        return;
      }
      if (isApiError(err, 'TRUST_REQUIRED')) { toast.error(errorMessage(t, err)); navigate('/verify?next=' + encodeURIComponent(`/escrow/new?listingId=${listingId}`)); return; }
      toast.error(errorMessage(t, err));
    }
  };
  if (!listingId) return <div className="mx-auto w-full max-w-form px-4"><Head title={t('billing.secure.newTitle')} /><EmptyState icon={Home} title={t('billing.secure.pickListing')} description={t('billing.secure.pickListingHint')} action={<Button asChild variant="primary"><Link to="/listings">{t('billing.secure.browse')}</Link></Button>} /></div>;
  const blocked = elig.data && (!elig.data.enabled ? 'disabled' : !elig.data.listingActive ? 'inactive' : !elig.data.payeeEligible ? 'payee' : null);
  return (
    <div className="mx-auto w-full max-w-detail px-4 lg:px-8">
      <Head title={t('billing.secure.newTitle')} />
      <div className="mb-3"><Button variant="ghost" size="sm" iconLeft={<ArrowLeft />} onClick={() => navigate(-1)}>{t('common.back')}</Button></div>
      <h1 className="text-h1 text-ink">{t('billing.secure.newTitle')}</h1>
      <p className="mb-4 mt-1 text-small text-ink-2">{t('billing.secure.newSubtitle')}</p>
      <TestModeBand className="mb-4" />
      {(listing.isLoading || elig.isLoading) && <Skeleton variant="rect" height={320} />}
      {(listing.isError || elig.isError) && <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => { void listing.refetch(); void elig.refetch(); } }} />}
      {listing.data && elig.data && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Card padding="lg" className="flex flex-col gap-4">
            <Link to={`/listings/${listing.data.id}`} className="flex gap-3 rounded-sm bg-sunken p-2">
              {listing.data.coverUrl && <img src={listing.data.coverUrl} alt="" className="size-14 shrink-0 rounded-xs object-cover dark:brightness-[.92]" />}
              <div className="min-w-0"><div className="truncate text-small font-medium text-ink">{listing.data.title}</div><div className="flex items-center gap-1 text-caption text-ink-3">{t('billing.secure.host')} {listing.data.owner.name}<TrustBadge level={listing.data.owner.trustLevel} size="inline" /></div></div>
            </Link>
            {blocked && (
              <div role="alert" className="flex items-start gap-2 rounded-sm bg-warning-soft px-3 py-2 text-small text-warning">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{blocked === 'disabled' ? t('billing.secure.comingTo', { state: elig.data.state ?? '' }) : blocked === 'inactive' ? t('billing.secure.listingInactive') : t('billing.secure.payeeNotEligible')}</span>
              </div>
            )}
            {elig.data.existing && (
              <p className="rounded-sm bg-info-soft px-3 py-2 text-small text-info">{t('billing.secure.existing')} <Link to={`/escrow/${elig.data.existing.id}`} className="underline">{t('billing.secure.open')}</Link></p>
            )}
            {isHost && !counterpartyParam && <p className="rounded-sm bg-sunken px-3 py-2 text-small text-ink-2">{t('billing.secure.hostFromChat')}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label={t('billing.secure.amount')} prefix="$" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 5))} error={amount && !amountOk ? t('billing.secure.amountRange', { min: formatMoney(DEPOSIT_MIN_CENTS), max: formatMoney(DEPOSIT_MAX_CENTS) }) : undefined} hint={t('billing.secure.amountHint', { min: formatMoney(DEPOSIT_MIN_CENTS), max: formatMoney(DEPOSIT_MAX_CENTS) })} required />
              <Input label={t('billing.secure.moveIn')} type="date" value={moveIn} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setMoveIn(e.target.value)} required />
            </div>
            <Select label={t('billing.secure.feeSplit')} value={feePayer} onChange={(v) => v && setFeePayer(v as typeof feePayer)} options={(['payer', 'payee', 'split'] as const).map((k) => ({ value: k, label: t(`billing.secure.feePayer.${k}`) }))} />
            <div className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-ink">{t('billing.secure.rail')}</span>
              <RailPicker value={effectiveRail} onChange={setRail} amountCents={amountCents} />
            </div>
            <Select label={t('billing.secure.inspection')} value={hours} onChange={(v) => v && setHours(v)} options={['24', '48', '72', '168'].map((h) => ({ value: h, label: t('billing.secure.hours', { n: h }) }))} />
            <Textarea label={t('billing.secure.note')} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} optional />
          </Card>
          <aside className="flex flex-col gap-3">
            <Card padding="lg" className="flex flex-col gap-3">
              <h2 className="text-h3 text-ink">{t('billing.secure.quote')}</h2>
              {quote.data && amountOk ? <QuoteLines quote={quote.data} feePayer={feePayer} /> : <p className="text-small text-ink-3">{t('billing.secure.amountRange', { min: formatMoney(DEPOSIT_MIN_CENTS), max: formatMoney(DEPOSIT_MAX_CENTS) })}</p>}
              <Button variant="primary" size="lg" fullWidth loading={create.isPending} disabled={!amountOk || !moveIn || !counterpartyId || !!blocked} onClick={submit} iconRight={<ArrowRight />}>{t('billing.secure.propose')}</Button>
              <p className="text-caption text-ink-3">{t('billing.secure.proposeHint', { amount: amountOk ? formatMoney(amountCents) : '—' })}</p>
            </Card>
            <TermsCard />
          </aside>
        </div>
      )}
    </div>
  );
}

function TermsCard() {
  const t = useT();
  return (
    <Card padding="md" variant="sunken" className="flex flex-col gap-2 text-small text-ink-2">
      <h3 className="flex items-center gap-2 text-small font-semibold text-ink"><ShieldCheck className="size-4 text-success" aria-hidden />{t('billing.secure.terms.title')}</h3>
      <ul className="flex list-disc flex-col gap-1 pl-4">
        <li>{t('billing.secure.terms.hold')}</li>
        <li>{t('billing.secure.terms.inspection')}</li>
        <li>{t('billing.secure.terms.refund')}</li>
        <li>{t('billing.secure.terms.dispute')}</li>
      </ul>
      <p className="text-caption text-ink-3">{t('billing.secure.terms.partner')}</p>
    </Card>
  );
}

// ---------------------------------------------------------------- detail
export function EscrowDetailPage() {
  return <RequireAuth><EscrowDetail /></RequireAuth>;
}

function EscrowDetail() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { formatMoney, formatDate } = useLocale();
  const q = useEscrow(id);
  const action = useEscrowAction();
  const [modal, setModal] = useState<null | 'fund' | 'dispute' | 'resolve' | 'receipt' | 'confirm-release' | 'confirm-refund' | 'confirm-cancel'>(null);
  const e = q.data;
  const role = e ? (e.payer.id === user?.id ? 'payer' : e.payee.id === user?.id ? 'payee' : 'admin') : null;
  const run = async (a: 'accept' | 'release' | 'refund' | 'cancel', body?: Record<string, unknown>) => {
    if (!e) return;
    try {
      await action.mutateAsync({ id: e.id, action: a, body });
      track(`escrow.${a}`, { amountCents: e.amountCents, state: e.status });
      toast.success(t(`billing.secure.done.${a}`));
      setModal(null);
    } catch (err) { toast.error(errorMessage(t, err)); }
  };
  if (q.isLoading) return <div className="mx-auto w-full max-w-detail px-4 lg:px-8"><Skeleton variant="rect" height={360} /></div>;
  if (q.isError || !e) return <div className="mx-auto w-full max-w-detail px-4 lg:px-8"><Head title={t('billing.secure.title')} /><EmptyState icon={CircleAlert} title={isApiError(q.error, 'FORBIDDEN') ? t('billing.secure.notParty') : isApiError(q.error, 'NOT_FOUND') ? t('error.NOT_FOUND') : t('error.generic')} action={<Button asChild variant="secondary"><Link to="/escrow">{t('billing.secure.listTitle')}</Link></Button>} /></div>;
  const has = (a: string) => e.actions.includes(a);
  const stepIndex = TIMELINE.indexOf(e.status as (typeof TIMELINE)[number]);
  const offPath = ['refunded', 'disputed', 'resolved', 'cancelled', 'expired'].includes(e.status);
  return (
    <div className="mx-auto w-full max-w-detail px-4 lg:px-8">
      <Head title={`${t('billing.secure.title')} · ${t('common.testMode')}`} />
      <div className="mb-3"><Button variant="ghost" size="sm" iconLeft={<ArrowLeft />} onClick={() => navigate('/escrow')}>{t('billing.secure.listTitle')}</Button></div>
      <TestModeBand className="mb-4" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-h1 text-ink">{t('billing.secure.title')}</h1>
        <EscrowStatusBadge status={e.status} size="md" />
        {role && role !== 'admin' && <Badge variant="neutral" size="sm">{t(`billing.secure.youAre.${role}`)}</Badge>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <Card padding="lg" className="flex flex-col gap-4">
            {e.listing && (
              <Link to={`/listings/${e.listing.id}`} className="flex gap-3 rounded-sm bg-sunken p-2">
                {e.listing.coverUrl && <img src={e.listing.coverUrl} alt="" className="size-16 shrink-0 rounded-xs object-cover dark:brightness-[.92]" />}
                <div className="min-w-0"><div className="truncate text-body font-semibold text-ink">{e.listing.title}</div><div className="text-caption text-ink-3">{e.listing.city}, {e.listing.state}</div></div>
              </Link>
            )}
            <div className="grid grid-cols-2 gap-3">
              <PartyRow label={t('billing.secure.role.payerOne')} user={e.payer} />
              <PartyRow label={t('billing.secure.role.payeeOne')} user={e.payee} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-small sm:grid-cols-3">
              <Fact label={t('billing.secure.deposit')} value={formatMoney(e.amountCents)} />
              <Fact label={t('billing.secure.moveIn')} value={e.moveInDate ? formatDate(e.moveInDate) : '—'} />
              <Fact label={t('billing.secure.inspection')} value={t('billing.secure.hours', { n: e.inspectionHours })} />
              <Fact label={t('billing.secure.rail')} value={t(`billing.secure.rails.${e.rail}`)} />
              <Fact label={t('billing.secure.feeSplit')} value={t(`billing.secure.feePayer.${e.feePayer}`)} />
              {e.inspectionDeadlineAt && <Fact label={t('billing.secure.deadline')} value={formatDate(e.inspectionDeadlineAt, 'datetime')} />}
            </dl>
            <StatusExplainer e={e} role={role} />
          </Card>

          <Card padding="lg" className="flex flex-col gap-3">
            <h2 className="text-h3 text-ink">{t('billing.secure.timeline')}</h2>
            <ol className="flex flex-col gap-0" aria-label={t('billing.secure.timeline')}>
              {TIMELINE.map((s, i) => {
                const ev = e.events.find((x) => x.toStatus === s);
                const done = !!ev || (stepIndex >= i && !offPath);
                const current = e.status === s;
                return <TimelineStep key={s} label={t(`billing.escrowStatus.${s}`)} at={ev?.createdAt ?? null} done={done} current={current} last={i === TIMELINE.length - 1 && !offPath} />;
              })}
              {offPath && (() => {
                const ev = [...e.events].reverse().find((x) => x.toStatus === e.status);
                return <TimelineStep label={t(`billing.escrowStatus.${e.status}`)} at={ev?.createdAt ?? null} done current last danger={e.status === 'disputed'} note={ev?.note ?? (e.status === 'disputed' ? e.disputeReason : null)} />;
              })()}
            </ol>
          </Card>
        </div>

        <aside className="flex flex-col gap-3">
          <Card padding="lg" className="flex flex-col gap-3">
            <h2 className="text-h3 text-ink">{t('billing.secure.money')}</h2>
            <QuoteLines quote={e.quote} feePayer={e.feePayer} />
            {e.resolution && (
              <div className="rounded-sm bg-sunken px-3 py-2 text-small text-ink-2">
                <div className="font-medium text-ink">{t(`billing.secure.resolution.${e.resolution}`)}</div>
                {e.resolution === 'split' && <div className="text-caption">{t('billing.secure.splitResult', { payer: formatMoney(e.resolutionPayerCents ?? 0), payee: formatMoney(e.resolutionPayeeCents ?? 0) })}</div>}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {has('accept') && <Button variant="primary" fullWidth loading={action.isPending} onClick={() => run('accept')} iconLeft={<Check />}>{t('billing.secure.action.accept')}</Button>}
              {has('fund') && <Button variant="primary" fullWidth onClick={() => setModal('fund')} iconLeft={<Lock />}>{t('billing.secure.action.fund', { amount: formatMoney(e.quote.payerTotalCents) })}</Button>}
              {has('release') && <Button variant="primary" fullWidth onClick={() => setModal('confirm-release')} iconLeft={<Home />}>{t('billing.secure.action.release')}</Button>}
              {has('refund') && <Button variant="secondary" fullWidth onClick={() => setModal('confirm-refund')} iconLeft={<Undo2 />}>{t('billing.secure.action.refund')}</Button>}
              {has('dispute') && <Button variant="ghost" fullWidth onClick={() => setModal('dispute')} iconLeft={<CircleAlert />}>{t('billing.secure.action.dispute')}</Button>}
              {has('resolve') && <Button variant="primary" fullWidth onClick={() => setModal('resolve')} iconLeft={<Gavel />}>{t('billing.secure.action.resolve')}</Button>}
              {has('cancel') && <Button variant="ghost" fullWidth onClick={() => setModal('confirm-cancel')} iconLeft={<XCircle />}>{t('billing.secure.action.cancel')}</Button>}
              {has('receipt') && <Button variant="ghost" size="sm" fullWidth onClick={() => setModal('receipt')} iconLeft={<FileText />}>{t('billing.secure.action.receipt')}</Button>}
              {e.conversationId && <Button asChild variant="ghost" size="sm" fullWidth><Link to={`/chat/${e.conversationId}`}>{t('billing.secure.openChat')}</Link></Button>}
            </div>
          </Card>
          <TermsCard />
        </aside>
      </div>

      {modal === 'fund' && <FundModal e={e} onClose={() => setModal(null)} />}
      {modal === 'dispute' && <DisputeModal e={e} onClose={() => setModal(null)} />}
      {modal === 'resolve' && <ResolveModal e={e} onClose={() => setModal(null)} />}
      {modal === 'receipt' && <ReceiptModal e={e} onClose={() => setModal(null)} />}
      {(modal === 'confirm-release' || modal === 'confirm-refund' || modal === 'confirm-cancel') && (
        <ConfirmModal kind={modal.slice(8) as 'release' | 'refund' | 'cancel'} e={e} pending={action.isPending} onClose={() => setModal(null)} onConfirm={(note) => run(modal.slice(8) as 'release' | 'refund' | 'cancel', modal === 'confirm-cancel' ? { reason: note || undefined } : { note: note || undefined })} />
      )}
    </div>
  );
}

function PartyRow({ label, user }: { label: string; user: EscrowDto['payer'] }) {
  return (
    <div className="flex items-center gap-2 rounded-sm border border-line px-2 py-2">
      <Avatar src={user.avatarUrl} name={user.name} size="sm" trustLevel={user.trustLevel} />
      <div className="min-w-0">
        <div className="text-caption text-ink-3">{label}</div>
        <div className="flex items-center gap-1 truncate text-small text-ink"><Link to={`/u/${user.id}`} className="truncate hover:underline">{user.name}</Link><TrustBadge level={user.trustLevel} size="inline" /></div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-ink-3">{label}</dt>
      <dd className="truncate text-ink tnum">{value}</dd>
    </div>
  );
}

function StatusExplainer({ e, role }: { e: EscrowDto; role: string | null }) {
  const t = useT();
  const { formatDate } = useLocale();
  const key = `billing.secure.explain.${e.status}`;
  const vars = { date: e.moveInDate ? formatDate(e.moveInDate) : '—', deadline: e.inspectionDeadlineAt ? formatDate(e.inspectionDeadlineAt, 'datetime') : '—', hours: e.inspectionHours };
  return (
    <p className={cn('flex items-start gap-2 rounded-sm px-3 py-2 text-small', e.status === 'disputed' ? 'bg-danger-soft text-danger' : 'bg-sunken text-ink-2')}>
      <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{t(key, vars)}{role === 'payee' && e.status === 'accepted' ? ` ${t('billing.secure.explain.payeeWait')}` : ''}</span>
    </p>
  );
}

function TimelineStep({ label, at, done, current, last, danger, note }: { label: string; at: string | null; done: boolean; current: boolean; last: boolean; danger?: boolean; note?: string | null }) {
  const { formatDate } = useLocale();
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0" aria-current={current ? 'step' : undefined}>
      {!last && <span className={cn('absolute left-[11px] top-6 h-[calc(100%-16px)] w-px', done ? 'bg-success' : 'bg-line')} aria-hidden />}
      <span className={cn('relative z-[1] flex size-6 shrink-0 items-center justify-center rounded-pill border', danger ? 'border-danger bg-danger-soft text-danger' : done ? 'border-success bg-success-soft text-success' : 'border-line-strong bg-surface text-ink-4')}>
        {done ? <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> : <span className="size-1.5 rounded-pill bg-current" />}
      </span>
      <div className="min-w-0 pt-0.5">
        <div className={cn('text-small', current ? 'font-semibold text-ink' : done ? 'text-ink' : 'text-ink-3')}>{label}</div>
        {at && <div className="text-caption text-ink-3 tnum">{formatDate(at, 'datetime')}</div>}
        {note && <p className="mt-1 text-caption text-ink-2">{note}</p>}
      </div>
    </li>
  );
}

function FundModal({ e, onClose }: { e: EscrowDto; onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const { formatMoney } = useLocale();
  const pms = usePaymentMethods();
  const fund = useFundEscrow();
  const [rail, setRail] = useState<EscrowRail>(e.rail);
  const [card, setCard] = useState<CardFormValue>(EMPTY_CARD);
  const [methodId, setMethodId] = useState<string>('new');
  const [failure, setFailure] = useState<string | null>(null);
  const quote = useEscrowQuote(e.amountCents, e.feePayer, rail);
  useEffect(() => { const def = pms.data?.find((m) => m.isDefault) ?? pms.data?.[0]; if (def) setMethodId(def.id); }, [pms.data]);
  const q = quote.data ?? e.quote;
  const submit = async () => {
    setFailure(null);
    try {
      const res = await fund.mutateAsync({ id: e.id, body: methodId === 'new' ? { card, rail } : { paymentMethodId: methodId, rail } });
      toast.success(t('billing.secure.done.fund'));
      onClose();
      navigate(`/billing/success?order=${res.order.id}`);
    } catch (err) {
      if (isApiError(err, 'PAYMENT_FAILED')) setFailure((err.data as { failureCode?: string })?.failureCode ?? 'card_declined');
      else toast.error(errorMessage(t, err));
    }
  };
  return (
    <Modal open onClose={onClose} title={t('billing.secure.fundTitle')} size="md" footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" loading={fund.isPending} disabled={methodId === 'new' && !cardValid(card)} onClick={submit}>{t('billing.checkout.payButton', { amount: formatMoney(q.payerTotalCents) })}</Button></>}>
      <div className="flex flex-col gap-4">
        <TestModeBand compact />
        <RailPicker value={rail} onChange={setRail} amountCents={e.amountCents} />
        <QuoteLines quote={q} feePayer={e.feePayer} />
        {(pms.data?.length ?? 0) > 0 && (
          <Select label={t('billing.checkout.payment')} value={methodId} onChange={(v) => v && setMethodId(v)} options={[...(pms.data ?? []).map((m) => ({ value: m.id, label: `${m.brand.toUpperCase()} •••• ${m.last4}` })), { value: 'new', label: t('billing.checkout.newCard') }]} />
        )}
        {methodId === 'new' && <CardForm value={card} onChange={setCard} showSave />}
        {failure && <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-small text-danger">{t(`billing.payment.failure.${failure}`)}</p>}
        <p className="text-caption text-ink-3">{t('billing.checkout.policy.escrow_deposit')}</p>
      </div>
    </Modal>
  );
}

function DisputeModal({ e, onClose }: { e: EscrowDto; onClose: () => void }) {
  const t = useT();
  const action = useEscrowAction();
  const [code, setCode] = useState('not_as_described');
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<UploaderFile[]>([]);
  const submit = async () => {
    try {
      await action.mutateAsync({ id: e.id, action: 'dispute', body: { reasonCode: code, reason: reason.trim(), evidenceUploadIds: files.filter((f) => f.uploadId).map((f) => f.uploadId!) } });
      track('escrow.dispute', { reason: code });
      toast.success(t('billing.secure.done.dispute'));
      onClose();
    } catch (err) { toast.error(errorMessage(t, err)); }
  };
  return (
    <Modal open onClose={onClose} title={t('billing.secure.disputeTitle')} description={t('billing.secure.disputeDescription')} size="md" footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" loading={action.isPending} disabled={reason.trim().length < 10} onClick={submit}>{t('common.submit')}</Button></>}>
      <div className="flex flex-col gap-3">
        <Select label={t('billing.secure.disputeReason')} value={code} onChange={(v) => v && setCode(v)} options={['fraud_listing', 'not_on_lease', 'not_as_described', 'no_access', 'other'].map((r) => ({ value: r, label: t(`billing.secure.disputeReasons.${r}`) }))} />
        <Textarea label={t('billing.secure.disputeDetails')} rows={4} maxLength={2000} showCount value={reason} onChange={(ev) => setReason(ev.target.value)} hint={t('billing.secure.disputeMin')} required />
        <PhotoUploader files={files} onChange={setFiles} onReorder={setFiles} max={6} purpose="other" isPrivate label={t('billing.secure.evidence')} />
        <p className="text-caption text-ink-3">{t('billing.secure.disputeSla')}</p>
      </div>
    </Modal>
  );
}

function ResolveModal({ e, onClose }: { e: EscrowDto; onClose: () => void }) {
  const t = useT();
  const { formatMoney } = useLocale();
  const action = useEscrowAction();
  const [resolution, setResolution] = useState<'release_to_payee' | 'refund_to_payer' | 'split'>('split');
  const [payee, setPayee] = useState(String(Math.floor(e.amountCents / 200)));
  const [reasonCode, setReasonCode] = useState('other');
  const [note, setNote] = useState('');
  const payeeCents = Math.min(e.amountCents, Math.round(Number(payee || 0) * 100));
  const submit = async () => {
    try {
      await action.mutateAsync({ id: e.id, action: 'resolve', body: { resolution, note: note.trim(), reasonCode, ...(resolution === 'split' ? { payeeCents, payerCents: e.amountCents - payeeCents } : {}) } });
      toast.success(t('billing.secure.done.resolve'));
      onClose();
    } catch (err) { toast.error(errorMessage(t, err)); }
  };
  return (
    <Modal open onClose={onClose} title={t('billing.secure.resolveTitle')} size="md" footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" loading={action.isPending} disabled={note.trim().length < 3} onClick={submit}>{t('billing.secure.action.resolve')}</Button></>}>
      <div className="flex flex-col gap-3">
        {e.disputeReason && <blockquote className="rounded-sm border-l-2 border-danger bg-sunken px-3 py-2 text-small text-ink-2">{e.disputeReason}</blockquote>}
        <Select label={t('billing.secure.resolution.label')} value={resolution} onChange={(v) => v && setResolution(v as typeof resolution)} options={(['release_to_payee', 'refund_to_payer', 'split'] as const).map((r) => ({ value: r, label: t(`billing.secure.resolution.${r}`) }))} />
        {resolution === 'split' && (
          <Input label={t('billing.secure.splitPayee')} prefix="$" inputMode="numeric" value={payee} onChange={(ev) => setPayee(ev.target.value.replace(/[^\d]/g, ''))} hint={t('billing.secure.splitHint', { payer: formatMoney(e.amountCents - payeeCents), total: formatMoney(e.amountCents) })} />
        )}
        <Select label={t('billing.secure.resolveReason')} value={reasonCode} onChange={(v) => v && setReasonCode(v)} options={['fraud', 'not_on_lease', 'not_as_described', 'tenant_fault', 'mutual', 'other'].map((r) => ({ value: r, label: t(`billing.secure.resolveReasons.${r}`) }))} />
        <Textarea label={t('billing.secure.resolveNote')} rows={3} value={note} onChange={(ev) => setNote(ev.target.value)} required />
      </div>
    </Modal>
  );
}

function ConfirmModal({ kind, e, pending, onClose, onConfirm }: { kind: 'release' | 'refund' | 'cancel'; e: EscrowDto; pending: boolean; onClose: () => void; onConfirm: (note: string) => void }) {
  const t = useT();
  const { formatMoney } = useLocale();
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title={t(`billing.secure.confirm.${kind}.title`)} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant={kind === 'release' ? 'primary' : 'danger'} loading={pending} onClick={() => onConfirm(note.trim())}>{t(`billing.secure.confirm.${kind}.cta`)}</Button></>}>
      <div className="flex flex-col gap-3">
        <p className="text-small text-ink-2">{t(`billing.secure.confirm.${kind}.body`, { amount: formatMoney(kind === 'release' ? e.quote.payeeNetCents : e.amountCents) })}</p>
        <Textarea label={t('billing.secure.note')} rows={2} maxLength={500} value={note} onChange={(ev) => setNote(ev.target.value)} optional />
      </div>
    </Modal>
  );
}

function ReceiptModal({ e, onClose }: { e: EscrowDto; onClose: () => void }) {
  const t = useT();
  const { formatDate } = useLocale();
  const rows = useMemo(() => e.events.map((ev) => ({ ...ev, label: t(`billing.escrowStatus.${ev.toStatus}`) })), [e.events, t]);
  return (
    <Modal open onClose={onClose} title={t('billing.secure.receiptTitle')} size="md" footer={<Button variant="secondary" onClick={() => window.print()}>{t('billing.secure.print')}</Button>}>
      <div className="flex flex-col gap-3 text-small">
        <TestModeBand compact />
        <div className="flex justify-between text-caption text-ink-3"><span>{t('billing.checkout.orderId')} {e.orderId?.slice(0, 8) ?? '—'}</span><span>{t('billing.secure.ref')} {e.id.slice(0, 8)}</span></div>
        <div className="font-medium text-ink">{e.listing?.title}</div>
        <div className="text-ink-2">{e.payer.name} → {e.payee.name}</div>
        <QuoteLines quote={e.quote} feePayer={e.feePayer} />
        <div className="text-caption text-ink-3">{t('billing.secure.rail')}: {t(`billing.secure.rails.${e.rail}`)}</div>
        <ul className="flex flex-col gap-1 border-t border-line pt-2">
          {rows.map((r) => <li key={r.id} className="flex justify-between gap-3 text-caption"><span className="text-ink-2">{r.label}</span><span className="tnum text-ink-3">{formatDate(r.createdAt, 'datetime')}</span></li>)}
        </ul>
      </div>
    </Modal>
  );
}
