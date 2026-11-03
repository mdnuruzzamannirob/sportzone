import { openDatabase } from '../dist/config/database.js'
import { loadEnvironment } from '../dist/config/env.js'
import { initializeOrderPersistence } from '../dist/modules/orders/order.persistence.js'
import { initializePaymentRecordPersistence } from '../dist/modules/payments/collections/payment-record.persistence.js'
import { initializeRefundAttemptPersistence } from '../dist/modules/refunds/payouts/refund-attempt.persistence.js'
import { initializeCorrectionPersistence } from '../dist/modules/refunds/refund.persistence.js'
import {
  initializeComplaintPersistence,
  upgradeComplaintPersistence,
} from '../dist/modules/support/support.persistence.js'

let connection
try {
  const args = process.argv.slice(2)
  if (args.length > 1 || args.some((arg) => arg !== '--complaints'))
    throw new Error('Invalid bootstrap arguments')
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  // Existing identity/catalog/settings/returns/audit and notification bootstraps remain prerequisites.
  await initializeOrderPersistence(connection)
  await initializePaymentRecordPersistence(connection)
  await initializeCorrectionPersistence(connection)
  await initializeRefundAttemptPersistence(connection)
  if (process.argv.includes('--complaints')) await upgradeComplaintPersistence(connection)
  await initializeComplaintPersistence(connection)
  console.log(
    'Operations persistence/indexes ready; no routes, closure, payout or email activated.',
  )
} catch {
  console.error(
    'Operations bootstrap failed; verify protected configuration and reviewed predecessor persistence.',
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
