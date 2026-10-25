import { z } from 'zod'
export const catalogSlug = z
  .string()
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const id = z.string().regex(/^[a-f0-9]{24}$/)
const money = z.number().int().nonnegative()
const image = z.strictObject({
  url: z.url().refine((value) => {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
  }),
  alt: z.string().min(1),
})
export const categorySchema = z.strictObject({
  id,
  name: z.string().min(1),
  slug: catalogSlug,
  parentId: id.optional(),
  image: image.optional(),
})
export const cardSchema = z.strictObject({
  id,
  slug: catalogSlug,
  name: z.string().min(1),
  thumbnail: image.optional(),
  regularPricePoisha: money,
  effectivePricePoisha: money,
  availability: z.enum(['available', 'unavailable']),
  rating: z
    .strictObject({ average: z.number().min(1).max(5), count: z.number().int().positive() })
    .optional(),
})
export const productSchema = cardSchema.safeExtend({
  description: z.string().min(1),
  categories: z.array(categorySchema).min(1).max(30),
  images: z.array(image).max(12),
  variants: z
    .array(
      z.strictObject({
        id,
        sku: z.string().min(1),
        attributes: z.record(z.string(), z.string()),
        regularPricePoisha: money,
        effectivePricePoisha: money,
        availableQty: money,
      }),
    )
    .min(1)
    .max(100),
  relatedProducts: z.array(cardSchema).max(6),
})
const meta = z.strictObject({
  requestId: z.string().min(1),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100),
  totalItems: money,
  totalPages: money,
})
export const productPageSchema = z.strictObject({ data: z.array(cardSchema).max(100), meta })
export const categoryResponse = z.strictObject({
  data: categorySchema,
  meta: z.strictObject({ requestId: z.string().min(1) }),
})
export const productResponse = z.strictObject({
  data: productSchema,
  meta: z.strictObject({ requestId: z.string().min(1) }),
})
const integer = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .refine((value) => Number.isSafeInteger(Number(value)))
export const catalogFilters = z
  .strictObject({
    q: z
      .string()
      .trim()
      .min(1)
      .refine((value) => [...value].length <= 120)
      .optional(),
    category: catalogSlug.optional(),
    minPricePoisha: integer.optional(),
    maxPricePoisha: integer.optional(),
    inStock: z.enum(['true', 'false']).optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc']).optional(),
    page: integer.refine((value) => Number(value) > 0).optional(),
    pageSize: integer.refine((value) => Number(value) > 0 && Number(value) <= 100).optional(),
  })
  .refine(
    (value) =>
      value.minPricePoisha === undefined ||
      value.maxPricePoisha === undefined ||
      Number(value.minPricePoisha) <= Number(value.maxPricePoisha),
  )
export type Product = z.infer<typeof productSchema>
export type Card = z.infer<typeof cardSchema>
