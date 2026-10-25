# P04-016 — Protected category management APIs

**Date:** 25 October 2026
**Executor:** Codex
**Status:** Done; accepted by project owner on 25 October 2026
**Revision:** Working-tree implementation against `ac4cee4584a20d008f0522c267c19008efdbebe8` (accepted P04-020).

## Scope and boundaries

Sources: [Tasks P04-016](../TASKS.md), FR-24, [API §14.1](../API.md#141-catalog-categories-and-variants-admin),
[Database §6.1](../DATABASE.md#61-categories--catalog) and §6.7, [Testing](../TESTING.md) CAT-08,
[Architecture §§4–6](../ARCHITECTURE.md#4-project-structure). P04-001/P03-013/P04-020 are accepted.
This work uses the approved local-capability split; P04-003 real media acceptance remains Blocked.

Implemented admin category list/create/PATCH/deactivate routes, strict schemas, current admin authorization,
Origin/CSRF, strong ETag/If-Match and transactional audit. List defaults to 20, caps at 100 and sorts by
sortOrder/ID. Create normalizes slug/name and returns 201; edits/deactivation return 200. Missing/stale
preconditions, unknown categories, invalid/protected fields and normalized slug conflicts fail safely.
There is no category DELETE route or destructive cascade. Existing internal deletion guards are retained.

Catalog-owned admin service orchestrates the existing category domain service within the auth-owned outer
transaction; no nested transaction or foreign model import was introduced. Existing standalone callers retain
their prior signatures/behavior through optional caller sessions. Hierarchy/active-assignment protection is
reused, with added bounded revision checks. Concurrent hierarchy writers cannot create cycles or overwrite
stale metadata; ancestor fences can invalidate earlier ETags. Deactivation retains dependent products/children
and hides their inactive ancestry from actual public catalog projections.

## Media integration and audit

Media owns publicId resolution, public/clean/status/expiry eligibility, canonical provider URL and ledger
attachment/detachment. The category controller never trusts a URL as approval proof or imports media models.
Reference replacement/removal and category metadata/CAS/audit commit atomically. Unknown/private/quarantined/
expired/deleting media cannot attach. Omitted image/parent are preserved; null removes the declared reference.
Omitted/blank image alt falls back to category name bounded to 120 Unicode characters. Same-image metadata
changes revalidate and retain one reference. No provider deletion/upload/lookup happens inside this transaction;
public URL construction is pure. Image removal releases only this target's image slot for later guarded cleanup.

The root creates one explicit media service for upload and category consumers when supplied verified
provider/scanner/policy dependencies. Without it, metadata operations work and image-bearing writes return
503. No environment flag, fake provider or policy approval is wired into ordinary startup. Real provider/privacy,
maintained scanner, retention/legal-hold and staging acceptance remain P04-003/P09-011 obligations.

Admin audit digests, actor/reason and target identity commit with the write; audit failure rolls back category,
ancestry fences, image references and auth fences. The embedded category image explicitly disables its Mongoose
version key so aborting an image-bearing create does not invent an undeclared version field. No BSON field,
collection or destructive migration was added. The canonical audit module remains the only audit writer.

## Setup and recovery

`node --env-file=.env backend/scripts/bootstrap-categories.mjs` after build is an explicit local/test-only
setup for declared category indexes and canonical audit persistence. It creates no category seed records,
preserves existing records/extra indexes, does not enable media and refuses staging/production. Requests and
startup never create/repair these indexes. Reviewed staging/production rollout uses the owning initializers
and existing migration controls; incompatible audit validators require a reviewed migration.

Roll back service/routes/registry/artifacts together while retaining category records, audit and media ledger
references. Reconcile any target/reference inconsistency through owners; do not delete assets or referenced
categories to force rollback success. External media effects are not part of these category transactions.

API/Database/Testing/Operations were updated in their owning sections. Generated OpenAPI/Postman now include
the four category operations: 52 implemented and 112 planned out of the unchanged 164-operation inventory.
No frontend, new package, provider account action or CI scope change was introduced.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, MongoDB 8.0.16 disposable replica sets; generated test database/URI,
real sessions/HTTP/indexes/transactions. Provider/scanner behavior and order data are explicit synthetic
fixtures. Application `.env` database and real Cloudinary account were not used.

| Command | Observed result |
| --- | --- |
| `npm run api:generate --workspace=backend` | Passed; four generated artifacts |
| `npm run test:contract --workspace=backend` | Passed; artifact freshness, router inventory and all 64 cases |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/category-admin.test.ts tests/integration/categories.test.ts tests/integration/media.test.ts tests/integration/composition.test.ts` | 26 admin + 8 hierarchy + 19 media + 3 composition Passed; two compiled-script composition cases initially failed during concurrent dist rebuild, corrected as below |
| Same integration command scoped to `tests/integration/composition.test.ts -t 'preserves compiled\|explicit compiled'` after build completion | Passed; both previously failed cases, three intentionally unselected |
| Same integration command scoped to `tests/integration/category-admin.test.ts -t 'compiled category bootstrap\|same-image'` | Passed; new bootstrap and existing image consumer, 25 intentionally unselected; final distinct integration coverage is 27 admin + 8 hierarchy + 19 media + 5 composition = 59 |
| `npm run test:unit --workspace=backend -- tests/unit/category-admin.test.ts tests/unit/media.test.ts tests/unit/catalog.test.ts` | Passed; 32 cases before the additional Unicode-alt assertion |
| `npm run test:unit --workspace=backend -- tests/unit/category-admin.test.ts` | Passed; final 5 category cases; 33 distinct unit cases including unchanged media/catalog cases |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run lint --workspace=backend` | Passed; 217 files |
| `npm run build --workspace=backend` | Passed |
| `npm run test:smoke --workspace=backend` | Passed; real DB startup, protected readiness, redacted invalid configuration and graceful shutdown |
| `npm run test:security` | Passed; zero repository secret findings and zero dependency advisories |
| `npm run lint`, task-count/prerequisite audit and `git diff --check` | Passed; 513 files/1,306 local links, zero documentation errors; accepted records/external gates preserved |
| `npm run lint:boundaries` | Passed; 244 files, zero errors |
| `npm run format:backend` | Passed; 231 files |

Integration assertions cover normalized uniqueness, bounded list/no-write reads, parent omission/root null,
missing parent/self/deep and mutual-cycle races, ancestor ETag invalidation, concurrent admin stale edits,
public inactive ancestry and active-association checks, no DELETE, real ledger attach/replace/detach,
same-image metadata/default alt, forged/unknown/private/quarantined/expired images, absent media capability,
audit rollback for both image creation and replacement, attachment-versus-cleanup race, revision exhaustion,
protected input/CSRF/role/suspension, missing indexes, real root activation and additive compiled bootstrap.

Failures are retained honestly: the contract fixture needed the new media capability method; the upload
fixture initially treated potentially uncertain upload fields as guaranteed strings and was narrowed after
checking readiness. The executor incorrectly ran build and compiled-entry tests in parallel: the initial
58-case report had 56 passes/two failures from reading incomplete dist. After the build finished, only those
two cases were rerun and passed. No product assertion was waived or unrelated full pipeline repeated.
Final Unicode-alt validation was aligned with the media boundary's codepoint bound, with a new unit case;
its image consumer, fresh contracts, types and build were checked afterward.

Local artifacts (ignored): `test-results/P04-016/integration-initial.json` preserves the failed 58-case report;
`composition-rerun.json` preserves the corrected two-case run; `category-focused-final.json` preserves the
final two-case category follow-up. These results are reused only for unchanged inputs, not summed as extra
cases or presented as a single all-green full-run report. The final repository security result is retained
at `test-results/P04-016/security.json`.

## Recovery and independent review

Frontend builds/tests, browsers, hosted CI, full Backend-stage closeout, live media and production/staging
rollout: **Not Run**, outside this task's affected local backend scope. The external gates remain unaccepted.
Independent project-owner review accepted this implementation and evidence on 25 October 2026:
“Review করেছি—accept করছি, Done করো”. P04-016 is Done under
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting). Verification history, scoped reruns and
external readiness limits above remain unchanged.
