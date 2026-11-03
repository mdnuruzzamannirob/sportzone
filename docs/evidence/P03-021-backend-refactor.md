# P03-021 — Backend target structure and parity

**Date:** 22 October 2026\
**Status:** Done — accepted by project owner\
**Baseline:** `e13a017`\
**Scope:** Architecture §§4–6, Database §4.2 and API §2; existing backend implementation only

## Delivered organization

| Previous location / responsibility         | Current owner                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| composition.ts, routes/index.ts            | setup.ts and routes.ts; root wiring coordinates domain routers                                               |
| config/environment.ts, db/connection.ts    | config/env.ts and config/database.ts                                                                         |
| common/, observability/, db helpers        | shared/errors, middleware, database, logger and security-action classifications                              |
| Flat auth services/routes                  | credentials/, sessions/, recovery/, verification/; one auth model/validator registration                     |
| Auth wiring of customer/delivery/media     | Root setup; auth exposes narrow customer-account/admin-access capabilities                                   |
| products/, categories/                     | catalog/products, variants and categories; canonical schema/index identities retained                        |
| Product/variant combined definitions       | Cohesive product/variant schemas, shared catalog field helpers, one canonical registration factory           |
| Media monolith / inline multipart handlers | upload, attachment, access, cleanup services; shared private context; controller owns multipart/HTTP shaping |
| integrations/cloudinary and email adapters | providers/cloudinary, antivirus and email client/schema pairs                                                |
| Notification worker service                | jobs/send-notifications.job.ts; durable claims and proof-delivery services reused                            |
| tools/*.mjs                                | scripts/*.mjs; build script clears generated dist before compiling                                           |
| tests/*.test.ts, tests/support             | tests/unit/*.test.ts and tests/helpers; integration discovery retained                                       |

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

| Check                                           | Observed result                                                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Backend lint/typecheck/build                    | Passed                                                                                                                             |
| Backend unit/contract suite                     | Passed: 15 files, 343 cases; no dropped tests                                                                                      |
| Final replica-set integration suite             | Passed: 18 files, 327 cases; transactions, races, validators, CLI and lifecycle                                                    |
| Root repository/tooling suite                   | Passed: 40 cases, including five new backend boundary test families                                                                |
| lint:boundaries                                 | Passed: source graph has zero violations                                                                                           |
| format:check                                    | Passed for the expanded backend/tooling scope                                                                                      |
| Compiled API smoke                              | Passed: invalid config redaction, real DB startup, protected readiness and shutdown                                                |
| Frontend builds with synthetic HTTPS API origin | Passed for browser fixture consumption; application source unchanged                                                               |
| Real API identity browser journeys              | Passed: 6 unique cases across Chromium, Firefox and WebKit (4 + 2 across affected runs); no skipped cases or automatic retries     |
| Canonical AST preservation audit                | Passed against baseline: 21 Schema expressions, 24 index declarations, 12 model registration expressions, 9 validator declarations |
| Repository docs/links and final diff            | Passed: repository checks and git diff --check; final result recorded below                                                        |

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

| Backend area                         | Observed inventory | Disposition                                                                                                                           |
| ------------------------------------ | -----------------: | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`                               |          319 files | Owner/package and current-to-target mapping for every path.                                                                           |
| `tests/`                             |          113 files | 51 unit suites, 52 integration suites, one contract suite plus its fixture, five helpers, two fixtures and smoke entry.               |
| `scripts/`                           |           41 files | All bootstrap, activation, migration, provisioning, development, qualification, worker and runtime entries retained in the inventory. |
| `contracts/`                         |            4 files | Registry, local registry, independent local-operation list and generator; source-schema imports recorded.                             |
| `api/`                               |            4 files | OpenAPI, planned-operation inventory, Postman collection/environment; all four freshness-checked.                                     |
| Backend root configuration/packaging |           10 files | Package/Biome, three TypeScript configs, three Vitest configs, Dockerfile and context allowlist.                                      |
| **Total backend**                    |      **491 files** | No unassigned area; review-in-place does not mean mandatory rewrite.                                                                  |

Current module file counts and package ownership:

| Current owner | Files | Target / owning package                                                       |
| ------------- | ----: | ----------------------------------------------------------------------------- |
| auth          |    41 | Keep five auth subfeatures; private identity/security capabilities — WP04.    |
| customers     |     4 | Profile/privacy/administration through auth-owned identity operations — WP04. |
| health        |     2 | Move to `src/health/`, preserve URLs/readiness behavior — WP04.               |
| delivery      |     6 | Pilot owner, existing coverage/charge persistence — WP03.                     |
| audit         |     5 | Durable append/query capabilities — WP05.                                     |
| notifications |    11 | Intent/template/delivery interfaces — WP05; final worker parity WP14.         |
| media         |    14 | Preserve meaningful upload/access/reference/cleanup services — WP05.          |
| catalog       |    21 | Product-owned variants, sibling categories — WP06.                            |
| inventory     |    10 | Preserve sole stock-write capability — WP06.                                  |
| promotions    |    11 | Coupon eligibility/holds/quota and deterministic allocation — WP07.           |
| cart          |    10 | Five cart files stay; five wishlist files move to `modules/wishlist/` — WP07. |
| checkout      |    17 | Participant boundaries WP08, placement coordination WP09.                     |
| orders        |    23 | Participant boundaries WP08, lifecycle coordination WP09.                     |
| payments      |    37 | Attempts/collections; shared aggregate stays at parent — WP08/WP10.           |
| returns       |    11 | Claims/physical inspection/disposition — WP11.                                |
| refunds       |    24 | Obligations/payouts; shared aggregate/assembly stays at parent — WP08/WP11.   |
| reviews       |     6 | Purchase qualification/moderation — WP12.                                     |
| settings      |    11 | Store/policy content, narrowly exposed configuration — WP12.                  |
| support       |     6 | Complaint scope/correspondence — WP12.                                        |
| reports       |     4 | Keep existing name; owner-provided bounded projections — WP12.                |

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

| Existing workflow / entry        | Participants and current transaction boundary                                                                                                   | Refactor impact                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Checkout intent/completion       | Auth-owned scope passes one session into intent, order creation, stock/coupon allocation, payment preparation and outbox.                       | Keep coordinator checkout-owned; do not construct all participants inside the domain operation.       |
| Cancellation                     | `cancellationService` receives auth scope/admin capability, checkout allocation callback, payment capability and optional refund callback.      | Replace deep factory-derived contracts; later lifecycle must not depend on placement internals.       |
| Fulfillment                      | Order lifecycle receives allocation/funding/deadline capabilities; stock/coupon helpers currently live under checkout.                          | Separate participant rules from checkout placement without moving transaction authority accidentally. |
| Verified collection / settlement | Receipt processing independently preserves money, uses injected order/allocation capabilities; late recovery opens its own guarded transaction. | Preserve the receipt/recovery split; do not merge into one rollback that can discard received funds.  |
| Return/shortage                  | Scoped return operations and admin physical operations share canonical unit guards, evidence and inventory/refund participants.                 | Preserve transaction session, physical-vs-missing distinction and replay identity.                    |
| Refund reservation               | Admin/current-scope callbacks join source funding, order/unit and claim capabilities, obligations/attempts/audit/outbox.                        | Extract obligation contracts before payout code moves; preserve pending capacity.                     |
| Payout/recovery                  | Durable intent precedes external dispatch; outcome recovery uses funding/unit capabilities and guarded settlement.                              | Keep external calls outside transactions and uncertain outcomes recoverable.                          |
| Expiry/reconciliation workers    | Leases/cursors and guarded transactions invoke existing domain services.                                                                        | Preserve fencing/checkpoints and script-to-compiled-entry compatibility.                              |

### Findings and disposition

| Finding                                                 | Exact source / risk                                                                                                                                                                                         | Follow-up                                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Collection inventory understates source-defined storage | Database §3.1 says 38 and omits `paymentInitiations`; Database §8.5 and §11.1 already specify it, and payment-initiation persistence bootstraps it. The raw auth quota store makes 39 source-defined names. | WP01 reconcile the inventory/count; do not add/drop a collection or run a migration.                       |
| Type-only refund dependency component                   | Recovery uses `Parameters<typeof refundReservationService>`; reservation uses recovery's `RefundNotifier`.                                                                                                  | WP01 public-contract rules and WP11 semantic type placement. No runtime failure claimed.                   |
| Stale activation prose may mislead clients              | Contract registry checkout activation still says COD-only/pending Phase 07, while checkout completion handles online drafts and payment preparation. Fresh generation cannot prove prose accuracy.          | Reconcile complete admission chain with API/config/setup in WP01; no enablement change in WP00.            |
| Broad composition and deep implementation contracts     | Root setup and exported factory-derived capabilities couple domain construction/HTTP/worker consumers.                                                                                                      | WP01 boundary rules and WP08/WP13 contract/assembly work. Preserve working participants until replacement. |
| Future rules exceed today's checker                     | Current checker passes existing allowed imports; it does not enforce the selected public-contract boundary/type-cycle rules.                                                                                | WP01 positive/negative fixtures and exact migration allowances; no blanket bypass.                         |

No missing feature was implemented or declared accepted. Static analysis does not prove every injected
call path, every deployed index or every production activation policy. Those limitations are explicit
handoffs, not permission to rewrite working modules or expand this task into feature development.

### Observed checks and executor review

| Command                                                                                                                                                                                                                                 | Observed result                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck --workspace=backend`                                                                                                                                                                                                 | Passed, exit 0; existing source/contracts/tests type-check.                                                                                                            |
| `npm run lint:boundaries`                                                                                                                                                                                                               | Passed: 427 source files, zero current-rule errors.                                                                                                                    |
| `npm run api:check --workspace=backend`                                                                                                                                                                                                 | Passed: all four generated artifacts verified.                                                                                                                         |
| `npm run test:unit --workspace=backend -- tests/unit/pricing.test.ts tests/unit/refund-calculation.test.ts tests/unit/composition.test.ts`                                                                                              | Passed: 60 cases, three existing files; calculation and configuration/composition baseline.                                                                            |
| `npm exec --workspace=backend -- vitest run --config vitest.contract.config.ts -t 'reconciles actual Express routers\|fails on missing, undeclared, duplicate or status-drifted operations\|fails when a route-owning module is added'` | Passed: three selected existing parity/negative cases. Other 183 cases were excluded by the name filter; they were not run or claimed passed.                          |
| Inventory analyzer and consistency review                                                                                                                                                                                               | Passed: 491 backend paths, all owner/package mappings, zero candidate target collisions, no unresolved backend imports; persistence hashes and source digest retained. |

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

| Removal package |                    Remaining exact entries |
| --------------- | -----------------------------------------: |
| WP02            |                                          5 |
| WP03            |                                          4 |
| WP04            |                                         20 |
| WP05            |                                         14 |
| WP06            |                                         20 |
| WP07            |                                         23 |
| WP09            |                                         89 |
| WP10            |                                         53 |
| WP11            | 78, including the one type-cycle component |
| WP12            |                                         48 |
| WP13            |                                          3 |
| **Total**       |                                    **357** |

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

| Command/check                                                                                                                                                                                  | Observed result                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:unit`                                                                                                                                                                            | Initial restricted run: 87 Passed, 3 Failed out of 90. Preserve this result; it is not retrospectively a passing full run.                                    |
| `node --test --test-isolation=none --test-name-pattern='CI-11:\|missing diff revisions\|TOOL-10:' tests/tooling/ci.test.mjs tests/tooling/development.test.mjs` on untouched HEAD control tree | Same three failures reproduced, including truncated child-process output and watch fixture timeout.                                                           |
| The same three-case command outside the sandbox, current tree                                                                                                                                  | Passed: all 3. Only the failed process cases were rerun; no fixture/CI/watch behavior was weakened to obtain a pass.                                          |
| `node --test --test-isolation=none --test-name-pattern='BOUNDARY\|STRUCTURE\|TOOL-0[1-5]' tests/tooling/development.test.mjs`                                                                  | Final affected regression Passed: 47 cases after final public/composition/cycle review fixes. Unchanged passing cases from the initial run remain applicable. |
| `npm run lint:boundaries`                                                                                                                                                                      | Passed: 427 source files, zero errors; 357 exact legacy allowances explicitly reported.                                                                       |
| `npm run api:check --workspace=backend`                                                                                                                                                        | Passed: all four generated artifacts unchanged/fresh after ownership-prose changes.                                                                           |
| `node_modules/.bin/biome lint scripts/ci/check-boundaries.mjs tests/tooling/development.test.mjs --error-on-warnings`                                                                          | Passed after correcting one local useConst warning.                                                                                                           |
| `node_modules/.bin/biome format scripts/ci/check-boundaries.mjs scripts/ci/backend-boundary-allowances.json tests/tooling/development.test.mjs`                                                | Passed for changed tooling/data.                                                                                                                              |
| Backend hash inventory / actual diff review                                                                                                                                                    | All 491 backend inputs unchanged; exact exception coverage and removal packages reviewed.                                                                     |

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

## P03-026 — WP02 technical foundation, 3 November 2026

Scope: Backend Refactor Plan WP02; input revision `fbced280ce7cc0c060d019bbfeb56b513dd3e81b`
plus preserved owner changes. Executor/reviewer: Codex. This is an existing-backend refactor,
not feature activation or application-stage acceptance.

### Ownership and reuse review

- Existing `config/security.ts` now owns session/browser option validators and raw environment adapters.
  Original auth loader/validator exports remain available for existing isolated callers. Validation,
  error mapping, defaults, origins and cookies are preserved; services still validate typed options.
- New `shared/crypto.ts` owns AES-256-GCM byte encryption, validated/captured keyrings and exact JSON
  SHA-256. It knows no identity purpose, proof format, email, order or audience. Auth retains proof
  validation, namespaced hashes, authenticated binding and sanitized decryption errors.
- Configuration captures a technical keyring; six auth consumers wrap it with the owning proof codec.
  Existing `createProofEncryption` retains encrypt/decrypt for isolated consumers. Its internal return
  also exposes the technical keyring methods; no HTTP or persisted envelope changed.
- Delivery configuration validates its owning rule schema and uses the shared digest. Normalized JSON
  field order remains unchanged; the existing order helper retains its exported behavior.
- New `orders/order.public.ts` defines the actually consumed disposition verifier contract, replacing
  config's type dependency on the private service constructor. No runtime public barrel was introduced.
- Reviewed existing transaction/external-effect guards, validation, pagination, errors/responses,
  protected logging/files and job leases. Their existing responsibilities remain coherent; retained
  them instead of creating parallel helpers, base services, repositories or speculative classes.
- Touched source files use explicit named exports at the bottom. The two new source files above have
  distinct consumers. No extra test file, dependency, collection, worker or operator command was added.

Removed all five WP02 legacy import allowances; **352 remain** (351 import signatures and one type
cycle) for their later owners. Boundary checks enforce this reduction without adding exemptions.
Architecture §6.2 describes the concrete configuration/crypto ownership. API/Database/Operations
contracts need no revision: routes, DTOs, keys, schemas, provider protocol and operational commands
are unchanged. The existing recovery unit suite received three historical ciphertext vectors.

### Observed verification

Node v24.20.0/npm 11.19.0. Loopback-dependent tests ran outside the sandbox on isolated MongoDB
8.0.16 with `MONGOMS_DISTRO=ubuntu-24.04`; no developer/production database or live provider was used.

| Command/check                                                                                                                                                                                                                                | Result                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck --workspace=backend`                                                                                                                                                                                                      | Passed                                                                                                                                               |
| `npm run build --workspace=backend`                                                                                                                                                                                                          | Passed                                                                                                                                               |
| `npm run lint --workspace=backend`                                                                                                                                                                                                           | Passed: 482 files                                                                                                                                    |
| `npm run lint:boundaries`                                                                                                                                                                                                                    | Passed: 429 source files, zero errors, 352 exact allowances                                                                                          |
| `npm run api:check --workspace=backend`                                                                                                                                                                                                      | Passed: all four artifacts fresh                                                                                                                     |
| `npm run test:smoke --workspace=backend`                                                                                                                                                                                                     | Passed: compiled invalid-config redaction, startup/live/restricted-ready/shutdown                                                                    |
| `npm run test:unit --workspace=backend -- <affected files below> --reporter=default --reporter=json --outputFile=../test-results/backend-refactor/wp02-unit.json`                                                                            | Passed: 219 cases / 12 files                                                                                                                         |
| `MONGOMS_DISTRO=ubuntu-24.04 npm exec --workspace=backend -- vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/backend-refactor/wp02-integration.json <affected files below>` | Passed: 155 cases / 9 files                                                                                                                          |
| Old/new compiled proof codecs                                                                                                                                                                                                                | Passed: six bidirectional checks across admin reset, email change and guest binding; retained key and active-key rotation; unchanged envelope fields |
| WP00 preservation fingerprints                                                                                                                                                                                                               | Passed: all 59 model/persistence/API-artifact/backend-manifest files identical                                                                       |

Unit file arguments (under `backend/tests/unit/`): `sessions.test.ts`, `browser-security.test.ts`,
`recovery.test.ts`, `email-change.test.ts`, `guest-access.test.ts`, `composition.test.ts`,
`operations.test.ts`, `app.test.ts`, `operations-config.test.ts`, `order-operations-config.test.ts`,
`delivery-deadline.test.ts`, `auth-rate-limit.test.ts`.
Integration arguments (under `backend/tests/integration/`): `database.test.ts`, `sessions.test.ts`,
`recovery.test.ts`, `guest-access.test.ts`, `email-change.test.ts`, `email-verification.test.ts`,
`composition.test.ts`, `delivery-deadline.test.ts`, `admin-auth.test.ts`.

The actual CLI arguments use the full `tests/unit/` or `tests/integration/` prefixes. Existing cases
cover invalid configuration, tampering, identity/proof binding, concurrent/replayed auth operations,
transaction safeguards, delivery normalization and real composition/worker configuration. Historical
vectors were generated from the original codec using synthetic data, then consumed by the new codec;
a separate one-off comparison verified both ciphertext directions without adding a repository tool.

Artifacts: [unit results](../../test-results/backend-refactor/wp02-unit.json),
[integration results](../../test-results/backend-refactor/wp02-integration.json),
[proof compatibility](../../test-results/backend-refactor/wp02-proof-compatibility.json),
[preservation fingerprints](../../test-results/backend-refactor/wp02-preservation.json).
These local artifacts are ignored test output, not additional project documents.

Final executor review checked the actual diff, retained exports, error mapping, normalized hash order,
proof authenticated context and key rotation, private model ownership and absence of new external
side effects. Final backend format, repository documentation/link lint and whitespace checks are
recorded with this handoff. Full backend regression, frontend/browser suites, live providers,
deployment and external qualification were Not Run for this scoped package. P03-026 completes WP02
under Tasks §2; next is WP03 delivery pilot. P03-022 and stage/milestone acceptance remain unchanged.

## P03-027 — WP03 delivery pilot, 3 November 2026

Scope: Backend Refactor Plan WP03; PRD FR-16/28, Architecture §§4/6, API §§4.7/14.3,
Database §7.6 and Testing §15.5. Executor/reviewer: Codex. Input tree was clean;
HEAD reported `203647bf292b8bdba3d9dfbe9052dff5391e3b60`. No staging, commit, reset,
Git-object repair or feature activation was performed.

### Final structure and ownership

```text
modules/delivery/
├── delivery.routes.ts             # Endpoint/CORS/middleware registration
├── delivery.controller.ts         # HTTP validation, service calls, ETags/responses
├── delivery.schema.ts             # Existing input/output validators
├── delivery.service.ts            # Administrative charge/zone transitions and due work
├── delivery-coverage.service.ts    # Address eligibility, checkout charge and area reads
├── delivery.public.ts             # Type-only detached coverage/charge capabilities
├── delivery.model.ts              # Same canonical models, schemas and indexes
└── delivery.persistence.ts        # Same index initialization/verification
```

- Extracted existing handlers into one real controller. Routes inject narrow middleware/token-reader
  capabilities; root setup binds the original admin CORS → browser Origin/CSRF → session middleware
  in the same order. Public-area body validation moved from its CORS middleware into its controller;
  OPTIONS still returns before body validation. Status codes, headers and route namespaces are unchanged.
- Added `auth/auth.public.ts` for the actually consumed generic admin-owned transaction capability.
  The auth implementation explicitly satisfies it and retains its old type export for later consumers.
  No authentication, authorization/revocation fence or transaction implementation changed.
- Added `delivery.public.ts` for address eligibility, transaction-bound detached charge snapshots and
  public-area reading. Customer, checkout and promotions now consume these owner types rather than
  private factory types. Business coordination remains injected by setup, with no runtime barrel.
- Retained two cohesive services: commercial rule management and read capabilities have distinct
  responsibilities. No argument-forwarding composition file, generic repository, class, constants,
  DTO mapper or empty template was needed. Existing operator scripts keep their service entry points.
- Reused WP02's exact-JSON digest instead of duplicating SHA-256; digest inputs/order are unchanged.
  Module declarations now list named exports at the bottom. Persistence changes are export style only.
- Updated actual setup, HTTP integration assembly and the existing contract-registration fixture together.
  Added one negative fixture to existing tooling tests covering delivery controller persistence bypass,
  private auth imports, foreign model access and private coverage-type imports, plus allowed public types.

All four WP03 allowances were removed, along with three consumer allowances made obsolete by the
new delivery contract (WP04 customer, WP07 promotions, WP09 checkout). **345 remain: 344 imports
and one type-cycle component**. No allowance was added and no checker safeguard was weakened.
No module path was renamed; test discovery, CI inventory, package/lockfiles, environment keys and
public API artifacts did not need changes. No business/API/data/operational contract changed, so their
owning specifications remain settled. The pilot found no convention defect requiring a new architecture
exception: real controllers, injected middleware and provider-owned type contracts fit the existing rules.

### Observed verification and review

Node v24.20.0/npm 11.19.0; isolated MongoDB 8.0.16 with `MONGOMS_DISTRO=ubuntu-24.04`.
Loopback integration/unit/smoke and the three failed contract rechecks ran outside the sandbox.
No developer/production data, deployed provider or external financial effect was used.

| Command/check                                                                                                                 | Observed result                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck --workspace=backend`                                                                                       | Final Passed; initial editing check identified two missing root imports, corrected before final checks                                                                                  |
| `npm run build --workspace=backend`                                                                                           | Passed                                                                                                                                                                                  |
| `npm run lint --workspace=backend`                                                                                            | Passed: 485 files                                                                                                                                                                       |
| `npm run lint:boundaries`                                                                                                     | Passed: 432 files, zero errors, 345 exact allowances                                                                                                                                    |
| `npm run format:backend`                                                                                                      | Passed: 501 files                                                                                                                                                                       |
| `node_modules/.bin/biome lint tests/tooling/development.test.mjs --error-on-warnings`                                         | Passed                                                                                                                                                                                  |
| `node --test --test-isolation=none --test-name-pattern='BOUNDARY\|STRUCTURE\|TOOL-0[1-5]' tests/tooling/development.test.mjs` | Passed: 48 cases including the delivery negative fixture                                                                                                                                |
| Affected unit command below                                                                                                   | Passed: 124 cases / 6 files                                                                                                                                                             |
| Affected integration command below                                                                                            | Passed: 428 cases / 6 files                                                                                                                                                             |
| `npm run test:contract --workspace=backend`                                                                                   | Artifact freshness Passed for all four files; initial restricted suite: 183 Passed, 3 Failed (loopback EPERM/process-output restriction)                                                |
| Three-case contract command below, outside sandbox                                                                            | Passed: all 3; 183 intentionally unselected. The initial full run remains recorded as failed, not retrospectively a clean full run.                                                     |
| `npm run test:smoke --workspace=backend`                                                                                      | Passed: compiled invalid-config redaction, real startup/live/restricted-ready/shutdown                                                                                                  |
| Preservation comparison                                                                                                       | Passed: 60 files; delivery model/persistence/schema implementations identical after export normalization; 57 other canonical persistence/artifact/manifest files byte-identical to WP00 |

Reproducible affected test commands (repository root):

```sh
npm run test:unit --workspace=backend -- tests/unit/delivery.test.ts tests/unit/checkout-quote.test.ts tests/unit/coupon.test.ts tests/unit/composition.test.ts tests/unit/sessions.test.ts tests/unit/browser-security.test.ts --reporter=default --reporter=json --outputFile=../test-results/backend-refactor/wp03-unit.json
MONGOMS_DISTRO=ubuntu-24.04 npm exec --workspace=backend -- vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/backend-refactor/wp03-integration.json tests/integration/delivery.test.ts tests/integration/profile.test.ts tests/integration/checkout-quote.test.ts tests/integration/checkout-intent.test.ts tests/integration/coupon.test.ts tests/integration/composition.test.ts
npm exec --workspace=backend -- vitest run --config vitest.contract.config.ts -t 'detects real HTTP response drift|validates real HTTP health|checks artifacts in a credential-free subprocess' --reporter=default --reporter=json --outputFile=../test-results/backend-refactor/wp03-contract-recheck.json
```

Table escaping is Markdown only; the Node test filter uses literal `|`.
Existing delivery tests cover auth/CSRF/strict DTOs, exact/default coverage and inactive exact-zone
rejection, revisions, overlap serialization, replay, audit rollback, due workers and additive operator
scripts. Profile/checkout tests preserve current-coverage checks and historical charge snapshots;
checkout composition also exercises actual configured HTTP and financial concurrency invariants.
No separate refactor test suite or extra project document was introduced.

Artifacts: [unit](../../test-results/backend-refactor/wp03-unit.json),
[integration](../../test-results/backend-refactor/wp03-integration.json),
[contract recheck](../../test-results/backend-refactor/wp03-contract-recheck.json),
[preservation](../../test-results/backend-refactor/wp03-preservation.json),
[check summary](../../test-results/backend-refactor/wp03-checks.json).
These are ignored local output. Full backend/tooling regression, frontend/browser, live providers,
deployment and external qualification were Not Run for this scoped package.

Git limitation: during final comparison, `git show HEAD:<path>` and `git cat-file -t HEAD` reported
that the HEAD object is empty, including a read-only check outside the sandbox. Repository metadata
was not repaired or modified. Working-tree-versus-index diff remains usable; model/persistence/schema
index snapshots were independently matched to WP00 byte hashes before implementation comparison.
At that point a reliable HEAD/cached-diff review could not be claimed. The owner subsequently
requested Git/GitHub repair: the exact original commit object was reconstructed from the intact
index tree, original commit message and matching metadata, and verified against the original
`203647bf292b8bdba3d9dfbe9052dff5391e3b60` SHA. Backups preceded repair; four zero-byte
objects were quarantined and trailing NUL padding removed from backed-up reflogs. No branch/history
rewrite occurred. Full Git integrity and HEAD/index whitespace checks then passed, and all 827
worktree file hashes were unchanged by recovery. Local backups are in
`/tmp/sportzone-git-recovery-20261103/`; this path is a local recovery artifact, not release evidence.
The executor reviewed the actual working-tree/index diff and all three new source files, middleware
ordering, retained exports, raw/typed consumer wiring and normalized persistence/schema comparison.
Final repository documentation/link and working-tree whitespace checks are recorded in the check summary.

P03-027 completes WP03 under Tasks §2. Next is WP04 identity/customer/technical-health boundaries;
P03-022 and application/external/milestone acceptance remain unchanged.

## P03-028 — WP04 identity, customer and technical health, 3 November 2026

Scope: Backend Refactor Plan WP04; Architecture §§4/6/9; API §§4/14; Database §5;
Testing §15.5. Input revision `ff8ed37a27c89ca13cc9b20988ae32e927ea6c83`, clean working tree
on `codex/backend-refactor-wp03`. Executor/reviewer: Codex. No product feature, environment
activation, collection, package or framework was added.

### Ownership, cohesion and actual consumers

- Auth composition receives the existing guest-order capability from root setup for both HTTP and
  proof delivery workers. It no longer constructs commerce services. `orders/order.public.ts` exposes
  only detached order identity/revision operations and ClientSession, never a model or query builder.
- Auth customer administration receives audit append/operation lookup capabilities, expressed in the
  new `audit/audit.public.ts`. The original transaction-scoped writer/readers are constructed in root
  setup; private identity-model assembly moved from the service into existing auth composition.
- Extended `auth.public.ts` with detached account/profile, owned customer transaction, administration
  and browser-route capabilities. Profiles/addresses/deletion intake stay in customers; credentials,
  status/security revisions, privacy decisions and session revocation remain auth-owned. The same
  canonical user model persists allowed profile fields through the existing guarded save capability.
  Existing account-access type exports remain compatible for isolated consumers.
- Customer HTTP handlers live in one `customer.controller.ts`, with profile and admin factories in
  the same owning HTTP file. Routes register endpoints and middleware; root injects the existing
  audience-specific CORS/browser/session/token-reader capabilities in the original order. Admin reads
  retain their original session/CORS checks; browser-CSRF protection remains on mutations.
- One shared `credentials/credentials.controller.ts` replaces duplicated customer/admin login,
  session and logout mapping. Registration is still registered only on the customer router; admin
  provisioning remains private. Recovery/verification/guest services keep their distinct policies.
  Small purpose-specific routers keep their local transport adapters instead of adding template files.
- Logout context/session selection moved intact into browser-security ownership. An initial local
  arrangement in session.http produced a runtime cycle, caught by the checker and corrected before
  verification. No runtime cycle was allowlisted. Merged the small media-admin principal service into
  existing admin-account.service.ts, updated all four test consumers and removed its obsolete file.
- New `notifications/notification.public.ts` defines the actually consumed identity-intent capability.
  Auth passes string IDs; notifications converts them to the same ObjectIds inside its owner before
  persistence. Existing ObjectId callers still work. Event keys, template versions, reference-only
  proof payloads, transaction assertions and notification records are unchanged. Each purpose-specific
  service receives only its required methods through Pick; proof delivery cannot issue/consume orders.
  Final type narrowing emitted byte-identical JavaScript to the tested revision, verified by hashes.
  No forwarding factory
  or separate implementation file was introduced for this adaptation.
- Existing cart/wishlist/order-read/review/support account-type consumers now import auth.public.ts.
  No related workflow was rewritten. Auth/customer/health declarations list named exports at the bottom;
  many touched files contain only this export-style normalization.
- Moved the two health files from modules/health to `src/health/`. Root app/router/setup imports and
  executable route-inventory coverage follow the move. Build cleanup removes stale dist paths;
  compiled HTTP live/restricted-ready/shutdown checks pass with unchanged URLs and authentication.

Auth still contains **42 source files**, with one real HTTP reuse file replacing the removed tiny
media-access service. Customers adds one real controller; audit/notifications each add one consumed
public type contract. Health is a move, not a duplicate. No test file was added or removed: existing
fixtures/imports were updated, with one new negative case in the existing tooling suite. No empty
folders, speculative DTO/constants/utils/classes or parallel architecture document was created.

Removed all **19 WP04 allowances**, plus seven now-obsolete account-type consumer allowances owned by
later packages. **319 remain: 318 import signatures and one type cycle**. Existing checker enforcement
and the added identity fixture reject auth→private order/audit, customer HTTP→identity model and
module→technical health imports, while allowing public types and root construction. No exceptions added.
Architecture/API/Database/Operations contracts remain settled; implementation now follows their chosen
ownership/health layout without changing behavior. Existing CI/build/test globs already cover these
paths; no check inventory or script name changed.

### Verification and one existing fixture defect

Node v24.20.0/npm 11.19.0. Real database tests use isolated transaction-capable MongoDB 8.0.16,
`MONGOMS_DISTRO=ubuntu-24.04`; loopback/process suites ran outside sandbox restrictions. No live
provider, developer/production database or financial effect was used.

| Command/check                                                                                                                 | Observed result                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck --workspace=backend`                                                                                       | Passed after reconciling detached types with existing nullable/completed stored states and fixing the value import; no stored-state contract was changed                                                                          |
| `npm run build --workspace=backend`                                                                                           | Passed; new technical health files emitted and obsolete health/media-access artifacts absent                                                                                                                                      |
| `npm run lint --workspace=backend`                                                                                            | Passed: 488 files                                                                                                                                                                                                                 |
| `npm run lint:boundaries`                                                                                                     | Passed: 435 source files, zero errors, 319 exact allowances                                                                                                                                                                       |
| `npm run format:backend`                                                                                                      | Passed: 504 files                                                                                                                                                                                                                 |
| `node_modules/.bin/biome lint tests/tooling/development.test.mjs --error-on-warnings`                                         | Passed                                                                                                                                                                                                                            |
| `node --test --test-isolation=none --test-name-pattern='BOUNDARY\|STRUCTURE\|TOOL-0[1-5]' tests/tooling/development.test.mjs` | Passed: 49 cases                                                                                                                                                                                                                  |
| `node --test --test-isolation=none --test-name-pattern='IDENTITY-BOUNDARY' tests/tooling/development.test.mjs`                | Passed: final one-case recheck after extending the new negative fixture to the actual technical health path                                                                                                                       |
| Affected unit command below                                                                                                   | Passed: 311 cases / 14 files                                                                                                                                                                                                      |
| Affected integration command below                                                                                            | Initial: 812 Passed / 1 Failed out of 813 cases, 22 files; preserve this result as a failed initial run                                                                                                                           |
| Identity suite recheck below                                                                                                  | Passed: all 40 cases after the local fixture-parser correction; other 773 passing cases have unchanged inputs. All 813 distinct integration cases are covered by these valid results, not a claimed clean rerun of all 22 suites. |
| `npm run test:contract --workspace=backend`                                                                                   | Passed: all four artifacts fresh and all 186 contract cases; real route inventory includes technical health                                                                                                                       |
| `npm run test:smoke --workspace=backend`                                                                                      | Passed: redacted invalid config, actual startup/live/restricted readiness/graceful shutdown                                                                                                                                       |
| Preservation comparison                                                                                                       | Passed: 69 model/persistence/validator/API-artifact/manifest/health inputs; changed definitions differ only in export style, health import location adjusted only for the move                                                    |

The single integration failure was a pre-existing whitespace-sensitive Markdown parser in
identity.test.ts: it expected one space between table cells and found zero documented indexes after
column alignment. The unchanged original parser reproduces zero rows against the unchanged Database
specification. Updated only that existing parser to tolerate horizontal padding and trim its options
cell. Assertions still require all ten exact names/keys, uniqueness/TTL options, ten live indexes,
four unique indexes, three TTL indexes and strict collection validators. No database assertion or
specification was weakened. The complete 40-case identity suite then passed on real MongoDB.

Commands (repository root):

```sh
npm run test:unit --workspace=backend -- tests/unit/admin-auth.test.ts tests/unit/app.test.ts tests/unit/auth-rate-limit.test.ts tests/unit/browser-security.test.ts tests/unit/composition.test.ts tests/unit/container-health.test.ts tests/unit/email-change.test.ts tests/unit/guest-access.test.ts tests/unit/identity-contracts.test.ts tests/unit/notifications.test.ts tests/unit/passwords.test.ts tests/unit/profile.test.ts tests/unit/recovery.test.ts tests/unit/sessions.test.ts --reporter=default --reporter=json --outputFile=../test-results/backend-refactor/wp04-unit.json
MONGOMS_DISTRO=ubuntu-24.04 npm exec --workspace=backend -- vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/backend-refactor/wp04-integration.json tests/integration/admin-auth.test.ts tests/integration/auth-rate-limit.test.ts tests/integration/authorization.test.ts tests/integration/browser-security.test.ts tests/integration/customer.test.ts tests/integration/email-change.test.ts tests/integration/email-verification.test.ts tests/integration/guest-access.test.ts tests/integration/identity.test.ts tests/integration/profile.test.ts tests/integration/recovery.test.ts tests/integration/sessions.test.ts tests/integration/notifications.test.ts tests/integration/composition.test.ts tests/integration/runtime.test.ts tests/integration/checkout-quote.test.ts tests/integration/cart.test.ts tests/integration/wishlist.test.ts tests/integration/media.test.ts tests/integration/settings.test.ts tests/integration/category-admin.test.ts tests/integration/product-admin.test.ts
MONGOMS_DISTRO=ubuntu-24.04 npm exec --workspace=backend -- vitest run --config vitest.integration.config.ts tests/integration/identity.test.ts --reporter=default --reporter=json --outputFile=../test-results/backend-refactor/wp04-identity-recheck.json
```

Table escaping is Markdown only; test filters use literal `|`. Existing cases verify identity bootstrap,
admin provisioning, audience separation, login/logout/CSRF, proof binding/rotation/replay, credential and
email-change races, revocation and audit rollback, customer privacy/suspension, current coverage,
registration notification durability, private media, worker composition, canonical financial snapshots
and actual compiled operator entry points. No new feature or refactor-only test suite was added.

Artifacts: [unit](../../test-results/backend-refactor/wp04-unit.json),
[initial integration](../../test-results/backend-refactor/wp04-integration.json),
[identity recheck](../../test-results/backend-refactor/wp04-identity-recheck.json),
[parser reproduction](../../test-results/backend-refactor/wp04-index-parser.json),
[preservation](../../test-results/backend-refactor/wp04-preservation.json),
[check summary](../../test-results/backend-refactor/wp04-checks.json).
These are ignored local output, not additional project documents. Full backend/tooling regression,
frontend/browser, live providers, deployment and external qualification were Not Run for this package.

Executor reviewed the actual diff and new files, HTTP middleware order, retained export consumers,
private persistence, narrow string-id adapters, original notification keys/payloads, model/schema/index
normalization and purpose-specific security fences. Type/format/docs/whitespace checks are recorded
on the final revision. P03-028 completes WP04 under Tasks §2. Next: WP05 audit/notification/media
foundations; P03-022 and application/external/milestone acceptance remain unchanged.

## P03-029 — Completed WP00–WP04 review and corrections, 3 November 2026

Owner requested a full review of completed refactor packages after identifying naming and file
fragmentation concerns. Input revision: `5090fec`, clean tree on `codex/backend-refactor-wp03`.
Executor/reviewer: Codex. This is a correction/review of completed engineering packages, not WP05
implementation, a new business feature or backend-stage acceptance. Historical package results above
remain accurate for their recorded revisions; this section supersedes their affected source paths.

### Review findings and dispositions

| Package | Finding                                                                                                                                                                                                 | Disposition                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP00    | Historical baseline/operation/model inventory remains evidence of its input revision, not a current filesystem manifest.                                                                                | Preserved it; checked actual current consumers before moves and recorded explicit successor paths in Plan §4.1. No baseline regeneration conceals changes.                                                                                                                                                                                                                                                              |
| WP01    | Public/private/composition/shared/provider/cycle checks work, but import direction alone cannot establish file cohesion or consistent names.                                                            | Rechecked the existing positive/negative suite; updated obsolete customer/delivery fixture paths. Migrated another 27 admin-access consumers to the existing public type and removed their exact allowances, never renamed them into new permissions.                                                                                                                                                                   |
| WP02    | Configuration/technical crypto ownership is sound; proofHash still contained an opaque nested namespace ternary inherited from the original implementation.                                             | Replaced it with a private named namespace map; all five purposes, default and legacy fallback match the original hash output. AEAD/key/binding behavior stays untouched.                                                                                                                                                                                                                                               |
| WP03    | Delivery coverage factories were separated into a second service file despite sharing the same feature/persistence owner; factory/controller names did not follow a consistent construction convention. | Consolidated management/coverage into delivery.service.ts, removed delivery-coverage.service.ts, migrated all consumers and aligned createDeliveryService/createDeliveryController/router names. Replaced transition-input nested branching with explicit local guarded branches.                                                                                                                                       |
| WP04    | Auth credential service was named as customer service; customer service was named only as profile service. Audience-only routers and related account capabilities remained unnecessarily fragmented.    | Singular credential.* files with CredentialService/createCredentialService; CustomerService/createCustomerService in customers. Customer/admin credential routers share credential.routes.ts, and customer/admin management routers share customer.routes.ts. Admin/customer/media account access now shares account-access.service.ts. Security administration is explicitly account-management.service.ts/.schema.ts. |
| WP04    | Root assembly, proof policies, canonical identity ownership and technical health placement were already correct after the prior package.                                                                | Retained them. Independent router factories keep the original activation/guard order. Distinct email verification/change, recovery and guest policies are not mechanically collapsed to match an illustrative tree.                                                                                                                                                                                                     |

The review found a concrete organization/readability gap, not evidence that multiple files are
universally wrong. The recorded Architecture §6.2/Plan §4.1 rules now identify the adopted owners'
canonical files and explain that audience alone does not justify separate HTTP files. A proposal
is not a mandate to generate every optional file or merge independent security/financial policies.
No task/stage acceptance was inferred from a test count or folder tree alone.

### Concrete changes and preservation

- Auth: two audience credential route files → one credential.routes.ts; credential service/controller/
  schema filenames and exported service/type names agree. Two account-access files → one owned file;
  security administration has an explicit account-management basename. Actual constructors remain
  cohesive capabilities over the same canonical identity, not a generic CRUD service.
- Customers: profile/admin route files → customer.routes.ts; controller/service factories identify the
  customer feature. Different router factories preserve distinct activation and server-side access.
- Delivery: coverage/management source → delivery.service.ts, with narrow public contracts unchanged.
  Existing canonical models/indexes and address/checkout/area-read semantics are retained.
- Updated setup, composition, all runtime/type consumers, existing test imports and executable API
  contract-generation/route-inventory inputs together. Removed obsolete files instead of leaving
  forwarding adapters/barrels. Duplicate imports of moved owners were consolidated in nine consumers.
- Source inventory decreases by **four files**: 435 → 431 checked source files. Auth 42 → 40,
  customers 5 → 4, delivery 8 → 7; health remains two technical files. No source scaffolding, test file,
  package, collection, HTTP operation or environment key was added by this correction.
- All 27 removed allowances were stale private AdminAccountAccess imports. **292 remain: 291 exact
  import signatures and one type-cycle component** for later packages. Zero new allowances.
- Independent source comparison verifies ten moved service-function bodies unchanged: admin
  transaction/account/media authorization, customer account access, account management, credential
  operations, customer profile/address/intake operations, and all three delivery coverage factories.
  Fifty-nine canonical persistence/API-artifact/manifest inputs retain their pre-review bytes or
  original WP00 artifact fingerprints. Seven proof namespace/default/fallback outputs match.

API/Database/Operations behavior and procedures did not change. No frontend application work was
started. Existing operator scripts retain their entry points; clean build removes obsolete compiled
source paths. Existing test matrices remain meaningful: no redundant test file was identified for
safe removal and no security/concurrency assertion was deleted to reduce file count.

### Observed verification

Node v24.20.0/npm 11.19.0; isolated replica-set MongoDB 8.0.16 with
`MONGOMS_DISTRO=ubuntu-24.04`. Loopback/process suites ran outside sandbox restrictions. No live
provider, production/developer data or irreversible financial effect was used.

| Command/check                                                                                                                 | Observed result                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck --workspace=backend`                                                                                       | Passed on final source, including updated tests/contracts                                                                                                                            |
| `npm run build --workspace=backend`                                                                                           | Passed; clean dist contains canonical renamed/consolidated owners                                                                                                                    |
| `npm run lint --workspace=backend`                                                                                            | Passed: 484 files                                                                                                                                                                    |
| `npm run lint:boundaries`                                                                                                     | Passed: 431 source files, zero errors, 292 exact allowances                                                                                                                          |
| `npm run format:backend`                                                                                                      | Passed: 500 files                                                                                                                                                                    |
| `node --test --test-isolation=none --test-name-pattern='BOUNDARY\|STRUCTURE\|TOOL-0[1-5]' tests/tooling/development.test.mjs` | Passed: 49 cases after actual fixture-path updates                                                                                                                                   |
| Affected unit selection                                                                                                       | Passed: 314 cases / 15 files; after proof readability cleanup only its three affected unit consumers were rerun, all 50 Passed. These are overlapping cases, not 364 distinct tests. |
| Consolidated affected integration selection                                                                                   | Passed: all 856 cases / 24 files in one clean run, including the corrected index-parser case from WP04                                                                               |
| `npm run test:contract --workspace=backend`                                                                                   | Passed: all four generated artifacts fresh, all 186 contract cases; executable route inventory follows both route consolidations                                                     |
| `npm run test:smoke --workspace=backend`                                                                                      | Passed: compiled config-redaction/startup/live/restricted-ready/shutdown                                                                                                             |
| Source/policy preservation comparison                                                                                         | Passed: 59 persistence/artifact/manifest inputs, ten moved function bodies, seven proof namespace cases                                                                              |

Unit arguments under `tests/unit/`: admin-auth, app, auth-rate-limit, browser-security, composition,
container-health, delivery, email-change, guest-access, identity-contracts, notifications, passwords,
profile, recovery, sessions (each with `.test.ts`). Command:
`npm run test:unit --workspace=backend -- <listed paths> --reporter=default --reporter=json --outputFile=../test-results/backend-refactor/completed-review-unit.json`.
The post-cleanup three-file command used recovery/email-change/guest-access and wrote
`completed-review-proof-unit.json`. Passing unchanged consumers were reused, not rerun for appearances.

Integration arguments under `tests/integration/`: admin-auth, auth-rate-limit, authorization,
browser-security, customer, email-change, email-verification, guest-access, identity, profile,
recovery, sessions, notifications, composition, runtime, checkout-quote, cart, wishlist, media,
settings, category-admin, product-admin, delivery, database (each with `.test.ts`). Command:
`MONGOMS_DISTRO=ubuntu-24.04 npm exec --workspace=backend -- vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/backend-refactor/completed-review-integration.json <listed paths>`.
All file arguments include their `tests/unit/` or `tests/integration/` prefix. Table escaping is
Markdown only; the Node test filter uses literal `|`.

Artifacts: [unit](../../test-results/backend-refactor/completed-review-unit.json),
[proof recheck](../../test-results/backend-refactor/completed-review-proof-unit.json),
[integration](../../test-results/backend-refactor/completed-review-integration.json),
[preservation](../../test-results/backend-refactor/completed-review-preservation.json),
[check summary](../../test-results/backend-refactor/completed-review-checks.json).
These are ignored local outputs. Full unrelated backend/tooling regression, frontend/browser,
live providers, deployment and external qualification were Not Run; later modules still have their
explicit remaining refactor packages and migration allowances.

Executor reviewed the final actual diff/new paths, old-path consumer searches, middleware and
activation ordering, canonical registration/contract fingerprints, purpose-bound proof behavior,
transaction/revocation/audit fences and negative boundary fixtures. Final documentation/link,
format and staged/unstaged whitespace checks are recorded with the handoff. P03-029 closes these
completed-package findings under Tasks §2. P03-022 and application/external/milestone gates remain
unchanged. Next planned implementation remains WP05.

## P03-030 — Whole-module structural pass, 3 November 2026

Owner explicitly requested the complete module folder pass first, remaining src work next, outside-src
folders in subsequent batches, and consolidated tests/review/fixes last. Owner prohibited further
commit/push/branch/PR actions. Input revision: `305c463`, initially clean working tree. This record
reports source organization, not verified behavior or package/application acceptance.

### Structural pass delivered

- Twenty actual module owners: auth, customers, catalog, inventory, cart, wishlist, promotions,
  checkout, orders, delivery, payments, returns, refunds, reviews, media, notifications, support,
  settings, reports and audit. No empty template module was created.
- Wishlist is independent of cart. Existing variant model/schema/stock capability files now belong
  under catalog/products; categories remains its sibling. Canonical model/collection identities stay
  in their existing declarations rather than being copied into new models.
- Payments has attempts/collections; refunds has obligations/payouts, with genuine shared aggregates
  at their parent. Distinct verification/reconciliation/risk and payout state machines retain cohesive
  operation implementations instead of being collapsed into an unrelated giant service.
- Consolidated same-owner inventory, promotion, category/product, return, review, setting and audit
  operations; merged notification message builders into one template owner and related media ledger/
  access operations into their actual owner. Services/schemas keep explicit named exports at the end.
- Removed post-placement allocation coordination from checkout ownership into orders' neutral allocation
  capability. Checkout retains quote/intent/placement operations. A separate small consent policy retains
  the shared immutable-digest responsibility and avoids a runtime initialization cycle; it is a real
  shared business leaf, not an empty abstraction.
- Extracted actual HTTP mapping into twenty additional owning controller files. Audit, notification
  management and delivery-exception HTTP were removed from support and placed in their proper owners.
  Root registration uses the existing instantiated capabilities and activation gates. Existing distinct
  customer/admin audiences retain their guard chains and transport entry points.
- Standardized owned service/router factory names and removed collision-generated private export aliases
  where their canonical names were available. Source has no generated absolute-machine imports, new
  any/suppression escape hatch, compatibility barrel or new package/framework.
- Module source count: **275 → 251**. Source-only caller sync touches setup/server, three existing jobs
  and five configuration files where moved/renamed module capabilities are referenced. This is necessary
  reference continuity, not the remaining root/src architecture pass.

Work was prepared in `/tmp/sportzone-module-batch/` and applied only after checking that every original
source file still matched its snapshot. Original source copies and old→new path/symbol inventories are
retained there for the remaining migration, including 881 validated export/path mappings with no
unresolved exported names. This is migration metadata, not behavior verification. No concurrent source
changes were overwritten.

### Actual checks and deferred obligations

| Check                                                                   | Result / limit                                                                                                                                  |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/.bin/tsc --project backend/tsconfig.json --noEmit`        | Passed for src only; this excludes tests/contracts. Not a behavioral or full workspace typecheck.                                               |
| `node_modules/.bin/biome lint backend/src/modules --error-on-warnings`  | Passed: 251 module files                                                                                                                        |
| Module Biome format check                                               | Passed: 251 module files                                                                                                                        |
| Static runtime import graph                                             | Acyclic after extracting the real consent-policy leaf; not proof of per-operation recursion/concurrency behavior                                |
| Model/persistence source literals                                       | 53 mapped model/persistence files retain their non-import string/numeric/regex/boolean/null literal sets; not a database/schema deployment test |
| Tests and test review                                                   | **Not Run**, explicitly deferred by owner                                                                                                       |
| Contract generation, operator commands, build/deployment/live providers | **Not Run** in this pass                                                                                                                        |
| Git commit/push/branch/PR operations                                    | **Not performed**; HEAD remains `305c463`                                                                                                       |

Artifact: [module folder inventory, move map and deferred work](../../test-results/backend-refactor/module-folder-batch.json).
It is ignored local output, not a new test suite or specification. Existing tests, contracts, scripts,
generated API artifacts and CI/boundary tooling were deliberately not edited. Their old import paths,
export names and executable discovery inventories therefore require migration in their requested later
passes; no freshness or passing status is claimed for them. The existing exact allowance inventory is
not a current-path inventory after these moves and must be reconciled with the actual consumer work,
without granting new private-persistence or stock authority.

Remaining src work includes composition/injection, public-capability cleanup and executable boundary
reconciliation; those changes can require module signature adjustments. Outside-src work then updates
actual tests/contracts/operator scripts/tools and aliases. Consolidated functional/security/financial/
concurrency testing, review and fixes follow. Keep final package exits and P03-022 acceptance pending.
The module structural pass is complete; P03-030 remains In Progress for this staged integration and
verification sequence. Historical task/feature acceptance is preserved, not used to certify these moves.


### Remaining-src architecture work — ongoing, 3 November 2026

This is the historical initial checkpoint. The current src outcome is recorded in the [structural closeout below](#src-structural-closeout--3-november-2026); its later verification supersedes this checkpoint for current source inputs.

Owner requested the full src pass next, keeping tests/test review and outside-src migration deferred.
This record describes applied work, not completion of the full source architecture or P03-030.

- Moved environment/provider assembly from server.ts to the existing setup.ts composition root.
  Server retains database/listener/readiness/shutdown lifecycle; routes.ts retains prepared-router registration.
- Replaced foreign HTTP imports of private auth cookie/security/session implementations with injected
  type-only SessionCookies, SessionHttp and browser/throttle capabilities. Cookie minting remains private.
  Checkout/order credentials, principals and generic ownership operations now have independent auth contracts.
- Injected audit write, replay-safe write and operation lookup from root assembly. Preserved the two
  writer modes and moved required capabilities before optional policy/clock arguments. Updated source
  constructor callers and indexed Parameters types; outside-src constructor callers still need migration.
- Added independent capability contracts for existing DTO/string-ID projections in catalog, inventory,
  orders, payments, returns, settings, checkout, media and refunds. Contracts do not derive from service
  implementations or expose models/connections/ObjectId. Consolidated repeated payment funding summary types.
- Separated gateway, media/scanner and email provider protocols from concrete client/private type files.
  Public media references use string IDs, converted inside media before private attachment operations.
- Jobs consume narrow domain capabilities. Reservation expiry now requires an injected expiry capability;
  media maintenance obtains persistence verification through its owner. Payment scheduling options have
  one definition in config/payments.ts, with the historical owner export retained for deferred consumers.
- Extracted actually reused ID/idempotency/text/phone parsing into shared/validation.ts, preserving
  their original expressions and normalization. Business stock/coupon/channel/policy validation remains owned.
- Applied explicit bottom named-export lists and existing source formatting across config/providers/jobs/
  shared/root as well as modules. No package, collection, test suite or tracked architecture guide was added.

| Check                                                                  | Observed result                                                                                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/.bin/tsc --project backend/tsconfig.json --noEmit`       | Passed; src only                                                                                                                          |
| `node_modules/.bin/biome lint backend/src --error-on-warnings`         | Passed; 308 files                                                                                                                         |
| `node_modules/.bin/biome format backend/src`                           | Passed; 308 files                                                                                                                         |
| Static runtime import graph                                            | Acyclic; not functional/concurrency verification                                                                                          |
| `npm run lint:boundaries`                                              | Failed: 325 errors, comprising 47 source dependency violations and 278 stale exact allowances; 14 existing exact allowances remain active |
| Tests, test review, workspace build/contracts/operator/provider checks | Not Run, deferred by owner                                                                                                                |
| Git commit/push/branch/PR mutations                                    | Not performed                                                                                                                             |

Local ignored [src inventory, changed constructor signatures and remaining violations](../../test-results/backend-refactor/src-folder-batch.json)
records 283 changed and nine added source files relative to this pass's pre-edit snapshot. Existing
staged changes were retained; the index was not intentionally modified by the agent.

**Not complete:** Remaining source work includes cross-module schema coupling, private financial/media
capabilities and runtime construction between checkout/orders/payments/refunds/notifications. The 47
reported source edges and 14 active legacy allowances must be assessed and resolved under the approved
boundaries, rather than replaced with broad new allowances. Outside-src scripts/tests/contracts must
then adopt changed imports and dependency arguments; the current source-only pass does not certify
those consumers. Boundary inventory migration, consolidated behavior/security/financial/concurrency
verification and final review remain pending. P03-030 stays In Progress; P03-022 remains unaccepted.


### Src structural closeout — 3 November 2026

The owner requested completion of the remaining src work, retaining the modules → src → outside-src
batches → consolidated tests/review/fix sequence. The **planned src structural phase is complete**.
P03-030 remains In Progress for the outside-src consumer/tooling migration and final verification;
this is not behavior acceptance, a released backend or P03-022 independent closeout acceptance.

Implemented:

- Completed concrete cross-module construction isolation. Checkout, order allocation/snapshots,
  payment processing/retry/reconciliation, correction obligations, audits and notification intents
  receive explicit owner capabilities from setup. Removed unused connection arguments and source
  callers; retained transaction/authorization/replay checks. Simple constructor bindings use bind;
  repeated real allocation/payment/read/schema assembly has a named root helper.
- Kept each validation expression with its owner. Typed builders assemble the original shared schemas
  without copying runtime rules, global setters or a second validation registry. setup exports the
  assembled catalog/cart/wishlist/checkout/intent/inventory/order/read/report bundles and allocation
  binding schema for the deferred contract/fixture migration.
- Removed public-contract type cycles. Public proof/DTO contracts are independent of private
  implementations, with ClientSession as the only permitted Mongoose boundary type. Shared stock and
  coupon allocation records have canonical DTO declarations; discarded unconsumed public surfaces.
- Converted cross-owner proof/notification/media identities to strings. Auth and notifications retain
  their private storage authority; media maps immutable claim evidence and scopes in the same
  transaction. Returns no longer receives a private media document or performs media persistence checks.
- Finished Returns controller extraction, reused its authorization input helpers, and reused password
  recovery HTTP mapping for both audiences. Replaced numeric/generic handler names with operation names.
  Routes retain registration and middleware order; controllers retain HTTP mapping.
- Standardized source declaration/export placement and removed unused dependencies and imports.
  Final src contains twenty modules and 311 TypeScript files. Only three files were added in this pass:
  customer.public.ts, promotion.public.ts and return.controller.ts, each with actual consumers.

Environment: Node v24.20.0, existing locked TypeScript/Biome configuration; no database or provider
operation. Changes preserve initial staged edits; the agent did not stage, commit, push, switch branches
or change a PR. Tests, test review, contracts, API artifacts, scripts and tooling files were not edited.

| Executed source check                                                                  | Observed result                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node_modules/.bin/tsc --project backend/tsconfig.json --noEmit`                       | Passed; excludes deferred tests/contracts                                                                                                                                                                                |
| `node_modules/.bin/biome lint backend/src --error-on-warnings`                         | Passed; 311 files                                                                                                                                                                                                        |
| `node_modules/.bin/biome format backend/src`                                           | Passed; 311 files                                                                                                                                                                                                        |
| Existing `checkBoundaries()` source-policy inspection                                  | Passed: no source errors, zero migration violations, zero active legacy allowances; type and runtime graphs are acyclic                                                                                                  |
| `npm run lint:boundaries` / unfiltered checker result                                  | Failed solely for 292 stale allowance entries in the deferred outside-src inventory; the tracked inventory was not modified or widened                                                                                   |
| `node /tmp/sportzone-src-completion/source-invariants.cjs`                             | Static preservation check Passed: 54 model/persistence literal inventories, 223 route registrations and 1,664 Zod constructor calls retained. This is not runtime validation, a database test or API contract acceptance |
| Runtime/unit/integration/contract/security/financial/concurrency tests and test review | Not Run; deferred by owner                                                                                                                                                                                               |
| Full workspace typecheck/build/artifact generation/operator/provider checks            | Not Run; outside-src consumers still require migration                                                                                                                                                                   |

The source-policy inspection calls the existing exported checker and reports the known outside-src
stale inventory separately; it does not bypass or relabel the failing repository gate:

```javascript
const result = checkBoundaries()
const stale = result.errors.filter(error =>
  error.startsWith('scripts/ci/backend-boundary-allowances.json: remove stale '),
)
const sourceErrors = result.errors.filter(error => !stale.includes(error))
// Observed: sourceErrors [], migrationViolations [], remainingAllowances 0, stale.length 292.
```

[Local ignored source closeout inventory](../../test-results/backend-refactor/src-completion.json)
contains the source fingerprint, 48 changed constructor/function signatures, 34 schema export migration
entries and the preservation/boundary results. Combine it with the earlier module export/move ledger
when migrating outside-src consumers. The previous 47 source violations are resolved; no new allowance
was introduced to obtain that result. The approved inventory→catalog stock-only exception remains the
canonical capability boundary, not a legacy migration allowance.

Next work is exclusively the owner-requested outside-src batches: migrate actual tests/helpers,
contracts/artifact discovery, operator/build scripts and CI/boundary inventory/negative fixtures.
Then execute consolidated backend behavior/security/financial/concurrency regression, review and fixes.
Do not mark P03-030 or backend closeout Done from source-only checks.


### Outside-src structural closeout — 3 November 2026

Owner-authorized outside-src batch following module/src organization. This supersedes the earlier
outside-src migration deferral and stale-boundary result; historical verification remains unchanged.

- Migrated contracts, test fixtures and operator callers to current named exports and root-wired
  capabilities. Root setup shares actual dependency assembly with these consumers.
- Grouped 102 unit/integration files by owner. Split the former checkout-quote integration file's
  339 scenario declarations into 19 workflow files with 11 reusable commerce fixture parts and
  explicit lifecycle registration. Recursive Vitest discovery remains intact.
- Retained all 41 operator entry paths. Shared the identical positive-integer environment parser;
  synchronized Docker COPY/context rules and CI runtime inputs with its script-library dependency.
- Retired the 292 stale boundary allowances and their waiver mechanism. Updated existing negative
  fixtures; private imports and cycles remain errors. These fixtures have not been executed yet.
- Updated existing Architecture, Testing, Operations, README and refactor-plan sections. No package,
  business behavior, collection, public route or generated API contract change is intended.

| Verification                                                                           | Observed result                                                                                                                            |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck --workspace=backend`                                                | Passed; full source/tests/contracts compilation                                                                                            |
| `npm run lint --workspace=backend`                                                     | Passed                                                                                                                                     |
| `npm run format:backend`                                                               | Passed after formatting existing export lists and migrated files                                                                           |
| `npm run build --workspace=backend`                                                    | Passed                                                                                                                                     |
| `npm run api:generate --workspace=backend` and `npm run api:check --workspace=backend` | Passed; four artifacts byte-identical to pre-batch copies                                                                                  |
| `npm run lint:boundaries`                                                              | Passed; 419 files, zero errors and zero allowances                                                                                         |
| Static preservation inventory                                                          | Passed: 1,456 case declarations, 51 describe declarations, 4,950 expect calls and lifecycle-hook counts retained; not runtime verification |
| Script syntax/import/signature inspection                                              | Passed: 42 script files, 183 named bindings and 211 constructor calls; operators not executed                                              |
| Unit/integration/contract/tooling/smoke tests and semantic test review                 | Not Run; owner deferred to final tests/review/fix phase                                                                                    |
| Docker image/runtime, database and external-provider qualification                     | Not Run                                                                                                                                    |

Local environment: Node v24.20.0 and existing locked tools. No Git staging, commit, push, branch or PR
mutation. [Ignored structural inventory](../../test-results/backend-refactor/outside-src-completion.json)
records the migration and preservation checks. P03-030 remains In Progress until consolidated final
verification/fixes; P03-022 and all external/application/milestone acceptance remain unchanged.


### Final backend verification and corrections — 3 November 2026

Owner authorized the deferred consolidated tests/review/fix phase. Input HEAD was `a40a958`; the
corrections below remain uncommitted. No staging, commit, push, branch or PR mutation was performed.
This closes local regression work, superseding the earlier test deferral; image verification remains
blocked and P03-022/provider/stage acceptance is not granted.

**Findings and corrections:**

- Public auth proof-delivery contracts correctly use detached string IDs, but their private queries
  passed those strings into strict ObjectId setters. Convert challenge/user/order/notification IDs
  inside their owning auth persistence queries. Kept encryption, scope, expiry, revision, audience,
  replay, transaction and fail-closed behavior intact. Recovery, admin recovery, email change,
  verification and guest suites plus actual application/worker consumers pass after correction.
- Updated the existing route-file parity inventory for consolidated owner routers, including Audit,
  Notifications and Wishlist. The registry still verifies all 170 operations; no test was removed.
  Updated two stock-capability negative fixtures to the canonical catalog/products path without
  weakening the checker or introducing migration allowances.
- Reviewed the scanner's historical/current AES-GCM compatibility ciphertext findings. The vector
  uses the explicitly public sequential synthetic key in the persisted-codec test. Added only the
  two exact finding fingerprints to `.gitleaksignore`; no file/directory/rule-wide credential waiver.
  Final source/history scan and dependency audit pass with zero findings/advisories.

**Observed execution, Node v24.20.0 and existing locked tools:**

| Check                                                                                                                                                                   | Result                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run ci -- --scope=backend`                                                                                                                                         | Initial sandbox run failed on prohibited local listeners/process behavior. Permitted run reached 90/92 tooling cases; two obsolete path fixtures failed, then were corrected. The original CI report remains Failed; it is not relabeled as an all-green pipeline |
| `npm run test:unit` (permitted, after fixture corrections)                                                                                                              | Passed: 92 tooling cases                                                                                                                                                                                                                                          |
| `npm run test:unit --workspace=backend` (permitted)                                                                                                                     | Passed: 814 cases, 51 files                                                                                                                                                                                                                                       |
| `npm run test:contract --workspace=backend` (permitted, after inventory correction)                                                                                     | Passed: 186 cases and four-artifact freshness                                                                                                                                                                                                                     |
| `npm run test:integration --workspace=backend` (permitted)                                                                                                              | Full run: 1,197 Passed / 76 Failed, 70 files; all eight failing files covered by passing rechecks below                                                                                                                                                           |
| Existing Vitest integration command selecting auth/{email-change,recovery,admin-auth,guest-access,email-verification}, reviews/reviews and orders/cancellation-workflow | Passed: 156 cases, seven files after the auth correction and completed build                                                                                                                                                                                      |
| Existing Vitest integration command selecting application/{composition,backend-completion} and notifications/notifications                                              | Passed: 27 cases, three files; includes the eighth initially failing file and direct application/worker consumers                                                                                                                                                 |
| Combined distinct integration coverage                                                                                                                                  | 1,273 cases have passing observations. Rechecks overlap earlier passing cases; do not add run totals as distinct tests or describe the original full run as Passed                                                                                                |
| `npm run typecheck --workspace=backend`; `npm run build --workspace=backend`                                                                                            | Passed after source correction                                                                                                                                                                                                                                    |
| `npm run lint --workspace=backend`; `npm run format:backend`; `npm run lint:boundaries`                                                                                 | Passed; 419 boundary inputs, zero violations/allowances                                                                                                                                                                                                           |
| `npm run test:smoke --workspace=backend` (permitted, final rebuilt output)                                                                                              | Passed: redacted invalid configuration, real isolated DB startup, liveness/restricted readiness, shutdown                                                                                                                                                         |
| `npm run test:security` (permitted, reviewed exact fingerprints)                                                                                                        | Passed: source/history scan, zero dependency advisories                                                                                                                                                                                                           |
| Static preservation and operator inspection                                                                                                                             | Passed: 54 model/persistence literal inventories, 223 route registrations, 1,664 Zod constructor calls; 1,456 scenario declarations, 4,950 expect calls, unchanged hooks/API artifacts; 41 operator paths, 183 named bindings and 211 constructor calls retained  |
| `node scripts/ci/container.mjs` (permitted)                                                                                                                             | Blocked: permission denied connecting to Docker socket. `sudo -n docker version` also requires interactive authentication; no socket permissions or host configuration changed                                                                                    |

Two bootstrap failures occurred because the executor incorrectly overlapped a clean build with
integration subprocesses: one explicitly reported missing `dist/config/database.js`. The affected
bootstrap suites passed after build completion; no persistence/production safeguard was weakened.
All database runs use isolated MongoDB 8.0.16 wiredTiger replica sets; no external database or real
email/payment/refund was used. Sandbox failures are retained separately from permitted execution.

Executor review checked the actual correction diff, canonical persistence/privacy, public route and
schema parity, explicit fixture lifecycle, script packaging/discovery and unchanged business/financial
rules. No new scenario suite, runtime package, collection or speculative source reorganization was added.
Local rollback is reversal of these uncommitted changes and rebuilding; no migration or financial
rollback is required or authorized.

[Observed command logs and aggregate result](../../test-results/backend-refactor/final-verification/summary.json)
retain initial failures and passing rechecks. P03-030 remains In Progress solely for the unavailable
Docker image build/runtime check. A Docker-capable runner must execute the existing container command;
P03-022 independent acceptance and P04-003/P09-011 external qualification remain separate.


### Owner-authorized refactor closeout and environment cleanup — 3 November 2026

Owner instructed that Docker verification is not needed now and requested refactor completion, plus
simple professional env/package organization and usable defaults. P03-030 is Done under Tasks §2;
this explicitly supersedes its previous Docker-blocked In Progress status. The image check remains
unverified/deferred, not Passed; container CI/release requirements are unchanged. P03-022 independent
backend-stage acceptance and all provider/deployment/milestone gates remain separate.

- Organized all 118 root template keys by responsibility, moving previously appended settings into
  their owning groups. Kept .env private/ignored with owner-only permissions; preserved every existing
  nonempty value, including credentials and activation flags. No private value was printed or recorded.
- Added explicit local technical timings: customer/admin sessions 3600/1800 seconds, browser context
  300 seconds, proof lifetime/cooldown/floor 600s/60s/100ms, guest session 3600 seconds and quote lifetime
  900 seconds. Existing timeout/retry/batch defaults remain. Template MongoDB URI targets a local rs0
  replica set; an actual running replica set or the URI from db:local is still required.
- Left credentials and approval-dependent policies/evidence explicit. Did not invent merchant/channel,
  scanner, retention or legal approvals or enable unavailable integrations. Private proof-key material
  is preserved; missing private keys are generated independently only inside the ignored local file.
- Grouped root/backend manifest scripts by purpose and sorted dependency declarations. Retained every
  command, package/version and workspace; updated the root description. Lockfile/CI inventory require
  no changes because execution and dependency sets are unchanged. README explains template defaults.

Verification: private compiled loadEnvironment validation Passed with values withheld; sanitized
example validation with ephemeral in-memory security keys Passed; env inventory and nonempty-value
preservation Passed; manifest script/dependency equality against HEAD Passed; workspace resolution,
manifest formatting, repository links and diff checks Passed. No backend runtime behavior changed in
this cleanup; the preceding final regression results remain applicable and were not needlessly rerun.
No database/provider connection or migration is implied by environment validation. No staging, commit,
push, branch or PR mutation was performed; existing staged edits were preserved.


### Environment examples, workspace formatting and backend-stage CI — 3 November 2026

Owner requested visible backend format scripts, illustrative env templates versus actual private
values, and frontend CI steps commented until their work resumes. Added workspace format/format:check
for backend source, tests, scripts, contracts and root TS/JSON config; included the check in the actual
backend CI inventory. Existing JSON configuration formatting changed only whitespace.

Local/staging templates now show placeholders for credentials, reserved example domains and illustrative
policy paths/limits. These are examples, not approvals or available integrations. Root private env keeps
actual values; private staging organization preserves existing nonempty values and fills only technical
settings, without copying illustrative provider credentials/evidence. Unknown externally issued values
remain unconfigured; no real merchant/scanner/policy outcome is fabricated. README describes setup.

Hosted CI keeps the stable required job, security/backend regression, repository metadata and conditional
backend image gate. Frontend environment/browser-install/affected-scope execution steps are commented
with restoration instructions. Local full inventory, frontend checks and integrated acceptance remain
intact. Testing/Operations owning procedures explain the temporary stage selection. No application or
milestone acceptance is inferred from backend-only hosted success.

Verification: existing tooling suite Passed 92 cases including active-workflow (comments excluded)
assertions; backend format:check Passed 508 files; YAML parsing confirmed active backend/security scope
and no browser install. Workspace/configuration inventory, private configuration validation and repository
links/diff checks verified. Existing backend regression evidence is reused: no runtime business behavior
changed. No CI job or hosted provider was executed; no commit/push/index change was performed.


### Backend lint fix/check naming — 3 November 2026

Owner chose four workspace commands: lint applies Biome safe lint fixes; lint:check checks without
writes; format applies formatting; format:check checks it. Backend CI inventory uses lint:check.
Workspace inventory validation requires the check-only entry when a workspace declares it, preserving
other applications' existing lint convention. No dependency or runtime changes. Lint:check (503 files),
format:check (508 files), executable backend CI-plan validation and repository/diff checks Passed.
Private local configuration validates with all feature flags off and a configured database URI;
connectivity/provider qualification was not tested. Existing actual private values were not modified.

### P03-031 — Backend test refactor, 4 November 2026

The initial organization-only work and its full-run results below are historical. The owner rejected
that approach as insufficient; the correction subsection records substantive pruning and the current
verification. The initial callback-preservation totals do not describe the corrected current suite.

Owner requested a careful backend-wide test review and cleanup, including justified merges, removals
and additions. The initial working tree was clean. Reviewed all 140 TypeScript test/helper files,
runner discovery, helper consumers, Architecture §§4/6 and Testing §§3/5.2/15.5. Unit and integration
names shared by a domain are not redundant: they prove distinct validation/persistence boundaries.
No byte-equivalent test callback duplicates were found in the source inventory.

Changes and executor review:

- Split the 1,886-line placement/funding suite into checkout quote, COD placement, allocation lifecycle,
  reservation expiry and payment-owned hosted-init HTTP suites. Each retains explicit fixture setup.
- Split the mixed application commerce suite into customer projections, payment receipt matching and
  customer refund requests. The IDE-referenced refund-request-workflow.test.ts now exists under refunds.
- Separated refund dispatch, protected payout evidence and reconciliation from payout state transitions.
  Kept distinct reservation/advisory and existing unit/contract cases; no new financial policy or runtime
  code, provider call, package, configuration, persistence model or collection was introduced.
- Found three mobile-wallet scenarios registered at import time inside commerce/refunds.ts. Moved
  their existing loop to payout-workflow.test.ts so only its owning suite registers them. Helpers now
  contain no it/test/describe registration calls. Existing assertions in fixture setup remain intact.
- Removed commerce/application.ts after moving matching fixtures into payments.ts and customer refund
  HTTP fixtures into refunds.ts. Migrated every consumer, including support complaints. Removed eight
  unused context resource setters and the unconsumed category getter; time remains adjustable for deadline/retry scenarios.
- Reviewed helper exports against actual named-import consumers: no unconsumed named helper exports.
  Compared TypeScript-printer-normalized callback fingerprints against HEAD across all test/helper
  files: 1,318 before and after, zero missing, added or changed callback bodies. This is preservation
  evidence, not a substitute for executing the suites. The scripts used for this one-time audit lived
  in /tmp; no generated audit tooling was added to the application.
- Existing Vitest unit/integration/contract discovery globs include every moved file. Scripts, test
  timeouts, CI inventory and dependency versions are unchanged. Testing §5.2 now records fixture
  registration ownership. Historical evidence/path references remain historical.

Verification environment: Node v24.20.0, local Linux, MongoDB 8.0.16 isolated single-node wiredTiger
replica sets with generated test-only database identities and synthetic provider/email boundaries.
Sandbox EPERM prevented local HTTP/MongoDB port binds; approved outside-sandbox reruns use the same
local commands. They do not establish real merchant, staging, Docker or backend-stage acceptance.

| Command / check | Observed result |
| --- | --- |
| npm run typecheck --workspace backend | Passed |
| npm run build --workspace backend | Passed |
| npm run lint:boundaries | Passed: 419 source files, zero errors/legacy allowances |
| npm run lint:check --workspace backend | Passed |
| npm run format:check --workspace backend | Passed |
| npm run test:unit --workspace backend | Initial sandbox: 756 Passed, 58 port-bind failures; 46/51 suites Passed |
| npm run test:unit --workspace backend -- tests/unit/infrastructure/container-health.test.ts tests/unit/auth/auth-rate-limit.test.ts tests/unit/application/app.test.ts tests/unit/auth/identity-contracts.test.ts tests/unit/operations/operations.test.ts | Passed outside sandbox: all 172 cases in the five affected suites; all 814 distinct unit cases have passing observations |
| npm run test:contract --workspace backend | Passed outside sandbox: API artifacts current, 186 cases |
| npm run test:integration --workspace backend | Passed outside sandbox: 79 suites, 1,258 cases in 329.24s; JSON report: test-results/database.json. Initial sandbox run: 78 suites failed setup/transport, 1 Passed; 3 Failed, 5 Passed, 1,250 not executed |
| npm run test:smoke --workspace backend | Passed outside sandbox: redacted invalid configuration, real DB startup, live/restricted-ready probes and graceful shutdown; initial sandbox child-process output was unavailable |
| npm run lint | Passed: repository structure/Markdown/local links |
| git diff --check | Passed |

Executor reviewed relocation/import diffs, preserved callback fingerprints, helper consumers and final
check output. No runtime source or API/Database/Operations contract changed. No application build or
browser tests for either frontend were run because this work is backend-test-only. External provider,
Docker and staging qualification were not run. P03-031 is Done under the owner-authorized engineering
convention in Tasks §2; P03-022 and external/milestone gates remain unchanged.


#### Owner correction — remove redundant test code

The owner clarified that the goal was to read/refactor test code against the current backend and
remove cases with no distinct value, rather than add files or preserve every test. Inspected current
category/product services, persistence initializers, bootstrap scripts, application assembly and API
registry generation alongside their tests. Preserved the owner's staged work; these corrections are
working-tree changes on top, with no index/commit mutation.

| Removed code | Retained verification / reason |
| --- | --- |
| 15 repeated compiled-bootstrap cases across catalog, promotions, checkout, payment, order, refund, review and application suites | The existing backend-completion scenario now runs the 21 actual bootstrap entry points once for success and once against valid deployed configuration for refusal. Existing category/product, coupon hold, quote, intent, order/item balance, payment attempt/initiation and review scenarios directly reinitialize persistence and inspect retained state. Refund predecessor/history migration cases already exercise repeated initialization. Distinct worker/migration/qualification tests remain. |
| Category parent omission/null reassignment and mutual-reparent/lost-edit cases at the lower service layer | Existing category-admin HTTP scenarios already exercise the same production service with real sessions, CAS and MongoDB, including concurrent administrators. Deep cycles, deletion versus child creation, private media/corrupt ancestry and low-level persistence constraints remain. |
| Synthetic CategoryProductFixture model/collection and its association/deletion race | The existing products integration scenario races actual createProductService association against category deletion with canonical product/variant models. No fabricated substitute collection is needed. |
| Identity-only Markdown route parser/count and synthetic default-route probe | The whole API contract suite already compares actual routers with the full specification; app transport tests cover absent routes. Kept real request/response schema and identity protection tests. |
| Empty local-only route parity test | localOperations and localOnlyRouters are empty in the current backend; assertions compared empty arrays and the loop executed zero times. Full active/specification router parity remains. |
| Three extra refund dispatch/evidence/reconciliation files from the initial split | All used the same commerce lifecycle fixture. Merged their unchanged cases into the existing payout suite, with one fixture initialization and explicit import cleanup. |

No new test case or test folder was added. Static it/test call inventory falls from 1,318 to 1,298;
parameterized/runtime case totals are separate. The correction removes about 530 net test-code lines
and three test files relative to the staged initial refactor. Removed fixed 170-operation counts in
favor of the actual registry length, retaining parity checks. Runtime sources, packages, database/API
contracts, financial state transitions and provider activation are unchanged.

Verification: local Linux, Node v24.20.0, isolated MongoDB 8.0.16 replica sets and local HTTP; commands
requiring local ports ran outside the sandbox. Existing unchanged consumer results from the initial
run are reusable under Testing §15.5; a fresh full backend/application/release pass is not claimed.

- `npm run test:unit --workspace backend -- tests/unit/auth/identity-contracts.test.ts`: Passed, 72 cases.
- `npm run test:contract --workspace backend`: Passed, generated artifacts current, 185 cases.
- Affected integration selection below: first run 311 Passed, two comparison failures and one setup
  failure (314 selected cases). Corrected fixture-only issues: flatten Mongoose Maps before comparing
  lean snapshots, and disable the local-only order-read flag in the deployed refusal fixture. Reran
  only the three affected cases; all three Passed. Every one of the 314 selected cases has a passing
  observation; no financial assertion was removed to resolve a failure.

```sh
npm run test:integration --workspace backend -- tests/integration/application/backend-completion.test.ts tests/integration/application/composition.test.ts tests/integration/catalog/categories.test.ts tests/integration/catalog/category-admin.test.ts tests/integration/catalog/product-admin.test.ts tests/integration/checkout/checkout-quote.test.ts tests/integration/checkout/cod-placement.test.ts tests/integration/checkout/checkout-intent.test.ts tests/integration/promotions/coupon-admin.test.ts tests/integration/promotions/coupon-allocation.test.ts tests/integration/payments/payment-records.test.ts tests/integration/payments/payment-initiation.test.ts tests/integration/payments/payment-callback.test.ts tests/integration/payments/payment-correction-migration.test.ts tests/integration/orders/orders.test.ts tests/integration/reviews/reviews.test.ts tests/integration/refunds/payout-workflow.test.ts
npm run test:integration --workspace backend -- tests/integration/application/backend-completion.test.ts tests/integration/orders/orders.test.ts tests/integration/checkout/checkout-quote.test.ts -t 'creates guest pending order|creates a scope-bound guest quote|assembles every contracted endpoint'
```

The three-case recheck Passed; its other 55 cases were filtered out intentionally, not reported as
fresh passes. The broader run took 51.90s and the recheck 16.27s. Those observations are not a controlled
before/after speed benchmark. Raw local outputs: /tmp/sportzone-test-pruning-integration.log,
/tmp/sportzone-test-pruning-recheck.log, /tmp/sportzone-test-pruning-unit.log and
/tmp/sportzone-test-pruning-contract.log. The integration script writes test-results/database.json;
that report contains only the latest selected run, not the earlier full regression.

Final checks Passed: `npm run typecheck --workspace backend`, `npm run lint:check --workspace backend`,
`npm run format:check --workspace backend`, `npm run lint:boundaries` (419 source files, zero errors),
`npm run lint` (853 repository files, 1,651 links, zero errors) and `git diff --check`. Executor reviewed
removed-case dispositions, retained safety checks, direct persistence comparisons and import/discovery
changes. Removed a redundant self-count assertion during final contract review and rechecked that
router-parity case. P03-031 correction is Done under Tasks §2. No runtime rebuild/smoke, unchanged
application suites, frontend/browser or external-provider verification was repeated.
