import { z } from 'zod'
import { loginInput } from '../credentials/credentials.schema.js'
import { newPasswordPolicy } from '../credentials/password.service.js'
import { proofPattern } from '../verification/proof.crypto.js'

export const issuance = loginInput.pick({ email: true })
export const confirmation = z.strictObject({
  token: z.string().regex(proofPattern),
  newPassword: newPasswordPolicy,
})
export const changeInput = z.strictObject({
  currentPassword: loginInput.shape.password,
  newPassword: newPasswordPolicy,
})
