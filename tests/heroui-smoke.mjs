import assert from 'node:assert/strict'

// Check what the HTTP client actually receives, not only source imports.
export function verifyHeroUIStyles(css) {
  for (const alias of [
    '--accent:var(--brand)',
    '--accent-foreground:var(--on-brand)',
    '--background:var(--canvas)',
    '--foreground:var(--text)',
    '--field-border:var(--control-border)',
  ]) assert.ok(css.includes(alias), `Missing deployed HeroUI token alias: ${alias}`)
  assert.match(css, /\.button\{[^}]*min-height:var\(--spacing-control\)/)
  assert.match(css, /\.button--primary\{[^}]*--button-bg:var\(--accent\)/)
  assert.match(css, /--spacing-control:44px/)
  assert.match(css, /\.button\[data-focus-visible=(?:"true"|true)\]\{[^}]*outline:2px solid var\(--focus\)/)
}
