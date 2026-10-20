# Changelog

**Version:** 1.0\
**Status:** Final development baseline\
**Updated:** 20 October 2026

This changelog tracks the documentation baseline. Application releases are recorded separately when software is released.

## Development changes — 20 October 2026

- Applied and read back protected-main required CI/review rules under owner authorization. Hosted Phase 01 verification exposed a WebKit desktop contrast failure; changed the audit to initialize the real stored theme preference before navigation and assert the desktop label's computed foreground before axe, retaining all contrast checks.

- Reconciled all seventeen Phase 01 tasks with the revised architecture; preserved sixteen existing acceptances and the P01-016 remote-evidence blocker. Added synthetic tooling-fixture failure diagnostics and corrected API-only local environment-loading guidance. Owner acceptance remains pending for phase closure. [Review record](docs/evidence/phase-01-reconciliation.md).

- Clarified the next execution step as P03-019 backend composition refactoring, followed by module and frontend refactors; hosted CI/settings closure remains separate and does not restart accepted tooling work or waive release gates.

- Reclassified P01-016 from In Review to Blocked after repeated confirmation that authenticated hosted CI/settings verification is unavailable; recorded the repository-owner recovery action. Current totals: 41 Done, 0 In Review, 1 Blocked.

- Recorded owner acceptance of P01-015 after document review; updated totals to 41 Done and 1 In Review. P01-016 closure review found no hosted CI run for current HEAD and unauthenticated branch-protection access, so its required verification remains open.

- Recorded project-owner acceptance of P01-017; marked the task Done and synchronized its checkbox, progress totals and acceptance evidence. P01-015/P01-016 and milestone statuses are unchanged.

- Implemented P01-017 root development coordination, a single backend compiler/watch loop and graceful API restarts, bounded owned-process cleanup, parsed import boundaries and scoped Biome formatting; reused existing pinned tool versions and added focused process/boundary regressions. Application business behavior and provider activation are unchanged. [Evidence](docs/evidence/P01-017-development-tooling.md).

- Simplified CI to one job and one locked install, reusing frontend builds for browser checks; removed reusable/composite workflow layers, workflow generation, cross-job aggregation and their obsolete tests. Defined change-based local verification to avoid repeated full-suite runs; application and security coverage remain required. P01-016 remains In Review pending hosted/settings acceptance.

- Implemented P01-016 inventory-driven local/hosted CI scopes, shared locked setup, root browser ownership, current-attempt report aggregation and failure/stale-report guards; added checksum-pinned secret scanning, dependency advisory policy and Dependabot configuration. Hosted/settings acceptance remains pending. [Implementation evidence](docs/evidence/P01-016-ci-governance.md).
- Corrected identity-contract test parsing to tolerate Markdown table alignment while retaining the exact 26-operation assertion; application authorization and public API behavior are unchanged.

## Engineering documentation revision — 20 October 2026

- Defined feature-based Next.js/Vite UIs and concrete Express modular-monolith modules with entity-prefixed model/validation/service/controller/routes/types files; retained MongoDB/Mongoose and existing security/financial contracts.
- Reconciled target/current path distinctions, auth/customer/variant/delivery/media ownership, UI composition/state/transport conventions, later TanStack Query/frontend Zod adoption, verification and operational recovery responsibilities across owning documents.
- Consolidated monorepo, locked dependency, CI job/aggregation/cache/security, development tooling and source-control/artifact promotion policies in owning sections; operational inputs remain explicit environment prerequisites.
- Added P01-015 (In Review) and P01-016–017/P02-012–013/P03-019–020 (Not Started); retained accepted task/milestone history. No application code, dependencies, data or deployments changed. [Verification](docs/evidence/P01-015-structure-decision.md).

## [1.0] — 17 October 2026

- Established the complete development baseline for product requirements, architecture, design, persistence and API contracts.
- Defined the implementation roadmap, 171-task execution register, verification scenarios and operating runbooks.
- Standardized document ownership, terminology, navigation and cross-references.
- Consolidated configuration guidance and retained stable requirement, task, scenario and operation identifiers.
- Completed P01-001 baseline verification with repository paths, source hashes and project-owner checklist acceptance.
- Completed P01-002 release-scope verification, exclusions, policy defaults and external decision records with project-owner checklist acceptance.
- Completed P01-003 clause-level functional and acceptance traceability, shared ownership, UI/API contexts and planned verification slots with project-owner register acceptance.
- Completed P01-004 NFR and release acceptance coverage, measurement prerequisites and milestone evidence controls with project-owner register acceptance.
- Completed P01-005 operator/external-service readiness register with accountable functions, environment states, evidence needs and safe next actions; project owner accepted the register.
- Completed P01-006 official-source gateway/refund planning assessment, credential/input requirements, verification checks and merchant-specific gates with project-owner acceptance.
- Completed P01-007 policy/customer-rights validation gates, official review sources and accountable launch-verification role with project-owner acceptance.
- Completed P01-008 safety-critical scenario ownership, exception/invariant coverage and verified dependency path with project-owner acceptance.
- Completed P01-009 minimal npm workspace foundation, generated lockfile, sanitized configuration template and verified README setup with project-owner acceptance.
- Completed P01-010 CI workflow, repository guards, tooling regressions and explicit application-check setup tracking with project-owner acceptance; local pipeline and hosted CI run 39039353486 passed.
- Completed P01-011 agent execution-rule review with project-owner acceptance; clarified pre-enable risk tests, external-call transaction boundaries and CI check inventory.
- Completed P01-012 task-status/evidence protocol with project-owner acceptance; clarified transitions/reopening and reconciled the initial unverified state and accepted task evidence.
- Completed P01-013 testing-baseline review with project-owner acceptance; reconciled requirement/risk ownership, actual tooling/commands, planned app suites and coverage/execution counts.
- Completed P01-014 operations-baseline review with project-owner acceptance; reconciled runbook/configuration handoffs, operational decision gates and executable-command prerequisites.
- Completed P02-001 Next.js storefront scaffold with TypeScript/Tailwind, public/private route boundaries, component/production smoke checks and activated storefront CI; project owner accepted the scaffold.

- Completed P02-002 React/Vite admin scaffold with TypeScript/Tailwind, unavailable-access SPA boundaries, DOM navigation and built-asset smoke checks; activated admin CI and recorded project-owner acceptance.

- Completed P02-003 shared light/dark semantic colors and Tailwind mappings across both apps, token/contrast regressions, built-CSS checks and rendered color comparison with project-owner acceptance.

- Completed P02-004 self-hosted licensed typography/Bengali fallbacks, shared spacing/radius mappings and exact integer-poisha BDT display utilities with font, formatting, built-asset checks and project-owner acceptance.

- Completed P02-005 Light/Dark/System appearance controls, persistent browser-local preferences, blocking pre-body bootstrap, same-origin tab synchronization and reduced-motion rules with interaction/hydration/HTTP checks and project-owner acceptance.

- Completed P02-006 responsive storefront header/footer, mobile disclosure and appearance menu, honest support/policy destinations, offline/loading/error/404 states and focused shell/HTTP checks with project-owner acceptance.

## Maintenance

Record subsequent documentation versions with their date, material changes and affected contracts. Keep application
release records, executed test evidence and deployment approvals in their respective release/task records. Exclude secrets
and personal data from change entries.
## Development changes — 18 October 2026

- Adopted HeroUI v3 for storefront/admin under the project owner's instruction and delegated UI design within the existing design specification.
- Added a shared semantic-token adapter and app-owned Button defaults; migrated storefront menu/close/retry controls and rendered disabled admin sign-in through HeroUI.
- Documented component ownership, visual review and incremental cleanup rules. Verification and review status: [HeroUI foundation](docs/evidence/heroui-foundation.md).

- Migrated existing Appearance controls, disclosures, router-aware links, page/admin/loading cards, spinner and offline/error alerts to HeroUI; added popup interaction coverage. Review: [existing UI migration](docs/evidence/heroui-existing-ui.md).

- Implemented P02-007 admin sidebar/mobile HeroUI Drawer, shared navigation groups, title/action shell, Appearance and offline/signed-out presentation; project owner accepted the task on 18 October 2026 after local verification; browser checks remain Not Run. Evidence: [admin shell evidence](docs/evidence/P02-007-admin-shell.md).

- Implemented P02-008 HeroUI field, form/error-summary, feedback and overlay foundations in both apps; reused them in Appearance/connectivity/loading consumers. Project owner accepted the foundation on 18 October 2026; browser/manual keyboard checks remain Not Run. Usage: [UI components](docs/UI_COMPONENTS.md); evidence: [form foundation evidence](docs/evidence/P02-008-forms.md).

- Implemented P02-009 HeroUI commerce cards, variants, bounded cart quantities, explicit status/availability, exact price/summary display and skeletons; real catalog/cart/checkout integration remains with its feature tasks. Evidence: [commerce primitives](docs/evidence/P02-009-commerce.md).

- Recorded project-owner acceptance of P02-009 commerce primitives on 18 October 2026; task marked Done with 203 passing tests, both builds and all 13 CI commands. Browser visual/native keyboard checks remain Not Run.

- Implemented P02-010 HeroUI admin table/filter/pagination, file upload and guarded confirmation foundations with both-theme state/keyboard tests; [verification evidence](docs/evidence/P02-010-admin-primitives.md) records the execution and acceptance state.

- Recorded project-owner acceptance of P02-010 admin primitives on 18 October 2026; task marked Done with 223 passing tests, both builds and all 13 CI commands. Browser viewport/native keyboard/file-picker checks remain Not Run.

- Added P02-011 cross-browser foundation audit tooling (Playwright 1.64.1, axe 4.14.0), isolated component fixture, mandatory CI inventory entry, browser installation and report artifacts; fixed both apps’ Cancel accessible names and the admin drawer close label, and made commerce money/summary foregrounds explicit for the WebKit audit; [audit evidence](docs/evidence/P02-011-accessibility.md) records viewport/theme/keyboard results and release-verification boundaries.

- Recorded project-owner acceptance of P02-011 foundation audit on 18 October 2026; task marked Done with all 30 browser cases and 14 CI commands passed. All eleven Phase 02 tasks are accepted; milestone M1 remains separately unaccepted.

- Implemented P03-001 Express/TypeScript transport scaffold, safe versioned envelopes/errors, Zod validation, bounded pagination, independent build/start and request/compiled-server smoke tests; activated backend CI checks. [Evidence](docs/evidence/P03-001-backend.md) distinguishes scaffold delivery from database, identity and deployment readiness.

- Recorded project-owner acceptance of P03-001 backend scaffold on 18 October 2026; task marked Done with 37 backend tests, independent build/compiled-server smoke and all 19 CI commands passed. Persistence, identity and deployment remain their owning tasks.

- Implemented P03-002 Mongoose connection/schema/index/transaction foundations, a real isolated MongoDB replica-set integration suite and an ephemeral local database tool; added mandatory integration CI/report artifacts. [Evidence](docs/evidence/P03-002-database.md) records scope and verification.

- Recorded project-owner acceptance of P03-002 database foundation on 18 October 2026; task marked Done with 24 real MongoDB integration cases and all 20 CI commands passed. Production/failover/restore and domain financial-flow verification remain their owning gates.

- Implemented P03-003 startup configuration/DB wiring, internal liveness and Bearer-protected readiness, secret-safe structured lifecycle/request logs and graceful shutdown; added configuration/health/redaction and real-runtime tests. [Evidence](docs/evidence/P03-003-operations.md) records local verification and operational boundaries.

- Recorded project-owner acceptance of P03-003 runtime/health foundation on 18 October 2026; task marked Done with 72 backend cases, 29 real MongoDB integration cases and all 20 CI commands passed. Deployment/operator gates remain separate.

- Established P03-017 identity persistence contracts: conditional scopes, session CSRF verifier/context audience, exact index names/options, private projections, guarded proof/address transitions and additive rollout/retention rules. Reconciled API and Testing handoffs; executable identity models remain P03-004. [Evidence](docs/evidence/P03-017-identity-contracts.md).

- Recorded project-owner acceptance of P03-017 identity persistence contract on 18 October 2026; task marked Done. Static contract checks passed; executable models and API/security behavior remain their owning implementation tasks.

- Implemented P03-018 strict identity request/response contracts for 26 operations, explicit service-policy injection, pure challenge freshness preconditions and registered safe identity errors; reconciled browser protection/replay and future guest handoffs in API/Testing. No live identity routes enabled. [Evidence](docs/evidence/P03-018-api-contracts.md).

- Recorded project-owner acceptance of P03-018 identity API contract on 18 October 2026; task marked Done with 73 new contract cases, 145 backend tests and all 20 CI commands passed. Runtime identity/session/security behavior remains with its owning tasks.

- Implemented P03-004 connection-owned identity/address/session/challenge/context models, strict BSON validators and ten named indexes; added expiry-aware lookups and transactional single-use user-challenge consumption with rollback/envelope removal. Added real replica-set schema/index/raw-write/expiry/concurrency tests and explicit bootstrap/migration guidance. [Evidence](docs/evidence/P03-004-identity-models.md).

- Recorded project-owner acceptance of P03-004 identity persistence implementation on 18 October 2026; task marked Done with 40 new real MongoDB cases, all 69 integration cases and all 20 CI commands passed. Public authentication/session/CSRF/recovery services remain their owning tasks.

- Implemented P03-005 opaque customer/admin sessions, kind-separated HMAC/CSRF material, atomic rotation/revocation and host-only secure cookie adapters with explicit lifecycle policy. Added real MongoDB/HTTP isolation, expiry, replay, rollback and cookie tests; updated API/data/operations configuration handoffs. No public auth route activated. [Evidence](docs/evidence/P03-005-sessions.md).

- Stabilized the existing browser navigation regression by waiting for the Appearance popover to close and selecting the Admin navigation dialog by accessible name; retained keyboard/focus/axe assertions and zero automatic retries.

- Recorded project-owner acceptance of P03-005 on 18 October 2026: “Session/cookie implementation গ্রহণ করছি”. Marked the task Done with its existing Passed evidence: 181 backend unit/contract tests, 89 MongoDB integration cases and all 20 CI commands. Public authentication and complete Origin/CSRF remain separate tasks. [Evidence](docs/evidence/P03-005-sessions.md).

- Implemented P03-006 exact audience Origin/CORS controls, short-lived hashed browser contexts, non-cacheable CSRF bootstrap router, conditional session CSRF refresh and transactional context consumption. Added strict guest adapter boundaries and negative/concurrency/rollback tests; synchronized API/data/testing/operations and sanitized lifetime configuration. Identity route activation and verified credentials remain in their owning authentication tasks. [Evidence](docs/evidence/P03-006-browser-security.md).

- Recorded project-owner acceptance of P03-006 on 19 October 2026: “Origin/CORS/CSRF implementation গ্রহণ করছি”. Marked the task Done with 198 backend tests, 120 MongoDB integration cases, 30 browser regressions and all 20 CI commands Passed. Verified credential routes, real guest persistence and deployed-origin verification remain with their owning tasks. [Evidence](docs/evidence/P03-006-browser-security.md).

- Implemented P03-007 customer registration/login/session/logout with owner-approved password policy, bounded versioned scrypt, transactional notification intent and context/session exchange, route guards and local abuse limits. Added explicit opt-in runtime activation and local/test persistence bootstrap; startup only verifies readiness. No email delivery or administrator login claimed. All 20 CI commands Passed with 209 backend tests, 138 MongoDB integration cases and 30 browser regressions. [Evidence](docs/evidence/P03-007-customer-auth.md).

- Recorded project-owner acceptance of P03-007 on 19 October 2026: “Customer authentication implementation গ্রহণ করছি”. Marked the task Done with 209 backend tests, 138 MongoDB integration cases, 30 browser regressions and all 20 CI commands Passed. Email delivery, administrator credentials and distributed/deployed security gates remain with their owning tasks. [Evidence](docs/evidence/P03-007-customer-auth.md).

- Implemented P03-008 customer profile/phone and saved-address ownership, transactional address/default limits, delivery-owned current coverage reads, verified deletion intake/status and historical-record preservation. Added pinned libphonenumber-js/max phone validation, shared safe account projection and unit/real-MongoDB ownership/concurrency checks; no user schema or financial mutation added. Clean locked install and all 20 CI commands Passed with 230 backend tests, 164 MongoDB integration cases and 30 browser regressions. [Evidence](docs/evidence/P03-008-profile-addresses.md).

- Recorded project-owner acceptance of P03-008 on 19 October 2026: “Profile/address implementation গ্রহণ করছি”. Marked the task Done with 230 backend tests, 164 MongoDB integration cases, 30 browser regressions and all 20 CI commands Passed. Operator retention processing, delivery master setup and frontend screens remain with their owning tasks. [Evidence](docs/evidence/P03-008-profile-addresses.md).

- Implemented P03-009 registration notification delivery with a server-only Resend adapter, durable fenced claims, bounded confirmed-rejection retries and explicit uncertain outcomes. Added additive known-schema migration, separate one-batch worker, nonproduction test-inbox routing, transaction-context external-effect guards and provider/replica tests. All 20 CI commands Passed with 258 backend tests, 183 MongoDB integration cases and 30 browser regressions. No live email or proof/commerce template activation claimed. [Evidence](docs/evidence/P03-009-notifications.md).

- Recorded project-owner acceptance of P03-009 on 19 October 2026: “Notification foundation গ্রহণ করছি”. Marked the task Done with 258 backend tests, 183 MongoDB integration cases, 30 browser regressions and all 20 CI commands Passed. Live sender/provider readiness and proof/commerce templates remain with their owning gates/tasks. [Evidence](docs/evidence/P03-009-notifications.md).

- Implemented P03-010 customer single-use password reset and authenticated password change, transactional scope/session revocation and cookie/CSRF replacement, versioned AES-GCM proof delivery, reference-only reset outbox, cooldown/response-floor controls and additive notification migration. Synchronized API/Database/Testing/Operations and sanitized activation configuration. All 20 CI commands Passed with 283 backend tests, 211 MongoDB integration cases and 30 browser regressions. Independent acceptance pending; live delivery, deployed key custody/abuse controls and frontend screens remain separate. [Evidence](docs/evidence/P03-010-password-recovery.md).

- Recorded project-owner acceptance of P03-010 on 19 October 2026: “Password recovery/change implementation গ্রহণ করছি”. Marked the task Done with 283 backend tests, 211 MongoDB integration cases, 30 browser regressions and all 20 CI commands Passed. Live delivery, deployed key custody/abuse controls and frontend screens remain with their owning gates/tasks. [Evidence](docs/evidence/P03-010-password-recovery.md).

- Implemented P03-011 customer-owned verified email change with normalized target, unchanged identity before proof, atomic unique-email confirmation/conflict rollback, session revocation/cookie clearing and purpose-separated encrypted reference-only delivery. Added independent activation/migration policy and cross-purpose invalidation on successful password reset/change while preserving reset envelope compatibility. API/Database/Testing/Operations and setup configuration are synchronized. All 20 CI commands Passed with 300 backend tests, 238 MongoDB integration cases and 30 browser regressions. Independent acceptance pending; live delivery, deployed key custody/ingress and frontend screens remain separate. [Evidence](docs/evidence/P03-011-email-change.md).

- Recorded project-owner acceptance of P03-011 on 19 October 2026: “Verified email-change implementation গ্রহণ করছি”. Marked the task Done with 300 backend tests, 238 MongoDB integration cases, 30 browser regressions and all 20 CI commands Passed. Live delivery, deployed key custody/ingress and frontend screens remain with their owning gates/tasks. [Evidence](docs/evidence/P03-011-email-change.md).

- Implemented P03-012 private initial administrator provisioning and independent admin login/session/logout/recovery, customer/admin verifier and AEAD isolation, admin-specific durable reset delivery and fail-closed activation. Added bounded stdin-only local/test provisioning with read-only persistence verification and additive known-predecessor notification migration. Updated API/Database/Testing/Operations and sanitized setup. All 20 CI commands Passed with 314 backend tests, 260 MongoDB integration cases and 30 browser regressions. Independent acceptance pending; production provisioning, live delivery, deployed ingress/audit and frontend gates remain separate. [Evidence](docs/evidence/P03-012-admin-auth.md).

- Recorded project-owner acceptance of P03-012 on 19 October 2026: “Private admin authentication implementation গ্রহণ করছি”. Marked the task Done with 314 backend tests, 260 MongoDB integration cases, 30 browser regressions and all 20 CI commands Passed. Production provisioning, live delivery, deployed ingress/audit and frontend gates remain with their owning tasks. [Evidence](docs/evidence/P03-012-admin-auth.md).
