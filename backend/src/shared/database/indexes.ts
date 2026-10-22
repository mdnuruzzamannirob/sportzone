import type { Model } from 'mongoose'
import { DatabaseError } from '../errors/database-error.js'

// Explicit additive rollout only. Never syncIndexes()/drop indexes at startup.
export async function createDeclaredIndexes<T>(model: Model<T>) {
  await model.createCollection()
  await model.createIndexes()
  return verifyDeclaredIndexes(model)
}
export async function verifyDeclaredIndexes(model: {
  diffIndexes: () => Promise<{ toCreate: unknown[]; toDrop: string[] }>
}) {
  const difference = await model.diffIndexes()
  if (difference.toCreate.length) throw new DatabaseError('INDEX_MISMATCH')
  return { extraIndexes: difference.toDrop }
}
