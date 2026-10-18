import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 768, 1440]) {
    test(`${theme} ${width}px: public shells and component fixture reflow/contrast`, async ({
      page,
    }, info) => {
      info.annotations.push({
        type: 'engine',
        description: `${info.project.name} ${page.context().browser()?.version()}`,
      })
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height: 900 })
      for (const [name, url] of [
        ['storefront', 'http://127.0.0.1:3100'],
        ['admin', 'http://127.0.0.1:5273/login'],
        ['fixture', 'http://127.0.0.1:5180'],
      ] as const) {
        await page.goto(url)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await page.evaluate(
          (theme) => (document.documentElement.dataset.theme = theme),
          theme,
        )
        await page.evaluate(() => document.fonts.ready)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true)
        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
        await info.attach(`${name}-axe`, {
          body: JSON.stringify(result),
          contentType: 'application/json',
        })
        expect(result.violations).toEqual([])
        await info.attach(`${name}-${theme}-${width}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        })
      }
    })
  }
  test(`${theme}: native keyboard, local overflow, theme and reduced motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto('http://127.0.0.1:5180')
    await expect(
      page.getByRole('heading', { name: 'Foundation audit fixture' }),
    ).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('main')).toBeFocused()
    const scroll = page.getByRole('region', { name: 'Synthetic products columns' })
    await scroll.focus()
    expect(
      await scroll.evaluate((el) =>
        Number.parseFloat(getComputedStyle(el).outlineWidth),
      ),
    ).toBeGreaterThanOrEqual(2)
    expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
    await page.getByLabel('Product image', { exact: true }).setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==',
        'base64',
      ),
    })
    await expect(
      page.getByRole('img', { name: 'Local preview of sample.png' }),
    ).toBeVisible()
    await expect
      .poll(() =>
        page
          .getByRole('img', { name: 'Local preview of sample.png' })
          .evaluate((image) =>
            image instanceof HTMLImageElement ? image.naturalWidth : 0,
          ),
      )
      .toBe(1)
    await page.getByRole('button', { name: 'Remove file', exact: true }).click()
    await expect(
      page.getByRole('img', { name: 'Local preview of sample.png' }),
    ).toBeHidden()
    await page.getByRole('button', { name: 'Deactivate sample', exact: true }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    await page.getByRole('textbox', { name: 'Reason' }).fill('Retained audit draft')
    for (let index = 0; index < 10; index++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(
        true,
      )
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(
      page.getByRole('button', { name: 'Deactivate sample', exact: true }),
    ).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('textbox', { name: 'Reason' })).toHaveValue(
      'Retained audit draft',
    )
    await page.keyboard.press('Escape')
    expect(
      await page.evaluate(() => {
        const skeleton = document.querySelector('.skeleton')
        if (!skeleton) throw new Error('Missing skeleton')
        return Number.parseFloat(getComputedStyle(skeleton).animationDuration)
      }),
    ).toBeLessThanOrEqual(0.00001)
  })
  test(`${theme}: theme persistence keeps draft and navigation; mobile menus recover focus`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme })
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto('http://127.0.0.1:5180')
    await page
      .getByRole('searchbox', { name: 'Search', exact: true })
      .fill('Draft to preserve')
    await page.getByRole('button', { name: 'Appearance', exact: true }).click()
    await page.locator('[data-slot="select-trigger"]').press('Enter')
    await page
      .getByRole('option', { name: theme === 'dark' ? 'Light' : 'Dark', exact: true })
      .press('Enter')
    const target = theme === 'dark' ? 'light' : 'dark'
    await expect(page.locator('html')).toHaveAttribute('data-theme', target)
    await expect(
      page.getByRole('searchbox', { name: 'Search', exact: true }),
    ).toHaveValue('Draft to preserve')
    await expect(page).toHaveURL('http://127.0.0.1:5180/')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', target)
    await page.getByRole('button', { name: 'Appearance', exact: true }).click()
    await page.locator('[data-slot="select-trigger"]').press('Enter')
    await page.getByRole('option', { name: 'System', exact: true }).press('Enter')
    await expect(page.locator('html')).not.toHaveAttribute('data-theme')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    )
    const menu = page.getByRole('button', { name: 'Menu', exact: true })
    await menu.press('Enter')
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(menu).toBeFocused()
    await page.goto('http://127.0.0.1:3100')
    const customerMenu = page.getByRole('button', { name: 'Menu', exact: true })
    await customerMenu.press('Enter')
    await expect(customerMenu).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(customerMenu).toHaveAttribute('aria-expanded', 'false')
    await expect(customerMenu).toBeFocused()
  })
}
