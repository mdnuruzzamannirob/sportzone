# P01-019 — Monorepo tooling and discovery parity

**Date:** 22 October 2026\
**Baseline:** `8979834`\
**Status:** In Review — local verification passed; independent acceptance pending

## Authorized scope

Owner instruction: “now storefront, admin and monorepo ta ta fully refactor kore felo.” The batch retains sequential
per-app verification and final independent acceptance for P02-015, P02-016 and P01-019; it does not accept milestones.

## Organization and safeguards

| Previous location / responsibility | Current ownership |
| --- | --- |
| Flat root CI/security/check scripts | scripts/ci; one ordered inventory and required result |
| Flat root development coordinator/compiler | scripts/dev; process-group, signal and failure behavior retained |
| tests/ui | tests/e2e; same spec files, three engines, themes, ports and real-API fixture |
| Root shared app test contracts | tests/helpers; app-owned implementations supplied at runtime |
| Root CI/process/boundary tests | tests/tooling; stable existing case IDs plus new negative guard fixtures |
| Borrowed admin test TypeScript config | Standalone cross-app e2e config; no app configuration ownership inversion |
| Undeclared root fixture tool imports | Explicit root dev-dependency ownership at existing workspace pins; one lockfile |
| Partial formatting baseline | Root tooling/shared utilities and all adopted workspace source/tests/config; generated next-env excluded |

Boundary guards reject frontend lib→feature/app coupling, reusable component→feature/app imports, feature→app wiring,
foreign private feature imports, route→browser transport and transitive browser→api-server imports. Existing native
HeroUI, backend/private persistence, shared purity and provider/domain guards remain. CI rejects removal of the
boundary/format checks from its inventory; the single pinned hosted required job is retained.

No additional workspace, service, UI library, package manager or lockfile is introduced. Existing locked package
versions are unchanged. npm completed six bundled optional WebAssembly dependency records beneath the existing
Tailwind oxide package while synchronizing root tool ownership; those additions are not new application features.

## Verification

Environment: Linux x64, Node 24.20.0, npm 11.19.0; isolated MongoDB 8.0.16 replica sets.
Public test origins: NEXT_PUBLIC_API_ORIGIN and VITE_API_ORIGIN=https://127.0.0.1:4443.
SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-p03-021-browser/webkit.sh supplies the official engine's local
library wrapper; it does not replace WebKit or suppress failures. npm_config_cache points to a writable /tmp cache.

The full npm run ci inventory was started; after the moved theme helper failed, the failed command and remaining
inventory were resumed with node /tmp/sportzone-resume-ci.mjs, reusing unchanged passing results. All 23 configured
checks now Passed; this is a composed local verification run, not an uninterrupted first-pass or hosted CI result.

| Commands / checks | Observed result |
| --- | --- |
| npm run workspaces:check; npm run lint | Passed; locked workspace inventory and repository links/Markdown |
| npm run test:unit | Passed: 46 cases, retaining 40 and adding six negative/required-inventory guards |
| npm run lint:boundaries | Passed: 188 source files, no violations |
| npm run format:check | Passed on final inputs: 286 files; generated next-env.d.ts excluded |
| npm run lint --workspace=storefront; npm run typecheck --workspace=storefront; npm run test:unit --workspace=storefront; npm run build --workspace=storefront; npm run test:smoke --workspace=storefront | Passed: 7 unit/component files, 85 cases; final smoke includes new group-name/unknown-policy 404s |
| npm run lint --workspace=admin; npm run typecheck --workspace=admin; npm run test:unit --workspace=admin; npm run build --workspace=admin; npm run test:smoke --workspace=admin | Passed: 7 unit/component files, 80 cases |
| npm run lint --workspace=backend; npm run typecheck --workspace=backend; npm run test:unit --workspace=backend; npm run build --workspace=backend; npm run test:smoke --workspace=backend; npm run test:integration --workspace=backend | Passed: 343 unit/contract and 327 real MongoDB integration cases |
| npm run test:ui | Passed: 36 cases in four retained spec files across Chromium/Firefox/WebKit; six real-API customer/admin journeys, theme/keyboard/overlay and zero-violation axe checks |
| npm run test:security | Passed: pinned secret scanner and locked dependency audit; no exceptions added |
| npm ci --prefix /tmp/sportzone-monorepo-install --ignore-scripts --no-audit --no-fund --cache /tmp/sportzone-monorepo-npm-cache | Passed: clean isolated locked install, 328 packages |
| git diff --check | Passed |

Machine-readable results: test-results/ci.json, database.json, ui-report.json and security.json. Captured command
logs: /tmp/p01-019-ci.log, /tmp/p01-019-ci-resumed.log and /tmp/p01-019-clean-install.log. Generated artifacts
are local outputs, not approved releases. Baseline and refactored frontend case counts remain 85/80.

Moved tooling initially exposed incorrect rebasing of relative non-module literals in fixture directory creation and
the secret-snapshot path fence. Integrated smoke then caught a template-literal path in the shared theme helper;
its app-public path was corrected. These were restored to their original semantics and affected regressions rerun;
no scanner guard was weakened. Historical failed attempts are not counted as passed runs.

## Visual inspection

The executor inspected eight actual production-artifact screens: storefront home and admin login at 375/1280px,
each in light/dark mode. Layout, navigation, readable labels and native HeroUI appearance are retained without
visible clipping. Screenshots are in test-results/refactor-visual; independent owner acceptance remains pending.

## Recovery and remaining gates

Build/deploy complete compatible artifacts and update any external direct tooling commands to the new script paths.
Root npm commands remain stable. Roll back source, manifests and lockfile together; retain all backend durable state
and reconcile uncertain external effects rather than replaying them. Backend application sources are unchanged.
Live providers, EXT-04, hosted execution, production deployment and milestone acceptance remain separate evidence gates.

## Independent review

Pending owner visual/task review for all three scopes. No task is self-approved by this record.
