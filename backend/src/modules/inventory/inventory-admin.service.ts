import { adminVariant } from '../catalog/variants/variant.schema.js'
import { createHash, randomUUID } from 'node:crypto'
import { type Connection, type ClientSession, Types } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { pageMeta } from '../../shared/pagination.js'
import { parseRevision } from '../../shared/preconditions.js'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import type { variantInventoryAccess } from '../catalog/variants/variant.service.js'
import type { inventoryService } from './inventory.service.js'
import { inventoryMovementModel } from './inventory.model.js'
import { verifyInventoryPersistence } from './inventory.persistence.js'
import {
  inventoryFacet,
  inventoryList,
  inventoryParams,
  inventoryQuery,
  movementQuery,
  movementView,
  thresholdPatch,
  adjustmentBody,
  adjustmentResult,
  operationKey,
} from './inventory-admin.schema.js'

export function inventoryAdminService(
  connection: Connection,
  access: AdminAccountAccess,
  stock: ReturnType<typeof inventoryService>,
  variants: ReturnType<typeof variantInventoryAccess>,
  defaultThreshold: (session: ClientSession) => Promise<number>,
  audit: (session: ClientSession, event: unknown) => Promise<void>,
) {
  const movements = inventoryMovementModel(connection)
  const digest = (raw: unknown) => createHash('sha256').update(JSON.stringify(raw)).digest('hex')
  async function verify() {
    try {
      await verifyInventoryPersistence(connection)
      await variants.verify()
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  return {
    async list(token: string | undefined, raw: unknown) {
      const input = parseInput(inventoryQuery, raw)
      return access.owned(
        token,
        async (_actor, session) => {
          await verify()
          const threshold = await defaultThreshold(session)
          if (!Number.isSafeInteger(threshold) || threshold < 0)
            throw new ApiError('SERVICE_UNAVAILABLE')
          const parsed = inventoryFacet.safeParse(
            await variants.list(
              session,
              { ...input, offset: (input.page - 1) * input.pageSize, limit: input.pageSize },
              threshold,
            ),
          )
          if (!parsed.success) throw new ApiError('STATE_CONFLICT')
          const facet = parsed.data[0]
          if (!facet) throw new ApiError('SERVICE_UNAVAILABLE')
          const totals = facet.totals[0] ?? {
            totalItems: 0,
            physical: 0,
            reserved: 0,
            committed: 0,
            available: 0,
          }
          const { totalItems, ...counters } = totals
          return {
            data: parseInput(inventoryList, { variants: facet.variants, ...counters }),
            page: pageMeta(input, totalItems),
          }
        },
        false,
      )
    },
    async history(token: string | undefined, variantId: string, raw: unknown) {
      parseInput(inventoryParams, { variantId })
      const input = parseInput(movementQuery, raw)
      return access.owned(
        token,
        async (_actor, session) => {
          await verify()
          await stock.read(variantId, session)
          const filter = {
            variantId: new Types.ObjectId(variantId),
            ...(input.from || input.to
              ? {
                  occurredAt: {
                    ...(input.from ? { $gte: new Date(input.from) } : {}),
                    ...(input.to ? { $lt: new Date(input.to) } : {}),
                  },
                }
              : {}),
          }
          const total = await movements.countDocuments(filter).session(session)
          const rows = await movements
            .find(filter)
            .sort({ occurredAt: -1, _id: -1 })
            .skip((input.page - 1) * input.pageSize)
            .limit(input.pageSize)
            .session(session)
          return {
            data: rows.map((row) =>
              parseInput(movementView, {
                id: row._id.toHexString(),
                variantId,
                type: row.type,
                deltaPhysical: row.deltaPhysical,
                deltaReserved: row.deltaReserved,
                deltaCommitted: row.deltaCommitted,
                occurredAt: row.occurredAt.toISOString(),
                reason: row.reason,
                actor: {
                  type: row.actor.type,
                  ...(row.actor.id ? { id: row.actor.id.toHexString() } : {}),
                },
              }),
            ),
            page: pageMeta(input, total),
          }
        },
        false,
      )
    },
    async adjust(
      token: string | undefined,
      variantId: string,
      raw: unknown,
      key: string | undefined,
    ) {
      parseInput(inventoryParams, { variantId })
      const body = parseInput(adjustmentBody, raw),
        cause = parseInput(operationKey, key)
      return access.owned(token, async (actorId, session) => {
        await verify()
        const prior = await movements
          .findOne({ variantId, type: 'adjustment', operationKey: cause })
          .session(session)
        if (
          prior &&
          (prior.deltaPhysical !== body.deltaPhysical ||
            prior.reason !== body.reason ||
            prior.actor.id?.toHexString() !== actorId)
        )
          throw new ApiError('IDEMPOTENCY_CONFLICT')
        const before = await stock.read(variantId, session)
        const result = await stock.adjustPhysical(
          { ...body, variantId, actorId, operationKey: cause },
          session,
        )
        const after = await stock.read(variantId, session)
        if (!prior)
          await audit(session, {
            actorType: 'admin',
            actorId,
            action: 'inventory.adjust',
            targetType: 'variant',
            targetId: variantId,
            operationKey: digest({ variantId, cause }),
            occurredAt: new Date(),
            beforeDigest: digest(before),
            afterDigest: digest(after),
            reason: body.reason,
          })
        return parseInput(adjustmentResult, { ...result, stock: after })
      })
    },
    async threshold(
      token: string | undefined,
      variantId: string,
      raw: unknown,
      match: string | undefined,
    ) {
      parseInput(inventoryParams, { variantId })
      const input = parseInput(thresholdPatch, raw),
        revision = parseRevision(match),
        cause = randomUUID()
      if (revision === undefined) throw new ApiError('PRECONDITION_REQUIRED')
      if (!Number.isSafeInteger(revision)) throw new ApiError('PRECONDITION_FAILED')
      return access.owned(token, async (actorId, session) => {
        await verify()
        const result = await variants.threshold(
          session,
          new Types.ObjectId(variantId),
          revision,
          input.lowStockThreshold,
        )
        await audit(session, {
          actorType: 'admin',
          actorId,
          action: 'inventory.threshold',
          targetType: 'variant',
          targetId: variantId,
          operationKey: cause,
          occurredAt: new Date(),
          beforeDigest: digest({ lowStockThreshold: result.before }),
          afterDigest: digest({ lowStockThreshold: input.lowStockThreshold }),
        })
        return parseInput(adminVariant, result.variant)
      })
    },
  }
}
