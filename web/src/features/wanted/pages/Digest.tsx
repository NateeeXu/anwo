// /wanted/digest — "email-style" digest preview (saved-search style placeholder; DATA_MODEL §3.2) + opt-in switch.
import { CircleAlert, Mail, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Card, EmptyState, Skeleton, Switch } from '@/components';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { Head } from '@/app/Head';
import { errorMessage } from '@/app/errors';
import { RequireAuth } from '@/app/guards';
import { fetchDigest, wantedKeys } from '../api';
import { MatchRow } from '../components/MatchRow';

function Inner() {
  const t = useT();
  const { formatDate, formatMoneyRange } = useLocale();
  const { user, refresh } = useAuth();
  const digest = useQuery({ queryKey: wantedKeys.digest, queryFn: fetchDigest });
  const optIn = useMutation({
    mutationFn: (on: boolean) => api('/api/users/me', { method: 'PATCH', body: { emailDigestOptIn: on } }),
    onSuccess: (_d, on) => { void refresh(); toast.success(on ? t('wanted.digest.on') : t('wanted.digest.off')); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  return (
    <div className="mx-auto w-full max-w-reading px-4 lg:px-8">
      <Head title={t('wanted.digest.title')} />
      <div className="py-4">
        <h1 className="text-h1 text-ink">{t('wanted.digest.title')}</h1>
        <p className="mt-1 text-small text-ink-2">{t('wanted.digest.subtitle')}</p>
      </div>
      <Card padding="md" className="mb-4">
        <Switch label={t('wanted.digest.switch')} description={t('wanted.digest.switchHint')} checked={!!user?.emailDigestOptIn} onChange={(on) => optIn.mutate(on)} disabled={optIn.isPending} />
      </Card>
      {digest.isPending ? (
        <div className="flex flex-col gap-3" aria-busy><Skeleton variant="text" lines={2} /><Skeleton variant="row" /><Skeleton variant="row" /></div>
      ) : digest.isError ? (
        <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => digest.refetch() }} />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="flex items-start gap-3 border-b border-line bg-sunken px-4 py-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-pill bg-surface text-ink-2"><Mail className="size-4" aria-hidden /></span>
            <div className="min-w-0">
              <p className="text-caption text-ink-3">{t('wanted.digest.from')} · {formatDate(digest.data.generatedAt, 'datetime')}</p>
              <p className="truncate text-body font-semibold text-ink">{digest.data.subject}</p>
              <p className="text-caption text-ink-3">{t('wanted.digest.placeholderNote')}</p>
            </div>
          </div>
          <div className="flex flex-col gap-6 p-4">
            {digest.data.items.length === 0 ? (
              <EmptyState size="sm" icon={Sparkles} title={t('wanted.digest.empty')} description={t('wanted.digest.emptyHint')} action={<Button asChild variant="secondary"><Link to="/wanted/mine">{t('wanted.nav.mine')}</Link></Button>} />
            ) : (
              digest.data.items.map((it) => (
                <section key={it.wanted.id} className="flex flex-col gap-2">
                  <h2 className="text-h3 text-ink">
                    <Link to={`/wanted/${it.wanted.id}`} className="hover:underline">{it.wanted.title}</Link>
                    <span className="ml-2 text-small font-normal text-ink-3">{formatMoneyRange(it.wanted.budgetMinCents, it.wanted.budgetMaxCents)}</span>
                  </h2>
                  <ul className="flex flex-col gap-2">{it.matches.map((m) => <li key={m.id}><MatchRow match={m} wantedId={it.wanted.id} canAct /></li>)}</ul>
                </section>
              ))
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

export default function WantedDigest() {
  return <RequireAuth><Inner /></RequireAuth>;
}
