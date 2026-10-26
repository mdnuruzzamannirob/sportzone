import { loadEnvironment } from '../dist/config/env.js'
import { openDatabase } from '../dist/config/database.js'
import {
  reservationExpiryJob,
  reservationExpiryOptions,
} from '../dist/jobs/expire-reservations.job.js'
let connection
try {
  const config = loadEnvironment(process.env)
  const integer = (key) =>
    /^[1-9]\d*$/.test(process.env[key] ?? '') ? Number(process.env[key]) : NaN
  const options = reservationExpiryOptions.parse({
    batchSize: integer('RESERVATION_EXPIRY_BATCH_SIZE'),
    leaseMs: integer('RESERVATION_EXPIRY_LEASE_MS'),
  })
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  console.log(
    JSON.stringify({
      action: 'reservation_expiry',
      ...(await reservationExpiryJob(connection, options).run()),
    }),
  )
} catch {
  console.error('Reservation expiry failed; inspect protected readiness and job health.')
  process.exitCode = 1
} finally {
  await connection?.close()
}
