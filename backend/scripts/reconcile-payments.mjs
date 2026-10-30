import { createHash } from 'node:crypto'
import { loadEnvironment } from '../dist/config/env.js'
import { loadSslcommerzOptions } from '../dist/config/payments.js'
import { openDatabase } from '../dist/config/database.js'
import { createSslcommerzAdapter } from '../dist/providers/sslcommerz/sslcommerz.client.js'
import { paymentVerificationService } from '../dist/modules/payments/payment-verification.service.js'
import { paymentProcessingService } from '../dist/modules/payments/payment-processing.service.js'
import {
  paymentReconciliationService,
  paymentReconciliationOptions,
} from '../dist/modules/payments/payment-reconciliation.service.js'
import { verifiedFundingOrderAccess } from '../dist/modules/orders/order.service.js'
import { verifiedAllocationService } from '../dist/modules/checkout/verified-allocation.service.js'
import { paymentReconciliationJob } from '../dist/jobs/reconcile-payments.job.js'
let connection
try {
  const config = loadEnvironment(process.env)
  if (
    !['local', 'test'].includes(config.APP_ENV) ||
    process.env.PAYMENT_RECONCILIATION_ENABLED !== 'true'
  )
    throw new Error('Explicit local/test activation required')
  const integer = (key) =>
    /^[1-9]\d*$/.test(process.env[key] ?? '') ? Number(process.env[key]) : NaN
  const options = paymentReconciliationOptions.parse({
    batchSize: integer('PAYMENT_RECONCILIATION_BATCH_SIZE'),
    leaseMs: integer('PAYMENT_RECONCILIATION_LEASE_MS'),
    pollIntervalMs: integer('PAYMENT_RECONCILIATION_POLL_MS'),
    terminalPollIntervalMs: integer('PAYMENT_RECONCILIATION_TERMINAL_POLL_MS'),
    escalateAfterMs: integer('PAYMENT_RECONCILIATION_ESCALATE_AFTER_MS'),
  })
  const settings = loadSslcommerzOptions(process.env)
  if (!settings) throw new Error('Verified adapter configuration required')
  const merchant = createHash('sha256')
    .update(`${settings.mode}\0${settings.storeId}`)
    .digest('hex')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  const processor = paymentProcessingService(
    connection,
    paymentVerificationService(connection, createSslcommerzAdapter(settings), merchant),
    verifiedFundingOrderAccess(connection),
    verifiedAllocationService(connection),
  )
  const domain = paymentReconciliationService(connection, processor, merchant, options)
  console.log(
    JSON.stringify({
      action: 'payment_reconciliation',
      ...(await paymentReconciliationJob(connection, domain, options).run()),
    }),
  )
} catch {
  console.error('Payment reconciliation failed; inspect protected readiness and job health.')
  process.exitCode = 1
} finally {
  await connection?.close()
}
