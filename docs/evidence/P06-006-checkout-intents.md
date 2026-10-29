# P06-006 — Persistent checkout intents and replay

**Date:** 27 October 2026 (Asia/Dhaka)
**Executor:** Codex
**Status:** In Review; independent acceptance pending
**Revision:** Working tree against `f0c50933aff2d1b363fbf5be9a6919392e819249`.
Working tree was clean at kickoff; no commit/reset/cleanup was performed.

## Scope and contracts

Sources: FR-11, Architecture §§6,8,10, Database §7.1.2, API §§11.1,15.1 and Testing §10.
P06-005 is accepted. This work owns the private checkout intent registry and transaction coordinator
boundary; public POST /checkout/orders activation and complete stock/coupon/payment/notification
integration remain P06-007–P06-009. No endpoint or opt-in flag is invented to bypass those dependencies.
P06-003 qualified compliance sign-off remains Blocked; synthetic test policy data is not approval.

Database now specifies the minimal matching order pointer and canonical submitted-command fingerprint.
API clarifies bounded printable opaque keys and current-state replay. Operations covers additive
bootstrap, no-TTL readiness and recovery; Testing records intent assertions. No new public DTO/route,
dependency, frontend change or collection beyond the approved checkoutIntents is introduced.

## Delivered behavior and ownership

- Checkout owns strict intent input/hash functions, canonical persistence, declared unique indexes and
  the transaction-required execution flow. Raw keys, emails and redirect/session secrets are absent
  from durable identities/results. Validated item/policy ordering is canonical; notes/quote/consent,
  method and recipient changes conflict under a reused key. No key trimming silently changes identity.
- Authentication runs on every submission and replay through existing checkoutAccess. Scope is customer
  identity or opaque guest context, never caller-supplied email. Existing scoped key lookup precedes
  quote expiry, quote consumption and current commercial/address resolution. First submissions still
  call the real quote owner's revalidation capability for current authoritative eligibility/consent.
- Matching retries return the same order's current authorized projection. Optional replayUntil never
  erases identity or authorizes a second order. Changed payload returns IDEMPOTENCY_CONFLICT; a second
  key against one quote returns STATE_CONFLICT without disclosing the linked order.
- New intent preparation, quote consumption, mandatory completion callback, matching order read and
  durable outcome pointer commit in one outer authorization transaction. Completion must atomically
  create required order/allocation/payment/notification state before production activation. Providers
  remain outside transactions. There is no production completion adapter or submission route here.
- Duplicate unique-index races abort then re-enter authorization once in a fresh transaction to see
  the winner; failed sessions are never reused. Driver-supported transient transaction retries remain
  unchanged. Failure after consent consumption rolls back intent, consent, order, balances and audit.
- Committed outcomes require matching order/result pointers. Missing orders, wrong owners and stranded
  preparing records fail closed for investigation, without creating replacements or blindly resuming
  a possible financial effect. Normally preparing records cannot survive the atomic outer transaction.
- Orders exposes one narrow transaction-bound current-state projection with order/intent/owner checks;
  checkout does not import the private order model. No stale pending-only snapshot or duplicated payment
  status is used for replay. The projection contains no contact or payment credentials.
- Strict BSON validation rejects malformed identities/outcomes and secret-bearing result payloads.
  Scope/key, quote and optional order are unique. Validator drift, missing required indexes or any TTL
  index fails readiness; additive bootstrap refuses staging/production and never silently repairs drift.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0; isolated MongoDB 8.0.16 replica sets.

| Command | Observed result |
| --- | --- |
| `npm run test:unit --workspace=backend -- tests/unit/checkout-intent.test.ts tests/unit/checkout-quote.test.ts tests/unit/orders.test.ts` | Passed: 14 tests / 3 files, including 3 new intent cases |
| `npm run test:integration --workspace=backend -- tests/integration/checkout-intent.test.ts tests/integration/orders.test.ts tests/integration/checkout-quote.test.ts` | Passed: 50 tests / 3 files: 14 intent, 15 order, 21 quote |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed before final compiled bootstrap tests |
| `npm run lint --workspace=backend` | Passed: 282 files |
| `npm run lint:boundaries` | Passed: 285 files, zero errors |
| `npm run format:check` | Passed: 446 files |
| `npm run api:check --workspace=backend` | Passed: 4 artifacts, no operation changes |
| `npm run test:security` | Passed: gitleaks/no findings and dependency audit zero vulnerabilities |
| `npm run lint` and `git diff --check` | Passed: repository structure/links and whitespace checks |

[Generated integration report](../../test-results/database.json) and
[generated security report](../../test-results/security.json) are local artifacts replaced by later runs;
this record preserves the observed scope and counts.

Intent integration covers five concurrent identical requests, two concurrent keys for one quote,
changed-payload conflict, expired/consumed quote replay, retired-window replay with updated fulfillment
revision, complete audit-failure rollback and successful retry, guest scope isolation, malformed/missing
outcomes, no-TTL readiness, missing index/schema drift and repeated compiled additive bootstrap.
A real customer/session/access test confirms owned replay and suspended-account rejection; the order
projection separately rejects a guest reading that customer's order.

Most intent tests use isolated access/commercial revalidation doubles with real durable quotes,
intents, orders, unit balances and audit in the same MongoDB transaction. The existing quote suite
separately exercises actual authentication/current commerce revalidation. The completion fixture creates
real orders but deliberately does not claim production inventory/coupon/payment/notification integration.
No synthetic adapter is enabled by root application wiring.

Initial type checking found collection-metadata narrowing, optional owner query typing and test-input
narrowing issues; those were fixed before the successful build. Formatting initially found one model
layout mismatch; the file was formatted and format:check passed. Initial 12 intent integration cases
passed; the final 14-case suite adds actual customer authorization and missing-completion rollback.

Not Run: full backend stage/integrated release suites, frontend/browser checks, live provider tests,
production submission HTTP security and staging/production provisioning. No HTTP/root composition
changed; focused verification follows Testing §15.5. Existing route security is covered by the quote
regression; a future submission route still needs its own Origin/CSRF/rate/access contract tests.

## Recovery and review

Keep the registry, consumed quotes, orders, balances and audit together across rollback/restore. Do not
clear a key or replayUntil to retry an uncertain operation. Review missing-order/preparing anomalies
against durable evidence and reconcile financial state before any owning recovery action. Provisioning
is additive and refuses validator drift, rather than overwriting an existing incompatible registry.

Status is In Review. Independent acceptance is pending. No milestone, legal/provider gate or later
submission/allocation/payment task is accepted by this evidence.
