import { reportViews, operationalItem } from './report.schema.js'
import { reportQuery as query, operationalQuery } from './report.schema.js'
import type { ClientSession } from 'mongoose'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import type { orderReportAccess } from '../orders/order.service.js'
import type {
  paymentReportAccess,
  customerPaymentSummaryAccess,
} from '../payments/payment.service.js'
import type { refundReportAccess } from '../refunds/refund-history.service.js'
import type { catalogReportAccess } from '../catalog/products/product.service.js'
import { calculateFinancialReport } from './report-calculation.service.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { ApiError } from '../../shared/errors/app-error.js'
const date = (s: string) => new Date(s.length === 10 ? `${s}T00:00:00+06:00` : s)
const safeMoney = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 0) throw new ApiError('SERVICE_UNAVAILABLE')
  return n
}
export function reportService(
  admins: AdminAccountAccess,
  deps: {
    paymentSummary: ReturnType<typeof customerPaymentSummaryAccess>
    orders: ReturnType<typeof orderReportAccess>
    payments: ReturnType<typeof paymentReportAccess>
    refunds: ReturnType<typeof refundReportAccess>
    catalog: ReturnType<typeof catalogReportAccess>
    threshold(session: ClientSession): Promise<number>
    customers(session: ClientSession): Promise<number>
    pendingReturns(session: ClientSession): Promise<number>
  },
  clock: () => Date = () => new Date(),
) {
  return {
    async read(
      token: string | undefined,
      kind: 'dashboard' | 'sales' | 'collections' | 'refunds',
      raw: unknown,
    ) {
      const input = parseInput(query, raw)
      if (
        (kind !== 'dashboard' && (!input.from || !input.to)) ||
        input.asOf ||
        (input.groupBy && kind !== 'sales') ||
        (input.classification && !['collections', 'refunds'].includes(kind))
      )
        throw new ApiError('BUSINESS_RULE_VIOLATION')
      const result = await admins.owned(
        token,
        async (_actor, session) => {
          const asOf = clock(),
            end = input.to ? date(input.to) : asOf,
            start = input.from ? date(input.from) : new Date(asOf.getTime() - 30 * 86400000)
          if (
            !Number.isFinite(asOf.getTime()) ||
            start >= end ||
            end > asOf ||
            end.getTime() - start.getTime() > 93 * 86400000
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          const period = { from: start, to: end, asOf },
            orders = await deps.orders(session, period),
            payments = await deps.payments(session, period, orders.codOrderIds),
            refunds = await deps.refunds(session, period)
          const totals = {
            ...calculateFinancialReport({
              orders: orders.orders.map(({ placedAt: _placedAt, ...row }) => row),
              collections: payments.collections.map(({ id, amountPoisha }) => ({
                id,
                amountPoisha,
              })),
              codBalances: payments.codBalances,
              completedRefunds: refunds.completedRefunds.map(
                ({ completedAt: _completedAt, ...row }) => row,
              ),
            }),
            pendingRefundLiabilityPoisha: safeMoney(refunds.pendingRefundLiabilityPoisha),
            unattributedProviderCashPoisha: safeMoney(payments.unattributedProviderCashPoisha),
            unassignedLinkedCashPoisha: safeMoney(payments.unassignedLinkedCashPoisha),
          }
          const meta = {
            from: start.toISOString(),
            to: end.toISOString(),
            asOf: asOf.toISOString(),
            timezone: 'Asia/Dhaka',
            dateBasis: {
              sales: 'placedAt',
              collections: 'collectedAt',
              refunds: 'completedAt',
              balances: 'as_of',
              counts: 'as_of',
            },
            consistency:
              'one MongoDB snapshot transaction; current cutoff only; no historical balance reconstruction',
          }
          if (kind === 'dashboard') {
            const catalog = await deps.catalog(session, await deps.threshold(session)),
              summaries = await deps.paymentSummary.many(
                session,
                orders.recentOrders.map((row) => row.id),
              )
            return {
              ...meta,
              ...totals,
              counts: {
                activeProducts: catalog.activeProducts,
                registeredCustomers: await deps.customers(session),
                totalOrders: orders.totalOrders,
                pendingOrders: 0,
                confirmedOrders: 0,
                processingOrders: 0,
                shippedOrders: 0,
                deliveredOrders: 0,
                cancelledOrders: 0,
                ...orders.counts,
                lowStockVariants: catalog.lowStockVariants,
                pendingReturnRequests: await deps.pendingReturns(session),
              },
              recentOrders: orders.recentOrders.map((row) => {
                const summary = summaries.get(row.id)
                if (!summary) throw new ApiError('SERVICE_UNAVAILABLE')
                return { ...row, paymentStatus: summary.status }
              }),
              lowStockItems: catalog.lowStockItems,
            }
          }
          if (kind === 'sales') {
            const groups = new Map<string, typeof orders.orders>()
            for (const row of orders.orders) {
              const local = new Date(Date.parse(row.placedAt) + 6 * 3600000).toISOString(),
                key = local.slice(0, input.groupBy === 'month' ? 7 : 10)
              groups.set(key, [...(groups.get(key) ?? []), row])
            }
            return {
              ...meta,
              filters: { groupBy: input.groupBy ?? 'day' },
              totals,
              groups: [...groups]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([period, rows]) => ({
                  period,
                  ...calculateFinancialReport({
                    orders: rows.map(({ placedAt: _placedAt, ...row }) => row),
                    collections: [],
                    codBalances: [],
                    completedRefunds: [],
                  }),
                })),
            }
          }
          if (kind === 'collections')
            return {
              ...meta,
              filters: { classification: input.classification ?? 'all' },
              totals,
              receiptCount: payments.collections.length,
              classifiedCollectedPoisha: safeMoney(
                payments.collections.reduce(
                  (sum, row) =>
                    sum +
                    (input.classification === 'merchandise'
                      ? row.merchandisePoisha
                      : input.classification === 'payment_correction'
                        ? row.correctionPoisha
                        : row.amountPoisha),
                  0,
                ),
              ),
            }
          const selected = refunds.completedRefunds.filter(
            (row) => !input.classification || row.classification === input.classification,
          )
          return {
            ...meta,
            filters: { classification: input.classification ?? 'all' },
            totals,
            completedCount: selected.length,
            classifiedCompletedPoisha: safeMoney(
              selected.reduce((sum, row) => sum + row.amountPoisha, 0),
            ),
          }
        },
        false,
      )
      return reportViews[kind].parse(result)
    },
  }
}

export function operationalQueueService(
  admins: AdminAccountAccess,
  readers: Record<
    'stock' | 'payments' | 'refunds' | 'reconciliation',
    (
      session: ClientSession,
      query: { page: number; pageSize: number },
    ) => Promise<{ items: unknown[]; pagination: import('../../shared/pagination.js').PageMeta }>
  >,
) {
  return {
    async list(token: string | undefined, raw: unknown) {
      const input = parseInput(operationalQuery, raw)
      return admins.owned(
        token,
        async (_actor, session) => {
          const result = await readers[input.kind](session, input)
          return { ...result, items: operationalItem.array().parse(result.items) }
        },
        false,
      )
    },
  }
}
