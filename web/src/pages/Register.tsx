import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { UserMe } from '@shared/types';
import { campusForEmail } from '@shared/campuses';
import { Button, Input, Select } from '../components';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCampus } from '../lib/campus';
import { useLocale, useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { track } from '../lib/track';
import { errorMessage, fieldError } from '../app/errors';
import { AuthLayout } from './auth/AuthLayout';

export default function Register() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const { setUser } = useAuth();
  const { campusId: currentCampus, campuses, setCampus } = useCampus();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [campusId, setCampusId] = useState<string>(currentCampus ?? '');
  const [touchedCampus, setTouchedCampus] = useState(false);
  const [referralCode, setReferralCode] = useState(params.get('ref') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const eduCampus = useMemo(() => (email.includes('@') ? campusForEmail(email.trim()) : undefined), [email]);
  const effectiveCampus = !touchedCampus && eduCampus ? eduCampus.id : campusId;

  const campusOptions = useMemo(
    () =>
      [...campuses]
        .sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name))
        .map((c) => ({ value: c.id, label: locale === 'zh-CN' && c.nameZh ? `${c.nameZh} ${c.shortName}` : c.name, description: `${c.city}, ${c.state}` })),
    [campuses, locale],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await api<UserMe>('/api/auth/register', {
        method: 'POST',
        body: { name: name.trim(), email: email.trim(), password, locale, campusId: effectiveCampus || undefined, referralCode: referralCode.trim() || undefined },
      });
      setUser(user);
      if (effectiveCampus) setCampus(effectiveCampus);
      track('auth.register', { eduCodeSent: !!user.eduCodeSent });
      toast.success(t('register.success'));
      if (user.eduCodeSent) navigate(`/verify-email?email=${encodeURIComponent(email.trim())}&next=${encodeURIComponent(next)}`, { replace: true });
      else navigate(next.startsWith('/') ? next : '/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={t('register.title')}
      subtitle={t('register.subtitle')}
      footer={
        <>
          {t('register.haveAccount')}{' '}
          <Link to="/login" className="text-accent-text hover:underline">
            {t('auth.login')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Input label={t('auth.name')} name="name" autoComplete="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} error={fieldError(t, error, 'name')} />
        <Input
          label={t('auth.email')}
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError(t, error, 'email')}
          hint={eduCampus ? t('register.eduHint', { campus: eduCampus.shortName }) : t('register.eduTip')}
        />
        <Input label={t('auth.password')} type="password" name="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError(t, error, 'password')} hint={t('register.passwordHint')} />
        <Select
          label={t('auth.campus')}
          searchable
          placeholder={t('campus.choose')}
          options={campusOptions}
          value={effectiveCampus}
          onChange={(v: string) => {
            setTouchedCampus(true);
            setCampusId(v);
          }}
          error={fieldError(t, error, 'campusId')}
        />
        <Input label={t('register.referral')} name="referralCode" maxLength={8} value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())} error={fieldError(t, error, 'referralCode')} hint={t('register.referralHint')} />
        <Select
          label={t('auth.language')}
          options={[
            { value: 'zh-CN', label: '中文' },
            { value: 'en', label: 'English' },
          ]}
          value={locale}
          onChange={(v: string) => setLocale(v as 'zh-CN' | 'en')}
        />
        {error != null && (
          <p role="alert" className="text-small text-danger">
            {errorMessage(t, error)}
          </p>
        )}
        <p className="text-caption text-ink-3">
          {t('register.agree')}{' '}
          <Link to="/terms" className="text-accent-text hover:underline">
            {t('nav.terms')}
          </Link>{' '}
          ·{' '}
          <Link to="/privacy" className="text-accent-text hover:underline">
            {t('nav.privacy')}
          </Link>
        </p>
        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
          {t('auth.register')}
        </Button>
      </form>
    </AuthLayout>
  );
}
