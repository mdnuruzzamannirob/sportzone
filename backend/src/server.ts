import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createApp } from './app.js'

export function startServer(port: number) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new RangeError('PORT must be an integer from 1 to 65535')
  const server = createApp().listen(port, '127.0.0.1')
  return server
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const rawPort = process.env.PORT ?? '4000'
  if (!/^[1-9]\d*$/.test(rawPort) || Number(rawPort) > 65535) {
    console.error('Backend startup failed: invalid PORT.')
    process.exitCode = 1
  } else {
    const server = startServer(Number(rawPort))
    server.on('error', () => {
      console.error('Backend startup failed: listener unavailable.')
      process.exitCode = 1
    })
    const shutdown = () => {
      const timeout = setTimeout(() => server.closeAllConnections(), 10000)
      timeout.unref()
      server.close(() => {
        clearTimeout(timeout)
      })
    }
    process.once('SIGTERM', shutdown)
    process.once('SIGINT', shutdown)
  }
}
