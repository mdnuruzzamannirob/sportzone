import type { ClientSession, Connection } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { settingsModel } from './settings.model.js'
// Narrow capability: delivery can serialize coverage changes, never edit settings/policy data.
export function deliverySettingsGuard(connection: Connection) {
  const model = settingsModel(connection)
  return async (session: ClientSession) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    try {
      await verifyDeclaredIndexes(model)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const row = await model
      .findOne({ key: 'primary' })
      .select('deliveryCoverageRevision')
      .session(session)
    if (
      !row ||
      !Number.isSafeInteger(row.deliveryCoverageRevision) ||
      row.deliveryCoverageRevision < 0
    )
      throw new ApiError('SERVICE_UNAVAILABLE')
    if (row.deliveryCoverageRevision >= Number.MAX_SAFE_INTEGER)
      throw new ApiError('STATE_CONFLICT')
    const result = await model.updateOne(
      { _id: row._id, deliveryCoverageRevision: row.deliveryCoverageRevision },
      { $inc: { deliveryCoverageRevision: 1 } },
      { session, timestamps: false },
    )
    if (result.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
  }
}
