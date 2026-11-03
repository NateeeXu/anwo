// Notification center: list, mark read, read-all, live via WS.
import { useEffect } from 'react';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { Notification, Paginated } from '@shared/types';
import { Button, EmptyState, PageHeader, Pagination, Skeleton } from '../components';
import { NoMessages } from '../components/illustrations';
import { api } from '../lib/api';
import { useLocale, useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { getWs } from '../lib/ws';
import { cn } from '../lib/cn';
import { Head } from '../app/Head';
import { UNREAD_KEY } from '../app/shell/useUnread';
import { QueryState } from './home/Section';
import { useSearchParams } from 'react-router';

export default function Notifications() {
  const t = useT();
  const { formatRelative } = useLocale();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page') ?? 1));
  const unreadOnly = params.get('unread') === '1';
  const pageSize = 20;

  const list = useQuery({
    queryKey: ['notifications', 'list', { page, pageSize, unreadOnly }],
    queryFn: () => api<Paginated<Notification> & { unreadCount: number }>('/api/notifications', { query: { page, pageSize, unreadOnly: unreadOnly || undefined } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notifications', 'list'] });
    qc.invalidateQueries({ queryKey: UNREAD_KEY });
  };

  useEffect(() => {
    const ws = getWs();
    const offs = [ws.on('notification', invalidate), ws.on('notification.count', invalidate)];
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markRead = useMutation({
    mutationFn: (id: string) => api<Notification>(`/api/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: invalidate,
  });
  const readAll = useMutation({
    mutationFn: () => api<{ updated: number }>('/api/notifications/read-all', { method: 'POST', body: {} }),
    onSuccess: (r) => {
      invalidate();
      toast.success(t('notifications.readAllDone', { n: r.updated }));
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/notifications/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const unreadCount = list.data?.unreadCount ?? 0;

  return (
    <div className="mx-auto w-full max-w-reading px-4">
      <Head title={t('notifications.title')} />
      <PageHeader
        title={t('notifications.title')}
        subtitle={unreadCount ? t('notifications.unread', { n: unreadCount }) : undefined}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" aria-pressed={unreadOnly} onClick={() => setParams(unreadOnly ? {} : { unread: '1' })}>
              {unreadOnly ? t('notifications.showAll') : t('notifications.unreadOnly')}
            </Button>
            <Button variant="secondary" size="sm" iconLeft={<CheckCheck />} disabled={!unreadCount} loading={readAll.isPending} onClick={() => readAll.mutate()}>
              {t('notifications.readAll')}
            </Button>
          </div>
        }
      />
      <QueryState
        query={list}
        skeleton={<div className="flex flex-col gap-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} variant="row" />)}</div>}
        isEmpty={(d) => !d.items?.length}
        empty={<EmptyState icon={<NoMessages />} title={t('notifications.emptyTitle')} description={t('notifications.emptyHint')} />}
      >
        {(d) => (
          <>
            <ul className="divide-y divide-line rounded-card border border-line bg-surface">
              {d.items.map((n) => {
                const unread = !n.readAt;
                return (
                  <li key={n.id} className={cn('flex items-start gap-3 p-4', unread && 'bg-accent-soft/40')}>
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-pill', unread ? 'bg-accent' : 'bg-transparent')} aria-hidden />
                    {(() => {
                      const body = (
                        <>
                          <p className={cn('text-body text-ink', unread && 'font-semibold')}>{n.title}</p>
                          {n.body && <p className="mt-0.5 text-small text-ink-2">{n.body}</p>}
                          <p className="mt-1 text-caption text-ink-3">
                            {formatRelative(n.createdAt)} · {t(`notifications.kind.${n.kind}`) === `notifications.kind.${n.kind}` ? n.kind : t(`notifications.kind.${n.kind}`)}
                          </p>
                        </>
                      );
                      const onClick = () => {
                        if (unread) markRead.mutate(n.id);
                      };
                      return n.link ? (
                        <Link to={n.link} onClick={onClick} className="min-w-0 flex-1 rounded-sm">
                          {body}
                        </Link>
                      ) : (
                        <div onClick={onClick} className="min-w-0 flex-1">
                          {body}
                        </div>
                      );
                    })()}
                    <div className="flex shrink-0 gap-1">
                      {unread && (
                        <Button variant="ghost" size="sm" iconOnly aria-label={t('notifications.markRead')} iconLeft={<Bell />} onClick={() => markRead.mutate(n.id)} />
                      )}
                      <Button variant="ghost" size="sm" iconOnly aria-label={t('common.delete')} iconLeft={<Trash2 />} onClick={() => remove.mutate(n.id)} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4">
              <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onChange={(p: number) => setParams({ ...(unreadOnly ? { unread: '1' } : {}), page: String(p) })} />
            </div>
          </>
        )}
      </QueryState>
    </div>
  );
}
