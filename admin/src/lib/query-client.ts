import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api-error'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, error) => count < 1 && error instanceof ApiError && error.status >= 500,
        staleTime: 0,
        gcTime: 0,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false, gcTime: 0 },
    },
  })
}
