import type { ClientSession, Connection, HydratedDocument } from 'mongoose'
import type { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { variantStockAccess } from '../catalog/variants/variant.service.js'
import { allocationInput, stockSnapshot } from './inventory.schema.js'
import {
  inventoryMovementModel,
  inventoryReservationModel,
  type InventoryReservation,
} from './inventory.model.js'
import { verifyAllocationPersistence } from './inventory.persistence.js'

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
export function allocationService(
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
