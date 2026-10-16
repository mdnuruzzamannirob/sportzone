# Changelog

Notable changes to SportZone are recorded here following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). [Semantic Versioning](https://semver.org/) is proposed for application releases but is not yet approved.

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

## Maintenance Rules

- Keep **Unreleased** first. Move shipped changes into `## [X.Y.Z] - YYYY-MM-DD` only when an application release actually occurs; use the real release date.
- Use only applicable categories: **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, and **Security**. Omit empty categories.
- Describe breaking API or database changes and reference verified migration/compatibility instructions when available.
- Link relevant task IDs, pull requests, commits, release tags, and verification evidence only when they exist.
- Record meaningful documentation contract revisions, but do not duplicate detailed task progress from [TASKS](docs/TASKS.md) or procedures from [OPERATIONS](docs/OPERATIONS.md).
- Never invent releases, dates, deployments, feature completions, migrations, provider activation, or test results.

The first application release version, release owner, approval workflow, and publication process remain undecided.
