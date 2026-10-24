import { createConnection, mongo } from 'mongoose'
import { afterAll, expect, it } from 'vitest'
import { couponAllocationService } from '../../src/modules/promotions/coupon-allocation.service.js'

// Real disconnected Mongoose/driver objects: these guards must fail before any network I/O.
const connection = createConnection()
const client = new mongo.MongoClient('mongodb://127.0.0.1:1/synthetic')
const orderAccess = {
  authorize: async (): Promise<never> => {
    throw new Error('Order gate must not be reached before validation/persistence checks')
  },
}
const service = couponAllocationService(connection, orderAccess)
const command = {
  couponId: '000000000000000000000001',
  orderId: '000000000000000000000002',
  generation: 1,
  operationKey: 'synthetic',
}
afterAll(async () => {
  await connection.close()
  await client.close()
})
it.each(['reserve', 'redeemCod', 'commit', 'release'] as const)(
  'requires a real transaction for %s',
  async (action) => {
    const session = client.startSession()
    try {
      const result =
        action === 'reserve'
          ? service.reserve(session, command, new Date())
          : action === 'release'
            ? service.release(session, command, 'held')
            : service[action](session, command)
      await expect(result).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    } finally {
      await session.endSession()
    }
  },
)
it.each([
  { generation: 0 },
  { generation: 1.5 },
  { couponId: 'invalid' },
  { orderId: 'invalid' },
  { operationKey: '' },
  { operationKey: 'bad\nkey' },
  { operationKey: 'x'.repeat(129) },
  { userId: 'client-selected' },
])('rejects invalid command before database/order access %j', async (patch) => {
  const session = client.startSession()
  session.startTransaction()
  try {
    await expect(
      service.reserve(session, { ...command, ...patch }, new Date()),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  } finally {
    await session.endSession()
  }
})
it('rejects an invalid service clock before database access', async () => {
  const session = client.startSession()
  session.startTransaction()
  const invalid = couponAllocationService(connection, orderAccess, () => new Date('invalid'))
  try {
    await expect(invalid.reserve(session, command, new Date())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    })
  } finally {
    await session.endSession()
  }
})
it('fails closed without initialized persistence instead of invoking an order fallback', async () => {
  const session = client.startSession()
  session.startTransaction()
  try {
    await expect(service.reserve(session, command, new Date())).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    })
  } finally {
    await session.endSession()
  }
})
