// Map data hooks other modules may import (API.md §7 web exports): useGeocode(), useCommute().
// Added by the `map` module. They only touch `/api/map/*` through `@/lib/api`.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import type { CommuteResponse, GeocodeHit, GeocodeResponse, ReverseResponse } from '@shared/schemas/map';
import { api, ApiError } from '@/lib/api';

export const mapQueryKeys = {
  commute: (campusId: string | null | undefined, lat: number, lng: number) => ['map', 'commute', campusId ?? 'auto', +lat.toFixed(4), +lng.toFixed(4)] as const,
  geocode: (q: string, campusId?: string | null) => ['map', 'geocode', q.trim().toLowerCase(), campusId ?? null] as const,
  reverse: (lat: number, lng: number) => ['map', 'reverse', +lat.toFixed(5), +lng.toFixed(5)] as const,
};

/** Walk / bike / shuttle estimate to a campus (cached server-side). `enabled` false until lat/lng are known. */
export function useCommute(input: { lat: number | null | undefined; lng: number | null | undefined; campusId?: string | null }, enabled = true): UseQueryResult<CommuteResponse> {
  const { lat, lng, campusId } = input;
  const ok = enabled && typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);
  return useQuery({
    queryKey: ok ? mapQueryKeys.commute(campusId, lat, lng) : ['map', 'commute', 'disabled'],
    queryFn: () => api<CommuteResponse>('/api/map/commute', { query: { lat, lng, campusId: campusId ?? undefined } }),
    enabled: ok,
    staleTime: 10 * 60_000,
  });
}

export type UseGeocode = {
  results: GeocodeHit[];
  status: 'idle' | 'loading' | 'done' | 'error';
  error: ApiError | null;
  /** true when the server could not reach the geocoder and answered from a campus-centroid fallback */
  approx: boolean;
  offline: boolean;
  search: (q: string, opts?: { campusId?: string | null; near?: { lat: number; lng: number } | null }) => Promise<GeocodeHit[]>;
  reset: () => void;
};

/** Imperative forward geocoding with the last result set (address inputs, map search box). Needs a logged-in user. */
export function useGeocode(): UseGeocode {
  const [results, setResults] = useState<GeocodeHit[]>([]);
  const [status, setStatus] = useState<UseGeocode['status']>('idle');
  const [error, setError] = useState<ApiError | null>(null);
  const [approx, setApprox] = useState(false);
  const [offline, setOffline] = useState(false);
  const seq = useRef(0);

  const search = useCallback(async (q: string, opts: { campusId?: string | null; near?: { lat: number; lng: number } | null } = {}) => {
    const my = ++seq.current;
    const text = q.trim();
    if (text.length < 3) {
      setResults([]);
      setStatus('idle');
      return [];
    }
    setStatus('loading');
    setError(null);
    try {
      const r = await api<GeocodeResponse>('/api/map/geocode', {
        query: { q: text, campusId: opts.campusId ?? undefined, near: opts.near ? `${opts.near.lat},${opts.near.lng}` : undefined },
      });
      if (my !== seq.current) return r.results;
      setResults(r.results);
      setApprox(r.results.some((x) => x.approx));
      setOffline(r.offline);
      setStatus('done');
      return r.results;
    } catch (e) {
      if (my !== seq.current) return [];
      setError(e instanceof ApiError ? e : new ApiError({ code: 'INTERNAL', message: (e as Error).message ?? 'error', status: 0 }));
      setStatus('error');
      return [];
    }
  }, []);

  const reset = useCallback(() => {
    seq.current++;
    setResults([]);
    setStatus('idle');
    setError(null);
    setApprox(false);
  }, []);

  return { results, status, error, approx, offline, search, reset };
}

/** Human label for a point from local data (no network). Needs a logged-in user. */
export function useReverse(point: { lat: number; lng: number } | null, enabled = true): UseQueryResult<ReverseResponse> {
  return useQuery({
    queryKey: point ? mapQueryKeys.reverse(point.lat, point.lng) : ['map', 'reverse', 'disabled'],
    queryFn: () => api<ReverseResponse>('/api/map/reverse', { query: { lat: point!.lat, lng: point!.lng } }),
    enabled: enabled && !!point,
    staleTime: 60 * 60_000,
  });
}
