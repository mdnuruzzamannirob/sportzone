import { Types } from 'mongoose'
import { createAuditWriter } from '../../../src/modules/audit/audit.service.js'
import {
  adminTransactionAccess,
  createAdminAccountAccess,
  createCustomerAccountAccess,
} from '../../../src/modules/auth/account-access.service.js'
import { productReviewAccess } from '../../../src/modules/catalog/products/product.service.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import { reviewPurchaseEligibilityAccess } from '../../../src/modules/orders/order.service.js'
import { createFulfillmentAllocationService } from '../../../src/modules/orders/order-allocation.service.js'
import { createOrderLifecycleService } from '../../../src/modules/orders/order-lifecycle.service.js'
import { initializePaymentRecordPersistence } from '../../../src/modules/payments/collections/payment-record.persistence.js'
import { fulfillmentPaymentAccess } from '../../../src/modules/payments/payment.service.js'
import { initializeReviewPersistence } from '../../../src/modules/reviews/review.persistence.js'
import { createReviewService } from '../../../src/modules/reviews/review.service.js'
import {
  composeAuditAccess,
  composeFulfillmentAllocationDependencies,
  composeOrderLifecycleDependencies,
} from '../../../src/setup.js'
import { sessionHttpFor } from '../auth.js'
import { body, context, coupon, customer, submit, variant } from './base.js'
import { placeCod } from './checkout.js'

async function deliveredReviewFixture(
  deliver = true,
  existingBuyer?: Awaited<ReturnType<typeof customer>>,
  zeroValue = false,
) {
  await initializePaymentRecordPersistence(context.db.connection)
  await initializeReviewPersistence(context.db.connection)
  const buyer = existingBuyer ?? (await customer()),
    selected = await variant(),
    draft = { ...body([selected.item]), ...(zeroValue ? { couponCode: 'SYNTHETIC' } : {}) }
  if (zeroValue) await coupon({ type: 'percentage', value: 10000 })
  const quote = await context.service.create(buyer.credentials, draft)
  const placed = await placeCod(
    buyer,
    submit(draft, quote),
    existingBuyer ? `review-second-${selected.row._id}` : undefined,
  ).expect(201)
  const orderId = placed.body.data.order.id
  const admin = await customer('admin'),
    access = createAdminAccountAccess(context.db.connection, context.identities, context.sessions)
  const lifecycle = createOrderLifecycleService(
    context.db.connection,
    access,
    fulfillmentPaymentAccess(context.db.connection),
    createFulfillmentAllocationService(
      composeFulfillmentAllocationDependencies(context.db.connection),
      () => context.now,
    ),
    composeAuditAccess(context.db.connection),
    composeOrderLifecycleDependencies(context.db.connection),
    async () => {},
    () => context.now,
  )
  if (deliver)
    for (const status of ['confirmed', 'processing', 'shipped', 'delivered'])
      await lifecycle.transition(
        admin.credentials.customerToken,
        orderId,
        {
          to: status,
          reason: 'Synthetic',
          ...(status === 'shipped' ? { dispatchReference: 'synthetic-review-dispatch' } : {}),
        },
        `review-${status}`,
      )
  const order = await orderModels(context.db.connection).orders.findById(orderId).orFail(),
    line = order.items[0]
  if (!line) throw new Error('Missing item')
  const selection = {
    userId: buyer.user._id.toHexString(),
    productId: line.productId.toHexString(),
    qualifyingOrderItemId: line.id.toHexString(),
  }
  const eligibility = reviewPurchaseEligibilityAccess(context.db.connection)
  const accounts = createCustomerAccountAccess(
    context.db.connection,
    context.identities,
    context.sessions,
  )
  const reviews = createReviewService(context.db.connection, {
    accounts,
    catalog: productReviewAccess(context.db.connection),
    audit: createAuditWriter(context.db.connection),
    eligibility,
  })
  return { buyer, selected, orderId, selection, eligibility, reviews }
}

function localReviewAuth() {
  return {
    customerAccounts: createCustomerAccountAccess(
      context.db.connection,
      context.identities,
      context.sessions,
    ),
    adminAccounts: createAdminAccountAccess(
      context.db.connection,
      context.identities,
      context.sessions,
    ),
    adminTransaction: adminTransactionAccess(context.identities, context.sessions),
    sessions: context.sessions,
    security: context.security,
    http: sessionHttpFor(context.sessions),
  }
}

async function markSyntheticFullReturnAndRefund(orderId: string) {
  const balances = orderModels(context.db.connection).balances,
    row = await balances.findOne({ orderId }).orFail()
  const set: Record<string, unknown> = {
    activeClaimQty: 0,
    resolvedClaimQty: row.purchasedQty,
    refundedMerchandiseQty: row.purchasedQty,
  }
  row.unitCoverage.forEach((unit, index) => {
    set[`unitCoverage.${index}.claimState`] = 'resolved'
    set[`unitCoverage.${index}.claimId`] = new Types.ObjectId()
    set[`unitCoverage.${index}.refundCompletedPoisha`] = unit.netEntitlementPoisha
  })
  await balances.updateOne(
    { _id: row._id, revision: row.revision },
    { $set: set, $inc: { revision: 1 } },
  )
}

export { deliveredReviewFixture, localReviewAuth, markSyntheticFullReturnAndRefund }
