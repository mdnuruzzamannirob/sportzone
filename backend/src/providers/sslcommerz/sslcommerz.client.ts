import { createHash } from 'node:crypto'
import type { z } from 'zod'
import { assertOutsideTransaction } from '../../shared/database/transaction.js'
import {
  bdtDecimal,
  initiationInput,
  providerRecord,
  sessionAcceptance,
  sessionFailure,
  sessionQuery,
  sessionResponse,
  transactionQuery,
  transactionResponse,
  validateSslcommerzOptions,
  validationQuery,
  type SslcommerzOptions,
} from './sslcommerz.schema.js'

const uncertain = { kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' } as const
const invalid = { kind: 'rejected', code: 'INVALID_PROVIDER_INPUT' } as const
const rejected = { kind: 'rejected', code: 'PROVIDER_REJECTED' } as const
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')

// No domain decisions or database writes. No automatic retry, redirects, caller-controlled endpoints
// or raw provider/credential-bearing URL logging. The caller must persist intent before initiation.
export function createSslcommerzAdapter(
  settings: SslcommerzOptions,
  transport: typeof fetch = fetch,
) {
  const options = validateSslcommerzOptions(settings),
    origin =
      options.mode === 'live'
        ? 'https://securepay.sslcommerz.com'
        : 'https://sandbox.sslcommerz.com',
    merchantAccountKey = hash(`${options.mode}\0${options.storeId}`)
  const credentials = () =>
    new URLSearchParams({
      store_id: options.storeId,
      store_passwd: options.storePassword,
      format: 'json',
    })
  async function request(path: string, params: URLSearchParams, method: 'GET' | 'POST') {
    const signal = AbortSignal.timeout(options.timeoutMs)
    const response = await transport(`${origin}${path}${method === 'GET' ? `?${params}` : ''}`, {
      method,
      redirect: 'error',
      signal,
      headers: {
        Accept: 'application/json',
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(method === 'POST' ? { body: params.toString() } : {}),
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error('Provider transport unavailable')
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Missing provider response')
    const abort = () => {
      void reader.cancel().catch(() => {})
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      signal.throwIfAborted()
      const chunks: Uint8Array[] = []
      let length = 0
      for (;;) {
        const chunk = await reader.read()
        signal.throwIfAborted()
        if (chunk.done) break
        length += chunk.value.byteLength
        if (length > 131072) {
          await reader.cancel()
          throw new Error('Provider response too large')
        }
        chunks.push(chunk.value)
      }
      const bytes = Buffer.concat(chunks)
      return {
        raw: JSON.parse(bytes.toString('utf8')) as unknown,
        digest: hash(bytes),
      }
    } finally {
      signal.removeEventListener('abort', abort)
      reader.releaseLock()
    }
  }
  const sameMerchant = (record: z.infer<typeof providerRecord>) =>
    record.store_id === undefined || record.store_id === options.storeId
  const normalize = (record: z.infer<typeof providerRecord>) => ({
    status: record.status,
    tranId: record.tran_id,
    ...(record.val_id ? { validationId: record.val_id } : {}),
    ...(record.bank_tran_id ? { bankTranId: record.bank_tran_id } : {}),
    ...(record.amount !== undefined ? { amountPoisha: record.amount } : {}),
    ...(record.currency ? { currency: record.currency } : {}),
    ...(record.currency_type ? { requestedCurrency: record.currency_type } : {}),
    ...(record.currency_amount !== undefined
      ? { requestedAmountPoisha: record.currency_amount }
      : {}),
    ...(record.tran_date ? { providerCollectedAt: record.tran_date } : {}),
    ...(record.risk_level !== undefined ? { riskLevel: record.risk_level } : {}),
    ...(record.risk_title ? { riskTitle: record.risk_title } : {}),
  })
  return {
    async initiate(raw: unknown) {
      assertOutsideTransaction()
      const parsed = initiationInput.safeParse(raw)
      if (!parsed.success) return invalid
      const input = parsed.data,
        params = credentials()
      const fields = {
        tran_id: input.tranId,
        total_amount: bdtDecimal(input.amountPoisha),
        currency: 'BDT',
        multi_card_name: input.gatewayKey,
        emi_option: '0',
        shipping_method: 'YES',
        num_of_item: String(input.itemCount),
        product_name: input.productName,
        product_category: input.productCategory,
        product_profile: 'physical-goods',
        success_url: `${options.callbackOrigin}/api/v1/payment-returns/sslcommerz/success`,
        fail_url: `${options.callbackOrigin}/api/v1/payment-returns/sslcommerz/fail`,
        cancel_url: `${options.callbackOrigin}/api/v1/payment-returns/sslcommerz/cancel`,
        ipn_url: `${options.callbackOrigin}/api/v1/webhooks/sslcommerz/ipn`,
        cus_name: input.customer.name,
        cus_email: input.customer.email,
        cus_phone: input.customer.phone,
        cus_add1: input.customer.address,
        cus_city: input.customer.city,
        cus_postcode: input.customer.postcode,
        cus_country: input.customer.country,
        ship_name: input.shipping.name,
        ship_add1: input.shipping.address,
        ship_city: input.shipping.city,
        ship_postcode: input.shipping.postcode,
        ship_country: input.shipping.country,
      }
      for (const [key, value] of Object.entries(fields)) params.set(key, value)
      if (input.customer.addressLine2) params.set('cus_add2', input.customer.addressLine2)
      if (input.shipping.addressLine2) params.set('ship_add2', input.shipping.addressLine2)
      try {
        const response = await request('/gwprocess/v4/api.php', params, 'POST')
        if (sessionFailure.safeParse(response.raw).success) return rejected
        const acceptance = sessionAcceptance.safeParse(response.raw)
        if (!acceptance.success) return uncertain
        const url = new URL(acceptance.data.GatewayPageURL)
        if (
          url.origin !== origin ||
          url.protocol !== 'https:' ||
          url.username ||
          url.password ||
          url.hash ||
          url.pathname !== '/gwprocess/v4/gw.php' ||
          url.searchParams.getAll('SESSIONKEY').length !== 1 ||
          url.searchParams.get('SESSIONKEY') !== acceptance.data.sessionkey ||
          [...url.searchParams.keys()].some((key) => !['Q', 'SESSIONKEY'].includes(key)) ||
          (url.searchParams.has('Q') && url.searchParams.get('Q') !== 'PAY')
        )
          return uncertain
        return {
          kind: 'accepted' as const,
          sessionKey: acceptance.data.sessionkey,
          redirectUrl: url.href,
          merchantAccountKey,
        }
      } catch {
        return uncertain
      }
    },
    async validate(raw: unknown) {
      assertOutsideTransaction()
      const parsed = validationQuery.safeParse(raw)
      if (!parsed.success) return invalid
      const params = credentials()
      params.set('val_id', parsed.data.validationId)
      try {
        const response = await request('/validator/api/validationserverAPI.php', params, 'GET')
        const record = providerRecord.safeParse(response.raw)
        if (
          !record.success ||
          !['VALID', 'VALIDATED'].includes(record.data.status) ||
          record.data.val_id !== parsed.data.validationId ||
          !sameMerchant(record.data)
        )
          return uncertain
        return {
          kind: 'record' as const,
          record: normalize(record.data),
          merchantAccountKey,
          evidenceDigest: response.digest,
        }
      } catch {
        return uncertain
      }
    },
    async queryTransaction(raw: unknown) {
      assertOutsideTransaction()
      const parsed = transactionQuery.safeParse(raw)
      if (!parsed.success) return invalid
      const params = credentials()
      params.set('tran_id', parsed.data.tranId)
      try {
        const response = await request(
          '/validator/api/merchantTransIDvalidationAPI.php',
          params,
          'GET',
        )
        const records = transactionResponse.safeParse(response.raw)
        if (
          !records.success ||
          records.data.element.some(
            (record) => record.tran_id !== parsed.data.tranId || !sameMerchant(record),
          )
        )
          return uncertain
        return {
          kind: 'records' as const,
          records: records.data.element.map(normalize),
          merchantAccountKey,
          evidenceDigest: response.digest,
        }
      } catch {
        return uncertain
      }
    },
    async querySession(raw: unknown) {
      assertOutsideTransaction()
      const parsed = sessionQuery.safeParse(raw)
      if (!parsed.success) return invalid
      const params = credentials()
      params.set('sessionkey', parsed.data.sessionKey)
      try {
        const response = await request(
          '/validator/api/merchantTransIDvalidationAPI.php',
          params,
          'GET',
        )
        const record = sessionResponse.safeParse(response.raw)
        if (
          !record.success ||
          record.data.sessionkey !== parsed.data.sessionKey ||
          !sameMerchant(record.data)
        )
          return uncertain
        return {
          kind: 'record' as const,
          record: normalize(record.data),
          merchantAccountKey,
          evidenceDigest: response.digest,
        }
      } catch {
        return uncertain
      }
    },
  }
}
