import { createHash } from 'node:crypto'
import { parseInput } from '../../shared/middleware/validate.js'
import { checkoutCommercialSnapshot, normalizedCheckoutDraft } from './checkout.schema.js'
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function checkoutDraftFingerprint(raw: unknown) {
  const draft = parseInput(normalizedCheckoutDraft, raw)
  draft.items.sort((a, b) => a.variantId.localeCompare(b.variantId))
  return hash(draft)
}
export function checkoutCommercialDigest(raw: unknown) {
  const snapshot = parseInput(checkoutCommercialSnapshot, raw)
  const { capturedAt, ...deadlineBasis } = snapshot.deadlineBasis
  void capturedAt
  return hash({ ...snapshot, deadlineBasis })
}
