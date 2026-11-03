// Password reset: step 1 request a code, step 2 code + new password (API.md §2.1).
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Input } from '../components';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { errorMessage, fieldError } from '../app/errors';
import { AuthLayout } from './auth/AuthLayout';

export default function Forgot() {
  const t = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const step = params.get('step') === 'reset' ? 'reset' : 'request';
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const request = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/request-password-reset', { method: 'POST', body: { email: email.trim() } });
      toast.info(t('forgot.sent'));
      setParams({ step: 'reset', email: email.trim() });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: { email: email.trim(), code: code.trim(), password } });
      toast.success(t('forgot.done'));
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={step === 'request' ? t('forgot.title') : t('forgot.resetTitle')}
      subtitle={step === 'request' ? t('forgot.subtitle') : t('forgot.resetSubtitle', { email })}
      footer={
        <Link to="/login" className="text-accent-text hover:underline">
          {t('forgot.backToLogin')}
        </Link>
      }
    >
      {step === 'request' ? (
        <form onSubmit={request} className="flex flex-col gap-4" noValidate>
          <Input label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError(t, error, 'email')} />
          {error != null && <p role="alert" className="text-small text-danger">{errorMessage(t, error)}</p>}
          <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
            {t('forgot.sendCode')}
          </Button>
        </form>
      ) : (
        <form onSubmit={reset} className="flex flex-col gap-4" noValidate>
          <Input label={t('auth.code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} error={fieldError(t, error, 'code')} className="font-mono" />
          <Input label={t('forgot.newPassword')} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError(t, error, 'password')} hint={t('register.passwordHint')} />
          {error != null && <p role="alert" className="text-small text-danger">{errorMessage(t, error)}</p>}
          <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
            {t('forgot.reset')}
          </Button>
          <div className="flex items-center justify-between text-small">
            <button type="button" className="text-accent-text hover:underline" onClick={() => setParams({})}>
              {t('forgot.resend')}
            </button>
            {import.meta.env.DEV && (
              <Link to="/dev/mailbox" className="text-ink-3 hover:underline">
                {t('verifyEmail.openDevMailbox')}
              </Link>
            )}
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
