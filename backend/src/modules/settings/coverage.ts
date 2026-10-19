import type { ClientSession, Connection, Types } from 'mongoose'
import { ApiError } from '../../shared/errors.js'

export type AddressCoverage = {
  supports(
    district: string,
    area: string,
    session: ClientSession,
  ): Promise<boolean>
}
type Charge = {
  zoneId: Types.ObjectId
  coverageKey: string
  status: string
  effectiveFrom: Date
  effectiveTo?: Date
  amountPoisha: number
  ruleVersion: number
}
// Settings-owned delivery read boundary only. It does not quote/lock a charge or seed master data.
export function createAddressCoverage(
  connection: Connection,
  clock: () => Date = () => new Date(),
): AddressCoverage {
  return {
    async supports(district, area, session) {
      if (!connection.db) throw new ApiError('SERVICE_UNAVAILABLE')
      const now = clock()
      if (!Number.isFinite(now.getTime()))
        throw new Error('Invalid coverage clock.')
      const collection = connection.db.collection<Charge>('deliveryCharges')
      for (const key of [`${district}:${area}`, `${district}:*`]) {
        const rules = await collection
          .find(
            {
              coverageKey: key,
              status: 'active',
              effectiveFrom: { $lte: now },
              $or: [
                { effectiveTo: { $exists: false } },
                { effectiveTo: { $gt: now } },
              ],
            },
            { session },
          )
          .limit(2)
          .toArray()
        if (rules.length > 1) return false // Ambiguous approved data must not pick an arbitrary zone.
        const rule = rules[0]
        if (!rule) continue
        if (
          !Number.isSafeInteger(rule.amountPoisha) ||
          rule.amountPoisha < 0 ||
          !Number.isSafeInteger(rule.ruleVersion) ||
          rule.ruleVersion < 0
        )
          return false
        const zone = await connection.db
          .collection('deliveryZones')
          .findOne(
            { _id: rule.zoneId, status: 'active' },
            { session, projection: { _id: 1 } },
          )
        // An exact rule for an inactive zone must not silently fall back to a district rule.
        return Boolean(zone)
      }
      return false
    },
  }
}
