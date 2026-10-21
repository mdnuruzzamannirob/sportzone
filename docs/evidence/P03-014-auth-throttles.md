# P03-014 — Shared auth/recovery throttles and audit safety

**Date:** 21 October 2026\
**Executor:** Codex\
**Status:** Done; explicitly reviewed and accepted by project owner

## Scope and contract reconciliation

Next dependency-ready task after accepted P03-013; P03-007 and P03-012 prerequisites accepted. FR-01/FR-21, PRD security/privacy requirements; Architecture §9, Database §§5.8/10.3, API §4.9, Testing SEC-01/10/11/13 and Operations shared-auth rollout apply.

Previously each router created an independent process-memory IP counter. Multiple API instances/restarts could bypass those budgets, and CSRF bootstrap could create unbounded browser contexts. The task adds real shared application enforcement on the existing MongoDB infrastructure. No new service/package, public endpoint or client DTO is introduced. Policies and persistence contracts were recorded before implementation.

## Delivered behavior

- `auth/rate-limit.ts` centralizes policy and HMAC key construction. Active composition injects a shared MongoDB adapter into customer credentials, password recovery/change, verified email-change, admin credentials/recovery and CSRF bootstrap/refresh. Existing low-level standalone router adapters retain a bounded process guard; active runtime never falls back to it on store failure.
- Fixed minute windows: 60 requests per audience/network; credentials/recovery/email groups also 10 per network and 10 per supplied normalized email target. Target budgets span source addresses, without looking up whether an account exists. Audiences/groups are independent. Successful and failed attempts consume quota equally. Throttling does not suspend/change an account.
- Only socket network identity is trusted. Client Forwarded/X-Forwarded-For, role claims and other identity headers do not select buckets. Bounded target strings are trimmed/lowercased consistently before HMAC; raw target/network/proof/password never enters storage/logs.
- `auth/rate-limit-store.ts` owns `authRateLimits`: only HMAC digest `_id`, bounded saturated `count`, and fixed `expiresAt`; strict BSON validation and one TTL index plus built-in unique ID. Atomic majority writes enforce limits across independent instances; counter state survives object/process recreation. TTL is cleanup rather than reset authority; no business/audit collection is TTL-deleted.
- Explicit existing identity bootstrap adds the collection/index without deleting or rewriting existing users/sessions/challenges/contexts. HTTP startup and admission verify readiness, never repair state or implicitly recreate missing protection. Database errors/missing/mismatched protection fail closed with generic 503; quota denial yields generic 429 plus integer Retry-After. Earlier sequential quota consumption is not refunded after denial.
- Safe operational request audit events include fixed sensitive-action classification, HTTP outcome and fixed `securityReason` (`rate_limited`, `throttle_unavailable`) plus the server request ID. CSRF issuance is now classified too. No submitted identifiers, HMAC keys, emails, tokens, passwords, raw headers/body/query or DB diagnostics are added.
- Existing adaptive-password concurrency cap, strict inputs, Origin/CSRF, separate sessions, generic recovery responses/floor/cooldown, proof single-use and permission checks remain. No live email/provider or deployment acceptance is implied. Future transactional commerce `auditLogs` remains its domain requirement; security events here use the existing protected operational log pipeline.

Changed source: the two rate-limit modules, identity bootstrap/composition and affected route adapters, request logging/action allowlist. API, Database, Testing, Operations, README, TASKS and CHANGELOG are synchronized. Scripts/dependencies/lockfile/required CI check names are unchanged; existing Vitest discovery includes the two focused new test files.

## Verification evidence

Local Node 24.20.0/npm 11.19.0; generated isolated MongoDB 8.0.16 replica sets (`MONGOMS_DISTRO=ubuntu-24.04`), synthetic identities/HTTP fixtures. No external database URI, live account/provider or production data used.

| Commands | Observed results |
| --- | --- |
| `npm run test:unit --workspace backend -- tests/auth-rate-limit.test.ts tests/operations.test.ts tests/identity-contracts.test.ts` | Passed 122 cases: 10 new throttle/audit cases, 39 operations and 73 identity contracts. Temporary listener permission used. |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace backend -- tests/integration/auth-rate-limit.test.ts tests/integration/customer.test.ts tests/integration/recovery.test.ts tests/integration/email-change.test.ts tests/integration/admin-auth.test.ts tests/integration/browser-security.test.ts tests/integration/identity.test.ts` | Initial 172 cases: 152 passed, 20 bootstrap-related failures. Customer 18, email-change 27, identity 40 and initial shared quota 6 passed. |
| Same integration script with `tests/integration/browser-security.test.ts tests/integration/recovery.test.ts tests/integration/admin-auth.test.ts` | All 81 passed after correcting the standalone bootstrap adapter from credential budget 10 to documented bootstrap budget 60. No existing assertions weakened. |
| Same integration script with `tests/integration/auth-rate-limit.test.ts` | Final 7/7 passed after adding admission-readiness/removal coverage. Unchanged consumer results reused; combined unique integration cases 173. |
| `npm run lint --workspace backend`; `npm run typecheck --workspace backend`; `npm run build --workspace backend`; `npm run test:smoke --workspace backend` | Passed. Compiled smoke verifies sanitized configuration failures, real DB startup, public liveness, restricted readiness and shutdown. |
| `npm run lint:boundaries`; `npm run format:check`; `npm run lint`; `git diff --check` | Passed; actual output retained in session. |
| Full CI/all unrelated backend tests, frontend builds/browser suites, hosted/deployed checks | Not Run: scoped backend auth/persistence task with no frontend change; deployment remains separately verified. |

Shared-store tests verify exact 10 successes out of 30 concurrent requests across independent limiter objects, recreation retaining denial, target quota across networks, independent admin budget, fixed-window reset with old rows present, bounded saturation, strict validator, exact indexes, additive bootstrap preserving rows, no-creation runtime verification, and removal of live protection state failing closed. Actual runtime composition tests exercise two routers sharing counters, ignored forwarded IPs, no credential side effects after CSRF rejection/limit, Retry-After and missing-index startup failure. Unit tests cover malformed targets, normalization, capacity/reset/isolation, generic account-independent errors and unavailable-store audit/privacy safety.

Artifacts: [initial integration report](../../test-results/p03-014/integration-initial.json), [corrected bootstrap/recovery/admin report](../../test-results/p03-014/bootstrap-recovery-admin-final.json), [final shared-quota report](../../test-results/p03-014/shared-quota-final.json). Initial TypeScript fixture types for digest `_id` were corrected without casts or changing the schema. All required final checks pass; no known local failure is deferred to close this task.

## Rollout, limitations and review

Existing explicit local/test identity bootstrap prepares the additional ephemeral collection. Production schema/index rollout, protected collector/alert delivery, synchronized fleet clocks/secrets and verified proxy topology require operator/environment evidence, not this local test result. Old unguarded instances must be drained before claiming fleet enforcement. Behind an unreviewed proxy, socket identity can group users; do not trust arbitrary forwarded headers to bypass this. Fixed windows permit the documented boundary burst; target budgets temporarily constrain supplied addresses but never reveal account existence or persist account lockout.

Counter writes/metadata readiness reads add bounded MongoDB work to auth attempts; later measured tuning must preserve fail-closed semantics. If storage fails, protected auth availability is deliberately restricted. Prior-compatible rollback preserves all identities/proof/notification/audit records and can leave counters in place; an older build without shared enforcement needs traffic restriction/equivalent verified edge protection before reopening auth traffic.

Implementation and executor diff review complete. Owner acceptance below closes this task; M1 remains unapproved. No production migration, credentials or external action performed.


## Owner acceptance

On 21 October 2026, the project owner explicitly reviewed and accepted P03-014 through the evidence-linked popup: “Review করেছি—accept করছি, Done করো”. P03-014 is Done. Frontend integration, deployed proxy/collector verification and milestone acceptance remain their separate gates. This status-only update uses documentation/link checks; unchanged application tests are not repeated.
