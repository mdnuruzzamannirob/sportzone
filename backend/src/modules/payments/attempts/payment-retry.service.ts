import type { Connection } from 'mongoose'
import type { AuditAccess } from '../../audit/audit.public.js'
import type { NotificationIntentsFactory } from '../../notifications/notification.public.js'
import type {
  VerifiedAllocationService,
  VerifiedFundingOrderAccess,
} from '../../orders/order.public.js'
import type { CorrectionObligationFactory } from '../../refunds/refund.public.js'

import { createPaymentProcessingService } from '../collections/payment-processing.service.js'
import { createPaymentVerificationService } from '../collections/payment-verification.service.js'
import type { PaymentGateway } from '../payment.public.js'

// Trusted preflight facts come only from a currently authorized initiation transaction. Verification
// and durable receipt processing run outside it; dispatch admission rechecks every identity afterward.
function createPaymentRetryService(
  connection: Connection,
  gateway: Pick<PaymentGateway, 'validate' | 'queryTransaction'>,
  orders: VerifiedFundingOrderAccess,
  allocation: VerifiedAllocationService,
  auditAccess: AuditAccess,
  moduleAccess: {
    createNotificationService: NotificationIntentsFactory
    createCorrectionObligationService: CorrectionObligationFactory
  },
  clock: () => Date = () => new Date(),
) {
  return {
    async check(input: { attemptId: string; tranId: string; merchantAccountKey: string }) {
      const claim = {
        merchantAccountKey: input.merchantAccountKey,
        tranId: input.tranId,
        claimedStatus: 'PENDING',
      }
      const verified = await createPaymentVerificationService(
        connection,
        gateway,
        input.merchantAccountKey,
      ).verify(claim)
      if (verified.kind === 'uncertain') return undefined
      const outcome = await createPaymentProcessingService(
        connection,
        { verify: async () => verified },
        orders,
        allocation,
        auditAccess,
        moduleAccess,
        clock,
      ).process(claim)
      return outcome === 'committed' &&
        verified.kind === 'nonpayment' &&
        verified.mapping.attemptId === input.attemptId
        ? verified.evidenceDigest
        : undefined
    },
  }
}

export { createPaymentRetryService }
