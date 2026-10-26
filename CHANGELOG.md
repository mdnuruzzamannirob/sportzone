# Changelog

**Version:** 1.0\
**Status:** Final development baseline\
**Updated:** 23 October 2026

Material documentation and development changes are recorded below; these are not application releases.
[Tasks](docs/TASKS.md) owns current status and the execution log. Linked evidence retains test results,
environment limits and independent acceptance. Historical UI or source layouts may be superseded by later entries.

## 27 October 2026 — Durable checkout intent feature

- Added hashed scope/key intent identities, canonical submission fingerprints, current authorized
  outcome replay and transactional quote consumption/completion. Concurrent duplicate submissions
  resolve to one order; changed commands and duplicate quote keys conflict. Added strict durable
  registry validation, no-TTL readiness and additive local/test bootstrap. Production submission,
  allocation/payment/notification adapters remain separate.
  [Implementation and verification](docs/evidence/P06-006-checkout-intents.md).

## 26 October 2026 — Order snapshot foundation

- Added canonical immutable order snapshots, exact per-unit merchandise entitlements, independent
  fulfillment graph validation, transactional creation/audit and additive local/test persistence setup.
  Shared checkout consent hashing preserves quote compatibility. Submission, allocation, payment and
  operational transition integrations remain separate tasks.
  [Implementation and verification](docs/evidence/P06-005-order-foundation.md).

## 26 October 2026 — Authoritative checkout quote feature

- Added opt-in guest/customer quote APIs and public delivery-area discovery using current domain-owned
  data, explicit lifetime/policies and reviewed deadline basis. Quotes preserve scope-bound consent,
  stable allocation IDs and commercial hashes without stock/coupon reservations or provider effects.
  Added internal expiry/change/integrity revalidation, durable admission limits and compiled bootstrap;
  owner-approved product/category coupon scopes use AND. Actual order/financial consumption and legal/
  provider/staging gates remain separate.
  [Implementation and verification](docs/evidence/P06-004-checkout-quotes.md).

## 26 October 2026 — Delivery deadline policy boundary (local capability)

- Added immutable reviewed-rule capture, actual-event deadline/independent-cap arithmetic, separate
  estimates and safe under-review states. Added protected manifest validation and compiled technical
  preflight with no default legal rule. Qualified policy sign-off remains missing; no checkout/order
  API, confirmation mutation or legal approval is claimed.
  [Verification and blocked acceptance](docs/evidence/P06-003-delivery-deadline-boundary.md).

## 26 October 2026 — Delivery zone and charge management

- Added protected zone/charge APIs, the canonical store-wide coverage guard, immutable commercial
  versions, globally nonoverlapping windows and replay-safe supersession/closure. Added bounded
  activation/expiry worker, additive local/test bootstrap and generated contracts. Transactions
  cover window/zone/settings fences and audit; existing saved-address coverage remains compatible.
  [Implementation, tests and operational limits](docs/evidence/P06-001-delivery-management.md).

## 26 October 2026 — Store settings and public content APIs

- Added canonical settings bootstrap, protected contact/branding/banner/threshold/payment configuration,
  effective public policy/contact projections and transactional audit/media/CAS. Policy approval uses
  a protected operator evidence register; durable replay and bounded scheduled activation preserve
  prior versions. Clarified owning contact/evidence contracts and documented compiled bootstrap/worker
  procedures. No real legal/provider/staging approval is implied.
  [Implementation and verification](docs/evidence/P09-013-settings-public-content.md).

## 25 October 2026 — Product and variant administration APIs

- Added protected product/variant management, owner-approved atomic initial variants and full variant
  detail, pricing/threshold CAS, transactional galleries and audit. Parent revision fences preserve
  last-active-SKU rules and stock/detail ETags; one catalog handler owns variant PATCH. Added local/test
  catalog bootstrap and generated contracts. [Implementation and verification](docs/evidence/P04-017-product-variant-administration.md).

## 25 October 2026 — Category administration APIs

- Added protected category list/create/edit/deactivate with hierarchy/CAS guards and transactional
  media reference replacement/removal plus audit. Metadata remains usable with media disabled;
  image writes require verified capabilities. Added explicit local/test persistence bootstrap and
  regenerated API artifacts. [Implementation and verification](docs/evidence/P04-016-category-administration.md).

## 25 October 2026 — Separate local media verification from provider acceptance

- Added P04-020 as the independently reviewed technical prerequisite for category/settings work.
  P04-003 retains live media acceptance; backend/catalog closeouts explicitly preserve that gate
  and backend staging remains required. Existing local media checks were rerun without enabling
  a provider or changing application behavior.
  [Verification and queue decision](docs/evidence/P04-020-local-media-capability.md).

## 25 October 2026 — Backend container preparation

- Prepared a backend-only Docker recipe/context and credential-free liveness probe; isolated host
  build/dependency checks and probe tests pass. Image build and staging deployment remain blocked
  by Docker access and missing approved staging resources/configuration.
  [Observed evidence and resume prerequisites](docs/evidence/P09-011-staging-runtime.md).

## 25 October 2026 — Inventory administration APIs

- Added protected stock lists/threshold edits, replay-safe physical adjustments and bounded movement
  history with transactional audit. Fixed movement-actor transaction rollback and kept default threshold
  provisioning with canonical settings. Generated API artifacts describe activation limits.
  [Implementation and verification](docs/evidence/P04-018-inventory-administration.md).

## 25 October 2026 — Coupon administration APIs

- Added protected coupon configuration, revision-based edits/deactivation and bounded usage history.
  Configuration and canonical audit facts commit together; live hold terms and authoritative counters
  remain intact. OpenAPI/Postman now include coupon CAS headers and ETags.
  [Implementation and verification](docs/evidence/P05-015-coupon-administration.md).

## 25 October 2026 — Authenticated cart merge

- Added guest-selection merge with maximum-quantity deduplication, safe per-item exclusions,
  current catalog revalidation and transactional capacity/overflow rollback. Generated OpenAPI
  and Postman artifacts include the protected endpoint.
  [Implementation and verification](docs/evidence/P05-014-cart-merge.md).

## 24 October 2026 — Review eligibility and moderation foundation

- Added owned review creation/editing with a default-deny purchase guard, one-active-review index and
  strict persistence. Audited moderation preserves authored ratings, resets actual edits to pending,
  reconciles approved catalog ratings transactionally and protects later edits from old approval replay.
  Added explicit local/test bootstrap; production purchase/audit adapters and HTTP integration remain
  with their owning tasks. [Implementation and verification](docs/evidence/P05-009-review-guard.md).

## 24 October 2026 — Durable coupon allocation primitives

- Added strict coupon/redemption/customer-counter persistence and transaction-scoped reserve, COD
  redeem, hold commit and exactly-once release. Generation and order-bound coupon identity prevent
  replay/reacquisition drift; bounded conditional writes protect global/customer capacity. Added an
  explicit local/test bootstrap and verified shared inventory/coupon rollback and expiry coordination.
  [Implementation and verification](docs/evidence/P05-007-coupon-allocation.md).

## 24 October 2026 — Coupon eligibility policy

- Added coupon activation/window/minimum and global/customer usage checks with safe errors,
  live-hold term preservation and compatible-only post-expiry revalidation. Policy evaluation is
  read-only; durable quota reservation/release and exposed coupon APIs remain their owning tasks.
  [Implementation and verification](docs/evidence/P05-006-coupon-eligibility.md).

## 24 October 2026 — Catalog pricing and coupon allocation

- Added promotions-owned integer pricing over catalog-owned current base/sale prices, exact percentage
  rounding and stable item-level largest-remainder coupon allocation. No HTTP route, reservation or
  financial persistence was added; eligibility and quota handling remain their owning tasks.
  [Implementation and verification](docs/evidence/P05-005-pricing-allocation.md).

## 24 October 2026 — Authenticated persistent wishlist

- Added customer-owned wishlist read/add/remove APIs with unique membership, a 200-product bound,
  strict indexed persistence and safe unavailable-product markers. The explicit local/test shopping
  bootstrap now initializes carts and wishlists additively. OpenAPI/Postman include the three routes;
  wishlist operations do not reserve stock or change carts.
  [Implementation and verification](docs/evidence/P05-004-persistent-wishlist.md).

## 24 October 2026 — Authenticated persistent cart

- Added customer-owned cart read/set/remove APIs, strict indexed persistence and local/test bootstrap.
  Reads refresh catalog estimates and flag unavailable selections; mutations serialize transactionally
  without reserving stock. Generated OpenAPI/Postman contracts include these three routes; merge remains
  separate. Corrected unrelated task evidence placeholders accidentally populated by the foundation update.
  [Implementation and verification](docs/evidence/P05-002-persistent-cart.md).

## 24 October 2026 — Foundation readiness verification

- Verified clean locked installation, backend-only development/check selection, isolated replica-set
  persistence and generated API contracts. Updated the compatible body-parser resolution to 2.4.0
  for GHSA-27r3-jxmh-p828; compiled smoke verifies malformed compressed-body rejection and continued
  liveness. External inputs remain pending with accountable roles and explicit affected gates.
  [P01-024 verification](docs/evidence/P01-024-foundation-readiness.md).

## 23 October 2026 — Generated API contracts

- Added domain-schema-backed OpenAPI/Postman generation, sanitized templates and separate planned-route
  inventory. Backend CI now requires artifact freshness, actual router parity and schema/negative checks.
  Corrected media upload status and address creation Location to the approved API contract.
  [P01-023 verification](docs/evidence/P01-023-api-artifacts.md) records results and independent review status.

## 23 October 2026 — Backend development and CI isolation

- Added supervised `dev:backend`, selected-workspace inventory validation, backend formatting and
  comma-separated CI scopes. Hosted path selection avoids UI/browser setup for backend-private work
  and preserves full verification for shared/tooling changes and manual dispatch.
  [P01-022 verification](docs/evidence/P01-022-scoped-development-ci.md) records local results and the
  owner-authorized task-branch publication and successful hosted verification (all 23 commands);
  P01-022 is Done following explicit independent owner acceptance. Main was not merged.

## 23 October 2026 — Documentation consistency correction

- Reopened P01-021 after owner feedback. Consolidated the technology baseline, separated MongoDB/Mongoose
  from hosting choices, corrected collection inventory and catalog freshness rules, and reconciled
  application-stage prerequisites with milestone acceptance. Removed task diaries/status duplication from
  specifications, organized deployment procedures and corrected uncertain email-delivery verification.
  Task dependencies are shorter with identical prerequisite reachability; accepted history is retained.
  [Correction review and checks](docs/evidence/P01-021-documentation-refactor.md#complete-document-correction).
  Runtime, credentials and CI behavior were not changed. The owner independently accepted the corrected
  package on 23 October 2026; P01-021 is Done.

## 23 October 2026 — Application-stage documentation reconciliation

- Reconciled application-stage execution, module ownership, scoped verification and current setup procedures.
  Decomposed mixed API/UI work into explicit prerequisites and corrected reverse stage dependencies;
  foundation/backend/admin/storefront closeouts cover the revised 209-task register. OpenAPI/Postman and
  scoped hosted CI remain implementation tasks. The owner accepted the revised P01-021 package on
  23 October 2026; the task is Done and prior acceptance history is preserved.

## 23 October 2026 — Database startup diagnostics

- Preserve safe database reason codes in startup failure logs without logging driver errors or secrets.
  Clarified local replica-set lifecycle and URI refresh steps for development connection failures.

## 23 October 2026 — Catalog freshness and SEO foundation

- Added request-time, credential-free public SSR, configured canonical metadata/structured data, readable
  slug/category URLs and stock disclaimers. Global early loading fallback was removed so confirmed missing
  resources return 404 before streaming; refresh keeps local pending feedback. Verified actual Next
  freshness/privacy and responsive themes. P04-011 was independently accepted by the owner on 23 October 2026 and marked Done.
  [Evidence](docs/evidence/P04-011-catalog-seo.md).

## 23 October 2026 — Product detail API

- Added public slug detail with approved multi-image galleries, active variant combinations and derived
  quantities, visible categories, and up to six eligible related cards. Reused catalog visibility and
  media publication boundaries; no new collection, index or purchase mutation. The owner accepted
  P04-010 on 23 October 2026. [Evidence](docs/evidence/P04-010-product-details.md).

## 23 October 2026 — Public catalog discovery

- Added public product search/filter/sort/pagination and visible category reads, safe public projections,
  media-owned publication checks and additive query-profiled indexes. Reused the canonical category
  model and root API composition. The owner accepted P04-009 on 23 October 2026; storefront/detail/cache and
  external media gates remain separate. [Evidence](docs/evidence/P04-009-public-catalog.md).

## 23 October 2026 — Inventory allocation primitives

- Added transaction-scoped reserve, direct COD commit, held-stock commit, expected-state release and
  shipment operations with durable reservation generations and atomic movement history. Added private
  stock-capability guards and focused race/rollback tests. The owner accepted P04-008 on 23 October 2026;
  checkout/payment/order orchestration and admin inventory UI remain separate.
  [Evidence](docs/evidence/P04-008-inventory-allocation.md).

## 23 October 2026 — Verification cadence

- Clarified focused verification per task and one consolidated regression at phase closeout, coordinated
  by the final unfinished task. Required safety tests, external gates and independent acceptance remain intact.

## 23 October 2026 — Inventory counter foundation

- Added narrow catalog stock access, atomic safe-integer counter guards and transactional append-only
  inventory movements with replay protection. Verified concurrency, rollback and persistence protection
  on isolated MongoDB; HTTP/UI adjustments remain a separate task. The owner accepted P04-006 on 23 October 2026.
  [Evidence](docs/evidence/P04-006-inventory-counters.md).

## 22 October 2026 — Source structure audit

- Simplification follow-up removes the forwarding notification job and redundant media composition/type files;
  setup wires actual services directly, and private context types stay with their consumers. Added a narrow
  forwarding-factory regression. The project owner accepted this P01-020 follow-up on 23 October 2026.
- Corrected notification model/persistence/policy ownership, reduced its job to delegation, renamed auth assembly,
  isolated media dependency types and aligned formatter-test names. Removed preview type coupling; added source
  naming, job/configuration, composition and model-placement guards. Contracts and approved root layout remain
  unchanged; the project owner reviewed and accepted P01-020 through the popup. [Evidence](docs/evidence/P01-020-structure-audit.md).

## 22 October 2026 — Frontend and monorepo structure

- Refactored storefront routes/features/providers and admin routing/auth ownership; separated feature endpoints
  from transport/query defaults and reusable forms. Preserved existing URLs, native HeroUI and private-session behavior.
- Organized CI/dev tooling and e2e/helpers/tooling tests, declared pinned root fixture dependencies and strengthened
  ownership/required-check guards under one lockfile/inventory. Full-project recheck also made application smoke
  and backend integration inventory entries mandatory, with removal regressions. All applicable local checks passed; the project owner
  reviewed and accepted P02-015, P02-016 and P01-019 through the popup. [Evidence](docs/evidence/P01-019-monorepo-refactor.md).

## 22 October 2026 — Backend structure refactor

- Migrated existing backend runtime/shared/provider/script and auth/catalog/media ownership to the approved
  structure (P03-021). Added transitive boundary regressions, clean generated builds and backend formatting scope;
  updated test/worker/operator consumers and current runbooks. The project owner reviewed and accepted P03-021
  through the popup; no API/data migration, provider activation or milestone acceptance is implied.
  [Evidence](docs/evidence/P03-021-backend-refactor.md).

## 22 October 2026 — Documentation organization

- Consolidated project structure, naming and ownership in Architecture §§4–6 and UI component contracts in
  Design §6; removed the two standalone guides. The owner accepted P01-018.
  [Decision and acceptance](docs/evidence/P01-018-project-structure.md).
- Defined separate backend → storefront → admin refactors (P03-021 → P02-015 → P02-016). Documentation
  approval does not imply source migration or acceptance of those refactors.
- Removed duplicated implementation reports and stale status statements from specifications; placed browser-client
  rules, runtime configuration and verification guidance in their owning sections. Aligned Phase 02 typography with
  the approved native HeroUI system. Shortened README to setup/navigation and indexed test execution evidence.
- Consolidated this changelog into dated outcomes. Added in-place documentation maintenance rules to AGENTS,
  Implementation Plan and Tasks. Preserved requirements, stable IDs, acceptance records and EXT-04; no application
  source, credentials, data or deployment changed.

## 21 October 2026 — Catalog, media and identity foundations

- Added category hierarchy/CAS persistence (P04-001) and transactional product/default-option variant creation,
  canonical validators and unique SKU/slug indexes (P04-002). Both tasks received owner acceptance. HTTP/UI,
  inventory and public discovery remain separate integration work.
  [Categories](docs/evidence/P04-001-category-hierarchy.md),
  [products and variants](docs/evidence/P04-002-product-variants.md).
- Added the controlled media ledger, upload/attachment/deletion lifecycle, Cloudinary/ClamAV adapters and bounded
  reconciliation (P04-003). Local tests use provider/scanner doubles; EXT-04 account/policy and real-service evidence
  remain blocked. Default startup does not activate media.
  [Media evidence and blocker](docs/evidence/P04-003-controlled-media.md).
- Completed and accepted shared MongoDB identity throttles (P03-014), real customer/admin identity interfaces
  with private-cache and proof handling (P03-015), and foundation security verification (P03-016).
  [Throttles](docs/evidence/P03-014-auth-throttles.md),
  [interfaces](docs/evidence/P03-015-identity-interfaces.md),
  [security verification](docs/evidence/P03-016-identity-security.md).
- Completed and accepted typed backend runtime/worker composition (P03-019) and bounded auth/customer/delivery/
  notification-provider ownership (P03-020), preserving HTTP, persistence and external-effect contracts.
  [Composition](docs/evidence/P03-019-backend-composition.md),
  [module ownership](docs/evidence/P03-020-module-ownership.md).
- Corrected inherited-environment test isolation and Git-aware working-tree secret scanning without weakening
  history scanning or advisory policy. Task acceptance does not grant M1 or live/hosted provider acceptance.

## 20 October 2026 — UI defaults, refactors and CI governance

- Completed and accepted service-level ownership/role guards with transactional revocation fencing (P03-013).
  [Authorization evidence](docs/evidence/P03-013-authorization.md).
- Adopted native HeroUI defaults through app-owned UI/theme boundaries (P02-014), replacing the prior custom
  palette/fonts/adapter. Unified the actual-app preview and applied owner feedback to links, file selection,
  invalid radios and disclosure labels. Corrected premature closure by implementing and verifying the remaining
  contrast fixes; accessibility and release gates remain required.
  [Decision, corrections and acceptance](docs/evidence/P02-014-default-heroui.md).
- Iterated the local component showcase and original-HeroUI reference during owner review; the subsequent
  P02-014 decision governs the final app-owned preview and production UI policy.
  [Showcase history](docs/evidence/ui-component-showcase.md).
- Completed and accepted storefront route/layout placement (P02-012) and admin router/provider/layout placement
  with error recovery (P02-013), preserving route, privacy and browser behavior.
  [Storefront](docs/evidence/P02-012-storefront-refactor.md),
  [admin](docs/evidence/P02-013-admin-refactor.md).
- Established feature-based engineering conventions and explicit current/target path distinctions (P01-015).
  Added inventory-driven CI/security governance (P01-016) and coordinated development processes, import boundaries
  and scoped formatting (P01-017). Simplified CI to one job and one locked install while preserving required checks.
  [Structure decision](docs/evidence/P01-015-structure-decision.md),
  [CI governance](docs/evidence/P01-016-ci-governance.md),
  [development tooling](docs/evidence/P01-017-development-tooling.md).
- Resolved the initial hosted/settings evidence blocker, verified protected-main rules and hosted execution, and
  recorded owner acceptance of Phase 01. Milestone acceptance remains separate.
  [Reconciliation and acceptance](docs/evidence/phase-01-reconciliation.md).

## 19 October 2026 — Customer and administrator identity acceptance

- Recorded owner acceptance of Origin/CORS/CSRF protection (P03-006), customer credentials (P03-007), profile/address
  and deletion intake (P03-008), and durable registration notification delivery (P03-009).
  [Browser security](docs/evidence/P03-006-browser-security.md),
  [customer authentication](docs/evidence/P03-007-customer-auth.md),
  [profile/addresses](docs/evidence/P03-008-profile-addresses.md),
  [notifications](docs/evidence/P03-009-notifications.md).
- Recorded owner acceptance of single-use password recovery/change with encrypted proof delivery (P03-010),
  verified email change (P03-011), and private administrator provisioning/credentials/recovery (P03-012).
  [Password recovery](docs/evidence/P03-010-password-recovery.md),
  [email change](docs/evidence/P03-011-email-change.md),
  [administrator identity](docs/evidence/P03-012-admin-auth.md).
- These slices retain explicit activation, compatible persistence rollout, namespace isolation and fail-closed
  handling of uncertain delivery. Live inbox, deployed ingress/key custody and operational acceptance are separate gates.

## 18 October 2026 — Application and identity foundations

- Introduced HeroUI and migrated existing interactive controls; the later 20 October native-default decision
  supersedes the initial custom token adapter.
  [Foundation](docs/evidence/heroui-foundation.md), [control migration](docs/evidence/heroui-existing-ui.md).
- Completed and accepted the admin shell (P02-007), form/feedback/overlay foundations (P02-008), commerce display
  components (P02-009), management components (P02-010) and three-engine browser accessibility tooling (P02-011).
  [Admin shell](docs/evidence/P02-007-admin-shell.md), [forms](docs/evidence/P02-008-forms.md),
  [commerce](docs/evidence/P02-009-commerce.md), [management](docs/evidence/P02-010-admin-primitives.md),
  [browser audits](docs/evidence/P02-011-accessibility.md).
- Completed and accepted Express transport (P03-001), real replica-set database foundations (P03-002), and
  startup/health/logging/shutdown controls (P03-003).
  [Backend](docs/evidence/P03-001-backend.md), [database](docs/evidence/P03-002-database.md),
  [runtime operations](docs/evidence/P03-003-operations.md).
- Established and accepted identity persistence contracts (P03-017), strict identity DTO/schema contracts (P03-018),
  canonical identity models/indexes and atomic proof persistence (P03-004), and opaque sessions/cookie adapters (P03-005).
  [Data contracts](docs/evidence/P03-017-identity-contracts.md),
  [API contracts](docs/evidence/P03-018-api-contracts.md),
  [identity persistence](docs/evidence/P03-004-identity-models.md),
  [sessions](docs/evidence/P03-005-sessions.md).
- Began the customer identity, browser-security and proof-delivery slices whose owner acceptance was recorded on
  19 October. Detailed implementation/verification sequences remain in their task evidence and execution log.

## 17 October 2026 — Documentation baseline 1.0

- Established the PRD, Architecture, Design, Database, API, Implementation Plan, Tasks, Testing and Operations
  baseline, with stable requirement/scenario/operation IDs and the initial 171-task register.
- Completed and accepted requirements, scope, traceability, readiness, gateway/policy assessment, critical scenarios,
  workspace/CI setup, agent rules, task protocol and testing/operations reviews (P01-001–014).
- Completed and accepted initial storefront/admin scaffolds, appearance/typography foundations, theme persistence
  and responsive storefront shell (P02-001–006). Later entries record superseding visual decisions.
- Detailed test runs, reviewer decisions and limitations remain linked from the [task register](docs/TASKS.md).

## Maintenance

Add one concise dated entry per material outcome. Link to the owning decision/evidence instead of copying test
transcripts, status transitions, cumulative task counts or acceptance quotes. Keep this history chronological;
application release tags and production dates require actual release records. Exclude secrets and personal data.
