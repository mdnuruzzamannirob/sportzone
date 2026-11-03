import { claimHistoryQuery as adminQuery, claimHistoryView } from './return.schema.js'
import type { Connection, HydratedDocument, ClientSession } from 'mongoose'
import type {
  orderScopeAccess,
  PaymentInitiationCredentials,
  OrderPrincipal,
} from '../auth/checkout-access.service.js'
import type { complaintOrderAccess, customerOrderHistoryAccess } from '../orders/order.service.js'
import type { claimEvidenceMetadataAccess } from '../media/claim-evidence.service.js'
import type { AdminAccountAccess } from '../auth/auth.public.js'
import { pageMeta } from '../../shared/pagination.js'
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
  admins?: AdminAccountAccess,
  customerOrders?: ReturnType<typeof customerOrderHistoryAccess>,
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
    return claimHistoryView.parse({
      id: row._id.toHexString(),
      orderId: row.orderId.toHexString(),
      claimType: row.claimType,
      status: row.status,
      requestedAt: row.requestedAt.toISOString(),
      ...(row.description ? { description: row.description } : {}),
      items: row.items.map((item) => ({
        orderItemId: item.orderItemId.toHexString(),
        requestedQty: item.requestedQty,
        ...(row.approvedAt ? { approvedQty: item.approvedUnitOrdinals.length } : {}),
        reason: item.reason,
        receivedQty: item.receivedUnitOrdinals?.length ?? 0,
        inspectedQty: item.inspectedUnitOrdinals?.length ?? 0,
        acceptedQty: item.acceptedUnitOrdinals?.length ?? 0,
        resellableQty: item.resellableUnitOrdinals?.length ?? 0,
      })),
      evidence: refs,
    })
  }
  async function authorize(session: ClientSession, principal: OrderPrincipal, orderId: string) {
    await order(session, orderId, principal)
    await verifyReturnPersistence(connection)
  }
  return {
    async forCustomer(session: ClientSession, userId: string, raw: unknown) {
      if (!customerOrders) throw new ApiError('SERVICE_UNAVAILABLE')
      const query = parseInput(adminQuery, raw)
      await verifyReturnPersistence(connection)
      const filter = {
        orderId: { $in: await customerOrders(session, userId) },
        ...(query.status ? { status: query.status } : {}),
        ...(query.claimType ? { claimType: query.claimType } : {}),
      }
      const rows = await model
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .session(session)
      const items = []
      for (const row of rows) items.push(await view(session, row))
      return {
        items,
        pagination: pageMeta(query, await model.countDocuments(filter).session(session)),
      }
    },
    async mine(credentials: PaymentInitiationCredentials, raw: unknown) {
      if (!credentials.customerPresent) throw new ApiError('AUTH_REQUIRED')
      const query = parseInput(adminQuery, raw)
      return scope.ownedAny(credentials, async (principal, session) => {
        if (principal.kind !== 'customer') throw new ApiError('AUTH_REQUIRED')
        if (!customerOrders) throw new ApiError('SERVICE_UNAVAILABLE')
        await verifyReturnPersistence(connection)
        const filter = {
          orderId: { $in: await customerOrders(session, principal.userId) },
          ...(query.claimType ? { claimType: query.claimType } : {}),
          ...(query.status ? { status: query.status } : {}),
        }
        const rows = await model
          .find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((query.page - 1) * query.pageSize)
          .limit(query.pageSize)
          .session(session)
        const items = []
        for (const row of rows) items.push(await view(session, row))
        return {
          items,
          pagination: pageMeta(query, await model.countDocuments(filter).session(session)),
        }
      })
    },
    async adminList(token: string | undefined, raw: unknown) {
      if (!admins) throw new ApiError('SERVICE_UNAVAILABLE')
      const query = parseInput(adminQuery, raw)
      return admins.owned(
        token,
        async (_actor, session) => {
          await verifyReturnPersistence(connection)
          const filter = {
            ...(query.claimType ? { claimType: query.claimType } : {}),
            ...(query.status ? { status: query.status } : {}),
          }
          const rows = await model
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((query.page - 1) * query.pageSize)
            .limit(query.pageSize)
            .session(session)
          const items = []
          for (const row of rows) items.push(await view(session, row))
          return {
            items,
            pagination: pageMeta(query, await model.countDocuments(filter).session(session)),
          }
        },
        false,
      )
    },
    async adminDetail(token: string | undefined, rawId: unknown) {
      if (!admins) throw new ApiError('SERVICE_UNAVAILABLE')
      const id = parseInput(claimId, rawId)
      return admins.owned(
        token,
        async (_actor, session) => {
          await verifyReturnPersistence(connection)
          const row = await model.findById(id).session(session)
          if (!row) throw new ApiError('NOT_FOUND')
          return {
            ...(await view(session, row)),
            eligibility: {
              policyVersion: row.eligibilitySnapshot.policyVersion,
              ...(row.eligibilitySnapshot.deliveredAt
                ? { deliveredAt: row.eligibilitySnapshot.deliveredAt.toISOString() }
                : {}),
              ...(row.eligibilitySnapshot.requestDeadlineAt
                ? { requestDeadlineAt: row.eligibilitySnapshot.requestDeadlineAt.toISOString() }
                : {}),
            },
          }
        },
        false,
      )
    },
    async list(credentials: PaymentInitiationCredentials, rawId: unknown) {
      const id = parseInput(claimId, rawId)
      return scope.owned(credentials, id, async (principal, session) => {
        await authorize(session, principal, id)
        const rows = await model
          .find({ orderId: id })
          .sort({ createdAt: -1, _id: -1 })
          .session(session)
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
