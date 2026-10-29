import { expect, it } from 'vitest'
import {
  loadPaymentCallbackOptions,
  loadPaymentProcessingOptions,
} from '../../src/config/payments.js'
import { ConfigurationError } from '../../src/shared/errors/configuration-error.js'
import { paymentIpnForm } from '../../src/modules/payments/payment-callback.schema.js'
const env = {
  APP_ENV: 'test',
  PAYMENT_CALLBACKS_ENABLED: 'true',
  SSLCOMMERZ_MODE: 'sandbox',
  SSLCOMMERZ_STORE_ID: 'synthetic-store',
  STOREFRONT_ORIGIN: 'https://shop.example.test',
  PAYMENT_RETURN_SUCCESS_URL: 'https://shop.example.test/payment/result',
  PAYMENT_RETURN_FAIL_URL: 'https://shop.example.test/payment/result',
  PAYMENT_RETURN_CANCEL_URL: 'https://shop.example.test/payment/result',
  PAYMENT_CALLBACK_RATE_LIMIT: '60',
}
it('requires explicit configuration and stays disabled by default', () => {
  expect(loadPaymentCallbackOptions({})).toBeUndefined()
  expect(loadPaymentCallbackOptions({ ...env, PAYMENT_CALLBACKS_ENABLED: 'false' })).toBeUndefined()
  expect(loadPaymentCallbackOptions(env)).toMatchObject({
    rateLimit: 60,
    returns: { success: env.PAYMENT_RETURN_SUCCESS_URL },
  })
})
it.each([
  { PAYMENT_CALLBACKS_ENABLED: 'yes' },
  { APP_ENV: 'staging' },
  { APP_ENV: 'production' },
  { SSLCOMMERZ_MODE: 'live' },
  { PAYMENT_CALLBACK_RATE_LIMIT: '' },
  { PAYMENT_CALLBACK_RATE_LIMIT: '61' },
  { SSLCOMMERZ_STORE_ID: '' },
  { PAYMENT_RETURN_SUCCESS_URL: 'https://attacker.test/result' },
  { PAYMENT_RETURN_FAIL_URL: 'http://shop.example.test/result' },
  { PAYMENT_RETURN_CANCEL_URL: 'https://user:password@shop.example.test/result' },
  { PAYMENT_RETURN_SUCCESS_URL: 'https://shop.example.test/result?next=attacker' },
  { PAYMENT_RETURN_SUCCESS_URL: 'https://shop.example.test/result#token' },
])('refuses unsafe/unqualified callback options %j', (patch) => {
  expect(() => loadPaymentCallbackOptions({ ...env, ...patch })).toThrow(ConfigurationError)
})
it('accepts terminal/pending notifications without inventing receipts or requiring paid-only fields', () => {
  for (const status of ['FAILED', 'CANCELLED', 'EXPIRED', 'UNATTEMPTED', 'PENDING'])
    expect(
      paymentIpnForm.safeParse({ status, tran_id: 'synthetic-tran', val_id: '' }).success,
    ).toBe(true)
  expect(
    paymentIpnForm.safeParse({
      status: 'VALID',
      tran_id: 'synthetic-tran',
      val_id: 'synthetic-validation',
    }).success,
  ).toBe(true)
})
it.each([
  { status: 'VALID', tran_id: 'synthetic' },
  { status: 'PAID', tran_id: 'synthetic', val_id: 'v' },
  { status: ['VALID', 'FAILED'], tran_id: 'synthetic', val_id: 'v' },
  { status: 'FAILED', tran_id: 'x'.repeat(31) },
  { status: 'VALID', tran_id: 'synthetic', val_id: 'v', amount: '1e3' },
  { status: 'VALID', tran_id: 'synthetic', val_id: 'v', orderId: 'fake-order' },
  { status: 'VALID', tran_id: 'synthetic', val_id: 'v', store_passwd: 'secret' },
])('rejects malformed/duplicate/injected provider fields %j', (body) => {
  expect(paymentIpnForm.safeParse(body).success).toBe(false)
})
it('rejects ambiguous or control-bearing redirect configuration', () => {
  for (const url of [
    'https://shop.example.test/result\r\nX-Test: injected',
    'https://shop.example.test/a/../result',
  ])
    expect(() => loadPaymentCallbackOptions({ ...env, PAYMENT_RETURN_SUCCESS_URL: url })).toThrow(
      ConfigurationError,
    )
})

it('keeps durable processing opt-in and refuses missing callback/adapter or deployed activation', () => {
  expect(loadPaymentProcessingOptions({})).toBeUndefined()
  const configured = {
    ...env,
    PAYMENT_PROCESSING_ENABLED: 'true',
    SSLCOMMERZ_ADAPTER_ENABLED: 'true',
    SSLCOMMERZ_STORE_PASSWORD: 'synthetic-password',
    SSLCOMMERZ_CALLBACK_ORIGIN: 'https://api.example.test',
    SSLCOMMERZ_TIMEOUT_MS: '1000',
  }
  expect(loadPaymentProcessingOptions(configured)?.mode).toBe('sandbox')
  for (const change of [
    { APP_ENV: 'production' },
    { APP_ENV: 'staging' },
    { PAYMENT_CALLBACKS_ENABLED: 'false' },
    { SSLCOMMERZ_ADAPTER_ENABLED: 'false' },
    { PAYMENT_PROCESSING_ENABLED: 'yes' },
  ])
    expect(() => loadPaymentProcessingOptions({ ...configured, ...change })).toThrow(
      ConfigurationError,
    )
})
