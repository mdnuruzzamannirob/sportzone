import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { expect, it } from 'vitest'
async function probe(environment: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, ['scripts/container-health.mjs'], {
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk
  })
  child.stderr.on('data', (chunk) => {
    output += chunk
  })
  const deadline = setTimeout(() => child.kill('SIGKILL'), 4000)
  try {
    return { exit: (await once(child, 'exit'))[0], output }
  } finally {
    clearTimeout(deadline)
  }
}
it.each([
  [200, '{"data":{"status":"live"}}', 0],
  [200, '{"data":{"status":"ready"}}', 1],
  [200, 'invalid-json', 1],
  [503, '{"data":{"status":"live"}}', 1],
  [302, '{"data":{"status":"live"}}', 1],
])('probes only public local liveness for HTTP %s', async (status, body, expected) => {
  const requests: { url: string | undefined; authorization: string | undefined }[] = []
  const server = createServer((req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization })
    res
      .writeHead(status, {
        'Content-Type': 'application/json',
        ...(status === 302 ? { Location: 'https://outside.example.test/' } : {}),
      })
      .end(body)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing fixture port')
  try {
    const result = await probe({
      PORT: String(address.port),
      API_BIND_HOST: '0.0.0.0',
      HEALTH_MONITOR_TOKEN: 'synthetic-private-monitor',
    })
    expect(result).toEqual({ exit: expected, output: '' })
    expect(requests).toEqual([{ url: '/api/v1/health/live', authorization: undefined }])
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
it.each([
  { PORT: '0' },
  { PORT: '65536' },
  { PORT: '004000' },
  { PORT: 'invalid' },
  { PORT: '4000', API_BIND_HOST: 'remote.example.test' },
])('rejects unsafe probe environment %s without diagnostics', async (environment) => {
  expect(await probe(environment)).toEqual({ exit: 1, output: '' })
})
it('handles a refused connection without logging configuration', async () => {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing fixture port')
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  expect(await probe({ PORT: String(address.port) })).toEqual({ exit: 1, output: '' })
})
