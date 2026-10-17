# Changelog

Notable **documentation changes** to SportZone are recorded here using the categories and unreleased section from [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Application release versioning and history are outside this document's current scope; expanding that scope requires an approved project decision.

**Status:** Documentation baseline; no application release has been verified.  
**Updated:** 16 October 2026

> **Versioning:** Individual specification versions (for example, `API.md` v1.1) identify **document revisions**, not application releases. The entries below do not claim implemented features, deployed services, Git tags, or completed tests.

## [Unreleased]

### Added

- Established the initial project specifications: [product requirements](docs/PRD.md), [architecture](docs/ARCHITECTURE.md), [design](docs/DESIGN.md), [database](docs/DATABASE.md), and [API](docs/API.md).
- Prepared the [implementation plan](docs/IMPLEMENTATION_PLAN.md), [task register](docs/TASKS.md), [testing specification](docs/TESTING.md), and [operations runbooks](docs/OPERATIONS.md).
- Created developer [README](README.md), coding-agent [instructions](AGENTS.md), and this changelog.

### Changed

- Reviewed and refined the documentation baselines, including API/database contracts, verification procedures, operational safety rules, and repository guidance.
- Consolidated all twelve documentation files into their intended root/`docs/` layout, corrected stale planned-document references and a database version-footer mismatch, and clarified the merchant/provider refund identifier distinction. These are **documentation changes only**, not evidence of executed implementation work.

### Fixed

- Documentation audit, 16 October 2026: reconciled API refund enums, signed cash-flow values, variant/session DTO summaries, optional-field notation, response preconditions and API/test operation profiles. Added the existing privacy-page requirement to policy-type contracts and corrected delivery-rule/deadline summaries.
- Replaced stale document-creation and workspace claims with the observed documentation-only inventory, consolidated README setup/script guidance and API payload ownership, and aligned scheduled policy/charge operations with their data contracts.
- Corrected test traceability and duplicate labels; standardized headings/navigation and preserved all requirement, task, scenario and milestone identifiers. Technical approval, application tests, Mermaid rendering and independent acceptance remain pending. Recorded unresolved checkout-confirmation and durable proof-email design decisions in API-D20/API-D21 and their task/test prerequisites. The audit did not change launch scope or approve a release.

## Maintenance rules

- Keep **Unreleased** first for documentation revisions awaiting acceptance. Add a dated documentation revision only when that revision is approved/published; use its actual date and document identifier. Do not turn specification versions into application release tags.
- Use only applicable categories: **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, and **Security**. Omit empty categories.
- Describe breaking API or database changes and reference verified migration/compatibility instructions when available.
- Link relevant task IDs, pull requests, commits, release tags, and verification evidence only when they exist.
- Record meaningful documentation contract revisions, but do not duplicate detailed task progress from [TASKS](docs/TASKS.md) or procedures from [OPERATIONS](docs/OPERATIONS.md).
- Never invent releases, dates, deployments, feature completions, migrations, provider activation, or test results.

The first application release version, release owner, approval workflow, and publication process remain undecided.
