import { z } from 'zod'

const id = z.string().regex(/^[a-f0-9]{24}$/)

const customerRefundRequestInput = z
  .strictObject({
    basis: z.enum([
      'physical_return',
      'shortage',
      'cancellation',
      'delivery_exception',
      'payment_correction',
    ]),
    basisRefId: id.optional(),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .refine((value) =>
        [...value].every(
          (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
        ),
      ),
  })
  .refine((input) => (input.basis === 'payment_correction') !== Boolean(input.basisRefId))

const customerRefundRequestResult = z.strictObject({
  requestStatus: z.literal('recorded'),
  refundGroupKey: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
})

export { customerRefundRequestInput, customerRefundRequestResult }
