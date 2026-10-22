import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
const cwd = fileURLToPath(new URL('../..', import.meta.url))
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 45000,
  outputDir: '../../test-results/ui',
  reporter: [['list'], ['json', { outputFile: '../../test-results/ui-report.json' }]],
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    {
      name: 'webkit',
      use: {
        browserName: 'webkit',
        launchOptions: { executablePath: process.env.SPORTZONE_WEBKIT_EXECUTABLE },
      },
    },
  ],
  webServer: [
    {
      command: 'npm run start --workspace storefront -- --port 3100',
      url: 'http://127.0.0.1:3100',
      cwd,
      reuseExistingServer: false,
    },
    {
      command: 'npm run preview --workspace admin -- --port 5273',
      url: 'http://127.0.0.1:5273',
      cwd,
      reuseExistingServer: false,
    },
    {
      command: 'node node_modules/vite/bin/vite.js --config tests/e2e/vite.config.mts',
      url: 'http://127.0.0.1:5180/showcase.html',
      cwd,
      reuseExistingServer: false,
    },
  ],
})
