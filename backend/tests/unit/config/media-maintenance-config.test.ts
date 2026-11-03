import { expect, it } from 'vitest'
import { loadMediaMaintenanceConfiguration } from '../../../src/config/media.js'
import { configuredPublicMedia } from '../../../src/setup.js'

const env = {
  APP_ENV: 'test',
  ADMIN_AUTH_ENABLED: 'true',
  MEDIA_MAINTENANCE_ENABLED: 'true',
  MEDIA_MAINTENANCE_BATCH_SIZE: '20',
  MEDIA_MAINTENANCE_LEASE_MS: '60000',
  MEDIA_POLICY_JSON: JSON.stringify({
    maxBytes: 1024,
    maxPixels: 10000,
    allowedFormats: ['png'],
    privateUrlTtlSeconds: 30,
  }),
  MEDIA_TEMP_TTL_SECONDS: '60',
  CLOUDINARY_CLOUD_NAME: 'synthetic',
  CLOUDINARY_API_KEY: '12345',
  CLOUDINARY_API_SECRET: 'synthetic-secret',
  MEDIA_PROVIDER_TIMEOUT_MS: '1000',
}
it('media maintenance defaults off and requires strict explicit nonproduction configuration independently from uploads', () => {
  expect(loadMediaMaintenanceConfiguration({})).toBeUndefined()
  expect(loadMediaMaintenanceConfiguration({ ...env, MEDIA_ENABLED: 'false' })).toMatchObject({
    batchSize: 20,
    leaseMs: 60000,
  })
  for (const change of [
    { APP_ENV: 'production' },
    { MEDIA_MAINTENANCE_ENABLED: 'yes' },
    { MEDIA_MAINTENANCE_BATCH_SIZE: '101' },
    { MEDIA_MAINTENANCE_LEASE_MS: '0' },
    { MEDIA_POLICY_JSON: '{}' },
  ])
    expect(() => loadMediaMaintenanceConfiguration({ ...env, ...change })).toThrow()
})
it('public media admission is explicit and independent of returns, but refuses absent admin/scanner policy or deployed activation', () => {
  expect(configuredPublicMedia({})).toBeUndefined()
  const active = {
    ...env,
    MEDIA_ENABLED: 'true',
    MEDIA_SCANNER: 'clamav',
    MEDIA_SCANNER_HOST: '127.0.0.1',
    MEDIA_SCANNER_PORT: '3310',
    MEDIA_SCANNER_TIMEOUT_MS: '1000',
    RETURN_OPERATIONS_ENABLED: 'false',
  }
  expect(configuredPublicMedia(active)?.policy.maxBytes).toBe(1024)
  for (const change of [
    { ADMIN_AUTH_ENABLED: 'false' },
    { APP_ENV: 'production' },
    { APP_ENV: 'staging' },
    { MEDIA_SCANNER: 'none' },
  ])
    expect(() => configuredPublicMedia({ ...active, ...change })).toThrow()
})
