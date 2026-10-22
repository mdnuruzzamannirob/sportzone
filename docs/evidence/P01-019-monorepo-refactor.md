# P01-019 — Monorepo tooling and discovery parity

**Date:** 22 October 2026\
**Baseline:** `8979834`\
**Status:** Done — accepted by project owner on 22 October 2026

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

**Full-project recheck (22 October 2026, baseline 1019673):** The owner requested another complete review,
fix and cleanup. A fresh npm run ci passed all 21 checks preceding the browser scope. Chromium/Firefox passed 24 cases;
WebKit failed to launch because the historical /tmp wrapper no longer existed on Ubuntu 26.04. The official
WebKit 2370 bundle was restored with eight checksum-verified Ubuntu 24.04 runtime packages extracted only under
/tmp/sportzone-recheck-browser; no system package or project dependency changed. A direct engine launch and
all 12 WebKit cases then Passed with SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-recheck-browser/webkit.sh.
The security scope Passed independently. All 23 configured checks are verified across the initial and scoped
runs; the failed initial CI/browser reports are preserved instead of rewritten as a first-pass success.
Logs: /tmp/sportzone-full-recheck.log, /tmp/sportzone-recheck-webkit.log, /tmp/sportzone-recheck-security.log
and /tmp/sportzone-recheck-repository.log. Reports: test-results/ci.json (initial failure), recheck-ui-initial.json
(24 passed/12 launch failures), ui-report.json (12 passed), ci/repository.json and ci/supply-chain.json.
During review, CI planning was found to
permit removal of application smoke/backend integration entries. The planner now requires all three smoke suites
and backend integration for active workspaces. CI-28 covers all four removal attempts, and the realistic active
fixture retains the complete 23-command inventory. The final scoped repository rerun verifies the updated planner,
47 tooling cases, documentation, boundaries and formatting. No application source, package version or data changed
in this follow-up. Earlier responsive visual evidence remains applicable to unchanged frontend inputs. Live
provider/deployment/milestone gates remain Not Run or Blocked as already recorded, including EXT-04.

Environment: Linux x64, Node 24.20.0, npm 11.19.0; isolated MongoDB 8.0.16 replica sets.
Public test origins: NEXT_PUBLIC_API_ORIGIN and VITE_API_ORIGIN=https://127.0.0.1:4443.
SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-recheck-browser/webkit.sh supplies the official engine's local
library wrapper; it does not replace WebKit or suppress failures. npm_config_cache points to a writable /tmp cache.

Initial refactor verification: the full npm run ci inventory was started; after the moved theme helper failed, the failed command and remaining
inventory were resumed with node /tmp/sportzone-resume-ci.mjs, reusing unchanged passing results. All 23 configured
checks now Passed; this is a composed local verification run, not an uninterrupted first-pass or hosted CI result.

| Commands / checks | Observed result |
| --- | --- |
| npm run workspaces:check; npm run lint | Passed; locked workspace inventory and repository links/Markdown |
| npm run test:unit | Passed: 47 cases on final recheck, retaining the previous 46 and adding CI-28 |
| npm run lint:boundaries | Passed: 188 source files, no violations |
| npm run format:check | Passed on final inputs: 286 files; generated next-env.d.ts excluded |
| npm run lint --workspace=storefront; npm run typecheck --workspace=storefront; npm run test:unit --workspace=storefront; npm run build --workspace=storefront; npm run test:smoke --workspace=storefront | Passed: 7 unit/component files, 85 cases; final smoke includes new group-name/unknown-policy 404s |
| npm run lint --workspace=admin; npm run typecheck --workspace=admin; npm run test:unit --workspace=admin; npm run build --workspace=admin; npm run test:smoke --workspace=admin | Passed: 7 unit/component files, 80 cases |
| npm run lint --workspace=backend; npm run typecheck --workspace=backend; npm run test:unit --workspace=backend; npm run build --workspace=backend; npm run test:smoke --workspace=backend; npm run test:integration --workspace=backend | Passed: 343 unit/contract and 327 real MongoDB integration cases |
| npm run test:ui | Passed: 36 cases (24 initial plus 12 repaired-environment rerun) in four retained spec files across Chromium/Firefox/WebKit; six real-API customer/admin journeys, theme/keyboard/overlay and zero-violation axe checks |
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
visible clipping. Screenshots are in test-results/refactor-visual; independent owner acceptance is recorded below.

## Recovery and remaining gates

Build/deploy complete compatible artifacts and update any external direct tooling commands to the new script paths.
Root npm commands remain stable. Roll back source, manifests and lockfile together; retain all backend durable state
and reconcile uncertain external effects rather than replaying them. Backend application sources are unchanged.
Live providers, EXT-04, hosted execution, production deployment and milestone acceptance remain separate evidence gates.

## Independent review

The project owner accepted all three scopes through the popup; see the acceptance record below.

## Owner acceptance

On 22 October 2026, the project owner reviewed the full-project recheck and storefront/admin/monorepo refactors
and explicitly accepted P02-015, P02-016 and P01-019 through the popup: “Review করেছি—accept করছি, Done করো”.
This accepts these tasks and their recorded verification; it does not accept deployment, providers or milestones.
