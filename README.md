# SportZone

**Version:** 1.0\
**Status:** Final development baseline\
**Updated:** 23 October 2026

Single-store sports e-commerce platform for Bangladesh, using BDT. SportZone combines a customer storefront, a separate
administration portal and one authoritative backend API.

## Contents

- [SportZone](#sportzone)
  - [Contents](#contents)
  - [1. Product overview](#1-product-overview)
  - [2. Architecture and technology](#2-architecture-and-technology)
  - [3. Repository structure](#3-repository-structure)
  - [4. Development workflow](#4-development-workflow)
  - [5. Configuration and verification](#5-configuration-and-verification)
  - [6. Delivery and operations](#6-delivery-and-operations)
  - [7. Documentation map](#7-documentation-map)

## 1. Product overview

The initial release supports guest and registered shopping, products and variants, carts, wishlists, coupons, verified
reviews, order tracking, manual fulfillment, cancellation, returns, refunds and store administration.

Required payment methods are bKash, Nagad and Rocket through SSLCOMMERZ hosted checkout, plus store-managed Cash on
Delivery. Inactive channels are hidden; launch acceptance requires all four methods under [PRD §3.3](docs/PRD.md#33-release-boundaries).
Delivery is Bangladesh-only. Multi-vendor operations, native mobile apps, automated courier integration, live GPS tracking,
loyalty and international shipping are outside the initial release.

## 2. Architecture and technology

| Application / service | Technology                                               | Responsibility                                              |
| --------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Storefront            | Next.js App Router, React, TypeScript, Tailwind CSS      | Customer presentation, public rendering and API consumption |
| Administration        | React, Vite, TypeScript, Tailwind CSS                    | Store-management interface                                  |
| Backend               | Node.js, Express, TypeScript                             | Authentication and authoritative business services          |
| Persistence           | MongoDB, Mongoose                                        | Indexed records, conditional writes and transactions        |
| Payments              | SSLCOMMERZ and internal COD workflow                     | Verified collections, attempts and reconciliation           |
| Media / email         | Cloudinary / Resend or equivalent transactional provider | Controlled uploads and durable message delivery             |
| Repository            | npm workspaces                                           | Independent application builds and shared quality commands  |

The Express `/api/v1` API owns prices, stock, permissions, order transitions, payment verification and refunds. Frontends
consume allowlisted DTOs. Private sessions, carts, checkout, orders and financial data never enter shared caches.
The complete technology baseline, including API generation, containers, validation, jobs and tooling, is in
[Architecture §2](docs/ARCHITECTURE.md#2-technology-stack); this table is an orientation summary.

## 3. Repository structure

```text
sportzone/
├── storefront/       # Next.js customer application
├── admin/            # React/Vite administration application
├── backend/          # Express API, persistence and background jobs
├── shared/           # Existing pure utilities
├── scripts/          # Repository development and verification tools
├── tests/            # Repository tooling and browser tests
├── docs/             # Specifications, task register and evidence
├── AGENTS.md         # Contributor-agent workflow
├── .env.example      # Sanitized configuration template
├── package.json      # npm workspace manifest
└── package-lock.json # One locked dependency graph
```

[Architecture §§4–6](docs/ARCHITECTURE.md#4-project-structure) owns target paths, naming and module boundaries;
[Design §6](docs/DESIGN.md#6-ui-components) owns component contracts. Current application paths remain valid until
verified migration. The [refactor sequence](docs/IMPLEMENTATION_PLAN.md#36-engineering-foundation-and-incremental-refactor)
is foundation → backend → admin → storefront → integrated release, with verification and independent acceptance for each application stage. Tasks retains historical refactor evidence and assigns every unfinished task to its execution stage.

## 4. Development workflow

Use **Node.js 24.20.0 / npm 11.19.0**, as recorded in `.nvmrc` and `package.json`.
Read [AGENTS](AGENTS.md), the assigned [task](docs/TASKS.md) and its owning specification before editing.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run workspaces:check
```

Configure a transaction-capable MongoDB deployment through private root `.env` values `MONGODB_URI`
and `MONGODB_DB_NAME`. The application connects through Mongoose. For disposable local development,
keep the repository's replica-set tool running in a separate terminal:

```sh
npm run db:local --workspace=backend
```

Create a private root `.env` from [.env.example](.env.example), supply the MongoDB URI/database and
independently generated `SESSION_SECRET` and `HEALTH_MONITOR_TOKEN`. For the backend stage, start only
its compiler and API from the repository root:

```sh
npm run dev:backend
```

For integrated work across all three applications:

```sh
npm run dev
```

The coordinator starts storefront on `3000`, admin on `5173` and the API on `4000`. It owns application
process cleanup; the database terminal has a separate lifecycle. The API validates configuration before
opening HTTP. Only the API reads the optional root `.env`; existing process variables take precedence.
No credentials, persistence bootstrap or email worker are created automatically.

For database identity/network setup and deployment choices, see
[Operations setup](docs/OPERATIONS.md#52-reproducible-build-interface).
If the API exits after about five seconds with `startup_failed` / `CONNECTION_FAILED`, check database
reachability and access. When using `db:local`, keep its terminal running. Each restart prints a new URI; update
the private root `.env` `MONGODB_URI` to that URI before restarting `npm run dev`.
On Ubuntu 26, use `MONGOMS_DISTRO=ubuntu-24.04 npm run db:local --workspace=backend`.
`REPLICA_SET_REQUIRED` means the configured MongoDB lacks the required replica-set/session support.

For one UI, use `npm run dev --workspace=storefront` or `--workspace=admin`.
Inspect `npm run --workspace=<name>` for available commands.
Production smoke checks require a completed build; Vite preview is for local verification.

Run `npm run ui:showcase` and open [the UI preview](http://127.0.0.1:5180/showcase.html) to inspect
app-owned HeroUI components in both themes without a backend or sign-in. Stop it before browser tests
reserve port `5180`. The preview is excluded from production routes and builds.

## 5. Configuration and verification

Frontend builds read public `NEXT_PUBLIC_API_ORIGIN` and `VITE_API_ORIGIN` from their own process or ignored
`.env.local`. Root `.env` does not configure them. Align exact API Origin/CORS allowlists and HTTPS cookie
topology with [identity rollout](docs/OPERATIONS.md#browser-identity-rollout).
Never expose backend secrets through public frontend variables.
For local UI configuration, copy [admin/.env.example](admin/.env.example) to `admin/.env.local`
and [storefront/.env.example](storefront/.env.example) to `storefront/.env.local`, then adjust origins.
[.env.staging.example](.env.staging.example) is a sanitized staging reference; actual staging settings
and secrets belong in the hosting service environment, not in Git. Files named `.env.staging` or
`.env.vercel` are private references and are not automatically loaded by the documented dev command.
The server-rendered catalog also needs runtime `API_PUBLIC_ORIGIN` and `STOREFRONT_ORIGIN`; see
[catalog runtime](docs/OPERATIONS.md#storefront-catalog-runtime). Unconfigured catalog pages remain noindex.

Identity, recovery, notifications and media require explicit activation and prepared persistence. Follow
[Operations §13](docs/OPERATIONS.md#13-security--access-operations) and the
[configuration inventory](docs/OPERATIONS.md#appendix-b--configuration-inventory) before enabling them.
Startup does not migrate existing databases. Real provider readiness remains an external acceptance gate;
current status and blockers are recorded in [Tasks](docs/TASKS.md).

Select checks for the changed area using [Testing §15.5](docs/TESTING.md#155-change-based-local-verification):

| Scope                                  | Command                                                              |
| -------------------------------------- | -------------------------------------------------------------------- |
| Documentation and repository integrity | `npm run lint`                                                       |
| Repository tooling tests               | `npm run test:unit`                                                  |
| Source import and ownership boundaries | `npm run lint:boundaries`                                            |
| Workspace/tooling formatting           | `npm run format:check`                                               |
| Application checks                     | `npm run lint --workspace=<name>`, `typecheck`, `test:unit`, `build` |
| Backend database integration           | `npm run test:integration --workspace=backend`                       |
| Backend consolidated inventory         | `npm run ci -- --scope=backend`                                      |
| Browser verification                   | `npm run test:ui`                                                    |
| Security scans                         | `npm run test:security`                                              |
| Complete integration inventory         | `npm run ci`                                                         |

Backend integration tests own their isolated replica sets and never use the configured `MONGODB_URI`.
The first run downloads the pinned MongoDB binary. On Ubuntu 26, use `MONGOMS_DISTRO=ubuntu-24.04` for the
compatible binary. Browser tests require both frontend builds and installed Playwright engines;
see [Testing §7.5](docs/TESTING.md#75-ui-test-procedure) for scope and procedures.

CI uses `ci-workspaces.json` as its check inventory. Full results are written to `test-results/ci.json`;
scoped runs use `test-results/ci/<scope>.json`. Missing required checks fail. Local checks and synthetic
fixtures do not establish hosted deployment, provider activation or milestone acceptance.
Affected hosted selection uses backend checks without UI builds/browser installation for backend-private
changes, including accompanying documentation. Shared/tooling changes, manual runs and unknown paths
use the full inventory. Hosted evidence and acceptance are tracked in P01-022. Automatic OpenAPI/Postman
artifacts are generated through the backend commands below:

```sh
npm run api:generate --workspace=backend
npm run test:contract --workspace=backend
```

Import `backend/api/openapi.json` or `postman.collection.json`; use the blank
`postman.environment.json` privately. Set `baseUrl` to your API origin plus `/api/v1`, and set the
approved frontend origins/CSRF values for the intended namespace. Request bodies and optional query
parameters are editable placeholders. `planned-operations.json` records future specification surfaces;
it is not a runnable collection. [API §18.3](docs/API.md#183-change-and-sign-off-procedure) owns maintenance.

## 6. Delivery and operations

[Implementation Plan §11](docs/IMPLEMENTATION_PLAN.md#11-milestones--acceptance-gates) defines M1–M8;
M7 authorizes launch and M8 accepts handover. [Tasks](docs/TASKS.md) records current execution and acceptance.

[Operations](docs/OPERATIONS.md) owns deployment, activation commands, background workers, monitoring,
financial reconciliation, backup/restore and incidents. Use its current runbooks rather than commands copied
from historical task reports. Keep local, CI, staging and production resources separate.

## 7. Documentation map

| Document                                           | Owns                                                         |
| -------------------------------------------------- | ------------------------------------------------------------ |
| [PRD](docs/PRD.md)                                 | Product scope, business rules and acceptance                 |
| [Architecture](docs/ARCHITECTURE.md)               | Technology, boundaries and system invariants                 |
| [Design](docs/DESIGN.md)                           | Tokens, layouts, interactions and accessibility              |
| [Database](docs/DATABASE.md)                       | Collections, schemas, indexes, transactions and migrations   |
| [API](docs/API.md)                                 | Routes, DTOs, authorization, errors and retries              |
| [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) | Application stages, domain dependencies and milestones       |
| [Tasks](docs/TASKS.md)                             | Stable task IDs, execution status and evidence               |
| [Testing](docs/TESTING.md)                         | Scenarios, fixtures, tools and verification procedures       |
| [Operations](docs/OPERATIONS.md)                   | Configuration, deployment, recovery and operating procedures |
| [AGENTS](AGENTS.md)                                | Agent workflow and editing safeguards                        |
| [Changelog](CHANGELOG.md)                          | Documentation version history                                |

Use each document for its stated subject. Keep related contracts synchronized when behavior changes and preserve the
PRD's initial-release boundaries.

Deployment preparation and the owner checklist for Render API, Vercel frontends, GitHub branches and
post-deploy checks: [Operations §5.8](docs/OPERATIONS.md#58-render-and-vercel-staging-deployment).
