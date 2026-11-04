// Home (DESIGN.md §7.1): hero-less editorial feed. First paint is listings.
import { Globe, Landmark, Plane, Shield, ShoppingBag, Smartphone, Truck, Warehouse } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from 'react-router';
import type { BuddyCard, Campus, CampusStats, ItemCard, ListingCard, Paginated, Partner, WantedCard } from '@shared/types';
import { Badge, Button, Card, EmptyState, Skeleton } from '../components';
import { NoBuddy, NoItems, NoListings } from '../components/illustrations';
import { api } from '../lib/api';
import { useCampus } from '../lib/campus';
import { useLocale, useT } from '../lib/i18n';
import { Head } from '../app/Head';
import { GlobalSearch } from '../app/shell/GlobalSearch';
import { usePostSheet } from '../app/shell/shellStore';
import { CardGrid, QueryState, Section } from './home/Section';
import { ListingCard as ListingCardView } from '../features/listings/components/ListingCard';
import { WantedCard as WantedCardView } from '../features/wanted/components/WantedCard';
import { ItemCard as ItemCardView } from '../features/market/components/ItemCard';
import { BuddyCard as BuddyCardView } from '../features/buddy/BuddyCard';

const PARTNER_ICONS: Record<string, typeof Landmark> = { bank: Landmark, sim: Smartphone, insurance: Shield, movers: Truck, storage: Warehouse, pickup: Plane, other: ShoppingBag };

/** Sponsored placement (GET /api/billing/sponsorships): always labelled, opened through the tracked /go redirect. */
type HomeSponsor = { id: string; sponsorName: string; title: string; titleZh: string | null; body: string | null; bodyZh: string | null; logoUrl: string | null; goUrl: string };

/** Partner link from the home strip: keeps the API's goUrl, sets placement=home and the campus for attribution. */
function homeGoUrl(goUrl: string, campusId: string | null | undefined): string {
  const u = new URL(goUrl, 'http://x');
  u.searchParams.set('placement', 'home');
  if (campusId) u.searchParams.set('campusId', campusId);
  return `${u.pathname}${u.search}`;
}

function SponsorStrip({ items }: { items: HomeSponsor[] }) {
  const t = useT();
  const { locale } = useLocale();
  const zh = locale === 'zh-CN';
  return (
    <section aria-label={t('common.sponsored')} className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((s) => (
        <a key={s.id} href={s.goUrl} target="_blank" rel="sponsored noopener" data-testid="home-sponsor"
          className="flex min-w-0 items-center gap-3 rounded-card border border-line bg-surface p-3 transition-colors duration-token-fast hover:border-line-strong">
          {s.logoUrl ? <img src={s.logoUrl} alt="" className="size-10 shrink-0 rounded-sm object-contain" /> : <ShoppingBag className="size-6 shrink-0 text-ink-3" aria-hidden />}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2"><Badge variant="sponsored" size="sm">{t('common.sponsored')}</Badge><span className="truncate text-caption text-ink-3">{s.sponsorName}</span></span>
            <span className="block truncate text-small font-medium text-ink">{zh ? s.titleZh ?? s.title : s.title}</span>
            {(zh ? s.bodyZh ?? s.body : s.body) && <span className="block truncate text-caption text-ink-2">{zh ? s.bodyZh ?? s.body : s.body}</span>}
          </span>
        </a>
      ))}
    </section>
  );
}

function Skeletons({ variant, n, cols }: { variant: 'listing-card' | 'item-card' | 'buddy-card' | 'row'; n: number; cols: 2 | 3 | 4 | 6 }) {
  return (
    <CardGrid cols={cols}>
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} variant={variant} />
      ))}
    </CardGrid>
  );
}

export default function Home() {
  const t = useT();
  const { locale, formatNumber } = useLocale();
  const navigate = useNavigate();
  const { campus, campusId, scope, setScope } = useCampus();
  const { open: openPost } = usePostSheet();
  const nationwide = scope === 'nationwide';
  const scopeQuery = nationwide ? { scope: 'nationwide' as const } : { campusId: campusId ?? undefined };

  const stats = useQuery({
    queryKey: ['campuses', 'detail', campusId],
    queryFn: () => api<Campus & { stats: CampusStats }>(`/api/campuses/${campusId}`),
    enabled: !!campusId,
  });
  const listings = useQuery({
    queryKey: ['listings', 'home', scopeQuery],
    queryFn: () => api<Paginated<ListingCard>>('/api/listings', { query: { ...scopeQuery, sort: 'hot', pageSize: 8 } }),
    enabled: !!campusId || nationwide,
  });
  const wanted = useQuery({
    queryKey: ['wanted', 'home', scopeQuery],
    queryFn: () => api<Paginated<WantedCard>>('/api/wanted', { query: { ...scopeQuery, pageSize: 4 } }),
    enabled: !!campusId || nationwide,
  });
  const items = useQuery({
    queryKey: ['market', 'home', campusId],
    queryFn: () => api<Paginated<ItemCard>>('/api/market/items', { query: { campusId: campusId ?? undefined, pageSize: 8 } }),
    enabled: !!campusId,
  });
  const buddy = useQuery({
    queryKey: ['buddy', 'home', campusId],
    queryFn: () => api<Paginated<BuddyCard>>('/api/buddy/posts', { query: { campusId: campusId ?? undefined, upcoming: 1, pageSize: 6 } }),
    enabled: !!campusId,
  });
  const sponsors = useQuery({
    queryKey: ['billing', 'sponsorships', 'home_feed', campusId],
    queryFn: () => api<{ items: HomeSponsor[] }>('/api/billing/sponsorships', { query: { surface: 'home_feed', campusId: campusId ?? undefined } }),
    enabled: !!campusId && !nationwide,
    staleTime: 5 * 60_000,
  });
  const partners = useQuery({
    queryKey: ['billing', 'partners', 'home', campusId],
    queryFn: () => api<{ categories: { key: string; label: string; partners: Partner[] }[] }>('/api/billing/partners', { query: { placement: 'home', campusId: campusId ?? undefined } }),
  });

  if (!campusId && !nationwide) return <Navigate to="/welcome" replace />;

  const campusName = nationwide ? t('campus.nationwide') : campus?.shortName ?? '';
  const s = stats.data?.stats;
  const subtitle = s
    ? [t('home.statListings', { n: formatNumber(s.activeListings) }), t('home.statWanted', { n: formatNumber(s.activeWanted) }), t('home.statItems', { n: formatNumber(s.activeItems) })].join(' · ')
    : undefined;

  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('home.title', { campus: campusName })} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h1-sm md:text-h1 text-ink">{t('home.title', { campus: campusName })}</h1>
          {stats.isPending && campusId ? <Skeleton variant="text" width={260} /> : subtitle && <p className="mt-1 text-small text-ink-2">{subtitle}</p>}
        </div>
        {!nationwide ? (
          <Button variant="ghost" size="sm" iconLeft={<Globe />} onClick={() => { setScope('nationwide'); navigate('/listings'); }}>
            {t('home.nationwide')}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => navigate('/welcome')}>
            {t('campus.choose')}
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <GlobalSearch className="flex-1" size="lg" />
        <div className="flex gap-2">
          <Link to="/listings?availableFrom=summer" className="flex h-9 items-center rounded-pill border border-line-strong bg-surface px-3 text-small text-ink hover:bg-sunken">
            {t('home.chipSummer')}
          </Link>
          <Link to="/listings?priceMax=150000" className="flex h-9 items-center rounded-pill border border-line-strong bg-surface px-3 text-small text-ink hover:bg-sunken tnum">
            {t('home.chipBudget')}
          </Link>
        </div>
      </div>

      {sponsors.data && sponsors.data.items.length > 0 && <SponsorStrip items={sponsors.data.items} />}

      <Section id="hot" title={t('home.hotListings')} linkTo="/listings" linkLabel={t('home.allListings')}>
        <QueryState
          query={listings}
          skeleton={<Skeletons variant="listing-card" n={4} cols={4} />}
          isEmpty={(d) => !d.items?.length}
          empty={
            <EmptyState
              icon={<NoListings />}
              title={t('empty.listings')}
              description={t('empty.listingsHint')}
              action={<Button variant="primary" onClick={() => (nationwide ? navigate('/welcome') : setScope('nationwide'))}>{nationwide ? t('campus.choose') : t('home.nationwide')}</Button>}
              secondaryAction={<Button variant="secondary" onClick={openPost}>{t('common.publish')}</Button>}
            />
          }
        >
          {(d) => (
            <CardGrid cols={4}>
              {d.items.map((l) => (
                <ListingCardView key={l.id} listing={l} showCity={nationwide} />
              ))}
              {d.items.length < 4 && (
                <Card padding="md" className="flex flex-col items-center justify-center gap-2 text-center">
                  <p className="text-body font-semibold text-ink">{t('home.beFirst')}</p>
                  <p className="text-small text-ink-2">{t('home.beFirstHint')}</p>
                  <Button variant="secondary" size="sm" onClick={openPost}>
                    {t('common.publish')}
                  </Button>
                </Card>
              )}
            </CardGrid>
          )}
        </QueryState>
      </Section>

      <Section id="wanted" title={t('home.wanted')} linkTo="/wanted" linkLabel={t('home.allWanted')}>
        <QueryState
          query={wanted}
          skeleton={<Skeletons variant="row" n={2} cols={2} />}
          isEmpty={(d) => !d.items?.length}
          empty={<EmptyState size="sm" icon={<NoListings />} title={t('empty.wanted')} description={t('empty.wantedHint')} action={<Button variant="primary" onClick={() => navigate('/post/wanted')}>{t('post.wanted.title')}</Button>} />}
        >
          {(d) => (
            <CardGrid cols={2}>
              {d.items.map((w) => (
                <WantedCardView key={w.id} wanted={w} nationwide={nationwide} />
              ))}
            </CardGrid>
          )}
        </QueryState>
      </Section>

      {campusId && (
        <Section id="items" title={t('home.items')} linkTo="/market" linkLabel={t('home.allItems')}>
          <QueryState
            query={items}
            skeleton={<Skeletons variant="item-card" n={6} cols={6} />}
            isEmpty={(d) => !d.items?.length}
            empty={<EmptyState size="sm" icon={<NoItems />} title={t('empty.items')} description={t('empty.itemsHint')} action={<Button variant="primary" onClick={() => navigate('/post/item')}>{t('post.item.title')}</Button>} />}
          >
            {(d) => (
              <CardGrid cols={6}>
                {d.items.slice(0, 6).map((it) => (
                  <ItemCardView key={it.id} item={it} />
                ))}
              </CardGrid>
            )}
          </QueryState>
        </Section>
      )}

      {campusId && (
        <Section id="buddy" title={t('home.buddy')} linkTo="/buddy" linkLabel={t('home.allBuddy')}>
          <QueryState
            query={buddy}
            skeleton={<Skeletons variant="buddy-card" n={3} cols={3} />}
            isEmpty={(d) => !d.items?.length}
            empty={<EmptyState size="sm" icon={<NoBuddy />} title={t('empty.buddy')} description={t('empty.buddyHint')} action={<Button variant="primary" onClick={() => navigate('/post/buddy')}>{t('post.buddy.title')}</Button>} />}
          >
            {(d) => (
              <CardGrid cols={3}>
                {d.items.map((p) => (
                  <BuddyCardView key={p.id} post={p} />
                ))}
              </CardGrid>
            )}
          </QueryState>
        </Section>
      )}

      {partners.data && partners.data.categories.some((c) => c.partners.length) && (
        <Section id="kit" title={t('home.kit')} linkTo="/kit" linkLabel={t('common.viewAll')}>
          <Card variant="sunken" padding="md" className="flex flex-wrap items-center gap-2">
            {partners.data.categories.flatMap((c) =>
              c.partners.slice(0, 1).map((p) => {
                const Icon = PARTNER_ICONS[p.category] ?? PARTNER_ICONS.other;
                return (
                  <a
                    key={p.id}
                    href={homeGoUrl(p.goUrl, campusId)}
                    rel={p.isSponsored ? 'sponsored noopener' : 'noopener'}
                    target="_blank"
                    className="flex h-10 items-center gap-2 rounded-ctl px-3 text-body text-ink-2 transition-colors duration-token-fast hover:bg-surface hover:text-ink"
                  >
                    <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                    <span>{locale === 'zh-CN' ? (p.nameZh ?? p.name) : p.name}</span>
                    {p.isSponsored && <Badge variant="sponsored" size="sm">{t('common.sponsored')}</Badge>}
                  </a>
                );
              }),
            )}
          </Card>
        </Section>
      )}
    </div>
  );
}
