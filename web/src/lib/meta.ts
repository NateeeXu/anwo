import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { Plan } from '@shared/types'
import { api } from './api'
import { queryClient } from './query'

export interface Meta {
  enums: Record<string, string[]>
  amenities: { key: string; icon: string }[]
  categories: { key: string; icon: string }[]
  buddyTypes: { key: string; icon: string }[]
  flags: Record<string, boolean | unknown>
  limits: { uploadMaxBytes: number; pageSizeMax: number; listingQuotaFree: number }
  plans: Plan[]
  brand: { name: string; nameZh: string }
  version: string
}

export const META_QUERY_KEY = ['meta'] as const

export function fetchMeta(): Promise<Meta> {
  return api<Meta>('/api/meta')
}

/** `const { data: meta, isLoading } = useMeta()` — GET /api/meta, cached 5 min. */
export function useMeta(): UseQueryResult<Meta> {
  return useQuery({ queryKey: META_QUERY_KEY, queryFn: fetchMeta, staleTime: 5 * 60_000, gcTime: 30 * 60_000 })
}

/** Feature flag helper: `useFlag('escrow.enabled')`. */
export function useFlag(key: string, fallback = false): boolean {
  const { data } = useMeta()
  const v = data?.flags?.[key]
  return typeof v === 'boolean' ? v : fallback
}

/** Called on the `system.flags` ws event. */
export function invalidateMeta(): void {
  void queryClient.invalidateQueries({ queryKey: META_QUERY_KEY })
}
