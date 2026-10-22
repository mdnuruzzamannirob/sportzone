import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Keep the accessibility gate explicit. Stock-library color findings are defects
// to report, not exceptions to suppress for a green CI result.
for (const app of ['storefront', 'admin'] as const)
  for (const theme of ['light', 'dark'] as const) {
    test(`${app} ${theme}: accessibility of actual app and UI preview`, async ({ page }, info) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.addInitScript((value) => localStorage.setItem('sportzone.theme', value), theme)
      const findings: unknown[] = []
      for (const width of [375, 1280]) {
        await page.setViewportSize({ width, height: 900 })
        for (const url of [
          app === 'admin' ? 'http://127.0.0.1:5273/login' : 'http://127.0.0.1:3100',
          `http://127.0.0.1:5180/showcase.html?app=${app}`,
        ]) {
          await page.goto(url)
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze()
          await info.attach(`${width}-${new URL(url).port}-axe`, {
            body: JSON.stringify(results),
            contentType: 'application/json',
          })
          if (results.violations.length)
            findings.push({ url, width, violations: results.violations })
        }
      }
      expect(findings).toEqual([])
    })
  }
