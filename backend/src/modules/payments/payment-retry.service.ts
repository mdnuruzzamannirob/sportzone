import type { Connection } from 'mongoose'
import type { verifiedFundingOrderAccess } from '../orders/order.service.js'
import type { verifiedAllocationService } from '../checkout/verified-allocation.service.js'
import type { createSslcommerzAdapter } from '../../providers/sslcommerz/sslcommerz.client.js'
import { paymentVerificationService } from './payment-verification.service.js'
import { paymentProcessingService } from './payment-processing.service.js'
// Trusted preflight facts come only from a currently authorized initiation transaction. Verification
// and durable receipt processing run outside it; dispatch admission rechecks every identity afterward.
export function paymentRetryService(
  connection: Connection,
  gateway: Pick<ReturnType<typeof createSslcommerzAdapter>, 'validate' | 'queryTransaction'>,
  orders: ReturnType<typeof verifiedFundingOrderAccess>,
  allocation: ReturnType<typeof verifiedAllocationService>,
  clock: () => Date = () => new Date(),
) {
  return {
    async check(input: { attemptId: string; tranId: string; merchantAccountKey: string }) {
      const claim = {
        merchantAccountKey: input.merchantAccountKey,
        tranId: input.tranId,
        claimedStatus: 'PENDING',
      }
      const verified = await paymentVerificationService(
        connection,
        gateway,
        input.merchantAccountKey,
      ).verify(claim)
      if (verified.kind === 'uncertain') return undefined
      const outcome = await paymentProcessingService(
        connection,
        { verify: async () => verified },
        orders,
        allocation,
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
