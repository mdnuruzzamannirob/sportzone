import { loadEnvironment } from '../dist/config/env.js'
import { openDatabase } from '../dist/config/database.js'
import { initializeDeliveryPersistence } from '../dist/modules/delivery/delivery.persistence.js'
import { initializeAuditPersistence } from '../dist/modules/audit/audit.persistence.js'
let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await initializeDeliveryPersistence(connection)
  await initializeAuditPersistence(connection)
  console.log(
    'Delivery indexes ready; canonical settings bootstrap and operator coverage remain required.',
  )
} catch {
  console.error('Delivery bootstrap failed; verify reviewed configuration and persistence.')
  process.exitCode = 1
} finally {
  await connection?.close()
}
