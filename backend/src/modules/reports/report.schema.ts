import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
import { fulfillmentStatus } from '../orders/order.schema.js'
import { customerPaymentSummary } from '../orders/order-read.schema.js'

const id = z.string().regex(/^[a-f0-9]{24}$/),
  money = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const instant = z.union([z.iso.datetime({ offset: true }), z.iso.date()])

const reportQuery = z.strictObject({
  from: instant.optional(),
  to: instant.optional(),
  asOf: instant.optional(),
  groupBy: z.enum(['day', 'month']).optional(),
  classification: z.enum(['merchandise', 'payment_correction']).optional(),
})

const financialTotals = z.strictObject({
  grossMerchandiseValuePoisha: money,
  productDiscountPoisha: money,
  couponDiscountPoisha: money,
  netAcceptedOrderSalesPoisha: money,
  outstandingCodPoisha: money,
  paidCollectionsPoisha: money,
  completedMerchandiseRefundsPoisha: money,
  completedCorrectionRefundsPoisha: money,
  netLinkedCashFlowPoisha: z.int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
})

const totals = financialTotals.extend({
  pendingRefundLiabilityPoisha: money,
  unattributedProviderCashPoisha: money,
  unassignedLinkedCashPoisha: money,
})

const meta = z.strictObject({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  asOf: z.iso.datetime(),
  timezone: z.literal('Asia/Dhaka'),
  dateBasis: z.strictObject({
    sales: z.literal('placedAt'),
    collections: z.literal('collectedAt'),
    refunds: z.literal('completedAt'),
    balances: z.literal('as_of'),
    counts: z.literal('as_of'),
  }),
  consistency: z.literal(
    'one MongoDB snapshot transaction; current cutoff only; no historical balance reconstruction',
  ),
})

const reportRecentOrder = z.strictObject({
  id,
  orderNumber: z.string(),
  fulfillmentStatus,
  placedAt: z.iso.datetime(),
  finalTotalPoisha: money,
  currency: z.literal('BDT'),
  paymentStatus: customerPaymentSummary.shape.status,
})

const reportDashboard = meta.extend({
  ...totals.shape,
  counts: z.strictObject({
    activeProducts: money,
    registeredCustomers: money,
    totalOrders: money,
    pendingOrders: money,
    confirmedOrders: money,
    processingOrders: money,
    shippedOrders: money,
    deliveredOrders: money,
    cancelledOrders: money,
    lowStockVariants: money,
    pendingReturnRequests: money,
  }),
  recentOrders: z.array(reportRecentOrder),
  lowStockItems: z.array(z.strictObject({ id, productId: id, sku: z.string(), available: money })),
})

const salesReport = meta.extend({
  filters: z.strictObject({ groupBy: z.enum(['day', 'month']) }),
  totals,
  groups: z.array(financialTotals.extend({ period: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/) })),
})

const classificationFilter = z.strictObject({
  classification: z.enum(['all', 'merchandise', 'payment_correction']),
})

const collectionReport = meta.extend({
  filters: classificationFilter,
  totals,
  receiptCount: money,
  classifiedCollectedPoisha: money,
})

const refundReport = meta.extend({
  filters: classificationFilter,
  totals,
  completedCount: money,
  classifiedCompletedPoisha: money,
})

const operationalQuery = paginationSchema.safeExtend({
  kind: z.enum(['stock', 'payments', 'refunds', 'reconciliation']),
})

const operationalItem = z.strictObject({
  id,
  orderId: id,
  status: z.string(),
  reasonCode: z.enum([
    'ALLOCATION_SHORTFALL',
    'PAYMENT_RECONCILIATION',
    'PAYMENT_REVIEW',
    'REFUND_REVIEW',
  ]),
  capacityStatus: z.enum(['not_reserved', 'reserved', 'completed', 'released']).optional(),
})

const reportViews = {
  dashboard: reportDashboard,
  sales: salesReport,
  collections: collectionReport,
  refunds: refundReport,
} as const

export {
  reportQuery,
  financialTotals,
  reportRecentOrder,
  reportDashboard,
  salesReport,
  collectionReport,
  refundReport,
  operationalQuery,
  operationalItem,
  reportViews,
}
