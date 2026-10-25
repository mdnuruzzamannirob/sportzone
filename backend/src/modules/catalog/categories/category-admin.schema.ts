import { z } from 'zod'
import { paginationSchema } from '../../../shared/pagination.js'
const id = z.string().regex(/^[a-f0-9]{24}$/)
const text = (max: number) => z.string().trim().min(1).max(max)
const slug = text(160)
  .toLowerCase()
  .pipe(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))
const integer = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const media = z.strictObject({
  publicId: z.string().regex(/^sportzone\/[a-f0-9]{24}$/),
  url: z
    .url()
    .max(2000)
    .refine((v) => {
      const u = new URL(v)
      return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash
    }),
  alt: z
    .string()
    .trim()
    .refine((v) => [...v].length <= 120)
    .meta({ maxLength: 120 })
    .optional(),
})
const fields = {
  name: text(200),
  slug,
  parentId: id.optional(),
  status: z.enum(['active', 'inactive']).optional(),
  image: media.optional(),
  sortOrder: integer.optional(),
}
export const categoryCreate = z.strictObject(fields)
export const categoryPatch = z
  .strictObject({
    ...fields,
    parentId: id.nullable().optional(),
    image: media.nullable().optional(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0)
export const categoryDeactivate = z.strictObject({ reason: text(2000) })
export const categoryParams = z.strictObject({ categoryId: id })
export const categoryListQuery = paginationSchema.safeExtend({
  status: fields.status,
})
export const adminCategory = z.strictObject({
  id,
  name: fields.name,
  slug,
  parentId: id.optional(),
  status: z.enum(['active', 'inactive']),
  sortOrder: integer,
  revision: integer,
  image: media.optional(),
})
