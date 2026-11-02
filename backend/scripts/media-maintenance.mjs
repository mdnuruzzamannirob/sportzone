import { mediaMaintenanceDeletionAllowed } from '../dist/modules/media/cleanup.service.js'
import { loadEnvironment } from '../dist/config/env.js'
import { loadMediaMaintenanceConfiguration } from '../dist/config/media.js'
import { openDatabase } from '../dist/config/database.js'
import { createMediaService } from '../dist/modules/media/media.service.js'
import { createCloudinaryAdapter } from '../dist/providers/cloudinary/cloudinary.client.js'
import { mediaMaintenanceJob } from '../dist/jobs/media-maintenance.job.js'
let connection
try {
  const config = loadEnvironment(process.env),
    options = loadMediaMaintenanceConfiguration(process.env)
  if (!options) throw new Error('Explicit maintenance admission required')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  const unavailable = async () => {
    throw new Error('Upload and browser access are unavailable in maintenance')
  }
  const media = createMediaService(connection, {
    provider: createCloudinaryAdapter(options.cloud),
    policy: options.policy,
    scanner: unavailable,
    access: { admin: unavailable, evidence: unavailable },
    async canDelete(asset) {
      return mediaMaintenanceDeletionAllowed(asset, new Date())
    },
  })
  console.log(
    JSON.stringify({
      event: 'media_maintenance',
      ...(await mediaMaintenanceJob(connection, media, {
        batchSize: options.batchSize,
        leaseMs: options.leaseMs,
      }).run()),
    }),
  )
} catch {
  console.error(
    'Media maintenance failed; inspect protected policy, persistence and durable lease state.',
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
