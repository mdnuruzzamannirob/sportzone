import { randomBytes, createHash } from 'node:crypto'
import { open, readFile, writeFile } from 'node:fs/promises'
import {
  createCloudinaryAdapter,
  validateCloudinaryOptions,
} from '../dist/providers/cloudinary/cloudinary.client.js'
import {
  createClamAvScanner,
  inspectClamAvVersion,
} from '../dist/providers/antivirus/clamav.client.js'

// Synthetic assets only. Prepare and persist the intent artifact before --run.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
)
const digest = createHash('sha256').update(png).digest('hex')
const args = process.argv.slice(2)
let plan, options, provider, file
const checks = {}
const assert = (condition, name) => {
  checks[name] = Boolean(condition)
  if (!condition) throw new Error(name)
}
const save = async () => writeFile(file, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 })
async function imageResponse(url) {
  let current = new URL(url)
  for (let i = 0; i < 4; i++) {
    if (
      current.protocol !== 'https:' ||
      current.username ||
      current.password ||
      !['api.cloudinary.com', 'res.cloudinary.com'].includes(current.hostname)
    )
      throw new Error('delivery_destination')
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new Error('delivery_redirect')
      current = new URL(location, current)
      continue
    }
    if (response.status !== 200) {
      await response.body?.cancel()
      return { status: response.status, image: false }
    }
    const reader = response.body?.getReader()
    let data = Buffer.alloc(0)
    if (!reader) throw new Error('delivery_body')
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      data = Buffer.concat([data, part.value])
      if (data.length > 1024 * 1024) {
        await reader.cancel()
        throw new Error('delivery_limit')
      }
    }
    return { status: response.status, image: data.subarray(0, 8).equals(png.subarray(0, 8)) }
  }
  throw new Error('delivery_redirect_limit')
}
const denied = (result) => [400, 401, 403, 404].includes(result.status) && !result.image
try {
  if (args.length !== 2 || !['--prepare', '--run'].includes(args[0])) throw new Error('arguments')
  file = args[1]
  if (args[0] === '--prepare') {
    plan = {
      version: 1,
      createdAt: new Date().toISOString(),
      revision: process.env.GITHUB_SHA || 'local-operator',
      digest,
      cloudIdentity: createHash('sha256')
        .update(process.env.CLOUDINARY_CLOUD_NAME || '')
        .digest('hex'),
      assets: ['upload', 'authenticated'].map((delivery) => ({
        publicId: `sportzone/${randomBytes(12).toString('hex')}`,
        delivery,
        attempted: false,
        cleanup: 'not_needed',
      })),
      checks,
      status: 'prepared',
    }
    const handle = await open(file, 'wx', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(plan, null, 2)}\n`)
    } finally {
      await handle.close()
    }
    console.log('Synthetic qualification intent prepared; persist it before run.')
    process.exit(0)
  }
  if (
    process.env.APP_ENV !== 'staging' ||
    process.env.MEDIA_QUALIFICATION_AUTHORIZED !== 'true' ||
    !process.env.MEDIA_QUALIFICATION_INTENT_REFERENCE
  )
    throw new Error('authority')
  const candidate = JSON.parse(await readFile(file, 'utf8'))
  assert(
    candidate.version === 1 &&
      candidate.status === 'prepared' &&
      candidate.digest === digest &&
      Date.now() - Date.parse(candidate.createdAt) >= 0 &&
      Date.now() - Date.parse(candidate.createdAt) < 3600000,
    'fresh_intent',
  )
  assert(
    Array.isArray(candidate.assets) &&
      candidate.assets.length === 2 &&
      candidate.assets[0].delivery === 'upload' &&
      candidate.assets[1].delivery === 'authenticated' &&
      candidate.assets.every(
        (x) => /^sportzone\/[a-f0-9]{24}$/.test(x.publicId) && x.attempted === false,
      ),
    'scoped_intent',
  )
  assert(
    candidate.cloudIdentity ===
      createHash('sha256')
        .update(process.env.CLOUDINARY_CLOUD_NAME || '')
        .digest('hex'),
    'cloud_identity',
  )
  assert(
    !process.env.GITHUB_SHA || candidate.revision === process.env.GITHUB_SHA,
    'revision_identity',
  )
  plan = candidate
  options = validateCloudinaryOptions({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    timeoutMs: 15000,
  })
  provider = createCloudinaryAdapter(options)
  const scannerOptions = {
    host: process.env.MEDIA_SCANNER_HOST,
    port: Number(process.env.MEDIA_SCANNER_PORT),
    timeoutMs: 15000,
  }
  let match, updated
  // RELOAD acknowledges a request before clamd finishes swapping its database.
  // Wait at most 60 seconds for a fresh loaded version; never relax the freshness gate.
  for (let attempt = 0; attempt < 31; attempt++) {
    const version = await inspectClamAvVersion(scannerOptions)
    match = /^ClamAV ([0-9.]+)\/([0-9]+)\/(.+)$/.exec(version || '')
    updated = match ? Date.parse(`${match[3]} UTC`) : NaN
    if (Number.isFinite(updated) && updated <= Date.now() && Date.now() - updated <= 48 * 3600000)
      break
    if (attempt < 30) await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  assert(process.env.MEDIA_SCANNER_TIMEZONE === 'UTC' && Boolean(match), 'scanner_version_format')
  plan.scanner = {
    engine: match[1],
    signatureVersion: match[2],
    updatedAt: Number.isFinite(updated) ? new Date(updated).toISOString() : 'unparseable',
  }
  await save()
  assert(
    Number.isFinite(updated) && updated <= Date.now() && Date.now() - updated <= 48 * 3600000,
    'scanner_signatures_fresh',
  )
  const scan = createClamAvScanner(scannerOptions)
  assert((await scan(png)) === 'clean', 'clean_image_scan')
  assert(
    (await scan(
      Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'),
    )) === 'rejected',
    'eicar_scan',
  )
  plan.intentReference = process.env.MEDIA_QUALIFICATION_INTENT_REFERENCE
  plan.status = 'running'
  await save()
  for (const asset of plan.assets) {
    assert(
      (await provider.lookup(asset.publicId, asset.delivery)).kind === 'missing',
      `new_identity_${asset.delivery}`,
    )
    asset.attempted = true
    asset.cleanup = 'pending'
    await save()
    const uploaded = await provider.upload({
      publicId: asset.publicId,
      delivery: asset.delivery,
      file: png,
      format: 'png',
      digest,
    })
    assert(
      uploaded.kind === 'found' &&
        uploaded.asset.digest === digest &&
        uploaded.asset.size === png.length &&
        uploaded.asset.width === 1 &&
        uploaded.asset.height === 1,
      `upload_${asset.delivery}`,
    )
    assert(
      (await provider.lookup(asset.publicId, asset.delivery)).kind === 'found',
      `lookup_${asset.delivery}`,
    )
    if (asset.delivery === 'upload') {
      const publicImage = await imageResponse(provider.publicUrl(asset.publicId, 'png'))
      assert(publicImage.status === 200 && publicImage.image, 'public_delivery')
    } else {
      const root = `https://res.cloudinary.com/${options.cloudName}/image/authenticated/`
      assert(denied(await imageResponse(`${root}${asset.publicId}.png`)), 'private_original_denied')
      assert(
        denied(await imageResponse(`${root}c_fill,w_1,h_1/${asset.publicId}.png`)),
        'private_derived_denied',
      )
      const url = provider.privateUrl(asset.publicId, 'png', new Date(Date.now() + 60000))
      const authorized = await imageResponse(url)
      assert(authorized.status === 200 && authorized.image, 'private_signed_delivery')
      const stale = createCloudinaryAdapter(options, fetch, () => new Date(Date.now() - 120000))
      assert(
        denied(
          await imageResponse(
            stale.privateUrl(asset.publicId, 'png', new Date(Date.now() - 60000)),
          ),
        ),
        'expired_signature_denied',
      )
      const tampered = new URL(url)
      tampered.searchParams.set('public_id', `sportzone/${randomBytes(12).toString('hex')}`)
      assert(denied(await imageResponse(tampered)), 'tampered_signature_denied')
    }
  }
  plan.status = 'checks_passed'
} catch {
  if (plan) {
    plan.status = 'failed'
    plan.checks = checks
  }
  console.error('Media qualification failed; inspect sanitized intent/check report.')
  process.exitCode = 1
} finally {
  if (plan && args[0] === '--run') {
    if (provider)
      for (const asset of plan.assets.filter((x) => x.attempted)) {
        try {
          const found = await provider.lookup(asset.publicId, asset.delivery)
          if (found.kind === 'missing') asset.cleanup = 'confirmed'
          else if (
            found.kind === 'found' &&
            found.asset.digest === digest &&
            found.asset.publicId === asset.publicId &&
            found.asset.delivery === asset.delivery &&
            (await provider.remove(asset.publicId, asset.delivery)) === 'deleted' &&
            (await provider.lookup(asset.publicId, asset.delivery)).kind === 'missing'
          )
            asset.cleanup = 'confirmed'
          else asset.cleanup = 'uncertain'
        } catch {
          asset.cleanup = 'uncertain'
        }
      }
    plan.checks = checks
    if (plan.assets.some((x) => x.attempted && x.cleanup !== 'confirmed')) {
      plan.status = 'cleanup_pending'
      process.exitCode = 1
    }
    if (plan.status === 'checks_passed') plan.status = 'passed'
    await save()
    console.log(
      JSON.stringify({
        status: plan.status,
        checks: Object.keys(checks).filter((x) => checks[x]),
        cleanupPending: plan.assets.some((x) => x.cleanup === 'uncertain'),
      }),
    )
  }
}
