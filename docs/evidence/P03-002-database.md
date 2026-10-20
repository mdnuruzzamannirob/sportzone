# P03-002 — MongoDB/Mongoose and transaction foundation

**Date:** 18 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner, 18 October 2026 — “Database foundation গ্রহণ করছি”

## Scope and authority

[Task](../TASKS.md#phase-03--authentication-and-core-backend), Architecture §§7/13, Database §§2/12/15 and Testing §§6/9 govern the implementation. P03-001 and P01-005 are accepted; no external readiness, operator appointment or production provisioning is inferred from those planning tasks.

Mongoose 9.11.2 is runtime-only backend persistence tooling. mongodb-memory-server-core 11.3.0 is development-only and starts **real** MongoDB 8.0.16/WiredTiger processes; it is not a database mock. No business collection, public route/DTO, migration, stock effect or financial operation is implemented here.

## Delivered behavior

| Area | Implementation |
| --- | --- |
| Connection | Explicit URI/name, isolated connection instance, bounded pool/timeouts, primary/majority writes, replica-set/session capability check, safe errors and failed-start cleanup |
| Schemas | Mutable strict/strict-query throw, timestamps/ObjectId conventions, explicit domain revisions, automatic create/index/buffering disabled; safe integer and absent-only optional reference helpers |
| Indexes | Explicit additive create and declared-index verification; no destructive sync/drop in application code; extra indexes reported/preserved |
| Transactions | Mongoose document tracking and session cleanup, snapshot/majority/primary, 10-second driver retry deadline and 5-second commit limit; reject nested independent transactions |
| Fixtures | Owned single-member replica, random prefixed database, synthetic fixture collections, no externally supplied DB URI/drop path; cleanup on success/failure |
| Local development | Ephemeral loopback replica CLI, printed nonsecret local URI and SIGINT/SIGTERM cleanup; no persistence guarantee |
| CI | Separate required backend `test:integration`; machine-readable `test-results/database.json` preserved as artifact |

The connection factory is not automatically wired into HTTP startup yet; P03-003 owns full environment loading/validation, deployed health and protected observability. `MONGODB_DB_NAME` is documented in the sanitized template and operations inventory. No credentials were provisioned or logged.

## Verification

| Check | Observed result |
| --- | --- |
| Focused integration runs | Passed during implementation; final expanded suite verified by full CI below |
| Type/lint checks | Passed during implementation |
| `MONGOMS_DISTRO=ubuntu-24.04 SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-browser-libs/webkit.sh npm run ci` | Passed; all 20 commands, 260 unit/component tests, 24 DB integration cases, 30 browser cases, three builds and seven HTTP smoke groups |
| Database JSON report | Passed; `test-results/database.json`, 24/24 cases across two files, no failures/skips |
| CI report | `test-results/ci.json`; 2026-10-18T12:19:44.779Z to 2026-10-18T12:22:30.965Z; local execution, hosted GitHub run Not Run |
| Production/staging, failover, authenticated DB deployment, restore and real business transactions | Not Run; separate feature/operator/release gates |

The suite verifies real server version/topology; bounded connection/lifecycle/failure behavior; strict field/currency/integer/optional-reference behavior; full and partial unique constraints; missing-index detection and additive repair without removing extra indexes; multi-document commit/rollback/unique-failure rollback; competing transaction writes without lost increments; session cleanup and Mongoose document reset; nested transaction rejection; and rejection of actual standalone MongoDB. These are persistence primitives, not evidence that checkout/payment/refund flows exist.

## Environment and safety

Docker daemon access was unavailable for the current user; no daemon permissions were changed. Test tooling launches its own real mongod processes on loopback. On this Ubuntu 26 host, `MONGOMS_DISTRO=ubuntu-24.04` selects the compatible official binary. CI's Ubuntu 24 host resolves that distribution normally. The pinned binary may be downloaded on first use; missing binaries/startup errors fail rather than silently skip or use a standalone/mock fallback.

Index `dropIndex` appears only in the owned fixture test to prove detection/repair; no external data/index is targeted. Application helpers never call `dropDatabase` or `syncIndexes`. An existing production URI cannot become the fixture target, because the harness obtains its URI only from the process it starts.

Transaction callbacks may be retried. They must perform sequential session-bound DB operations only, with external effects outside the transaction. The driver deadline is passed through Mongoose using the driver's declared option type; no unsafe cast or ignored TypeScript error is used. Domain-specific schema constraints, BSON validators, protected update allowlists, financial invariants and migration approvals remain with their owning feature tasks.

## Acceptance

The project owner independently accepted this database foundation on 18 October 2026 under Tasks §2 and AGENTS §13. No production/provider readiness or M1–M8 gate is self-approved.

## References

- [Mongoose transactions](https://mongoosejs.com/docs/transactions.html)
- [Mongoose connections](https://mongoosejs.com/docs/connections.html)
- [Real replica-set test tooling](https://typegoose.github.io/mongodb-memory-server/docs/guides/quick-start-guide/)

## Verified source revisions

| File | SHA-256 |
| --- | --- |
| `backend/src/db/connection.ts` | `93ab9c4daa5b458e834c0c965feabfb74da9c6c1ccc9b1a776d57e8607dd1918` |
| `backend/src/db/transaction.ts` | `38247382b295b6a5e1faf43bef676024028fe0e1bdc0f40040d84fab0636528e` |
| `backend/tests/integration/database.test.ts` | `e26c6974ffaf859b84c3ba0d64b66fe817c77e414640107aaa99575ca62c8124` |
| `backend/tests/support/database.ts` | `dcc9e23a74a13e0b05848a51f6ff6da251606231f87a51492d63a2d86b8ecd9f` |
| `package-lock.json` | `fb2dacb33edaf9d030808b2ace7e037eafc40e2aef9b4c86f5868461cbb03236` |
