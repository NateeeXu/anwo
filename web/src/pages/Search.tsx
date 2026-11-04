// Global search results grouped by type with a 校区 / 全美 scope toggle.
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import type { SearchResult } from '@shared/types';
import { EmptyState, PageHeader, SegmentedControl, Skeleton } from '../components';
import { NoMapResults } from '../components/illustrations';
import { api } from '../lib/api';
import { useCampus } from '../lib/campus';
import { useT } from '../lib/i18n';
import { Head } from '../app/Head';
import { GlobalSearch } from '../app/shell/GlobalSearch';
import { CardGrid, QueryState, Section } from './home/Section';
import { SimpleCampusRow, SimpleUserRow } from './home/SimpleCards';
import { ListingCard as ListingCardView } from '../features/listings/components/ListingCard';
import { WantedCard as WantedCardView } from '../features/wanted/components/WantedCard';
import { ItemCard as ItemCardView } from '../features/market/components/ItemCard';
import { BuddyCard as BuddyCardView } from '../features/buddy/BuddyCard';

export default function Search() {
  const t = useT();
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const { campusId, campus, scope, setScope } = useCampus();
  const nationwide = scope === 'nationwide';

  const result = useQuery({
    queryKey: ['search', 'results', q, nationwide ? 'nationwide' : campusId],
    queryFn: () => api<SearchResult>('/api/search', { query: { q, scope, campusId: nationwide ? undefined : campusId ?? undefined, limit: 8 } }),
    enabled: q.length > 0,
  });

  const counts = result.data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={q ? t('search.titleWithQuery', { q }) : t('search.title')} />
      <PageHeader
        title={q ? t('search.titleWithQuery', { q }) : t('search.title')}
        subtitle={result.data ? t('search.resultCount', { n: total }) : undefined}
        actions={
          <SegmentedControl
            size="sm"
            value={nationwide ? 'nationwide' : 'campus'}
            onChange={(v: string) => setScope(v === 'nationwide' ? 'nationwide' : 'campus')}
            options={[
              { value: 'campus', label: campus?.shortName ?? t('campus.campus') },
              { value: 'nationwide', label: t('campus.nationwide') },
            ]}
          />
        }
      />
      <div className="mb-4 md:hidden">
        <GlobalSearch autoFocus={!q} />
      </div>
      {!q ? (
        <EmptyState className="mt-4" icon={<NoMapResults />} title={t('search.emptyQuery')} description={t('search.emptyQueryHint')} />
      ) : (
        <QueryState
          query={result}
          skeleton={
            <CardGrid cols={4}>
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} variant="listing-card" />
              ))}
            </CardGrid>
          }
          isEmpty={(d) => Object.values(d.counts).every((n) => !n)}
          empty={
            <EmptyState
              icon={<NoMapResults />}
              title={t('search.noResults', { q })}
              description={nationwide ? t('search.noResultsHintNationwide') : t('search.noResultsHint')}
              action={nationwide ? undefined : { label: t('campus.switchNationwide'), onClick: () => setScope('nationwide') }}
            />
          }
        >
          {(d) => (
            <>
              {d.listings.length > 0 && (
                <Section id="s-listings" title={`${t('tabs.listings')} · ${counts.listing ?? d.listings.length}`} linkTo={`/listings?q=${encodeURIComponent(q)}`} linkLabel={t('common.viewAll')}>
                  <CardGrid cols={4}>{d.listings.map((l) => <ListingCardView key={l.id} listing={l} showCity={nationwide} />)}</CardGrid>
                </Section>
              )}
              {d.wanted.length > 0 && (
                <Section id="s-wanted" title={`${t('tabs.wanted')} · ${counts.wanted ?? d.wanted.length}`} linkTo={`/wanted?q=${encodeURIComponent(q)}`} linkLabel={t('common.viewAll')}>
                  <CardGrid cols={2}>{d.wanted.map((w) => <WantedCardView key={w.id} wanted={w} nationwide={nationwide} />)}</CardGrid>
                </Section>
              )}
              {d.items.length > 0 && (
                <Section id="s-items" title={`${t('tabs.market')} · ${counts.item ?? d.items.length}`} linkTo={`/market?q=${encodeURIComponent(q)}`} linkLabel={t('common.viewAll')}>
                  <CardGrid cols={6}>{d.items.map((it) => <ItemCardView key={it.id} item={it} showCampus={nationwide} />)}</CardGrid>
                </Section>
              )}
              {d.buddy.length > 0 && (
                <Section id="s-buddy" title={`${t('tabs.buddy')} · ${counts.buddy ?? d.buddy.length}`} linkTo={`/buddy?q=${encodeURIComponent(q)}`} linkLabel={t('common.viewAll')}>
                  <CardGrid cols={3}>{d.buddy.map((p) => <BuddyCardView key={p.id} post={p} />)}</CardGrid>
                </Section>
              )}
              {d.campuses.length > 0 && (
                <Section id="s-campuses" title={`${t('search.type.campus')} · ${counts.campus ?? d.campuses.length}`}>
                  <CardGrid cols={3}>{d.campuses.map((c) => <SimpleCampusRow key={c.id} campus={c} />)}</CardGrid>
                </Section>
              )}
              {d.users.length > 0 && (
                <Section id="s-users" title={`${t('search.type.user')} · ${counts.user ?? d.users.length}`}>
                  <CardGrid cols={3}>{d.users.map((u) => <SimpleUserRow key={u.id} user={u} />)}</CardGrid>
                </Section>
              )}
            </>
          )}
        </QueryState>
      )}
    </div>
  );
}
