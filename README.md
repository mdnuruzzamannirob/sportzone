# SportZone

**Version:** 1.0\
**Status:** Final development baseline\
**Updated:** 17 October 2026

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

## 3. Repository structure

The repository contains the documentation set, runnable Next.js storefront and React/Vite admin scaffolds, and a private
backend workspace manifest. The Express runtime follows in Phase 03.

```text
sportzone/
├── storefront/                 # Next.js App Router scaffold, styles and tests
├── admin/                      # React/Vite SPA scaffold, styles and tests
├── backend/package.json        # Backend workspace
├── styles/tokens.css           # Shared semantic light/dark colors and Tailwind mappings
├── docs/                       # Product and engineering specifications
├── README.md
├── AGENTS.md
├── CHANGELOG.md
├── .gitignore
├── .npmrc                      # Reject unsupported runtime/tool versions
├── .nvmrc                      # Verified Node.js patch
├── .env.example
├── package.json                # Private npm workspace root
└── package-lock.json           # Locked workspace links
```

[Architecture §4](docs/ARCHITECTURE.md#4-project-structure) defines application/module boundaries.

## 4. Development workflow

1. Read [AGENTS](AGENTS.md), the assigned [task](docs/TASKS.md) and its owning contracts.
2. Install the workspace with the toolchain below, then scaffold the frontends and backend in Phases 02–03.
3. Configure isolated local/test resources, a transaction-capable MongoDB replica set and sandbox integrations.
4. Implement each feature with its API/data contracts, required UI states, tests and operating controls.
5. Run applicable checks, review the diff and attach evidence before task acceptance.

Verified toolchain: **Node.js 24.20.0 / npm 11.19.0**. `.nvmrc` selects the Node patch; `packageManager` records npm.
The engine ranges permit compatible updates within Node 24 / npm 11 and `.npmrc` enforces those ranges. If using nvm,
select the installed version with `nvm use`; otherwise provide these versions through your runtime manager.

From the repository root:

```sh
node --version
npm --version
npm ci
npm run workspaces:check
npm pkg get name private --workspaces
npm run
```

The install links the three workspaces and installs the storefront's exact locked dependencies. Initial installation
requires npm registry access; offline installation works only with a complete matching package cache.
`workspaces:check` lists `storefront`, `admin` and `backend` without missing dependencies.

Current root checks:

```sh
npm run lint
npm run test:unit
npm run ci
```

`lint` checks source JavaScript syntax, JSON, whitespace, Markdown tables/local links and targeted credential patterns.
`test:unit` runs the CI guard regression tests using Node's test runner. `ci` runs workspace discovery, repository lint,
tooling tests and every configured application check; it writes `test-results/ci.json`, including explicit workspace states.
Storefront and admin are active in CI; backend app checks remain Not Configured until P03-001.

Storefront commands, from the repository root:

```sh
npm run dev --workspace=storefront
npm run lint --workspace=storefront
npm run typecheck --workspace=storefront
npm run test:unit --workspace=storefront
npm run build --workspace=storefront
npm run test:smoke --workspace=storefront
npm run start --workspace=storefront
```

Dev/start bind to `127.0.0.1:3000`; stop one before starting the other. The production smoke command starts and cleans up
its own loopback server on an available port and requires a completed build. Development and builds use Next.js's supported
Webpack option. The scaffold includes public `/` and dynamic `/account` layouts; `/account` sends private/no-store and
noindex headers and displays only an unavailable-account placeholder. Authentication and Express integration follow in
Phase 03. The complete storefront, theme controls, typography and commerce flows remain owned by their later tasks.

Admin commands, from the repository root:

```sh
npm run dev --workspace=admin
npm run lint --workspace=admin
npm run typecheck --workspace=admin
npm run test:unit --workspace=admin
npm run build --workspace=admin
npm run test:smoke --workspace=admin
npm run preview --workspace=admin
```

Admin dev/preview bind to `127.0.0.1:5173` and fail if that port is occupied. Preview and smoke require a completed build;
preview is local verification, not a production server. `/` redirects to `/login`; `/app` and its nested routes show access
unavailable until backend session verification is implemented. Client flags never grant access. Unknown public routes
show a recovery link. Static hosting must serve `dist/index.html` for SPA navigation URLs while preserving real asset/API
handling; configure noindex and private/no-store document headers at the host. Local Vite headers are not deployment proof.
Full admin navigation and authentication remain owned by P02-007 and Phase 03 respectively.

`.github/workflows/ci.yml` runs on pushes, pull requests and manual dispatch with read-only repository permissions and
commit-pinned actions. It uses `.nvmrc`, npm 11.19.0, a locked install, `npm run ci` and a summary artifact; no deployment
or merchant secrets are required. A hosted run requires the repository to be connected and pushed to GitHub.

`ci-workspaces.json` tracks app setup against P02-001, P02-002 and P03-001. While a workspace contains only its manifest,
CI reports **Not Configured** for app checks. Adding source, scripts or dependencies requires switching it to `active`
and supplying real `lint`, `typecheck`, `test:unit` and `build` scripts. All listed checks run and any missing/failed script
fails CI. Add integration/contract/security/E2E/coverage suites to the inventory as their capabilities are implemented;
backend financial slices require the real replica-set integration and contract suites before acceptance.
[Testing §5.3](docs/TESTING.md#53-standard-execution-interface) defines the full required interface. A foundation CI pass
does not establish application or milestone readiness. Missing scripts must fail; never use `--if-present` to conceal them.

Both apps import `styles/tokens.css` for the 17 Design §2.2 colors. Use semantic utilities such as `bg-brand`,
`text-on-brand`, `text-text-muted` and `border-control-border`. Explicit root `data-theme="light"` / `"dark"` overrides the
system fallback; preference controls and persistence follow in P02-005. See [Design §2.2](docs/DESIGN.md#22-light-and-dark-color-system).

## 5. Configuration and verification

[Operations Appendix B](docs/OPERATIONS.md#appendix-b--configuration-inventory) defines configuration ownership, exposure
and validation. Separate local, CI, staging and production data, origins, credentials and provider modes. Keep secrets out
of Git, logs, artifacts and browser-exposed `NEXT_PUBLIC_*` / `VITE_*` values.

`.env.example` contains local-only origin conventions (storefront `3000`, admin `5173`, API `4000`), sandbox mode and blank
secret/approval-dependent values. Storefront and admin use ports 3000 and 5173 when started; the API origin remains a future local
convention. No application loads this template directly. MongoDB must use an isolated transaction-capable deployment. Add provider-specific keys with their
actual adapters and validators, keeping Appendix B and the protected per-key inventory synchronized.

Create service-local `.env` files only when configuring those services. `.gitignore` excludes local environment files,
credentials, dependencies, build output and test artifacts while retaining sanitized `.env.example` templates and lockfiles.
Review every template value before committing it; an example-file name does not make credentials safe to publish.

Use real transaction-capable MongoDB for inventory, checkout, coupon and refund concurrency tests. Validate payment/refund
adapters in sandbox. Verify responsive layouts, keyboard use, accessibility and both themes. Record commands, environment,
results and evidence against the corresponding task.

## 6. Delivery and operations

The delivery path is foundation → catalog/shopping → COD commerce → online payments → after-sales → integrated staging →
release verification → production → handover. [Implementation Plan §11](docs/IMPLEMENTATION_PLAN.md#11-milestones--acceptance-gates)
defines M1–M8. M7 authorizes launch; M8 accepts handover.

[Operations](docs/OPERATIONS.md) defines deployment, monitoring, jobs, financial reconciliation, backup/restore, incidents
and operator procedures. Populate the environment inventory during provisioning and verify it at the corresponding gate.

## 7. Documentation map

| Document                                           | Owns                                                         |
| -------------------------------------------------- | ------------------------------------------------------------ |
| [PRD](docs/PRD.md)                                 | Product scope, business rules and acceptance                 |
| [Architecture](docs/ARCHITECTURE.md)               | Technology, boundaries and system invariants                 |
| [Design](docs/DESIGN.md)                           | Tokens, layouts, interactions and accessibility              |
| [Database](docs/DATABASE.md)                       | Collections, schemas, indexes, transactions and migrations   |
| [API](docs/API.md)                                 | Routes, DTOs, authorization, errors and retries              |
| [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) | Feature sequence, dependencies and milestones                |
| [Tasks](docs/TASKS.md)                             | Stable task IDs, execution status and evidence               |
| [Testing](docs/TESTING.md)                         | Scenarios, fixtures, tools and verification procedures       |
| [Operations](docs/OPERATIONS.md)                   | Configuration, deployment, recovery and operating procedures |
| [AGENTS](AGENTS.md)                                | Agent workflow and editing safeguards                        |
| [Changelog](CHANGELOG.md)                          | Documentation version history                                |

Use each document for its stated subject. Keep related contracts synchronized when behavior changes and preserve the
PRD's initial-release boundaries.
