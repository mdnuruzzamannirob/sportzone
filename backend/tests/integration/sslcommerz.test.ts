import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createSslcommerzAdapter } from '../../src/providers/sslcommerz/sslcommerz.client.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { isolatedDatabase } from '../helpers/database.js'

let server: Server, localOrigin: string, fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let behavior: 'success' | 'redirect' | 'timeout' | 'malformed' = 'success'
let calls: { url: URL; method: string; body: string }[] = []
const options = {
  appEnv: 'test',
  mode: 'sandbox',
  storeId: 'synthetic-store',
  storePassword: 'synthetic-password',
  callbackOrigin: 'https://api.example.test',
  timeoutMs: 500,
} as const
const address = {
  name: 'Synthetic Buyer',
  address: 'Synthetic road',
  city: 'Dhaka',
  postcode: '1000',
  country: 'Bangladesh',
}
const input = {
  tranId: 'synthetic-tran',
  amountPoisha: 1001,
  gatewayKey: 'bkash',
  customer: { ...address, email: 'buyer@example.test', phone: '+8801700000000' },
  shipping: address,
  itemCount: 1,
  productName: 'Synthetic ball',
  productCategory: 'Sports',
}
const report = {
  status: 'VALID',
  tran_id: input.tranId,
  val_id: 'synthetic-val',
  bank_tran_id: 'synthetic-bank',
  amount: '10.01',
  currency: 'BDT',
  currency_type: 'BDT',
  currency_amount: '10.01',
  tran_date: '2026-10-29 10:00:00',
  risk_level: '0',
}
// Rewrite only in the injected test transport; production adapter endpoints remain fixed HTTPS.
const transport: typeof fetch = (url, init) => {
  const upstream = new URL(String(url))
  expect(upstream.origin).toBe('https://sandbox.sslcommerz.com')
  return fetch(`${localOrigin}${upstream.pathname}${upstream.search}`, init)
}
beforeAll(async () => {
  fixture = await isolatedDatabase()
  server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const url = new URL(request.url ?? '/', 'http://localhost')
    calls.push({ url, method: request.method ?? '', body: Buffer.concat(chunks).toString() })
    if (behavior === 'timeout') return
    if (behavior === 'redirect') {
      response.writeHead(302, { Location: '/must-never-follow' }).end()
      return
    }
    response.setHeader('Content-Type', 'application/json')
    if (behavior === 'malformed') {
      response.end('{bad')
      return
    }
    if (url.pathname === '/gwprocess/v4/api.php') {
      response.end(
        JSON.stringify({
          status: 'SUCCESS',
          sessionkey: 'synthetic-session',
          GatewayPageURL:
            'https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?Q=PAY&SESSIONKEY=synthetic-session',
        }),
      )
    } else if (url.searchParams.has('tran_id')) {
      response.end(JSON.stringify({ APIConnect: 'DONE', no_of_trans_found: 1, element: [report] }))
    } else response.end(JSON.stringify({ ...report, sessionkey: 'synthetic-session' }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const bound = server.address()
  if (!bound || typeof bound === 'string') throw new Error('Missing local fixture address')
  localOrigin = `http://127.0.0.1:${bound.port}`
})
beforeEach(() => {
  calls = []
  behavior = 'success'
})
afterAll(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
  await fixture?.close()
})
it('exercises real HTTP form/query encoding and redacted v4 reports against the local mock', async () => {
  const adapter = createSslcommerzAdapter(options, transport)
  expect((await adapter.initiate(input)).kind).toBe('accepted')
  expect((await adapter.validate({ validationId: 'synthetic-val' })).kind).toBe('record')
  expect((await adapter.queryTransaction({ tranId: input.tranId })).kind).toBe('records')
  expect((await adapter.querySession({ sessionKey: 'synthetic-session' })).kind).toBe('record')
  expect(calls).toHaveLength(4)
  expect(calls[0]?.method).toBe('POST')
  expect(new URLSearchParams(calls[0]?.body).get('total_amount')).toBe('10.01')
  expect(calls[1]?.method).toBe('GET')
  expect(calls[1]?.url.searchParams.get('val_id')).toBe('synthetic-val')
  expect(calls[2]?.url.searchParams.get('tran_id')).toBe(input.tranId)
  expect(calls[3]?.url.searchParams.get('sessionkey')).toBe('synthetic-session')
})
it.each(['redirect', 'timeout', 'malformed'] as const)(
  'keeps actual HTTP %s uncertain without redirects or retries',
  async (mode) => {
    behavior = mode
    const result = await createSslcommerzAdapter(options, transport).initiate(input)
    expect(result).toEqual({ kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' })
    expect(calls).toHaveLength(1)
  },
)
it('refuses every provider operation inside a real business transaction before transport', async () => {
  const adapter = createSslcommerzAdapter(options, transport)
  for (const operation of [
    () => adapter.initiate(input),
    () => adapter.validate({ validationId: 'synthetic-val' }),
    () => adapter.queryTransaction({ tranId: input.tranId }),
    () => adapter.querySession({ sessionKey: 'synthetic-session' }),
  ]) {
    await expect(inTransaction(fixture.connection, async () => operation())).rejects.toMatchObject({
      code: 'EXTERNAL_EFFECT_IN_TRANSACTION',
    })
  }
  expect(calls).toHaveLength(0)
})
