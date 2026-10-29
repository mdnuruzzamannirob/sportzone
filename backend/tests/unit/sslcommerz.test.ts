import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createSslcommerzAdapter } from '../../src/providers/sslcommerz/sslcommerz.client.js'
import {
  bdtDecimal,
  decimalPoisha,
  type SslcommerzOptions,
} from '../../src/providers/sslcommerz/sslcommerz.schema.js'
import { ConfigurationError } from '../../src/shared/errors/configuration-error.js'
import { loadSslcommerzOptions } from '../../src/config/payments.js'
const settings: SslcommerzOptions = {
  appEnv: 'test',
  mode: 'sandbox',
  storeId: 'synthetic-store',
  storePassword: 'synthetic-password',
  callbackOrigin: 'https://api.example.test',
  timeoutMs: 1000,
}
const address = {
  name: 'Synthetic Buyer',
  address: 'Test road',
  addressLine2: 'Synthetic second line',
  city: 'Dhaka',
  postcode: '1000',
  country: 'Bangladesh',
}
const input = {
  tranId: 'SZsynthetic',
  amountPoisha: 1001,
  gatewayKey: 'bkash',
  customer: { ...address, email: 'buyer@example.test', phone: '+8801700000000' },
  shipping: address,
  itemCount: 2,
  productName: 'Synthetic ball',
  productCategory: 'Sports',
}
const accepted = {
  status: 'SUCCESS',
  sessionkey: 'synthetic-session',
  GatewayPageURL: 'https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?SESSIONKEY=synthetic-session',
}
const paid = {
  status: 'VALIDATED',
  tran_id: input.tranId,
  val_id: 'synthetic-validation',
  bank_tran_id: 'synthetic-bank',
  amount: '10.01',
  currency: 'BDT',
  currency_type: 'BDT',
  currency_amount: '10.01',
  tran_date: '2026-10-29 10:00:00',
  risk_level: '1',
  risk_title: 'High risk',
  card_no: 'redacted-synthetic-card',
  cus_email: 'private@example.test',
  store_passwd: settings.storePassword,
}
const mock = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }))
const uncertain = { kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' }

describe('SSLCOMMERZ v4 server transport contract (synthetic provider responses)', () => {
  it('encodes exact integer money, physical shipment and fixed callbacks into one POST without retries', async () => {
    const transport = mock(accepted)
    const result = await createSslcommerzAdapter(settings, transport).initiate(input)
    expect(result).toMatchObject({
      kind: 'accepted',
      sessionKey: 'synthetic-session',
      redirectUrl: accepted.GatewayPageURL,
    })
    expect(transport).toHaveBeenCalledTimes(1)
    const call = transport.mock.calls[0]
    if (!call) throw new Error('Missing synthetic transport call')
    const [url, request] = call
    expect(url).toBe('https://sandbox.sslcommerz.com/gwprocess/v4/api.php')
    expect(request).toMatchObject({
      method: 'POST',
      redirect: 'error',
      signal: expect.any(AbortSignal),
    })
    const body = new URLSearchParams(String(request?.body))
    expect(Object.fromEntries(body)).toMatchObject({
      store_id: settings.storeId,
      store_passwd: settings.storePassword,
      total_amount: '10.01',
      currency: 'BDT',
      tran_id: input.tranId,
      multi_card_name: 'bkash',
      emi_option: '0',
      product_profile: 'physical-goods',
      shipping_method: 'YES',
      num_of_item: '2',
      cus_country: 'Bangladesh',
      ship_country: 'Bangladesh',
      cus_add2: 'Synthetic second line',
      ship_add2: 'Synthetic second line',
      success_url: 'https://api.example.test/api/v1/payment-returns/sslcommerz/success',
      fail_url: 'https://api.example.test/api/v1/payment-returns/sslcommerz/fail',
      cancel_url: 'https://api.example.test/api/v1/payment-returns/sslcommerz/cancel',
      ipn_url: 'https://api.example.test/api/v1/webhooks/sslcommerz/ipn',
    })
    expect(JSON.stringify(result)).not.toContain(settings.storePassword)
    expect(JSON.stringify(result)).not.toContain(settings.storeId)
  })
  it('keeps strict live/sandbox origins and namespace-separated merchant fingerprints', async () => {
    const sandbox = await createSslcommerzAdapter(settings, mock(accepted)).initiate(input)
    const transport = mock({
      ...accepted,
      GatewayPageURL:
        'https://securepay.sslcommerz.com/gwprocess/v4/gw.php?SESSIONKEY=synthetic-session',
    })
    const live = await createSslcommerzAdapter(
      { ...settings, appEnv: 'production', mode: 'live' },
      transport,
    ).initiate(input)
    expect(String(transport.mock.calls[0]?.[0])).toBe(
      'https://securepay.sslcommerz.com/gwprocess/v4/api.php',
    )
    expect(sandbox.kind).toBe('accepted')
    expect(live.kind).toBe('accepted')
    if (sandbox.kind === 'accepted' && live.kind === 'accepted')
      expect(sandbox.merchantAccountKey).not.toBe(live.merchantAccountKey)
  })
  it.each([
    { ...input, amountPoisha: 999 },
    { ...input, amountPoisha: 50000001 },
    { ...input, amountPoisha: 1000.1 },
    { ...input, amountPoisha: '1000' },
    { ...input, tranId: 'x'.repeat(31) },
    { ...input, gatewayKey: 'bkash,visacard' },
    { ...input, callbackUrl: 'https://attacker.test' },
    { ...input, customer: { ...input.customer, email: 'x'.repeat(51) } },
    { ...input, shipping: { ...address, address: 'x'.repeat(51) } },
  ])('rejects invalid initiation before any provider effect: %j', async (bad) => {
    const transport = mock(accepted)
    expect(await createSslcommerzAdapter(settings, transport).initiate(bad)).toEqual({
      kind: 'rejected',
      code: 'INVALID_PROVIDER_INPUT',
    })
    expect(transport).not.toHaveBeenCalled()
  })
  it('requires explicit well-formed rejection rather than guessing from transport status', async () => {
    expect(
      await createSslcommerzAdapter(
        settings,
        mock({ status: 'FAILED', failedreason: settings.storePassword }),
      ).initiate(input),
    ).toEqual({ kind: 'rejected', code: 'PROVIDER_REJECTED' })
    expect(
      await createSslcommerzAdapter(
        settings,
        mock({ status: 'FAILED', sessionkey: 'already-created' }),
      ).initiate(input),
    ).toEqual(uncertain)
  })
  it.each([301, 400, 401, 403, 429, 500, 503])(
    'preserves HTTP %i as uncertain without retry',
    async (status) => {
      const transport = mock({ status: 'FAILED', failedreason: settings.storePassword }, status)
      expect(await createSslcommerzAdapter(settings, transport).initiate(input)).toEqual(uncertain)
      expect(transport).toHaveBeenCalledTimes(1)
    },
  )
  it.each([
    'http://sandbox.sslcommerz.com/pay',
    'https://securepay.sslcommerz.com/pay',
    'https://sandbox.sslcommerz.com.attacker.test/pay',
    'https://attacker.test/pay',
    'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php',
    'https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?SESSIONKEY=other',
    'https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?SESSIONKEY=synthetic-session&next=https://attacker.test',
    'https://user:secret@sandbox.sslcommerz.com/pay',
    'https://sandbox.sslcommerz.com/pay#secret',
  ])('refuses unapproved hosted redirect %s', async (url) => {
    expect(
      await createSslcommerzAdapter(settings, mock({ ...accepted, GatewayPageURL: url })).initiate(
        input,
      ),
    ).toEqual(uncertain)
  })
  it.each(['{bad-json', '{}', 'null', '{"status":"SUCCESS"}', 'x'.repeat(131073)])(
    'handles malformed/oversized body safely',
    async (body) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(body))
      expect(await createSslcommerzAdapter(settings, transport).initiate(input)).toEqual(uncertain)
    },
  )
  it('does not leak errors and never retries network failures', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(`synthetic ${settings.storePassword}`))
    expect(await createSslcommerzAdapter(settings, transport).initiate(input)).toEqual(uncertain)
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('times out stalled response bodies', async () => {
    const cancel = vi.fn()
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new ReadableStream({ cancel })))
    expect(
      await createSslcommerzAdapter({ ...settings, timeoutMs: 15 }, transport).initiate(input),
    ).toEqual(uncertain)
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('normalizes validated and repeated validated responses, strips sensitive data and retains risk', async () => {
    for (const status of ['VALID', 'VALIDATED']) {
      const raw = { ...paid, status },
        transport = mock(raw)
      const result = await createSslcommerzAdapter(settings, transport).validate({
        validationId: paid.val_id,
      })
      expect(result).toMatchObject({
        kind: 'record',
        record: {
          status,
          amountPoisha: 1001,
          requestedAmountPoisha: 1001,
          riskLevel: 1,
          validationId: paid.val_id,
          bankTranId: paid.bank_tran_id,
        },
        evidenceDigest: createHash('sha256').update(JSON.stringify(raw)).digest('hex'),
      })
      const url = new URL(String(transport.mock.calls[0]?.[0]))
      expect(url.pathname).toBe('/validator/api/validationserverAPI.php')
      expect(url.searchParams.get('val_id')).toBe(paid.val_id)
      expect(url.searchParams.get('store_passwd')).toBe(settings.storePassword)
      const output = JSON.stringify(result)
      for (const value of [
        paid.card_no,
        paid.cus_email,
        settings.storePassword,
        'store_passwd',
        'card_no',
      ])
        expect(output).not.toContain(value)
    }
  })
  it.each([
    { ...paid, val_id: 'other' },
    { ...paid, store_id: 'other-merchant' },
    { ...paid, risk_level: 'unknown' },
    { ...paid, bank_tran_id: '' },
    { ...paid, amount: '10.001' },
    { ...paid, amount: 10.01 },
    { ...paid, amount: '-10.01' },
    { ...paid, amount: '1e3' },
    { status: 'VALID', tran_id: input.tranId },
    { status: 'INVALID_TRANSACTION' },
  ])('keeps unverifiable validation uncertain: %j', async (raw) => {
    expect(
      await createSslcommerzAdapter(settings, mock(raw)).validate({ validationId: paid.val_id }),
    ).toEqual(uncertain)
  })
  it('retains currency/amount mismatch as a report without any funding decision', async () => {
    const result = await createSslcommerzAdapter(
      settings,
      mock({ ...paid, amount: '12.34', currency_type: 'USD' }),
    ).validate({ validationId: paid.val_id })
    expect(result).toMatchObject({
      kind: 'record',
      record: { amountPoisha: 1234, currency: 'BDT', requestedCurrency: 'USD' },
    })
    expect(result).not.toHaveProperty('paymentStatus')
  })
  it('returns all status query records, retaining distinct collections for one merchant transaction', async () => {
    const records = [paid, { ...paid, val_id: 'second-validation', bank_tran_id: 'second-bank' }]
    const transport = mock({ APIConnect: 'DONE', no_of_trans_found: 2, element: records })
    const result = await createSslcommerzAdapter(settings, transport).queryTransaction({
      tranId: input.tranId,
    })
    expect(result).toMatchObject({
      kind: 'records',
      records: [{ validationId: paid.val_id }, { validationId: 'second-validation' }],
    })
    const url = new URL(String(transport.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/validator/api/merchantTransIDvalidationAPI.php')
    expect(url.searchParams.get('tran_id')).toBe(input.tranId)
    expect(url.searchParams.has('sessionkey')).toBe(false)
  })
  it.each([
    { APIConnect: 'DONE', no_of_trans_found: 0, element: [] },
    {
      APIConnect: 'DONE',
      no_of_trans_found: 1,
      element: [{ status: 'PENDING', tran_id: input.tranId }],
    },
  ])('does not turn absent/pending query records into verified failure', async (raw) => {
    const result = await createSslcommerzAdapter(settings, mock(raw)).queryTransaction({
      tranId: input.tranId,
    })
    expect(result.kind).toBe('records')
    expect(result).not.toHaveProperty('paymentStatus')
  })
  it.each([
    { APIConnect: 'FAILED', no_of_trans_found: 0, element: [] },
    { APIConnect: 'DONE', no_of_trans_found: 2, element: [paid] },
    { APIConnect: 'DONE', no_of_trans_found: 1, element: [{ ...paid, tran_id: 'other' }] },
    { APIConnect: 'DONE', no_of_trans_found: 1, element: [{ ...paid, store_id: 'other' }] },
  ])('refuses incomplete/foreign transaction query responses', async (raw) => {
    expect(
      await createSslcommerzAdapter(settings, mock(raw)).queryTransaction({ tranId: input.tranId }),
    ).toEqual(uncertain)
  })
  it('queries a session with exact identity and status contract', async () => {
    const transport = mock({ ...paid, sessionkey: 'synthetic-session' })
    expect(
      await createSslcommerzAdapter(settings, transport).querySession({
        sessionKey: 'synthetic-session',
      }),
    ).toMatchObject({ kind: 'record' })
    expect(new URL(String(transport.mock.calls[0]?.[0])).searchParams.get('sessionkey')).toBe(
      'synthetic-session',
    )
    expect(
      await createSslcommerzAdapter(settings, mock({ ...paid, sessionkey: 'other' })).querySession({
        sessionKey: 'synthetic-session',
      }),
    ).toEqual(uncertain)
    expect(
      await createSslcommerzAdapter(
        settings,
        mock({ ...paid, sessionkey: 'synthetic-session', APIConnect: 'FAILED' }),
      ).querySession({ sessionKey: 'synthetic-session' }),
    ).toEqual(uncertain)
  })
  it('rejects invalid validation/session/transaction query commands before transport', async () => {
    const transport = mock(paid),
      adapter = createSslcommerzAdapter(settings, transport)
    expect((await adapter.validate({ validationId: '' })).kind).toBe('rejected')
    expect((await adapter.querySession({ sessionKey: 'x'.repeat(51) })).kind).toBe('rejected')
    expect(
      (await adapter.queryTransaction({ tranId: input.tranId, url: 'https://attacker.test' })).kind,
    ).toBe('rejected')
    expect(transport).not.toHaveBeenCalled()
  })
})

describe('gateway configuration and exact money', () => {
  it('requires explicit mode/configuration, and stays disabled by default', () => {
    expect(loadSslcommerzOptions({})).toBeUndefined()
    const env = {
      SSLCOMMERZ_ADAPTER_ENABLED: 'true',
      APP_ENV: 'test',
      SSLCOMMERZ_MODE: 'sandbox',
      SSLCOMMERZ_STORE_ID: settings.storeId,
      SSLCOMMERZ_STORE_PASSWORD: settings.storePassword,
      SSLCOMMERZ_CALLBACK_ORIGIN: settings.callbackOrigin,
      SSLCOMMERZ_TIMEOUT_MS: '1000',
    }
    expect(loadSslcommerzOptions(env)).toEqual(settings)
    for (const patch of [
      { SSLCOMMERZ_ADAPTER_ENABLED: 'yes' },
      { SSLCOMMERZ_TIMEOUT_MS: '' },
      { SSLCOMMERZ_MODE: 'live' },
      { APP_ENV: 'production' },
      { SSLCOMMERZ_CALLBACK_ORIGIN: 'http://api.example.test' },
      { SSLCOMMERZ_CALLBACK_ORIGIN: 'https://user:secret@api.example.test' },
      { SSLCOMMERZ_CALLBACK_ORIGIN: 'https://api.example.test/path' },
      { SSLCOMMERZ_STORE_PASSWORD: '' },
    ]) {
      expect(() => loadSslcommerzOptions({ ...env, ...patch })).toThrow(ConfigurationError)
    }
  })
  it('converts money without floating-point rounding, rejecting ambiguous/provider overflow values', () => {
    expect(bdtDecimal(1001)).toBe('10.01')
    expect(bdtDecimal(50000000)).toBe('500000.00')
    expect(decimalPoisha.parse('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER)
    for (const bad of ['90071992547409.92', '01.00', '1.001', '-1', '1e2', 'NaN', 10.01])
      expect(decimalPoisha.safeParse(bad).success).toBe(false)
    expect(() => bdtDecimal(1.01)).toThrow()
  })
})
