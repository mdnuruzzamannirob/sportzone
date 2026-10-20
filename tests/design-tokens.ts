import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..')
const css = readFileSync(resolve(root, 'styles/tokens.css'), 'utf8')
const spec = readFileSync(resolve(root, 'docs/DESIGN.md'), 'utf8')
const section = spec.split('### 2.2 ')[1].split('**Contrast')[0]
const rows = [...section.matchAll(/^\| `([^`]+)` \| `(#\w+)` \| `(#\w+)`/gm)]
const kebab = (name: string) =>
  name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
function values(block: string) {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map((m) => [
      m[1],
      m[2].toUpperCase(),
    ]),
  )
}
const light = values(css.split(':root {')[1].split('}')[0])
const systemDark = values(
  css
    .split(':root:not([data-theme="light"]):not([data-theme="dark"]) {')[1]
    .split('}')[0],
)
const dark = values(css.split(':root[data-theme="dark"] {')[1].split('}')[0])

export function verifySpecification() {
  assert.equal(rows.length, 17)
  assert.deepEqual(
    light,
    Object.fromEntries(rows.map((m) => [kebab(m[1]), m[2]])),
  )
  assert.deepEqual(
    dark,
    Object.fromEntries(rows.map((m) => [kebab(m[1]), m[3]])),
  )
  assert.deepEqual(systemDark, dark)
  assert.match(css, /@media \(prefers-color-scheme: dark\)/)
  assert.match(css, /:root \{\s*color-scheme: light;/)
  assert.match(css, /:root\[data-theme="dark"\] \{\s*color-scheme: dark;/)
}

export function verifyPalette() {
  const neutral = [
    'selected-surface',
    'text',
    'text-muted',
    'canvas',
    'surface',
    'surface-muted',
    'border',
    'control-border',
  ]
  for (const mode of [light, dark]) {
    assert.equal(mode.brand, '#2563EB')
    assert.equal(mode['on-brand'], '#FFFFFF')
    assert.equal(mode['link-accent'], mode.brand)
    for (const name of neutral) {
      const color = mode[name].slice(1)
      assert.equal(color.slice(0, 2), color.slice(2, 4), name)
      assert.equal(color.slice(2, 4), color.slice(4, 6), name)
    }
  }
}

function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)
  assert.ok(channels)
  const [r, g, b] = channels.map((x) => {
    const s = Number.parseInt(x, 16) / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
export function verifyContrast() {
  for (const mode of [light, dark]) {
    assert.ok(contrast(mode['on-brand'], mode.brand) >= 4.5)
    for (const surface of [
      'canvas',
      'surface',
      'surface-muted',
      'selected-surface',
    ]) {
      for (const text of [
        'text',
        'text-muted',
        'link-text',
        'success',
        'warning',
        'danger',
        'info-text',
      ]) {
        assert.ok(
          contrast(mode[text], mode[surface]) >= 4.5,
          `${text} on ${surface}`,
        )
      }
      assert.ok(contrast(mode.focus, mode[surface]) >= 3, `focus on ${surface}`)
      assert.ok(
        contrast(mode['control-border'], mode[surface]) >= 3,
        `control on ${surface}`,
      )
    }
  }
}

export function verifyIntegration(app: 'storefront' | 'admin') {
  const path =
    app === 'storefront'
      ? 'storefront/src/app/globals.css'
      : 'admin/src/styles/globals.css'
  const entry = readFileSync(resolve(root, path), 'utf8')
  assert.match(entry, /@import "(?:\.\.\/)+styles\/tokens\.css"/)
  assert.match(entry, /outline: 2px solid var\(--focus\)/)
  assert.match(entry, /color: var\(--link-text\)/)
  assert.match(entry, /text-decoration-color: var\(--link-accent\)/)
  assert.match(entry, /color: var\(--on-brand\)/)
  assert.doesNotMatch(entry, /#[\da-f]{3,8}\b/i)
  assert.ok(entry.indexOf('@import "tailwindcss"') < entry.indexOf('@import "@heroui/styles"'))
  assert.match(entry, /styles\/heroui\.css/)
  for (const [name] of Object.entries(light)) {
    assert.ok(css.includes(`--color-${name}: var(--${name});`), name)
  }
}
