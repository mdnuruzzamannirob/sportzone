import { cache } from 'react'
import type { z } from 'zod'
import { catalogOrigin } from './catalog.seo'
import {
  catalogFilters,
  catalogSlug,
  productPageSchema,
  productResponse,
  categoryResponse,
} from './catalog.schema'
export type CatalogResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not-found' }
  | { kind: 'unavailable' }
// This .server module is excluded from browser graphs by executable source-boundary checks.
// Requests are public, credential-free reads; never accept caller headers, cookies or private paths.
export function createCatalogReader(
  origin: string | undefined,
  transport: typeof fetch = (...args) => fetch(...args),
) {
  const base = catalogOrigin(origin)
  async function get<T>(path: string, schema: z.ZodType<T>): Promise<CatalogResult<T>> {
    if (!base) return { kind: 'unavailable' }
    try {
      const response = await transport(`${base}/api/v1${path}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      })
      if (response.status === 404) return { kind: 'not-found' }
      if (!response.ok) return { kind: 'unavailable' }
      const parsed = schema.safeParse(await response.json())
      return parsed.success ? { kind: 'ok', value: parsed.data } : { kind: 'unavailable' }
    } catch {
      return { kind: 'unavailable' }
    }
  }
  // React cache deduplicates only within one server render; it is not a shared data cache.
  const read = cache(get)
  return {
    products(query: unknown = {}) {
      const parsed = catalogFilters.safeParse(query)
      if (!parsed.success) return Promise.resolve({ kind: 'unavailable' } as const)
      const parameters = new URLSearchParams()
      for (const [key, value] of Object.entries(parsed.data))
        if (value !== undefined) parameters.set(key, value)
      const suffix = parameters.size ? `?${parameters.toString()}` : ''
      return read(`/products${suffix}`, productPageSchema)
    },
    product(slug: string) {
      if (!catalogSlug.safeParse(slug).success)
        return Promise.resolve({ kind: 'not-found' } as const)
      return read(`/products/${slug}`, productResponse)
    },
    category(slug: string) {
      if (!catalogSlug.safeParse(slug).success)
        return Promise.resolve({ kind: 'not-found' } as const)
      return read(`/categories/${slug}`, categoryResponse)
    },
  }
}
export const catalog = createCatalogReader(process.env.API_PUBLIC_ORIGIN)
