// URL state for /map: `?c=lat,lng&z=14&layers=listings,items&scope=nationwide&r=lat,lng,radiusM&sel=listing:<id>`
// Read once on mount; written with `replace` (debounced) so back/forward is not polluted by every pan.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { MAP_LAYERS, type MapLayer } from '@shared/schemas/map';
import type { LatLng } from '@/lib/geo';

export type MapUrlState = {
  center: LatLng | null;
  zoom: number | null;
  layers: MapLayer[];
  nationwide: boolean;
  radius: { center: LatLng; radiusM: number } | null;
  selected: string | null;
};

const ALL: MapLayer[] = [...MAP_LAYERS];

function parseLatLng(s: string | null): LatLng | null {
  if (!s) return null;
  const [a, b] = s.split(',').map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a!) > 90 || Math.abs(b!) > 180) return null;
  return { lat: a!, lng: b! };
}

export function readMapUrl(params: URLSearchParams): MapUrlState {
  const layersRaw = params.get('layers');
  const layers = layersRaw === null ? ALL : (layersRaw.split(',').filter((l): l is MapLayer => (ALL as string[]).includes(l)) as MapLayer[]);
  const r = params.get('r')?.split(',').map(Number);
  const radius = r && r.length === 3 && r.every(Number.isFinite) && r[2]! > 0 ? { center: { lat: r[0]!, lng: r[1]! }, radiusM: r[2]! } : null;
  const z = Number(params.get('z'));
  return {
    center: parseLatLng(params.get('c')),
    zoom: Number.isFinite(z) && z >= 3 && z <= 19 ? z : null,
    layers,
    nationwide: params.get('scope') === 'nationwide',
    radius,
    selected: params.get('sel'),
  };
}

export function useMapUrlState() {
  const [params, setParams] = useSearchParams();
  const initial = useMemo(() => readMapUrl(params), []); // eslint-disable-line react-hooks/exhaustive-deps
  const timer = useRef<number | null>(null);
  const pending = useRef<Partial<MapUrlState>>({});

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const write = useCallback(
    (patch: Partial<MapUrlState>, { immediate = false } = {}) => {
      pending.current = { ...pending.current, ...patch };
      const flush = () => {
        const p = pending.current;
        pending.current = {};
        // Build from the live URL, not the router's render-time params: flushes run from timers and a stale
        // `prev` would resurrect values written in between (layers, radius, selection).
        setParams(
          (() => {
            const next = new URLSearchParams(window.location.search);
            if (p.center !== undefined) {
              if (p.center) next.set('c', `${p.center.lat.toFixed(5)},${p.center.lng.toFixed(5)}`);
              else next.delete('c');
            }
            if (p.zoom !== undefined) {
              if (p.zoom != null) next.set('z', String(Math.round(p.zoom * 2) / 2));
              else next.delete('z');
            }
            if (p.layers !== undefined) {
              if (p.layers.length === ALL.length) next.delete('layers');
              else next.set('layers', p.layers.join(','));
            }
            if (p.nationwide !== undefined) {
              if (p.nationwide) next.set('scope', 'nationwide');
              else next.delete('scope');
            }
            if (p.radius !== undefined) {
              if (p.radius) next.set('r', `${p.radius.center.lat.toFixed(5)},${p.radius.center.lng.toFixed(5)},${Math.round(p.radius.radiusM)}`);
              else next.delete('r');
            }
            if (p.selected !== undefined) {
              if (p.selected) next.set('sel', p.selected);
              else next.delete('sel');
            }
            return next;
          })(),
          { replace: true },
        );
      };
      if (timer.current) window.clearTimeout(timer.current);
      if (immediate) flush();
      else timer.current = window.setTimeout(flush, 400);
    },
    [setParams],
  );

  return { initial, write };
}

export default useMapUrlState;
