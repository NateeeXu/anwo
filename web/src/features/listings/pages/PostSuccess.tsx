// /listings/:id/success — after a free publish: the card, next steps, and the boost upsell (never blocking, DESIGN §7.4).
import { ArrowUpRight, Bell, PackageOpen, Share2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, Card, EmptyState, Skeleton } from '@/components';
import { getCampusById } from '@/lib/campus';
import { useT } from '@/lib/i18n';
import { Head } from '@/app/Head';
import { keys, listingsApi } from '../api';
import { ListingCard } from '../components/ListingCard';
import { ShareModal } from '../components/DetailModals';

export default function PostSuccess() {
  const { id = '' } = useParams();
  const t = useT();
  const q = useQuery({ queryKey: keys.detail(id), queryFn: () => listingsApi.detail(id), enabled: !!id });
  const [share, setShare] = useState(false);
  const l = q.data;
  const campus = l ? getCampusById(l.campusId) : null;
  return (
    <div className="mx-auto w-full max-w-form px-4 py-6 lg:px-8">
      <Head title={t('listings.success.title')} />
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-14 items-center justify-center rounded-pill bg-accent-soft text-accent-text-strong"><ArrowUpRight className="size-7" aria-hidden /></span>
        <h1 className="text-h1-sm text-ink md:text-h1">{t('listings.success.title')}</h1>
        <p className="text-body text-ink-2">{t('listings.success.subtitle', { campus: campus?.shortName ?? l?.campus?.shortName ?? '' })}</p>
      </div>
      <div className="mx-auto mt-6 max-w-[360px]">
        {l ? <ListingCard listing={l} noSave /> : q.isError ? <EmptyState icon={PackageOpen} title={t('listings.detail.notFound')} /> : <Skeleton variant="listing-card" />}
      </div>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button asChild size="lg"><Link to={`/listings/${id}`}>{t('listings.success.view')}</Link></Button>
        <Button asChild variant="secondary" size="lg"><Link to="/listings/mine">{t('listings.success.mine')}</Link></Button>
        <Button variant="ghost" size="lg" iconLeft={<Share2 className="size-4" />} onClick={() => setShare(true)}>{t('listings.success.share')}</Button>
      </div>

      <Card variant="outline-accent" padding="lg" className="mt-8 flex flex-col gap-3">
        <h2 className="text-h3 text-ink">{t('listings.success.boost.title')}</h2>
        <p className="text-body text-ink-2">{t('listings.success.boost.body')}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="primary"><Link to={`/pricing?boost=listing:${id}`}>{t('listings.success.boost.cta')}</Link></Button>
          <Button asChild variant="ghost"><Link to={`/listings/${id}`}>{t('listings.success.boost.skip')}</Link></Button>
        </div>
      </Card>

      <section className="mt-8 flex flex-col gap-2">
        <h2 className="text-h3 text-ink">{t('listings.success.next')}</h2>
        <ul className="flex flex-col gap-2 text-body text-ink-2">
          <li className="flex items-center gap-2"><Bell className="size-4 text-ink-3" aria-hidden />{t('listings.success.nextMatches')}</li>
          <li className="flex items-center gap-2"><PackageOpen className="size-4 text-ink-3" aria-hidden /><Link to={`/post/item?bundleFor=${id}`} className="hover:underline">{t('listings.success.nextBundle')}</Link></li>
        </ul>
      </section>
      {l && <ShareModal listing={l} open={share} onClose={() => setShare(false)} />}
    </div>
  );
}
