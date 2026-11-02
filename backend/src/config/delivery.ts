import { readFile } from 'node:fs/promises'
import {
  deliveryDeadlineManifest,
  deliveryDeadlineRule,
  type DeliveryDeadlineManifest,
} from '../modules/orders/delivery-deadline.schema.js'
import { jsonDigest } from '../shared/crypto.js'
import { ConfigurationError } from '../shared/errors/configuration-error.js'

// Only the operator's protected read-only manifest is a configuration source. Browser inputs
// cannot install a rule. Hash matching validates the normalized reviewed rule, not legal applicability.
async function loadDeliveryDeadlinePolicy(
  env: NodeJS.ProcessEnv,
): Promise<DeliveryDeadlineManifest | undefined> {
  if (!env.DELIVERY_DEADLINE_POLICY_FILE) return undefined
  try {
    const bytes = await readFile(env.DELIVERY_DEADLINE_POLICY_FILE)
    if (bytes.length > 100000) throw new Error()
    const manifest = deliveryDeadlineManifest.parse(JSON.parse(bytes.toString('utf8')))
    if (
      manifest.review.ruleDigest !== jsonDigest(deliveryDeadlineRule.parse(manifest.rule)) ||
      Date.parse(manifest.review.approvedAt) > Date.now()
    )
      throw new Error()
    return manifest
  } catch {
    throw new ConfigurationError(['DELIVERY_DEADLINE_POLICY_FILE'])
  }
}

export { loadDeliveryDeadlinePolicy }
