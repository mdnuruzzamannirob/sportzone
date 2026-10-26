import type { Connection } from 'mongoose'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { deliveryModels } from './delivery.model.js'
export async function initializeDeliveryPersistence(connection: Connection) {
  const { zones, charges } = deliveryModels(connection)
  await createDeclaredIndexes(zones)
  await createDeclaredIndexes(charges)
}
export async function verifyDeliveryPersistence(connection: Connection) {
  const { zones, charges } = deliveryModels(connection)
  await verifyDeclaredIndexes(zones)
  await verifyDeclaredIndexes(charges)
}
