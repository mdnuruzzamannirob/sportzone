import { randomBytes, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { Types } from 'mongoose'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { createCustomerAccountAccess } from '../../src/modules/auth/customer-account.service.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createBrowserSecurity } from '../../src/modules/auth/sessions/browser-security.service.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { profileRoutes } from '../../src/modules/customers/customer.routes.js'
import { createProfileService } from '../../src/modules/customers/customer.service.js'
import { createAddressCoverage } from '../../src/modules/delivery/delivery-coverage.service.js'
import { isolatedDatabase } from '../helpers/database.js'

let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let models: ReturnType<typeof createIdentityModels>
let sessions: ReturnType<typeof createSessionService>
let service: ReturnType<typeof createProfileService>
let app: ReturnType<typeof createApp>
let time = Date.now()
const clock = () => new Date(time)
const origin = 'http://localhost:3000'
const zoneId = new Types.ObjectId(),
  exactId = new Types.ObjectId()
const address = {
  recipient: 'Synthetic recipient',
  phone: '01700000000',
  districtKey: 'synthetic',
  areaKey: 'served',
  street: 'Synthetic fixture street',
}
async function account(verified = true, role: 'customer' | 'admin' = 'customer') {
  const user = await new models.users({
    name: 'Synthetic',
    emailNormalized: `fixture_${randomUUID()}@example.test`,
    passwordHash: 'synthetic_hash',
    role,
    ...(verified ? { emailVerifiedAt: clock() } : {}),
  }).save()
  const issued = await sessions.issue(role, user._id)
  return {
    user,
    issued,
    token: issued.token,
    cookie: `sz_${role === 'admin' ? 'admin' : 'customer'}_sid=${issued.token}`,
  }
}
type Principal = Awaited<ReturnType<typeof account>>
async function mutate(
  method: 'post' | 'patch' | 'delete',
  path: string,
  principal: Principal,
  body?: object,
) {
  let call = request(app)
    [method](`/api/v1${path}`)
    .set('Origin', origin)
    .set('Cookie', principal.cookie)
    .set('X-CSRF-Token', principal.issued.csrfToken)
  if (body !== undefined) call = call.send(body)
  return call
}
async function add(principal: Principal, patch = {}) {
  const result = await mutate('post', '/me/addresses', principal, {
    ...address,
    ...patch,
  })
  expect(result.status).toBe(201)
  expect(result.headers.location).toBe(`/api/v1/me/addresses/${result.body.data.id}`)
  return result.body.data as { id: string; isDefault: boolean }
}
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
    clock,
  )
  const security = createBrowserSecurity(
    fixture.connection,
    models,
    sessions,
    {
      secret: randomBytes(32).toString('hex'),
      contextTtlSeconds: 120,
      storefrontOrigin: origin,
      adminOrigin: 'http://localhost:5173',
    },
    clock,
  )
  service = createProfileService(
    createCustomerAccountAccess(fixture.connection, models, sessions, clock),
    createAddressCoverage(fixture.connection, clock),
    clock,
  )
  const router = Router()
  router.use(profileRoutes(service, security, sessions))
  app = createApp({ apiRouter: router })
})
beforeEach(async () => {
  time = Date.now()
  await fixture.connection.db?.collection('deliveryZones').deleteMany({})
  await fixture.connection.db?.collection('deliveryCharges').deleteMany({})
  await fixture.connection.db?.collection('deliveryZones').insertOne({
    _id: zoneId,
    name: 'Synthetic zone',
    status: 'active',
    coverageRevision: 0,
    revision: 0,
    createdAt: clock(),
    updatedAt: clock(),
  })
  await fixture.connection.db?.collection('deliveryCharges').insertOne({
    _id: exactId,
    zoneId,
    coverageKey: 'synthetic:served',
    status: 'active',
    effectiveFrom: new Date(time - 1000),
    amountPoisha: 100,
    ruleVersion: 1,
    revision: 0,
    createdAt: clock(),
    updatedAt: clock(),
  })
})
afterAll(async () => {
  await fixture?.close()
})

describe('profile/address ownership on real transactional persistence', () => {
  it('projects only own account and normalizes safe profile edits', async () => {
    const own = await account(),
      other = await account()
    const result = await mutate('patch', '/me', own, {
      name: ' Updated fixture ',
      phone: '01700-000000',
    })
    expect(result.status).toBe(200)
    expect(result.body.data).toMatchObject({
      id: own.user._id.toHexString(),
      name: 'Updated fixture',
      phone: '+8801700000000',
      emailVerified: true,
    })
    expect(JSON.stringify(result.body)).not.toMatch(
      /passwordHash|securityRevision|role|deletionRequest/,
    )
    expect((await models.users.findById(other.user._id))?.name).toBe('Synthetic')
    const get = await request(app).get('/api/v1/me').set('Cookie', own.cookie).expect(200)
    expect(get.headers['cache-control']).toBe('no-store')
  })
  it.each([
    { email: 'other@example.test' },
    { role: 'admin' },
    { status: 'suspended' },
    { phone: null },
    {},
  ])('rejects unsafe profile edits %j', async (body) => {
    const own = await account()
    expect((await mutate('patch', '/me', own, body)).status).toBe(400)
    expect((await models.users.findById(own.user._id))?.name).toBe('Synthetic')
  })
  it('adds, lists, partially edits, sets/clears defaults and deletes own address', async () => {
    const own = await account(),
      a = await add(own),
      b = await add(own)
    expect(a.isDefault).toBe(false)
    expect((await mutate('post', `/me/addresses/${a.id}/default`, own)).status).toBe(200)
    const updated = await mutate('patch', `/me/addresses/${b.id}`, own, {
      street: 'Updated synthetic street',
      isDefault: true,
    })
    expect(updated.status).toBe(200)
    expect(updated.body.data.phone).toBe('+8801700000000')
    const listed = await request(app)
      .get('/api/v1/me/addresses')
      .set('Cookie', own.cookie)
      .expect(200)
    expect(listed.body.data.filter((item: { isDefault: boolean }) => item.isDefault)).toHaveLength(
      1,
    )
    expect(listed.body.data.find((item: { id: string }) => item.id === a.id).isDefault).toBe(false)
    const deleted = await mutate('delete', `/me/addresses/${b.id}`, own)
    expect(deleted.status).toBe(204)
    expect(deleted.text).toBe('')
    const remaining = await service.list(own.token)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.id).toBe(a.id)
    expect(remaining[0]?.isDefault).toBe(false)
  })
  it.each(['patch', 'delete', 'post'] as const)(
    'denies cross-owner nested %s and random IDs without changing owner',
    async (method) => {
      const owner = await account(),
        attacker = await account(),
        a = await add(owner)
      const suffix = method === 'post' ? '/default' : ''
      const result = await mutate(
        method,
        `/me/addresses/${a.id}${suffix}`,
        attacker,
        method === 'patch' ? { street: 'Forbidden fixture edit' } : undefined,
      )
      expect(result.status).toBe(404)
      expect((await service.list(owner.token))[0]?.street).toBe(address.street)
      expect(
        (
          await mutate(
            method,
            `/me/addresses/${new Types.ObjectId().toHexString()}${suffix}`,
            owner,
            method === 'patch' ? { street: 'Unowned fixture' } : undefined,
          )
        ).status,
      ).toBe(404)
    },
  )
  it('revalidates merged location and fails closed for missing/inactive/future/expired coverage', async () => {
    const own = await account(),
      a = await add(own)
    expect(
      (
        await mutate('patch', `/me/addresses/${a.id}`, own, {
          areaKey: 'unserved',
        })
      ).status,
    ).toBe(400)
    for (const change of [
      { status: 'inactive' },
      { status: 'active', effectiveFrom: new Date(time + 1000) },
      { effectiveFrom: new Date(time - 1000), effectiveTo: clock() },
    ]) {
      await fixture.connection.db
        ?.collection('deliveryCharges')
        .updateOne({ _id: exactId }, { $set: change })
      expect((await mutate('post', '/me/addresses', own, address)).body.error.code).toBe(
        'UNSUPPORTED_DELIVERY_AREA',
      )
    }
    expect(await service.list(own.token)).toHaveLength(1)
    expect((await mutate('delete', `/me/addresses/${a.id}`, own)).status).toBe(204)
  })
  it('uses approved district fallback, exact precedence and fails closed for ambiguous/inactive zones', async () => {
    const own = await account()
    const fallbackZone = new Types.ObjectId()
    await fixture.connection.db
      ?.collection('deliveryZones')
      .insertOne({ _id: fallbackZone, status: 'active' })
    await fixture.connection.db?.collection('deliveryCharges').insertOne({
      zoneId: fallbackZone,
      coverageKey: 'synthetic:*',
      status: 'active',
      effectiveFrom: new Date(time - 1000),
      amountPoisha: 100,
      ruleVersion: 1,
    })
    expect(
      (
        await mutate('post', '/me/addresses', own, {
          ...address,
          areaKey: 'district-default',
        })
      ).status,
    ).toBe(201)
    await fixture.connection.db
      ?.collection('deliveryZones')
      .updateOne({ _id: zoneId }, { $set: { status: 'inactive' } })
    expect((await mutate('post', '/me/addresses', own, address)).status).toBe(400)
    await fixture.connection.db
      ?.collection('deliveryZones')
      .updateOne({ _id: zoneId }, { $set: { status: 'active' } })
    await fixture.connection.db?.collection('deliveryCharges').insertOne({
      zoneId,
      coverageKey: 'synthetic:served',
      status: 'active',
      effectiveFrom: new Date(time - 1000),
      amountPoisha: 100,
      ruleVersion: 2,
    })
    expect((await mutate('post', '/me/addresses', own, address)).status).toBe(400)
  })
  it('serializes concurrent tenth-address creation and default selection without lost updates', async () => {
    const own = await account()
    for (let i = 0; i < 9; i++) await add(own, { street: `Synthetic fixture ${i}` })
    const result = await Promise.all([
      mutate('post', '/me/addresses', own, address),
      mutate('post', '/me/addresses', own, address),
    ])
    expect(result.map((res) => res.status).sort()).toEqual([201, 409])
    const all = await service.list(own.token)
    expect(all).toHaveLength(10)
    const ids = all.slice(0, 2).map((item) => item.id)
    expect(
      (
        await Promise.all(ids.map((id) => mutate('post', `/me/addresses/${id}/default`, own)))
      ).every((res) => res.status === 200),
    ).toBe(true)
    expect((await service.list(own.token)).filter((item) => item.isDefault)).toHaveLength(1)
    await Promise.all([
      mutate('patch', '/me', own, { name: 'Concurrent fixture' }),
      mutate('patch', `/me/addresses/${ids[0]}`, own, {
        street: 'Concurrent street',
      }),
    ])
    expect((await service.read(own.token)).name).toBe('Concurrent fixture')
    expect((await service.list(own.token)).find((item) => item.id === ids[0])?.street).toBe(
      'Concurrent street',
    )
  })
  it('requires verified identity, deduplicates deletion intake, returns current review status and never changes account status', async () => {
    const unverified = await account(false)
    expect(
      (
        await mutate('post', '/me/deletion-requests', unverified, {
          reason: 'Synthetic request',
        })
      ).status,
    ).toBe(403)
    const own = await account()
    const results = await Promise.all([
      mutate('post', '/me/deletion-requests', own, {
        reason: 'First fixture request',
      }),
      mutate('post', '/me/deletion-requests', own, {
        reason: 'Concurrent fixture request',
      }),
    ])
    expect(results.every((res) => res.status === 200)).toBe(true)
    expect(results[0]?.body.data.requestId).toBe(results[1]?.body.data.requestId)
    const stored = await models.users.findById(own.user._id)
    expect(stored?.status).toBe('active')
    expect(stored?.deletionRequest?.status).toBe('requested')
    expect(stored?.deletionRequest?.verifiedAt).toEqual(clock())
    await models.users.updateOne(
      { _id: own.user._id },
      { $set: { 'deletionRequest.status': 'under_review' } },
    )
    const repeat = await mutate('post', '/me/deletion-requests', own, {})
    expect(repeat.body.data).toEqual({
      requestId: results[0]?.body.data.requestId,
      status: 'under_review',
    })
    expect((await models.users.findById(unverified.user._id))?.deletionRequest).toBeUndefined()
  })
  it.each([
    [{ amountPoisha: 0 }, 201],
    [{ ruleVersion: 0 }, 201],
    [{ amountPoisha: -1 }, 400],
    [{ ruleVersion: -1 }, 400],
    [{ ruleVersion: 1.5 }, 400],
  ] as const)('checks safe delivery metadata %j', async (fields, status) => {
    const own = await account()
    await fixture.connection.db
      ?.collection('deliveryCharges')
      .updateOne({ _id: exactId }, { $set: fields })
    expect((await mutate('post', '/me/addresses', own, address)).status).toBe(status)
  })
  it('keeps deletion requests separately owned and preserves original intake while returning terminal status', async () => {
    const a = await account(),
      b = await account()
    const first = await mutate('post', '/me/deletion-requests', a, {
      reason: 'Original synthetic reason',
    })
    const second = await mutate('post', '/me/deletion-requests', b, {})
    expect(first.body.data.requestId).not.toBe(second.body.data.requestId)
    await models.users.updateOne(
      { _id: a.user._id },
      {
        $set: {
          'deletionRequest.status': 'rejected',
          'deletionRequest.decisionAt': clock(),
          'deletionRequest.decisionReason': 'Synthetic review',
        },
      },
    )
    const repeated = await mutate('post', '/me/deletion-requests', a, {
      reason: 'Replacement must not erase review',
    })
    expect(repeated.body.data).toEqual({
      requestId: first.body.data.requestId,
      status: 'rejected',
    })
    expect((await models.users.findById(a.user._id))?.deletionRequest?.reason).toBe(
      'Original synthetic reason',
    )
    expect(
      (
        await mutate('post', '/me/deletion-requests', b, {
          requestId: first.body.data.requestId,
        })
      ).status,
    ).toBe(400)
  })
  it.each(['suspended', 'revision', 'expired'] as const)(
    'rejects %s customer sessions on profile access',
    async (scenario) => {
      const own = await account()
      if (scenario === 'suspended')
        await models.users.updateOne({ _id: own.user._id }, { $set: { status: 'suspended' } })
      if (scenario === 'revision')
        await models.users.updateOne({ _id: own.user._id }, { $inc: { securityRevision: 1 } })
      if (scenario === 'expired') time += 600000
      await request(app).get('/api/v1/me').set('Cookie', own.cookie).expect(401)
      expect((await mutate('post', '/me/addresses', own, address)).status).toBe(403)
    },
  )
  it('rejects unknown query/body/path fields and does not guess missing delivery setup', async () => {
    const own = await account()
    await request(app).get('/api/v1/me?userId=foreign').set('Cookie', own.cookie).expect(400)
    expect(
      (
        await mutate('patch', '/me/addresses/invalid', own, {
          street: 'Synthetic',
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await mutate('post', '/me/addresses', own, {
          ...address,
          userId: own.user._id.toHexString(),
        })
      ).status,
    ).toBe(400)
    await fixture.connection.db?.collection('deliveryCharges').deleteMany({})
    expect((await mutate('post', '/me/addresses', own, address)).body.error.code).toBe(
      'UNSUPPORTED_DELIVERY_AREA',
    )
    expect(await service.list(own.token)).toEqual([])
  })
  it('retains historical snapshots and financial records through all profile/address/deletion mutations', async () => {
    const own = await account(),
      a = await add(own)
    const snapshot = {
      userId: own.user._id,
      customerSnapshot: {
        name: 'Historic fixture',
        email: own.user.emailNormalized,
      },
      deliverySnapshot: { addressId: a.id, street: 'Historic street' },
      syntheticFixture: true,
    }
    await fixture.connection.db?.collection('orders').insertOne(snapshot)
    await fixture.connection.db?.collection('paymentCollections').insertOne({
      userId: own.user._id,
      syntheticFixture: true,
      amountPoisha: 100,
    })
    const beforeOrders = await fixture.connection.db
      ?.collection('orders')
      .find({ userId: own.user._id })
      .toArray()
    const beforePayments = await fixture.connection.db
      ?.collection('paymentCollections')
      .find({ userId: own.user._id })
      .toArray()
    await mutate('patch', '/me', own, {
      name: 'New fixture name',
      phone: '01700000000',
    })
    await mutate('delete', `/me/addresses/${a.id}`, own)
    await mutate('post', '/me/deletion-requests', own, {})
    expect(
      await fixture.connection.db?.collection('orders').find({ userId: own.user._id }).toArray(),
    ).toEqual(beforeOrders)
    expect(
      await fixture.connection.db
        ?.collection('paymentCollections')
        .find({ userId: own.user._id })
        .toArray(),
    ).toEqual(beforePayments)
    expect(await models.users.exists({ _id: own.user._id })).not.toBeNull()
  })
  it('rejects absent/admin/revoked sessions, forged origins, stale CSRF and foreign deletion IDs', async () => {
    await request(app).get('/api/v1/me').expect(401)
    const admin = await account(true, 'admin')
    await request(app).get('/api/v1/me').set('Cookie', admin.cookie).expect(401)
    const own = await account()
    await request(app)
      .patch('/api/v1/me')
      .set('Origin', 'https://evil.example')
      .set('Cookie', own.cookie)
      .set('X-CSRF-Token', own.issued.csrfToken)
      .send({ name: 'Forbidden' })
      .expect(403)
    await request(app)
      .patch('/api/v1/me')
      .set('Origin', origin)
      .set('Cookie', own.cookie)
      .send({ name: 'Forbidden' })
      .expect(403)
    expect(
      (
        await mutate('post', '/me/deletion-requests', own, {
          requestId: new Types.ObjectId().toHexString(),
        })
      ).status,
    ).toBe(400)
    await sessions.logout('customer', own.token)
    await request(app).get('/api/v1/me').set('Cookie', own.cookie).expect(401)
    expect((await mutate('patch', '/me', own, { name: 'Forbidden' })).status).toBe(403)
  })
})

describe('P03-020 narrow customer persistence capability', () => {
  it('exposes detached profile data and cannot persist injected credential/security fields', async () => {
    const own = await account()
    const access = createCustomerAccountAccess(fixture.connection, models, sessions, clock)
    const before = await models.users
      .findById(own.user._id)
      .select('+passwordHash +securityRevision')
    await access.owned(own.token, async (profile, { save }) => {
      expect(
        ['save', 'passwordHash', 'securityRevision', 'sessions', 'role'].some(
          (key) => key in profile,
        ),
      ).toBe(false)
      expect(Object.getPrototypeOf(profile) === Object.prototype).toBe(true)
      Object.assign(profile, {
        name: 'Allowed profile edit',
        role: 'admin',
        email: 'injected@example.test',
        emailNormalized: 'injected@example.test',
        status: 'suspended',
        passwordHash: 'injected',
        securityRevision: 999,
      })
      await save()
    })
    const after = await models.users
      .findById(own.user._id)
      .select('+passwordHash +securityRevision')
    expect(after?.name).toBe('Allowed profile edit')
    expect(
      ['role', 'emailNormalized', 'status', 'passwordHash', 'securityRevision'].every(
        (field) => before?.get(field) === after?.get(field),
      ),
    ).toBe(true)
    expect((await sessions.authenticate('customer', own.token)).userId.equals(own.user._id)).toBe(
      true,
    )
  })
  it('cannot save through read-only or escaped transaction scopes', async () => {
    const own = await account()
    const access = createCustomerAccountAccess(fixture.connection, models, sessions, clock)
    await expect(
      access.owned(
        own.token,
        async (profile, { save }) => {
          profile.name = 'Not saved'
          await save()
        },
        false,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    let escaped: (() => Promise<void>) | undefined
    await access.owned(own.token, async (profile, { save }) => {
      profile.name = 'Not saved'
      escaped = save
    })
    if (!escaped) throw new Error('Missing synthetic callback')
    await expect(escaped()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    expect((await models.users.findById(own.user._id))?.name).toBe('Synthetic')
  })
  it('rolls profile saves and authorization fences back when the coordinating operation fails', async () => {
    const own = await account()
    const access = createCustomerAccountAccess(fixture.connection, models, sessions, clock)
    const before = await models.users.findById(own.user._id)
    await expect(
      access.owned(own.token, async (profile, { save }) => {
        profile.name = 'Rolled back'
        await save()
        throw new Error('Synthetic coordinated failure')
      }),
    ).rejects.toThrow('Synthetic coordinated failure')
    const after = await models.users.findById(own.user._id)
    expect(after?.name).toBe('Synthetic')
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime())
  })
})
