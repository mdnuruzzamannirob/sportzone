# P07-001 — Private SSLCOMMERZ v4 adapter

Status: **Done**, project-owner acceptance recorded below. Executor: Codex, 29 October 2026.
Revision: current working tree based on `efb6d8c563c91d0899cf3ff2f86435c41e26fc0a`.
P07-002 was already owner-accepted; its implementation is preserved.
Sources: FR-12, [Architecture §10](../ARCHITECTURE.md#101-checkout-and-online-payment),
[API §16.1](../API.md#161-gateway-boundary), [Testing §11](../TESTING.md#11-payments-returns--refunds-test-cases).
Provider reference inspected 29 October 2026: [official SSLCOMMERZ v4 documentation](https://developer.sslcommerz.com/doc/v4/).

## Scope and ownership

`backend/src/providers/sslcommerz/sslcommerz.client.ts` owns initiation, validation and transaction/session
query transport; `sslcommerz.schema.ts` owns protocol/config validation. `backend/src/config/payments.ts`
loads explicit disabled-by-default options. No dependency, model, collection or API endpoint added.
Provider code executes no domain/database decision. Existing source boundary enforcement covers these
paths; no new exception or provider-to-domain import introduced.

Configured mode selects a fixed HTTPS origin. Credentials are confined to provider requests; callbacks
are derived from an explicitly configured HTTPS API origin and approved paths. Physical-goods fields
are bounded, customer/shipment data are validated without invented values or truncation, and amounts
are formatted/parsed exactly from/to integer poisha. Merchant-specific approved limits and verified
channel key mapping must be supplied by the later owning composition; published gateway bounds alone
do not qualify a merchant/channel. The public v4 maximum/minimum are protocol bounds only.

A well-formed explicit FAILED initiation without a session is rejected. Network, timeout, non-2xx,
malformed, oversized, contradictory and unqualified redirect responses remain uncertain; no automatic
retry follows. Hosted URL acceptance is restricted to the documented v4 gateway path, same-mode
origin, exact returned SESSIONKEY and optional Q=PAY. Alternate provider URL contracts require review.
Queries return redacted reports and response-byte SHA-256 digests, not a funding decision. Distinct
reports for one transaction are retained; absent/pending results never imply verified failure.

Merchant account fingerprint hashes mode and store ID; an optional returned store ID must match.
An authenticated endpoint response without a merchant echo is not claimed to independently prove
merchant identity. The future verifier must satisfy the complete merchant/reference/amount/currency/
settlement/risk checks before recording financial success. No raw card/customer data or provider error
text is returned; no outbound URLs, bodies or secrets are logged. GET query credentials are required
by the published provider protocol and must be redacted in surrounding HTTP instrumentation.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, Vitest 5.0.5, disposable MongoDB 8.0.16 replica set.
All provider traffic uses synthetic injected transports or a loopback mock server; no merchant calls.

| Command | Result |
| --- | --- |
| `npm run test:unit --workspace=backend -- sslcommerz.test.ts` | Passed, 58 tests |
| `npm run test:integration --workspace=backend -- sslcommerz.test.ts` | Passed, 5 tests |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed |
| `npm run lint --workspace=backend` | Passed, 312 files |
| `npm run lint:boundaries` | Passed, 306 files, zero errors |
| `npm run format:check` | Passed, 476 files |

Integration artifact: `test-results/database.json` (local generated report). Actual HTTP tests exercise
form/query encoding, redirect refusal, timeout and malformed response. A real MongoDB transaction
scope rejects all four provider operations before any transport call. Unit cases additionally cover
live/sandbox separation, credential redaction, malformed/mismatched reports, bounds/overflow, exact
money, multiple receipts, empty query results and streamed response timeout/size limits.

Development failures: one test initially expected a private configuration issue key in the public
error message; corrected to assert the existing sanitized ConfigurationError. Lint caught one test
non-null assertion; replaced by an explicit fixture guard. Both corrected before passing reruns.
Final checks: `npm run lint` passed (620 files, 1385 local links, zero errors);
`npm run api:check --workspace=backend` passed (4 artifacts); `git diff --check` passed.
An initial evidence link used the wrong Architecture anchor; corrected and link checks rerun.

**Not Run:** real sandbox/production credentials or provider integration, merchant/channel activation,
callback deployment, payment HTTP, independent receipt/funding mutation, container/deployed rollout,
full backend-stage regression and frontend checks. No mock is claimed as live provider qualification.

## Integration and recovery limits

P06-009 remains In Review. This private provider implementation starts safe isolated work without
accepting or enabling the dependent checkout path. No setup.ts/server.ts wiring, callback listener,
provider initiation endpoint, channel publication or receipt writer is enabled. P07-003/004/005/006/013
must integrate verified merchant capabilities, authorization, durable intent/idempotency, independent
verification and recovery before any external collection effect is allowed.

Configuration and rollback are documented in [Operations](../OPERATIONS.md); sanitized variables are
in `.env.example`. No credentials supplied. Disable composition on rollback while preserving all
attempts/receipt evidence. Never retry an uncertain initiation because of a timeout or deployment
rollback. Reviewer decision: accepted for the submitted private adapter scope. No milestone accepted.

## Independent acceptance

Reviewer: project owner, 29 October 2026. Decision: accepted through explicit instruction
“done koro” following the implementation and verification handoff. P07-001 is Done.
Acceptance covers the private adapter and recorded mock/local HTTP/transaction checks; it does not
qualify live credentials/channels or accept payment HTTP integration, P06-009 or a milestone.
This acceptance update changes documentation only; prior code verification remains applicable.
