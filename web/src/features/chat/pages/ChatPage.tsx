// /chat and /chat/:id — split layout on desktop (list w-360 + thread), list page → thread page on mobile.
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { WifiOff } from 'lucide-react';
import { EmptyState } from '@/components';
import { NoMessages } from '@/components/illustrations';
import { useIsMobile } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useWsPolling } from '@/lib/ws';
import { useAuth } from '@/lib/auth';
import { Head } from '@/app/Head';
import { RequireAuth } from '@/app/guards';
import { useShellOptions } from '@/app/shell/shellStore';
import type { ConversationFilter } from '../api';
import { useChatRealtime, useConversation } from '../hooks';
import { conversationTitle } from '../utils';
import { ConversationList } from '../components/ConversationList';
import { ThreadView } from '../components/ThreadView';

const FILTERS: ConversationFilter[] = ['all', 'unread', 'groups', 'archived'];

export default function ChatPage() {
  return (
    <RequireAuth>
      <ChatLayout />
    </RequireAuth>
  );
}

function ChatLayout() {
  const t = useT();
  const { id } = useParams<{ id?: string }>();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const filterParam = params.get('tab') as ConversationFilter | null;
  const [filter, setFilter] = useState<ConversationFilter>(filterParam && FILTERS.includes(filterParam) ? filterParam : 'all');
  const polling = useWsPolling();
  const active = useConversation(id);
  const threadTitle = active.data && user ? conversationTitle(active.data, user.id, t) : null;

  useChatRealtime(id);
  const mobileThread = isMobile && !!id;
  useShellOptions({ layout: 'full', hideTabs: mobileThread, back: mobileThread ? true : undefined, title: mobileThread && threadTitle ? threadTitle : t('chat.title') });

  useEffect(() => {
    if (filter === 'all') {
      if (params.has('tab')) {
        params.delete('tab');
        setParams(params, { replace: true });
      }
    } else if (params.get('tab') !== filter) {
      params.set('tab', filter);
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const pill = polling && (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-layer-raised flex justify-center" role="status">
      <span className="inline-flex items-center gap-1.5 rounded-pill bg-info-soft px-3 py-1 text-caption font-medium text-info shadow-sm">
        <WifiOff className="size-3.5" aria-hidden strokeWidth={1.75} />
        {t('chat.connection.polling')}
      </span>
    </div>
  );

  return (
    <div className="relative flex h-[calc(100dvh-56px)] min-h-0 w-full flex-col md:h-[calc(100dvh-64px)]">
      <Head title={threadTitle ? `${threadTitle} · ${t('chat.title')}` : t('chat.title')} />
      {pill}
      <div className="mx-auto flex h-full min-h-0 w-full max-w-content flex-1">
        {/* list column */}
        <ConversationList
          activeId={id}
          filter={filter}
          onFilterChange={setFilter}
          className={
            isMobile
              ? mobileThread
                ? 'hidden'
                : 'flex h-full min-h-0 w-full flex-col bg-paper'
              : 'flex h-full min-h-0 w-[360px] shrink-0 flex-col border-r border-line bg-paper'
          }
        />
        {/* thread column */}
        <div className={isMobile ? (mobileThread ? 'flex h-full min-h-0 w-full flex-col' : 'hidden') : 'flex h-full min-h-0 min-w-0 flex-1 flex-col'}>
          {id ? (
            <ThreadView key={id} id={id} showBack={isMobile} />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState icon={<NoMessages size={140} />} title={t('chat.pick')} description={t('chat.pickHint')} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
