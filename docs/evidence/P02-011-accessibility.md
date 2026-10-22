# P02-011 — Responsive and accessibility foundation audit

**Date:** 18 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner, 18 October 2026 — “Foundation audit গ্রহণ করছি”

## Scope

[Task](../TASKS.md#phase-02--uiux-design), [Design §§3,12,14](../DESIGN.md) and [Testing §14](../TESTING.md#14-accessibility-responsiveness--compatibility) govern this audit. All five prerequisite tasks are independently accepted.

The audit examines the built storefront home, built public admin login and a test-only fixture of real admin shell, management, form and commerce components. Synthetic examples stay outside production route trees. No authorization or business/API/database contract changes.

## Matrix and checks

| Area | Audit coverage |
| --- | --- |
| Engines | Playwright Chromium 156.0.8078.4, Firefox 157.0 and WebKit 27.2 on Linux; engine versions recorded in report annotations |
| Viewports | 320 × 900, 768 × 900 and 1440 × 900 CSS pixels; both explicit themes on all three surfaces |
| Keyboard | Native Tab/Enter skip link, main focus, ArrowRight table scrolling, confirmation focus containment, Escape and trigger restoration, mobile menu recovery |
| Forms and files | Controlled draft survives theme change; reason survives dismissal/reopen; local raster selection/preview/removal; linked fields and rejection messaging |
| Theme | Light/Dark persistence after reload; System follows OS emulation; URL and current draft preserved |
| Motion | Emulated reduced motion; computed skeleton animation duration at most 0.01 ms |
| Contrast/semantics | Full axe scans with WCAG 2/2.1/2.2 A/AA tags, including open confirmation; no rule suppression or allowed violations |
| Visual review | Generated Chromium screenshots inspected: mobile storefront dark, mobile admin login light, mobile fixture light and desktop fixture dark; Bengali specimen and BDT visible |

Thirty browser cases yield 54 surface/viewport scans plus six open-confirmation and six open-drawer scans. Each viewport scan attaches its full axe result and screenshot. Structural assertions complement visual review; they do not establish every assistive-technology experience.

## Execution

| Check | Result |
| --- | --- |
| Final `SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-browser-libs/webkit.sh npm run ci` | Passed; 14 commands, 223 unit/component tests, 30 browser cases, both production builds and six HTTP smoke groups |
| Browser findings | Passed; all 54 attached viewport scans have zero axe violations; open confirmation/drawer assertions passed across all engines/themes |
| CI run | 2026-10-18T11:48:48.207Z to 2026-10-18T11:51:21.755Z; local run, hosted GitHub execution Not Run |
| Standalone fixture/config TypeScript | Passed |
| Actual Chrome/Edge/Brave/Safari, physical touch devices, screen readers, native OS picker and browser zoom UI | Not Run; retain in feature/release verification, particularly P10-006 |

Generated reports: `test-results/ci.json`, `test-results/ui-report.json` and `test-results/ui/`. Reports are Git-ignored artifacts; CI preserves them. No synthetic financial/provider/authentication result is represented as accepted functionality.

## Findings and resolutions

| Finding | Resolution |
| --- | --- |
| Cancel/close controls inherited HeroUI default accessible name "Close" while showing "Cancel" / "Close menu" | Explicit matching labels in both apps’ form dialogs/drawers and admin mobile drawer; shared component regressions and open-overlay axe scans retain coverage |
| WebKit/axe reported inherited commerce money text as black despite computed foreground being white | Made Price and OrderSummary foregrounds explicit with the existing semantic text token; focused WebKit dark audit passes without disabling contrast checks |
| Isolated fixture initially lacked utilities for imported components | Added explicit Tailwind source discovery in fixture CSS; production CSS was unaffected |
| Firefox serialized a tiny animation duration differently | Compare numeric duration, preserving the same reduced-motion limit |
| Local WebKit lacked system libraries and inherited incompatible Snap GTK/GIO modules | Libraries extracted under `/tmp/sportzone-browser-libs/`; a temporary wrapper supplies official WebKit binary/bundle paths and clears Snap module paths. No installed system package, credential or production application was changed |
| Browser inventory via computer-use API was empty | Audited through locally installed Playwright engines; no claim of interactive computer-use verification |

The portable default uses Playwright-managed engines. CI installs engines and OS dependencies with `npx playwright install --with-deps chromium firefox webkit`. On this machine, execution uses `SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-browser-libs/webkit.sh`; the config accepts this optional test-only executable override. The temporary wrapper executes the official downloaded MiniBrowser with its bundle paths plus extracted libraries, and unsets `GTK_PATH`, `GIO_MODULE_DIR` and `GDK_PIXBUF_MODULE_FILE`. Recreate machine-specific setup if `/tmp` is cleared; the wrapper is not a committed dependency or a production setting.

## Acceptance boundary

The project owner independently accepted this foundation audit on 18 October 2026 under Tasks §2 and AGENTS §13. This foundation audit does not accept M1, complete product flows, full WCAG certification or all PRD browser/device combinations. Feature tasks and P10-006 retain real journey, screen-reader and supported-device evidence. Unavailable release checks are not silently treated as passed.

## References

- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)
- [Browser audit configuration](../../tests/e2e/playwright.config.mts)
- [Browser assertions](../../tests/e2e/foundation.spec.ts)

## Verified source revisions

SHA-256 values identify the audited source, separate from independent acceptance.

| File | SHA-256 |
| --- | --- |
| `tests/ui/foundation.spec.ts` | `f0e3a6e6cb1313f2bbffdf3fe379e70432e4175f07f8d2ad971aa1fba134a478` |
| `tests/ui/playwright.config.mts` | `cd9cd92a588589b6c2b3a58b399ced329adffc53bdd1107421dea73a222da704` |
| `tests/ui/fixture.tsx` | `4881da9d01c8a80e1bbbaa788e934472871740a955a4d7129de1f378b87e4657` |
| `package-lock.json` | `c5f6a472c2f324feefbce4943a93dbba18654c6f159097da708c50e95f275c07` |
