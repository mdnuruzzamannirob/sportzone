# P06-010 / P06-015 — Reservation expiry and verified guest access

**Date:** 27 October 2026 (Asia/Dhaka)
**Executor:** Codex
**Status:** Both tasks In Review; independent acceptance pending
**Revision:** Working tree against `7fa7bf887215d835d667af0590d1c6b427c25d18` at review.
Working tree was clean at kickoff; no commit/reset/cleanup or production mutation was performed.

## Scope and task acceptance

The owner requested the next combined backend batch. Sources: FR-09/13/19, Architecture §§6/9–10,
Database §§5.2–5.3/7.7/10.1/10.6, API §§4/9.2/15/16.3 and Testing §10/15.5.
P06-005 is accepted; P06-006–009 remain independently In Review. This execution does not self-approve
those dependencies, either task, a milestone or the outstanding qualified compliance/provider gates.

| Task | Delivered behavior | Independent checks | Status |
| --- | --- | --- | --- |
| P06-010 | Bounded scheduled expiry service/CLI, durable owner lease/cursor, atomic eligible stock/coupon release and audit | Exact due boundary, concurrent runners/funding, rollback/restart, cursor fairness, stale owner/final fence denial, no TTL/drift, compiled worker entry | In Review |
| P06-015 | Opt-in guest lookup/email proof, single-use exchange, exact order sessions, guest CSRF/logout and encrypted proof delivery | Ambiguous lookup/floor, real HTTP/DB scope checks, replay/expiry/reissue races, cookie separation, key/tamper/uncertainty denial, rollback, migration/root wiring | In Review |

No storefront/admin work, provider integration, new dependency, collection outside approved contracts,
legal rule or live financial action is introduced. Existing backend CI discovery includes the new source,
unit/integration tests and CLI files; workspace state/check scripts remain unchanged.

## Expiry implementation and invariants

- The root jobs layer coordinates scheduling/lease fencing and calls checkout domain services. Shared
  job lease persistence has only technical dependencies; inventory/promotions/orders/payments retain
  their private models. No controller or frontend receives private persistence.
- The canonical jobLeases model/validator and additive provisioning preserve owner, expiry, cursor,
  failure and success metadata. Missing indexes, unknown validator drift or TTL indexes fail readiness.
  Acquisition uses a random owner and a unique job key; active leases cannot be stolen.
- Every release transaction checks owner/lease before and after domain writes. Expired/replaced owners
  cannot commit effects or checkpoint. Durable reservation-ID cursors move past protected candidates and
  wrap after the scan ends, preventing protected head rows from starving later eligible work.
- Whole-generation canonical quantities, variant membership and stock/coupon clocks must agree. Only
  due held allocations belonging to an unconfirmed Pending online order and clear-risk zero-funds
  Pending payment can release. Order/payment writes fence concurrent changes; receipt application must
  respect the same aggregate serialization in the owning payment integration.
- Stock/coupon release, movements, order/payment fences and one expiry audit cause commit together.
  Failure rolls everything back. Historical allocations are transitioned, never TTL-deleted. Replays
  do not double-decrement counters or duplicate audit effects.
- Expiry does not cancel an order/attempt, declare failed payment, discard possible late funds or invoke
  a provider. Verified-funded/risk-protected or inconsistent state is retained for reconciliation.
  Synthetic concurrent funding tests prove retained money status/capacity consistency, not actual
  provider collection or late-payment reacquisition.
- A concrete contract check found initial holds could capture a later service-call clock than placedAt.
  The canonical order binding now supplies actual placedAt for generation 1; later generations retain
  fresh reacquisition clocks. An advancing-clock test verifies exact initial stock/coupon placement
  binding without rewriting historical holds.
- Compiled expire-reservations.mjs requires explicit batch/lease settings and emits counts/static
  failures only. There is no HTTP background loop. Checkout bootstrap additively provisions job leases.
  Docker recipe/allowlist now include the new entry; actual image build/deployment remains unverified.

## Guest access implementation and invariants

- Auth owns DTOs, proof issuance/exchange, guest sessions, HTTP adaptation and delivery. Orders exposes
  narrow guest lookup/revision/ownership capabilities. Only transaction-bound owned scope crosses to
  business consumers; session minting stays inside auth.
- Valid-shaped unknown order, wrong email, registered-owned order, cooldown suppression and valid guest
  lookup return the same accepted body with a configured minimum response duration. Durable throttling
  shares network protection and a separate guest network/normalized-email group. No order/proof details
  appear in lookup responses, and lookup alone creates no session.
- Issuance consumes its pre-auth context and atomically writes a purpose-separated hash, order/revision/
  expiry-bound AES-GCM envelope and challenge-reference notification. The key ring remains outside DB;
  no raw proof/link/envelope/key is stored in the outbox payload or logged.
- Delivery validates the exact notification/challenge/order/destination/revision and decrypts only in
  memory. Email uses a fixed HTTPS storefront fragment link. Unknown keys/tamper deny sending. Already
  delivered valid proof exchange verifies hashes without needing the original decryption key.
- Exchange atomically consumes context/proof and fences the guest order revision before issuing a fresh
  opaque guest_order session/CSRF. Session persistence failure rolls back consumption. Concurrent
  exchange/reissue cannot revive an old proof. Supersession strips old envelopes; uncertainty is not
  blindly resent and explicit reissue invalidates its old link.
- Sessions contain only exact order scope, fixed expiry and HMAC-separated token/CSRF verifiers. Server
  expiry/revocation is authoritative independently of TTL. Wrong-kind, duplicate, guessed or cross-order
  credentials fail; the browser's previous guest cookie is revoked on new exchange.
- Guest CSRF bootstrap refreshes the verifier without extending expiry. Logout supports approved
  context/session CSRF, durably revokes only the guest credential, clears its cookie and returns fresh
  browser-context CSRF. Customer/admin credentials cannot substitute or be revoked through this path.
- Root composition is explicitly disabled by default. Activation validates explicit lifetimes, HTTPS,
  protected key custody and customer-auth prerequisites; persistence/throttle readiness is verified.
  Existing proof purpose encodings remain compatible; auth/recovery/admin regressions pass.
- Notification expansion accepts only exact known predecessors, retains account/proof/order receipt
  evidence and adds the guest proof branch. Order receipt events remain queued and cannot be claimed
  as guest proofs or welcome mail. Startup/worker never silently migrate.

## Observed verification

Environment: Node v24.20.0, npm 11.19.0; isolated MongoDB 8.0.16 replica sets.

| Command | Observed result |
| --- | --- |
| `npm run test:unit --workspace=backend -- tests/unit/guest-access.test.ts tests/unit/recovery.test.ts tests/unit/browser-security.test.ts tests/unit/notifications.test.ts` | Passed: 75 tests / 4 files |
| `npm run test:unit --workspace=backend -- tests/unit/app.test.ts tests/unit/sessions.test.ts tests/unit/identity-contracts.test.ts tests/unit/auth-rate-limit.test.ts` | Passed with local socket permissions: 156 tests / 4 additional files |
| `npm run test:integration --workspace=backend -- tests/integration/guest-access.test.ts tests/integration/checkout-quote.test.ts tests/integration/notifications.test.ts tests/integration/recovery.test.ts tests/integration/email-change.test.ts tests/integration/admin-auth.test.ts tests/integration/checkout-intent.test.ts tests/integration/orders.test.ts tests/integration/inventory-allocation.test.ts tests/integration/coupon-allocation.test.ts` | Passed: 232 tests / 10 files before two final added assertions |
| `npm run test:integration --workspace=backend -- tests/integration/guest-access.test.ts` | Passed: final 19 cases, including migration preservation and exchange with the old decryption key absent |
| `npm run test:integration --workspace=backend -- tests/integration/checkout-quote.test.ts` | Passed: final 45 cases, including actual placement-clock binding |
| `npm run test:contract --workspace=backend` | Passed: 97 cases; 4 generated artifacts current |
| `npm run typecheck --workspace=backend` | Passed on final source/tests |
| `npm run build --workspace=backend` | Passed; compiled bootstrap/expiry entry exercised |
| `npm run lint --workspace=backend` | Passed: 300 files |
| `npm run lint:boundaries` | Passed: 299 files, zero errors |
| `npm run format:check` | Passed: 464 files |
| `npm run test:smoke --workspace=backend` | Passed with local process/socket permissions: real DB startup, liveness/restricted readiness, redacted invalid configuration and graceful shutdown |
| `npm run test:security` | Passed on final changes: secret scan/no findings and dependency audit zero vulnerabilities |
| `npm run lint` / `git diff --check` | Passed: repository structure/links and whitespace |

The two disjoint unit runs total 231 cases. Final focused integration coverage totals 234 distinct
cases: the 232-case regression plus one added guest migration case and one placement-clock case;
final owning suites were rerun after their localized changes while unchanged consumer results were
retained under Testing §15.5. No full backend-stage/release pass is claimed.

[Latest MongoDB report](../../test-results/database.json) contains the final guest-only 19-case run;
subsequent runs replace this local artifact. The table records observed outputs of all runs, including
45 checkout cases and the earlier 232-case regression. [Security report](../../test-results/security.json)
is likewise a generated local artifact. Current API inventory is 84 implemented / 80 planned of the
unchanged 164 operations; all four guest routes and their separate guest-cookie scheme are executable.

Initial failures were corrected without weakening contracts: strict identity ObjectId conversion,
nullable lease cursor typing and a duplicate coupon fixture. The first combined integration run was
42 Passed / 14 Failed; corrected suites then passed and gained further safety cases. Contract checks
first encountered a shared temporary compiler-cache race during simultaneous generation/check, then
an explicit route-owner inventory omission; sequential verification with the new owner registered
passed. HTTP unit fixtures initially failed with sandbox listen EPERM and passed with socket access.
These attempts are not represented as clean passes.

## Limits, rollout and recovery

Not Run: full backend-stage/integrated release regression, frontend/browser UI, real inbox/provider/
merchant acceptance, authorized Docker image build/inspection or staging deployment. Guest delivery
uses a controlled test adapter; separate notification regressions exercise the existing local provider
protocol. No actual third-party email, payment, refund or production data mutation was performed.

API/Database/Testing contracts, Operations procedures and sanitized configuration were synchronized.
Use explicit known-schema migration before identity startup; preserve challenges, session revocations,
notification history, orders, movements, payments and job progress across compatible rollback/restore.
Do not erase rows or downgrade validators to force an older exact-schema readiness check to pass.

Observe due backlog, persistent skips and lease failures; lastSucceededAt proves only the bounded scan,
not release eligibility or funding reconciliation. Scheduler cadence/capacity and deployed credentials
remain operator responsibilities. Late/uncertain payments remain Phase 07; legal sign-off P06-003 and
staging/provider gates remain Blocked/separate. Guest authority does not implement or authorize future
order-detail/cancellation/claim/refund business routes or their financial eligibility rules.

Both tasks remain In Review, alongside prior P06-006–009. No independent acceptance, milestone or
external approval is inferred from this batch.
