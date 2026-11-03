// MatchRow — a listing in the seeker's matches panel: compact ListingCard row variant (DESIGN §4.1) + score + breakdown + actions.
import { Bus, ChevronDown, Footprints, ImageOff, MessageCircle, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { Badge, Button, Card, Price, TrustBadge } from '@/components';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { errorMessage } from '@/app/errors';
import { contactMatch, dismissMatch, markMatchSeen, useInvalidateWanted, type MatchWithListing } from '../api';
import { matchStatusKey } from '../lib';
import { ScoreBadge, ScoreBreakdown } from './MatchScore';

export interface MatchRowProps {
  match: MatchWithListing;
  /** the seeker's own post id (enables seen / dismiss / contact) */
  wantedId?: string;
  canAct?: boolean;
  defaultOpen?: boolean;
  /** narrow containers (detail rail): score badge moves under the meta line */
  compact?: boolean;
  className?: string;
}

export function MatchRow({ match, wantedId, canAct, defaultOpen, compact, className }: MatchRowProps) {
  const t = useT();
  const { formatDate, formatRooms, formatDistance } = useLocale();
  const navigate = useNavigate();
  const invalidate = useInvalidateWanted();
  const [open, setOpen] = useState(!!defaultOpen);
  const l = match.listing;

  const seen = useMutation({ mutationFn: () => markMatchSeen(wantedId!, match.listingId), onSuccess: () => invalidate(wantedId) });
  const dismiss = useMutation({
    mutationFn: () => dismissMatch(wantedId!, match.listingId),
    onSuccess: () => { toast.info(t('wanted.match.dismissed')); invalidate(wantedId); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const contact = useMutation({
    mutationFn: () => contactMatch(wantedId!, match.listingId),
    onSuccess: (r) => {
      track('listing.contact_click', { entityType: 'listing', entityId: match.listingId, via: 'wanted_match' });
      invalidate(wantedId);
      toast.success(t('wanted.match.contacted'), undefined, { label: t('wanted.match.openChat'), onClick: () => navigate(`/chat/${r.conversationId}`) });
      navigate(`/chat/${r.conversationId}`);
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  const onOpenListing = () => {
    if (canAct && wantedId && match.status === 'new') seen.mutate();
    track('match.view', { entityType: 'wanted', entityId: wantedId ?? match.wantedId, listingId: match.listingId, score: match.score });
  };

  const statusKey = matchStatusKey(match);
  const closed = l && l.status !== 'active';

  return (
    <Card as="article" padding="none" className={cn('overflow-hidden', match.status === 'dismissed' && 'opacity-60', className)} data-status={match.status}>
      <div className="flex gap-3 p-3">
        <Link to={`/listings/${match.listingId}`} onClick={onOpenListing} className="relative block h-[72px] w-24 shrink-0 overflow-hidden rounded-sm bg-sunken" aria-label={l?.title ?? t('wanted.match.viewListing')}>
          {l?.coverUrl ? (
            <img src={l.coverUrl} alt="" loading="lazy" className={cn('size-full object-cover dark:brightness-[.92]', closed && 'opacity-70 grayscale')} />
          ) : (
            <span className="flex size-full items-center justify-center text-ink-4"><ImageOff className="size-5" aria-hidden /></span>
          )}
          {match.status === 'new' && <span className="absolute left-1 top-1 size-2 rounded-pill bg-accent-vivid" aria-label={t('wanted.match.status.new')} />}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Link to={`/listings/${match.listingId}`} onClick={onOpenListing} className="block truncate text-body font-semibold text-ink hover:underline">
                {l?.title ?? t('wanted.match.listingGone')}
              </Link>
              {l && (
                <p className="truncate text-small text-ink-2">
                  <Price cents={l.priceCents} perMonth size="inline" /> · {formatRooms(l.bedrooms, l.bathrooms)}
                  {l.furnished !== 'none' && ` · ${t('listing.furnished')}`}
                  {' · '}
                  {formatDate(l.availableFrom, 'monthDay')}
                  {l.availableTo ? `–${formatDate(l.availableTo, 'monthDay')}` : ''}
                </p>
              )}
            </div>
            {!compact && <ScoreBadge score={match.score} className="shrink-0" />}
          </div>
          {l && (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-small text-ink-3">
              {l.commuteWalkMin != null && (
                <span className="inline-flex items-center gap-1"><Footprints className="size-3.5" aria-hidden />{t('listing.walkMin', { n: l.commuteWalkMin })}</span>
              )}
              {l.nearShuttle && <span className="inline-flex items-center gap-1"><Bus className="size-3.5" aria-hidden />{t('listing.nearShuttle')}</span>}
              {l.commuteWalkMin == null && l.distanceToCampusM != null && <span>{t('listing.fromCampus', { d: formatDistance(l.distanceToCampusM) })}</span>}
              <span>{l.neighborhood ?? l.city}</span>
              <TrustBadge level={l.ownerTrustLevel} size="inline" />
              {closed && <Badge variant="neutral" size="sm">{t('listing.rented')}</Badge>}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {compact && <ScoreBadge score={match.score} size="sm" />}
            {match.status !== 'new' && match.status !== 'seen' && (
              <Badge variant={match.status === 'dismissed' ? 'neutral' : 'info'} size="sm">{t(statusKey)}</Badge>
            )}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex h-7 items-center gap-1 rounded-ctl px-2 text-caption text-ink-2 hover:bg-sunken hover:text-ink"
            >
              {t('wanted.match.why')}
              <ChevronDown className={cn('size-3.5 transition-transform duration-token-fast', open && 'rotate-180')} aria-hidden />
            </button>
            {canAct && wantedId && (
              <span className="ml-auto flex items-center gap-1">
                {match.conversationId ? (
                  <Button asChild size="sm" variant="secondary" iconLeft={<MessageCircle />}>
                    <Link to={`/chat/${match.conversationId}`}>{t('wanted.match.openChat')}</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" iconLeft={<MessageCircle />} loading={contact.isPending} disabled={!!closed} onClick={() => contact.mutate()}>
                    {t('wanted.match.contact')}
                  </Button>
                )}
                {(match.status === 'new' || match.status === 'seen') && (
                  <Button size="sm" variant="ghost" iconOnly aria-label={t('wanted.match.dismiss')} loading={dismiss.isPending} onClick={() => dismiss.mutate()}>
                    <X />
                  </Button>
                )}
              </span>
            )}
          </div>
        </div>
      </div>
      {open && (
        <div className="border-t border-line bg-sunken/60 px-3 py-2.5">
          <ScoreBreakdown breakdown={match.breakdown} />
        </div>
      )}
    </Card>
  );
}

export default MatchRow;
