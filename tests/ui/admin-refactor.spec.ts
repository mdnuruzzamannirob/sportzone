import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 768, 1440]) {
    test(`admin refactor: ${theme} ${width}px deep links, navigation and theme`, async ({ page }, info) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript((value) => {
        localStorage.setItem('sportzone.theme', value)
        localStorage.setItem('role', 'admin')
        localStorage.setItem('authenticated', 'true')
      }, theme)
      await page.goto('http://127.0.0.1:5273/')
      await expect(page).toHaveURL('http://127.0.0.1:5273/login')
      await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled()
      for (const path of ['/login', '/app/orders/synthetic-order', '/app/products/new', '/app/settings/delivery', '/unknown-refactor-route']) {
        await page.goto(`http://127.0.0.1:5273${path}`)
        const restricted = path.startsWith('/app')
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(restricted ? 'Admin access unavailable' : path === '/login' ? 'Administrator access' : 'Page not found')
        await expect(page.locator('main')).toHaveCount(1)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await expect(page.locator('form')).toHaveCount(0)
        await expect(page.locator('main')).not.toContainText('synthetic-order')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        if (restricted) {
          await expect(page.getByText('Administrator sign-in is required. Access is not available yet.')).toBeVisible()
          if (path.includes('/orders/')) {
            await page.keyboard.press('Tab')
            await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
            await page.keyboard.press('Enter')
            await expect(page.locator('main')).toBeFocused()
            if (width < 1024) {
              const menu = page.getByRole('button', { name: 'Menu', exact: true })
              await menu.press('Enter')
              const dialog = page.getByRole('dialog', { name: 'Admin navigation', exact: true })
              await expect(dialog).toBeVisible()
              await page.keyboard.press('Escape')
              await expect(dialog).toBeHidden()
              await expect(menu).toBeFocused()
              await menu.click()
              await dialog.getByRole('link', { name: 'Products', exact: true }).click()
              await expect(page).toHaveURL('http://127.0.0.1:5273/app/products')
              await expect(dialog).toBeHidden()
            } else {
              await page.getByRole('navigation', { name: 'Admin sidebar' }).getByRole('link', { name: 'Products', exact: true }).click()
              await expect(page).toHaveURL('http://127.0.0.1:5273/app/products')
            }
            await expect(page.getByRole('heading', { level: 1 })).toHaveText('Admin access unavailable')
          }
        }
        await page.evaluate(() => document.fonts.ready)
        expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
        if (path === '/app/settings/delivery')
          await info.attach(`admin-${theme}-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
      }
      await page.getByRole('link', { name: 'Go to administrator sign-in' }).click()
      await expect(page).toHaveURL('http://127.0.0.1:5273/login')
      await page.reload()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    })
  }
  test(`admin refactor: ${theme} lazy chunk pending, failure and reload recovery`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    let release: () => void = () => {}
    const blocked = new Promise<void>((resolve) => { release = resolve })
    await page.route('**/assets/admin-access-boundary-*.js', async (route) => {
      await blocked
      await route.abort('failed')
    }, { times: 1 })
    await page.goto('http://127.0.0.1:5273/app/orders', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('status')).toHaveText('Loading administration…')
    await expect(page.locator('main')).toHaveCount(1)
    release()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Administration could not load')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.locator('form')).toHaveCount(0)
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
    await page.getByRole('button', { name: 'Reload page' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Admin access unavailable')
  })
}
