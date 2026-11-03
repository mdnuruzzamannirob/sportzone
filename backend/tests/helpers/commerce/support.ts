import type { createGuestSessionService } from '../../../src/modules/auth/guest-access/guest-session.service.js'
import { initializeDeliveryExceptionPersistence } from '../../../src/modules/orders/delivery-exception.persistence.js'
import { initializeRefundAttemptPersistence } from '../../../src/modules/refunds/payouts/refund-attempt.persistence.js'
import { initializeCorrectionPersistence } from '../../../src/modules/refunds/refund.persistence.js'
import { initializeComplaintPersistence } from '../../../src/modules/support/support.persistence.js'
import { createApiRouter } from '../../../src/routes.js'
import { composeOperationsRoutes, composeRefundOperationsRoutes } from '../../../src/setup.js'
import { createContractCheckedApp as createApp } from '../contracts.js'
import { context, origin } from './base.js'
import { packageEAuth } from './customers.js'
import { localReviewAuth } from './reviews.js'

async function packageFRoot(
  options: Parameters<typeof composeOperationsRoutes>[4] = {},
  refunds?: Parameters<typeof composeOperationsRoutes>[5],
  clock?: () => Date,
  guests?: ReturnType<typeof createGuestSessionService>,
) {
  await initializeComplaintPersistence(context.db.connection)
  await initializeDeliveryExceptionPersistence(context.db.connection)
  await initializeCorrectionPersistence(context.db.connection)
  await initializeRefundAttemptPersistence(context.db.connection)
  return createApp({
    apiRouter: createApiRouter(undefined, [
      ...composeOperationsRoutes(
        context.db.connection,
        'test',
        packageEAuth(guests),
        origin,
        options,
        refunds,
        clock,
      ),
      ...(refunds
        ? [composeRefundOperationsRoutes(context.db.connection, localReviewAuth(), refunds, clock)]
        : []),
    ]),
  })
}

export { packageFRoot }
