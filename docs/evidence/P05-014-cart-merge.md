# P05-014 — Cart merge and revalidation API

**Date:** 25 October 2026
**Executor:** Codex
**Status:** Done; accepted by project owner on 25 October 2026
**Revision:** Working-tree changes against `3ccb6937d3c04013baf12287386aa7ad202f51cb`

## Scope and contracts

Sources: [Tasks](../TASKS.md), P05-014; [API §10.2](../API.md#102-cart-and-wishlist);
[Architecture §§4–6](../ARCHITECTURE.md#4-project-structure); [Testing SHP-01](../TESTING.md).
P05-002 and P04-010 are accepted prerequisites. This work belongs to the Backend stage.

`POST /api/v1/cart/merge` accepts strict `{items:[{variantId,quantity}]}` with at most 100
input lines and quantities 1–50. Duplicate submitted and saved quantities resolve by maximum,
so repeating a merge does not add units. Accepted requests increment revision, including empty
revalidation and replay. A later explicit cart edit/removal can be changed by a subsequent merge;
this endpoint does not retain historical operation receipts.

Unknown/inactive/hidden incoming selections are excluded with one safe error per variant.
Existing saved selections remain removable and receive current safe/unavailable projections.
Current prices, visibility and availability are read through catalog services. The combined
100-line limit and monetary overflow reject the entire transaction. No price snapshots, stock
reservations, collections or migrations were added.

## Implementation and boundaries

- Cart-owned schema/service/routes implement validation, merge, transaction and response.
- Existing customer account capability serializes concurrent writes and rechecks authorization.
  Existing Origin, CSRF, customer-session and no-store middleware protect the new route.
- Catalog remains the owner of product/variant eligibility and pricing. No foreign model import
  was introduced into cart runtime code; controllers delegate to the domain service.
- Executable contract registry imports the runtime schemas. All four generated artifacts were
  regenerated: 39 implemented and 125 planned operations, preserving the 164-operation inventory.
- API §10.2 owns the concrete merge policy/result; Testing SHP-01 owns its assertions. Tasks
  records status, and Changelog links this evidence. No unrelated specification was rewritten.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, local disposable transaction-capable MongoDB replica set
using the repository's isolated test helper and `MONGOMS_DISTRO=ubuntu-24.04`. Synthetic records only;
no application `.env` database, merchant service or frontend was used.

| Command | Observed result |
| --- | --- |
| `npm run api:generate --workspace=backend` | Passed; four artifacts generated |
| `npm run test:contract --workspace=backend` | Passed; freshness and all 49 contract cases |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/cart.test.ts` | Passed; 40 cases, including 28 existing and 12 added cases |
| Same integration command with `-t 'rolls back merge and account'` | Passed; one focused case after correcting its account-fence assertion; 39 intentionally unselected |
| `npm run test:unit --workspace=backend -- tests/unit/catalog.test.ts tests/unit/operations.test.ts` | Catalog 21 Passed; operations initially blocked by sandbox listening restriction |
| `npm run test:unit --workspace=backend -- tests/unit/operations.test.ts` with local listening permitted | Passed; 40 cases; 61 distinct unit cases total |
| `npm run typecheck --workspace=backend` | Passed after test-field correction |
| `npm run lint --workspace=backend` | Passed; 193 files |
| `npm run build --workspace=backend` | Passed |
| `npm run test:smoke --workspace=backend` | Passed; real DB startup, restricted health, sanitized configuration and graceful shutdown |
| `npm run test:security` | Passed; zero secret findings and zero dependency advisories |
| `npm run lint` and `git diff --check` | Passed after removing evidence trailing whitespace |
| `npm run lint:boundaries` | Passed; 229 files, zero errors |
| `npm run format:backend` | Passed; 207 files |

Integration assertions cover maximum/deduplicated quantities and replay, customer isolation,
ineligible per-item exclusions, zero stock changes, malformed/protected/oversized inputs,
concurrent merge/merge/PUT, capacity and overflow rollback, missing browser proof/admin rejection,
service-level suspended-account denial, empty revalidation with fresh prices and hidden projections,
and rollback of both cart creation and the account fence when final projection fails. Existing
cart index/validator, ownership, revocation and concurrency regression cases remain passing.

Initial failures are retained as history: the contract-router fixture lacked the new service method;
operation-count assertions still expected 38 implemented/126 planned; both were corrected. Sandbox
EPERM prevented MongoDB/HTTP listeners until the checks ran with appropriate execution access.
The new rollback test initially referenced a nonexistent account `revision`; typecheck caught it.
It now asserts the actual transactional `updatedAt` fence, and its focused rerun passed.
These attempts are not counted as successful or added to distinct test totals.

The integration JSON report at `test-results/database.json` contains the final focused rerun,
not the preceding complete 40-case run. Full-run counts above are the observed terminal results.
Generated contracts are committed-source artifacts; local test/security output is ignored.

## Recovery and independent review

The route activates with the existing customer-auth/cart composition and reviewed cart persistence.
No additional deployment configuration is required. Roll back route/service/schema/registry and
regenerate artifacts together; retain existing cart documents and indexes. No destructive data
rollback is needed. Existing sessions, quantities, catalog ownership and account fences remain intact.

Frontend/browser, hosted CI, full backend-stage regression and production/provider verification:
**Not Run**, outside this backend task's affected scope. No client merge UI, checkout acceptance,
product milestone or external gate is implied.

Independent project-owner review accepted this implementation and evidence on 25 October 2026:
“Review করেছি—accept করছি, Done করো”. P05-014 is Done under
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting); the verification history and scope limits above remain unchanged.
