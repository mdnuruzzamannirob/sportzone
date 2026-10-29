# P07-004 — Local hosted payment initiation

Status: **Done**, project-owner acceptance recorded below. Executor: Codex, 29 October 2026.
Revision: working tree based on `915da97964d90fe3618aa9f8b713d2141ca30223`.
Sources: FR-11/FR-12; [API §12.2](../API.md#122-hosted-initiation-retries-and-uncertain-state),
[Database §§7–8](../DATABASE.md#85-paymentattempts--payments),
[Architecture §10.1](../ARCHITECTURE.md#101-checkout-and-online-payment),
[Testing §11](../TESTING.md#11-payments-returns--refunds-test-cases).

## Delivered scope

Payments owns durable paymentInitiations, strict schema/index protection, request/attempt preparation,
one-shot provider dispatch and current owned status projection. Auth owns current customer/guest scope,
CSRF and principal fences. Orders owns lifecycle, immutable metadata and original total projections;
Inventory/Promotions retain canonical stock/coupon persistence behind their services. Checkout owns
atomic allocation generation coordination. Provider protocol remains in providers/sslcommerz; root
setup supplies capabilities and performs composition, not channel/funding policy. No frontend runtime,
shared-to-business or controller-to-model import introduced. No package/CI inventory change needed.

New routes:

- `POST /api/v1/orders/{orderId}/payment-attempts`: existing order only, requestedChannel only,
  current owner/proof, exact storefront Origin, CSRF and bounded Idempotency-Key.
- `GET /api/v1/orders/{orderId}/payment-attempts/{attemptId}`: current owner/proof on each read,
  no-store current state/risk/check timestamp; no provider query, redirect or financial mutation.

Root/startup activation is independently gated by PAYMENT_INITIATION_ENABLED, valid sandbox adapter,
current account/environment-bound evidence and customer auth. Both loader and root refuse deployed
staging/production activation. Missing/false leaves both routes unmounted. Merchant/channel activation,
online order submission, callback/intake/verification and existing checkout reviews are separate gates.
The gateway transport in all executed tests is synthetic; no credentials or external merchant calls.

The permanent key registry is scoped by principal and existing order, storing hashes, fingerprint,
merchant/gateway binding and attempt link without raw browser key or provider contact payload. The
successful preparation transaction records uncertain dispatch before provider I/O; only its winner
calls the gateway. Identical/concurrent/new-process replays never resend or extend a hold. A crash
before call is conservatively uncertain. Provider rejection does not fabricate verified failure.
A failed result transaction retains the committed uncertain operation for later reconciliation.
A concurrent pending/verified outcome cannot be downgraded by the initiation response.

The canonical original order/payment totals must match; the new attempt targets only remaining
verified merchandise funding. Current order/risk/funding/channel/time/account/mapping changes suppress
reissuing historical hosted URLs. Session acceptance never creates a receipt, funds an order or
confirms fulfillment. Unresolved attempts block new financial identities despite another request key.

Expired or deliberately released holds reacquire the exact original stock lines and coupon in one
transaction under a fresh shared 15-minute generation. Existing valid holds retain their clocks.
Current coupon eligibility/terms must honor immutable accepted pricing; every effect rolls back on
stock/coupon failure. Legacy release clears expiresAt, so released-generation admission validates its
retained heldAt/status rather than inventing a still-active expiry. Shortfall is durable with no
attempt/provider call. Its original key retains the outcome; a fresh explicit request can recover
capacity without bypassing unresolved attempts. No late-paid/reconciliation or fulfillment writer
is newly claimed; P07-009/012/013 retain their acceptance scope.

## Approved contract decision and migration

Gap: API §6.1 AddressInput and Database §7.2 delivery snapshot lacked postcode while the gateway
shipment contract requires it. Project owner answered the explicit decision request on 29 October:
“postalCode যোগ করুন; online payment-এ বাধ্যতামূলক করুন”.

Implemented optional postalCode (maximum 30 characters) in saved addresses, quote recipient and order
snapshot; online initiation requires the stored value. Preserved addressLine2 in the gateway mapping.
Gateway-incompatible names/contact/address lengths are rejected before an external call, with no
fabricated/truncated data. Old order snapshots remain immutable and are not backfilled.

Explicit identity/order migrations accept only exact previous/current validators and reject unknown
drift. Local bootstrap additively provisions operation/payment/audit persistence and performs those
known migrations. It refuses deployed environments before opening the database. Repeats preserve all
operations/documents; partial provisioning may leave successful schema/collection additions for
explicit inspection/resume. No HTTP auto-migration, destructive rollback or financial-history TTL.
Financial findOneAndDelete is also guarded, alongside existing delete/replacement protections.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, Vitest 5.0.5; isolated MongoDB 8.0.16 replica sets, local
HTTP/Supertest and injected SSLCOMMERZ transport. No real provider outcome is asserted.

| Command / selection | Result |
| --- | --- |
| Backend Vitest integration config, `payment-initiation.test.ts` | Passed final 25 tests; local `test-results/payment-initiation.json` |
| Same config, `checkout-quote.test.ts -t 'hosted-init\|concurrent payment reacquisition'` | Passed final 7 selected tests, 49 intentionally not selected; local `test-results/payment-initiation-http.json` |
| `npm run test:integration --workspace=backend -- checkout-quote.test.ts` | Passed earlier 53-test revision including all 45 preexisting checkout/expiry cases and initial 8 new cases |
| Same checkout suite, `-t 'hosted-init\|payment allocation\|payment preparation\|concurrent payment reacquisition\|late coupon failure\|unresolved attempts'` | Passed 11 selected affected cases after released-clock/shortfall correction; 44 not selected |
| Backend Vitest integration config, `profile.test.ts` | Passed 30 tests including new protected postalCode round trip; local `test-results/payment-profile.json` |
| `npm run test:integration --workspace=backend -- payment-postal-migration.test.ts` | Passed 3 migration/legacy-fact/immutability/drift tests |
| `npm run test:integration --workspace=backend -- payment-initiation.test.ts payment-records.test.ts customer.test.ts` | Passed intermediate 56 tests (23 initiation, 15 existing payment records, 18 customer credentials) |
| `npm run test:unit --workspace=backend -- sslcommerz.test.ts payment-methods.test.ts payment-attempt.test.ts` | Passed 87 tests, including address-line preservation and deployed activation refusal |
| `npm run test:contract --workspace=backend` | Passed 101 tests; 4 artifacts verified; 88 implemented/76 planned operations |
| `npm run typecheck --workspace=backend` | Passed final source revision |
| `npm run build --workspace=backend` | Passed; compiled bootstrap exercised against disposable replica set |
| `npm run lint --workspace=backend` | Passed, 325 files |
| `npm run lint:boundaries` | Passed, 314 files, zero errors |
| `npm run format:check` | Passed, 489 files |

Final repository checks: `npm run lint` passed (635 files, 1400 local links, zero errors);
`npm run api:check --workspace=backend` verified 4 artifacts; `git diff --check` passed.
Local JSON reports are generated workspace artifacts, not committed release evidence.

Dedicated integration report commands use the existing installed runner from backend:
`../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/<report>.json <selection>`.
The npm script fixes outputFile to database.json; passing a second outputFile was rejected before
execution, so the direct runner preserves separate artifacts. Source/test refinements were verified
with the affected cases; the unchanged full checkout/backend pipeline was not repeatedly rerun.

Executed cases cover committed dispatch-before-I/O; concurrent same/different keys; state replay and
principal changes; request conflicts; pre-dispatch rollback; post-effect audit failure; stock/coupon
clock consistency, rollback and expiry races; unreconciled-attempt exclusion; stock recovery;
customer/guest CSRF and record isolation; current-policy URL suppression; merchant/mapping changes;
canonical total mismatch; metadata/input rejection; strict BSON/unique identities; no-TTL/history
delete; explicit local bootstrap and valid-production configuration refusal.

Development issues corrected before final passing checks: fixture expectations for BSON uniqueness
initially omitted required URL facts; initial HTTP fixtures enabled HTTPS-only proof options with
HTTP origins; released reservations intentionally clear expiresAt and needed explicit terminal-state
handling; insufficient-stock projection originally surfaced a generic state conflict, now explicitly
checked before reserve; capability signatures were updated together while moving policy into Payments.
A duplicate output-file option and wrong runner working directory were corrected without changing
runtime behavior. No invariant was weakened or real provider success invented.

## Limits, recovery and acceptance

API/Database/Testing/Operations and sanitized environment template are synchronized. Preserve the
operation registry, attempts, receipts, immutable orders, proof files and audit during rollback.
Disable initiation before rollback; use a compatible build for expanded postalCode validators/data.
Unknown schema drift and uncertain financial outcomes require protected inspection/reconciliation,
not deleting history, resetting keys, rewriting snapshots or blindly resending provider calls.

**Not Run:** real sandbox account/merchant acceptance, real bKash/Nagad/Rocket/COD qualification,
callback/independent receipt verification, deployed/container rollout, legal deadline sign-off,
full backend-stage or cross-application/release regression and browser/frontend checks. Their owning
review/task gates remain separate. P06 checkout reviews and P07-005/006/009/012/013 are not accepted
by this work. Reviewer decision: accepted for the submitted local/test scope. No milestone accepted.

## Independent acceptance

Reviewer: project owner, 29 October 2026. Decision: accepted through explicit instruction
“done koro” after the implementation and verification handoff. P07-004 changes from In Review
to Done for the submitted local/test initiation feature, including the approved postalCode contract
and recorded verification. Staging/live activation remains disabled. This does not accept actual
merchant/channel qualification, callback/independent verification, checkout reviews or a milestone.
This acceptance update changes documentation only; existing code verification remains applicable.
