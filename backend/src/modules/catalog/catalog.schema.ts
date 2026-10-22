import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
// Existing aggregate inputs remain numeric; HTTP price filters are separately parsed strings.
export const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => [...value].length <= max)
export const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const slug = z
  .string()
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const queryMoney = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .transform(Number)
  .pipe(z.int().nonnegative())
export const productQuery = paginationSchema
  .safeExtend({
    q: z
      .string()
      .trim()
      .min(1)
      .refine((value) => {
        const terms = value.match(/[\p{L}\p{M}\p{N}]+/gu) ?? []
        return (
          [...value].length <= 120 &&
          terms.length > 0 &&
          terms.length <= 10 &&
          ![...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
        )
      })
      .transform((value) =>
        (value.match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).map((term) => `"${term}"`).join(' '),
      )
      .optional(),
    category: slug.optional(),
    minPricePoisha: queryMoney.optional(),
    maxPricePoisha: queryMoney.optional(),
    inStock: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
  })
  .refine(
    (value) =>
      value.minPricePoisha === undefined ||
      value.maxPricePoisha === undefined ||
      value.minPricePoisha <= value.maxPricePoisha,
  )
export const categoryQuery = paginationSchema.safeExtend({
  parent: slug.optional(),
})
export const categorySlug = z.strictObject({ slug })
export const publicImage = z.strictObject({
  url: z.url(),
  alt: z
    .string()
    .min(1)
    .refine((value) => [...value].length <= 120),
})
export const categoryCard = z.strictObject({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  parentId: z.string().optional(),
  image: publicImage.optional(),
})
export const productCard = z.strictObject({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  regularPricePoisha: z.int().nonnegative(),
  effectivePricePoisha: z.int().nonnegative(),
  availability: z.enum(['available', 'unavailable']),
  thumbnail: publicImage.optional(),
  rating: z
    .strictObject({
      average: z.number().min(1).max(5),
      count: z.int().positive(),
    })
    .optional(),
})
