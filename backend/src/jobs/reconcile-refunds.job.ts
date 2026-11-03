import type { Connection } from 'mongoose'
import { z } from 'zod'
import type { createRefundRecoveryService } from '../modules/refunds/payouts/refund-recovery.service.js'
import { jobLeaseService } from '../shared/jobs/job-lease.service.js'
export const refundReconciliationOptions = z.strictObject({
  batchSize: z.int().min(1).max(100),
  leaseMs: z.int().min(1000).max(3600000),
  pollMs: z.int().min(1000).max(86400000),
})
export function refundReconciliationJob(
  connection: Connection,
  domain: ReturnType<typeof createRefundRecoveryService>,
  raw: unknown,
  clock: () => Date = () => new Date(),
) {
  const options = refundReconciliationOptions.parse(raw),
    leases = jobLeaseService(connection, 'refund-reconciliation', options.leaseMs, clock)
  return {
    async run() {
      const claim = await leases.acquire()
      if (!claim) return { acquired: false, scanned: 0, resolved: 0, unresolved: 0 }
      let resolved = 0,
        unresolved = 0,
        blocked = 0
      try {
        const rows = await domain.due(claim.cursor, options.batchSize, options.pollMs)
        for (const row of rows) {
          try {
            const result = await domain.scheduled(row.refundId, (session) =>
              leases.fence(session, claim.owner),
            )
            if (['completed', 'failed'].includes(result.status)) resolved++
            else unresolved++
          } catch {
            await domain.defer(row.refundId, (session) => leases.fence(session, claim.owner))
            blocked++
            unresolved++
          }
        }
        await leases.finish(
          claim.owner,
          rows.length === options.batchSize ? rows.at(-1)?.cursor : undefined,
        )
        return { acquired: true, scanned: rows.length, resolved, unresolved, blocked }
      } catch (error) {
        await leases.fail(claim.owner)
        throw error
      }
    },
  }
}
