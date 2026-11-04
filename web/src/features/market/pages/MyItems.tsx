// /market/mine — seller dashboard: stats, status tabs, item rows with actions (edit / mark sold / reserve / renew / delete)
// and the 搬家甩卖 (move-out bundles) section linking items to one of the seller's listings.
import { useMemo, useState } from 'react';
import { CircleAlert, Eye, Heart, MessageCircle, MoreHorizontal, PackageOpen, Plus } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { Item } from '@shared/types';
import { Badge, Button, DropdownMenu, EmptyState, Modal, Skeleton, StatTile, Tabs, type MenuEntry } from '@/components';
import { NoItems } from '@/components/illustrations';
import { BoostSheet } from '@/features/billing/components/BoostSheet';
import { Head } from '@/app/Head';
import { RequireAuth } from '@/app/guards';
import { errorMessage } from '@/app/errors';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { useBundles, useDeleteItem, useItemAction, useMyItems } from '../api';
import { BundleCard } from '../components/BundleCard';
import { MarkSoldModal } from '../components/MarkSoldModal';
import { CategoryIcon, statusLabelKey } from '../components/shared';

const TABS = ['all', 'active', 'reserved', 'draft', 'sold', 'expired'] as const;

function ItemRow({ item, onSold, onDelete, onBoost }: { item: Item; onSold: () => void; onDelete: () => void; onBoost: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const { formatPrice, formatRelative, formatMoney } = useLocale();
  const action = useItemAction();
  const run = (a: 'publish' | 'reserve' | 'unreserve' | 'renew', key: string) => action.mutate({ id: item.id, action: a }, { onSuccess: () => toast.success(t(key)), onError: (e) => toast.error(errorMessage(t, e)) });
  const statusKey = statusLabelKey(item.status);
  const daysLeft = item.expiresAt ? Math.max(0, Math.ceil((Date.parse(item.expiresAt) - Date.now()) / 86_400_000)) : null;
  const menu: MenuEntry[] = [
    { label: t('market.detail.edit'), onSelect: () => navigate(`/market/${item.id}/edit`), disabled: item.status === 'sold' },
    ...(item.status === 'draft' ? [{ label: t('market.detail.publish'), onSelect: () => run('publish', 'market.mine.published') }] : []),
    ...(item.status === 'active' ? [{ label: t('market.detail.reserve'), onSelect: () => run('reserve', 'market.mine.reserved') }] : []),
    ...(item.status === 'reserved' ? [{ label: t('market.detail.unreserve'), onSelect: () => run('unreserve', 'market.mine.unreserved') }] : []),
    ...(item.status === 'expired' || item.status === 'active' ? [{ label: t('market.detail.renew'), onSelect: () => run('renew', 'market.mine.renewed') }] : []),
    ...(item.status === 'active' ? [{ label: t('market.detail.boost'), onSelect: onBoost }] : []),
    'separator',
    { label: t('market.detail.delete'), danger: true, onSelect: onDelete },
  ];
  return (
    <li className="flex gap-3 rounded-card border border-line bg-surface p-3">
      <Link to={`/market/${item.id}`} className={cn('relative size-20 shrink-0 overflow-hidden rounded-sm bg-sunken', item.status === 'sold' && 'opacity-70 grayscale')} aria-label={item.title}>
        {item.coverUrl ? <img src={item.coverUrl} alt="" className="size-full object-cover dark:brightness-[.92]" /> : <CategoryIcon category={item.category} className="absolute inset-0 m-auto size-6 text-ink-4" />}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/market/${item.id}`} className="truncate text-body font-semibold text-ink hover:underline">{item.title}</Link>
          {statusKey && <Badge variant={item.status === 'sold' ? 'neutral' : item.status === 'reserved' ? 'warning' : item.status === 'draft' ? 'info' : 'danger'} size="sm">{t(statusKey)}</Badge>}
          {item.bundleId && <Badge variant="neutral" size="sm" icon={<PackageOpen className="size-3" aria-hidden />}>{t('market.card.bundleBadge')}</Badge>}
        </div>
        <p className="mt-0.5 text-small text-ink-2">
          <span className="text-ink tnum">{formatPrice(item)}</span>
          {item.status === 'sold' && item.soldPriceCents != null && ` · ${t('market.mine.soldFor', { price: formatMoney(item.soldPriceCents) })}`}
          {' · '}{t(`market.cat.${item.category}`)} · {formatRelative(item.createdAt)}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-small text-ink-3">
          <span className="flex items-center gap-1"><Eye className="size-3.5" aria-hidden />{item.viewCount}</span>
          <span className="flex items-center gap-1"><Heart className="size-3.5" aria-hidden />{item.wishlistCount}</span>
          <span className="flex items-center gap-1"><MessageCircle className="size-3.5" aria-hidden />{item.chatCount}</span>
          {item.status === 'active' && daysLeft != null && <span>{t('market.mine.expiresIn', { n: daysLeft })}</span>}
          {item.status === 'expired' && <span className="text-warning">{t('market.mine.expired')}</span>}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start">
        {(item.status === 'active' || item.status === 'reserved') && <Button size="sm" variant="secondary" onClick={onSold}>{t('market.detail.markSold')}</Button>}
        {item.status === 'draft' && <Button size="sm" onClick={() => run('publish', 'market.mine.published')} loading={action.isPending}>{t('market.detail.publish')}</Button>}
        {item.status === 'expired' && <Button size="sm" onClick={() => run('renew', 'market.mine.renewed')} loading={action.isPending}>{t('market.detail.renew')}</Button>}
        <DropdownMenu label={t('market.mine.more')} align="end" trigger={<Button size="sm" variant="ghost" iconOnly aria-label={t('market.mine.more')}><MoreHorizontal className="size-4" aria-hidden /></Button>} items={menu} />
      </div>
    </li>
  );
}

function Dashboard() {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(sp.get('status') ?? '') ? (sp.get('status') as (typeof TABS)[number]) : 'all';
  const list = useMyItems(tab);
  const all = useMyItems('all');
  const bundles = useBundles({ sellerId: user?.id, status: 'all' }, !!user);
  const del = useDeleteItem();
  const [soldItem, setSoldItem] = useState<Item | null>(null);
  const [deleteItem, setDeleteItem] = useState<Item | null>(null);
  const [boostItem, setBoostItem] = useState<Item | null>(null);

  const stats = useMemo(() => {
    const items = all.data?.items ?? [];
    return {
      active: items.filter((i) => i.status === 'active' || i.status === 'reserved').length,
      sold: items.filter((i) => i.status === 'sold').length,
      views: items.reduce((s, i) => s + i.viewCount, 0),
      wishlists: items.reduce((s, i) => s + i.wishlistCount, 0),
    };
  }, [all.data]);
  const counts = all.data?.counts ?? {};
  const tabItems = TABS.map((k) => ({ key: k, label: t(`market.mine.tab.${k}`), count: k === 'all' ? all.data?.total : counts[k] }));

  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('market.mine.title')} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-ink">{t('market.mine.title')}</h1>
          <p className="text-small text-ink-2">{t('market.mine.subtitle')}</p>
        </div>
        <Button iconLeft={<Plus className="size-4" aria-hidden />} onClick={() => navigate('/post/item')}>{t('market.post')}</Button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t('market.mine.stat.active')} value={stats.active} />
        <StatTile label={t('market.mine.stat.sold')} value={stats.sold} />
        <StatTile label={t('market.mine.stat.views')} value={stats.views} />
        <StatTile label={t('market.mine.stat.wishlists')} value={stats.wishlists} />
      </div>

      <Tabs className="mt-6" items={tabItems} value={tab} onChange={(k) => setSp(k === 'all' ? {} : { status: k }, { replace: true })} variant="underline" scrollable label={t('market.mine.title')} />
      <div className="mt-4">
        {list.isPending ? (
          <div aria-busy="true" className="flex flex-col gap-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} variant="row" />)}</div>
        ) : list.isError ? (
          <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => void list.refetch() }} />
        ) : list.data.items.length === 0 ? (
          tab === 'all' ? (
            <EmptyState icon={<NoItems size={120} />} title={t('market.mine.empty')} description={t('market.mine.emptyHint')} action={{ label: t('market.post'), onClick: () => navigate('/post/item') }} />
          ) : (
            <EmptyState size="sm" icon={NoItems} title={t('market.mine.emptyFiltered')} />
          )
        ) : (
          <ul className="flex flex-col gap-3">
            {list.data.items.map((it) => <ItemRow key={it.id} item={it} onSold={() => setSoldItem(it)} onDelete={() => setDeleteItem(it)} onBoost={() => setBoostItem(it)} />)}
          </ul>
        )}
      </div>

      <section className="mt-10" aria-labelledby="bundles-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="bundles-title" className="text-h2 text-ink">{t('market.mine.bundles')}</h2>
            <p className="text-small text-ink-2">{t('market.mine.bundlesHint')}</p>
          </div>
          <Button variant="secondary" iconLeft={<PackageOpen className="size-4" aria-hidden />} onClick={() => navigate('/market/bundles/new')}>{t('market.mine.newBundle')}</Button>
        </div>
        <div className="mt-4">
          {bundles.isPending ? (
            <div aria-busy="true" className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Skeleton variant="item-card" /><Skeleton variant="item-card" /></div>
          ) : !bundles.data || bundles.data.items.length === 0 ? (
            <EmptyState size="sm" icon={PackageOpen} title={t('market.mine.noBundles')} description={t('market.mine.noBundlesHint')} action={{ label: t('market.mine.newBundle'), onClick: () => navigate('/market/bundles/new'), variant: 'secondary' }} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
              {bundles.data.items.map((b) => <BundleCard key={b.id} bundle={b} />)}
            </div>
          )}
        </div>
      </section>

      {soldItem && <MarkSoldModal item={soldItem} open onClose={() => setSoldItem(null)} />}
      {boostItem && <BoostSheet open onClose={() => setBoostItem(null)} entityType="market_item" entityId={boostItem.id} surface="owner_panel" />}
      <Modal open={!!deleteItem} onClose={() => setDeleteItem(null)} title={t('market.detail.delete')} description={t('market.detail.deleteConfirm')} size="sm" footer={<><Button variant="ghost" onClick={() => setDeleteItem(null)}>{t('common.cancel')}</Button><Button variant="danger" loading={del.isPending} onClick={() => deleteItem && del.mutate(deleteItem.id, { onSuccess: () => { toast.success(t('market.mine.deleted')); setDeleteItem(null); }, onError: (e) => toast.error(errorMessage(t, e)) })}>{t('common.delete')}</Button></>} />
    </div>
  );
}

export default function MyItems() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}
