import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { zoomForRadius, type LatLngTuple } from '@/lib/geo';
import { MapView, type MapCircle, type MapMarker } from './MapView';
import type { MapMarkerKind } from './PricePin';

export type StaticMapPreviewProps = {
  lat: number;
  lng: number;
  /** Pill text for the pin (`$1,250`). Omit for a label-less dot-style pin of the given kind. */
  label?: string;
  kind?: MapMarkerKind;
  zoom?: number;
  height?: string | number;
  /** Draw an approximate circle instead of an exact pin (market pickup privacy, DESIGN §7.11). */
  approximateRadiusM?: number;
  /** Optional campus centre to show alongside (mark on plate). */
  campus?: { lat: number; lng: number; shortName?: string } | null;
  className?: string;
  style?: CSSProperties;
  /** Floating content (e.g. a "打开地图" ghost button). */
  overlay?: ReactNode;
  'aria-label'?: string;
};

/**
 * Non-interactive map used in cards and detail rails. No controls, no dragging, pins are not focusable.
 * Still shows OSM attribution (required) and dims tiles in dark mode.
 */
export function StaticMapPreview({ lat, lng, label, kind = 'listing', zoom, height = 160, approximateRadiusM, campus, className, style, overlay, ...rest }: StaticMapPreviewProps) {
  const center: LatLngTuple = [lat, lng];
  const markers: MapMarker[] = [];
  const circles: MapCircle[] = [];
  if (approximateRadiusM) circles.push({ id: 'approx', lat, lng, radiusM: approximateRadiusM, kind: 'pickup' });
  else markers.push({ id: 'pin', lat, lng, label: label ?? '', kind, selected: true });
  if (campus && Number.isFinite(campus.lat) && Number.isFinite(campus.lng)) markers.push({ id: 'campus', lat: campus.lat, lng: campus.lng, kind: 'campus', label: campus.shortName });

  const hPx = typeof height === 'number' ? height : 160;
  const z = zoom ?? (approximateRadiusM ? zoomForRadius(approximateRadiusM * 3, hPx, lat) : 15);
  return (
    <MapView
      center={center}
      zoom={z}
      height={height}
      markers={markers}
      circles={circles}
      interactive={false}
      fitToMarkers={!!campus}
      className={cn('rounded-card', className)}
      style={style}
      overlay={overlay}
      aria-label={rest['aria-label'] ?? 'Map preview'}
    />
  );
}

export default StaticMapPreview;
