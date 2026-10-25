# P05-015 — Coupon administration and usage history APIs

**Date:** 25 October 2026
**Executor:** Codex
**Status:** Done; accepted by project owner on 25 October 2026
**Revision:** Working-tree changes against `1bcd8a2167f45c95373662e6814b9a236055ee0a` (accepted P05-014).
P05-014 edits were present when this task began and committed by the owner during this work; they were preserved.

## Scope and ownership

Sources: [Tasks P05-015](../TASKS.md), [API §14.3](../API.md#143-delivery-promotions-content-and-settings),
[Database §§8.1–8.3](../DATABASE.md#81-coupons--promotions),
[Database audit contract](../DATABASE.md#103-auditlogs--security-and-operations-append-only),
[Architecture §§4–6](../ARCHITECTURE.md#4-project-structure), Testing PRM-02/03.
Accepted prerequisites are P05-007 and P03-013. This is Backend-stage work, without frontend implementation.

Implemented five protected routes: list/create coupons, revision-guarded PATCH, reasoned deactivation and
paginated redemption history. Create returns 201; other operations return 200. Mutations require admin
Origin/CSRF and a live administrator session. Both HTTP middleware and the auth-owned transactional capability
check authorization; account/session fences serialize privileged writes with revocation or suspension.
Reads authorize inside a snapshot transaction without touching account timestamps or commerce state.

Promotion-owned schemas/services/routes keep canonical coupon models private. Configuration validation
normalizes codes, bounds integer values and scope arrays, and revalidates the complete merged policy.
Explicit null removes only optional quota/scope fields. Counters, versions and redemption records are
not client-editable. Normalized no-op PATCH preserves revision and terms version. Meaningful edits and
explicit deactivation increment both; If-Match is mandatory and stale/malformed revisions fail closed.
Global or per-customer quotas cannot be reduced below actual held-plus-redeemed usage.

The audit module supplies canonical strict `auditLogs` persistence and an append-only transactional writer,
needed for these privileged configuration changes. No diagnostic logger is used as a substitute. Audit
records contain actor, action, target, stable cause, time, digests and optional operator reason; no raw coupon
configuration, credentials or customer contact snapshots. Failed audit writes roll back configuration and
auth fences. The canonical audit model is private and exposes no public update/delete operation.

Existing live holds retain their original terms through edits and deactivation. Real allocation primitives
commit/replay those holds exactly once; administration never resets counters or rewrites histories.
History includes held/redeemed/released generations and immutable terms, omitting private operation/index keys.
Lists/history are bounded (default 20, maximum 100), stable by createdAt/ID descending and admin-only/no-store.

## Contracts and rollout

- API owns CouponAdmin/patch/history fields, strong numeric If-Match, ETag and 428/412 errors.
- Database owns additive coupon list/history indexes and the unchanged canonical audit collection contract.
- Runtime composition activates the routes only with ADMIN_AUTH_ENABLED. Requests fail closed when their
  required promotion/audit persistence is missing or incompatible; startup does not mutate schemas.
- The local/test-only `bootstrap-promotions.mjs` now provisions canonical audit persistence alongside
  promotions. Compatible reruns retain records/extra indexes; incompatible validators require reviewed
  migration. It refuses staging/production. Operations describes reviewed rollout and recovery.
- Executable registry/generator imports owning runtime schemas and generates If-Match/ETag and manual
  blank Postman variables. Inventory remains 164 operations: 44 implemented, 120 planned.
- No new package, provider operation, collection outside the approved data model, or financial retry was added.

Rollout must add the three coupon list/history indexes and audit validator/indexes through reviewed initializers.
Existing incompatible audit data requires a reviewed migration, not an overwrite. The optional canonical unique
cause index is enabled; conflicting historic duplicates must be investigated before rollout, never deleted
by bootstrap. Roll back service/routes/registry/generated artifacts together, retaining coupons, redemptions,
counters, audit records and additive indexes. No external financial operation occurs in these transactions.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, isolated MongoDB 8.0.16 replica sets, synthetic identities/orders only.
Integration helpers generate their own database/URI and do not use the application `.env` database.
Local HTTP/MongoDB listeners required execution outside the restrictive sandbox.

| Command | Observed result |
| --- | --- |
| `npm run api:generate --workspace=backend` | Passed; four deterministic artifacts generated |
| `npm run test:contract --workspace=backend` | Passed; freshness and 55 cases, including actual router inventory and CAS-header/ETag/Postman assertions |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/coupon-admin.test.ts tests/integration/coupon-allocation.test.ts tests/integration/composition.test.ts` | Passed; 22 admin + 28 allocation + 5 composition = 55 cases at that revision |
| Same integration command scoped to `tests/integration/coupon-admin.test.ts -t 'quota reduction\|paginates real'` | Passed; strengthened quota-race case and newly added history case; 21 deliberately unselected. Final distinct coverage: 23 admin + 28 allocation + 5 composition = 56 |
| `npm run test:unit --workspace=backend -- tests/unit/coupon.test.ts tests/unit/coupon-allocation.test.ts tests/unit/pricing.test.ts` | Passed; 114 cases |
| `npm run test:unit --workspace=backend -- tests/unit/coupon-admin.test.ts` | Passed; 5 cases |
| `npm run test:unit --workspace=backend -- tests/unit/operations.test.ts` | Passed; 40 HTTP/error/logging cases; 159 distinct unit cases total |
| `npm run typecheck --workspace=backend` | Passed after test/type corrections |
| `npm run lint --workspace=backend` | Passed; 202 files |
| `npm run build --workspace=backend` | Passed |
| `npm run test:smoke --workspace=backend` | Passed; real DB startup, restricted health, safe invalid configuration and graceful shutdown |
| `npm run test:security` | Passed; zero secret findings and zero dependency advisories |
| `npm run lint` and `git diff --check` | Passed; 492 files/1,269 local links, zero documentation errors; task-count/checkbox audit also passed |
| `npm run lint:boundaries` | Passed; 236 files, zero errors |
| `npm run format:backend` | Passed; 216 files |

Admin integration covers authentication/CSRF/role isolation, suspension/revocation, normalized unique-code races,
merged date/percentage policy validation, protected fields, nullable removals, missing/malformed/stale revision,
concurrent cross-admin edit winners, stable list/history pagination, no-write reads, audit failure rollback,
missing index/incompatible validator rejection, no-op edits, actual runtime activation, compiled additive bootstrap
and production refusal, strict append-only audit validation, live hold edit/deactivation/commit/replay, real
capacity reduction checks and allocation-versus-edit race outcomes.

The order capability in the admin/allocation integration is an explicitly test-only durable fixture. It does
not implement or approve production checkout/order ownership. Actual HTTP auth, audit, coupons and allocation
persistence run against real MongoDB transactions. No mock provider is represented as live acceptance.

Local artifacts (ignored): `test-results/P05-015/integration-55.json` retains the complete 55-case report;
`integration-focused-final.json` retains the final two-case follow-up. Counts reuse unchanged passing suites
and do not sum reruns. `test-results/P05-015/security.json` retains the final security result. Final generated OpenAPI/Postman files are repository artifacts.

Initial failed attempts are not represented as passing: audit-model TypeScript inference, ObjectId/string and
embedded document typing were corrected; Supertest helper types and generated-schema assertion typing were
corrected; route-owner fixture inventory was updated when its negative guard caught the new router. A new
history test used an incorrect primitive method name; typecheck caught it before execution, and it now calls
the existing `release(...,'held')`. Formatter drift in that test was corrected. The final focused race test
asserts the two permitted winner/outcome combinations instead of a weak fulfilled-promise assertion.

## Recovery and independent review

Frontend builds/tests, browsers, hosted CI, full Backend-stage regression and production/provider verification:
**Not Run**, outside this task's affected scope. Coupon preview/checkout, UI and external/product gates retain
separate tasks and acceptance. No milestone is self-approved.

Independent project-owner review accepted this implementation and evidence on 25 October 2026:
“Review করেছি—accept করছি, Done করো”. P05-015 is Done under
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting). Verification history, rollout prerequisites
and scope limits above remain unchanged.
