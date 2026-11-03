// Inbox row: avatar (or group stack), title + trust badge, relative time, unread dot/count, one-line preview.
import { memo } from 'react';
import { Link } from 'react-router';
import { BellOff, Lock, ShieldBan, Users } from 'lucide-react';
import type { ConversationDto } from '@shared/schemas/chat';
import { Avatar, TrustBadge } from '@/components';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { usePresence, useTypingUsers } from '../hooks';
import { conversationTitle, previewText } from '../utils';

export const ConversationRow = memo(function ConversationRow({ conv, meId, active }: { conv: ConversationDto; meId: string | undefined; active: boolean }) {
  const t = useT();
  const { formatRelative } = useLocale();
  const title = conversationTitle(conv, meId, t);
  const typing = useTypingUsers(conv.id, meId);
  const presence = usePresence(conv.peer?.id);
  const online = presence ? presence.online : conv.peer?.lastSeenAt === 'online';
  const unread = conv.unreadCount > 0;
  const preview = typing.length ? t('chat.typing') : previewText(conv, meId, t);
  const others = conv.members.filter((m) => m.id !== meId);
  const when = conv.lastMessageAt ?? conv.createdAt;

  return (
    <li>
      <Link
        to={`/chat/${conv.id}`}
        aria-current={active ? 'page' : undefined}
        aria-label={unread ? `${title}, ${t('chat.unreadBadge', { n: conv.unreadCount })}` : title}
        className={cn(
          'flex items-start gap-3 px-3 py-3 transition-colors duration-token-fast hover:bg-sunken focus-visible:bg-sunken',
          active && 'bg-sunken md:bg-accent-soft/60 md:hover:bg-accent-soft/60',
        )}
      >
        {conv.kind === 'direct' || others.length <= 1 ? (
          <Avatar src={conv.peer?.avatarUrl ?? others[0]?.avatarUrl} name={title} size="md" trustLevel={conv.peer?.trustLevel} status={online ? 'online' : null} className="shrink-0" />
        ) : (
          <span className="relative flex size-10 shrink-0 items-center justify-center rounded-pill bg-sunken text-ink-2" aria-hidden>
            <Users className="size-5" strokeWidth={1.75} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-body text-ink', unread && 'font-semibold')}>
              {title}
              {conv.kind !== 'direct' && <span className="ml-1.5 text-caption font-normal text-ink-3">{t('chat.members', { n: conv.memberCount })}</span>}
              {conv.peer && <TrustBadge level={conv.peer.trustLevel} size="inline" className="ml-1 align-[-2px]" />}
            </span>
            <span className={cn('shrink-0 text-caption tnum', unread ? 'text-accent-text' : 'text-ink-3')}>{formatRelative(when)}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-small', typing.length ? 'text-accent-text' : unread ? 'text-ink' : 'text-ink-2')}>
              {preview}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-ink-3">
              {conv.muted && <BellOff className="size-3.5" aria-label={t('chat.muted')} strokeWidth={1.75} />}
              {conv.isLocked && <Lock className="size-3.5" aria-label={t('chat.locked')} strokeWidth={1.75} />}
              {conv.blockedByMe && <ShieldBan className="size-3.5" aria-label={t('chat.blockedChip')} strokeWidth={1.75} />}
              {unread && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent px-1.5 text-caption font-semibold text-on-accent tnum" aria-hidden>
                  {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                </span>
              )}
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
});
