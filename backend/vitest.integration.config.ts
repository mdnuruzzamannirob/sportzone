import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    maxWorkers: 1,
    testTimeout: 20000,
    hookTimeout: 120000,
  },
})
