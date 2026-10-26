import { z } from 'zod'
const text = (max: number) => z.string().trim().min(1).max(max)
const date = z.iso.datetime({ offset: true })
const days = z.int().min(1).max(3660)
export const deliveryDeadlineRule = z
  .strictObject({
    version: text(100).refine((value) => value !== 'unconfigured'),
    timezone: z.literal('Asia/Dhaka'),
    effectiveFrom: date,
    effectiveTo: date.optional(),
    target: z.strictObject({
      startEvent: z.literal('confirmedAt'),
      calendarDays: days,
    }),
    estimate: z
      .strictObject({
        startEvent: z.enum(['placedAt', 'confirmedAt']),
        calendarDays: days,
      })
      .optional(),
    // Empty means an explicit reviewed determination that no additional cap applies;
    // it must never be inferred from a missing or unreviewed configuration.
    legalCaps: z
      .array(
        z.strictObject({
          ruleRef: text(2000),
          startEvent: z.enum(['placedAt', 'confirmedAt']),
          calendarDays: days,
        }),
      )
      .max(10)
      .refine(
        (values) =>
          new Set(values.map((value) => value.ruleRef)).size === values.length,
      ),
  })
  .refine(
    (value) =>
      !value.effectiveTo ||
      Date.parse(value.effectiveTo) > Date.parse(value.effectiveFrom),
  )
export const deliveryDeadlineReview = z.strictObject({
  evidenceRef: text(2000),
  approvedAt: date,
  approvedBy: text(120),
  ruleDigest: z.string().regex(/^[a-f0-9]{64}$/),
})
export const deliveryDeadlineManifest = z.strictObject({
  rule: deliveryDeadlineRule,
  review: deliveryDeadlineReview,
})
export const deliveryDeadlineBasis = deliveryDeadlineManifest.extend({
  capturedAt: date,
})
export const deliveryDeadlineEvents = z.strictObject({
  placedAt: date.optional(),
  confirmedAt: date.optional(),
})
export const deliveryDeadline = z.strictObject({
  status: z.enum(['awaiting_start', 'calculated', 'under_review']),
  startEvent: z.literal('confirmedAt'),
  ruleVersion: text(100),
  startEventAt: date.optional(),
  targetDeadlineAt: date.optional(),
  legalCapAt: date.optional(),
  effectiveAt: date.optional(),
})
export type DeliveryDeadlineManifest = z.infer<typeof deliveryDeadlineManifest>
export type DeliveryDeadlineBasis = z.infer<typeof deliveryDeadlineBasis>
