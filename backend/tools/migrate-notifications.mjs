import { loadEnvironment } from '../dist/config/environment.js'
import { openDatabase } from '../dist/db/connection.js'
import { createRegistrationNotifications } from '../dist/modules/notifications/registration.js'
let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV))
    throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await createRegistrationNotifications(connection).migrateFoundation()
  console.log('Known notification foundation migration verified.')
} catch {
  console.error(
    'Notification migration refused; verify protected configuration and reviewed schema.',
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
