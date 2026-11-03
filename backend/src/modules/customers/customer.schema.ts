import { parsePhoneNumberWithError } from 'libphonenumber-js/max'
import { z } from 'zod'

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => [...value].length <= max)
    .meta({ maxLength: max })

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

const profilePatch = z
  .strictObject({
    name: text(120).optional(),
    phone: bangladeshPhone.optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined))

const key = text(64).refine((value) => !value.includes(':') && value !== '*')

const addressInput = z.strictObject({
  recipient: text(120),
  phone: bangladeshPhone,
  districtKey: key,
  areaKey: key,
  street: text(300),
  postalCode: text(30).optional(),
  addressLine2: text(300).optional(),
})

const addressPatch = addressInput
  .extend({ isDefault: z.boolean() })
  .partial()
  .refine((value) => Object.values(value).some((v) => v !== undefined))

const addressId = z.string().regex(/^[a-f0-9]{24}$/)

const deletionInput = z.strictObject({ reason: text(2000).optional() })

export { bangladeshPhone, profilePatch, addressInput, addressPatch, addressId, deletionInput }
