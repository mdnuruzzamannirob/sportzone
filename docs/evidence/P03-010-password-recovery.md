# P03-010 — Customer password recovery and change

**Date:** 19 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner accepted on 19 October 2026: “Password recovery/change implementation গ্রহণ করছি”

## Scope and authority

Implements [P03-010](../TASKS.md), FR-01/FR-02/FR-20, [API §9.1](../API.md#91-authentication-and-account-endpoint-contracts), [proof delivery](../API.md#163-transactional-email-and-public-notifications), [Database §5.3](../DATABASE.md#53-authchallenges--verification-and-recovery), Architecture §§6/9 and Testing SEC-01/SEC-03/SEC-05/SEC-10. Dependencies P03-007 and P03-009 have project-owner acceptance. The previously accepted 12–128 Unicode-character/512 UTF-8-byte password policy remains unchanged; passwords are never trimmed or normalized.

## Delivered behavior

- `POST /auth/password-resets`: strict normalized email input, approved Origin/context CSRF, local bounded IP limit, identical `{accepted:true}` for eligible/missing/inactive/admin identities, per-account cooldown and a common explicit response-time floor. No automatic login or inline email. A transaction consumes the context, advances the user reset-scope revision, invalidates/removes predecessor envelopes and creates one fresh challenge plus reference-only outbox intent. Concurrent reissue serializes on the user revision.
- `POST /auth/password-resets/confirm`: existing strict token/new-password contract; a 32-byte CSPRNG proof is verified through its domain-separated SHA-256 digest. Expired, consumed, invalidated, wrong-purpose, wrong-role, inactive or stale-scope proofs cannot authorize. Context consumption, proof consumption/envelope removal, password/security revision update and customer-session revocation commit together. An email identity mismatch rolls back the consume. Returns only `{reset:true}`, never a session or email-verification grant.
- `POST /me/password-change`: authenticated customer Origin/session CSRF, current-password verification, conditional credential/version guards, transactional reset-proof invalidation, security revision update, old-session revocation and replacement customer cookie/CSRF. Concurrent logout and credential writes serialize through conditional session/user writes. Insert failure rolls back changes.
- Delivery: fixed HTTPS storefront origin and `/reset-password#token=…` fragment, never request Host or a persisted rendered link. Existing notification claims/retries/idempotency/uncertainty rules remain. `password-reset-v1` payload contains `challengeId` only; worker checks bound user, destination, notification, purpose, scope and expiry before decrypting/sending. Known rejection retries preserve the proof/event key; uncertain sends stop. Invalid material fails with safe PROOF_UNAVAILABLE and no provider call.
- Encryption: Node built-in AES-256-GCM, fresh 12-byte nonce, 16-byte authentication tag, independent externally supplied 256-bit versioned keys. AAD binds challenge/purpose/user/destination/expiry/revision/key version. Old retained keys can decrypt still-valid envelopes; missing keys, modified ciphertext/tag/nonce or transplanted AAD fail closed. Confirmation never decrypts. Consumption/reissue/change remove envelopes transactionally; bounded worker cleanup removes expired/inactive envelopes without depending on TTL deletion.
- Configuration: recovery defaults disabled. Activation requires customer auth, an approved HTTPS storefront origin, TTL 60–1800s, cooldown 60–3600s, response floor 100–5000ms and private versioned keys distinct from session/monitor keys. Startup rejects invalid active configuration before database/listener startup. ConfigurationError is extracted without changing its safe public export, avoiding a configuration/service import cycle.
- Persistence rollout: strict additive notification validator recognizes the exact P03-007 and P03-009 predecessors, preserves old rows and accepts only supported event/template/payload pairs. Unknown validators refuse migration. No identity schema/index, package, lockfile, frontend or financial behavior changed. HTTP startup never runs migrations.

## Verification

Environment: Node 24.20.0, npm 11.19.0; generated isolated MongoDB 8.0.16/WiredTiger single-member replica set; synthetic accounts/keys and local HTTP only. No externally supplied database is read or dropped. No real provider email is sent.

| Command/check | Observed result |
| --- | --- |
| `npm run typecheck --workspace backend`, `npm run lint --workspace backend` | Passed |
| `npm run test:unit --workspace backend` | Passed in final full CI: 283 cases, including 25 new proof/configuration cases |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace backend` | Passed in final full CI: 211 cases, including 28 new recovery/HTTP/composition cases |
| `MONGOMS_DISTRO=ubuntu-24.04 SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-browser-libs/webkit.sh npm run ci` | Passed; all 20 configured commands, 506 unit/component cases (283 backend), 211 real MongoDB/runtime integration cases, 30 browser regressions, three builds and seven HTTP smoke groups |
| `npm run lint`, `git diff --check`, task/source integrity audit | Passed; document references/structure, scoped task/status audit, diff review, unchanged dependency/lockfile identity and reviewed source hashes |
| Live sender/inbox, hosted CI, production migration/key-store rotation/restore, deployed shared-ingress timing/abuse, storefront reset-screen flow | Not Run; separate feature/operator/release gates |

Recovery cases cover ambiguous responses/projections, proof replay/concurrent consume, cooldown/concurrent reissue, TTL lag and envelope cleanup, ineligible principal/destination/purpose, authenticated change/rotation, old-session denial, concurrent change/reset/reissue, transaction failure, stable retry payload/key, no resend after uncertainty, key loss/tamper/transplant, password-policy failure, Origin/CSRF/input/rate-limit rejection and exact-predecessor migration. The final composition case checks that disabled routes stay absent and explicitly configured routes issue a durable challenge through the real router composition.

Initial sandbox-only HTTP tests could not bind sockets (EPERM); reruns with authorized local socket access passed. Initial focused integration findings were synthetic cookie-name/expected-CSRF and fixture binary-copy errors; these were corrected without weakening security assertions. Focused filters are not full-suite evidence. Browser tests cover existing foundations, not a new recovery screen.

Generated artifacts (ignored): `test-results/ci.json`, `test-results/database.json`, `test-results/ui-report.json`. Final CI: 2026-10-19T13:47:11.075Z–2026-10-19T13:50:43.302Z; all 20 commands Passed. MongoDB report: 211 Passed, zero Failed/Pending. Browser report: 30 expected, zero skipped/unexpected/flaky. Lockfile SHA-256: `7b8c507181a5c5f9a132b4050b23239db3b4b407e266aef710b536e61772dac6`. Final evidence/status edits were separately checked with repository lint and diff/task audit.

## Review and operational boundaries

No milestone/provider/operator approval is inferred. The common response floor reduces normal processing-time differences; it cannot guarantee constant-time network responses. Deployed shared ingress/rate controls and measured floor sizing remain operational requirements. A provider request already in flight can deliver a subsequently invalidated link; the current revision still prevents its consumption. Mail acceptance does not prove inbox delivery. Production rollout must migrate first, distribute protected keys, verify sender and schedule the worker within reset TTL. Compatible rollback retains expanded records/validators; never erase receipts/envelopes or replay ambiguous intents. [Operations](../OPERATIONS.md#recovery-activation-and-key-custody) owns activation, key rotation, restore and rollback procedures.

Project-owner acceptance was recorded on 19 October 2026 under [AGENTS §13](../../AGENTS.md#13-task-completion--reporting): “Password recovery/change implementation গ্রহণ করছি”. This task acceptance does not approve milestone, operator or provider gates.

Primary security references: [Node crypto API](https://nodejs.org/api/crypto.html), [OWASP forgot-password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). Repository tests verify the used APIs on the recorded Node runtime; reference guidance is not a production certification.

## Reviewed source hashes

| Source | SHA-256 |
| --- | --- |
| `backend/src/config/recovery.ts` | `b1d9a00221a40b53464a3c49801f9df5078b5302245230cc20d79d2acdb4ce23` |
| `backend/src/modules/auth/recovery.ts` | `a68055a201e1f2669d5ebd7932c15f5c9737cdbd80dc266a17b5a41d8b70fda9` |
| `backend/src/modules/auth/recovery-routes.ts` | `839e9d64324b78d932b12753df7b9b19efd2a851c875aeb2e9495555d2c12155` |
| `backend/src/modules/auth/proof-envelope.ts` | `60e4f63924e7510c775d8037cea7e062630cc64cbf145f6d2e117ae315ec702e` |
| `backend/src/modules/auth/proof-delivery.ts` | `9dc3f3a14fc38fcc2a99c7496d6130a50aa552a94120ac554372ae51c0ba0d69` |
| `backend/src/modules/auth/persistence.ts` | `fef412f61522112333758581e7103c163d2fa882f1c1c30d37e8b378dd5c9e34` |
| `backend/src/modules/auth/composition.ts` | `c9341441aa70a1e32b66caf76a7c6d03d29c8c91e279b6c94f4649c16aa3dad1` |
| `backend/src/modules/notifications/registration.ts` | `daea2d066fa86066a4ef9f4baa4622b430ebc053d232e0a17c156ac8f5b7f581` |
| `backend/src/modules/notifications/worker.ts` | `bf9bd5b67bf73cec546912a51d3bfd73c661b894f533e816ea1927eee37137c7` |
| `backend/tools/notification-worker.mjs` | `2a5e96b8dd00867d63a4168c3469016bac394091d4adfe71f6245c0053b007c9` |
| `backend/tests/recovery.test.ts` | `c74d6db0d1104424b67fd9315353108bffc7610d13bce61a5f66bb59a7788c22` |
| `backend/tests/integration/recovery.test.ts` | `5d14707e446135764baaf23f6b085a39c0d8dbfc7fb95e82e93be4f57f6e50ef` |
| `docs/API.md` | `3d5f37af7590bf945c4cc3fc164c71f6c4a49fb6dcbbb2da498fc39a9c2582dc` |
| `docs/DATABASE.md` | `5b96c03e1364601395797f357437349724761592ee85a1caf0d5594ed577c6d4` |
| `docs/OPERATIONS.md` | `eb277a600b6ad15a41e75dfecf926d7418beb817944105d1a976bfacaa383b69` |
| `docs/TESTING.md` | `48aee0428ddb24d705ae74d2726afb909f7b4fb03418caa00cda310eda6174d1` |
