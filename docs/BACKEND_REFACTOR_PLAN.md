# SportZone — Backend refactor plan

**Date:** 3 November 2026 (Asia/Dhaka)\
**Status:** Planning complete; implementation not started by this document\
**Scope:** The complete backend application, its contracts, workers, scripts, tests and affected repository tooling\
**Decision basis:** Project-owner discussion, domain/workflow analysis and repository inspection\
**Execution register:** [Tasks](./TASKS.md#2-task-management-conventions)

## Contents

- [1. Purpose, authority and scope](#1-purpose-authority-and-scope)
- [2. Baseline and planning assumptions](#2-baseline-and-planning-assumptions)
- [3. Target structure and ownership](#3-target-structure-and-ownership)
- [4. Files, naming and reuse](#4-files-naming-and-reuse)
- [5. Communication, composition and workflow coordination](#5-communication-composition-and-workflow-coordination)
- [6. HTTP, security and configuration](#6-http-security-and-configuration)
- [7. Persistence, transactions and external effects](#7-persistence-transactions-and-external-effects)
- [8. Jobs, operations and performance](#8-jobs-operations-and-performance)
- [9. Migration and compatibility protocol](#9-migration-and-compatibility-protocol)
- [10. Work packages and dependencies](#10-work-packages-and-dependencies)
- [11. Verification and evidence](#11-verification-and-evidence)
- [12. Risks and decision controls](#12-risks-and-decision-controls)
- [13. Completion and final review](#13-completion-and-final-review)
- [14. Engineering references](#14-engineering-references)

## 1. Purpose, authority and scope

Refactor SportZone into a readable, cohesive, feature-based modular monolith with explicit dependencies,
private persistence, reusable business capabilities and enforceable boundaries. Success means a change
has an identifiable owner and bounded impact; a tidy directory tree alone is insufficient.

This is a distinct, whole-backend migration plan linked from [Implementation Plan §3.6](./IMPLEMENTATION_PLAN.md#36-engineering-foundation-and-incremental-refactor).
It records the owner-selected target and executable work packages, not a second task-status register.
Permanent architecture rules must be reconciled into [Architecture §§4–6](./ARCHITECTURE.md#4-project-structure)
before affected implementation. After execution, enduring rules stay in their owning specifications;
this document retains the migration rationale and sequence. Historical accepted work is not rewritten.

The following remain authoritative for their respective subjects:

| Source | Subject |
| --- | --- |
| [PRD](./PRD.md) | Business scope, policy and acceptance; assess suspected defects instead of copying them into code. |
| [Architecture](./ARCHITECTURE.md) | Technical ownership, trust boundaries and accepted design decisions. |
| [Database](./DATABASE.md) | Collections, fields, indexes, validators, atomicity and retention. |
| [API](./API.md) | Public HTTP/authentication/CSRF/error/DTO/idempotency contracts. |
| [Testing](./TESTING.md#155-change-based-local-verification) | Applicable verification and evidence procedures. |
| [Operations](./OPERATIONS.md) | Runtime configuration, activation, deployment, reconciliation and recovery. |
| [Tasks](./TASKS.md) | Actual task IDs, dependencies, progress and acceptance evidence. |

Included: `backend/src`, `backend/tests`, `backend/contracts`, generated `backend/api` parity,
`backend/scripts`, runtime packaging and directly affected boundary/CI/development tooling.
Frontend implementation is outside scope; inspect and preserve any existing test/tool consumers of
backend entry points without treating that compatibility work as a frontend refactor stage.

Keep Node/TypeScript/Express/Mongoose/Zod, Biome, Vitest, npm workspaces and the locked dependency graph.
No microservices, new package/framework, event broker, generic repository/DI framework, new collection,
renamed public endpoint or business-policy change is implied. Discovered missing features or behavior
defects are recorded separately; they are not implemented as part of a structural package without
explicit correction scope. Characterization tests must not canonize an unsafe known defect.

### Refactor-only execution agreement

This is an existing-backend refactor, not a feature implementation campaign. Module/workflow names,
PRD references and acceptance cases below identify existing responsibilities and preservation checks;
they are not instructions to implement every described capability again or fill unrelated product gaps.

- Inspect every in-scope area; edit only files with a demonstrated ownership, readability, dependency,
  duplication or maintainability problem. Correct existing code can remain unchanged.
- Prefer moving, simplifying, consolidating or separating existing implementation over rewriting it.
  A file addition/deletion must have an explicit responsibility/consumer or verified-obsolescence reason.
- Preserve observable behavior, wire contracts and persistence identities. If a known unsafe defect
  prevents a safe move, isolate and report it; do not preserve it as correct or silently expand the refactor.
- Reuse/update existing tests. Add a focused case only for a specific important regression risk or
  uncovered boundary; no parallel refactor suite, mirrored tests or mandatory new test file per module.
- Reuse this plan, existing task/evidence records and owning specification sections. No per-package
  guide, duplicate architecture document, refactor-only framework or evidence-file proliferation.
- Run selected checks after a coherent change, not every edit. Do not run all package scripts for
  each file/module; perform one final consolidated backend regression and rerun affected failures as needed.
- Work packages describe the traversal order. They do not authorize rebuilding each module, blanket
  formatting, speculative abstractions, new product tasks or an ever-growing cleanup backlog.

## 2. Baseline and planning assumptions

Repository inspection found feature modules, private persistence checks, typed configuration, durable
jobs and extensive existing tests. Preserve useful implementation; do not rebuild working features
from templates. Inspection also found substantial root assembly and broad domain services:

| Inspected example | Observed size | Review implication |
| --- | ---: | --- |
| `backend/src/setup.ts` | 1,478 lines | Extract real private-module assembly and disentangle provider/configuration preparation. |
| `backend/src/modules/orders/order.service.ts` | 1,436 lines | Separate coherent read, state-transition and public capability responsibilities. |
| `backend/src/modules/refunds/refund-recovery.service.ts` | 1,041 lines | Review payout recovery, verification and projection boundaries. |

These are planning observations from the reviewed tree, not permanent limits or proof that every
line is defective. Re-inventory at execution start. No fixed file/function line-count target applies.

Observed imports include `checkout ↔ orders`, `orders ↔ payments`, `payments ↔ refunds` and
auth/notification/audit interactions. Module-level arrows do not establish recursive runtime calls
or a file-level import cycle by themselves. Classify concrete edges as type contracts, state
capabilities, workflow calls or accidental deep imports before changing them.

Historical [P03-021](./evidence/P03-021-backend-refactor.md) acceptance and
[P03-022/P03-023 audit evidence](./evidence/P03-022-backend-completion.md) apply to their recorded revisions.
The latter records a 170-operation inventory; execution must derive current counts instead of
assuming that number is permanently correct. Existing test totals are not acceptance thresholds.

Reconcile the following deliberate differences during WP01:

| Existing reference | Selected target | Required reconciliation |
| --- | --- | --- |
| Architecture §6.1 and Database §4.2 place wishlist under cart. | Independent `wishlist/`. | Move ownership/imports without changing the wishlist collection or HTTP namespace. |
| Architecture §§6.1–6.2 use catalog/products, variants, categories. | Products owns variants; categories remains a sibling. | Preserve canonical variant registration and inventory-only stock-write capability. |
| Architecture §6.1 names `reporting` and keeps health under modules. | Keep existing `reports/`; place technical `health/` outside modules. | Align source paths, composition, checks and consumers; preserve URLs. |
| Architecture §6.2 allows existing public service capabilities. | Intentional `.public.ts` type contracts and injected implementations. | Update allowed imports, root/script entry points and positive/negative checks. |
| Existing financial services are largely flat. | Payment attempts/collections and refund obligations/payouts. | Map every operation; retain shared parent aggregates and transaction authority. |
| Existing export/file conventions vary. | Explicit bottom named exports and responsibility-based supporting files. | Amend naming guidance; preserve mandatory framework/configuration export conventions. |

The owner selected these organizational decisions in the planning discussion. This does not approve
new behavior, deployment, financial effects or milestone acceptance. Missing business decisions are
recorded with exact conflicting references, affected work, risk and accountable decision owner.

## 3. Target structure and ownership

```text
backend/
├── src/
│   ├── server.ts
│   ├── app.ts
│   ├── setup.ts
│   ├── routes.ts
│   ├── config/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── credentials/
│   │   │   ├── sessions/
│   │   │   ├── verification/
│   │   │   ├── recovery/
│   │   │   └── guest-access/
│   │   ├── customers/
│   │   ├── catalog/
│   │   │   ├── products/             # Product definitions and variants
│   │   │   └── categories/
│   │   ├── inventory/
│   │   ├── cart/
│   │   ├── wishlist/
│   │   ├── promotions/
│   │   ├── checkout/
│   │   ├── orders/
│   │   ├── delivery/
│   │   ├── payments/
│   │   │   ├── attempts/
│   │   │   └── collections/
│   │   ├── returns/
│   │   ├── refunds/
│   │   │   ├── obligations/
│   │   │   └── payouts/
│   │   ├── reviews/
│   │   ├── media/
│   │   ├── notifications/
│   │   ├── support/
│   │   ├── settings/
│   │   ├── reports/
│   │   └── audit/
│   ├── providers/
│   │   ├── sslcommerz/
│   │   ├── cloudinary/
│   │   ├── email/
│   │   └── antivirus/
│   ├── jobs/
│   ├── health/
│   └── shared/
│       ├── database/
│       ├── middleware/
│       ├── errors/
│       ├── jobs/
│       └── named technical files
├── tests/
│   ├── unit/                         # Feature-organized as tests are migrated
│   ├── integration/
│   ├── fixtures/
│   ├── helpers/
│   └── existing smoke entry point
├── contracts/                       # Executable HTTP contract registry/generation
├── api/                             # Generated OpenAPI/Postman artifacts
├── scripts/                         # Existing operator/development entry points
│   ├── migrations/                 # Only if actual migration scripts justify it
│   └── seeds/                      # Only for actual sanitized seed operations
└── existing manifests and build/test configuration
```

Twenty business/supporting modules; `health` is technical. The tree defines placement, not a
command to create empty directories. Folder names do not dictate public HTTP namespaces.

| Module | Authoritative responsibility and important boundary |
| --- | --- |
| auth | Credentials, sessions, verification, recovery, guest proof and identity security; one user registration. Suspension/revocation security effects remain here. |
| customers | Profiles, saved addresses, privacy/deletion intake and customer-management coordination through narrow identity operations. |
| catalog | Product/variant identity, attributes, prices, categories and public discovery; product edits cannot overwrite stock counters. |
| inventory | Availability, reservation, commitment, release, adjustments, recovery and movements through the canonical stock capability. |
| cart | Quantities, persistence, merge and estimates; no stock reservation. |
| wishlist | Saved products and duplicate prevention; independent lifecycle and existing collection. |
| promotions | Coupon rules, deterministic discounts, quota holds, counters and redemption; ordinary product sale prices remain catalog-owned. |
| checkout | Authoritative quotes, intent/idempotency and order-placement coordination; no ownership of later cancellation/fulfillment workflows. |
| orders | Immutable snapshots, reads, lifecycle, cancellation, fulfillment, deadlines, delivery exceptions and canonical item-quantity guards. |
| delivery | Coverage, zones, charge rules and estimates; order shipment progression remains orders-owned. |
| payments | Attempts, independent receipt verification, collections, matching, allocation, risk, COD and reconciliation. |
| returns | Physical returns and shortage claims, quantity eligibility, evidence, review, receipt, inspection and disposition. |
| refunds | Requests/obligations, source commitments, merchandise/correction distinctions, payout attempts and confirmed outcomes. |
| reviews | Qualifying purchases, review mutation, moderation and rating projections. |
| media | Upload intents, scanning, access, references, retention/holds and recoverable cleanup. |
| notifications | Durable intents, templates, deduplication, delivery and controlled retry; providers perform transport only. |
| support | Complaint/inquiry intake, protected correspondence and resolution; no independent financial decision authority. |
| settings | Store identity/contact/branding, homepage content and versioned policy publication. Domain settings are exposed through their owning service; no speculative storage migration. |
| reports | Bounded business projections from authoritative module reads; no second financial or stock authority. |
| audit | Durable actor/action/change evidence, distinct from diagnostic logs; no source of new business decisions. |

Parent roots retain genuine shared aggregates, contracts, assembly and cross-subfeature coordination.
Variants are product-owned because their identity/lifecycle is tied to products; stock mutations
remain inventory-owned. Categories retain separate hierarchy management within the same catalog.
Auth subfeatures share identity infrastructure without exposing it outside auth. Payment attempts
can fail while a late collection succeeds; refund payout can fail while an obligation remains due.
Those distinctions justify the financial subfolders. Other modules start flat; an additional nesting
change requires a concrete responsibility/consumer analysis and a recorded architecture adjustment.

## 4. Files, naming and reuse

### 4.1 File responsibilities

| File | Responsibility and creation rule |
| --- | --- |
| `feature.routes.ts` | Paths, methods and middleware binding; no inline business operation. |
| `feature.controller.ts` | HTTP parsing/validation invocation, actor extraction and status/header/cookie/DTO response mapping. |
| `feature.schema.ts` | Runtime external-input/contract schemas; distinguish commands, queries and projections. |
| `feature.service.ts` | Cohesive application/domain operations, authorization, invariants and transaction coordination. |
| `feature.model.ts` | Canonical Mongoose schema, indexes and registration; only when this owner has persistence. |
| `feature.public.ts` | Intentional cross-module type contracts/DTOs; only with actual consumers, never a broad implementation barrel. |
| `feature.composition.ts` | Real private assembly of models/services/controllers/routers; root wiring and supported operator setup may consume it. |
| `feature.policy.ts` | Pure eligibility, allocation or transition rules with meaningful independent responsibility. |
| `feature.mapper.ts` | Explicit domain/document-to-DTO projection when substantial enough to extract. |
| `feature.constants.ts` | Cohesive fixed values shared internally; not mutable configuration or invented policy. |
| `feature.data.ts` | Genuine static lookup data; runtime records and seed execution do not belong here. |
| `feature.types.ts` | Shared internal types; keep one-consumer dependency types beside their implementation. |
| `feature.utils.ts` | Small coherent local helpers; prefer a specific filename when the responsibility is known. |
| `feature.persistence.ts` | Cohesive complex/reused database operations, validators or persistence verification; no mandatory repository wrapper. |

Do not create every listed file for every feature. A single local constant/helper can remain private
in its owning file. Do not add a second canonical user/variant schema to satisfy a template. Preserve
existing meaningful media operation services rather than forcing a universal one-service-per-module rule.

### 4.2 Implementation and export conventions

- Kebab-case paths, singular resource/responsibility filenames, PascalCase types/classes, camelCase functions.
- Use action names and units: `reserveStock`, `amountPoisha`, `timeoutMs`, `expiresAt`.
- Order: imports, types, constants/data, private helpers, implementation, explicit named exports.
- Keep production exports at the bottom; no `export *`, automatic index barrels or default business exports.
  Preserve mandatory configuration/tool framework exports such as Vitest defaults.
- Use NodeNext `.js` specifiers and `import type`. Keep relative source imports; do not introduce aliases
  that require a new runtime resolver. Existing tooling-owned aliases need parity if changed.
- Retain Biome's two spaces, single quotes, configured semicolons and 100-character formatting target.
- Use guard clauses and readable branches; avoid compressed unrelated declarations and nested ternary workflows.
- Comments explain invariants, uncertainty or non-obvious reasons; no redundant narration or stale commented code.
- No unqualified `any`, suppression or blind cast to conceal a missing contract. External data begins `unknown`.
- Retain strict TypeScript, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; distinguish omitted,
  explicit null and empty values in updates. Use discriminated unions for meaningful provider/state outcomes.
- Derive types from runtime schemas where appropriate; database documents, commands and response DTOs are
  not interchangeable. Avoid duplicate declarations, giant state bags and boolean-controlled unrelated behavior.

### 4.3 Reuse decisions

Pure functions handle deterministic calculations, normalization and policies. Pass time explicitly
to time-dependent policies. Service factories receive explicit named dependencies, expose cohesive
operations and have no import-time effects. Use classes when state/lifecycle/invariants or Error
semantics justify them; composition is preferred to generic base-class inheritance.

One-use helpers stay local. Internal reuse stays in the owning module. Cross-module business reuse
uses that owner's capability even with many consumers. Business-independent mechanics go in `shared/`.
Similar syntax does not establish a shared business abstraction. Do not create a global utils/constants/
types bucket, generic CRUD repository or forwarding factory merely to reduce apparent duplication.
Public collections/results should not grant callers mutable access to private state.

## 5. Communication, composition and workflow coordination

### 5.1 Root responsibilities

| Entry/boundary | Responsibility |
| --- | --- |
| `server.ts` | Load validated configuration, open resources, invoke setup, listen, drain and close; clean partial startup failures. |
| `setup.ts` | Assemble concrete providers and module instances, inject narrow capabilities and return the application/runtime handles. |
| `routes.ts` | Register all prepared feature routers under the versioned API; no DB/provider construction. |
| `app.ts` | Construct Express, configure middleware/parsers, mount callback/API routers, 404 and centralized errors; no implicit listen/connect. |
| module composition | Assemble only the module's private implementation and expose its router and permitted capabilities. |
| worker/operator entry | Load supported config/resources and invoke required capabilities without requiring an HTTP listener. |

`setup.ts` is a composition root, not a second route registry. Do not replace it with a renamed giant
file or an extra assembly directory. Use module composition only where it actually encapsulates
private assembly. Replace large positional dependency lists with cohesive typed dependency objects;
do not pass an unrestricted application container to every service.

### 5.2 Allowed dependencies

- Controllers call their owning services. Services accept typed commands and actor/context, not Express objects.
- A module imports foreign types only through the owner's intentional `.public.ts` contract; root setup
  supplies implementations. Provider adapters may implement public type-only protocol interfaces.
- Runtime module construction imports belong to root wiring or supported operator composition. Business
  files do not import foreign composition, model, persistence, controllers or subfeature implementations.
- Module-local code may use its own models. Nested folders are not separately public modules; keep shared
  aggregates canonical and use deliberate internal interfaces where responsibilities meet.
- Catalog's stock-counter capability is an intentionally restricted exception: only inventory and root
  wiring may receive/use it. A public contract filename does not grant every module stock-write access;
  preserve the existing special check at the new path and test forbidden consumers.
- Shared technical code imports no business module, configuration loader or root wiring. Shared HTTP/error
  metadata may describe canonical API codes but must not implement business policy.
- Providers perform protocol/transport work only; domain services receive adapters rather than construct clients.
- Jobs invoke domain operations; they do not call internal HTTP endpoints or write raw business models.
- Contract generation may inspect approved HTTP schemas through explicit tooling entry points. Inventory
  these exceptions; do not broaden runtime consumers' access to private services/models.
- Type interfaces, public contracts and domain implementations do not depend on composition.

Illustrative contract shape (not production scaffolding):

```ts
import type { ClientSession } from 'mongoose'

interface ReserveStockCommand {
  orderId: string
  lines: readonly { variantId: string; quantity: number }[]
}

interface InventoryCommands {
  reserveStock(command: ReserveStockCommand, session: ClientSession): Promise<void>
}

export type { InventoryCommands, ReserveStockCommand }
```

Explicit `ClientSession` coupling is intentional in this shared-database monolith. Do not invent a
wrapper and claim persistence independence without a real implementation. Never expose Model,
HydratedDocument, arbitrary Mongo filters or raw database connections through a business contract.
Avoid public `ReturnType<typeof internalFactory>` dependencies; consumers should see stable operations.

### 5.3 Coordination and cycles

| Workflow | Coordinator | Participant responsibilities |
| --- | --- | --- |
| Quote and order placement | checkout | Catalog prices, inventory holds, promotion quota, delivery rules, order creation, payment preparation, durable intents. |
| Cancellation/fulfillment | orders | Inventory and coupon effects, funding evidence, refund-obligation creation, audit and notification intents. |
| Verified collection | payments | Preserve receipt, match/allocate, then guarded order funding and stock/coupon commitment through participant operations. |
| Return/shortage decision | returns | Canonical order-unit guards, media evidence, inventory restock where physical goods exist, refund entitlement. |
| Refund approval/payout | refunds | Source/order/unit capacity, obligations, payout attempts, confirmed settlement and durable notifications. |

Every operation has one coordinator and a declared transaction owner. Participant methods never call
the full coordinator workflow recursively. Post-checkout stock/coupon operations must not depend on
checkout's placement implementation. Separate neutral state/capacity capabilities from top-level
workflows within their owning modules; do not add a generic orchestration subsystem.

Break concrete import cycles with stable contracts and consumer-local narrow ports where necessary;
inject adapters in setup. Type-only acyclic source structure does not prove runtime independence.
Review the per-operation call graph and transaction path as well as file imports. Prepare contracts
and leaf participant capabilities before rewiring coordinators; migrate one runnable operation at a time.
Notifications/audit integration must not require recursively constructing the complete auth/commerce graph.

## 6. HTTP, security and configuration

- Preserve the exact API versions, methods, paths, statuses, response envelopes, pagination, cookies,
  headers, origin/CSRF rules, idempotency, ETag and activation conditions in the owning contracts.
- Routes bind middleware; controllers validate params/body/query separately and explicitly build commands.
  Never spread an untrusted body over a trusted route ID, verified actor or protected field.
- Reuse runtime schemas by semantic contract, not field resemblance. Unknown fields, coercion, defaults,
  PATCH omission/null semantics, sort/filter allowlists and response projections must be explicit.
- Services enforce role/ownership/current state for every entry point. An actor is not trusted merely
  because a caller supplied its shape; preserve transaction-bound identity/revocation fences where required.
- Preserve opaque admin/customer/scoped-guest separation. An order ID or email alone is not proof of access.
- Keep provider callback parsing isolated with bounded payloads and independent verification. CORS is not
  authorization; callbacks do not become ordinary browser mutations with invented CSRF exemptions.
- Configure request IDs, safe logging, limits, parsers, exact callback handling, feature routers, 404 and
  error handler in an explicit tested order. Security headers/cache rules must cover early callback responses.
- Express 5 already forwards returned async-handler rejections. No redundant async-wrapper framework.
- Keep typed stable application errors and centralized safe HTTP mapping. Normalize validation errors so
  invalid input does not become an accidental 500. Distinguish missing data, conflict, infrastructure
  failure and uncertain provider outcomes; never catch-and-return success or log raw private payloads.
- Load configuration once per process entry, validate typed options, and inject subsets. Services do not
  read `process.env`. Domain policies are not immutable constants merely because config currently stores them.
- Preserve fail-closed activation, protected policy/evidence inputs and existing environment-key compatibility.
  Missing online channels remain a release prerequisite, not an excuse to fabricate runtime enablement.
- Private responses remain uncached. Public caching requires an explicit freshness/invalidation policy;
  no new cache, API retry policy or transport behavior is introduced by this refactor.

## 7. Persistence, transactions and external effects

1. Retain collection names, ObjectIds, canonical model registrations, indexes, validators, timestamps,
   monetary fields, snapshots and historical identities. Source moves alone require no data migration.
2. Catalog owns variant registration; inventory alone receives the stock-write capability. Auth owns user
   registration; customers receives scoped profile/address operations. Do not create parallel schemas.
3. Own-module services may use their models directly. Extract meaningful queries/persistence operations
   when needed; do not wrap every Mongoose method. No foreign raw model access or unrestricted population.
4. Build allowlisted updates/projections; no mass assignment, client Mongo operators or unchecked regex.
   Bound search, sorts, pagination and aggregation cost; preserve eligibility filters before pagination/counts.
5. Coordinator starts the transaction; all participants use the same session sequentially. No nested
   transaction, parallel session operations, provider call, email or media operation inside retry callbacks.
6. Preserve conditional writes, uniqueness, request identity/digest and CAS/If-Match semantics. TTL cleanup
   is not an authoritative expiry check. Mongo schema validation does not replace business invariants.
7. Money stays safe integer poisha with deterministic allocation/rounding. Stored order prices, discounts,
   addresses and policy snapshots are historical authority for returns/refunds, not today's catalog values.
8. Record independently verified collections, including unmatched/late/excess funds. Preserve receipt
   evidence separately from allocation/fulfillment decisions. Duplicate callback delivery must not duplicate effects.
9. Keep merchandise, delivery and payment-correction entitlement classes distinct. Pending and completed
   refunds consume appropriate collection/order/unit capacity. Missing goods never generate physical restock.
10. Persist recoverable intent before uncertain external effects; verify/reconcile before financial retry.
    Provider acceptance and browser redirects do not establish collection or payout completion.
11. Durable notification intent and audit effects join the appropriate business transaction. Do not move
    cross-domain financial/stock effects into hidden Mongoose hooks or import-time side effects.
12. Bootstrap/index/validator changes use reviewed, bounded, additive procedures. Preserve predecessor checks,
    local/test restrictions, retention and legal holds. No destructive migration is authorized by this plan.

## 8. Jobs, operations and performance

Providers use typed requests and validate/normalize bounded responses, explicit timeouts and redirect policy.
Endpoints/credentials are controlled configuration, not caller-selected arbitrary URLs. No blind financial retries.
Business services decide eligibility, funding and state transitions. Preserve sanitized evidence digests and
existing lost-reference/unknown-outcome handling.

Jobs use durable claims/leases, fencing where necessary, bounded batches, retry/backoff limits and recoverable
cursors. Replays/restarts are safe. In-memory locks and timers are not business authority. Worker entry points
must share domain behavior without starting an API listener, and shutdown must release/expire work safely.

Maintain structured diagnostic logs, correlation IDs and relevant bounded metrics: operation failures,
provider uncertainty, job backlog, reconciliation lag and slow queries. Audit evidence is separate. Do not
log credentials, tokens, request bodies, raw provider payloads or unnecessary personal data.

Liveness stays inexpensive; readiness remains restricted and reports safe availability. Database pools,
outbound concurrency, upload/response limits and shutdown deadlines are explicit existing options reviewed
against actual hosting. No invented throughput SLA or blanket caching strategy. Profile/index bounded queries
before considering Redis, a search engine or a broker. Stateless API instances rely on durable sessions and
conditional writes, not process-local correctness. Preserve packaging restrictions and actual compiled entry points.

## 9. Migration and compatibility protocol

For each work package:

1. Inspect current git/staged changes and relevant source/contracts/tests. Identify owner, FR references,
   current-to-target paths, consumers, state transitions and selected checks before edits.
2. Capture affected public/DB/runtime behavior using existing tests and contract inventories. Add a focused
   characterization/safety case only where an identified important refactor risk lacks coverage. Record
   known contract defects separately instead of preserving or silently fixing them.
3. Establish the narrow contract and private assembly. Update code, callers, scripts, test discovery,
   generated-contract inputs, packaging and any aliases together. Preserve NodeNext output semantics.
4. Separate structural moves from approved behavior corrections in reviewable changes. Keep the application
   runnable after each completed slice. Temporary adapters require named consumers and removal conditions.
5. Run affected checks, inspect the actual diff, compare schemas/indexes/DTOs/route registration and remove
   dead imports/obsolete code only after all consumers are migrated.
6. Record revision, changed paths, command/environment/result, actual evidence and remaining limits in the
   owning task record. Reuse valid unchanged results; expand verification for demonstrated consumer impact.

Boundary tightening is ratcheted by migrated owner. If a temporary legacy allowance is unavoidable, enumerate
exact paths/edges, responsible package and removal condition; no glob bypass or new legacy violation. New and
migrated code follows final rules immediately. All allowances are removed before technical completion.

Rollback is the prior compatible complete code artifact with matching config, workers and operator paths.
Drain affected processes and reconcile uncertain effects before safe retries. Never revert by deleting
collections, receipts, payouts, quota/stock history, audit records or accepted business transitions.

## 10. Work packages and dependencies

WP identifiers below are local planning labels, not new `PXX-NNN` task IDs or Done claims. Before code
execution, map each package to an existing unfinished task where its scope truly fits, or allocate new
stable tasks under Tasks §2. Preserve historical P03-021/P03-023 acceptance; do not overwrite their evidence
or silently expand accepted scope. Link backend-stage closeout to P03-022 without bypassing its real gates.
Large packages must be split into reviewable operation-sized tasks with the same exit obligations.
Use refactor-specific deliverables; do not reopen feature implementation tasks merely because their code
is being reorganized. Existing-feature lists below describe parity, not new development scope.

Trace the packages to the existing product requirements without treating requirement headings as module
boundaries. Detailed Database/API/Testing sections must be attached to each concrete task during WP00/WP01:

| Package scope | Primary [PRD](./PRD.md) references |
| --- | --- |
| WP02/WP13 technical runtime | §12 security, performance, reliability and maintainability-related constraints; §10 data integrity. |
| WP03 delivery | FR-16, FR-28; historical charges and order deadlines also involve WP09. |
| WP04 identity/customers | FR-01, FR-02, FR-19, FR-21, FR-27. |
| WP05 audit/notifications/media | FR-20, FR-23/24/32 evidence/media consumers; §§10/12 privacy, security and history. |
| WP06 catalog/inventory | FR-03–06, FR-13, FR-23–25. |
| WP07 shopping/promotions | FR-07–09, FR-30. |
| WP08/WP09 commerce coordination | FR-11–16, FR-19, FR-26; source/refund participants also FR-17/18. |
| WP10 payments | FR-12, FR-29 and collection/fulfillment invariants. |
| WP11 returns/refunds | FR-15, FR-17/18, FR-32/33. |
| WP12 supporting workflows | FR-03, FR-10, FR-16 complaint handling, FR-22, FR-27, FR-31, FR-34. |
| WP14/WP15 operational continuity | PRD §§12–14 and Operations/Testing procedures; external launch qualification remains separately gated. |

### WP00 — Current baseline and impact inventory

**Dependencies:** None for planning; confirm actual foundation-stage readiness before application execution.

- Inventory every source file, module import, public capability, concrete call cycle, collection/model,
  route and conditionally activated operation, job, script, generated input, test glob and runtime entry point.
- Record current-to-target moves, affected consumers and package ownership; inspect frontend test fixtures
  and root tooling without starting another application's refactor.
- Select and run a suitable baseline from §11; retain pre-existing failures and infrastructure limits.
- Produce an operation-coordinator/participant map, canonical model/index/validator inventory and risk list.

**Exit:** No unassigned backend area/entry point; reproducible baseline revision and actual results;
known defects distinguished from structural work. No mass rename or empty directory creation.

### WP01 — Reconcile contracts and make enforcement executable

**Dependencies:** WP00.

- Reconcile §2 deltas in Architecture §§4–6, Database §4.2, Implementation Plan §3.6 and affected Testing
  rules; update Operations/API only for actual changed procedures/contracts. Keep PRD scope intact.
- Extend existing AST boundary checks for intentional public contracts, composition entry points,
  controllers/private persistence, providers/shared direction and file-level runtime/type cycles.
- Add positive/negative fixtures, including re-exports/dynamic imports and tooling/bootstrap exceptions.
- Define exact migration allowances and work-package removal ownership; separate import-graph proof
  from per-workflow recursion/transaction tests. No new DI/boundary package is required.

**Exit:** Owning sources agree on target; valid patterns pass and forbidden direct/transitive imports fail;
existing violations are explicitly attributed without weakening final rules.

### WP02 — Technical foundation and reusable code

**Dependencies:** WP01.

- Review shared transactions, money mechanics, pagination, safe errors/responses, validation, logging and
  job leases. Extract only demonstrated technical reuse; keep business policies module-owned.
- Normalize typed configuration loading and boundary validation without changing environment keys,
  activation defaults, public errors or cookie behavior. Preserve relevant actor/revocation fences.
- Establish root/provider/worker dependency contracts; maintain compatibility while later packages move consumers.

**Exit:** Technical code has no business imports; deterministic utilities and error mapping are tested;
transaction nesting/external-effect guards and safe configuration failures remain effective.

### WP03 — Pilot module: delivery

**Dependencies:** WP02.

- Refactor coverage/charge operations into routes/controller/schema/cohesive service and intentional public
  contracts; use real module composition if private assembly needs it. Retain canonical persistence.
- Validate the file, dependency and export conventions on a bounded but real public/admin/checkout consumer.
- Preserve coverage keys, revision checks, inactive-area rejection and historical order charge behavior.

**Exit:** Same delivery wire contracts and consumer behavior; focused HTTP/database tests, boundary checks
and diff review pass. Record concrete convention defects before applying the pattern to larger modules.

### WP04 — Identity, customer and technical health boundaries

**Dependencies:** WP03; required notification/audit contracts may be defined before their full implementation migration.

- Refactor auth subfeatures without splitting canonical identity persistence or duplicating proofs/hashing.
  Make shared auth helpers internal, with purpose-specific issuance/verification/recovery policies.
- Separate customer profile/address/privacy coordination from credentials/security writes; retain security
  status/revocation authority in auth and scoped guest access distinct from registered customer sessions.
- Remove commerce-wide wiring from auth; inject narrow order/proof-delivery/audit capabilities as needed.
- Move health to its technical boundary, updating imports, readiness wiring and smoke/operator consumers.

**Exit:** Registration/login/logout, admin provisioning, sessions/CSRF/origin, verification/email change,
recovery, guest proof, customer suspension/privacy and profile flows retain success/denial/replay behavior;
no additional user registration or loss of transactional revocation protection.

### WP05 — Audit, notification and media capability foundations

**Dependencies:** WP04; resolve auth/sink assembly through contracts and injected callbacks, not recursive construction.

- Refactor durable audit append/query and notification enqueue/delivery interfaces. Templates receive
  narrow safe projections; notification delivery must not instantiate commerce workflows.
- Refactor media upload, scan, attachment, private access and cleanup responsibilities, retaining existing
  useful operation services and one asset model/reference ledger.
- Supply services needed by subsequent modules; final worker/process composition is completed in WP14.

**Exit:** Proof delivery/retry admission, deduplication, private media access, scan failures, retention/holds,
attachment races, uncertain deletes and audit integrity have focused tests; no circular startup dependency.

### WP06 — Catalog and inventory

**Dependencies:** WP05; delivery is already available.

- Move variant responsibility under catalog/products; preserve categories as a sibling and existing product,
  variant/category identities, indexes, discovery semantics and attachment integration.
- Keep inventory's sole stock-counter write capability and public availability/reservation operations.
- Separate meaningful catalog read/management/stock participant responsibilities without one-action files.
  Preserve product update guards against overwriting counters and all reservation/movement identities.

**Exit:** Product/category/variant CRUD, hierarchy visibility, search/filter/counts, pricing, media and
stock reservation/commit/release/adjustment/recovery race tests pass; schema/index parity is reviewed.

### WP07 — Promotions, cart and wishlist

**Dependencies:** WP06.

- Preserve coupon eligibility, deterministic allocations, global/customer quota and hold/redemption state.
- Extract wishlist from cart to its own owner and update model registration callers/tests/contracts without
  renaming the collection or public routes. Keep guest cart local and registered merge semantics intact.
- Reuse catalog/promotion capabilities; cart/wishlist remain non-reserving estimates/selections.

**Exit:** Merge/duplicate/inactive-product cases, coupon preview/expiry/concurrent quota, hold restoration
and discount rounding pass; neither cart nor wishlist owns authoritative checkout funding or stock.

### WP08 — Prepare commerce participant contracts and call graph

**Dependencies:** WP07; WP04/WP05 provide identity/audit/notification capabilities.

- Map order creation/funding/state guards, inventory/coupon allocation, payment collection/source capacity,
  order-item quantity guards and refund-obligation operations into narrow owner-controlled capabilities.
- Separate post-placement stock/coupon effects from checkout implementation. Retain canonical transaction
  coordination and isolate reads from commands where it removes concrete coupling.
- Define payment/refund participant contracts together before moving full coordinators; private factories
  assemble with explicit dependencies. Never instantiate a missing participant with a permissive stub.

**Exit:** Recorded per-operation call/transaction graph has no recursive coordinator flow; contracts
type-check, concrete construction is possible without cyclic initialization, and runtime remains runnable.

### WP09 — Checkout and order lifecycle

**Dependencies:** WP08; preserve working payment/refund participant adapters until WP10/WP11 replace internals.

- Refactor quote, intent and submit coordination; isolate controllers and keep authoritative validations,
  snapshots, guest/customer scope, payment-method activation and idempotency comparison intact.
- Refactor order reads, cancellation, deadlines, fulfillment and delivery-exception operations. Reuse
  inventory/promotion capabilities; remove lifecycle dependencies on checkout's placement implementation.
- Keep actual funded cancellation/refund creation and collection-to-order integration runnable through
  the prepared participant contracts; do not defer financial safety until the financial package.

**Exit:** Online/COD placement, quote changes/expiry, duplicate submit, rollback, funding guards,
cancellation/dispatch races, deadline snapshots and one-time allocation effects pass real transaction tests.

### WP10 — Payments

**Dependencies:** WP09 and WP08's source/refund participant contracts.

- Organize initiation/attempt/retry/outcome lookup under attempts; verified receipt intake, matching,
  collections, allocation, risk and COD under collections. Parent owns shared payment aggregate/assembly.
- Preserve callback normalization/verification, matching quarantine, late/partial/excess receipts,
  merchant identity, reconciliation and correction-obligation integration.
- Keep protocol-only work in SSLCOMMERZ adapter; provider acceptance never becomes financial success.

**Exit:** Callback duplicate/out-of-order/mismatch/timeout, unlinked receipts, risk escalation, partial/excess
funding, COD evidence, retry admission and reconciliation are replay/concurrency safe; immutable receipt parity.

### WP11 — Returns and refunds

**Dependencies:** WP10; WP05 media and WP08 order/source capacity participants.

- Refactor returns/shortage claims with canonical unit eligibility and scoped evidence; retain physical
  receipt/inspection/restock distinctions, batches and replay guards.
- Put requests, entitlement calculation, approval, correction/cancellation obligations and source reservations
  under obligations; provider/manual dispatch, proof, outcomes, safe retry and reconciliation under payouts.
- Preserve parent shared aggregate/assembly and private-history projections. Keep pending/completed
  commitments, manual consent/proof, lost references and merchandise/correction classes distinct.

**Exit:** Cross-claim unit races, missing goods, non-resellable returns, zero-price units, source/order caps,
duplicate transfers, unknown payout outcomes, safe fallback and settlement/recovery tests pass.

### WP12 — Reviews, settings, support and reports

**Dependencies:** WP11 for final purchase/refund/financial projections; foundational settings/media work
needed by earlier packages may be migrated earlier through the same contracts.

- Refactor review qualification/moderation/ratings; keep historical feedback and eligibility facts separate.
- Refactor store/homepage/policy publication without turning settings into an owner of all domain rules.
  Preserve existing storage through narrow operations; no unnecessary settings data migration.
- Refactor complaints, customer/admin histories and bounded operational/report reads using owner capabilities.
- Preserve audit queries/privacy projection and notification admin retry rules; no raw foreign-model reports.

**Exit:** Review qualification after returns/refunds, moderation, policies/homepage, complaint scope,
privacy redaction, reporting cutoffs/totals and pagination remain contract-compatible and bounded.

### WP13 — Final root wiring and provider isolation

**Dependencies:** WP12; extract private module assembly incrementally in earlier packages as required.

- Reduce root setup to actual cross-module construction. Remove stale positional assembly, duplicated
  provider/config preparation and legacy adapters. Keep central routes registry and pure app construction.
- Review callback/multipart/JSON parser ordering, headers/cache, actor middleware, error mapping and startup
  failure cleanup. Keep current exported test/operator composition consumers or migrate them coherently.
- Verify provider boundaries, timeouts, normalized outcomes and typed configuration across API and workers.

**Exit:** Every operation registers exactly once under its existing conditions; startup/partial failure/
shutdown/health/compiled smoke and callback parsing pass; no construction cycle or unused adapter remains.

### WP14 — Workers, scripts, packaging and contract parity

**Dependencies:** WP13; maintain affected entry points during every preceding package.

- Finalize notification, reservation expiry, payment/refund reconciliation and media-maintenance runtimes.
- Reconcile all bootstrap/migration/provisioning/qualification scripts, safe flags/stdin and local/test
  restrictions. Retain direct Node `.mjs` entry points unless an explicit compatibility decision changes them.
- Update actual container/build/runtime copy inventory, scheduler commands, test discovery and CI scope
  selection. Retain generated contract ownership and regenerate artifacts only through existing generator.
- Remove final legacy boundary exceptions; do not remove a compatibility entry before consumer verification.

**Exit:** API/worker/operator build outputs and safe smoke tests work; generated artifacts are fresh and
match actual routes/activation/DTOs; no schema/index/collection drift or dropped test/entry point is hidden.

### WP15 — Consolidated backend regression and handoff

**Dependencies:** WP14 and all package exits.

- Execute one consolidated backend-scoped regression at the final revision; run affected security/tooling
  and recovery checks, inspect generated contracts, full diff and all temporary exceptions/dead paths.
- Compare the original and final inventories for every operation, model/index/validator, worker, operator
  entry and meaningful test; account for intentional changes without fabricating equivalent coverage.
- Reconcile current/target doc wording and runbooks, record final revision/evidence and rollback procedure.
- Record engineering completion separately from P03-022's outstanding independent/target qualification,
  merchant/media/provider/policy requirements and deployment/milestone acceptance.

**Exit:** Section 13 is satisfied; no unreported regression, permissive stub, unexplained missing surface
or unresolved structural exception. Unavailable external qualification remains honestly recorded.

## 11. Verification and evidence

Commands below were confirmed in the current manifests. Execute from repository root; recheck names
if manifests change. These are execution requirements, not claims that this document ran the suites.

| Change/check | Existing command or method |
| --- | --- |
| Documentation only | `npm run lint` and `git diff --check`; inspect headings/contents/references and actual diff. |
| Source boundary changes | `npm run lint:boundaries`; tooling negative fixtures through `npm run test:unit`. |
| Backend style/types | `npm run lint --workspace=backend`, `npm run typecheck --workspace=backend`. |
| Backend/tooling format inventory | `npm run format:backend` (check mode); root `format:check` when its full inventory is affected. |
| Focused unit tests | `npm run test:unit --workspace=backend -- <actual-test-path>`. |
| Focused database/HTTP integration | `npm run test:integration --workspace=backend -- <actual-test-path>` on isolated replica sets. |
| Contract freshness and runtime parity | `npm run test:contract --workspace=backend`; `npm run api:check --workspace=backend`. |
| Intentional generated artifact update | `npm run api:generate --workspace=backend`, followed by freshness/parity review. |
| Compiled output and process smoke | `npm run build --workspace=backend`, then `npm run test:smoke --workspace=backend`. |
| Final consolidated inventory | `npm run ci -- --scope=backend`; inspect actual `ci-workspaces.json`/runner inventory. |
| Affected supply-chain/secret checks | `npm run test:security` when required by changed scope and at final review. |

Use [Testing §15.5](./TESTING.md#155-change-based-local-verification): select focused checks before edits,
reuse valid unchanged results, rerun failures/affected consumers after fixes, and reserve full regression
for final owning-application closeout. CI inventory changes require real existing checks and tooling tests;
never use passing placeholders or `--if-present`. Runtime imports in browser fixtures need affected consumer
verification; backend-private changes alone do not require frontend builds or browser installation.

Package exits may reuse applicable existing tests; they do not demand a freshly written test matrix.
Pure path moves need consumer/import/build/discovery parity and existing affected behavior checks, not
new tests that assert filenames or mirror implementation. Consolidation or logic extraction requires
tests of the actual affected behavior. Do not run migrations or real provider/qualification actions
merely to verify an operator script's import move; use its safe existing checks/isolated fixtures.

Integration tests must use isolated transaction-capable MongoDB, never a developer/production database.
Loopback/process permission or Mongo binary availability can block execution; report exact Not Run/Blocked
conditions. Synthetic callbacks and local adapters are not merchant/channel, cash, scanner or hosted evidence.

Evidence per package includes source revision, source/FR/task pointers, current-to-target paths, wire/DB
parity comparison, exact command/environment/result/artifact, executor diff review, remaining risks and
rollback. Do not copy historical passing counts as results for the refactored tree.

## 12. Risks and decision controls

| Risk | Control and responsible work |
| --- | --- |
| Repeating arbitrary structural changes | Freeze this target after WP01 reconciliation; further changes require concrete defect/evidence, impact and owning decision. |
| Folder move hides business/security regression | Separate behavior corrections; inventory contracts and run meaningful auth/state/race/replay tests in each affected package. |
| Circular construction or recursive workflow | WP08 call graph, narrow state participants, explicit root assembly and operation tests. |
| Duplicate user/variant schemas or collection drift | Canonical registration/validator/index comparison in WP00, each persistence package and WP15. |
| Financial replay/uncertain outcome loses money | Durable intent, source/unit guards, replay tests, independent verification and reconciliation; no live payout in refactor tests. |
| Private data leaks through DTO/log/template reuse | Explicit projections, negative response/privacy tests and sanitized logging/evidence. |
| Over-fragmentation or speculative abstraction | File responsibility/consumer review; no fixed line target, empty folders, forwarding factories or generic bases. |
| Startup/worker/operator break after moves | Inventory all consumers and packaging; move tests/scripts/tool entries with code; compiled smoke and restart checks. |
| Endless temporary compatibility | Exact adapter/exception owner and removal condition; zero remaining allowances at technical closeout. |
| Existing docs/tests encode a real defect | Record exact contradiction and approved correction scope; never silently relax safety or preserve a known unsafe outcome. |
| Performance regression | Bound queries/batches; compare relevant explain/plans or representative measurements before new infrastructure. |
| Plan mistaken for release acceptance | No task status/milestone/provider claim from this file; preserve existing stage and external qualification. |

No calendar estimate is invented. Estimate package effort after WP00 identifies concrete consumers,
coverage gaps and data/runtime risks. Unknown production topology/limits are measured operational inputs,
not reasons to postpone the selected code boundaries or fabricate capacity guarantees.

## 13. Completion and final review

Before reporting the refactor technically complete, verify all of the following with evidence:

- Every source responsibility, public operation and runtime/script entry has an owner and reviewed path.
- The selected twenty modules and justified nested responsibilities are implemented without empty scaffolds.
- No foreign private persistence/implementation dependency, recursive coordinator workflow or unresolved
  boundary exception remains. Public contracts expose narrow operations and detached data.
- Controllers contain no business decisions/model access; services contain no Express objects or env reads;
  shared/providers/jobs follow their assigned directions. Composition has real assembly responsibility.
- Canonical collections/models/indexes/validators and financial/security/historical invariants remain intact.
- Exports, naming, types, reusable rules and file responsibilities follow the reconciled conventions;
  dead code is removed only after consumer checks.
- Root, API, callbacks, workers, bootstraps, generated contracts and packaged entry points retain parity.
- Applicable checks pass at the recorded revision; missing infrastructure/external checks are explicit.
- Tasks/evidence and current specifications agree; historical acceptance remains attributable to its revision.
- Backend technical completion does not self-approve P03-022, deployments, external qualification or milestones.

### Planning-document review record

The author reviewed this plan for coverage of all twenty modules, nested ownership, reuse, composition,
HTTP/security, persistence/financial integrity, worker/operator continuity, compatibility, dependency order,
verification and rollback. The author checked the pilot-to-financial sequence against bootstrap/call-cycle
risks: supporting contracts precede coordinators, and existing working participants remain until replacement.
Final documentation checks/results belong in the delivery message; future implementation evidence belongs
in Tasks and its owning records. This review does not certify unexecuted refactor code or independent acceptance.

## 14. Engineering references

The following support mechanisms, not this project's exact folder count or business policy:

- [Domain analysis](https://learn.microsoft.com/en-us/azure/architecture/microservices/model/domain-analysis):
  derive cohesive boundaries from domain responsibility; deployment as microservices is not adopted here.
- [Dependency injection](https://martinfowler.com/articles/injection.html): explicit construction/dependency separation.
- [Express error handling](https://expressjs.com/en/guide/error-handling/): returned async failures in Express 5.
- [Express production security](https://expressjs.com/en/advanced/best-practice-security/): transport/input/runtime safeguards.
- [Mongoose transactions](https://mongoosejs.com/docs/transactions.html): retry semantics, sessions and parallelism constraints.
- [Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html): durable state-plus-intent reliability.
- [TypeScript indexed access](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html) and
  [optional properties](https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html): explicit absence semantics.
