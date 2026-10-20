import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function verifyTypography(app: 'admin' | 'storefront') {
  const root = resolve(process.cwd(), '..')
  const css = readFileSync(resolve(root, 'styles/foundation.css'), 'utf8')
  assert.equal((css.match(/font-display: swap;/g) ?? []).length, 3)
  for (const family of ['Inter', 'Plus Jakarta Sans', 'Noto Sans Bengali']) {
    assert.ok(css.includes(`font-family: "${family}";`))
  }
  assert.match(
    css,
    /--font-sans: "Inter", "Noto Sans Bengali".*system-ui, sans-serif;/,
  )
  assert.match(css, /--font-heading: "Plus Jakarta Sans", "Inter"/)
  assert.match(
    css,
    /--font-bengali: "Noto Sans Bengali", "Nirmala UI", "Vrinda", "Noto Serif Bengali"/,
  )
  assert.match(css, /:lang\(bn\)/)
  assert.match(css, /font-variant-numeric: tabular-nums lining-nums;/)
  assert.match(css, /font-size: var\(--text-base\);\s*line-height: 1.5;/)
  for (const match of css.matchAll(/url\("\.\/([^" ]+)"\)/g)) {
    assert.equal(
      readFileSync(resolve(root, 'styles', match[1]))
        .subarray(0, 4)
        .toString(),
      'wOF2',
    )
  }
  const entry =
    app === 'storefront'
      ? 'storefront/src/app/globals.css'
      : 'admin/src/styles/globals.css'
  assert.match(
    readFileSync(resolve(root, entry), 'utf8'),
    /@import "(?:\.\.\/)+styles\/foundation\.css"/,
  )
}

export function verifyDimensions() {
  const css = readFileSync(
    resolve(process.cwd(), '../styles/foundation.css'),
    'utf8',
  )
  const dimensions = {
    spacing: 4,
    'spacing-control': 44,
    'container-storefront': 1280,
    'radius-control': 8,
    'radius-card': 12,
    'radius-dialog': 16,
  }
  for (const [name, value] of Object.entries(dimensions))
    assert.ok(css.includes(`--${name}: ${value}px;`))
  const scale = {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  }
  for (const [name, value] of Object.entries(scale))
    assert.ok(css.includes(`--text-${name}: ${value}px;`))
  // Tailwind's 4px unit yields the Design §2.4 4–64px baseline without fixed content heights.
  assert.deepEqual(
    [1, 2, 3, 4, 6, 8, 10, 12, 16].map((n) => n * dimensions.spacing),
    [4, 8, 12, 16, 24, 32, 40, 48, 64],
  )
}
