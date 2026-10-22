import { test, expect } from '@playwright/test'

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: live application shells retain cache and denied-access boundaries`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.addInitScript((value) => {
      localStorage.setItem('sportzone.theme', value)
      localStorage.setItem('role', 'admin')
      localStorage.setItem('authenticated', 'true')
    }, theme)
    await page.goto('http://127.0.0.1:3100')
    await expect(page.getByRole('heading', { name: 'Ready for your next game.' })).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('main')).toBeFocused()
    const account = await page.goto('http://127.0.0.1:3100/account')
    expect(account?.headers()['cache-control']).toMatch(/private.*no-store/)
    await expect(page.getByText('Account service unavailable', { exact: true })).toBeVisible()
    await page.goto('http://127.0.0.1:5273/app/orders/synthetic-order')
    await expect(
      page.getByRole('heading', { name: 'Administrator service unavailable' }),
    ).toBeVisible()
    await expect(page.locator('main')).not.toContainText('synthetic-order')
    await expect(page.locator('form')).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await page.getByRole('link', { name: 'Go to administrator sign-in', exact: true }).click()
    await expect(page).toHaveURL('http://127.0.0.1:5273/login')
    await expect(
      page.getByRole('heading', { name: 'SportZone administrator', exact: true }),
    ).toBeVisible()
  })
}
