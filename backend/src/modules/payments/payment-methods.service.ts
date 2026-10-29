import type { ClientSession, Connection } from 'mongoose'
import { inTransaction } from '../../shared/database/transaction.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import type { paymentMethodAccess } from '../auth/checkout-access.service.js'
import type { paymentMethodOrderAccess } from '../orders/order.service.js'
import { paymentMethodsQuery, paymentMethodsView } from './payment-eligibility.schema.js'
import { paymentEligibility } from './payment-eligibility.service.js'
import { paymentMethodBalanceAccess } from './payment.service.js'
export function paymentMethodsService(
  connection: Connection,
  dependencies: {
    access: ReturnType<typeof paymentMethodAccess>
    order: ReturnType<typeof paymentMethodOrderAccess>
    settings(session: ClientSession): Promise<unknown>
    verified?: (session: ClientSession) => Promise<unknown>
  },
) {
  const eligibility = paymentEligibility(dependencies.verified),
    balance = paymentMethodBalanceAccess(connection)
  return {
    async read(credentials: Parameters<typeof dependencies.access.owned>[0], raw: unknown) {
      const query = parseInput(paymentMethodsQuery, raw)
      const evaluate = async (
        session: ClientSession,
        amount = query.amountPoisha,
        method?: string,
      ) => {
        const methods = await eligibility(await dependencies.settings(session), amount, session)
        return parseInput(paymentMethodsView, {
          methods: methods.filter(
            (row) =>
              row.active &&
              (!method || (method === 'cod' ? row.channel === 'cod' : row.channel !== 'cod')),
          ),
        })
      }
      if (!query.orderId) return inTransaction(connection, evaluate)
      const orderId = query.orderId
      return dependencies.access.owned(credentials, orderId, async (scope, session) => {
        const order = await dependencies.order(session, orderId, scope),
          payment = await balance(session, orderId)
        if (order.method !== payment.method) throw new ApiError('STATE_CONFLICT')
        if (order.cancelled || (payment.method === 'online' && payment.remainingPoisha === 0))
          return { methods: [] }
        return evaluate(session, payment.remainingPoisha, payment.method)
      })
    },
  }
}
