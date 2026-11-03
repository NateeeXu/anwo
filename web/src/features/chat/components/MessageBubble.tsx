// Chat bubble (DESIGN.md §4.9): mine = inverse, theirs = surface + hairline; tail by geometry (corner nearest the avatar
// is rounded-sm); timestamps on group boundaries; read receipt = two 12 px checks; images max 240 px; system pills.
import { memo, useState } from 'react';
import { Link } from 'react-router';
import { Check, CheckCheck, Clock, Copy, Flag, MoreHorizontal, RotateCw, Trash2, TriangleAlert } from 'lucide-react';
import type { ContextCard } from '@shared/types';
import type { ConversationDto } from '@shared/schemas/chat';
import { Avatar, Button, DropdownMenu, Price } from '@/components';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { Highlight } from './MessageSearch';
import { contextSubtitle, memberById, shortName, systemText, type LocalMessage } from '../utils';

export type BubbleProps = {
  message: LocalMessage;
  conv: ConversationDto;
  meId: string;
  first: boolean;
  last: boolean;
  showTime: boolean;
  highlight?: string;
  targeted?: boolean;
  onRetry?: (m: LocalMessage) => void;
  onDelete?: (m: LocalMessage) => void;
  onReport?: (m: LocalMessage) => void;
};

const TEN_MIN = 10 * 60_000;

export const MessageBubble = memo(function MessageBubble({ message: m, conv, meId, first, last, showTime, highlight, targeted, onRetry, onDelete, onReport }: BubbleProps) {
  const t = useT();
  const { formatDate } = useLocale();
  const [tapped, setTapped] = useState(false);
  const mine = m.senderId === meId;

  if (m.kind === 'system') {
    return (
      <div className="my-2 flex justify-center px-4" role="status">
        <span className="max-w-[85%] rounded-pill bg-sunken px-3 py-1 text-center text-small text-ink-2">{systemText(m, conv, t)}</span>
      </div>
    );
  }
  if (m.kind === 'context_card') {
    const card = (m.context ?? null) as ContextCard | null;
    if (!card || !card.link) return null;
    return (
      <div className={cn('my-2 flex px-4', mine ? 'justify-end' : 'justify-start')}>
        <Link to={card.link} className="flex w-full max-w-[85%] items-center gap-3 rounded-card border border-line bg-surface p-2 hover:border-line-strong md:max-w-[72%]">
          {card.imageUrl ? (
            <img src={card.imageUrl} alt="" className="size-14 shrink-0 rounded-sm bg-sunken object-cover dark:brightness-[.92]" />
          ) : (
            <span className="size-14 shrink-0 rounded-sm bg-sunken" aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-caption font-medium text-ink-3">{t(`chat.context.${card.type}`)}</span>
            <span className="block truncate text-small font-medium text-ink">{card.title}</span>
            {card.subtitle && <span className="block truncate text-caption text-ink-2">{contextSubtitle(card, t, formatDate)}</span>}
          </span>
          {typeof card.priceCents === 'number' && card.priceCents > 0 && <Price cents={card.priceCents} perMonth={card.type === 'listing'} size="inline" className="shrink-0" />}
        </Link>
      </div>
    );
  }

  const sender = m.sender ?? memberById(conv, m.senderId);
  const deleted = !!(m.deleted || m.deletedAt);
  const read = mine && (m.readBy?.length ?? 0) > 0;
  const canDelete = mine && !deleted && !m.status && Date.now() - Date.parse(m.createdAt) < TEN_MIN;
  const timeText = formatDate(m.createdAt, 'time');
  const failed = m.status === 'failed';
  const isGroup = conv.kind !== 'direct';

  const menuItems = [
    ...(m.kind === 'text' && m.body && !deleted
      ? [{ label: t('chat.actions.copy'), icon: <Copy />, onSelect: () => void navigator.clipboard?.writeText(m.body ?? '').then(() => toast.success(t('chat.toast.copied'))).catch(() => {}) }]
      : []),
    ...(!mine && !deleted && onReport ? [{ label: t('chat.actions.reportMessage'), icon: <Flag />, onSelect: () => onReport(m) }] : []),
    ...(canDelete && onDelete ? [{ label: t('chat.actions.delete'), icon: <Trash2 />, danger: true, onSelect: () => onDelete(m) }] : []),
  ];

  return (
    <div
      className={cn('group/msg flex items-end gap-2 px-4', mine ? 'flex-row-reverse' : 'flex-row', first ? 'mt-2' : 'mt-0.5', targeted && 'animate-fade-in')}
      data-message-id={m.id}
    >
      {!mine && (
        <span className="w-8 shrink-0">
          {last && <Avatar size="sm" name={sender?.name} src={sender?.avatarUrl} trustLevel={sender?.trustLevel} />}
        </span>
      )}
      <div className={cn('flex min-w-0 max-w-[85%] flex-col md:max-w-[72%]', mine ? 'items-end' : 'items-start')}>
        {!mine && isGroup && first && sender && <span className="mb-0.5 ml-1 text-caption text-ink-3">{shortName(sender.name)}</span>}
        <button
          type="button"
          onClick={() => setTapped((v) => !v)}
          aria-label={`${mine ? t('chat.me') : sender?.name ?? ''} ${timeText}`}
          className={cn(
            'relative max-w-full cursor-default rounded-card text-left text-body break-words whitespace-pre-wrap focus-visible:outline-2',
            mine ? 'bg-inverse text-ink-inverse' : 'border border-line bg-surface text-ink',
            mine ? (last ? 'rounded-br-sm' : '') : last ? 'rounded-bl-sm' : '',
            m.kind === 'image' && !deleted ? 'p-1' : 'px-3 py-2',
            deleted && 'italic opacity-80',
            failed && 'border border-danger',
            targeted && 'ring-2 ring-focus',
          )}
        >
          {deleted ? (
            <span className={cn('text-small', mine ? 'text-ink-inverse/80' : 'text-ink-3')}>{t('chat.deleted')}</span>
          ) : m.kind === 'image' && m.image ? (
            <span className="flex flex-col gap-1">
              <a href={m.image.url} target="_blank" rel="noreferrer" className="block" aria-label={t('chat.imageOpen')}>
                <img
                  src={m.image.url}
                  alt={t('chat.imageAlt', { name: sender?.name ?? '' })}
                  width={m.image.width ?? undefined}
                  height={m.image.height ?? undefined}
                  className="block max-h-60 max-w-60 rounded-sm bg-sunken object-cover dark:brightness-[.92]"
                  loading="lazy"
                />
              </a>
              {m.body && <span className="px-2 pb-1">{m.body}</span>}
            </span>
          ) : m.kind === 'image' ? (
            <span className="flex items-center gap-2 text-small opacity-80">
              <Clock className="size-3.5" aria-hidden />
              {t('chat.composer.uploading')}
            </span>
          ) : highlight ? (
            <Highlight text={m.body ?? ''} q={highlight} />
          ) : (
            m.body
          )}
        </button>
        {(showTime || tapped || failed) && (
          <span className={cn('mt-0.5 flex items-center gap-1 px-1 text-caption text-ink-3 tnum', mine ? 'flex-row-reverse' : '')}>
            {failed ? (
              <>
                <TriangleAlert className="size-3 text-danger" aria-hidden />
                <span className="text-danger">{t('chat.failed')}</span>
                {onRetry && (
                  <Button variant="ghost" size="sm" iconLeft={<RotateCw />} className="h-6 px-1.5 text-caption" onClick={() => onRetry(m)}>
                    {t('chat.retry')}
                  </Button>
                )}
              </>
            ) : (
              <>
                <span>{timeText}</span>
                {m.editedAt && <span>· {t('chat.edited')}</span>}
                {mine && m.status === 'sending' && <Clock className="size-3" aria-label={t('chat.sending')} />}
                {mine && !m.status && !deleted && (read ? <CheckCheck className="size-3 text-accent-text" aria-label={t('chat.read')} /> : <Check className="size-3" aria-label={t('chat.sent')} />)}
              </>
            )}
          </span>
        )}
      </div>
      {menuItems.length > 0 && !failed && (
        <div className={cn('mb-1 shrink-0 opacity-0 transition-opacity duration-token-fast group-hover/msg:opacity-100 focus-within:opacity-100', tapped && 'opacity-100')}>
          <DropdownMenu
            label={t('chat.actions.messageMenu')}
            align={mine ? 'end' : 'start'}
            trigger={<Button variant="ghost" size="sm" iconOnly aria-label={t('chat.actions.messageMenu')} className="size-7"><MoreHorizontal /></Button>}
            items={menuItems}
          />
        </div>
      )}
    </div>
  );
});
