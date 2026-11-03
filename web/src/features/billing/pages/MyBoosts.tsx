// /billing/boosts — my boosts: active / scheduled / ended, per-boost stats (impressions, clicks, CTR, daily bars, uplift),
// cancel with a prorated wallet-credit preview, and "boost something" entry points into the BoostSheet.
import { useMemo, useState } from 'react';
import { ArrowUpRight, BarChart3, CircleAlert, Globe2, Sparkles, XCircle } from 'lucide-react';
import { Link } from 'react-router';
import type { BuddyCard, ItemCard, ListingCard, Paginated } from '@shared/types';
import { Badge, Button, Card, EmptyState, Modal, Pagination, Skeleton, Tabs } from '@/components';
import { Head } from '@/app/Head';
import { RequireAuth } from '@/app/guards';
import { errorMessage } from '@/app/errors';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { useQuery } from '@tanstack/react-query';
import { useBoostStats, useCancelBoost, useMyBoosts, type BoostDto } from '../api';
import { BoostSheet } from '../components/BoostSheet';
import { BarChart, BoostStatusBadge, TestModeBand, entityPath } from '../components/shared';

type Entity = ListingCard | ItemCard | BuddyCard;
type Target = { type: 'listing' | 'market_item' | 'buddy_post'; id: string };

export default function MyBoostsPage() {
  return <RequireAuth><MyBoosts /></RequireAuth>;
}

function MyBoosts() {
  const t = useT();
  const [status, setStatus] = useState<'all' | 'active' | 'scheduled' | 'ended'>('all');
  const [page, setPage] = useState(1);
  const q = useMyBoosts(status, page);
  const [statsFor, setStatsFor] = useState<BoostDto | null>(null);
  const [cancelFor, setCancelFor] = useState<BoostDto | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const counts = q.data?.counts;
  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('billing.boosts.title')} />
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-ink">{t('billing.boosts.title')}</h1>
          <p className="mt-1 text-small text-ink-2">{t('billing.boosts.subtitle')}</p>
        </div>
        <Button asChild variant="ghost" size="sm"><Link to="/pricing">{t('billing.pricing.title')}</Link></Button>
      </header>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          <Tabs variant="underline" value={status} onChange={(k) => { setStatus(k); setPage(1); }} label={t('billing.boosts.title')} items={[
            { key: 'all', label: t('billing.boosts.tab.all') },
            { key: 'active', label: t('billing.boosts.tab.active'), count: counts?.active },
            { key: 'scheduled', label: t('billing.boosts.tab.scheduled'), count: counts?.scheduled },
            { key: 'ended', label: t('billing.boosts.tab.ended'), count: counts?.ended },
          ]} />
          {q.isLoading && <div className="flex flex-col gap-3"><Skeleton variant="row" /><Skeleton variant="row" /><Skeleton variant="row" /></div>}
          {q.isError && <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => q.refetch() }} />}
          {q.data && q.data.items.length === 0 && <EmptyState icon={Sparkles} title={t('billing.boosts.emptyTitle')} description={t('billing.boosts.emptyDescription')} />}
          {q.data && q.data.items.length > 0 && (
            <ul className="flex flex-col gap-3">
              {q.data.items.map((b) => <BoostRow key={b.id} b={b} onStats={() => setStatsFor(b)} onCancel={() => setCancelFor(b)} onExtend={() => setTarget({ type: b.entityType, id: b.entityId })} />)}
            </ul>
          )}
          {q.data && q.data.total > q.data.pageSize && <Pagination page={page} pageSize={q.data.pageSize} total={q.data.total} onChange={setPage} />}
        </div>
        <aside className="flex flex-col gap-3">
          <BoostSomething onPick={setTarget} />
          <Card padding="md" variant="sunken" className="flex flex-col gap-2 text-small text-ink-2">
            <h2 className="text-small font-semibold text-ink">{t('billing.boosts.rulesTitle')}</h2>
            <p>{t('billing.boosts.rules')}</p>
            <p className="flex items-center gap-2"><Badge variant="boosted" size="sm" /><span className="text-caption">{t('billing.boosts.labelNote')}</span></p>
          </Card>
          <TestModeBand compact />
        </aside>
      </div>
      {statsFor && <StatsModal boost={statsFor} onClose={() => setStatsFor(null)} />}
      {cancelFor && <CancelModal boost={cancelFor} onClose={() => setCancelFor(null)} />}
      {target && <BoostSheet open entityType={target.type} entityId={target.id} onClose={() => setTarget(null)} surface="owner_panel" />}
    </div>
  );
}

function entityTitle(e: Entity | undefined): string {
  return e && 'title' in e ? e.title : '—';
}
function entityCover(e: Entity | undefined): string | null {
  return e && 'coverUrl' in e ? e.coverUrl : null;
}

function BoostRow({ b, onStats, onCancel, onExtend }: { b: BoostDto; onStats: () => void; onCancel: () => void; onExtend: () => void }) {
  const t = useT();
  const { formatDate, formatNumber } = useLocale();
  const entity = b.entity as Entity | undefined;
  const live = b.status === 'active' || b.status === 'scheduled';
  return (
    <li>
      <Card padding="md" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link to={entityPath(b.entityType, b.entityId)} className="flex min-w-0 flex-1 items-center gap-3">
          <span className="relative size-16 shrink-0 overflow-hidden rounded-sm bg-sunken">
            {entityCover(entity) && <img src={entityCover(entity)!} alt="" className="size-full object-cover dark:brightness-[.92]" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-body font-semibold text-ink">{entityTitle(entity)}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-caption text-ink-3">
              <BoostStatusBadge status={b.status} />
              <span>{t(`billing.entity.${b.entityType}`)} · {t(`billing.tier.${b.tier}`)}</span>
              {b.nationwide && <Badge variant="accent" size="sm" icon={<Globe2 />}>{t('billing.boost.nationwideBadge')}</Badge>}
              {b.pausedAt && <Badge variant="warning" size="sm">{t('billing.boosts.paused')}</Badge>}
            </span>
            <span className="mt-0.5 block text-caption tnum text-ink-3">{formatDate(b.startsAt)} → {formatDate(b.endsAt)} · {t('billing.boosts.impressions', { n: formatNumber(b.impressions) })} · {t('billing.boosts.clicks', { n: formatNumber(b.clicks) })}</span>
          </span>
        </Link>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" size="sm" iconLeft={<BarChart3 />} onClick={onStats}>{t('billing.boosts.stats')}</Button>
          {live && <Button variant="ghost" size="sm" iconLeft={<ArrowUpRight />} onClick={onExtend}>{t('billing.boosts.extend')}</Button>}
          {live && <Button variant="ghost" size="sm" iconLeft={<XCircle />} onClick={onCancel}>{t('common.cancel')}</Button>}
        </div>
      </Card>
    </li>
  );
}

function StatsModal({ boost, onClose }: { boost: BoostDto; onClose: () => void }) {
  const t = useT();
  const { formatDate, formatNumber, formatPercent } = useLocale();
  const q = useBoostStats(boost.id);
  const data = useMemo(() => (q.data?.daily ?? []).map((d) => ({ label: formatDate(d.date, 'monthDay'), value: d.impressions })), [q.data, formatDate]);
  return (
    <Modal open onClose={onClose} title={t('billing.boosts.statsTitle')} description={entityTitle(boost.entity as Entity | undefined)} size="md">
      {q.isLoading && <Skeleton variant="rect" height={200} />}
      {q.isError && <EmptyState size="sm" title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => q.refetch() }} />}
      {q.data && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([['impressions', formatNumber(q.data.impressions)], ['clicks', formatNumber(q.data.clicks)], ['ctr', formatPercent(q.data.ctr)], ['uplift', q.data.upliftViews ? `×${q.data.upliftViews}` : '—']] as const).map(([k, v]) => (
              <div key={k} className="rounded-sm bg-sunken px-3 py-2"><dt className="text-caption text-ink-3">{t(`billing.boosts.metric.${k}`)}</dt><dd className="text-price tnum text-ink">{v}</dd></div>
            ))}
          </dl>
          {data.length > 0 ? <BarChart data={data} height={150} /> : <p className="text-small text-ink-3">{t('billing.boosts.noData')}</p>}
          <p className="text-caption text-ink-3">{t('billing.boosts.statsNote')}</p>
        </div>
      )}
    </Modal>
  );
}

function CancelModal({ boost, onClose }: { boost: BoostDto; onClose: () => void }) {
  const t = useT();
  const { formatMoney } = useLocale();
  const cancel = useCancelBoost();
  const total = Date.parse(boost.endsAt) - Date.parse(boost.startsAt);
  const remaining = Math.max(0, Math.min(total, Date.parse(boost.endsAt) - Date.now()));
  const price = boost.plan?.priceCents ?? 0;
  const estimate = total > 0 ? Math.floor((price * remaining) / total) : 0;
  const submit = async () => {
    try {
      const r = await cancel.mutateAsync(boost.id);
      toast.success(t('billing.boosts.cancelled', { amount: formatMoney(r.refundCents) }));
      onClose();
    } catch (e) { toast.error(errorMessage(t, e)); }
  };
  return (
    <Modal open onClose={onClose} title={t('billing.boosts.cancelTitle')} size="sm" footer={<><Button variant="ghost" onClick={onClose}>{t('billing.boosts.keep')}</Button><Button variant="danger" loading={cancel.isPending} onClick={submit}>{t('billing.boosts.confirmCancel')}</Button></>}>
      <p className="text-small text-ink-2">{t('billing.boosts.cancelBody', { amount: formatMoney(estimate) })}</p>
    </Modal>
  );
}

/** "Boost something" — lists the viewer's own active posts (listings / items / buddy posts) as entry points. */
function BoostSomething({ onPick }: { onPick: (t: Target) => void }) {
  const t = useT();
  const { user } = useAuth();
  const uid = user?.id;
  const listings = useQuery({ queryKey: ['billing', 'mine', 'listings', uid], queryFn: () => api<Paginated<ListingCard>>('/api/listings', { query: { ownerId: uid, scope: 'nationwide', pageSize: 6 } }), enabled: !!uid, retry: false });
  const items = useQuery({ queryKey: ['billing', 'mine', 'items', uid], queryFn: () => api<Paginated<ItemCard>>('/api/market/items', { query: { sellerId: uid, pageSize: 6 } }), enabled: !!uid, retry: false });
  const posts = useQuery({ queryKey: ['billing', 'mine', 'buddy', uid], queryFn: () => api<Paginated<BuddyCard>>('/api/buddy/posts', { query: { authorId: uid, pageSize: 6 } }), enabled: !!uid, retry: false });
  const rows: { type: Target['type']; id: string; title: string }[] = [
    ...(Array.isArray(listings.data?.items) ? listings.data!.items.filter((l) => l.status === 'active').map((l) => ({ type: 'listing' as const, id: l.id, title: l.title })) : []),
    ...(Array.isArray(items.data?.items) ? items.data!.items.filter((i) => i.status === 'active').map((i) => ({ type: 'market_item' as const, id: i.id, title: i.title })) : []),
    ...(Array.isArray(posts.data?.items) ? posts.data!.items.filter((p) => p.status === 'open').map((p) => ({ type: 'buddy_post' as const, id: p.id, title: p.title })) : []),
  ].slice(0, 8);
  const loading = listings.isLoading || items.isLoading || posts.isLoading;
  return (
    <Card padding="md" className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-small font-semibold text-ink"><Sparkles className="size-4 text-accent-text" aria-hidden />{t('billing.boosts.boostSomething')}</h2>
      {loading ? <Skeleton variant="text" lines={3} /> : rows.length === 0 ? (
        <p className="text-caption text-ink-3">{t('billing.boosts.nothingToBoost')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((r) => (
            <li key={`${r.type}:${r.id}`} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1"><span className="block truncate text-small text-ink">{r.title}</span><span className="text-caption text-ink-3">{t(`billing.entity.${r.type}`)}</span></span>
              <Button size="sm" variant="secondary" onClick={() => onPick({ type: r.type, id: r.id })}>{t('billing.boosts.boostCta')}</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
