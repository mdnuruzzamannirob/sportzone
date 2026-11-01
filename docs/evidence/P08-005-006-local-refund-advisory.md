# P08-005 / P08-006 — Private refund advisory and attempt facts

Date: 31 October 2026 (Asia/Dhaka). Executor: Codex. Base revision `160d636`; prior P08-003/004
work was staged at task start and preserved; it subsequently appeared in commit `f6cf96b` during
this work, which this task did not create. Full task status: **Blocked**. Owner requested the next
batch and previously authorized safe local implementation when dependencies are blocked. No task,
policy, provider, backend stage or milestone acceptance is inferred.

| Task | Implemented local subset | Remaining work and acceptance |
| --- | --- | --- |
| P08-005 | Strict transient attempt-fact validation distinguishes created/submitted/uncertain/failed from confirmed; validates gateway references, manual proof shape, clocks and provider separation | Accepted P06-013/P08-003, durable attempt collection/indexes and protected writer, approval/commitment transitions, verification of real payout evidence, independent review |
| P08-006 | Private transaction-scoped, single-source advisory binds approved shortage or inspected physical claim ordinals to original order-unit entitlements and an independently verified linked collection; subtracts held/completed capacities and enforces protected delivery policy and original charge | Accepted P08-005, multi-source unit allocation, approved production policy/auth composition, atomic reservation and independent review |
| P08-006 | Pure correction arithmetic uses separate source/order class capacity and does not read merchandise quantities | Real source/aggregate binding for correction path and protected operation remain later work; no financial write is enabled |

Only internal callers supply trusted principal/transaction scope; no HTTP endpoint, mutation, attempt
writer, payment provider, refund reservation or payout is wired. An advisory result is a snapshot,
not a promise: P08-007 must reread and atomically fence current balances before a financial effect.
When a selected single collection cannot cover an entire requested unit amount, the result is
`insufficient_collected_balance`; the future multi-source coordinator must implement safe splitting.
No collection exists for uncollected COD, so it cannot produce a funded advisory.

## Ownership and checks

Returns owns claim eligibility and returns only approved shortage or accepted inspected physical unit
ordinals. Orders reads immutable order-item entitlements, same-claim unit ownership and historical
shipping charge. Payments reads only the collection linked to that order/payment and the canonical
verified merchandise funding, held/completed and delivery counters. Refunds owns strict private
arithmetic and response shape. No domain imports another module's private model; a negative boundary
fixture checks this. The data model intentionally retains the existing canonical correction-intent
collection unchanged. Provider/transfer confirmation shape validation is not independent proof of payout.

Amounts use integer poisha and the previously snapshotted per-ordinal coupon allocation, sorted by
ordinal. Each entitlement and source/order/delivery capacity rejects inconsistent held/completed
amounts and unsafe integer overflow. An injected delivery authority is required for nonzero delivery
requests; no policy version or approval is invented. Source and order caps apply independently;
correction balances do not consume merchandise units. A future write must enforce actual source
allocation, units, delivery and global limits under concurrency in one transaction.

References: PRD FR-18/33, Architecture §§6/10.5, Database §§7.3/8/9/12.5, API §13.3,
Testing RFD-01/02/03/05/06 and §15.5. No external resources, credentials, irreversible operations,
new collections, packages, staging or deployed environments were accessed or changed.

## Observed verification

Environment: Node 24.20.0 / npm 11.19.0, isolated MongoDB 8.0.16 replica sets, real local admin and
COD domain services with synthetic protected approval/cash proof. JSON reports under ignored
`test-results` are local replaceable artifacts, not provider acceptance evidence.

| Check | Result |
| --- | --- |
| `npm run build --workspace=backend` | Passed |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run test:unit --workspace=backend -- refund-calculation.test.ts orders.test.ts payment-risk.test.ts` | Passed: 20; 12 new refund/attempt cases |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts -t 'refund advisory local' --reporter=default --reporter=json --outputFile=../test-results/refund-advisory.json` | Passed: 7; 200 outside selection, including price changes, source isolation, held balances, no COD collection and delivery authority |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts orders.test.ts payment-records.test.ts --reporter=default --reporter=json --outputFile=../test-results/refund-snapshot-consumers.json` | Passed: 52 |
| `node --test --test-name-pattern=REFUND-BOUNDARY tests/tooling/development.test.mjs` | Passed: one focused negative fixture |
| `npm run lint --workspace=backend` | Passed: 405 files |
| `npm run lint:boundaries` | Passed: 371 files, zero errors |
| `npm run format:check` | Passed: 570 files |
| `npm run lint` | Passed: 736 files, 1479 local links, zero errors |
| Task status/checkbox audit and `git diff --check` | Passed: 210 tasks, 107 Done, 89 Not Started, 12 Blocked, 2 Deferred; boxes consistent and diff whitespace clean |

Initial typecheck/build exposed inferred Mongoose collection fields omitted by `Object.fromEntries`;
the accessor now validates selected fields from the document at runtime rather than asserting a type.
Initial lint rejected non-null assertions in tests; explicit fixture checks replaced them. The early
prototype attempt schema had a TypeScript discriminated-union inference error and was replaced with
the tested flat transient fact shape. Failed attempts are not counted as passing results.

Not Run / Blocked: durable refund attempts, safe reservation/concurrency, actual payout/status proof,
policy/legal approval, deployed payment/financial services, frontend, backend-stage or integrated
release acceptance. Synthetic facts and a strict schema do not prove collection or payout by themselves.

**Boundary verification correction (31 October 2026):** The earlier focused `node --test` command
reported the test file as passed without establishing that its matching fixture ran. On the later
working revision, `node --test --test-isolation=none --test-name-pattern='RETURN-BOUNDARY|REFUND-BOUNDARY' tests/tooling/development.test.mjs`
explicitly ran and passed the three named return/refund fixtures. This does not change the historical
implementation or independent-acceptance status recorded above.
