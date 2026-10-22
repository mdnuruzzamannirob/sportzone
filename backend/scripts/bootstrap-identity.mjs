import { loadEnvironment } from '../dist/config/env.js'
import { openDatabase } from '../dist/config/database.js'
import { createIdentityModels } from '../dist/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../dist/modules/auth/identity.persistence.js'
import { createRegistrationNotifications } from '../dist/modules/notifications/notification.service.js'

// Explicit additive local/test bootstrap. Never run collection/index rollout during HTTP startup.
let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await initializeIdentityPersistence(connection, createIdentityModels(connection))
  await createRegistrationNotifications(connection).initialize()
  console.log('Identity and registration notification persistence ready.')
} catch {
  console.error(
    'Identity bootstrap failed; verify protected configuration and reviewed persistence.',
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
