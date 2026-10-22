# Changelog

**Version:** 1.0\
**Status:** Final development baseline\
**Updated:** 22 October 2026

Material documentation and development changes are recorded below; these are not application releases.
[Tasks](docs/TASKS.md) owns current status and the execution log. Linked evidence retains test results,
environment limits and independent acceptance. Historical UI or source layouts may be superseded by later entries.

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
