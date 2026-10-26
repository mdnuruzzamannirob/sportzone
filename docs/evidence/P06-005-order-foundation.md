# P06-005 — Order snapshot foundation

**Date:** 26 October 2026 (Asia/Dhaka)
**Executor:** Codex
**Status:** Done; accepted by project owner on 26 October 2026
**Revision:** Working tree against `467a79267384e7abc4c0cd22b8bf8091ba6f3016`.
Existing accepted work was preserved; no commit/reset/cleanup was performed.

## Scope and contracts

Sources: FR-11/FR-14, Database §§7.2–7.3, Architecture §10.4, API §11 and Testing §10.
P06-004 is accepted. P06-003 remains Blocked for qualified operator/legal evidence.
No public HTTP contract changes, new collection beyond the approved orders/item balances, dependency
or frontend changes are introduced. Existing API artifacts remain unchanged.

The orders module owns canonical models, strict BSON validators, additive index setup, snapshot
construction and transaction-required creation. Creation requires a checkout-owned capability which
must authorize principal/current consent, bind intent/order and consume the quote in the same outer
transaction. Production intent/allocation/payment adapters and submission routes are later tasks;
this module is deliberately not enabled in root HTTP wiring.

## Delivered behavior

- Unique opaque order numbers, checkout intent identities and per-line balance keys. Guest ownership
  is explicit null; registered ownership remains an ObjectId. No duplicate order payment-status field
  or fabricated collection is introduced. New fulfillment is pending for both COD and online methods.
- Immutable product/variant/price/discount, contact/address/delivery/rule, pricing, policy and consent
  snapshots. Nested save/query/replacement writers reject historical changes; raw writes face strict
  BSON shape/type validation. Privileged database access still requires operational controls.
- Commercial digest, stable lines, policy references, accepted payment eligibility, integer-poisha
  pricing and consent timing are checked before persistence. Exact per-unit refund quotient/remainder
  yields deterministic ordinals, including zero-net merchandise. Unit entitlements remain immutable;
  BSON guards reject malformed ordinal coverage and held/completed amounts above entitlement.
- Event-derived delivery commitment is separate from immutable deadline basis. Placement can establish
  an approved placement cap; confirmation dates are never guessed. Fixtures use synthetic reviewed
  rules and do not establish actual legal approval.
- Ordinary fulfillment graph rejects invalid jumps and terminal transitions. Exceptional final
  non-delivery is classified separately; graph validity never proves funding, ownership, stock,
  disposition or operational authorization. Operational transition service/API remains P06-011.
- Order, unit balances and audit share the caller's MongoDB transaction. Missing persistence readiness
  fails before consent consumption. Audit failure rolls back the entire test coordinator transaction.
- Local/test compiled bootstrap is additive, preserves history, refuses validator drift and refuses
  staging/production. No TTL, destructive migration, provider request or financial effect is enabled.
- Checkout-owned consent hashing is shared by quote and order consumers, with existing quote regression
  passing. No private persistence crosses into frontend/shared technical modules.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0; isolated MongoDB 8.0.16 replica sets.
Checks below passed on the working tree; no production/staging/provider acceptance is implied.

| Command | Result |
| --- | --- |
| `npm run test:unit --workspace=backend -- tests/unit/orders.test.ts tests/unit/checkout-quote.test.ts tests/unit/delivery-deadline.test.ts tests/unit/pricing.test.ts` | Passed: 66 tests / 4 files |
| `npm run test:integration --workspace=backend -- tests/integration/orders.test.ts tests/integration/checkout-quote.test.ts` | Passed: 36 tests / 2 files, including 15 order cases |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed; compiled bootstrap exercised afterward |
| `npm run lint --workspace=backend` | Passed: 275 files |
| `npm run lint:boundaries` | Passed: 281 files, zero errors |
| `npm run format:check` | Passed: 439 files |
| `npm run api:check --workspace=backend` | Passed: 4 artifacts |
| `npm run lint` / `git diff --check` | Passed: repository links/structure and whitespace checks |
| `npm run test:security` | Passed: gitleaks 8.30.1, no findings; dependency audit zero vulnerabilities |

Integration evidence: [MongoDB report](../../test-results/database.json).
Security evidence: [security report](../../test-results/security.json).
Reports are generated local artifacts and can be replaced by later runs; this record retains observed
scope/counts. Bootstrap tests also verify production refusal, repeated additive execution and retention.

The test coordinator uses real durable quote records and a minimal test-only checkout-intent fixture;
it proves concurrent uniqueness, scope/quote consumption and rollback, not the production P06-006
intent contract. Further cases cover source mutation, immutable nested writes, invalid transitions,
missing indexes, schema drift, raw invalid balances and full Unicode boundary preservation.

Initial verification exposed MongoDB rejection of empty JSON-schema required arrays, an immutable
Mongoose schemaVersion default on hydrated documents, and an invalid-transition error classification.
These were fixed and affected integration cases rerun successfully. Initial reports were preserved
locally at `/tmp/P06-005-validator-initial-failure.json` and
`/tmp/P06-005-first-order-integration.json`; they are not current passing evidence.

Not Run: full backend stage/integrated release suites, frontend/browser checks, live provider tests and
staging/production provisioning. This is a private backend foundation with no HTTP startup/route change;
change-based verification applies. Required future allocation/payment/retry/recovery and legal gates
remain independent.

## Recovery and handoff

Operations now documents the compiled bootstrap and preservation requirements; Testing records the
order foundation assertions. Database/API contracts were reconciled without changing their public
behavior. Roll back code together with its consumers; retain orders, unit balances, quotes and audit
records. Validator drift requires reviewed provisioning, never silent runtime repair.

The order foundation is accepted. P06-006 durable intent, P06-007 allocation coordination, P06-008/P06-009
submission/payment integration and P06-011 operational mutations remain unaccepted future work.
No milestone or qualified compliance approval is inferred from this implementation.

## Independent acceptance

On 26 October 2026, the project owner instructed “done koro” after the implementation and verification
handoff. P06-005 moves In Review → Done on that independent acceptance. Existing observed test results
remain valid for unchanged implementation inputs; this closeout edits execution records only.
Production intent/submission, stock/coupon allocation, payment and operational transitions remain their
own tasks. P06-003 qualified compliance evidence and all milestone/provider/staging gates remain separate.
