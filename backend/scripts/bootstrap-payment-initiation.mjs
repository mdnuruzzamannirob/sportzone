import { migrateIdentityPostalCode } from '../dist/modules/auth/identity.persistence.js'
import { migrateOrderPostalCode } from '../dist/modules/orders/order.persistence.js'
import { loadEnvironment } from '../dist/config/env.js'
import { openDatabase } from '../dist/config/database.js'
import { initializePaymentRecordPersistence } from '../dist/modules/payments/payment-record.persistence.js'
import { initializePaymentInitiationPersistence } from '../dist/modules/payments/payment-initiation.persistence.js'
import { initializeAuditPersistence } from '../dist/modules/audit/audit.persistence.js'
let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await migrateIdentityPostalCode(connection)
  await migrateOrderPostalCode(connection)
  await initializePaymentRecordPersistence(connection)
  await initializePaymentInitiationPersistence(connection)
  await initializeAuditPersistence(connection)
  console.log('Payment initiation persistence ready; no HTTP/provider activation enabled.')
} catch {
  console.error(
    'Payment initiation bootstrap failed; inspect protected configuration and persistence.',
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
