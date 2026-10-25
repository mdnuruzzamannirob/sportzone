import { z } from 'zod'
import { loginInput } from '../credentials/credentials.schema.js'
import { proofPattern } from './proof.crypto.js'

export const requestInput = z.strictObject({ newEmail: loginInput.shape.email })
export const confirmInput = z.strictObject({ token: z.string().regex(proofPattern) })
