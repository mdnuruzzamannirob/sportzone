import type { Connection, HydratedDocument } from 'mongoose'
import type { CustomerAccountAccess } from '../auth/customer-account.service.js'
import type {
  orderScopeAccess,
  PaymentInitiationCredentials,
  OrderPrincipal,
} from '../auth/checkout-access.service.js'
import type { customerPaymentSummaryAccess } from '../payments/payment.service.js'
import type { orderPolicySnapshotAccess } from '../checkout/checkout-quote.service.js'
import { orderModels, type Order } from './order.model.js'
import { verifyOrderPersistence } from './order.persistence.js'
import { orderId } from './order.schema.js'
import {
  orderReadQuery,
  orderReadSummary,
  orderStatusView,
  customerOrderDetail,
} from './order-read.schema.js'
import { createDeliveryDeadlineService } from './delivery-deadline.service.js'
import { pageMeta } from '../../shared/pagination.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
export const orderOwnerFilter = (id: string, principal: OrderPrincipal) => {
  if (principal.kind === 'guest_order' && principal.orderId !== id) throw new ApiError('NOT_FOUND')
  return { _id: id, userId: principal.kind === 'customer' ? principal.userId : null }
}
export function orderReadService(
  connection: Connection,
  customers: CustomerAccountAccess,
  access: ReturnType<typeof orderScopeAccess>,
  payment: ReturnType<typeof customerPaymentSummaryAccess>,
  policies: ReturnType<typeof orderPolicySnapshotAccess>,
  clock: () => Date = () => new Date(),
) {
  const { orders } = orderModels(connection),
    deadline = createDeliveryDeadlineService(undefined, clock)
  const timing = (row: HydratedDocument<Order>) =>
    deadline.projectTiming(row.toObject({ flattenMaps: true }).deliverySnapshot.deadlineBasis, {
      placedAt: row.placedAt.toISOString(),
      ...(row.confirmedAt ? { confirmedAt: row.confirmedAt.toISOString() } : {}),
    })
  const summary = (row: HydratedDocument<Order>, paymentStatus: string) =>
    orderReadSummary.parse({
      id: row._id.toHexString(),
      orderNumber: row.orderNumber,
      fulfillmentStatus: row.fulfillmentStatus,
      paymentStatus,
      finalTotalPoisha: row.pricingSnapshot.finalTotalPoisha,
      currency: 'BDT',
      placedAt: row.placedAt.toISOString(),
      ...(row.fulfillmentHold ? { fulfillmentHold: row.fulfillmentHold } : {}),
      ...(timing(row).deliveryEstimate ? { deliveryEstimate: timing(row).deliveryEstimate } : {}),
    })
  return {
    async list(token: string | undefined, raw: unknown) {
      const q = parseInput(orderReadQuery, raw)
      return customers.owned(
        token,
        async (profile, scope) => {
          await verifyOrderPersistence(connection)
          const filter = {
              userId: profile.id,
              ...(q.status ? { fulfillmentStatus: q.status } : {}),
            },
            rows = await orders
              .find(filter)
              .sort({ placedAt: -1, _id: -1 })
              .skip((q.page - 1) * q.pageSize)
              .limit(q.pageSize)
              .session(scope.transaction)
          const items = [],
            summaries = await payment.many(
              scope.transaction,
              rows.map((row) => row._id.toHexString()),
            )
          for (const row of rows) {
            const pay = summaries.get(row._id.toHexString())
            if (!pay || pay.expectedPoisha !== row.pricingSnapshot.finalTotalPoisha)
              throw new ApiError('SERVICE_UNAVAILABLE')
            items.push(summary(row, pay.status))
          }
          return {
            items,
            pagination: pageMeta(q, await orders.countDocuments(filter).session(scope.transaction)),
          }
        },
        false,
      )
    },
    async read(credentials: PaymentInitiationCredentials, rawId: unknown, statusOnly = false) {
      const id = parseInput(orderId, rawId)
      return access.owned(credentials, id, async (principal, session) => {
        await verifyOrderPersistence(connection)
        const row = await orders.findOne(orderOwnerFilter(id, principal)).session(session)
        if (!row) throw new ApiError('NOT_FOUND')
        const pay = await payment(session, id),
          dates = timing(row)
        if (pay.expectedPoisha !== row.pricingSnapshot.finalTotalPoisha)
          throw new ApiError('SERVICE_UNAVAILABLE')
        if (statusOnly)
          return orderStatusView.parse({
            fulfillmentStatus: row.fulfillmentStatus,
            ...(row.fulfillmentHold ? { fulfillmentHold: row.fulfillmentHold } : {}),
            paymentSummary: pay,
            ...dates,
          })
        const refs = await policies(session, {
          orderId: id,
          quoteId: row.termsSnapshot.quoteId.toHexString(),
          commercialDigest: row.termsSnapshot.commercialDigest,
        })
        if (
          refs.length !== row.termsSnapshot.policyVersionIds.length ||
          refs.some((p) => !row.termsSnapshot.policyVersionIds.includes(p.version))
        )
          throw new ApiError('SERVICE_UNAVAILABLE')
        const d = row.deliverySnapshot,
          eligible =
            ['pending', 'confirmed', 'processing'].includes(row.fulfillmentStatus) &&
            !row.shippedAt &&
            !row.shipment?.dispatchReference &&
            !row.cancelledAt
        return customerOrderDetail.parse({
          ...summary(row, pay.status),
          items: row.items.map((i) => ({
            id: i.id.toHexString(),
            productId: i.productId.toHexString(),
            variantId: i.variantId.toHexString(),
            productName: i.productName,
            sku: i.sku,
            variantAttributes: Object.fromEntries(i.variantAttributes),
            quantity: i.quantity,
            regularUnitPoisha: i.regularUnitPoisha,
            effectiveUnitPoisha: i.effectiveUnitPoisha,
            regularLinePoisha: i.regularLinePoisha,
            productDiscountPoisha: i.productDiscountPoisha,
            couponAllocatedPoisha: i.couponAllocatedPoisha,
            netMerchandisePoisha: i.netMerchandisePoisha,
            couponEligible: i.couponEligible,
          })),
          pricingSnapshot: row.toObject().pricingSnapshot,
          deliverySnapshot: {
            recipient: d.recipient,
            phone: d.phone,
            districtKey: d.districtKey,
            areaKey: d.areaKey,
            street: d.street,
            ...(d.addressLine2 ? { addressLine2: d.addressLine2 } : {}),
            ...(d.postalCode ? { postalCode: d.postalCode } : {}),
            chargePoisha: d.chargePoisha,
            deadlineRuleVersion: d.deadlineRuleVersion,
          },
          termsSnapshot: {
            acceptedAt: row.termsSnapshot.acceptedAt.toISOString(),
            policyVersionIds: row.termsSnapshot.policyVersionIds,
            termsVersion: row.termsSnapshot.termsVersion,
          },
          policyVersions: refs,
          statusHistory: row.statusHistory.map((e) => ({
            from: e.from,
            to: e.to,
            at: e.at.toISOString(),
          })),
          paymentSummary: pay,
          ...dates,
          cancellationEligibility: {
            eligible,
            reasonCode: eligible ? 'PRE_DISPATCH' : 'TERMINAL_OR_DISPATCHED',
          },
          claimEligibility: { status: 'under_review' },
        })
      })
    },
  }
}
