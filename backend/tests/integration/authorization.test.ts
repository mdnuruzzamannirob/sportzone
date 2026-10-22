import { createCustomerAccountAccess } from '../../src/modules/auth/customer-account.service.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { Types } from 'mongoose'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { authorizeAccount } from '../../src/modules/auth/sessions/authorization.service.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { createProfileService } from '../../src/modules/customers/customer.service.js'
import { createAddressCoverage } from '../../src/modules/delivery/delivery-coverage.service.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { isolatedDatabase } from '../helpers/database.js'
let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let models: ReturnType<typeof createIdentityModels>
let sessions: ReturnType<typeof createSessionService>
const now = new Date()
beforeAll(async () => {
  fixture = await isolatedDatabase()
  models = createIdentityModels(fixture.connection)
  await initializeIdentityPersistence(fixture.connection, models)
  sessions = createSessionService(
    fixture.connection,
    models,
    {
      secret: randomBytes(32).toString('hex'),
      customerTtlSeconds: 600,
      adminTtlSeconds: 300,
      sameSite: 'lax',
      appEnvironment: 'test',
      apiOrigin: 'http://localhost:4000',
    },
    () => now,
  )
})
afterAll(async () => {
  await fixture?.close()
})
async function principal(kind: 'customer' | 'admin' = 'customer') {
  const user = await new models.users({
    name: 'Synthetic',
    emailNormalized: `${randomUUID()}@example.test`,
    passwordHash: 'synthetic_hash',
    role: kind,
  }).save()
  const issued = await sessions.issue(kind, user._id)
  const identity = await sessions.authenticate(kind, issued.token)
  return { user, issued, identity }
}
describe('P03-013 transaction authorization', () => {
  it.each(['customer', 'admin'] as const)(
    'allows only the active matching %s principal without extending expiry',
    async (kind) => {
      const own = await principal(kind)
      await inTransaction(fixture.connection, async (tx) => {
        const user = await authorizeAccount(models, own.identity, kind, tx, now)
        expect(user._id).toEqual(own.user._id)
        expect(user.role).toBe(kind)
      })
      expect((await models.sessions.findById(own.identity.sessionId))?.expiresAt).toEqual(
        own.issued.expiresAt,
      )
    },
  )
  it('authorizes a read without writing principal or credential metadata', async () => {
    const own = await principal()
    const beforeUser = await models.users.findById(own.user._id).lean()
    const beforeSession = await models.sessions.findById(own.identity.sessionId).lean()
    await inTransaction(fixture.connection, (tx) =>
      authorizeAccount(models, own.identity, 'customer', tx, now, false),
    )
    expect((await models.users.findById(own.user._id))?.updatedAt).toEqual(beforeUser?.updatedAt)
    expect((await models.sessions.findById(own.identity.sessionId))?.updatedAt).toEqual(
      beforeSession?.updatedAt,
    )
  })
  it('rejects wrong kind, forged user/session pair and a transactionless call', async () => {
    const own = await principal(),
      other = await principal()
    for (const identity of [
      { ...own.identity, kind: 'admin' as const },
      { ...own.identity, userId: other.user._id },
      { ...own.identity, sessionId: new Types.ObjectId() },
    ]) {
      await expect(
        inTransaction(fixture.connection, (tx) =>
          authorizeAccount(models, identity, 'customer', tx, now),
        ),
      ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    }
    const tx = await fixture.connection.startSession()
    try {
      await expect(
        authorizeAccount(models, own.identity, 'customer', tx, now),
      ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    } finally {
      await tx.endSession()
    }
  })
  it.each(['revoked', 'expired', 'suspended', 'role', 'revision'] as const)(
    'rechecks %s after an earlier valid authentication',
    async (state) => {
      const own = await principal()
      if (state === 'revoked') await sessions.logout('customer', own.issued.token)
      if (state === 'suspended')
        await models.users.updateOne({ _id: own.user._id }, { $set: { status: 'suspended' } })
      if (state === 'role')
        await models.users.updateOne({ _id: own.user._id }, { $set: { role: 'admin' } })
      if (state === 'revision')
        await models.users.updateOne({ _id: own.user._id }, { $inc: { securityRevision: 1 } })
      await expect(
        inTransaction(fixture.connection, (tx) =>
          authorizeAccount(
            models,
            own.identity,
            'customer',
            tx,
            state === 'expired' ? own.issued.expiresAt : now,
          ),
        ),
      ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    },
  )
  it('denies a profile mutation when logout occurs between initial authentication and transaction recheck', async () => {
    const own = await principal()
    const original = sessions.authenticate.bind(sessions)
    const spy = vi.spyOn(sessions, 'authenticate').mockImplementationOnce(async (kind, token) => {
      const identity = await original(kind, token)
      await sessions.logout(kind, token)
      return identity
    })
    try {
      const profiles = createProfileService(
        createCustomerAccountAccess(fixture.connection, models, sessions, () => now),
        createAddressCoverage(fixture.connection),
        () => now,
      )
      await expect(
        profiles.patch(own.issued.token, { name: 'Unauthorized' }),
      ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
      expect((await models.users.findById(own.user._id))?.name).toBe('Synthetic')
    } finally {
      spy.mockRestore()
    }
  })
  it('rolls back fencing writes with a failed business operation', async () => {
    const own = await principal()
    const before = await models.sessions.findById(own.identity.sessionId).lean()
    await expect(
      inTransaction(fixture.connection, async (tx) => {
        await authorizeAccount(models, own.identity, 'customer', tx, now)
        throw new Error('Synthetic failure')
      }),
    ).rejects.toThrow('Synthetic failure')
    expect((await models.sessions.findById(own.identity.sessionId))?.updatedAt).toEqual(
      before?.updatedAt,
    )
  })
  it.each(['session', 'principal'] as const)(
    'a concurrent %s revocation forces a retry and denial',
    async (target) => {
      const own = await principal()
      let attempt = 0
      await expect(
        inTransaction(fixture.connection, async (tx) => {
          attempt++
          // Establish a transaction snapshot before a revocation commits outside it.
          await models.users.findById(own.user._id).session(tx)
          if (attempt === 1) {
            if (target === 'session') await sessions.logout('customer', own.issued.token)
            else
              await models.users.updateOne({ _id: own.user._id }, { $set: { status: 'suspended' } })
          }
          const user = await authorizeAccount(models, own.identity, 'customer', tx, now)
          user.name = 'Unauthorized'
          await user.save({ session: tx })
        }),
      ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
      expect(attempt).toBeGreaterThan(1)
      expect((await models.users.findById(own.user._id))?.name).toBe('Synthetic')
    },
  )
})
