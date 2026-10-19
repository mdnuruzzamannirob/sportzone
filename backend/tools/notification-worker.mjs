import { loadEnvironment } from '../dist/config/environment.js'
import { openDatabase } from '../dist/db/connection.js'
import { createRegistrationNotifications } from '../dist/modules/notifications/registration.js'
import {
  createNotificationWorker,
  loadNotificationWorker,
} from '../dist/modules/notifications/worker.js'

let connection
try {
  const config = loadEnvironment(process.env)
  const { adapter, settings } = loadNotificationWorker(process.env)
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  const store = createRegistrationNotifications(connection)
  await store.verifyIndexes()
  const result = await createNotificationWorker(
    store,
    adapter,
    settings,
  ).runBatch()
  console.log(
    JSON.stringify({
      event: 'notification_batch',
      processed: result.processed,
    }),
  )
} catch {
  console.error(
    'Notification worker failed; inspect protected configuration and durable status.',
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
