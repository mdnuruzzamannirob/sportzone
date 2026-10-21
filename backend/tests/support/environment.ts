import { randomBytes } from 'node:crypto'
export function testEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    APP_ENV: 'test',
    PORT: '4000',
    API_BIND_HOST: '127.0.0.1',
    RELEASE_ID: 'synthetic-test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/synthetic',
    MONGODB_DB_NAME: 'sportzone_test_runtime',
    SESSION_SECRET: randomBytes(32).toString('hex'),
    HEALTH_MONITOR_TOKEN: randomBytes(32).toString('hex'),
    API_PUBLIC_ORIGIN: 'http://127.0.0.1:4000',
    STOREFRONT_ORIGIN: 'http://localhost:3000',
    ADMIN_ORIGIN: 'http://localhost:5173',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:5173',
  }
}

export function identityEnvironment(): NodeJS.ProcessEnv {
  return {
    ...testEnvironment(),
    API_PUBLIC_ORIGIN: 'https://api.example.test',
    STOREFRONT_ORIGIN: 'https://shop.example.test',
    ADMIN_ORIGIN: 'https://admin.example.test',
    CORS_ALLOWED_ORIGINS:
      'https://shop.example.test,https://admin.example.test',
    CUSTOMER_AUTH_ENABLED: 'true',
    ADMIN_AUTH_ENABLED: 'true',
    PASSWORD_RECOVERY_ENABLED: 'true',
    EMAIL_CHANGE_ENABLED: 'true',
    CUSTOMER_SESSION_TTL_SECONDS: '3600',
    ADMIN_SESSION_TTL_SECONDS: '1800',
    SESSION_COOKIE_SAME_SITE: 'lax',
    BROWSER_CONTEXT_TTL_SECONDS: '300',
    AUTH_PROOF_ACTIVE_KEY_VERSION: 'fixture',
    AUTH_PROOF_KEYS_JSON: JSON.stringify({
      fixture: randomBytes(32).toString('hex'),
    }),
    ...Object.fromEntries(
      ['PASSWORD_RESET', 'ADMIN_PASSWORD_RESET', 'EMAIL_CHANGE'].flatMap(
        (prefix) => [
          [`${prefix}_TTL_SECONDS`, '600'],
          [`${prefix}_COOLDOWN_SECONDS`, '60'],
          [`${prefix}_RESPONSE_FLOOR_MS`, '100'],
        ],
      ),
    ),
  }
}
