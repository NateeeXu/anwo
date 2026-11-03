// Draw-radius search (DESIGN §7.9 「画圈搜索」) — a react-leaflet child for MapView:
//   <MapView onMapClick={draw.active && !draw.center ? setCenter : undefined}>
//     <DrawSearchControl active center={center} radiusM={radiusM} onChange={({ center, radiusM }) => …} />
//   </MapView>
// Drag the centre dot to move the circle; drag the edge handle to resize. Pure presentation + gestures: the page
// decides how the circle filters results (client-side distance or a `lat/lng/radiusKm` query).
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { Circle, Marker, Polyline, useMap } from 'react-leaflet';
import { haversineM, type LatLng } from '@/lib/geo';

export type DrawSearchValue = { center: LatLng; radiusM: number };
export type DrawSearchControlProps = {
  active: boolean;
  center: LatLng | null;
  radiusM: number;
  minRadiusM?: number;
  maxRadiusM?: number;
  onChange: (v: DrawSearchValue) => void;
  /** Fit the map to the circle when the centre is first placed. */
  fitOnPlace?: boolean;
  /** Accessible labels (the control itself has no copy). */
  labels?: { center?: string; handle?: string };
};

const centerIcon = L.divIcon({ html: '<span class="anwo-draw__center"></span>', className: 'anwo-marker', iconSize: undefined, iconAnchor: [0, 0] });
const handleIcon = L.divIcon({ html: '<span class="anwo-draw__handle"></span>', className: 'anwo-marker', iconSize: undefined, iconAnchor: [0, 0] });

function eastOf(center: LatLng, radiusM: number): LatLng {
  const dLng = radiusM / (111320 * Math.max(0.01, Math.cos((center.lat * Math.PI) / 180)));
  return { lat: center.lat, lng: center.lng + dLng };
}

export function DrawSearchControl({ active, center, radiusM, minRadiusM = 200, maxRadiusM = 10_000, onChange, fitOnPlace = true, labels }: DrawSearchControlProps) {
  const map = useMap();
  const placedKey = useRef<string | null>(null);
  const handle = useMemo(() => (center ? eastOf(center, radiusM) : null), [center, radiusM]);

  // cursor + fit on first placement
  useEffect(() => {
    const el = map.getContainer();
    if (active && !center) el.classList.add('anwo-map--drawing');
    else el.classList.remove('anwo-map--drawing');
    return () => el.classList.remove('anwo-map--drawing');
  }, [map, active, center]);

  useEffect(() => {
    if (!center || !fitOnPlace) return;
    const key = `${center.lat.toFixed(5)},${center.lng.toFixed(5)}`;
    if (placedKey.current === key) return;
    placedKey.current = key;
    const b = L.latLng(center.lat, center.lng).toBounds(radiusM * 2.4);
    if (!map.getBounds().contains(b)) map.fitBounds(b, { padding: [24, 24] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.lat, center?.lng]);

  if (!active || !center || !handle) return null;
  const clamp = (r: number) => Math.min(maxRadiusM, Math.max(minRadiusM, Math.round(r / 10) * 10));

  return (
    <>
      <Circle center={[center.lat, center.lng]} radius={radiusM} interactive={false} pathOptions={{ className: 'anwo-area--area', weight: 2, fillOpacity: 0.1, lineCap: 'round' }} />
      <Polyline positions={[[center.lat, center.lng], [handle.lat, handle.lng]]} interactive={false} pathOptions={{ className: 'anwo-draw__spoke', weight: 1.5, dashArray: '4 6', opacity: 0.8 }} />
      <Marker
        position={[center.lat, center.lng]}
        icon={centerIcon}
        draggable
        keyboard
        zIndexOffset={1500}
        title={labels?.center}
        eventHandlers={{
          drag: (e) => {
            const ll = (e.target as L.Marker).getLatLng();
            onChange({ center: { lat: ll.lat, lng: ll.lng }, radiusM });
          },
        }}
      />
      <Marker
        position={[handle.lat, handle.lng]}
        icon={handleIcon}
        draggable
        keyboard
        zIndexOffset={1600}
        title={labels?.handle}
        eventHandlers={{
          drag: (e) => {
            const ll = (e.target as L.Marker).getLatLng();
            onChange({ center, radiusM: clamp(haversineM(center, { lat: ll.lat, lng: ll.lng })) });
          },
        }}
      />
    </>
  );
}

export default DrawSearchControl;
