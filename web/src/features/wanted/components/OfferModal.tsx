// 「我有房源，推荐给 TA」 — host picks one of their active listings, writes an optional note, and the server opens a chat
// with the listing + wanted context cards (API.md §4 POST /:id/offer).
import { Check, ImageOff, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { Listing, WantedCard as WantedCardDto } from '@shared/types';
import { Button, EmptyState, Modal, Price, Skeleton, Textarea } from '@/components';
import { NoListings } from '@/components/illustrations';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { isApiError } from '@/lib/api';
import { errorMessage } from '@/app/errors';
import { fetchMyListings, listingsOf, useOfferMutation, wantedKeys } from '../api';

export interface OfferModalProps {
  open: boolean;
  onClose: () => void;
  wanted: WantedCardDto;
  onOffered?: (conversationId: string) => void;
  /** preselect one of the host's listings (for-my-listings page) */
  defaultListingId?: string;
}

export function OfferModal({ open, onClose, wanted, onOffered, defaultListingId }: OfferModalProps) {
  const t = useT();
  const { formatDate, formatRooms } = useLocale();
  const navigate = useNavigate();
  const [listingId, setListingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const listings = useQuery({ queryKey: wantedKeys.myListings, queryFn: fetchMyListings, enabled: open });
  const items = useMemo(() => listingsOf(listings.data).filter((l) => l.status === 'active'), [listings.data]);
  const offer = useOfferMutation(wanted.id);

  useEffect(() => {
    if (!open || listingId) return;
    if (defaultListingId && items.some((l) => l.id === defaultListingId)) setListingId(defaultListingId);
    else if (items.length === 1) setListingId(items[0]!.id);
  }, [open, items, listingId, defaultListingId]);
  useEffect(() => {
    if (!open) { setListingId(null); setMessage(''); }
  }, [open]);

  const submit = () => {
    if (!listingId) return;
    offer.mutate(
      { listingId, message: message.trim() || undefined },
      {
        onSuccess: (r) => {
          track('wanted.offer', { entityType: 'wanted', entityId: wanted.id, listingId });
          toast.success(t('wanted.offer.sent'), t('wanted.offer.sentHint'), { label: t('wanted.match.openChat'), onClick: () => navigate(`/chat/${r.conversationId}`) });
          onOffered?.(r.conversationId);
          onClose();
        },
        onError: (e) => {
          if (isApiError(e, 'CONFLICT')) {
            const cid = (e.data as { conversationId?: string } | undefined)?.conversationId;
            toast.info(t('wanted.offer.already'), undefined, cid ? { label: t('wanted.match.openChat'), onClick: () => navigate(`/chat/${cid}`) } : undefined);
            onClose();
            return;
          }
          toast.error(errorMessage(t, e));
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('wanted.offer.title')}
      description={t('wanted.offer.description', { name: wanted.author.name })}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} disabled={!listingId} loading={offer.isPending}>{t('wanted.offer.submit')}</Button>
        </>
      }
    >
      {listings.isPending ? (
        <div className="flex flex-col gap-2" aria-busy>
          <Skeleton variant="row" />
          <Skeleton variant="row" />
        </div>
      ) : listings.isError && !(isApiError(listings.error, 'NOT_FOUND') || isApiError(listings.error, 'NOT_IMPLEMENTED')) ? (
        <EmptyState size="sm" title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => listings.refetch() }} />
      ) : items.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<NoListings size={96} />}
          title={t('wanted.offer.noListings')}
          description={t('wanted.offer.noListingsHint')}
          action={<Button asChild variant="primary" iconLeft={<Plus />}><Link to="/post/listing">{t('wanted.offer.postListing')}</Link></Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2" role="radiogroup" aria-label={t('wanted.offer.pick')}>
            {items.map((l: Listing) => {
              const selected = l.id === listingId;
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setListingId(l.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-card border p-2 text-left transition-colors duration-token-fast',
                      selected ? 'border-accent bg-accent-soft/40' : 'border-line bg-surface hover:border-line-strong',
                    )}
                  >
                    <span className="block h-14 w-[72px] shrink-0 overflow-hidden rounded-sm bg-sunken">
                      {l.coverUrl ? <img src={l.coverUrl} alt="" className="size-full object-cover dark:brightness-[.92]" /> : <span className="flex size-full items-center justify-center text-ink-4"><ImageOff className="size-5" aria-hidden /></span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-semibold text-ink">{l.title}</span>
                      <span className="block truncate text-small text-ink-2">
                        <Price cents={l.priceCents} perMonth size="inline" /> · {formatRooms(l.bedrooms, l.bathrooms)} · {formatDate(l.availableFrom, 'monthDay')}
                        {l.availableTo ? `–${formatDate(l.availableTo, 'monthDay')}` : ''}
                      </span>
                    </span>
                    <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-pill border', selected ? 'border-accent bg-accent text-on-accent' : 'border-line-strong')} aria-hidden>
                      {selected && <Check className="size-4" strokeWidth={2.5} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Textarea label={t('wanted.offer.message')} hint={t('wanted.offer.messageHint')} rows={3} maxLength={1000} showCount optional value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('wanted.offer.messagePlaceholder')} />
        </div>
      )}
    </Modal>
  );
}

export default OfferModal;
