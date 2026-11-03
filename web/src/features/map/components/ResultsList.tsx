// Result drawer content: the visible pins of every active layer as mini cards, grouped by layer.
// Every pin on the map is reachable here too (DESIGN §9: map-only actions need list equivalents).
import { useEffect, useRef } from 'react';
import { CircleAlert, MapPinned, Plus } from 'lucide-react';
import type { ListingCard as ListingCardDto, Poi, ShuttleStop } from '@shared/types';
import type { LayerCounts, MapLayer, MapPin as MapPinDto, ShuttleRouteLite } from '@shared/schemas/map';
import { Button, EmptyState, Skeleton } from '@/components';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { LAYER_ICONS } from '../labels';
import { BuddyRow, ItemRow, ListingRow, PoiRow, StopRow } from './PinCard';

export type ResultsData = {
  listings: MapPinDto[];
  listingCards: Map<string, ListingCardDto>;
  items: MapPinDto[];
  buddy: MapPinDto[];
  stops: (ShuttleStop & { routes: Pick<ShuttleRouteLite, 'id' | 'name' | 'shortName' | 'color'>[] })[];
  pois: Poi[];
};

export type ResultsListProps = {
  data: ResultsData;
  layers: MapLayer[];
  counts?: LayerCounts | null;
  truncated?: Partial<Record<MapLayer, boolean>>;
  status: 'loading' | 'error' | 'ready';
  /** `type:id` of the selected pin (scrolled into view) */
  selectedKey: string | null;
  onHover: (key: string | null) => void;
  onSelect: (key: string) => void;
  onSearchAround: (poi: Poi) => void;
  onRetry: () => void;
  onPost: () => void;
  onSuggest: () => void;
  timeZone?: string;
  className?: string;
};

const GROUP_LIMIT = 60;

export function ResultsList({ data, layers, counts, truncated, status, selectedKey, onHover, onSelect, onSearchAround, onRetry, onPost, onSuggest, timeZone, className }: ResultsListProps) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedKey) return;
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-pin="${CSS.escape(selectedKey)}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [selectedKey]);

  if (status === 'loading') {
    return (
      <div className={cn('flex flex-col gap-2 p-4', className)} aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} variant="row" />)}
      </div>
    );
  }
  if (status === 'error') {
    return (
      <EmptyState className={className} size="sm" icon={CircleAlert} title={t('map.drawer.error')} description={t('error.generic')} action={{ label: t('map.error.retry'), onClick: onRetry }} />
    );
  }

  const sel = (type: string, id: string) => selectedKey === `${type}:${id}`;
  const hov = (type: string) => (id: string | null) => onHover(id ? `${type}:${id}` : null);
  const pick = (type: string) => (id: string) => onSelect(`${type}:${id}`);

  const groups: { layer: MapLayer; n: number; body: React.ReactNode }[] = [];
  if (layers.includes('listings') && data.listings.length) {
    groups.push({
      layer: 'listings', n: data.listings.length,
      body: data.listings.slice(0, GROUP_LIMIT).map((p) => (
        <ListingRow key={p.id} pin={p} card={data.listingCards.get(p.id)} active={sel('listing', p.id)} onHover={hov('listing')} onSelect={pick('listing')} />
      )),
    });
  }
  if (layers.includes('items') && data.items.length) {
    groups.push({ layer: 'items', n: data.items.length, body: data.items.slice(0, GROUP_LIMIT).map((p) => <ItemRow key={p.id} pin={p} active={sel('item', p.id)} onHover={hov('item')} onSelect={pick('item')} />) });
  }
  if (layers.includes('buddy') && data.buddy.length) {
    groups.push({ layer: 'buddy', n: data.buddy.length, body: data.buddy.slice(0, GROUP_LIMIT).map((p) => <BuddyRow key={p.id} pin={p} timeZone={timeZone} active={sel('buddy', p.id)} onHover={hov('buddy')} onSelect={pick('buddy')} />) });
  }
  if (layers.includes('shuttle') && data.stops.length) {
    groups.push({ layer: 'shuttle', n: data.stops.length, body: data.stops.slice(0, GROUP_LIMIT).map((s) => <StopRow key={s.id} stop={s} active={sel('stop', s.id)} onHover={hov('stop')} onSelect={pick('stop')} />) });
  }
  if (layers.includes('pois') && data.pois.length) {
    groups.push({ layer: 'pois', n: data.pois.length, body: data.pois.slice(0, GROUP_LIMIT).map((p) => <PoiRow key={p.id} poi={p} active={sel('poi', p.id)} onHover={hov('poi')} onSelect={pick('poi')} onSearchAround={onSearchAround} />) });
  }

  if (!groups.length) {
    return (
      <EmptyState
        className={className}
        size="sm"
        icon={MapPinned}
        title={t('map.drawer.empty')}
        description={t('map.drawer.emptyHint')}
        action={{ label: t('map.drawer.post'), onClick: onPost }}
        secondaryAction={{ label: t('map.suggest.open'), onClick: onSuggest, variant: 'ghost' }}
      />
    );
  }

  return (
    <div ref={rootRef} className={cn('flex flex-col gap-5 p-4', className)}>
      {groups.map((g) => {
        const Icon = LAYER_ICONS[g.layer];
        const total = counts?.[g.layer] ?? g.n;
        return (
          <section key={g.layer} aria-labelledby={`map-group-${g.layer}`} className="flex flex-col gap-2">
            <h3 id={`map-group-${g.layer}`} className="flex items-center gap-2 text-small font-semibold text-ink">
              <Icon className="size-4 text-ink-3" aria-hidden />
              {t(`map.drawer.group.${g.layer === 'shuttle' ? 'shuttle' : g.layer}`)}
              <span className="tnum font-normal text-ink-3">{total}</span>
            </h3>
            {(truncated?.[g.layer] || g.n > GROUP_LIMIT) && <p className="text-caption text-ink-3">{t('map.drawer.truncated', { count: Math.min(g.n, GROUP_LIMIT) })}</p>}
            <div className="flex flex-col gap-2">{g.body}</div>
          </section>
        );
      })}
      <div className="flex flex-col items-start gap-2 rounded-card border border-dashed border-line-strong p-3">
        <p className="text-small text-ink-2">{t('map.suggest.cta')}</p>
        <Button size="sm" variant="secondary" iconLeft={<Plus className="size-4" aria-hidden />} onClick={onSuggest}>{t('map.suggest.open')}</Button>
      </div>
    </div>
  );
}

export default ResultsList;
