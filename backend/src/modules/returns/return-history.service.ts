import type { Connection, HydratedDocument, ClientSession } from 'mongoose'
import type {
  orderScopeAccess,
  PaymentInitiationCredentials,
  OrderPrincipal,
} from '../auth/checkout-access.service.js'
import type { complaintOrderAccess } from '../orders/order.service.js'
import type { claimEvidenceMetadataAccess } from '../media/claim-evidence.service.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { returnModel } from './return.model.js'
import { verifyReturnPersistence } from './return.persistence.js'
import { claimId } from './return.schema.js'

type Row = HydratedDocument<
  import('mongoose').InferSchemaType<ReturnType<typeof returnModel>['schema']>
>
// Local-only read composition: scope and order ownership are both checked server-side.
export function returnHistoryService(
  connection: Connection,
  scope: ReturnType<typeof orderScopeAccess>,
  order: ReturnType<typeof complaintOrderAccess>,
  evidence: ReturnType<typeof claimEvidenceMetadataAccess>,
) {
  const model = returnModel(connection)
  async function view(session: ClientSession, row: Row) {
    const refs = await evidence(session, {
      orderId: row.orderId.toHexString(),
      returnId: row._id.toHexString(),
      claimType: row.claimType,
      items: row.items.map((item) => ({
        orderItemId: item.orderItemId.toHexString(),
        assetIds: item.evidenceRefs.map((id) => id.toHexString()),
      })),
    })
    return {
      id: row._id.toHexString(),
      orderId: row.orderId.toHexString(),
      claimType: row.claimType,
      status: row.status,
      requestedAt: row.requestedAt.toISOString(),
      items: row.items.map((item) => ({
        orderItemId: item.orderItemId.toHexString(),
        requestedQty: item.requestedQty,
        ...(row.approvedAt ? { approvedQty: item.approvedUnitOrdinals.length } : {}),
        reason: item.reason,
      })),
      evidence: refs,
    }
  }
  async function authorize(session: ClientSession, principal: OrderPrincipal, orderId: string) {
    await order(session, orderId, principal)
    await verifyReturnPersistence(connection)
  }
  return {
    async list(credentials: PaymentInitiationCredentials, rawId: unknown) {
      const id = parseInput(claimId, rawId)
      return scope.owned(credentials, id, async (principal, session) => {
        await authorize(session, principal, id)
        // No silent truncation: the unpaginated contract fails closed above the local bound.
        const rows = await model
          .find({ orderId: id })
          .sort({ createdAt: -1, _id: -1 })
          .limit(101)
          .session(session)
        if (rows.length > 100) throw new ApiError('SERVICE_UNAVAILABLE')
        const result = []
        for (const row of rows) result.push(await view(session, row))
        return result
      })
    },
    async detail(credentials: PaymentInitiationCredentials, rawId: unknown) {
      const id = parseInput(claimId, rawId)
      return scope.ownedAny(credentials, async (principal, session) => {
        await verifyReturnPersistence(connection)
        const row = await model.findById(id).session(session)
        if (!row) throw new ApiError('NOT_FOUND')
        await authorize(session, principal, row.orderId.toHexString())
        return view(session, row)
      })
    },
  }
}
