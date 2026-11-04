// /verify — verification center (DESIGN.md §7.7): level progress 0→3, the ladder of steps, status history, badge rail.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleAlert, ShieldCheck } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Button, Card, EmptyState, Skeleton, Switch, TrustBadge } from '@/components';
import { useAuth } from '@/lib/auth';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/app/errors';
import { RequireAuth } from '@/app/guards';
import { Head } from '@/app/Head';
import type { NextStep, VerifyStatus } from './api';
import { useVerifyStatus, useVerifiedOnlySetting } from './api';
import { StepRow, type StepState } from './StepRow';
import { EduStep } from './EduStep';
import { ID_TYPES } from './labels';
import { IdStep } from './IdStep';
import { PhoneStep } from './PhoneStep';
import { PaymentStep } from './PaymentStep';
import { Timeline } from './Timeline';

type StepKey = Exclude<NextStep, null>;
const STEPS: StepKey[] = ['edu', 'id', 'phone', 'payment'];

function LevelProgress({ status }: { status: VerifyStatus }) {
  const t = useT();
  const level = status.trustLevel;
  const next = status.nextStep;
  return (
    <Card padding="md" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex items-center gap-4">
        <span className="text-display tnum text-ink">{t('verify.level', { level })}</span>
        <div className="flex flex-col">
          <span className="text-caption text-ink-3">{t('verify.level.current')}</span>
          <TrustBadge level={level} size="profile" showLabel noTooltip />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <ol className="grid grid-cols-3 gap-1.5" aria-label={t('verify.level.current')}>
          {[1, 2, 3].map((l) => (
            <li key={l} className={cn('h-2 rounded-pill', l <= level ? 'bg-accent' : 'bg-line')} aria-current={l === level ? 'step' : undefined} />
          ))}
        </ol>
        <div className="flex justify-between text-caption text-ink-3">
          {[1, 2, 3].map((l) => <span key={l} className={cn(l <= level && 'text-ink-2')}>{t(`ui.trust.l${l}`)}</span>)}
        </div>
        <p className="text-small text-ink-2">{next ? t('verify.level.next', { step: t(`verify.step.${next}`) }) : t('verify.level.done')}</p>
      </div>
    </Card>
  );
}

function stepState(key: StepKey, status: VerifyStatus, next: NextStep): StepState {
  const s = status.steps;
  if (key === 'edu') return s.edu.done ? 'done' : 'active';
  if (key === 'id') {
    if (s.id.done) return 'done';
    if (!s.edu.done) return 'locked';
    const r = s.id.request;
    if (r && (r.status === 'pending' || r.status === 'in_review')) return 'pending';
    if (r && r.status === 'rejected') return 'rejected';
    return next === 'id' ? 'active' : 'todo';
  }
  if (key === 'phone') return s.phone.done ? 'done' : next === 'phone' ? 'active' : 'todo';
  return s.payment.done ? 'done' : next === 'payment' ? 'active' : 'todo';
}

function stepStatusText(t: ReturnType<typeof useT>, key: StepKey, state: StepState, status: VerifyStatus, formatDate: (iso: string) => string): string {
  const s = status.steps;
  if (state === 'done') {
    const at = key === 'edu' ? s.edu.at : key === 'id' ? s.id.at : key === 'phone' ? s.phone.at : s.payment.at;
    return at ? t('verify.step.doneAt', { date: formatDate(at) }) : t('verify.step.status.done');
  }
  if (state === 'locked') return t('verify.step.status.locked');
  if (state === 'pending') return s.id.request?.status === 'in_review' ? t('verify.step.status.inReview') : t('verify.step.status.pending');
  if (state === 'rejected') return t('verify.step.status.rejected');
  return t('verify.step.status.todo');
}

function Rail({ status }: { status: VerifyStatus }) {
  const t = useT();
  const { user } = useAuth();
  const setting = useVerifiedOnlySetting();
  const level = status.trustLevel;
  return (
    <div className="flex flex-col gap-4">
      <Card padding="md" className="flex flex-col items-start gap-3">
        <h2 className="text-h3 text-ink">{t('verify.badge.title')}</h2>
        <TrustBadge level={level} size="profile" showLabel noTooltip className="text-body" />
        <p className="text-small text-ink-2">{t('verify.badge.hint')}</p>
        {user && (
          <Button variant="secondary" size="sm" asChild>
            <Link to={`/u/${user.id}`}>{t('verify.badge.viewProfile')}</Link>
          </Button>
        )}
      </Card>
      <Card padding="md" className="flex flex-col gap-3">
        <h2 className="text-h3 text-ink">{t('verify.unlock.title')}</h2>
        {[1, 2, 3].map((l) => (
          <div key={l} className={cn('rounded-card border p-3', l <= level ? 'border-line bg-sunken' : l === level + 1 ? 'border-accent-soft-line bg-accent-soft/40' : 'border-line')}>
            <h3 className={cn('text-small font-semibold', l <= level ? 'text-ink' : l === level + 1 ? 'text-accent-text-strong' : 'text-ink-2')}>{t(`verify.unlock.l${l}.title`)}</h3>
            <ul className="mt-1 flex flex-col gap-0.5 text-small text-ink-2">
              {[1, 2, 3].map((n) => <li key={n} className="flex gap-1.5"><span aria-hidden>·</span>{t(`verify.unlock.l${l}.${n}`)}</li>)}
            </ul>
          </div>
        ))}
      </Card>
      <Card padding="md" className="flex flex-col gap-2">
        <h2 className="text-h3 text-ink">{t('verify.settings.title')}</h2>
        <Switch
          label={t('verify.settings.verifiedOnly')}
          description={t('verify.settings.verifiedOnlyHint')}
          checked={user?.verifiedOnlyMessaging ?? status.verifiedOnlyMessaging}
          disabled={setting.isPending}
          onChange={async (v) => {
            try {
              await setting.mutateAsync(v);
              toast.success(t('verify.settings.saved'));
            } catch (err) {
              toast.error(errorMessage(t, err));
            }
          }}
        />
      </Card>
    </div>
  );
}

function CenterSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" aria-busy>
      <div className="flex flex-col gap-4">
        <Skeleton variant="rect" height={120} />
        <Skeleton variant="rect" height={320} />
        <Skeleton variant="rect" height={200} />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton variant="rect" height={160} />
        <Skeleton variant="rect" height={280} />
      </div>
    </div>
  );
}

function VerifyCenterInner() {
  const t = useT();
  const status = useVerifyStatus();
  const [params] = useSearchParams();
  const location = useLocation();
  const presetType = ID_TYPES.find((x) => x === params.get('type')) ?? null;
  const [open, setOpen] = useState<StepKey | null>(null);
  const [touched, setTouched] = useState(false);
  const { formatDate: fmt } = useLocale();
  const formatDate = useCallback((iso: string) => fmt(iso, 'long'), [fmt]);

  // first incomplete step opens by default (deep link #id / ?step=phone wins)
  useEffect(() => {
    if (!status.data || touched) return;
    const hash = location.hash.replace('#', '') as StepKey;
    const q = params.get('step') as StepKey | null;
    const wanted = STEPS.includes(hash) ? hash : q && STEPS.includes(q) ? q : presetType ? 'id' : status.data.nextStep;
    setOpen(wanted ?? null);
  }, [status.data, touched, location.hash, params, presetType]);

  const rows = useMemo(() => {
    if (!status.data) return [];
    const s = status.data;
    return STEPS.map((key, i) => {
      const state = stepState(key, s, s.nextStep);
      return { key, index: i + 1, levelLabel: t('verify.level', { level: key === 'edu' ? 1 : key === 'id' ? 2 : 3 }), title: t(`verify.step.${key}`), state, statusText: stepStatusText(t, key, state, s, formatDate) };
    });
  }, [status.data, t, formatDate]);

  if (status.isLoading) return <CenterSkeleton />;
  if (status.isError || !status.data) {
    return <EmptyState icon={CircleAlert} title={t('error.generic')} description={errorMessage(t, status.error)} action={{ label: t('common.retry'), onClick: () => status.refetch() }} />;
  }
  const s = status.data;
  const toggle = (key: StepKey) => {
    setTouched(true);
    setOpen((cur) => (cur === key ? null : key));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        <LevelProgress status={s} />
        <Card padding="none" className="overflow-hidden">
          <ol className="divide-y divide-line">
            {rows.map((r) => (
              <StepRow key={r.key} anchor={r.key} index={r.index} levelLabel={r.levelLabel} title={r.title} statusText={r.statusText} state={r.state} open={open === r.key} onToggle={() => toggle(r.key)}>
                {r.key === 'edu' && <EduStep status={s} />}
                {r.key === 'id' && <IdStep status={s} presetType={presetType} />}
                {r.key === 'phone' && <PhoneStep status={s} />}
                {r.key === 'payment' && <PaymentStep status={s} />}
              </StepRow>
            ))}
          </ol>
        </Card>
        <section aria-labelledby="verify-timeline">
          <h2 id="verify-timeline" className="mb-3 flex items-center gap-2 text-h3 text-ink"><ShieldCheck className="size-5 text-ink-3" aria-hidden />{t('verify.timeline.title')}</h2>
          <Card padding="md"><Timeline /></Card>
        </section>
      </div>
      <aside className="min-w-0"><Rail status={s} /></aside>
    </div>
  );
}

export default function VerifyCenter() {
  const t = useT();
  return (
    <RequireAuth>
      <div className="mx-auto w-full max-w-content px-4 lg:px-8">
        <Head title={t('verify.title')} description={t('verify.subtitle')} />
        <header className="mb-6">
          <h1 className="text-h1-sm md:text-h1 text-ink">{t('verify.title')}</h1>
          <p className="mt-1 text-small text-ink-2">{t('verify.subtitle')}</p>
        </header>
        <VerifyCenterInner />
      </div>
    </RequireAuth>
  );
}
