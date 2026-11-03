import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'

/** App-wide React Query client. Server state lives here; Zustand is only for session/ws/ui. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status > 0 && error.status < 500) return false
        return failureCount < 2
      },
    },
    mutations: { retry: 0 },
  },
})
