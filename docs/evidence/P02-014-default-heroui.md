# P02-014 — Default HeroUI design system and app-owned UI boundaries

**Date:** 20 October 2026\
**Executor:** Codex\
**Status:** Done; owner-directed remaining contrast work implemented and verified

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


## Owner review corrections — 20 October 2026

Owner requested accent hover without underline for Link/Breadcrumbs, a modern flexible file picker, checkbox-consistent red invalid radios, single-line/truncated disclosure headers, and repaired fields/feedback/management previews. Implemented these refinements in app-owned UI CSS and the admin file-input facade. No custom palette, new dependencies or alternate theme controller was introduced.

Root cause of preview layout defects: the isolated Vite preview did not discover all application Tailwind classes, and its broad heading selector affected nested component headings. Each theme now explicitly scans its app source; app Biome parsers enable Tailwind directives so this CSS remains lintable. Catalogue heading styles target only the outer heading. Examples are grouped into labelled specimens with spacing; management tables retain local horizontal scrolling.

Verification on the changed scope:

- Passed: both app lint/types; showcase TypeScript/Biome; source boundaries (111 files).
- Passed: 25 affected admin management/form tests; after the final picker presentation change, the ten management cases were rerun.
- Passed: both production builds and existing smoke checks. Admin smoke initially could not bind a local server inside the sandbox (`EPERM`); rerun with local-listener permission passed. Existing admin bundle advisory remains.
- Passed: focused Chromium inspection for both apps × both themes: accent/underline hover, disclosure indicator alignment and truncation, invalid selected radio color, file selection/removal, and fields/feedback/management layout at 1280/375px. Management mobile overflow was reproduced and fixed by the source-discovery correction, then affected views rerun. Final picker visuals and keyboard access checked separately.
- Visual screenshots: local `test-results/p02-014-review/`. No new permanent test matrix was added. Existing necessary state, policy, focus, theme, boundary and security tests remain; obsolete custom-token/font tests and duplicate galleries were already removed in the migration. Removed empty UI classes and stale JSX spacing; no unrelated files were deleted merely to reduce file count.
- Full CI, other engines and a new broad accessibility audit: Not Run for this localized correction. Earlier stock-palette contrast findings remain open; these changes do not certify WCAG compliance.

Status remains In Review pending owner review; no checkbox or milestone accepted.


### Owner acceptance of review corrections

On 20 October 2026, the owner explicitly accepted the listed UI corrections through the review popup: “এই সংশোধনগুলো accept করছি”. This accepts Link/Breadcrumb hover, the modern file picker, invalid radio styling, disclosure truncation and repaired preview layouts. It does not resolve the previously disclosed native-palette contrast findings or accept a milestone. P02-014 remains In Review until its remaining acceptance conditions are satisfied.


## Final task acceptance

On 20 October 2026, after accepting the listed corrections and receiving the contrast disclosure, the owner explicitly instructed “done koro”. P02-014 is Done for the implemented design-system/UI scope. Earlier In Review statements above describe the pre-acceptance state.

Open contrast findings are carried forward to P10-006, with the existing unsuppressed accessibility checks retained. This is the disposition of those findings, not a claim that they passed or permission to waive PRD §12.7. Milestone and release acceptance remain unchanged. No code or test execution was required for this status-only update; repository documentation/link checks were run.


## Contrast correction and verified completion

The owner clarified that “done koro” meant implement the outstanding work before marking Done. The earlier status-only closure and carry-forward disposition were premature; this section supersedes those current-status claims. The historical failed audit above is retained as evidence of the original defects.

Implemented the smallest correction in both app UI theme entries: primary/danger filled actions retain native hues/foregrounds/APIs, but their local `--button-bg` variables mix the native color with black (82% native at rest, 75% hover, 70% pressed). Global HeroUI tokens, sizes, fonts and component APIs remain unchanged. The storefront footer uses native foreground text rather than insufficient-contrast muted text. Design §2 records this limited contrast refinement.

Verification, local Node 24.20.0 / npm 11.19.0:

- `npm run build --workspace storefront` and `npm run build --workspace admin`: Passed; both include type checking. Existing admin chunk-size advisory remains.
- `npm run test:smoke --workspace storefront` and corresponding admin command: Passed (four storefront groups, two admin groups).
- `npm run lint --workspace storefront` and corresponding admin command: Passed.
- `npm run test:ui -- --project=chromium tests/ui/accessibility.spec.ts`: Passed all four previously failing cases. Sixteen page/viewport scans across actual app shells and initial Button preview, both apps, both themes, 375/1280px: zero axe violations. No contrast rules disabled, no exceptions added. An initial invocation could not reserve the already-running preview port; stopped that preview temporarily, reran successfully, then restored it.
- [Final raw accessibility report](../../test-results/p02-014-contrast/accessibility-final.json) preserves the actual scan attachments. Earlier reports remain historical failures.
- Documentation checks and diff whitespace: Passed. Full CI, Firefox/WebKit and backend/unit reruns: Not Run; no behavioral/API/backend changes. A passing scoped automated audit does not certify every component or full WCAG compliance; manual feature/release verification remains with P10-006.

Known P02-014 contrast defects are now resolved in the scanned scope; no known finding from that report is deferred merely to close the task. P02-014 is Done in fulfillment of the owner’s explicit instruction to finish the remaining work. No milestone/release gate is self-approved.
