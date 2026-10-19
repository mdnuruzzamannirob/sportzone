import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createApp } from './app.js'
import { createApiRouter } from './routes.js'
import { composeCustomerRoutes } from './modules/auth/composition.js'
import {
  ConfigurationError,
  loadEnvironment,
  type RuntimeConfig,
} from './config/environment.js'
import { openDatabase } from './db/connection.js'
import {
  createLogger,
  logConfigurationFailure,
} from './observability/logger.js'

export async function startServer(
  config: RuntimeConfig,
  logger = createLogger(config, undefined, [
    config.MONGODB_URI,
    config.SESSION_SECRET,
    config.HEALTH_MONITOR_TOKEN,
  ]),
) {
  logger.lifecycle('starting')
  const connection = await openDatabase(
    config.MONGODB_URI,
    config.MONGODB_DB_NAME,
  )
  let identityRouter:
    | Awaited<ReturnType<typeof composeCustomerRoutes>>
    | undefined
  try {
    if (config.CUSTOMER_AUTH_ENABLED)
      identityRouter = await composeCustomerRoutes(connection, config)
  } catch (error) {
    await connection.destroy()
    throw error
  }
  let draining = false
  const disconnected = () => logger.lifecycle('database_disconnected')
  const connected = () => logger.lifecycle('database_connected')
  const databaseError = () => logger.lifecycle('database_error')
  connection.on('disconnected', disconnected)
  connection.on('connected', connected)
  connection.on('error', databaseError)
  logger.lifecycle('database_connected')
  const health = {
    monitorToken: config.HEALTH_MONITOR_TOKEN,
    isReady: async () => {
      if (draining || connection.readyState !== 1 || !connection.db)
        return false
      await connection.db.command({ ping: 1 }, { timeoutMS: 1000 })
      return !draining && connection.readyState === 1
    },
  }
  const apiRouter = createApiRouter(health)
  if (identityRouter) apiRouter.use(identityRouter)
  const server = createServer(createApp({ logger, apiRouter }))
  try {
    await new Promise<void>((resolve, reject) => {
      const failed = (error: Error) => reject(error)
      server.once('error', failed)
      server.listen(config.PORT, config.API_BIND_HOST, () => {
        server.off('error', failed)
        resolve()
      })
    })
  } catch {
    await connection.destroy()
    throw new Error('Backend listener startup failed.')
  }
  logger.lifecycle('ready')
  let closing: Promise<void> | undefined
  return {
    server,
    connection,
    close() {
      if (closing) return closing
      draining = true
      closing = (async () => {
        logger.lifecycle('stopping')
        const timer = setTimeout(() => server.closeAllConnections(), 10000)
        timer.unref()
        try {
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          )
        } finally {
          clearTimeout(timer)
          connection.off('disconnected', disconnected)
          connection.off('connected', connected)
          connection.off('error', databaseError)
          await connection.destroy()
        }
        logger.lifecycle('stopped')
      })()
      return closing
    },
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const config = loadEnvironment(process.env)
    const logger = createLogger(config, undefined, [
      config.MONGODB_URI,
      config.SESSION_SECRET,
      config.HEALTH_MONITOR_TOKEN,
    ])
    try {
      const runtime = await startServer(config, logger)
      const shutdown = () => {
        void runtime.close().catch(() => {
          logger.lifecycle('shutdown_failed')
          process.exitCode = 1
        })
      }
      process.once('SIGTERM', shutdown)
      process.once('SIGINT', shutdown)
    } catch {
      logger.lifecycle('startup_failed')
      process.exitCode = 1
    }
  } catch (error) {
    logConfigurationFailure(
      error instanceof ConfigurationError ? error.fields : ['configuration'],
    )
    process.exitCode = 1
  }
}
