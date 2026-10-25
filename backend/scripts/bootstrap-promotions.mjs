import { initializeAuditPersistence } from '../dist/modules/audit/audit.persistence.js'
import { loadEnvironment } from '../dist/config/env.js'
import { openDatabase } from '../dist/config/database.js'
import { initializeCouponPersistence } from '../dist/modules/promotions/coupon.persistence.js'

// Additive empty local/test setup only. Runtime never creates or repairs financial collections.
let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await initializeCouponPersistence(connection)
  await initializeAuditPersistence(connection)
  console.log('Coupon persistence ready.')
} catch {
  console.error('Coupon bootstrap failed; verify protected configuration and reviewed persistence.')
  process.exitCode = 1
} finally {
  await connection?.close()
}
