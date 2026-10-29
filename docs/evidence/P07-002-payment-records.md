# P07-002 — Payment record persistence

Status: **Done**, project-owner acceptance recorded below. Executor: Codex, 29 October 2026.
Revision: working tree based on `3364e512d9d17b03a123238ec8d6a9b8018b0adb`.
Sources: [Database §§8.4–8.6](../DATABASE.md#85-paymentattempts--payments),
[Architecture](../ARCHITECTURE.md), [Testing §11](../TESTING.md#11-payments-returns--refunds-test-cases).

## Delivered scope

Payments owns new private models, persistence validators and attempt preparation under
`backend/src/modules/payments/`. The existing canonical aggregate remains compatible with COD.
Preparation requires an explicit authorization/allocation capability and caller transaction; it
reauthorizes replays, fences concurrent creation through aggregate revision, blocks unresolved attempts,
uses fresh 30-character provider references and preserves immutable remaining-balance/expiry snapshots.
Retries retain terminal parent lineage; audit failure rolls back both creation and aggregate fence.

Receipt intake supports unmatched verified-money evidence without invented order identifiers. Linked
collections preserve distinct source identities even on the same attempt. Strict BSON validators,
unique/partial indexes, immutable core fields, guarded mutable projections and allocation/refund caps
protect persistence. Financial TTL indexes fail readiness. Additive local/test bootstrap preserves
records, refuses unknown schema drift and refuses staging/production.

No route/controller, provider client, callback, default allocation adapter or runtime receipt writer
is connected. Future payment initiation must supply actual ownership/current-order/allocation/channel
qualification and durable HTTP idempotency. Receipt verification/linking/reclassification must enforce
cross-document aggregate consistency and audit in its owning transaction. Synthetic receipt fixtures
are controlled test data, not proof of provider validation or merchant activation.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, isolated MongoDB 8.0.16 replica sets; no merchant calls.

| Command | Observed result |
| --- | --- |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed; compiled bootstrap exercised below |
| `npm run lint --workspace=backend` | Passed, 307 files |
| `npm run test:unit --workspace=backend -- payment-attempt.test.ts` | Passed, 2 tests |
| `npm run test:integration --workspace=backend -- payment-records.test.ts checkout-intent.test.ts orders.test.ts` | Passed, 44 tests across 3 suites; payment records 15, intents 14, orders 15 |
| `npm run lint:boundaries` | Passed, 303 files, zero errors |
| `npm run format:check` | Passed, 471 files |
| `git diff --check` | Passed |
| `npm run api:check --workspace=backend` | Passed, 4 artifacts; no public API activation |
| `npm run lint` | Passed final rerun, 614 files and 1377 local links; zero errors |

Integration report: `test-results/database.json` (local generated artifact). Tests cover concurrent
same/different operation identities, reauthorization and payload conflicts, uncertain/expired replay,
terminal retry references, risk/unassigned/fully funded/range rejection, audit rollback, exact receipt
identity, strict invalid amount/evidence rejection, refund caps, immutable core guards and drift/TTL
refusal. Existing checkout-intent and order transaction suites remain green.

During development, fixture literal widening failed typecheck and lint flagged control-character
regex/optional-chain/unused-import issues. Corrected before the successful verification above.
Live provider/sandbox, real independent receipt verification, public payment HTTP, deployed migration,
container and application-stage regression: **Not Run**, outside this private persistence work package.

## Recovery and review

Contracts updated in the owning Database, Operations and Testing sections; no new package or secret.
Use `backend/scripts/bootstrap-payment-records.mjs` only after build in local/test. Provisioning can
leave successfully created collections if later checks fail; inspect and resume explicitly. Preserve
attempts, receipt intake, collections and audit on rollback. Do not drop history or downgrade validators.
No production financial mutation performed. P07-001/003/004/006/013 and merchant/channel gates remain
separate. Reviewer decision: accepted for the submitted persistence scope, as recorded below.

## Independent acceptance

Reviewer: project owner, 29 October 2026. Decision: accepted through explicit instruction
“done koro” after the implementation and verification handoff. P07-002 changes from In Review
to Done. This accepts the private persistence foundation and recorded local test evidence; it
does not accept live provider verification, payment initiation, merchant activation or a milestone.
Acceptance update changes documentation only; existing code verification remains applicable.
