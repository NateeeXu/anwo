// Message search (LIKE on body, restricted to my threads). Used under the inbox search box and in the thread header.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Search } from 'lucide-react';
import { Avatar, Skeleton } from '@/components';
import { useAuth } from '@/lib/auth';
import { useLocale, useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import * as chatApi from '../api';

/** Splits text around the query for `accent-soft` highlighting. */
export function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: { s: string; hit: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const j = lower.indexOf(needle, i);
    if (j < 0) {
      parts.push({ s: text.slice(i), hit: false });
      break;
    }
    if (j > i) parts.push({ s: text.slice(i, j), hit: false });
    parts.push({ s: text.slice(j, j + needle.length), hit: true });
    i = j + needle.length;
  }
  return (
    <>
      {parts.map((p, k) =>
        p.hit ? (
          <mark key={k} className="rounded-xs bg-accent-soft px-0.5 text-accent-text-strong">
            {p.s}
          </mark>
        ) : (
          <span key={k}>{p.s}</span>
        ),
      )}
    </>
  );
}

export function MessageSearchResults({ q, conversationId, onPick, className }: { q: string; conversationId?: string; onPick?: (hit: chatApi.SearchHit) => void; className?: string }) {
  const t = useT();
  const { user } = useAuth();
  const { formatRelative } = useLocale();
  const enabled = q.trim().length >= 2;
  const res = useQuery({
    queryKey: ['chat', 'search', q, conversationId ?? null],
    queryFn: () => chatApi.searchMessages(q, { conversationId, pageSize: 30 }),
    enabled,
    staleTime: 30_000,
  });
  if (!enabled) return <p className={cn('px-4 py-3 text-small text-ink-3', className)}>{t('chat.searchMin')}</p>;
  if (res.isPending)
    return (
      <div className={cn('flex flex-col gap-2 px-4 py-3', className)} aria-busy="true">
        <Skeleton variant="text" lines={3} />
      </div>
    );
  if (res.isError) return <p className={cn('px-4 py-3 text-small text-danger', className)}>{t('error.generic')}</p>;
  const items = res.data.items;
  return (
    <div className={className}>
      <p className="flex items-center gap-2 px-4 pt-3 pb-1 text-caption font-medium text-ink-3">
        <Search className="size-3.5" aria-hidden strokeWidth={1.75} />
        {t('chat.searchMessages')} · {t('chat.searchResults', { n: res.data.total })}
      </p>
      {items.length === 0 ? (
        <p className="px-4 pb-4 text-small text-ink-3">{t('chat.searchNoResults', { q })}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((m) => {
            const title = m.conversation.kind === 'direct' ? m.conversation.peer?.name ?? m.sender?.name ?? '' : m.conversation.title ?? t('chat.group');
            const senderName = m.senderId === user?.id ? t('chat.you') : m.sender?.name ?? '';
            const body = m.body ?? '';
            return (
              <li key={m.id}>
                <Link
                  to={`/chat/${m.conversationId}?m=${m.id}`}
                  onClick={() => onPick?.(m)}
                  className="flex items-start gap-3 px-4 py-2.5 hover:bg-sunken focus-visible:bg-sunken"
                >
                  <Avatar size="sm" name={m.sender?.name} src={m.sender?.avatarUrl} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-small font-medium text-ink">{title}</span>
                      <span className="shrink-0 text-caption text-ink-3 tnum">{formatRelative(m.createdAt)}</span>
                    </span>
                    <span className="line-clamp-2 text-small text-ink-2">
                      {senderName ? `${senderName}: ` : ''}
                      <Highlight text={body} q={q} />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
