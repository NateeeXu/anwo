// Left column of /chat (DESIGN.md §7.6): title + search, tabs 全部 / 未读 / 群组 / 归档, rows, states.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CircleAlert, Search, ShieldBan, Users } from 'lucide-react';
import { Button, EmptyState, Input, Skeleton, Tabs } from '@/components';
import { NoMessages } from '@/components/illustrations';
import { useDebounce } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import type { ConversationFilter } from '../api';
import { useConversations } from '../hooks';
import { ConversationRow } from './ConversationRow';
import { MessageSearchResults } from './MessageSearch';

export function ConversationList({ activeId, filter, onFilterChange, className }: { activeId?: string; filter: ConversationFilter; onFilterChange: (f: ConversationFilter) => void; className?: string }) {
  const t = useT();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const dq = useDebounce(q.trim(), 250);
  const list = useConversations(filter, dq);
  const items = list.data?.items ?? [];
  const totalUnread = list.data?.totalUnread ?? 0;

  const tabs = useMemo(
    () => [
      { key: 'all' as const, label: t('chat.tab.all') },
      { key: 'unread' as const, label: t('chat.tab.unread'), count: totalUnread || undefined },
      { key: 'groups' as const, label: t('chat.tab.groups') },
      { key: 'archived' as const, label: t('chat.tab.archived') },
    ],
    [t, totalUnread],
  );

  const emptyFor = (f: ConversationFilter) => {
    if (dq) return { title: t('chat.list.emptySearch'), hint: undefined as string | undefined, icon: Search };
    switch (f) {
      case 'unread':
        return { title: t('chat.list.emptyUnread'), hint: t('chat.list.emptyUnreadHint'), icon: undefined };
      case 'groups':
        return { title: t('chat.list.emptyGroups'), hint: t('chat.list.emptyGroupsHint'), icon: Users };
      case 'archived':
        return { title: t('chat.list.emptyArchived'), hint: t('chat.list.emptyArchivedHint'), icon: undefined };
      default:
        return { title: t('chat.list.empty'), hint: t('chat.list.emptyHint'), icon: undefined };
    }
  };

  return (
    <section className={className} aria-label={t('chat.title')}>
      <div className="flex flex-col gap-3 px-3 pt-3 pb-2 md:px-4 md:pt-4">
        <div className="hidden items-center justify-between gap-2 md:flex">
          <h1 className="text-h2 text-ink">{t('chat.title')}</h1>
          <Button asChild variant="ghost" size="sm" iconOnly aria-label={t('chat.blocks.title')}>
            <Link to="/chat/blocks">
              <ShieldBan />
            </Link>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Input size="sm" type="search" value={q} onChange={(e) => setQ(e.target.value)} iconLeft={<Search />} placeholder={t('chat.search')} aria-label={t('chat.search')} clearable className="min-w-0 flex-1" />
          <Button asChild variant="ghost" size="sm" iconOnly aria-label={t('chat.blocks.title')} className="md:hidden">
            <Link to="/chat/blocks">
              <ShieldBan />
            </Link>
          </Button>
        </div>
        <Tabs items={tabs} value={filter} onChange={onFilterChange} variant="underline" label={t('chat.title')} className="-mb-2" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.isPending ? (
          <div className="flex flex-col gap-1 px-3 py-2" aria-busy="true">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} variant="row" />
            ))}
          </div>
        ) : list.isError ? (
          <EmptyState size="sm" icon={CircleAlert} title={t('chat.list.loadError')} action={{ label: t('common.retry'), onClick: () => list.refetch(), variant: 'secondary' }} />
        ) : items.length === 0 ? (
          (() => {
            const e = emptyFor(filter);
            return (
              <EmptyState
                size="sm"
                icon={e.icon ?? <NoMessages size={112} />}
                title={e.title}
                description={e.hint}
                action={filter === 'all' && !dq ? { label: t('chat.list.browse'), to: '/listings', variant: 'secondary' } : undefined}
              />
            );
          })()
        ) : (
          <ul className="divide-y divide-line" aria-live="polite">
            {items.map((c) => (
              <ConversationRow key={c.id} conv={c} meId={user?.id} active={c.id === activeId} />
            ))}
          </ul>
        )}
        {dq.length >= 2 && !list.isPending && <MessageSearchResults q={dq} />}
      </div>
    </section>
  );
}
