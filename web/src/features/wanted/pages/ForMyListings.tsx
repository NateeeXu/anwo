// /wanted/for-my-listings — host side: seekers whose wanted posts match each of my active listings (score ≥ 50).
import { CircleAlert, Home, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { Listing, WantedCard as WantedCardDto } from '@shared/types';
import { Button, EmptyState, Price, Skeleton } from '@/components';
import { NoListings } from '@/components/illustrations';
import { isApiError } from '@/lib/api';
import { useLocale, useT } from '@/lib/i18n';
import { Head } from '@/app/Head';
import { RequireAuth } from '@/app/guards';
import { fetchMyListings, listingsOf, useSeekersForListing, wantedKeys } from '../api';
import { OfferButton, WantedCard } from '../components/WantedCard';
import { ScoreBadge } from '../components/MatchScore';
import { OfferModal } from '../components/OfferModal';

function ListingSeekers({ listing, onOffer }: { listing: Listing; onOffer: (w: WantedCardDto) => void }) {
  const t = useT();
  const { formatRooms } = useLocale();
  const seekers = useSeekersForListing(listing.id);
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center gap-3">
        <span className="block h-12 w-16 shrink-0 overflow-hidden rounded-sm bg-sunken">{listing.coverUrl && <img src={listing.coverUrl} alt="" className="size-full object-cover dark:brightness-[.92]" />}</span>
        <div className="min-w-0 flex-1">
          <Link to={`/listings/${listing.id}`} className="block truncate text-body font-semibold text-ink hover:underline">{listing.title}</Link>
          <p className="text-small text-ink-2"><Price cents={listing.priceCents} perMonth size="inline" /> · {formatRooms(listing.bedrooms, listing.bathrooms)}</p>
        </div>
        {seekers.data && <span className="shrink-0 text-small text-ink-2 tabular-nums">{t('wanted.forListings.count', { n: seekers.data.length })}</span>}
      </header>
      {seekers.isPending ? (
        <Skeleton variant="row" height={96} />
      ) : seekers.isError ? (
        <EmptyState size="sm" icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => seekers.refetch() }} />
      ) : seekers.data.length === 0 ? (
        <p className="rounded-card border border-dashed border-line p-3 text-small text-ink-3">{t('wanted.forListings.none')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {seekers.data.map((m) => m.wanted && (
            <li key={m.id} className="relative">
              <WantedCard
                wanted={m.wanted}
                variant="row"
                action={
                  <div className="flex flex-col items-end gap-1.5">
                    <ScoreBadge score={m.score} />
                    {m.status === 'offered' || m.status === 'contacted' ? (
                      m.conversationId ? <Button asChild size="sm" variant="ghost"><Link to={`/chat/${m.conversationId}`}>{t('wanted.match.openChat')}</Link></Button> : <span className="text-caption text-ink-3">{t(`wanted.match.status.${m.status}`)}</span>
                    ) : (
                      <OfferButton onClick={() => onOffer(m.wanted!)} />
                    )}
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Inner() {
  const t = useT();
  const navigate = useNavigate();
  const listings = useQuery({ queryKey: wantedKeys.myListings, queryFn: fetchMyListings });
  const items = useMemo(() => listingsOf(listings.data).filter((l) => l.status === 'active'), [listings.data]);
  const [offerFor, setOfferFor] = useState<{ wanted: WantedCardDto; listingId: string } | null>(null);
  const stub = listings.isError && (isApiError(listings.error, 'NOT_FOUND') || isApiError(listings.error, 'NOT_IMPLEMENTED'));

  return (
    <div className="mx-auto w-full max-w-detail px-4 lg:px-8">
      <Head title={t('wanted.forListings.title')} />
      <div className="flex flex-wrap items-end justify-between gap-3 py-4">
        <div>
          <h1 className="text-h1 text-ink">{t('wanted.forListings.title')}</h1>
          <p className="mt-1 text-small text-ink-2">{t('wanted.forListings.subtitle')}</p>
        </div>
        <Button asChild variant="ghost" size="sm"><Link to="/wanted/mine">{t('wanted.nav.mine')}</Link></Button>
      </div>
      <div className="flex flex-col gap-8 py-2">
        {listings.isPending ? (
          <div className="flex flex-col gap-3" aria-busy><Skeleton variant="row" height={96} /><Skeleton variant="row" height={96} /></div>
        ) : listings.isError && !stub ? (
          <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => listings.refetch() }} />
        ) : items.length === 0 ? (
          <EmptyState icon={<NoListings />} title={t('wanted.forListings.noListings')} description={t('wanted.forListings.noListingsHint')} action={<Button variant="primary" iconLeft={<Plus />} onClick={() => navigate('/post/listing')}>{t('wanted.offer.postListing')}</Button>} secondaryAction={<Button variant="ghost" iconLeft={<Home />} onClick={() => navigate('/wanted')}>{t('wanted.detail.backToBrowse')}</Button>} />
        ) : (
          items.map((l) => <ListingSeekers key={l.id} listing={l} onOffer={(w) => setOfferFor({ wanted: w, listingId: l.id })} />)
        )}
      </div>
      {offerFor && <OfferModal open onClose={() => setOfferFor(null)} wanted={offerFor.wanted} defaultListingId={offerFor.listingId} />}
    </div>
  );
}

export default function WantedForMyListings() {
  return <RequireAuth><Inner /></RequireAuth>;
}
