# SportZone

**Project:** Single-store sports e-commerce platform for Bangladesh · **Currency:** BDT  
**Status:** Documentation baseline; application implementation not started in this checkout  
**Repository inspected:** 16 October 2026

SportZone is planned to provide a customer storefront, a separate administration portal and one authoritative REST API for a Bangladesh sports retailer. The backend will own prices, stock, order transitions, verified collections and refunds.

This checkout contains exactly the twelve Markdown documents listed below. It has no application directories, `package.json`, lockfile, `.env.example`, tests or CI workflows. The specifications describe intended behavior; their existence does not establish technical approval, implemented features or passing tests.

## Contents

- [1. Project overview](#1-project-overview)
- [2. Key features](#2-key-features)
- [3. Technology stack](#3-technology-stack)
- [4. System architecture](#4-system-architecture)
- [5. Project structure](#5-project-structure)
- [6. Prerequisites](#6-prerequisites)
- [7. Getting started](#7-getting-started)
- [8. Development and available scripts](#8-development-and-available-scripts)
- [9. Environment configuration](#9-environment-configuration)
- [10. Testing and quality assurance](#10-testing-and-quality-assurance)
- [11. Deployment and operations](#11-deployment-and-operations)
- [12. Documentation and project guidelines](#12-documentation-and-project-guidelines)

## 1. Project overview

The initial release serves one store, Bangladesh-only delivery, BDT, guests and registered customers, and one primary administrator role. Delivery charges are configurable; fulfillment updates are manual.

Required methods are **bKash, Nagad and Rocket through SSLCOMMERZ hosted checkout, plus store-managed Cash on Delivery (COD)**. Inactive channels stay hidden; missing activation blocks launch unless an approved product scope change revises the requirement. See [PRD §3.3](docs/PRD.md#33-release-boundaries).

## 2. Key features

All capabilities below are planned.

| Customer storefront | Administration portal |
| --- | --- |
| Catalog, categories, search, variants and reviews | Products, categories, media and inventory |
| Cart, wishlist, coupons and guest/account checkout | Orders, customers, delivery zones and charges |
| Hosted online payment, COD and verified order access | Payment monitoring, COD collection and reconciliation |
| Order tracking, cancellation, returns and refund tracking | Coupons, moderation, returns and refunds |
| Transactional updates, contact and policies | Settings, complaints, basic reports and audit history |

Scope exclusions include multi-vendor selling, native mobile apps, automated courier integration, live GPS tracking, loyalty and international shipping. [PRD §3](docs/PRD.md#3-project-scope) owns the full scope.

## 3. Technology stack

These are architectural selections, not installed dependencies. No versions can be verified without manifests and a lockfile.

| Layer | Planned technology |
| --- | --- |
| Storefront | Next.js App Router, React, TypeScript, Tailwind CSS |
| Admin | React, Vite, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript; modular monolith |
| Persistence | MongoDB/Mongoose; transaction-capable replica set |
| Authentication | Opaque server-managed sessions with secure cookies |
| Payments | SSLCOMMERZ hosted checkout; backend-managed COD |
| Media / transactional email | Cloudinary / Resend or approved equivalent |
| Repository | npm workspaces, Git, GitHub |

[Architecture §2](docs/ARCHITECTURE.md#2-technology-stack) owns the technology choices. [Testing §5](docs/TESTING.md#5-tooling--test-organization) records proposed verification tools; installation and compatible versions remain pending.

## 4. System architecture

Both web applications consume the same Express `/api/v1` API. Only backend services and their scheduled jobs access MongoDB and privileged provider APIs. Next.js handles presentation and public rendering; private data must not enter shared caches.

See [Architecture §3](docs/ARCHITECTURE.md#3-system-architecture) for the system diagram and trust boundaries, [Database](docs/DATABASE.md) for proposed persistence contracts and [API](docs/API.md) for proposed HTTP contracts.

## 5. Project structure

The current tracked layout is:

```text
sportzone/
├── README.md
├── AGENTS.md
├── CHANGELOG.md
└── docs/
    ├── PRD.md
    ├── DESIGN.md
    ├── ARCHITECTURE.md
    ├── DATABASE.md
    ├── API.md
    ├── IMPLEMENTATION_PLAN.md
    ├── TASKS.md
    ├── TESTING.md
    └── OPERATIONS.md
```

The future `storefront/`, `admin/` and `backend/` workspaces are specified in [Architecture §4](docs/ARCHITECTURE.md#4-project-structure). Their creation and tooling are tracked in [Tasks](docs/TASKS.md); no task or milestone is accepted by this inventory.

## 6. Prerequisites

Once foundation work begins, development requires approved compatible Node.js/npm versions, a committed lockfile, an isolated transaction-capable MongoDB environment, approved local origins, and sandbox service accounts for affected integrations. Exact versions, ports and account access remain pending.

Never use production credentials or customer data in local tests. [Operations §3](docs/OPERATIONS.md#3-environments--configuration-management) owns environment isolation and configuration requirements.

## 7. Getting started

There is no runnable application setup yet. Review [agent instructions](AGENTS.md), the assigned [task](docs/TASKS.md) and its source contracts before implementing a foundation slice.

After the workspace manifests, lockfile and environment templates exist:

1. Verify the approved Node.js/npm versions and workspace names in the committed configuration.
2. Install locked dependencies with `npm ci`.
3. Follow the actual sanitized environment templates; use only local/sandbox values.
4. Start the isolated MongoDB replica set and verify required indexes using implemented setup tasks.
5. Discover existing root and workspace scripts with `npm run` and `npm run --workspace=<verified-name>`.
6. Start the applications and jobs using those verified scripts. Check `/api/v1/health/live`, then restricted `/api/v1/health/ready` with authorized operational access, as specified in [API §16.4](docs/API.md#164-health-endpoints).

These are future setup steps. Commands, startup ports, seeding and entry-point URLs must be added and exercised when foundation work is implemented. The public repository URL has not been supplied.

## 8. Development and available scripts

**Available application scripts: none.** There is no root or workspace manifest from which to run development, build or test commands.

[Testing §5.3](docs/TESTING.md#53-standard-execution-interface-proposed-script-names) is the single proposed root script interface for lint, type checking, unit/integration/contract/E2E/security/coverage and builds. Record exact verified startup commands here after implementation. CI must fail when a required declared check is missing.

## 9. Environment configuration

Use separate local, CI/test, staging and production data, origins, provider modes and credentials. [Operations Appendix B](docs/OPERATIONS.md#appendix-b--configuration-inventory) owns the proposed configuration inventory; actual variable names must agree with future environment validators and `.env.example` files.

Never commit secret-bearing `.env` files, customer data or private keys. Browser-exposed `NEXT_PUBLIC_*` and `VITE_*` values must contain no secrets. Missing required API/worker configuration must fail safely; unverified payment channels stay unavailable.

## 10. Testing and quality assurance

[Testing](docs/TESTING.md) owns the strategy, scenario IDs, fixtures and evidence conventions. Financial and inventory concurrency checks require a real transaction-capable database. Mock results do not prove provider activation or release acceptance.

Application tests are unavailable in this checkout; none were run during this audit. Record actual commands, environment, outcomes, defects and evidence in the relevant [task](docs/TASKS.md). Follow [Design](docs/DESIGN.md) for responsive, keyboard, accessibility and both-theme verification.

## 11. Deployment and operations

[Operations](docs/OPERATIONS.md) owns deployment, configuration, monitoring, rollback, backups, restoration, incidents and operator procedures. Hosting, exact URLs, schedules, RPO/RTO, named owners and merchant activation remain pending decisions/evidence.

The intended delivery sequence is local development → isolated staging → gated production → handover. [Implementation Plan §11](docs/IMPLEMENTATION_PLAN.md#11-milestones--acceptance-gates) defines M1–M8: M7 authorizes production launch; M8 accepts handover. No deployment is claimed.

## 12. Documentation and project guidelines

| Document | Authority / purpose |
| --- | --- |
| [PRD](docs/PRD.md) | Product scope, business rules and acceptance |
| [Design](docs/DESIGN.md) | Visual tokens, UI behavior and accessibility |
| [Architecture](docs/ARCHITECTURE.md) | System boundaries, technologies and integrity invariants |
| [Database](docs/DATABASE.md) | Proposed persistence, indexes, transactions and migrations |
| [API](docs/API.md) | Proposed HTTP, DTO, security and callback contracts |
| [Implementation plan](docs/IMPLEMENTATION_PLAN.md) | Phases, dependencies and milestone gates |
| [Tasks](docs/TASKS.md) | Stable IDs, statuses, blockers and acceptance evidence |
| [Testing](docs/TESTING.md) | Verification strategy, scenarios and evidence conventions |
| [Operations](docs/OPERATIONS.md) | Deployment, recovery and operational procedures |
| [Agent instructions](AGENTS.md) | Coding-agent workflow and safeguards |
| [Changelog](CHANGELOG.md) | Documentation change history |

This README owns onboarding and navigation. Resolve conflicts by subject authority, preserve approved requirements, and record unresolved decisions before relying on proposed designs. Update affected data/API/test/operations contracts with each slice; task completion requires evidence and independent acceptance.

Do not publish credentials, customer information or exploit details in public issues. Maintainer contacts, incident destinations, license and branch/review rules remain unspecified; follow the approved operational process when established.
