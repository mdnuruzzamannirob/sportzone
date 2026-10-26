import type { Connection } from 'mongoose'
import { z } from 'zod'
import { parseInput } from '../shared/middleware/validate.js'
import { inTransaction } from '../shared/database/transaction.js'
import { jobLeaseService } from '../shared/jobs/job-lease.service.js'
import { checkoutExpiryService } from '../modules/checkout/checkout-expiry.service.js'
import { ApiError } from '../shared/errors/app-error.js'
export const reservationExpiryOptions = z.strictObject({
  batchSize: z.int().min(1).max(100),
  leaseMs: z.int().min(1000).max(3600000),
})
export function reservationExpiryJob(
  connection: Connection,
  raw: unknown,
  clock: () => Date = () => new Date(),
) {
  const options = parseInput(reservationExpiryOptions, raw),
    leases = jobLeaseService(connection, 'reservation-expiry', options.leaseMs, clock),
    expiry = checkoutExpiryService(connection, clock)
  return {
    async run() {
      const claim = await leases.acquire()
      if (!claim) return { acquired: false, scanned: 0, released: 0, skipped: 0 }
      let released = 0,
        skipped = 0
      try {
        const rows = await expiry.due(clock(), options.batchSize, claim.cursor)
        const seen = new Set<string>()
        for (const row of rows) {
          const key = `${row.orderId}:${row.generation}`
          if (seen.has(key)) continue
          seen.add(key)
          try {
            if (
              await inTransaction(connection, async (session) => {
                await leases.fence(session, claim.owner)
                const changed = await expiry.expire(session, row.orderId, row.generation)
                await leases.fence(session, claim.owner)
                return changed
              })
            )
              released++
          } catch (error) {
            if (!(error instanceof ApiError) || error.code !== 'STATE_CONFLICT') throw error
            // Eligibility changed, or a lease expired. The final owner/expiry fence still prevents
            // stale runners checkpointing success, while current protected records remain retained.
            skipped++
          }
        }
        await leases.finish(claim.owner, rows.at(-1)?.cursor)
        return { acquired: true, scanned: rows.length, released, skipped }
      } catch (error) {
        await leases.fail(claim.owner)
        throw error
      }
    },
  }
}
