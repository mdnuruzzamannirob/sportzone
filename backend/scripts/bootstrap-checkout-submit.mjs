import { openDatabase } from '../dist/config/database.js'
import { loadEnvironment } from '../dist/config/env.js'
import { initializeAuditPersistence } from '../dist/modules/audit/audit.persistence.js'
import { initializeCheckoutIntentPersistence } from '../dist/modules/checkout/checkout-intent.persistence.js'
import { initializeCheckoutQuotePersistence } from '../dist/modules/checkout/checkout-quote.persistence.js'
import { initializeAllocationPersistence } from '../dist/modules/inventory/inventory.persistence.js'
import { createNotificationService } from '../dist/modules/notifications/notification.service.js'
import { initializeOrderPersistence } from '../dist/modules/orders/order.persistence.js'
import { initializePaymentPersistence } from '../dist/modules/payments/payment.persistence.js'
import { initializeCouponPersistence } from '../dist/modules/promotions/promotion.persistence.js'
import { initializeJobLeases } from '../dist/shared/jobs/job-lease.model.js'

let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await initializeCheckoutIntentPersistence(connection)
  await initializeCheckoutQuotePersistence(connection)
  await initializeOrderPersistence(connection)
  await initializePaymentPersistence(connection)
  await initializeAllocationPersistence(connection)
  await initializeCouponPersistence(connection)
  await createNotificationService(connection).migrateFoundation()
  await initializeAuditPersistence(connection)
  await initializeJobLeases(connection)
  console.log('Checkout persistence ready; no merchant activation or financial collection enabled.')
} catch {
  console.error(
    'Checkout bootstrap failed; verify protected configuration and reviewed persistence.',
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
