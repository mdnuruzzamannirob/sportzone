# P03-011 — Verified customer email change

**Date:** 19 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner accepted on 19 October 2026: “Verified email-change implementation গ্রহণ করছি”

## Scope and authority

Implements [P03-011](../TASKS.md), FR-02, [API §9.1](../API.md#91-authentication-and-account-endpoint-contracts), [Database §5.3](../DATABASE.md#53-authchallenges--verification-and-recovery), Architecture §§6/9 and Testing ACC-02/SEC-03/SEC-05/SEC-10. Dependencies P03-008/P03-009 and the reused P03-010 recovery implementation have project-owner acceptance. No password policy, account role, financial rule or historical order contract changes.

## Delivered behavior

- Customer-only `POST /me/email-changes` accepts strict `{newEmail}`, normalizes the destination and requires approved Origin/session CSRF. A transaction repeats session/active-customer/security-revision checks and conditionally touches the credential to serialize with logout. The current email remains authoritative. Issuance advances the email-change scope, removes predecessor envelopes, and persists one timed challenge plus one reference-only email-change intent. Cooldown and occupied-target suppression return the same `{verificationSent:true}` without asserting delivery or address availability; same-current-email requests return STATE_CONFLICT. Suppression leaves an existing challenge unchanged.
- `POST /me/email-changes/confirm` requires both a current owning customer session and a high-entropy single-use proof. Purpose, owner, active status, expiry, attempts and scope revisions are rechecked under the transaction. Confirmation atomically changes the unique email, marks the destination verified, advances security and identity-challenge revisions, removes pending envelopes and revokes customer sessions. Response is the Account allowlist; the cookie is cleared and the customer must log in again. No replacement session or undeclared CSRF response is introduced.
- Unique-email conflicts abort the entire transaction, including proof consumption and session changes. Concurrent customers claiming the same target produce one success and one conflict. Concurrent consume/reissue/logout/reset cannot leave a predecessor usable. Password reset/change invalidate pending email-change/verification challenges only when the credential change succeeds; merely requesting a reset cannot cancel an authenticated email change.
- Proof delivery reuses the versioned AES-256-GCM/key-ring machinery. Email-change digests and authenticated data are purpose-separated; AAD binds the original identity plus new target. Exact prior reset envelope/digest encoding is preserved and tested. Notifications carry challengeId only, send to the bound target and render `/account/email-change#token=…` against the fixed HTTPS storefront origin. No proof, rendered URL, ciphertext or key enters the outbox.
- The worker claims email-change-v1 only when its separate renderer is enabled. Known provider rejection retries keep the same proof/event key; uncertainty is not blindly resent. Tampered/lost-key, stale-scope, changed-identity, expired, consumed or superseded material fails closed before a provider call. Bounded cleanup removes expired/inactive envelopes independently of TTL deletion.
- EMAIL_CHANGE_ENABLED defaults false and is independent of password recovery. Explicit TTL/cooldown/response-floor policy and protected shared proof keys/HTTPS origin are validated before startup. The existing separate worker/local migration commands are extended; no package, lockfile, identity schema/index or frontend change is introduced. Additive notification migration recognizes exact known predecessors, including P03-010, preserves existing records and refuses unknown validators. HTTP startup never migrates.

## Verification

Environment: Node 24.20.0/npm 11.19.0; generated isolated MongoDB 8.0.16/WiredTiger single-member replica set; synthetic accounts, destinations, keys and in-memory email adapter. No real provider email or externally supplied database is used.

| Command/check | Observed result |
| --- | --- |
| `npm run typecheck --workspace backend`, `npm run lint --workspace backend` | Passed |
| `npm run test:unit --workspace backend` | Passed in final CI: 300 tests, including 17 new email-change/configuration/compatibility cases |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace backend -- --run tests/integration/email-change.test.ts tests/integration/recovery.test.ts` | Passed before final concurrency additions: 53 cases (25 email-change and 28 recovery) |
| Focused reset/reissue concurrency run | Passed: two new email-change race cases; 25 unrelated cases filtered, not full-suite evidence |
| `MONGOMS_DISTRO=ubuntu-24.04 SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-browser-libs/webkit.sh npm run ci` | Passed; all 20 configured commands, 523 unit/component cases (300 backend), 238 real MongoDB/runtime integration cases, 30 browser regressions, three builds and seven HTTP smoke groups |
| `npm run lint`, `git diff --check`, task/source integrity audit | Passed; relative links/structure, scoped task/status audit, diff review, unchanged dependency/lockfile identity and reviewed source hashes |
| Real sender/inbox delivery, hosted CI, production migration/key-store/restore, deployed shared ingress/timing and frontend email-change screen | Not Run; separate feature/operator/release gates |

The real HTTP/replica suite covers normalization, unchanged unverified identity, private projections/reference-only outbox, owning-session proof confirmation, session invalidation, duplicate-target races, post-issuance conflicts, replay/reissue/cooldown, wrong owner/purpose, expiry/TTL lag, transactional outbox/revocation failure, stable retry/uncertainty, target/key/scope tamper, cross-purpose invalidation, login identity switch, preserved saved addresses, Origin/CSRF/input/abuse rejection, concurrent logout/reset/reissue, independent activation through the actual customer composition and additive migration preserving predecessor rows. Historical order modules are neither imported nor written; this is not a claim of unimplemented commerce-flow runtime acceptance.

The first focused run caught reset-email issuance prematurely invalidating an email-change challenge. Invalidation was restricted to reset scope on issuance and extended across identity purposes only on successful password change/reset. The original failing assertion then passed unchanged. The final full suite includes that regression; no skips or weaker assertions substitute for it.

Generated artifacts (ignored): `test-results/ci.json`, `test-results/database.json`, `test-results/ui-report.json`. Final CI: 2026-10-19T14:04:49.535Z–2026-10-19T14:08:29.226Z; all 20 commands Passed. MongoDB report: 238 Passed, zero Failed/Pending. Browser report: 30 expected, zero skipped/unexpected/flaky. Lockfile SHA-256: `7b8c507181a5c5f9a132b4050b23239db3b4b407e266aef710b536e61772dac6`. Final documentation/status edits were separately linted and audited.

## Review and operational boundaries

This is backend API/persistence/delivery-renderer acceptance. Live sender/inbox, production migration, protected key custody, restore exercises, shared ingress controls and frontend screens remain separate gates. The configurable response floor reduces ordinary timing differences without promising constant-time network responses. Provider acceptance is not inbox delivery; an already dispatched invalidated link cannot authorize a change. Compatible rollout/rollback retains expanded records and receipts; no destructive validator downgrade or blind retry is permitted. [Operations](../OPERATIONS.md#verified-email-change-activation-and-recovery) owns activation, reconciliation and rollback procedures.

Project-owner acceptance was recorded on 19 October 2026 under [AGENTS §13](../../AGENTS.md#13-task-completion--reporting): “Verified email-change implementation গ্রহণ করছি”. This task acceptance does not approve milestone, operator or provider gates.

## Reviewed source hashes

| Source | SHA-256 |
| --- | --- |
| `backend/src/config/environment.ts` | `d760358ced985c685460a5e450209ecc86e35e863576cd4e0c6db54ee557a19b` |
| `backend/src/config/recovery.ts` | `c32ee89de318555af68d131872f1b974531a3becbcab47e469277146d247f1f1` |
| `backend/src/modules/auth/email-change.ts` | `c885f6e9675e34dbf710b93da89ed735011b1b79a07c5f474c810ea34793e887` |
| `backend/src/modules/auth/email-change-routes.ts` | `284c502e0169fd0d4c5ad54050649b5518d4be779397ec013cdd42adeac5b7e7` |
| `backend/src/modules/auth/proof-envelope.ts` | `8d0d3d4a268fab0df872fed6d22befd17d490060c753c11e5d289d5150ce057f` |
| `backend/src/modules/auth/proof-delivery.ts` | `71504a3c61f265f3c198c3aa8d491cc7695ab019ad075fd1583990d00dae7bb0` |
| `backend/src/modules/auth/recovery.ts` | `fd10a80d050d5fc6da5a5809e39bf6e41139f9c9b549f04309160ea864661976` |
| `backend/src/modules/auth/composition.ts` | `613980cecd82b62efc139d139dde8d95d3fdfb93dff2467e9b1a1277e33ab864` |
| `backend/src/modules/notifications/registration.ts` | `6a702859b6eb357012b5cf744f2f256920fb0fd1d4c15ec697627d5d6f200c4d` |
| `backend/src/modules/notifications/worker.ts` | `7fa4fc58f7c249f84117545563085b869bac0f4c63f702512be92a152e2bd474` |
| `backend/tools/notification-worker.mjs` | `21f2512aaae99c346318fc5e421d70377596259adb03123eab5eb3e8dbd77944` |
| `backend/tests/email-change.test.ts` | `77a4363bbf162932be604471ea2e68cacb24d001b706e8e61c497ae1b2720af1` |
| `backend/tests/integration/email-change.test.ts` | `15b93ba123973d0eaa6d9241922771f9ff1517c4fc11a1955730322e3fd08e07` |
| `docs/API.md` | `378c719945d401a78dae3b0da5507b783eafc1409ddb8a1a490c75830c070797` |
| `docs/DATABASE.md` | `d5fe505ebdee4a91eab81633c3baad96ce82dc44df5a335752d0162cbd7f9bae` |
| `docs/OPERATIONS.md` | `19ed15445afca61e1c1d8b8806d3b1b7c7226ef2301c3de531cb2b4e79572c22` |
| `docs/TESTING.md` | `2ac4ec47bb92c0e306f2b3ab9e26168841746acae5d3f23bf2ae963350852f6c` |
