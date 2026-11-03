// Route guards. Wrap route elements: <RequireAuth><Settings /></RequireAuth>.
import type { ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Button, EmptyState } from '../components';
import { NeedVerification } from '../components/illustrations';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { PageSkeleton } from './PageSkeleton';

export function loginPath(next: string) {
  return `/login?next=${encodeURIComponent(next)}`;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <PageSkeleton />;
  if (status === 'anon') return <Navigate to={loginPath(loc.pathname + loc.search)} replace />;
  return <>{children}</>;
}

export function RequireRole({ role, children }: { role: 'admin' | 'landlord' | 'student'; children: ReactNode }) {
  const { user, status } = useAuth();
  const loc = useLocation();
  const t = useT();
  const navigate = useNavigate();
  if (status === 'loading') return <PageSkeleton />;
  if (status === 'anon') return <Navigate to={loginPath(loc.pathname + loc.search)} replace />;
  if (user?.role !== role && user?.role !== 'admin') {
    return (
      <div className="mx-auto max-w-content px-4 lg:px-8">
        <EmptyState
          icon={<NeedVerification />}
          title={t('guard.forbidden.title')}
          description={t('guard.forbidden.description')}
          action={<Button variant="primary" onClick={() => navigate('/')}>{t('nav.home')}</Button>}
        />
      </div>
    );
  }
  return <>{children}</>;
}

/** Verification nudge shown when the user's trust level is below `required` (never a dead end). */
export function VerificationNudge({ required, reason }: { required: number; reason?: string }) {
  const t = useT();
  const navigate = useNavigate();
  const loc = useLocation();
  const next = encodeURIComponent(loc.pathname + loc.search);
  const target = required <= 1 ? `/verify-email?next=${next}${reason ? `&reason=${reason}` : ''}` : `/verify?next=${next}`;
  return (
    <div className="mx-auto max-w-content px-4 lg:px-8">
      <EmptyState
        icon={<NeedVerification />}
        title={required <= 1 ? t('guard.trust.emailTitle') : t('guard.trust.idTitle', { level: required })}
        description={required <= 1 ? t('guard.trust.emailDescription') : t('guard.trust.idDescription')}
        action={<Button variant="primary" onClick={() => navigate(target)}>{required <= 1 ? t('guard.trust.verifyEmail') : t('guard.trust.goVerify')}</Button>}
        secondaryAction={<Button variant="secondary" onClick={() => navigate(-1)}>{t('common.back')}</Button>}
      />
    </div>
  );
}

export function RequireTrust({ level, children, reason }: { level: number; children: ReactNode; reason?: string }) {
  const { user, status } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <PageSkeleton />;
  if (status === 'anon' || !user) return <Navigate to={loginPath(loc.pathname + loc.search)} replace />;
  if ((user.trustLevel ?? 0) < level) return <VerificationNudge required={level} reason={reason} />;
  return <>{children}</>;
}
