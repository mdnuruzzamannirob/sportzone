# P03-018 — Identity API and browser security contracts

**Date:** 18 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner, 18 October 2026 — “Identity API contract গ্রহণ করছি”

## Scope and authority

[Task](../TASKS.md#phase-03--authentication-and-core-backend) follows accepted P03-001 and P03-017. API §§3–9/16.3/
Appendix D, Database §§5.1–5.7, Architecture §§8–9 and Testing §§8–9/12 govern this contract slice. No business collection,
credential, deployed migration, customer/admin session or identity route is created by this task.

## Delivered implementation

| Area | Delivered behavior |
| --- | --- |
| Request schemas | All 26 identity method/path operations; strict body/params/query; normalize email/names, preserve passwords, reject role/status/operator/unknown/null assignment |
| Service policies | Required injected new-password/phone/coverage policies; no guessed production password policy or synthetic national coverage; password-transforming policy rejected |
| Response schemas | Exact account/address/acknowledgement/CSRF/deletion shapes, distinct bounded addresses, at-most-one default, no secret/internal-field leakage; invalid server output becomes redacted INTERNAL_ERROR |
| Security contract | Route-selected storefront/admin namespace, CSRF obligation on all mutations including anonymous/repeat logout; session/Origin/CSRF/role checks remain mandatory implementation handoffs |
| Replay precondition | Pure isChallengeCurrent checks purpose/principal/revision/expiry/consumed/invalidated/attempt bounds; no token verification or atomic consumption implied |
| Safe errors | Existing API codes INVALID_CREDENTIALS, GUEST_PROOF_REQUIRED, FORBIDDEN, CSRF_INVALID and RATE_LIMITED added to static error mapping |
| Documentation | API §9.3 defines wire limits, policy injection, generic proof failures, response-fault handling, browser/replay rules and future guest handoff; Testing records executable scope |

The route registry contains schemas and obligations only. The production router still registers operational health only;
contract tests confirm login remains 404. The response parser does not serialize Mongoose documents or implement ownership.
No packages, package scripts or CI inventory entries changed; backend test:unit discovers the new contract suite.

## Cross-document reconciliation

- Database's at-most-one-default rule is preserved. Testing ACC-04 previously implied exactly one whenever addresses
  exist; it now matches Database §5.5 without inventing automatic default replacement.
- Account excludes role/hash/revision/envelope fields and does not silently widen its active/suspended status enum.
  Address response explicitly includes stable id/isDefault; partial edits must validate the complete merged owned address.
- Password policy, canonical phone validation and served coverage are explicit service inputs. Login accepts exact existing
  credentials independently of new-password policy. Token shape is not proof of high entropy or correct hashing.
- Invalid challenge states share generic 400 VALIDATION_FAILED with token/INVALID_PROOF; they do not reveal whether proof
  was expired, used, wrong-principal or stale. Registered error codes do not mean throttling/security middleware exists.
- Pre-auth mutations, protected account mutations and repeat logout all retain CSRF/Origin requirements; provider
  callbacks/returns are separate future contracts and cannot issue account sessions.

## Test coverage and limitations

`backend/tests/identity-contracts.test.ts` covers all 26 wire operations plus negative shapes, privilege/PII leakage,
Unicode bounds, policy injection/password preservation, complete/partial address handling, acknowledgement/time shapes,
proof freshness/replay preconditions, safe repeated-logout shapes and actual Express validation/error/no-store/correlation
transport through fixture-only routes. Test policies/data are synthetic; no live contact, proof or private key is stored.

Initial sandboxed HTTP tests failed with listen EPERM; rerunning with authorized loopback access passed the then-current
143 backend tests. An initial TypeScript policy input/output generic mismatch was corrected before the final run. The
final suite additionally checks password-transform rejection and invalid server-output redaction.

| Check | Observed result |
| --- | --- |
| Backend lint/type checks | Passed during implementation; final run below |
| `MONGOMS_DISTRO=ubuntu-24.04 SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-browser-libs/webkit.sh npm run ci` | Passed; all 20 commands; 368 unit/component cases (145 backend, including 73 new contract cases), 29 real DB/runtime integration cases, 30 browser cases, three builds and seven HTTP smoke groups |
| CI report | `test-results/ci.json`; 2026-10-18T14:06:40.641Z to 2026-10-18T14:09:32.388Z, local Node 24.20.0/npm 11.19.0; hosted GitHub run for this change Not Run |
| Integration/browser reports | `test-results/database.json`: 29/29, zero failures; `test-results/ui-report.json`: 30 expected, zero skipped/unexpected/flaky |
| `npm run lint`, `git diff --check` and task/source integrity audit | Passed; 171 stable task IDs and milestone tracker preserved; only P03-018 advanced; database/runtime/router/dependencies/CI inventory unchanged |
| Identity model/index races, real challenge consumption, session/cookie rotation, CORS/Origin/CSRF middleware, password hashing, throttling, actual email/guest/deployed-origin tests | Not Run; owning tasks below |

## Required implementation handoffs

| Owner | Required next evidence |
| --- | --- |
| P03-004 | Real schemas/indexes/BSON validators/private projections, unique races and credential artifact expiry |
| P03-005/006 | Opaque cookie namespaces, verified bound CSRF, exact Origin/CORS, rotation/expiry/revocation and correct bootstrap audience |
| P03-007/008 | Registration/profile/address ownership and exact credential policy/verification; merged-address coverage, bounded/default races, durable registration intent and verified deletion intake |
| P03-009–012 | Delivery envelopes/key custody, atomic consume/reissue and scope revisions, durable outbox/uncertainty, admin/customer recovery separation |
| P03-013/014/016 | Actual authorization/rate-limit/audit and integrated M1 security evidence |
| P06-015 | Guest proof request/exchange, order-scoped persistence/session, single-use atomicity and cross-order denial before protected order actions |

isChallengeCurrent is intentionally side-effect-free: two calls over unchanged fresh state can both return true. Secret
verification plus transactional conditional consumption determines the winner. The replay tests prove the predicate and
wire contract only. No concurrent database proof exchange, exactly-once email, production/provider readiness or milestone
acceptance is claimed. The project owner independently accepted this contract task on 18 October 2026 under Tasks §2 and AGENTS §13. This acceptance does not approve a milestone or unimplemented identity/session behavior.

## Source identity and environment

The WebKit launcher is the existing local host-library compatibility override; CI uses normal Ubuntu browser setup.
The lockfile hash matches CI: `fb2dacb33edaf9d030808b2ace7e037eafc40e2aef9b4c86f5868461cbb03236`.
Source hashes below bind the delivered validators/tests/errors and reconciled API/testing specification to this review.
Earlier accepted/staged work was preserved; no milestone approval was changed.

| File | SHA-256 |
| --- | --- |
| `backend/src/modules/auth/contracts.ts` | `93e78d4fa8bef7c8eb336860b7f549aedd30396527767558f8bf83af6f7ea2d8` |
| `backend/tests/identity-contracts.test.ts` | `c5e8e30fccfa28d636da9e5dc1faf83bc4538efc8883e0d003d6c735af426352` |
| `backend/src/shared/errors.ts` | `9f1f50dea0902d427a1dea6d0aa76e4ca985e0d44a30156badc29c07c74c1d83` |
| `docs/API.md` | `21dadf2578fc2aed2683422134af82d933c7c8e991af93b70931e55b6ed3a4f7` |
| `docs/TESTING.md` | `440f2cf732dbe1657dd9d331b785e27ec967bfe736742fb33a76e2193566f174` |
