// Thread view (DESIGN.md §7.6 right column / mobile thread page): header, sticky context card, scam banner,
// message list with day separators + load-earlier, typing indicator, composer. Realtime reducers live in hooks.ts.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowDown, ChevronLeft, CircleAlert, Lock, Search, ShieldBan, Users, X } from 'lucide-react';
import type { ConversationDto } from '@shared/schemas/chat';
import { ApiError } from '@/lib/api';
import { Avatar, Button, EmptyState, Input, Skeleton, Spinner, TrustBadge } from '@/components';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth';
import { useLocale, useT } from '@/lib/i18n';
import { useFlag } from '@/lib/meta';
import { useIsMobile } from '@/lib/hooks';
import { toast } from '@/lib/toast';
import { errorMessage } from '@/app/errors';
import { useQueryClient } from '@tanstack/react-query';
import * as chatApi from '../api';
import { conversationKey, useConversation, useMarkRead, useMessages, usePresence, useSendMessage, useTypingSender, useTypingUsers } from '../hooks';
import { buildRows, conversationTitle, memberById, shortName, statusLabel, type LocalMessage } from '../utils';
import { Composer } from './Composer';
import { ContextBar } from './ContextBar';
import { MessageBubble } from './MessageBubble';
import { MessageSearchResults } from './MessageSearch';
import { ScamBanner } from './ScamBanner';
import { ReportDialog, ThreadActions, deleteOwnMessage } from './ThreadActions';

export function ThreadView({ id, showBack }: { id: string; showBack?: boolean }) {
  const t = useT();
  const { user } = useAuth();
  const conv = useConversation(id);
  if (conv.isPending && !conv.data) return <ThreadSkeleton />;
  if (conv.isError || !conv.data) {
    const notFound = conv.error instanceof ApiError && conv.error.status === 404;
    return (
      <div className="flex h-full flex-col">
        {showBack && <MobileBack />}
        <EmptyState
          className="my-auto"
          icon={CircleAlert}
          title={t('chat.error.title')}
          description={notFound ? t('chat.error.notFound') : errorMessage(t, conv.error)}
          action={notFound ? { label: t('chat.error.backToList'), to: '/chat', variant: 'secondary' } : { label: t('common.retry'), onClick: () => conv.refetch(), variant: 'secondary' }}
        />
      </div>
    );
  }
  if (!user) return null;
  return <Thread conv={conv.data} meId={user.id} meTrust={user.trustLevel} showBack={showBack} />;
}

function MobileBack() {
  const t = useT();
  return (
    <Button asChild variant="ghost" size="sm" iconLeft={<ChevronLeft />} className="m-2 self-start">
      <Link to="/chat">{t('common.back')}</Link>
    </Button>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Skeleton variant="circle" width={40} />
        <Skeleton variant="text" lines={2} className="w-48" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <Skeleton variant="rect" height={44} className="w-2/3" />
        <Skeleton variant="rect" height={44} className="w-1/2 self-end" />
        <Skeleton variant="rect" height={64} className="w-3/4" />
        <Skeleton variant="rect" height={44} className="w-2/5 self-end" />
      </div>
    </div>
  );
}

function Thread({ conv, meId, meTrust, showBack }: { conv: ConversationDto; meId: string; meTrust: number; showBack?: boolean }) {
  const t = useT();
  const { formatDate } = useLocale();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const targetId = params.get('m');
  const scamEnabled = useFlag('scam_banner.enabled', true);
  const messages = useMessages(conv.id);
  const { send, retry } = useSendMessage(conv.id);
  const signalTyping = useTypingSender(conv.id);
  const typingIds = useTypingUsers(conv.id, meId);
  const presence = usePresence(conv.peer?.id);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [reportMsg, setReportMsg] = useState<LocalMessage | null>(null);
  const [stuckBottom, setStuckBottom] = useState(true);
  const [pendingNew, setPendingNew] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const prevFirstIdRef = useRef<string | null>(null);

  const items = useMemo(() => messages.data?.items ?? [], [messages.data]);
  const newestId = messages.data?.newestId ?? items[items.length - 1]?.id ?? null;
  useMarkRead(conv, newestId);

  const rows = useMemo(() => buildRows(items, t, formatDate), [items, t, formatDate]);
  const title = conversationTitle(conv, meId, t);
  const peer = conv.peer;
  const online = presence ? presence.online : peer?.lastSeenAt === 'online';
  const recently = presence ? presence.lastSeenAt === 'recently' : peer?.lastSeenAt === 'recently';
  const userMessages = items.filter((m) => m.kind === 'text' || m.kind === 'image').length;
  const showScam = scamEnabled && !conv.scamBannerDismissed && conv.kind === 'direct' && (conv.messageCount <= 3 || userMessages <= 3) && !conv.blockedByMe;
  const ctxStatus = statusLabel(conv, t);

  // ---- scrolling: stick to bottom on first load + own/incoming messages while at the bottom; keep position on load-earlier
  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstId = items[0]?.id ?? null;
    const prependedCount = prevFirstIdRef.current && firstId !== prevFirstIdRef.current && items.findIndex((m) => m.id === prevFirstIdRef.current) > 0 ? items.findIndex((m) => m.id === prevFirstIdRef.current) : 0;
    if (prependedCount > 0) {
      // keep the viewport anchored on the previously-first message
      const anchor = el.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(prevFirstIdRef.current!)}"]`);
      if (anchor) el.scrollTop = anchor.offsetTop - 48;
    } else if (prevCountRef.current === 0 || stuckBottom) {
      scrollToBottom(false);
      setPendingNew(0);
    } else if (items.length > prevCountRef.current) {
      const last = items[items.length - 1];
      if (last && last.senderId === meId) scrollToBottom(true);
      else setPendingNew((n) => n + (items.length - prevCountRef.current));
    }
    prevCountRef.current = items.length;
    prevFirstIdRef.current = firstId;
  }, [items, meId, scrollToBottom, stuckBottom]);

  // jump to a searched message once
  useEffect(() => {
    if (!targetId || !items.length) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(targetId)}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      const timer = setTimeout(() => {
        params.delete('m');
        setParams(params, { replace: true });
      }, 2500);
      return () => clearTimeout(timer);
    }
    if (messages.data?.hasMore && !messages.loadingEarlier) void messages.loadEarlier();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, items.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    setStuckBottom(atBottom);
    if (atBottom) setPendingNew(0);
    if (el.scrollTop < 80 && messages.data?.hasMore && !messages.loadingEarlier) void messages.loadEarlier();
  };

  const dismissScam = async () => {
    qc.setQueryData<ConversationDto>(conversationKey(conv.id), (c) => (c ? { ...c, scamBannerDismissed: true } : c));
    try {
      await chatApi.patchConversation(conv.id, { scamBannerDismissed: true });
    } catch {
      /* keep the optimistic dismissal */
    }
  };

  const onDelete = async (m: LocalMessage) => {
    await deleteOwnMessage(m, t);
  };

  const composerState = conv.isLocked
    ? 'locked'
    : conv.blockedByMe
      ? 'blockedByMe'
      : conv.blockedMe
        ? 'blockedMe'
        : meTrust < 1 && !items.some((m) => m.senderId && m.senderId !== meId && (m.kind === 'text' || m.kind === 'image'))
          ? 'needVerify'
          : 'ok';

  const typingLabel = typingIds.length === 1
    ? t('chat.typingOne', { name: shortName(memberById(conv, typingIds[0])?.name ?? '') })
    : typingIds.length > 1
      ? t('chat.typingMany', { n: typingIds.length })
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      {/* header */}
      <header className="flex items-center gap-2 border-b border-line bg-surface px-2 py-2 md:px-4">
        {showBack && (
          <Button asChild variant="ghost" iconOnly aria-label={t('common.back')} className="-ml-1 shrink-0">
            <Link to="/chat">
              <ChevronLeft />
            </Link>
          </Button>
        )}
        {peer ? (
          <Link to={`/u/${peer.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-sm">
            <Avatar size="md" name={peer.name} src={peer.avatarUrl} trustLevel={peer.trustLevel} status={online ? 'online' : null} />
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-body font-semibold text-ink">
                <span className="truncate">{peer.name}</span>
                <TrustBadge level={peer.trustLevel} size="inline" />
                {conv.blockedByMe && <ShieldBan className="size-3.5 text-ink-3" aria-label={t('chat.blockedChip')} />}
              </span>
              <span className="block truncate text-caption text-ink-3">
                {typingLabel ?? (online ? t('chat.online') : recently ? t('chat.recently') : peer.program ?? peer.campus?.shortName ?? t('chat.offline'))}
              </span>
            </span>
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-sunken text-ink-2" aria-hidden>
              <Users className="size-5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-body font-semibold text-ink">{title}</span>
              <span className="block truncate text-caption text-ink-3">{typingLabel ?? `${t('chat.group')} · ${t('chat.members', { n: conv.memberCount })}`}</span>
            </span>
          </div>
        )}
        {conv.isLocked && <Lock className="size-4 shrink-0 text-ink-3" aria-label={t('chat.locked')} />}
        <Button variant="ghost" iconOnly aria-label={t('chat.actions.search')} aria-pressed={searchOpen} onClick={() => setSearchOpen((v) => !v)} className="hidden shrink-0 sm:inline-flex">
          <Search />
        </Button>
        <ThreadActions conv={conv} meId={meId} onSearch={() => setSearchOpen(true)} />
      </header>

      {searchOpen && (
        <div className="border-b border-line bg-surface">
          <div className="flex items-center gap-2 px-3 py-2 md:px-4">
            <Input size="sm" type="search" autoFocus value={searchQ} onChange={(e) => setSearchQ(e.target.value)} iconLeft={<Search />} placeholder={t('chat.searchMessages')} aria-label={t('chat.searchMessages')} clearable className="flex-1" />
            <Button variant="ghost" size="sm" iconOnly aria-label={t('common.close')} onClick={() => { setSearchOpen(false); setSearchQ(''); }}>
              <X />
            </Button>
          </div>
          {searchQ.trim().length >= 2 && (
            <div className="max-h-64 overflow-y-auto border-t border-line">
              <MessageSearchResults q={searchQ.trim()} conversationId={conv.id} onPick={() => { setSearchOpen(false); setSearchQ(''); }} />
            </div>
          )}
        </div>
      )}

      {/* scrollable body */}
      <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-live="polite" aria-label={title}>
        {conv.context && <ContextBar card={conv.context} statusLabel={ctxStatus} />}
        {showScam && <ScamBanner onDismiss={dismissScam} />}
        <div className="pb-3">
          {messages.isPending ? (
            <div className="flex flex-col gap-3 p-4" aria-busy="true">
              <Skeleton variant="rect" height={44} className="w-2/3" />
              <Skeleton variant="rect" height={44} className="w-1/2 self-end" />
              <Skeleton variant="rect" height={64} className="w-3/4" />
            </div>
          ) : messages.isError ? (
            <EmptyState size="sm" icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => messages.refetch(), variant: 'secondary' }} />
          ) : (
            <>
              <div className="flex justify-center py-3">
                {messages.data?.hasMore ? (
                  <Button variant="ghost" size="sm" loading={messages.loadingEarlier} onClick={() => void messages.loadEarlier()}>
                    {t('chat.loadEarlier')}
                  </Button>
                ) : (
                  <span className="text-caption text-ink-3">{t('chat.beginning')}</span>
                )}
              </div>
              {rows.map((r) =>
                r.kind === 'day' ? (
                  <div key={r.key} className="my-3 flex items-center gap-3 px-4" role="separator" aria-label={r.label}>
                    <span className="h-px flex-1 bg-line" />
                    <span className="text-caption font-medium text-ink-3">{r.label}</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                ) : (
                  <MessageBubble
                    key={r.key}
                    message={r.message}
                    conv={conv}
                    meId={meId}
                    first={r.first}
                    last={r.last}
                    showTime={r.showTime}
                    highlight={searchQ.trim().length >= 2 ? searchQ.trim() : undefined}
                    targeted={targetId === r.message.id}
                    onRetry={(m) => void retry(m).catch(() => {})}
                    onDelete={(m) => void onDelete(m)}
                    onReport={(m) => setReportMsg(m)}
                  />
                ),
              )}
              {typingLabel && (
                <div className="mt-2 flex items-end gap-2 px-4" aria-live="polite">
                  <span className="w-8 shrink-0" />
                  <span className="inline-flex items-center gap-1 rounded-card rounded-bl-sm border border-line bg-surface px-3 py-2">
                    <TypingDots />
                    <span className="sr-only">{typingLabel}</span>
                  </span>
                </div>
              )}
            </>
          )}
        </div>
        {pendingNew > 0 && !stuckBottom && (
          <div className="sticky bottom-3 flex justify-center">
            <Button size="sm" variant="secondary" iconLeft={<ArrowDown />} className="shadow-md" onClick={() => { scrollToBottom(true); setPendingNew(0); }}>
              {t('chat.newMessages', { n: pendingNew })}
            </Button>
          </div>
        )}
      </div>

      {/* composer / blocked states */}
      {composerState === 'ok' ? (
        <Composer
          conversationId={conv.id}
          group={conv.kind !== 'direct'}
          onTyping={signalTyping}
          onSend={(input) =>
            send(input).catch((e) => {
              toast.error(errorMessage(t, e));
              throw e;
            })
          }
        />
      ) : (
        <div className={cn('flex items-center justify-between gap-3 border-t border-line bg-sunken px-4 py-3 text-small text-ink-2', isMobile && 'pb-[max(0.75rem,env(safe-area-inset-bottom))]')}>
          <span className="flex items-center gap-2">
            {composerState === 'locked' ? <Lock className="size-4 shrink-0" aria-hidden /> : <ShieldBan className="size-4 shrink-0" aria-hidden />}
            {t(`chat.composer.${composerState}`)}
          </span>
          {composerState === 'blockedByMe' && peer && (
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await chatApi.unblockUser(peer.id);
                  toast.success(t('chat.unblock.done', { name: peer.name }));
                  qc.invalidateQueries({ queryKey: conversationKey(conv.id) });
                } catch (e) {
                  toast.error(errorMessage(t, e));
                }
              }}
            >
              {t('chat.actions.unblock')}
            </Button>
          )}
          {composerState === 'needVerify' && (
            <Button asChild size="sm" variant="primary">
              <Link to={`/verify-email?next=${encodeURIComponent(`/chat/${conv.id}`)}`}>{t('chat.composer.goVerify')}</Link>
            </Button>
          )}
        </div>
      )}
      {reportMsg && (
        <ReportDialog open onClose={() => setReportMsg(null)} target={{ kind: 'message', id: reportMsg.id }} peer={peer ? { id: peer.id, name: peer.name } : null} />
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-pulse rounded-pill bg-ink-3" style={{ animationDelay: `${i * 160}ms` }} />
      ))}
    </span>
  );
}

export { Spinner as ThreadSpinner };
