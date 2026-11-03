import { openDatabase } from '../dist/config/database.js'
import { loadEnvironment } from '../dist/config/env.js'
import { createAuditWriter } from '../dist/modules/audit/audit.service.js'
import { createPolicyService } from '../dist/modules/settings/setting.service.js'

let connection
try {
  const config = loadEnvironment(process.env)
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  const denied = async () => {
    throw new Error('Worker cannot execute browser operations')
  }
  const worker = createPolicyService(connection, { owned: denied }, createAuditWriter(connection))
  const result = await worker.activateDue()
  console.log(JSON.stringify({ event: 'policy_activation_batch', processed: result.processed }))
} catch {
  console.error('Policy activation failed; inspect protected configuration and durable state.')
  process.exitCode = 1
} finally {
  await connection?.close()
}
