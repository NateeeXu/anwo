// L3a — phone verification through the mock SMS mailbox.
import { useState, type FormEvent } from 'react';
import { CircleCheck, MessageSquareText } from 'lucide-react';
import { Link } from 'react-router';
import { Button, Input } from '@/components';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { errorMessage, fieldError } from '@/app/errors';
import type { VerifyStatus } from './api';
import { useConfirmPhone, useRequestPhone } from './api';

const E164 = /^\+[1-9]\d{6,14}$/;

/** Normalises user input like "847 555 0100" or "(847) 555-0100" into E.164 (defaults to +1). */
export function toE164(raw: string): string {
  const s = raw.trim().replace(/[\s()-]/g, '');
  if (s.startsWith('+')) return s;
  if (s.startsWith('00')) return `+${s.slice(2)}`;
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

export function PhoneStep({ status }: { status: VerifyStatus }) {
  const t = useT();
  const { formatDate } = useLocale();
  const step = status.steps.phone;
  const [phone, setPhone] = useState(step.phone ?? '');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<'request' | 'confirm'>('request');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [localError, setLocalError] = useState<string | null>(null);
  const request = useRequestPhone();
  const confirm = useConfirmPhone();

  if (step.done) {
    return (
      <div className="flex flex-col gap-2 text-small text-ink-2">
        <p className="flex items-center gap-2 text-body text-ink"><CircleCheck className="size-4 text-success" aria-hidden />{t('verify.phone.verified', { phone: step.maskedPhone ?? '' })}</p>
        {step.at && <p className="text-ink-3">{t('verify.step.doneAt', { date: formatDate(step.at, 'long') })}</p>}
      </div>
    );
  }

  const onRequest = async (e?: FormEvent) => {
    e?.preventDefault();
    setLocalError(null);
    const e164 = toE164(phone);
    if (!E164.test(e164)) {
      setLocalError(t('verify.phone.invalid'));
      return;
    }
    setPhone(e164);
    try {
      const r = await request.mutateAsync(e164);
      setDevCode(r.devCode);
      setPhase('confirm');
      track('verify.phone_request_ui');
    } catch { /* inline */ }
  };
  const onConfirm = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await confirm.mutateAsync(code.trim());
      toast.success(t('verify.phone.success'));
    } catch { /* inline */ }
  };

  return (
    <div className="flex max-w-form flex-col gap-4">
      <p className="text-small text-ink-2">{t('verify.phone.description')}</p>
      {phase === 'request' ? (
        <form onSubmit={onRequest} className="flex flex-col gap-3" noValidate>
          <Input label={t('verify.phone.number')} type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} hint={t('verify.phone.numberHint')} error={localError ?? fieldError(t, request.error, 'phone')} />
          {request.error != null && !fieldError(t, request.error, 'phone') && <p role="alert" className="text-small text-danger">{errorMessage(t, request.error)}</p>}
          <div><Button type="submit" variant="primary" loading={request.isPending} iconLeft={<MessageSquareText />}>{t('verify.phone.send')}</Button></div>
        </form>
      ) : (
        <form onSubmit={onConfirm} className="flex flex-col gap-3" noValidate>
          <p className="text-small text-ink-2">{t('verify.phone.sentTo', { phone })}</p>
          <Input label={t('verify.phone.code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} inputClassName="font-mono tracking-[0.3em]" error={fieldError(t, confirm.error, 'code')} />
          {import.meta.env.DEV && (
            <p className="rounded-card bg-sunken p-3 text-small text-ink-2">
              {t('verify.dev.hint')}{' '}
              {devCode ? <button type="button" className="font-mono text-ink hover:underline" onClick={() => setCode(devCode)}>{devCode}</button> : <Link to="/dev/mailbox" className="text-accent-text hover:underline">{t('verify.dev.mailbox')}</Link>}
            </p>
          )}
          {confirm.error != null && <p role="alert" className="text-small text-danger">{errorMessage(t, confirm.error)}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" loading={confirm.isPending}>{t('verify.phone.confirm')}</Button>
            <Button variant="ghost" size="sm" onClick={() => setPhase('request')}>{t('verify.phone.change')}</Button>
            <Button variant="ghost" size="sm" onClick={() => onRequest()} loading={request.isPending}>{t('verify.edu.resend')}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
