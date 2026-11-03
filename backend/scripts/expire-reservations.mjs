import { openDatabase } from '../dist/config/database.js'
import { loadEnvironment } from '../dist/config/env.js'
import {
  reservationExpiryJob,
  reservationExpiryOptions,
} from '../dist/jobs/expire-reservations.job.js'
import { createCheckoutExpiryService } from '../dist/modules/checkout/checkout.service.js'
import { composeAuditAccess, composeCheckoutExpiryDependencies } from '../dist/setup.js'
import { positiveInteger } from './lib/environment.mjs'

let connection
try {
  const config = loadEnvironment(process.env)

  const options = reservationExpiryOptions.parse({
    batchSize: positiveInteger(process.env, 'RESERVATION_EXPIRY_BATCH_SIZE'),
    leaseMs: positiveInteger(process.env, 'RESERVATION_EXPIRY_LEASE_MS'),
  })
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  console.log(
    JSON.stringify({
      action: 'reservation_expiry',
      ...(await reservationExpiryJob(
        connection,
        createCheckoutExpiryService(
          composeAuditAccess(connection),
          composeCheckoutExpiryDependencies(connection),
          undefined,
        ),
        options,
      ).run()),
    }),
  )
} catch {
  console.error('Reservation expiry failed; inspect protected readiness and job health.')
  process.exitCode = 1
} finally {
  await connection?.close()
}
