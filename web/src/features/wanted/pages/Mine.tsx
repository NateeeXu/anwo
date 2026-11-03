// /wanted/mine — my wanted posts with status tabs and lifecycle actions (pause / resume / fulfilled / extend / delete).
import { CheckCircle2, CircleAlert, MoreHorizontal, Pause, Pencil, Play, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type { Wanted } from '@shared/types';
import { Button, DropdownMenu, EmptyState, Modal, Skeleton, Tabs } from '@/components';
import { NoListings } from '@/components/illustrations';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { Head } from '@/app/Head';
import { errorMessage } from '@/app/errors';
import { RequireAuth } from '@/app/guards';
import { deleteWanted, fetchMine, transitionWanted, useInvalidateWanted, useMatchesForMe, wantedKeys } from '../api';
import { WantedCard } from '../components/WantedCard';
import { MatchRow } from '../components/MatchRow';

type Tab = 'active' | 'paused' | 'done';
const TAB_STATUS: Record<Tab, string> = { active: 'active', paused: 'paused', done: 'fulfilled,expired' };

function MineInner() {
  const t = useT();
  const navigate = useNavigate();
  const invalidate = useInvalidateWanted();
  const [tab, setTab] = useState<Tab>('active');
  const [confirmDelete, setConfirmDelete] = useState<Wanted | null>(null);
  const list = useQuery({ queryKey: wantedKeys.mine({ status: TAB_STATUS[tab] }), queryFn: () => fetchMine({ status: TAB_STATUS[tab], pageSize: 50 }), placeholderData: keepPreviousData });
  const counts = useQuery({ queryKey: wantedKeys.mine({ all: 1 }), queryFn: () => fetchMine({ pageSize: 50 }) });
  const forMe = useMatchesForMe(tab === 'active', 3);
  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'pause' | 'resume' | 'fulfilled' | 'extend' }) => transitionWanted(id, action),
    onSuccess: (data) => { toast.success(t(`wanted.mine.toast.${data.status}`)); invalidate(data.id); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteWanted(id),
    onSuccess: () => { toast.success(t('wanted.mine.toast.removed')); setConfirmDelete(null); invalidate(); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  const all = counts.data?.items ?? [];
  const countOf = (tb: Tab) => all.filter((w) => TAB_STATUS[tb].split(',').includes(w.status)).length;
  const items = list.data?.items ?? [];
  const matchesByWanted = new Map((forMe.data?.byWanted ?? []).map((b) => [b.wanted.id, b.matches]));

  return (
    <div className="mx-auto w-full max-w-detail px-4 lg:px-8">
      <Head title={t('wanted.mine.title')} />
      <div className="flex flex-wrap items-end justify-between gap-3 py-4">
        <div>
          <h1 className="text-h1 text-ink">{t('wanted.mine.title')}</h1>
          <p className="mt-1 text-small text-ink-2">{t('wanted.mine.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/wanted/for-my-listings">{t('wanted.nav.forMyListings')}</Link></Button>
          <Button asChild variant="primary" size="sm" iconLeft={<Plus />}><Link to="/post/wanted">{t('wanted.browse.post')}</Link></Button>
        </div>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { key: 'active', label: t('wanted.status.active'), count: countOf('active') },
          { key: 'paused', label: t('wanted.status.paused'), count: countOf('paused') },
          { key: 'done', label: t('wanted.mine.done'), count: countOf('done') },
        ]}
        label={t('wanted.mine.title')}
      />
      <div className="flex flex-col gap-4 py-4">
        {list.isPending ? (
          <div className="flex flex-col gap-3" aria-busy>{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} variant="row" height={120} />)}</div>
        ) : list.isError ? (
          <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => list.refetch() }} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<NoListings />}
            title={tab === 'active' ? t('wanted.mine.emptyActive') : t('wanted.mine.emptyOther')}
            description={tab === 'active' ? t('wanted.mine.emptyActiveHint') : undefined}
            action={tab === 'active' ? { label: t('wanted.browse.post'), onClick: () => navigate('/post/wanted') } : undefined}
          />
        ) : (
          items.map((w) => {
            const top = matchesByWanted.get(w.id) ?? [];
            return (
              <section key={w.id} className="flex flex-col gap-2">
                <WantedCard
                  wanted={w}
                  variant="compact"
                  action={
                    <DropdownMenu
                      label={t('wanted.mine.actions')}
                      align="end"
                      trigger={<Button variant="ghost" size="sm" iconOnly aria-label={t('wanted.mine.actions')}><MoreHorizontal /></Button>}
                      items={[
                        { label: t('common.edit'), icon: <Pencil />, onSelect: () => navigate(`/wanted/${w.id}/edit`) },
                        { label: t('wanted.matchesPage.title'), icon: <Sparkles />, onSelect: () => navigate(`/wanted/${w.id}/matches`) },
                        'separator',
                        ...(w.status === 'active' ? [{ label: t('wanted.mine.pause'), icon: <Pause />, onSelect: () => transition.mutate({ id: w.id, action: 'pause' }) }] : []),
                        ...(w.status === 'paused' ? [{ label: t('wanted.mine.resume'), icon: <Play />, onSelect: () => transition.mutate({ id: w.id, action: 'resume' }) }] : []),
                        ...(w.status === 'expired' ? [{ label: t('wanted.mine.extend'), icon: <RefreshCw />, onSelect: () => transition.mutate({ id: w.id, action: 'extend' }) }] : []),
                        ...(w.status === 'active' || w.status === 'paused' ? [{ label: t('wanted.mine.fulfilled'), icon: <CheckCircle2 />, onSelect: () => transition.mutate({ id: w.id, action: 'fulfilled' }) }] : []),
                        'separator',
                        { label: t('common.delete'), icon: <Trash2 />, danger: true, onSelect: () => setConfirmDelete(w) },
                      ]}
                    />
                  }
                />
                {tab === 'active' && (
                  <div className="ml-0 flex flex-col gap-2 rounded-card border border-dashed border-line p-3 sm:ml-6">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="flex items-center gap-1.5 text-small font-semibold text-ink"><Sparkles className="size-4 text-accent-text" aria-hidden />{t('wanted.matchesPanel.title')}</h3>
                      <Link to={`/wanted/${w.id}/matches`} className="text-small text-accent-text hover:underline">{t('wanted.matchesPanel.viewAll', { n: w.matchCount })}</Link>
                    </div>
                    {forMe.isPending ? (
                      <Skeleton variant="row" />
                    ) : top.length === 0 ? (
                      <p className="text-small text-ink-3">{t('wanted.matchesPanel.emptyShort')}</p>
                    ) : (
                      <ul className="flex flex-col gap-2">{top.map((m) => <li key={m.id}><MatchRow match={m} wantedId={w.id} canAct /></li>)}</ul>
                    )}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t('wanted.mine.deleteTitle')}
        description={confirmDelete ? t('wanted.mine.deleteHint', { title: confirmDelete.title }) : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => confirmDelete && remove.mutate(confirmDelete.id)}>{t('common.delete')}</Button>
          </>
        }
      />
    </div>
  );
}

export default function WantedMine() {
  return <RequireAuth><MineInner /></RequireAuth>;
}
