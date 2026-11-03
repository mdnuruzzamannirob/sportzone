import { createHash } from 'node:crypto'
import { openDatabase } from '../dist/config/database.js'
import { loadEnvironment } from '../dist/config/env.js'
import { loadSslcommerzOptions } from '../dist/config/payments.js'
import {
  refundReconciliationJob,
  refundReconciliationOptions,
} from '../dist/jobs/reconcile-refunds.job.js'
import { protectedRefundEvidence } from '../dist/modules/refunds/payouts/refund-evidence.service.js'
import { createSslcommerzAdapter } from '../dist/providers/sslcommerz/sslcommerz.client.js'
import { composeRefundRecovery } from '../dist/setup.js'
import { positiveInteger } from './lib/environment.mjs'

let connection
try {
  const config = loadEnvironment(process.env)
  if (
    !['local', 'test'].includes(config.APP_ENV) ||
    process.env.REFUND_RECONCILIATION_ENABLED !== 'true'
  )
    throw new Error('Explicit local/test worker activation required')

  const options = refundReconciliationOptions.parse({
    batchSize: positiveInteger(process.env, 'REFUND_RECONCILIATION_BATCH_SIZE'),
    leaseMs: positiveInteger(process.env, 'REFUND_RECONCILIATION_LEASE_MS'),
    pollMs: positiveInteger(process.env, 'REFUND_RECONCILIATION_POLL_MS'),
  })
  const settings = loadSslcommerzOptions(process.env)
  if (!settings) throw new Error('Configured original merchant required')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  // The scheduled domain has a system lease, never an impersonated administrator session.
  const domain = composeRefundRecovery(
    connection,
    {
      owned: async () => {
        throw new Error('HTTP operations unavailable in worker')
      },
    },
    {
      gateway: {
        client: createSslcommerzAdapter(settings),
        merchantAccountKey: createHash('sha256')
          .update(`${settings.mode}\0${settings.storeId}`)
          .digest('hex'),
      },
      ...(process.env.REFUND_PAYOUT_EVIDENCE_FILE
        ? { verifyEvidence: protectedRefundEvidence(process.env.REFUND_PAYOUT_EVIDENCE_FILE) }
        : {}),
    },
  )
  console.log(
    JSON.stringify({
      event: 'refund_reconciliation',
      ...(await refundReconciliationJob(connection, domain, options).run()),
    }),
  )
} catch {
  console.error('Refund reconciliation failed; inspect protected readiness, proof and lease state.')
  process.exitCode = 1
} finally {
  await connection?.close()
}
