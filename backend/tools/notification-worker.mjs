import { loadEnvironment } from '../dist/config/environment.js'
import {
  loadAdminRecoveryOptions,
  loadEmailChangeOptions,
} from '../dist/config/recovery.js'
import { openDatabase } from '../dist/db/connection.js'
import { createIdentityModels } from '../dist/modules/auth/models.js'
import {
  createAdminResetDelivery,
  createEmailChangeDelivery,
  createResetDelivery,
} from '../dist/modules/auth/proof-delivery.js'
import { loadRecoveryOptions } from '../dist/modules/auth/recovery.js'
import { createRegistrationNotifications } from '../dist/modules/notifications/registration.js'
import {
  createNotificationWorker,
  loadNotificationWorker,
} from '../dist/modules/notifications/worker.js'

let connection
try {
  const config = loadEnvironment(process.env)
  const proofOptions = config.PASSWORD_RECOVERY_ENABLED
    ? loadRecoveryOptions(process.env)
    : undefined
  const emailChangeOptions = config.EMAIL_CHANGE_ENABLED
    ? loadEmailChangeOptions(process.env)
    : undefined
  const adminOptions = config.ADMIN_AUTH_ENABLED
    ? loadAdminRecoveryOptions(process.env)
    : undefined
  const { adapter, settings } = loadNotificationWorker(process.env)
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  const store = createRegistrationNotifications(connection)
  await store.verifyIndexes()
  const result = await createNotificationWorker(
    store,
    adapter,
    settings,
    undefined,
    proofOptions
      ? createResetDelivery(createIdentityModels(connection), proofOptions)
      : undefined,
    emailChangeOptions
      ? createEmailChangeDelivery(
          createIdentityModels(connection),
          emailChangeOptions,
        )
      : undefined,
    adminOptions
      ? createAdminResetDelivery(createIdentityModels(connection), adminOptions)
      : undefined,
  ).runBatch()
  console.log(
    JSON.stringify({
      event: 'notification_batch',
      processed: result.processed,
    }),
  )
} catch {
  console.error(
    'Notification worker failed; inspect protected configuration and durable status.',
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
