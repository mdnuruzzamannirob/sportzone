import { parsePhoneNumberWithError } from 'libphonenumber-js/max'
import { z } from 'zod'

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => [...value].length <= max)
    .meta({ maxLength: max })
export const bangladeshPhone = z
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
export const profilePatch = z
  .strictObject({
    name: text(120).optional(),
    phone: bangladeshPhone.optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined))
const key = text(64).refine((value) => !value.includes(':') && value !== '*')
export const addressInput = z.strictObject({
  recipient: text(120),
  phone: bangladeshPhone,
  districtKey: key,
  areaKey: key,
  street: text(300),
  postalCode: text(30).optional(),
  addressLine2: text(300).optional(),
})
export const addressPatch = addressInput
  .extend({ isDefault: z.boolean() })
  .partial()
  .refine((value) => Object.values(value).some((v) => v !== undefined))
export const addressId = z.string().regex(/^[a-f0-9]{24}$/)
export const deletionInput = z.strictObject({ reason: text(2000).optional() })
