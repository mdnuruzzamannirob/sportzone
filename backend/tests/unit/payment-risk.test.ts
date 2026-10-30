import { expect, it } from 'vitest'
import {
  paymentRiskInput,
  paymentRiskParams,
} from '../../src/modules/payments/payment-risk.schema.js'
it('requires an exact admin decision and meaningful reason without caller financial or fulfillment authority', () => {
  expect(paymentRiskInput.parse({ decision: 'approve', reason: '  Evidence reviewed  ' })).toEqual({
    decision: 'approve',
    reason: 'Evidence reviewed',
  })
  for (const change of [
    { decision: 'pay' },
    { reason: '' },
    { reason: '\n' },
    { reason: 'private\u0000value' },
    { amountPoisha: 100 },
    { riskStatus: 'clear' },
    { fulfillmentHold: 'none' },
    { revision: 1 },
  ])
    expect(
      paymentRiskInput.safeParse({ decision: 'approve', reason: 'Reviewed', ...change }).success,
    ).toBe(false)
  expect(paymentRiskParams.safeParse({ paymentId: { $ne: null } }).success).toBe(false)
})
