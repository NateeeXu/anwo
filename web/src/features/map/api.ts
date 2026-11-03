// Map module — typed fetchers + React Query keys for /api/map (docs/API.md §7).
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Poi } from '@shared/types';
import type { PoiCategory } from '@shared/enums';
import type { CampusBoundsResponse, CampusStatsResponse, GeocodeResponse, LayersResponse, MapLayer, PoiInput, PoiSuggestion, PoiSuggestionInput, PoiSuggestionStatus, PoiUpdateInput, ReverseResponse, SuggestionApproveInput } from '@shared/schemas/map';
import { api, type Query } from '@/lib/api';

export type LayersParams = {
  campusId?: string | null;
  bbox: string;
  layers?: MapLayer[];
  priceMin?: number;
  priceMax?: number;
  category?: string;
  buddyType?: string;
  dateFrom?: string;
  dateTo?: string;
  source?: 'initial' | 'pan' | 'search' | 'draw' | 'layer';
};

export type AdminPoi = Poi & { isActive: boolean };
export type AdminStats = {
  geocodeCache: { rows: number; forward: number; reverse: number; failures: number; hits: number };
  commuteCache: number;
  pois: { total: number; active: number };
  byCampus: { campusId: string; n: number }[];
  offline: boolean;
  suggestions?: { pending: number };
};

export const keys = {
  all: ['map'] as const,
  layers: (p: Omit<LayersParams, 'source'>) => ['map', 'layers', p] as const,
  pois: (q: Query) => ['map', 'pois', q] as const,
  campusStats: ['map', 'campusStats'] as const,
  campusBounds: (id: string) => ['map', 'campusBounds', id] as const,
  adminPois: (q: Query) => ['map', 'admin', 'pois', q] as const,
  adminStats: ['map', 'admin', 'stats'] as const,
  adminSuggestions: (status?: string) => ['map', 'admin', 'suggestions', status ?? 'all'] as const,
  mySuggestions: ['map', 'suggestions', 'mine'] as const,
};

export const mapApi = {
  layers: ({ layers, campusId, ...rest }: LayersParams) =>
    api<LayersResponse>('/api/map/layers', { query: { ...rest, campusId: campusId ?? undefined, layers: layers?.length ? layers.join(',') : undefined } }),
  pois: (q: { campusId?: string | null; category?: PoiCategory[]; bbox?: string; q?: string }) =>
    api<Poi[]>('/api/map/pois', { query: { campusId: q.campusId ?? undefined, category: q.category?.length ? q.category.join(',') : undefined, bbox: q.bbox, q: q.q } }),
  geocode: (q: string, opts: { campusId?: string | null; near?: { lat: number; lng: number } | null } = {}) =>
    api<GeocodeResponse>('/api/map/geocode', { query: { q, campusId: opts.campusId ?? undefined, near: opts.near ? `${opts.near.lat},${opts.near.lng}` : undefined } }),
  reverse: (lat: number, lng: number) => api<ReverseResponse>('/api/map/reverse', { query: { lat, lng } }),
  campusStats: () => api<CampusStatsResponse>('/api/map/campus-stats'),
  campusBounds: (id: string) => api<CampusBoundsResponse>(`/api/map/campus/${id}/bounds`),
  suggest: (body: PoiSuggestionInput) => api<PoiSuggestion>('/api/map/suggestions', { method: 'POST', body }),
  mySuggestions: () => api<PoiSuggestion[]>('/api/map/suggestions/mine'),
  admin: {
    suggestions: (status?: PoiSuggestionStatus) => api<{ items: PoiSuggestion[]; pending: number }>('/api/map/admin/suggestions', { query: { status } }),
    approve: (id: string, body: SuggestionApproveInput = {}) => api<{ suggestion: PoiSuggestion; poi: Poi }>(`/api/map/admin/suggestions/${id}/approve`, { method: 'POST', body }),
    reject: (id: string, reason: string) => api<PoiSuggestion>(`/api/map/admin/suggestions/${id}/reject`, { method: 'POST', body: { reason } }),
    pois: (q: { campusId?: string; category?: PoiCategory; q?: string }) => api<AdminPoi[]>('/api/map/admin/pois', { query: { ...q, includeInactive: true } }),
    stats: () => api<AdminStats>('/api/map/admin/stats'),
    create: (body: PoiInput) => api<Poi>('/api/map/admin/pois', { method: 'POST', body }),
    update: (id: string, body: PoiUpdateInput) => api<AdminPoi>(`/api/map/admin/pois/${id}`, { method: 'PATCH', body }),
    remove: (id: string) => api<null>(`/api/map/admin/pois/${id}`, { method: 'DELETE' }),
    clearCache: (olderThanDays?: number) => api<{ deleted: number; commuteDeleted: number }>('/api/map/admin/geocode-cache', { method: 'DELETE', body: { olderThanDays } }),
  },
};

export function useLayers(params: LayersParams | null, enabled = true): UseQueryResult<LayersResponse> {
  const { source: _source, ...keyParams } = params ?? { bbox: '' };
  void _source;
  return useQuery({
    queryKey: params ? keys.layers(keyParams) : ['map', 'layers', 'disabled'],
    queryFn: () => mapApi.layers(params!),
    enabled: enabled && !!params,
    placeholderData: (prev) => prev,
    staleTime: 20_000,
  });
}

export function useCampusStats(enabled = true): UseQueryResult<CampusStatsResponse> {
  return useQuery({ queryKey: keys.campusStats, queryFn: mapApi.campusStats, enabled, staleTime: 60_000 });
}
