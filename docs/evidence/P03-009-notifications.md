# P03-009 — Transactional notification foundation

**Date:** 19 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner accepted on 19 October 2026: “Notification foundation গ্রহণ করছি”

## Scope and authority

[Task](../TASKS.md#phase-03--authentication-and-core-backend), PRD FR-20, Architecture §§6/10,
Database §§10.1/12, API §4.8 and Operations notification recovery govern the work. P03-002/003/007 prerequisites
are accepted. This connects the existing registration intent to durable independent delivery/retry; it does not activate
unimplemented proof/commerce templates, real email credentials or public retry endpoints.

## Delivered behavior

| Area | Behavior |
| --- | --- |
| Email boundary | Server-only fixed HTTPS Resend adapter; bearer auth, no redirects, stable logical-event idempotency header, bounded response/input, timeout and safe outcome mapping |
| Recipient safety | Explicit activation; live only in production; local/test/staging require test mode and approved recipient override; credentials/sender/retry policy remain protected configuration |
| Durability | Registration intent remains in the account transaction; majority-acknowledged conditional claim increments attempts and persists a unique lease before external call |
| Concurrency | One active claim per due intent; completion fences on claim ID; pre-send active-claim check; no stale attempt overwrites a newer receipt |
| Retry | Bounded attempt/batch counts and capped exponential backoff for confirmed HTTP 429 rejection; permanent rejection/exhaustion fails without repeating account creation |
| Unknown outcome | Timeout/network/malformed success/5xx/conflict and interrupted sending become delivery_uncertain; no automatic resend even beyond provider idempotency lifetime |
| Late result | Verified provider acceptance for the same retained claim can resolve interrupted uncertainty; sent means accepted by provider, not inbox delivery |
| Transaction safety | Repository transaction-context guard refuses worker and provider dispatch before side effects; critical enqueue requires an active business transaction |
| Migration | Explicit additive upgrade of exact known prior registration validator; optional claim/timing fields and expiry index; unknown schema refused and original records/status preserved |
| Entry points | Separate one-batch worker, disabled by default; explicit local/test migration command; no migration/email send in HTTP startup |

## Verification

Environment: Node 24.20.0, npm 11.19.0, owned MongoDB 8.0.16 replica, local HTTP test provider and local browser engines.
Final full CI ran from `2026-10-19T13:29:49.620Z` to `2026-10-19T13:33:03.802Z`.

| Command/check | Observed result |
| --- | --- |
| `MONGOMS_DISTRO=ubuntu-24.04 SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-browser-libs/webkit.sh npm run ci` | Passed; all 20 configured commands, 481 unit/component tests (258 backend), 183 real MongoDB/runtime integration cases, 30 browser regressions, three builds and seven HTTP smoke groups |
| Notification additions | Passed; 28 adapter/policy unit cases and 19 real replica/local HTTP provider pipeline cases |
| Normal registration/auth/profile regressions | Passed; committed intent delivery/retry does not undo the account; existing customer startup checks current notification validator/indexes |
| Compiled CLI guard probes | Passed expected refusal (exit 1, generic message); explicit disabled worker and production migration command reject with synthetic unreachable DB configuration before opening a connection; no live send/migration performed |
| `npm run lint`, `git diff --check`, task/source integrity audit | Passed; document references/structure, 171 IDs/checkboxes, scoped task transition, milestone preservation, reviewed hashes and unchanged lock/dependency identity |
| Real Resend sender/domain/deduplication/inbox delivery, deployed scheduler/production migration/reconciliation exercise, hosted CI and operator/milestone acceptance | Not Run/outside this slice; no success claimed |

Generated local artifacts: `test-results/ci.json`, `test-results/database.json` and `test-results/ui-report.json` (ignored).
Lockfile SHA-256: `7b8c507181a5c5f9a132b4050b23239db3b4b407e266aef710b536e61772dac6`.
The browser report records 30 expected and zero skipped/unexpected/flaky cases; no browser assertions/retry policy changed.
The focused 28-unit/18-integration runs filtered unrelated cases; only the final complete unfiltered CI is full-suite
evidence. No remote Resend request or actual email was sent. Final documentation/status edits were separately linted.

## Review and operational boundaries

Provider calls are outside business transactions and cannot undo account creation. Recovery keeps claims/receipts and
logical event keys; do not reset uncertainty/counters or invent a new key merely after timeout. Provider idempotency
retention is bounded, so local certainty is never inferred from elapsed time. Internal status projection excludes
recipient, payload and claim/event credentials; there is no new HTTP administration or reconciliation API.

The current worker renders only registration-v1 plain text with empty payload. Proof challenges require authenticated
envelope/key custody/current-scope checks and explicit safe rendering in their owning tasks; no proof URL or secret is
accepted by this outbox schema. Other business events require their owning schema/template work.

The migration preserves prior registration records but exact old-validator readiness checks in old binaries will reject
the expanded schema on restart. A rollback must keep a compatible build and disable the worker; never delete new receipt
or lease fields or downgrade validation destructively. Production migration/provider domain/sender readiness, actual
provider deduplication, inbox acceptance, reconciliation drills and operator/milestone gates are Not Run/unaccepted.

An initial focused fixture used an advance smaller than first-transaction startup latency and observed a not-yet-due
intent. Store clock injection now aligns queue timestamps with the controlled worker clock; runtime defaults remain real
UTC Date values. No assertions/retry policy were weakened to obtain a pass.

Project-owner acceptance was recorded on 19 October 2026 under [AGENTS §13](../../AGENTS.md#13-task-completion--reporting): “Notification foundation গ্রহণ করছি”. This task acceptance does not approve milestone, operator or provider gates.

## Primary provider sources

[Resend send endpoint](https://resend.com/docs/api-reference/emails/send-email),
[idempotency behavior](https://resend.com/docs/dashboard/emails/idempotency-keys) and
[error definitions](https://resend.com/docs/api-reference/errors) support the HTTP contract, bounded 24-hour deduplication
window and explicit/ambiguous failure handling. The implementation deliberately stops uncertain outcomes rather than
claiming an unbounded exactly-once guarantee. Official documentation is not merchant/sender/provider activation evidence.

## Reviewed source identity

| Source | SHA-256 |
| --- | --- |
| `backend/src/modules/notifications/registration.ts` | `a5d00ae101e94b43176c6593c8b3583f9760e042c9ff98655e1db9cc57a0e55e` |
| `backend/src/modules/notifications/email.ts` | `ad57b19b59108d0c3a2bd8816c138b12a11eb9d16d39172c7f6fe93b91fc805e` |
| `backend/src/modules/notifications/worker.ts` | `47bab2105579ced3fb7f5586554ebb20a256394ab58e169b794ba31890f0d5dd` |
| `backend/src/db/transaction.ts` | `bb9d5bfdb63f6a1f102926937d9e1fdfc49c55bf3431c92c7da93e9dfad196ce` |
| `backend/src/db/connection.ts` | `7b1292ece8b051301b284ded4fda2f5619e92817c378dd6e1cc5899950bcbdb2` |
| `backend/tests/notifications.test.ts` | `86aa3f3c1a9db26dc82d773b5b57f6353bda56b3e4e72df56ae8b2d0b23797ff` |
| `backend/tests/integration/notifications.test.ts` | `1cc18cd6bef5e41056ca82a3d16b748f3b3368068811b93fc007fb14fa445952` |
| `backend/tools/notification-worker.mjs` | `e831bfaa4b582d1249d16b049f4b24a444e3f1d4bacaf26b5cd0cfbd52722601` |
| `backend/tools/migrate-notifications.mjs` | `58811927f0a5a4352a1dee97e2f627c83f911390cb8f65b176841f40cc49fd8e` |
| `.env.example` | `88985bb00b2d8e57735785f74961573055cd670a8133e138d3481a887b47474d` |
| `ci-workspaces.json` | `1b1b6f4bb456dcd2002d0b7f750c631056f989b570171ae1f6c510fa4b8f1c67` |
