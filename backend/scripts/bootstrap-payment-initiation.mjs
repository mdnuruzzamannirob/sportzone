import { openDatabase } from '../dist/config/database.js'
import { loadEnvironment } from '../dist/config/env.js'
import { initializeAuditPersistence } from '../dist/modules/audit/audit.persistence.js'
import { migrateIdentityPostalCode } from '../dist/modules/auth/identity.persistence.js'
import { createNotificationService } from '../dist/modules/notifications/notification.service.js'
import { migrateOrderPostalCode } from '../dist/modules/orders/order.persistence.js'
import { initializePaymentInitiationPersistence } from '../dist/modules/payments/attempts/payment-initiation.persistence.js'
import { initializePaymentRecordPersistence } from '../dist/modules/payments/collections/payment-record.persistence.js'
import { initializeCorrectionPersistence } from '../dist/modules/refunds/refund.persistence.js'
import { initializeJobLeases } from '../dist/shared/jobs/job-lease.model.js'

let connection
let stage = 'configuration'
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  stage = 'database'
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  stage = 'identity'
  await migrateIdentityPostalCode(connection)
  stage = 'orders'
  await migrateOrderPostalCode(connection)
  stage = 'payment-records'
  await initializePaymentRecordPersistence(connection)
  stage = 'refunds'
  await initializeCorrectionPersistence(connection)
  stage = 'initiation'
  await initializePaymentInitiationPersistence(connection)
  stage = 'audit'
  await initializeAuditPersistence(connection)
  stage = 'leases'
  await initializeJobLeases(connection)
  stage = 'notifications'
  await createNotificationService(connection).migrateFoundation()
  console.log('Payment initiation persistence ready; no HTTP/provider activation enabled.')
} catch {
  console.error(
    `Payment initiation bootstrap failed at ${stage}; inspect protected configuration and persistence.`,
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
