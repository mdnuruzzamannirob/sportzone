import { z } from 'zod'
import { addressSchema, newPassword, recoveryInput } from '../auth/auth.schema'

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => [...value].length <= max)
export const profileInput = z.strictObject({
  name: text(120),
  phone: z.string().trim().min(1).optional(),
})
export const addressInput = addressSchema.omit({ id: true, isDefault: true })
export const passwordChangeInput = z.strictObject({
  currentPassword: z.string().min(1),
  newPassword,
})
export const emailChangeInput = recoveryInput.transform((value) => ({ newEmail: value.email }))
export const emailProofInput = z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
