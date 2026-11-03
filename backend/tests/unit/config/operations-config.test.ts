import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mongo } from 'mongoose'
import { afterEach, expect, it } from 'vitest'
import { loadOperationsOptions } from '../../../src/config/operations.js'

const env = {
  APP_ENV: 'test',
  CUSTOMER_AUTH_ENABLED: 'true',
  ADMIN_AUTH_ENABLED: 'true',
  BACKEND_OPERATIONS_ENABLED: 'true',
}
const directories: string[] = []
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true })
})
it('operations are default-off and reject deployed admission, malformed flags and missing identity audiences', () => {
  expect(loadOperationsOptions({})).toBeUndefined()
  expect(loadOperationsOptions(env)).toEqual({})
  for (const change of [
    { APP_ENV: 'production' },
    { APP_ENV: 'staging' },
    { CUSTOMER_AUTH_ENABLED: 'false' },
    { ADMIN_AUTH_ENABLED: 'false' },
    { BACKEND_OPERATIONS_ENABLED: 'yes' },
  ])
    expect(() => loadOperationsOptions({ ...env, ...change })).toThrow(
      'Invalid backend configuration.',
    )
})
it('protected disposition requires exact incident, complete parsed quantities, owner-only artifact and post-shipment inspection time', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sportzone-disposition-'))
  directories.push(directory)
  const path = join(directory, 'evidence.json'),
    orderId = '1'.repeat(24),
    exceptionId = '2'.repeat(24),
    disposition = [
      {
        orderItemId: '3'.repeat(24),
        quantity: 2,
        custody: 'recovered' as const,
        inspectedResellableQty: 1,
      },
    ],
    record = {
      orderId,
      exceptionId,
      disposition,
      inspectionRef: 'synthetic:inspection',
      verifiedAt: new Date(Date.now() - 1000).toISOString(),
    }
  await writeFile(path, JSON.stringify([record]), { mode: 0o600 })
  const verify = loadOperationsOptions({
    ...env,
    DELIVERY_DISPOSITION_FILE: path,
  })?.verifyDisposition
  if (!verify) throw new Error('Missing verifier')
  // This file verifier never uses the database or supplies its own shipment fact.
  const client = new mongo.MongoClient('mongodb://127.0.0.1:27017'),
    session = client.startSession(),
    input = { orderId, exceptionId, disposition, shippedAt: new Date(Date.now() - 2000) }
  expect(await verify(session, input)).toMatch(/^[a-f0-9]{64}$/)
  await expect(verify(session, { ...input, exceptionId: '4'.repeat(24) })).rejects.toThrow()
  await expect(verify(session, { ...input, shippedAt: new Date() })).rejects.toThrow()
  await expect(
    verify(session, {
      ...input,
      disposition: [
        {
          orderItemId: '3'.repeat(24),
          custody: 'recovered',
          inspectedResellableQty: 1,
          quantity: 1,
        },
      ],
    }),
  ).rejects.toThrow()
  await chmod(path, 0o644)
  await expect(verify(session, input)).rejects.toThrow()
  await session.endSession()
  await client.close()
})
