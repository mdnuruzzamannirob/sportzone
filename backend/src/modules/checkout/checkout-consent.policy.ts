import { createHash } from 'node:crypto'
import { parseInput } from '../../shared/middleware/validate.js'
import type {
  CheckoutCommercialSnapshotSchema,
  NormalizedCheckoutDraftSchema,
} from './checkout.schema.js'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

function checkoutDraftFingerprint(
  raw: unknown,
  moduleAccess: { schemaNormalizedCheckoutDraft: NormalizedCheckoutDraftSchema },
) {
  const draft = parseInput(moduleAccess.schemaNormalizedCheckoutDraft, raw)
  draft.items.sort((a, b) => a.variantId.localeCompare(b.variantId))
  return hash(draft)
}

function checkoutCommercialDigest(
  raw: unknown,
  moduleAccess: { schemaCheckoutCommercialSnapshot: CheckoutCommercialSnapshotSchema },
) {
  const snapshot = parseInput(moduleAccess.schemaCheckoutCommercialSnapshot, raw)
  const { capturedAt, ...deadlineBasis } = snapshot.deadlineBasis
  void capturedAt
  return hash({ ...snapshot, deadlineBasis })
}

export { checkoutCommercialDigest, checkoutDraftFingerprint }
