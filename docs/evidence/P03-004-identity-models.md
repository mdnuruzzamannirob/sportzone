# P03-004 — Identity persistence implementation

**Date:** 18 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner, 18 October 2026 — “Identity persistence implementation গ্রহণ করছি”

## Scope and prerequisites

[Task](../TASKS.md#phase-03--authentication-and-core-backend) follows accepted P03-002, P03-017 and P03-018.
Database §§2/5/11/12/14/15, API §§4/9/16.3, Architecture §§7–9 and Testing §§8–9/12 govern this implementation.
No public identity route, real account, merchant credential, production migration or session cookie was created.

## Delivered behavior

| Area | Implementation |
| --- | --- |
| Models | Explicit connection-owned users, sessions, authChallenges and browserContexts; embedded stable address/deletion IDs, strict fields/timestamps, safe counters, canonical identity and conditional reference scopes |
| Privacy | Password/token/CSRF/context verifiers, security/challenge revisions and encrypted envelope excluded from default projections; public DTO allowlists remain mandatory |
| DB protection | Strict/error collection validators reject invalid raw writes, unknown fields, wrong types/scopes, unsafe counters, duplicate address IDs/defaults and retained envelopes on consumed/invalidated challenges |
| Indexes | All ten Database §5.6 names/ordered keys/options verified; global email identity and three credential-digest uniqueness constraints, three absolute-expiry TTL indexes |
| Expiry lookups | User-session lookup checks kind, expiry, revocation, active principal role/status and security revision; browser-context lookup checks audience, expiry and rotation; no TTL dependency |
| User proof consumption | Internal digest/purpose/principal/role/expiry/attempt/revision guards; one transaction advances principal purpose counter, consumes proof/removes envelope and runs caller's sequential DB effect; clock refreshed on retry and before consumption |
| Rollback | Failed effect or expiry crossing restores consumption/revision/envelope state; concurrent consumption has one winner and replay fails |
| Bootstrap | Explicit empty-collection initializer with validator compatibility checks and additive indexes; no HTTP startup side effect, collMod, destructive sync/drop or silent duplicate repair |

The shared index verifier now accepts the narrow diffIndexes method it actually needs. This is a type-boundary correction
for strict inferred Mongoose models, without a runtime/index-policy change. No new dependencies, scripts or CI entries
were needed; the existing mandatory integration suite discovers the new test file.

## Verification

| Check | Observed result |
| --- | --- |
| Focused model/integration runs | 36 cases passed, then expanded expiry/address/index suite; final run below governs final source |
| Backend type/lint | Passed during implementation; final configured CI below |
| `MONGOMS_DISTRO=ubuntu-24.04 SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-browser-libs/webkit.sh npm run ci` | Passed; all 20 commands, 368 unit/component cases, 69 real DB/runtime integration cases (40 new identity cases), 30 browser cases, three builds and seven HTTP smoke groups |
| CI report | `test-results/ci.json`; 2026-10-18T14:29:04.502Z to 2026-10-18T14:32:03.628Z; local Node 24.20.0/npm 11.19.0; hosted GitHub run for this change Not Run |
| Integration/browser reports | `test-results/database.json`: 69/69 across four files, zero failures; `test-results/ui-report.json`: 30 expected, zero skipped/unexpected/flaky |
| `npm run lint`, `git diff --check`, task/source integrity audit | Passed; stable 171 IDs, only P03-004 advanced; public router/API/runtime, dependencies, CI inventory, milestones and commerce/financial contracts preserved |
| Staging/production bootstrap/migration, restore, password hashing, token/CSRF issuance, AEAD/key custody, email/provider delivery, guest-order consumption and browser authentication | Not Run; separate service/operator tasks |

`backend/tests/integration/identity.test.ts` uses actual MongoDB 8.0.16/WiredTiger, an owned random database and replica set.
It disables TTL monitoring only on its own mongod so expired records remain physically present for lookup/consume tests.
Concurrent duplicate identities, proof consumption and address/default mutations hit real MongoDB constraints/transactions.
The suite compares index names/keys/options directly with Database §5.6. Rollback tests inspect persisted records rather
than only callback results. A validator mismatch test changes only its fixture and proves bootstrap refuses to relax it.

During development, an assertion incorrectly expected a synchronous strict-mode constructor error as an asynchronous
rejection; the fixture helper was corrected. Tightening inactive-envelope protection also exposed an invalidation fixture
that left the envelope behind; the final test asserts that write is rejected and performs invalidation plus removal
atomically. Type mismatches were resolved using narrow interfaces and typed collection shapes, without ignored errors,
unsafe casts or weakened checks.

## Operational and security boundaries

Digests/hashes/envelope bytes in tests are synthetic storage fixtures; they do not prove password hashing or encryption.
Services must validate Bangladesh phone/coverage, generate/hash opaque secrets and verify provenance; knowing a digest or
ObjectId is not public authorization. The transaction callback must use its supplied session for sequential DB-only work;
it may rerun and must not send email or call a provider. Password/security changes and durable notification intent belong
in that same transaction when their owning services integrate this primitive.

Guest references are schema-validated only; orders and guest consumption remain P06-015. P03-005/006 own real cookie/CSRF
security; P03-007–014 own identity/recovery/provisioning/authorization/throttling and proof delivery. These model checks do
not accept those services, any M1–M8 gate, production/failover/restore or legal retention decisions.

Database/Testing/Operations/README describe current persistence and explicit rollout requirements. A deployed existing
validator mismatch requires a separately reviewed versioned migration and compatibility/backup gate; no migration was
executed merely by adding the initializer. Partial empty bootstrap must be inventoried/resumed safely. Historical
P03-017/P03-018 evidence remains unchanged and describes their earlier contract-only acceptance.

The project owner independently accepted this identity persistence implementation on 18 October 2026 under Tasks §2 and AGENTS §13. This acceptance does not approve a milestone or unimplemented cookie/authentication/CSRF/recovery services.

## Reviewed source identity

The existing local WebKit launcher supplies this host's missing browser libraries; CI retains its ordinary Ubuntu setup.
The lockfile SHA-256 matches CI: `fb2dacb33edaf9d030808b2ace7e037eafc40e2aef9b4c86f5868461cbb03236`.
These hashes bind implementation/test/specification sources to the observed verification; generated reports remain in
ignored test-results and CI artifacts. No unrelated staged/user changes were overwritten.

| File | SHA-256 |
| --- | --- |
| `backend/src/modules/auth/models.ts` | `9f5713234237f6c57780ffc8db1767e9d35b79e4a1dc8dc873ebaac7e5fca95c` |
| `backend/src/modules/auth/collection-validators.ts` | `1b9c4e84f1ed80304369affec9d235f8ad167ecf6f8cb5a3ca7bd12ac848b15d` |
| `backend/src/modules/auth/persistence.ts` | `f9dee767092f8bfbc77259b90966c549eb374d5de0c60f9ba043f2e39e7f45a0` |
| `backend/tests/integration/identity.test.ts` | `454b71801f93384781ab123be546224e1088d5187a67d08bc73a800180858af4` |
| `backend/src/db/indexes.ts` | `775037d0af86f4fb61d0da689cd9d4c3095717318ce9992164ced435a0ef1a55` |
| `docs/DATABASE.md` | `c4b0156b4d01e29bff69ff43aba1530366ae49fda6d90026930f89956230cff5` |
| `docs/TESTING.md` | `b0152a2569f8100b2b70ac338f9a3022d075a21f04f0ba441f6fee60db8de61b` |
