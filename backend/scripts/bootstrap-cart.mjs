import { loadEnvironment } from '../dist/config/env.js'
import { openDatabase } from '../dist/config/database.js'
import { initializeCartPersistence } from '../dist/modules/cart/cart.persistence.js'

let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await initializeCartPersistence(connection)
  console.log('Cart persistence ready.')
} catch {
  console.error('Cart bootstrap failed; verify protected configuration and reviewed persistence.')
  process.exitCode = 1
} finally {
  await connection?.close()
}
