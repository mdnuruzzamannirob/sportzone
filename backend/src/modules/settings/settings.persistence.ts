import type { Connection } from 'mongoose'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { policyModel } from './policy.model.js'
import { settingsModel } from './settings.model.js'
import { settingsInteger } from './settings.schema.js'
export async function initializeSettingsPersistence(connection: Connection, threshold: number) {
  const lowStockThreshold = settingsInteger.parse(threshold)
  await createDeclaredIndexes(settingsModel(connection))
  await createDeclaredIndexes(policyModel(connection))
  try {
    await settingsModel(connection).updateOne(
      { key: 'primary' },
      {
        $setOnInsert: {
          key: 'primary',
          createdAt: new Date(),
          updatedAt: new Date(),
          revision: 0,
          deliveryCoverageRevision: 0,
          lowStockThreshold,
          paymentChannels: {
            bkashEnabled: false,
            nagadEnabled: false,
            rocketEnabled: false,
            codEnabled: false,
          },
          activePolicyVersions: {},
        },
      },
      { upsert: true, runValidators: true, timestamps: false },
    )
  } catch (error) {
    // Another bootstrap may have won the unique identity race; never overwrite its state.
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000))
      throw error
  }
}
export async function verifySettingsPersistence(connection: Connection) {
  await verifyDeclaredIndexes(settingsModel(connection))
  await verifyDeclaredIndexes(policyModel(connection))
}
