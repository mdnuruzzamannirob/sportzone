import { loadPaymentChannelApprovals } from './config/payments.js'
import { loadCheckoutOptions } from './config/checkout.js'
import { loadPolicyApprovals } from './config/settings.js'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { composeApplication } from './setup.js'
import { ConfigurationError, loadEnvironment, type RuntimeConfig } from './config/env.js'
import { openDatabase } from './config/database.js'
import { createLogger, logConfigurationFailure } from './shared/logger.js'

export async function startServer(
  config: RuntimeConfig,
  logger = createLogger(config, undefined, [
    config.MONGODB_URI,
    config.SESSION_SECRET,
    config.HEALTH_MONITOR_TOKEN,
  ]),
) {
  logger.lifecycle('starting')
  const connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  let draining = false
  const health = {
    monitorToken: config.HEALTH_MONITOR_TOKEN,
    isReady: async () => {
      if (draining || connection.readyState !== 1 || !connection.db) return false
      await connection.db.command({ ping: 1 }, { timeoutMS: 1000 })
      return !draining && connection.readyState === 1
    },
  }
  let app: Awaited<ReturnType<typeof composeApplication>>
  try {
    app = await composeApplication(
      connection,
      config,
      health,
      logger,
      undefined,
      await loadPolicyApprovals(process.env),
      await loadCheckoutOptions(process.env),
      await loadPaymentChannelApprovals(process.env),
    )
  } catch (error) {
    await connection.destroy()
    throw error
  }
  const server = createServer(app)
  const disconnected = () => logger.lifecycle('database_disconnected')
  const connected = () => logger.lifecycle('database_connected')
  const databaseError = () => logger.lifecycle('database_error')
  connection.on('disconnected', disconnected)
  connection.on('connected', connected)
  connection.on('error', databaseError)
  logger.lifecycle('database_connected')
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
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
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
    } catch (error) {
      logger.lifecycle('startup_failed', error)
      process.exitCode = 1
    }
  } catch (error) {
    logConfigurationFailure(error instanceof ConfigurationError ? error.fields : ['configuration'])
    process.exitCode = 1
  }
}
