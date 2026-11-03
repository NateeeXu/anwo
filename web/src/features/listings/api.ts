// Typed fetchers + React Query keys for /api/listings (API.md §3). Everything the listings pages call goes through here.
import type { Availability, Lead, Listing, ListingCard, ListingPin, Paginated, Photo, Report, SavedSearch, ScopeInfo } from '@shared/types';
import type { ListingInput, ListingUpdateInput } from '@shared/schemas/listings';
import { api, type Query } from '@/lib/api';

export type ListingsPage = Paginated<ListingCard> & { scope: ScopeInfo };
export type PinsResponse = { pins: (ListingPin & { saved?: boolean })[]; total: number; scope: ScopeInfo };
export type PriceStats = { histogram: number[]; bounds: [number, number]; step: number; count: number; medianPriceCents: number; scope: ScopeInfo };
export type MinePage = Paginated<Listing> & { counts: Record<string, number>; summary: { views: number; saves: number; leads: number }; quota: { limit: number | null; active: number } };
export type OwnerStats = {
  views: { date: string; count: number }[]; viewsTotal: number; viewsInPeriod: number; saves: number; leads: number; contactRate: number;
  boostImpressions: number; boostClicks: number; rankHint: 'top10' | 'top50' | 'other'; locked: boolean; days: number;
};
export type LeadsPage = Paginated<Lead> & { locked: boolean };
export type ShareInfo = { url: string; title: string; text: string; qrSvg: string };
export type GeocodeResponse = {
  lat: number; lng: number; displayName: string; addressLine1: string | null; city: string | null; state: string | null; zip: string | null;
  precision: 'rooftop' | 'street' | 'city' | 'none'; approx: boolean; cached: boolean;
  campusSuggestion: { suggested: { id: string; shortName: string; name: string; nameZh: string | null } | null; nearest: { id: string; shortName: string; name: string; nameZh: string | null; distanceM: number }[] };
};
export type CreatedListing = Listing & { placement?: { farFromCampus: boolean; approx: boolean } };

export const keys = {
  all: ['listings'] as const,
  list: (params: Query) => ['listings', 'list', params] as const,
  pins: (params: Query) => ['listings', 'pins', params] as const,
  stats: (params: Query) => ['listings', 'stats', params] as const,
  detail: (id: string) => ['listings', 'detail', id] as const,
  similar: (id: string) => ['listings', 'similar', id] as const,
  availability: (id: string) => ['listings', 'availability', id] as const,
  share: (id: string) => ['listings', 'share', id] as const,
  mine: (params: Query) => ['listings', 'mine', params] as const,
  saved: (params: Query) => ['listings', 'saved', params] as const,
  leads: (id: string) => ['listings', 'leads', id] as const,
  ownerStats: (id: string, days: number) => ['listings', 'ownerStats', id, days] as const,
  savedSearches: ['search', 'saved', 'listings'] as const,
};

export const listingsApi = {
  list: (query: Query) => api<ListingsPage>('/api/listings', { query }),
  pins: (query: Query) => api<PinsResponse>('/api/listings', { query: { ...query, view: 'pins' } }),
  priceStats: (query: Query) => api<PriceStats>('/api/listings/stats', { query }),
  detail: (id: string, boost?: string | null) => api<Listing>(`/api/listings/${id}`, { query: boost ? { boost } : undefined }),
  similar: (id: string, limit = 6) => api<ListingCard[]>(`/api/listings/${id}/similar`, { query: { limit } }),
  availability: (id: string) => api<{ availableFrom: string; availableTo: string | null; ranges: Availability[] }>(`/api/listings/${id}/availability`),
  share: (id: string) => api<ShareInfo>(`/api/listings/${id}/share`),
  mine: (query: Query) => api<MinePage>('/api/listings/mine', { query }),
  saved: (query: Query) => api<Paginated<ListingCard>>('/api/listings/saved', { query }),
  create: (body: ListingInput) => api<CreatedListing>('/api/listings', { method: 'POST', body }),
  update: (id: string, body: ListingUpdateInput) => api<Listing>(`/api/listings/${id}`, { method: 'PATCH', body }),
  publish: (id: string) => api<Listing>(`/api/listings/${id}/publish`, { method: 'POST' }),
  pause: (id: string) => api<Listing>(`/api/listings/${id}/pause`, { method: 'POST' }),
  resume: (id: string) => api<Listing>(`/api/listings/${id}/resume`, { method: 'POST' }),
  rented: (id: string, closeBundle = false) => api<Listing>(`/api/listings/${id}/rented`, { method: 'POST', body: { closeBundle } }),
  renew: (id: string) => api<Listing>(`/api/listings/${id}/renew`, { method: 'POST' }),
  remove: (id: string) => api<null>(`/api/listings/${id}`, { method: 'DELETE' }),
  setPhotos: (id: string, photos: { uploadId: string; caption?: string }[]) => api<Photo[]>(`/api/listings/${id}/photos`, { method: 'PUT', body: { photos } }),
  setAvailability: (id: string, ranges: { startDate: string; endDate: string; status: Availability['status']; note?: string }[]) => api<Availability[]>(`/api/listings/${id}/availability`, { method: 'PUT', body: { ranges } }),
  save: (id: string) => api<{ saved: boolean; saveCount: number }>(`/api/listings/${id}/save`, { method: 'POST' }),
  unsave: (id: string) => api<{ saved: boolean; saveCount: number }>(`/api/listings/${id}/save`, { method: 'DELETE' }),
  report: (id: string, body: { reason: string; details?: string }) => api<Report>(`/api/listings/${id}/report`, { method: 'POST', body }),
  contact: (id: string, message?: string) => api<{ conversationId: string; created: boolean; leadId: string | null }>(`/api/listings/${id}/contact`, { method: 'POST', body: { message: message || undefined } }),
  leads: (id: string, query: Query = {}) => api<LeadsPage>(`/api/listings/${id}/leads`, { query }),
  setLeadStatus: (id: string, leadId: string, status: string) => api<Lead>(`/api/listings/${id}/leads/${leadId}`, { method: 'PATCH', body: { status } }),
  ownerStats: (id: string, days: number) => api<OwnerStats>(`/api/listings/${id}/stats`, { query: { days } }),
  geocode: (q: string, campusId?: string | null) => api<GeocodeResponse>('/api/listings/geocode', { query: { q, campusId: campusId ?? undefined } }),
  savedSearches: () => api<SavedSearch[]>('/api/search/saved', { query: { module: 'listings' } }),
  saveSearch: (body: { campusId?: string; scope: 'campus' | 'nationwide'; name?: string; query: Record<string, unknown>; notify: boolean }) => api<SavedSearch>('/api/search/saved', { method: 'POST', body: { ...body, module: 'listings' } }),
  deleteSavedSearch: (id: string) => api<null>(`/api/search/saved/${id}`, { method: 'DELETE' }),
};
