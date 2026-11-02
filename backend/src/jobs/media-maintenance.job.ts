import type { Connection } from 'mongoose'
import { z } from 'zod'
import { verifyMediaPersistence, type MediaService } from '../modules/media/media.service.js'
import { jobLeaseService } from '../shared/jobs/job-lease.service.js'
import { inTransaction, assertOutsideTransaction } from '../shared/database/transaction.js'
import { parseInput } from '../shared/middleware/validate.js'
export const mediaMaintenanceOptions = z.strictObject({
  batchSize: z.int().min(1).max(100),
  leaseMs: z.int().min(1000).max(3600000),
})
export function mediaMaintenanceJob(
  connection: Connection,
  media: Pick<MediaService, 'maintenanceBatch'>,
  raw: unknown,
  clock: () => Date = () => new Date(),
) {
  const options = parseInput(mediaMaintenanceOptions, raw),
    leases = jobLeaseService(connection, 'media-maintenance', options.leaseMs, clock)
  return {
    async run() {
      assertOutsideTransaction()
      await verifyMediaPersistence(connection)
      const claim = await leases.acquire()
      if (!claim)
        return { acquired: false, examined: 0, deleted: 0, reconciled: 0, pending: 0, blocked: 0 }
      try {
        const fence = () =>
          inTransaction(connection, (session) => leases.fence(session, claim.owner))
        const result = await media.maintenanceBatch(options.batchSize, fence)
        await fence()
        await leases.finish(claim.owner)
        return { acquired: true, ...result }
      } catch (error) {
        await leases.fail(claim.owner)
        throw error
      }
    },
  }
}
