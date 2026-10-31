import { checkCloudinaryConnection } from '../dist/providers/cloudinary/cloudinary.client.js'
import { createClamAvScanner } from '../dist/providers/antivirus/clamav.client.js'
import { validateMediaPolicy } from '../dist/config/media.js'

// No uploads, deletes, DB writes, policy approval or runtime activation.
let stage = 'environment'
try {
  if (!['local', 'test', 'staging'].includes(process.env.APP_ENV))
    throw new Error('Nonproduction only.')
  stage = 'cloudinary_configuration'
  const cloudinary = await checkCloudinaryConnection({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    timeoutMs: Number(process.env.MEDIA_PROVIDER_TIMEOUT_MS),
  })
  stage = 'policy_configuration'
  let policy = 'missing_or_invalid'
  try {
    validateMediaPolicy({
      ...JSON.parse(process.env.MEDIA_POLICY_JSON ?? ''),
      temporaryTtlSeconds: Number(process.env.MEDIA_TEMP_TTL_SECONDS),
    })
    policy = 'configured_not_approved'
  } catch {}
  let scanner = 'not_configured'
  if (process.env.MEDIA_SCANNER_HOST && process.env.MEDIA_SCANNER === 'clamav') {
    stage = 'scanner_configuration'
    const scan = createClamAvScanner({
      host: process.env.MEDIA_SCANNER_HOST,
      port: Number(process.env.MEDIA_SCANNER_PORT),
      timeoutMs: Number(process.env.MEDIA_SCANNER_TIMEOUT_MS),
    })
    stage = 'scanner_probe'
    const clean = await scan(Buffer.from('Synthetic SportZone scanner connectivity probe.'))
    const eicar = Buffer.from(
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
    )
    const rejected = await scan(eicar)
    scanner =
      clean === 'clean' && rejected === 'rejected'
        ? 'probe_passed_not_freshness_qualified'
        : 'probe_failed'
  }
  console.log(JSON.stringify({ cloudinary, policy, scanner, uploadQualification: 'not_run' }))
  if (
    cloudinary !== 'verified' ||
    policy === 'missing_or_invalid' ||
    scanner !== 'probe_passed_not_freshness_qualified'
  )
    process.exitCode = 1
} catch {
  console.log(JSON.stringify({ status: 'failed', stage, reason: 'configuration_or_probe_failed' }))
  console.error('Media preflight failed; inspect private nonproduction configuration.')
  process.exitCode = 1
}
