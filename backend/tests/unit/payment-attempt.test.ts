import { expect, it } from 'vitest'
import {
  prepareAttemptInput,
  attemptAllocation,
} from '../../src/modules/payments/payment-attempt.schema.js'
const command = { attemptId: 'a'.repeat(24), orderId: 'b'.repeat(24), requestedChannel: 'bkash' }
it('accepts only server operation identity/channel and explicit retry lineage without financial authority', () => {
  expect(prepareAttemptInput.parse(command)).toEqual(command)
  expect(
    prepareAttemptInput.parse({ ...command, retryOfAttemptId: 'c'.repeat(24) }).retryOfAttemptId,
  ).toBe('c'.repeat(24))
  for (const extra of [
    { expectedAmountPoisha: 1 },
    { currency: 'USD' },
    { tranId: 'caller-ref' },
    { provider: 'other' },
    { state: 'verified_paid' },
    { orderId: { $ne: null } },
    { requestedChannel: 'provider_other' },
  ])
    expect(prepareAttemptInput.safeParse({ ...command, ...extra }).success).toBe(false)
})
it('requires one valid fifteen-minute allocation generation and explicit verified channel bounds', () => {
  const heldAt = new Date('2026-10-29T00:00:00Z'),
    valid = {
      orderId: command.orderId,
      channel: 'bkash',
      heldAt,
      expiresAt: new Date(heldAt.getTime() + 900000),
      minPoisha: 1,
      maxPoisha: 100000,
    }
  expect(attemptAllocation.parse(valid).expiresAt).toEqual(valid.expiresAt)
  for (const change of [
    { expiresAt: new Date(heldAt.getTime() + 900001) },
    { heldAt: 'client timestamp' },
    { minPoisha: 0 },
    { minPoisha: 100001 },
    { maxPoisha: 1.5 },
    { channel: 'cod' },
  ])
    expect(attemptAllocation.safeParse({ ...valid, ...change }).success).toBe(false)
})
