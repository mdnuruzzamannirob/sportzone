import { parsePhoneNumberWithError } from 'libphonenumber-js/max'
import { z } from 'zod'

const resourceId = z.string().regex(/^[a-f0-9]{24}$/)

const singleLineText = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((v) => [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))

const idempotencyKey = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\x21-\x7e]+$/)

const bangladeshPhone = z
  .string()
  .max(64)
  .transform((value, ctx) => {
    try {
      const number = parsePhoneNumberWithError(value, {
        defaultCountry: 'BD',
        extract: false,
      })
      if (number.country !== 'BD' || !number.isValid() || number.ext)
        throw new Error('Invalid phone')
      return String(number.number)
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid Bangladesh phone' })
      return z.NEVER
    }
  })

const boundedText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => [...value].length <= max)
    .meta({ maxLength: max })

export { bangladeshPhone, boundedText, idempotencyKey, resourceId, singleLineText }
