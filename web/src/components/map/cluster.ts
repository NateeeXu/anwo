// Grid clustering with a zoom-dependent cell size (supercluster-like behaviour without the dependency).
// Added by the `map` module (BRIEF §7 exception). MapView uses it through the `clusterCellPx` prop; the default
// (64 px fixed) is unchanged for existing callers.
import type L from 'leaflet';
import type { MapMarker } from './MapView';

export type MarkerCluster = { id: string; lat: number; lng: number; count: number; members: MapMarker[] };
export type ClusterBucket = { kind: 'marker'; marker: MapMarker } | { kind: 'cluster'; cluster: MarkerCluster };

/**
 * Cell size in CSS px for a zoom level: big cells far out (city view groups aggressively), small cells close in
 * so neighbouring pins separate before they overlap. ≈ supercluster's radius=60 / extent=512 feel.
 */
export function clusterCellForZoom(zoom: number): number {
  if (zoom <= 9) return 110;
  if (zoom <= 11) return 92;
  if (zoom <= 13) return 76;
  if (zoom <= 14) return 64;
  if (zoom <= 15) return 56;
  if (zoom <= 16) return 48;
  return 40;
}

/**
 * Grid clustering in projected pixel space. Selected / campus markers never cluster. The cell key is offset by half
 * a cell on odd zooms so cluster centres do not sit on the same grid lines between zoom levels (less "jumping").
 */
export function clusterMarkers(
  map: L.Map,
  markers: MapMarker[],
  cellPx: number | ((zoom: number) => number) = 64,
  /** Only markers of these kinds are clustered (default: all). Small dots (stops, POIs) usually stay visible. */
  kinds?: readonly string[],
): ClusterBucket[] {
  const zoom = map.getZoom();
  const cell = typeof cellPx === 'function' ? cellPx(zoom) : cellPx;
  const shift = Math.round(zoom) % 2 === 1 ? cell / 2 : 0;
  const cells = new Map<string, MapMarker[]>();
  const out: ClusterBucket[] = [];
  for (const m of markers) {
    if (m.selected || m.kind === 'campus' || (kinds && !kinds.includes(m.kind ?? 'listing'))) {
      out.push({ kind: 'marker', marker: m });
      continue;
    }
    const p = map.project([m.lat, m.lng], zoom);
    const key = `${Math.floor((p.x + shift) / cell)}:${Math.floor((p.y + shift) / cell)}`;
    const list = cells.get(key);
    if (list) list.push(m);
    else cells.set(key, [m]);
  }
  for (const [key, list] of cells) {
    if (list.length === 1) {
      out.push({ kind: 'marker', marker: list[0]! });
      continue;
    }
    let lat = 0, lng = 0;
    for (const m of list) { lat += m.lat; lng += m.lng; }
    out.push({ kind: 'cluster', cluster: { id: `cluster:${zoom}:${key}`, lat: lat / list.length, lng: lng / list.length, count: list.length, members: list } });
  }
  return out;
}
