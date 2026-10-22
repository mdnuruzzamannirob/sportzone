// Isolated browser fixture only: real backend + replica MongoDB behind local TLS.
// Control/proof material travels only over parent IPC, never HTTP/logs/artifacts.
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createServer as httpsServer } from 'node:https'
import { request as upstreamRequest } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { Types } from 'mongoose'
import { openDatabase } from '../../backend/dist/config/database.js'
import { loadEnvironment } from '../../backend/dist/config/env.js'
import {
  loadRecoveryOptions,
  loadAdminRecoveryOptions,
  loadEmailChangeOptions,
} from '../../backend/dist/config/security.js'
import { createIdentityModels } from '../../backend/dist/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../backend/dist/modules/auth/identity.persistence.js'
import { createRegistrationNotifications } from '../../backend/dist/modules/notifications/notification.service.js'
import { composeIdentityRoutes } from '../../backend/dist/setup.js'
import { provisionInitialAdmin } from '../../backend/dist/modules/auth/credentials/admin-provision.service.js'
import { hashPassword } from '../../backend/dist/modules/auth/credentials/password.service.js'
import {
  createResetDelivery,
  createAdminResetDelivery,
  createEmailChangeDelivery,
} from '../../backend/dist/modules/auth/verification/proof-delivery.service.js'
import { createApp } from '../../backend/dist/app.js'

let replica, connection, directory, models, environment
const servers = []
async function stop() {
  for (const server of servers) {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
  await connection?.close()
  await replica?.stop()
  if (directory) await rm(directory, { recursive: true, force: true })
}
try {
  directory = await mkdtemp(join(tmpdir(), 'sportzone-auth-'))
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(directory, 'key.pem'),
      '-out',
      join(directory, 'cert.pem'),
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ],
    { stdio: 'ignore' },
  )
  const tls = {
    key: await readFile(join(directory, 'key.pem')),
    cert: await readFile(join(directory, 'cert.pem')),
  }
  replica = await MongoMemoryReplSet.create({
    binary: { version: '8.0.16' },
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const name = `sportzone_browser_${randomUUID().replaceAll('-', '')}`
  connection = await openDatabase(replica.getUri(), name)
  environment = {
    NODE_ENV: 'test',
    APP_ENV: 'test',
    RELEASE_ID: 'synthetic-browser',
    PORT: '4443',
    API_BIND_HOST: '127.0.0.1',
    MONGODB_URI: replica.getUri(),
    MONGODB_DB_NAME: name,
    SESSION_SECRET: randomBytes(32).toString('hex'),
    HEALTH_MONITOR_TOKEN: randomBytes(32).toString('hex'),
    API_PUBLIC_ORIGIN: 'https://127.0.0.1:4443',
    STOREFRONT_ORIGIN: 'https://127.0.0.1:3443',
    ADMIN_ORIGIN: 'https://127.0.0.1:5443',
    CORS_ALLOWED_ORIGINS: 'https://127.0.0.1:3443,https://127.0.0.1:5443',
    CUSTOMER_AUTH_ENABLED: 'true',
    ADMIN_AUTH_ENABLED: 'true',
    CUSTOMER_SESSION_TTL_SECONDS: '600',
    ADMIN_SESSION_TTL_SECONDS: '300',
    SESSION_COOKIE_SAME_SITE: 'lax',
    BROWSER_CONTEXT_TTL_SECONDS: '300',
    PASSWORD_RECOVERY_ENABLED: 'true',
    EMAIL_CHANGE_ENABLED: 'true',
    AUTH_PROOF_ACTIVE_KEY_VERSION: 'fixture',
    AUTH_PROOF_KEYS_JSON: JSON.stringify({ fixture: randomBytes(32).toString('hex') }),
  }
  for (const prefix of ['PASSWORD_RESET', 'ADMIN_PASSWORD_RESET', 'EMAIL_CHANGE'])
    Object.assign(environment, {
      [`${prefix}_TTL_SECONDS`]: '600',
      [`${prefix}_COOLDOWN_SECONDS`]: '60',
      [`${prefix}_RESPONSE_FLOOR_MS`]: '100',
    })
  const config = loadEnvironment(environment)
  models = createIdentityModels(connection)
  await initializeIdentityPersistence(connection, models)
  await createRegistrationNotifications(connection).initialize()
  await provisionInitialAdmin(connection, models, {
    name: 'Synthetic administrator',
    email: 'admin@example.test',
    password: 'Synthetic administrator password',
  })
  await new models.users({
    name: 'Synthetic customer',
    emailNormalized: 'customer@example.test',
    passwordHash: await hashPassword('Synthetic customer password'),
    role: 'customer',
    emailVerifiedAt: new Date(),
  }).save()
  const zoneId = new Types.ObjectId()
  await connection.db
    .collection('deliveryZones')
    .insertOne({ _id: zoneId, name: 'Synthetic zone', status: 'active' })
  await connection.db
    .collection('deliveryCharges')
    .insertOne({
      zoneId,
      coverageKey: 'dhaka:dhanmondi',
      status: 'active',
      effectiveFrom: new Date(Date.now() - 1000),
      amountPoisha: 100,
      ruleVersion: 1,
    })
  const app = createApp({ apiRouter: await composeIdentityRoutes(connection, config) })
  async function listen(server, port) {
    servers.push(server)
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', resolve)
    })
  }
  await listen(httpsServer(tls, app), 4443)
  for (const [external, internal] of [
    [3443, 3100],
    [5443, 5273],
  ])
    await listen(
      httpsServer(tls, (req, res) => {
        const upstream = upstreamRequest(
          {
            hostname: '127.0.0.1',
            port: internal,
            path: req.url,
            method: req.method,
            headers: req.headers,
          },
          (reply) => {
            res.writeHead(reply.statusCode ?? 502, reply.headers)
            reply.pipe(res)
          },
        )
        upstream.on('error', () => {
          res.writeHead(502)
          res.end()
        })
        req.pipe(upstream)
      }),
      external,
    )
  process.on('message', async (message) => {
    if (!message || typeof message !== 'object') return
    if (message.type === 'close') {
      await stop()
      process.exit(0)
    }
    try {
      let result = true
      if (message.type === 'resetQuotas')
        await connection.db.collection('authRateLimits').deleteMany({})
      if (message.type === 'suspend')
        await models.users.updateOne(
          { emailNormalized: message.email },
          { $set: { status: 'suspended' } },
        )
      if (message.type === 'expire')
        await models.users.updateOne(
          { emailNormalized: message.email },
          { $inc: { securityRevision: 1 } },
        )
      if (message.type === 'proof') {
        const user = await models.users.findOne({ emailNormalized: message.email })
        const purpose = message.kind === 'email' ? 'email_change' : 'password_reset'
        const challenge = await models.challenges
          .findOne({
            userId: user?._id,
            purpose,
            consumedAt: { $exists: false },
            invalidatedAt: { $exists: false },
          })
          .sort({ createdAt: -1 })
        if (!user || !challenge?.deliveryNotificationId) throw new Error()
        const options =
          message.kind === 'email'
            ? loadEmailChangeOptions(environment)
            : message.kind === 'admin'
              ? loadAdminRecoveryOptions(environment)
              : loadRecoveryOptions(environment)
        const delivery =
          message.kind === 'email'
            ? createEmailChangeDelivery(models, options)
            : message.kind === 'admin'
              ? createAdminResetDelivery(models, options)
              : createResetDelivery(models, options)
        const mail = await delivery.message({
          id: challenge.deliveryNotificationId,
          userId: user._id,
          challengeId: challenge._id,
          recipient:
            message.kind === 'email' ? challenge.targetEmailNormalized : user.emailNormalized,
        })
        result = mail.text.split('\n').find((line) => line.startsWith('https://'))
      }
      process.send?.({ id: message.id, result })
    } catch {
      process.send?.({ id: message.id, error: 'Fixture operation failed' })
    }
  })
  process.on('disconnect', () => {
    void stop().finally(() => process.exit(0))
  })
  process.once('SIGTERM', () => {
    void stop().finally(() => process.exit(0))
  })
  process.send?.({ ready: true })
} catch {
  process.send?.({ error: 'Isolated authentication fixture failed' })
  await stop()
  process.exit(1)
}
