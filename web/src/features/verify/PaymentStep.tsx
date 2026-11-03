// L3b — payment method on file (mock card, test mode). Writes payment_methods through /api/verify/payment-methods;
// the DTO is billing's PaymentMethod { id, brand, last4, expMonth, expYear, isDefault }.
import { useState, type FormEvent } from 'react';
import { CreditCard, Plus, Star, Trash2 } from 'lucide-react';
import type { PaymentMethod } from '@shared/types';
import { cardBrandOf, luhnValid } from '@shared/schemas/verify';
import { Badge, Button, Input } from '@/components';
import { ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { errorMessage, fieldError } from '@/app/errors';
import type { VerifyStatus } from './api';
import { useAddPaymentMethod, useRemovePaymentMethod, useSetDefaultPaymentMethod } from './api';
import { brandLabel } from './labels';

function formatCardNumber(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}
function formatExp(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits;
}

function MethodRow({ m, onDefault, onRemove, busy }: { m: PaymentMethod; onDefault: () => void; onRemove: () => void; busy: boolean }) {
  const t = useT();
  return (
    <li className="flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-sunken text-ink-2" aria-hidden><CreditCard size={18} strokeWidth={1.75} /></span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-body text-ink">
          <span className="font-medium">{brandLabel(t, m.brand)}</span>
          <span className="font-mono text-small text-ink-2">•••• {m.last4}</span>
          {m.isDefault && <Badge variant="neutral" size="sm">{t('verify.payment.default')}</Badge>}
        </p>
        <p className="text-caption text-ink-3">{t('verify.payment.expires', { month: String(m.expMonth).padStart(2, '0'), year: String(m.expYear).slice(-2) })}</p>
      </div>
      {!m.isDefault && <Button variant="ghost" size="sm" iconLeft={<Star />} onClick={onDefault} disabled={busy}>{t('verify.payment.setDefault')}</Button>}
      <Button variant="ghost" size="sm" iconOnly aria-label={t('verify.payment.remove')} onClick={onRemove} disabled={busy}><Trash2 /></Button>
    </li>
  );
}

export function PaymentStep({ status }: { status: VerifyStatus }) {
  const t = useT();
  const methods = status.steps.payment.methods;
  const [showForm, setShowForm] = useState(methods.length === 0);
  const [number, setNumber] = useState('');
  const [exp, setExp] = useState('');
  const [cvc, setCvc] = useState('');
  const [holder, setHolder] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const add = useAddPaymentMethod();
  const remove = useRemovePaymentMethod();
  const setDefault = useSetDefaultPaymentMethod();
  const busy = remove.isPending || setDefault.isPending;

  const digits = number.replace(/\D/g, '');
  const brand = digits.length >= 2 ? cardBrandOf(digits) : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const [mm, yy] = exp.replace(/\s/g, '').split('/');
    const expMonth = Number(mm);
    const expYear = yy ? (yy.length === 2 ? 2000 + Number(yy) : Number(yy)) : 0;
    if (!luhnValid(digits)) {
      setLocalError(t('verify.payment.declined.incorrect_number'));
      return;
    }
    try {
      await add.mutateAsync({ cardNumber: digits, expMonth, expYear, cvc, holderName: holder.trim() });
      track('verify.payment_add_ui', { brand: cardBrandOf(digits) });
      toast.success(t('verify.payment.added'));
      setNumber(''); setExp(''); setCvc(''); setHolder('');
      setShowForm(false);
    } catch { /* inline */ }
  };

  const declined = add.error instanceof ApiError && add.error.code === 'PAYMENT_FAILED' ? (add.error.data as { failureCode?: string } | undefined)?.failureCode : undefined;
  const declinedKey = declined ? `verify.payment.declined.${declined}` : null;
  const declinedMsg = declinedKey && t(declinedKey) !== declinedKey ? t(declinedKey) : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-ink-2">{t('verify.payment.description')}</p>
      {methods.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-caption text-ink-3">{t('verify.payment.onFile')}</h4>
          <ul className="flex flex-col gap-2">
            {methods.map((m) => (
              <MethodRow
                key={m.id}
                m={m}
                busy={busy}
                onDefault={() => setDefault.mutate(m.id)}
                onRemove={async () => {
                  try {
                    await remove.mutateAsync(m.id);
                    toast.info(t('verify.payment.removed'));
                  } catch (err) {
                    toast.error(errorMessage(t, err));
                  }
                }}
              />
            ))}
          </ul>
          {!showForm && <div><Button variant="secondary" size="sm" iconLeft={<Plus />} onClick={() => setShowForm(true)}>{t('verify.payment.addAnother')}</Button></div>}
        </div>
      )}
      {showForm && (
        <form onSubmit={onSubmit} className="flex max-w-form flex-col gap-3 rounded-card border border-line bg-sunken p-4" noValidate>
          <div className="flex items-center justify-between gap-2">
            <span className="text-small font-medium text-ink">{t('verify.step.payment')}</span>
            <Badge variant="warning" size="sm">{t('verify.payment.testMode')}</Badge>
          </div>
          <Input
            label={t('verify.payment.cardNumber')}
            inputMode="numeric"
            autoComplete="cc-number"
            value={number}
            onChange={(e) => setNumber(formatCardNumber(e.target.value))}
            iconLeft={<CreditCard />}
            suffix={brand ? brandLabel(t, brand) : undefined}
            inputClassName="font-mono"
            required
            error={fieldError(t, add.error, 'cardNumber')}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('verify.payment.exp')} placeholder={t('verify.payment.expHint')} inputMode="numeric" autoComplete="cc-exp" value={exp} onChange={(e) => setExp(formatExp(e.target.value))} inputClassName="font-mono" required error={fieldError(t, add.error, 'expMonth') ?? fieldError(t, add.error, 'expYear')} />
            <Input label={t('verify.payment.cvc')} inputMode="numeric" autoComplete="cc-csc" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} inputClassName="font-mono" required error={fieldError(t, add.error, 'cvc')} />
          </div>
          <Input label={t('verify.payment.holder')} autoComplete="cc-name" value={holder} onChange={(e) => setHolder(e.target.value)} required error={fieldError(t, add.error, 'holderName')} />
          <p className="text-caption text-ink-3">{t('verify.payment.testHint')}</p>
          {(localError || add.error != null) && (
            <p role="alert" className="text-small text-danger">{localError ?? declinedMsg ?? errorMessage(t, add.error)}</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" loading={add.isPending}>{t('verify.payment.add')}</Button>
            {methods.length > 0 && <Button variant="ghost" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>}
          </div>
        </form>
      )}
    </div>
  );
}
