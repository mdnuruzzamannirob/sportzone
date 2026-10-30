import { isDeepStrictEqual } from 'node:util'
import { Types, type ClientSession, type Connection, type HydratedDocument } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { couponEligibilityInput } from './coupon.schema.js'
import { evaluateCouponEligibility } from './coupon.service.js'
import { couponModels, type CouponRedemption } from './coupon.model.js'
import { verifyCouponPersistence } from './coupon.persistence.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)
const commandInput = z.strictObject({
  couponId: id,
  orderId: id,
  generation: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
  operationKey: z
    .string()
    .min(1)
    .max(128)
    .refine(
      (value) =>
        value === value.trim() &&
        [...value].every(
          (character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127,
        ),
    ),
})
const acceptedShape = couponEligibilityInput.shape.accepted.unwrap().shape
const bindingInput = z.strictObject({
  orderId: id,
  couponId: id,
  userId: id.optional(),
  acceptedPricing: acceptedShape.pricing,
  currentPricing: acceptedShape.pricing,
  termsSnapshot: acceptedShape.terms,
})
type Action = 'reserve' | 'redeem_cod' | 'commit' | 'release_held' | 'release_redeemed'
// REQUIRED owning-order boundary: authorize must fence durable order/payment/lifecycle
// state in THIS session, verify action eligibility and return only authoritative snapshots.
// In particular release_redeemed is allowed only for eligible pre-dispatch cancellation.
export type CouponOrderAccess = {
  authorize(session: ClientSession, orderId: string, action: Action): Promise<unknown>
}
const max = Number.MAX_SAFE_INTEGER
export function couponAllocationService(
  connection: Connection,
  orders: CouponOrderAccess,
  clock: () => Date = () => new Date(),
) {
  const models = couponModels(connection)
  function terms(row: HydratedDocument<CouponRedemption>) {
    return {
      code: row.termsSnapshot.code,
      type: row.termsSnapshot.type,
      value: row.termsSnapshot.value,
      version: row.termsSnapshot.version,
      discountPoisha: row.termsSnapshot.discountPoisha,
      eligibleLineIds: row.termsSnapshot.eligibleLineIds.map((value) => value.toHexString()),
    }
  }
  function view(row: HydratedDocument<CouponRedemption>) {
    return {
      id: row._id.toHexString(),
      couponId: row.couponId.toHexString(),
      orderId: row.orderId.toHexString(),
      generation: row.generation,
      status: row.status,
      heldAt: row.heldAt,
      expiresAt: row.expiresAt,
      redeemedAt: row.redeemedAt,
      releasedAt: row.releasedAt,
    }
  }
  async function apply(session: ClientSession, raw: unknown, action: Action, heldAt?: Date) {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const command = parseInput(commandInput, raw),
      now = clock()
    if (!Number.isFinite(now.getTime())) throw new ApiError('VALIDATION_FAILED')
    const counterUpdate = (held: number, redeemed: number) => [
      {
        $set: {
          heldCount: { $add: ['$heldCount', held] },
          redeemedCount: { $add: ['$redeemedCount', redeemed] },
          revision: { $add: ['$revision', 1] },
          updatedAt: now,
        },
      },
    ]
    try {
      await verifyCouponPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const binding = parseInput(
      bindingInput,
      await orders.authorize(session, command.orderId, action),
    )
    if (binding.orderId !== command.orderId || binding.couponId !== command.couponId)
      throw new ApiError('STATE_CONFLICT')
    const couponId = new Types.ObjectId(command.couponId),
      orderId = new Types.ObjectId(command.orderId)
    let row = await models.redemptions
      .findOne({ couponId, orderId, generation: command.generation })
      .session(session)
    if (
      row &&
      (row.userId?.toHexString() !== binding.userId ||
        !isDeepStrictEqual(terms(row), binding.termsSnapshot))
    )
      throw new ApiError('STATE_CONFLICT')
    const starting = action === 'reserve' || action === 'redeem_cod'
    if (starting && row) {
      if ((action === 'reserve') !== Boolean(row.heldAt)) throw new ApiError('STATE_CONFLICT')
      return view(row) // Natural generation identity; never revive or extend it.
    }
    if (action === 'commit' && row?.status === 'redeemed') return view(row)
    if ((action === 'release_held' || action === 'release_redeemed') && row?.status === 'released')
      return view(row)
    const coupon = await models.coupons.findById(couponId).session(session)
    if (!coupon) throw new ApiError('STATE_CONFLICT')
    let customer = binding.userId
      ? await models.customers
          .findOne({ couponId, userId: new Types.ObjectId(binding.userId) })
          .session(session)
      : null
    let deltaHeld = 0,
      deltaRedeemed = 0
    let snapshot = binding.termsSnapshot
    if (starting) {
      const latest = await models.redemptions
        .findOne({ couponId, orderId })
        .sort({ generation: -1 })
        .session(session)
      if (
        latest
          ? latest.status !== 'released' || command.generation !== latest.generation + 1
          : command.generation !== 1
      )
        throw new ApiError('STATE_CONFLICT')
      if (
        action === 'reserve' &&
        (!(heldAt instanceof Date) ||
          !Number.isFinite(heldAt.getTime()) ||
          heldAt > now ||
          now.getTime() >= heldAt.getTime() + 900000 ||
          !Number.isFinite(new Date(heldAt.getTime() + 900000).getTime()))
      )
        throw new ApiError('VALIDATION_FAILED')
      const evaluated = evaluateCouponEligibility(
        {
          code: binding.termsSnapshot.code,
          coupon: {
            id: command.couponId,
            codeNormalized: coupon.codeNormalized,
            type: coupon.type,
            value: coupon.value,
            minEligibleSubtotalPoisha: coupon.minEligibleSubtotalPoisha,
            startsAt: coupon.startsAt,
            expiresAt: coupon.expiresAt,
            status: coupon.status,
            heldCount: coupon.heldCount,
            redeemedCount: coupon.redeemedCount,
            termsVersion: coupon.termsVersion,
            overallLimit: coupon.overallLimit,
            perCustomerLimit: coupon.perCustomerLimit,
          },
          principal: binding.userId
            ? { kind: 'customer', userId: binding.userId }
            : { kind: 'guest' },
          ...(binding.userId
            ? {
                customerUsage: {
                  couponId: command.couponId,
                  userId: binding.userId,
                  heldCount: customer?.heldCount ?? 0,
                  redeemedCount: customer?.redeemedCount ?? 0,
                },
              }
            : {}),
          pricing: binding.currentPricing,
          accepted: {
            orderId: command.orderId,
            couponId: command.couponId,
            pricing: binding.acceptedPricing,
            terms: binding.termsSnapshot,
          },
        },
        now,
      )
      snapshot = evaluated.termsSnapshot
      deltaHeld = action === 'reserve' ? 1 : 0
      deltaRedeemed = action === 'redeem_cod' ? 1 : 0
      const changed = await models.coupons.findOneAndUpdate(
        {
          _id: couponId,
          revision: coupon.revision,
          status: 'active',
          $expr: {
            $and: [
              { $lt: ['$revision', max] },
              { $lt: [{ $add: ['$heldCount', '$redeemedCount'] }, coupon.overallLimit ?? max] },
            ],
          },
        },
        counterUpdate(deltaHeld, deltaRedeemed),
        { session, returnDocument: 'after', updatePipeline: true, timestamps: false },
      )
      if (!changed) throw new ApiError('COUPON_UNAVAILABLE')
      if (binding.userId && !customer) {
        const [created] = await models.customers.create(
          [
            {
              couponId,
              userId: new Types.ObjectId(binding.userId),
              heldCount: 0,
              redeemedCount: 0,
              revision: 0,
            },
          ],
          { session },
        )
        if (!created) throw new ApiError('STATE_CONFLICT')
        customer = created
      }
    } else {
      const expected = action === 'commit' || action === 'release_held' ? 'held' : 'redeemed'
      const began = row?.redeemedAt ?? row?.heldAt
      if (
        !row ||
        row.status !== expected ||
        row.activeKey !== 'active' ||
        !began ||
        began > now ||
        (action === 'commit' && (!row.expiresAt || now >= row.expiresAt))
      )
        throw new ApiError('STATE_CONFLICT')
      deltaHeld = expected === 'held' ? -1 : 0
      deltaRedeemed = action === 'commit' ? 1 : expected === 'redeemed' ? -1 : 0
      const changed = await models.coupons.findOneAndUpdate(
        {
          _id: couponId,
          $expr: {
            $and: [
              { $lt: ['$revision', max] },
              { $gte: ['$heldCount', -deltaHeld] },
              { $gte: ['$redeemedCount', -Math.min(0, deltaRedeemed)] },
              { $lte: ['$redeemedCount', max - Math.max(0, deltaRedeemed)] },
            ],
          },
        },
        counterUpdate(deltaHeld, deltaRedeemed),
        { session, returnDocument: 'after', updatePipeline: true, timestamps: false },
      )
      if (!changed) throw new ApiError('STATE_CONFLICT')
    }
    if (binding.userId) {
      if (!customer) throw new ApiError('STATE_CONFLICT')
      const conditions = starting
        ? [{ $lt: [{ $add: ['$heldCount', '$redeemedCount'] }, coupon.perCustomerLimit ?? max] }]
        : [
            { $gte: ['$heldCount', -deltaHeld] },
            { $gte: ['$redeemedCount', -Math.min(0, deltaRedeemed)] },
            { $lte: ['$redeemedCount', max - Math.max(0, deltaRedeemed)] },
          ]
      const changed = await models.customers.findOneAndUpdate(
        {
          _id: customer._id,
          revision: customer.revision,
          $expr: { $and: [{ $lt: ['$revision', max] }, ...conditions] },
        },
        counterUpdate(deltaHeld, deltaRedeemed),
        { session, returnDocument: 'after', updatePipeline: true, timestamps: false },
      )
      if (!changed) throw new ApiError(starting ? 'COUPON_UNAVAILABLE' : 'STATE_CONFLICT')
    }
    if (starting) {
      const [created] = await models.redemptions.create(
        [
          {
            couponId,
            orderId,
            ...(binding.userId ? { userId: new Types.ObjectId(binding.userId) } : {}),
            generation: command.generation,
            status: action === 'reserve' ? 'held' : 'redeemed',
            activeKey: 'active',
            termsSnapshot: {
              ...snapshot,
              eligibleLineIds: snapshot.eligibleLineIds.map((value) => new Types.ObjectId(value)),
            },
            lastOperationKey: command.operationKey,
            ...(action === 'reserve'
              ? {
                  heldAt: new Date(heldAt?.getTime() ?? Number.NaN),
                  expiresAt: new Date((heldAt?.getTime() ?? Number.NaN) + 900000),
                }
              : { redeemedAt: now }),
          },
        ],
        { session },
      )
      if (!created) throw new ApiError('STATE_CONFLICT')
      row = created
    } else {
      const committing = action === 'commit'
      row = await models.redemptions.findOneAndUpdate(
        {
          _id: row?._id,
          status: committing || action === 'release_held' ? 'held' : 'redeemed',
          activeKey: 'active',
        },
        {
          $set: {
            status: committing ? 'redeemed' : 'released',
            lastOperationKey: command.operationKey,
            ...(committing ? { redeemedAt: now } : { releasedAt: now }),
          },
          $unset: { expiresAt: '', ...(committing ? {} : { activeKey: '' }) },
        },
        { session, returnDocument: 'after' },
      )
      if (!row) throw new ApiError('STATE_CONFLICT')
    }
    return view(row)
  }
  return {
    reserve: (session: ClientSession, input: unknown, heldAt: Date) =>
      apply(session, input, 'reserve', heldAt),
    redeemCod: (session: ClientSession, input: unknown) => apply(session, input, 'redeem_cod'),
    commit: (session: ClientSession, input: unknown) => apply(session, input, 'commit'),
    release(session: ClientSession, input: unknown, expectedStatus: 'held' | 'redeemed') {
      if (expectedStatus !== 'held' && expectedStatus !== 'redeemed')
        throw new ApiError('VALIDATION_FAILED')
      return apply(session, input, expectedStatus === 'held' ? 'release_held' : 'release_redeemed')
    },
  }
}

export function couponGenerationAccess(connection: Connection) {
  const models = couponModels(connection)
  return async (session: ClientSession, orderId: string, generation: number) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyCouponPersistence(connection)
    const row = await models.redemptions.findOne({ orderId, generation }).session(session)
    return row
      ? {
          couponId: row.couponId.toHexString(),
          status: row.status,
          heldAt: row.heldAt,
          expiresAt: row.expiresAt,
        }
      : null
  }
}
