import {
  createAdminAccountAccess,
  createCustomerAccountAccess,
} from '../../../src/modules/auth/account-access.service.js'
import { orderScopeAccess } from '../../../src/modules/auth/checkout-access.service.js'
import type { createGuestSessionService } from '../../../src/modules/auth/guest-access/guest-session.service.js'
import { createAuthQuotaStore } from '../../../src/modules/auth/sessions/auth-throttle.persistence.js'
import { createAuthThrottle } from '../../../src/modules/auth/sessions/auth-throttle.service.js'
import { createRecoveryReceiptService } from '../../../src/modules/inventory/inventory.service.js'
import { createNotificationService } from '../../../src/modules/notifications/notification.service.js'
import type { EmailAdapter } from '../../../src/modules/notifications/notification.types.js'
import { createNotificationDeliveryService } from '../../../src/modules/notifications/notification-delivery.service.js'
import { createOrderMessageService } from '../../../src/modules/notifications/notification-template.js'
import { initializeDeliveryExceptionPersistence } from '../../../src/modules/orders/delivery-exception.persistence.js'
import { createDeliveryExceptionService } from '../../../src/modules/orders/delivery-exception.service.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import { complaintOrderAccess } from '../../../src/modules/orders/order.service.js'
import { createFulfillmentAllocationService } from '../../../src/modules/orders/order-allocation.service.js'
import { createOrderLifecycleService } from '../../../src/modules/orders/order-lifecycle.service.js'
import { orderNotificationAccess } from '../../../src/modules/orders/order-notification.service.js'
import {
  cancellationPaymentAccess,
  fulfillmentPaymentAccess,
} from '../../../src/modules/payments/payment.service.js'
import { initializeComplaintPersistence } from '../../../src/modules/support/support.persistence.js'
import { createComplaintService } from '../../../src/modules/support/support.service.js'
import { createApiRouter } from '../../../src/routes.js'
import {
  composeAfterSalesHistoryRoutes,
  composeAuditAccess,
  composeDeliveryExceptionDependencies,
  composeFulfillmentAllocationDependencies,
  composeOrderLifecycleDependencies,
} from '../../../src/setup.js'
import { createContractCheckedApp as createApp } from '../contracts.js'
import { authSecret, context } from './base.js'
import { cancellationReadFixture } from './orders.js'
import { localReviewAuth } from './reviews.js'

function commerceDelivery(adapter: EmailAdapter) {
  return createNotificationDeliveryService(
    createNotificationService(context.db.connection, () => context.now),
    adapter,
    { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000, claimTtlMs: 30000, batchSize: 10 },
    () => context.now,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    createOrderMessageService(orderNotificationAccess(context.db.connection)),
  )
}

async function exceptionFixture(protectedDisposition = true) {
  await initializeDeliveryExceptionPersistence(context.db.connection)
  await initializeComplaintPersistence(context.db.connection)
  const f = await cancellationReadFixture(),
    adminAccess = createAdminAccountAccess(
      context.db.connection,
      context.identities,
      context.sessions,
    )
  const lifecycle = createOrderLifecycleService(
    context.db.connection,
    adminAccess,
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
  for (const to of ['confirmed', 'processing', 'shipped'])
    await lifecycle.transition(
      f.admin.credentials.customerToken,
      f.id,
      {
        to,
        reason: 'Synthetic protected delivery',
        ...(to === 'shipped' ? { dispatchReference: 'exception-dispatch' } : {}),
      },
      `exception-${to}`,
    )
  const exceptions = createDeliveryExceptionService(
    context.db.connection,
    adminAccess,
    cancellationPaymentAccess(context.db.connection),
    createRecoveryReceiptService(context.db.connection, () => context.now),
    composeAuditAccess(context.db.connection),
    composeDeliveryExceptionDependencies(context.db.connection),
    protectedDisposition ? async () => 'a'.repeat(64) : undefined,
    undefined,
    () => context.now,
  )
  const order = await orderModels(context.db.connection).orders.findById(f.id).orFail(),
    item = order.items[0]
  if (!item) throw new Error('Missing line')
  const disposition = [
    {
      orderItemId: item.id.toHexString(),
      quantity: 1,
      custody: 'recovered',
      inspectedResellableQty: 1,
    },
    { orderItemId: item.id.toHexString(), quantity: 1, custody: 'lost', inspectedResellableQty: 0 },
  ]
  const token = f.admin.credentials.customerToken
  const create = (type = 'failed_attempt', key = type) =>
    exceptions.create(
      token,
      f.id,
      {
        type,
        reason: 'Synthetic recorded delivery concern',
        contact: { channel: 'phone', outcome: 'Synthetic follow-up' },
      },
      key,
    )
  const resolve = (
    id: string,
    body: object = { resolution: 'Documented retry planned' },
    key = 'exception-resolution',
  ) => exceptions.resolve(token, id, body, key)
  const complaints = createComplaintService(
    context.db.connection,
    orderScopeAccess(
      createCustomerAccountAccess(context.db.connection, context.identities, context.sessions),
      context.sessions,
    ),
    complaintOrderAccess(context.db.connection),
    adminAccess,
    composeAuditAccess(context.db.connection),
    () => context.now,
  )
  return {
    ...f,
    lifecycle,
    exceptions,
    create,
    resolve,
    disposition,
    item,
    complaints,
    token,
    adminAccess,
  }
}

function packageEAuth(guests?: ReturnType<typeof createGuestSessionService>) {
  return {
    ...localReviewAuth(),
    guestAccounts: guests,
    throttle: createAuthThrottle(createAuthQuotaStore(context.db.connection), authSecret),
  }
}

function packageERoot(guests?: ReturnType<typeof createGuestSessionService>) {
  return createApp({
    apiRouter: createApiRouter(
      undefined,
      composeAfterSalesHistoryRoutes(context.db.connection, 'test', packageEAuth(guests)),
    ),
  })
}

export { commerceDelivery, exceptionFixture, packageEAuth, packageERoot }
