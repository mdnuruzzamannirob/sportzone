import {
  claimHistoryQuery as adminQuery,
  claimHistoryView,
  claimId,
  claimText,
  claimAuthority,
  claimCommand,
  claimReviewInput,
  claimReceiptInput,
  claimUploadInput,
} from './return.schema.js'
import { type Connection, type HydratedDocument, type ClientSession, Types } from 'mongoose'
import type {
  orderScopeAccess,
  PaymentInitiationCredentials,
  OrderPrincipal,
} from '../auth/checkout-access.service.js'
import type {
  complaintOrderAccess,
  customerOrderHistoryAccess,
  claimReviewQuantityAccess,
  returnNotificationOrderAccess,
  claimQuantityAccess,
  claimEligibilitySnapshotAccess,
  claimRestockAccess,
} from '../orders/order.service.js'
import type { claimEvidenceMetadataAccess } from '../media/attachment.service.js'
import type { AdminAccountAccess } from '../auth/auth.public.js'
import { pageMeta } from '../../shared/pagination.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { returnModel } from './return.model.js'
import { verifyReturnPersistence } from './return.persistence.js'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { auditOperationReader, createAuditWriter } from '../audit/audit.service.js'
import { paymentInitiationKey } from '../payments/attempts/payment-initiation.schema.js'
import { inTransaction } from '../../shared/database/transaction.js'
import { type MediaService, verifyMediaPersistence } from '../media/media.service.js'
import type { MediaFile } from '../media/media.types.js'
import type { createReturnEligibilityService } from './return.policy.js'
import type { createReturnReceiptService } from '../inventory/inventory.service.js'

type Row = HydratedDocument<
  import('mongoose').InferSchemaType<ReturnType<typeof returnModel>['schema']>
>

// Local-only read composition: scope and order ownership are both checked server-side.
function createReturnHistoryService(
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

const command = z.strictObject({
  to: z.enum(['under_review', 'approved', 'awaiting_return', 'rejected', 'completed']),
  reason: claimText,
  approvedItems: z
    .array(z.strictObject({ orderItemId: claimId, quantity: z.int().min(0).max(50) }))
    .min(1)
    .max(50)
    .refine((items) => new Set(items.map((i) => i.orderItemId)).size === items.length)
    .optional(),
})

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

// Returns owns guarded lifecycle changes; HTTP/root composition supplies protected capabilities.
function createReturnLifecycleService(
  connection: Connection,
  admin: AdminAccountAccess,
  quantities: ReturnType<typeof claimReviewQuantityAccess>,
  clock: () => Date = () => new Date(),
  notify?: (
    session: import('mongoose').ClientSession,
    event: {
      orderId: string
      returnId: string
      from: 'under_review' | 'approved' | 'inspected'
      to: 'approved' | 'rejected' | 'completed'
      operationKey: string
      occurredAt: Date
    },
  ) => Promise<void>,
) {
  const model = returnModel(connection),
    audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection)
  return {
    async transition(token: string | undefined, rawId: unknown, raw: unknown, rawKey: unknown) {
      const id = parseInput(claimId, rawId),
        input = parseInput(command, raw),
        operationKey = hash(`claim:${id}:${parseInput(paymentInitiationKey, rawKey)}`),
        digest = hash(JSON.stringify(input))
      return admin.owned(token, async (actorId, session) => {
        if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
        await verifyReturnPersistence(connection)
        const row = await model.findById(id).session(session)
        if (!row) throw new ApiError('NOT_FOUND')
        const cause = {
          action: 'claim.lifecycle.transition',
          targetType: 'return_request',
          targetId: id,
          operationKey,
        }
        const previous = await lookup(session, cause)
        if (previous) {
          if (previous.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
          return { id, status: row.status, revision: row.revision }
        }
        const allowed =
          (row.status === 'requested' && input.to === 'under_review') ||
          (row.status === 'under_review' && ['approved', 'rejected'].includes(input.to)) ||
          (row.status === 'approved' &&
            row.claimType === 'physical_return' &&
            input.to === 'awaiting_return') ||
          (row.status === 'inspected' &&
            row.claimType === 'physical_return' &&
            input.to === 'completed') ||
          (row.status === 'approved' && row.claimType === 'shortage' && input.to === 'completed')
        const now = clock()
        if (
          !allowed ||
          !Number.isFinite(now.getTime()) ||
          now < row.updatedAt ||
          now < row.requestedAt ||
          row.revision >= Number.MAX_SAFE_INTEGER
        )
          throw new ApiError('STATE_CONFLICT')
        if ((input.to === 'approved') !== Boolean(input.approvedItems))
          throw new ApiError('VALIDATION_FAILED')
        if (
          row.claimType === 'physical_return' &&
          input.to === 'completed' &&
          (!row.receivedAt ||
            !row.inspectedAt ||
            row.items.some(
              (item) =>
                !item.inspectedUnitOrdinals ||
                item.inspectedUnitOrdinals.length !== item.approvedUnitOrdinals.length,
            ))
        )
          throw new ApiError('BUSINESS_RULE_VIOLATION')
        if (
          input.approvedItems &&
          (input.approvedItems.length !== row.items.length ||
            input.approvedItems.some(
              (i) =>
                !row.items.some(
                  (r) =>
                    r.orderItemId.toHexString() === i.orderItemId && i.quantity <= r.requestedQty,
                ),
            ) ||
            !input.approvedItems.some((i) => i.quantity > 0))
        )
          throw new ApiError('BUSINESS_RULE_VIOLATION')
        const items = row.items.map((item) => {
          const requested = input.approvedItems?.find(
            (i) => i.orderItemId === item.orderItemId.toHexString(),
          )
          const approved =
            input.to === 'rejected'
              ? []
              : requested
                ? item.protectedUnitOrdinals.slice(0, requested.quantity)
                : input.to === 'completed' && row.claimType === 'physical_return'
                  ? [...(item.acceptedUnitOrdinals ?? [])]
                  : [...item.approvedUnitOrdinals]
          return {
            orderItemId: item.orderItemId.toHexString(),
            protected:
              input.to === 'completed'
                ? [...item.approvedUnitOrdinals]
                : [...item.protectedUnitOrdinals],
            approved,
          }
        })
        if (['approved', 'rejected', 'completed'].includes(input.to))
          await quantities(session, {
            orderId: row.orderId.toHexString(),
            claimId: id,
            items,
            resolve: input.to === 'completed',
          })
        const set: Record<string, unknown> = {
          status: input.to,
          updatedAt: now,
          reviewedBy: new Types.ObjectId(actorId),
          decisionReason: input.reason,
        }
        if (input.to === 'approved') {
          set.approvedAt = now
          items.forEach((item, index) => {
            set[`items.${index}.approvedUnitOrdinals`] = item.approved
          })
        }
        if (input.to === 'completed') set.completedAt = now
        const result = await model.collection.updateOne(
          { _id: row._id, revision: row.revision, status: row.status },
          { $set: set, $inc: { revision: 1 } },
          { session },
        )
        if (result.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
        await audit(session, {
          ...cause,
          actorType: 'admin',
          actorId,
          afterDigest: digest,
          reason: input.reason,
          occurredAt: now,
        })
        await audit(session, {
          ...cause,
          action: `claim.lifecycle.${row.status}.${input.to}`,
          actorType: 'admin',
          actorId,
          afterDigest: digest,
          reason: input.reason,
          occurredAt: now,
        })
        if (
          notify &&
          (input.to === 'approved' || input.to === 'rejected' || input.to === 'completed')
        ) {
          if (
            row.status !== 'under_review' &&
            row.status !== 'approved' &&
            row.status !== 'inspected'
          )
            throw new ApiError('STATE_CONFLICT')
          await notify(session, {
            orderId: row.orderId.toHexString(),
            returnId: id,
            from: row.status,
            to: input.to,
            operationKey,
            occurredAt: now,
          })
        }
        return { id, status: input.to, revision: row.revision + 1 }
      })
    },
  }
}

// Private foundation only: no root/HTTP activation before eligibility and lifecycle tasks.
function createReturnService(
  connection: Connection,
  quantities: ReturnType<typeof claimQuantityAccess>,
  authorize: (
    session: ClientSession,
    command: ReturnType<typeof claimCommand.parse>,
  ) => Promise<unknown>,
  clock: () => Date = () => new Date(),
  evidence?: {
    attach: MediaService['attach']
    credential?: string
  },
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
      const timing = authority.eligibilitySnapshot
      if (timing.deliveredAt && now < timing.deliveredAt) throw new ApiError('STATE_CONFLICT')
      if (timing.requestDeadlineAt && now > timing.requestDeadlineAt && !timing.exceptionBasis)
        throw new ApiError('BUSINESS_RULE_VIOLATION', [
          { field: 'orderId', code: 'RETURN_WINDOW_EXPIRED' },
        ])
      const evidenceIds: Types.ObjectId[][] = input.items.map(() => [])
      const allAssets = input.items.flatMap((item) => item.evidenceAssetIds ?? [])
      if (new Set(allAssets).size !== allAssets.length) throw new ApiError('VALIDATION_FAILED')
      if (allAssets.length && !evidence) throw new ApiError('SERVICE_UNAVAILABLE')
      if (allAssets.length) await verifyMediaPersistence(connection)
      for (const [index, item] of input.items.entries()) {
        for (const assetId of item.evidenceAssetIds ?? []) {
          if (!evidence) throw new ApiError('SERVICE_UNAVAILABLE')
          await evidence.attach(
            evidence.credential,
            assetId,
            {
              targetType: 'claim',
              targetId: new Types.ObjectId(input.claimId),
              slot: `item:${item.orderItemId}`,
            },
            session,
            async (asset) => {
              const ownerKind =
                authority.requestedBy.type === 'customer' ? 'customer' : 'guest_order'
              const ownerId =
                authority.requestedBy.type === 'customer' ? authority.requestedBy.id : input.orderId
              if (
                asset.assetKind !== 'claim_evidence' ||
                asset.access !== 'private' ||
                asset.orderId?.toHexString() !== input.orderId ||
                asset.claimType !== input.claimType ||
                !asset.orderItemIds.some((id) => id.toHexString() === item.orderItemId) ||
                asset.owner.kind !== ownerKind ||
                asset.owner.principalId.toHexString() !== ownerId
              )
                throw new ApiError('FORBIDDEN')
              evidenceIds[index]?.push(new Types.ObjectId(assetId))
            },
          )
        }
      }
      const row = new model({
        _id: new Types.ObjectId(input.claimId),
        orderId: new Types.ObjectId(input.orderId),
        ...authority,
        claimType: input.claimType,
        status: 'requested',
        ...(input.description ? { description: input.description } : {}),
        requestedAt: now,
        revision: 0,
        items: input.items.map((item, index) => ({
          id: new Types.ObjectId(),
          orderItemId: new Types.ObjectId(item.orderItemId),
          requestedQty: item.quantity,
          reason: item.reason,
          protectedUnitOrdinals: selected[index]?.ordinals,
          approvedUnitOrdinals: [],
          evidenceRefs: evidenceIds[index],
        })),
      })
      await row.save({ session })
      await audit(session, {
        actorType: authority.requestedBy.type === 'customer' ? 'customer' : 'guest_order',
        actorId: authority.requestedBy.id,
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

// Only an inspected physical claim or an approved shortage supplies refund ordinals.
function refundClaimSnapshotAccess(connection: Connection) {
  const model = returnModel(connection)
  return async (
    session: ClientSession,
    orderId: string,
    claimId: string,
    requested: {
      orderItemId: string
      quantity: number
    }[],
    expectedType?: 'physical_return' | 'shortage',
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyReturnPersistence(connection)
    const row = await model.findOne({ _id: claimId, orderId }).session(session)
    if (!row) throw new ApiError('NOT_FOUND')
    if (expectedType && row.claimType !== expectedType)
      throw new ApiError('BUSINESS_RULE_VIOLATION')
    if (
      (row.claimType === 'physical_return' && !['inspected', 'completed'].includes(row.status)) ||
      (row.claimType === 'shortage' && !['approved', 'completed'].includes(row.status))
    )
      throw new ApiError('BUSINESS_RULE_VIOLATION')
    return requested.map((line) => {
      const item = row.items.find((i) => i.orderItemId.toHexString() === line.orderItemId)
      if (!item) throw new ApiError('BUSINESS_RULE_VIOLATION')
      const ordinals =
        row.claimType === 'shortage' ? item.approvedUnitOrdinals : item.acceptedUnitOrdinals
      if (!ordinals || ordinals.length < line.quantity)
        throw new ApiError('BUSINESS_RULE_VIOLATION')
      return { ...line, ordinals: [...ordinals] }
    })
  }
}

// Existing transition audit is the immutable event proof, even after later claim changes.
function returnNotificationProofAccess(
  connection: Connection,
  order: ReturnType<typeof returnNotificationOrderAccess>,
) {
  const model = returnModel(connection),
    lookup = auditOperationReader(connection)
  const event = z.strictObject({
    orderId: claimCommand.shape.orderId,
    returnId: claimCommand.shape.claimId,
    from: z.enum(['under_review', 'approved', 'inspected']),
    to: z.enum(['approved', 'rejected', 'completed']),
    operationKey: z.string().regex(/^[a-f0-9]{64}$/),
    occurredAt: z.date(),
    recipient: z.email(),
  })
  return async (raw: unknown) => {
    const parsed = event.safeParse(raw)
    if (!parsed.success) return undefined
    const data = parsed.data
    return inTransaction(connection, async (session) => {
      await verifyReturnPersistence(connection)
      const claim = await model
        .findOne({ _id: data.returnId, orderId: data.orderId })
        .session(session)
      if (!claim) return undefined
      const contact = await order(session, data.orderId)
      if (contact.email !== data.recipient) return undefined
      const audit = await lookup(session, {
        action: `claim.lifecycle.${data.from}.${data.to}`,
        targetType: 'return_request',
        targetId: data.returnId,
        operationKey: data.operationKey,
      })
      if (!audit || audit.occurredAt.getTime() !== data.occurredAt.getTime()) return undefined
      return { orderNumber: contact.orderNumber, recipient: contact.email }
    })
  }
}

function returnReportAccess(connection: Connection) {
  return async (session: ClientSession) => {
    await verifyReturnPersistence(connection)
    return returnModel(connection)
      .countDocuments({ claimType: 'physical_return', status: { $nin: ['completed', 'rejected'] } })
      .maxTimeMS(5000)
      .session(session)
  }
}

// Customer request preparation exposes accepted quantities only, never private claim persistence.
function refundClaimSelectionAccess(connection: Connection) {
  return async (
    session: ClientSession,
    orderId: string,
    claimId: string,
    kind: 'physical_return' | 'shortage',
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyReturnPersistence(connection)
    const row = await returnModel(connection)
      .findOne({ _id: claimId, orderId, claimType: kind })
      .session(session)
    if (
      !row ||
      (kind === 'physical_return'
        ? !['inspected', 'completed'].includes(row.status)
        : !['approved', 'completed'].includes(row.status))
    )
      throw new ApiError('BUSINESS_RULE_VIOLATION')
    const items = row.items
      .map((item) => ({
        orderItemId: item.orderItemId.toHexString(),
        quantity:
          (kind === 'shortage' ? item.approvedUnitOrdinals : item.acceptedUnitOrdinals)?.length ??
          0,
      }))
      .filter((item) => item.quantity > 0)
    if (!items.length) throw new ApiError('BUSINESS_RULE_VIOLATION')
    return items
  }
}

const returnOperationsHash = (value: string) => createHash('sha256').update(value).digest('hex')

function createReturnOperationsService(
  connection: Connection,
  dependencies: {
    scope: ReturnType<typeof orderScopeAccess>
    order: ReturnType<typeof claimEligibilitySnapshotAccess>
    quantities: ReturnType<typeof claimQuantityAccess>
    eligibility: ReturnType<typeof createReturnEligibilityService>
    history: ReturnType<typeof createReturnHistoryService>
    administration?: {
      lifecycle: ReturnType<typeof createReturnLifecycleService>
      physical: ReturnType<typeof createReturnPhysicalService>
    }
    policyVersion: string
    media?: (
      credentials: PaymentInitiationCredentials,
      orderId: string,
      mutating?: boolean,
    ) => MediaService
  },
  clock: () => Date = () => new Date(),
) {
  const lookup = auditOperationReader(connection),
    model = returnModel(connection)
  return {
    async review(token: string | undefined, id: string, raw: unknown, rawKey: unknown) {
      if (!dependencies.administration) throw new ApiError('SERVICE_UNAVAILABLE')
      const input = parseInput(claimReviewInput, raw)
      const key = parseInput(paymentInitiationKey, rawKey),
        current = await dependencies.history.adminDetail(token, id)
      if (current.status === 'requested') {
        try {
          await dependencies.administration.lifecycle.transition(
            token,
            id,
            { to: 'under_review', reason: input.reason },
            returnOperationsHash(`review:${key}`),
          )
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== 'STATE_CONFLICT') throw error
          const latest = await dependencies.history.adminDetail(token, id)
          if (!['under_review', 'approved', 'rejected'].includes(latest.status)) throw error
        }
      }
      await dependencies.administration.lifecycle.transition(
        token,
        id,
        {
          to: input.decision === 'approve' ? 'approved' : 'rejected',
          ...(input.approvedItems ? { approvedItems: input.approvedItems } : {}),
          reason: input.reason,
        },
        key,
      )
      return dependencies.history.adminDetail(token, id)
    },
    async receive(token: string | undefined, id: string, raw: unknown, rawKey: unknown) {
      if (!dependencies.administration) throw new ApiError('SERVICE_UNAVAILABLE')
      const input = parseInput(claimReceiptInput, raw)
      const key = parseInput(paymentInitiationKey, rawKey),
        current = await dependencies.history.adminDetail(token, id)
      if (current.status === 'approved') {
        try {
          await dependencies.administration.lifecycle.transition(
            token,
            id,
            { to: 'awaiting_return', reason: 'Approved physical receipt' },
            returnOperationsHash(`await:${key}`),
          )
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== 'STATE_CONFLICT') throw error
          const latest = await dependencies.history.adminDetail(token, id)
          if (!['awaiting_return', 'received', 'inspected', 'completed'].includes(latest.status))
            throw error
        }
      }
      await dependencies.administration.physical.receive(
        token,
        id,
        {
          items: input.receivedItems,
          receiptReference: input.receiptReference,
          reason: input.notes ?? 'Physical receipt recorded',
        },
        key,
      )
      return dependencies.history.adminDetail(token, id)
    },
    async authorize(credentials: PaymentInitiationCredentials, rawId: unknown) {
      const orderId = parseInput(claimId, rawId)
      await dependencies.scope.owned(
        credentials,
        orderId,
        (principal, session) => dependencies.order(session, orderId, principal),
        true,
      )
    },
    async eligibility(credentials: PaymentInitiationCredentials, rawId: unknown) {
      const orderId = parseInput(claimId, rawId)
      return dependencies.scope.owned(credentials, orderId, async (principal, session) => {
        const facts = await dependencies.order(session, orderId, principal)
        const eligibleTypes: string[] = []
        let policyVersion = dependencies.policyVersion,
          requestDeadlineAt: string | undefined
        const item = facts.items.find((item) => item.claimableQty > 0)
        const reasons: {
          claimType: string
          code: string
        }[] = []
        if (item)
          for (const claimType of ['physical_return', 'shortage'] as const) {
            try {
              const authority = await dependencies.eligibility(session, principal, {
                claimId: new Types.ObjectId().toHexString(),
                orderId,
                claimType,
                items: [
                  { orderItemId: item.orderItemId, quantity: 1, reason: 'Eligibility evaluation' },
                ],
              })
              eligibleTypes.push(claimType)
              policyVersion = authority.eligibilitySnapshot.policyVersion
              if (authority.eligibilitySnapshot.requestDeadlineAt)
                requestDeadlineAt = authority.eligibilitySnapshot.requestDeadlineAt.toISOString()
            } catch (error) {
              if (!(error instanceof ApiError) || error.code !== 'BUSINESS_RULE_VIOLATION')
                throw error
              reasons.push({ claimType, code: error.details?.[0]?.code ?? 'NOT_ELIGIBLE' })
            }
          }
        return {
          items: facts.items,
          eligibleTypes,
          ...(policyVersion ? { policyVersion } : {}),
          ...(requestDeadlineAt ? { requestDeadlineAt } : {}),
          reasons,
        }
      })
    },
    async submit(
      credentials: PaymentInitiationCredentials,
      rawId: unknown,
      raw: unknown,
      key: unknown,
    ) {
      const orderId = parseInput(claimId, rawId),
        input = parseInput(claimCommand.omit({ claimId: true, orderId: true }), raw)
      const requestKey = parseInput(paymentInitiationKey, key)
      const id = await dependencies.scope.owned(
        credentials,
        orderId,
        async (principal, session) => {
          await dependencies.order(session, orderId, principal)
          const scopeKey = principal.kind === 'customer' ? principal.userId : principal.orderId
          const claimId = returnOperationsHash(
            `claim:${orderId}:${principal.kind}:${scopeKey}:${requestKey}`,
          ).slice(0, 24)
          const command = claimCommand.parse({ claimId, orderId, ...input })
          const old = await model.findById(claimId).session(session)
          if (old) {
            const prior = await lookup(session, {
              action: 'claim.request.create',
              targetType: 'return_request',
              targetId: claimId,
              operationKey: `claim:${claimId}`,
            })
            if (!prior || prior.afterDigest !== returnOperationsHash(JSON.stringify(command)))
              throw new ApiError('IDEMPOTENCY_CONFLICT')
            return claimId
          }
          const media = dependencies.media?.(credentials, orderId, true)
          const service = createReturnService(
            connection,
            dependencies.quantities,
            (session, command) => dependencies.eligibility(session, principal, command),
            clock,
            media ? { attach: media.attach } : undefined,
          )
          await service.create(session, command)
          return claimId
        },
        true,
      )
      return dependencies.history.detail(credentials, id)
    },
    async upload(
      credentials: PaymentInitiationCredentials,
      rawId: unknown,
      raw: unknown,
      file: MediaFile,
    ) {
      const orderId = parseInput(claimId, rawId),
        scope = parseInput(claimUploadInput, raw)
      await dependencies.scope.owned(
        credentials,
        orderId,
        async (principal, session) => {
          const facts = await dependencies.order(session, orderId, principal)
          if (
            scope.orderItemIds.some(
              (id) => !facts.items.some((item) => item.orderItemId === id && item.claimableQty > 0),
            )
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          await dependencies.eligibility(session, principal, {
            claimId: new Types.ObjectId().toHexString(),
            orderId,
            claimType: scope.claimType,
            items: scope.orderItemIds.map((orderItemId) => ({
              orderItemId,
              quantity: 1,
              reason: 'Evidence upload',
            })),
          })
        },
        true,
      )
      if (!dependencies.media) throw new ApiError('SERVICE_UNAVAILABLE')
      const result = await dependencies.media(credentials, orderId, true).uploadEvidence(
        undefined,
        {
          orderId: new Types.ObjectId(orderId),
          claimType: scope.claimType,
          orderItemIds: scope.orderItemIds.map((id) => new Types.ObjectId(id)),
        },
        file,
      )
      if (!('status' in result) || result.status !== 'private' || result.orderId !== orderId)
        throw new ApiError('SERVICE_UNAVAILABLE')
      return {
        assetId: parseInput(claimId, result.assetId),
        orderId,
        status: 'private' as const,
        ...(result.expiresAt ? { expiresAt: result.expiresAt.toISOString() } : {}),
      }
    },
    async privateEvidence(
      credentials: PaymentInitiationCredentials,
      rawId: unknown,
      rawAsset: unknown,
    ) {
      const orderId = parseInput(claimId, rawId),
        assetId = parseInput(claimId, rawAsset)
      await dependencies.scope.owned(credentials, orderId, (principal, session) =>
        dependencies.order(session, orderId, principal),
      )
      if (!dependencies.media) throw new ApiError('SERVICE_UNAVAILABLE')
      return dependencies.media(credentials, orderId).privateUrl(undefined, assetId)
    },
  }
}

const receivedLine = z.strictObject({ orderItemId: claimId, quantity: z.int().min(0).max(50) })

const inspectedLine = z.strictObject({
  orderItemId: claimId,
  acceptedQty: z.int().min(0).max(50),
  resellableQty: z.int().min(0).max(50),
  reason: claimText,
})

const uniqueLines = <
  T extends {
    orderItemId: string
  },
>(
  rows: T[],
) => new Set(rows.map((r) => r.orderItemId)).size === rows.length

const receiveInput = z.strictObject({
  receiptReference: claimText,
  items: z.array(receivedLine).min(1).max(50).refine(uniqueLines),
  reason: claimText,
})

const inspectInput = z.strictObject({
  items: z.array(inspectedLine).min(1).max(50).refine(uniqueLines),
  reason: claimText,
})

const returnPhysicalHash = (text: string) => createHash('sha256').update(text).digest('hex')

// Returns owns cumulative physical batches; root composition supplies current-admin access.
function createReturnPhysicalService(
  connection: Connection,
  admin: AdminAccountAccess,
  restock: ReturnType<typeof claimRestockAccess>,
  receipt: ReturnType<typeof createReturnReceiptService>,
  clock: () => Date = () => new Date(),
) {
  const model = returnModel(connection),
    audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection)
  async function perform(
    token: string | undefined,
    rawId: unknown,
    raw: unknown,
    rawKey: unknown,
    kind: 'receive' | 'inspect',
  ) {
    const id = parseInput(claimId, rawId),
      input = kind === 'receive' ? parseInput(receiveInput, raw) : parseInput(inspectInput, raw),
      digest = returnPhysicalHash(JSON.stringify({ kind, input })),
      operationKey = returnPhysicalHash(
        `return-physical:${id}:${parseInput(paymentInitiationKey, rawKey)}`,
      )
    return admin.owned(token, async (actorId, session) => {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      await verifyReturnPersistence(connection)
      const row = await model.findById(id).session(session)
      if (!row) throw new ApiError('NOT_FOUND')
      const cause = {
        action: 'claim.physical.transition',
        targetType: 'return_request',
        targetId: id,
        operationKey,
      }
      const previous = await lookup(session, cause)
      if (previous) {
        if (previous.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
        return { id, status: row.status, revision: row.revision }
      }
      if (kind === 'receive') {
        const ref = parseInput(receiveInput, raw).receiptReference
        const original = await lookup(session, {
          ...cause,
          action: 'claim.receipt.reference',
          operationKey: returnPhysicalHash(`receipt:${id}:${ref}`),
        })
        if (original) {
          if (original.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
          await audit(session, {
            ...cause,
            actorType: 'admin',
            actorId,
            afterDigest: digest,
            reason: input.reason,
            occurredAt: clock(),
          })
          return { id, status: row.status, revision: row.revision }
        }
      }
      const now = clock()
      if (
        row.claimType !== 'physical_return' ||
        !(
          kind === 'receive' ? ['awaiting_return', 'received', 'inspected'] : ['received']
        ).includes(row.status) ||
        !Number.isFinite(now.getTime()) ||
        now < row.updatedAt ||
        row.revision >= Number.MAX_SAFE_INTEGER
      )
        throw new ApiError('STATE_CONFLICT')
      if (
        input.items.length !== row.items.length ||
        input.items.some(
          (i) => !row.items.some((r) => r.orderItemId.toHexString() === i.orderItemId),
        )
      )
        throw new ApiError('VALIDATION_FAILED')
      const set: Record<string, unknown> = {
        status: kind === 'receive' ? 'received' : 'inspected',
        updatedAt: now,
        reviewedBy: new Types.ObjectId(actorId),
        decisionReason: input.reason,
      }
      if (kind === 'receive') {
        const value = parseInput(receiveInput, raw)
        if (!value.items.some((i) => i.quantity > 0)) throw new ApiError('BUSINESS_RULE_VIOLATION')
        set.receivedAt = now
        set.receiptReference = value.receiptReference
        row.items.forEach((item, index) => {
          const line = value.items.find((i) => i.orderItemId === item.orderItemId.toHexString())
          const previous = item.receivedUnitOrdinals ?? []
          const pending = item.approvedUnitOrdinals.filter((n) => !previous.includes(n))
          if (!line || line.quantity > pending.length) throw new ApiError('BUSINESS_RULE_VIOLATION')
          set[`items.${index}.receivedUnitOrdinals`] = [
            ...previous,
            ...pending.slice(0, line.quantity),
          ]
        })
      } else {
        const value = parseInput(inspectInput, raw)
        if (!row.receivedAt || !row.receiptReference) throw new ApiError('STATE_CONFLICT')
        set.inspectedAt = now
        let newlyInspected = 0
        for (const [index, item] of row.items.entries()) {
          const line = value.items.find((i) => i.orderItemId === item.orderItemId.toHexString()),
            received = item.receivedUnitOrdinals,
            priorInspected = item.inspectedUnitOrdinals ?? [],
            pending = (received ?? []).filter((n) => !priorInspected.includes(n))
          if (
            !line ||
            !received ||
            line.acceptedQty > pending.length ||
            line.resellableQty > line.acceptedQty
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          newlyInspected += pending.length
          const accepted = pending.slice(0, line.acceptedQty),
            resellable = accepted.slice(0, line.resellableQty)
          set[`items.${index}.inspectedUnitOrdinals`] = received
          set[`items.${index}.acceptedUnitOrdinals`] = [
            ...(item.acceptedUnitOrdinals ?? []),
            ...accepted,
          ]
          set[`items.${index}.resellableUnitOrdinals`] = [
            ...(item.resellableUnitOrdinals ?? []),
            ...resellable,
          ]
          if (pending.length) {
            set[`items.${index}.inspectionReason`] = line.reason
            await audit(session, {
              ...cause,
              action: 'claim.inspection.item',
              operationKey: returnPhysicalHash(`${operationKey}:${item.orderItemId}`),
              actorType: 'admin',
              actorId,
              afterDigest: returnPhysicalHash(JSON.stringify({ pending, accepted, resellable })),
              reason: line.reason,
              occurredAt: now,
            })
          }
          if (resellable.length) {
            const batchKey = priorInspected.length ? operationKey : undefined
            const key = `return:${id}:${item.orderItemId.toHexString()}${batchKey ? `:${batchKey}` : ''}`
            const binding = await restock(session, {
              orderId: row.orderId.toHexString(),
              claimId: id,
              orderItemId: item.orderItemId.toHexString(),
              ordinals: resellable,
              operationKey: key,
            })
            await receipt(session, {
              orderId: row.orderId.toHexString(),
              claimId: id,
              orderItemId: item.orderItemId.toHexString(),
              variantId: binding.variantId,
              actorId,
              quantity: resellable.length,
              ...(batchKey ? { batchKey } : {}),
            })
          }
        }
        if (!newlyInspected) throw new ApiError('STATE_CONFLICT')
      }
      const result = await model.collection.updateOne(
        { _id: row._id, revision: row.revision, status: row.status },
        { $set: set, $inc: { revision: 1 } },
        { session },
      )
      if (result.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
      await audit(session, {
        ...cause,
        actorType: 'admin',
        actorId,
        afterDigest: digest,
        reason: input.reason,
        occurredAt: now,
      })
      if (kind === 'receive')
        await audit(session, {
          ...cause,
          action: 'claim.receipt.reference',
          operationKey: returnPhysicalHash(
            `receipt:${id}:${parseInput(receiveInput, raw).receiptReference}`,
          ),
          actorType: 'admin',
          actorId,
          afterDigest: digest,
          reason: parseInput(receiveInput, raw).receiptReference,
          occurredAt: now,
        })
      return {
        id,
        status: kind === 'receive' ? ('received' as const) : ('inspected' as const),
        revision: row.revision + 1,
      }
    })
  }
  return {
    receive: (token: string | undefined, id: unknown, input: unknown, key: unknown) =>
      perform(token, id, input, key, 'receive'),
    inspect: (token: string | undefined, id: unknown, input: unknown, key: unknown) =>
      perform(token, id, input, key, 'inspect'),
  }
}

export {
  createReturnHistoryService,
  createReturnLifecycleService,
  createReturnOperationsService,
  createReturnPhysicalService,
  createReturnService,
  refundClaimSnapshotAccess,
  returnNotificationProofAccess,
  returnReportAccess,
  refundClaimSelectionAccess,
}
