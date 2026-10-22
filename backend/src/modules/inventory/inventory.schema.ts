import { z } from 'zod'
import { Types } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import type { StockCounters } from '../catalog/variants/variant.service.js'

export const objectId = z
  .string()
  .regex(/^[a-f0-9]{24}$/i)
  .transform((value) => new Types.ObjectId(value))
const reason = z
  .string()
  .trim()
  .min(1)
  .refine((value) => [...value].length <= 2000)
const operationKey = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (value) =>
      value === value.trim() &&
      [...value].every(
        (character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127,
      ),
  )
export const allocationInput = z.strictObject({
  variantId: objectId,
  orderId: objectId,
  quantity: z.int().min(1).max(50),
  generation: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
  operationKey,
  reason,
})
export const adjustmentInput = z.strictObject({
  variantId: objectId,
  actorId: objectId,
  operationKey,
  deltaPhysical: z
    .number()
    .int()
    .min(-Number.MAX_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER)
    .refine((value) => value !== 0),
  reason,
})
export function stockSnapshot({ physical, reserved, committed }: StockCounters) {
  if (
    ![physical, reserved, committed].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    reserved > physical - committed
  )
    throw new ApiError('STATE_CONFLICT')
  return { physical, reserved, committed, available: physical - reserved - committed }
}
