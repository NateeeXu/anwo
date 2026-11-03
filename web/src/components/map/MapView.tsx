import 'leaflet/dist/leaflet.css';
import './map.css';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import L from 'leaflet';
import { AttributionControl, Circle, MapContainer, Marker, Polyline, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import { cn } from '@/lib/cn';
import { bboxOf, bboxToLeaflet, US_CENTER, US_ZOOM, type Bbox, type LatLngTuple } from '@/lib/geo';
import { clusterIcon, fixLeafletDefaultIcon, iconFor } from './icons';
import { clusterMarkers as clusterMarkersZoom, type ClusterBucket } from './cluster';
import { LocateControl } from './LocateControl';
import type { MapMarkerKind } from './PricePin';

fixLeafletDefaultIcon();

// ---------------------------------------------------------------- types
export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  /** Pill text, already formatted: `$1,250`, `$40`, `免费`, `11/08`. For `campus`/`poi` it is the name label. */
  label?: string;
  kind?: MapMarkerKind;
  selected?: boolean;
  /** Visited / de-emphasised. */
  muted?: boolean;
  /** Tiny arrow glyph (paid placement, no color change). `plus`/`max` tiers also float above other pins. */
  boosted?: boolean;
  saved?: boolean;
  /** Native tooltip / accessible description (e.g. the listing title). */
  title?: string;
};

export type MapPolyline = {
  id: string;
  points: LatLngTuple[];
  /** Explicit CSS color. Omit to use the ink token (accent when `selected`). */
  color?: string;
  weight?: number;
  selected?: boolean;
  muted?: boolean;
  dashed?: boolean;
};

export type MapCircleKind = 'area' | 'pickup' | 'radius';
export type MapCircle = {
  id: string;
  lat: number;
  lng: number;
  radiusM: number;
  /** `area` = accent search/wanted area (10 % fill) · `pickup` = approximate item pickup · `radius` = dashed campus radius. */
  kind?: MapCircleKind;
};

export type MapViewProps = {
  center?: LatLngTuple;
  zoom?: number;
  /** Fit these bounds (initially and whenever they change). Wins over `center`/`zoom`. */
  bounds?: Bbox | null;
  markers?: MapMarker[];
  onMarkerClick?: (id: string) => void;
  onMarkerHover?: (id: string | null) => void;
  /** Externally hovered marker (list card ↔ pin link). */
  hoveredId?: string | null;
  polylines?: MapPolyline[];
  onPolylineClick?: (id: string) => void;
  circles?: MapCircle[];
  /** Fires after every pan/zoom (and once on mount) with the API-shaped bbox. Debounce with `useMapBounds`. */
  onBoundsChange?: (bbox: Bbox, zoom: number) => void;
  /** Fit the viewport to the markers whenever the set of marker ids changes. */
  fitToMarkers?: boolean;
  /** `false` = static preview: no dragging, zooming, controls or pin interaction. */
  interactive?: boolean;
  /** Show the locate-me control (default: when interactive). */
  locate?: boolean;
  /** Show zoom buttons (default: when interactive). */
  zoomControl?: boolean;
  /** Grid clustering kicks in above this many markers (default 60). `Infinity` disables. */
  clusterThreshold?: number;
  /**
   * Cluster cell size in px (default 64, fixed). Pass a function of zoom for supercluster-like behaviour
   * (`clusterCellForZoom` from `./cluster`): large cells when zoomed out, small when zoomed in.
   */
  clusterCellPx?: number | ((zoom: number) => number);
  /** Called when a cluster is clicked (after the default zoom-to-members). */
  onClusterClick?: (members: MapMarker[]) => void;
  /** Click on the map background (not on a pin). Used by draw tools / manual pin placement. */
  onMapClick?: (point: { lat: number; lng: number }) => void;
  minZoom?: number;
  maxZoom?: number;
  height?: string | number;
  className?: string;
  style?: CSSProperties;
  /** Extra react-leaflet layers rendered inside the map. */
  children?: ReactNode;
  /** Floating UI over the map (search-this-area button, legend, result carousel). */
  overlay?: ReactNode;
  /** Receive the Leaflet map instance once (for `flyTo`, `invalidateSize`, draw tools). */
  onMapReady?: (map: L.Map) => void;
  'aria-label'?: string;
};

export const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

// ---------------------------------------------------------------- helpers
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Numeric value in a label (`$1,250` → 1250) for the keyboard order of pins (DESIGN §4.4). */
function labelValue(label?: string): number {
  if (!label) return Number.POSITIVE_INFINITY;
  const m = label.replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
}

function sortForDom(markers: MapMarker[]): MapMarker[] {
  const rank = (k?: MapMarkerKind) => (k === 'campus' ? 0 : k === 'listing' || !k ? 1 : k === 'item' ? 2 : k === 'buddy' ? 3 : k === 'stop' ? 4 : 5);
  return [...markers].sort((a, b) => rank(a.kind) - rank(b.kind) || labelValue(a.label) - labelValue(b.label));
}

type Bucket = ClusterBucket;

// ---------------------------------------------------------------- inner components (need useMap)
function ViewController({
  center, zoom, bounds, fitBounds, fitKey, onBoundsChange, onMapReady,
}: {
  center?: LatLngTuple; zoom?: number; bounds?: Bbox | null; fitBounds: Bbox | null; fitKey: string;
  onBoundsChange?: (bbox: Bbox, zoom: number) => void; onMapReady?: (map: L.Map) => void;
}) {
  const map = useMap();
  const boundsRef = useRef(onBoundsChange);
  boundsRef.current = onBoundsChange;

  const emit = useCallback(() => {
    if (!boundsRef.current) return;
    const b = map.getBounds();
    boundsRef.current({ minLng: b.getWest(), minLat: b.getSouth(), maxLng: b.getEast(), maxLat: b.getNorth() }, map.getZoom());
  }, [map]);

  useMapEvents({ moveend: emit });

  useEffect(() => {
    onMapReady?.(map);
    // Leaflet may report bounds before layout settles; emit once after a frame.
    const id = window.requestAnimationFrame(emit);
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Track the last applied view key (not a "mounted" flag) so StrictMode's double effect run
  // and re-renders with the same props never trigger a spurious flyTo over fitBounds.
  const centerKey = center ? `${center[0]},${center[1]}|${zoom ?? ''}` : '';
  const appliedCenter = useRef(centerKey);
  useEffect(() => {
    if (appliedCenter.current === centerKey) return;
    appliedCenter.current = centerKey;
    if (bounds || !center) return;
    const z = zoom ?? map.getZoom();
    if (prefersReducedMotion()) map.setView(center, z);
    else map.flyTo(center, z, { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey]);

  // `bounds` is applied by MapContainer on mount; later changes are applied here.
  const boundsKey = bounds ? `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}` : '';
  const appliedBounds = useRef(boundsKey);
  useEffect(() => {
    if (appliedBounds.current === boundsKey) return;
    appliedBounds.current = boundsKey;
    if (!bounds) return;
    map.fitBounds(bboxToLeaflet(bounds), { padding: [24, 24], animate: !prefersReducedMotion() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey]);

  // fitToMarkers: applied on mount and whenever the id set changes.
  const appliedFit = useRef<string | null>(null);
  useEffect(() => {
    if (!fitBounds || appliedFit.current === fitKey) return;
    appliedFit.current = fitKey;
    map.fitBounds(bboxToLeaflet(fitBounds), { padding: [40, 40], maxZoom: 16, animate: !prefersReducedMotion() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return null;
}

/** Keeps Leaflet's size in sync with flex / sheet layouts. */
function ResizeHandler({ host }: { host: React.RefObject<HTMLDivElement | null> }) {
  const map = useMap();
  useEffect(() => {
    const el = host.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [host, map]);
  return null;
}

/** Background click → `onMapClick` (pins stop propagation through Leaflet's own marker handling). */
function MapClickHandler({ onMapClick }: { onMapClick: (point: { lat: number; lng: number }) => void }) {
  const ref = useRef(onMapClick);
  ref.current = onMapClick;
  useMapEvents({ click: (e) => ref.current({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function MarkerLayer({
  markers, hoveredId, interactive, clusterThreshold, clusterCellPx, onMarkerClick, onMarkerHover, onClusterClick,
}: {
  markers: MapMarker[]; hoveredId?: string | null; interactive: boolean; clusterThreshold: number;
  clusterCellPx: number | ((zoom: number) => number);
  onMarkerClick?: (id: string) => void; onMarkerHover?: (id: string | null) => void; onClusterClick?: (members: MapMarker[]) => void;
}) {
  const map = useMap();
  const [zoomTick, setZoomTick] = useState(0);
  useMapEvents({ zoomend: () => setZoomTick((n) => n + 1) });

  const sorted = useMemo(() => sortForDom(markers), [markers]);
  const buckets = useMemo<Bucket[]>(() => {
    if (sorted.length <= clusterThreshold) return sorted.map((marker) => ({ kind: 'marker', marker }));
    return clusterMarkersZoom(map, sorted, clusterCellPx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, clusterThreshold, clusterCellPx, map, zoomTick]);

  return (
    <>
      {buckets.map((b) => {
        if (b.kind === 'cluster') {
          const c = b.cluster;
          return (
            <Marker
              key={c.id}
              position={[c.lat, c.lng]}
              icon={clusterIcon(c.count)}
              keyboard={interactive}
              interactive={interactive}
              zIndexOffset={600}
              title={`${c.count}`}
              eventHandlers={{
                click: () => {
                  const bb = bboxOf(c.members, 0.1);
                  if (bb) map.fitBounds(bboxToLeaflet(bb), { padding: [40, 40], maxZoom: 17, animate: !prefersReducedMotion() });
                  onClusterClick?.(c.members);
                },
              }}
            />
          );
        }
        const m = b.marker;
        const hovered = hoveredId != null && hoveredId === m.id;
        const icon = iconFor(m.kind, { label: m.label, kind: m.kind, selected: m.selected, hovered, muted: m.muted, boosted: m.boosted, saved: m.saved });
        const z = m.selected ? 1000 : m.kind === 'campus' ? 800 : m.boosted ? 500 : hovered ? 400 : 0;
        return (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={icon}
            zIndexOffset={z}
            keyboard={interactive && m.kind !== 'campus'}
            interactive={interactive && m.kind !== 'campus'}
            riseOnHover
            {...(m.title ? { title: m.title } : {})}
            eventHandlers={{
              click: () => onMarkerClick?.(m.id),
              mouseover: () => onMarkerHover?.(m.id),
              mouseout: () => onMarkerHover?.(null),
            }}
          />
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- MapView
/**
 * Shared Leaflet + OSM map (BRIEF §3 map module, DESIGN §4.4). Imports Leaflet's CSS itself.
 *
 * ```tsx
 * <MapView center={campusCenter(campus)} zoom={14} height={320}
 *   markers={listings.map(l => ({ id: l.id, lat: l.lat, lng: l.lng, label: formatMoney(l.priceCents), selected: l.id === activeId }))}
 *   onMarkerClick={setActiveId} onMarkerHover={setHoverId} onBoundsChange={bounds.onBoundsChange} fitToMarkers />
 * ```
 */
export function MapView({
  center, zoom, bounds, markers = [], onMarkerClick, onMarkerHover, hoveredId, polylines = [], onPolylineClick, circles = [],
  onBoundsChange, fitToMarkers = false, interactive = true, locate, zoomControl, clusterThreshold = 60, clusterCellPx = 64, onClusterClick, onMapClick,
  minZoom = 3, maxZoom = 19, height = 320, className, style, children, overlay, onMapReady, 'aria-label': ariaLabel,
}: MapViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const showZoom = zoomControl ?? interactive;
  const showLocate = locate ?? interactive;

  const fitKey = fitToMarkers ? markers.map((m) => m.id).join('|') : '';
  const fitBounds = useMemo(() => (fitToMarkers && markers.length ? bboxOf(markers, 0.15) : null), [fitToMarkers, fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const initialCenter = center ?? (markers[0] ? ([markers[0].lat, markers[0].lng] as LatLngTuple) : US_CENTER);
  const initialZoom = zoom ?? (center || markers[0] ? 14 : US_ZOOM);
  const initialBounds = bounds ? bboxToLeaflet(bounds) : undefined;

  const h = typeof height === 'number' ? `${height}px` : height;

  return (
    <div ref={hostRef} className={cn('anwo-map', className)} style={{ height: h, ...style }} data-interactive={interactive} role="region" aria-label={ariaLabel ?? 'Map'}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        {...(initialBounds ? { bounds: initialBounds, boundsOptions: { padding: [24, 24] } } : {})}
        minZoom={minZoom}
        maxZoom={maxZoom}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={interactive}
        dragging={interactive}
        touchZoom={interactive}
        doubleClickZoom={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        zoomSnap={0.5}
        wheelPxPerZoomLevel={90}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} className="map-tiles" maxZoom={19} />
        <AttributionControl prefix={false} position="bottomleft" />
        {showZoom && <ZoomControl position="bottomright" />}
        {showLocate && <LocateControl position="bottomright" />}
        <ViewController center={center} zoom={zoom} bounds={bounds} fitBounds={fitBounds} fitKey={fitKey} onBoundsChange={onBoundsChange} onMapReady={onMapReady} />
        <ResizeHandler host={hostRef} />

        {circles.map((c) => {
          const kind = c.kind ?? 'area';
          return (
            <Circle
              key={c.id}
              center={[c.lat, c.lng]}
              radius={c.radiusM}
              interactive={false}
              pathOptions={{
                className: `anwo-area--${kind}`,
                weight: 2,
                opacity: kind === 'radius' ? 0.9 : 1,
                fillOpacity: kind === 'area' ? 0.1 : kind === 'pickup' ? 0.35 : 0,
                dashArray: kind === 'area' ? undefined : '6 6',
                lineCap: 'round',
              }}
            />
          );
        })}

        {polylines.map((p) => (
          <Polyline
            key={p.id}
            positions={p.points}
            interactive={interactive && !!onPolylineClick}
            pathOptions={{
              className: p.color ? 'anwo-route' : p.selected ? 'anwo-route--accent' : p.muted ? 'anwo-route--muted' : 'anwo-route--ink',
              ...(p.color ? { color: p.color } : {}),
              weight: p.weight ?? (p.selected ? 4 : 3),
              opacity: p.muted ? 0.6 : 1,
              lineCap: 'round',
              lineJoin: 'round',
              dashArray: p.dashed ? '8 8' : undefined,
            }}
            eventHandlers={onPolylineClick ? { click: () => onPolylineClick(p.id) } : undefined}
          />
        ))}

        <MarkerLayer markers={markers} hoveredId={hoveredId} interactive={interactive} clusterThreshold={clusterThreshold} clusterCellPx={clusterCellPx} onMarkerClick={onMarkerClick} onMarkerHover={onMarkerHover} onClusterClick={onClusterClick} />
        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}
        {children}
      </MapContainer>
      {overlay && <div className="anwo-map__overlay">{overlay}</div>}
    </div>
  );
}

export default MapView;
