# P03-020 — Backend module ownership and file conventions

**Date:** 21 October 2026\
**Executor:** Codex\
**Status:** Done; independently accepted by the project owner on 21 October 2026

## Scope and contract reconciliation

P03-019 is accepted. Architecture §6, Database §4.2, API §2.2 and Testing §15.5 require one canonical registration
per collection, narrow cross-module capabilities and parity rather than a data migration. This task implements
those boundaries for existing auth/customer/delivery/notification/email code only. Public API namespaces, DTOs,
collections/indexes, secrets/environment names, required CI checks and operator command paths remain unchanged.
Unimplemented catalog/commerce/provider modules were not scaffolded, renamed or represented as complete.

## Delivered boundaries

- **Auth** owns the sole `auth.model.ts` user/session/challenge/context registration and canonical
  `identity.persistence.ts` BSON/index/bootstrap/admission behavior. Session, credentials, administrator,
  browser security, recovery/email, proof, throttle, DTO and composition files use entity-prefixed responsibilities.
- **Customers** owns `customer.validation.ts`, `customer.service.ts`, `customer.routes.ts`: profile/address/
  deletion-intake validation and operations. It receives no foreign model, connection or user document.
- Auth's **customer-account capability** authenticates, reauthorizes and fences the owner inside the coordinating
  transaction. It supplies detached profile data and narrow save/view functions. Saves explicitly persist only
  name, phone, bounded addresses and new verified deletion intake; supplied email/role/status/credential/security
  fields are ignored. Existing deletion review metadata stays intact. Read-only or completed transaction scopes
  cannot save. Callback failure rolls profile changes and authorization fences back together.
- **Delivery** owns the existing coverage read service, with the same effective-rule selection, fallback and
  fail-closed coverage behavior. The now-empty transitional settings directory was removed, without inventing
  a delivery DTO/endpoint or registering another schema.
- **Notifications** owns durable intents/claims/retries in `notification.service.ts`, batch behavior in
  `notification-worker.service.ts`, and provider-neutral message/outcome interfaces in `notification.types.ts`.
  **`integrations/email/resend.adapter.ts`** owns fixed provider transport. **`config/notifications.ts`** owns
  explicit activation/email/retry settings. Unknown-send, timeout, response bounds and external-effect guards
  are preserved; no network operation enters a database transaction.
- Root/feature composition, tests, tools and the isolated browser fixture import the new source/compiled paths.
  Existing NodeNext `.js` specifiers, test locations/discovery and CLI paths remain. No compatibility barrels,
  duplicate models, empty templates or parallel legacy implementations were added. Obsolete generated outputs
  for the moved modules were removed before compiled/runtime verification, preventing stale-path fallbacks.
- The existing private-persistence boundary now recognizes `.persistence.ts` in addition to `.model.ts` and
  legacy names. TOOL-05 verifies rejection rather than adding an exception for the new layout. Backend inventory
  metadata records P03-020; all required check names remain present and fail-closed.

The narrow capability keeps transaction ownership and credential fields in auth while customers retains business
validation/coverage. Saved addresses are detached DTOs and are converted back to canonical ObjectIds by auth;
owner identity is always bound to the verified private document, never a supplied profile ID. Existing address
limits/default concurrency, nested-owner denial, history preservation and deletion-intake semantics remain.

## Preservation evidence

[Source move inventory](../../test-results/p03-020/source-moves.json) records the implemented file moves.
[Schema/provider body comparison](../../test-results/p03-020/persistence-provider-parity.json) independently
compares original HEAD content against current files:

| Implementation | Observed comparison |
| --- | --- |
| Canonical auth model registration | Identical except import specifiers; no schema/collection/index changes |
| Identity BSON/bootstrap/readiness | Identical except import specifiers; no validator/index repair at HTTP startup |
| Durable notification intent/claim service | Identical except import specifiers; no lease/fencing/retry changes |
| Resend `createResendAdapter` | Function body identical; same fixed URL, headers, bounded response, no redirects and uncertain-outcome rules |
| `createNotificationWorker` | Function body identical; same claims, proof handling, retry/disposition and outside-transaction guard |

Customer profile validation was extracted intact; business operations now use the narrow capability rather than
foreign documents. Actual replica-set/HTTP tests below establish runtime parity beyond file comparisons.

## Observed verification

Node 24.20.0/npm 11.19.0; synthetic accounts, MongoDB 8.0.16 isolated replica sets
(`MONGOMS_DISTRO=ubuntu-24.04`). No external database/user/provider account or production data used.
Unchanged frontend builds use the existing synthetic API origin; the fixture runs the actual composed API over
local TLS, with private IPC for proofs and no authentication network traces/automatic failure screenshots.

| Commands/checks | Observed result |
| --- | --- |
| `npm run test:unit --workspace backend` | Passed all 331 existing unit/contract cases after moves/provider extraction. |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace backend -- tests/integration/profile.test.ts tests/integration/authorization.test.ts` | Initial focused 39/39 passed: existing profile/address ownership, validation, concurrency and revocation assertions retained. |
| Same script with `tests/integration/profile.test.ts` | Passed 29/29, including three new capability cases for detached/whitelisted state, read-only/escaped scopes and coordinated rollback. |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace backend` | Final 285/285 passed across 15 suites: exact BSON/indexes, transactions, session/CSRF/Origin, recovery replay/races, email/admin/ownership, notification claims/provider guards and real compiled operator paths. |
| `npm run lint --workspace backend`; `npm run typecheck --workspace backend`; `npm run build --workspace backend` | Passed. Initial optional-address-field typing and transitional extraction import diagnostics were corrected without casts or suppressed checks. Final lint inspected 92 files. |
| `npm run test:smoke --workspace backend` after obsolete output cleanup | Passed compiled startup redaction, real database connection, liveness/restricted readiness and graceful shutdown. |
| `npm run test:unit` at root | Passed 34/34 CI/tooling cases. TOOL-05 additionally proves entity-prefixed persistence remains private. |
| `SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-p03-browser/webkit.sh npm run test:ui -- tests/ui/authentication.spec.ts` | Passed 6/6 in Chromium/Firefox/WebKit, zero skips/retries/failures: real registration/login/account/address/recovery/password/email, customer/admin separation, expiry/suspension and private cache flows. |
| `npm run test:security` | Passed; zero repository/history findings, zero dependency advisories and no exceptions granted. |
| `npm run lint:boundaries`; `npm run format:check`; diff review | Passed; 136 source files and zero boundary errors. No allowlist bypass or required-check removal. |

The compiled operator preflight fixture now explicitly sets the actual `EMAIL_DELIVERY_ENABLED=false` flag,
replacing its ineffective `EMAIL_ENABLED` key, so inherited sender configuration cannot activate real email in
that check. Bootstrap/migration/provisioning, connection cleanup and safe stderr/stdin assertions remain.
The provider integration tests use controlled local transport; they do not prove a live sender/inbox.

Artifacts: [initial profile/ownership log](../../test-results/p03-020/profile-initial.log),
[capability report](../../test-results/p03-020/capability-final.json),
[331 unit results](../../test-results/p03-020/unit-initial.log),
[285 integration assertions](../../test-results/p03-020/integration-final.json),
[integration log](../../test-results/p03-020/integration-final.log),
[compiled smoke](../../test-results/p03-020/smoke-final.log),
[34 tooling cases](../../test-results/p03-020/tooling-final.log),
[browser report](../../test-results/p03-020/browser-auth-final.json),
[browser log](../../test-results/p03-020/browser-auth.log),
[security report](../../test-results/p03-020/security-final.json).

## Documentation, rollout and disposition

Architecture/Database describe implemented ownership and the narrow shared-user capability; API keeps existing
namespaces and DTOs; Operations/README update current source/provider paths and unchanged CLI commands; Testing
records the added boundary assertions. Historical evidence paths/hashes remain historical. No unresolved contract
conflict or known local failure is deferred to close the task.

Build/deploy all backend modules together from current source. No schema/data/index migration, credential/key
rotation, quota reset or notification resend is needed. Rollback restores the previous compatible complete backend
artifact and environment, preserving all record IDs, validators, credentials, outbox/audit and historical snapshots.
Internal moved source paths are not public compatibility entry points.

Not Run: full CI/unrelated frontend unit/build/showcase suites, new hosted/protected-main readback, deployed
TLS/proxy, live email/provider activation and production operations. Verification is change-based: all backend
consumers, affected tooling and real API browser flows; frontend outputs are unchanged and reused. No future
commerce, legal/provider or deployment gate gains acceptance here.

## Owner acceptance

On 21 October 2026, the project owner selected “Review করেছি—accept করছি, Done করো” in the review popup after reviewing the implementation and verification summary. Executor: Codex; independent reviewer/approver: project owner.

P03-020 is Done. Phase 03 is 20/20 Done; overall: 51 Done and 128 Not Started. Existing verification evidence is retained; only repository documentation checks are repeated for this acceptance update.

M1 remains Not Accepted and requires a separate technical/QA approval. This task acceptance does not accept hosted, live-provider or production gates.
