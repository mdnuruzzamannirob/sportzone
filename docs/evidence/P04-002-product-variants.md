# P04-002 — Products and default/option variants

Date: 21 October 2026 (Asia/Dhaka). Executor: Codex. Status: Done.
Independent reviewer: project owner; accepted through explicit popup reply on 21 October 2026.
No milestone or provider acceptance claimed.

## Scope and source reconciliation

Dependency P04-001 is Done following recorded project-owner acceptance. Sources: PRD
FR-05/FR-06/FR-23; Architecture §§4–6 and shared-collection ownership; Database §§2.2–2.3,
4.2, 6.1–6.3; API §14.1/Appendix D.2; Testing CAT-01/CAT-02, §15.5; Implementation Plan
Phase 04. Earlier accepted category work was preserved; no unrelated source was edited.

- `backend/src/modules/products/product.model.ts`: one canonical registration per collection;
  bounded product metadata/search terms, ordered images, status/featured/rating projection,
  revision; variants with globally normalized SKU, canonical options/signature, integer poisha,
  optional sale/threshold, zero initial counters and revision. Declared unique slug/SKU/signature
  indexes and compound category/featured/status indexes. No automatic index synchronization.
- `product.validation.ts`: strict creation allowlists, existing default field limits, bounded
  internal batch/option maps, canonical normalization, one default versus homogeneous selectable
  options, sale bounds and rejection of stock/revision/rating input. Plain text descriptions;
  markup/control characters rejected. Sorted JSON tuple signatures avoid delimiter collisions.
- `product.service.ts`: atomic internal aggregate creation with at least one configured SKU;
  active product requires an active variant and active category ancestry. Uses categories'
  public transaction capability and exposes a products-owned category-reference reader. Every
  status protects its category references. No foreign model access.
- `product.persistence.ts`: explicit new-environment bootstrap, strict BSON validators,
  additive index installation/verification, preservation of extra indexes and refusal of
  existing validator drift. Not wired into HTTP startup; reviewed existing-data migrations
  and deployment/readiness integration remain separate work.

Database/API/Testing contracts document implementation limits and preserve canonical HTTP DTOs.
Operations records explicit bootstrap/rollback constraints. TASKS dashboard/log and CHANGELOG
record the engineering outcome without self-acceptance.

## Verification

Environment: local workspace Node/npm, generated isolated MongoDB 8.0.16 single-member
replica sets, snapshot/majority transactions. No external database configuration, real
customer records, merchant/provider calls or production mutation. Local port execution
used the approved sandbox escalation for real mongod fixtures.

| Command | Observed result |
| --- | --- |
| `npm run test:unit -w backend -- tests/products.test.ts` | Passed: 5 tests |
| `npm run test:integration -w backend -- tests/integration/products.test.ts` | Passed: 14 tests; generated `test-results/database.json` |
| `npm run test:integration -w backend -- tests/integration/products.test.ts tests/integration/categories.test.ts` | Category regression: 8 passed; initial product registration assertion failed, corrected and affected product suite rerun as above |
| `npm run typecheck -w backend` | Passed |
| `npm run lint -w backend` | Passed |
| `npm run lint:boundaries` | Passed: 142 source files, zero errors |
| `npm run format:check` | Passed: existing scoped baseline |
| `npm run lint` | Passed: repository/documentation/link checks |
| `git diff --check` | Passed |

Product integration cases: canonical registration/idempotent bootstrap/extra index retention;
default SKU and absent optional values; selectable combinations and variant prices/zero sale;
missing/inactive ancestry and invalid activation; concurrent normalized slug creation;
SKU uniqueness and complete batch rollback (including inactive SKU); concurrent shared SKU
across distinct products/categories; database default/option signature uniqueness;
Mongoose money/signature/counter validation; bounded ordered HTTPS image schema (validation
only, no attachment); raw BSON money/null/stock/shape rejection; product/category deletion
race; protected aggregate input rejection; existing validator drift refusal.

Unit cases exercise normalization/collision resistance, integer/sale boundaries, default/mixed
combinations, reserved map keys, normalized duplicates, raw `__proto__`, controls and size/batch
bounds, metadata normalization and protected/media/markup rejection.

During development, nullable model/test typing was corrected; canonical model lookup was
changed to reuse registered constructors; control validation was rewritten without lint-prohibited
regex escapes. A new raw `__proto__` negative case revealed that the record parser discarded that
key before validation; raw-key validation now runs first, and the case passes. Relevant failed
checks were rerun against the corrected inputs. No failure was waived or converted into a skip.

Not Run: full cross-project CI, frontend/browser/build/smoke suites (no frontend, entrypoint,
HTTP registration or configuration/dependency changes). Existing CI test globs already discover
both new test files; no scripts/check inventory changed. No external media/provider/deployed
acceptance is inferred from these focused checks.

## Boundaries and recovery

This task implements model/persistence foundations. It adds no public HTTP endpoint or UI.
P04-005 owns protected admin editing, ETags/audit, variant add/edit safeguards and real media
attachments; P04-009 owns discovery/projections/query profiling; P04-006/P04-008 own stock-only
capabilities and allocation mutations. Configured active variants start with zero availability;
this change alone does not make stock purchasable. Current aggregate creation accepts empty
images only, while the bounded image schema is ready for the media ledger integration.

No production/data migration or external side effect occurred. Remove the unused module/tests
to revert code; preserve records/indexes if later deployed. Bootstrap never replaces an existing
validator or drops an index. Task acceptance is recorded below; M2 acceptance remains separate.


## Owner acceptance

Reviewer: project owner. Date: 21 October 2026 (Asia/Dhaka).
Decision: accepted through the task-review popup — “Review করেছি—accept করছি, Done করো”.
P04-002 transitions In Review → Done with its checkbox checked. The recorded five unit,
fourteen product replica-set and eight category regression results remain applicable;
no application source changed for acceptance. Documentation-only acceptance checks:
`npm run lint` and `git diff --check` passed. M2 and later integration tasks retain their
separate acceptance requirements.
