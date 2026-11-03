// /market/bundles/:id — a seller's move-out bundle: mosaic, pricing (sum vs. bundle price), linked sublet, items, contact.
import { useState } from 'react';
import { CalendarDays, CircleAlert, Home, MessageCircle, PackageOpen, Pencil } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge, Button, EmptyState, Modal, Skeleton } from '@/components';
import { Head } from '@/app/Head';
import { errorMessage } from '@/app/errors';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { useBundle, useCloseBundle, useDeleteBundle } from '../api';
import { BundleMosaic } from '../components/BundleCard';
import { ItemCard } from '../components/ItemCard';
import { SellerStrip } from '../components/shared';

export default function BundleDetail() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, status: authStatus } = useAuth();
  const { formatMoney, formatDate } = useLocale();
  const bundle = useBundle(id);
  const close = useCloseBundle();
  const del = useDeleteBundle();
  const [confirm, setConfirm] = useState<'close' | 'delete' | null>(null);
  const [contacting, setContacting] = useState(false);

  if (bundle.isPending) {
    return <div className="mx-auto w-full max-w-detail px-4 lg:px-8" aria-busy="true"><Skeleton variant="rect" height={360} className="rounded-lg" /><div className="mt-4"><Skeleton variant="text" lines={3} /></div></div>;
  }
  if (bundle.isError || !bundle.data) {
    const notFound = bundle.error instanceof ApiError && bundle.error.status === 404;
    return <div className="mx-auto w-full max-w-detail px-4 lg:px-8"><EmptyState icon={notFound ? PackageOpen : CircleAlert} title={notFound ? t('market.bundle.notFound') : t('error.generic')} action={{ label: t('market.browse'), onClick: () => navigate('/market') }} /></div>;
  }
  const b = bundle.data;
  const isOwner = !!user && user.id === b.sellerId;
  const closed = b.status !== 'active';
  const items = b.items ?? [];
  const saving = b.totalCents - b.bundleCents;

  const contact = async () => {
    if (authStatus !== 'authed') { navigate(`/login?next=${encodeURIComponent(`/market/bundles/${b.id}`)}`); return; }
    if ((user?.trustLevel ?? 0) < 1) { toast.info(t('market.toast.verifyToContact')); navigate(`/verify-email?reason=contact&next=${encodeURIComponent(`/market/bundles/${b.id}`)}`); return; }
    setContacting(true);
    try {
      const r = await api<{ conversationId: string }>(`/api/market/bundles/${b.id}/contact`, { method: 'POST', body: {} });
      navigate(`/chat/${r.conversationId}`);
    } catch (e) {
      toast.error(errorMessage(t, e));
    } finally {
      setContacting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-detail px-4 lg:px-8">
      <Head title={b.title} />
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-7">
          <BundleMosaic bundle={b} className="rounded-lg" />
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Badge variant="neutral" icon={<PackageOpen className="size-3" aria-hidden />}>{t('market.bundle.title')}</Badge>
            {closed && <Badge variant="warning">{t('market.bundle.closed')}</Badge>}
            {b.discountPct > 0 && !closed && <Badge variant="accent">{t('market.bundle.discount', { pct: b.discountPct })}</Badge>}
          </div>
          <h1 className="mt-2 text-h1 text-ink">{b.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-2">
            <span>{t('market.bundle.items', { n: b.itemCount })}</span>
            {b.moveOutDate && <span className="flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden />{t('market.bundle.moveOutBefore', { date: formatDate(b.moveOutDate, 'long') })}</span>}
          </p>
          {b.description && <p className="mt-4 whitespace-pre-line text-body text-ink-2 max-w-reading-text">{b.description}</p>}

          {b.listing && (
            <section className="mt-6" aria-labelledby="bundle-listing">
              <h2 id="bundle-listing" className="text-h3 text-ink">{t('market.bundle.listing')}</h2>
              <p className="text-small text-ink-3">{t('market.bundle.listingHint')}</p>
              <Link to={`/listings/${b.listing.id}`} className="mt-3 flex items-center gap-3 rounded-card border border-line bg-surface p-3 transition-colors hover:border-line-strong">
                <span className="relative h-[72px] w-24 shrink-0 overflow-hidden rounded-sm bg-sunken">
                  {b.listing.coverUrl ? <img src={b.listing.coverUrl} alt="" className="size-full object-cover dark:brightness-[.92]" /> : <Home className="absolute inset-0 m-auto size-6 text-ink-4" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold text-ink">{b.listing.title}</span>
                  <span className="block text-small text-ink-2">{formatMoney(b.listing.priceCents, { perMonth: true })} · {b.listing.neighborhood ?? b.listing.city}</span>
                </span>
                <span className="text-small text-ink-2">{t('market.bundle.viewListing')}</span>
              </Link>
            </section>
          )}

          {b.seller && <SellerStrip seller={b.seller} className="mt-6" />}
        </div>

        <aside className="lg:col-span-5">
          <div className="flex flex-col gap-4 lg:sticky lg:top-20">
            <div className="rounded-card border border-line bg-surface p-4 lg:p-5">
              <dl className="grid grid-cols-2 gap-y-1 text-small">
                <dt className="text-ink-2">{t('market.bundle.total')}</dt>
                <dd className="text-right text-ink tnum line-through decoration-ink-3">{formatMoney(b.totalCents)}</dd>
                <dt className="text-body font-semibold text-ink">{t('market.bundle.bundlePrice')}</dt>
                <dd className="text-right text-price-lg text-ink tnum">{formatMoney(b.bundleCents)}</dd>
              </dl>
              {saving > 0 && <p className="mt-1 text-small text-success">{t('market.bundle.save', { price: formatMoney(saving) })}</p>}
              <div className="mt-4 flex flex-col gap-2">
                {closed ? (
                  <p className="text-small text-ink-2">{t('market.bundle.closedHint')}</p>
                ) : isOwner ? (
                  <>
                    <Button size="lg" fullWidth variant="secondary" iconLeft={<Pencil className="size-4" aria-hidden />} asChild><Link to={`/market/bundles/${b.id}/edit`}>{t('market.bundle.edit')}</Link></Button>
                    <Button variant="ghost" onClick={() => setConfirm('close')}>{t('market.bundle.close')}</Button>
                    <Button variant="ghost" className="text-danger" onClick={() => setConfirm('delete')}>{t('market.bundle.delete')}</Button>
                  </>
                ) : (
                  <>
                    <Button size="lg" fullWidth iconLeft={<MessageCircle className="size-4" aria-hidden />} onClick={contact} loading={contacting}>{t('market.bundle.contact')}</Button>
                    <p className="text-caption text-ink-3">{t('market.detail.buyHint')}</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <section className="mt-10">
        <h2 className="text-h2 text-ink">{t('market.bundle.items', { n: items.length })}</h2>
        {items.length === 0 ? (
          <EmptyState size="sm" icon={PackageOpen} title={t('market.bundle.empty')} />
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
            {items.map((it) => <ItemCard key={it.id} item={it} />)}
          </div>
        )}
      </section>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'delete' ? t('market.bundle.delete') : t('market.bundle.close')}
        description={confirm === 'delete' ? t('market.bundle.deleteConfirm') : t('market.bundle.closeConfirm')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={close.isPending || del.isPending} onClick={() => (confirm === 'delete' ? del.mutate(b.id, { onSuccess: () => navigate('/market/mine'), onError: (e) => toast.error(errorMessage(t, e)) }) : close.mutate(b.id, { onSuccess: () => setConfirm(null), onError: (e) => toast.error(errorMessage(t, e)) }))}>
              {t('common.confirm')}
            </Button>
          </>
        }
      />
    </div>
  );
}
