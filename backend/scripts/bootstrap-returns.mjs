import { openDatabase } from '../dist/config/database.js'
import { loadEnvironment } from '../dist/config/env.js'
import {
  initializeReturnPersistence,
  upgradeReturnLifecyclePersistence,
} from '../dist/modules/returns/return.persistence.js'

let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  if (process.argv.includes('--lifecycle')) await upgradeReturnLifecyclePersistence(connection)
  else await initializeReturnPersistence(connection)
  console.log('Return persistence ready; HTTP activation remains an explicit server configuration.')
} catch {
  console.error('Return bootstrap failed; verify protected configuration and reviewed persistence.')
  process.exitCode = 1
} finally {
  await connection?.close()
}
