import { loadEnvironment } from '../dist/config/env.js'
import { openDatabase } from '../dist/config/database.js'
import { initializeAuditPersistence } from '../dist/modules/audit/audit.persistence.js'
import { createAuthQuotaStore } from '../dist/modules/auth/sessions/auth-throttle.persistence.js'
let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await initializeAuditPersistence(connection)
  await createAuthQuotaStore(connection).initialize()
  console.log(
    'Callback audit/quota persistence ready; no provider verification or financial activation enabled.',
  )
} catch {
  console.error('Callback bootstrap failed; inspect protected configuration and persistence.')
  process.exitCode = 1
} finally {
  await connection?.close()
}
