// /map — explore page (DESIGN §7.9). Full-bleed MapView with layer chips (房源 · 二手 · 搭子 · 校车 · 校园设施),
// legend, 「在此区域搜索」 after a pan, draw-radius search, result drawer (left rail ≥ lg, bottom drawer below),
// campus-centre / locate / share controls, nationwide campus-bubble mode, and URL state (?c=&z=&layers=&scope=&r=&sel=).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type L from 'leaflet';
import { Marker } from 'react-leaflet';
import { useSearchParams } from 'react-router';
import { ChevronDown, ChevronLeft, ChevronUp, CircleDashed, Crosshair, Globe, Info, List, LocateFixed, MapPinPlus, RefreshCw, Share2, X, ZoomIn } from 'lucide-react';
import type { Poi } from '@shared/types';
import type { CampusStat, GeocodeHit, MapLayer } from '@shared/schemas/map';
import { MAX_BBOX_DEG, RADIUS_PRESETS_M } from '@shared/schemas/map';
import { Head } from '@/app/Head';
import { usePostSheet } from '@/app/shell/shellStore';
import { Button, EmptyState, SegmentedControl, Skeleton, Tooltip } from '@/components';
import { DrawSearchControl, MapView, clusterCellForZoom, meIcon, type MapCircle, type MapMarker, type MapPolyline } from '@/components/map';
import { ApiError } from '@/lib/api';
import { useCampus } from '@/lib/campus';
import { cn } from '@/lib/cn';
import { bboxAround, bboxTooLarge, bboxToParam, haversineM, US_CENTER, US_ZOOM, type Bbox, type LatLng } from '@/lib/geo';
import { useMediaQuery } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { session } from '@/lib/storage';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { useCampusStats, useLayers } from '../api';
import { CampusBubbleLayer } from '../components/CampusBubbleLayer';
import { LayerChips } from '../components/LayerChips';
import { MapLegend } from '../components/MapLegend';
import { MapSearchBox, type SearchPick } from '../components/MapSearchBox';
import { ResultsList, type ResultsData } from '../components/ResultsList';
import { SelectionPanel, selectionPoint, type Selection } from '../components/SelectionPanel';
import { SuggestPlaceModal } from '../components/SuggestPlaceModal';
import { useGeolocate } from '../hooks/useGeolocate';
import { useMapUrlState } from '../hooks/useMapUrlState';
import { shortDateLabel } from '../labels';

const VISITED_KEY = 'anwo.map.visited';
const CAMPUS_ZOOM = 14;
const NATIONWIDE_HINT_ZOOM = 8;
const CLUSTER_KINDS: ('listing' | 'item' | 'buddy')[] = ['listing', 'item', 'buddy'];

function reducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

type SuggestState = { open: boolean; tab: 'new' | 'mine'; point: LatLng | null; address: string | null };

export default function MapExplorePage() {
  const t = useT();
  const { formatMoney, formatDistance, isZh } = useLocale();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const { campus, campuses, setCampus } = useCampus();
  const postSheet = usePostSheet();
  const [searchParams] = useSearchParams();
  const { initial, write } = useMapUrlState();

  // ------------------------------------------------------------ view state
  const [layers, setLayers] = useState<MapLayer[]>(initial.layers);
  const [nationwide, setNationwide] = useState<boolean>(initial.nationwide || !campus);
  const [selectedKey, setSelectedKey] = useState<string | null>(initial.selected);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<boolean>(!!initial.radius);
  const [radius, setRadius] = useState<{ center: LatLng; radiusM: number } | null>(initial.radius);
  const [queryBbox, setQueryBbox] = useState<Bbox | null>(null);
  const [source, setSource] = useState<'initial' | 'pan' | 'search' | 'draw' | 'layer'>('initial');
  const [live, setLive] = useState<{ bbox: Bbox; zoom: number } | null>(null);
  const [moved, setMoved] = useState(false);
  const [searchHit, setSearchHit] = useState<GeocodeHit | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number; accuracyM: number } | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [suggest, setSuggest] = useState<SuggestState>({ open: searchParams.get('suggestions') === 'mine', tab: 'mine', point: null, address: null });
  const [visited, setVisited] = useState<Set<string>>(() => new Set(session.get<string[]>(VISITED_KEY, [])));

  const mapRef = useRef<L.Map | null>(null);
  const autoSearch = useRef(true);
  const boundsTimer = useRef<number | null>(null);
  const geo = useGeolocate();

  // initial framing (read once): URL → campus → US
  const [start] = useState(() => {
    if (initial.center) return { center: [initial.center.lat, initial.center.lng] as [number, number], zoom: initial.zoom ?? CAMPUS_ZOOM };
    if (!nationwide && campus) return { center: [campus.lat, campus.lng] as [number, number], zoom: initial.zoom ?? CAMPUS_ZOOM };
    return { center: US_CENTER, zoom: US_ZOOM };
  });

  const flyTo = useCallback((lat: number, lng: number, zoom?: number, opts: { search?: boolean } = {}) => {
    const map = mapRef.current;
    if (!map) return;
    if (opts.search) autoSearch.current = true;
    const z = zoom ?? map.getZoom();
    if (reducedMotion()) map.setView([lat, lng], z);
    else map.flyTo([lat, lng], z, { duration: 0.7 });
  }, []);

  // ------------------------------------------------------------ bounds → URL + "search this area"
  const onBoundsChange = useCallback((bbox: Bbox, zoom: number) => {
    if (boundsTimer.current) window.clearTimeout(boundsTimer.current);
    boundsTimer.current = window.setTimeout(() => {
      setLive({ bbox, zoom });
      write({ center: { lat: (bbox.minLat + bbox.maxLat) / 2, lng: (bbox.minLng + bbox.maxLng) / 2 }, zoom });
      if (autoSearch.current) {
        autoSearch.current = false;
        if (!bboxTooLarge(bbox, MAX_BBOX_DEG)) {
          setQueryBbox(bbox);
          setMoved(false);
        } else setMoved(true);
      } else setMoved(true);
    }, 220);
  }, [write]);
  useEffect(() => () => { if (boundsTimer.current) window.clearTimeout(boundsTimer.current); }, []);

  const searchThisArea = () => {
    if (!live || bboxTooLarge(live.bbox, MAX_BBOX_DEG)) return;
    setSource('search');
    setQueryBbox(live.bbox);
    setMoved(false);
  };

  // campus switched from the header → follow it
  const lastCampus = useRef(campus?.id ?? null);
  useEffect(() => {
    const id = campus?.id ?? null;
    if (id === lastCampus.current) return;
    lastCampus.current = id;
    if (!campus) return;
    setSelectedKey(null);
    setRadius(null);
    setDrawMode(false);
    setNationwide(false);
    setSource('initial');
    write({ nationwide: false, radius: null, selected: null }, { immediate: true });
    flyTo(campus.lat, campus.lng, CAMPUS_ZOOM, { search: true });
  }, [campus, flyTo, write]);

  // ------------------------------------------------------------ data
  const queryBboxParam = useMemo(() => {
    if (radius) {
      const b = bboxAround(radius.center, radius.radiusM * 1.05);
      return bboxTooLarge(b, MAX_BBOX_DEG) ? null : bboxToParam(b);
    }
    return queryBbox ? bboxToParam(queryBbox) : null;
  }, [queryBbox, radius]);

  const layersQ = useLayers(!nationwide && queryBboxParam ? { campusId: campus?.id ?? null, bbox: queryBboxParam, source } : null);
  const statsQ = useCampusStats(nationwide);
  const data = layersQ.data;

  const results = useMemo<ResultsData>(() => {
    const within = <T extends { lat: number; lng: number }>(arr: T[]) => (radius ? arr.filter((p) => haversineM(radius.center, p) <= radius.radiusM) : arr);
    return {
      listings: within(data?.listings ?? []),
      listingCards: new Map((data?.listingCards ?? []).map((c) => [c.id, c])),
      items: within(data?.items ?? []),
      buddy: within(data?.buddy ?? []),
      stops: within(data?.shuttleStops ?? []),
      pois: within(data?.pois ?? []),
    };
  }, [data, radius]);

  const visibleCount = (layers.includes('listings') ? results.listings.length : 0) + (layers.includes('items') ? results.items.length : 0)
    + (layers.includes('buddy') ? results.buddy.length : 0) + (layers.includes('shuttle') ? results.stops.length : 0) + (layers.includes('pois') ? results.pois.length : 0);
  const counts = useMemo(() => (radius
    ? { listings: results.listings.length, items: results.items.length, buddy: results.buddy.length, shuttle: results.stops.length, pois: results.pois.length }
    : data?.counts ?? null), [radius, results, data]);

  // ------------------------------------------------------------ selection
  const selection = useMemo<Selection | null>(() => {
    if (!selectedKey) return null;
    const i = selectedKey.indexOf(':');
    const type = i > 0 ? selectedKey.slice(0, i) : selectedKey;
    const id = i > 0 ? selectedKey.slice(i + 1) : '';
    if (type === 'search') return searchHit ? { type: 'search', hit: searchHit } : null;
    if (type === 'me') return me ? { type: 'me', ...me } : null;
    if (type === 'listing') { const p = results.listings.find((x) => x.id === id); return p ? { type: 'listing', pin: p } : null; }
    if (type === 'item') { const p = results.items.find((x) => x.id === id); return p ? { type: 'item', pin: p } : null; }
    if (type === 'buddy') { const p = results.buddy.find((x) => x.id === id); return p ? { type: 'buddy', pin: p } : null; }
    if (type === 'stop') { const s = results.stops.find((x) => x.id === id); return s ? { type: 'stop', stop: s } : null; }
    if (type === 'poi') { const p = results.pois.find((x) => x.id === id); return p ? { type: 'poi', poi: p } : null; }
    return null;
  }, [selectedKey, results, searchHit, me]);

  const select = useCallback((key: string | null) => {
    setSelectedKey(key);
    write({ selected: key });
    if (!key) return;
    const type = key.split(':')[0]!;
    const entityType = type === 'listing' ? 'listing' : type === 'item' ? 'market_item' : type === 'buddy' ? 'buddy_post' : undefined;
    track('map.pin_click', { type, entityType, entityId: entityType ? key.slice(type.length + 1) : undefined });
    if (!isDesktop) setDrawerOpen(false);
  }, [isDesktop, write]);

  useEffect(() => {
    if (!selection || !mapRef.current) return;
    const p = selectionPoint(selection);
    const map = mapRef.current;
    if (!map.getBounds().pad(-0.15).contains([p.lat, p.lng])) flyTo(p.lat, p.lng, Math.max(map.getZoom(), 15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const markVisited = (s: Selection) => {
    if (s.type !== 'listing') return;
    const next = new Set(visited);
    next.add(s.pin.id);
    setVisited(next);
    session.set(VISITED_KEY, [...next].slice(-200));
  };

  // ------------------------------------------------------------ layers / scope
  const toggleLayer = (layer: MapLayer) => {
    const next = layers.includes(layer) ? layers.filter((l) => l !== layer) : [...layers, layer];
    setLayers(next);
    write({ layers: next }, { immediate: true });
    track('map.layer_toggle', { layer, on: next.includes(layer) });
  };

  const goNationwide = () => {
    setNationwide(true);
    setSelectedKey(null);
    setRadius(null);
    setDrawMode(false);
    write({ nationwide: true, radius: null, selected: null }, { immediate: true });
    const map = mapRef.current;
    if (map) {
      if (reducedMotion()) map.setView(US_CENTER, US_ZOOM);
      else map.flyTo(US_CENTER, US_ZOOM, { duration: 0.8 });
    }
    track('map.nationwide', {});
  };

  const enterCampus = (id: string) => {
    const c = campuses.find((x) => x.id === id);
    if (!c) return;
    setNationwide(false);
    write({ nationwide: false }, { immediate: true });
    setSource('initial');
    if (campus?.id !== id) {
      lastCampus.current = id;
      setCampus(id);
      toast.info(t('map.nationwide.switched', { campus: isZh ? c.nameZh ?? c.shortName : c.shortName }));
    }
    flyTo(c.lat, c.lng, CAMPUS_ZOOM, { search: true });
  };

  const goCampusCenter = () => {
    if (!campus) return;
    if (nationwide) return enterCampus(campus.id);
    flyTo(campus.lat, campus.lng, CAMPUS_ZOOM, { search: true });
  };

  // ------------------------------------------------------------ draw radius
  const startDraw = () => {
    if (drawMode) return clearDraw();
    setDrawMode(true);
    const map = mapRef.current;
    if (map && !radius) {
      // start with a circle at the map centre; drag it or click elsewhere to move
      const c = map.getCenter();
      const r = { center: { lat: c.lat, lng: c.lng }, radiusM: 1000 };
      setRadius(r);
      setSource('draw');
      write({ radius: r }, { immediate: true });
    }
    track('map.draw', {});
  };
  const clearDraw = () => {
    setDrawMode(false);
    setRadius(null);
    write({ radius: null }, { immediate: true });
    if (live && !bboxTooLarge(live.bbox, MAX_BBOX_DEG)) setQueryBbox(live.bbox);
  };
  const radiusTimer = useRef<number | null>(null);
  const changeRadius = (v: { center: LatLng; radiusM: number }) => {
    setRadius(v);
    setSource('draw');
    if (radiusTimer.current) window.clearTimeout(radiusTimer.current);
    radiusTimer.current = window.setTimeout(() => write({ radius: v }), 300);
  };
  const searchAround = (point: LatLng, radiusM = 800) => {
    const r = { center: point, radiusM };
    setDrawMode(true);
    setRadius(r);
    setSource('draw');
    write({ radius: r }, { immediate: true });
    const b = bboxAround(point, radiusM * 1.3);
    mapRef.current?.fitBounds([[b.minLat, b.minLng], [b.maxLat, b.maxLng]], { animate: !reducedMotion() });
  };

  // ------------------------------------------------------------ search / locate / share
  const onPick = (pick: SearchPick) => {
    if (pick.kind === 'campus') return enterCampus(pick.campus.id);
    if (pick.kind === 'poi') {
      if (!layers.includes('pois')) toggleLayer('pois');
      flyTo(pick.poi.lat, pick.poi.lng, 16, { search: true });
      select(`poi:${pick.poi.id}`);
      return;
    }
    setSearchHit(pick.hit);
    if (pick.hit.campusSuggestion.suggested && pick.hit.campusSuggestion.suggested.id !== campus?.id && !pick.hit.approx) {
      const s = pick.hit.campusSuggestion.suggested;
      toast.info(t('map.search.otherCampus', { campus: isZh ? s.nameZh ?? s.shortName : s.shortName }), undefined, { label: t('map.search.switch'), onClick: () => enterCampus(s.id) });
    }
    if (nationwide) { setNationwide(false); write({ nationwide: false }, { immediate: true }); }
    flyTo(pick.hit.lat, pick.hit.lng, 16, { search: true });
    select('search');
  };

  const locate = async () => {
    const pos = await geo.locate();
    if (!pos) return;
    setMe(pos);
    if (nationwide) { setNationwide(false); write({ nationwide: false }, { immediate: true }); }
    flyTo(pos.lat, pos.lng, 15, { search: true });
    select('me');
    toast.success(t('map.geolocate.found'));
  };
  useEffect(() => {
    if (geo.status === 'error' && geo.errorKey) toast.error(t(geo.errorKey));
  }, [geo.status, geo.errorKey, t]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t('map.shareCopied'));
    } catch {
      toast.info(window.location.href);
    }
    track('map.share', {});
  };

  const openSuggest = (point?: LatLng | null, address?: string | null) => {
    const c = mapRef.current?.getCenter();
    setSuggest({ open: true, tab: 'new', point: point ?? (selection ? selectionPoint(selection) : c ? { lat: c.lat, lng: c.lng } : null), address: address ?? (selection?.type === 'search' ? selection.hit.displayName : null) });
  };

  // ------------------------------------------------------------ markers / shapes
  const tz = campus?.timezone;
  const markers = useMemo<MapMarker[]>(() => {
    if (nationwide) return [];
    const out: MapMarker[] = [];
    if (campus) out.push({ id: 'campus', kind: 'campus', lat: campus.lat, lng: campus.lng, label: campus.shortName });
    if (layers.includes('listings')) for (const p of results.listings) out.push({ id: `listing:${p.id}`, kind: 'listing', lat: p.lat, lng: p.lng, label: formatMoney(p.priceCents ?? 0), title: p.title, boosted: p.boostTier === 'plus' || p.boostTier === 'max', saved: p.saved, muted: visited.has(p.id), selected: selectedKey === `listing:${p.id}` });
    if (layers.includes('items')) for (const p of results.items) out.push({ id: `item:${p.id}`, kind: 'item', lat: p.lat, lng: p.lng, label: p.isFree ? t('map.pin.free') : formatMoney(p.priceCents ?? 0), title: p.title, boosted: !!p.boostTier, selected: selectedKey === `item:${p.id}` });
    if (layers.includes('buddy')) for (const p of results.buddy) out.push({ id: `buddy:${p.id}`, kind: 'buddy', lat: p.lat, lng: p.lng, label: shortDateLabel(p.startsAt, tz) ?? t('map.pin.buddy'), title: p.title, boosted: !!p.boostTier, selected: selectedKey === `buddy:${p.id}` });
    if (layers.includes('shuttle')) for (const s of results.stops) out.push({ id: `stop:${s.id}`, kind: 'stop', lat: s.lat, lng: s.lng, label: isZh ? s.nameZh ?? s.name : s.name, title: isZh ? s.nameZh ?? s.name : s.name, selected: selectedKey === `stop:${s.id}` });
    if (layers.includes('pois')) for (const p of results.pois) out.push({ id: `poi:${p.id}`, kind: 'poi', lat: p.lat, lng: p.lng, label: isZh ? p.nameZh ?? p.name : p.name, title: isZh ? p.nameZh ?? p.name : p.name, selected: selectedKey === `poi:${p.id}` });
    if (searchHit) out.push({ id: 'search', kind: 'poi', lat: searchHit.lat, lng: searchHit.lng, label: searchHit.addressLine1 ?? t('map.search.pinLabel'), title: searchHit.displayName, selected: selectedKey === 'search' });
    return out;
  }, [nationwide, campus, layers, results, visited, selectedKey, searchHit, formatMoney, t, tz, isZh]);

  const polylines = useMemo<MapPolyline[]>(() => {
    if (nationwide || !layers.includes('shuttle')) return [];
    const selStop = selection?.type === 'stop' ? new Set(selection.stop.routes.map((r) => r.id)) : null;
    return (data?.shuttleRoutes ?? []).map((r) => ({ id: r.id, points: r.polyline, color: selStop && !selStop.has(r.id) ? undefined : r.color, muted: !!selStop && !selStop.has(r.id), weight: selStop?.has(r.id) ? 5 : 3 }));
  }, [nationwide, layers, data, selection]);

  const circles = useMemo<MapCircle[]>(() => (me && !nationwide ? [{ id: 'me-accuracy', lat: me.lat, lng: me.lng, radiusM: Math.min(me.accuracyM, 2000), kind: 'radius' }] : []), [me, nationwide]);

  // ------------------------------------------------------------ derived UI flags
  const tooWide = !nationwide && !radius && !!live && bboxTooLarge(live.bbox, MAX_BBOX_DEG);
  const showSearchArea = !nationwide && !radius && moved && !tooWide && !!live && (!queryBbox || bboxToParam(live.bbox) !== bboxToParam(queryBbox));
  const farOut = !nationwide && !!live && live.zoom <= NATIONWIDE_HINT_ZOOM;
  const bboxError = layersQ.error instanceof ApiError && layersQ.error.code === 'BAD_REQUEST';
  const listStatus: 'loading' | 'error' | 'ready' = layersQ.isLoading || (!data && !layersQ.isError) ? 'loading' : layersQ.isError && !data ? 'error' : 'ready';
  const campusName = campus ? (isZh ? campus.nameZh ?? campus.shortName : campus.shortName) : '';

  // ------------------------------------------------------------ pieces
  const scopeToggle = (
    <SegmentedControl
      size="sm"
      label={t('map.scope.label')}
      value={nationwide ? 'nationwide' : 'campus'}
      onChange={(v) => (v === 'nationwide' ? goNationwide() : campus ? enterCampus(campus.id) : goNationwide())}
      options={[
        { value: 'campus', label: campus?.shortName ?? t('map.scope.campus') },
        { value: 'nationwide', label: t('map.scope.nationwide'), icon: <Globe className="size-3.5" aria-hidden /> },
      ]}
    />
  );

  const searchBox = (
    <MapSearchBox
      campuses={campuses}
      pois={data?.pois ?? []}
      campusId={campus?.id ?? null}
      near={campus ? { lat: campus.lat, lng: campus.lng } : null}
      onPick={onPick}
      onClear={() => { setSearchHit(null); if (selectedKey === 'search') select(null); }}
    />
  );

  const drawBar = drawMode && radius && (
    <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-3 py-2 shadow-lg animate-fade-in" role="group" aria-label={t('map.draw.start')} data-testid="draw-bar">
      <CircleDashed className="size-4 text-accent-text" aria-hidden />
      <span className="text-small font-semibold text-ink tnum">{t('map.draw.within', { count: visibleCount })}</span>
      <SegmentedControl
        size="sm"
        label={t('map.draw.radius')}
        value={String(RADIUS_PRESETS_M.find((r) => Math.abs(r - radius.radiusM) < 5) ?? 'custom')}
        onChange={(v) => v !== 'custom' && changeRadius({ center: radius.center, radiusM: Number(v) })}
        options={[...RADIUS_PRESETS_M.map((r) => ({ value: String(r), label: formatDistance(r) })), ...(RADIUS_PRESETS_M.some((r) => Math.abs(r - radius.radiusM) < 5) ? [] : [{ value: 'custom', label: formatDistance(radius.radiusM) }])]}
      />
      <span className="hidden text-caption text-ink-3 xl:inline">{t('map.draw.hint')}</span>
      <Button size="sm" variant="ghost" iconLeft={<X className="size-4" aria-hidden />} onClick={clearDraw}>{t('map.draw.clear')}</Button>
    </div>
  );

  const controlBtn = (label: string, icon: React.ReactNode, onClick: () => void, opts: { pressed?: boolean; loading?: boolean; testId?: string } = {}) => (
    <Tooltip content={label} side="left">
      <button
        type="button"
        aria-label={label}
        aria-pressed={opts.pressed}
        onClick={onClick}
        data-testid={opts.testId}
        className={cn(
          'flex size-11 items-center justify-center rounded-ctl border shadow-md transition-colors duration-token-fast lg:size-10',
          opts.pressed ? 'border-inverse bg-inverse text-ink-inverse' : 'border-line-strong bg-surface text-ink hover:bg-sunken',
        )}
      >
        {opts.loading ? <RefreshCw className="size-4 animate-spin" aria-hidden /> : icon}
      </button>
    </Tooltip>
  );

  const controls = (
    <div className="pointer-events-auto flex flex-col gap-2" role="toolbar" aria-orientation="vertical" aria-label={t('map.controls')}>
      {campus && controlBtn(t('map.campusCenter'), <Crosshair className="size-[18px]" aria-hidden />, goCampusCenter, { testId: 'ctl-campus' })}
      {controlBtn(t('map.locate'), <LocateFixed className="size-[18px]" aria-hidden />, () => void locate(), { loading: geo.status === 'locating', pressed: selectedKey === 'me', testId: 'ctl-locate' })}
      {!nationwide && controlBtn(t('map.draw.start'), <CircleDashed className="size-[18px]" aria-hidden />, startDraw, { pressed: drawMode, testId: 'ctl-draw' })}
      {!nationwide && controlBtn(t('map.legend.title'), <Info className="size-[18px]" aria-hidden />, () => setLegendOpen((v) => !v), { pressed: legendOpen, testId: 'ctl-legend' })}
      {controlBtn(t('map.share'), <Share2 className="size-[18px]" aria-hidden />, () => void share(), { testId: 'ctl-share' })}
      {!nationwide && controlBtn(t('map.suggest.open'), <MapPinPlus className="size-[18px]" aria-hidden />, () => openSuggest(), { testId: 'ctl-suggest' })}
    </div>
  );

  const nationwideList = (
    <div className="flex flex-col gap-3 p-4" data-testid="nationwide-list">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3 text-ink">{t('map.nationwide.title')}</h2>
        <p className="text-small text-ink-2">{t('map.nationwide.hint')}</p>
        {statsQ.data && <p className="text-caption text-ink-3 tnum">{t('map.nationwide.total', { campuses: statsQ.data.campuses.filter((c) => c.total > 0).length, total: statsQ.data.totals.listings + statsQ.data.totals.items + statsQ.data.totals.buddy })}</p>}
      </div>
      {statsQ.isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} variant="row" />)}</div>
      ) : statsQ.isError ? (
        <EmptyState size="sm" icon={RefreshCw} title={t('map.drawer.error')} action={{ label: t('map.error.retry'), onClick: () => void statsQ.refetch() }} />
      ) : (
        <ul className="flex flex-col gap-2">
          {(statsQ.data?.campuses ?? []).slice(0, 80).map((c: CampusStat) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => enterCampus(c.id)}
                className={cn('flex w-full items-center gap-3 rounded-card border bg-surface p-3 text-left transition-colors hover:border-line-strong', c.id === campus?.id ? 'border-accent' : 'border-line')}
              >
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-pill text-small font-semibold tnum', c.total ? 'bg-inverse text-ink-inverse' : 'border border-dashed border-line-strong bg-sunken text-ink-3')}>{c.total > 999 ? '999+' : c.total}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-small font-semibold text-ink">{isZh ? c.nameZh ?? c.name : c.name}</span>
                  <span className="truncate text-caption text-ink-2">{c.city}, {c.state} · {c.total ? t('map.nationwide.counts', { listings: c.counts.listings, items: c.counts.items, buddy: c.counts.buddy }) : t('map.nationwide.empty')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const resultsList = (
    <ResultsList
      data={results}
      layers={layers}
      counts={counts}
      truncated={radius ? undefined : data?.truncated}
      status={queryBboxParam ? listStatus : 'loading'}
      selectedKey={selectedKey}
      onHover={setHoverKey}
      onSelect={(k) => select(k)}
      onSearchAround={(p: Poi) => searchAround({ lat: p.lat, lng: p.lng })}
      onRetry={() => void layersQ.refetch()}
      onPost={() => postSheet.open()}
      onSuggest={() => openSuggest()}
      timeZone={tz}
    />
  );

  const drawerTitle = nationwide ? t('map.nationwide.title') : radius ? t('map.draw.chip', { radius: formatDistance(radius.radiusM) }) : t('map.drawer.title');

  // ------------------------------------------------------------ render
  return (
    <div className="relative flex h-[calc(100dvh-56px-60px-env(safe-area-inset-bottom))] w-full overflow-hidden md:h-[calc(100dvh-64px)]" data-testid="map-explore">
      <Head title={t('map.explore.title')} description={t('map.explore.description')} />

      {/* desktop rail */}
      {isDesktop && railOpen && (
        <aside className="flex w-[400px] shrink-0 flex-col border-r border-line bg-paper xl:w-[440px]" aria-label={drawerTitle} data-testid="map-rail">
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 pb-3 pt-4">
            <div className="min-w-0">
              <h1 className="text-h3 text-ink">{t('map.explore.title')}</h1>
              <p className="truncate text-small text-ink-2" aria-live="polite">
                {nationwide ? t('map.scope.nationwide') : campusName}
                {!nationwide && data && <> · <span className="tnum">{t('map.drawer.count', { count: visibleCount })}</span></>}
                {radius && <> · {t('map.draw.chip', { radius: formatDistance(radius.radiusM) })}</>}
              </p>
            </div>
            <Button size="sm" variant="ghost" iconOnly aria-label={t('map.drawer.hide')} onClick={() => setRailOpen(false)}><ChevronLeft className="size-4" aria-hidden /></Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{nationwide ? nationwideList : resultsList}</div>
        </aside>
      )}

      {/* map */}
      <div className="relative min-w-0 flex-1">
        <MapView
          center={start.center}
          zoom={start.zoom}
          height="100%"
          markers={markers}
          polylines={polylines}
          circles={circles}
          hoveredId={hoverKey}
          onMarkerHover={setHoverKey}
          onMarkerClick={(id) => { if (id !== 'campus') select(id); }}
          onBoundsChange={onBoundsChange}
          onMapReady={(m) => { mapRef.current = m; }}
          onMapClick={drawMode ? (p) => changeRadius({ center: p, radiusM: radius?.radiusM ?? 1000 }) : undefined}
          clusterThreshold={30}
          clusterKinds={CLUSTER_KINDS}
          clusterCellPx={clusterCellForZoom}
          locate={false}
          zoomControl={isDesktop}
          aria-label={t('map.ariaMap')}
          className="h-full"
        >
          {nationwide && statsQ.data && (
            <CampusBubbleLayer
              campuses={statsQ.data.campuses}
              selectedId={campus?.id ?? null}
              onSelect={(c) => enterCampus(c.id)}
              labelOf={(c) => c.shortName}
            />
          )}
          {!nationwide && drawMode && radius && (
            <DrawSearchControl active center={radius.center} radiusM={radius.radiusM} onChange={changeRadius} minRadiusM={200} maxRadiusM={8000} labels={{ center: t('map.draw.center'), handle: t('map.draw.handle') }} />
          )}
          {me && !nationwide && <Marker position={[me.lat, me.lng]} icon={meIcon()} interactive keyboard={false} eventHandlers={{ click: () => select('me') }} />}
        </MapView>

        {/* top overlay: floating search card (desktop) / search + chips (mobile) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[11] flex flex-col gap-2 p-3 lg:inset-x-auto lg:left-0 lg:w-[360px] lg:p-4">
          <div className="pointer-events-auto flex flex-col gap-2.5 rounded-card border border-line bg-surface p-2.5 shadow-lg lg:p-3" data-testid="map-search-card">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">{searchBox}</div>
              {!isDesktop && (
                <button
                  type="button"
                  onClick={() => (nationwide ? goCampusCenter() : goNationwide())}
                  aria-pressed={nationwide}
                  aria-label={t('map.scope.nationwide')}
                  className={cn('flex size-10 shrink-0 items-center justify-center rounded-ctl border', nationwide ? 'border-inverse bg-inverse text-ink-inverse' : 'border-line-strong bg-surface text-ink')}
                >
                  <Globe className="size-[18px]" aria-hidden />
                </button>
              )}
            </div>
            {isDesktop && scopeToggle}
            {!nationwide && <LayerChips layers={layers} counts={counts} onToggle={toggleLayer} scroll={!isDesktop} className={isDesktop ? '' : '-mx-0.5 px-0.5'} />}
          </div>
          {!isDesktop && drawBar && <div className="pointer-events-auto">{drawBar}</div>}
        </div>

        {/* desktop: rail toggle when collapsed */}
        {isDesktop && !railOpen && (
          <div className="absolute bottom-6 left-4 z-[11]">
            <Button variant="secondary" size="sm" className="shadow-md" iconLeft={<List className="size-4" aria-hidden />} onClick={() => setRailOpen(true)}>{t('map.drawer.show')} · <span className="tnum">{visibleCount}</span></Button>
          </div>
        )}

        {/* centre-top: search this area / zoom in / nationwide hint / draw bar (desktop) */}
        <div className={cn('pointer-events-none absolute inset-x-0 z-[11] flex flex-col items-center gap-2 px-3', isDesktop ? 'top-4 lg:pl-[376px]' : 'top-[124px]', drawBar && !isDesktop && 'top-[180px]')}>
          {isDesktop && drawBar}
          {showSearchArea && (
            <Button size="sm" className="pointer-events-auto shadow-md" iconLeft={<RefreshCw className="size-4" aria-hidden />} onClick={searchThisArea} data-testid="search-area">
              {t('map.searchArea')}
            </Button>
          )}
          {tooWide && (
            <span className="pointer-events-auto inline-flex items-center gap-2 rounded-pill bg-inverse px-3 py-1.5 text-small text-ink-inverse shadow-md">
              <ZoomIn className="size-4" aria-hidden />{t('map.error.bboxTooLarge')}
            </span>
          )}
          {farOut && (
            <Button size="sm" variant="secondary" className="pointer-events-auto shadow-md" iconLeft={<Globe className="size-4" aria-hidden />} onClick={goNationwide}>{t('map.nationwide.switch')}</Button>
          )}
          {bboxError && <span className="pointer-events-auto rounded-pill bg-inverse px-3 py-1.5 text-small text-ink-inverse">{t('map.error.bboxTooLarge')}</span>}
          {layersQ.isFetching && data && <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1 text-caption text-ink-2 shadow-md" role="status"><RefreshCw className="size-3 animate-spin" aria-hidden />{t('map.drawer.loading')}</span>}
        </div>

        {/* right controls */}
        <div className={cn('pointer-events-none absolute right-3 z-[11] lg:right-4', isDesktop ? 'top-4' : drawBar ? 'top-[236px]' : 'top-[124px]')}>{controls}</div>

        {/* legend */}
        {legendOpen && !nationwide && (
          <div className={cn('absolute z-[11] w-64', isDesktop ? (railOpen ? 'bottom-6 left-4' : 'bottom-20 left-4') : 'bottom-20 left-3')}>
            <MapLegend />
          </div>
        )}

        {/* selection panel */}
        {selection && !nationwide && (
          <div className={cn('pointer-events-none absolute z-[12]', isDesktop ? 'bottom-6 left-1/2 w-[380px] -translate-x-1/2' : 'inset-x-3 bottom-[72px]')}>
            <SelectionPanel
              selection={selection}
              campusId={campus?.id ?? null}
              timeZone={tz}
              onClose={() => select(null)}
              onSearchAround={(p) => searchAround(p)}
              onOpen={markVisited}
            />
          </div>
        )}

        {/* mobile drawer */}
        {!isDesktop && (
          <section
            className={cn('absolute inset-x-0 bottom-0 z-[13] flex flex-col rounded-t-card border-t border-line bg-surface shadow-lg transition-[height] duration-token-slow ease-out', drawerOpen ? 'h-[62%]' : 'h-14')}
            aria-label={drawerTitle}
            data-testid="map-drawer"
          >
            <button
              type="button"
              onClick={() => setDrawerOpen((v) => !v)}
              aria-expanded={drawerOpen}
              className="flex h-14 shrink-0 items-center gap-3 px-4 text-left"
            >
              <span className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-pill bg-line-strong" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-small font-semibold text-ink" aria-live="polite">
                {nationwide ? t('map.nationwide.title') : listStatus === 'loading' ? t('map.drawer.loading') : drawerOpen ? `${drawerTitle} · ${t('map.drawer.count', { count: visibleCount })}` : t('map.drawer.peek', { count: visibleCount })}
              </span>
              {drawerOpen ? <ChevronDown className="size-5 text-ink-2" aria-hidden /> : <ChevronUp className="size-5 text-ink-2" aria-hidden />}
            </button>
            {drawerOpen && <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">{nationwide ? nationwideList : resultsList}</div>}
          </section>
        )}

      </div>

      <SuggestPlaceModal
        open={suggest.open}
        initialTab={suggest.tab}
        initialPoint={suggest.point}
        initialAddress={suggest.address}
        onClose={() => setSuggest((s) => ({ ...s, open: false }))}
      />
    </div>
  );
}
