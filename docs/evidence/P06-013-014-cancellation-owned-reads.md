# P06-013 / P06-014 — Local cancellation and owned order reads

Date: 30 October 2026 (Asia/Dhaka). Executor: Codex. Base revision: `eb2586c`.
Status: **Blocked** for full task acceptance; safe local work and verification completed.
No task checkbox, prerequisite, legal/provider gate or milestone is accepted by this record.

## Scope and decisions

The owner requested the next two tasks after authorizing local implementation/tests despite the
blocked P06-011 prerequisite. Continued within the backend stage; no prerequisite was removed.
Sources: FR-14/15/26, API §§11.1/11.3/14.2 and Appendix D.2/D.3, Database §§7.2–7.4,
Architecture §§4–6 and Testing §§10–11/15.5. No new product scope or infrastructure was introduced.

API §11.1 originally showed `{reason}` alone while D.3 required REPLAY for cancellation submission.
The owner explicitly selected “Idempotency-Key বাধ্যতামূলক করুন”. Updated the owning route and
replay contract. This authorizes mandatory submission keys, not policy/financial task acceptance.

## Separate local outcomes and remaining gates

| Task | Implemented behavior | Observed acceptance checks | Remaining prerequisite |
| --- | --- | --- | --- |
| P06-013 | Canonical strict cancellation requests, one pending per order, scoped hashed submission identity, current customer/verified guest CSRF/ownership, admin approve/reject and immutable audit | Concurrent same-key convergence; changed reason/key conflicts; reviewed-key replay; guest identity; foreign owner/customer-admin denial; CSRF failure | P06-011, paid refund obligations and cancellation HTTP integration |
| P06-013 | Order/payment fences, explicit Processing dispatch verification, exact whole-generation stock/coupon release and cancelled history once; attempts retained | Dispatch/cancel race across admins; post-release failure rollback; no ordinary Shipped cancellation; unpaid COD no refund; pending online late funds remain correction-only | P06-011, paid refund obligations and cancellation HTTP integration |
| P06-013 | Required transaction-bound refund-obligation capability when verified collections exist; default denies paid approval | Verified COD stays Paid/Confirmed with stock committed and request pending when no real planner exists | P06-011 acceptance, real source-backed merchandise refund obligations and cancellation HTTP/admin Origin/CSRF/rate/DTO integration |
| P06-014 | Actual GET /orders, /orders/{orderId}, /orders/{orderId}/status; current customer or exact guest ownership, stable pagination/no-store, historical prices/addresses/terms/timing and batched independent payment summary | Customer/guest isolation, expired proof, invalid customer cookie no-fallback, current suspension, strict filters/pages, immutable catalog/settings changes, absent policy history failure, root flag activation | Declared P06-011 prerequisite and independent full task acceptance; deployed/legal/staging gates remain separate |

All 17 new cases are named `cancellation/read local` in the existing checkout integration suite.
Cancellation mutations remain private domain capabilities, not publicly registered routes. Only the
three read endpoints were added to the executable registry (98 implemented / 66 planned, total 164).

## Ownership and safety review

Orders owns requests, review and cancellation/order history, plus read DTOs/routes and ownership
filters. Auth exposes actual customer/guest principal scope; the opaque guest session ID is retained
only in private request provenance, never public DTOs. Payments provides narrow amount/method/revision
fences and allowlisted summary reads, batched once per history page. Checkout coordinates private
inventory/coupon services and reads the exact consumed quote policy snapshot; no foreign model imports.
Controllers contain no models or business mutations. Root read activation is explicit and default off.

Submission hashes order/principal/key and binds normalized reason. Same key returns the original
request after review, with no new audit or order/stock effect. A different key cannot replace an
existing pending request. Creation fences current order revision against dispatch. Admin decision
requires current active admin and matching request status/revision; approval rechecks lifecycle,
physical dispatch and canonical payment method/expected total before transactionally releasing exact
stock/coupon generation, updating order/history/request and audit. Processing requires explicit
`dispatchNotStartedConfirmed=true`; Shipped cannot ordinarily cancel. Rejection preserves stock/order.

No verified collection is deleted, marked Failed or made non-reconcilable on cancellation. A late
provider collection after unpaid online cancellation stays correction-only without reopening the order
or reacquiring stock/coupon. Current refunds support correction-only unreserved intents; this work
does not invent merchandise refund records or mark cash uncollected. Without a real refund planner,
paid approval throws and the transaction preserves request/order/payment/allocation. Paid approval
and cancellation HTTP/admin transport are intentionally incomplete and therefore not Done.

Reads are private no-store and reject customer-cookie downgrade. Lists use immutable order totals
and current independently stored payment status. Detail selects historical lines/pricing/address and
consent; it excludes internal approval basis, reviewer/digest/evidence references, actor IDs/reasons,
request keys and provider credentials. Consumed quote references must match order/consent/digest;
missing historical policy data returns unavailable instead of current-policy substitution. Assess that
history dependency before cleanup or activation. Claim eligibility is explicitly under_review; it does
not assert that the customer's legal claim rights are absent. No fake Returned fulfillment enum is
introduced; cancelled fulfillment and Paid correction funding remain separate and are tested.

Reviewed actual diff for ownership/imports, mutation ordering, current auth, privacy, replay and
concurrency, source preservation and rollback. No `.env` read/edited, commit/push/deployment, real
customer cancellation, money transfer or provider/email action was performed.

## Verification

Environment: local Node/npm, isolated MongoDB 8.0.16 replica sets, local HTTP/compiled child fixtures.
Approval, cash and gateway behavior use clearly synthetic fixtures. Existing canonical checkout
services create real persisted test orders; auth uses actual customer/admin/verified guest sessions.

| Command | Observed result |
| --- | --- |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed before final compiled bootstrap/consumer tests |
| `npm run api:generate --workspace=backend` | Four artifacts generated |
| `npm run test:contract --workspace=backend` | Passed: 111; four artifacts current |
| `npm run test:unit --workspace=backend -- operations.test.ts orders.test.ts checkout-intent.test.ts browser-security.test.ts` | Passed: 68 across four files, including explicit read-activation check |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/cancellation-order-read-regression.json checkout-quote.test.ts guest-access.test.ts orders.test.ts payment-records.test.ts inventory-allocation.test.ts coupon-allocation.test.ts` | Passed: 268 across six files (167 checkout including 17 new; 19 guest; 23 order; 15 record; 16 inventory; 28 coupon) |
| `npm run lint --workspace=backend` | Passed: 373 files |
| `npm run lint:boundaries` | Passed: 352 files, zero errors |
| `npm run format:check` | Passed: 537 files |
| `npm run lint` | Passed: 692 files, 1459 local links, zero errors after fixing two evidence-table cells |
| Task status/checkbox audit | Passed: 210 tasks, checkboxes match Done statuses |
| `git diff --check` | Passed |

Initial focused fixtures expected 403 for invalid/suspended customer or mismatched guest proof;
existing auth contracts return 401, so assertions were corrected without weakening guards. An initial
unit run lacked local-listener permission and 14 HTTP cases failed with EPERM; the permitted run
passed all 68. Focused work then expanded to full final regression. One local edit script asserted on
a formatted-text match after an earlier safe edit; inspected actual files, applied the remaining edit
and passed typecheck. No failed check is represented as a pass. Ignored JSON outputs are local
replaceable artifacts, not committed production evidence.

Not Run / Blocked: real paid cancellation/refund-obligation integration, public cancellation/admin
HTTP security contracts, P06-011 qualified/full acceptance, real deployment/legal/provider/cash/email,
frontend/browser and backend-stage/milestone acceptance. Existing valid checks are reused under Testing
§15.5; no unrelated full frontend pipeline was run.

## Rollout and recovery

The new cancellation collection requires explicit local/test `bootstrap-cancellations.mjs` after
build; it preserves requests/indexes, refuses unknown drift/deployed configuration and enables no
mutation route. Restore request identities, orders, stock/coupon movements, payments and audit together;
never delete request keys or reset movements to retry an uncertain decision.

Read activation uses `CUSTOMER_ORDER_READ_ENABLED=true` with customer auth in local/test only; default
false and deployed activation is rejected. Exact guest detail requires existing guest-proof activation.
Disabling reads removes the routes without deleting commerce history. Keep policy/quote history
consistent with immutable order consent; do not silently fabricate missing historical metadata.

## Acceptance status

P06-013 and P06-014 remain **Blocked**, with unchecked task boxes. This local work does not waive
their declared P06-011 prerequisite. Resume full acceptance after prerequisite completion and the
missing paid-refund/HTTP integrations, then obtain independent review. The owner's key-contract
clarification is recorded above; it is not acceptance of either task or milestone.
