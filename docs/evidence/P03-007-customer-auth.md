# P03-007 — Customer registration, login and logout

**Date:** 19 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent task acceptance:** Project owner, 19 October 2026: “Customer authentication implementation গ্রহণ করছি”

## Scope and authority

[Task](../TASKS.md#phase-03--authentication-and-core-backend), PRD FR-01/FR-20, Architecture §§7/9/11,
Database §§5/10/12, API §§4/9 and Testing API-01/SEC-01–05 govern this slice. P03-005/006 are accepted prerequisites.
The project owner accepted the proposed new-password policy on 19 October 2026: “এই password policy গ্রহণ করছি”.
It permits 12–128 Unicode characters and at most 512 UTF-8 bytes, including spaces, without password normalization.
Malformed Unicode is rejected, not normalized into a different password.

## Delivered behavior

| Area | Behavior |
| --- | --- |
| Passwords | Asynchronous versioned scrypt N=131072/r=8/p=1; 16 random salt bytes, 64-byte key, fixed 256 MiB maxmem; exact encoded cost/version/length; timing-safe comparison, equal-cost dummy derivation and two-KDF process admission cap |
| Registration | Strict DTO, normalized email, forced customer/active role, approved password policy; account + one retryable notification intent + context consumption commit together; no automatic login or delivery claim |
| Notification ownership | Separate notifications-owned service, strict registration-only BSON subset, unique event key and retry-queue index; no password, session, challenge or proof URL in payload |
| Login | Verify outside transaction, then conditional active customer credential/revision/timestamp write, single-use context consumption, session issuance and same-owner predecessor revocation in one transaction; cookie only after commit |
| Account | Customer session only; explicit allowlist without password, role, security revisions or token verifiers |
| Logout | Current session-bound CSRF or fresh anonymous context, exact Origin, route-kind revocation and matching clear-cookie policy; fresh anonymous CSRF after durable writes; expired/repeated logout remains safe |
| Abuse controls | 10 attempts/60 seconds per socket address across register/login/logout; bounded 10000-entry process map, ignored forwarded headers, bounded KDF work; distributed/release controls remain P03-014 |
| Runtime | CUSTOMER_AUTH_ENABLED defaults false; true requires explicit session/context policy and verifies all identity/outbox validators/indexes before listener startup; no implicit migration |
| Local setup | Explicit additive local/test bootstrap tool; production/incorrect existing validators are refused; rollback disables exposure without deleting identity or notification state |

## Verification

Environment: Node 24.20.0, npm 11.19.0, owned MongoDB 8.0.16 replica and local browser/HTTP fixtures. Full CI ran from
`2026-10-19T12:56:07.495Z` to `2026-10-19T12:59:18.021Z`.

| Command/check | Observed result |
| --- | --- |
| `MONGOMS_DISTRO=ubuntu-24.04 SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-browser-libs/webkit.sh npm run ci` | Passed; all 20 configured commands, 432 unit/component tests (209 backend), 138 real MongoDB/runtime integration cases, 30 browser regressions, three builds and seven HTTP smoke groups |
| Added credential cases | Passed; 11 unit/configuration/KDF cases and 18 real MongoDB/customer HTTP cases |
| Normal enabled server | Passed; real bootstrap request after prepared validator/index checks; removing required retry index rejects startup before serving; default-disabled runtime smoke remains Passed |
| Bootstrap production refusal | Passed; compiled tool invoked with valid synthetic production configuration and unreachable synthetic URI, refused immediately with generic message and exit 1 before DB access; no production migration attempted |
| `npm run lint`, `git diff --check`, task/source integrity checks | Passed; references/structure, 171 unique task IDs, checkbox/status consistency, scoped task change and reviewed hashes |
| Real email delivery/verification, administrator login, deployed browser cookie domains, distributed rate limits, production rollout, hosted CI and operator/milestone acceptance | Not Run/outside this slice; no successful outcome claimed |

Artifacts: ignored generated `test-results/ci.json`, `test-results/database.json` and `test-results/ui-report.json`.
Lockfile SHA-256: `fb2dacb33edaf9d030808b2ace7e037eafc40e2aef9b4c86f5868461cbb03236`.
The browser report has 30 expected and zero skipped/unexpected/flaky cases. No browser assertions or retry policy changed.
The earlier focused filtered run passed selected cases and skipped unrelated ones; only the complete final suite is used
for full CI evidence. A child-process bootstrap probe was denied by sandbox EPERM; direct controlled invocation verified
the expected refusal. No actual local user database was bootstrapped by this task.

The password-policy requirement is in API §9.3 (the approval question mistakenly referenced §9.4); the approved policy
itself is unchanged and recorded in API §4.6. Policy approval is distinct from task acceptance.

## Boundaries and review

This is backend API work; no frontend auth form is claimed. Registration notification is queued, not delivered; email
verification/challenge issuance and provider transport remain P03-009/010 and their notification tasks. Administrator
credentials, profile/address functionality, shared abuse controls, deployed-browser cookie acceptance, production
rollout/migration and M1 remain separate tasks/gates. The registration BSON subset requires reviewed backward-compatible
expansion before future notification event types are enabled. No dependency/package/CI script change was needed.

The project owner accepted this task on 19 October 2026 under [AGENTS §13](../../AGENTS.md#13-task-completion--reporting).
This task acceptance does not approve milestone, operator or provider gates.

## Technical sources

[Node 24 crypto documentation](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)
describes the asynchronous scrypt API, explicit memory/cost controls and random salt guidance.
[OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
provides the selected scrypt cost alternative. These sources support implementation choices, not project/runtime acceptance.

## Reviewed source identity

| Source | SHA-256 |
| --- | --- |
| `backend/src/modules/auth/passwords.ts` | `ba6f48b7809e110c7628211b90ea2bcf3e9d5faf97c7da7b3d6621946ba15e6f` |
| `backend/src/modules/auth/customer.ts` | `19c77502b2745220a8914ba2ab4c9d21a5417f9396ff6c57bfb70d915d89cdc8` |
| `backend/src/modules/auth/customer-routes.ts` | `9e675f9dc7e4e4fdf6e2b5c34b7fdb40a758bb88e63f39bbdf7ea658f42d24bc` |
| `backend/src/modules/auth/composition.ts` | `b2240357a965dcafcaca6e956660062fc189f40468c0732a51279ead580f4d76` |
| `backend/src/modules/auth/sessions.ts` | `655af844a1ceacadcd9e7fd13afc58c94e97279b4f5ed54c31f13c57192b6cda` |
| `backend/src/modules/notifications/registration.ts` | `05d67af4a788841bb809f29a7a69dfebc7f03c3032c42b5da12adc2a5faa68dc` |
| `backend/src/server.ts` | `d0762af065cfad8d73b39687537ad437f5a4eb3371001bc27b36de9c0f330b46` |
| `backend/src/config/environment.ts` | `4b8d50704a66aec8e632e0b56c020f881b9a81861c4834f4efe3c4ce3e7afa45` |
| `backend/tests/passwords.test.ts` | `8a82af252af2b7ae030c61d77a850ca8ca1b44ae2756874c9ed407f2fff112c7` |
| `backend/tests/integration/customer.test.ts` | `3ead3c9deca2be3fa6bcd1aff9a8679bd48a281776ccf34bd2d2be9daba9f552` |
| `backend/tools/bootstrap-identity.mjs` | `cf2c8744a9c72229152e784987a38c97ed2c2c40972f611b79961a622033b627` |
