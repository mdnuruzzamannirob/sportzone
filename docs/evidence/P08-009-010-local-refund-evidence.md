# P08-009 / P08-010 — Local refund status and manual evidence checks

Date: 31 October 2026 (Asia/Dhaka). Executor: Codex. Prior P08-007/008 work was uncommitted at turn
start and subsequently appeared in commit `b046550`; it was preserved, and this task did not create
that commit. Full task status: **Blocked**. The owner requested the next batch and previously
requested safe local work with blocked prerequisites. No task, legal policy, provider, application
stage or milestone acceptance is inferred.

| Task | Local subset | Remaining work and acceptance |
| --- | --- | --- |
| P08-009 | SSLCOMMERZ status query validates provider/bank references and optional merchant echo, strips other fields and returns a matched report; read-only investigation and retry assessment never authorize a payout | Accepted P08-008, durable attempt/receipt identity and amount binding, qualified provider timestamp and final-state evidence, job replay/reconciliation, protected retry transaction, merchant sandbox evidence and independent acceptance |
| P08-010 | Private read-only manual evidence gate checks current admin before/after external verifier; binds reserved obligation/source/attempt, amount, transfer, method and optional required consent, and detects revision/identity changes | Accepted P08-007/P06-012, real canonical reserved snapshot/source and consent/evidence authorities, audited atomic completion and commitment transitions, actual manual payout proof, independent acceptance |

The gateway report is not a completion decision. `processing` is pending, `cancelled` remains an
investigation, and `refunded` still needs independent durable identity/amount/time verification:
the documented response does not supply the amount and its timestamp lacks a qualified timezone.
A no-payout retry assessment yields only `retry_review_required`, never permission to dispatch; proof
must bind the same refund/source/attempt/amount, be later than the latest operation, and have no
other open attempt. A real current-admin, durable CAS recheck remains mandatory.

Manual verification uses a **trusted injected** reserved-snapshot reader and independent transfer
verifier, not browser assertions. It requires a verified source amount, source and obligation reserved
amounts, active attempt, appropriate timestamps, and consent evidence where required. It checks
same admin and an identical revision-bound snapshot after the external evidence read; errors are
sanitized and masked destination data is not returned. There is no runtime reader/verifier wiring or
HTTP endpoint, and no refund, attempt, source, order or audit record is changed. In integration
tests the admin session is real and the reserved source/evidence/consent facts are explicitly synthetic.
No synthetic evidence establishes a real collection, consent or payout.

Provider status protocol was checked against [SSLCOMMERZ v4 Refund API](https://developer.sslcommerz.com/doc/v4/#refund-api)
on 31 October 2026. Queries use the documented authenticated GET endpoint and return redacted facts;
transaction-boundary checks prevent provider calls within MongoDB transactions. No real sandbox/live
request was sent. No automatic retry, new provider reference, financial write, provider secret or raw
personal data is returned or logged. No package, collection, migration or runtime activation was added.

References: PRD FR-18/33; Architecture §§6/10.5; Database §§8/9/12.5; API §13.3;
Testing RFD-02/03/04/06/07/08 and §15.5. Refunds owns the local evidence/decision checks; provider
code owns protocol and cannot import refund domain logic. No frontend imports backend runtime/models.

## Actual verification

Environment: Node 24.20.0 / npm 11.19.0; isolated MongoDB 8.0.16 replica set; current local admin
sessions, synthetic reservation and evidence authorities, and synthetic provider fetch. JSON output
under ignored `test-results` is replaceable local evidence, not a real merchant/payout acceptance.

| Check | Result |
| --- | --- |
| `npm run build --workspace=backend` | Passed |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run test:unit --workspace=backend -- sslcommerz.test.ts refund-investigation.test.ts refund-calculation.test.ts` | Passed: 108; gateway report and retry assessment include mismatch, timeout, unknown, evidence and proof time cases |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts -t 'manual payout evidence local\|refund status local\|refund transport local' --reporter=default --reporter=json --outputFile=../test-results/refund-evidence-local.json` | Passed: 7, 209 outside selection; authorization, zero-source denial, binding/consent, stale snapshot, revocation, sanitization and transaction guards |
| `node --test --test-isolation=none --test-name-pattern='RETURN-BOUNDARY\|REFUND-BOUNDARY' tests/tooling/development.test.mjs` | Passed: three named fixtures, including new provider/refund and private-auth negatives |
| `npm run lint --workspace=backend` | Passed: 408 files |
| `npm run lint:boundaries` | Passed: 373 files, zero errors |
| `npm run format:check` | Passed: 573 files |
| `npm run test:contract --workspace=backend` | Passed: 111; four generated API artifacts unchanged |
| `npm run lint` | Passed: 741 files, 1485 local links, zero errors |
| Task status/checkbox audit and `git diff --check` | Passed: 210 tasks, 107 Done, 85 Not Started, 16 Blocked, 2 Deferred; boxes consistent and diff whitespace clean |

The original node test pattern without `--test-isolation=none` reported a file pass without proving
that individual matching fixtures ran. The corrected command above ran all three actual fixtures;
prior related evidence records carry the correction. No durable reconciliation/retry worker,
confirmed payout transaction, legal/consent approval, external provider evidence, frontend, backend
stage or integrated-release verification was run.
