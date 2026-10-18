import { z } from 'zod'
import { parseInput } from '../middleware/validation.js'

const positiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.int().min(1))
export const paginationSchema = z
  .strictObject({
    page: positiveInteger.default(1),
    pageSize: positiveInteger.pipe(z.int().max(100)).default(20),
  })
  .refine(({ page, pageSize }) => Number.isSafeInteger((page - 1) * pageSize), {
    path: ['page'],
  })
export function parsePagination(query: unknown) {
  const input = parseInput(paginationSchema, query)
  return { ...input, offset: (input.page - 1) * input.pageSize }
}
export type PageMeta = {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}
export function pageMeta(
  input: { page: number; pageSize: number },
  totalItems: number,
): PageMeta {
  if (
    !Number.isSafeInteger(totalItems) ||
    totalItems < 0 ||
    !Number.isSafeInteger(input.page) ||
    input.page < 1 ||
    !Number.isSafeInteger(input.pageSize) ||
    input.pageSize < 1 ||
    input.pageSize > 100
  )
    throw new RangeError('Invalid pagination metadata')
  return {
    page: input.page,
    pageSize: input.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / input.pageSize),
  }
}
