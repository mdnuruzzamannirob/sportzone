# P04-018 — Inventory administration APIs

**Date:** 25 October 2026
**Executor:** Codex
**Status:** Done; accepted by project owner on 25 October 2026
**Revision:** Working-tree changes against `b7a174ec919bc203acbb0a5baaa3632e11c056ae` (accepted P05-015).

## Scope and boundaries

Sources: [Tasks P04-018](../TASKS.md), [API §14.1](../API.md#141-catalog-categories-and-variants-admin),
[Database](../DATABASE.md) §§6.3–6.4/10.3–10.4, [Architecture §§4–6](../ARCHITECTURE.md#4-project-structure),
[Testing](../TESTING.md) INV-05 and existing inventory cases. Prerequisites P04-008, P03-013 and P01-024 are accepted.
This is Backend-stage work; no client implementation or provider approval is implied.

Implemented protected inventory list, movement history and physical adjustment routes. Threshold edits use
the approved `/admin/variants/{variantId}` PATCH, with only the lowStockThreshold field enabled by this work.
The registry explicitly describes this activation limit; price/status and other variant master operations
remain P04-017. There is no alternate inventory PATCH or unapproved stock-edit endpoint.

The inventory module owns HTTP validation, admin orchestration and movement history. Catalog owns private
variant models, stock counters, admin variant DTOs, list projections and threshold CAS. Auth supplies the
transaction-scoped admin capability; audit supplies its append-only writer. Controllers access no models.
Settings supplies a read-only threshold capability; it neither seeds settings nor fabricates approval.
Strong numeric revision parsing now lives in the technical shared boundary; the existing coupon export
remains compatible, with consumer unit coverage. No new package or collection was introduced.

## Delivered behavior

- Admin list supports bounded literal SKU/product-name search, canonical true/false low-stock filtering,
  default/override thresholds, SKU/ID stable pagination and separated physical/reserved/committed/available
  counters. Totals cover all matching variants, not only the page. Unsafe aggregate overflow fails closed.
- Threshold changes require strong If-Match, return a strong ETag and advance canonical variant revision.
  Explicit zero remains an override; null removes it. They never change stock. Stock mutations share the
  same variant conflict boundary, invalidating stale threshold revisions.
- Adjustments validate nonzero bounded physical deltas, derive the actor from live admin authorization,
  require a bounded opaque Idempotency-Key and never edit reserved/committed counters. Variant/key scope
  preserves exactly one movement and one audit fact on replay. Changed actor/delta/reason conflicts.
  Replays return the original movement ID and current transaction's stock, not a fabricated historic balance.
- Auth fences, stock change, append-only movement and audit commit in one outer transaction. The existing
  primitive accepts the caller's transaction without nesting; standalone callers keep their prior behavior.
  Audit failure rolls back all effects. Real reservation/physical-adjustment races have one safe winner.
- Bounded history uses occurredAt/ID ordering, inclusive from/exclusive to UTC filters and the approved
  movement allowlist, omitting replay keys and internal order/reservation references.
- A latent embedded movement-actor rollback defect was fixed by explicitly disabling its Mongoose version
  key. This changes no BSON field or validator; transaction abort no longer throws an undeclared `__v` error.
- Root composition registers inventory routes only with ADMIN_AUTH_ENABLED; server guards enforce
  role/session/Origin/CSRF and private no-store responses.

## Readiness and rollout limits

Inventory list requires a configured primary storeSettings.lowStockThreshold and an unconditional unique
key index. Missing/invalid settings return 503 even when a page happens to contain explicit overrides; no
environment/default threshold is invented. Adjustment/history and explicit threshold writes remain usable
independently. **Production singleton provisioning and approval remain P09-013**, which this task does not
complete or bypass. Tests use a clearly synthetic canonical singleton with all payment flags false and no
published policy. Its fixture is not production provisioning or operator/legal approval.

Use reviewed existing product/inventory initializers and canonical audit provisioning before enabling the
operations. Requests verify required validators/indexes and fail closed; runtime does not repair persistence.
No migration or new index is introduced here. Retain stock, movements, reservations and audit on application
rollback; roll back service/routes/registry/generated artifacts together, without deleting durable history.
Full product/variant management, settings lifecycle and client inventory controls retain their owning tasks.

API §14.1 owns concrete request/results/replay/pagination rules; Operations owns setup/recovery and the
settings prerequisite. Testing INV-05 owns HTTP acceptance assertions. Generated OpenAPI/Postman include
required replay/CAS headers and ETag, keeping blank environment templates. Inventory remains 164 operations:
48 implemented and 116 planned; the threshold-only activation limit is explicit.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, isolated MongoDB 8.0.16 replica sets with generated database/URI;
synthetic identities/products/settings only. No application `.env` database, provider service or frontend was
used. MongoDB/HTTP checks ran with local listeners permitted outside restrictive sandbox execution.

| Command | Observed result |
| --- | --- |
| `npm run api:generate --workspace=backend` | Passed; four artifacts generated |
| `npm run test:contract --workspace=backend` | Passed; freshness/router/schema coverage and all 60 cases, including inventory replay-header/Postman assertions |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/inventory-admin.test.ts tests/integration/inventory.test.ts tests/integration/inventory-allocation.test.ts tests/integration/composition.test.ts` | Passed; 22 admin, 15 primitive, 16 allocation and 5 composition = 58 cases |
| `npm run test:unit --workspace=backend -- tests/unit/inventory.test.ts tests/unit/inventory-allocation.test.ts tests/unit/inventory-admin.test.ts tests/unit/coupon-admin.test.ts` | Passed; 38 cases |
| `npm run test:unit --workspace=backend -- tests/unit/inventory-admin.test.ts tests/unit/coupon-admin.test.ts tests/unit/operations.test.ts` | Passed; 51 cases, reusing 11 schema/revision consumers; 78 distinct unit cases total |
| `npm run typecheck --workspace=backend` | Passed after correcting test helper/optional-field types |
| `npm run lint --workspace=backend` | Passed; 209 files |
| `npm run build --workspace=backend` | Passed |
| `npm run test:smoke --workspace=backend` | Passed; real DB startup, restricted health, redacted invalid configuration and graceful shutdown |
| `npm run test:security` | Passed; zero secret findings and zero dependency advisories |
| `npm run lint` and `git diff --check` | Passed; 500 files, 1,279 local links, zero documentation errors; task-count/checkbox audit Passed |
| `npm run lint:boundaries` | Passed; 241 files, zero errors |
| `npm run format:backend` | Passed; 223 files |

The final security result is retained at `test-results/P04-018/security.json`.
The complete integration report is retained locally at `test-results/P04-018/integration-58.json` (ignored).
Schema ownership moved afterward without changing wire validation/behavior; affected schema/revision units,
contract freshness/parity, types and build passed at the final revision. Unchanged transaction regression
results were reused rather than rerunning the full scope. Test totals do not sum reruns.

Negative assertions cover unauthorized/customer/suspended principals, browser-proof rejection, protected
fields, malformed quantities/keys/queries, bounded pages, stale CAS, negative availability, integer overflow,
missing/malformed settings or unique index, missing variant indexes, unknown variants, safe history,
replay conflicts and audit rollback. Actual root composition and admin-disabled behavior are exercised.

Initial failures are recorded accurately: optional query-property typing and a UUID-inferred test key type
were corrected; lint rejected a control-character regex, replaced by equivalent explicit character checks.
The first 19-case admin run had 18 passes and one rollback failure. A focused stack trace identified the
movement actor subdocument's undeclared `__v` reset; the model option fix removed the defect and all 19 then
passed. The expanded final 58-case scope also passed. Diagnostic console output was removed. No failed
attempt is represented as successful or added to the final distinct counts.

## Recovery and independent review

Frontend builds/UI/browser checks, hosted CI, full Backend-stage closeout, production settings provisioning
and provider/deployment acceptance: **Not Run**, outside the affected task scope. Production inventory list
availability remains conditional on its approved settings prerequisite. No milestone is self-approved.

Independent project-owner review accepted this implementation and evidence on 25 October 2026:
“Review করেছি—accept করছি, Done করো”. P04-018 is Done under
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting). Verification history, production settings
prerequisite and scope limits above remain unchanged.
