import { Types, type ClientSession, type Connection } from 'mongoose'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { buildOrderSnapshot } from './order-snapshot.service.js'
import { orderModels } from './order.model.js'
import { verifyOrderPersistence } from './order.persistence.js'
import { initialOrderResult, orderCreateCommand } from './order.schema.js'
import { cancellationModel } from './cancellation.model.js'
import { verifyCancellationPersistence } from './cancellation.persistence.js'
// REQUIRED checkout coordinator capability. In THIS transaction it must authorize current
// principal/consent, bind the intended order/intent, consume its valid quote and coordinate
// durable intent outcome. Real allocations/payment intent must join before outer commit.
export type OrderCreationAccess = {
  authorize(
    session: ClientSession,
    command: { orderId: string; checkoutIntentId: string },
  ): Promise<unknown>
}
export function orderService(
  connection: Connection,
  checkout: OrderCreationAccess,
  audit: (session: ClientSession, event: unknown) => Promise<void>,
  clock: () => Date = () => new Date(),
) {
  const { orders, balances } = orderModels(connection)
  return {
    async create(session: ClientSession, raw: unknown) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const command = parseInput(orderCreateCommand, raw)
      try {
        await verifyOrderPersistence(connection)
      } catch {
        throw new ApiError('SERVICE_UNAVAILABLE')
      }
      const proof = await checkout.authorize(session, command)
      const placedAt = clock(),
        data = buildOrderSnapshot(proof, placedAt)
      if (
        data.proof.orderId !== command.orderId ||
        data.proof.checkoutIntentId !== command.checkoutIntentId
      )
        throw new ApiError('STATE_CONFLICT')
      const { proof: accepted, ...snapshots } = data
      try {
        const row = new orders({
          ...snapshots,
          _id: command.orderId,
          checkoutIntentId: command.checkoutIntentId,
          userId: accepted.userId,
          orderNumber: `SZ-${randomBytes(12).toString('hex').toUpperCase()}`,
          placedAt,
          fulfillmentStatus: 'pending',
          schemaVersion: 1,
          fulfillmentHold: data.paymentMethod === 'online' ? 'payment_pending' : 'none',
          ...(accepted.notes ? { notes: accepted.notes } : {}),
        })
        await row.save({ session })
        for (const item of data.items)
          await new balances({
            orderId: row._id,
            orderItemId: new Types.ObjectId(item.id),
            purchasedQty: item.quantity,
            unitCoverage: Array.from({ length: item.quantity }, (_v, index) => ({
              ordinal: index + 1,
              netEntitlementPoisha:
                item.unitRefundBasePoisha + (index < item.unitRefundRemainderQty ? 1 : 0),
              claimState: 'available',
              refundHeldPoisha: 0,
              refundCompletedPoisha: 0,
            })),
            activeClaimQty: 0,
            resolvedClaimQty: 0,
            refundedMerchandiseQty: 0,
            revision: 0,
          }).save({ session })
        await audit(session, {
          actorType: accepted.userId ? 'customer' : 'system',
          ...(accepted.userId ? { actorId: accepted.userId } : {}),
          action: 'order.create',
          targetType: 'order',
          targetId: row._id.toHexString(),
          operationKey: createHash('sha256').update(command.operationKey).digest('hex'),
          occurredAt: placedAt,
          afterDigest: createHash('sha256')
            .update(
              JSON.stringify({
                commercialDigest: accepted.commercialDigest,
                orderId: command.orderId,
                checkoutIntentId: command.checkoutIntentId,
              }),
            )
            .digest('hex'),
        })
        return parseInput(initialOrderResult, {
          id: row._id.toHexString(),
          orderNumber: row.orderNumber,
          fulfillmentStatus: row.fulfillmentStatus,
          paymentMethod: row.paymentMethod,
          revision: row.revision,
        })
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
          throw new ApiError('STATE_CONFLICT')
        throw error
      }
    },
  }
}

// Narrow checkout-only projection: intent scope is authorized by checkout, while canonical order
// ownership and intent linkage are checked again here. Never returns contact/financial secrets.
export function checkoutOrderReadAccess(connection: Connection) {
  const { orders } = orderModels(connection)
  return async (
    session: ClientSession,
    principal: import('../auth/checkout-access.service.js').CheckoutPrincipal,
    orderId: string,
    intentId: string,
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    if (principal.scopeType === 'customer' && !principal.profile) throw new ApiError('FORBIDDEN')
    const row = await orders
      .findOne({
        _id: orderId,
        checkoutIntentId: intentId,
        userId: principal.scopeType === 'customer' ? (principal.profile?.id ?? null) : null,
      })
      .session(session)
    if (!row) throw new ApiError('STATE_CONFLICT')
    return {
      id: row._id.toHexString(),
      orderNumber: row.orderNumber,
      fulfillmentStatus: row.fulfillmentStatus,
      paymentMethod: row.paymentMethod,
      revision: row.revision,
      placedAt: row.placedAt.toISOString(),
      finalTotalPoisha: row.pricingSnapshot.finalTotalPoisha,
      currency: row.pricingSnapshot.currency,
      ...(row.fulfillmentHold ? { fulfillmentHold: row.fulfillmentHold } : {}),
    }
  }
}

// Initial checkout allocation only. Payment commits and cancellation/release need their own
// durable eligibility capability; this access deliberately cannot authorize those later transitions.
export function initialOrderAllocationAccess(connection: Connection) {
  const { orders } = orderModels(connection)
  return {
    async authorize(session: ClientSession, orderId: string, generation: number, action: string) {
      if (!session.inTransaction() || generation !== 1 || !['cod', 'hold'].includes(action))
        throw new ApiError('STATE_CONFLICT')
      const row = await orders.findOneAndUpdate(
        {
          _id: orderId,
          fulfillmentStatus: 'pending',
          paymentMethod: action === 'cod' ? 'cod' : 'online',
          confirmedAt: { $exists: false },
          shippedAt: { $exists: false },
          cancelledAt: { $exists: false },
          revision: { $lt: Number.MAX_SAFE_INTEGER },
        },
        { $inc: { revision: 1 } },
        { session, returnDocument: 'after' },
      )
      if (!row) throw new ApiError('STATE_CONFLICT')
      return orderAllocationBinding(row, generation)
    },
  }
}

export function orderAllocationBinding(
  row: import('mongoose').HydratedDocument<import('./order.model.js').Order>,
  generation: number,
) {
  const items = row.items.map((item) => ({
    id: item.id.toHexString(),
    variantId: item.variantId.toHexString(),
    quantity: item.quantity,
    couponEligible: item.couponEligible,
    regularUnitPoisha: item.regularUnitPoisha,
    effectiveUnitPoisha: item.effectiveUnitPoisha,
  }))
  return {
    orderId: row._id.toHexString(),
    placedAt: row.placedAt,
    generation,
    ...(row.userId ? { userId: row.userId.toHexString() } : {}),
    pricing: {
      items,
      deliveryChargePoisha: row.pricingSnapshot.deliveryChargePoisha,
    },
    ...(row.couponSnapshot
      ? {
          coupon: {
            couponId: row.couponSnapshot.couponId.toHexString(),
            code: row.couponSnapshot.code,
            type: row.couponSnapshot.type,
            value: row.couponSnapshot.value,
            version: row.couponSnapshot.termsVersion,
            discountPoisha: row.couponSnapshot.discountPoisha,
            eligibleLineIds: row.items
              .filter((item) => item.couponEligible)
              .map((item) => item.id.toHexString()),
          },
        }
      : {}),
  }
}

export function expiredOrderAllocationAccess(
  connection: Connection,
  payment: (session: ClientSession, orderId: string) => Promise<boolean>,
) {
  const { orders } = orderModels(connection)
  return {
    async authorize(session: ClientSession, orderId: string, generation: number, action: string) {
      if (!session.inTransaction() || action !== 'release_held')
        throw new ApiError('STATE_CONFLICT')
      if (!(await payment(session, orderId))) throw new ApiError('STATE_CONFLICT')
      const row = await orders.findOneAndUpdate(
        {
          _id: orderId,
          paymentMethod: 'online',
          fulfillmentStatus: 'pending',
          fulfillmentHold: 'payment_pending',
          confirmedAt: { $exists: false },
          shippedAt: { $exists: false },
          cancelledAt: { $exists: false },
          revision: { $lt: Number.MAX_SAFE_INTEGER },
        },
        { $inc: { revision: 1 } },
        { session, returnDocument: 'after' },
      )
      if (!row) throw new ApiError('STATE_CONFLICT')
      return orderAllocationBinding(row, generation)
    },
  }
}

export function guestOrderAccess(connection: Connection) {
  const { orders } = orderModels(connection)
  return {
    verifyPersistence: () => verifyOrderPersistence(connection),
    async lookup(session: ClientSession, orderNumber: string, email: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const row = await orders
        .findOne({
          orderNumber,
          userId: null,
          'customerSnapshot.emailNormalized': email,
        })
        .session(session)
      return row
        ? {
            id: row._id.toHexString(),
            email: row.customerSnapshot.emailNormalized,
            revision: row.guestAccessChallengeRevision,
          }
        : null
    },
    async issue(session: ClientSession, orderId: string, expectedRevision: number) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const row = await orders.findOneAndUpdate(
        {
          _id: orderId,
          userId: null,
          guestAccessChallengeRevision: expectedRevision,
          $expr: {
            $lt: ['$guestAccessChallengeRevision', Number.MAX_SAFE_INTEGER],
          },
        },
        { $inc: { guestAccessChallengeRevision: 1 } },
        { session, returnDocument: 'after' },
      )
      if (!row) throw new ApiError('STATE_CONFLICT')
      return row.guestAccessChallengeRevision
    },
    async verify(
      session: ClientSession | undefined,
      orderId: string,
      revision?: number,
      email?: string,
    ) {
      const query = orders.exists({
        _id: orderId,
        userId: null,
        ...(revision !== undefined ? { guestAccessChallengeRevision: revision } : {}),
        ...(email ? { 'customerSnapshot.emailNormalized': email } : {}),
      })
      if (session) query.session(session)
      return Boolean(await query)
    },
    async consume(session: ClientSession, orderId: string, revision: number, email: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const result = await orders.updateOne(
        {
          _id: orderId,
          userId: null,
          'customerSnapshot.emailNormalized': email,
          guestAccessChallengeRevision: revision,
          $expr: {
            $lt: ['$guestAccessChallengeRevision', Number.MAX_SAFE_INTEGER],
          },
        },
        { $inc: { guestAccessChallengeRevision: 1 } },
        { session },
      )
      return result.modifiedCount === 1
    },
  }
}

// Only an authenticated customer or proven guest scope may request this private projection.
export function paymentMethodOrderAccess(connection: Connection) {
  const { orders } = orderModels(connection)
  return async (
    session: ClientSession,
    orderId: string,
    scope: { customerId?: string; guestOrderId?: string },
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    if (!scope.customerId && scope.guestOrderId !== orderId) throw new ApiError('NOT_FOUND')
    try {
      await verifyOrderPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const row = await orders
      .findOne({ _id: orderId, userId: scope.customerId ?? null })
      .session(session)
    if (!row) throw new ApiError('NOT_FOUND')
    return {
      method: row.paymentMethod,
      cancelled: row.fulfillmentStatus === 'cancelled',
    }
  }
}

export function paymentAllocationOrderAccess(
  connection: Connection,
  eligible: (session: ClientSession, orderId: string) => Promise<void>,
) {
  const { orders } = orderModels(connection)
  return {
    async authorize(session: ClientSession, orderId: string, generation: number, action: string) {
      if (
        !session.inTransaction() ||
        !Number.isSafeInteger(generation) ||
        generation < 1 ||
        !['hold', 'release_held'].includes(action)
      )
        throw new ApiError('STATE_CONFLICT')
      await eligible(session, orderId)
      await verifyOrderPersistence(connection)
      const row = await orders.findOneAndUpdate(
        {
          _id: orderId,
          paymentMethod: 'online',
          fulfillmentStatus: 'pending',
          fulfillmentHold: { $in: ['payment_pending', 'allocation_shortfall'] },
          confirmedAt: { $exists: false },
          shippedAt: { $exists: false },
          cancelledAt: { $exists: false },
          revision: { $lt: Number.MAX_SAFE_INTEGER },
        },
        { $inc: { revision: 1 }, $set: { fulfillmentHold: 'payment_pending' } },
        { session, returnDocument: 'after' },
      )
      if (!row) throw new ApiError('STATE_CONFLICT')
      return orderAllocationBinding(row, generation)
    },
    async shortfall(session: ClientSession, orderId: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      await eligible(session, orderId)
      await verifyOrderPersistence(connection)
      const row = await orders.updateOne(
        {
          _id: orderId,
          paymentMethod: 'online',
          fulfillmentStatus: 'pending',
          fulfillmentHold: { $in: ['payment_pending', 'allocation_shortfall'] },
          revision: { $lt: Number.MAX_SAFE_INTEGER },
        },
        {
          $inc: { revision: 1 },
          $set: { fulfillmentHold: 'allocation_shortfall' },
        },
        { session },
      )
      if (row.matchedCount !== 1) throw new ApiError('STATE_CONFLICT')
    },
  }
}

export function paymentInitiationOrderData(connection: Connection) {
  const { orders } = orderModels(connection)
  return {
    async authorize(session: ClientSession, orderId: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      await verifyOrderPersistence(connection)
      const row = await orders.findOneAndUpdate(
        {
          _id: orderId,
          paymentMethod: 'online',
          fulfillmentStatus: 'pending',
          fulfillmentHold: { $in: ['payment_pending', 'allocation_shortfall'] },
          confirmedAt: { $exists: false },
          shippedAt: { $exists: false },
          cancelledAt: { $exists: false },
          revision: { $lt: Number.MAX_SAFE_INTEGER },
        },
        { $inc: { revision: 1 } },
        { session, returnDocument: 'after' },
      )
      if (!row) throw new ApiError('STATE_CONFLICT')
      return row.pricingSnapshot.finalTotalPoisha
    },
    async redirectAllowed(session: ClientSession, orderId: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      return Boolean(
        await orders
          .exists({
            _id: orderId,
            paymentMethod: 'online',
            fulfillmentStatus: 'pending',
            fulfillmentHold: 'payment_pending',
            confirmedAt: { $exists: false },
            shippedAt: { $exists: false },
            cancelledAt: { $exists: false },
          })
          .session(session),
      )
    },
    async metadata(session: ClientSession, orderId: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const row = await orders.findById(orderId).session(session)
      if (!row?.deliverySnapshot.postalCode) throw new ApiError('BUSINESS_RULE_VIOLATION')
      const address = {
        address: row.deliverySnapshot.street,
        city: row.deliverySnapshot.districtKey,
        postcode: row.deliverySnapshot.postalCode,
        country: 'Bangladesh' as const,
        ...(row.deliverySnapshot.addressLine2
          ? { addressLine2: row.deliverySnapshot.addressLine2 }
          : {}),
      }
      return {
        customer: {
          ...address,
          name: row.customerSnapshot.name,
          email: row.customerSnapshot.emailNormalized,
          phone: row.customerSnapshot.phone,
        },
        shipping: { ...address, name: row.deliverySnapshot.recipient },
        itemCount: row.items.reduce((total, item) => total + item.quantity, 0),
        productName: row.items.map((item) => item.productName).join(', '),
        productCategory: 'Sports',
      }
    },
  }
}

// Internal verified-funding capability. The caller must fence the canonical payment and durable
// receipt in the SAME transaction. This is not a browser mutation or a fulfillment authorization API.
export function verifiedFundingOrderAccess(connection: Connection) {
  const { orders } = orderModels(connection)
  return {
    async notificationTarget(session: ClientSession, orderId: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const row = await orders.findById(orderId).session(session)
      if (!row) throw new ApiError('STATE_CONFLICT')
      return {
        orderId: row._id,
        ...(row.userId ? { userId: row.userId } : {}),
        orderNumber: row.orderNumber,
        email: row.customerSnapshot.emailNormalized,
        name: row.customerSnapshot.name,
      }
    },
    async riskState(session: ClientSession, orderId: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      await verifyOrderPersistence(connection)
      const row = await orders.findById(orderId).session(session)
      if (!row) throw new ApiError('NOT_FOUND')
      return row.fulfillmentHold ?? 'none'
    },
    async inspect(session: ClientSession, orderId: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      await verifyOrderPersistence(connection)
      const row = await orders.findOneAndUpdate(
        {
          _id: orderId,
          paymentMethod: 'online',
          revision: { $lt: Number.MAX_SAFE_INTEGER },
        },
        { $inc: { revision: 1 } },
        { session, returnDocument: 'after' },
      )
      if (!row) return undefined
      return {
        binding: orderAllocationBinding(row, 1),
        expectedPoisha: row.pricingSnapshot.finalTotalPoisha,
        eligible:
          row.fulfillmentStatus === 'pending' &&
          !row.cancelledAt &&
          !row.shippedAt &&
          !row.confirmedAt,
        recoverable:
          ['pending', 'confirmed', 'processing'].includes(row.fulfillmentStatus) &&
          !row.cancelledAt &&
          !row.shippedAt,
        cancelled: row.fulfillmentStatus === 'cancelled',
      }
    },
    async finish(session: ClientSession, orderId: string, committed: boolean, risk: boolean) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const row = await orders.findById(orderId).session(session)
      if (!row || row.fulfillmentStatus === 'cancelled' || row.cancelledAt) return
      if (!risk && !['pending', 'confirmed', 'processing'].includes(row.fulfillmentStatus)) return
      // Confirmation/deadline and outbound notifications retain their owning workflow. Committing
      // capacity is distinct from confirming fulfillment; never invent compliance clearance here.
      await orders.updateOne(
        {
          _id: row._id,
          fulfillmentStatus: row.fulfillmentStatus,
          revision: row.revision,
        },
        {
          $inc: { revision: 1 },
          $set: {
            fulfillmentHold: risk
              ? 'risk_review'
              : committed
                ? row.fulfillmentStatus === 'pending'
                  ? 'admin_review'
                  : 'none'
                : 'allocation_shortfall',
          },
        },
        { session },
      )
    },
  }
}

// Returns receives only ordinal-selection authority, never the private balance model. Eligibility
// and current principal scope must be established by the owning coordinator in this transaction.
export function claimQuantityAccess(connection: Connection) {
  const { balances } = orderModels(connection)
  return async (
    session: ClientSession,
    input: {
      orderId: string
      claimId: string
      items: { orderItemId: string; quantity: number }[]
    },
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyOrderPersistence(connection)
    const selected: { orderItemId: string; ordinals: number[] }[] = []
    for (const item of input.items) {
      const row = await balances
        .findOne({ orderId: input.orderId, orderItemId: item.orderItemId })
        .session(session)
      if (!row || row.revision >= Number.MAX_SAFE_INTEGER) throw new ApiError('STATE_CONFLICT')
      const available = row.unitCoverage
        .filter(
          (u) =>
            u.claimState === 'available' &&
            !u.claimId &&
            u.refundHeldPoisha === 0 &&
            u.refundCompletedPoisha === 0 &&
            !u.restockOperationKey,
        )
        .slice(0, item.quantity)
      if (available.length !== item.quantity) throw new ApiError('BUSINESS_RULE_VIOLATION')
      const set: Record<string, unknown> = {}
      for (const unit of available) {
        set[`unitCoverage.${unit.ordinal - 1}.claimState`] = 'protected'
        set[`unitCoverage.${unit.ordinal - 1}.claimId`] = new Types.ObjectId(input.claimId)
      }
      const result = await balances.updateOne(
        { _id: row._id, revision: row.revision },
        { $set: set, $inc: { revision: 1, activeClaimQty: item.quantity } },
        { session },
      )
      if (result.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
      selected.push({
        orderItemId: item.orderItemId,
        ordinals: available.map((u) => u.ordinal),
      })
    }
    return selected
  }
}

// Scope and revision fence belong to Orders; Returns never reads its private model.
export function claimEligibilityOrderAccess(connection: Connection) {
  const { orders } = orderModels(connection)
  return async (
    session: ClientSession,
    orderId: string,
    principal: import('../auth/checkout-access.service.js').OrderPrincipal,
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyOrderPersistence(connection)
    if (principal.kind === 'guest_order' && principal.orderId !== orderId)
      throw new ApiError('NOT_FOUND')
    const row = await orders.findOneAndUpdate(
      {
        _id: orderId,
        userId: principal.kind === 'customer' ? principal.userId : null,
        revision: { $lt: Number.MAX_SAFE_INTEGER },
      },
      { $inc: { revision: 1 } },
      { session, returnDocument: 'after' },
    )
    if (!row) throw new ApiError('NOT_FOUND')
    return { status: row.fulfillmentStatus, deliveredAt: row.deliveredAt }
  }
}

export function claimReviewQuantityAccess(connection: Connection) {
  const { balances } = orderModels(connection)
  return async (
    session: ClientSession,
    input: {
      orderId: string
      claimId: string
      items: { orderItemId: string; protected: number[]; approved: number[] }[]
      resolve: boolean
    },
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyOrderPersistence(connection)
    for (const item of input.items) {
      const row = await balances
        .findOne({ orderId: input.orderId, orderItemId: item.orderItemId })
        .session(session)
      if (
        !row ||
        row.revision >= Number.MAX_SAFE_INTEGER ||
        new Set(item.protected).size !== item.protected.length ||
        new Set(item.approved).size !== item.approved.length ||
        item.approved.some((n) => !item.protected.includes(n))
      )
        throw new ApiError('STATE_CONFLICT')
      const set: Record<string, unknown> = {}
      let released = 0,
        resolved = 0
      for (const ordinal of item.protected) {
        const unit = row.unitCoverage.find((u) => u.ordinal === ordinal)
        if (
          !unit ||
          unit.claimId?.toHexString() !== input.claimId ||
          unit.claimState !== 'protected'
        )
          throw new ApiError('STATE_CONFLICT')
        const retained = item.approved.includes(ordinal)
        if (
          !retained &&
          (unit.refundHeldPoisha || unit.refundCompletedPoisha || unit.restockOperationKey)
        )
          throw new ApiError('STATE_CONFLICT')
        if (!retained) {
          set[`unitCoverage.${ordinal - 1}.claimState`] = 'available'
          released++
        } else if (input.resolve) {
          set[`unitCoverage.${ordinal - 1}.claimState`] = 'resolved'
          resolved++
        }
      }
      const unset = Object.fromEntries(
        item.protected
          .filter((n) => !item.approved.includes(n))
          .map((n) => [`unitCoverage.${n - 1}.claimId`, '']),
      )
      const result = await balances.updateOne(
        { _id: row._id, revision: row.revision },
        {
          $set: {
            ...set,
            activeClaimQty: row.activeClaimQty - released - resolved,
            resolvedClaimQty: row.resolvedClaimQty + resolved,
          },
          ...(released ? { $unset: unset } : {}),
          $inc: { revision: 1 },
        },
        { session },
      )
      if (result.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
    }
  }
}

// The caller must already hold the reviewed claim in this transaction. Only canonical
// order snapshots and protected ordinals can authorize a physical return movement.
export function claimRestockAccess(connection: Connection) {
  const { orders, balances } = orderModels(connection)
  return async (
    session: ClientSession,
    input: {
      orderId: string
      claimId: string
      orderItemId: string
      ordinals: number[]
      operationKey: string
    },
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyOrderPersistence(connection)
    if (!input.ordinals.length || new Set(input.ordinals).size !== input.ordinals.length)
      throw new ApiError('STATE_CONFLICT')
    const order = await orders
      .findOne({ _id: input.orderId, fulfillmentStatus: 'delivered' })
      .session(session)
    const item = order?.items.find((line) => line.id.toHexString() === input.orderItemId)
    const row = await balances
      .findOne({ orderId: input.orderId, orderItemId: input.orderItemId })
      .session(session)
    if (!item || !row || row.revision >= Number.MAX_SAFE_INTEGER)
      throw new ApiError('STATE_CONFLICT')
    const set: Record<string, unknown> = {}
    for (const ordinal of input.ordinals) {
      const unit = row.unitCoverage.find((u) => u.ordinal === ordinal)
      if (
        !unit ||
        unit.claimId?.toHexString() !== input.claimId ||
        unit.claimState !== 'protected' ||
        unit.restockOperationKey
      )
        throw new ApiError('STATE_CONFLICT')
      set[`unitCoverage.${ordinal - 1}.restockOperationKey`] = input.operationKey
    }
    const result = await balances.updateOne(
      { _id: row._id, revision: row.revision },
      { $set: set, $inc: { revision: 1 } },
      { session },
    )
    if (result.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
    return { variantId: item.variantId.toHexString() }
  }
}

// Read-only, transaction-scoped source of historical unit entitlements and delivery charge.
export function refundOrderSnapshotAccess(connection: Connection) {
  const { orders, balances } = orderModels(connection)
  return async (
    session: ClientSession,
    orderId: string,
    claimId: string,
    requested: { orderItemId: string; quantity: number; ordinals: number[] }[],
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyOrderPersistence(connection)
    const order = await orders.findById(orderId).session(session)
    if (!order) throw new ApiError('NOT_FOUND')
    const lines = []
    for (const selection of requested) {
      if (!order.items.some((i) => i.id.toHexString() === selection.orderItemId))
        throw new ApiError('STATE_CONFLICT')
      const row = await balances
        .findOne({ orderId, orderItemId: selection.orderItemId })
        .session(session)
      if (!row) throw new ApiError('STATE_CONFLICT')
      const units = row.unitCoverage.map((unit) => ({
        ordinal: unit.ordinal,
        netEntitlementPoisha: unit.netEntitlementPoisha,
        refundHeldPoisha: unit.refundHeldPoisha,
        refundCompletedPoisha: unit.refundCompletedPoisha,
        eligible:
          selection.ordinals.includes(unit.ordinal) &&
          unit.claimId?.toHexString() === claimId &&
          ['protected', 'resolved'].includes(unit.claimState),
      }))
      lines.push({
        orderItemId: selection.orderItemId,
        quantity: selection.quantity,
        units,
      })
    }
    return {
      lines,
      deliveryChargePoisha: order.pricingSnapshot.deliveryChargePoisha,
    }
  }
}

// Called only by the cancellation-decision coordinator inside its still-uncommitted approval.
export function cancellationRefundSnapshotAccess(connection: Connection) {
  const { orders, balances } = orderModels(connection),
    requests = cancellationModel(connection)
  return async (session: ClientSession, orderId: string, requestId: string) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyOrderPersistence(connection)
    await verifyCancellationPersistence(connection)
    const request = await requests
      .findOne({ _id: requestId, orderId, status: 'requested' })
      .session(session)
    const order = await orders.findById(orderId).session(session)
    if (
      !request ||
      !order ||
      !['pending', 'confirmed', 'processing'].includes(order.fulfillmentStatus) ||
      order.shippedAt ||
      order.shipment?.dispatchReference ||
      order.cancelledAt
    )
      throw new ApiError('STATE_CONFLICT')
    const lines = []
    for (const item of order.items) {
      const row = await balances.findOne({ orderId, orderItemId: item.id }).session(session)
      if (!row || row.purchasedQty !== item.quantity) throw new ApiError('STATE_CONFLICT')
      lines.push({
        orderItemId: item.id.toHexString(),
        quantity: item.quantity,
        units: row.unitCoverage.map((u) => ({
          ordinal: u.ordinal,
          netEntitlementPoisha: u.netEntitlementPoisha,
          refundHeldPoisha: u.refundHeldPoisha,
          refundCompletedPoisha: u.refundCompletedPoisha,
          eligible: u.claimState === 'available' && !u.claimId,
        })),
      })
    }
    return { lines, deliveryChargePoisha: order.pricingSnapshot.deliveryChargePoisha }
  }
}

// Claim or pre-dispatch cancellation ordinals retain the same original entitlement namespace.
export function refundUnitReservationAccess(connection: Connection) {
  const { balances } = orderModels(connection)
  const id = z.string().regex(/^[a-f0-9]{24}$/)
  const command = z.strictObject({
    orderId: id,
    claimId: id.optional(),
    cancellationRequestId: id.optional(),
    items: z
      .array(
        z.strictObject({
          orderItemId: id,
          unitAmounts: z
            .array(
              z.strictObject({
                ordinal: z.int().min(1).max(50),
                amountPoisha: z.int().positive().max(Number.MAX_SAFE_INTEGER),
              }),
            )
            .min(1)
            .max(50),
        }),
      )
      .max(50),
  })
  return async (session: ClientSession, raw: unknown) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const input = parseInput(command, raw)
    if (!!input.claimId === !!input.cancellationRequestId) throw new ApiError('VALIDATION_FAILED')
    if (input.cancellationRequestId)
      await cancellationRefundSnapshotAccess(connection)(
        session,
        input.orderId,
        input.cancellationRequestId,
      )
    if (new Set(input.items.map((i) => i.orderItemId)).size !== input.items.length)
      throw new ApiError('VALIDATION_FAILED')
    await verifyOrderPersistence(connection)
    for (const item of input.items) {
      if (new Set(item.unitAmounts.map((u) => u.ordinal)).size !== item.unitAmounts.length)
        throw new ApiError('VALIDATION_FAILED')
      const row = await balances
        .findOne({ orderId: input.orderId, orderItemId: item.orderItemId })
        .session(session)
      if (!row || row.revision >= Number.MAX_SAFE_INTEGER) throw new ApiError('STATE_CONFLICT')
      const set: Record<string, number> = {}
      for (const amount of item.unitAmounts) {
        const unit = row.unitCoverage.find((u) => u.ordinal === amount.ordinal)
        if (
          !unit ||
          (input.cancellationRequestId
            ? unit.claimState !== 'available' || !!unit.claimId
            : unit.claimId?.toHexString() !== input.claimId ||
              !['protected', 'resolved'].includes(unit.claimState))
        )
          throw new ApiError('STATE_CONFLICT')
        if (
          BigInt(unit.refundHeldPoisha) +
            BigInt(unit.refundCompletedPoisha) +
            BigInt(amount.amountPoisha) >
          BigInt(unit.netEntitlementPoisha)
        )
          throw new ApiError('REFUND_BALANCE_EXCEEDED')
        set[`unitCoverage.${amount.ordinal - 1}.refundHeldPoisha`] =
          unit.refundHeldPoisha + amount.amountPoisha
      }
      const changed = await balances.updateOne(
        { _id: row._id, revision: row.revision },
        { $set: set, $inc: { revision: 1 } },
        { session },
      )
      if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
    }
  }
}

// A delivered purchase remains eligible until its entire item is both resolved and fully refunded.
// Write fences serialize review creation against concurrent fulfillment/refund changes.
export function reviewPurchaseEligibilityAccess(connection: Connection) {
  const { orders, balances } = orderModels(connection)
  const selectionSchema = z.strictObject({
    userId: z.string().regex(/^[a-f0-9]{24}$/),
    productId: z.string().regex(/^[a-f0-9]{24}$/),
    qualifyingOrderItemId: z.string().regex(/^[a-f0-9]{24}$/),
  })
  return async (session: ClientSession, raw: unknown) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const selection = parseInput(selectionSchema, raw)
    await verifyOrderPersistence(connection)
    const order = await orders
      .findOne({
        userId: selection.userId,
        fulfillmentStatus: 'delivered',
        items: {
          $elemMatch: {
            id: new Types.ObjectId(selection.qualifyingOrderItemId),
            productId: new Types.ObjectId(selection.productId),
          },
        },
      })
      .session(session)
    if (!order?.deliveredAt || order.revision >= Number.MAX_SAFE_INTEGER) return null
    const balance = await balances
      .findOne({
        orderId: order._id,
        orderItemId: selection.qualifyingOrderItemId,
      })
      .session(session)
    if (!balance || balance.revision >= Number.MAX_SAFE_INTEGER)
      throw new ApiError('STATE_CONFLICT')
    const allResolvedAndFullyPaid = balance.unitCoverage.every(
      (u) => u.claimState === 'resolved' && u.refundCompletedPoisha === u.netEntitlementPoisha,
    )
    if (allResolvedAndFullyPaid) {
      if (
        balance.unitCoverage.every((u) => u.netEntitlementPoisha > 0) ||
        balance.refundedMerchandiseQty === balance.purchasedQty
      )
        return null
      // Zero-value units need explicit completed-quantity evidence, not an inferred payout.
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const orderFence = await orders.updateOne(
      {
        _id: order._id,
        userId: selection.userId,
        fulfillmentStatus: 'delivered',
        revision: order.revision,
      },
      { $inc: { revision: 1 } },
      { session },
    )
    if (orderFence.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
    const balanceFence = await balances.updateOne(
      { _id: balance._id, revision: balance.revision },
      { $inc: { revision: 1 } },
      { session },
    )
    if (balanceFence.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
    return {
      ...selection,
      orderId: order._id.toHexString(),
      delivered: true as const,
      eligible: true as const,
    }
  }
}

// Return notifications obtain immutable order contact through the owning Orders boundary.
export function returnNotificationOrderAccess(connection: Connection) {
  const { orders } = orderModels(connection)
  return async (session: ClientSession, orderId: string) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyOrderPersistence(connection)
    const row = await orders.findById(orderId).session(session)
    if (!row) throw new ApiError('NOT_FOUND')
    return {
      id: row._id,
      ...(row.userId ? { userId: row.userId } : {}),
      email: row.customerSnapshot.emailNormalized,
      name: row.customerSnapshot.name,
      orderNumber: row.orderNumber,
    }
  }
}

export function codCollectionOrderAccess(connection: Connection) {
  const { orders } = orderModels(connection)
  return async (session: ClientSession, orderId: string) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyOrderPersistence(connection)
    const row = await orders.findOneAndUpdate(
      {
        _id: orderId,
        paymentMethod: 'cod',
        confirmedAt: { $exists: true },
        revision: { $lt: Number.MAX_SAFE_INTEGER },
      },
      { $inc: { revision: 1 } },
      { session, returnDocument: 'after' },
    )
    if (!row || row.fulfillmentStatus === 'pending') throw new ApiError('STATE_CONFLICT')
    return {
      cancelled: row.fulfillmentStatus === 'cancelled',
      placedAt: row.placedAt,
      expectedPoisha: row.pricingSnapshot.finalTotalPoisha,
    }
  }
}

export function complaintOrderAccess(connection: Connection) {
  const { orders } = orderModels(connection)
  return async (
    session: ClientSession,
    id: string,
    principal: import('../auth/checkout-access.service.js').OrderPrincipal,
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyOrderPersistence(connection)
    if (principal.kind === 'guest_order' && principal.orderId !== id)
      throw new ApiError('NOT_FOUND')
    const row = await orders
      .findOne({
        _id: id,
        userId: principal.kind === 'customer' ? principal.userId : null,
      })
      .session(session)
    if (!row) throw new ApiError('NOT_FOUND')
    return {
      orderId: row._id,
      ...(row.userId ? { userId: row.userId } : {}),
      contact: {
        name: row.customerSnapshot.name,
        emailNormalized: row.customerSnapshot.emailNormalized,
        phone: row.customerSnapshot.phone,
      },
    }
  }
}
