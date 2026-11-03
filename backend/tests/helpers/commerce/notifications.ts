import { vi } from 'vitest'
import { createNotificationService } from '../../../src/modules/notifications/notification.service.js'
import type { EmailAdapter } from '../../../src/modules/notifications/notification.types.js'
import { createNotificationDeliveryService } from '../../../src/modules/notifications/notification-delivery.service.js'
import {
  createReturnMessageService,
  returnDecisionNotifier,
} from '../../../src/modules/notifications/notification-template.js'
import {
  claimReviewQuantityAccess,
  returnNotificationOrderAccess,
} from '../../../src/modules/orders/order.service.js'
import {
  createReturnLifecycleService,
  returnNotificationProofAccess,
} from '../../../src/modules/returns/return.service.js'
import { composeAuditAccess } from '../../../src/setup.js'
import { context } from './base.js'
import { physicalReturnFixture } from './returns.js'

async function returnNotificationFixture(prepare = true) {
  const f = await physicalReturnFixture('shortage', prepare)
  let t = Date.now() + 20000
  const clock = () => new Date(t++)
  const store = createNotificationService(context.db.connection, clock),
    order = returnNotificationOrderAccess(context.db.connection)
  const notifier = returnDecisionNotifier(order, store)
  const lifecycle = createReturnLifecycleService(
    context.db.connection,
    f.adminAccess,
    claimReviewQuantityAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    clock,
    notifier,
  )
  const complete = (key = 'notify-complete') =>
    lifecycle.transition(
      f.token,
      f.claimId,
      { to: 'completed', reason: 'Synthetic completion' },
      key,
    )
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-message' })
  const delivery = createNotificationDeliveryService(
    store,
    { send },
    { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000, claimTtlMs: 30000, batchSize: 10 },
    clock,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    createReturnMessageService(
      returnNotificationProofAccess(
        context.db.connection,
        order,
        composeAuditAccess(context.db.connection),
      ),
    ),
  )
  return {
    ...f,
    store,
    lifecycle,
    complete,
    send,
    delivery,
    clock,
    advance: (ms: number) => {
      t += ms
    },
  }
}

export { returnNotificationFixture }
