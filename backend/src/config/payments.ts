import { validateSslcommerzOptions } from '../providers/sslcommerz/sslcommerz.schema.js'
import { ConfigurationError } from '../shared/errors/configuration-error.js'

// Explicit composition only: loading this adapter does not expose payment APIs or enable channels.
export function loadSslcommerzOptions(environment: NodeJS.ProcessEnv) {
  if (
    environment.SSLCOMMERZ_ADAPTER_ENABLED === undefined ||
    environment.SSLCOMMERZ_ADAPTER_ENABLED === 'false'
  )
    return undefined
  if (environment.SSLCOMMERZ_ADAPTER_ENABLED !== 'true')
    throw new ConfigurationError(['sslcommerz_configuration'])
  return validateSslcommerzOptions({
    appEnv: environment.APP_ENV,
    mode: environment.SSLCOMMERZ_MODE,
    storeId: environment.SSLCOMMERZ_STORE_ID,
    storePassword: environment.SSLCOMMERZ_STORE_PASSWORD,
    callbackOrigin: environment.SSLCOMMERZ_CALLBACK_ORIGIN,
    timeoutMs: /^[1-9]\d*$/.test(environment.SSLCOMMERZ_TIMEOUT_MS ?? '')
      ? Number(environment.SSLCOMMERZ_TIMEOUT_MS)
      : NaN,
  })
}
