import { Types, type ClientSession, type Connection } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { paymentAmounts, paymentModel } from './payment.model.js'
import { verifyPaymentPersistence } from './payment.persistence.js'
const input = z.strictObject({
  orderId: z.string().regex(/^[a-f0-9]{24}$/),
  method: z.enum(['cod', 'online']),
  expectedPoisha: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
})
// Trusted checkout capability only; owning coordinator binds these facts to the canonical order.
// No collection/attempt or Paid transition exists in this service.
export function checkoutPaymentAccess(connection: Connection) {
  const model = paymentModel(connection)
  return {
    async create(session: ClientSession, raw: unknown) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const data = parseInput(input, raw)
      try {
        await verifyPaymentPersistence(connection)
      } catch {
        throw new ApiError('SERVICE_UNAVAILABLE')
      }
      await model.create(
        [
          {
            ...data,
            orderId: new Types.ObjectId(data.orderId),
            currency: 'BDT',
            paymentStatus: 'pending',
            riskStatus: 'clear',
            revision: 0,
            ...Object.fromEntries(paymentAmounts.map((name) => [name, 0])),
          },
        ],
        { session },
      )
    },
    async read(session: ClientSession, orderId: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const row = await model.findOne({ orderId }).session(session)
      if (!row) throw new ApiError('STATE_CONFLICT')
      return {
        paymentStatus: row.paymentStatus,
        expectedPoisha: row.expectedPoisha,
        currency: row.currency,
      }
    },
  }
}
