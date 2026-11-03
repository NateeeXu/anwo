// /listings/saved — the viewer's saved listings.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { EmptyState, PageHeader, Pagination, SkeletonList } from '@/components';
import { NoListings } from '@/components/illustrations';
import { useLocale, useT } from '@/lib/i18n';
import { Head } from '@/app/Head';
import { RequireAuth } from '@/app/guards';
import { keys, listingsApi } from '../api';
import { ListingCard } from '../components/ListingCard';

function SavedInner() {
  const t = useT();
  const { formatNumber } = useLocale();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: keys.saved({ page }), queryFn: () => listingsApi.saved({ page, pageSize: 20 }) });
  const items = q.data?.items ?? [];
  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('listings.saved.title')} />
      <PageHeader title={t('listings.saved.title')} subtitle={q.data ? t('listings.saved.subtitle', { count: formatNumber(q.data.total) }) : undefined} back />
      {q.isLoading ? (
        <SkeletonList count={8} variant="listing-card" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4" />
      ) : q.isError ? (
        <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => void q.refetch() }} />
      ) : items.length === 0 ? (
        <EmptyState icon={<NoListings size={120} />} title={t('listings.saved.empty')} description={t('listings.saved.emptyHint')} action={{ label: t('listings.saved.browse'), to: '/listings' }} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">{items.map((l) => <ListingCard key={l.id} listing={l} showCity />)}</div>
          <Pagination page={page} pageSize={20} total={q.data?.total ?? 0} onChange={setPage} className="mt-6" />
        </>
      )}
    </div>
  );
}

export default function Saved() {
  return (
    <RequireAuth>
      <SavedInner />
    </RequireAuth>
  );
}
