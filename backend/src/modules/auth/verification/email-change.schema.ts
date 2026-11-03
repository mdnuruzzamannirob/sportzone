import { z } from 'zod'
import { loginInput } from '../credentials/credential.schema.js'
import { proofPattern } from './proof.crypto.js'

const requestInput = z.strictObject({ newEmail: loginInput.shape.email })

const confirmInput = z.strictObject({ token: z.string().regex(proofPattern) })

export { confirmInput, requestInput }
