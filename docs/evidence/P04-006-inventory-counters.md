# P04-006 — Inventory counters and atomic guards

**Date:** 23 October 2026 · **Implementer:** Codex · **Status:** Done
**Baseline:** `0fa8e10` · **Sources:** FR-13, FR-25; Database §§6.3, 7.8; Architecture inventory ownership.

## Scope and implementation

This is the next independent backend slice after P04-002. P04-003 still requires EXT-04 approvals;
no dependency or media acceptance requirement was changed to select this work.

Catalog retains the single canonical product-variant model. Its stock-only capability in
`backend/src/modules/catalog/variants/variant.service.ts` exposes reads and transactional counter
changes without exposing prices, metadata or the private model. Inventory owns its schema, service,
movement model and persistence initialization under `backend/src/modules/inventory/`.

Counters remain nonnegative safe integers with available = physical − reserved − committed.
Atomic predicates guard current and resulting counters, revision overflow and committed/reserved
coverage. Changes require an active MongoDB transaction. The internal physical adjustment command
updates stock and inserts one movement in the same transaction. The unique variant/type/operation-key
index prevents duplicate effects; exact replay returns the original movement ID, while conflicting
quantity, reason or actor fails. A subsequent read obtains current counters rather than inventing a
historical HTTP response. Ledger failure rolls back the stock change.

The ledger follows the existing canonical movement schema and indexes, with no mutable timestamps.
Model update/delete/save-existing/bulk-write paths reject changes. This application protection does
not claim to prevent a privileged database administrator from modifying history. Explicit additive
bootstrap verifies validators and indexes, refuses incompatible existing validators and never drops
history. Missing or weakened required persistence protection fails closed before a mutation.

No route or UI is activated. Actor IDs are trusted internal command inputs, not authentication.
P04-007 must supply server authorization, CSRF, idempotency transport and audit views before exposing
adjustments. Reservation/commit/release workflows remain with P04-008 and checkout tasks. No provider,
production database or deployed schema was changed. Operations §7.2 documents controlled bootstrap
and preserving counters plus movement history through rollback/restore.

## Verification

Environment: local Node/npm workspace; isolated transaction-capable MongoDB 8.0.16 replica set.
Results below are observed runs, not deployment or independent acceptance.

| Command | Result |
| --- | --- |
| `npm exec --workspace=backend -- vitest run tests/unit/inventory.test.ts` | Passed: 14 tests on final validation logic |
| `npm exec --workspace=backend -- vitest run --config vitest.integration.config.ts tests/integration/inventory.test.ts tests/integration/products.test.ts tests/integration/categories.test.ts` | Passed: 37 tests (15 inventory, 14 product, 8 category) |
| `npm run test:unit --workspace=backend` | Passed: 357 tests before the final revision-integer predicate/validation cleanup; final focused tests above cover changed inputs |
| `npm run test:unit` | Passed: 54 tooling tests, including positive capability and negative private-model import fixtures |
| `npm run lint --workspace=backend` | Passed: 140 files |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed; final subsequent source changes covered by typecheck and focused tests |
| `npm run test:smoke --workspace=backend` | Passed: real startup/readiness and graceful shutdown |
| `npm run lint:boundaries` | Passed: 195 source files |
| `npm run format:check` | Passed: 295 files after two local formatting corrections |
| `npm run lint` | Passed after this evidence record and links were added |
| `git diff --check` | Passed |

Integration assertions cover concurrent identical replay, conflicting replay, competing deductions,
reserved/committed coverage, distinct concurrent increments, exact safe-integer limits, overflow and
underflow, invalid input, transaction requirements, rollback after ledger failure, append-only model
operations, native schema/unique-index rejection, missing indexes, incompatible validators and corrupt
stock failing closed. Product/category regressions verify existing ownership consumers.

Temporary logs: `/tmp/p04-006-database-final.log`, `/tmp/p04-006-unit-closed.log`,
`/tmp/p04-006-backend-unit.log`, `/tmp/p04-006-tooling.log`, `/tmp/p04-006-lint-closed.log`,
`/tmp/p04-006-types-closed.log`, `/tmp/p04-006-build.log`, `/tmp/p04-006-smoke.log`,
`/tmp/p04-006-format-final.log`, `/tmp/p04-006-docs-final.log`.
These are local artifacts, not durable CI links. Initial lint/format issues were corrected and rerun.
An automatic approval timeout prevented one combined command from starting; the separated test retry
ran successfully. No blocked or unexecuted attempt is counted as a passing run.

Not Run: frontend/browser/full CI, deployed persistence rollout, external provider checks, checkout
INV-01/INV-02 journeys and M2 acceptance. Those inputs/flows are outside this internal foundation.
No assertion of checkout overselling protection or launch readiness follows from these tests alone.

## Review and acceptance

On 23 October 2026, the project owner independently reviewed and accepted P04-006 through the
popup: “Review করেছি—accept করছি, Done করো”. Status: In Review → Done under AGENTS §13.
Acceptance covers this internal counter foundation; P04-007 HTTP/UI work, EXT-04 and M2 remain separate.
