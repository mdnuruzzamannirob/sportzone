import { z } from 'zod'
import { refundApproval } from '../modules/refunds/refund-reservation.schema.js'
import { ConfigurationError } from '../shared/errors/configuration-error.js'
import { readProtectedFile } from '../shared/protected-file.js'
import { loadDeliveryDeadlinePolicy } from './delivery.js'
const id = z.string().regex(/^[a-f0-9]{24}$/)
const authorization = z.strictObject({
  orderId: id,
  requestId: id,
  approval: refundApproval,
  evidenceRef: z.string().trim().min(1).max(2000),
  approvedBy: z.string().trim().min(1).max(120),
  approvedAt: z.iso.datetime({ offset: true }),
})
const manifest = z.strictObject({
  version: z.literal(1),
  authorizations: z.array(authorization).max(1000),
})
export async function loadOrderOperationsOptions(env: NodeJS.ProcessEnv) {
  if (env.ORDER_OPERATIONS_ENABLED === undefined || env.ORDER_OPERATIONS_ENABLED === 'false')
    return undefined
  try {
    if (
      env.ORDER_OPERATIONS_ENABLED !== 'true' ||
      !['local', 'test'].includes(env.APP_ENV ?? '') ||
      env.CUSTOMER_AUTH_ENABLED !== 'true' ||
      env.ADMIN_AUTH_ENABLED !== 'true' ||
      env.CUSTOMER_ORDER_READ_ENABLED !== 'true'
    )
      throw new Error()
    const deadline = await loadDeliveryDeadlinePolicy(env)
    if (!deadline) throw new Error()
    const cashReceiptFile = env.COD_COLLECTION_EVIDENCE_FILE ?? ''
    const policyFile = env.CANCELLATION_REFUND_AUTHORIZATIONS_FILE ?? ''
    await readProtectedFile(cashReceiptFile, 1000000)
    const rows = manifest.parse(
      JSON.parse((await readProtectedFile(policyFile, 1000000)).toString('utf8')),
    ).authorizations
    if (
      rows.some((row) => Date.parse(row.approvedAt) > Date.now()) ||
      new Set(rows.map((row) => `${row.orderId}:${row.requestId}`)).size !== rows.length
    )
      throw new Error()
    return { deadline, cashReceiptFile, cancellationAuthorizations: rows }
  } catch {
    throw new ConfigurationError(['order_operations_authority'])
  }
}
export type OrderOperationsOptions = NonNullable<
  Awaited<ReturnType<typeof loadOrderOperationsOptions>>
>
