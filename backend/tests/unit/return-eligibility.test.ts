import { Types } from 'mongoose'
import { describe, expect, it } from 'vitest'
import { returnEligibilityService } from '../../src/modules/returns/return-eligibility.service.js'
import type { inTransaction } from '../../src/shared/database/transaction.js'
import type { claimEligibilityOrderAccess } from '../../src/modules/orders/order.service.js'

type Session = Parameters<Parameters<typeof inTransaction>[1]>[0]
const session = { inTransaction: () => true } as Session
const id = () => new Types.ObjectId().toHexString()
const orderId = id(),
  userId = id(),
  deliveredAt = new Date('2026-10-24T18:30:00Z')
const principal = { kind: 'customer' as const, userId }
const command = {
  claimId: id(),
  orderId,
  claimType: 'physical_return',
  items: [{ orderItemId: id(), quantity: 1, reason: 'Defective' }],
}
const order: ReturnType<typeof claimEligibilityOrderAccess> = async () => ({
  status: 'delivered',
  deliveredAt,
})
function eligibility(now: Date, exceptionBasis?: string) {
  return returnEligibilityService(
    order,
    async () => ({
      policyVersion: 'synthetic-policy',
      ...(exceptionBasis !== undefined ? { exceptionBasis } : {}),
    }),
    () => now,
  )
}
describe('private return eligibility', () => {
  it.each(['2026-10-24T18:30:00Z', '2026-10-31T18:29:59.999Z', '2026-10-31T18:30:00Z'])(
    'accepts delivered physical requests at %s',
    async (value) => {
      const authority = await eligibility(new Date(value))(session, principal, command)
      expect(authority.requestedBy).toEqual({ type: 'customer', id: userId })
      expect(authority.eligibilitySnapshot.requestDeadlineAt?.toISOString()).toBe(
        '2026-10-31T18:30:00.000Z',
      )
    },
  )
  it('rejects one millisecond beyond window with a stable reason', async () => {
    await expect(
      eligibility(new Date('2026-10-31T18:30:00.001Z'))(session, principal, command),
    ).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
      details: [{ field: 'orderId', code: 'RETURN_WINDOW_EXPIRED' }],
    })
  })
  it('preserves protected rights exceptions beyond the standard window', async () => {
    const authority = await eligibility(
      new Date('2026-11-20T00:00:00Z'),
      'Qualified protected exception',
    )(session, principal, command)
    expect(authority.eligibilitySnapshot.exceptionBasis).toBe('Qualified protected exception')
  })
  it('does not impose the physical deadline on shortage or invent physical proof', async () => {
    const authority = await eligibility(new Date('2026-11-20T00:00:00Z'))(
      session,
      { kind: 'guest_order', guestSessionId: userId, orderId },
      { ...command, claimType: 'shortage' },
    )
    expect(authority.requestedBy).toEqual({ type: 'guest', id: userId })
    expect(authority.eligibilitySnapshot.requestDeadlineAt).toBeUndefined()
  })
  it.each([new Date('2026-10-24T18:29:59Z'), new Date(NaN)])(
    'rejects future delivery/invalid clocks',
    async (now) => {
      await expect(eligibility(now)(session, principal, command)).rejects.toThrow()
    },
  )
  it.each(['', '  ', '\n'])(
    'does not turn invalid exception evidence into an override',
    async (basis) => {
      await expect(
        eligibility(new Date('2026-11-20'), basis)(session, principal, command),
      ).rejects.toThrow()
    },
  )
  it('does not accept client policy overrides or unit ordinals', async () => {
    await expect(
      eligibility(deliveredAt)(session, principal, {
        ...command,
        exceptionBasis: 'client override',
      }),
    ).rejects.toThrow()
  })
  it('requires an active outer transaction', async () => {
    const inactive = { inTransaction: () => false } as Session
    await expect(eligibility(deliveredAt)(inactive, principal, command)).rejects.toMatchObject({
      code: 'STATE_CONFLICT',
    })
  })
})
