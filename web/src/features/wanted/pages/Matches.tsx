// /wanted/:id/matches — the seeker's full ranked list (score ≥ minScore) with breakdown bars and seen / dismiss / contact.
import { ArrowLeft, CircleAlert, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Button, EmptyState, FilterBar, Pagination, SegmentedControl, Skeleton, type FilterChipItem } from '@/components';
import { NoListings } from '@/components/illustrations';
import { useAuth } from '@/lib/auth';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { Head } from '@/app/Head';
import { errorMessage } from '@/app/errors';
import { PageSkeleton } from '@/app/PageSkeleton';
import { RequireAuth } from '@/app/guards';
import { fetchMatches, recomputeMatches, useInvalidateWanted, useWanted, wantedKeys } from '../api';
import { MatchRow } from '../components/MatchRow';

const PAGE_SIZE = 10;

function MatchesInner() {
  const { id = '' } = useParams();
  const t = useT();
  const { formatRelative } = useLocale();
  const navigate = useNavigate();
  const { user } = useAuth();
  const invalidate = useInvalidateWanted();
  const wanted = useWanted(id);
  const [minScore, setMinScore] = useState<'30' | '50' | '70'>('50');
  const [status, setStatus] = useState<'all' | 'new' | 'offered' | 'contacted' | 'dismissed'>('all');
  const [page, setPage] = useState(1);
  const params = { minScore: Number(minScore), status: status === 'all' ? undefined : status === 'new' ? 'new,seen' : status, page, pageSize: PAGE_SIZE };
  const matches = useQuery({ queryKey: wantedKeys.matches(id, params), queryFn: () => fetchMatches(id, params), enabled: !!wanted.data, placeholderData: keepPreviousData });
  const recompute = useMutation({
    mutationFn: () => recomputeMatches(id),
    onSuccess: (r) => { toast.success(t('wanted.matchesPanel.recomputed', { n: r.count })); invalidate(id); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  if (wanted.isPending) return <PageSkeleton />;
  if (wanted.isError || !wanted.data) {
    return <div className="mx-auto max-w-content px-4 lg:px-8"><EmptyState icon={CircleAlert} title={t('wanted.detail.notFound')} action={{ label: t('wanted.detail.backToBrowse'), onClick: () => navigate('/wanted') }} /></div>;
  }
  const w = wanted.data;
  if (user && user.id !== w.author.id && user.role !== 'admin') {
    return <div className="mx-auto max-w-content px-4 lg:px-8"><EmptyState icon={CircleAlert} title={t('wanted.matchesPage.notOwner')} action={{ label: t('wanted.detail.backToBrowse'), onClick: () => navigate(`/wanted/${id}`) }} /></div>;
  }
  const items = matches.data?.items ?? [];
  const total = matches.data?.total ?? 0;
  const chips: FilterChipItem[] = (['all', 'new', 'offered', 'contacted', 'dismissed'] as const).map((s) => ({ key: s, label: t(`wanted.matchesPage.filter.${s}`), selected: status === s, onClick: () => { setStatus(s); setPage(1); } }));

  return (
    <div className="mx-auto w-full max-w-detail px-4 lg:px-8">
      <Head title={t('wanted.matchesPage.title')} />
      <div className="flex flex-col gap-1 py-4">
        <Link to={`/wanted/${id}`} className="inline-flex w-fit items-center gap-1 text-small text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden />{w.title}</Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-h1 text-ink">{t('wanted.matchesPage.title')}</h1>
            <p className="mt-1 text-small text-ink-2">
              {t('wanted.matchesPage.subtitle', { n: total })}
              {matches.data?.computedAt && ` · ${t('wanted.matchesPanel.computedAt', { when: formatRelative(matches.data.computedAt) })}`}
            </p>
          </div>
          <Button variant="secondary" size="sm" iconLeft={<RefreshCw />} loading={recompute.isPending} onClick={() => recompute.mutate()}>{t('wanted.matchesPanel.recompute')}</Button>
        </div>
      </div>
      <FilterBar
        chips={chips}
        trailing={
          <SegmentedControl
            size="sm"
            label={t('wanted.matchesPage.minScore')}
            value={minScore}
            onChange={(v) => { setMinScore(v); setPage(1); }}
            options={[{ value: '30', label: '30+' }, { value: '50', label: '50+' }, { value: '70', label: '70+' }]}
          />
        }
      />
      <div className="flex flex-col gap-3 py-4">
        {matches.isPending ? (
          <div className="flex flex-col gap-3" aria-busy>{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} variant="row" height={110} />)}</div>
        ) : matches.isError ? (
          <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => matches.refetch() }} />
        ) : items.length === 0 ? (
          <EmptyState icon={status === 'all' ? <NoListings /> : Sparkles} title={status === 'all' ? t('wanted.matchesPanel.empty') : t('wanted.matchesPage.emptyFiltered')} description={status === 'all' ? t('wanted.matchesPanel.emptyHint') : undefined} action={status === 'all' ? { label: t('common.edit'), onClick: () => navigate(`/wanted/${id}/edit`), variant: 'secondary' } : { label: t('wanted.filter.reset'), onClick: () => { setStatus('all'); setMinScore('50'); }, variant: 'secondary' }} />
        ) : (
          <>
            <ul className="flex flex-col gap-3" aria-live="polite">
              {items.map((m, i) => <li key={m.id}><MatchRow match={m} wantedId={id} canAct defaultOpen={i === 0 && page === 1} /></li>)}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} loading={matches.isFetching} />
          </>
        )}
      </div>
    </div>
  );
}

export default function WantedMatches() {
  return <RequireAuth><MatchesInner /></RequireAuth>;
}
