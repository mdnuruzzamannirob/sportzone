import { loadEnvironment } from '../dist/config/env.js'
import { openDatabase } from '../dist/config/database.js'
import { initializeDeliveryExceptionPersistence } from '../dist/modules/orders/delivery-exception.persistence.js'
import { initializeComplaintPersistence } from '../dist/modules/support/complaint.persistence.js'
import { createRegistrationNotifications } from '../dist/modules/notifications/notification.service.js'
let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await initializeDeliveryExceptionPersistence(connection)
  await initializeComplaintPersistence(connection)
  await createRegistrationNotifications(connection).migrateFoundation()
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
