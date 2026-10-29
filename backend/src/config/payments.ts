import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { paymentChannelApproval } from '../modules/payments/payment-eligibility.schema.js'
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

// This is an operator-maintained approval register, not an API-editable enablement flag.
export async function loadPaymentChannelApprovals(environment: NodeJS.ProcessEnv) {
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
