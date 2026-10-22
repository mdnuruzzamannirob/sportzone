import { createServer } from 'node:net'
import request from 'supertest'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { loadEnvironment } from '../../src/config/env.js'
import { createLogger } from '../../src/shared/logger.js'
import { startServer } from '../../src/server.js'
import { isolatedDatabase } from '../helpers/database.js'
import { testEnvironment } from '../helpers/environment.js'

let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let runtime: Awaited<ReturnType<typeof startServer>>
let config: ReturnType<typeof loadEnvironment>
const lines: string[] = []
beforeAll(async () => {
  fixture = await isolatedDatabase()
  const reservation = createServer().listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => reservation.once('listening', resolve))
  const address = reservation.address()
  if (!address || typeof address === 'string') throw new Error('No test port')
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  )
  config = loadEnvironment({
    ...testEnvironment(),
    PORT: String(address.port),
    MONGODB_URI: fixture.replica.getUri(),
    MONGODB_DB_NAME: fixture.connection.name,
  })
  runtime = await startServer(
    config,
    createLogger(config, (line) => lines.push(line), [
      config.MONGODB_URI,
      config.SESSION_SECRET,
      config.HEALTH_MONITOR_TOKEN,
    ]),
  )
}, 120000)
afterAll(async () => {
  try {
    await runtime?.close()
  } finally {
    await fixture?.close()
  }
})
it('serves liveness and restricted readiness against the real MongoDB connection', async () => {
  expect((await request(runtime.server).get('/api/v1/health/live')).body.data).toEqual({
    status: 'live',
  })
  expect((await request(runtime.server).get('/api/v1/health/ready')).status).toBe(401)
  const response = await request(runtime.server)
    .get('/api/v1/health/ready')
    .set('Authorization', `Bearer ${config.HEALTH_MONITOR_TOKEN}`)
  expect(response.status).toBe(200)
  expect(response.body.data).toEqual({ status: 'ready' })
  expect(lines.join('')).not.toContain(config.MONGODB_URI)
  expect(lines.join('')).not.toContain(config.HEALTH_MONITOR_TOKEN)
  expect(lines.map((line) => JSON.parse(line).eventType)).toContain('ready')
})
it('cleans its new database connection when the listener port is occupied', async () => {
  await expect(
    startServer(
      config,
      createLogger(config, (line) => lines.push(line)),
    ),
  ).rejects.toThrow('Backend listener startup failed.')
  expect(runtime.server.listening).toBe(true)
  expect(
    (
      await request(runtime.server)
        .get('/api/v1/health/ready')
        .set('Authorization', `Bearer ${config.HEALTH_MONITOR_TOKEN}`)
    ).status,
  ).toBe(200)
})
it('rejects a failed database connection before binding a listener', async () => {
  const invalid = loadEnvironment({
    ...testEnvironment(),
    PORT: '4999',
    MONGODB_URI: 'mongodb://127.0.0.1:1/synthetic',
  })
  await expect(
    startServer(
      invalid,
      createLogger(invalid, (line) => lines.push(line)),
    ),
  ).rejects.toMatchObject({ code: 'CONNECTION_FAILED' })
})
it('keeps liveness while reporting unavailable after the real DB connection closes', async () => {
  await runtime.connection.close()
  expect((await request(runtime.server).get('/api/v1/health/live')).status).toBe(200)
  expect(
    (
      await request(runtime.server)
        .get('/api/v1/health/ready')
        .set('Authorization', `Bearer ${config.HEALTH_MONITOR_TOKEN}`)
    ).status,
  ).toBe(503)
  expect(lines.map((line) => JSON.parse(line).eventType)).toContain('database_disconnected')
})
it('closes idempotently and releases HTTP/database handles', async () => {
  await Promise.all([runtime.close(), runtime.close()])
  expect(runtime.server.listening).toBe(false)
  expect(runtime.connection.readyState).toBe(0)
  expect(
    lines.map((line) => JSON.parse(line).eventType).filter((event) => event === 'stopped'),
  ).toHaveLength(1)
})
