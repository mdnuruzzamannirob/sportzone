import { openDatabase } from '../dist/config/database.js'
import { loadEnvironment } from '../dist/config/env.js'
import { initializeMediaPersistence } from '../dist/modules/media/media.persistence.js'
import { initializeJobLeases } from '../dist/shared/jobs/job-lease.model.js'

let connection
try {
  const config = loadEnvironment(process.env)
  if (process.argv.length !== 2 || !['local', 'test'].includes(config.APP_ENV))
    throw new Error('Explicit local/test bootstrap only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await initializeMediaPersistence(connection)
  await initializeJobLeases(connection)
  console.log(
    'Media ledger and maintenance lease persistence ready; no upload, cleanup, HTTP or worker activation.',
  )
} catch {
  console.error('Media bootstrap failed; inspect protected configuration and reviewed persistence.')
  process.exitCode = 1
} finally {
  await connection?.close()
}
