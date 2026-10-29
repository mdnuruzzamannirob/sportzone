# P04-019 — Public homepage content and discovery

**Date:** 29 October 2026 (Asia/Dhaka)
**Executor:** Codex
**Status:** Done; accepted by project owner on 29 October 2026
**Revision:** Working tree against `e37587401539e27b53b5ce0e892a65a24fe642be` at review.
Working tree was clean at kickoff; no commit/reset/cleanup or external business mutation was performed.

## Scope and contracts

Sources: FR-03, API §10.1, Database §§6/10.4/11, Architecture §§4–6 and Testing §10.1/15.5.
P09-013 settings and P04-009 public catalog are accepted prerequisites. P06-003 qualified sign-off
and P05-016 return-eligibility dependencies remain separate; this work stays in the Backend stage.

GET /api/v1/storefront/home now returns bounded authoritative featured/new-arrival/discounted cards,
visible categories, optional configured public store metadata/banner and current approved policy links.
API §10.1 documents exact bounds, sort/discount rules and additive response fields before implementation.
Database banner wording, Testing assertions, Operations publication/recovery and Changelog were updated.
No new collection, migration, dependency, feature flag or frontend is introduced.

## Delivered behavior and ownership

- Catalog owns product/category selection and the home orchestration. Each product section has at most
  eight existing ProductCards, newest createdAt/descending-ID first. Featured requires the operator flag;
  discounted compares the displayed cheapest eligible SKU's effective/regular prices. No arbitrary
  sale flag or fabricated featured fallback qualifies a product. Sections may overlap.
- Existing active ancestry, valid active SKU, integer price, availability and approved media/rating
  allowlists are reused. Hidden/inactive/malformed ancestry fails closed. Up to twelve categories reuse
  existing sortOrder/ID ordering and public projections. Category reading is a shared private operation,
  keeping home callable without a dynamic this binding.
- Settings supplies only configured storeName/contact/complaintContact and eligible branding/banner.
  Private flags, thresholds, revisions, actor IDs and policy history never enter the home DTO. Missing
  configured content is omitted; missing required persistence returns SERVICE_UNAVAILABLE.
- Media retains canonical publication authority. PublicImageCandidate now supports exact settings
  slots; banner also binds its assetId to the ledger row. Clean/public/attached state, target identity,
  slot and generated safe HTTPS URL are checked on every read. Stored URL is never a fallback.
- Branding and banner use independent eligibility batches so sharing an asset cannot leak another
  slot's eligibility or override its alt text. Missing provider or unsafe generated URLs omit images.
  Private/quarantined/deleting/deleted assets cannot publish. Clearing a banner preserves the logo.
- Policies owns pointer/publication checks in its read transaction. Links include only the current
  approved effective published version, ordered by canonical policy type. Draft, scheduled, unapproved,
  superseded or noncurrent fallback content never becomes a link. href names the existing public API
  resource; frontend policy navigation remains its owning later presentation work.
- Root composition wires the real settings/policy/media/catalog capabilities. Existing authenticated
  settings CAS/media attachment updates remain the only configuration writes; changes appear on a later
  public read. Public home uses no-store, safe exact-origin CORS/HEAD and rejects bodies/query operators.
- Services retain private persistence; controllers only adapt HTTP. No session/customer/cart data,
  financial action, provider request or operational configuration mutation is performed by home reads.

## Observed verification

Environment: Node 24.20.0/npm 11.19.0 workspace, isolated MongoDB 8.0.16 replica sets.

| Command | Observed result |
| --- | --- |
| `npm run test:unit --workspace=backend -- tests/unit/catalog.test.ts tests/unit/settings.test.ts` | Passed: 25 tests / 2 files |
| `npm run test:integration --workspace=backend -- tests/integration/catalog.test.ts tests/integration/settings.test.ts` | Passed: 47 cases / 2 files |
| `npm run test:contract --workspace=backend` | Passed: 98 cases; 4 generated artifacts current |
| `npm run typecheck --workspace=backend` | Passed on final code/tests |
| `npm run build --workspace=backend` | Passed before final compiled bootstrap/smoke checks |
| `npm run lint --workspace=backend` | Passed: 300 files |
| `npm run lint:boundaries` | Passed: 299 files, zero errors |
| `npm run format:check` | Passed: 464 files |
| `npm run test:smoke --workspace=backend` | Passed with local process/socket permissions: real DB startup, safe invalid configuration, liveness/restricted readiness and graceful shutdown |
| `npm run test:security` | Passed: no secret findings; dependency audit zero vulnerabilities |
| `npm run lint` / `git diff --check` | Passed: repository links/structure and whitespace |

The integration suites include seven new home cases and existing catalog/settings/media/policy
regressions. One additional unit case covers strict home bounds/private fields/policy destinations.
Tests exercise real root wiring, protected admin updates, transactional media attachment/clearing,
independent alt text, exact slot/asset checks, unsafe/missing providers, valid private/quarantined/deleted
ledger states and policy publication/scheduled supersession. Existing catalog profiling on 1000 mixed
products also passes; this is not a production homepage latency/throughput acceptance claim.

[Generated integration report](../../test-results/database.json) and
[security report](../../test-results/security.json) are local artifacts replaced by later runs; this
record retains observed scope/counts. The executable inventory is 85 implemented / 79 planned of the
unchanged 164 operations. OpenAPI/Postman include the exact home response and blank environment values.

Initial type checks exposed a missing inert policy capability and raw fixture pull typing; these were
corrected. Initial integration was 46 Passed / 1 Failed because a media restore fixture reused its
pre-attachment reference snapshot. The fixture now reads current references and keeps strict BSON
validation intact; final suites passed. No failed check is represented as a passing result.

## Limits, recovery and review

Not Run: full backend-stage/integrated release regression, storefront/admin UI/browser checks, live
Cloudinary/scanner/provider activation or staging deployment. Synthetic public delivery and approval
fixtures prove projection/authorization behavior, not qualified legal or live provider acceptance.
P04-003 external media evidence, P06-003 sign-off and existing staging/milestone gates remain separate.

There is no destructive rollout or new provisioning. Existing catalog/settings/policy indexes and
singleton are required; media absence omits unverified images. Roll back root/DTO/generated contracts
with their matching readers; retain media references, policy history and configured operator content.
No data rewrite, forced reset, external upload/delete or deployment was performed.

The homepage backend task is accepted. Existing P06-006–010/015 reviews and all
other task/milestone decisions are unchanged.

## Independent acceptance

On 29 October 2026, the project owner instructed “done koro” after the implementation/verification
handoff. P04-019 moves In Review → Done on this independent acceptance. Closeout changes execution
records only; existing observed checks remain valid for unchanged implementation inputs.
Frontend presentation, live media/provider/staging evidence and milestone acceptance remain separate.
