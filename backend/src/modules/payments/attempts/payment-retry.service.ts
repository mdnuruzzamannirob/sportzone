import type { Connection } from 'mongoose'
import type { AuditAccess } from '../../audit/audit.public.js'
import type { VerifiedAllocationService } from '../../orders/order.public.js'
import type { verifiedFundingOrderAccess } from '../../orders/order.service.js'

import { createPaymentProcessingService } from '../collections/payment-processing.service.js'
import { createPaymentVerificationService } from '../collections/payment-verification.service.js'
import type { PaymentGateway } from '../payment.public.js'

// Trusted preflight facts come only from a currently authorized initiation transaction. Verification
// and durable receipt processing run outside it; dispatch admission rechecks every identity afterward.
function createPaymentRetryService(
  connection: Connection,
  gateway: Pick<PaymentGateway, 'validate' | 'queryTransaction'>,
  orders: ReturnType<typeof verifiedFundingOrderAccess>,
  allocation: VerifiedAllocationService,
  auditAccess: AuditAccess,
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
