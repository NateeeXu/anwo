import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Input } from '../components';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { errorMessage, fieldError } from '../app/errors';
import { AuthLayout } from './auth/AuthLayout';

const DEV_ACCOUNTS = ['admin@example.edu', 'alice@u.northwestern.edu', 'bob@u.northwestern.edu', 'landlord@evanstonhomes.com', 'newbie@u.northwestern.edu'];

export default function Login() {
  const t = useT();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      toast.success(t('login.success'));
      navigate(next.startsWith('/') ? next : '/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={t('login.title')}
      subtitle={t('login.subtitle')}
      footer={
        <>
          {t('login.noAccount')}{' '}
          <Link to={`/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-accent-text hover:underline">
            {t('auth.register')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Input label={t('auth.email')} type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError(t, error, 'email')} />
        <Input label={t('auth.password')} type="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError(t, error, 'password')} />
        {error != null && !fieldError(t, error, 'email') && !fieldError(t, error, 'password') && (
          <p role="alert" className="text-small text-danger">
            {errorMessage(t, error)}
          </p>
        )}
        <div className="flex items-center justify-between">
          <Link to="/forgot" className="text-small text-accent-text hover:underline">
            {t('login.forgot')}
          </Link>
        </div>
        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
          {t('auth.login')}
        </Button>
      </form>
      {import.meta.env.DEV && (
        <details className="mt-6 rounded-card bg-sunken p-3 text-small text-ink-2">
          <summary className="cursor-pointer text-caption text-ink-3">{t('login.devAccounts')}</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {DEV_ACCOUNTS.map((a) => (
              <li key={a}>
                <button type="button" className="font-mono text-ink hover:underline" onClick={() => { setEmail(a); setPassword('Passw0rd!'); }}>
                  {a}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-ink-3">{t('login.devPassword')}</p>
        </details>
      )}
    </AuthLayout>
  );
}
