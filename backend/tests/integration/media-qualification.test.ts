import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { inspectClamAvVersion } from '../../src/providers/antivirus/clamav.client.js'

it('reads bounded NUL-framed scanner version and fails closed on incomplete/oversized replies', async () => {
  let reply = 'ClamAV 1.4.3/12345/Fri Oct 30 00:00:00 2026\0',
    command = ''
  const server = createServer((socket) =>
    socket.on('data', (bytes) => {
      command += bytes.toString()
      socket.end(reply)
    }),
  )
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Synthetic scanner missing')
    const options = { host: '127.0.0.1', port: address.port, timeoutMs: 1000 }
    expect(await inspectClamAvVersion(options)).toBe(reply.slice(0, -1))
    expect(command).toBe('zVERSION\0')
    reply = 'incomplete'
    expect(await inspectClamAvVersion(options)).toBeUndefined()
    reply = `${'x'.repeat(4097)}\0`
    expect(await inspectClamAvVersion(options)).toBeUndefined()
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})

it('qualification preparation is local-only, collision-safe and execution requires explicit authority', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sportzone-media-intent-'))
  const file = join(directory, 'intent.json')
  const env = {
    APP_ENV: 'staging',
    CLOUDINARY_CLOUD_NAME: 'synthetic',
    GITHUB_SHA: 'synthetic-reviewed-revision',
  }
  const run = (args: string[], extra: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, ['scripts/qualify-media.mjs', ...args], {
      env: { ...env, ...extra },
      encoding: 'utf8',
      timeout: 10000,
    })
  try {
    expect(run(['--prepare', file]).status).toBe(0)
    const original = readFileSync(file, 'utf8'),
      plan = JSON.parse(original)
    expect(plan.assets).toHaveLength(2)
    expect(plan.assets[0].publicId).not.toBe(plan.assets[1].publicId)
    expect(
      plan.assets.every(
        (asset: { publicId: string; attempted: boolean }) =>
          /^sportzone\/[a-f0-9]{24}$/.test(asset.publicId) && !asset.attempted,
      ),
    ).toBe(true)
    expect(run(['--prepare', file]).status).toBe(1)
    expect(readFileSync(file, 'utf8')).toBe(original)
    expect(run(['--run', file]).status).toBe(1)
    expect(readFileSync(file, 'utf8')).toBe(original)
    plan.assets[0].publicId = '../unowned'
    writeFileSync(file, JSON.stringify(plan))
    const result = run(['--run', file], {
      MEDIA_QUALIFICATION_AUTHORIZED: 'true',
      MEDIA_QUALIFICATION_INTENT_REFERENCE: 'synthetic-persisted-intent',
    })
    expect(result.status).toBe(1)
    expect(result.stderr).not.toContain('unowned')
    expect(JSON.parse(readFileSync(file, 'utf8')).status).toBe('prepared')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
