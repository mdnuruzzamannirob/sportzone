import { z } from 'zod'
import { proofPattern } from '../verification/proof.crypto.js'

const guestChallengeInput = z.strictObject({
  orderNumber: z.string().trim().min(1).max(64),
  email: z.string().trim().email().max(254).toLowerCase(),
})

const guestExchangeInput = z.strictObject({ challengeToken: z.string().regex(proofPattern) })

const guestAccepted = z.strictObject({ accepted: z.literal(true) })

const guestSessionView = z.strictObject({
  orderId: z.string().regex(/^[a-f0-9]{24}$/),
  expiresAt: z.iso.datetime({ offset: true }),
})

const guestExchangeView = guestSessionView.extend({
  csrfToken: z.string().regex(proofPattern),
})

const guestLogoutView = z.strictObject({
  revoked: z.literal(true),
  csrfToken: z.string().regex(proofPattern),
})

export {
  guestAccepted,
  guestChallengeInput,
  guestExchangeInput,
  guestExchangeView,
  guestLogoutView,
  guestSessionView,
}
