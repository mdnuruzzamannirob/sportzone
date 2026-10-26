import { loadEnvironment } from '../dist/config/env.js'
import { openDatabase } from '../dist/config/database.js'
import { deliveryService } from '../dist/modules/delivery/delivery.service.js'
import { deliverySettingsGuard } from '../dist/modules/settings/delivery-settings.service.js'
import { createAuditWriter } from '../dist/modules/audit/audit.service.js'
let connection
try {
  const config = loadEnvironment(process.env)
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  const denied = async () => {
    throw new Error('Worker cannot execute browser operations')
  }
  const worker = deliveryService(
    connection,
    { owned: denied },
    deliverySettingsGuard(connection),
    createAuditWriter(connection),
  )
  const result = await worker.runDue()
  console.log(JSON.stringify({ event: 'delivery_activation_batch', processed: result.processed }))
} catch {
  console.error('Delivery activation failed; inspect protected configuration and durable state.')
  process.exitCode = 1
} finally {
  await connection?.close()
}
