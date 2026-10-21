# P03-019 — Typed backend composition and runtime entry points

**Date:** 21 October 2026\
**Executor:** Codex\
**Status:** Done; explicitly reviewed and accepted by project owner

## Scope and contract reconciliation

Accepted P01-015 and P03-012 prerequisites; Architecture §§4/6, API §2, Operations runtime/tool contracts,
Database §5 identity invariants and Testing §15.5 apply. This is the first backend source refactor, not
P03-020's module/entity separation. No public endpoint/DTO/cookie, authorization rule, collection/index,
durable state, package or provider behavior was changed. Existing staged P03-016/user changes were preserved.

Previously identity composition converted parsed booleans, numbers and the origin allowlist back to strings,
then reparsed session/browser/proof options. Runtime validation also performed the proof parsing before that
round trip, and the worker independently rebuilt the same proof policy. HTTP registration and process lifecycle
were mixed in server.ts; common HTTP helpers remained in legacy shared/middleware folders.

## Delivered organization and behavior

- `config/environment.ts` creates frozen `RuntimeConfig.identity` policies once for enabled capabilities.
  Numeric session/context policy, canonical origins and customer/email/admin proof options flow directly into
  consumers. Inactive providers remain optional. Invalid enabled policy fails at the boundary before database/
  listener work; factory guards remain. Legacy raw option adapters still support isolated callers/tests.
- `src/composition.ts` wires HTTP and notification worker services. Auth composition consumes typed options
  without reconstructing ProcessEnv or parsing proof keys again. Private model construction stays inside auth:
  the root receives narrow proof-delivery capabilities, preserving the existing automated module boundary.
- `src/routes/index.ts` owns root health registration; auth retains its route registration. `src/server.ts`
  retains database/listener lifecycle, read-only persistence admission, readiness/draining, connection cleanup,
  idempotent close and signal handling. Startup failure still destroys its new connection; no bootstrap at startup.
- `src/common/{errors,responses,pagination}.ts` and `src/common/middleware/{errors,validation}.ts` replace
  legacy shared/middleware paths. All affected source/test imports retain NodeNext `.js` specifiers. The five
  common modules and root registration are unchanged except relative import targets; empty old source folders
  and routes.ts were removed. No compatibility wrappers, duplicate utilities or empty templates remain.
- `tools/notification-worker.mjs` remains the same external command, loading runtime and separate email/retry
  policy once, using shared composition and retaining safe output/cleanup. Bootstrap, admin provisioning,
  notification migration, local replica tool and compiled server entry commands retain their paths/restrictions.

No tests/config/tool command names, test discovery patterns, dependency graph or required CI check names changed;
the existing inventory discovers the new test files. API/Operations/Testing/README explain actual ownership and
startup behavior. Historical evidence paths/hashes remain historical rather than being rewritten as new results.

## Observed verification

Local Node 24.20.0/npm 11.19.0, isolated MongoDB 8.0.16 replica sets (`MONGOMS_DISTRO=ubuntu-24.04`).
Synthetic identities only; no production database, external sender or deployment action. Unchanged frontend builds
from the prior verification were reused with public synthetic API origin `https://127.0.0.1:4443`.

| Commands | Observed results |
| --- | --- |
| `npm run test:unit --workspace backend` | Passed all 328 existing unit/contract cases after typed configuration and import moves. |
| `npm run test:unit --workspace backend -- tests/composition.test.ts` | Passed 3 new cases: frozen detached policy, optional inactive providers, safe early rejection of enabled insecure origin. Combined unique unit/contract cases: 331. |
| `npm run typecheck --workspace backend`; `npm run build --workspace backend` | Final Passed. Initial new test cookie/environment type diagnostics were corrected with explicit/narrow types; no casts or suppressed errors. |
| `npm run lint --workspace backend` | Final Passed, 88 files. Initial implicit-any local in server composition was given its exact inferred return type. |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace backend` | Passed 281 cases across 15 suites: all existing 280 plus new real HTTP/worker proof flow. |
| Same integration script with `tests/integration/composition.test.ts tests/integration/runtime.test.ts` | Passed 7 cases, adding compiled bootstrap/migration/worker-preflight coverage. |
| Same integration script with `tests/integration/composition.test.ts` after final compiled build | Passed final 2/2, including real bootstrap/migration commands preserving users and worker disabled-provider preflight. Combined unique integration cases: 282; unaffected passing results reused. |
| `npm run test:smoke --workspace backend` after final build | Passed sanitized invalid startup, real DB startup/liveness/restricted readiness and shutdown. |
| `SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-p03-browser/webkit.sh npm run test:ui -- tests/ui/authentication.spec.ts` | Passed 6/6 real API flows across Chromium/Firefox/WebKit, zero skipped/retries/failures. Customer/admin login/recovery, ownership-backed account editing, password/email changes, expiration/suspension, private cache clearing and cross-tab identity remain functional. |
| `npm run test:security` | Passed; zero repository/history secret findings and zero locked dependency advisories. No exceptions granted. |
| `npm run lint:boundaries`; `npm run format:check`; final backend lint/diff review | Passed; 132 source files, zero boundary errors. Initial root-to-private-model import was corrected by an auth-owned delivery capability factory, not by weakening the checker. |

The new real proof flow issues through root HTTP composition, delivers through root worker composition, and
confirms through HTTP. Deliberately unusable legacy raw config fields demonstrate consumers use the captured
typed policy. Delivery is a synthetic adapter, never a live email request. Compiled operator tests run only against
the isolated test replica; the worker preflight explicitly disables email. Existing admin provisioning CLI, local
replica ownership, schema/index/transaction, auth/recovery/ownership/race and notification safety assertions remain.

Artifacts: [full integration report](../../test-results/p03-019/integration-initial.json),
[full integration log](../../test-results/p03-019/integration.log),
[scoped lifecycle/composition run](../../test-results/p03-019/composition-before-final-build.json),
[final compiled composition report](../../test-results/p03-019/composition-compiled-final.json),
[compiled composition log](../../test-results/p03-019/composition-compiled-final.log),
[final smoke](../../test-results/p03-019/smoke-final.log),
[browser report](../../test-results/p03-019/browser-auth-final.json),
[browser log](../../test-results/p03-019/browser-auth.log),
[security result](../../test-results/p03-019/security-final.json),
[six exact source moves/current hashes](../../test-results/p03-019/source-moves.json).
Unit/lint/type/build output was observed directly in the execution session. The move report confirms all six moved
files differ only in relative import specifiers (or are byte-identical); business helper bodies are preserved.

## Review, rollout and limits

Full CI, unrelated frontend unit/build/showcase suites, a new hosted run, deployed topology/credentials and real
email/provider operations were Not Run. This change touches backend composition and common imports, so verification
covers all backend consumers plus affected real API browser flows, reusing unchanged frontend outputs. Existing
runtime/schema/business invariants remain intact; no open local failure was deferred as accepted functionality.

Deploy/rollback the complete compatible backend build, retaining the same environment variables and operator tool
paths. No data/index migration or external-effect retry is required. Source/internal compiled utility paths moved;
callers must rebuild together, not depend on stale generated files. P03-020 remains Not Started; current auth/
customer/delivery module ownership and provider adapters are not declared refactored by this task.

Independent task acceptance is recorded below. M1 and deployment/provider gates remain separately unaccepted.

## Owner acceptance

On 21 October 2026, the project owner explicitly reviewed and accepted P03-019 through the evidence-linked popup:
“Review করেছি—accept করছি, Done করো”. The review disclosed the 331 unit/contract, 282 real MongoDB integration,
6 browser flows and lint/types/build/smoke/security results, while separating P03-020 and M1 approval.
P03-019 is Done. This status-only update preserves valid verification and repeats documentation/link checks only;
no application suite, external operation or milestone approval is implied.
