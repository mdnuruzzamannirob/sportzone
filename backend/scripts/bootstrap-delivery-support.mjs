import { openDatabase } from '../dist/config/database.js'
import { loadEnvironment } from '../dist/config/env.js'
import { createNotificationService } from '../dist/modules/notifications/notification.service.js'
import { initializeDeliveryExceptionPersistence } from '../dist/modules/orders/delivery-exception.persistence.js'
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
  await initializeDeliveryExceptionPersistence(connection)
  if (process.argv.includes('--complaints')) await upgradeComplaintPersistence(connection)
  else await initializeComplaintPersistence(connection)
  await createNotificationService(connection).migrateFoundation()
  console.log(
    'Delivery/support persistence ready; no closure, refund, restock or email activation enabled.',
  )
} catch {
  console.error(
    'Delivery/support bootstrap failed; verify protected configuration and reviewed persistence.',
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
