// L1 — school email code flow (aliases of /api/auth/*-edu-code through /api/verify/edu/*).
import { useState, type FormEvent } from 'react';
import { CircleCheck, MailCheck } from 'lucide-react';
import { Link } from 'react-router';
import { isEduEmail } from '@shared/campuses';
import { Button, Input } from '@/components';
import { useAuth } from '@/lib/auth';
import { useCampus, getCampusById } from '@/lib/campus';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { errorMessage, fieldError } from '@/app/errors';
import type { VerifyStatus } from './api';
import { useConfirmEdu, useRequestEdu } from './api';

export function EduStep({ status }: { status: VerifyStatus }) {
  const t = useT();
  const { formatDate } = useLocale();
  const { user } = useAuth();
  const { setCampus } = useCampus();
  const step = status.steps.edu;
  const [email, setEmail] = useState(user?.eduEmail ?? (user?.email && isEduEmail(user.email) ? user.email : ''));
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<'request' | 'confirm'>('request');
  const [devCode, setDevCode] = useState<string | undefined>();
  const request = useRequestEdu();
  const confirm = useConfirmEdu();

  if (step.done) {
    const campus = getCampusById(step.campusId);
    return (
      <div className="flex flex-col gap-2 text-small text-ink-2">
        <p className="flex items-center gap-2 text-body text-ink">
          <CircleCheck className="size-4 text-success" aria-hidden />
          {t('verify.edu.verified', { email: step.email ?? '' })}
        </p>
        {campus && <p>{t('verify.edu.campus', { campus: campus.shortName })}</p>}
        {step.at && <p className="text-ink-3">{t('verify.step.doneAt', { date: formatDate(step.at, 'long') })}</p>}
      </div>
    );
  }

  const onRequest = async (e?: FormEvent) => {
    e?.preventDefault();
    try {
      const r = await request.mutateAsync(email.trim());
      setDevCode(r.devCode);
      setPhase('confirm');
      track('verify.edu_request_ui');
    } catch { /* shown inline */ }
  };
  const onConfirm = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const me = await confirm.mutateAsync({ email: email.trim(), code: code.trim() });
      if (me.campusId) setCampus(me.campusId);
      toast.success(t('verify.edu.success'));
    } catch { /* shown inline */ }
  };

  return (
    <div className="flex max-w-form flex-col gap-4">
      <p className="text-small text-ink-2">{t('verify.edu.description')}</p>
      {phase === 'request' ? (
        <form onSubmit={onRequest} className="flex flex-col gap-3" noValidate>
          <Input label={t('verify.edu.email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} hint={t('verify.edu.emailHint')} error={fieldError(t, request.error, 'email')} />
          {request.error != null && !fieldError(t, request.error, 'email') && <p role="alert" className="text-small text-danger">{errorMessage(t, request.error)}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" loading={request.isPending} iconLeft={<MailCheck />}>{t('verify.edu.send')}</Button>
            <Link to="/verify-email?next=%2Fverify" className="text-small text-ink-2 hover:text-ink hover:underline">{t('verify.edu.openPage')}</Link>
          </div>
        </form>
      ) : (
        <form onSubmit={onConfirm} className="flex flex-col gap-3" noValidate>
          <p className="text-small text-ink-2">{t('verify.edu.sentTo', { email })}</p>
          <Input label={t('verify.edu.code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} inputClassName="font-mono tracking-[0.3em]" error={fieldError(t, confirm.error, 'code')} />
          {import.meta.env.DEV && (
            <p className="rounded-card bg-sunken p-3 text-small text-ink-2">
              {t('verify.dev.hint')}{' '}
              {devCode ? (
                <button type="button" className="font-mono text-ink hover:underline" onClick={() => setCode(devCode)}>{devCode}</button>
              ) : (
                <Link to="/dev/mailbox" className="text-accent-text hover:underline">{t('verify.dev.mailbox')}</Link>
              )}
            </p>
          )}
          {confirm.error != null && <p role="alert" className="text-small text-danger">{errorMessage(t, confirm.error)}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" loading={confirm.isPending}>{t('verify.edu.confirm')}</Button>
            <Button variant="ghost" size="sm" onClick={() => setPhase('request')}>{t('verify.edu.changeEmail')}</Button>
            <Button variant="ghost" size="sm" onClick={() => onRequest()} loading={request.isPending}>{t('verify.edu.resend')}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
