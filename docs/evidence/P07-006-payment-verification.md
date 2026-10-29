# P07-006 — Independent provider payment verification

Status: **Done**, project-owner acceptance recorded below. Executor: Codex, 29 October 2026.
Revision: started on `29e95d8123443e48e359c7014eadd24c90a4ef74` with prior P07-005 edits.
During execution the owner committed those edits as `5b3d8da0bceb34b51021e9ce8ef0ef21f80acf62`;
this submission now contains only P07-006 changes and preserves concurrent user work. P07-005 remains In Review; no prerequisite or milestone was self-accepted.
Sources: FR-12; [API §12.3](../API.md#123-ipn-browser-returns-and-independent-verification),
[Database §8.6](../DATABASE.md#86-providerreceiptintake-and-paymentcollections--verified-receipts),
[Testing §11](../TESTING.md#11-payments-returns--refunds-test-cases),
[SSLCOMMERZ v4](https://developer.sslcommerz.com/doc/v4/).

## Scope and ownership

`backend/src/modules/payments/payment-verification.service.ts` implements a read-only independent
verification capability using the existing provider adapter. Payments owns business classification and
private canonical attempt/initiation/payment reads; providers/sslcommerz retains credentials, fixed
endpoints, protocol validation and decimal conversion. No route/controller model access, shared-to-domain
import, new collection, dependency or public API is introduced. Executable import boundaries pass.

Claimed callback status, amount, currency and bank identity are never evidence. A supplied validation
reference is independently validated through the configured merchant credentials; returned merchant,
validation and collection references must satisfy adapter/business checks. Without a validation ID,
the merchant transaction API is queried. Every discovered successful collection is independently
validated, retaining multiple collections. A stale failed query entry cannot override verified paid
evidence. Missing, pending, unattempted, conflicting or unavailable results remain uncertain.

Canonical protected attempt identity, immutable expected amount, payment/order association and the
initiation's merchant/order/attempt binding determine tentative mapping. Missing or foreign binding
remains unmatched, never a fabricated order. A callback claiming another transaction cannot authorize
allocation to its claimed order. The later transactional coordinator must recheck mapping and current
funding/fulfillment eligibility; this read projection is not a financial authorization fence.

Positive integer BDT amount and requested currency, accepted status, unique bank/validation references
and explicit risk classification are required. Verified partial/excess amounts remain visible with
under_collected/over_collected classification and no automatic allocation candidate. Inconsistent
provider requested amount also blocks candidacy. High-risk evidence remains verified evidence with
review_required and cannot become an automatic fulfillment candidate. Provider collection time is
retained in its sanitized protocol representation; no local time or UTC conversion is invented.
Evidence digest hashes normalized allowlisted facts, excluding raw provider/card/customer/credential
fields. Missing canonical validator/index protection fails closed before provider calls.

This capability performs **no financial writes**, receipt linking, stock/coupon effects, audit commit
or callback acknowledgment. No runtime composition is enabled: callback default remains 503.
P07-007/008/009/012 retain durable receipt identity, replay, funding/allocation and reconciliation work.
The service's successful return alone must never be adapted into callback `committed`; it is not a
durable outcome. Local verification supports review without bypassing P07-005's pending acceptance.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, Vitest 5.0.5; isolated MongoDB 8.0.16 replica set. The actual
SSLCOMMERZ adapter used an injected synthetic fetch transport. No real provider/merchant call occurred.

| Command | Observed result |
| --- | --- |
| From backend: `../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/payment-verification.json payment-verification.test.ts` | Passed 32 tests; local generated report `test-results/payment-verification.json` |
| `npm run test:unit --workspace=backend -- sslcommerz.test.ts` | Passed 58 existing provider adapter tests |
| `npm run typecheck --workspace=backend` | Passed final source/tests |
| `npm run build --workspace=backend` | Passed final runtime source |
| `npm run lint --workspace=backend` | Passed, 333 files |
| `npm run lint:boundaries` | Passed, 318 files and zero errors |
| `npm run format:check` | Passed, 497 files |
| `npm run lint` | Passed, 645 files and 1413 local links, zero errors |
| `git diff --check` | Passed |

Coverage includes forged callback values, merchant/currency/reference mismatch, fractional/overflow/zero
amounts, missing/invalid risk, high risk, partial/excess amounts, unknown/foreign/order-inconsistent
mapping, conflicting collection identity, separate collections, uncertain transport, terminal query
outcomes, pending/missing records, sanitized digest stability, dropped unique index and transaction
exclusion before provider I/O. Tests verify pending payment state and zero financial intake writes.
An initial test fixture explicitly set an optional property to undefined, which strict TypeScript
rejected; fixtures now omit the property. The final type check passes with no suppression.

Broader backend regression, frontend/UI, real provider sandbox/merchant qualification, deployed
activation, durable receipt concurrency and actual financial allocation were **Not Run** for this
read-only verification capability. Public API contracts did not change, so prior P07-005 contract
results are not claimed as a fresh P07-006 run. Existing user/previous task edits were preserved.

## Recovery and status

No migration or startup option was added. Removing this unused runtime capability changes no stored
financial state. Keep callback processing retryable until a qualified durable coordinator commits its
outcome. Provider retry/ACK behavior, receipt deduplication, current mapping/funding fences and
reconciliation must be accepted before activation. Project-owner acceptance is recorded below; no payment,
provider/channel or milestone gate was accepted.


## Independent acceptance

On 29 October 2026 the project owner instructed “done koro” after the P07-006 handoff.
This accepts the submitted read-only verification capability and its recorded verification.
It does not authorize runtime financial processing or accept P07-005, merchant/channel activation,
provider sandbox qualification or a milestone. Callback runtime remains retryable 503 pending
the separately reviewed durable receipt/replay coordinator.
