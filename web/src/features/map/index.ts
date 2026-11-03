// Public surface of the "map" module. Other modules import only from here:
//   import { CommuteCard, useGeolocate } from '@/features/map';
//   <CommuteCard lat={l.lat} lng={l.lng} campusId={l.campusId} />           three tiles + nearest stop
//   <CommuteCard … variant="inline" />                                      compact chips for cards / rails
// Generic map pieces (MapView, PricePin, StaticMapPreview, useCommute, useGeocode, CommuteBadge, DrawSearchControl,
// clusterCellForZoom) live in '@/components/map'.
export { default as routes } from './routes';
export { default as AdminPanel } from './admin';
export { CommuteCard, type CommuteCardProps } from './components/CommuteCard';
export { useGeolocate, type GeoPosition, type GeolocateStatus, type UseGeolocate } from './hooks/useGeolocate';
export { LayerChips } from './components/LayerChips';
export { MapLegend } from './components/MapLegend';
export { mapApi, keys as mapQueryKeys } from './api';
