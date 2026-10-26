import { loadEnvironment } from '../dist/config/env.js'
import { openDatabase } from '../dist/config/database.js'
import { initializeCheckoutQuotePersistence } from '../dist/modules/checkout/checkout-quote.persistence.js'
let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await initializeCheckoutQuotePersistence(connection)
  console.log(
    'Checkout quote persistence ready; no orders, reservations or provider sessions created.',
  )
} catch {
  console.error(
    'Checkout quote bootstrap failed; verify protected configuration and reviewed persistence.',
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
