# P04-008 — Transaction-scoped inventory allocation

**Date:** 23 October 2026 · **Implementer:** Codex · **Status:** Done
**Sources:** FR-13; Architecture §§6, 10.3; Database §§7.7–7.8; Testing INV-04.

## Scope and ownership

Selected the independent backend allocation dependency after accepted P04-006. P04-007 admin
adjustments/views remains Not Started; this task does not deliver or accept its HTTP/UI behavior.
The starting tree contained owner-staged P04-006 and verification-policy changes against HEAD
`0fa8e10`. Those staged entries and acceptance history were preserved; this agent did not stage or commit files.
During execution the accepted foundation appeared in HEAD `c6dded9`; final diff review uses that
baseline and preserves the externally created commit.
The new work reuses the accepted inventory model/persistence/schema files and catalog stock capability.

`backend/src/modules/inventory/allocation.service.ts` provides five cohesive operations:

| Operation | Guard / stock change |
| --- | --- |
| `reserve(session, command, heldAt)` | Initial or next released generation only; available capacity → reserved; expires exactly heldAt + 15 minutes |
| `commitCod(session, command)` | Direct committed generation; no online hold clock; available capacity → committed |
| `commit(session, command)` | Unexpired held generation only; reserved → committed; removes expiry |
| `release(session, command, expectedStatus)` | Expected held or committed generation only; decrements that counter once; removes active key |
| `ship(session, command)` | Committed generation only; decreases physical and committed together; terminal shipment |

Commands contain order/variant identity, quantity (canonical line limit 1–50), generation, stable
operation key and reason. Model registration and strict BSON validation for `inventoryReservations`
live with existing inventory persistence. Generation and partial active-allocation unique indexes
preserve history; the expiry index is not TTL. Missing or incompatible persistence fails closed.

## Transaction and integration contract

An active caller transaction is mandatory. No nested transaction, public route, worker, provider call
or automatic runtime activation was added. The caller must validate current order status, funding,
risk/cancellation eligibility and coupon state in the **same transaction**, call primitives sequentially
in stable variant order, and abort on any error. These trusted internal inputs do not authorize an
HTTP caller. Checkout, payment application, expiry scheduling and fulfillment will integrate these
primitives in their owning tasks; no cancelled-order, payment-verification or coupon workflow is
claimed implemented here.

Capture one trusted server `heldAt` for all stock lines and the coupon generation. The first generation
is 1; a new generation is exactly the released predecessor + 1. A replay never resets expiry, mutates
another generation or reopens shipped stock. Replay matches order, quantity, generation, reason and
canonical movement deltas, returning the referenced allocation's **current** state, not a fabricated
historical HTTP response. Duplicate keys with changed arguments conflict.

Expected-state release prevents an expiry command for held stock from releasing a generation that
has become committed. Counter writes serialize competing SKU operations; reservation CAS and movement
uniqueness guard transitions. Stock, reservation and movement writes share the supplied transaction.
Allocation appends use validated `insertMany`, avoiding document-save rollback tracking while retaining
strict model/database validation. Caller failure or ledger failure rolls back every effect.

Only inventory and root wiring can consume the catalog counter capability at runtime. A new transitive
boundary fixture rejects bypasses from checkout helpers and jobs, while inventory service consumption
remains allowed. No second product-variant model or forwarding/composition files were introduced.

## Verification

Environment: local repository Node/npm workspace with isolated MongoDB 8.0.16 replica sets. The focused
scope follows Testing §15.5; this is not phase closeout or a release-candidate run.

| Command | Observed result |
| --- | --- |
| `npm exec --workspace=backend -- vitest run tests/unit/inventory-allocation.test.ts tests/unit/inventory.test.ts` | Passed: 27 tests (13 allocation command cases + 14 accepted counter regressions) |
| `npm exec --workspace=backend -- vitest run --config vitest.integration.config.ts tests/integration/inventory-allocation.test.ts tests/integration/inventory.test.ts` | Passed: 31 tests (16 allocation + 15 counter regressions) |
| `npm run test:unit` | Passed: 55 tooling tests including stock-capability bypass fixtures |
| `npm run lint --workspace=backend` | Passed: 143 files |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed |
| `npm run lint:boundaries` | Passed: 196 source files |
| `npm run format:check` | Passed: adopted source/tooling inventory |
| `npm run lint` | Passed: documentation and repository/link checks |
| `git diff --check` | Passed |

Integration covers competing capacity, concurrent identical reservation replay, conflicting quantity/
reason/order reuse, hold clock/reacquisition history, late commit rejection, commit/release and shipment/
cancellation races, direct COD commitment, unchanged counters on invalid input, full Unicode reasons,
caller/batch/ledger rollback, native state/expiry validation, active uniqueness, absence of TTL, missing
indexes and refusal to replace incompatible validators. Counter arithmetic/replay tests protect the
previously accepted P04-006 behavior.

Initial type-check issues were corrected without casts or suppressed checks. An initial caller-abort
case exposed document-save rollback tracking failure; switching the primitive's inserts to validated
bulk inserts fixed it, and final rollback tests passed. No failed attempt is included in passing counts.

Local temporary logs: `/tmp/p04-008-unit-final.log`, `/tmp/p04-008-integration-final.log`,
`/tmp/p04-008-tooling.log`, `/tmp/p04-008-types-final.log`, `/tmp/p04-008-lint-final.log`,
`/tmp/p04-008-build.log`, `/tmp/p04-008-format.log`, `/tmp/p04-008-docs.log`.
These are local artifacts, not durable hosted CI evidence.

Not Run: full backend/monorepo CI, application smoke/browser suites (startup and frontends unchanged),
checkout INV-01–03 journeys, payment/coupon/order integration, deployed schema migration and provider
verification. No M2 or launch acceptance follows from primitive tests. Phase closeout retains its
consolidated regression requirement.

## Documentation and rollout

Architecture §6 restricts counter-capability consumers; §10.3 records the caller-transaction contract.
Operations §7.2 owns explicit `initializeAllocationPersistence(connection)` bootstrap through an
authorized runner; it verifies both movement/reservation collections and never migrates HTTP startup.
Existing incompatible validators need a reviewed migration. No production bootstrap was executed.
Rollback/restore must retain counters, reservation generations and movement history together; no
history deletion, counter reset or automatic restock is supplied. Database/API contracts and existing
external gates are unchanged. Testing indexes this evidence and separates primitive INV-04 from future
checkout acceptance. TASKS and Changelog record status/history.

## Independent review

On 23 October 2026, the project owner independently reviewed and accepted P04-008 through the
popup: “Review করেছি—accept করছি, Done করো”. Status: In Review → Done under AGENTS §13.
Acceptance covers the allocation primitives and recorded focused verification. P04-003/EXT-04 remains
Blocked; P04-007, checkout/payment/order integration and milestone acceptance remain separate.
