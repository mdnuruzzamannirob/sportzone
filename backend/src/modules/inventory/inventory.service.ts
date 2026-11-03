import { createHash } from 'node:crypto'
import { type ClientSession, type Connection, type HydratedDocument, Types } from 'mongoose'
import { z } from 'zod'
import { inTransaction } from '../../shared/database/transaction.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { pageMeta } from '../../shared/pagination.js'
import type { AdminAccountAccess } from '../auth/auth.public.js'
import {
  type variantInventoryAccess,
  variantStockAccess,
} from '../catalog/products/variant.service.js'
import {
  type InventoryReservation,
  inventoryMovementModel,
  inventoryReservationModel,
} from './inventory.model.js'
import { verifyAllocationPersistence, verifyInventoryPersistence } from './inventory.persistence.js'
import type {
  AdjustmentResultSchema,
  InventoryFacetSchema,
  InventoryListSchema,
} from './inventory.schema.js'
import {
  adjustmentBody,
  adjustmentInput,
  allocationInput,
  inventoryParams,
  inventoryQuery,
  movementQuery,
  movementView,
  objectId,
  operationKey,
  stockSnapshot,
} from './inventory.schema.js'

type Command = z.output<typeof allocationInput>

type Action =
  | 'reserve'
  | 'commit_cod'
  | 'commit_hold'
  | 'release_hold'
  | 'release_commit'
  | 'dispatch'

// Trusted domain boundary, never an HTTP API. Callers validate current order/payment/coupon
// eligibility in THIS transaction and abort it on any error; no nested transaction is opened here.
function createAllocationService(
  connection: Connection,
  stock: ReturnType<typeof variantStockAccess> = variantStockAccess(connection),
  clock: () => Date = () => new Date(),
) {
  const reservations = inventoryReservationModel(connection)
  const movements = inventoryMovementModel(connection)
  const projection = (row: HydratedDocument<InventoryReservation>) => ({
    id: row._id.toHexString(),
    orderId: row.orderId.toHexString(),
    variantId: row.variantId.toHexString(),
    quantity: row.quantity,
    generation: row.generation,
    status: row.status,
    heldAt: row.heldAt,
    expiresAt: row.expiresAt,
    committedAt: row.committedAt,
    releasedAt: row.releasedAt,
    shippedAt: row.shippedAt,
  })
  async function apply(session: ClientSession, input: unknown, action: Action, heldAt?: Date) {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const parsed = allocationInput.safeParse(input)
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED')
    const command: Command = parsed.data
    const { orderId, variantId, quantity, generation, operationKey, reason } = command
    const delta = {
      physical: action === 'dispatch' ? -quantity : 0,
      reserved:
        action === 'reserve'
          ? quantity
          : action === 'commit_hold' || action === 'release_hold'
            ? -quantity
            : 0,
      committed:
        action === 'commit_hold' || action === 'commit_cod'
          ? quantity
          : action === 'release_commit' || action === 'dispatch'
            ? -quantity
            : 0,
    }
    await verifyAllocationPersistence(connection)
    const previous = await movements
      .findOne({ variantId, type: action, operationKey })
      .session(session)
      .lean()
    if (previous) {
      const reservation = previous.reservationId
        ? await reservations.findById(previous.reservationId).session(session)
        : null
      if (
        !reservation ||
        !previous.orderId?.equals(orderId) ||
        previous.reason !== reason ||
        previous.actor.type !== 'system' ||
        previous.actor.id != null ||
        previous.deltaPhysical !== delta.physical ||
        previous.deltaReserved !== delta.reserved ||
        previous.deltaCommitted !== delta.committed ||
        !reservation.variantId.equals(variantId) ||
        !reservation.orderId.equals(orderId) ||
        reservation.quantity !== quantity ||
        reservation.generation !== generation
      )
        throw new ApiError('STATE_CONFLICT')
      return projection(reservation)
    }
    const now = clock()
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid inventory clock.')
    const starts = action === 'reserve' || action === 'commit_cod'
    let row = await reservations.findOne({ orderId, variantId, generation }).session(session)
    if (starts) {
      const latest = await reservations
        .findOne({ orderId, variantId })
        .sort({ generation: -1 })
        .session(session)
      if (
        row ||
        (latest
          ? latest.status !== 'released' || generation !== latest.generation + 1
          : generation !== 1)
      )
        throw new ApiError('STATE_CONFLICT')
      if (
        action === 'reserve' &&
        (!(heldAt instanceof Date) ||
          !Number.isFinite(heldAt.getTime()) ||
          heldAt.getTime() > now.getTime() ||
          now.getTime() >= heldAt.getTime() + 900000 ||
          !Number.isFinite(new Date(heldAt.getTime() + 900000).getTime()))
      )
        throw new ApiError('VALIDATION_FAILED')
    } else {
      const expected = action === 'commit_hold' || action === 'release_hold' ? 'held' : 'committed'
      if (
        !row ||
        row.quantity !== quantity ||
        row.status !== expected ||
        row.activeKey !== 'active'
      )
        throw new ApiError('STATE_CONFLICT')
      const last = row.committedAt ?? row.heldAt
      if (!last || now.getTime() < last.getTime()) throw new ApiError('STATE_CONFLICT')
      if (action === 'commit_hold' && (!row.expiresAt || now.getTime() >= row.expiresAt.getTime()))
        throw new ApiError('STATE_CONFLICT')
    }
    const counters = await stock.change(variantId, delta, session)
    if (!counters) throw new ApiError('STATE_CONFLICT')
    stockSnapshot(counters)
    if (starts) {
      const [created] = await reservations.insertMany(
        [
          {
            orderId,
            variantId,
            quantity,
            generation,
            lastOperationKey: operationKey,
            status: action === 'reserve' ? 'held' : 'committed',
            activeKey: 'active',
            ...(action === 'reserve'
              ? {
                  heldAt: new Date(heldAt?.getTime() ?? Number.NaN),
                  expiresAt: new Date((heldAt?.getTime() ?? Number.NaN) + 900000),
                }
              : { committedAt: now }),
          },
        ],
        { session },
      )
      if (!created) throw new Error('Inventory reservation unavailable.')
      row = created
    } else {
      // The stock write serializes competing transitions for this SKU; this CAS also guards the row.
      const expected = action === 'commit_hold' || action === 'release_hold' ? 'held' : 'committed'
      const releasing = action === 'release_hold' || action === 'release_commit'
      row = await reservations.findOneAndUpdate(
        { _id: row?._id, status: expected, activeKey: 'active' },
        {
          $set: {
            status: releasing ? 'released' : action === 'dispatch' ? 'shipped' : 'committed',
            lastOperationKey: operationKey,
            ...(releasing
              ? { releasedAt: now, releaseReason: reason }
              : action === 'dispatch'
                ? { shippedAt: now }
                : { committedAt: now }),
          },
          $unset: { expiresAt: '', ...(action === 'commit_hold' ? {} : { activeKey: '' }) },
        },
        { session, returnDocument: 'after', runValidators: true },
      )
      if (!row) throw new ApiError('STATE_CONFLICT')
    }
    await movements.insertMany(
      [
        {
          variantId,
          orderId,
          reservationId: row._id,
          type: action,
          operationKey,
          deltaPhysical: delta.physical,
          deltaReserved: delta.reserved,
          deltaCommitted: delta.committed,
          actor: { type: 'system' },
          reason,
          occurredAt: now,
        },
      ],
      { session },
    )
    return projection(row)
  }
  return {
    async due(now: Date, limit: number, cursor?: string) {
      if (
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        (cursor !== undefined && !/^[a-f0-9]{24}$/.test(cursor))
      )
        throw new ApiError('VALIDATION_FAILED')
      await verifyAllocationPersistence(connection)
      return reservations
        .find({
          status: 'held',
          expiresAt: { $lte: now },
          ...(cursor ? { _id: { $gt: cursor } } : {}),
        })
        .sort({ _id: 1 })
        .limit(limit)
        .lean()
        .then((rows) =>
          rows.map((row) => ({
            cursor: row._id.toHexString(),
            orderId: row.orderId.toHexString(),
            generation: row.generation,
          })),
        )
    },
    async available(session: ClientSession, variantId: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const row = await stock.read(new Types.ObjectId(variantId), session)
      return row ? stockSnapshot(row).available : 0
    },
    async latestGeneration(session: ClientSession, orderId: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      await verifyAllocationPersistence(connection)
      const row = await reservations.findOne({ orderId }).sort({ generation: -1 }).session(session)
      return row?.generation
    },
    async generation(session: ClientSession, orderId: string, generation: number) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      return reservations
        .find({ orderId, generation })
        .session(session)
        .then((rows) => rows.map(projection))
    },
    // Capture one trusted heldAt in the outer transaction and reuse it for every line and coupon.
    reserve: (session: ClientSession, input: unknown, heldAt: Date) =>
      apply(session, input, 'reserve', heldAt),
    commitCod: (session: ClientSession, input: unknown) => apply(session, input, 'commit_cod'),
    commit: (session: ClientSession, input: unknown) => apply(session, input, 'commit_hold'),
    release(session: ClientSession, input: unknown, expectedStatus: 'held' | 'committed') {
      if (expectedStatus !== 'held' && expectedStatus !== 'committed')
        throw new ApiError('VALIDATION_FAILED')
      return apply(session, input, expectedStatus === 'held' ? 'release_hold' : 'release_commit')
    },
    ship: (session: ClientSession, input: unknown) => apply(session, input, 'dispatch'),
  }
}

function createInventoryAdminService(
  connection: Connection,
  access: AdminAccountAccess,
  stock: ReturnType<typeof createInventoryService>,
  variants: ReturnType<typeof variantInventoryAccess>,
  defaultThreshold: (session: ClientSession) => Promise<number>,
  audit: (session: ClientSession, event: unknown) => Promise<void>,
  moduleAccess: {
    schemaAdjustmentResult: AdjustmentResultSchema
    schemaInventoryFacet: InventoryFacetSchema
    schemaInventoryList: InventoryListSchema
  },
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
          const parsed = moduleAccess.schemaInventoryFacet.safeParse(
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
            data: parseInput(moduleAccess.schemaInventoryList, {
              variants: facet.variants,
              ...counters,
            }),
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
        return parseInput(moduleAccess.schemaAdjustmentResult, { ...result, stock: after })
      })
    },
  }
}

// Domain commands; inventory-admin.service owns transactional admin authorization and audit.
function createInventoryService(
  connection: Connection,
  stock: ReturnType<typeof variantStockAccess>,
  clock: () => Date = () => new Date(),
) {
  const movements = inventoryMovementModel(connection)
  return {
    async read(variantId: string, session?: ClientSession) {
      const id = objectId.safeParse(variantId)
      if (!id.success) throw new ApiError('VALIDATION_FAILED')
      const counters = await stock.read(id.data, session)
      if (!counters) throw new ApiError('NOT_FOUND')
      return stockSnapshot(counters)
    },
    async adjustPhysical(input: unknown, transaction?: ClientSession) {
      const parsed = adjustmentInput.safeParse(input)
      if (!parsed.success) throw new ApiError('VALIDATION_FAILED')
      const { variantId, actorId, deltaPhysical, operationKey, reason } = parsed.data
      await verifyInventoryPersistence(connection)
      const apply = async (session: ClientSession) => {
        if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
        const previous = await movements
          .findOne({ variantId, type: 'adjustment', operationKey })
          .session(session)
          .lean()
        if (previous) {
          if (
            previous.deltaPhysical !== deltaPhysical ||
            previous.deltaReserved !== 0 ||
            previous.deltaCommitted !== 0 ||
            previous.reason !== reason ||
            previous.actor.type !== 'admin' ||
            !previous.actor.id?.equals(actorId)
          )
            throw new ApiError('STATE_CONFLICT')
          return { movementId: previous._id.toHexString() }
        }
        const before = await stock.read(variantId, session)
        if (!before) throw new ApiError('NOT_FOUND')
        stockSnapshot(before)
        const now = clock()
        if (!Number.isFinite(now.getTime())) throw new Error('Invalid inventory clock.')
        const changed = await stock.change(
          variantId,
          { physical: deltaPhysical, reserved: 0, committed: 0 },
          session,
        )
        if (!changed) throw new ApiError('STATE_CONFLICT')
        stockSnapshot(changed)
        const [movement] = await movements.create(
          [
            {
              variantId,
              type: 'adjustment',
              deltaPhysical,
              deltaReserved: 0,
              deltaCommitted: 0,
              operationKey,
              reason,
              actor: { type: 'admin', id: actorId },
              occurredAt: now,
            },
          ],
          { session },
        )
        if (!movement) throw new Error('Inventory movement unavailable.')
        return { movementId: movement._id.toHexString() }
      }
      return transaction ? apply(transaction) : inTransaction(connection, apply)
    },
  }
}

const id = z.string().regex(/^[a-f0-9]{24}$/)

const command = z.strictObject({
  orderId: id,
  orderItemId: id,
  variantId: id,
  quantity: z.int().min(1).max(50),
  actorId: id,
  inspectionDigest: z.string().regex(/^[a-f0-9]{64}$/),
})

// Only the custody/inspection coordinator may invoke this capability in its fenced transaction.
function createRecoveryReceiptService(
  connection: Connection,
  clock: () => Date = () => new Date(),
) {
  const stock = variantStockAccess(connection),
    movements = inventoryMovementModel(connection)
  return async (session: ClientSession, raw: unknown) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const input = command.parse(raw),
      operationKey = `nondelivery-restock:${input.orderId}:${input.orderItemId}`,
      reason = `Inspected non-delivery recovery:${input.inspectionDigest}`
    await verifyInventoryPersistence(connection)
    const existing = await movements
      .findOne({ variantId: input.variantId, type: 'return_receipt', operationKey })
      .session(session)
    if (existing) {
      if (
        existing.deltaPhysical !== input.quantity ||
        existing.reason !== reason ||
        !existing.orderId?.equals(input.orderId)
      )
        throw new ApiError('STATE_CONFLICT')
      return
    }
    const now = clock()
    if (!Number.isFinite(now.getTime())) throw new ApiError('STATE_CONFLICT')
    const changed = await stock.change(
      new Types.ObjectId(input.variantId),
      { physical: input.quantity, reserved: 0, committed: 0 },
      session,
    )
    if (!changed) throw new ApiError('STATE_CONFLICT')
    await new movements({
      variantId: new Types.ObjectId(input.variantId),
      orderId: new Types.ObjectId(input.orderId),
      type: 'return_receipt',
      deltaPhysical: input.quantity,
      deltaReserved: 0,
      deltaCommitted: 0,
      operationKey,
      reason,
      actor: { type: 'admin', id: new Types.ObjectId(input.actorId) },
      occurredAt: now,
    }).save({ session })
  }
}

const returnReceiptId = z.string().regex(/^[a-f0-9]{24}$/)

const returnReceiptCommand = z.strictObject({
  orderId: returnReceiptId,
  claimId: returnReceiptId,
  orderItemId: returnReceiptId,
  variantId: returnReceiptId,
  actorId: returnReceiptId,
  quantity: z.int().min(1).max(50),
  batchKey: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
})

// Only the return inspection coordinator calls this inside its fenced transaction.
function createReturnReceiptService(connection: Connection, clock: () => Date = () => new Date()) {
  const stock = variantStockAccess(connection),
    movements = inventoryMovementModel(connection)
  return async (session: ClientSession, raw: unknown) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const input = returnReceiptCommand.parse(raw),
      operationKey = `return:${input.claimId}:${input.orderItemId}${input.batchKey ? `:${input.batchKey}` : ''}`
    await verifyInventoryPersistence(connection)
    if (
      await movements
        .exists({ variantId: input.variantId, type: 'return_receipt', operationKey })
        .session(session)
    )
      throw new ApiError('STATE_CONFLICT')
    const now = clock()
    if (!Number.isFinite(now.getTime())) throw new ApiError('STATE_CONFLICT')
    if (
      !(await stock.change(
        new Types.ObjectId(input.variantId),
        { physical: input.quantity, reserved: 0, committed: 0 },
        session,
      ))
    )
      throw new ApiError('STATE_CONFLICT')
    await new movements({
      variantId: new Types.ObjectId(input.variantId),
      orderId: new Types.ObjectId(input.orderId),
      type: 'return_receipt',
      deltaPhysical: input.quantity,
      deltaReserved: 0,
      deltaCommitted: 0,
      operationKey,
      reason: 'Inspected resellable return',
      actor: { type: 'admin', id: new Types.ObjectId(input.actorId) },
      occurredAt: now,
    }).save({ session })
  }
}

export {
  createAllocationService,
  createInventoryAdminService,
  createInventoryService,
  createRecoveryReceiptService,
  createReturnReceiptService,
}
