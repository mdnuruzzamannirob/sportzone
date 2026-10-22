import assert from 'node:assert/strict'

// Verify actual delivered default library CSS, not a copied palette/font table.
export function verifyHeroUIStyles(css) {
  for (const selector of ['.button--primary', '.input', '.card', '.modal__dialog'])
    assert.ok(css.includes(selector), `Missing native HeroUI CSS: ${selector}`)
  assert.ok(css.includes('--accent:') && css.includes('--foreground:'))
  assert.doesNotMatch(css, /--brand:|--on-brand:|font-family:["'](?:Inter|Plus Jakarta Sans)/)
}
