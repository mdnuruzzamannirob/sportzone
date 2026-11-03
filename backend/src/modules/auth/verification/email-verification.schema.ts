import { z } from 'zod'
import { issuance } from '../recovery/password-recovery.schema.js'
import { proofPattern } from './proof.crypto.js'
const emailVerificationInput = issuance
const emailVerificationConfirmation = z.strictObject({
  token: z.string().regex(proofPattern),
})

export { emailVerificationInput, emailVerificationConfirmation }
