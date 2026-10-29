import { Types, type Connection } from 'mongoose'
import {
  orderService,
  checkoutOrderReadAccess,
  initialOrderAllocationAccess,
} from '../orders/order.service.js'
import { checkoutAllocationService } from './checkout-allocation.service.js'
import { allocationService } from '../inventory/allocation.service.js'
import { checkoutPaymentAccess } from '../payments/payment.service.js'
import { createRegistrationNotifications } from '../notifications/notification.service.js'
import { createAuditWriter } from '../audit/audit.service.js'
import type { CheckoutCompletion } from './checkout-intent.service.js'
import { ApiError } from '../../shared/errors/app-error.js'
export function checkoutCompletion(
  connection: Connection,
  clock: () => Date = () => new Date(),
): CheckoutCompletion {
  const payments = checkoutPaymentAccess(connection),
    notifications = createRegistrationNotifications(connection, clock),
    allocation = checkoutAllocationService(
      connection,
      allocationService(connection, undefined, clock),
      initialOrderAllocationAccess(connection),
      clock,
    ),
    readOrder = checkoutOrderReadAccess(connection)
  return {
    async complete(session, proof, operationKey) {
      await orderService(
        connection,
        {
          authorize: async (_session, command) => {
            if (
              command.orderId !== proof.orderId ||
              command.checkoutIntentId !== proof.checkoutIntentId
            )
              throw new ApiError('STATE_CONFLICT')
            return proof
          },
        },
        createAuditWriter(connection),
        clock,
      ).create(session, {
        orderId: proof.orderId,
        checkoutIntentId: proof.checkoutIntentId,
        operationKey,
      })
      await allocation.apply(session, {
        orderId: proof.orderId,
        generation: 1,
        action: proof.snapshot.draft.method === 'cod' ? 'cod' : 'hold',
      })
      await payments.create(session, {
        orderId: proof.orderId,
        method: proof.snapshot.draft.method === 'cod' ? 'cod' : 'online',
        expectedPoisha: proof.snapshot.pricing.finalTotalPoisha,
      })
      await notifications.enqueueOrderReceived(
        {
          orderId: new Types.ObjectId(proof.orderId),
          ...(proof.userId ? { userId: new Types.ObjectId(proof.userId) } : {}),
          email: proof.snapshot.draft.customer.email,
          name: proof.snapshot.draft.customer.name,
        },
        session,
      )
    },
    async read(session, principal, orderId, intentId) {
      const order = await readOrder(session, principal, orderId, intentId),
        payment = await payments.read(session, orderId)
      if (payment.expectedPoisha !== order.finalTotalPoisha || payment.currency !== order.currency)
        throw new ApiError('STATE_CONFLICT')
      return { ...order, paymentStatus: payment.paymentStatus }
    },
  }
}
