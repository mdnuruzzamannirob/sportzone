import type { ClientSession } from 'mongoose'
import type { z } from 'zod'
import type { productCard } from './catalog.schema.js'

type ProductCard = z.output<typeof productCard>
interface CatalogSelections {
  cartSelections(
    ids: readonly string[],
    session?: ClientSession,
  ): Promise<
    Map<
      string,
      {
        availableQty: number
        estimatedUnitPoisha: number
        product: ProductCard
      }
    >
  >
  wishlistProducts(
    ids: readonly string[],
    session?: ClientSession,
  ): Promise<Map<string, ProductCard>>
}

type CatalogCheckoutAccess = (
  ids: readonly string[],
  session: ClientSession,
) => Promise<
  Map<
    string,
    {
      readonly sku: string
      readonly attributes: Map<string, string>
      readonly categoryIds: string[]
      readonly product: {
        id: string
        name: string
        slug: string
        regularPricePoisha: number
        effectivePricePoisha: number
        availability: 'available' | 'unavailable'
        thumbnail?: { url: string; alt: string } | undefined
        rating?: { average: number; count: number } | undefined
      }
      readonly availableQty: number
      readonly estimatedUnitPoisha: number
    }
  >
>

type CatalogReportAccess = (
  session: ClientSession,
  threshold: number,
) => Promise<{
  activeProducts: number
  lowStockVariants: number
  lowStockItems: { id: string; productId: string; sku: string; available: number }[]
}>

type ProductReviewAccess = {
  lock(session: ClientSession, id: string): Promise<void>
  saveSummary(
    session: ClientSession,
    id: string,
    value: { count: number; average: number },
  ): Promise<void>
}

export type { ProductCardSchema } from './catalog.schema.js'
export type { AttributesSchema, VariantStockViewSchema } from './products/variant.schema.js'
export type { CatalogCheckoutAccess, CatalogReportAccess, CatalogSelections, ProductReviewAccess }
