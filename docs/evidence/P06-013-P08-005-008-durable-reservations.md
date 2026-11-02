# P06-013 / P08-005–008 — durable refund reservations and funded cancellation

**Current status: Package C P08-005/006/007/008 Done.** See [completion and consolidated verification](#package-c-completion). The initial record below remains historical for its revision.


1 November 2026, Asia/Dhaka. Executor: Codex. Starting HEAD `ac50d5a`; the earlier review/customer
changes were already staged by the user and were preserved. This record covers subsequent financial
work in the working tree. Full tasks remain **Blocked**; no policy, merchant, operator or independent
acceptance is supplied by this record.

During execution, the earlier staged review/customer work appeared in commit `c592c3e`. This work
did not create or publish that commit; its changes were preserved. The financial changes here are
the subsequent working-tree delta, not a claim of a clean committed release.

Final source/test/script/API delta relative to `c592c3e` has SHA-256
`54c07c8adb09f9004ebcd1eb3564eead72c29a67dea86f413015105e28ab42e5`.
It hashes the 21 sorted changed/untracked paths under `backend/src`, `backend/tests`, `backend/scripts`,
`backend/api` and `tests/tooling`, each as path + NUL + bytes (or `<deleted>`) + NUL. Documentation is excluded.

## Delivered local behavior

- Canonical `refunds` now supports source-funded merchandise/correction obligations with method,
  policy, approval, timing and capacity states. Generic edits/deletes remain prohibited; strict BSON
  checks bind class, amount, item/unit sums, approval and completion shape.
- Canonical `refundAttempts` has durable original bank/merchant identity, amount, status and CAS
  revision, unique request/reference identities and one open attempt per obligation. Created,
  submitted and uncertain remain distinct from confirmed payout. No TTL is permitted.
- Private current-admin reservation commits source-class and order holds, original unit/delivery
  holds, approved obligations, created attempts and audit together. Original prices/ordinals come
  through owning Orders/Returns capabilities; financial collections remain private to Payments.
  A deterministic natural group deduplicates changed keys and reasons. Multiple verified sources
  can split one original unit into separately funded obligations. Existing correction intents are
  advanced rather than duplicated; merchandise/correction capacities remain independent.
- A protected policy capability must supply method/version and consent where required. Request-body
  overrides are forbidden. Delivery reservation requires policy authority and original-charge caps.
  No approved calendar is invented: timing remains under review without a target date.
- Paid cancellation now has a real transaction-bound refund capability. Pending request, original
  pre-dispatch units and verified collected amount are reread, then refund reservation/attempts,
  stock/coupon release, cancellation history and audit commit atomically. Partial COD creates only
  the actually collected liability. Cross-admin cancellation/shipment races have one winner;
  downstream failure rolls financial and fulfillment effects back together.
- Explicit local cancellation HTTP exposes request/history and admin queue/decision. Customer and
  exact guest ownership/CSRF, exact Origin, mandatory replay keys, strict input and admin authorization
  are exercised. Ordinary application startup does not install these routes or refund capabilities.
- The private gateway dispatcher commits submitted intent before one outside-transaction provider
  call. Concurrent/replayed/different-key requests do not resend an already submitted/uncertain
  attempt. Provider acceptance preserves Processing and held balance; timeout preserves uncertainty
  and the original identity. No independently confirmed payout or automated retry is inferred.
- Payment-monitor correction queries now filter correction classification, keeping merchandise
  obligations out of the correction list. The approved `REFUND_BALANCE_EXCEEDED` error was added to
  executable error definitions and generated OpenAPI artifacts; implemented operation count stays 98.

## Migration and recovery

`bootstrap-refunds.mjs` is explicit local/test only. It recognizes only the exact correction-only
predecessor, checks row compatibility, adds declared indexes, upgrades validation and creates attempt
persistence without rewriting historical intents. Repeated execution preserves data; unknown drift
and deployed configuration are refused. No external database migration was run.

Use a compatible binary on rollback and preserve source/payment/unit/delivery counters, refund and
attempt identities, cancellation/allocation history, audit and notifications together. Never reset
submitted/uncertain to created or generate a new merchant ID merely to retry. DB failure after a
possible provider effect leaves the durable submitted identity for investigation.

## Actual verification

Local Node/npm, isolated MongoDB replica sets and Supertest. Cash/policy/consent and gateway outcomes
are explicitly synthetic fixtures. Real persistence, authorization, CAS, transactions, races, migration
and compiled bootstrap are exercised; real merchant or cash-verification acceptance is not established.

| Command | Observed result |
| --- | --- |
| `npm run build --workspace=backend` | Passed before compiled bootstrap and smoke checks. |
| `npm run typecheck --workspace=backend` | Passed. |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts payment-correction-migration.test.ts payment-records.test.ts orders.test.ts --reporter=dot --reporter=json --outputFile=../test-results/refund-cancellation-regression.json` | Passed: 320 tests / 4 files, including full affected order/payment/claim regressions and the new reservation, cancellation, dispatch and migration cases. |
| `npm run test:unit --workspace=backend -- --reporter=dot --reporter=json --outputFile=../test-results/refund-durable-unit.json` | Passed: 781 tests / 44 files. |
| `npm run test:contract --workspace=backend` | Passed: 112 tests, 4 API artifacts verified; local cancellation registration covered separately from implemented operation parity. |
| `node --test --test-isolation=none --test-name-pattern=REFUND-DURABLE-BOUNDARY tests/tooling/development.test.mjs` | Passed: one negative ownership/controller fixture. |
| `npm run lint --workspace=backend`, `npm run lint:boundaries` | Passed; 427 linted files, 390 source files with zero boundary violations. |
| `npm run test:smoke --workspace=backend` | Passed: compiled real DB startup, liveness/restricted readiness and graceful shutdown. |
| `npm run test:security` | Passed: redacted secret scan and dependency audit. |
| `npm run format:check`, task/checkbox audit, `git diff --check`, `git diff --cached --check` | Passed; 210 tasks remain 107 Done, 77 Not Started, 24 Blocked and 2 Deferred. |

The first API freshness check correctly reported stale generated OpenAPI after adding the approved
refund-balance error; `npm run api:generate --workspace=backend` regenerated the artifacts and the
contract rerun passed. An initial documentation-edit helper failed before writing; it was corrected.
No failed attempt is relabeled as a successful check. Local JSON artifacts are replaceable and ignored.

## Remaining work and gates

This completes the local durable reservation/attempt/one-shot-dispatch and funded-cancellation path,
not the complete requested backend. Independent final payout proof, atomic held-to-completed/release
transitions, safe retry and reconciliation worker, manual confirmation, refund notifications/timelines,
additional partial-refund request semantics, full refund HTTP/root activation and real provider/operator
qualification still remain. Other blocked task findings remain in the
[cross-task review](./blocked-backend-review-2026-11-01.md#task-by-task-review), except that its earlier
"correction-only/no reservation/no durable attempt" descriptions are superseded by this implementation.

P06-003 qualified rule/sign-off and accepted prerequisites remain unresolved. Existing task statuses
stay Blocked and checkboxes remain unchecked; no milestone or backend-stage acceptance is inferred.

## Package C completion

**2 November 2026 (Asia/Dhaka): P08-005/006/007/008 Done.** Executor and implementation reviewer:
Codex. This is ordinary engineering completion under Tasks §2, as authorized by the project owner:
“Package C fully complete and done koro.” It supersedes the historical local-only limitations above
for these four tasks. P06-013 retains its separately recorded Package A completion.

### Revision and prerequisite integration

Work began on `main`, HEAD `d33071b`, with a clean working tree. The previous Package B implementation
was present in `feat/order-operations-delivery` commit `9a7d0b2`, but absent from this main checkout.
Its already-authorized source, tests, contracts and completion records were combined into the working
tree as a prerequisite, preserving all Package C changes. File-level three-way merging used current
main as the baseline; imports, appended tests/fixtures and shared root/server argument order were
reviewed explicitly. Existing returnOptions argument positions remain compatible; refund dependencies
follow them. No branch switch, commit, index mutation, push, deployed migration or actual env edit ran.
The original pre-combination C files were retained under a temporary local recovery directory.
The final consolidated tests below validate both packages together, rather than treating historical
B results as evidence for new shared-root compatibility.

### Delivered task outcomes

| Task | Completed engineering behavior |
| --- | --- |
| P08-005 | Canonical separate refunds/attempts/commitments, existing additive migration and strict index/validator protection are integrated into current-admin HTTP and actual local/test startup. List/detail/group projections expose real statuses, source capacity, safe attempt references, approvedAt, timing and bounded status facts; original order/fulfillment remains unchanged. No alternate refund ledger or group collection. |
| P08-006 | Canonical purchase-time net unit/coupon calculations and deterministic source slices feed the actual group API. Approved shortage and inspected physical-return quantity limits, protected delivery-charge authority, actual verified collection balances and previous holds/completions all constrain amounts. Uncollected COD has no funded refund. Correction capacity is independent of merchandise units. Quantity capacity exhaustion returns REFUND_BALANCE_EXCEEDED; uninspected claims remain an eligibility failure. |
| P08-007 | Existing reservation coordinator reauthorizes current admin and policy, atomically commits source/order/unit/delivery holds, approved obligations, created attempt identities and audit. Same natural request converges across keys/admins; conflicting payload keys fail. Multi-source slices and correction-intent promotion preserve their canonical identities. Failure/concurrency cases use real MongoDB transactions. |
| P08-008 | The composed gateway dispatcher binds configured merchant to original verified source, saves original bank identity and unique 30-character merchant refund ID before its one external request, retains returned provider reference and leaves refund processing. Timeout preserves held funds and the original uncertain identity; replays never send again. Different-key replay aliases retain payload fingerprints. Missing transport fails unavailable before consuming the created intent. |

New owning files: `config/refunds.ts`, `refund-operations.service.ts`, `refund.routes.ts` and protected
configuration tests. Root composition alone builds protocol clients and supplies narrow capabilities;
controllers import no models. Payments adds only merchant identity to its existing source projection.
Returns/Orders/Payments remain owners of eligibility, immutable unit entitlements and funding. Added
negative boundary fixtures reject foreign-model imports from refund HTTP/orchestration.

The exposed C operations are GET `/admin/refunds`, GET `/admin/refunds/{refundId}`, POST
`/admin/refund-groups` and POST `/admin/refunds/{refundId}/payout-attempts`, under `/api/v1`.
Browser mutations require current admin, exact Origin/CSRF and Idempotency-Key. DTO/query allowlists,
canonical pagination and source/status/classification filters apply. Admin responses redact original
bank references, command keys, consent/transfer proofs and unmasked destinations. Missing ledger
readiness returns 503 without schema repair. API/Database/Testing/Operations owning sections were updated.

`REFUND_OPERATIONS_ENABLED` defaults false and permits only local/test with admin authentication.
Optional protected `REFUND_POLICY_FILE` binds authorizations to exact order/basis/claim. The delegated
`sportzone-refunds-v1` development baseline prefers original gateway; manual fallback requires
protected consent, delivery approval defaults false. Missing approved holiday/calendar basis leaves
timing under_review with no invented target date and does not hold up an otherwise authorized payout.
Canonical SSLCOMMERZ sandbox settings are required for transport activation; configuration alone is
not merchant qualification. The policy register is not a public input or fabricated consent receipt.

### Observed verification

Commands below were executed against the final combined implementation. Vitest commands run from
`backend`; other commands run from repository root. Integration infrastructure is isolated disposable
MongoDB 8.0.16 replica set with real transactions and temporary local HTTP listeners. Provider/cash
proofs are labeled synthetic fixtures; no local .env or deployed database/provider was used.

| Command | Result / local artifact |
| --- | --- |
| `../node_modules/.bin/vitest run --reporter=dot --reporter=json --outputFile=../test-results/package-c-combined-unit.json` | **802 Passed**, 48 files |
| `../node_modules/.bin/vitest run --config vitest.integration.config.ts tests/integration/checkout-quote.test.ts tests/integration/orders.test.ts tests/integration/payment-correction-migration.test.ts tests/integration/media.test.ts tests/integration/guest-access.test.ts tests/integration/customer.test.ts --reporter=dot --reporter=json --outputFile=../test-results/package-c-combined-integration.json` | **396 Passed**, six files |
| `../node_modules/.bin/vitest run --config vitest.contract.config.ts --reporter=dot --reporter=json --outputFile=../test-results/package-c-combined-contract.json` | **112 Passed**, default implemented registry and explicit local B/C routes agree; canonical inventory 166 |
| `npm run build --workspace=backend`; `npm run typecheck --workspace=backend` | **Passed** after root/prerequisite combination |
| `npm run lint --workspace=backend`; `npm run lint:boundaries` | **Passed**; 442 lint files; 401 boundary files, zero errors |
| `npm run api:generate --workspace=backend`; `npm run api:check --workspace=backend` | **Passed**, four current artifacts |
| `node --test --test-isolation=none tests/tooling/ci.test.mjs tests/tooling/development.test.mjs` | **79 Passed**, including B/C persistence-boundary negatives and compiler/runtime lifecycle |
| `npm run test:smoke --workspace=backend` | **Passed**, compiled DB startup, default safety, restricted health and shutdown |
| `npm run test:security -- --scope=backend` | **Passed**, redacted gitleaks and dependency report in `test-results/security.json` |
| `npm run format:check`; `git diff --check` | **Passed**, final formatting inventory 607 files |

The nine new C HTTP cases prove: canonical group/list/detail and natural replay/redaction; current
admin/Origin/CSRF/key/strict input negatives; uncollected COD/missing consent/premature inspection;
concurrent natural reservation and unit cap; one-shot gateway acceptance and alias conflicts;
missing transport/merchant mismatch/timeout; suspended admin and unavailable persistence; default
policy promotion of a real verified correction intent without merchandise effects; actual server
startup loading protected policy while default startup omits routes. Existing suites additionally
verify multi-source unit splitting, historical poisha arithmetic/discounts, delivery cap/consent,
post-write rollback, immutable orders, duplicate/late collections and additive migration refusal/drift.
B's 11 HTTP cases, private Media retention, current guest/customer authorization and batch stock
restoration regressions were all rerun in the same final consolidated run.

Earlier C-only checks passed 798 unit, 329 integration and 112 contract cases. Those artifacts describe
the earlier main-only inputs; final combined artifacts above supersede them. Initial focused tests
caught incorrect pagination/fixture reference assumptions and exposed quantity-cap HTTP mapping;
fixtures and the owning reservation guard were corrected before rerun. A final format-only mismatch
was fixed and format:check rerun; no behavior changed in that formatting correction. No failed check
is presented as passed without its observed rerun.

Final combined source/test/script/API/tooling snapshot relative to HEAD `d33071b` covers 36 sorted
changed/untracked paths, encoded path + NUL + bytes + NUL, excluding documentation:
`62028140231e20ad6b3e39babc7fe072ba3255b1feaeafa9de8c5f61a7b53db9`.
Executor inspected actual combined diffs for scope, module ownership, current auth, secret exposure,
funding/quantity/concurrency invariants, replay safety and compatible argument/migration boundaries.

### Scope and completion disposition

Payout verification/completion/release, reconciliation worker, authorized safe retry, manual confirmation
and refund notification integration remain Package D P08-009/010/011, as originally separated in the
owner's package plan. Customer cross-order refund history remains its owning Package E work. They
are not represented by a fake completed payout. Actual merchant refund capability/sandbox/live
qualification, real consent/legal policy publication, deployed scanner/media and launch checks retain
P11-005/007/008 and other existing release owners. No real payout, email, external upload/deletion,
production/staging activation, application closeout or milestone acceptance was performed.

Transition: P08-005/006/007/008 **Blocked → In Progress → Done**, with B's already-completed prerequisite
commit restored into current checkout. Final register: **210 tasks; 119 Done, 12 Blocked,
77 Not Started, 2 Deferred**. No Package D/E task or M1–M8 milestone was accepted.

Final closeout checks: `npm run lint` **Passed** (781 repository files, 1546 local links, zero
errors); final `npm run format:check` **Passed** (607 files); `git diff --check` **Passed**.
Inline register audit confirmed 210 unique IDs, checkbox/status parity, 119 Done / 12 Blocked /
77 Not Started / 2 Deferred and Done immediate prerequisites for all four C tasks. Final source
snapshot matched the recorded hash after route formatting; the correction changed whitespace only.
Final JSON artifacts were checked for success, zero failures and the exact counts recorded above.
