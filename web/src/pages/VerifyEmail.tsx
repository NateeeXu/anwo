// .edu email verification: request a code, confirm it, explain what trust level 1 unlocks.
import { useState, type FormEvent } from 'react';
import { CircleCheck, MailCheck } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { UserMe } from '@shared/types';
import { isEduEmail } from '@shared/campuses';
import { Button, Input, TrustBadge } from '../components';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCampus } from '../lib/campus';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { track } from '../lib/track';
import { errorMessage, fieldError } from '../app/errors';
import { RequireAuth } from '../app/guards';
import { AuthLayout } from './auth/AuthLayout';

type RequestResult = { sent: true; expiresInSec: number; campusId: string | null; devCode?: string };

function VerifyEmailInner() {
  const t = useT();
  const { user, setUser } = useAuth();
  const { setCampus } = useCampus();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const reason = params.get('reason');
  const initialEmail = params.get('email') ?? user?.eduEmail ?? (user?.email && isEduEmail(user.email) ? user.email : '');
  const alreadyVerified = (user?.trustLevel ?? 0) >= 1;
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'request' | 'confirm' | 'done'>(alreadyVerified ? 'done' : params.get('email') ? 'confirm' : 'request');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const request = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<RequestResult>('/api/auth/request-edu-code', { method: 'POST', body: { email: email.trim() } });
      setDevCode(r.devCode);
      setStep('confirm');
      toast.info(t('verifyEmail.sent', { email: email.trim() }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await api<UserMe>('/api/auth/confirm-edu-code', { method: 'POST', body: { email: email.trim(), code: code.trim() } });
      setUser(me);
      if (me.campusId) setCampus(me.campusId);
      track('verify.edu_confirmed_ui');
      setStep('done');
      toast.success(t('verifyEmail.success'));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'done') {
    return (
      <AuthLayout title={t('verifyEmail.doneTitle')}>
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex size-[72px] items-center justify-center rounded-pill bg-success-soft text-success">
            <CircleCheck className="size-10" strokeWidth={1.5} aria-hidden />
          </span>
          <TrustBadge level={Math.max(1, user?.trustLevel ?? 1) as 1 | 2 | 3} size="profile" showLabel />
          <p className="text-body text-ink-2">{t('verifyEmail.doneDescription')}</p>
          <ul className="w-full rounded-card bg-sunken p-4 text-left text-small text-ink-2">
            <li>· {t('verifyEmail.unlock1')}</li>
            <li>· {t('verifyEmail.unlock2')}</li>
            <li>· {t('verifyEmail.unlock3')}</li>
          </ul>
          <div className="grid w-full gap-2 sm:grid-cols-2">
            <Button variant="primary" onClick={() => navigate(next.startsWith('/') ? next : '/')}>
              {reason === 'post' ? t('common.publish') : t('common.continue')}
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/verify">{t('verifyEmail.nextLevel')}</Link>
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('verifyEmail.title')} subtitle={reason === 'post' ? t('verifyEmail.reasonPost') : t('verifyEmail.subtitle')}>
      {step === 'request' ? (
        <form onSubmit={request} className="flex flex-col gap-4" noValidate>
          <Input label={t('verifyEmail.eduEmail')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError(t, error, 'email')} hint={t('verifyEmail.eduEmailHint')} />
          {error != null && <p role="alert" className="text-small text-danger">{errorMessage(t, error)}</p>}
          <Button type="submit" variant="primary" size="lg" fullWidth loading={busy} iconLeft={<MailCheck />}>
            {t('verifyEmail.sendCode')}
          </Button>
        </form>
      ) : (
        <form onSubmit={confirm} className="flex flex-col gap-4" noValidate>
          <p className="text-small text-ink-2">{t('verifyEmail.codeSentTo', { email })}</p>
          <Input label={t('auth.code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} error={fieldError(t, error, 'code')} className="font-mono tracking-[0.3em]" />
          {import.meta.env.DEV && (
            <p className="rounded-card bg-sunken p-3 text-small text-ink-2">
              {t('verifyEmail.devHint')}{' '}
              {devCode ? (
                <button type="button" className="font-mono text-ink hover:underline" onClick={() => setCode(devCode)}>
                  {devCode}
                </button>
              ) : (
                <Link to="/dev/mailbox" className="text-accent-text hover:underline">
                  {t('verifyEmail.openDevMailbox')}
                </Link>
              )}
            </p>
          )}
          {error != null && <p role="alert" className="text-small text-danger">{errorMessage(t, error)}</p>}
          <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
            {t('verifyEmail.confirm')}
          </Button>
          <div className="flex items-center justify-between text-small">
            <button type="button" className="text-accent-text hover:underline" onClick={() => setStep('request')}>
              {t('verifyEmail.changeEmail')}
            </button>
            <button type="button" className="text-ink-2 hover:underline" onClick={() => request()} disabled={busy}>
              {t('forgot.resend')}
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}

export default function VerifyEmail() {
  return (
    <RequireAuth>
      <VerifyEmailInner />
    </RequireAuth>
  );
}
