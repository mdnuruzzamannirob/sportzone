import { z } from 'zod'
import { loginInput } from '../credentials/credential.schema.js'
import { newPasswordPolicy } from '../credentials/password.service.js'
import { proofPattern } from '../verification/proof.crypto.js'

const issuance = loginInput.pick({ email: true })

const confirmation = z.strictObject({
  token: z.string().regex(proofPattern),
  newPassword: newPasswordPolicy,
})

const changeInput = z.strictObject({
  currentPassword: loginInput.shape.password,
  newPassword: newPasswordPolicy,
})

export { issuance, confirmation, changeInput }
