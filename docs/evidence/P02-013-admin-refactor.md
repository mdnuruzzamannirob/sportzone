# P02-013 — Admin composition, layouts and feature placement

**Date:** 20 October 2026\
**Executor:** Codex\
**Status:** Done; independently reviewed and accepted by the project owner on 20 October 2026

## Scope and prerequisites

The owner requested the next task after accepting P02-012. P01-015 and P02-011 are accepted prerequisites. Architecture §§4–5, Implementation Plan §3.6, Design and Testing §§14,15.5 govern this bounded admin refactor. No API, database schema, backend permission, dependency, environment or deployment change. API private-cache and server authorization contracts remain authoritative; UI layout/route guards do not grant access.

## Path and behavior inventory

| Previous path/responsibility | Current placement |
| --- | --- |
| `admin/src/app/routes.tsx` | `app/router.tsx`, a declarative route tree with lazy auth access boundary |
| BrowserRouter in `main.tsx` | `app/providers.tsx`, consumed under the existing StrictMode |
| Public layout, sign-in placeholder and 404 inside route tree | `components/layout/public-layout.tsx`, `features/auth/pages/sign-in-unavailable.tsx`, `components/layout/not-found.tsx` |
| `components/admin/admin-shell.tsx`, `navigation.ts` | `components/layout/`, preserving navigation, drawer, offline status and theme behavior |
| `components/admin/admin-access-boundary.tsx` | `features/auth/components/admin-access-boundary.tsx`, retaining unavailable/denied presentation for every `/app/*` path |
| Root theme preference control | `components/ui/theme-preference.tsx` |
| `admin/src/styles.css` | `admin/src/styles/globals.css`; relative shared-style imports and both-app test helpers/fixture updated together |
| Inline lazy fallback | `components/layout/admin-loading.tsx`, same live status and single main landmark |

Added `app/route-error-boundary.tsx` to catch route render/lazy-chunk failures with a safe alert and actual page reload recovery. It renders no exception detail, form or management data. Browser fault injection verifies pending → safe failure → reload → access-unavailable state. No fake session verification, query client or speculative feature files were added. Management/UI compositions, canonical routes, no-store/noindex preview headers and existing theme bootstrap remain in place.

Vitest discovery and CI scripts/inventory remain unchanged; all moved consumers, token/font checks and the cross-app browser fixture now reference the actual paths.

## Verification

Local Linux, Node v24.20.0, npm 11.19.0. Working-tree changes over `1248ce0`. Production Vite build and local preview; synthetic denied contexts with forged local flags, no live backend/provider integration. No commit, push, hosted CI or deployment performed for this slice.

| Check | Observed result |
| --- | --- |
| `npm run lint --workspace admin` | Passed; 34 files |
| `npm run typecheck --workspace admin` | Passed |
| `npm run test:unit --workspace admin` | Passed; 7 files, 99 tests; includes safe render failure and loading semantics |
| `npm run test:unit --workspace storefront -- tests/tokens.test.tsx tests/foundation.test.tsx` | Passed; 2 files, 23 tests for shared helper consumers |
| `npm run build --workspace admin` | Passed; lazy access-boundary chunk retained. A final router whitespace cleanup produced identical JS/CSS bundle names/hashes |
| `npm run test:smoke --workspace admin` | Passed; 20 SPA URLs, no-store/noindex headers, compiled JS/CSS, fonts and theme bootstrap |
| `SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-ci-browser-vq3gIQ/webkit.sh npm run test:ui -- --grep 'admin refactor'` | Passed; 24 cases, zero skipped/flaky/failed, 96.8 seconds |
| `SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-ci-browser-vq3gIQ/webkit.sh npm run test:ui -- --grep 'public shells\|native keyboard\|theme persistence\|storefront refactor'` | Passed after helper correction; 48 affected cases, zero skipped/flaky/failed, 2.8 minutes |
| `npm run lint:boundaries` | Passed; 104 source files, zero errors |
| `npm run format:check` | Passed; existing four-file baseline |
| `npm run lint` / `git diff --check` | Passed after updating four stale source links in Design and P02-007 evidence; historical hashes/acceptance preserved |

Admin browser run: 20 October 2026, 18:04:41–18:06:18 Asia/Dhaka. Chromium, Firefox and WebKit × light/dark × 320/768/1440 CSS pixels. Eighteen route-matrix cases check login redirect, unavailable sign-in, nested order/product/delivery links, unknown route recovery, forged local flags, no forms/data exposure, drawer/sidebar navigation, skip/main focus, Escape restoration, stored theme after reload and no horizontal overflow. Six additional cases intercept the real lazy JS request to assert pending status, chunk-load rejection, safe error alert and successful actual reload recovery. Ninety-six axe scans across these cases passed with zero violations and no suppressed rules.

Executor visual review: inspected Chromium delivery-settings denied screen at light 1440px and dark 320px. Sidebar selection, breadcrumb, title/actions, theme control, card, spacing and mobile wrapping remain readable with no clipping. This is separate from automated axe and owner acceptance.

Artifacts (Git-ignored local outputs): `test-results/p02-013/admin-refactor-report.json`, `test-results/p02-013/admin-light-1440.png`, `test-results/p02-013/admin-dark-320.png`. The first report preserves the route/fault-injection run before the shared fixture audit overwrites the standard browser-report path.

The additional foundation run encountered a Chromium dark-1440px fixture timeout, reproduced in a focused unchanged-case rerun. Trace inspection located the unfinished call in the existing `settleTransitions` helper waiting for a running CSS transition’s `finished` promise; the application had rendered. Corrected only the test helper to finish running finite CSS transitions at their actual endpoint before auditing final colors/positions, retaining paused/repeating/loading animations, contrast rules, the original timeout and all assertions. Application styles/motion are unchanged. Since the helper is also consumed by P02-012 route checks, all 48 affected foundation/storefront cases are included in correction verification; the final run passed all 48 cases. The initial broad run failed 1/30, and the unchanged focused rerun also failed; neither is described as passing. Original failures are preserved in `test-results/p02-013/foundation-report.json`, `foundation-timeout/`, `foundation-rerun-timeout-report.json` and `foundation-rerun-timeout/`.

Build and local server/browser checks ran with reviewed local execution permissions because the sandbox restricts subprocess/listener behavior. WebKit reused the already provisioned host wrapper; no package or browser-library installation. Vite reports a 501.73 kB entry-chunk advisory; build succeeds and the auth access boundary remains lazy. Bundle optimization is outside this structural slice.

Not Run: full repository CI, unchanged backend suites, hosted CI, real administrator sign-in, provider integration, production hosting, real devices and screen readers. Change-based checks follow Testing §15.5.

## Recovery and acceptance

Recover using the previous compatible admin build/source revision; no migration or external effect. Independent review and popup acceptance are recorded below. M1 and backend/feature gates are unchanged. Local mock/denied screens do not establish operational administrator sign-in or server authorization acceptance.

## Final review handoff

Implementation and all selected checks are complete: 99 admin and 23 shared-helper consumer unit/component tests; 24 admin browser cases plus 48 corrected-helper consumer browser cases. Final corrected-helper report: `test-results/p02-013/foundation-final-report.json`. Source diff reviewed for unrelated changes, import parity, cache/access claims, exception disclosure and cleanup. No unresolved test failure remains after correction. Task status is In Review with checkbox unchecked pending the owner’s requested review popup. Phase 02: 12 Done, 1 In Review; overall: 43 Done, 1 In Review, 134 Not Started. This handoff accepts no milestone.

## Owner acceptance

On 20 October 2026, the project owner selected “Review করেছি—accept করছি, Done করো” in the P02-013 review popup after the final implementation/verification handoff. Recorded In Review → Done and checked the task checkbox. Phase 02: 13/13 Done; overall: 44 Done, 134 Not Started. The preceding In Review handoff remains historical. M1 and other milestone gates remain unaccepted. This acceptance update changes documentation only and reuses the recorded verification evidence.
