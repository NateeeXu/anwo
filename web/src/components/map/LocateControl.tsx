import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Circle, Marker, useMap } from 'react-leaflet';
import { useLocale } from '@/lib/i18n';
import { meIcon } from './icons';

const LOCATE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/></svg>';

const LABELS = { 'zh-CN': { locate: '定位到我的位置', error: '无法获取位置' }, en: { locate: 'Show my location', error: 'Could not get your location' } } as const;

export type LocateControlProps = {
  position?: L.ControlPosition;
  maxZoom?: number;
  onLocate?: (pos: { lat: number; lng: number; accuracyM: number }) => void;
};

/**
 * "Locate me" button (DESIGN §7.2 `[⌖ 定位]`): styled like the zoom bar, shows an accent dot
 * plus accuracy circle. Uses `map.locate` so there is no geolocation code in pages.
 */
export function LocateControl({ position = 'bottomright', maxZoom = 15, onLocate }: LocateControlProps) {
  const map = useMap();
  const { locale } = useLocale();
  const labels = LABELS[locale] ?? LABELS.en;
  const [state, setState] = useState<'idle' | 'locating' | 'found' | 'error'>('idle');
  const [me, setMe] = useState<{ lat: number; lng: number; accuracyM: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onLocateRef = useRef(onLocate);
  onLocateRef.current = onLocate;

  useEffect(() => {
    const control = new L.Control({ position });
    control.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-bar anwo-locate');
      div.dataset.state = 'idle';
      const btn = L.DomUtil.create('button', 'anwo-locate__btn', div);
      btn.type = 'button';
      btn.innerHTML = LOCATE_SVG;
      btn.setAttribute('aria-label', labels.locate);
      btn.title = labels.locate;
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(btn, 'click', (e) => {
        L.DomEvent.stop(e);
        setState('locating');
        div.dataset.state = 'locating';
        map.locate({ setView: true, maxZoom, enableHighAccuracy: true, timeout: 10000 });
      });
      containerRef.current = div;
      return div;
    };
    control.addTo(map);
    const onFound = (e: L.LocationEvent) => {
      const pos = { lat: e.latlng.lat, lng: e.latlng.lng, accuracyM: e.accuracy };
      setMe(pos);
      setState('found');
      if (containerRef.current) containerRef.current.dataset.state = 'found';
      onLocateRef.current?.(pos);
    };
    const onError = () => {
      setState('error');
      if (containerRef.current) {
        containerRef.current.dataset.state = 'error';
        containerRef.current.title = labels.error;
      }
      window.setTimeout(() => {
        if (containerRef.current?.dataset.state === 'error') containerRef.current.dataset.state = 'idle';
      }, 2500);
    };
    map.on('locationfound', onFound);
    map.on('locationerror', onError);
    return () => {
      map.off('locationfound', onFound);
      map.off('locationerror', onError);
      control.remove();
      containerRef.current = null;
    };
  }, [map, position, maxZoom, labels.locate, labels.error]);

  // keep the aria-label in the current language without re-creating the control
  useEffect(() => {
    const btn = containerRef.current?.querySelector('button');
    if (btn) {
      btn.setAttribute('aria-label', labels.locate);
      btn.title = labels.locate;
    }
  }, [labels.locate]);

  if (!me || state === 'error') return null;
  return (
    <>
      {me.accuracyM > 30 && (
        <Circle center={[me.lat, me.lng]} radius={me.accuracyM} pathOptions={{ className: 'anwo-area--accuracy', weight: 1, fillOpacity: 0.08, opacity: 0.5 }} interactive={false} />
      )}
      <Marker position={[me.lat, me.lng]} icon={meIcon()} interactive={false} keyboard={false} zIndexOffset={2000} />
    </>
  );
}

export default LocateControl;
