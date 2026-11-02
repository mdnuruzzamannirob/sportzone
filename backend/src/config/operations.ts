import { z } from 'zod'
import { readProtectedFile } from '../shared/protected-file.js'
import { ConfigurationError } from '../shared/errors/configuration-error.js'
import { ApiError } from '../shared/errors/app-error.js'
import { createHash } from 'node:crypto'
import { exceptionResolution } from '../modules/orders/delivery-exception.schema.js'
import type { DeliveryDispositionVerifier } from '../modules/orders/order.public.js'
type OperationsOptions = {
  verifyDisposition?: DeliveryDispositionVerifier
}
function loadOperationsOptions(env: NodeJS.ProcessEnv): OperationsOptions | undefined {
  if (env.BACKEND_OPERATIONS_ENABLED === undefined || env.BACKEND_OPERATIONS_ENABLED === 'false')
    return undefined
  if (
    env.BACKEND_OPERATIONS_ENABLED !== 'true' ||
    !['local', 'test'].includes(env.APP_ENV ?? '') ||
    env.CUSTOMER_AUTH_ENABLED !== 'true' ||
    env.ADMIN_AUTH_ENABLED !== 'true'
  )
    throw new ConfigurationError(['backend_operations_configuration'])
  const path = env.DELIVERY_DISPOSITION_FILE
  if (!path) return {}
  const verifyDisposition: NonNullable<OperationsOptions['verifyDisposition']> = async (
    _session,
    input,
  ) => {
    const records = z
      .array(
        z.strictObject({
          orderId: z.string().regex(/^[a-f0-9]{24}$/),
          exceptionId: z.string().regex(/^[a-f0-9]{24}$/),
          disposition: exceptionResolution.shape.disposition.unwrap(),
          inspectionRef: z.string().min(1).max(256),
          verifiedAt: z.iso.datetime(),
        }),
      )
      .max(1000)
      .parse(JSON.parse((await readProtectedFile(path, 1000000)).toString('utf8')))
    const matches = records.filter(
      (row) => row.orderId === input.orderId && row.exceptionId === input.exceptionId,
    )
    const record = matches[0]
    if (
      matches.length !== 1 ||
      !record ||
      Date.parse(record.verifiedAt) > Date.now() ||
      Date.parse(record.verifiedAt) < input.shippedAt.getTime() ||
      JSON.stringify(record.disposition) !== JSON.stringify(input.disposition)
    )
      throw new ApiError('BUSINESS_RULE_VIOLATION')
    return createHash('sha256').update(JSON.stringify(record)).digest('hex')
  }
  return { verifyDisposition }
}

export { loadOperationsOptions }
export type { OperationsOptions }
