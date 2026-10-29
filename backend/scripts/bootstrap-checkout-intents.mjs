import { loadEnvironment } from '../dist/config/env.js'
import { openDatabase } from '../dist/config/database.js'
import { initializeCheckoutIntentPersistence } from '../dist/modules/checkout/checkout-intent.persistence.js'
let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await initializeCheckoutIntentPersistence(connection)
  console.log('Checkout intent registry ready; no submission route or financial effects enabled.')
} catch {
  console.error(
    'Checkout intent bootstrap failed; verify protected configuration and reviewed persistence.',
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
