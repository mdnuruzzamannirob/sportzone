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
