import { parseInput } from '../../shared/middleware/validate.js'
import { deliveryAreasQuery, deliveryAreas } from './delivery.schema.js'
import { deliveryModels } from './delivery.model.js'
import { verifyDeliveryPersistence } from './delivery.persistence.js'
import type { ClientSession, Connection, Types } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'

export type AddressCoverage = {
  supports(district: string, area: string, session: ClientSession): Promise<boolean>
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
// Delivery-owned coverage read boundary only. It does not quote/lock a charge or seed master data.
export function createAddressCoverage(
  connection: Connection,
  clock: () => Date = () => new Date(),
): AddressCoverage {
  return {
    async supports(district, area, session) {
      if (!connection.db) throw new ApiError('SERVICE_UNAVAILABLE')
      const now = clock()
      if (!Number.isFinite(now.getTime())) throw new Error('Invalid coverage clock.')
      const collection = connection.db.collection<Charge>('deliveryCharges')
      for (const key of [`${district}:${area}`, `${district}:*`]) {
        const rules = await collection
          .find(
            {
              coverageKey: key,
              status: 'active',
              effectiveFrom: { $lte: now },
              $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: { $gt: now } }],
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
          .findOne({ _id: rule.zoneId, status: 'active' }, { session, projection: { _id: 1 } })
        // An exact rule for an inactive zone must not silently fall back to a district rule.
        return Boolean(zone)
      }
      return false
    },
  }
}

// Checkout charge selection is transaction-bound and detached. The public saved-address boolean
// remains supported independently; neither capability locks or reserves a commercial rule.
export function checkoutDeliveryAccess(
  connection: Connection,
  clock: () => Date = () => new Date(),
) {
  return async (district: string, area: string, session: ClientSession) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    try {
      await verifyDeliveryPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const { charges, zones } = deliveryModels(connection),
      now = clock()
    for (const coverageKey of [`${district}:${area}`, `${district}:*`]) {
      const rows = await charges
        .find({
          coverageKey,
          status: 'active',
          effectiveFrom: { $lte: now },
          $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: { $gt: now } }],
        })
        .limit(2)
        .session(session)
      if (rows.length > 1) throw new ApiError('UNSUPPORTED_DELIVERY_AREA')
      const row = rows[0]
      if (!row) continue
      if (
        !Number.isSafeInteger(row.amountPoisha) ||
        row.amountPoisha < 0 ||
        !(await zones.exists({ _id: row.zoneId, status: 'active' }).session(session))
      )
        throw new ApiError('UNSUPPORTED_DELIVERY_AREA')
      return {
        zoneId: row.zoneId.toHexString(),
        chargeRuleId: row._id.toHexString(),
        coverageKey: row.coverageKey,
        amountPoisha: row.amountPoisha,
        ruleVersion: row.ruleVersion,
      }
    }
    throw new ApiError('UNSUPPORTED_DELIVERY_AREA')
  }
}

export function deliveryAreasAccess(connection: Connection, clock: () => Date = () => new Date()) {
  return async (raw: unknown) => {
    const input = parseInput(deliveryAreasQuery, raw),
      now = clock()
    try {
      await verifyDeliveryPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const rows = await deliveryModels(connection)
      .charges.aggregate<{ coverageKey: string; zoneId: Types.ObjectId }>([
        {
          $match: {
            status: 'active',
            effectiveFrom: { $lte: now },
            $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: { $gt: now } }],
            ...(input.district ? { coverageKey: { $regex: `^${input.district}:` } } : {}),
          },
        },
        {
          $lookup: {
            from: 'deliveryZones',
            localField: 'zoneId',
            foreignField: '_id',
            as: '_zone',
          },
        },
        { $match: { '_zone.status': 'active' } },
        { $sort: { coverageKey: 1 } },
        { $limit: 1001 },
        { $project: { coverageKey: 1, zoneId: 1 } },
      ])
      .option({ maxTimeMS: 3000, allowDiskUse: false })
    if (rows.length > 1000) throw new ApiError('SERVICE_UNAVAILABLE')
    return parseInput(deliveryAreas, {
      supportedAreas: rows.map((row) => {
        const [districtKey, areaKey] = row.coverageKey.split(':')
        return { districtKey, areaKey, zoneId: row.zoneId.toHexString() }
      }),
      zoneKeys: [...new Set(rows.map((row) => row.zoneId.toHexString()))].sort(),
    })
  }
}
