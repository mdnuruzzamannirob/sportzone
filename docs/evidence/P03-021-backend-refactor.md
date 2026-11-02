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

## P03-024 — WP00 follow-up baseline, 3 November 2026

This section is a new refactor-baseline task, not a revision of P03-021's historical acceptance above.
The owner authorized the [whole-backend refactor plan](../BACKEND_REFACTOR_PLAN.md) and instructed execution
of its first work package. P03-024 covers WP00 only: inventory, impact mapping and selected baseline
verification. No feature, runtime, schema, route, test, script or generated API artifact was changed.

### Revision, environment and artifacts

- Input/runtime revision: `02cb436284007020ba7d3734b455e66c637cab68`.
- Node `v24.20.0`, npm `11.19.0`, existing Linux workspace; no provider account or external DB used.
- Existing staged changes to Changelog, Implementation Plan and the new refactor plan were retained.
- Foundation P01-024 is Done with recorded owner acceptance; existing P03-023 is Done. P03-022 remains
  In Progress with its independent/external prerequisites; no application or milestone acceptance inferred.
- Backend fingerprint: SHA-256 `3461d13a592a94fe095c1db22944db8f41ead223ea84cd16b6f641a70d663c99`.
  Input is every inventoried backend path sorted lexically, followed by NUL, file bytes and NUL.
  Documentation and ignored build/test output are excluded; this identifies the inspected runtime inputs.

Local generated artifacts, deliberately outside tracked source/tooling:

- [Complete per-file/import/export/persistence/operation inventory](../../test-results/backend-refactor/wp00-inventory.json).
- [Baseline counts, dependency components and candidate paths](../../test-results/backend-refactor/wp00-summary.json).
- [Observed check results and scope](../../test-results/backend-refactor/wp00-checks.json).
- [One-off inventory analyzer](../../test-results/backend-refactor/sportzone-wp00-inventory.mjs) and
  [scan output](../../test-results/backend-refactor/wp00-scan.log); not a new project framework or test suite.

The analyzer uses the installed TypeScript AST parser. Each backend file has current/target path,
package assignment, content hash, direct consumers and affected module owners. It records import and
export declarations, function/method scopes, literal route calls, imported-call sites and canonical
persistence expressions. Emitted `dist` imports are mapped back to source for consumer impact only.
Related repository paths and hashes cover configuration, CI, development tooling and browser fixtures.

To reproduce at a later revision, regenerate the local metadata from repository root before running
the analyzer; regenerated results describe that revision, not this immutable input fingerprint:

```sh
git ls-files --cached --others --exclude-standard -z > test-results/backend-refactor/wp00-paths
git rev-parse HEAD > test-results/backend-refactor/wp00-revision
npm --version > test-results/backend-refactor/wp00-npm
node test-results/backend-refactor/sportzone-wp00-inventory.mjs
```

An initial analyzer attempt used nested synchronous child processes and returned sandbox `EPERM`.
Metadata was instead collected with the allowed shell commands above; the completed scan exited 0.
No permissions, project dependencies or runtime implementation were changed to run the inventory.

### Complete area and ownership coverage

| Backend area | Observed inventory | Disposition |
| --- | ---: | --- |
| `src/` | 319 files | Owner/package and current-to-target mapping for every path. |
| `tests/` | 113 files | 51 unit suites, 52 integration suites, one contract suite plus its fixture, five helpers, two fixtures and smoke entry. |
| `scripts/` | 41 files | All bootstrap, activation, migration, provisioning, development, qualification, worker and runtime entries retained in the inventory. |
| `contracts/` | 4 files | Registry, local registry, independent local-operation list and generator; source-schema imports recorded. |
| `api/` | 4 files | OpenAPI, planned-operation inventory, Postman collection/environment; all four freshness-checked. |
| Backend root configuration/packaging | 10 files | Package/Biome, three TypeScript configs, three Vitest configs, Dockerfile and context allowlist. |
| **Total backend** | **491 files** | No unassigned area; review-in-place does not mean mandatory rewrite. |

Current module file counts and package ownership:

| Current owner | Files | Target / owning package |
| --- | ---: | --- |
| auth | 41 | Keep five auth subfeatures; private identity/security capabilities — WP04. |
| customers | 4 | Profile/privacy/administration through auth-owned identity operations — WP04. |
| health | 2 | Move to `src/health/`, preserve URLs/readiness behavior — WP04. |
| delivery | 6 | Pilot owner, existing coverage/charge persistence — WP03. |
| audit | 5 | Durable append/query capabilities — WP05. |
| notifications | 11 | Intent/template/delivery interfaces — WP05; final worker parity WP14. |
| media | 14 | Preserve meaningful upload/access/reference/cleanup services — WP05. |
| catalog | 21 | Product-owned variants, sibling categories — WP06. |
| inventory | 10 | Preserve sole stock-write capability — WP06. |
| promotions | 11 | Coupon eligibility/holds/quota and deterministic allocation — WP07. |
| cart | 10 | Five cart files stay; five wishlist files move to `modules/wishlist/` — WP07. |
| checkout | 17 | Participant boundaries WP08, placement coordination WP09. |
| orders | 23 | Participant boundaries WP08, lifecycle coordination WP09. |
| payments | 37 | Attempts/collections; shared aggregate stays at parent — WP08/WP10. |
| returns | 11 | Claims/physical inspection/disposition — WP11. |
| refunds | 24 | Obligations/payouts; shared aggregate/assembly stays at parent — WP08/WP11. |
| reviews | 6 | Purchase qualification/moderation — WP12. |
| settings | 11 | Store/policy content, narrowly exposed configuration — WP12. |
| support | 6 | Complaint scope/correspondence — WP12. |
| reports | 4 | Keep existing name; owner-provided bounded projections — WP12. |

The 60 candidate responsibility moves have no target filename collisions. They include selected
wishlist/health/variant/financial subfeature placements; mixed files and shared parent aggregates need
operation-level review before moving. No speculative public/controller/composition files were created.
The remaining source paths are assigned to technical foundation, provider/root wiring or workers.

Thirty-eight related repository paths were inventoried. Eleven contain direct backend path/command
references: container workflow, root package, Render config, CI affected/boundary/container tooling,
development backend/start tools, `tests/e2e/auth-server.mjs` and two tooling suites. Additional indirect
consumers include `ci-workspaces.json`, CI workflow/runner and sanitized environment templates.
The browser fixture imports compiled auth/models/setup/app directly: retain compatibility or update
and verify its affected consumer when those paths change; do not start a frontend refactor.

### Routes, activation, entry points and persistence

- Generated registry: 170 business HTTP operations; 40 route-owning files. The 422 static router calls
  include middleware/mounts/transport and dynamic declarations and are not 422 distinct public operations.
- Existing router parity tests compare actual Express registrations, including HEAD/OPTIONS behavior,
  to the independent registry; missing/duplicate/undeclared operations and omitted route fixtures are checked.
- Every operation's method/path/status/security and activation metadata is retained in the inventory.
  Forty distinct activation descriptions include auth feature flags, protected local/test operations,
  provider/callback admission and always-registered public/health surfaces. Sixty-three operations share
  the explicit local/test-only composition description. Registration is not hosted availability.
- Build uses TypeScript `src → dist`; contract tooling compiles to `.cache/contracts`. Existing discovery:
  `tests/unit/**/*.test.ts`, `tests/integration/**/*.test.ts`, `tests/contracts/**/*.test.ts`.
- HTTP lifecycle is `server → setup → app/routes`; worker/operator scripts are independent `.mjs`
  entries importing compiled domain/setup/job capabilities. The inventory includes all 41 script names/imports.
- Four job files: reservation expiry, payment reconciliation, refund reconciliation and media maintenance.
  Notification delivery uses its existing worker script and `composeNotificationWorker`; do not invent a
  missing notification `.job.ts` just to make a symmetric tree.
- Container runtime copies notification, expiry, payment/refund reconciliation, media maintenance, health
  and staging catalog/inventory scripts plus compiled `dist`; Docker context allowlist and CI image checks
  must move with imports. Render currently selects free hosting and disabled protected capabilities.
- Source has 28 model files with 38 canonical named model registrations, plus raw `authRateLimits` storage:
  **39 distinct source-defined collection names**, not a claim that all exist in a deployed database.
- Fingerprints cover 112 Schema expressions (including embedded schemas), 117 schema-index call sites,
  nine raw index-operation sites, 47 validator variable initializers and 45 BSON-schema expression sites.
  These are AST counts, not unique deployed index counts. The 71 `.model()` call sites include model
  lookups as well as the 38 registration calls; no duplicate canonical model is inferred from call count.

### Dependency and workflow impact

The runtime source file-import graph has no strongly connected component. Including type-only edges
reveals one two-file component: `refund-recovery.service.ts` imports the reservation factory's type,
while `refund-reservation.service.ts` imports `RefundNotifier` from recovery. WP01/WP11 should extract
the stable semantic contracts without treating this as an observed runtime recursion.

At aggregated module level, ten owners are mutually reachable through different files: auth, catalog,
checkout, customers, inventory, orders, payments, promotions, refunds and settings. This is coupling
evidence, not proof that individual requests execute circularly. The artifact lists concrete import
and imported-call sites; dynamically injected methods require the operation-level review in WP08.
There are no unresolved backend relative source/compiled-import mappings in the scanned inventory.

| Existing workflow / entry | Participants and current transaction boundary | Refactor impact |
| --- | --- | --- |
| Checkout intent/completion | Auth-owned scope passes one session into intent, order creation, stock/coupon allocation, payment preparation and outbox. | Keep coordinator checkout-owned; do not construct all participants inside the domain operation. |
| Cancellation | `cancellationService` receives auth scope/admin capability, checkout allocation callback, payment capability and optional refund callback. | Replace deep factory-derived contracts; later lifecycle must not depend on placement internals. |
| Fulfillment | Order lifecycle receives allocation/funding/deadline capabilities; stock/coupon helpers currently live under checkout. | Separate participant rules from checkout placement without moving transaction authority accidentally. |
| Verified collection / settlement | Receipt processing independently preserves money, uses injected order/allocation capabilities; late recovery opens its own guarded transaction. | Preserve the receipt/recovery split; do not merge into one rollback that can discard received funds. |
| Return/shortage | Scoped return operations and admin physical operations share canonical unit guards, evidence and inventory/refund participants. | Preserve transaction session, physical-vs-missing distinction and replay identity. |
| Refund reservation | Admin/current-scope callbacks join source funding, order/unit and claim capabilities, obligations/attempts/audit/outbox. | Extract obligation contracts before payout code moves; preserve pending capacity. |
| Payout/recovery | Durable intent precedes external dispatch; outcome recovery uses funding/unit capabilities and guarded settlement. | Keep external calls outside transactions and uncertain outcomes recoverable. |
| Expiry/reconciliation workers | Leases/cursors and guarded transactions invoke existing domain services. | Preserve fencing/checkpoints and script-to-compiled-entry compatibility. |

### Findings and disposition

| Finding | Exact source / risk | Follow-up |
| --- | --- | --- |
| Collection inventory understates source-defined storage | Database §3.1 says 38 and omits `paymentInitiations`; Database §8.5 and §11.1 already specify it, and payment-initiation persistence bootstraps it. The raw auth quota store makes 39 source-defined names. | WP01 reconcile the inventory/count; do not add/drop a collection or run a migration. |
| Type-only refund dependency component | Recovery uses `Parameters<typeof refundReservationService>`; reservation uses recovery's `RefundNotifier`. | WP01 public-contract rules and WP11 semantic type placement. No runtime failure claimed. |
| Stale activation prose may mislead clients | Contract registry checkout activation still says COD-only/pending Phase 07, while checkout completion handles online drafts and payment preparation. Fresh generation cannot prove prose accuracy. | Reconcile complete admission chain with API/config/setup in WP01; no enablement change in WP00. |
| Broad composition and deep implementation contracts | Root setup and exported factory-derived capabilities couple domain construction/HTTP/worker consumers. | WP01 boundary rules and WP08/WP13 contract/assembly work. Preserve working participants until replacement. |
| Future rules exceed today's checker | Current checker passes existing allowed imports; it does not enforce the selected public-contract boundary/type-cycle rules. | WP01 positive/negative fixtures and exact migration allowances; no blanket bypass. |

No missing feature was implemented or declared accepted. Static analysis does not prove every injected
call path, every deployed index or every production activation policy. Those limitations are explicit
handoffs, not permission to rewrite working modules or expand this task into feature development.

### Observed checks and executor review

| Command | Observed result |
| --- | --- |
| `npm run typecheck --workspace=backend` | Passed, exit 0; existing source/contracts/tests type-check. |
| `npm run lint:boundaries` | Passed: 427 source files, zero current-rule errors. |
| `npm run api:check --workspace=backend` | Passed: all four generated artifacts verified. |
| `npm run test:unit --workspace=backend -- tests/unit/pricing.test.ts tests/unit/refund-calculation.test.ts tests/unit/composition.test.ts` | Passed: 60 cases, three existing files; calculation and configuration/composition baseline. |
| `npm exec --workspace=backend -- vitest run --config vitest.contract.config.ts -t 'reconciles actual Express routers\|fails on missing, undeclared, duplicate or status-drifted operations\|fails when a route-owning module is added'` | Passed: three selected existing parity/negative cases. Other 183 cases were excluded by the name filter; they were not run or claimed passed. |
| Inventory analyzer and consistency review | Passed: 491 backend paths, all owner/package mappings, zero candidate target collisions, no unresolved backend imports; persistence hashes and source digest retained. |

The command above uses literal `|` alternation inside its quoted test filter; table escaping is only
Markdown formatting. Full backend suites, build/smoke, replica-set integration, browser, deployment,
live providers and supply-chain scan were Not Run: no runtime/import/dependency changes occurred in WP00.
Documentation/link/diff checks are run on the final record and reported at handoff.

Executor/reviewer: Codex. Reviewed inventory ownership, actual selected test output, source-vs-generated
route counts, canonical-vs-lookup model counts, static-cycle limitations, task totals and actual diff.
P03-024 completes WP00 under Tasks §2 only; next is WP01 specification reconciliation and executable
boundary enforcement. Prior acceptance and all P03-022/external/milestone gates remain unchanged.

## P03-025 — WP01 contracts and enforcement, 3 November 2026

**Scope:** The owner requested the next approved package after P03-024. This continuation implements
WP01 only: specification reconciliation and executable import safeguards. Historical acceptance above
is unchanged. No backend source/test/script/contract/generated artifact or environment activation changed.
Existing staged owner changes were preserved; this task does not stage, commit or deploy them.

### Reconciled decisions and findings

- Architecture §§4.1/6.1/6.2 now owns the selected twenty modules, five auth subfeatures,
  product-owned variants, independent wishlist, payments attempts/collections, refunds obligations/payouts,
  existing `reports` naming and technical health outside business modules. Root/private assembly,
  public type contracts, local helpers/constants/data, explicit exports and workflow coordination are specified.
- Database §§3.1/4.2/6.5/16 and API §2.2 align ownership without renaming a collection/URL or changing DTOs.
  The inventory is corrected to 39 collections: existing `paymentInitiations` was already specified in
  Database §8.5/§11.1 and implemented. This is a documentation correction, not a schema migration.
- Implementation Plan §3.6 and Testing §15.5 describe the ratchet, exact exceptions, negative fixtures,
  code-vs-tooling boundaries and removal requirements. Operations procedures do not change.
- WP00's possible checkout activation discrepancy is resolved by the complete admission chain:
  setup passes submission only when `checkout.codEnabled`; `checkout.routes.ts` explicitly rejects a
  non-COD submission. Internal completion supporting online drafts does not activate the public route.
  Therefore the COD-only activation description is retained. No payment/checkout feature was enabled.
- Backend Refactor Plan §2 labels its pre-WP01 input/reference comparison as migration history rather
  than a competing current specification. Task mapping uses P03-025, not an accepted feature task.

### Executable boundary changes

The existing `scripts/ci/check-boundaries.mjs` remains the checker, and existing
`tests/tooling/development.test.mjs` contains the updated positive fixtures and seven new rule-focused
tests. No second test suite/framework, production helper or documentation guide was introduced.

- Cross-module imports require explicit type-only contracts at the owning module root. Runtime
  construction is injected through setup. Checks cover imports, named/star re-exports, dynamic import,
  require, import-equals and inline TypeScript import types; nonliteral backend dependency calls fail.
- Public contracts reject runtime statements/imports, broad type barrels, private implementation-derived
  types and indirect Mongoose model/document/connection exposure. Explicit ClientSession is permitted.
- Composition is consumed by setup/server or that module's private composition; a technical helper
  renamed `.composition.ts` cannot bypass ownership. Domains cannot relay implementation through root helpers.
- Configuration can consume validation schemas/public types, not service implementations. Provider
  adapters consume public protocol types; domain/private concrete-client type coupling is inventoried.
- Runtime and type-inclusive source strongly connected components are checked. No runtime-cycle
  allowance is accepted. Injected call recursion remains an operation-review responsibility, not a
  property falsely inferred from an acyclic file graph.
- Existing persistence/controller/shared/provider guards remain blocking. Stock capability protection
  works at both the current catalog/variants and target catalog/products paths; only inventory/root
  wiring may receive it. A migration allowance cannot bypass those guards.

The only new repository file is `scripts/ci/backend-boundary-allowances.json`, a consumed data inventory:
**356 exact legacy import signatures plus one existing type-cycle component**. Signatures identify
source, resolved target, type/runtime mode, declaration kind and imported symbols; aliases/formatting
do not authorize new symbols. New consumers, enlarged signatures, stale entries, invalid package
labels and changed cycles fail. No update-baseline CLI or wildcard permission was added.

| Removal package | Remaining exact entries |
| --- | ---: |
| WP02 | 5 |
| WP03 | 4 |
| WP04 | 20 |
| WP05 | 14 |
| WP06 | 20 |
| WP07 | 23 |
| WP09 | 89 |
| WP10 | 53 |
| WP11 | 78, including the one type-cycle component |
| WP12 | 48 |
| WP13 | 3 |
| **Total** | **357** |

Remove entries with their owning migration, and all entries before WP15 technical completion. The
current tree passing with these exact entries is not a claim that its legacy dependencies are refactored.
Scripts/bootstrap tools and contract generation are inventoried consumers outside the runtime source
graph; preserve their tested entry points rather than extending runtime privileges to them.

### Observed verification and environment limits

Input revision: `02cb436284007020ba7d3734b455e66c637cab68` plus this reviewed working-tree tooling/docs change.
Node v24.20.0, npm 11.19.0. All 491 backend file hashes and the original WP00 backend digest match;
only repository checker/data/fixtures and owning documentation changed. No dependencies/lockfile changed.
During execution HEAD advanced to the owner's planning-only commit `3481afdabd76181e922a832296bdd709eaa68190`;
additional Markdown table/contents formatting was preserved. No reset, staging or commit was performed
by this task, and the backend fingerprint remained identical across that change.

| Command/check | Observed result |
| --- | --- |
| `npm run test:unit` | Initial restricted run: 87 Passed, 3 Failed out of 90. Preserve this result; it is not retrospectively a passing full run. |
| `node --test --test-isolation=none --test-name-pattern='CI-11:\|missing diff revisions\|TOOL-10:' tests/tooling/ci.test.mjs tests/tooling/development.test.mjs` on untouched HEAD control tree | Same three failures reproduced, including truncated child-process output and watch fixture timeout. |
| The same three-case command outside the sandbox, current tree | Passed: all 3. Only the failed process cases were rerun; no fixture/CI/watch behavior was weakened to obtain a pass. |
| `node --test --test-isolation=none --test-name-pattern='BOUNDARY\|STRUCTURE\|TOOL-0[1-5]' tests/tooling/development.test.mjs` | Final affected regression Passed: 47 cases after final public/composition/cycle review fixes. Unchanged passing cases from the initial run remain applicable. |
| `npm run lint:boundaries` | Passed: 427 source files, zero errors; 357 exact legacy allowances explicitly reported. |
| `npm run api:check --workspace=backend` | Passed: all four generated artifacts unchanged/fresh after ownership-prose changes. |
| `node_modules/.bin/biome lint scripts/ci/check-boundaries.mjs tests/tooling/development.test.mjs --error-on-warnings` | Passed after correcting one local useConst warning. |
| `node_modules/.bin/biome format scripts/ci/check-boundaries.mjs scripts/ci/backend-boundary-allowances.json tests/tooling/development.test.mjs` | Passed for changed tooling/data. |
| Backend hash inventory / actual diff review | All 491 backend inputs unchanged; exact exception coverage and removal packages reviewed. |

Table escaping is Markdown only; quoted test filters use literal `|`. No additional full test run was
needed after the focused rechecks. Backend application suites/build/integration/browser, migrations,
live providers, external qualification and deployment were Not Run for unchanged runtime inputs.
Repository lint/link and staged/unstaged whitespace checks are run on the final documentation revision.

Artifacts: [boundary/allowance result](../../test-results/backend-refactor/wp01-boundaries.json),
[observed check summary and tooling fingerprint](../../test-results/backend-refactor/wp01-checks.json),
[untouched-baseline failure reproduction](../../test-results/backend-refactor/wp01-control-failures.log).
The control tree was extracted from HEAD under `/tmp`; it did not overwrite the shared workspace.

Executor/reviewer: Codex. Reviewed exact import signatures/removal ownership, the positive/negative
fixtures, composition/helper and inline-type bypasses, runtime-cycle denial, canonical-source parity,
owning-doc consistency and actual diff. P03-025 completes WP01 under Tasks §2 only; next is WP02
technical foundation/reuse. P03-022 and external/application/milestone acceptance remain unchanged.
