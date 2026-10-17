# SportZone

**Version:** 1.0\
**Status:** Final development baseline\
**Updated:** 17 October 2026

Single-store sports e-commerce platform for Bangladesh, using BDT. SportZone combines a customer storefront, a separate
administration portal and one authoritative backend API.

## Contents

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

| Application / service | Technology | Responsibility |
| --- | --- | --- |
| Storefront | Next.js App Router, React, TypeScript, Tailwind CSS | Customer presentation, public rendering and API consumption |
| Administration | React, Vite, TypeScript, Tailwind CSS | Store-management interface |
| Backend | Node.js, Express, TypeScript | Authentication and authoritative business services |
| Persistence | MongoDB, Mongoose | Indexed records, conditional writes and transactions |
| Payments | SSLCOMMERZ and internal COD workflow | Verified collections, attempts and reconciliation |
| Media / email | Cloudinary / Resend or equivalent transactional provider | Controlled uploads and durable message delivery |
| Repository | npm workspaces | Independent application builds and shared quality commands |

The Express `/api/v1` API owns prices, stock, permissions, order transitions, payment verification and refunds. Frontends
consume allowlisted DTOs. Private sessions, carts, checkout, orders and financial data never enter shared caches.

## 3. Repository structure

The repository currently contains the documentation set. Foundation tasks create the application workspaces and tooling.

```text
sportzone/
├── storefront/                 # Next.js storefront
├── admin/                      # React + Vite administration
├── backend/                    # Express API and scheduled jobs
├── docs/                       # Product and engineering specifications
├── README.md
├── AGENTS.md
├── CHANGELOG.md
├── .env.example
└── package.json                # npm workspaces
```

[Architecture §4](docs/ARCHITECTURE.md#4-project-structure) defines application/module boundaries.

## 4. Development workflow

1. Read [AGENTS](AGENTS.md), the assigned [task](docs/TASKS.md) and its owning contracts.
2. Establish the workspace and locked toolchain through P01-009, then scaffold the frontends and backend in Phases 02–03.
3. Configure isolated local/test resources, a transaction-capable MongoDB replica set and sandbox integrations.
4. Implement each feature with its API/data contracts, required UI states, tests and operating controls.
5. Run applicable checks, review the diff and attach evidence before task acceptance.

After foundation scripts exist, install dependencies with `npm ci` and discover the actual scripts using `npm run`.
[Testing §5.3](docs/TESTING.md#53-standard-execution-interface) defines the required root verification interface. Record
verified startup commands and local origins here as the workspaces are implemented.

## 5. Configuration and verification

[Operations Appendix B](docs/OPERATIONS.md#appendix-b--configuration-inventory) defines configuration ownership, exposure
and validation. Separate local, CI, staging and production data, origins, credentials and provider modes. Keep secrets out
of Git, logs, artifacts and browser-exposed `NEXT_PUBLIC_*` / `VITE_*` values.

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

| Document | Owns |
| --- | --- |
| [PRD](docs/PRD.md) | Product scope, business rules and acceptance |
| [Architecture](docs/ARCHITECTURE.md) | Technology, boundaries and system invariants |
| [Design](docs/DESIGN.md) | Tokens, layouts, interactions and accessibility |
| [Database](docs/DATABASE.md) | Collections, schemas, indexes, transactions and migrations |
| [API](docs/API.md) | Routes, DTOs, authorization, errors and retries |
| [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) | Feature sequence, dependencies and milestones |
| [Tasks](docs/TASKS.md) | Stable task IDs, execution status and evidence |
| [Testing](docs/TESTING.md) | Scenarios, fixtures, tools and verification procedures |
| [Operations](docs/OPERATIONS.md) | Configuration, deployment, recovery and operating procedures |
| [AGENTS](AGENTS.md) | Agent workflow and editing safeguards |
| [Changelog](CHANGELOG.md) | Documentation version history |

Use each document for its stated subject. Keep related contracts synchronized when behavior changes and preserve the
PRD's initial-release boundaries.
