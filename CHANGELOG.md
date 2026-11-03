# Changelog

**Version:** 1.0\
**Status:** Final development baseline\
**Updated:** 23 October 2026

Material documentation and development changes are recorded below; these are not application releases.
[Tasks](docs/TASKS.md) owns current status and the execution log. Linked evidence retains test results,
environment limits and independent acceptance. Historical UI or source layouts may be superseded by later entries.

## 4 November 2026 — PR #11 TypeScript 7 compatibility

- Resolve compiler entry points from the exported package manifest. Pin typescript-legacy to TypeScript 6.0.3 for the boundary checker and development watch API that TypeScript 7 no longer provides.

## 3 November 2026 — Explicit backend lint fix/check scripts

- Backend lint/format apply safe fixes; lint:check/format:check validate without edits. CI uses
  lint:check and enforces its inventory entry when that script exists.

## 3 November 2026 — Backend formatting, env examples and CI scope

- Added backend format/format:check scripts and executable CI coverage for backend JSON configuration.
- Populated local/staging env templates with illustrative values; preserved actual private configuration.
- Commented frontend/browser hosted steps for the owner-selected backend stage, retaining security,
  backend checks, image gate and future integrated verification requirements.
- [Changes and verification](docs/evidence/P03-021-backend-refactor.md#environment-examples-workspace-formatting-and-backend-stage-ci--3-november-2026).

## 3 November 2026 — Backend refactor closed; local configuration organized

- Organized env keys and local technical defaults, preserving private credentials and explicit feature
  admission. Grouped root/backend manifest scripts and dependencies without command/version changes.
- P03-030 Done after local regression/fixes and owner-directed Docker deferral. Image verification
  remains unverified; CI/release and P03-022/external acceptance are unchanged.
- [Closeout evidence](docs/evidence/P03-021-backend-refactor.md#owner-authorized-refactor-closeout-and-environment-cleanup--3-november-2026).

## 3 November 2026 — Backend final local verification and fixes

- Corrected detached proof IDs at auth persistence queries; updated existing route/stock parity fixtures.
  Recorded exact reviewed synthetic encryption-vector scanner fingerprints without broad exclusions.
- Local unit/contract/integration/tooling regression, compiled smoke, static checks and security pass
  through the recorded full run and affected rechecks. Docker image verification is blocked by daemon
  permissions; P03-030 remains In Progress, with no stage/provider/release acceptance.
- [Results, resolved failures and remaining blocker](docs/evidence/P03-021-backend-refactor.md#final-backend-verification-and-corrections--3-november-2026).

## 3 November 2026 — Backend outside-src structural closeout

- Migrated contract/operator/test consumers; organized suites by owner and split commerce scenarios
  into workflow files with reusable fixtures. Preserved generated API artifacts and operator commands.
- Synchronized Docker/CI script dependencies and retired stale boundary waivers; current boundaries,
  backend compilation/build/lint and API freshness pass.
- [Structural evidence and deferred verification](docs/evidence/P03-021-backend-refactor.md#outside-src-structural-closeout--3-november-2026).
  Runtime tests/review/fixes remain pending; P03-030 stays In Progress. No commit/push or release acceptance.

## 3 November 2026 — Backend src structural closeout

- Completed root-wired owner capabilities and reusable schema assembly; detached proof, notification
  and claim-media contracts. Finished Returns controllers and removed redundant constructor arguments,
  forwarding adapters, DTO duplication and generic/numeric handler names.
- Source compilation/lint/format Passed for 311 files; zero source boundary violations, active legacy
  allowances or type/runtime cycles. The unfiltered boundary gate still fails on 292 stale outside-src
  allowance entries, whose migration remains in the next batch.
- Recorded [source checks and the outside-src migration ledger](docs/evidence/P03-021-backend-refactor.md#src-structural-closeout--3-november-2026).
  Tests/review and outside-src consumers remain deferred; P03-030 stays In Progress. No Git/PR changes
  or backend/application/release acceptance.

## 3 November 2026 — Backend src architecture work in progress

- Separated server lifecycle from configured application composition; injected auth HTTP and audit
  capabilities, detached public DTO/provider/job contracts, and consolidated shared input validation.
- Standardized bottom exports across src. Source compilation, lint and format passed for 308 files;
  runtime imports are acyclic. Full src remains unfinished: 47 source boundary violations and stale
  allowance inventory still require resolution. Tests/review and outside-src consumers remain deferred.
- Updated the [existing P03-030 evidence](docs/evidence/P03-021-backend-refactor.md#remaining-src-architecture-work--ongoing-3-november-2026).
  No commit/push/branch/PR operations or application acceptance.

## 3 November 2026 — Whole-module structural batch

- Organized all twenty module owners, extracted wishlist, placed variants under products and separated
  payment attempts/collections and refund obligations/payouts. Consolidated cohesive services/schemas,
  separated HTTP handlers and moved audit/notification/delivery-exception routes to their owners.
- Module source count 275 → 251; source-only compilation/module lint/format passed. No tests executed,
  no test/contract/script/tooling edits, and no commit/push/PR changes in this batch.
- Recorded the [owner-directed staged sequence and remaining verification](docs/evidence/P03-021-backend-refactor.md#p03-030--whole-module-structural-pass-3-november-2026).
  Full src integration, outside-src consumer migration and consolidated behavior review remain pending.

## 3 November 2026 — Completed backend package review corrections

- Reviewed WP00–WP04 and corrected naming/cohesion gaps: consolidated credential/customer route files,
  account access and delivery coverage; aligned factories/types and all executable consumers.
- Recorded adopted-owner file conventions in Architecture/Refactor Plan; four source files removed,
  27 private-type allowances eliminated, no API/database/security behavior changed.
- Recorded [P03-029 findings and verification](docs/evidence/P03-021-backend-refactor.md#p03-029--completed-wp00wp04-review-and-corrections-3-november-2026):
  856 integration cases Passed alongside affected unit/contract/boundary and preservation checks.

## 3 November 2026 — Identity, customer and technical health refactor

- Injected order/audit capabilities into auth; introduced detached identity/notification contracts and
  customer HTTP controllers. Reused credential handlers and consolidated media-admin authorization.
- Moved health outside business modules, preserving HTTP behavior and executable route inventory;
  retained canonical models/security fences and removed 26 legacy boundary allowances.
- Recorded [WP04/P03-028 verification](docs/evidence/P03-021-backend-refactor.md#p03-028--wp04-identity-customer-and-technical-health-3-november-2026),
  including a corrected Markdown-spacing parser in the existing identity index test. No new test file,
  package, collection or feature activation.

## 3 November 2026 — Local Git recovery

- Recovered the exact original HEAD commit after zero-byte Git object corruption; preserved history,
  index and all 827 worktree files. Full object integrity verification passed after backed-up repair.
- Retained the original [WP03 verification record and recovery details](docs/evidence/P03-021-backend-refactor.md#p03-027--wp03-delivery-pilot-3-november-2026).

## 3 November 2026 — Delivery module refactor pilot

- Separated delivery HTTP controllers from middleware/route registration; root setup injects existing
  auth guards. Published narrow auth/delivery types and migrated coverage consumers off private types.
- Retained charge/coverage behavior and canonical persistence; normalized module exports and reused
  the shared digest. Seven legacy allowances removed; no new dependency or API/data contract.
- Recorded [WP03/P03-027 verification and limits](docs/evidence/P03-021-backend-refactor.md#p03-027--wp03-delivery-pilot-3-november-2026),
  including passing affected tests, targeted sandbox rechecks and an unreadable Git HEAD object.

## 3 November 2026 — Backend technical foundation refactor

- Moved session/browser option validation into existing configuration ownership; extracted reusable
  encryption/keyring and JSON digest mechanics while retaining auth-owned proof binding.
- Replaced service-derived operations configuration typing with an explicit orders public contract;
  removed five legacy allowances. No environment, API or persistence contract changed.
- Recorded [WP02/P03-026 checks and review](docs/evidence/P03-021-backend-refactor.md#p03-026--wp02-technical-foundation-3-november-2026):
  219 unit and 155 isolated integration cases plus compiled smoke passed; stage acceptance remains separate.

## 3 November 2026 — Backend refactor contracts and boundary enforcement

- Reconciled the selected module/file/dependency target in Architecture, Database, API, Implementation Plan
  and Testing; corrected the existing collection inventory to 39 without schema or runtime changes.
- Extended the existing checker/fixtures for public type contracts, private composition, inline/dynamic
  imports and source cycles. Added one exact migration data inventory with owning removal packages;
  new violations and stale allowances fail without waiving stock/provider/persistence safeguards.
- Recorded [WP01/P03-025 verification and limits](docs/evidence/P03-021-backend-refactor.md#p03-025--wp01-contracts-and-enforcement-3-november-2026),
  including three process-test failures reproduced on untouched HEAD and passing outside-sandbox reruns.
  Backend runtime inputs, generated APIs, feature activation and stage/external acceptance remain unchanged.

## 3 November 2026 — Backend refactor baseline inventory

- Completed WP00/P03-024 inventory and impact mapping: 491 backend files, 170 operations, 41 scripts,
  canonical persistence fingerprints and affected tooling/worker consumers; runtime code remains unchanged.
- Reused the [existing refactor evidence record](docs/evidence/P03-021-backend-refactor.md#p03-024--wp00-follow-up-baseline-3-november-2026)
  for selected baseline results, type-only coupling and collection/activation documentation discrepancies.
  Existing staged planning changes and all application/external acceptance gates are preserved.

## 3 November 2026 — Whole-backend refactor planning

- Added the [backend refactor plan](docs/BACKEND_REFACTOR_PLAN.md) covering the selected module boundaries,
  file/reuse conventions, dependency and workflow rules, complete migration packages, verification and rollback.
- Linked the plan from Implementation Plan §3.6 and identified owning-specification differences to reconcile
  before code changes. Documentation only; no backend refactor, task acceptance or release is claimed.
- Clarified refactor-only execution: preserve existing behavior, change files only for demonstrated reasons,
  reuse tests/records and select affected checks; missing features and unrelated fixes are separate scope.

## 2 November 2026 — Whole-backend implementation audit and API gap closure

- Audited all 170 specified operations against runtime; identified nine missing surfaces despite earlier task completion records.
- Implemented all nine missing operations: purpose-bound initial email verification, scoped delivery/payment histories, read-only coupon preview, protected receipt matching/allocation and customer refund submission. Added their owning typed contracts and regenerated OpenAPI/Postman.
- Customer requests retain unapproved plans without financial/unit holds or attempts; protected approval atomically rechecks and reserves actual capacity. Closed cancellation/delivery obligations use separate post-closure qualification. Added the exact-predecessor notification validator migration and safe activation procedures.
- Added all-170-operation runtime parity and complete application/worker/bootstrap verification. P03-023 tracks these gap closures; Promoted the 63 existing local-only operations to owning typed contracts, covering all 170 operations; actual HTTP scenarios validate response DTO/status/pagination parity. Corrected refund-group creation to specified HTTP 201 and excluded initial-verification identity proofs from admin resend. P03-022 retains real external/stage acceptance. No stage or external gate is self-approved.

## 2 November 2026 — Package G backend verification preparation

- Added explicitly admitted, leased media maintenance with retention/legal-hold safeguards and restart/uncertain-delete regression; composed standalone local/test public media independently of returns.
- Included payment/refund reconciliation and media worker entries plus reviewed staging scripts in the restricted runtime image context.
- Fixed the payment-bootstrap test's blocking child-process invocation; retained protected static bootstrap stage diagnostics.
- Started backend closeout verification; [current evidence and external acceptance limits](docs/evidence/P09-011-staging-runtime.md#package-g-verification). No hosted staging, media-policy approval or independent backend acceptance is claimed.

## 2 November 2026 — Package F backend operations completion

- Completed authoritative financial reports/dashboard and bounded sanitized operational queues using domain-owned source projections and explicit current cutoff/event dates.
- Added anonymous/scoped complaint intake and protected contact/response, customer histories/privacy decisions, safe notification retry admission and actual server composition.
- Connected protected final-delivery custody, one-time stock recovery and canonical source-funded refund through verified payout; added additive complaint/index rollout and recovery procedures.
- Recorded P06-016/017 and P09-002/014/015/016/017/018 engineering completion with [affected verification and review](docs/evidence/P06-016-017-commerce-delivery-support.md#package-f-completion). No external qualification, backend closeout or release claim.

## 2 November 2026 — Package E development completion

- Completed customer cross-order claim/refund history, exact guest/customer private refund reads,
  safe status/investigation timelines, separate merchandise/correction totals and explicit server activation.
- Connected review HTTP to canonical purchase/refund facts; resolved zero-price units without inventing payout,
  preserved historical reviews and retained moderation/auth/CSRF/privacy protections.
- Recorded P05-016/P08-016/P08-019 Done with affected replica-set/API regression and executor review;
  [evidence](docs/evidence/P05-016-P08-019-local-reads.md#package-e-completion). No deployed release or milestone claim.

## 2 November 2026 — Package D refund outcome and recovery

- Completed P08-009/010/011 with independently bound payout proof, atomic source/order/unit/delivery settlement and guarded review/reconcile/manual-confirmation APIs.
- Added explicit safe retry, qualified lost-reference recovery, consented manual fallback, original-transfer uniqueness and a durable lease/cursor reconciliation runner.
- Added transactional status-specific refund intents and verified return/refund worker composition; migrated only known notification predecessors and retained all history.
- Verified final 806 unit and 23 focused recovery cases, 446-case integration regression plus 313 checkout rerun, 112 contracts and 80 tooling cases. [Evidence and release scope](docs/evidence/P08-009-010-local-refund-evidence.md#package-d-completion).
- Narrowly classified a known English-prose scanner false positive; same-document credential detection remains verified. Counts: 122 Done, 9 Blocked, 77 Not Started, 2 Deferred; no real payout or release/milestone qualification claimed.

## 2 November 2026 — Package C refund foundation and dispatch

- Completed P08-005/006/007/008 with protected local/test policy configuration and canonical admin refund group/list/detail/gateway-attempt APIs.
- Bound gateway dispatch to the verified source merchant, retained payload conflicts across replay aliases and mapped exhausted unit capacity to the canonical refund-balance error.
- Combined the existing Package B prerequisite commit into main's working tree, preserving C changes and prior returnOptions compatibility; consolidated tests cover both packages.
- Recorded 802 unit, 396 integration, 112 contract and 79 tooling passes in [Package C evidence](docs/evidence/P06-013-P08-005-008-durable-reservations.md#package-c-completion). Counts: 119 Done, 12 Blocked, 77 Not Started, 2 Deferred. Outcome/recovery and live qualification retain their owning tasks.

## 1 November 2026 — Package B returns completion

- Completed P08-002/003/004: scoped eligibility/submission/private evidence and protected admin review, receipt, inspection and completion APIs.
- Added cumulative physical batches, parcel/key replay protection, accepted/rejected-unit resolution and atomic resellable-only stock restoration.
- Wired explicit local/test return and Cloudinary/ClamAV startup, protected exception configuration and additive exact-predecessor validator upgrade; synchronized API/database/testing/operations contracts.
- Recorded passing backend verification and executor review in [Package B evidence](docs/evidence/P08-003-004-local-return-inspection.md#package-b-completion). Counts: 115 Done, 16 Blocked, 77 Not Started, 2 Deferred. Live qualification and milestones retain their own gates.

## 1 November 2026 — Package A development closeout

- Owner approved separating ordinary development completion from live-release qualification; aligned the owning completion/testing instructions.
- Marked P06-003 and Package A P06-011/012/013/014 Done using the verified implementation, affected tests and executor review.
- Assigned outstanding policy/publication and actual cash qualification explicitly to existing P11-007/P11-008 release checklists; preserved runtime safeguards and stage/milestone gates.
- Counts: 112 Done, 19 Blocked, 77 Not Started, 2 Deferred; no production launch or external success claimed.

## 1 November 2026 — Prepaid delivery timing mapping

- Added optional reviewed prepaid delivery caps and separate courier-handover milestones, using canonical verified full-payment events rather than fulfillment timestamps.
- Propagated rules through quote/order snapshots, froze confirmation's funding event, and exposed current handover status through protected order projections.
- Added exact-predecessor additive local/test validator migration, schema/API compatibility and real payment/confirmation rollback coverage.
- No qualified policy review, actual cash receipt, deployed activation or independent task acceptance is inferred from automated verification.

## 1 November 2026 — Protected order-operation authorities

- Implemented protected original-receipt integrity/binding verification and configured deadline-registry checks.
- Wired explicit local/test server activation and request-bound funded-cancellation authorities without default financial evidence or review records.
- Added configuration, privacy/tamper, real server startup and cancellation replay/rollback coverage; real policy/cash qualification and full task acceptance remain outstanding.

## 1 November 2026 — Bangladesh policy preparation

- Inspected official Bangladesh digital-commerce sources and prepared Bangla order/delivery/COD policy text plus an original-receipt verification procedure.
- Recorded the missing full-payment/hourly-handover timing mapping; retained genuine policy review, deployed activation and task acceptance gates.
- Documentation/evidence only; no invented approval, financial receipt or env activation.

## 1 November 2026 — Package A order operations integration

- Added protected admin order list/detail, fulfillment-transition and COD collection HTTP with explicit root capability composition, customer history and funded cancellation.
- Reused historical projections, added bounded allocation/audit and collection balance projections, and mapped unavailable cancellation persistence to 503.
- Added real replica-set HTTP/race/replay/ownership coverage; qualified policy/cash authority, deployed activation and independent task acceptance remain outstanding.

## 1 November 2026 — Durable refund reservations and funded cancellation

- Added source/order/unit/delivery reservations, durable obligations/attempts and explicit additive local migration.
- Joined paid and partially collected COD cancellation with refund intents, allocation release and audit atomically; added explicit local cancellation HTTP.
- Added one-shot gateway dispatch that preserves held funds and original identity on uncertainty; corrected payment-monitor classification.
- Verified payout completion, reconciliation, real policy/provider evidence and full task acceptance remain outstanding.

## 1 November 2026 — Blocked backend task review

- Reviewed all 24 blocked tasks against current code, dependencies and acceptance evidence; retained explicit incomplete code and external approval blockers.
- Added real local review composition with delivered purchase, catalog visibility, admin fences and durable moderation replay.
- Added local customer search/detail and audited suspension/reactivation with atomic session revocation and rollback checks.
- Full task acceptance and external gates remain unresolved.

## 1 November 2026 — Private reporting and customer read foundation

- Added non-authoritative financial report arithmetic and an admin-scoped masked customer detail capability.
- P09-002/015 remain Blocked pending accepted prerequisites, full integration and independent review.

## 1 November 2026 — Local support and audit reads

- Added locally composed administrative complaint queue and redacted audit history with current-session checks.
- P09-016/017 remain Blocked on dependencies, remaining operations, query profiles and independent acceptance.

## 1 November 2026 — Local payment correction advisory

- Bound read-only correction calculations to verified, order-linked source balances and added deterministic multi-source planning.
- P08-006/007 remain Blocked pending prerequisites, atomic reservation and independent acceptance.

## 1 November 2026 — Local review visibility and administrator claim reads

- Added Catalog-owned review visibility checks and locally composed, admin-protected claim queue and detail reads.
- P05-016 and P08-019 remain Blocked pending accepted dependencies, full integration and independent review.

## 31 October 2026 — Local review and claim reads

- Added locally composed review reading, submission and moderation routes and scoped claim reads with private evidence metadata.
- P05-016 and P08-019 remain Blocked on accepted dependencies, full integration and independent review.

## 31 October 2026 — Local return decisions and review qualification

- Added transactional return-decision notification intents and proof-checked local delivery with no payout-success implication.
- Added transaction-fenced delivered-purchase review qualification and an additive notification-validator migration.
- P08-011/016 remain Blocked on refund prerequisites, integrated runtime and independent acceptance.

## 31 October 2026 — Private refund status and manual evidence checks

- Added redacted gateway refund status reports and non-authorizing retry assessment.
- Added two-phase admin and manual evidence verification; durable reconciliation, protected evidence sources and payout completion remain blocked.

## 31 October 2026 — Local multi-source refund planning and provider transport

- Added private, nonbinding multi-source unit/delivery refund plans with source and order capacity limits.
- Added isolated SSLCOMMERZ initiation transport; acceptance remains unverified and no runtime payout executor is enabled.
- P08-007/008 remain Blocked pending atomic reservations, durable attempts, prerequisites and provider-backed acceptance.

## 31 October 2026 — Private refund advisory

- Added read-only, single-source claim/order/payment refund calculations with original unit amounts and held/completed capacity limits.
- Added transient payout-attempt fact validation; full attempt persistence, multi-source allocation, reservation and payout remain blocked.

## 31 October 2026 — Private physical return inspection

- Added local receipt/inspection and transactionally restocked only selected inspected resellable units, with ordinal fences and replay/race protection.
- Extended explicit local/test validator upgrade; P08-003/004 remain Blocked on prerequisites, further receipt batches, partial-case resolution and integrated acceptance.

## 31 October 2026 — Private return eligibility and review

- Added scoped delivered-order eligibility, inclusive seven-day physical window and protected policy exceptions.
- Added private partial approval/rejection, exact unit release, shortage resolution and atomic private Media evidence attachment.
- Added strict lifecycle persistence, explicit additive local/test upgrade and race/replay/rollback/boundary checks.
- P08-002/003 remain Blocked on prerequisites and remaining physical lifecycle, HTTP and qualified integration work; no release acceptance implied.

## 31 October 2026 — CI scope and container-gate corrections

- Prose-only changes now run repository/security checks without unnecessary application/browser builds;
  executable API documentation retains backend coverage.
- PR scope uses merge-base diffs and includes both sides of moves; unavailable revisions fall back to full checks.
- Patched transitive follow-redirects 1.16.1 → 1.16.2 for GHSA-mrwp-f3q8-3g9p; security gates now run
  before expensive application suites and no advisory exception was added.
- Removed duplicate feature push/PR validation; main/tag pushes and manual runs retain full checks.
- Backend-only CI now enforces import boundaries. Affected image build/identity checks block the required CI job
  and share implementation with manual container verification.

## 30 October 2026 — Guarded staging catalog operation

- Added explicit reviewer-manifest transport for the independently approved additive catalog rollout
  on the existing free staging image, reusing canonical CLI/digest safeguards and encrypted results.
- Healthcheck processes skip operator actions; normal HTTP startup remains free of schema repair.
- Applied the owner-approved initial catalog schema/index plan on free staging; products/categories
  now return 200. Removed the temporary operator settings and retained encrypted verification evidence.

## 30 October 2026 — Free-demo staging inventory

- Added an explicitly selected staging-only encrypted read-only inventory preload for free Render
  environments without shell access. Verified actual missing catalog collections before proposing any DDL.
- Recorded the owner's free-demo deferral of hosted scanner/worker acceptance; launch gates remain intact.

## 30 October 2026 — Local container runtime verification

- Added a reproducible isolated Linux/Docker runtime verifier for health authorization, transactions,
  catalog initialization, graceful shutdown/restart and reservation-expiry CLI process restart.
- Verified the real local image without staging credentials or mutations; hosted acceptance remains separate.

## 30 October 2026 — Hosted media qualification

- Real public/private upload, delivery authorization, expiry/tamper denial and test-asset cleanup
  Passed after the owner's Cloudinary permission correction. Persistent runtime and task acceptance
  gates remain separate; no runtime feature flag was enabled.

## 30 October 2026 — Full synthetic media qualification preparation

- Added scanner-version/freshness checks and a scoped synthetic provider lifecycle fixture with
  persisted intent, bounded delivery checks and confirmed cleanup of only its own test assets.
- Added bounded loaded-signature probes after asynchronous scanner reload and fixed the synthetic
  PNG checksum. Hosted inventory now retains a fixed private connection-failure category.
- Added read-only catalog inventory mode with encrypted operator reports; existing staging apply
  approval and provider/policy acceptance gates remain intact.

## 30 October 2026 — Staging catalog rollout and media preflight

- Added read-only catalog inventory and an explicit reviewed initial staging rollout with stale-plan,
  existing-data, validator/index-conflict and report-overwrite protections; no HTTP auto-bootstrap.
- Added bounded read-only Cloudinary credential checks and a manual isolated ClamAV preflight workflow.
  Documented the selected nonproduction profile and preserved provider/policy/hosted acceptance gates.

## 30 October 2026 — Environment templates

- Organized the root local example and added sanitized staging and frontend examples. Documented
  which environment files are loaded and which are operator references; no credentials are tracked.
- Set an explicit valid SameSite example while keeping authentication and provider activation disabled.

## 30 October 2026 — Vercel Node runtime selection

- Declared Node 24.x and the existing npm requirement in both frontend manifests and lockfile
  workspace metadata so app-root deployments select the supported major before installing.
- Documented recovery from hosted Node 26 EBADENGINE failures while retaining root engine enforcement.

## 30 October 2026 — Render and Vercel deployment preparation

- Added a manual-deploy, disabled-feature Render staging Blueprint and per-app Vercel build
  configuration, including admin SPA deep links and locked root-workspace installation.
- Documented GitHub branch/protection setup, account provisioning, secret separation, hosted
  checks, cookie/domain prerequisites, free-plan constraints and rollback in Operations §5.8.
- Removed the duplicate quote lifetime entry and clarified plain sender-email syntax in the
  sanitized environment template. No provider, legal, application-stage or hosted acceptance implied.

## 30 October 2026 — Commerce notifications and delivery/support foundation

- Added atomic order-confirmation/cancellation/shipment/delivery intents and canonical commerce
  templates, exact predecessor migration and explicit local/test worker activation. Immutable event
  content remains stable across provider retries after later order changes.
- Added private delivery concerns, full-custody exceptional closure, inspected recovery receipts and
  scoped complaint/contact/resolution history. Missing protected proof or paid-refund planning denies
  unsafe closure; pre-shipment release is never reused for shipped goods.
- Recorded verification and remaining prerequisites for P06-016/P06-017; neither task or external gate
  is accepted as Done from local synthetic fixtures.

## 30 October 2026 — Cancellation foundation and owned order reads

- Added private cancellation request/admin-review/unpaid release with transaction fences, historical
  key replay and paid-order denial when source-backed refund obligations cannot be created.
- Added explicitly enabled local/test customer order list/detail/status APIs with exact guest scope,
  batched payment summaries, immutable snapshot/policy reads and public allowlists.
- Owner approved mandatory cancellation submission Idempotency-Key. Regenerated API artifacts;
  P06-013/P06-014 retain disclosed prerequisites and are not accepted as Done.

## 30 October 2026 — Private lifecycle and COD collection capabilities

- Added locally verified admin transition/deadline, atomic dispatch and immutable history guards,
  plus evidence-bound COD receipts with partial/excess accounting, replay and audit protections.
- Added cross-admin shipment/cash races and transaction rollback tests. Ordinary runtime activation
  remains absent; P06-011/P06-012 stay Blocked on disclosed prerequisites after owner-authorized
  local implementation. No qualified delivery approval, real cash evidence or task acceptance implied.

## 30 October 2026 — Payment monitoring and claim quantity foundation

- Added local/test current-admin payment list/detail, opaque unmatched/quarantined receipt views,
  and audited idempotent manual reconciliation requests consumed by the existing merchant worker.
- Added strict requested-claim persistence and transaction-bound exact unit protection shared by
  physical returns and shortages, with audit rollback and an explicit local/test bootstrap.
- Updated owning contracts and generated API artifacts; the owner independently accepted P07-018/P08-001.
  Return eligibility/lifecycle/media activation and provider/compliance/staging gates remain separate.

## 30 October 2026 — Pending backend review and blocker audit

- Revalidated seven pending checkout/guest/callback task reviews with 96 focused unit and 242
  transaction-capable integration cases; recorded current results in the existing evidence records.
- Corrected historical callback transport status to reflect accepted independent durable processing.
  The owner independently accepted all seven tasks; media/compliance/staging prerequisites remain Blocked.

## 30 October 2026 — Safe retries and verified payment notifications

- Added fresh independent reconciliation of prior attempts before a new charge, transactionally
  fenced lineage/ownership and capacity checks, and concurrent retry protection.
- Added atomic verified success/failure/pending outbox events, canonical recipient/receipt checks,
  stale negative suppression and explicit local/test payment-template activation.
- Added additive notification migration and focused transaction/race/delivery checks. The project owner independently accepted
  P07-013/P07-016; deployed provider/email and milestone gates remain separate.

## 29 October 2026 — Multiple paid attempts and durable reconciliation

- Classed new exactly verified excess/duplicate collections as correction with source-specific
  unreserved obligations, one capped merchandise funding/allocation and separate refund accounting.
- Added merchant-partitioned leased status reconciliation, durable scan/retry state, once-only
  investigation/resolution audits and guarded local/test worker entry. Timeout never proves Failed.
- Strengthened real lease fences around financial/recovery writes; verified duplicate, crash/restart,
  takeover, quarantine and compiled-entry paths. The project owner accepted P07-011/P07-012; deployed
  schedules, provider/timezone qualification, actual refunds and milestone gates remain separate.

## 29 October 2026 — Late-payment recovery and authorized risk decisions

- Added independently fenced late stock/coupon recovery preserving Paid on capacity failure, and
  cancelled-order correction-only receipts with immutable unreserved refund review intents.
- Added local/test admin risk decisions with current auth/CSRF, durable command replay and audited
  approve/reject. Allocation remains mandatory; duplicate provider flags do not replay an approval.
- Owner approved omitting unknown refund method/policy only before approval in an unreserved review
  intent. Added exact-predecessor payment validator rollout and canonical correction-intent bootstrap.
  The project owner accepted P07-009/P07-010; no live provider, payout, legal or milestone gate accepted.

## 29 October 2026 — Durable payment receipts and live allocation commitment

- Added local/test opt-in durable receipt processing with merchant-scoped deduplication, guarded
  attempt history and atomic payment/stock/coupon effects. Preserved uncertain, mismatched, unmatched,
  high-risk and expired outcomes without forced fulfillment or duplicate funding.
- Added replay-safe immutable security audits, conflict/risk handling and composed IPN acknowledgment
  after commit. Explicit-offset collection time is required pending approved provider timezone evidence.
- Added concurrent/retry/rollback coverage for P07-007/P07-008; the project owner accepted both tasks.
  External provider/legal/deployed gates remain separate.

## 29 October 2026 — Independent payment verification capability

- Added Payments-owned server verification using credential-bound validation/status queries and
  canonical attempt/merchant/order mapping. Classifies exact, partial/excess, unmatched and high-risk
  evidence without financial writes or callback acknowledgment.
- Added real replica-set/adapter mismatch, fraud, uncertainty and transaction-exclusion checks.
  P07-006 accepted by the project owner; durable receipt processing and live provider qualification remain separate.

## 29 October 2026 — Untrusted payment callback transport

- Added separate local/test IPN and GET/POST browser-return routes with narrowly scoped bounded form
  parsing, fixed storefront redirects and no financial/session authority from browser/provider hints.
- IPN acknowledges only an independently committed processing outcome; default remains retryable 503.
  Added keyed security fingerprints and service-owned protected rate admission without raw payloads.
- Updated form/plain-text/redirect API/Postman contracts and callback/CSRF isolation checks, plus an
  additive local audit/quota bootstrap. P07-005 submitted for review; no live verification or gate accepted.

## 29 October 2026 — Local hosted payment initiation

- Added durable owner/order request identities, one-shot hosted session dispatch and owned status
  reads with CSRF, current authorization and uncertainty recovery. No acceptance implies verified money.
- Added transactional expired stock/coupon reacquisition, durable capacity shortfall and current
  policy/risk/funding checks before reissuing a hosted URL; staging/live activation remains refused.
- Owner approved optional postalCode across address/quote/order, required before online initiation.
  Added exact-predecessor additive migration/local bootstrap without rewriting historical snapshots.
- Added financial race/crash/HTTP/migration coverage and regenerated API/Postman security contracts.
  P07-004 local/test scope accepted by the project owner on 29 October 2026; provider/callback,
  checkout and milestone gates remain separate.

## 29 October 2026 — Payment-method availability API

- Added public payment-method discovery with active-only filtering, canonical owned-order balance
  eligibility and customer/scoped-guest authorization; checkout quotes share verified capabilities.
- Added an operator-controlled channel evidence manifest with account/environment/digest/lifetime
  verification. Missing qualification keeps online channels unavailable; flags alone cannot activate them.
- Updated generated API/Postman artifacts and safety/contract checks. P07-003 accepted by the project owner on 29 October 2026;
  no hosted initiation, live merchant or milestone acceptance implied.

## 29 October 2026 — Private SSLCOMMERZ v4 adapter

- Added fixed-origin server-only hosted initiation, validation and session/transaction status transport,
  explicit environment-safe configuration, exact money conversion and redacted provider reports.
- Unknown transport/results remain uncertain, without automatic retry; provider calls are excluded
  from business transactions. Added unit and loopback HTTP/replica-set contract verification.
- P07-001 accepted by the project owner on 29 October 2026. No live merchant, payment HTTP, funding or channel activation implied.

## 29 October 2026 — Payment record foundation

- Added private attempt preparation with transactional retry lineage, unique provider references,
  remaining-balance snapshots and durable audit rollback.
- Added strict receipt intake/collection schemas, identity indexes, allocation/refund caps and
  additive local/test bootstrap. Provider initiation and receipt ingestion remain separate tasks.
- P07-002 submitted for independent review; no merchant or milestone acceptance implied.

## 29 October 2026 — Public homepage discovery API

- Added bounded featured/new-arrival/discounted sections and category discovery using existing catalog
  visibility/pricing rules. Public home includes configured contact/branding/banner and current approved
  policy links, with exact media slot/asset checks and no stored-URL publication or fabricated content.
  Reused protected settings/media updates; added root wiring and generated homepage API contracts.
  [Implementation and verification](docs/evidence/P04-019-storefront-home.md).

## 27 October 2026 — Reservation expiry and verified guest access

- Added a leased, bounded expiry worker with whole-generation stock/coupon release, payment/order
  fences, audit, restart-safe cursor and preserved financial history. Initial holds use actual placement.
- Added opt-in single-use email proof exchange, order-scoped guest sessions, guest CSRF/logout and
  authenticated encrypted delivery through the existing notification worker. Added explicit compatible
  notification migration, guest API contracts and expiry entry packaging.
  [Per-task verification and limits](docs/evidence/P06-010-015-expiry-guest-access.md).

## 27 October 2026 — Combined checkout allocation and COD feature

- Added coordinated stock/coupon allocation, opt-in COD submission with atomic Pending order/payment
  and order_received intent, plus private online 15-minute hold foundation. Added additive payment
  persistence and backward-compatible notification migration; generated COD/replay API contracts.
  Provider sessions, automatic hold expiry and commerce email dispatch remain owning later tasks.
  [Per-task verification and limits](docs/evidence/P06-007-009-checkout-batch.md).

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
