// /market/wishlist — saved items with price-drop badges (DATA_MODEL §3.7).
import { ArrowDownRight, CircleAlert } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { Badge, EmptyState, Pagination, Skeleton } from '@/components';
import { NoItems } from '@/components/illustrations';
import { Head } from '@/app/Head';
import { RequireAuth } from '@/app/guards';
import { useLocale, useT } from '@/lib/i18n';
import { useWishlist } from '../api';
import { ItemCard } from '../components/ItemCard';

function WishlistPage() {
  const t = useT();
  const navigate = useNavigate();
  const { formatMoney } = useLocale();
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const list = useWishlist(page);
  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('market.wishlist.title')} />
      <h1 className="text-h1 text-ink">{t('market.wishlist.title')}</h1>
      <p className="text-small text-ink-2">{t('market.wishlist.subtitle')}{list.data ? ` · ${t('market.count', { n: list.data.total })}` : ''}</p>
      <div className="mt-5">
        {list.isPending ? (
          <div aria-busy="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} variant="item-card" />)}</div>
        ) : list.isError ? (
          <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => void list.refetch() }} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={<NoItems size={120} />} title={t('market.wishlist.empty')} description={t('market.wishlist.emptyHint')} action={{ label: t('market.browse'), onClick: () => navigate('/market') }} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-6">
              {list.data.items.map((it) => (
                <ItemCard
                  key={it.id}
                  item={it}
                  showCampus
                  extra={
                    it.priceDropCents ? (
                      <Badge variant="success" size="sm" icon={<ArrowDownRight className="size-3" aria-hidden />} className="w-fit">{t('market.wishlist.priceDrop', { price: formatMoney(it.priceDropCents) })}</Badge>
                    ) : it.priceAtAddCents != null && it.priceAtAddCents !== it.priceCents ? (
                      <span className="text-caption text-ink-3">{t('market.wishlist.wasPrice', { price: formatMoney(it.priceAtAddCents) })}</span>
                    ) : null
                  }
                />
              ))}
            </div>
            <Pagination page={page} pageSize={24} total={list.data.total} onChange={(p) => setSp(p > 1 ? { page: String(p) } : {}, { replace: true })} className="mt-6" />
          </>
        )}
      </div>
    </div>
  );
}

export default function Wishlist() {
  return (
    <RequireAuth>
      <WishlistPage />
    </RequireAuth>
  );
}
