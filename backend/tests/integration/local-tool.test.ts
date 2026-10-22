import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { it, expect } from 'vitest'

it('starts and stops an owned ephemeral local replica without using an external URI', async () => {
  const child = spawn(process.execPath, ['scripts/local-database.mjs'], {
    env: {
      ...process.env,
      MONGODB_URI: 'mongodb://invalid-synthetic.invalid:1/private',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const exit = once(child, 'exit')
  try {
    let output = ''
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Local replica startup timed out')), 30000)
      child.stdout.on('data', (data) => {
        output += String(data)
        if (output.includes('MONGODB_URI=')) {
          clearTimeout(timeout)
          resolve()
        }
      })
      child.once('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once('exit', () => {
        clearTimeout(timeout)
        if (!output.includes('MONGODB_URI='))
          reject(new Error('Local replica stopped before startup'))
      })
    })
    expect(output).toMatch(/MONGODB_URI=mongodb:\/\/127\.0\.0\.1:/)
    expect(output).not.toContain('invalid-synthetic')
    child.kill('SIGTERM')
    expect((await exit)[0]).toBe(0)
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL')
  }
}, 45000)
