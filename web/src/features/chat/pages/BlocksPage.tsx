// /chat/blocks — the viewer's block list with unblock.
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, CircleAlert, ShieldCheck } from 'lucide-react';
import { Avatar, Button, EmptyState, PageHeader, Skeleton, TrustBadge } from '@/components';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { Head } from '@/app/Head';
import { RequireAuth } from '@/app/guards';
import { errorMessage } from '@/app/errors';
import * as chatApi from '../api';
import { CONVERSATIONS_KEY } from '../hooks';

export default function BlocksPage() {
  return (
    <RequireAuth>
      <Blocks />
    </RequireAuth>
  );
}

function Blocks() {
  const t = useT();
  const { formatDate } = useLocale();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['chat', 'blocks'], queryFn: chatApi.listBlocks });
  const unblock = useMutation({
    mutationFn: (u: chatApi.BlockedUser) => chatApi.unblockUser(u.id),
    onSuccess: (_r, u) => {
      toast.success(t('chat.unblock.done', { name: u.name }));
      qc.invalidateQueries({ queryKey: ['chat', 'blocks'] });
      qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  return (
    <div className="mx-auto w-full max-w-reading px-4 py-4 md:py-6">
      <Head title={t('chat.blocks.title')} />
      <PageHeader
        title={t('chat.blocks.title')}
        subtitle={t('chat.blocks.subtitle')}
        actions={
          <Button asChild variant="ghost" size="sm" iconLeft={<ChevronLeft />}>
            <Link to="/chat">{t('chat.blocks.back')}</Link>
          </Button>
        }
      />
      {list.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} variant="row" />
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => list.refetch(), variant: 'secondary' }} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t('chat.blocks.empty')} description={t('chat.blocks.emptyHint')} action={{ label: t('chat.blocks.back'), to: '/chat', variant: 'secondary' }} />
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {list.data.map((u) => (
            <li key={u.id} className="flex items-center gap-3 p-4">
              <Avatar size="md" name={u.name} src={u.avatarUrl} trustLevel={u.trustLevel} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-body font-medium text-ink">
                  <Link to={`/u/${u.id}`} className="truncate">
                    {u.name}
                  </Link>
                  <TrustBadge level={u.trustLevel} size="inline" />
                </p>
                <p className="text-caption text-ink-3">
                  {t('chat.blocks.blockedAt', { date: formatDate(u.blockedAt) })}
                  {u.reason ? ` · ${u.reason}` : ''}
                </p>
              </div>
              <Button variant="secondary" size="sm" loading={unblock.isPending && unblock.variables?.id === u.id} onClick={() => unblock.mutate(u)}>
                {t('chat.actions.unblock')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
