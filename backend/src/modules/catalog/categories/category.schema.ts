import { z } from 'zod'
import { paginationSchema } from '../../../shared/pagination.js'
import { Types } from 'mongoose'
import { ApiError } from '../../../shared/errors/app-error.js'

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

const categoryCreate = z.strictObject(fields)

const categoryPatch = z
  .strictObject({
    ...fields,
    parentId: id.nullable().optional(),
    image: media.nullable().optional(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0)

const categoryDeactivate = z.strictObject({ reason: text(2000) })

const categoryParams = z.strictObject({ categoryId: id })

const categoryListQuery = paginationSchema.safeExtend({
  status: fields.status,
})

const adminCategory = z.strictObject({
  id,
  name: fields.name,
  slug,
  parentId: id.optional(),
  status: z.enum(['active', 'inactive']),
  sortOrder: integer,
  revision: integer,
  image: media.optional(),
})

const categoryId = z
  .string()
  .regex(/^[a-f0-9]{24}$/i)
  .transform((value) => new Types.ObjectId(value))

const categoryFields = {
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  parentId: categoryId.nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  sortOrder: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
}

const createInput = z.strictObject(categoryFields)

const patchInput = z.strictObject({
  ...categoryFields,
  name: categoryFields.name.optional(),
  slug: categoryFields.slug.optional(),
})

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new ApiError('VALIDATION_FAILED')
  return result.data
}

export {
  categoryCreate,
  categoryPatch,
  categoryDeactivate,
  categoryParams,
  categoryListQuery,
  adminCategory,
  parse,
  categoryId as id,
  createInput,
  patchInput,
}
