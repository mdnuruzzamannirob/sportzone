import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Linux/macOS process groups include npm shells and compiler/server descendants.
export function runDev({
  cwd = process.cwd(),
  build = null,
  commands = [
    ['node', 'scripts/dev-backend.mjs'],
    ['npm', 'run', 'dev', '--workspace=storefront'],
    ['npm', 'run', 'dev', '--workspace=admin'],
  ],
  graceMs = 12_000,
} = {}) {
  if (process.platform === 'win32')
    throw new Error('Coordinated development requires Linux, macOS or WSL.')
  return new Promise((resolveDone) => {
    const children = []
    let stopping = false
    let timer
    const signalGroup = (child, signal) => {
      if (!child.pid) return
      try {
        process.kill(-child.pid, signal)
      } catch (error) {
        if (error.code !== 'ESRCH') throw error
      }
    }
    const finish = (code) => {
      clearInterval(timer)
      process.off('SIGINT', interrupt)
      process.off('SIGTERM', terminate)
      resolveDone(code)
    }
    const stop = (code) => {
      if (stopping) return
      stopping = true
      for (const child of children) signalGroup(child, 'SIGTERM')
      const deadline = Date.now() + graceMs
      timer = setInterval(() => {
        const alive = children.some((child) => {
          if (!child.pid) return false
          try {
            process.kill(-child.pid, 0)
            return true
          } catch (error) {
            if (error.code === 'ESRCH') return false
            throw error
          }
        })
        if (!alive) finish(code)
        else if (Date.now() >= deadline) {
          for (const child of children) signalGroup(child, 'SIGKILL')
          finish(code)
        }
      }, 50)
    }
    const interrupt = () => stop(130)
    const terminate = () => stop(143)
    process.on('SIGINT', interrupt)
    process.on('SIGTERM', terminate)
    const start = (args, onSuccess) => {
      console.log(`Starting: ${args.join(' ')}`)
      const child = spawn(args[0], args.slice(1), { cwd, stdio: 'inherit', detached: true })
      children.push(child)
      child.once('error', () => {
        console.error(`Cannot start: ${args[0]}`)
        stop(1)
      })
      child.once('exit', (code) => {
        if (stopping) return
        if (code === 0 && onSuccess) {
          // Completed setup groups must not be signalled hours later after PID reuse.
          children.splice(children.indexOf(child), 1)
          onSuccess()
        } else {
          console.error(`Development process exited: ${args[0]} (${code ?? 'signal'})`)
          stop(code || 1)
        }
      })
    }
    // Optional setup is supervised by the same signal handlers as long-running commands.
    const startWatchers = () => {
      for (const command of commands) {
        if (!stopping) start(command)
      }
    }
    if (build) start(build, startWatchers)
    else startWatchers()
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await runDev()
