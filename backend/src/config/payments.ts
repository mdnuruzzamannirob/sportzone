import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import { paymentChannelApproval } from '../modules/payments/attempts/payment-eligibility.schema.js'
import { paymentCallbackOptions } from '../modules/payments/collections/payment-callback.schema.js'
import { validateSslcommerzOptions } from '../providers/sslcommerz/sslcommerz.schema.js'
import { ConfigurationError } from '../shared/errors/configuration-error.js'

// Explicit composition only: loading this adapter does not expose payment APIs or enable channels.
function loadSslcommerzOptions(environment: NodeJS.ProcessEnv) {
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

// This is an operator-maintained approval register, not an API-editable enablement flag.
async function loadPaymentChannelApprovals(environment: NodeJS.ProcessEnv) {
  if (!environment.PAYMENT_CHANNEL_APPROVALS_FILE) return []
  try {
    const options = loadSslcommerzOptions(environment)
    if (!options) throw new Error()
    const path = environment.PAYMENT_CHANNEL_APPROVALS_FILE
    const bytes = await readFile(path)
    if (bytes.length > 1000000) throw new Error()
    const rows = z
      .array(paymentChannelApproval)
      .max(3)
      .parse(JSON.parse(bytes.toString('utf8')))
    if (new Set(rows.map((row) => row.channel)).size !== rows.length) throw new Error()
    const key = createHash('sha256').update(`${options.mode}\0${options.storeId}`).digest('hex')
    for (const row of rows) {
      if (
        row.appEnv !== options.appEnv ||
        row.mode !== options.mode ||
        row.merchantAccountKey !== key ||
        Date.parse(row.verifiedAt) > Date.now() ||
        Date.parse(row.validUntil) <= Date.now()
      )
        throw new Error()
      const evidence = await readFile(resolve(dirname(path), row.evidenceFile))
      if (
        !evidence.length ||
        evidence.length > 1000000 ||
        createHash('sha256').update(evidence).digest('hex') !== row.evidenceDigest
      )
        throw new Error()
    }
    return rows
  } catch {
    throw new ConfigurationError(['payment_channel_approvals'])
  }
}

// Real staging/live collection must wait for independently reviewed callback/verification integration.
function loadPaymentInitiationOptions(environment: NodeJS.ProcessEnv) {
  if (
    environment.PAYMENT_INITIATION_ENABLED === undefined ||
    environment.PAYMENT_INITIATION_ENABLED === 'false'
  )
    return undefined
  if (
    environment.PAYMENT_INITIATION_ENABLED !== 'true' ||
    !['local', 'test'].includes(environment.APP_ENV ?? '') ||
    environment.CUSTOMER_AUTH_ENABLED !== 'true' ||
    !environment.PAYMENT_CHANNEL_APPROVALS_FILE
  )
    throw new ConfigurationError(['payment_initiation_activation'])
  const options = loadSslcommerzOptions(environment)
  if (!options) throw new ConfigurationError(['payment_initiation_activation'])
  return options
}

function loadPaymentCallbackOptions(environment: NodeJS.ProcessEnv) {
  if (
    environment.PAYMENT_CALLBACKS_ENABLED === undefined ||
    environment.PAYMENT_CALLBACKS_ENABLED === 'false'
  )
    return undefined
  try {
    if (
      environment.PAYMENT_CALLBACKS_ENABLED !== 'true' ||
      !['local', 'test'].includes(environment.APP_ENV ?? '')
    )
      throw new Error()
    return paymentCallbackOptions.parse({
      mode: environment.SSLCOMMERZ_MODE,
      storeId: environment.SSLCOMMERZ_STORE_ID,
      storefrontOrigin: environment.STOREFRONT_ORIGIN,
      returns: {
        success: environment.PAYMENT_RETURN_SUCCESS_URL,
        fail: environment.PAYMENT_RETURN_FAIL_URL,
        cancel: environment.PAYMENT_RETURN_CANCEL_URL,
      },
      rateLimit: /^[1-9]\d*$/.test(environment.PAYMENT_CALLBACK_RATE_LIMIT ?? '')
        ? Number(environment.PAYMENT_CALLBACK_RATE_LIMIT)
        : NaN,
    })
  } catch {
    throw new ConfigurationError(['payment_callback_configuration'])
  }
}

function loadPaymentProcessingOptions(environment: NodeJS.ProcessEnv) {
  if (
    environment.PAYMENT_PROCESSING_ENABLED === undefined ||
    environment.PAYMENT_PROCESSING_ENABLED === 'false'
  )
    return undefined
  if (
    environment.PAYMENT_PROCESSING_ENABLED !== 'true' ||
    !['local', 'test'].includes(environment.APP_ENV ?? '') ||
    environment.PAYMENT_CALLBACKS_ENABLED !== 'true'
  )
    throw new ConfigurationError(['payment_processing_activation'])
  loadPaymentCallbackOptions(environment)
  const options = loadSslcommerzOptions(environment)
  if (!options) throw new ConfigurationError(['payment_processing_activation'])
  return options
}

const paymentReconciliationOptions = z
  .strictObject({
    batchSize: z.int().min(1).max(100),
    leaseMs: z.int().min(1000).max(3600000),
    pollIntervalMs: z.int().min(1000).max(86400000),
    terminalPollIntervalMs: z.int().min(1000).max(604800000),
    escalateAfterMs: z.int().min(1000).max(2592000000),
  })
  .refine(
    (value) =>
      value.terminalPollIntervalMs >= value.pollIntervalMs &&
      value.escalateAfterMs >= value.pollIntervalMs,
  )

export {
  loadPaymentCallbackOptions,
  loadPaymentChannelApprovals,
  loadPaymentInitiationOptions,
  loadPaymentProcessingOptions,
  loadSslcommerzOptions,
  paymentReconciliationOptions,
}
