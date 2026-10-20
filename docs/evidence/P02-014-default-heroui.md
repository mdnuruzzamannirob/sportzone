# P02-014 — Default HeroUI design system and app-owned UI boundaries

**Date:** 20 October 2026\
**Executor:** Codex\
**Status:** In Review; owner review and accessibility disposition pending

## Owner decision and authority

The owner explicitly requested the default HeroUI design system and exact native components in both frontends, including colors/fonts/styles/themes; all HeroUI usage through app-owned `components/ui/`; one preview HTML with Admin/Storefront and Light/Dark controls; and cleanup of unnecessary design tests and obsolete code. This supersedes the earlier custom palette/font/size policy and separate native/app galleries. It authorizes this reversible visual/organizational change, not changes to commerce, authentication, money, PRD accessibility targets or milestone acceptance.

Design §2 and AGENTS §7 record the new policy. P02-014 is added without reopening or rewriting prior task acceptances. API/Database contracts are unchanged.

## Research

Primary references consulted:

- [HeroUI theming](https://heroui.com/en/docs/react/getting-started/theming): native CSS semantic variables, Tailwind v4 layering and light/dark theme attributes.
- [HeroUI styling](https://heroui.com/en/docs/react/getting-started/styling): app wrappers can centralize changes without a separate component skin.
- [HeroUI dark mode](https://heroui.com/en/docs/react/getting-started/dark-mode): native themes respond to explicit root theme attributes; keep one controller.
- Installed `@heroui/react` / `@heroui/styles` 3.2.6 declarations, variant metadata, default theme variables and component source. These govern actual APIs when current web documentation differs.

Findings: the default system supplies colors, dimensions, radii, variants and motion; Tailwind supplies the default system font stack. There is no need for three webfonts or a second token table. Compound/generic components must retain their original statics and type inference; app facades preserve those APIs rather than reimplementing them. Existing browser preference storage/bootstrap can be retained, but System must now resolve to a concrete native light/dark attribute because the removed custom CSS previously provided media-driven fallback.

## Implementation

- Each app owns `components/ui/primitives.tsx`, `index.ts`, `theme.css`, `theme.ts` and existing behavior/navigation compositions. HeroUI imports outside the UI directory are rejected by the parsed source-boundary check.
- Thin native facades preserve compound/generic APIs. Button retains its full native variant/size/ref API, adding only optional pending copy. Framework Link adapters preserve routing. Inputs/alerts/dialogs retain native styles and essential validation/focus/pending behavior.
- App global styles only forward to `ui/theme.css`. Custom palette, font assets, forced dimensions/radii and adapter CSS are removed; default HeroUI/Tailwind styles are authoritative.
- One theme controller retains `sportzone.theme`, same-origin synchronization, blocked-storage fallback, pre-hydration bootstrap, resolved System changes and cleanup.
- One local `showcase.html` loads the selected app UI facade and its theme CSS. Admin/Storefront and Light/Dark controls use actual app modules; app reload selects one CSS entry so future app themes do not leak. Source is organized into a thin bootstrap, native catalogue and app composition examples.
- Obsolete copied-palette/font/radius tests and emitted-font hash assertions are removed. BDT exactness/invalid-input assertions are retained under `format-bdt.test.tsx`. Identical jsdom state cases no longer repeat per CSS theme; browser tests cover themes instead. Core behavioral, accessibility, financial/security, route/cache and failure-state checks remain.
- Duplicate old native/app HTML galleries and test fixture are removed. Browser tests consolidate repeated refactor/viewport matrices into current UI/app behavior and an explicit unsuppressed accessibility gate. Existing required CI check names and three-engine release matrix remain intact.

## Verification

Environment: local Node 24.20.0/npm 11.19.0, installed HeroUI 3.2.6, built frontend apps and Playwright Chromium. Results reuse unchanged inputs after localized fixes.

| Command/check | Observed result |
| --- | --- |
| `npm run test:unit --workspace storefront` | Passed: 73 cases, six files |
| `npm run test:unit --workspace admin` then `npm run test:unit --workspace admin -- tests/theme.test.tsx tests/form-primitives.test.tsx` | Initial 64/68 passed; four outdated assertions fixed; affected 28 cases passed on rerun. Unchanged remaining results retained. |
| `npm run lint --workspace storefront`; `npm run typecheck --workspace storefront`; corresponding `--workspace admin` commands | Passed both apps |
| `npm run build --workspace storefront`; `npm run test:smoke --workspace storefront`; corresponding admin commands | Passed; native delivered CSS and absence of retired font assets checked. Admin retains a bundle-size advisory above 500 kB. |
| `npm run lint:boundaries` | Passed: 110 source files, zero violations |
| `node --test --test-isolation=none --test-name-pattern='TOOL-0[1-5]\|UI-BOUNDARY' tests/tooling.test.mjs` | Passed six boundary fixtures, including forbidden direct feature imports |
| `npm run test:ui -- --project chromium --grep 'actual UI preview\|live application shells'` | Initial two actual-shell cases passed; four preview cases exposed a test seed resetting storage on each navigation. Corrected only the seed to initialize absent storage. |
| `npm run test:ui -- --project=chromium tests/ui/foundation.spec.ts` | Passed all four app × theme preview cases after the seed correction. Actual families, keyboard overlays/focus/drafts, app/theme switch and mobile overflow checked. |
| `npm run test:ui -- --project=chromium tests/ui/accessibility.spec.ts` | Failed four cases: color contrast only across 16 page/viewport scans; no rules suppressed. |
| Showcase TypeScript and Biome lint; `npm run lint`; `npm run format:check`; `git diff --check` | Passed; documentation checker: 305 files, 1129 local links, zero errors at verification |
| Full CI, Firefox/WebKit, backend suites, hosted checks/deployment | Not Run: outside this scoped local verification; all three browser engines remain configured for integration/release. |

Raw local artifacts: [initial functional report](../../test-results/p02-014/functional-initial.json), [four final preview passes](../../test-results/p02-014/functional-final.json), [accessibility report](../../test-results/p02-014/accessibility.json), [concise contrast findings](../../test-results/p02-014/accessibility-summary.json). Generated artifacts are local, not committed acceptance records. The alternate positional `--project chromium tests/...` invocation was rejected by Playwright argument parsing; corrected to `--project=chromium` above.

Visual artifacts: [storefront light desktop](../../test-results/p02-014/storefront-light-desktop.png), [storefront dark desktop](../../test-results/p02-014/storefront-dark-desktop.png), [admin light mobile](../../test-results/p02-014/admin-light-mobile.png), [admin dark mobile](../../test-results/p02-014/admin-dark-mobile.png). These support visual inspection, not owner acceptance.

Preview: run `npm run ui:showcase`, then open `http://127.0.0.1:5180/showcase.html`. One HTML entry loads the selected app’s UI and theme; the header switches app and light/dark mode.

## Accessibility and recovery

Current audit confirms native stock palette contrast findings under PRD §12.7. Each preview’s initial Button catalogue has nine failing enabled text nodes in each theme at both widths (375 and 1280). Example dark primary button: `#fcfcfc` on `#0485f7`, 3.58:1 against the 4.5:1 text requirement. The storefront light shell additionally has one muted-text node (`#71717a` on `#f5f5f5`, 4.43:1); storefront dark and both admin login themes have no automated violations in these scans. Other catalogue families are functionally rendered but have not each received an axe scan. No claim of comprehensive WCAG compliance is made.

Disposition: findings remain open; keep P02-014 In Review. A follow-up owner decision is required before altering native palette colors to resolve contrast while preserving the desired design. This does not authorize hiding findings or weakening PRD acceptance. The zero-violation axe gate is retained; do not suppress contrast, claim automatic accessibility or accept a milestone based on library defaults. Report design/functional review separately from release accessibility.

Code/style rollback uses the prior compatible frontend build; no database migration or external financial effect. Owner acceptance is requested after implementation/evidence. No task checkbox or milestone is self-approved.
