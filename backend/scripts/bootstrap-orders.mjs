import { loadEnvironment } from '../dist/config/env.js'
import { openDatabase } from '../dist/config/database.js'
import { initializeOrderPersistence } from '../dist/modules/orders/order.persistence.js'
import { initializeAuditPersistence } from '../dist/modules/audit/audit.persistence.js'
let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await initializeOrderPersistence(connection)
  await initializeAuditPersistence(connection)
  console.log(
    'Order and item-balance persistence ready; no order placement or financial effects enabled.',
  )
} catch {
  console.error('Order bootstrap failed; verify protected configuration and reviewed persistence.')
  process.exitCode = 1
} finally {
  await connection?.close()
}
