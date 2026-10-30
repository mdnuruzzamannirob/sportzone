import { z } from 'zod'
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => [...value].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))
const reference = (max: number) =>
  text(max)
    .min(1)
    .refine((value) => value === value.trim())
const decimal = z.union([z.literal(''), z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/)])
export const paymentReturnParams = z.strictObject({ result: z.enum(['success', 'fail', 'cancel']) })
export const paymentIpnForm = z
  .strictObject({
    status: z.enum([
      'VALID',
      'VALIDATED',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
      'UNATTEMPTED',
      'PENDING',
    ]),
    tran_id: reference(30),
    val_id: z.union([z.literal(''), reference(50)]).optional(),
    store_id: reference(30).optional(),
    bank_tran_id: z.union([z.literal(''), reference(80)]).optional(),
    amount: decimal.optional(),
    currency: z.union([z.literal(''), z.string().regex(/^[A-Z]{3}$/)]).optional(),
    tran_date: text(32).optional(),
    store_amount: decimal.optional(),
    currency_type: text(3).optional(),
    currency_amount: decimal.optional(),
    currency_rate: text(30).optional(),
    base_fair: decimal.optional(),
    card_type: text(50).optional(),
    card_no: text(80).optional(),
    card_issuer: text(100).optional(),
    card_brand: text(30).optional(),
    card_issuer_country: text(50).optional(),
    card_issuer_country_code: text(2).optional(),
    value_a: text(255).optional(),
    value_b: text(255).optional(),
    value_c: text(255).optional(),
    value_d: text(255).optional(),
    verify_sign: text(255).optional(),
    verify_key: text(2048).optional(),
    cus_fax: text(20).optional(),
    risk_level: z.enum(['', '0', '1']).optional(),
    risk_title: text(50).optional(),
  })
  .refine(
    (value) => !['VALID', 'VALIDATED'].includes(value.status) || Boolean(value.val_id?.trim()),
  )
export type PaymentCallbackOptions = {
  storeId: string
  mode: 'sandbox'
  storefrontOrigin: string
  returns: Record<'success' | 'fail' | 'cancel', string>
  rateLimit: number
}
export const paymentCallbackOptions = z
  .strictObject({
    storeId: reference(30),
    mode: z.literal('sandbox'),
    storefrontOrigin: z.url(),
    returns: z.strictObject({
      success: z.url().max(2048),
      fail: z.url().max(2048),
      cancel: z.url().max(2048),
    }),
    rateLimit: z.int().min(1).max(60),
  })
  .refine((value) => {
    const origin = new URL(value.storefrontOrigin)
    if (origin.protocol !== 'https:' || origin.origin !== value.storefrontOrigin) return false
    return Object.values(value.returns).every((target) => {
      const url = new URL(target)
      return (
        url.protocol === 'https:' &&
        url.href === target &&
        url.origin === value.storefrontOrigin &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      )
    })
  })
export const paymentReturnForm = z.record(z.string().max(64), text(2048))
