# P07-009 / P07-010 — Late verified funds and authorized risk review

Status: **Done** for each task; project-owner acceptance recorded below.
Executor: Codex, 29 October 2026. Revision: working tree based on
`41cd39d9da917363e2dc982e1fe0f14f9f3947c8` (accepted P07-007/008). The owner requested paired
implementation and Done after review; this record keeps each acceptance decision separate.
Sources: FR-12/FR-13/FR-09/FR-29;
[API §§12.3–12.4](../API.md#123-ipn-browser-returns-and-independent-verification),
[Database](../DATABASE.md), [Testing §11](../TESTING.md#11-payments-returns--refunds-test-cases),
[Operations](../OPERATIONS.md). Provider field reference: [SSLCOMMERZ v4](https://developer.sslcommerz.com/doc/v4/).

## Separate task acceptance checklist

| Task | Delivered result | Observed acceptance assertions | Status |
| --- | --- | --- | --- |
| P07-009 | Durable verified Paid survives expired allocation recovery failure; eligible orders atomically recover accepted stock/coupon; cancelled late funds become linked correction money plus one unreserved source obligation | Released/expired generations; missing stock/coupon; last-stock and last-coupon races; both payments retained and one allocation winner; cancelled order never reopened/reallocated; concurrent duplicate obligation; exact-predecessor schema migration, immutable debt and no guessed method/policy/payout | Done |
| P07-010 | Independent verified risk fields and fulfillment hold; authorized audited approve/reject with durable idempotency; valid allocation remains mandatory | Current admin/account/Origin/CSRF; strict reason/key; concurrent decisions; changed-input conflict; historical key after fresh review; already reviewed provider flag replay; new/contradictory risk descriptions; confirmed-order hold; approval without capacity; rejection without release/refund; missing audit protection; actual root activation | Done |

## Implementation and ownership

Payments owns `payment-settlement.service.ts`, risk schema/service/router, guarded payment/attempt proof and
existing receipt coordinator. Independent verification remains outside transaction retries. The original
receipt transaction persists verified intake/link/funding and commits already-live capacity atomically.
After it commits, recovery takes a fresh payment revision and order fence, rechecks full merchandise funding,
clear risk and noncancelled/nondispatched lifecycle, and attempts the accepted stock/coupon generation.
A recovery error rolls back only that transaction: the already committed Paid receipt and explicit hold
survive. Provider calls and new charges are never performed during recovery.

Checkout owns the extension to verified-allocation, reusing Inventory's canonical reservation/movement
capabilities and Promotions' current coupon capacity/terms/customer counters. Existing committed capacity
is reused; exact live holds can commit; expired/released holds get one new generation in one transaction.
A coupon failure after stock writes rolls everything in recovery back. Concurrent paid orders cannot
oversell the final units or coupon use. Shortfall does not fabricate failure, negative stock, coupon use,
refund or financial retry. A later duplicate/reconciliation invocation may retry capacity safely.

Orders owns immutable snapshots, row fences and risk/shortfall hold metadata. A cancelled or dispatched
order cannot be reacquired. Risk can hold already confirmed/processing fulfillment without reopening or
reversing lifecycle. Clearing risk on an existing confirmed order still requires retained/recovered committed
capacity before clearing its hold. Pending paid orders remain admin_review after commitment: confirmation,
shipping, deadline and outbound business notifications remain P06-011 under API §12.4 and the legal gate.
This batch does not auto-confirm, fabricate legal clearance or ship an order.

Cancelled matched late money links entirely to correction allocation, keeps merchandise funding zero and
preserves Cancelled. Payments atomically invokes Refunds' narrow trusted correction-intent capability with
the verified source. The canonical `refunds` collection/model/persistence is implemented initially only for
immutable nonpaying correction reviews; no parallel debt collection or source model is introduced. Exactly
one source-specific decisionKey creates under_review/not_reserved with positive correction amount, empty
items and zero merchandise/delivery. No capacity reservation, approved channel, policy or payout is invented.
Refunds owns its audit event. Future general refunds/approval/payout require their reviewed schema/capacity
operations; this batch does not implement or accept those tasks.

Risk route: `POST /api/v1/admin/payments/{paymentId}/risk-decisions`, current admin session plus exact admin
Origin/CSRF, strict `{decision:approve|reject,reason}` and Idempotency-Key. Decision and actor/reason audit commit
under the payment revision fence. Audit exposes only a narrow protected operation-digest reader, never its
private model. An identical key returns current authorized risk/hold without applying old approval to a new
review; changed input conflicts. Competing commands have one winner. Rejection preserves verified money and
hold; approval clears risk, then attempts fenced capacity recovery. It grants neither fulfillment nor payout
by itself. Missing audit/payment protection fails closed. Root mounts this route only for ADMIN_AUTH_ENABLED
in local/test; staging/production remain unactivated.

Provider transport retains bounded verified risk description alongside exact numeric risk level. Published
v4 documents risk_level and risk_title, including Safe/Not Safe examples. The implementation conservatively
holds non-Safe descriptions even with numeric zero; this conservative classification is an implementation
safety decision, not a provider promise. Unsupported numeric classifications remain uncertain. Untrusted IPN
risk hints never become proof. Ordinary replay of an already reviewed verified flag does not reopen review;
a distinct new verified risk signal can escalate it without collecting money again. Separate risk-proof
fingerprints avoid suppressing later distinct signals under one audit operation identity.

Private persistence stays inside its owner. Controllers import no financial models, shared code has no
business dependencies and provider protocol remains in providers/. Executable boundary checks pass. No
frontend/runtime-provider import, new package or CI check placeholder was added. No raw provider card,
credential or personal payload is newly logged/persisted; normalized evidence/digests and approved audit
reason fields remain bounded. Earlier user changes and historical acceptance records were preserved.

## Approved contract clarification

Gap: Database §9.2 required refund method and policyVersion even though P07-009 requires an obligation for
cancelled late collections without approved refund channel/policy evidence. API §13.3/RefundTiming required
corresponding method/policy fields. Risk: inventing approval/capability or blocking preservation of real money.
Decision owner: project owner; actual merchant/legal approval remains with its qualified owners.

The owner explicitly answered: “গ্রহণ করছি—অনুমোদনের আগে দুটো বাধ্যতামূলক” to the proposed exception for
**under_review + not_reserved** correction obligations. Updated owning Database/API contracts: method and
policy may be absent only for that unreserved review; approved method/policy are mandatory before approval,
reservation or payout. Initial executable refund slice cannot approve, mutate or pay the obligation. No user
reply is treated as actual channel/policy/legal approval. The prior explicit-offset timestamp decision remains
unchanged; timezone-free provider dates are still retryable pending evidence.

## Provisioning, compatibility and recovery

Payments' validator now admits canonical correction-only Paid (positive verified correction money and zero
merchandise funding), while ordinary Paid still requires full merchandise funding. Service-level order fencing
permits the late correction branch only for Cancelled. Bootstrap migrates only the exact prior/current strict
validator; unknown drift aborts and financial rows are not rewritten. No HTTP auto-migration or destructive
schema rollback. Never restore the old validator over correction-only Paid data.

After build, existing local/test `bootstrap-payment-initiation.mjs` applies that additive change, provisions
the canonical correction-intent collection/indexes and existing payment/audit protections. Repeated setup
preserves receipt/obligation data, refuses unknown refunds schema, and refuses deployed execution before DB
access. No TTL removes financial history. The future broader refunds slice needs an explicit reviewed additive
migration rather than replacing these obligations. Existing callback quota bootstrap is unchanged.

Disable provider processing to stop intake; disable admin mutations too for a complete local financial freeze.
The processing flag alone does not unmount admin risk decisions. Preserve verified receipt/collection/payment,
correction intent, risk audit and stock/coupon movement history. Clearing flags cannot undo external money;
resume only through the owning reconciliation/recovery procedures. No deployed/provider effect was executed.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, Vitest 5.0.5; isolated MongoDB 8.0.16 replica sets, real transactions
and local HTTP/Supertest. The real adapter uses injected synthetic provider transport. No live merchant,
channel activation, refund approval, payout or production database action was performed.

| Command / selection | Observed result |
| --- | --- |
| Backend integration runner, `checkout-quote.test.ts payment-correction-migration.test.ts payment-records.test.ts payment-verification.test.ts payment-callback.test.ts` | Passed 161 at owning regression revision: checkout 92, migration/obligation 3, records 15, verifier 32, callbacks 19; local `test-results/payment-late-risk-regression.json` |
| Same runner, `checkout-quote.test.ts -t 'receipt batch\|late/risk batch'` | Passed final 40 affected tests, 56 intentionally not selected (96 cases total); local `test-results/payment-late-risk-final.json` |
| Same runner, `payment-verification.test.ts` after risk metadata review | Passed 32; local `test-results/payment-late-risk-verifier.json` |
| `npm run test:unit --workspace=backend -- payment-risk.test.ts payment-callback.test.ts sslcommerz.test.ts` | Passed 82 at initial review revision |
| `npm run test:unit --workspace=backend -- payment-risk.test.ts sslcommerz.test.ts` after risk metadata change | Passed final 59; unchanged callback unit results reused |
| `npm run test:contract --workspace=backend` | Passed 105; 92 implemented/72 planned operations, four generated artifacts verified |
| `npm run api:check --workspace=backend` | Passed final documentation/source revision, four artifacts current |
| `npm run typecheck --workspace=backend` | Passed final source/tests |
| `npm run build --workspace=backend` | Passed final runtime; compiled bootstrap exercised in owning regression |
| `npm run lint --workspace=backend` | Passed, 344 files |
| `npm run lint:boundaries` | Passed, 327 files and zero errors |
| `npm run format:check` | Passed, 508 files |
| `npm run lint` | Repository documentation checks passed |
| `git diff --check` | Passed |

Dedicated report runner from backend:
`../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/<report>.json <selection>`.
Local reports are generated workspace artifacts, not committed release evidence. Do not add the overlapping
counts as distinct test cases. The owning 161-test regression was reused; final localized review corrections
reran affected consumers rather than repeating unrelated checkout/identity/frontend pipelines.

Initial fixture failures were corrected without weakening guards: proper Supertest assertion chaining,
current-generation coupon selection, actual configured HTTPS admin Origin, expected namespace/account CSRF
denial before service auth, explicit nameOnly=false database typing and canonical refunds provisioning.
The direct service independently rejects suspended admin identity. Review corrected risk-title preservation,
known-flag replay, later distinct signal audit identity and confirmed-order holds. Final affected checks pass;
no unresolved failed check remains.

## Review and remaining gates

Executor reviewed actual diff, canonical owner/import direction, protected immutable sources, correction-only
accounting, exact predecessor migration, payment/order serialization, once-only allocation, failure isolation,
provider I/O exclusion, current authorization/replay, redacted evidence and local-only activation. Project-owner acceptance of each task is recorded below; no milestone or external gate is accepted.

Not Run: real provider sandbox/live timestamp and ACK/retry qualification; approved refund method/policy;
actual refund reservation/approval/payout; deployed restore/multi-instance exercise; frontend/browser UX;
full backend-stage/release regression. P06-010 implementation was reused/tested but its prior independent
acceptance remains In Review; P07-005 review, P06-003 legal sign-off, P06-011 order transitions, P07-011/012/013
and P08 refund operations are not accepted by this batch. No branch, commit or push was performed by Codex.


## Independent acceptance

On 29 October 2026, after the paired implementation, verification and executor-review handoff,
the project owner explicitly answered: “দুটোই গ্রহণ করছি—Done করুন”.

- **P07-009 accepted:** submitted local/test late stock/coupon recovery with Paid preserved,
  cancelled correction-only receipt/obligation handling, approved contract clarification and recorded checks. Status Done.
- **P07-010 accepted:** submitted authorized audited risk decisions, current admin/CSRF/idempotency
  protections, verified flag handling and allocation/fulfillment holds with recorded checks. Status Done.

Acceptance retains all documented local/test, migration, timezone, capacity, confirmation and recovery limits.
It does not accept prior P06-010/P07-005 reviews, actual refund method/policy approval or payout, order
confirmation, provider qualification, deployed activation, legal approval or any milestone. No live financial
action is authorized by this review acceptance.
