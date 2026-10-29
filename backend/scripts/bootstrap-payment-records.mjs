import { loadEnvironment } from '../dist/config/env.js'
import { openDatabase } from '../dist/config/database.js'
import { initializePaymentRecordPersistence } from '../dist/modules/payments/payment-record.persistence.js'
import { initializeAuditPersistence } from '../dist/modules/audit/audit.persistence.js'
let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await initializePaymentRecordPersistence(connection)
  await initializeAuditPersistence(connection)
  console.log(
    'Payment record persistence ready; no provider initiation or collection writer enabled.',
  )
} catch {
  console.error(
    'Payment bootstrap failed; inspect protected configuration and reviewed persistence.',
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
