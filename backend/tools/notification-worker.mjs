import { loadEnvironment } from '../dist/config/environment.js'
import { openDatabase } from '../dist/db/connection.js'
import { composeNotificationWorker } from '../dist/composition.js'
import { loadNotificationWorker } from '../dist/config/notifications.js'

let connection
try {
  const config = loadEnvironment(process.env)
  const workerOptions = loadNotificationWorker(process.env)
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  const worker = await composeNotificationWorker(
    connection,
    config,
    workerOptions,
  )
  const result = await worker.runBatch()
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
