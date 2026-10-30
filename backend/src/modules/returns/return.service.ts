import { Types, type ClientSession, type Connection } from 'mongoose'
import { createHash } from 'node:crypto'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { createAuditWriter } from '../audit/audit.service.js'
import type { claimQuantityAccess } from '../orders/order.service.js'
import { returnModel } from './return.model.js'
import { verifyReturnPersistence } from './return.persistence.js'
import { claimAuthority, claimCommand } from './return.schema.js'
// Private foundation only: no root/HTTP activation before eligibility and lifecycle tasks.
export function returnService(
  connection: Connection,
  quantities: ReturnType<typeof claimQuantityAccess>,
  authorize: (
    session: ClientSession,
    command: ReturnType<typeof claimCommand.parse>,
  ) => Promise<unknown>,
  clock: () => Date = () => new Date(),
) {
  const model = returnModel(connection),
    audit = createAuditWriter(connection)
  return {
    async create(session: ClientSession, raw: unknown) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const input = parseInput(claimCommand, raw)
      const authority = parseInput(claimAuthority, await authorize(session, input))
      await verifyReturnPersistence(connection)
      if (await model.exists({ _id: input.claimId }).session(session))
        throw new ApiError('STATE_CONFLICT')
      const selected = await quantities(session, input)
      const now = clock()
      if (!Number.isFinite(now.getTime())) throw new ApiError('STATE_CONFLICT')
      const row = new model({
        _id: new Types.ObjectId(input.claimId),
        orderId: new Types.ObjectId(input.orderId),
        ...authority,
        claimType: input.claimType,
        status: 'requested',
        requestedAt: now,
        revision: 0,
        items: input.items.map((item, index) => ({
          id: new Types.ObjectId(),
          orderItemId: new Types.ObjectId(item.orderItemId),
          requestedQty: item.quantity,
          reason: item.reason,
          protectedUnitOrdinals: selected[index]?.ordinals,
          approvedUnitOrdinals: [],
          evidenceRefs: [],
        })),
      })
      await row.save({ session })
      await audit(session, {
        actorType: 'system',
        action: 'claim.request.create',
        targetType: 'return_request',
        targetId: input.claimId,
        operationKey: `claim:${input.claimId}`,
        afterDigest: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
        occurredAt: now,
      })
      return {
        id: input.claimId,
        status: 'requested' as const,
        items: selected,
      }
    },
  }
}
