import { loadEnvironment } from '../dist/config/env.js'
import { openDatabase } from '../dist/config/database.js'
import { initializeSettingsPersistence } from '../dist/modules/settings/settings.persistence.js'
import { initializeAuditPersistence } from '../dist/modules/audit/audit.persistence.js'
let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  const raw = process.env.STORE_INITIAL_LOW_STOCK_THRESHOLD
  if (!raw || !/^(0|[1-9]\d*)$/.test(raw)) throw new Error('Explicit threshold required')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await initializeSettingsPersistence(connection, Number(raw))
  await initializeAuditPersistence(connection)
  console.log('Settings and policy persistence ready; no policies or payment channels activated.')
} catch {
  console.error('Settings bootstrap failed; verify reviewed configuration and persistence.')
  process.exitCode = 1
} finally {
  await connection?.close()
}
