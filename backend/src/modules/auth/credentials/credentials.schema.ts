import { z } from 'zod'
import { newPasswordPolicy } from './password.service.js'

const email = z.string().trim().toLowerCase().pipe(z.email().max(254))
const nameLimit = 120
export const registrationInput = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .refine((s) => [...s].length <= nameLimit)
    .meta({ maxLength: nameLimit }),
  email,
  password: newPasswordPolicy,
})
export const loginInput = z.strictObject({
  email,
  password: z
    .string()
    .min(1)
    .refine((s) => Buffer.byteLength(s) <= 4096 && !/[\uD800-\uDFFF]/u.test(s)),
})
