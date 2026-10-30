# P06-016 / P06-017 — Local commerce notifications and delivery/support

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
