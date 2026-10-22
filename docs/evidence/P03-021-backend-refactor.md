# P03-021 — Backend target structure and parity

**Date:** 22 October 2026\
**Status:** Done — accepted by project owner\
**Baseline:** `e13a017`\
**Scope:** Architecture §§4–6, Database §4.2 and API §2; existing backend implementation only

## Delivered organization

| Previous location / responsibility | Current owner |
| --- | --- |
| composition.ts, routes/index.ts | setup.ts and routes.ts; root wiring coordinates domain routers |
| config/environment.ts, db/connection.ts | config/env.ts and config/database.ts |
| common/, observability/, db helpers | shared/errors, middleware, database, logger and security-action classifications |
| Flat auth services/routes | credentials/, sessions/, recovery/, verification/; one auth model/validator registration |
| Auth wiring of customer/delivery/media | Root setup; auth exposes narrow customer-account/admin-access capabilities |
| products/, categories/ | catalog/products, variants and categories; canonical schema/index identities retained |
| Product/variant combined definitions | Cohesive product/variant schemas, shared catalog field helpers, one canonical registration factory |
| Media monolith / inline multipart handlers | upload, attachment, access, cleanup services; shared private context; controller owns multipart/HTTP shaping |
| integrations/cloudinary and email adapters | providers/cloudinary, antivirus and email client/schema pairs |
| Notification worker service | jobs/send-notifications.job.ts; durable claims and proof-delivery services reused |
| tools/*.mjs | scripts/*.mjs; build script clears generated dist before compiling |
| tests/*.test.ts, tests/support | tests/unit/*.test.ts and tests/helpers; integration discovery retained |

No empty future feature directories, shared UI package, repository/DI framework, dependency or infrastructure was added.
NodeNext `.js` imports, exact public routes/DTOs, environment keys, opt-in activation, opaque sessions/CSRF, current
transaction semantics, notification claims and media unknown-outcome recovery remain intact. Both frontend application
sources are untouched; their isolated API browser fixture imports the new backend setup/compiled paths.

Operator scripts intentionally retain `.mjs` to preserve direct Node invocation, flags, bounded stdin and local/test
restrictions. Paths move to `backend/scripts/`; repository callers and current runbooks are updated. No legacy tool
wrappers remain. Any external scheduler/operator command must adopt the new path before deploying this artifact.

## Executable safeguards

- Root boundary checks inspect imports, exports, dynamic imports and require, including transitive helpers/barrels.
- Negative fixtures cover nested foreign models/persistence, controller/route model access, shared→business/config,
  provider→domain runtime imports and domain→concrete provider transport. Public type-only provider contracts remain allowed.
- CI retains all six backend checks; its owner is P03-021. Unit discovery now explicitly targets tests/unit.
- Scoped Biome formatting includes backend source, tests, scripts and Vitest config using the existing pinned tool.
- Clean builds discard only generated backend/dist; development clears it before the initial watch compilation.

## Verification

Environment: Node.js 24.20.0, npm 11.19.0, Ubuntu 26.04; isolated MongoDB 8.0.16 replica sets and synthetic accounts.
HTTP/process/browser checks require loopback/process permissions outside the restricted execution sandbox.
No developer/production database, external email, media provider or payment account was used.

Baseline discovery: 15 unit files / 343 cases and 18 integration files / 327 cases, all passed before migration.

| Check | Observed result |
| --- | --- |
| Backend lint/typecheck/build | Passed |
| Backend unit/contract suite | Passed: 15 files, 343 cases; no dropped tests |
| Final replica-set integration suite | Passed: 18 files, 327 cases; transactions, races, validators, CLI and lifecycle |
| Root repository/tooling suite | Passed: 40 cases, including five new backend boundary test families |
| lint:boundaries | Passed: source graph has zero violations |
| format:check | Passed for the expanded backend/tooling scope |
| Compiled API smoke | Passed: invalid config redaction, real DB startup, protected readiness and shutdown |
| Frontend builds with synthetic HTTPS API origin | Passed for browser fixture consumption; application source unchanged |
| Real API identity browser journeys | Passed: 6 unique cases across Chromium, Firefox and WebKit (4 + 2 across affected runs); no skipped cases or automatic retries |
| Canonical AST preservation audit | Passed against baseline: 21 Schema expressions, 24 index declarations, 12 model registration expressions, 9 validator declarations |
| Repository docs/links and final diff | Passed: repository checks and git diff --check; final result recorded below |

Commands: `npm run lint`, `npm run test:unit`, `npm run lint:boundaries`, `npm run format:check`;
`npm run lint --workspace=backend`, `npm run typecheck --workspace=backend`,
`npm run build --workspace=backend`, `npm run test:unit --workspace=backend`,
`npm run test:integration --workspace=backend`, `npm run test:smoke --workspace=backend`;
frontend builds with public `https://127.0.0.1:4443` origin; `npm run test:ui -- tests/ui/authentication.spec.ts`.

The first migrated integration run found two CLI fixture invocations still using tools/ paths. Those fixture paths
were corrected; the final complete integration run passed. Default local WebKit failed to start because its Ubuntu
shared libraries were absent; this is an environment failure, not a passing or skipped browser case.
WebKit was rerun after official Ubuntu library packages were downloaded/extracted only under
`/tmp/sportzone-p03-021-browser`; a temporary wrapper launches the official Playwright MiniBrowser and clears
incompatible module paths. No system package or repository dependency was installed. Exact retry command:
`SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-p03-021-browser/webkit.sh npm run test:ui -- tests/ui/authentication.spec.ts --project webkit`.

Generated, ignored artifacts for this revision are under `test-results/p03-021/`: unit/integration/tooling/smoke
logs, the original browser matrix log (four passing cases plus the recorded initial WebKit environment failures),
final WebKit log/report and MongoDB JSON report. Historical failed attempts are not relabelled Passed.

Full hosted CI, production deployment, supply-chain scans and live providers were **Not Run** for this refactor.
Pinned dependency versions and the lockfile are unchanged; local affected checks provide no external acceptance.

## Compatibility, rollback and remaining gates

Deploy/build all backend modules together. Update worker/operator paths, drain incompatible processes and preserve
activation configuration. Roll back with the complete prior compatible artifact and its matching command paths;
do not mix generated modules, drop collections/indexes, reset quotas/claims, change credentials or replay uncertain
external effects. This refactor runs no production migration, provider activation or external financial operation.

P04-003 remains Blocked on EXT-04 approved account/policy and actual provider/scanner evidence. No milestone,
operator/provider gate or later frontend refactor is accepted by these local results.

## Owner acceptance

On 22 October 2026, the project owner reviewed the refactor and verification handoff through the popup and replied:

> Review করেছি—accept করছি, Done করো

P03-021 is Done under AGENTS §13. Acceptance covers this backend refactor and its existing parity evidence;
M1, EXT-04, production/provider gates and later frontend refactors remain separate. Closure changes documentation
only; application suites are not rerun for an acceptance-record update.
