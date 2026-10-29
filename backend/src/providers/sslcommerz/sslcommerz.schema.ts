import { z } from 'zod'
import { ConfigurationError } from '../../shared/errors/configuration-error.js'

const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        value === value.trim() &&
        [...value].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
    )
export const reference = (max: number) => text(max)
const apiOrigin = z
  .string()
  .max(160)
  .refine((value) => {
    try {
      const url = new URL(value)
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        url.origin === value &&
        !url.search &&
        !url.hash
      )
    } catch {
      return false
    }
  })
const optionsSchema = z
  .strictObject({
    appEnv: z.enum(['local', 'test', 'staging', 'production']),
    mode: z.enum(['sandbox', 'live']),
    storeId: text(30),
    storePassword: text(30),
    callbackOrigin: apiOrigin,
    timeoutMs: z.int().min(1).max(60000),
  })
  .refine((value) => value.mode === (value.appEnv === 'production' ? 'live' : 'sandbox'))
export type SslcommerzOptions = z.infer<typeof optionsSchema>
export function validateSslcommerzOptions(raw: unknown): Readonly<SslcommerzOptions> {
  const parsed = optionsSchema.safeParse(raw)
  if (!parsed.success) throw new ConfigurationError(['sslcommerz_configuration'])
  return Object.freeze(parsed.data)
}
const address = z.strictObject({
  name: text(50),
  address: text(50),
  city: text(50),
  postcode: text(30),
  country: z.literal('Bangladesh'),
})
export const initiationInput = z.strictObject({
  tranId: reference(30),
  amountPoisha: z.int().min(1000).max(50000000),
  // This key must be supplied by verified merchant/channel composition, never a browser mapping.
  gatewayKey: z.string().regex(/^[A-Za-z0-9_]{1,30}$/),
  customer: address.extend({ email: z.email().max(50), phone: text(20) }),
  shipping: address,
  itemCount: z.int().min(1).max(9999),
  productName: text(255),
  productCategory: text(50),
})
export function bdtDecimal(poisha: number) {
  if (!Number.isSafeInteger(poisha) || poisha < 0) throw new Error('Invalid integer amount')
  return `${Math.floor(poisha / 100)}.${String(poisha % 100).padStart(2, '0')}`
}
export const decimalPoisha = z
  .string()
  .regex(/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/)
  .transform((value, ctx) => {
    const [whole = '0', fraction = ''] = value.split('.')
    const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
    if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
      ctx.addIssue({ code: 'custom', message: 'Invalid amount' })
      return z.NEVER
    }
    return Number(result)
  })
const optionalReference = (max: number) => z.union([reference(max), z.literal('')]).optional()
// Unknown provider fields (including card/customer data) are stripped, never returned or logged.
export const providerRecord = z
  .object({
    status: z.enum([
      'VALID',
      'VALIDATED',
      'PENDING',
      'FAILED',
      'CANCELLED',
      'UNATTEMPTED',
      'EXPIRED',
    ]),
    tran_id: reference(30),
    val_id: optionalReference(50),
    bank_tran_id: optionalReference(80),
    amount: decimalPoisha.optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    currency_type: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    currency_amount: decimalPoisha.optional(),
    tran_date: text(32).optional(),
    risk_level: z
      .union([z.literal(0), z.literal(1), z.literal('0'), z.literal('1')])
      .transform(Number)
      .optional(),
    risk_title: text(50).optional(),
    store_id: reference(30).optional(),
  })
  .refine(
    (value) =>
      !['VALID', 'VALIDATED'].includes(value.status) ||
      (Boolean(value.val_id) &&
        Boolean(value.bank_tran_id) &&
        value.amount !== undefined &&
        value.amount > 0 &&
        value.currency !== undefined &&
        value.currency_type !== undefined &&
        value.currency_amount !== undefined &&
        value.tran_date !== undefined &&
        value.risk_level !== undefined),
  )
export const sessionAcceptance = z.object({
  status: z.literal('SUCCESS'),
  sessionkey: reference(50),
  GatewayPageURL: z.string().max(255),
})
export const sessionFailure = z.object({
  status: z.literal('FAILED'),
  sessionkey: z.union([z.literal(''), z.null()]).optional(),
  GatewayPageURL: z.union([z.literal(''), z.null()]).optional(),
})
export const transactionQuery = z.strictObject({ tranId: reference(30) })
export const sessionQuery = z.strictObject({ sessionKey: reference(50) })
export const validationQuery = z.strictObject({ validationId: reference(50) })
export const transactionResponse = z
  .object({
    APIConnect: z.literal('DONE'),
    no_of_trans_found: z.int().min(0).max(100),
    element: z.array(providerRecord).max(100),
  })
  .refine((value) => value.no_of_trans_found === value.element.length)
export const sessionResponse = providerRecord.safeExtend({
  APIConnect: z.literal('DONE').optional(),
  sessionkey: reference(50),
})
