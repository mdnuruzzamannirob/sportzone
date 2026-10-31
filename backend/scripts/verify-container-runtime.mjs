import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { openDatabase } from '../dist/config/database.js'
import {
  inspectCatalogRollout,
  applyCatalogRollout,
} from '../dist/modules/catalog/catalog-rollout.service.js'
import { initializeAllocationPersistence } from '../dist/modules/inventory/inventory.persistence.js'
import { initializeJobLeases } from '../dist/shared/jobs/job-lease.model.js'

// Linux host networking reaches ONLY a generated loopback replica set; never reads .env files.
const execute = promisify(execFile)
const image = process.argv[2]
if (process.platform !== 'linux' || !image || !/^[a-z0-9][a-z0-9/_.:-]*$/.test(image))
  throw new Error('Linux and an explicit local test image are required.')
const name = `sportzone-runtime-${randomUUID()}`
const checks = {}
let replica, connection, directory
const docker = async (...args) =>
  (await execute('docker', args, { timeout: 30000, maxBuffer: 1048576 })).stdout.trim()
const check = (value, key) => {
  checks[key] = Boolean(value)
  if (!value) throw new Error(key)
}
try {
  replica = await MongoMemoryReplSet.create({
    binary: { version: '8.0.16' },
    replSet: { count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' },
  })
  const uri = replica.getUri(),
    database = `sportzone_test_${randomBytes(12).toString('hex')}`
  connection = await openDatabase(uri, database)
  const plan = await inspectCatalogRollout(connection)
  await applyCatalogRollout(connection, plan.digest)
  await initializeAllocationPersistence(connection)
  await initializeJobLeases(connection)
  // Verify commit/abort on this generated database, never on staging collections.
  await connection.db.createCollection('runtimeProbe')
  const session = await connection.startSession()
  try {
    await session.withTransaction(async () => {
      await connection.db.collection('runtimeProbe').insertOne({ value: 'committed' }, { session })
    })
    try {
      await session.withTransaction(async () => {
        await connection.db.collection('runtimeProbe').insertOne({ value: 'aborted' }, { session })
        throw new Error('synthetic abort')
      })
    } catch {}
    check(
      (await connection.db.collection('runtimeProbe').countDocuments()) === 1,
      'transaction_commit_and_abort',
    )
  } finally {
    await session.endSession()
  }
  const socket = createServer()
  await new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', resolve)
  })
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  const token = randomBytes(32).toString('hex')
  directory = await mkdtemp(join(tmpdir(), 'sportzone-container-'))
  const env = {
    NODE_ENV: 'test',
    APP_ENV: 'test',
    API_BIND_HOST: '127.0.0.1',
    PORT: String(port),
    RELEASE_ID: 'isolated-container-check',
    MONGODB_URI: uri,
    MONGODB_DB_NAME: database,
    SESSION_SECRET: randomBytes(32).toString('hex'),
    HEALTH_MONITOR_TOKEN: token,
    API_PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
    STOREFRONT_ORIGIN: 'http://localhost:3000',
    ADMIN_ORIGIN: 'http://localhost:5173',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:5173',
    RESERVATION_EXPIRY_BATCH_SIZE: '10',
    RESERVATION_EXPIRY_LEASE_MS: '30000',
  }
  const envFile = join(directory, 'runtime.env')
  await writeFile(
    envFile,
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
    { mode: 0o600 },
  )
  await docker('run', '--detach', '--name', name, '--network', 'host', '--env-file', envFile, image)
  const probe = async (path, authorized = false) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: authorized ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(2000),
    })
    await r.body?.cancel()
    return r.status
  }
  const ready = async () => {
    for (let i = 0; i < 30; i++) {
      try {
        if ((await probe('/api/v1/health/ready', true)) === 200) return true
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    return false
  }
  check(await ready(), 'container_database_readiness')
  check((await probe('/api/v1/health/ready')) === 401, 'readiness_authentication')
  check((await probe('/api/v1/products')) === 200, 'initialized_catalog_read')
  check((await docker('exec', name, 'id', '-u')) !== '0', 'non_root')
  await docker('stop', '--time', '15', name)
  const log = await docker('logs', name)
  check(log.includes('"eventType":"stopped"'), 'sigterm_graceful_shutdown')
  check(
    !log.includes(uri) && !log.includes(token) && !log.includes(env.SESSION_SECRET),
    'secret_redaction',
  )
  await docker('start', name)
  check(await ready(), 'container_restart_readiness')
  for (let i = 0; i < 2; i++) {
    const output = await docker(
      'run',
      '--rm',
      '--network',
      'host',
      '--env-file',
      envFile,
      image,
      'scripts/expire-reservations.mjs',
    )
    const result = JSON.parse(output)
    check(
      result.acquired === true && result.scanned === 0 && result.released === 0,
      `worker_process_${i + 1}`,
    )
  }
  check(
    (await connection.db.collection('runtimeProbe').countDocuments()) === 1,
    'restart_preserves_committed_state',
  )
} catch {
  process.exitCode = 1
} finally {
  await docker('rm', '--force', name).catch(() => {})
  await connection?.close()
  await replica?.stop()
  if (directory) await rm(directory, { recursive: true, force: true })
  await mkdir('test-results', { recursive: true })
  const result = {
    scope: 'isolated_local_container',
    status: process.exitCode ? 'failed' : 'passed',
    checks,
  }
  await writeFile('test-results/container-runtime.json', `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result))
}
