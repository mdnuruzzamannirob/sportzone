# Changelog

**Version:** 1.0\
**Status:** Final development baseline\
**Updated:** 17 October 2026

This changelog tracks the documentation baseline. Application releases are recorded separately when software is released.

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
