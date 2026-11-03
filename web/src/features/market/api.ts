// React Query hooks + API calls for the market module. Query keys are prefixed ['market', …].
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type { Bundle, Item, ItemCard, Paginated, PriceSuggestion, Report, ScopeInfo, UserPublic } from '@shared/types';
import type { ItemInput, ItemPatch, BundleInput, BundlePatch, MarkSoldInput, ContactInput } from '@shared/schemas/market';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/query';

export type ItemListParams = {
  campusId?: string;
  scope?: 'campus' | 'nationwide';
  q?: string;
  category?: string[];
  condition?: string[];
  priceMin?: number;
  priceMax?: number;
  free?: boolean;
  obo?: boolean;
  delivery?: 'pickup' | 'delivery';
  status?: 'active' | 'reserved' | 'sold' | 'all';
  sellerId?: string;
  bundleId?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
  bbox?: string;
};
export type ItemList = Paginated<ItemCard> & { scope: ScopeInfo };
export type ItemPin = { id: string; lat: number; lng: number; priceCents: number; isFree: boolean; obo: boolean; title: string; status: string; boostTier?: 'basic' | 'plus' | 'max'; wishlisted?: boolean };
export type PinList = { pins: ItemPin[]; total: number; scope: ScopeInfo };
export type WishlistItem = ItemCard & { priceAtAddCents: number | null; priceDropCents: number | null; wishedAt: string };
export type MineList = Paginated<Item> & { counts: Partial<Record<string, number>> };
export type BuyerCandidate = UserPublic & { conversationId: string; aboutThisItem: boolean };
export type CategoryCount = { key: string; icon: string; count: number };
export type AdminItem = Item & { moderationStatus: 'ok' | 'flagged' | 'hidden'; openReports: number };
export type AdminStats = { active: number; sold30d: number; flagged: number; hidden: number; bundles: number; openReports: number };

export const marketKeys = {
  all: ['market'] as const,
  items: (p: ItemListParams) => ['market', 'items', p] as const,
  pins: (p: ItemListParams) => ['market', 'pins', p] as const,
  item: (id: string) => ['market', 'item', id] as const,
  categories: (campusId?: string | null) => ['market', 'categories', campusId ?? 'none'] as const,
  suggestion: (category: string, condition: string, campusId?: string | null, title?: string) => ['market', 'suggestion', category, condition, campusId ?? 'none', title ?? ''] as const,
  wishlist: (page: number) => ['market', 'wishlist', page] as const,
  mine: (status: string, page: number) => ['market', 'mine', status, page] as const,
  bundle: (id: string) => ['market', 'bundle', id] as const,
  bundles: (p: Record<string, unknown>) => ['market', 'bundles', p] as const,
  buyers: (id: string) => ['market', 'buyers', id] as const,
  admin: (p: Record<string, unknown>) => ['market', 'admin', p] as const,
};

export function invalidateMarket() {
  void queryClient.invalidateQueries({ queryKey: marketKeys.all });
}

// ---------------------------------------------------------------- queries
export function useItems(params: ItemListParams, enabled = true) {
  return useQuery({ queryKey: marketKeys.items(params), queryFn: () => api<ItemList>('/api/market/items', { query: params }), enabled, placeholderData: (prev) => prev });
}
export function useItemPins(params: ItemListParams, enabled = true) {
  return useQuery({ queryKey: marketKeys.pins(params), queryFn: () => api<PinList>('/api/market/items', { query: { ...params, view: 'pins', page: undefined, pageSize: undefined } }), enabled, placeholderData: (prev) => prev });
}
export function useItem(id: string | undefined, opts: Partial<UseQueryOptions<Item>> = {}) {
  return useQuery<Item>({ queryKey: marketKeys.item(id ?? ''), queryFn: () => api<Item>(`/api/market/items/${id}`), enabled: !!id, ...opts });
}
export function useCategories(campusId?: string | null) {
  return useQuery({ queryKey: marketKeys.categories(campusId), queryFn: () => api<{ campusId: string | null; categories: CategoryCount[] }>('/api/market/categories', { query: { campusId: campusId ?? undefined } }), staleTime: 60_000 });
}
export function usePriceSuggestion(category: string | null, condition: string, campusId?: string | null, enabled = true, title?: string) {
  return useQuery({
    queryKey: marketKeys.suggestion(category ?? '', condition, campusId, title),
    queryFn: () => api<PriceSuggestion>('/api/market/price-suggestion', { query: { category: category ?? undefined, condition, campusId: campusId ?? undefined, title: title || undefined } }),
    enabled: enabled && !!category,
    staleTime: 60_000,
  });
}
export function useWishlist(page = 1) {
  return useQuery({ queryKey: marketKeys.wishlist(page), queryFn: () => api<Paginated<WishlistItem>>('/api/market/wishlist', { query: { page, pageSize: 24 } }) });
}
export function useMyItems(status = 'all', page = 1) {
  return useQuery({ queryKey: marketKeys.mine(status, page), queryFn: () => api<MineList>('/api/market/items/mine', { query: { status, page, pageSize: 50 } }) });
}
export function useBundle(id: string | undefined) {
  return useQuery({ queryKey: marketKeys.bundle(id ?? ''), queryFn: () => api<Bundle>(`/api/market/bundles/${id}`), enabled: !!id });
}
export function useBundles(params: { campusId?: string; scope?: string; sellerId?: string; status?: string }, enabled = true) {
  return useQuery({ queryKey: marketKeys.bundles(params), queryFn: () => api<Paginated<Bundle> & { scope: ScopeInfo }>('/api/market/bundles', { query: { ...params, pageSize: 20 } }), enabled });
}
export function useBuyerCandidates(itemId: string | undefined) {
  return useQuery({ queryKey: marketKeys.buyers(itemId ?? ''), queryFn: () => api<BuyerCandidate[]>(`/api/market/items/${itemId}/buyers`), enabled: !!itemId });
}
export function useAdminItems(params: Record<string, unknown>) {
  return useQuery({ queryKey: marketKeys.admin(params), queryFn: () => api<Paginated<AdminItem> & { stats: AdminStats }>('/api/market/admin/items', { query: params as Record<string, string | number | undefined> }), placeholderData: (prev) => prev });
}

// ---------------------------------------------------------------- mutations
export function useWishlistToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api<{ wishlisted: boolean; wishlistCount: number }>(`/api/market/items/${id}/wishlist`, { method: on ? 'POST' : 'DELETE' }),
    onSuccess: (data, vars) => {
      qc.setQueryData<Item>(marketKeys.item(vars.id), (old) => (old ? { ...old, wishlisted: data.wishlisted, wishlistCount: data.wishlistCount } : old));
      // patch every cached list card in place so the heart flips without a refetch
      qc.setQueriesData<ItemList>({ queryKey: ['market', 'items'] }, (old) => (old ? { ...old, items: old.items.map((c) => (c.id === vars.id ? { ...c, wishlisted: data.wishlisted, wishlistCount: data.wishlistCount } : c)) } : old));
      void qc.invalidateQueries({ queryKey: ['market', 'wishlist'] });
    },
  });
}
export function useContactSeller() {
  return useMutation({ mutationFn: ({ id, body }: { id: string; body: ContactInput }) => api<{ conversationId: string; created: boolean }>(`/api/market/items/${id}/contact`, { method: 'POST', body }) });
}
export function useReportItem() {
  return useMutation({ mutationFn: ({ id, reason, details }: { id: string; reason: string; details?: string }) => api<Report>(`/api/market/items/${id}/report`, { method: 'POST', body: { reason, details: details || undefined } }) });
}
export function useCreateItem() {
  return useMutation({ mutationFn: (body: ItemInput) => api<Item>('/api/market/items', { method: 'POST', body }), onSuccess: invalidateMarket });
}
export function useUpdateItem() {
  return useMutation({ mutationFn: ({ id, body }: { id: string; body: ItemPatch }) => api<Item>(`/api/market/items/${id}`, { method: 'PATCH', body }), onSuccess: invalidateMarket });
}
export type ItemAction = 'publish' | 'reserve' | 'unreserve' | 'renew';
export function useItemAction() {
  return useMutation({ mutationFn: ({ id, action }: { id: string; action: ItemAction }) => api<Item>(`/api/market/items/${id}/${action}`, { method: 'POST' }), onSuccess: invalidateMarket });
}
export function useMarkSold() {
  return useMutation({ mutationFn: ({ id, body }: { id: string; body: MarkSoldInput }) => api<Item>(`/api/market/items/${id}/sold`, { method: 'POST', body }), onSuccess: invalidateMarket });
}
export function useDeleteItem() {
  return useMutation({ mutationFn: (id: string) => api<null>(`/api/market/items/${id}`, { method: 'DELETE' }), onSuccess: invalidateMarket });
}
export function useCreateBundle() {
  return useMutation({ mutationFn: (body: BundleInput) => api<Bundle>('/api/market/bundles', { method: 'POST', body }), onSuccess: invalidateMarket });
}
export function useUpdateBundle() {
  return useMutation({ mutationFn: ({ id, body }: { id: string; body: BundlePatch }) => api<Bundle>(`/api/market/bundles/${id}`, { method: 'PATCH', body }), onSuccess: invalidateMarket });
}
export function useCloseBundle() {
  return useMutation({ mutationFn: (id: string) => api<Bundle>(`/api/market/bundles/${id}/close`, { method: 'POST' }), onSuccess: invalidateMarket });
}
export function useDeleteBundle() {
  return useMutation({ mutationFn: (id: string) => api<null>(`/api/market/bundles/${id}`, { method: 'DELETE' }), onSuccess: invalidateMarket });
}
export function useModerateItem() {
  return useMutation({ mutationFn: ({ id, moderationStatus, reason }: { id: string; moderationStatus: 'ok' | 'flagged' | 'hidden'; reason?: string }) => api<AdminItem>(`/api/market/admin/items/${id}/moderate`, { method: 'POST', body: { moderationStatus, reason } }), onSuccess: invalidateMarket });
}
