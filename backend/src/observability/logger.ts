import type { SecurityAction } from './security-actions.js'
import { randomUUID } from 'node:crypto'
import type { RuntimeConfig } from '../config/environment.js'
import type { ErrorCode } from '../shared/errors.js'

type LifecycleEvent =
  | 'starting'
  | 'ready'
  | 'stopping'
  | 'stopped'
  | 'startup_failed'
  | 'shutdown_failed'
  | 'database_connected'
  | 'database_disconnected'
  | 'database_error'
type RequestEvent = {
  requestId: string
  method: string
  route: string
  status: number
  durationMs: number
  securityAction?: SecurityAction
  errorCode?: ErrorCode
}
const methods = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
])
export function createLogger(
  config: Pick<RuntimeConfig, 'APP_ENV' | 'RELEASE_ID'>,
  sink: (line: string) => void = (line) => {
    process.stdout.write(`${line}\n`)
  },
  secrets: readonly string[] = [],
) {
  const operationId = randomUUID()
  const clean = (value: string) =>
    secrets.reduce(
      (text, secret) => (secret ? text.replaceAll(secret, '[redacted]') : text),
      value,
    )
  const base = (level: string, eventType: string) => ({
    timestampUtc: new Date().toISOString(),
    environment: config.APP_ENV,
    service: 'backend',
    releaseId: clean(config.RELEASE_ID),
    level,
    eventType,
  })
  return {
    lifecycle(event: LifecycleEvent) {
      sink(
        JSON.stringify({
          ...base(
            event.endsWith('failed') || event === 'database_error'
              ? 'error'
              : event === 'database_disconnected'
                ? 'warn'
                : 'info',
            event,
          ),
          operationId,
          status: event,
          errorCode:
            event.includes('failed') || event === 'database_error'
              ? 'SERVICE_UNAVAILABLE'
              : null,
        }),
      )
    },
    request(event: RequestEvent) {
      sink(
        JSON.stringify({
          ...base(
            event.status >= 500
              ? 'error'
              : event.status >= 400
                ? 'warn'
                : 'info',
            'request_completed',
          ),
          requestId: /^[a-f0-9-]{36}$/.test(event.requestId)
            ? event.requestId
            : 'unavailable',
          method: methods.has(event.method) ? event.method : 'OTHER',
          route: clean(event.route),
          status: event.status,
          durationMs: Math.max(0, Math.round(event.durationMs)),
          errorCode: event.errorCode ?? null,
          ...(event.securityAction
            ? {
                securityAction: event.securityAction,
                outcome:
                  event.status >= 200 && event.status < 400
                    ? 'succeeded'
                    : event.status >= 400 && event.status < 500
                      ? 'denied'
                      : 'failed',
              }
            : {}),
        }),
      )
    },
  }
}
export type Logger = ReturnType<typeof createLogger>
export function logConfigurationFailure(
  fields: readonly string[],
  sink: (line: string) => void = (line) => {
    process.stderr.write(`${line}\n`)
  },
) {
  sink(
    JSON.stringify({
      timestampUtc: new Date().toISOString(),
      environment: 'unvalidated',
      service: 'backend',
      releaseId: 'unvalidated',
      level: 'error',
      eventType: 'startup_failed',
      operationId: randomUUID(),
      status: 'failed',
      errorCode: 'CONFIGURATION_INVALID',
      configurationFields: fields,
    }),
  )
}
