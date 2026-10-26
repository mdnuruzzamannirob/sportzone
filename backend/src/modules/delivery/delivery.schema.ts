import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
const text = (max: number) => z.string().trim().min(1).max(max)
export const deliveryId = z.string().regex(/^[a-f0-9]{24}$/)
export const deliveryInteger = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const coverageKey = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*:(?:[a-z0-9]+(?:-[a-z0-9]+)*|\*)$/)
      .max(129)
      .refine((v) => v.split(':').every((part) => part.length <= 64)),
  )
const date = z.iso.datetime({ offset: true })
const status = z.enum(['active', 'inactive'])
export const zoneInput = z.strictObject({
  name: text(120),
  description: text(2000).optional(),
  status,
})
export const zonePatch = zoneInput.partial().refine((v) => Object.keys(v).length > 0)
export const zoneView = zoneInput.extend({
  id: deliveryId,
  revision: deliveryInteger,
  coverageRevision: deliveryInteger,
})
export const zoneParams = z.strictObject({ zoneId: deliveryId })
export const chargeParams = z.strictObject({ chargeId: deliveryId })
export const zoneQuery = paginationSchema
export const chargeQuery = paginationSchema.safeExtend({
  zoneId: deliveryId.optional(),
  status: z.enum(['scheduled', 'active', 'inactive']).optional(),
})
export const chargeInput = z
  .strictObject({
    zoneId: deliveryId,
    coverageKey,
    amountPoisha: deliveryInteger,
    effectiveFrom: date,
    effectiveTo: date.optional(),
  })
  .refine((v) => !v.effectiveTo || Date.parse(v.effectiveTo) > Date.parse(v.effectiveFrom))
export const chargeView = z.strictObject({
  id: deliveryId,
  zoneId: deliveryId,
  coverageKey,
  amountPoisha: deliveryInteger,
  ruleVersion: deliveryInteger,
  status: z.enum(['scheduled', 'active', 'inactive']),
  effectiveFrom: date,
  effectiveTo: date.optional(),
  revision: deliveryInteger,
  supersedesChargeId: deliveryId.optional(),
})
const reason = text(2000)
export const chargeActivate = z.strictObject({ reason, effectiveAt: date.optional() })
export const chargeDeactivate = z.strictObject({ effectiveAt: date, reason })
export const chargeSupersede = z
  .strictObject({ replacement: chargeInput, effectiveAt: date, reason })
  .refine((v) => Date.parse(v.effectiveAt) === Date.parse(v.replacement.effectiveFrom))
export const chargeReplacement = z.strictObject({ previous: chargeView, replacement: chargeView })
export const deliveryOperationKey = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/)
