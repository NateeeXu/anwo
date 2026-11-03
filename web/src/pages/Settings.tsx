// Settings (/settings): 资料 / 账号 / 偏好 / 隐私. PATCH /api/users/me, avatar via uploadFiles.
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Camera, Monitor, Moon, Sun } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { UserMe } from '@shared/types';
import { Gender } from '@shared/enums';
import { Avatar, Button, Card, Input, Modal, Select, Switch, Tabs, Textarea, TrustBadge } from '../components';
import { api, uploadFiles } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCampus } from '../lib/campus';
import { useLocale, useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { errorMessage, fieldError } from '../app/errors';
import { Head } from '../app/Head';
import { useThemePreference, type ThemePreference } from '../app/theme';

const TABS = ['profile', 'account', 'preferences', 'privacy'] as const;
type Tab = (typeof TABS)[number];

function useSaveMe() {
  const { setUser } = useAuth();
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api<UserMe>('/api/users/me', { method: 'PATCH', body }),
    onSuccess: (me) => {
      setUser(me);
      qc.invalidateQueries({ queryKey: ['users', 'profile', me.id] });
      toast.success(t('settings.saved'));
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
}

function ProfileTab({ user }: { user: UserMe }) {
  const t = useT();
  const save = useSaveMe();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: user.name,
    bio: user.bio ?? '',
    program: user.program ?? '',
    gradYear: user.gradYear ? String(user.gradYear) : '',
    languages: user.languages?.join(', ') ?? '',
    wechatId: user.wechatId ?? '',
    gender: user.gender ?? 'undisclosed',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onAvatar = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const [up] = await uploadFiles([files[0]], 'avatar');
      await save.mutateAsync({ avatarUploadId: up.id });
    } catch (err) {
      toast.error(errorMessage(t, err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({
      name: form.name.trim(),
      bio: form.bio.trim() || null,
      program: form.program.trim() || null,
      gradYear: form.gradYear ? Number(form.gradYear) : null,
      languages: form.languages.split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
      wechatId: form.wechatId.trim() || null,
      gender: form.gender,
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div className="flex items-center gap-4">
        <Avatar src={user.avatarUrl ?? undefined} name={user.name} size="xl" trustLevel={user.trustLevel as 0 | 1 | 2 | 3} />
        <div>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" id="avatar-file" onChange={(e) => onAvatar(e.target.files)} />
          <Button variant="secondary" size="sm" iconLeft={<Camera />} loading={uploading} onClick={() => fileRef.current?.click()}>
            {t('settings.changeAvatar')}
          </Button>
          <p className="mt-1 text-caption text-ink-3">{t('settings.avatarHint')}</p>
        </div>
      </div>
      <Input label={t('auth.name')} required maxLength={60} value={form.name} onChange={set('name')} error={fieldError(t, save.error, 'name')} />
      <Textarea label={t('settings.bio')} rows={3} maxLength={500} showCount value={form.bio} onChange={set('bio')} error={fieldError(t, save.error, 'bio')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('settings.program')} value={form.program} onChange={set('program')} />
        <Input label={t('settings.gradYear')} type="number" inputMode="numeric" min={2000} max={2040} value={form.gradYear} onChange={set('gradYear')} error={fieldError(t, save.error, 'gradYear')} />
        <Input label={t('settings.languages')} value={form.languages} onChange={set('languages')} hint={t('settings.languagesHint')} />
        <Input label={t('settings.wechat')} value={form.wechatId} onChange={set('wechatId')} hint={t('settings.wechatHint')} />
      </div>
      <Select label={t('settings.gender')} value={form.gender} onChange={(v: string) => setForm((f) => ({ ...f, gender: v as typeof f.gender }))} options={Gender.map((g) => ({ value: g, label: t(`settings.gender.${g}`) }))} />
      <div>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

function AccountTab({ user }: { user: UserMe }) {
  const t = useT();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwErr, setPwErr] = useState<unknown>(null);
  const [del, setDel] = useState(false);
  const [delPw, setDelPw] = useState('');
  const change = useMutation({
    mutationFn: () => api('/api/auth/change-password', { method: 'POST', body: { currentPassword: pw.current, newPassword: pw.next } }),
    onSuccess: () => {
      toast.success(t('settings.passwordChanged'));
      setPw({ current: '', next: '' });
      setPwErr(null);
    },
    onError: setPwErr,
  });
  const remove = useMutation({
    mutationFn: () => api('/api/users/me', { method: 'DELETE', body: { password: delPw } }),
    onSuccess: () => {
      setUser(null);
      toast.info(t('settings.deleted'));
      navigate('/');
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-h3 text-ink">{t('settings.accountInfo')}</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-body sm:grid-cols-[160px_1fr]">
          <dt className="text-small text-ink-2">{t('auth.email')}</dt>
          <dd className="text-ink">{user.email}</dd>
          <dt className="text-small text-ink-2">{t('verifyEmail.eduEmail')}</dt>
          <dd className="flex items-center gap-2 text-ink">
            {user.eduEmail ?? <span className="text-ink-3">{t('settings.notVerified')}</span>}
            {user.trustLevel < 1 && (
              <Link to="/verify-email" className="text-small text-accent-text hover:underline">
                {t('guard.trust.verifyEmail')}
              </Link>
            )}
          </dd>
          <dt className="text-small text-ink-2">{t('settings.trust')}</dt>
          <dd>
            <span className="flex items-center gap-2">
              <TrustBadge level={user.trustLevel as 0 | 1 | 2 | 3} size="card" showLabel />
              <Link to="/verify" className="text-small text-accent-text hover:underline">
                {t('settings.verifyMore')}
              </Link>
            </span>
          </dd>
          <dt className="text-small text-ink-2">{t('settings.referral')}</dt>
          <dd className="font-mono text-ink">{user.referralCode}</dd>
        </dl>
      </section>
      <section>
        <h2 className="text-h3 text-ink">{t('settings.changePassword')}</h2>
        <form
          className="mt-3 flex max-w-form flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            change.mutate();
          }}
        >
          <Input label={t('settings.currentPassword')} type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} error={fieldError(t, pwErr, 'currentPassword')} />
          <Input label={t('forgot.newPassword')} type="password" autoComplete="new-password" minLength={8} required value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} error={fieldError(t, pwErr, 'newPassword')} hint={t('register.passwordHint')} />
          {pwErr != null && <p role="alert" className="text-small text-danger">{errorMessage(t, pwErr)}</p>}
          <div>
            <Button type="submit" variant="primary" loading={change.isPending}>{t('settings.updatePassword')}</Button>
          </div>
        </form>
      </section>
      <section>
        <h2 className="text-h3 text-danger">{t('settings.dangerZone')}</h2>
        <p className="mt-1 text-small text-ink-2">{t('settings.deleteHint')}</p>
        <Button variant="secondary" className="mt-3 text-danger" onClick={() => setDel(true)}>
          {t('settings.deleteAccount')}
        </Button>
        <Modal
          open={del}
          onClose={() => setDel(false)}
          title={t('settings.deleteAccount')}
          description={t('settings.deleteConfirm')}
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDel(false)}>{t('common.cancel')}</Button>
              <Button variant="danger" loading={remove.isPending} disabled={!delPw} onClick={() => remove.mutate()}>{t('settings.deleteAccount')}</Button>
            </div>
          }
        >
          <Input label={t('auth.password')} type="password" autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} />
        </Modal>
      </section>
    </div>
  );
}

function PreferencesTab({ user }: { user: UserMe }) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const { campuses, setCampus } = useCampus();
  const [theme, setTheme] = useThemePreference();
  const save = useSaveMe();
  const campusOptions = useMemo(
    () => [...campuses].sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: locale === 'zh-CN' && c.nameZh ? `${c.nameZh} ${c.shortName}` : c.name, description: `${c.city}, ${c.state}` })),
    [campuses, locale],
  );
  const themes: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
    { value: 'system', label: t('settings.theme.system'), Icon: Monitor },
    { value: 'light', label: t('settings.theme.light'), Icon: Sun },
    { value: 'dark', label: t('settings.theme.dark'), Icon: Moon },
  ];
  return (
    <div className="flex max-w-form flex-col gap-5">
      <Select
        label={t('auth.campus')}
        searchable
        options={campusOptions}
        value={user.campusId ?? ''}
        onChange={(v: string) => {
          setCampus(v);
          save.mutate({ campusId: v });
        }}
      />
      <Select
        label={t('auth.language')}
        options={[
          { value: 'zh-CN', label: '中文' },
          { value: 'en', label: 'English' },
        ]}
        value={locale}
        onChange={(v: string) => {
          setLocale(v as 'zh-CN' | 'en');
          save.mutate({ locale: v });
        }}
      />
      <div>
        <p className="mb-2 text-caption text-ink-2">{t('settings.theme')}</p>
        <div role="radiogroup" aria-label={t('settings.theme')} className="flex gap-2">
          {themes.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={theme === value ? 'flex h-10 items-center gap-2 rounded-ctl border border-inverse bg-inverse px-3 text-small text-ink-inverse' : 'flex h-10 items-center gap-2 rounded-ctl border border-line-strong bg-surface px-3 text-small text-ink hover:bg-sunken'}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-caption text-ink-3">{t('settings.themeHint')}</p>
      </div>
      <Switch label={t('settings.emailDigest')} checked={user.emailDigestOptIn} onChange={(v: boolean) => save.mutate({ emailDigestOptIn: v })} />
    </div>
  );
}

function PrivacyTab({ user }: { user: UserMe }) {
  const t = useT();
  const save = useSaveMe();
  const [phone, setPhone] = useState(user.phone ?? '');
  return (
    <div className="flex max-w-form flex-col gap-6">
      <Card padding="md" className="flex flex-col gap-2">
        <Switch label={t('settings.verifiedOnly')} checked={user.verifiedOnlyMessaging} onChange={(v: boolean) => save.mutate({ verifiedOnlyMessaging: v })} />
        <p className="text-small text-ink-2">{t('settings.verifiedOnlyHint')}</p>
      </Card>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ phone: phone.trim() || null });
        }}
      >
        <Input label={t('settings.phone')} type="tel" autoComplete="tel" placeholder="+1 312 555 0100" value={phone} onChange={(e) => setPhone(e.target.value)} hint={user.phoneVerifiedAt ? t('settings.phoneVerified') : t('settings.phoneHint')} error={fieldError(t, save.error, 'phone')} />
        <div>
          <Button type="submit" variant="secondary" loading={save.isPending}>{t('common.save')}</Button>
        </div>
      </form>
      <p className="text-small text-ink-3">
        {t('settings.privacyNote')}{' '}
        <Link to="/privacy" className="text-accent-text hover:underline">{t('nav.privacy')}</Link>
      </p>
    </div>
  );
}

export default function Settings() {
  const t = useT();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'profile') as Tab;
  if (!user) return null;
  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('settings.title')} />
      <h1 className="text-h1-sm md:text-h1 text-ink">{t('settings.title')}</h1>
      <div className="mt-4">
        <Tabs variant="underline" scrollable value={tab} onChange={(k: string) => setParams({ tab: k })} items={TABS.map((k) => ({ key: k, label: t(`settings.tab.${k}`) }))} />
      </div>
      <div className="mt-6">
        {tab === 'profile' && <ProfileTab user={user} />}
        {tab === 'account' && <AccountTab user={user} />}
        {tab === 'preferences' && <PreferencesTab user={user} />}
        {tab === 'privacy' && <PrivacyTab user={user} />}
      </div>
    </div>
  );
}
