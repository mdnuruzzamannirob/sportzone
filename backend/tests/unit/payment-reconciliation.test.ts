import { expect, it } from 'vitest'
import { paymentReconciliationOptions } from '../../src/modules/payments/payment-reconciliation.service.js'
it('requires explicit bounded status-aware polling, lease and escalation policy without invented defaults', () => {
  const options = {
    batchSize: 10,
    leaseMs: 30000,
    pollIntervalMs: 1000,
    terminalPollIntervalMs: 5000,
    escalateAfterMs: 6000,
  }
  expect(paymentReconciliationOptions.parse(options)).toEqual(options)
  expect(paymentReconciliationOptions.safeParse({}).success).toBe(false)
  for (const change of [
    { batchSize: 101 },
    { leaseMs: 999 },
    { pollIntervalMs: 0 },
    { terminalPollIntervalMs: 999 },
    { escalateAfterMs: 999 },
    { retryCharge: true },
  ])
    expect(paymentReconciliationOptions.safeParse({ ...options, ...change }).success).toBe(false)
})
