import { z } from 'zod'
import { refundApproval } from '../modules/refunds/obligations/refund-reservation.schema.js'
import { ConfigurationError } from '../shared/errors/configuration-error.js'
import { readProtectedFile } from '../shared/protected-file.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)
const refundOperationsOptions = z
  .strictObject({
    policyVersion: z.string().trim().min(1).max(100),
    authorizations: z
      .array(
        z.strictObject({
          orderId: id,
          basis: z.enum([
            'physical_return',
            'shortage',
            'payment_correction',
            'cancellation',
            'delivery_exception',
          ]),
          basisRefId: id.optional(),
          approval: refundApproval,
        }),
      )
      .max(1000),
  })
  .refine((options) => {
    const identities = options.authorizations.map(
      (r) => `${r.orderId}:${r.basis}:${r.basisRefId ?? ''}`,
    )
    return (
      new Set(identities).size === identities.length &&
      options.authorizations.every(
        (r) => (r.basis === 'payment_correction') !== Boolean(r.basisRefId),
      )
    )
  })
type RefundOperationsOptions = z.output<typeof refundOperationsOptions>
async function loadRefundOperationsOptions(
  env: NodeJS.ProcessEnv,
): Promise<RefundOperationsOptions | undefined> {
  if (env.REFUND_OPERATIONS_ENABLED === undefined || env.REFUND_OPERATIONS_ENABLED === 'false')
    return undefined
  try {
    if (
      env.REFUND_OPERATIONS_ENABLED !== 'true' ||
      !['local', 'test'].includes(env.APP_ENV ?? '') ||
      env.ADMIN_AUTH_ENABLED !== 'true'
    )
      throw new Error()
    const options = env.REFUND_POLICY_FILE
      ? refundOperationsOptions.parse(
          JSON.parse((await readProtectedFile(env.REFUND_POLICY_FILE, 1_000_000)).toString('utf8')),
        )
      : { policyVersion: 'sportzone-refunds-v1', authorizations: [] }
    const identities = options.authorizations.map(
      (r) => `${r.orderId}:${r.basis}:${r.basisRefId ?? ''}`,
    )
    if (
      new Set(identities).size !== identities.length ||
      options.authorizations.some(
        (r) => (r.basis === 'payment_correction') === Boolean(r.basisRefId),
      )
    )
      throw new Error()
    return options
  } catch {
    throw new ConfigurationError(['refund_operations_configuration'])
  }
}

export type { RefundOperationsOptions }
export { loadRefundOperationsOptions, refundOperationsOptions }
