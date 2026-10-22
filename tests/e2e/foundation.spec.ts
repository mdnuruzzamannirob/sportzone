import { test, expect } from '@playwright/test'

for (const app of ['storefront', 'admin'] as const)
  for (const theme of ['light', 'dark'] as const) {
    test(`${app} ${theme}: actual UI preview, drafts, overlays and app/theme switching`, async ({
      page,
    }, info) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.addInitScript((value) => {
        if (localStorage.getItem('sportzone.theme') === null)
          localStorage.setItem('sportzone.theme', value)
      }, theme)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`http://127.0.0.1:5180/showcase.html?app=${app}`)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        app === 'admin' ? 'Admin' : 'Storefront',
      )
      const navigation = page.getByRole('navigation', { name: 'HeroUI components' })
      // Render each family once; variant/state matrices belong to the selected family.
      for (const name of await navigation.getByRole('button').allTextContents()) {
        await navigation.getByRole('button', { name, exact: true }).click()
        await expect(page.locator('main h2').first()).toHaveText(name)
      }
      await navigation.getByRole('button', { name: 'App overlays', exact: true }).click()
      const trigger = page.getByRole('button', { name: 'Open app modal', exact: true })
      await trigger.press('Enter')
      await page.getByLabel('App modal draft', { exact: true }).fill('Retained review draft')
      await page.keyboard.press('Escape')
      await expect(trigger).toBeFocused()
      await trigger.click()
      await expect(page.getByLabel('App modal draft', { exact: true })).toHaveValue(
        'Retained review draft',
      )
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await page.getByRole('button', { name: 'Open app drawer', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'App drawer', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await navigation.getByRole('button', { name: 'App fields', exact: true }).click()
      await page.getByLabel('Product name', { exact: true }).fill('Theme-safe draft')
      await page
        .getByRole('button', { name: theme === 'dark' ? 'Light theme' : 'Dark theme', exact: true })
        .click()
      await expect(page.getByLabel('Product name', { exact: true })).toHaveValue('Theme-safe draft')
      const nextTheme = theme === 'dark' ? 'light' : 'dark'
      await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme)
      const nextApp = app === 'admin' ? 'Storefront' : 'Admin'
      await page
        .getByRole('navigation', { name: 'Preview application' })
        .getByRole('button', { name: nextApp, exact: true })
        .click()
      await expect(page.getByRole('heading', { level: 1 })).toContainText(nextApp)
      await expect(page.locator('main h2').first()).toHaveText('App fields')
      await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme)
      await page.setViewportSize({ width: 375, height: 900 })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true)
      await info.attach('actual-app-ui-mobile', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
      expect(errors).toEqual([])
    })
  }
