// /buddy/mine — 「我的搭子」: upcoming / past tabs, hosting / joined filter, pending-request badge.
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CircleAlert, Inbox, Plus } from 'lucide-react';
import { Button, EmptyState, PageHeader, Pagination, SegmentedControl, SkeletonList, Tabs } from '@/components';
import { NoBuddy } from '@/components/illustrations';
import { Head } from '@/app/Head';
import { RequireAuth } from '@/app/guards';
import { useT } from '@/lib/i18n';
import { useBuddyMine } from '../api';
import { BuddyCard } from '../BuddyCard';

function MineInner() {
  const t = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const when = (params.get('when') === 'past' ? 'past' : 'upcoming') as 'upcoming' | 'past';
  const role = (params.get('role') === 'host' || params.get('role') === 'member' ? params.get('role') : 'all') as 'all' | 'host' | 'member';
  const [page, setPage] = useState(1);
  const query = useBuddyMine({ when, role: role === 'all' ? undefined : role, page });
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setPage(1);
  };

  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('buddy.mine.title')} />
      <PageHeader
        title={t('buddy.mine.title')}
        back="/buddy"
        actions={
          <Button variant="primary" size="sm" iconLeft={<Plus />} onClick={() => navigate('/post/buddy')}>
            {t('buddy.browse.post')}
          </Button>
        }
        tabs={
          <Tabs
            variant="underline"
            items={[
              { key: 'upcoming', label: t('buddy.mine.upcoming') },
              { key: 'past', label: t('buddy.mine.past') },
            ]}
            value={when}
            onChange={(k) => set('when', k === 'upcoming' ? null : k)}
          />
        }
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <SegmentedControl
          size="sm"
          label={t('buddy.mine.all')}
          value={role}
          onChange={(v) => set('role', v === 'all' ? null : v)}
          options={[
            { value: 'all', label: t('buddy.mine.all') },
            { value: 'host', label: t('buddy.mine.hosting') },
            { value: 'member', label: t('buddy.mine.joined') },
          ]}
        />
        {!!query.data?.pendingRequests && (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-accent-soft px-3 py-1 text-small text-accent-text-strong">
            <Inbox size={14} aria-hidden /> {t('buddy.mine.requests', { n: query.data.pendingRequests })}
          </span>
        )}
      </div>

      <div className="mt-4 pb-10">
        {query.isPending ? (
          <SkeletonList count={4} variant="buddy-card" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" />
        ) : query.isError ? (
          <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => query.refetch() }} />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            icon={<NoBuddy size={120} />}
            title={when === 'past' ? t('buddy.mine.emptyPast') : t('buddy.mine.empty')}
            description={t('buddy.mine.emptyHint')}
            action={{ label: t('buddy.mine.browse'), onClick: () => navigate('/buddy'), variant: 'secondary' }}
            secondaryAction={<Button variant="primary" onClick={() => navigate('/post/buddy')}>{t('buddy.browse.post')}</Button>}
          />
        ) : (
          <>
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {query.data.items.map((post) => (
                <li key={post.id}>
                  <BuddyCard post={post} />
                </li>
              ))}
            </ul>
            <Pagination className="mt-6" page={page} pageSize={24} total={query.data.total} onChange={setPage} loading={query.isFetching} />
          </>
        )}
      </div>
    </div>
  );
}

export default function BuddyMine() {
  return (
    <RequireAuth>
      <MineInner />
    </RequireAuth>
  );
}
