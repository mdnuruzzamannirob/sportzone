import type { ClientSession } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import type { OrderPrincipal } from '../auth/checkout-access.service.js'
import type { claimEligibilityOrderAccess } from '../orders/order.service.js'
import { claimAuthority, claimCommand, claimText } from './return.schema.js'

// Private composition only. Policy is a protected authority, never request-body data.
function createReturnEligibilityService(
  order: ReturnType<typeof claimEligibilityOrderAccess>,
  policy: (
    session: ClientSession,
    input: ReturnType<typeof claimCommand.parse> & {
      requestedAt: Date
      deliveredAt: Date
    },
  ) => Promise<{
    policyVersion: string
    exceptionBasis?: string
  }>,
  clock: () => Date = () => new Date(),
) {
  return async (session: ClientSession, principal: OrderPrincipal, raw: unknown) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const input = parseInput(claimCommand, raw)
    const facts = await order(session, input.orderId, principal)
    const now = clock()
    if (!Number.isFinite(now.getTime())) throw new ApiError('STATE_CONFLICT')
    if (facts.status !== 'delivered' || !facts.deliveredAt || facts.deliveredAt > now)
      throw new ApiError('BUSINESS_RULE_VIOLATION', [{ field: 'orderId', code: 'NOT_DELIVERED' }])
    const approved = await policy(session, {
      ...input,
      requestedAt: now,
      deliveredAt: facts.deliveredAt,
    })
    // Bangladesh has no DST: seven calendar days preserve the delivery time of day.
    const deadline = new Date(facts.deliveredAt.getTime() + 7 * 86400000)
    if (!Number.isFinite(deadline.getTime())) throw new ApiError('STATE_CONFLICT')
    if (input.claimType === 'physical_return' && now > deadline && !approved.exceptionBasis)
      throw new ApiError('BUSINESS_RULE_VIOLATION', [
        { field: 'orderId', code: 'RETURN_WINDOW_EXPIRED' },
      ])
    if (approved.exceptionBasis) parseInput(claimText, approved.exceptionBasis)
    return parseInput(claimAuthority, {
      requestedBy: {
        type: principal.kind === 'customer' ? 'customer' : 'guest',
        id: principal.kind === 'customer' ? principal.userId : principal.guestSessionId,
      },
      eligibilitySnapshot: {
        policyVersion: approved.policyVersion,
        deliveredAt: facts.deliveredAt,
        ...(input.claimType === 'physical_return' ? { requestDeadlineAt: deadline } : {}),
        ...(approved.exceptionBasis ? { exceptionBasis: approved.exceptionBasis } : {}),
      },
    })
  }
}

export { createReturnEligibilityService }
