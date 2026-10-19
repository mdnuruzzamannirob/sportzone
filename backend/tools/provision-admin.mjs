import { loadEnvironment } from '../dist/config/environment.js'
import { openDatabase } from '../dist/db/connection.js'
import { verifyIdentityPersistence } from '../dist/modules/auth/collection-validators.js'
import { createIdentityModels } from '../dist/modules/auth/models.js'
import { provisionInitialAdmin } from '../dist/modules/auth/provision-admin.js'

let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV) || process.stdin.isTTY)
    throw new Error('Private local/test input required.')
  let size = 0
  const chunks = []
  for await (const chunk of process.stdin) {
    size += chunk.length
    if (size > 8192) throw new Error('Input too large.')
    chunks.push(chunk)
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  const models = createIdentityModels(connection)
  await verifyIdentityPersistence(connection, models)
  await provisionInitialAdmin(connection, models, input)
  console.log('Initial administrator provisioned.')
} catch {
  console.error(
    'Administrator provisioning failed; inspect protected input and reviewed persistence.',
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
