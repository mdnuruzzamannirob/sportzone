import { MongoMemoryReplSet } from 'mongodb-memory-server-core'

// Ephemeral synthetic development data only; no external URI is read or cleaned.
const replica = await MongoMemoryReplSet.create({
  binary: { version: '8.0.16' },
  replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
})
console.log('Ephemeral local replica set. Data is discarded when this process stops.')
console.log(`MONGODB_URI=${replica.getUri('sportzone_local')}`)
const stop = async () => {
  await replica.stop()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
