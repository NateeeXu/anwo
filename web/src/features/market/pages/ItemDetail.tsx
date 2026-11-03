// /market/:id — DESIGN.md §7.11 detail: 1:1 gallery, h1, price-lg + OBO chip, condition + category, description, pickup
// StaticMapPreview (approximate circle), seller TrustStrip, rail (私信购买 / 加入心愿单 / 举报), bundle card, similar items.
import { useState } from 'react';
import { CircleAlert, Eye, Heart, Home, Link2, MessageCircle, PackageOpen, Pencil, Tag, Truck } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import type { Item } from '@shared/types';
import { Badge, Button, Chip, DropdownMenu, EmptyState, Modal, PhotoGallery, Select, Skeleton, Textarea, Input } from '@/components';
import { NoItems } from '@/components/illustrations';
import { StaticMapPreview } from '@/components/map';
import { Head } from '@/app/Head';
import { errorMessage } from '@/app/errors';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { useContactSeller, useDeleteItem, useItem, useItemAction, useReportItem, useWishlistToggle } from '../api';
import { ItemCard } from '../components/ItemCard';
import { MarkSoldModal } from '../components/MarkSoldModal';
import { CategoryIcon, ConditionChip, PriceComparison, SellerStrip } from '../components/shared';

const REPORT_REASONS = ['scam', 'spam', 'fake', 'wrong_info', 'duplicate', 'inappropriate', 'harassment', 'other'] as const;

export function ContactModal({ item, open, onClose }: { item: Item; open: boolean; onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const contact = useContactSeller();
  const [message, setMessage] = useState('');
  const [offer, setOffer] = useState('');
  const send = () => {
    const offerCents = offer ? Math.round(Number(offer) * 100) : undefined;
    contact.mutate(
      { id: item.id, body: { message: message.trim() || undefined, offerCents: offerCents && offerCents > 0 ? offerCents : undefined } },
      {
        onSuccess: ({ conversationId }) => {
          track('item.contact_click', { entityType: 'market_item', entityId: item.id });
          toast.success(t('market.contact.sent'));
          onClose();
          navigate(`/chat/${conversationId}`);
        },
        onError: (e) => {
          if (e instanceof ApiError && e.code === 'TRUST_REQUIRED') {
            toast.info(t('market.toast.verifyToContact'));
            navigate(`/verify-email?reason=contact&next=${encodeURIComponent(`/market/${item.id}`)}`);
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
      title={t('market.contact.title')}
      description={t('market.detail.buyHint')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={send} loading={contact.isPending}>{t('market.contact.send')}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ItemCard item={item} variant="row" hideWishlist />
        <Textarea label={t('market.contact.message')} rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('market.contact.placeholder')} />
        {item.obo && !item.isFree && <Input label={t('market.contact.offer')} hint={t('market.contact.offerHint')} prefix="$" type="number" inputMode="decimal" min={0} value={offer} onChange={(e) => setOffer(e.target.value)} />}
      </div>
    </Modal>
  );
}

export function ReportModal({ itemId, open, onClose }: { itemId: string; open: boolean; onClose: () => void }) {
  const t = useT();
  const report = useReportItem();
  const [reason, setReason] = useState<string>('scam');
  const [details, setDetails] = useState('');
  const submit = () =>
    report.mutate({ id: itemId, reason, details }, { onSuccess: () => { toast.success(t('market.report.done')); onClose(); }, onError: (e) => toast.error(errorMessage(t, e)) });
  return (
    <Modal open={open} onClose={onClose} title={t('market.report.title')} size="sm" footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" onClick={submit} loading={report.isPending}>{t('market.report.submit')}</Button></>}>
      <div className="flex flex-col gap-4">
        <Select label={t('market.report.reason')} value={reason} onChange={(v) => setReason(v)} options={REPORT_REASONS.map((r) => ({ value: r, label: t(`market.report.reason.${r}`) }))} />
        <Textarea label={t('market.report.details')} rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} optional />
      </div>
    </Modal>
  );
}

export default function ItemDetail() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, status: authStatus } = useAuth();
  const { formatMoney, formatPrice, formatRelative, formatDistance } = useLocale();
  const item = useItem(id);
  const toggle = useWishlistToggle();
  const action = useItemAction();
  const del = useDeleteItem();
  const [contactOpen, setContactOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [soldOpen, setSoldOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (item.isPending) {
    return (
      <div className="mx-auto w-full max-w-detail px-4 lg:px-8" aria-busy="true">
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7"><Skeleton variant="rect" height={420} className="rounded-lg" /><div className="mt-4"><Skeleton variant="text" lines={3} /></div></div>
          <div className="lg:col-span-5"><Skeleton variant="rect" height={220} className="rounded-card" /></div>
        </div>
      </div>
    );
  }
  if (item.isError || !item.data) {
    const notFound = item.error instanceof ApiError && item.error.status === 404;
    return (
      <div className="mx-auto w-full max-w-detail px-4 lg:px-8">
        <EmptyState icon={notFound ? <NoItems size={120} /> : CircleAlert} title={notFound ? t('market.detail.notFound') : t('error.generic')} description={notFound ? t('market.detail.notFoundHint') : undefined} action={notFound ? { label: t('market.browse'), onClick: () => navigate('/market') } : { label: t('common.retry'), onClick: () => void item.refetch() }} />
      </div>
    );
  }
  const d = item.data;
  const isOwner = !!user && user.id === d.seller.id;
  const sold = d.status === 'sold';
  const inactive = sold || d.status === 'expired' || d.status === 'draft';
  const photos = d.photos.map((p, i) => ({ id: p.id, src: p.url, alt: t('market.card.photoAlt', { title: d.title, index: i + 1 }) }));

  const onWishlist = () => {
    if (authStatus !== 'authed') { toast.info(t('market.toast.loginToWishlist')); navigate(`/login?next=${encodeURIComponent(`/market/${d.id}`)}`); return; }
    const on = !d.wishlisted;
    toggle.mutate({ id: d.id, on }, { onSuccess: () => toast.success(t(on ? 'market.wishlist.added' : 'market.wishlist.removed')), onError: (e) => toast.error(errorMessage(t, e)) });
  };
  const onBuy = () => {
    if (authStatus !== 'authed') { navigate(`/login?next=${encodeURIComponent(`/market/${d.id}`)}`); return; }
    if ((user?.trustLevel ?? 0) < 1) { toast.info(t('market.toast.verifyToContact')); navigate(`/verify-email?reason=contact&next=${encodeURIComponent(`/market/${d.id}`)}`); return; }
    setContactOpen(true);
  };
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: d.title, url });
      else { await navigator.clipboard.writeText(url); toast.success(t('market.detail.copied')); }
      track('item.share', { entityType: 'market_item', entityId: d.id });
    } catch { /* cancelled */ }
  };
  const run = (a: 'publish' | 'reserve' | 'unreserve' | 'renew', msgKey: string) => action.mutate({ id: d.id, action: a }, { onSuccess: () => toast.success(t(msgKey)), onError: (e) => toast.error(errorMessage(t, e)) });
  const onDelete = () => del.mutate(d.id, { onSuccess: () => { toast.success(t('market.mine.deleted')); navigate('/market/mine'); }, onError: (e) => toast.error(errorMessage(t, e)) });

  const ownerMenu = [
    { label: t('market.detail.edit'), icon: <Pencil className="size-4" aria-hidden />, onSelect: () => navigate(`/market/${d.id}/edit`), disabled: sold },
    ...(d.status === 'draft' ? [{ label: t('market.detail.publish'), onSelect: () => run('publish', 'market.mine.published') }] : []),
    ...(d.status === 'active' ? [{ label: t('market.detail.reserve'), onSelect: () => run('reserve', 'market.mine.reserved') }] : []),
    ...(d.status === 'reserved' ? [{ label: t('market.detail.unreserve'), onSelect: () => run('unreserve', 'market.mine.unreserved') }] : []),
    ...(d.status === 'expired' || d.status === 'active' ? [{ label: t('market.detail.renew'), onSelect: () => run('renew', 'market.mine.renewed') }] : []),
    'separator' as const,
    { label: t('market.detail.delete'), danger: true, onSelect: () => setDeleteOpen(true) },
  ];

  return (
    <div className="mx-auto w-full max-w-detail px-4 lg:px-8">
      <Head title={d.title} description={d.description.slice(0, 160)} />
      {isOwner && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-card bg-sunken px-3 py-2 text-small text-ink-2">
          <span>{t('market.detail.ownerBar')} · <Link to="/market/mine" className="text-ink underline-offset-2 hover:underline">{t('market.mine')}</Link></span>
          <div className="flex items-center gap-2">
            {(d.status === 'active' || d.status === 'reserved') && <Button size="sm" variant="secondary" onClick={() => setSoldOpen(true)}>{t('market.detail.markSold')}</Button>}
            <DropdownMenu label={t('market.mine.more')} align="end" trigger={<Button size="sm" variant="ghost">{t('market.mine.more')}</Button>} items={ownerMenu} />
          </div>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        {/* ---------------------------------------------------------- main */}
        <div className="min-w-0 lg:col-span-7">
          <div className={cn(inactive && 'opacity-70', sold && 'grayscale')}>
            {photos.length > 0 ? (
              <PhotoGallery photos={photos} layout="hero" aspect="1" onOpen={(i) => track('item.photo_open', { entityType: 'market_item', entityId: d.id, props: { index: i } })} />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-sunken text-ink-4 sm:aspect-[4/3]">
                <CategoryIcon category={d.category} className="size-16" />
              </div>
            )}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {d.sponsored || d.boostTier ? <Badge variant="boosted" /> : null}
            {sold && <Badge variant="neutral">{t('market.card.sold')}</Badge>}
            {d.status === 'reserved' && <Badge variant="warning">{t('market.card.reserved')}</Badge>}
            {d.status === 'expired' && <Badge variant="neutral">{t('market.card.expired')}</Badge>}
            {d.status === 'draft' && <Badge variant="info">{t('market.card.draft')}</Badge>}
          </div>
          <h1 className="mt-2 text-h1 text-ink">{d.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ConditionChip condition={d.condition} size="md" />
            <Chip size="md" icon={<CategoryIcon category={d.category} />}>{t(`market.cat.${d.category}`)}</Chip>
            <Chip size="md" icon={<Truck className="size-4" aria-hidden />}>{t(`market.detail.delivery.${d.deliveryOption}`)}</Chip>
            {d.brand && <Chip size="md" icon={<Tag className="size-4" aria-hidden />}>{d.brand}</Chip>}
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-3">
            <span>{t('market.detail.posted', { when: formatRelative(d.createdAt) })}</span>
            <span className="flex items-center gap-1"><Eye className="size-3.5" aria-hidden />{t('market.detail.views', { n: d.viewCount })}</span>
            <span className="flex items-center gap-1"><Heart className="size-3.5" aria-hidden />{t('market.detail.wishlists', { n: d.wishlistCount })}</span>
            {d.chatCount > 0 && <span className="flex items-center gap-1"><MessageCircle className="size-3.5" aria-hidden />{t('market.detail.chats', { n: d.chatCount })}</span>}
          </p>

          <section className="mt-6">
            <h2 className="text-h3 text-ink">{t('market.detail.description')}</h2>
            {d.description ? <p className="mt-2 whitespace-pre-line text-body text-ink-2 max-w-reading-text">{d.description}</p> : <p className="mt-2 text-body text-ink-3">{t('market.detail.noDescription')}</p>}
          </section>

          {d.pickupLat != null && d.pickupLng != null && d.deliveryOption !== 'delivery' && (
            <section className="mt-6">
              <h2 className="text-h3 text-ink">{t('market.detail.pickup')}</h2>
              <p className="mt-1 text-small text-ink-2">
                {d.pickupLabel && <span className="text-ink">{d.pickupLabel}</span>}
                {d.distanceToCampusM != null && <span>{d.pickupLabel ? ' · ' : ''}{t('market.card.fromCampus', { d: formatDistance(d.distanceToCampusM) })}</span>}
              </p>
              <StaticMapPreview lat={d.pickupLat} lng={d.pickupLng} approximateRadiusM={220} height={240} className="mt-3" aria-label={t('market.detail.pickup')} />
              <p className="mt-2 text-caption text-ink-3">{t('market.detail.pickupApprox')}</p>
            </section>
          )}

          <SellerStrip seller={d.seller} onReport={!isOwner ? () => (authStatus === 'authed' ? setReportOpen(true) : navigate(`/login?next=${encodeURIComponent(`/market/${d.id}`)}`)) : undefined} className="mt-6" />
        </div>

        {/* ---------------------------------------------------------- rail */}
        <aside className="lg:col-span-5">
          <div className="flex flex-col gap-4 lg:sticky lg:top-20">
            <div className="rounded-card border border-line bg-surface p-4 lg:p-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className={cn('text-price-lg tnum', sold ? 'text-ink-3 line-through decoration-ink-3' : 'text-ink')}>{formatPrice({ priceCents: d.priceCents, isFree: d.isFree })}</span>
                {d.obo && !d.isFree && <Chip variant="accent" size="sm">{t('market.detail.obo')}</Chip>}
                {d.originalPriceCents != null && d.originalPriceCents > d.priceCents && <span className="text-small text-ink-3">{t('market.detail.orig', { price: formatMoney(d.originalPriceCents) })}</span>}
              </div>
              {sold && d.soldPriceCents != null && <p className="mt-1 text-small text-ink-2">{t('market.mine.soldFor', { price: formatPrice({ priceCents: d.soldPriceCents, isFree: d.soldPriceCents === 0 }) })}</p>}
              <PriceComparison priceCents={d.priceCents} isFree={d.isFree} suggestion={d.suggestedPrice} className="mt-2" />
              <div className="mt-4 flex flex-col gap-2">
                {sold ? (
                  <>
                    <p className="text-body font-semibold text-ink">{t('market.detail.soldTitle')}</p>
                    <p className="text-small text-ink-2">{t('market.detail.soldHint')}</p>
                    <Button variant="secondary" size="lg" fullWidth asChild><Link to={`/market?category=${d.category}`}>{t('market.detail.seeSimilar')}</Link></Button>
                  </>
                ) : isOwner ? (
                  <>
                    <Button size="lg" fullWidth variant="secondary" iconLeft={<Pencil className="size-4" aria-hidden />} asChild><Link to={`/market/${d.id}/edit`}>{t('market.detail.edit')}</Link></Button>
                    {(d.status === 'active' || d.status === 'reserved') && <Button size="lg" fullWidth onClick={() => setSoldOpen(true)}>{t('market.detail.markSold')}</Button>}
                    {d.status === 'draft' && <Button size="lg" fullWidth onClick={() => run('publish', 'market.mine.published')} loading={action.isPending}>{t('market.detail.publish')}</Button>}
                    {d.status === 'expired' && <Button size="lg" fullWidth onClick={() => run('renew', 'market.mine.renewed')} loading={action.isPending}>{t('market.detail.renew')}</Button>}
                  </>
                ) : (
                  <>
                    {d.status === 'reserved' && <p className="text-small text-ink-2">{t('market.detail.reservedHint')}</p>}
                    <Button size="lg" fullWidth iconLeft={<MessageCircle className="size-4" aria-hidden />} onClick={onBuy} disabled={d.status === 'expired'}>{t('market.detail.buy')}</Button>
                    <Button size="lg" fullWidth variant="secondary" iconLeft={<Heart className={cn('size-4', d.wishlisted && 'fill-current')} aria-hidden />} onClick={onWishlist} loading={toggle.isPending} aria-pressed={!!d.wishlisted}>
                      {t(d.wishlisted ? 'market.detail.wishlisted' : 'market.detail.wishlist')}
                    </Button>
                    <p className="text-caption text-ink-3">{t('market.detail.buyHint')}</p>
                  </>
                )}
                <div className="flex items-center justify-center gap-1 pt-1">
                  <Button variant="ghost" size="sm" iconLeft={<Link2 className="size-4" aria-hidden />} onClick={share}>{t('market.detail.share')}</Button>
                  {!isOwner && <Button variant="ghost" size="sm" onClick={() => (authStatus === 'authed' ? setReportOpen(true) : navigate(`/login?next=${encodeURIComponent(`/market/${d.id}`)}`))}>{t('market.detail.report')}</Button>}
                </div>
              </div>
            </div>

            {d.bundle && d.bundle.status === 'active' && (
              <Link to={`/market/bundles/${d.bundle.id}`} className="group flex items-center gap-3 rounded-card border border-line bg-surface p-3 transition-colors hover:border-line-strong">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-sunken text-ink-2"><PackageOpen className="size-5" strokeWidth={1.75} aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-caption text-ink-3">{t('market.detail.fromBundle')}</span>
                  <span className="block truncate text-body font-semibold text-ink">{d.bundle.title}</span>
                  <span className="block text-small text-ink-2">{t('market.detail.bundleCta', { n: d.bundle.itemCount, pct: d.bundle.discountPct })}</span>
                </span>
                {d.bundle.listing && <Home className="size-4 shrink-0 text-ink-3" aria-hidden />}
              </Link>
            )}
          </div>
        </aside>
      </div>

      {d.similar && d.similar.length > 0 && (
        <section className="mt-10">
          <h2 className="text-h2 text-ink">{t('market.detail.similar')}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4">
            {d.similar.map((s) => <ItemCard key={s.id} item={s} />)}
          </div>
        </section>
      )}

      {!isOwner && <ContactModal item={d} open={contactOpen} onClose={() => setContactOpen(false)} />}
      {!isOwner && <ReportModal itemId={d.id} open={reportOpen} onClose={() => setReportOpen(false)} />}
      {isOwner && <MarkSoldModal item={d} open={soldOpen} onClose={() => setSoldOpen(false)} />}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('market.detail.delete')} description={t('market.detail.deleteConfirm')} size="sm" footer={<><Button variant="ghost" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Button><Button variant="danger" onClick={onDelete} loading={del.isPending}>{t('common.delete')}</Button></>} />
    </div>
  );
}
