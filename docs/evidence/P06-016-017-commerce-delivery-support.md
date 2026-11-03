# P06-016 / P06-017 — Local commerce notifications and delivery/support

**Current development disposition:** [Package F completion](#package-f-completion) below supersedes
historical implementation gaps and per-feature independent-review blockers for P06-016/017,
P09-002/014/015/016/017/018. External qualification, backend closeout and milestones retain their own tasks.

Date: 30 October 2026 (Asia/Dhaka). Executor: Codex. Base revision: `0acb0da`.
Status: **Blocked** for full task acceptance; safe local implementation and verification completed.
No task checkbox, operator/legal/provider gate, backend stage or milestone is accepted here.

## Scope and separate task outcomes

Continued the requested paired backend work within the existing safe-local authorization and preserved
all declared prerequisites. P06-016 depends on unaccepted P06-013; P06-017 on unaccepted P06-011.
Sources: FR-16/20/26/34, API §§11.3/14.2/14.4/16.3, Database §§7.2/7.5/10.1–10.3,
Architecture §§4–6 and Testing §§10–11/15.5. No production/external business action was performed.

| Task | Implemented local behavior | Observed checks | Remaining acceptance |
| --- | --- | --- | --- |
| P06-016 | Atomic placement/confirmation/cancellation/shipment/delivery commerce intents, stable order/cause/type identities, independent delivery after commit | Real local lifecycle/cancellation replay creates one intent per actual event; outbox failure rolls back stock/fulfillment; Delivered does not prove COD Paid | Accepted P06-013 and independent task review; sender/provider/template/inbox deployment qualification remains separate |
| P06-016 | Canonical recipient/order/history proof and immutable event templates; no welcome fallback; explicit local/test activation | Recipient/cause tamper suppressed, actual root flag, known rejection retry keeps identical key/body after cancellation, uncertainty never resends or reverses commerce | Protected deployment/test-recipient configuration and actual external email evidence |
| P06-017 | Private delay/failed-attempt/final case records, bounded contacts, replay/CAS/current admin, complete shipped-unit disposition | Failed retries remain Shipped with unchanged commitment; pending delay creates no confirmation/deadline; complete mixed custody and competing-final race | Accepted P06-011, real protected custody/inspection verifier, public/admin HTTP and customer exception/estimate surfaces |
| P06-017 | Physical-only inspected recovery via stable receipt per original item; guarded exceptional Cancelled history/outbox; collected funds require real refunds | Lost/damaged never restock, no pre-shipment release, exact once-only recovery, downstream rollback and paid-planner denial | Real inspection authority and source-backed paid-refund integration before actual closure |
| P06-017 | Order-associated current customer/exact guest complaints, protected contacts/issues, admin response/resolution/closure and immutable audit | Contact cannot prove ownership; contact omitted from owner view; guest isolation; Unicode names; first response preserved; missing audit rolls back report | Anonymous/global support transport, CSRF/rate/spam/admin HTTP integration and qualified complaint response policy |

There are **24 new cases** named `commerce/exception batch` in the existing checkout integration
suite (167 prior + 24 = 191 current). Public operation inventory remains 98 implemented/66 planned;
exception/complaint mutations are private capabilities, not publicly activated HTTP routes.

## Ownership and data integrity review

Notifications owns outbox, strict payload/template contracts and retry/lease/provider delivery.
Orders supplies only canonical event/recipient proof; templates contain original order reference,
event and occurrence time, not private audit reasons, proof metadata or provider credentials.
Commerce payload is `{operationKey,occurredAt}` and key `eventType:orderId:operationKey:v1`.
Existing order_received retains empty payload and its original stable key. The current reader matches
committed order history and immutable recipient before sending. Placement is separate from confirmation;
Delivery does not assert collection. Templates direct readers to secure current status rather than
changing event content on retry. No exactly-once inbox-delivery guarantee is made.

Known explicit rejection retries keep stable provider key and exact message body, even if cancellation
happens between attempts. Ambiguous transport becomes delivery_uncertain without automatic resend.
Canonical business writes and intent commit together; actual transport occurs afterward and cannot
roll back commerce. Default workers skip commerce; ORDER_NOTIFICATIONS_ENABLED activates only local/
test rendering, with existing approved test-recipient and sender controls. Other proof/payment types
retain their exact branch restrictions. Only the known payment predecessor and older approved schemas
migrate; rows, statuses, receipts and leases are preserved. Old binaries need compatible rollback.

Orders owns delivery exception evidence and the narrowly selected exceptional state-machine path.
Ordinary Shipped → Cancelled remains forbidden. Create/resolve reauthorize current admin, fence
order and record revisions, retain audit, and never rewrite accepted deadlines. Delay may be a concern
before confirmation without inventing a start event. Failed attempts stay Shipped while investigation
or retry is recorded. Final closure requires protected custody/inspection proof and exact quantity
coverage for every original line. Only recovered inspected resale quantity restores physical stock;
lost/damaged/other custody cannot add stock. Inventory owns a stable return_receipt source identity
`nondelivery-restock:<orderId>:<orderItemId>`; committed/reserved counters and pre-shipment release are
untouched. Recovery, payment fence/refund obligations when needed, order/exception/audit/outbox commit
as one transaction. Missing real proof or paid-refund adapter denies closure and preserves money/state.

Support owns canonical complaints and private contact/issue data. Orders supplies exact scoped contact
from its immutable order snapshot; user-provided contact is never an authorization proof. Current
customer or verified guest scope/CSRF protects submission and reads. Admin resolution needs a recorded
response; first respondedAt and original resolvedAt survive closure/replay. No statutory duration is
hardcoded. Owner projections exclude contacts/reporter IDs; anonymous/global lookup is not enabled.

New models have strict BSON, declared indexes, no TTL, CAS write guards and history deletion protection.
The sole bootstrap is explicit local/test and preserves data/refuses drift/deployed configuration.
Controllers and public API registration were not changed. No foreign private model or shared-to-business
import was added; executable boundary checks pass. No package/framework/provider was introduced.

Reviewed actual diff for ownership, auth, state/quantity/monetary fences, event identity, financial
preservation, protected logging, migration/rollback and unrelated changes. No `.env` was read/edited;
no commit/push, production deployment, real email/receipt/refund or customer-data export occurred.

## Verification

Environment: local Node/npm, isolated MongoDB 8.0.16 replica sets, local HTTP/compiled subprocess
fixtures. Approval, inspection, cash/gateway/email behavior uses explicitly synthetic test authorities.

| Command | Observed result |
| --- | --- |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed before compiled bootstrap tests |
| `npm run test:unit --workspace=backend -- notifications.test.ts orders.test.ts delivery-deadline.test.ts` | Passed: 50 across three files, including default/explicit/restricted commerce activation |
| `npm run test:contract --workspace=backend` | Passed: 111, four existing artifacts unchanged |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/commerce-delivery-support-local.json checkout-quote.test.ts -t 'commerce/exception batch'` | Earlier focused revision Passed: 23; final extra pending-delay case and retry-content correction covered below |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/commerce-delivery-support-regression.json checkout-quote.test.ts notifications.test.ts guest-access.test.ts recovery.test.ts email-change.test.ts identity.test.ts orders.test.ts inventory-allocation.test.ts` | Passed: 364 across eight files (190 checkout, 21 notifications, 19 guest, 28 recovery, 27 email-change, 40 identity, 23 orders, 16 inventory); unchanged shared consumers reused after localized template/case changes |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/commerce-delivery-support-final.json checkout-quote.test.ts` | Passed: final affected checkout suite 191, including 24 new cases; 365 distinct current integration cases across valid runs |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/commerce-delivery-support-copy-final.json checkout-quote.test.ts -t 'commerce/exception batch'` | Passed: 24 final focused cases after explicit Delivered/payment wording correction; 167 outside selection |
| `npm run lint --workspace=backend` | Passed: 385 files |
| `npm run lint:boundaries` | Passed: 363 files, zero errors |
| `npm run format:check` | Passed: 549 files |
| `npm run lint` | Passed: 705 files, 1462 local links, zero errors |
| Task status/checkbox audit | Passed: 210 tasks; 107 Done, 94 Not Started, 9 Blocked, all boxes consistent |
| `git diff --check` | Passed |

Initial typecheck found an optional fixture ID and a union-array includes typing issue; fixed with
explicit fixture guards and typed comparisons. A local edit script stopped on a formatted-text match;
inspected actual files and applied the missing cancellation hook. Initial focused assertions compared
Mongoose parent internals and expected account instead of snapshotted contact; corrected to plain
commitment values and approved order contact. Strict validators/guards were retained. A formatter
mismatch was corrected and check passed. Review found mutable current-status text could change a retry
body under one provider key; templates now use immutable event facts and a real cancellation-between-
retries regression verifies identical key/body. No failed check is relabelled Passed.
Ignored JSON reports are local replaceable artifacts, not production/provider acceptance evidence.

Not Run / Blocked: real custody/inspection authority, paid-refund planner, anonymous/public/admin
support HTTP security/spam controls, legal response-window qualification, new customer exception/ETA
API/notification surfaces, sender/inbox deployment, frontend/browser and integrated/backend milestones.
No synthetic adapter is installed in ordinary runtime for final closure or complaints.

## Rollout, recovery and acceptance

Build, then explicitly run local/test bootstrap-delivery-support.mjs or the owning notification
migration before upgraded readiness. No command starts the worker, seeds approval or enables closure.
Only an explicitly configured commerce worker may send order templates; existing test-recipient
controls remain mandatory. Restore order/exception/complaint/audit, source collections, recovery
movements and notifications consistently. Never delete financial/outbox facts, reset a recovery source
or downgrade validators to make an older binary pass. Reconcile uncertain effects before any retry.

P06-016 and P06-017 remain **Blocked**, unchecked, on their declared prerequisites and remaining real
integrations. Independent full acceptance is pending. Local test success cannot self-approve legal,
provider, paid-refund or application-stage gates.

## Package F completion

2 November 2026 (Asia/Dhaka). Executor/reviewer: Codex. Starting revision `5279052`, initially clean.
The owner staged changes during execution; existing staged work was preserved, with subsequent fixes
left reviewable in the working tree. No commit, push or production operation was performed.
Scope: eight ordinary backend tasks under Tasks §2; not backend-stage or milestone acceptance.

| Task | Completed engineering scope |
| --- | --- |
| P06-016 | Canonical placement/confirmation/cancellation/shipment/delivery outbox qualification, deduped causes, immutable recipient/history proof, independent sender retry and uncertainty handling; protected notification inspection and known-nonacceptance retry admission |
| P06-017 | Current-admin exception HTTP/read/history, Shipped failed-attempt/delay resolution, complete protected custody/inspection, once-only recovered resale stock, funded final closure and canonical refund obligations through verified payout completion |
| P09-002 | Authoritative Orders/Payments/Refunds owning projections, separate original gross/product/coupon discounts, accepted sales, unique verified receipts, unmatched/unassigned cash, COD outstanding, held liabilities and completed merchandise/correction payouts; signed linked cash flow |
| P09-014 | Protected dashboard, canonical counts, max-20 recent order/low-stock summaries, real payment status, approved threshold and Dhaka cutoff/date bases; physical-return counts exclude shortages |
| P09-015 | Masked customer search/status, current suspension/reactivation and revocation, separately paginated owned orders/claims/refunds, verified privacy review and retained-record-safe deactivation; no financial erasure or legal-hold waiver |
| P09-016 | Anonymous/global/customer/exact guest complaint intake, validated/default own contacts, Origin/CSRF, shared network/target quotas, keyed replay, own/admin histories, protected necessary contact detail, escaped literal search and durable recorded response outcomes |
| P09-017 | Protected sanitized audit and allocation-shortfall/payment-review/refund/reconciliation queues; stable pagination, strict inputs and redaction; queues do not initiate money mutations |
| P09-018 | Bounded period/filter/day-month report queries, separate all-class totals/classified measures, event-time arithmetic, historical-cutoff rejection, additive period indexes and explicit consistency/size/time profiles |

### Implementation and safety review

Reports consume only narrow domain-owned projections. Routes/controllers import no models; Auth retains
identity persistence in its own assembly. No shared→business or frontend→backend dependency was added.
Reports use a single MongoDB snapshot transaction and record actual current cutoff/consistency limits.
`[from,to)` is event-time based: placements for sales, collection time for receipts, confirmed completion
time for payouts; COD/held/unassigned balances are current cutoff state. A payout at the exact exclusive
end is correctly excluded. Completed rows must match exactly one confirmed attempt with the same amount
and completion instant; inconsistent evidence fails unavailable instead of asserting a payout.
Distinct duplicate receipts are real cash, not additional sales; attempts never inflate collection sums.
Historical `asOf` is rejected because no reconstructed historical balance snapshot exists.

Profiles: up to 93 days, 5,000 placement/receipt/completion facts and 5,000 current COD candidates;
oversize rejects without truncation. Source reads have 5-second limits; grouped exports contain at most
93 day buckets, dashboard summaries max 20 each. Report values are integer poisha, signed only for linked
net cash flow; retained current customer counts exclude admin principals. No BI service, export file,
materialized ledger, new dependency or accounting-profit claim was introduced.

Complaint contacts never prove order ownership. Current customer/exact guest scope is rechecked; malformed
customer proof never falls back to anonymous/guest authority. Anonymous intake has no invented order and
requires browser proof plus contact name/email. Optional keyed replay binds scope and input digest; no key
means a distinct complaint. Shared quotas fail closed and set Retry-After. A verified guest can default contact from the proven order on a general complaint without an order link; guest CSRF/current proof are rechecked, and stale guest credentials never downgrade to anonymous. Public response is reference/status only, with no public reference lookup. Customer views omit reporter contacts. Necessary contact is available
only in authenticated admin detail, with bounded contact history and unresolved response-policy status.
Recorded phone/email contact outcomes are durable audit facts, not a claim of provider email delivery or a
fabricated statutory response deadline. Customer and exact-order lists remain separately scoped.

Final non-delivery preserves complete shipped-unit accounting. Protected custody evidence is exact-incident,
post-shipment, nonfuture and digest-bound. Paid closure additionally needs the existing protected refund policy
and consent authority. In one transaction it records exceptional cancellation, source/order/unit refund holds,
original-source obligations/attempts, recovery movement, outbox and audit; rollback cannot leave partial effects.
Inspected recovered resale quantities restore once; lost/damaged units never restock, and pre-shipment release
is never repeated. Closure itself leaves collected cash Paid; the independently verified original transfer then
completes the refund and payment projection while fulfillment remains Cancelled. The recovery/payout path is the
same Package D authority, not a second money API. Missing disposition/policy/source proof denies the unsafe effect.

Privacy review requires a verified outstanding request and current admin/keyed reason. Approval explicitly means
account deactivation and current-session/security-revision revocation; review/rejection retains account access.
Saved addresses, required identity linkage, orders, financial/audit evidence and legal-hold data remain retained.
No endpoint claims physical erasure or completes a legal retention decision. Suspension and reactivation preserve
existing revocation guarantees. Masked views and separate domain histories minimize exposed personal data.

Notification HTTP only admits outbox work. Known provider nonacceptance may be retried with an audited reason and
stable provider key; uncertain, sent/sending, proof-unavailable and identity-proof events are refused. Mail delivery
still requires independent canonical message qualification. Provider failure/uncertainty cannot reverse commerce.
No external email or transfer was performed by these HTTP/admin inspection tests.

### Persistence, configuration and recovery

The complaint migration removes only the old required-orderId constraint, preserving the collection and strict
validation. Additive owner indexes cover order placement/hold, receipt event period, refund completion/capacity and
customer complaint history. `bootstrap-operations.mjs --complaints` and the existing support bootstrap explicitly
handle the exact predecessor; unknown drift and deployed execution are refused. Startup performs no DDL. Compiled
bootstrap is tested twice with retained data, unknown-validator refusal and deployed refusal. Report index shapes
are exercised with explicit planner hints; this is index/query compatibility, not a production load benchmark.

`BACKEND_OPERATIONS_ENABLED` defaults false, requires both auth audiences and explicit local/test admission; direct
application composition also refuses incomplete/deployed admission. Actual `startServer` configuration is exercised.
`DELIVERY_DISPOSITION_FILE` is optional protected operator evidence, never a request path. File verification is unit
tested separately; full HTTP closure uses a clearly synthetic trusted verifier and actual persistence/domain services.
Operations owns exact file format, bootstrap prerequisites, flags and rollback. Disabling routes preserves data;
old order-required complaint binaries cannot safely consume global complaints, so retain a compatible binary/data
validator rather than deleting evidence. Restore financial, stock, support, audit and outbox evidence together.

API §§13–14/Appendix D, Database owning index/complaint sections and Operations were synchronized. Four additional
operation paths cover protected contact detail, privacy read/decision and sanitized operational queues. Existing
IDs/OPV rows are preserved; new slots OPV-167–170 append to the register. Runtime local-route parity and generated
API inventories cover 170 operations: 98 standard registry plus 72 planned/deployment-separated entries, consistent
with Packages B–E. No deployed activation or milestone is inferred from local route implementation.

### Verification

Node 24.20.0 / npm 11.19.0, isolated MongoDB 8.0.16 replica sets, real local HTTP/server sessions and transactions.
Cash/inspection/payout/provider/email evidence is explicitly synthetic test data; no merchant activation or live
operator fact is asserted. Local listener tests use the execution permission needed by the sandbox.

| Command | Observed result |
| --- | --- |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts orders.test.ts notifications.test.ts customer.test.ts guest-access.test.ts payment-records.test.ts payment-correction-migration.test.ts reviews.test.ts --reporter=dot --reporter=json --outputFile=../test-results/package-f-integration.json` | Seven unchanged consumer files passed, 151 tests. Initial owning checkout file had 336 passes and one cleanup-import failure; corrected and rerun below. No all-green claim for this initial command. |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts --reporter=dot --reporter=json --outputFile=../test-results/package-f-checkout-final.json` | Passed: 337, including closure through verified payout, all existing checkout/financial/commerce/after-sales consumers and migration cleanup. |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts -t 'Package F' --reporter=dot --reporter=json --outputFile=../test-results/package-f-focused.json` | Passed: 14, 324 outside selection; final nonempty queue/redaction/suspended-admin case added after the owning run. This is 489 distinct integration cases observed passing across the applicable runs, not a sum of repeated selections. |
| `npm run test:unit --workspace=backend -- operations-config.test.ts report-calculation.test.ts notifications.test.ts orders.test.ts reviews.test.ts refund-investigation.test.ts` | Passed: 78 across nine matching files. |
| `npm run test:contract --workspace=backend` | Passed: 112, final generated artifacts and 170-operation/source-router parity verified. |
| `node --test --test-isolation=none --test-name-pattern='OPERATIONS-BOUNDARY\|HISTORY-BOUNDARY\|SUPPORT-BOUNDARY\|REPORT-BOUNDARY' tests/tooling/development.test.mjs` | Passed: seven matching negative boundary fixtures. |
| `npm run build --workspace=backend` | Passed before compiled bootstrap/regression execution. |
| `npm run typecheck --workspace=backend` | Passed after final fixture/import correction. |
| `npm run lint --workspace=backend` | Passed: 458 files. |
| `npm run lint:boundaries` | Passed: 413 files, zero errors. |
| `npm run format:check` | Passed: adopted repository inventory (623 files); no frontend build/tests. |
| `npm run lint` | Passed: repository/document structure and local links. |
| `npm run test:security -- --scope=backend` | Passed: redacted secret-history/working-tree scan and dependency audit; this script is repository-global despite its argument, not a frontend build/test. |
| Task/checkbox/phase counts and `git diff --check` | Passed: 210 tasks, 133 Done, 0 Blocked, 75 Not Started, 2 Deferred. |

Failures corrected, not counted as passes: initial enum-filter widening/types, an illegal root import of private
Auth models (replaced by an Auth-owned assembly), non-null/style warnings, two test assumptions (exclusive payout
period boundary and immutable order contact versus current profile), compiled bootstrap running during build cleanup
(dependency made sequential), and the migration cleanup's missing validator import. Migration fixture now restores
validation in finally even on failure. Final contact-default review also added the verified guest general-complaint/CSRF case within the existing focused scenario. Only the failed owning suite and affected focused cases were rerun; seven
unchanged passing consumer results were reused. No repeated full-project pipeline was run.

Not Run: unrelated full backend integration inventory, frontend/admin/storefront builds or browser/visual suites,
real merchant/channel/inspection/transfer/mailbox qualification, hosted staging, backend P03-022 closeout, integrated
milestones and production launch. P11-004/P11-007/P11-008 retain their explicit deployment/policy/production checks;
these ordinary development tasks do not self-approve those gates.

### Final review and disposition

Executor inspected the actual staged and working-tree delta against `5279052`, including all new modules/scripts,
strict inputs, private ownership, report cutoff/source semantics, financial state transitions, quantity/source caps,
query bounds/index rollout, notification truth, restore compatibility, logs and redaction. No unrelated cleanup,
package/framework/lockfile change, secret read/output, production mutation or financial evidence erasure was introduced.

Source/test/config/artifact snapshot SHA-256:
`fddeb750de7335b3ebbe7bafb3dd9dac656a70f9cbc2725a9168c7166d1afdfe`.
This covers 37 sorted changed paths under `backend/src/`, `backend/tests/`, `backend/scripts/`, `backend/api/`,
`tests/tooling/` and the two sanitized environment examples, encoded as path + NUL + bytes + NUL. Documentation
is excluded. Historical evidence above is retained with its original revision/environment.

P06-016/017 and P09-002/014/015/016/017/018 are **Done** under the Tasks §2 ordinary engineering convention.
Backend/application/milestone acceptance remains with its designated task. No production release or actual external
cash, custody, payout or email delivery is represented by this completion record.
