// Typed API calls + query keys for the wanted module (API.md §4). Other modules may import the hooks from ./index.
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type { Area, ListingCard, Match, Paginated, ScopedPaginated, Wanted, WantedCard, Listing } from '@shared/types';
import type { AreaInput, WantedInput, WantedPatchInput } from '@shared/schemas/wanted';
import { api, type Query } from '@/lib/api';

export type WantedFilters = {
  q?: string;
  budgetMin?: number;
  budgetMax?: number;
  moveInFrom?: string;
  moveInTo?: string;
  groupSize?: number;
  groupSizeMin?: number;
  bedroomsMin?: number;
  furnishedPref?: 'any' | 'partial' | 'full';
  genderPref?: 'any' | 'female' | 'male';
  hasPets?: boolean;
  sort?: 'recent' | 'budget_desc' | 'budget_asc' | 'move_in' | 'relevance';
  page?: number;
  pageSize?: number;
};

export type MatchWithListing = Match & { listing?: ListingCard };
export type MatchWithWanted = Match & { wanted?: WantedCard };
export type MatchesPage = Paginated<MatchWithListing> & { computedAt?: string | null };
export type ForMe = { byWanted: { wanted: WantedCard; matches: MatchWithListing[] }[] };
export type Digest = { subject: string; items: { wanted: WantedCard; matches: MatchWithListing[] }[]; generatedAt: string; optIn: boolean };
export type WantedAdminRow = Wanted & { moderationStatus: 'ok' | 'flagged' | 'hidden'; reportCount: number };

export const wantedKeys = {
  all: ['wanted'] as const,
  list: (params: Query) => ['wanted', 'list', params] as const,
  detail: (id: string) => ['wanted', 'detail', id] as const,
  mine: (params: Query) => ['wanted', 'mine', params] as const,
  matches: (id: string, params: Query) => ['wanted', 'matches', id, params] as const,
  forMe: ['wanted', 'for-me'] as const,
  forListing: (listingId: string) => ['wanted', 'for-listing', listingId] as const,
  digest: ['wanted', 'digest'] as const,
  myListings: ['wanted', 'my-listings'] as const,
  admin: (params: Query) => ['wanted', 'admin', params] as const,
};

export const fetchWantedList = (params: Query) => api<ScopedPaginated<WantedCard>>('/api/wanted', { query: params });
export const fetchWanted = (id: string) => api<Wanted>(`/api/wanted/${id}`);
export const fetchMine = (params: Query = {}) => api<Paginated<Wanted>>('/api/wanted/mine', { query: params });
export const fetchMatches = (id: string, params: Query = {}) => api<MatchesPage>(`/api/wanted/${id}/matches`, { query: params });
export const fetchForMe = (limit = 5) => api<ForMe>('/api/wanted/matches/for-me', { query: { limit } });
export const fetchForListing = (listingId: string) => api<MatchWithWanted[]>(`/api/wanted/matches/for-listing/${listingId}`);
export const fetchDigest = () => api<Digest>('/api/wanted/digest/preview');
export const createWanted = (body: WantedInput) => api<Wanted>('/api/wanted', { method: 'POST', body });
export const patchWanted = (id: string, body: WantedPatchInput) => api<Wanted>(`/api/wanted/${id}`, { method: 'PATCH', body });
export const transitionWanted = (id: string, action: 'pause' | 'resume' | 'fulfilled' | 'extend') => api<Wanted>(`/api/wanted/${id}/${action}`, { method: 'POST' });
export const deleteWanted = (id: string) => api<null>(`/api/wanted/${id}`, { method: 'DELETE' });
export const putAreas = (id: string, areas: AreaInput[]) => api<Area[]>(`/api/wanted/${id}/areas`, { method: 'PUT', body: { areas } });
export const recomputeMatches = (id: string) => api<{ count: number; computedAt: string | null }>(`/api/wanted/${id}/matches/recompute`, { method: 'POST' });
export const markMatchSeen = (id: string, listingId: string) => api<MatchWithListing>(`/api/wanted/${id}/matches/${listingId}/seen`, { method: 'POST' });
export const dismissMatch = (id: string, listingId: string) => api<MatchWithListing>(`/api/wanted/${id}/matches/${listingId}/dismiss`, { method: 'POST' });
export const contactMatch = (id: string, listingId: string, message?: string) =>
  api<{ conversationId: string; match: MatchWithListing }>(`/api/wanted/${id}/matches/${listingId}/contact`, { method: 'POST', body: { message } });
export const offerListing = (id: string, listingId: string, message?: string) =>
  api<{ conversationId: string; match: MatchWithListing }>(`/api/wanted/${id}/offer`, { method: 'POST', body: { listingId, message } });
export const reportWanted = (id: string, reason: string, details?: string) => api(`/api/wanted/${id}/report`, { method: 'POST', body: { reason, details } });
export const fetchMyListings = () => api<Paginated<Listing>>('/api/listings/mine', { query: { status: 'active,paused', pageSize: 50 } });

// ------------------------------------------------------------------ hooks
export function useWanted(id: string | undefined, opts: Partial<UseQueryOptions<Wanted>> = {}) {
  return useQuery<Wanted>({ queryKey: wantedKeys.detail(id ?? ''), queryFn: () => fetchWanted(id!), enabled: !!id, ...opts });
}
export function useMatchesForMe(enabled = true, limit = 5) {
  return useQuery<ForMe>({ queryKey: [...wantedKeys.forMe, limit], queryFn: () => fetchForMe(limit), enabled });
}
export function useSeekersForListing(listingId: string | undefined) {
  return useQuery<MatchWithWanted[]>({ queryKey: wantedKeys.forListing(listingId ?? ''), queryFn: () => fetchForListing(listingId!), enabled: !!listingId });
}
export function useInvalidateWanted() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: wantedKeys.all });
    if (id) qc.invalidateQueries({ queryKey: wantedKeys.detail(id) });
  };
}
export function useOfferMutation(wantedId: string) {
  const invalidate = useInvalidateWanted();
  return useMutation({
    mutationFn: ({ listingId, message }: { listingId: string; message?: string }) => offerListing(wantedId, listingId, message),
    onSuccess: () => invalidate(wantedId),
  });
}

/** `/api/listings/mine` may still be a stub while the listings module is in progress — normalise to a plain array. */
export function listingsOf(data: unknown): Listing[] {
  if (!data || typeof data !== 'object') return [];
  const items = (data as { items?: unknown }).items;
  return Array.isArray(items) ? (items as Listing[]) : [];
}
