import { loadEnvironment } from '../dist/config/env.js'
import { openDatabase } from '../dist/config/database.js'
import { initializeCancellationPersistence } from '../dist/modules/orders/cancellation.persistence.js'
let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await initializeCancellationPersistence(connection)
  console.log('Cancellation request foundation ready; no decision or financial effects enabled.')
} catch {
  console.error(
    'Cancellation bootstrap failed; verify reviewed persistence and protected configuration.',
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
