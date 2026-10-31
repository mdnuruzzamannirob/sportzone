# P08-003 / P08-004 — Private physical return receipt and inspection

Date: 31 October 2026 (Asia/Dhaka). Executor: Codex. Base revision `bb1ec51`; prior P08-002/003
changes were staged at the start and subsequently appeared in commit `160d636` during this work.
Those changes were retained; this work did not create that commit. Status: **Blocked** for full acceptance.
The owner requested the next tasks together and had authorized safe local work where prerequisites are
blocked. No task, provider, legal policy, application stage or milestone acceptance is inferred.

| Task | Local implementation | Remaining acceptance |
| --- | --- | --- |
| P08-003 | Current-admin private single receipt and inspection, bounded to approved ordinals; records received, inspected, accepted and resellable sets, receipt reference and reasons; completion after all approved units are received and accepted; replay and revision fences | Accepted P08-002; additional receipt batches, partial-case resolution and real protected HTTP/CSRF/DTO integration; independent task review |
| P08-004 | Inspection uses canonical delivered order/item and protected claim ordinals; only resellable units gain physical stock, with a unique append-only return movement | Accepted P08-003, complete physical lifecycle and integrated authorization/operational acceptance; independent task review |

Partial receipts are recorded, but further receipt batches and partial-case resolution are not implemented;
unreceived and nonaccepted ordinals remain protected and cannot be completed. Full received and accepted
physical claims may complete after inspection without repeating stock movement. Shortage claims cannot receive, inspect or restock. Approval
or receipt alone does not change stock. No refund obligation or payout is inferred from inspection.
There is no new route, ordinary runtime composition, scanner/provider call or external effect.

References: PRD FR-13/17/32; API §13.2; Database §§9.1/12.5; Architecture §§4–6; Testing RET-02/03/06
and §15.5. This evidence supersedes only the statement that private local physical receipt/inspection
were unavailable in [the preceding local record](./P08-002-003-local-return-eligibility-lifecycle.md);
that record remains historical for its revision and checks.

## Ownership and safety

Returns owns physical receipt/inspection state and evidence, using a current-admin transaction and
revision CAS. Orders supplies the immutable order-item variant and enforces delivered state, current
protected claim ownership and per-unit restock fences. Inventory owns stock mutation and a unique
claim/item movement; its catalog stock capability preserves product boundaries. Same-key replay returns
current state; a different key cannot repeat an already completed inspection. Receipt, ordinal fence,
variant stock, movement, claim state and audit commit together; missing audit readiness rolls all back.
No frontend or controller imports private models. The extended boundary fixture denies direct Returns
imports of Orders, Media and Inventory persistence.

The current strict BSON validator adds physical receipt/inspection ordinal arrays and dates. The explicit
local/test `bootstrap-returns.mjs --lifecycle` upgrade accepts only the exact prior foundation or
review-only validator, checks indexes, retains existing claims and rejects unknown drift. Do not use an
older requested-only/review-only binary with new states; restore claims, ordinals, stock, movements and
audit consistently. No migration against external/user data was run.

## Verification

Environment: Node 24.20.0 / npm 11.19.0; isolated MongoDB 8.0.16 replica sets, actual local admin
session and synthetic customer authorization/inspection facts. JSON output is a local replaceable
artifact under ignored test-results. No simulated inspector or provider qualifies real-world receipt.

| Command | Result |
| --- | --- |
| `npm run build --workspace=backend` | Passed |
| `npm run typecheck --workspace=backend` | Passed |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts orders.test.ts checkout-quote.test.ts -t 'claim foundation\|return lifecycle local\|return evidence local\|return eligibility local\|physical return local' --reporter=default --reporter=json --outputFile=../test-results/physical-return-regression.json` | Passed: 31; 206 outside selection. Nine new physical cases cover stock timing, partial/nonresellable quantities, replay, race, authorization, shortage denial and rollback after a stock/movement write; prior local claims and both recognized migration sources also pass |
| `node --test --test-name-pattern=RETURN-BOUNDARY tests/tooling/development.test.mjs` | Passed: one extended negative fixture |
| `npm run lint --workspace=backend` | Passed: 401 files |
| `npm run lint:boundaries` | Passed: 368 files, zero errors |
| `npm run format:check` | Passed: 566 files |
| `npm run lint` | Passed: 731 files, 1476 local links, zero errors |
| Task status/checkbox audit and `git diff --check` | Passed: 210 tasks, 107 Done, 91 Not Started, 10 Blocked, 2 Deferred; boxes consistent; diff whitespace clean |

Not Run / Blocked: additional receipt batches, partial-case resolution, customer/admin HTTP/CSRF flows,
qualified policy/provider evidence, frontend, application-stage and integrated release acceptance.
No test doubles establish real physical custody or deployed merchant/operator qualification.

Initial repository lint found two Markdown table-column errors from unescaped command separators;
corrected them and reran successfully. The missing-audit-index test fails before the mutation; a
separate injected failure after stock and movement writes verified actual transaction rollback.
