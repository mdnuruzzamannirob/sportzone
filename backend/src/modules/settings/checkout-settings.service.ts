import type { ClientSession, Connection } from 'mongoose'
import type { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { verifySettingsPersistence } from './settings.persistence.js'
import { settingsModel } from './settings.model.js'
import { policyModel } from './policy.model.js'
import type { policyType } from './policy.schema.js'
import { paymentChannels } from './settings.schema.js'
export function checkoutSettingsAccess(
  connection: Connection,
  requiredTypes: readonly z.infer<typeof policyType>[],
) {
  return async (session: ClientSession, now: Date) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    try {
      await verifySettingsPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const settings = await settingsModel(connection).findOne({ key: 'primary' }).session(session)
    if (!settings) throw new ApiError('SERVICE_UNAVAILABLE')
    const flags = paymentChannels.safeParse(settings.toObject().paymentChannels)
    if (!flags.success) throw new ApiError('SERVICE_UNAVAILABLE')
    const policyVersions: {
      type: z.infer<typeof policyType>
      version: string
      effectiveAt: string
    }[] = []
    for (const type of requiredTypes) {
      const version: unknown = settings.get(`activePolicyVersions.${type}`)
      if (typeof version !== 'string' || !version) throw new ApiError('SERVICE_UNAVAILABLE')
      const policy = await policyModel(connection)
        .findOne({ type, version, status: 'published', effectiveAt: { $lte: now } })
        .session(session)
      if (!policy?.approvedAt || !policy.approvalEvidenceRef || !policy.effectiveAt)
        throw new ApiError('SERVICE_UNAVAILABLE')
      policyVersions.push({ type, version, effectiveAt: policy.effectiveAt.toISOString() })
    }
    return { flags: flags.data, policyVersions }
  }
}
