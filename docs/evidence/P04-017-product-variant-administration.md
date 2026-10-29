# P04-017 — Product and variant management APIs

**Date:** 25 October 2026
**Executor:** Codex
**Status:** Done; accepted by project owner on 25 October 2026
**Revision:** Working-tree implementation against `bb4cf099ff060ef894a968b207f2ba0c5dc1e4de` (accepted P04-016).
P04-016 changes present at kickoff were preserved and committed by the owner during this task.

## Approved contract decisions

Sources: [Tasks](../TASKS.md) P04-017/FR-06/FR-23, [API §14.1](../API.md#141-catalog-categories-and-variants-admin),
[Database §§6.2–6.3](../DATABASE.md#62-products--catalog), Architecture §§4–6, Testing CAT-09.
Prerequisites P04-002 and P04-016 are accepted. This work stays within the Backend stage.

Two pre-existing API gaps conflicted with usable management and the one-or-more-SKU data invariant.
Before implementing those changes, the owner explicitly approved:

- “Atomic variants[] contract গ্রহণ করছি”: ProductCreateInput adds required 1–100 VariantCreateInput entries;
  product/initial SKUs commit atomically. A no-options product uses one attributes:{} default SKU.
- “Detail-এ variants[] গ্রহণ করছি”: the existing single-product GET returns AdminProductDetail, adding
  bounded active/inactive variants to AdminProduct. Other product response allowlists remain unchanged.

API/Database owning sections were reconciled, and the executable registry imports actual runtime schemas.
The 164-operation inventory now contains 59 implemented/105 planned operations. Seven previously planned
routes became implemented; the existing variant PATCH was expanded and moved, not registered twice.

## Behavior and ownership

Catalog-owned routes/services implement protected product list/create/detail/edit/deactivate, variant
creation/edit/deactivate, pricing, featured/search metadata and public image references. All browser
mutations require admin session/Origin/CSRF; the auth-owned transactional capability rechecks the principal.
DTOs omit raw models/internal rating fields. Lists are bounded, stable newest/ID and literal name/slug search.
Create returns 201, product Location and ETag; editable reads/writes carry strong revision headers.

- Creation reuses canonical product/variant schemas and category ancestry guards, retaining one-or-more
  configured SKUs and active-ancestry/active-SKU rules. Normalized slug/SKU/combination conflicts roll back
  the entire aggregate, including category/auth fences and any attached media.
- Configured variants remain bounded to 100 and share canonical option keys. Default/options do not mix.
  SKU/attribute identities are creation-time fields; product/variant edits reject stock, revision, rating,
  ownership and undeclared fields. Variant counter defaults are zero, not fabricated opening stock.
- Product patch revalidates category assignment and active eligibility. Deactivation is non-destructive;
  historical identities remain. There is no new product/variant DELETE route.
- Variant patch supports current regular/sale price, status and threshold; omission preserves values and
  null clears only sale/threshold. Complete merged prices must satisfy sale <= regular; money is integer
  poisha. Concurrent last-active-SKU deactivation has one winner under the parent-product fence.
- Variant edits and canonical stock movements advance parent revision in the same transaction. Product
  detail includes variant/stock data, so its ETag must also change when these change. Exhausted parent
  revisions abort stock/movement effects rather than overflow. Conservative bumps can invalidate an
  admin edit during inventory activity; refresh after 412. Existing inventory/coupon/review consumers
  were regressed because this shared counter capability changed.
- Full variant PATCH now lives only in catalog; inventory retains list/adjustment/history. The old
  threshold-only handler/capability was removed and its existing tests now exercise the catalog handler.
  URL, null/zero semantics, stock safety and CAS are preserved without competing routers or forwarding wrappers.

Media owns identity/eligibility/canonical URL and slot references. Product galleries are at most 12 distinct
public images, with positions and slots derived from order. Omitted galleries are preserved; [] detaches.
Replacement detaches old slots and attaches new slots within the outer transaction, supporting reorder at
40-reference capacity without temporarily exceeding it. Metadata, ledger and audit commit together; no
provider request/deletion occurs inside it. Image mutations require explicit verified media composition;
metadata-only APIs do not enable media or waive P04-003. Category/media/audit private models remain private;
controllers delegate to the catalog service. No package, collection or frontend code was added.

## Setup and recovery

After build, `node --env-file=.env backend/scripts/bootstrap-catalog.mjs` explicitly prepares strict product/
variant persistence, category indexes and canonical audit for local/test only. Compatible reruns preserve
records/extra indexes; existing mismatched validators require reviewed migration. It refuses staging/production,
seeds no products/stock/media, and does not change provider activation. Reviewed deployment uses the owning
initializers under existing operational controls. HTTP startup/requests do not repair schema/index state.

Rollback must move matching routers, registry, generated artifacts and services together, preserving product/
SKU identities, stock/movements, references, audit and any historical order snapshots. No destructive down
migration is needed. Existing category-only bootstrap remains supported. API, Database, Operations and Testing
were edited in their owning sections; Tasks/Changelog record execution separately.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, isolated MongoDB 8.0.16 replica sets and generated database/URI.
Synthetic users/products/media/order capabilities only; protocol/provider fixtures are explicit doubles.
No application .env database, live provider, real payment, frontend build or browser was used.

| Command | Observed result |
| --- | --- |
| `npm run api:generate --workspace=backend` | Passed; four artifacts |
| `npm run test:contract --workspace=backend` | Passed; freshness/router parity and all 72 cases, including approved atomic-create/detail/map schemas |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/product-admin.test.ts tests/integration/inventory-admin.test.ts tests/integration/inventory.test.ts tests/integration/inventory-allocation.test.ts tests/integration/coupon-allocation.test.ts tests/integration/products.test.ts tests/integration/composition.test.ts tests/integration/media.test.ts tests/integration/catalog.test.ts tests/integration/reviews.test.ts` | Passed; 195 cases in 10 files: 25 product-admin, 22 inventory-admin, 15 inventory, 16 allocation, 28 coupon-allocation, 14 products, 5 composition, 19 media, 24 catalog, 27 reviews |
| Same integration runner scoped to `tests/integration/product-admin.test.ts -t 'galler\|media/ancestry'` | Passed; 3 cases including one new capacity boundary; 23 intentionally unselected. Ran after final gallery algorithm refinement |
| Same integration runner scoped to `tests/integration/product-admin.test.ts -t 'price edits with real'` | Passed; one additional actual stock/price race, 26 intentionally unselected; final distinct integration coverage: 197 |
| `npm run test:unit --workspace=backend -- tests/unit/product-admin.test.ts tests/unit/products.test.ts tests/unit/catalog.test.ts tests/unit/inventory-admin.test.ts tests/unit/inventory.test.ts tests/unit/inventory-allocation.test.ts` | Passed; 64 cases |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run lint --workspace=backend` | Passed; 223 files |
| `npm run build --workspace=backend` | Passed before compiled-script tests; final build passed after gallery refinement |
| `npm run test:smoke --workspace=backend` | Passed; real DB startup, restricted health, redacted invalid configuration and graceful shutdown |
| `npm run test:security` | Passed; zero secret findings and zero locked dependency advisories |
| `npm run lint`, task-count/prerequisite audit and `git diff --check` | Passed; 520 files/1,314 local links, zero documentation errors; accepted records/external gates retained |
| `npm run api:check --workspace=backend` | Passed; final artifacts fresh |
| `npm run lint:boundaries` | Passed; 247 files, zero errors |
| `npm run format:backend` | Passed; 237 files |

Assertions cover safe normalized DTOs/Location/ETag, initial atomicity, all configured variants in detail,
strict/protected inputs, inactive ancestry, duplicate slug/SKU rollback, cross-admin stale edits, variant
mode/combination consistency, merged nullable prices/thresholds, public price/description/search/visibility,
last-active-SKU races, gallery identity/eligibility/reorder/removal, image/auth/audit rollback, default-disabled
media, absent indexes, actual root activation and compiled additive bootstrap/production refusal. Canonical
stock/detail ETag and exhausted-parent rollback are tested, with real allocation/coupon/review regressions.
The capacity case uses explicit synthetic historical ledger references; it is not real provider evidence.

Local artifacts (ignored): `test-results/P04-017/initial-integration.json` preserves the first failed 45-case
run; `integration-195.json` preserves the successful expanded regression; `gallery-followup.json` and
`stock-price-followup.json` retain the final focused checks. Distinct counts reuse unaffected passing cases;
they are not a claim that a single 197-case suite ran after the final gallery-only change.
The final repository security result is retained at `test-results/P04-017/security.json`.

## Failures and limits

Initial TypeScript/fixture errors (document-array input type and the moved handler's stale fixture property)
were corrected. A nested contract-test object syntax error was corrected before successful final checks.
The first integration run found three price/threshold CAS failures because variant revision advancement
was omitted. Explicit increment fixed them; all three focused cases and the subsequent expanded suite passed.
No test was weakened to permit stale updates. One expanded-suite permission review timed out before execution;
a single retry started and passed. This was not a test failure or a finding that the action was unsafe.
Final gallery refinement prevents transient capacity rejection and passed its affected rollback/gallery cases.

Frontend/UI/browser checks, hosted CI, full Backend-stage closeout, deployed index/provider/image acceptance
and real merchant/payment testing: **Not Run**, outside this backend package. P04-003 and P09-011 remain Blocked;
no external, application-stage or product milestone is self-approved. Product/price management does not verify
checkout/order historical snapshots; those remain their owning later tasks.

## Independent review

Independent project-owner review accepted this implementation and evidence on 25 October 2026:
“Review করেছি—accept করছি, Done করো”. P04-017 is Done under
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting). Approved contract decisions, verification
history, scoped follow-ups and external readiness limits above remain unchanged.
