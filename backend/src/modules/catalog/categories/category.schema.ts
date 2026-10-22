import { Types } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../../shared/errors/app-error.js'

export const id = z
  .string()
  .regex(/^[a-f0-9]{24}$/i)
  .transform((value) => new Types.ObjectId(value))
const fields = {
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  parentId: id.nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  sortOrder: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
}
export const createInput = z.strictObject(fields)
export const patchInput = z.strictObject({
  ...fields,
  name: fields.name.optional(),
  slug: fields.slug.optional(),
})
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new ApiError('VALIDATION_FAILED')
  return result.data
}
