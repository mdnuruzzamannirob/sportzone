import { Types } from 'mongoose'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  identityCollectionValidators,
  initializeIdentityPersistence,
} from '../../src/modules/auth/collection-validators.js'
import { createIdentityModels } from '../../src/modules/auth/models.js'
import {
  consumeUserChallenge,
  findActiveBrowserContext,
  findActiveUserSession,
} from '../../src/modules/auth/persistence.js'
import { isolatedDatabase } from '../support/database.js'

let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let models: ReturnType<typeof createIdentityModels>
// Constructors deliberately receive unknown payloads to test invalid external shapes.
const userCreate = async (input: unknown) => new models.users(input).save()
const sessionCreate = async (input: unknown) => new models.sessions(input).save()
const challengeCreate = async (input: unknown) => new models.challenges(input).save()
const contextCreate = async (input: unknown) => new models.contexts(input).save()
const digest = () => randomBytes(32).toString('hex')
const future = () => new Date(Date.now() + 600000)
const userInput = () => ({
  emailNormalized: `fixture_${randomUUID()}@example.test`,
  name: 'Fixture customer',
  passwordHash: 'synthetic_encoded_hash',
})
const address = () => ({
  id: new Types.ObjectId(),
  recipient: 'Fixture recipient',
  phone: '01700000000',
  districtKey: 'fixture',
  areaKey: 'fixture',
  street: 'Fixture street',
  isDefault: false,
})
function db() {
  if (!fixture.connection.db) throw new Error('No fixture database')
  return fixture.connection.db
}
beforeAll(async () => {
  fixture = await isolatedDatabase()
  // Isolated owned mongod only: prove timestamp rejection with expired records still present.
  await db().admin().command({ setParameter: 1, ttlMonitorEnabled: false })
  models = createIdentityModels(fixture.connection)
  await initializeIdentityPersistence(fixture.connection, models)
})
afterAll(async () => {
  await fixture?.close()
})
async function proofFixture() {
  const user = await userCreate(userInput())
  const secretHash = digest()
  const challenge = await challengeCreate({
    purpose: 'password_reset',
    userId: user._id,
    emailNormalized: user.emailNormalized,
    secretHash,
    scopeRevisionAtIssue: 0,
    expiresAt: future(),
    deliveryEnvelope: {
      algorithm: 'AES-256-GCM',
      keyVersion: 'fixture',
      nonce: Buffer.alloc(12),
      ciphertext: Buffer.from('synthetic'),
      authTag: Buffer.alloc(16),
    },
  })
  const input = {
    secretHash,
    purpose: 'password_reset' as const,
    userId: user._id,
    role: 'customer' as const,
    maxAttempts: 5,
  }
  return { user, challenge, input }
}

describe('identity model and database contracts', () => {
  it('bootstraps four strict collections and ten named indexes idempotently', async () => {
    await initializeIdentityPersistence(fixture.connection, models)
    for (const [name, validator] of Object.entries(identityCollectionValidators)) {
      const info = await db().listCollections({ name }, { nameOnly: false }).next()
      expect(info?.options).toMatchObject({
        validator,
        validationLevel: 'strict',
        validationAction: 'error',
      })
    }
    const indexes = (
      await Promise.all(Object.values(models).map((model) => model.collection.indexes()))
    )
      .flat()
      .filter((index) => index.name !== '_id_')
    const spec = readFileSync(
      new URL('../../../docs/DATABASE.md', import.meta.url),
      'utf8',
    )
    const table = spec.slice(
      spec.indexOf('### 5.6 Identity indexes'),
      spec.indexOf('### 5.7 Identity implementation'),
    )
    const declared = [
      ...table.matchAll(
        /\| (users|sessions|authChallenges|browserContexts) \| `([^`]+)` \| `([^`]+)` \| ([^\n]+) \|/g,
      ),
    ]
    expect(declared).toHaveLength(10)
    for (const [, , name, key, options] of declared) {
      const found = indexes.find((index) => index.name === name)
      expect(found?.key).toEqual(
        Object.fromEntries(
          [...String(key).matchAll(/(\w+):(-?1)/g)].map((m) => [m[1], Number(m[2])]),
        ),
      )
      expect(found?.unique === true).toBe(options === 'unique')
      expect(found?.expireAfterSeconds).toBe(options?.includes('TTL') ? 0 : undefined)
    }
    expect(indexes).toHaveLength(10)
    expect(indexes.filter((index) => index.unique)).toHaveLength(4)
    expect(indexes.filter((index) => index.expireAfterSeconds === 0)).toHaveLength(3)
  })
  it('uses explicit physical names, safe defaults and private projections', async () => {
    const user = await userCreate(userInput())
    expect(user.role).toBe('customer')
    expect(user.securityRevision).toBe(0)
    expect(user.challengeRevisions?.password_reset).toBe(0)
    expect(user.addresses).toHaveLength(0)
    const projected = await models.users.findById(user._id).lean()
    expect(projected).not.toHaveProperty('passwordHash')
    expect(projected).not.toHaveProperty('securityRevision')
    expect(projected).not.toHaveProperty('challengeRevisions')
    expect(await models.users.findById(user._id).select('+passwordHash')).toHaveProperty(
      'passwordHash',
    )
  })
  it('rejects concurrent duplicate normalized identity across roles/statuses', async () => {
    const input = userInput()
    const results = await Promise.allSettled([
      userCreate(input),
      userCreate({ ...input, role: 'admin', status: 'suspended' }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const failed = results.find((result) => result.status === 'rejected')
    expect(failed?.status === 'rejected' && failed.reason.code).toBe(11000)
  })
  it.each([
    { name: 7 },
    { emailNormalized: 'UPPER@example.test' },
    { emailNormalized: 'bad' },
    { emailNormalized: `${'a'.repeat(245)}@example.test` },
    { securityRevision: '0' },
    { securityRevision: -1 },
    { securityRevision: 0.5 },
    { phone: null },
    { emailVerifiedAt: '2026-10-18T00:00:00Z' },
    { role: 'superadmin' },
    { challengeRevisions: { password_reset: -1 } },
    { addresses: Array.from({ length: 11 }, address) },
  ])('rejects invalid model fields %j', async (change) => {
    await expect(userCreate({ ...userInput(), ...change })).rejects.toThrow()
  })
  it('rejects unknown/nested keys, duplicate IDs/defaults and invalid deletion decisions', async () => {
    await expect(userCreate({ ...userInput(), injected: true })).rejects.toThrow()
    await expect(
      userCreate({
        ...userInput(),
        addresses: [{ ...address(), injected: true }],
      }),
    ).rejects.toThrow()
    const saved = address()
    await expect(
      userCreate({ ...userInput(), addresses: [saved, saved] }),
    ).rejects.toThrow()
    await expect(
      userCreate({
        ...userInput(),
        addresses: [
          { ...address(), isDefault: true },
          { ...address(), isDefault: true },
        ],
      }),
    ).rejects.toThrow()
    await expect(
      userCreate({
        ...userInput(),
        deletionRequest: {
          id: new Types.ObjectId(),
          requestedAt: new Date(),
          verifiedAt: new Date(),
          status: 'approved',
        },
      }),
    ).rejects.toThrow()
  })
  it('rejects raw-driver invalid user writes and update bypasses', async () => {
    const user = await userCreate(userInput())
    await expect(
      db()
        .collection('users')
        .updateOne(
          { _id: user._id },
          { $set: { emailNormalized: 'bad..email@example.test' } },
        ),
    ).rejects.toMatchObject({ code: 121 })
    for (const change of [
      { phone: null },
      { securityRevision: 0.5 },
      { name: '' },
      { role: 'superadmin' },
      { injected: true },
    ]) {
      await expect(
        db().collection('users').updateOne({ _id: user._id }, { $set: change }),
      ).rejects.toMatchObject({ code: 121 })
    }
    const saved = address()
    await expect(
      db()
        .collection('users')
        .updateOne({ _id: user._id }, { $set: { addresses: [saved, saved] } }),
    ).rejects.toMatchObject({ code: 121 })
    await expect(
      db()
        .collection('users')
        .updateOne(
          { _id: user._id },
          { $set: { emailNormalized: 'UPPER@example.test' } },
        ),
    ).rejects.toMatchObject({ code: 121 })
  })
  it.each(['customer', 'admin', 'guest_order'] as const)(
    'validates %s session conditional scope and private verifiers',
    async (kind) => {
      const tokenHash = digest()
      const input = {
        tokenHash,
        csrfSecretHash: digest(),
        kind,
        expiresAt: future(),
        ...(kind === 'guest_order'
          ? { orderId: new Types.ObjectId() }
          : { userId: new Types.ObjectId(), securityRevisionAtIssue: 0 }),
      }
      const session = await sessionCreate(input)
      const projected = await models.sessions.findById(session._id).lean()
      expect(projected).not.toHaveProperty('tokenHash')
      expect(projected).not.toHaveProperty('csrfSecretHash')
      await expect(
        sessionCreate({
          ...input,
          tokenHash: digest(),
          userId: new Types.ObjectId(),
          orderId: new Types.ObjectId(),
        }),
      ).rejects.toThrow()
      await expect(
        db()
          .collection('sessions')
          .updateOne(
            { _id: session._id },
            {
              $set: {
                kind: kind === 'guest_order' ? 'customer' : 'guest_order',
              },
            },
          ),
      ).rejects.toMatchObject({ code: 121 })
      await expect(sessionCreate(input)).rejects.toMatchObject({ code: 11000 })
    },
  )
  it('rejects string ObjectId/date and null scope instead of coercing', async () => {
    const input = {
      tokenHash: digest(),
      csrfSecretHash: digest(),
      kind: 'customer',
      userId: new Types.ObjectId(),
      securityRevisionAtIssue: 0,
      expiresAt: future(),
    }
    await expect(
      sessionCreate({ ...input, userId: input.userId.toHexString() }),
    ).rejects.toThrow()
    await expect(
      sessionCreate({ ...input, expiresAt: future().toISOString() }),
    ).rejects.toThrow()
    await expect(sessionCreate({ ...input, orderId: null })).rejects.toThrow()
  })
  it.each([
    'email_verify',
    'email_change',
    'password_reset',
    'guest_order_access',
  ] as const)('validates %s challenge scope and private envelope', async (purpose) => {
    const input = {
      purpose,
      secretHash: digest(),
      emailNormalized: userInput().emailNormalized,
      scopeRevisionAtIssue: 0,
      expiresAt: future(),
      ...(purpose === 'guest_order_access'
        ? { orderId: new Types.ObjectId() }
        : { userId: new Types.ObjectId() }),
      ...(purpose === 'email_change'
        ? { targetEmailNormalized: 'target@example.test' }
        : {}),
    }
    const challenge = await challengeCreate(input)
    expect(await models.challenges.findById(challenge._id).lean()).not.toHaveProperty(
      'secretHash',
    )
    await expect(
      db()
        .collection('authChallenges')
        .updateOne(
          { _id: challenge._id },
          {
            $set: {
              purpose:
                purpose === 'guest_order_access'
                  ? 'password_reset'
                  : 'guest_order_access',
            },
          },
        ),
    ).rejects.toMatchObject({ code: 121 })
    await expect(challengeCreate(input)).rejects.toMatchObject({
      code: 11000,
    })
  })
  it('rejects missing/extraneous target email and partial encrypted envelopes', async () => {
    const input = {
      purpose: 'password_reset',
      userId: new Types.ObjectId(),
      secretHash: digest(),
      emailNormalized: 'fixture@example.test',
      scopeRevisionAtIssue: 0,
      expiresAt: future(),
    }
    await expect(challengeCreate({ ...input, purpose: 'email_change' })).rejects.toThrow()
    await expect(
      challengeCreate({
        ...input,
        targetEmailNormalized: 'target@example.test',
      }),
    ).rejects.toThrow()
    await expect(
      challengeCreate({
        ...input,
        deliveryEnvelope: { algorithm: 'AES-256-GCM' },
      }),
    ).rejects.toThrow()
  })
  it('validates audience, context uniqueness and expiry independently of TTL', async () => {
    const input = {
      contextTokenHash: digest(),
      csrfSecretHash: digest(),
      audience: 'admin',
      expiresAt: future(),
    }
    const context = await contextCreate(input)
    expect(await models.contexts.findById(context._id).lean()).not.toHaveProperty(
      'contextTokenHash',
    )
    await expect(contextCreate(input)).rejects.toMatchObject({ code: 11000 })
    await expect(
      contextCreate({ ...input, contextTokenHash: digest(), audience: 'all' }),
    ).rejects.toThrow()
    await expect(
      db()
        .collection('browserContexts')
        .updateOne({ _id: context._id }, { $set: { rotatedAt: null } }),
    ).rejects.toMatchObject({ code: 121 })
  })
})

describe('real identity expiry, revocation and transactional consumption', () => {
  it('rejects expiry/revocation/kind/role/security-revision mismatches while records remain', async () => {
    const user = await userCreate(userInput())
    const tokenHash = digest()
    const session = await sessionCreate({
      tokenHash,
      csrfSecretHash: digest(),
      kind: 'customer',
      userId: user._id,
      securityRevisionAtIssue: 0,
      expiresAt: future(),
    })
    const input = { tokenHash, kind: 'customer' as const, now: new Date() }
    expect(await findActiveUserSession(models, input)).not.toBeNull()
    expect(await findActiveUserSession(models, { ...input, kind: 'admin' })).toBeNull()
    expect(
      await findActiveUserSession(models, {
        ...input,
        now: new Date(Date.now() + 700000),
      }),
    ).toBeNull()
    await models.users.updateOne({ _id: user._id }, { $inc: { securityRevision: 1 } })
    expect(await findActiveUserSession(models, input)).toBeNull()
    await models.users.updateOne(
      { _id: user._id },
      { $set: { securityRevision: 0, status: 'suspended' } },
    )
    expect(await findActiveUserSession(models, input)).toBeNull()
    await models.users.updateOne({ _id: user._id }, { $set: { status: 'active' } })
    await models.sessions.updateOne(
      { _id: session._id },
      { $set: { revokedAt: new Date() } },
    )
    expect(await findActiveUserSession(models, input)).toBeNull()
    expect(await models.sessions.exists({ _id: session._id })).toBeTruthy()
  })
  it('rejects actually expired retained session and context, plus rotated/wrong-audience contexts', async () => {
    const user = await userCreate(userInput())
    const tokenHash = digest()
    const session = await sessionCreate({
      tokenHash,
      csrfSecretHash: digest(),
      kind: 'customer',
      userId: user._id,
      securityRevisionAtIssue: 0,
      expiresAt: future(),
    })
    const contextTokenHash = digest()
    const context = await contextCreate({
      contextTokenHash,
      csrfSecretHash: digest(),
      audience: 'storefront',
      expiresAt: future(),
    })
    const contextInput = {
      contextTokenHash,
      audience: 'storefront' as const,
      now: new Date(),
    }
    expect(await findActiveBrowserContext(models, contextInput)).not.toBeNull()
    expect(
      await findActiveBrowserContext(models, {
        ...contextInput,
        audience: 'admin',
      }),
    ).toBeNull()
    await models.contexts.updateOne(
      { _id: context._id },
      { $set: { rotatedAt: new Date() } },
    )
    expect(await findActiveBrowserContext(models, contextInput)).toBeNull()
    const dates = {
      createdAt: new Date(Date.now() - 20000),
      expiresAt: new Date(Date.now() - 10000),
    }
    await db().collection('sessions').updateOne({ _id: session._id }, { $set: dates })
    await db()
      .collection('browserContexts')
      .updateOne({ _id: context._id }, { $set: dates, $unset: { rotatedAt: 1 } })
    expect(
      await findActiveUserSession(models, {
        tokenHash,
        kind: 'customer',
        now: new Date(),
      }),
    ).toBeNull()
    expect(
      await findActiveBrowserContext(models, {
        ...contextInput,
        now: new Date(),
      }),
    ).toBeNull()
    expect(await models.sessions.exists({ _id: session._id })).toBeTruthy()
    expect(await models.contexts.exists({ _id: context._id })).toBeTruthy()
  })
  it('rechecks expiry before consumption and rolls back an advanced principal counter', async () => {
    const { user, challenge, input } = await proofFixture()
    let reads = 0
    await expect(
      consumeUserChallenge(
        fixture.connection,
        models,
        input,
        async () => 'unreachable',
        () => new Date(Date.now() + (reads++ === 0 ? 0 : 700000)),
      ),
    ).rejects.toThrow('Challenge is unavailable.')
    expect((await models.challenges.findById(challenge._id))?.consumedAt).toBeUndefined()
    expect(
      (await models.users.findById(user._id).select('+challengeRevisions'))
        ?.challengeRevisions?.password_reset,
    ).toBe(0)
  })
  it('database guards concurrent eleventh-address and default-address writes', async () => {
    const user = await userCreate({
      ...userInput(),
      addresses: Array.from({ length: 9 }, address),
    })
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        db()
          .collection<{ addresses: ReturnType<typeof address>[] }>('users')
          .updateOne({ _id: user._id }, { $push: { addresses: address() } }),
      ),
    )
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect((await models.users.findById(user._id))?.addresses).toHaveLength(10)
    const defaults = await userCreate(userInput())
    const races = await Promise.allSettled(
      [1, 2].map(() =>
        db()
          .collection<{ addresses: ReturnType<typeof address>[] }>('users')
          .updateOne(
            { _id: defaults._id },
            { $push: { addresses: { ...address(), isDefault: true } } },
          ),
      ),
    )
    expect(races.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  })
  it('concurrent consume has one winner, removes envelope and cannot replay', async () => {
    const { user, challenge, input } = await proofFixture()
    const effect = async ({
      session,
      userId,
    }: Parameters<Parameters<typeof consumeUserChallenge>[3]>[0]) => {
      await models.users.updateOne(
        { _id: userId },
        { $inc: { securityRevision: 1 } },
        { session },
      )
      return 'applied'
    }
    const results = await Promise.allSettled([
      consumeUserChallenge(fixture.connection, models, input, effect),
      consumeUserChallenge(fixture.connection, models, input, effect),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const stored = await models.challenges
      .findById(challenge._id)
      .select('+deliveryEnvelope')
    expect(stored?.consumedAt).toBeInstanceOf(Date)
    expect(stored?.deliveryEnvelope).toBeUndefined()
    expect(
      (await models.users.findById(user._id).select('+securityRevision'))
        ?.securityRevision,
    ).toBe(1)
    await expect(
      consumeUserChallenge(fixture.connection, models, input, effect),
    ).rejects.toThrow('Challenge is unavailable.')
  })
  it('rolls back consumption, revision and envelope removal when the effect fails', async () => {
    const { user, challenge, input } = await proofFixture()
    await expect(
      consumeUserChallenge(fixture.connection, models, input, async () => {
        throw new Error('Synthetic failure')
      }),
    ).rejects.toThrow('Synthetic failure')
    expect(
      (await models.challenges.findById(challenge._id).select('+deliveryEnvelope'))
        ?.deliveryEnvelope,
    ).toBeDefined()
    expect((await models.challenges.findById(challenge._id))?.consumedAt).toBeUndefined()
    expect(
      (await models.users.findById(user._id).select('+challengeRevisions'))
        ?.challengeRevisions?.password_reset,
    ).toBe(0)
  })
  it.each([
    'expired',
    'invalidated',
    'attempts',
    'revision',
    'role',
    'principal',
  ] as const)('rejects %s proof without running the effect', async (failure) => {
    const { user, challenge, input } = await proofFixture()
    if (failure === 'expired')
      await db()
        .collection('authChallenges')
        .updateOne(
          { _id: challenge._id },
          {
            $set: {
              createdAt: new Date(Date.now() - 20000),
              expiresAt: new Date(Date.now() - 10000),
            },
            $unset: { deliveryEnvelope: 1 },
          },
        )
    if (failure === 'invalidated') {
      await expect(
        models.challenges.updateOne(
          { _id: challenge._id },
          { $set: { invalidatedAt: new Date() } },
        ),
      ).rejects.toMatchObject({ code: 121 })
      await models.challenges.updateOne(
        { _id: challenge._id },
        { $set: { invalidatedAt: new Date() }, $unset: { deliveryEnvelope: 1 } },
      )
    }
    if (failure === 'attempts')
      await models.challenges.updateOne(
        { _id: challenge._id },
        { $set: { attemptCount: 5 } },
      )
    if (failure === 'revision')
      await models.users.updateOne(
        { _id: user._id },
        { $inc: { 'challengeRevisions.password_reset': 1 } },
      )
    let ran = false
    await expect(
      consumeUserChallenge(
        fixture.connection,
        models,
        {
          ...input,
          ...(failure === 'role' ? { role: 'admin' as const } : {}),
          ...(failure === 'principal' ? { userId: new Types.ObjectId() } : {}),
        },
        async () => {
          ran = true
        },
      ),
    ).rejects.toThrow('Challenge is unavailable.')
    expect(ran).toBe(false)
    expect(await models.challenges.exists({ _id: challenge._id })).toBeTruthy()
  })
  it('refuses an existing unreviewed validator without silently changing it', async () => {
    await db().command({
      collMod: 'browserContexts',
      validationLevel: 'moderate',
    })
    await expect(
      initializeIdentityPersistence(fixture.connection, models),
    ).rejects.toThrow('reviewed migration')
    expect(
      (
        await db()
          .listCollections({ name: 'browserContexts' }, { nameOnly: false })
          .next()
      )?.options?.validationLevel,
    ).toBe('moderate')
  })
})
