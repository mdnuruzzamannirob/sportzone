# P06-011 / P06-012 — Private lifecycle and COD capabilities

Date: 30 October 2026 (Asia/Dhaka). Executor: Codex.
Status: **Blocked** for full task acceptance; authorized local implementation/tests completed.
No task checkbox or milestone is accepted by this record.

## Authorization and scope

After the owner requested the next two tasks, the dependency audit found no Ready backend task.
P06-011 depends on blocked P06-003; P06-012 depends on P06-011. The owner explicitly selected:
“Local implementation/tests এগিয়ে নাও”, after disclosure that absent qualified sign-off keeps
confirmation blocked and prevents Done. This is implementation authorization, not legal/task acceptance.

References: FR-12/14/16/26/29; API §§11.3/12.5, Database §§7.2/8.7, Architecture §§4–6,
Implementation Plan §3.1 and Testing §§10–11/15.5. No prerequisites were removed or split into an
invented accepted task. No real approval, secret, cash evidence or deployed provider call was used.

## Separate local outcomes

| Task | Implemented private capability | Observed local checks | Remaining acceptance |
| --- | --- | --- | --- |
| P06-011 | Current admin transitions with audit replay, real-event deadlines from immutable basis, qualified approval guard, payment/risk and exact committed stock/coupon fences, atomic whole-order dispatch and bounded history | Missing approval denial; forbidden skips/cancellation; historical key/current projection; exactly-once concurrent dispatch; downstream failure stock rollback; monotonic clocks; online funding; independent delivery/cash | P06-003 qualified rule/sign-off, actual protected approval adapter, HTTP/root authorization/CSRF/DTO activation and independent review; later cancellation/final non-delivery and notification tasks retain ownership |
| P06-012 | Auth-before/after protected evidence read, strict source binding/time, globally stable internal COD reference, unique source receipt, partial/excess accounting, unreserved corrections and audit | Missing/mismatched evidence; unconfirmed denial; partial/final/excess; same-key/source deduplication; cross-order reference denial; identity revocation; risk retention; late correction rollback; different-admin cash/dispatch race | Accepted P06-011, real evidence source/verifier, HTTP/root contract integration and independent review; no actual receipt/payout or live cash verification |

There are **17 new integration cases** named `lifecycle/COD local` in the existing checkout suite.
These use synthetic protected approval/evidence capabilities. Ordinary startup has no composition,
route or flag enabling these services. Existing public API artifacts remain 95 implemented/69 planned.
No migration, collection, package, provider integration or frontend was added.

## Ownership and review

Orders owns lifecycle, immutable snapshots/history and the COD order fence. Payments owns funding/risk
fences and COD source collection/aggregate decisions; Checkout coordinates Inventory/Coupon capabilities
without importing their models. Coupon access now exposes immutable coupon identity for exact matching.
Only Orders consumers use its allocation-binding helper. Controllers/root wiring were not changed.
Shared infrastructure has no business dependency; executable boundaries pass.

Qualified approval is required in the confirmation transaction; the adapter is responsible for real
protected evidence and must perform no external provider call there. Orders computes deadline dates
itself using the existing policy service, rather than trusting injected dates. Persisted Mongoose
basis is converted to plain immutable snapshot data for strict schema evaluation. Pending admin_review
can clear only through qualified confirmation after funding/capacity checks; risk/shortfall holds
remain blocking. No synthetic 14-day rule is installed in runtime.

Shipping validates the whole canonical committed generation and redeemed original coupon, then
decrements physical and committed once in the same transaction as order status/history/audit.
Delivery neither writes Paid nor creates collections. Ordinary cancellation/final non-delivery is
refused here; its custody/release/refund paths stay in their owning tasks.

COD evidence verification occurs outside MongoDB transactions, after current admin authorization,
then reauthorization and order/payment fences protect commit. Proof must bind original reference,
payment, integer amount, evidence reference, digest and actual collection date. Globally stable
`cod:<SHA-256(reference)>` under internal account prevents duplicate source credit across orders.
Same-key replay reads existing state before evidence access. Partial funding remains Pending;
full funding becomes Paid, excess/cancelled-order cash is correction, risk remains independent.
Source/counters/correction intent/audit commit together; no payout or stock effect is inferred.

Reviewed actual diff for ownership/import direction, forbidden state skips, monetary/quantity caps,
replay races, secret exposure, timestamp integrity and unrelated changes. No `.env` was read/edited;
no commit/push/deployment or irreversible external effect was performed.

## Actual verification

Environment: local Node/npm, isolated MongoDB 8.0.16 replica sets, controlled provider/approval/
cash-evidence doubles. Existing fixture HTTP flows create canonical orders; new capabilities are
called privately under actual active-admin sessions, never exposed as a new ordinary HTTP API.

| Command | Result |
| --- | --- |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed before final compiled consumer tests |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/order-lifecycle-cod-local.json checkout-quote.test.ts -t 'lifecycle/COD local'` | Earlier focused revision Passed: 13; four further cases included in full final regression |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/order-lifecycle-cod-regression.json checkout-quote.test.ts orders.test.ts payment-records.test.ts inventory-allocation.test.ts coupon-allocation.test.ts` | Passed: 232 across five files (150 checkout, 23 order, 15 record, 16 inventory, 28 coupon); all 17 new cases included |
| `npm run test:unit --workspace=backend -- orders.test.ts delivery-deadline.test.ts inventory-allocation.test.ts coupon-allocation.test.ts payment-risk.test.ts` | Passed: 50 across five files |
| `npm run test:contract --workspace=backend` | Passed: 108, four existing artifacts verified unchanged |
| `npm run lint --workspace=backend` | Passed: 364 files |
| `npm run lint:boundaries` | Passed: 344 files, zero errors |
| `npm run format:check` | Passed: 528 files |
| `npm run lint` | Passed: 682 files, 1456 local links, zero errors |
| Task count/checkbox audit | Passed: 210 tasks, checkboxes match Done status |
| `git diff --check` | Passed |

Initial tests exposed Mongoose subdocument rejection by strict deadline parsing and the required
pending admin-review confirmation handoff; these were fixed with plain persisted basis evaluation
and tightly scoped qualified confirmation. Synthetic proof fixtures initially carried an extra reason
field, and a stale-reservation fixture omitted release evidence; strict validators correctly rejected
them. Fixtures were corrected without weakening schemas. Focused and final regression then Passed.
Two accidental help-command invocations used an incorrect executable path; they executed no tests.
Ignored JSON reports are local replaceable artifacts, not committed production evidence.

Not Run / Blocked: qualified compliance/real approval validation, real COD evidence source integration,
new HTTP/root authorization/CSRF contracts, actual customer/cash/provider operations, deployed staging,
frontend/browser and milestone acceptance. No claim of full P06-011/P06-012 completion is made.

## Recovery and resume

Existing order/payment/stock schemas and indexes are unchanged. Preserve orders/commitments, source
collections, correction obligations, movements and audit as one consistent set; never reset receipt
references, dispatch movements or request keys to retry an unknown outcome. Missing approval/evidence
fails closed and rollback cannot erase verified financial facts. Ordinary runtime stays unchanged.

Resume after the owner supplies qualified P06-003 evidence and an approved protected cash-evidence
source. Implement and test the owning HTTP/root contracts and obtain independent review before Done.
No generic acceptance of this local package substitutes those prerequisites.
