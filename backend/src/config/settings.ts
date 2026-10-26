import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { policyType } from '../modules/settings/policy.schema.js'
import { ConfigurationError } from '../shared/errors/configuration-error.js'
export const policyApproval = z.strictObject({
  evidenceRef: z.string().min(1).max(2000),
  type: policyType,
  version: z.string().min(1).max(100),
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  effectiveAt: z.iso.datetime({ offset: true }),
  approvedAt: z.iso.datetime({ offset: true }),
  approvedBy: z.string().trim().min(1).max(120),
})
export type PolicyApproval = z.infer<typeof policyApproval>
export async function loadPolicyApprovals(
  env: NodeJS.ProcessEnv,
): Promise<readonly PolicyApproval[]> {
  if (!env.POLICY_APPROVALS_FILE) return []
  try {
    const raw = await readFile(env.POLICY_APPROVALS_FILE)
    if (raw.length > 1000000) throw new Error()
    const rows = z
      .array(policyApproval)
      .max(1000)
      .parse(JSON.parse(raw.toString('utf8')))
    if (new Set(rows.map((row) => row.evidenceRef)).size !== rows.length) throw new Error()
    for (const row of rows) if (Date.parse(row.approvedAt) > Date.now()) throw new Error()
    return rows
  } catch {
    throw new ConfigurationError(['POLICY_APPROVALS_FILE'])
  }
}
