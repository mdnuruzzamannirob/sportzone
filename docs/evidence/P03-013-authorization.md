# P03-013 — Ownership, role guards and safe action logging

**Date:** 20 October 2026\
**Executor:** Codex\
**Status:** Done; explicitly reviewed and accepted by project owner

## Scope and contracts

FR-01, FR-02, FR-21; Architecture §9; API §4; Database §§4.2/10.3; Testing SEC-02/03/06/07/10. Prerequisites P03-005/P03-012 are accepted. The next dependency-ready task is P03-013; this change does not implement P03-014 abuse controls or P03-015 frontend integration.

Current identity services already enforce cookie namespaces, active roles, strict DTOs and principal-owned embedded addresses. The identified gap was profile mutations not writing the authenticating credential inside their transaction: a simultaneous logout could commit without forcing the profile transaction to reauthorize. Email change already fenced its session but duplicated the principal checks.

## Implementation and review

- `auth/authorization.ts` rechecks the session/principal relationship, expected kind, fixed expiry, revocation, active role/status and security revision inside an active transaction. Missing/mismatched state returns generic AUTH_REQUIRED. Callers cannot use the helper outside a transaction.
- Mutations conditionally touch both credential and principal `updatedAt` with monotonic timestamps; concurrent logout or principal suspension/revision changes conflict, retry and reauthorize. Expiry does not slide. A business failure rolls these writes back. Sequential operations only; no external effects occur inside the transaction.
- Profile/address/deletion and email-change services share this boundary; profile/address reads use the same checks without timestamp writes. Existing nested address resolution remains within the authenticated user, so foreign and random IDs return the same 404. Owner/role/status fields remain rejected by strict inputs. Safe DTOs never serialize the selected internal security fields.
- Existing admin session access explicitly invokes the route-kind admin guard, backed by the service’s active-role check. Public admin signup remains absent. Existing login/recovery/Origin/CSRF contracts are unchanged; no protected admin-commerce mutation is fabricated.
- Existing request completion logs add a fixed `securityAction` and HTTP `outcome` for an allowlist of actual registered identity action patterns. They never record raw paths/IDs, body/query/header input, client role claims, passwords, email or proof material. Unmatched requests retain the original safe log without invented action classification. Server correlation remains authoritative.
- No dependency, public DTO, database schema/index/migration, frontend or financial state changes. Import direction and required CI check names/discovery are preserved. API, Database, Testing and Operations describe the new enforcement/log details.

Operational request logs do not substitute for append-only business audit events required by future privileged commerce mutations. Those mutations must authorize through their owning services and atomically record their domain audit facts when implemented. P03-014 remains the owner of broader security audit/throttle safety. This task’s acceptance covers the currently implemented identity surface and shared enforcement capability, not unbuilt orders/refunds or deployed security certification.

## Verification

Environment: local Node 24.20.0/npm 11.19.0, MongoDB 8.0.16 isolated generated replica-set databases (`MONGOMS_DISTRO=ubuntu-24.04`), synthetic identities and HTTP fixtures. No external database URI, provider, production account or customer data used.

| Commands | Observed result |
| --- | --- |
| `npm run test:unit --workspace backend -- tests/operations.test.ts tests/profile.test.ts tests/email-change.test.ts tests/admin-auth.test.ts` | Three unchanged-input suites passed (52 cases); operations initially blocked by sandbox listener EPERM. |
| `npm run test:unit --workspace backend -- tests/operations.test.ts` with local listener permission | All 39 operations cases passed, including four new fixed-action/outcome/privacy checks. Combined unique scoped unit cases: 91. |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace backend -- tests/integration/authorization.test.ts tests/integration/profile.test.ts tests/integration/email-change.test.ts tests/integration/admin-auth.test.ts` | Profile 26, email-change 27, admin-auth 22 passed. New guard suite initially 11/12: expired fixture violated the stored issuance invariant. |
| Same integration script with `tests/integration/authorization.test.ts` | 12/12 passed after using the guard clock at the valid stored expiry boundary instead of corrupting expiry. Schema validation was retained. |
| Same integration script with `tests/integration/authorization.test.ts tests/integration/profile.test.ts` | Final guard suite 13/13 plus profile 26/26 passed after adding the read-only/no-metadata-write path. Combined unique scoped integration cases: 88; earlier unchanged email/admin results reused. |
| `npm run lint --workspace backend`; `npm run typecheck --workspace backend`; `npm run build --workspace backend`; `npm run test:smoke --workspace backend` | Passed. Backend smoke checks compiled real-DB startup, sanitized configuration failures, liveness/restricted readiness and shutdown. |
| `npm run lint:boundaries`; `npm run format:check`; `npm run lint`; `git diff --check` | Passed; source boundary inventory 113 files. |
| Full CI, all unrelated backend suites, frontend builds/browser suites, deployment/provider checks | Not Run: scoped backend authorization change; no affected frontend code or provider integration. |

Specific negative/race checks: wrong role, forged principal/session pair, missing transaction, expired/revoked credentials, suspended/role-changed/revision-changed principals, logout between authentication and mutation, forced concurrent session/principal revocation with observed transaction retry and forbidden user-write absence, failed-business rollback, unchanged expiry, read-only metadata preservation, cross-account address mutation/default/delete, strict owner/role input and admin/customer cookie substitution. Existing email/proof/concurrent-reset regression assertions remain intact.

Local artifacts: [initial integration report](../../test-results/p03-013/integration-initial.json), [corrected guard report](../../test-results/p03-013/authorization-final.json), [final guard/profile report](../../test-results/p03-013/guard-profile-final.json). Initial static checking also caught an exact-optional-property mismatch in the log event; fixed by adding classification only when present. Formatter invocations were corrected to use the backend configuration/actual CLI flags; no configuration migration or unrelated bulk formatting was performed.

## Risks and handoff

Conditional writes add bounded transaction contention for concurrent mutations from the same principal; the replica tests demonstrate retry/reauthorization. Read requests avoid those writes. No migration is required. Rollback is the prior compatible backend build; do not undo legitimate session revocations or business history. Real deployed origins, protected log collection/retention, shared abuse controls, future domain authorization and M1 acceptance remain their owning gates.

Implementation and executor diff review are complete. The independent owner acceptance below closes this task; no milestone is self-approved.


## Owner acceptance

On 20 October 2026, the project owner explicitly reviewed and accepted P03-013 through the evidence-linked popup: “Review করেছি—accept করছি, Done করো”. P03-013 is Done. P03-014, frontend integration, deployed security and milestone gates remain separate. This status-only update required documentation/link checks, not repeating unchanged application tests.
