import { openDatabase } from '../dist/config/database.js'
import { loadEnvironment } from '../dist/config/env.js'
import { createNotificationService } from '../dist/modules/notifications/notification.service.js'

let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await createNotificationService(connection).migrateFoundation()
  console.log('Known notification foundation migration verified.')
} catch {
  console.error(
    'Notification migration refused; verify protected configuration and reviewed schema.',
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
