import { openDatabase } from '../dist/config/database.js'
import { loadEnvironment } from '../dist/config/env.js'
import { createNotificationService } from '../dist/modules/notifications/notification.service.js'
import { initializeRefundAttemptPersistence } from '../dist/modules/refunds/payouts/refund-attempt.persistence.js'
import { migrateRefundPersistence } from '../dist/modules/refunds/refund.persistence.js'
import { initializeJobLeases } from '../dist/shared/jobs/job-lease.model.js'

let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await migrateRefundPersistence(connection)
  await initializeRefundAttemptPersistence(connection)
  await createNotificationService(connection).migrateFoundation()
  await initializeJobLeases(connection)
  console.log('Refund obligation/attempt persistence ready; no payout dispatcher enabled.')
} catch {
  console.error('Refund bootstrap failed; verify protected configuration and reviewed persistence.')
  process.exitCode = 1
} finally {
  await connection?.close()
}
