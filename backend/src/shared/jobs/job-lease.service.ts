import { randomUUID } from 'node:crypto'
import type { ClientSession, Connection } from 'mongoose'
import { ApiError } from '../errors/app-error.js'
import { jobLeaseModel, verifyJobLeases } from './job-lease.model.js'
export function jobLeaseService(
  connection: Connection,
  jobKey: string,
  leaseMs: number,
  clock: () => Date = () => new Date(),
) {
  if (
    !/^[a-z][a-z0-9_-]{0,127}$/.test(jobKey) ||
    !Number.isSafeInteger(leaseMs) ||
    leaseMs < 1000 ||
    leaseMs > 3600000
  )
    throw new Error('Invalid job lease options')
  const model = jobLeaseModel(connection)
  return {
    async acquire() {
      await verifyJobLeases(connection)
      const now = clock(),
        leaseOwner = randomUUID()
      try {
        const row = await model.findOneAndUpdate(
          { jobKey, $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] },
          {
            $set: { leaseOwner, leaseUntil: new Date(now.getTime() + leaseMs), lastStartedAt: now },
            $setOnInsert: { failureCount: 0 },
          },
          {
            upsert: true,
            returnDocument: 'after',
            runValidators: true,
            writeConcern: { w: 'majority' },
          },
        )
        return row ? { owner: leaseOwner, cursor: row.cursor ?? undefined } : null
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
          return null
        throw error
      }
    },
    async fence(session: ClientSession, owner: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const now = clock()
      const result = await model.updateOne(
        { jobKey, leaseOwner: owner, leaseUntil: { $gt: now } },
        { $set: { updatedAt: now } },
        { session, timestamps: false },
      )
      if (result.matchedCount !== 1) throw new ApiError('STATE_CONFLICT')
    },
    async finish(owner: string, cursor?: string) {
      const now = clock()
      const result = await model.updateOne(
        { jobKey, leaseOwner: owner, leaseUntil: { $gt: now } },
        {
          $set: { lastSucceededAt: now, ...(cursor ? { cursor } : {}) },
          $unset: {
            leaseOwner: 1,
            leaseUntil: 1,
            lastErrorCode: 1,
            ...(!cursor ? { cursor: 1 } : {}),
          },
        },
        { writeConcern: { w: 'majority' } },
      )
      if (result.matchedCount !== 1) throw new ApiError('STATE_CONFLICT')
    },
    async fail(owner: string) {
      await model.updateOne(
        {
          jobKey,
          leaseOwner: owner,
          leaseUntil: { $gt: clock() },
          failureCount: { $lt: Number.MAX_SAFE_INTEGER },
        },
        {
          $inc: { failureCount: 1 },
          $set: { lastErrorCode: 'JOB_FAILED' },
          $unset: { leaseOwner: 1, leaseUntil: 1 },
        },
        { writeConcern: { w: 'majority' } },
      )
    },
  }
}
