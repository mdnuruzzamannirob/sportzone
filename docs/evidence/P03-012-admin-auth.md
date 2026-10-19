# P03-012 — Private administrator provisioning, login and recovery

**Date:** 19 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner accepted on 19 October 2026: “Private admin authentication implementation গ্রহণ করছি”

## Scope and authority

Implements [P03-012](../TASKS.md), FR-21, [API §9.1](../API.md#91-authentication-and-account-endpoint-contracts), [Database §5.3](../DATABASE.md#53-authchallenges--verification-and-recovery), Architecture §9 and Testing SEC-01/03/04/05/10. Dependencies P03-005/006/009 are accepted. Existing customer credential/proof primitives are reused with a backend-selected admin scope; public inputs cannot select role, cookie or audience. The accepted password policy and customer reset/email-change formats remain compatible.

## Delivered behavior

- Private initial provisioning validates name/email/password and inserts an active admin with an adaptive hash. It never upgrades a customer, replaces a credential or exposes signup. A reserved initial _id serializes concurrent different-email provisioning through the existing unique index; occupied email/reserved ID/existing admin refuses all writes. Local/test CLI reads bounded noninteractive stdin, verifies strict persistence read-only and prints no credentials. Production/staging convenience execution is refused; no real administrator was provisioned outside isolated fixtures.
- `/admin/auth/login` uses admin context/Origin, strict credentials, rate limits, active admin role and conditional password/security-revision guards. Successful login consumes the context and issues/rotates only admin session/CSRF/cookie in one transaction. Customer registration stays customer-only; the admin-selected factory explicitly refuses registration. No `/admin/auth/register` route exists.
- `/admin/auth/session` accepts only an active admin credential and returns the Account allowlist. Logout revokes only the supplied admin session, clears only that cookie and supplies a fresh admin context/CSRF; repeat/expired-session logout still requires admin browser protection. Customer credentials/contexts cannot substitute.
- Admin password-reset issuance returns generic acceptance, has independent cooldown/TTL/response floor and persists a timed challenge plus durable reference-only notification. Purpose remains password_reset; verifier and AEAD are admin-separated, so a customer-issued proof cannot reset an admin even after a private role change. Confirmation consumes context/proof, updates password/security/scope revisions and revokes admin sessions atomically, without login or account reactivation. Expired, reused, invalidated, ineligible or cross-namespace proofs fail. Unrelated customer identities/sessions remain untouched.
- The one-batch worker uses an admin-password-reset-v1 renderer and fixed HTTPS ADMIN_ORIGIN. Disabled admin rendering does not claim admin intents. Stable event/proof identity survives known rejection retries; uncertainty stops resend. Existing proof envelope cleanup/key-loss/tamper rules apply. Additive notification migration recognizes the exact P03-011 predecessor and preserves prior records; no identity schema/index, package or lockfile change is introduced.
- ADMIN_AUTH_ENABLED defaults false and can activate without customer authentication. Explicit session/context and admin recovery policy plus protected proof keys are required. Runtime mounts the verified identity composition when either credential namespace is active; customer credential/profile routes remain disabled when customer activation is false. A read-only persistence verifier is shared by composition and private provisioning; HTTP startup never creates collections/indexes or runs migrations.

## Verification

Environment: Node 24.20.0/npm 11.19.0; generated isolated MongoDB 8.0.16/WiredTiger replica set, synthetic credentials/destinations/keys and in-memory email adapter. No external database, live provider send or deployed administrator account is used.

| Command/check | Observed result |
| --- | --- |
| `npm run typecheck --workspace backend`, `npm run lint --workspace backend`, `npm run build --workspace backend` | Passed |
| `npm run test:unit --workspace backend` | Passed: 314 cases, including 14 new admin configuration/proof-isolation cases |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace backend -- --run tests/integration/admin-auth.test.ts` | Passed before final concurrency additions: 19 cases including compiled private CLI |
| Focused admin reissue/login rollback/login-reset race run | Passed: three additional cases; unrelated cases filtered, not full-suite evidence |
| `MONGOMS_DISTRO=ubuntu-24.04 SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-browser-libs/webkit.sh npm run ci` | Passed; all 20 configured commands, 537 unit/component cases (314 backend), 260 real MongoDB/runtime integration cases, 30 browser regressions, three builds and seven HTTP smoke groups |
| `npm run lint`, `git diff --check`, task/source integrity audit | Passed; document/link/status consistency, actual diff/contract review, preserved existing Markdown formatting edits, unchanged dependency/lockfile identity and reviewed source hashes |
| Real administrator production provisioning, live sender/inbox, hosted CI, deployed ingress/browser/TLS, secret-store/restore/audit rollout and milestone approval | Not Run; separate operator/security/release gates |

Coverage includes one-time/concurrent provisioning, occupied customer/weak input/role injection rejection, public signup absence, cookie/context namespace isolation, safe account projection, generic login/recovery failures, context replay and predecessor rotation, repeated/expired-cookie logout/recovery, atomic reset/replay/expiry/session revocation, customer proof after role change, reverse proof namespace rejection, reissue/cooldown concurrency, failed issuance/revocation rollback, concurrent old-password login/reset, stable admin delivery retry/uncertainty, disabled renderer exclusion, strict Origin/CSRF/query/abuse controls, independent actual router composition, exact-predecessor migration and bounded stdin/replay/oversize/production CLI guards.

Generated artifacts (ignored): `test-results/ci.json`, `test-results/database.json`, `test-results/ui-report.json`. Final CI: 2026-10-19T14:50:36.680Z–2026-10-19T14:54:40.017Z; all 20 commands Passed. MongoDB report: 260 Passed, zero Failed/Pending. Browser report: 30 expected, zero skipped/unexpected/flaky. Lockfile SHA-256: `7b8c507181a5c5f9a132b4050b23239db3b4b407e266aef710b536e61772dac6`. Final documentation/status edits were separately linted and audited.

## Review and operational boundaries

No public administrator signup, customer privilege upgrade, shared/default password, financial mutation or new challenge-purpose enum is introduced. Existing request logging and local throttles are foundations; comprehensive audit/shared ingress work remains with its owning security task. Production initial provisioning requires authorized operator custody and reviewed persistence, rather than the local/test convenience command. Live email delivery, deployed cookie behavior, migration/restore/key custody and frontend admin screens are not proven by these fixtures. The migration requires compatible rollout/rollback; preserve expanded notifications/claims/receipts and do not blindly resend uncertain proofs. See [administrator operations](../OPERATIONS.md#private-administrator-provisioning-and-recovery).

Project-owner acceptance was recorded on 19 October 2026 under [AGENTS §13](../../AGENTS.md#13-task-completion--reporting): “Private admin authentication implementation গ্রহণ করছি”. This task acceptance does not approve milestone, operator or provider gates.

## Reviewed source hashes

| Source | SHA-256 |
| --- | --- |
| `backend/src/config/environment.ts` | `745265bb40b9f116ab73da48247f90f6c353cc9dae19ef91c43b7ab78d8f671b` |
| `backend/src/config/recovery.ts` | `c91e3300aad1b32e30e779e55c3220382571f6ca2dc15e578e73598165f620f7` |
| `backend/src/modules/auth/admin-routes.ts` | `5dc19111fdd6a7bdc8bf7e75148e0f8bffe73b7ee528f4fedf951359113f6664` |
| `backend/src/modules/auth/provision-admin.ts` | `3db6890d872368df35bc53bf77a9d171725d3b5a085af9ab5150b8ada39fe320` |
| `backend/src/modules/auth/customer.ts` | `817207177a42a3608e14d2eabc8d9a58330991740c435854599e52f28295a572` |
| `backend/src/modules/auth/customer-routes.ts` | `65e97fcd1029efd870edc4eeb78bb800060cda8e6243579249164f8008b6868e` |
| `backend/src/modules/auth/recovery.ts` | `87b2337a08c9c86400e4e2d37682627a4768ddfdad3dff23d506eaa16040b123` |
| `backend/src/modules/auth/proof-envelope.ts` | `97f717439e18fe79d5c6fbe5f02b8be873ad222727bc9be41acc75722513835a` |
| `backend/src/modules/auth/proof-delivery.ts` | `9e680006e1cd90139d0370bbbb3a678dc4ae5735bd63bc928e17c55195432bd1` |
| `backend/src/modules/auth/composition.ts` | `4ab9f6913b2802891cb9d0135cd2970bee60ff1f250ac33911df4f28153ec2fe` |
| `backend/src/modules/auth/collection-validators.ts` | `62834111a73668e054923efbdd0719965fc6eee2de7df1404e13bfc025535564` |
| `backend/src/modules/notifications/registration.ts` | `802505459f19be4c0e48526b44f450ecc7562a3cfbb56a8023d0623e6253c8e4` |
| `backend/src/modules/notifications/worker.ts` | `953294e6d4457e124e5cd7097dd24fc97cfdc3c80957498c3c5823d29a5318e7` |
| `backend/src/server.ts` | `d9e569af6578cef3a4fd887fcfd7ac1a456efa9c33b8f13de4533cdd72908328` |
| `backend/tools/provision-admin.mjs` | `c888efb48d5a1ce93dcd5ef1503c87cd7981830ad11044fdd8da99be991825eb` |
| `backend/tools/notification-worker.mjs` | `1486121f3129e1347c0caf903998849cb656782cb1ae7977373f508dd2f8a998` |
| `backend/tests/admin-auth.test.ts` | `ba6e65a9336874ba80f5d83be9ed0ff33223fed3ad8a443a18aa3af19b647e34` |
| `backend/tests/integration/admin-auth.test.ts` | `2cab02db2071214a16fcc99d6e03e93fa9dd13b6bd0d8e2304af89a77e78428a` |
| `docs/API.md` | `666dcab887508ee974c6b27f8c4595711148dba9aad005e6fbd27156227eb376` |
| `docs/DATABASE.md` | `ac24d2e317f558e806d16e80f14ad939c22a83913561d4a03c9085c9d0beb296` |
| `docs/OPERATIONS.md` | `855d13bfdb660bcb4a71b2293fe5b931c87b7171faa969752579029945e2f1c6` |
| `docs/TESTING.md` | `908ffab81b5b3856028d689f7398e100053cd63555404e8a24ff6487113ff874` |
