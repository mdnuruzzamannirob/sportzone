import { z } from 'zod'
import { bangladeshPhone } from '../../shared/validation.js'

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => [...value].length <= max)
    .meta({ maxLength: max })

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

export { addressId, addressInput, addressPatch, bangladeshPhone, deletionInput, profilePatch }
