import type { Connection } from 'mongoose'
import { jobLeaseService } from '../shared/jobs/job-lease.service.js'
import {
  paymentReconciliationOptions,
  type paymentReconciliationService,
} from '../modules/payments/payment-reconciliation.service.js'
export function paymentReconciliationJob(
  connection: Connection,
  domain: ReturnType<typeof paymentReconciliationService>,
  raw: unknown,
  clock: () => Date = () => new Date(),
) {
  const options = paymentReconciliationOptions.parse(raw),
    leases = jobLeaseService(connection, domain.jobKey, options.leaseMs, clock)
  return {
    async run() {
      const claim = await leases.acquire()
      if (!claim)
        return { acquired: false, scanned: 0, resolved: 0, unresolved: 0, escalated: 0, skipped: 0 }
      let resolved = 0,
        unresolved = 0,
        escalated = 0,
        skipped = 0
      try {
        const rows = await domain.due(claim.cursor)
        for (const id of rows) {
          const result = await domain.reconcile(id, (session) => leases.fence(session, claim.owner))
          if (result.skipped) skipped++
          else if (result.resolved) resolved++
          else unresolved++
          if (result.escalated) escalated++
        }
        await leases.finish(
          claim.owner,
          rows.length === options.batchSize ? rows.at(-1) : undefined,
        )
        return { acquired: true, scanned: rows.length, resolved, unresolved, escalated, skipped }
      } catch (error) {
        await leases.fail(claim.owner)
        throw error
      }
    },
  }
}
