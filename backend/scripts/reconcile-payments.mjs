import { createHash } from 'node:crypto'
import { openDatabase } from '../dist/config/database.js'
import { loadEnvironment } from '../dist/config/env.js'
import { loadSslcommerzOptions } from '../dist/config/payments.js'
import { paymentReconciliationJob } from '../dist/jobs/reconcile-payments.job.js'
import { verifiedFundingOrderAccess } from '../dist/modules/orders/order.service.js'
import { createVerifiedAllocationService } from '../dist/modules/orders/order-allocation.service.js'
import { createPaymentProcessingService } from '../dist/modules/payments/collections/payment-processing.service.js'
import {
  createPaymentReconciliationService,
  paymentReconciliationOptions,
} from '../dist/modules/payments/collections/payment-reconciliation.service.js'
import { createPaymentVerificationService } from '../dist/modules/payments/collections/payment-verification.service.js'
import { createSslcommerzAdapter } from '../dist/providers/sslcommerz/sslcommerz.client.js'
import {
  composeAllocationDependencies,
  composeAuditAccess,
  composePaymentOutcomeDependencies,
  composePaymentReconciliationDependencies,
} from '../dist/setup.js'
import { positiveInteger } from './lib/environment.mjs'

let connection
try {
  const config = loadEnvironment(process.env)
  if (
    !['local', 'test'].includes(config.APP_ENV) ||
    process.env.PAYMENT_RECONCILIATION_ENABLED !== 'true'
  )
    throw new Error('Explicit local/test activation required')

  const options = paymentReconciliationOptions.parse({
    batchSize: positiveInteger(process.env, 'PAYMENT_RECONCILIATION_BATCH_SIZE'),
    leaseMs: positiveInteger(process.env, 'PAYMENT_RECONCILIATION_LEASE_MS'),
    pollIntervalMs: positiveInteger(process.env, 'PAYMENT_RECONCILIATION_POLL_MS'),
    terminalPollIntervalMs: positiveInteger(process.env, 'PAYMENT_RECONCILIATION_TERMINAL_POLL_MS'),
    escalateAfterMs: positiveInteger(process.env, 'PAYMENT_RECONCILIATION_ESCALATE_AFTER_MS'),
  })
  const settings = loadSslcommerzOptions(process.env)
  if (!settings) throw new Error('Verified adapter configuration required')
  const merchant = createHash('sha256')
    .update(`${settings.mode}\0${settings.storeId}`)
    .digest('hex')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  const processor = createPaymentProcessingService(
    connection,
    createPaymentVerificationService(connection, createSslcommerzAdapter(settings), merchant),
    verifiedFundingOrderAccess(connection),
    createVerifiedAllocationService(
      composeAuditAccess(connection),
      composeAllocationDependencies(connection),
    ),
    composeAuditAccess(connection),
    composePaymentOutcomeDependencies(connection),
  )
  const domain = createPaymentReconciliationService(
    connection,
    processor,
    merchant,
    options,
    composeAuditAccess(connection),
    composePaymentReconciliationDependencies(connection),
  )
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
