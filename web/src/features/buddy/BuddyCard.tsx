// BuddyCard — DESIGN.md §4.3. Left 56 px date block (caption month over h3 day, type icon below); right: title, time + place,
// avatar stack + 「3/4 人」 + chips; join button (secondary sm) → ghost 「已加入」. Event-today variant: accent-soft date block.
import { forwardRef, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Clock, Lock, MapPin } from 'lucide-react';
import { AvatarStack, Badge, Button, Chip } from '@/components';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import type { BuddyListItem } from './api';
import { BuddyTypeIcon, useBuddyTime } from './shared';

export interface BuddyCardProps {
  post: BuddyListItem;
  /** `row` = compact variant for chat context cards / calendar day lists (no join button) */
  variant?: 'default' | 'row';
  className?: string;
  /** Occurrence time to show instead of the post's startsAt (calendar lists) */
  occurrenceAt?: string | null;
  onHover?: (id: string | null) => void;
  hideJoin?: boolean;
}

export const BuddyCard = forwardRef<HTMLElement, BuddyCardProps>(function BuddyCard({ post, variant = 'default', className, occurrenceAt, onHover, hideJoin }, ref) {
  const t = useT();
  const { formatMoney } = useLocale();
  const { user } = useAuth();
  const navigate = useNavigate();
  const time = useBuddyTime(post.campusId);
  const startsAt = occurrenceAt ?? post.startsAt;
  const parts = startsAt ? time.parts(startsAt) : null;
  const today = !!parts?.isToday;
  const mine = post.myMembership;
  const isHost = mine?.role === 'host' || user?.id === post.author.id;
  const joined = mine?.status === 'joined';
  const pending = mine?.status === 'pending';
  const inactive = post.status !== 'open' && post.status !== 'full';
  const full = post.status === 'full' || post.memberCount >= post.maxMembers;
  const members = post.memberPreview?.length ? post.memberPreview : [post.author];
  const href = `/buddy/${post.id}`;
  const timeText = startsAt ? (post.isAllDay ? `${time.dayLabel(startsAt, { withWeekday: true })} · ${t('buddy.card.allDay')}` : `${parts!.weekday} ${parts!.time}`) : t('buddy.card.noTime');
  const place = [post.locationName, post.destinationName ? t('buddy.card.to', { dest: post.destinationName }) : null].filter(Boolean).join(' ');

  const onJoin = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(joined && !isHost ? href : `${href}?join=1`);
  };

  const joinLabel = isHost ? t('buddy.card.host') : joined ? t('buddy.card.joined') : pending ? t('buddy.card.pending') : inactive ? t(`buddy.card.${post.status === 'cancelled' ? 'cancelled' : post.status === 'expired' ? 'expired' : 'closed'}`) : full ? t('buddy.card.full') : t('buddy.card.join');
  const joinVariant = joined || isHost || pending ? 'ghost' : 'secondary';
  const joinDisabled = isHost || pending || (inactive && !joined) || (full && !joined);

  return (
    <article
      ref={ref}
      data-state={inactive ? 'inactive' : today ? 'today' : 'rest'}
      className={cn(
        'group relative flex gap-3 rounded-card border border-line bg-surface transition-[border-color,box-shadow] duration-token-base ease-out',
        'hover:border-line-strong hover:shadow-sm focus-within:border-line-strong active:translate-y-px',
        variant === 'row' ? 'p-2.5' : 'min-h-[108px] p-3 lg:p-4',
        inactive && 'opacity-70',
        className,
      )}
      onMouseEnter={onHover ? () => onHover(post.id) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
    >
      {/* date block */}
      <div
        className={cn(
          'flex shrink-0 flex-col items-center justify-center rounded-sm text-center',
          variant === 'row' ? 'w-12 py-1' : 'w-14 py-2',
          today ? 'bg-accent-soft text-accent-text-strong' : 'bg-sunken text-ink',
        )}
        aria-hidden
      >
        {parts ? (
          <>
            <span className="text-caption font-medium leading-none">{parts.month}</span>
            <span className={cn('tnum leading-tight', variant === 'row' ? 'text-body-lg font-semibold' : 'text-h3')}>{parts.day}</span>
          </>
        ) : (
          <span className="text-caption font-medium">{t('buddy.card.noTime')}</span>
        )}
        <BuddyTypeIcon type={post.type} size={variant === 'row' ? 14 : 16} className={cn('mt-1', today ? 'text-accent-text-strong' : 'text-ink-3')} />
      </div>

      {/* body — the whole card is one link; buttons are siblings (DESIGN §4.1 states) */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
          <h3 className={cn('min-w-0 flex-1 truncate text-body font-semibold text-ink', variant === 'row' && 'text-small')}>
            <Link to={href} className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-card focus-visible:after:ring-2 focus-visible:after:ring-accent">
              {post.sponsored && (
                <Badge variant="boosted" size="sm" className="mr-1.5 align-middle" />
              )}
              {post.title}
            </Link>
          </h3>
        </div>
        <p className="flex min-w-0 items-center gap-1.5 truncate text-small text-ink-2">
          <Clock size={14} strokeWidth={1.75} className="shrink-0 text-ink-3" aria-hidden />
          <span className="shrink-0 whitespace-nowrap">{timeText}</span>
          {place && (
            <>
              <span className="text-ink-4" aria-hidden>·</span>
              <MapPin size={14} strokeWidth={1.75} className="shrink-0 text-ink-3" aria-hidden />
              <span className="truncate">{place}</span>
            </>
          )}
        </p>
        <div className={cn('mt-auto flex items-center gap-2 pt-1', variant === 'row' && 'pt-0')}>
          <AvatarStack users={members} max={3} size="xs" className="shrink-0" />
          <span className="tnum shrink-0 whitespace-nowrap text-small text-ink-2">{t('buddy.members', { n: post.memberCount, max: post.maxMembers })}</span>
          <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden [&>*]:shrink-0">
            {post.verifiedOnly && (
              <Chip size="sm" icon={<Lock size={12} strokeWidth={2} aria-hidden />}>
                {t('common.verifiedOnly')}
              </Chip>
            )}
            {post.languages.slice(0, variant === 'row' ? 1 : 3).map((l) => (
              <Chip key={l} size="sm">
                {t(`buddy.lang.${l}`)}
              </Chip>
            ))}
            {variant !== 'row' && post.costSplitCents != null && post.costSplitCents > 0 && (
              <span className="shrink-0 text-caption text-ink-3">{t('buddy.card.costSplit', { amount: formatMoney(post.costSplitCents) })}</span>
            )}
          </span>
          {variant !== 'row' && !hideJoin && (
            <Button variant={joinVariant} size="sm" className="relative z-[1] ml-auto shrink-0" onClick={onJoin} disabled={joinDisabled} aria-label={`${joinLabel}：${post.title}`}>
              {joinLabel}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
});

export default BuddyCard;
