import { z } from 'zod'
import { issuance } from '../recovery/password-recovery.schema.js'
import { proofPattern } from './proof.crypto.js'
export const emailVerificationInput = issuance
export const emailVerificationConfirmation = z.strictObject({
  token: z.string().regex(proofPattern),
})
