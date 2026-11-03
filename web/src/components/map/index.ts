// Shared map surface (scaffold-owned). The `map` module may ADD exports/props here, never change or remove existing ones.
export { MapView, OSM_TILE_URL, OSM_ATTRIBUTION } from './MapView';
export type { MapViewProps, MapMarker, MapPolyline, MapCircle, MapCircleKind } from './MapView';
export { PricePin, pricePinHtml, pinStateKey } from './PricePin';
export type { PricePinProps, PinState, MapMarkerKind } from './PricePin';
export { ClusterPin, clusterPinHtml, clusterLabel } from './ClusterPin';
export type { ClusterPinProps } from './ClusterPin';
export { StaticMapPreview } from './StaticMapPreview';
export type { StaticMapPreviewProps } from './StaticMapPreview';
export { LocateControl } from './LocateControl';
export type { LocateControlProps } from './LocateControl';
export { useMapBounds } from './useMapBounds';
export type { UseMapBounds, UseMapBoundsOptions } from './useMapBounds';
export { pricePinIcon, clusterIcon, stopIcon, poiIcon, campusIcon, iconFor, fixLeafletDefaultIcon } from './icons';

// ---- added by the `map` module (additive; see docs/modules/map.md)
export { clusterMarkers, clusterCellForZoom } from './cluster';
export type { ClusterBucket, MarkerCluster } from './cluster';
export { DrawSearchControl } from './DrawSearchControl';
export type { DrawSearchControlProps, DrawSearchValue } from './DrawSearchControl';
export { useCommute, useGeocode, useReverse, mapQueryKeys } from './hooks';
export type { UseGeocode } from './hooks';
export { CommuteBadge } from './CommuteBadge';
export type { CommuteBadgeProps } from './CommuteBadge';
export { meIcon } from './icons';
