# SportZone — Database Design Specification

**Version:** 1.2  
**Source baseline:** PRD / Architecture / Design / Implementation Plan / Tasks v1.2  
**Updated:** 16 October 2026  
**Status:** Revised implementation proposal — technical sign-off and runtime verification pending  
**Product reference:** [PRD](./PRD.md)  
**Technical reference:** [Architecture](./ARCHITECTURE.md)  
**Design reference:** [Design](./DESIGN.md)  
**Execution references:** [Implementation Plan](./IMPLEMENTATION_PLAN.md) · [Tasks](./TASKS.md)  
**Scope:** Single-store sports e-commerce platform for Bangladesh  
**Stack:** MongoDB, Mongoose, Express/TypeScript  
**Audience:** Backend engineers, reviewers, and development agents

This document defines SportZone's proposed durable data model: physical collections, embedded records, field contracts,
indexes, state persistence, transactions, data protection, and schema evolution. It translates the PRD's **27 logical
entities** into an implementable design without requiring 27 one-to-one collections. The PRD remains authoritative for
product and policy rules; `ARCHITECTURE.md` governs system boundaries and integrity invariants. This revision includes the
API contract remediation for delivery timing, versioned policy content, mutation revisions, and provider amount
reconciliation; MongoDB indexes, gateway behavior, Mermaid rendering, and integration tests remain **unverified at
runtime**.

---

## Contents

- [1. Purpose and Contract Boundaries](#1-purpose-and-contract-boundaries)
- [2. Database Architecture and Conventions](#2-database-architecture-and-conventions)
- [3. Logical and Physical Data Model](#3-logical-and-physical-data-model)
- [4. Relationship Diagrams](#4-relationship-diagrams)
- [5. Identity and Access Collections](#5-identity-and-access-collections)
- [6. Catalog and Shopping Collections](#6-catalog-and-shopping-collections)
- [7. Orders, Delivery, and Inventory Collections](#7-orders-delivery-and-inventory-collections)
- [8. Promotions and Payment Collections](#8-promotions-and-payment-collections)
- [9. Returns and Refund Collections](#9-returns-and-refund-collections)
- [10. Operations and Supporting Collections](#10-operations-and-supporting-collections)
- [11. Indexes and Query Contracts](#11-indexes-and-query-contracts)
- [12. Data Integrity and Transaction Contracts](#12-data-integrity-and-transaction-contracts)
- [13. State Transitions and Data Lifecycles](#13-state-transitions-and-data-lifecycles)
- [14. Security, Privacy, and Retention](#14-security-privacy-and-retention)
- [15. Migrations, Environments, and Recovery](#15-migrations-environments-and-recovery)
- [16. Verification and Traceability](#16-verification-and-traceability)
- [Appendix A — Cross-document Decision Register](#appendix-a--cross-document-decision-register)
- [Appendix B — Schema Implementation Checklist](#appendix-b--schema-implementation-checklist)

---

## 1. Purpose and Contract Boundaries

### 1.1 Ownership

| Source | Owns | Database implication |
| --- | --- | --- |
| `PRD.md` | Functional requirements, business policies, acceptance | Never replace policy with a schema assumption |
| `ARCHITECTURE.md` | MongoDB/Mongoose choice, trust boundaries, stock/payment invariants | No alternate business database or client-side writes |
| **`DATABASE.md`** | Collections, exact field shapes, indexes, persistence state, transactions, migrations | Proposed specification for backend implementation |
| [`API.md`](./API.md) (proposed) | HTTP payloads, errors, authorization, retry contracts | Map API DTOs to persisted fields; do not expose private models |
| [`TESTING.md`](./TESTING.md) (documented; tests not executed) | Test procedures, fixtures, executable evidence | Validate contracts here with executable tests there |
| [`OPERATIONS.md`](./OPERATIONS.md) (proposed runbooks) | Backup/restore procedure, production jobs, monitoring | This document states DB prerequisites and invariants |

### 1.2 Scope and status

- **In scope:** customer/admin identity, guest proof, products and variants, shopping, checkout, COD/online payments, stock, coupons, shipment, claims, refunds, notifications, support, settings, and audit history.
- **Out of scope:** multi-vendor tenancy, loyalty, subscriptions, live courier GPS, automated courier integration, multi-currency, multi-role RBAC, and speculative analytics infrastructure (PRD §3.2).
- **Authority:** Only Express domain services write business data. Next.js and the admin SPA never connect directly to MongoDB.
- **Status convention:** Fields/indexes below are **proposed technical decisions** unless the cited PRD/Architecture requires them. Record decisions in Appendix A before marking this contract accepted; do not describe unexecuted migrations or index tests as complete.

### 1.3 Cross-cutting acceptance conditions

1. No overselling; `available = physical − reserved − committed` remains nonnegative.
2. Checkout retry cannot duplicate an order; callbacks and provider retries cannot apply a collection twice.
3. Every independently verified collection is recorded, even if fulfillment is already cancelled or paid.
4. Refund commitments cannot exceed verified collections, globally **or** per source collection.
5. Historical order/pricing/delivery snapshots do not change when live records change.
6. Guest proof grants only time-limited, order-scoped access; customer and administrator sessions stay distinct.
7. An event replay, job restart, or concurrent request cannot repeat stock/coupon/refund effects.
8. Initial release requires verified bKash, Nagad, Rocket and COD acceptance; inactive channels are hidden, but missing required gateway activation blocks launch unless the PRD is explicitly revised (PRD §3.3).

## 2. Database Architecture and Conventions

### 2.1 Deployment and ownership

| Area | Contract |
| --- | --- |
| Database | MongoDB; one logically isolated SportZone database per environment |
| ODM | Mongoose, explicit schemas and controlled model/index deployment |
| Transaction capability | Replica-set-capable MongoDB in local integration, staging, and production; stand-alone MongoDB is insufficient for required multi-document tests |
| Connections | Pooled, bounded server connections; credentials available only to backend/job processes |
| Jobs | Backend workers use the same domain services; durable lease/claim records prevent competing execution |
| External calls | Never hold an open DB transaction across payment, Cloudinary, or email HTTP calls |
| Boundaries | Public APIs return allowlisted DTOs, never raw Mongoose documents |

### 2.2 Field standards

| Convention | Definition |
| --- | --- |
| Primary key | `_id: ObjectId`, server-generated; serialize as a string only at API boundaries |
| References | `<entity>Id: ObjectId`; never use an email or order number as proof of ownership |
| Timestamps | UTC `Date` instants; `createdAt`/`updatedAt` for mutable records and `occurredAt` for event facts |
| Business timezone | `Asia/Dhaka` for display, report buckets and approved deadline rules; never persist naive local dates |
| Money | Integer **poisha** only; negative integers permitted only for signed movement deltas; `100 poisha = 1 BDT` |
| Currency | `BDT` for all monetary records and historic snapshots |
| Enums | Lowercase `snake_case`; API/UI labels may differ, never reinterpret a persisted enum silently |
| Normalized IDs | Lowercase trimmed email, SKU, coupon code and slugs; original display text retained separately if required |
| Counters | Nonnegative safe integers with conditional, concurrency-safe updates; `revision` for mutable financial aggregates |
| `schemaVersion` | Positive integer on orders and long-lived financial records; schema upgrades preserve evidence |
| Sensitive fields | Hash password/session/challenge secrets; no gateway secrets or full financial instruments in MongoDB |
| Deletion | Soft-deactivate master data; financial evidence follows approved retention and erasure rules |

**Schema notation:** `!` required; `?` optional and **absent when unset** unless a field explicitly permits `null`; `[]`
bounded array; `embedded` nested document; `enum(...)` closed allowed values. For example, **guest `orders.userId` is
explicitly `null`**, while an unissued `refundAttempts.refundRefId` is absent. Mongoose must use `strict: 'throw'` or
equivalent explicit DTO allowlists; direct unrestricted update operators are prohibited for protected fields. An embedded
`id` is a stable ObjectId, not an array offset.

**Proposed baseline limits** (apply where a table does not define a stricter bound; revise with an approved API/UX contract before accepting the schema):

| Field family | Default maximum / constraint |
| --- | --- |
| Human names / short titles | 120 Unicode characters; nonempty after normalization |
| Email | 254 characters, validated and normalized; never truncate |
| Slug | 160 normalized characters; SKU/code up to 64 characters |
| Operation/idempotency keys | 128 characters before hashing; provider field limits override this |
| Address line | 300 characters; freeform notes/reasons/complaints 2,000 characters |
| Review comment | 2,000 characters; tags/keywords up to 30 per record |
| Saved addresses | 10 per account; product images 12 per product |
| Cart items / wishlist entries | 100 / 200 distinct items |
| Order lines / units per line | 40 distinct lines / 50 purchased units per line |
| Return claim lines / private evidence refs | 40 lines / 12 files per claim |
| Embedded short status/contact history | 40 records; overflow goes to `auditLogs` or another approved durable event record |

These are implementation-proposed abuse and document-size limits, **not pre-existing PRD approvals**. Do not silently
truncate purchased quantities or personal information. Dates and optional ObjectIds use explicit JSON/BSON schema
validators, and optional reference fields must not be stored as `''`. Provider limits are authoritative for their
corresponding API fields (`tran_id` 30, `bank_tran_id` 80, `refund_trans_id` 30, `refund_ref_id` 50 characters, per the
currently published SSLCOMMERZ v4 reference).

### 2.3 Monetary rounding and immutable pricing

- Convert gateway decimal BDT strings to integer poisha with a decimal-safe parser. Never use floating-point results for authoritative amounts or percentages.
- `effectiveUnitPoisha = salePricePoisha ?? regularPricePoisha`; for an active sale, `0 <= salePricePoisha <= regularPricePoisha`.
- `regularSubtotal = Σ(regularUnit × quantity)`; `productDiscount = Σ((regularUnit − effectiveUnit) × quantity)`; `saleSubtotal = regularSubtotal − productDiscount`.
- Coupon scope is the eligible **post-sale merchandise** subtotal `E`; delivery is excluded. A fixed coupon gives `min(fixedValuePoisha, E)`. A percentage coupon uses integer basis points `b` (1–10,000): `couponDiscount = min(E, floor((E × b + 5_000) / 10_000))` (**round half up** to one poisha). Multiplication must use safe integer/BigInt arithmetic.
- Allocate the integer `couponDiscount = D` over eligible line subtotals `eᵢ`: set `baseᵢ = floor(D × eᵢ / E)`; distribute the remaining `D − Σbaseᵢ` poisha to lines with largest exact rational remainders, ties by ascending **stable embedded order-item ObjectId**. Noneligible lines get zero. For `E=0`, no discount or coupon hold is permitted.
- `finalTotalPoisha = regularSubtotalPoisha − productDiscountPoisha − couponDiscountPoisha + deliveryChargePoisha`. Validate `ΣlineCoupon = couponDiscount`, `ΣlineNet + deliveryCharge = finalTotal`, and all totals nonnegative.
- A merchandise line's purchased net value `N` over `q` units has per-unit refund entitlement `floor(N/q) + 1` for ordinals `1..(N mod q)`, and `floor(N/q)` for the remaining ordinals. Keep those stable 1-based ordinals across claims and partial payouts; they must reconcile to `N` exactly. Delivery refunds are independently approved and capped by snapshotted delivery charge.

| Calculation example | Exact result (poisha) |
| --- | ---: |
| 101-poisha eligible subtotal, 50% coupon | `floor((101 × 5,000 + 5,000)/10,000) = 51` |
| Eligible lines 201 + 100, fixed coupon 100 | Floor shares 66 + 33; extra 1 to first line → **67 + 33** |
| Three units sharing line net 101 | Stable ordinal entitlements **34, 34, 33** |

Persist the computed **67 + 33** allocation and the original price/coupon/charge/policy snapshots; changes to live master records must not rewrite history. Any adjustment to this arithmetic is a versioned financial-contract change (PRD §§6.1, 10; Architecture §7.3).

### 2.4 Embedding and reference rules

**Embed** bounded, purchase-time snapshots (order items, address/charge, variant selection), saved addresses when account
limits are enforced, return-request item entries, and small status histories when bounded. **Reference** independently
updated or high-growth records (variants, reservations, movements, attempts, collections, refunds, notifications, audit
events). Never embed an unbounded payment history, product review list, or movement ledger in an order/product.

## 3. Logical and Physical Data Model

### 3.1 Collection inventory

The following are physical **proposals**, not assertions about an existing database. `authChallenges`, `browserContexts`,
`checkoutIntents`, `providerReceiptIntake`, `paymentCollections`, `couponCustomerCounters`, `orderItemBalances`,
`cancellationRequests`, `deliveryExceptions`, and `jobLeases` are supporting collections required by the proposed safe
persistence design.

| Domain | Collections | Key embeddings |
| --- | --- | --- |
| Identity | `users`, `sessions`, `authChallenges`, `browserContexts` | User `addresses[]` |
| Catalog and shopping | `categories`, `products`, `productVariants`, `carts`, `wishlists`, `reviews` | Product `images[]`; cart `items[]` |
| Orders and delivery | `checkoutIntents`, `orders`, `orderItemBalances`, `cancellationRequests`, `deliveryExceptions`, `deliveryZones`, `deliveryCharges` | Order `items[]`, customer/delivery/terms snapshots, transition history |
| Inventory | `inventoryReservations`, `inventoryMovements` | Variant stock counters in `productVariants` |
| Promotions | `coupons`, `couponRedemptions`, `couponCustomerCounters` | Coupon terms snapshot on order/redemption |
| Payments | `payments`, `paymentAttempts`, `providerReceiptIntake`, `paymentCollections` | Independent verified-provider intake and linked collection references |
| After-sales | `returnRequests`, `refunds`, `refundAttempts` | Return `items[]`; refund funding/scope |
| Operations | `notifications`, `complaints`, `auditLogs`, `storeSettings`, `policyDocuments`, `jobLeases` | Delivery outcomes and durable policy drafts/publications |

### 3.2 PRD's 27-entity mapping

| PRD logical entity | Physical representation |
| --- | --- |
| User / Session / Address | `users` / `sessions` / `users.addresses[]` |
| Category / Product / Product Variant | `categories` / `products` / `productVariants` |
| Cart / Wishlist | `carts` (registered; guest browser-local) / `wishlists` |
| Order / Order Item | `orders` / `orders.items[]` |
| Payment / Payment Attempt | `payments` / `paymentAttempts`; online verification intake in `providerReceiptIntake`, linked receipts in `paymentCollections` |
| Coupon / Coupon Redemption | `coupons` / `couponRedemptions`; per-user quota in `couponCustomerCounters` |
| Inventory Reservation / Inventory Movement | `inventoryReservations` / `inventoryMovements` |
| Review | `reviews` |
| Return Request / Return Item | `returnRequests` / `returnRequests.items[]` |
| Refund / Refund Attempt | `refunds` / `refundAttempts` |
| Delivery Zone / Delivery Charge | `deliveryZones` / `deliveryCharges` |
| Notification / Complaint / Audit Log / Store Settings | `notifications` / `complaints` / `auditLogs` / `storeSettings`; independently versioned policy records in `policyDocuments` |

### 3.3 Boundary and cardinality rules

- A guest order has `orders.userId = null`; its checkout email **never** becomes an ownership proof by itself.
- Every product has one default SKU if there are no selectable options. Each variant belongs to exactly one product; each product has one or more variants; each active product belongs to at least one active category.
- A checkout intent maps to at most **one** order. An order has one payment aggregate, multiple attempts and zero or more linked receipts. Verified online funds with unknown order ownership remain in `providerReceiptIntake` until reconciled.
- One order can have multiple stock reservations **over time**, but no more than one active allocation per order/variant at once. Stock is tracked by variant.
- One order binds to at most one immutable `orders.couponSnapshot.couponId` for its lifetime. A new hold generation may be created only for that same coupon after a safe release and re-eligibility check.
- A return request has one or more immutable order-item references; refund(s) reference the original order, source collection, and eligible basis.

## 4. Relationship Diagrams

### 4.1 Commerce entity relationship diagram

```mermaid
erDiagram
    USERS ||--o{ SESSIONS : owns
    USERS o|--o{ ORDERS : optional_registered_owner
    USERS ||--o{ REVIEWS : writes
    CATEGORIES }o--o{ PRODUCTS : classifies
    PRODUCTS ||--|{ PRODUCT_VARIANTS : offers
    PRODUCT_VARIANTS ||--o{ INVENTORY_RESERVATIONS : reserves
    PRODUCT_VARIANTS ||--o{ INVENTORY_MOVEMENTS : records
    CHECKOUT_INTENTS ||--o| ORDERS : creates_once
    ORDERS ||--|{ ORDER_ITEMS : snapshots
    ORDERS ||--o{ INVENTORY_RESERVATIONS : allocates
    ORDERS ||--o{ COUPON_REDEMPTIONS : uses_same_coupon
    COUPONS ||--o{ COUPON_REDEMPTIONS : controls
    ORDERS ||--|| PAYMENTS : has
    PAYMENTS ||--o{ PAYMENT_ATTEMPTS : initiates
    PAYMENT_ATTEMPTS o|--o{ PAYMENT_COLLECTIONS : relates_to
    PROVIDER_RECEIPT_INTAKE o|--o| PAYMENT_COLLECTIONS : reconciles_to
    ORDERS ||--o{ RETURN_REQUESTS : receives_claims
    RETURN_REQUESTS ||--|{ RETURN_ITEMS : includes
    ORDERS ||--o{ REFUNDS : authorizes
    PAYMENT_COLLECTIONS ||--o{ REFUNDS : funds
    REFUNDS ||--o{ REFUND_ATTEMPTS : executes
    STORE_SETTINGS ||--o{ POLICY_DOCUMENTS : points_to_versions
```

`ORDER_ITEMS` and `RETURN_ITEMS` are logical **embedded** nodes, not collections. `USERS o|--o{ ORDERS` reflects nullable
`orders.userId` for guests. Multiple distinct independently verified receipts may relate to one gateway attempt when
provider evidence proves separate collections; there is **no unique attempt-to-receipt constraint**.
`PROVIDER_RECEIPT_INTAKE` is the authoritative unique online-provider evidence intake; a verified but unmatched intake
entry has no order reference.

### 4.2 Data ownership and persistence boundaries

```mermaid
flowchart LR
    Routes[Express API controllers] --> Domain[Backend domain services]
    Worker[Scheduled backend jobs] --> Domain
    Domain --> Identity[(Identity and access)]
    Domain --> Catalog[(Catalog and shopping)]
    Domain --> Order[(Orders and allocation)]
    Domain --> Finance[(Payments and refunds)]
    Domain --> Ops[(Operations and audit)]
```

Both controllers and scheduled jobs invoke shared backend **domain services**, never each other's HTTP endpoint. Cross-module transaction coordination remains inside backend-controlled services (Architecture §§3, 6).

### 4.3 Atomic allocation and verified-payment flow

```mermaid
flowchart TD
    Start[Validated checkout intent] --> Method{Payment method}
    Method -->|COD| Commit[Atomic stock commit and coupon redemption]
    Method -->|Online| Hold[Atomic 15-minute stock and coupon hold]
    Hold --> Outcome{Independently verified gateway outcome}
    Outcome -->|Uncertain| Reconcile[Keep attempt pending and reconcile]
    Outcome -->|Confirmed unpaid; no dependent attempt| Release[Release eligible holds once]
    Outcome -->|Verified paid| Intake[Deduplicate verified provider intake]
    Intake --> Link{Order mapping verified?}
    Link -->|No| Investigate[Retain unmatched provider funds]
    Link -->|Yes| Record[Link receipt and allocate exact amounts]
    Record --> Cancelled{Order already cancelled?}
    Cancelled -->|Yes| Correction[Record correction-only Paid and preserve cancellation]
    Cancelled -->|No| Funded{Original total fully funded?}
    Funded -->|No| Partial[Keep Pending; reconcile remainder]
    Funded -->|Yes| Valid{Allocation valid and risk cleared?}
    Valid -->|Yes| Convert[Commit stock and coupon once]
    Valid -->|No| Resolve[Keep Paid; hold fulfillment or refund]
    Convert --> Ship[Dispatch: reduce physical and committed]
```

**Persistence rule:** provider verification runs *outside* the MongoDB transaction. Its verified result is committed in a short transaction with idempotency guards; a crash can be replayed safely.

## 5. Identity and Access Collections

**Common rule:** No password, session, guest-proof, CSRF context, or recovery token may be stored in plaintext. Use separate session types/cookie names for admin, customer, and scoped guest access; require server-side role and resource ownership checks (Architecture §9).

### 5.1 `users` — `auth` / `customers`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `emailNormalized`! | string | Lowercase/trimmed; unique; changed only after verified email-change flow |
| `name`! | string | Nonempty, length-limited |
| `passwordHash`! | string | Adaptive password hash; excluded from default queries |
| `phone`? | string | Bangladesh validation at service boundary; normalized for search |
| `role`! | enum(`customer`,`admin`) | Default `customer`; admin privately provisioned only |
| `status`! | enum(`active`,`suspended`,`deletion_pending`,`deactivated`) | Suspended/deactivated identities cannot authenticate |
| `emailVerifiedAt`? | Date | Set only after challenge verification |
| `addresses[]` | embedded[] | `{id,recipient,phone,districtKey,areaKey,street,addressLine2?,isDefault}`; bounded per customer |
| `securityRevision`! | int | Increment when passwords, privileges, suspension, or security posture changes |
| `deletionRequest`? | embedded | `{requestedAt,verifiedAt,status,decisionAt?,decisionReason?}`; approval/retention-controlled |

**Indexes:** unique `{emailNormalized:1}`; `{role:1,status:1,createdAt:-1}` for admin customer views.

**Rules:** at most one default address; deleting a saved address never edits an order snapshot. Admin accounts have no public registration. User account deletion/anonymization requires verified review against retention obligations.

### 5.2 `sessions` — `auth` / `guest-access`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `tokenHash`! | string | Unique hash of opaque cookie secret; never return |
| `kind`! | enum(`customer`,`admin`,`guest_order`) | Separate credential/cookie namespaces |
| `userId`? | ObjectId | Required for customer/admin; absent for guest-order |
| `orderId`? | ObjectId | Required only for guest-order scope |
| `securityRevisionAtIssue`? | int | Principal security revision to detect invalidation |
| `expiresAt`! | Date | Enforced during each request, independent of TTL |
| `revokedAt`? | Date | Revocation takes effect immediately |
| `lastUsedAt`? | Date | Minimal retained metadata; avoid storing full IP by default |

**Indexes:** unique `{tokenHash:1}`; `{userId:1,kind:1,revokedAt:1}`; TTL `{expiresAt:1}`.

**Rules:** rotate after login, proof exchange or privilege changes; revoke on logout/suspension; do not treat physical TTL deletion as authentication expiry. A guest session cannot access other orders or admin/customer routes.

### 5.3 `authChallenges` — verification and recovery

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `purpose`! | enum(`email_verify`,`email_change`,`password_reset`,`guest_order_access`) | Single-use proof type |
| `secretHash`! | string | Hash of one-time link/code; no plaintext secret |
| `userId`? / `orderId`? | ObjectId | Scope according to purpose; guest proof requires `orderId` |
| `emailNormalized`! | string | Verified destination or ownership challenge target |
| `targetEmailNormalized`? | string | For email-change workflow |
| `expiresAt`! / `consumedAt`? | Date | Atomic consume; an expired/consumed proof fails |
| `attemptCount`! | int | Enforce bounded guessing attempts and rate limits |
| `issuedContextHash`? | string | Optional binding to initiating browser context when required |

**Indexes:** unique `{secretHash:1}`; `{purpose:1,orderId:1,expiresAt:1}`; TTL `{expiresAt:1}`.

**Rules:** guest proof is issued only after safe order/email lookup and grants order scope only after atomic single-use exchange; ambiguous lookup responses do not leak existence. Password reset token consumption and password/session revision must be coordinated safely.

### 5.4 `browserContexts` — pre-auth CSRF bootstrap

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `contextTokenHash`! | string | Unique hash of short-lived opaque browser-context cookie |
| `csrfSecretHash`! | string | Server-verifiable session/context-bound CSRF token material |
| `expiresAt`! | Date | Short-lived and independently checked |
| `rotatedAt`? | Date | Rotate after authentication/proof exchange |

**Indexes:** unique `{contextTokenHash:1}`; TTL `{expiresAt:1}`.

**Rules:** no user/order permission is granted by this record; Origin verification is still required on protected browser mutations. Implementations may replace this persistence with an equally secure signed short-lived context only after documented Architecture/API alignment.

## 6. Catalog and Shopping Collections

### 6.1 `categories` — `catalog`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `name`! / `slug`! | string | Nonempty; unique normalized slug |
| `parentId`? | ObjectId | Self-reference; null for root |
| `status`! | enum(`active`,`inactive`) | Inactive excluded from public navigation |
| `image`? | embedded | `{publicId,url,alt}`; Cloudinary reference, not binary image |
| `sortOrder`! | int | Nonnegative display sequence |
| `revision`! | int | Nonnegative CAS revision; increment on every editable metadata, parent, status or sort change |

**Indexes:** unique `{slug:1}`; `{parentId:1,status:1,sortOrder:1}`.

**Rules:** reject cycles; verify category has active ancestry for public visibility; restrict deletion while products/subcategories depend on it unless reassigned in an approved operation.

### 6.2 `products` — `catalog`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `name`! / `slug`! | string | Unique slug; name/description length-limited |
| `description`! | string | Sanitized display content (safe output rendering remains required) |
| `categoryIds`! | ObjectId[] | Nonempty distinct active category references for active products |
| `images[]` | embedded[] | `{publicId,url,alt,position}`; bounded; only approved media |
| `keywords[]` | string[] | Normalized bounded search terms |
| `status`! | enum(`draft`,`active`,`inactive`) | Only active visible/purchasable when eligible |
| `featured`! | bool | Storefront merchandising flag |
| `ratingSummary` | embedded | `{approvedCount,average}` derived projection; not authority for review eligibility |
| `revision`! | int | Nonnegative CAS revision; increment on every editable product/status/category/media change |

**Indexes:** unique `{slug:1}`; `{status:1,categoryIds:1,createdAt:-1}`; `{status:1,featured:1,createdAt:-1}`; search index selected by representative query profile.

**Rules:** every purchasable product has at least one active `productVariants` document; deactivation does not erase historical order lines.

### 6.3 `productVariants` — `catalog` / `inventory`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `productId`! | ObjectId | Valid owning product |
| `skuNormalized`! | string | Globally unique normalized SKU, including default SKU |
| `attributes`! | map(string,string) | Bounded normalized selectable options; empty for default SKU |
| `attributeSignature`! | string | Stable canonical representation of sorted option keys/values; `default` for the no-options SKU |
| `regularPricePoisha`! | int | `>= 0`; backend-set |
| `salePricePoisha`? | int | `0 <= salePrice <= regularPrice` |
| `status`! | enum(`active`,`inactive`) | Inactive cannot be newly purchased |
| `stock`! | embedded | `{physical:int,reserved:int,committed:int}`; all nonnegative; `physical >= reserved + committed` |
| `revision`! | int | CAS revision incremented by **every** stock, price, attribute, SKU or status change (never only stock writes) |
| `lowStockThreshold`? | int | Optional override; otherwise approved store setting |

**Indexes:** unique `{skuNormalized:1}`; `{productId:1,status:1}`; unique `{productId:1,attributeSignature:1}` to reject duplicate purchasable combinations.

**Rules:** `available` is **derived**, not independently writable. A no-options product uses exactly one default variant; never create a parallel product-level stock authority. All stock writes go through `inventory` services, not generic product edits.

### 6.4 `carts` — `shopping`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `userId`! | ObjectId | One server-side cart per registered customer |
| `items[]` | embedded[] | `{variantId,quantity,addedAt}`; unique variant ID within cart; positive bounded qty |
| `revision`! | int | Compare-and-set cart merge/update when needed |

**Indexes:** unique `{userId:1}`.

**Rules:** guest cart remains browser-local (not a durable `carts` record); merge eligible variants once on login; cart items do not reserve stock, and displayed totals are provisional. Prices always revalidate on checkout.

### 6.5 `wishlists` — `shopping`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `userId`! | ObjectId | One wishlist per registered customer |
| `productIds[]` | ObjectId[] | Deduplicated, bounded list |

**Indexes:** unique `{userId:1}`.

**Rules:** no guest wishlist, no stock allocation, and deactivated items remain identifiable without permitting checkout.

### 6.6 `reviews` — `reviews`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `userId`! / `productId`! | ObjectId | Authenticated purchaser and reviewed product |
| `qualifyingOrderItemId`! / `orderId`! | ObjectId | Delivered eligible purchase evidence; order item is embedded identifier |
| `rating`! | int | 1–5 inclusive |
| `comment`! | string | Length-limited, moderated and escaped on display |
| `status`! | enum(`pending`,`approved`,`rejected`,`hidden`) | Only approved contributes to public rating |
| `isActive`! | bool | One active review per user/product |
| `moderatedAt`? / `moderationReason`? | Date / string | Auditable moderation decision |

**Indexes:** partial unique `{userId:1,productId:1}` where `isActive:true`; `{productId:1,status:1,createdAt:-1}`.

**Rules:** validate delivered qualifying purchase and exclusions (PRD FR-10); edit re-enters moderation when required. Do not silently alter customer ratings. Rating aggregates are recalculable projections.

## 7. Orders, Delivery, and Inventory Collections

### 7.1 `checkoutIntents` — `checkout`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `scopeType`! | enum(`customer`,`guest_context`) | Request identity scope |
| `scopeKeyHash`! / `idempotencyKeyHash`! | string | Hash opaque guest/browser ID and client retry key; never trust raw email as scope |
| `requestFingerprint`! | string | Hash of canonical validated checkout payload; retries with changed payload conflict |
| `orderId`? | ObjectId | Exactly one order once committed |
| `status`! | enum(`preparing`,`order_created`,`resolved`) | Recover interrupted submission safely |
| `resultSnapshot`? | embedded | Minimal durable result pointer/status, not sensitive response secrets |
| `replayUntil`? | Date | Optional client replay-response availability deadline; **not** a deletion deadline |

**Indexes:** unique `{scopeType:1,scopeKeyHash:1,idempotencyKeyHash:1}`; `{orderId:1}` (partial unique when present); **No TTL** on the unique key registry; retain a minimal key/fingerprint/order tombstone while its order can be replayed, reconciled, or referenced.

**Rules:** concurrent identical submissions resolve to one order; changed payload with same key fails; persist outcome
before reporting success. After `replayUntil`, an old key must return existing-order status or a `key_retired` conflict,
**never** create a new order. Any future purge requires a durable equivalent uniqueness/tombstone mechanism first; the
actual legal retention horizon remains an approved operations decision.

### 7.2 `orders` — `checkout` / `orders`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `orderNumber`! | string | Unique public reference; never an access credential |
| `userId`? | ObjectId | Null for guest; ownership verified through scoped guest session |
| `checkoutIntentId`! | ObjectId | Unique; one order per intent |
| `items[]`! | embedded[] | Nonempty immutable item snapshots (below) |
| `customerSnapshot`! | embedded | `{name,emailNormalized,phone}` captured at checkout |
| `deliverySnapshot`! | embedded | **Immutable checkout facts:** `{recipient,phone,districtKey,areaKey,street,addressLine2?,zoneId,chargeRuleId,chargePoisha,estimateAtCheckout?,deadlineRuleVersion,deadlineBasis}`. `deadlineBasis` captures the approved target duration (normally 14 calendar days), start-event type, and applicable legal-cap rule reference/start event; it does **not** contain a fabricated confirmation-relative absolute deadline. |
| `deliveryCommitment`! | embedded | **Operational projection:** `{status:'awaiting_start'\|'calculated'\|'under_review',startEventAt?,targetDeadlineAt?,legalDeadlineAt?,effectiveDeadlineAt?,calculatedAt?,revision}`; null absolute dates where the governing start event has not occurred. Changes require controlled transition/audit and never overwrite `deliverySnapshot`. |
| `pricingSnapshot`! | embedded | `{regularSubtotalPoisha,productDiscountPoisha,saleSubtotalPoisha,couponDiscountPoisha,deliveryChargePoisha,finalTotalPoisha,currency:'BDT'}` |
| `couponSnapshot`? | embedded | `{couponId,code,type,value,eligibleSubtotalPoisha,discountPoisha,termsVersion}` |
| `paymentMethod`! | enum(`online`,`cod`) | Specific online channel identified by verified provider method where available |
| `fulfillmentStatus`! | enum(`pending`,`confirmed`,`processing`,`shipped`,`delivered`,`cancelled`) | Not derived from payment status |
| `fulfillmentHold`? | enum(`none`,`payment_pending`,`risk_review`,`allocation_shortfall`,`admin_review`) | Reason fulfillment cannot proceed; separate from payment status |
| `termsSnapshot`! | embedded | `{acceptedAt,policyVersionIds[],termsVersion}`; preserves consent basis |
| `notes`? | string | Bounded customer note; sanitize display |
| `placedAt`! / `confirmedAt`? / `shippedAt`? / `deliveredAt`? / `cancelledAt`? | Date | Actual transition timestamps |
| `shipment`? | embedded | `{dispatchReference?,carrierLabel?,trackingText?,statusUpdatedBy?}`; manual only |
| `statusHistory[]` | embedded[] | Small bounded recent history with `{from,to,actorType,actorId?,reason,at,operationKey}`; complete audit external |
| `schemaVersion`! / `revision`! | int / int | Explicit snapshot schema and write revision |

**Embedded `orders.items[]` — immutable line contract**

| Field | Type | Constraint |
| --- | --- | --- |
| `id`! | ObjectId | Stable embedded line identifier, referenced by claims/refunds |
| `productId`! / `variantId`! | ObjectId | Historical reference, not live pricing authority |
| `productName`! / `sku`! | string | Purchase-time name and SKU |
| `variantAttributes`! | map(string,string) | Purchased size/color/other choices |
| `quantity`! | int | Positive; one canonical line per variant |
| `regularUnitPoisha`! / `effectiveUnitPoisha`! | int | Unit list and post-sale prices |
| `regularLinePoisha`! / `productDiscountPoisha`! | int | Purchase-time extended values |
| `couponAllocatedPoisha`! / `netMerchandisePoisha`! | int | Immutable final line discount and net value |
| `couponEligible`! | bool | Coupon basis snapshot |
| `unitRefundBasePoisha`! / `unitRefundRemainderQty`! | int | Deterministic unit-ordinal partial-refund allocation |

`regularLine = regularUnit × quantity`; `productDiscount = (regularUnit − effectiveUnit) × quantity`; `netMerchandise =
effectiveUnit × quantity − couponAllocated`. Sum line values into `pricingSnapshot`; do not recalculate refunds from
current product prices. Line identifiers and unit ordinals are stable across claims.

**Indexes:** unique `{orderNumber:1}`, unique `{checkoutIntentId:1}`; `{userId:1,placedAt:-1}`, `{fulfillmentStatus:1,placedAt:-1}`, `{customerSnapshot.emailNormalized:1,orderNumber:1}` (internal lookup only).

**Rules — delivery timing:** capture the approved delivery **rule basis** and charge at checkout, not a guessed 14-day
absolute deadline. Upon the actual `confirmedAt` transition, set `targetDeadlineAt = confirmedAt + 14 calendar days`
(unless the approved rule differs). A verified legal cap may start at a distinct documented event (including placement):
calculate `legalDeadlineAt` using its approved reference and event, then set `effectiveDeadlineAt` to the earlier
**applicable** deadline. If a required start event or legally approved rule is missing, expose
`awaiting_start`/`under_review`, do not claim a definitive deadline and block any affected deadline-dependent
confirmation/acceptance until resolved. Later operational ETA notices do not rewrite either the checkout rule snapshot or
confirmed legal commitments. Changes to `deliveryCommitment` require order CAS, a reason, audit, and customer notification
when the estimate changes. Test a delayed COD confirmation, checkout-relative statutory cap, unconfirmed order and
exception handling (PRD FR-16).

### 7.3 `orderItemBalances` — cross-claim quantity guard

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `orderId`! / `orderItemId`! | ObjectId | One balance per immutable `orders.items[].id` |
| `purchasedQty`! | int | Immutable purchase quantity (1–50 under proposed limits) |
| `unitCoverage[]`! | embedded[] | Exactly `purchasedQty` rows `{ordinal,netEntitlementPoisha,claimState,claimId?,refundHeldPoisha,refundCompletedPoisha,restockOperationKey?}` |
| `activeClaimQty`! / `resolvedClaimQty`! | int | Recomputable counts for protected and resolved ordinal rows |
| `refundedMerchandiseQty`! | int | Recomputable count of units **fully** paid out; partial amounts remain visible per ordinal |
| `revision`! | int | Transactional conflict/write guard |

**Ordinal state:** `claimState = available | protected | resolved`. Ordinals are unique integers from `1..purchasedQty`;
`netEntitlementPoisha` equals the order-line's stable unit entitlement (§2.3). `available → protected` requires exactly one
valid claim owner; approved/fulfilled claims become `resolved`; rejected/invalid claims release only their still-protected
ordinals to `available`. A resolved or partially/fully refunded ordinal cannot be reclaimed. `refundHeldPoisha +
refundCompletedPoisha <= netEntitlementPoisha` per ordinal. Refund obligations funded by multiple collections may each
reserve a **disjoint amount** of the same ordinal entitlement, never duplicate the total.

**Indexes:** unique `{orderId:1,orderItemId:1}`. **Enforcement:** claim selection and `unitCoverage` modifications occur
under a `revision`-checked order-item balance write in the same transaction as claim/refund changes. Check ordinal
ownership, status, per-unit remaining refundable amount, and claim eligibility; do not rely on aggregate counts alone.
Every restock requires one inspected physical receipt and a globally stable movement operation key; shortage claims never
restock. Claim completion and payout confirmation are independent facts.

### 7.4 `cancellationRequests` — `orders`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `orderId`! | ObjectId | Eligible pre-dispatch order |
| `requestedBy`! | embedded | `{kind: customer or guest_order, userId?, guestSessionId?}` |
| `reason`! | string | Customer explanation |
| `status`! | enum(`requested`,`approved`,`rejected`) | Submission alone never cancels order |
| `reviewedBy`? / `reviewedAt`? / `decisionReason`? | ObjectId / Date / string | Administrator review |
| `operationKey`! | string | Idempotent decision reference |

**Indexes:** unique `{orderId:1,operationKey:1}`; partial unique `{orderId:1}` for status `requested`.

**Rules:** acceptance requires current order-status/dispatch recheck in the same transaction as allocation release and cancellation; paid cancellations produce an eligible refund obligation.

### 7.5 `deliveryExceptions` — `orders`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `orderId`! | ObjectId | Shipment/late delivery concern |
| `type`! | enum(`delay`,`failed_attempt`,`final_non_delivery`) | Clear subtype |
| `status`! | enum(`open`,`resolved`) | Retry/investigation remains open while Shipped |
| `contactHistory[]` | embedded[] | Bounded `{at,channel,outcome}`; detailed high-volume events in audit if needed |
| `disposition[]` | embedded[] | `{orderItemId, quantity, custody: recovered / lost / damaged / other, inspectedResellableQty}` |
| `resolution`? / `resolvedAt`? | string / Date | Admin decision; full shipped-quantity accounting before terminal closure |

**Indexes:** `{orderId:1,status:1,createdAt:-1}`.

**Rules:** final non-delivery `Shipped → Cancelled` requires custody/disposition coverage of *every* shipped unit; recovered goods return to physical stock only after inspected resale approval and unique receipt movement.

### 7.6 `deliveryZones` and `deliveryCharges` — `settings`

| Collection / field | Type | Constraints / notes |
| --- | --- | --- |
| `deliveryZones.name`! / `status`! | string / enum(`active`,`inactive`) | Administrative group and availability |
| `deliveryZones.description`? / `coverageRevision`! | string / int | Notes; nonnegative transactional serialization guard for coverage rule writes |
| `deliveryZones.revision`! | int | Distinct CAS revision for any editable zone metadata/status/coverage assignment |
| `deliveryCharges.zoneId`! | ObjectId | Refers to delivery zone |
| `deliveryCharges.coverageKey`! | string | Normalized `district:area` or `district:*` for approved district default |
| `deliveryCharges.amountPoisha`! | int | `>= 0` |
| `deliveryCharges.status`! | enum(`scheduled`,`active`,`inactive`) | `active` means one currently effective selectable rule; `scheduled` is approved for future activation |
| `deliveryCharges.effectiveFrom`! / `effectiveTo`? | Date | Historical rule version; old rules stay referentially available |
| `deliveryCharges.ruleVersion`! | int | Explicit immutable commercial version used by order snapshot |
| `deliveryCharges.revision`! / `supersedesChargeId`? | int / ObjectId | CAS for activation/end/supersession; predecessor lineage remains queryable |
| `deliveryCharges.endedAt`? / `endedReason`? | Date / string | Audited effective-window closure; never change historical charge amount/coverage |

**Indexes:** partial unique `deliveryCharges {coverageKey:1}` for `status:'active'`; unique
`{coverageKey:1,ruleVersion:1}`; `{zoneId:1,status:1,effectiveFrom:1}`. Add `deliveryZones.coverageRevision:int`
(initialized to 0) as the **write-serialization guard** for all charge rule insertions/activations in a zone.

**Rules:** `effectiveFrom <= checkoutAt < effectiveTo` (or no upper bound) for selected active rule. Resolve exact area
coverage before its district wildcard; never combine two rules. In a transaction, first conditionally bump the owning
zone's `coverageRevision` to serialize competing writers, then reject any **overlapping** effective windows for that
`coverageKey` among scheduled/active rules. To replace an indefinite live charge, create a **new** version, then in one
zone-guarded transaction close the predecessor's `effectiveTo` **once**, set its status `inactive` at the agreed effective
boundary, and activate the successor when due; no overlapping selectable windows are allowed. The current `active`
partial-unique index is satisfied by atomically ending the predecessor before activating the replacement. Planned future
versions may remain `scheduled`; their windows must not overlap any approved scheduled/active rule unless the predecessor
is closed in the **same** serialized decision. Deactivation without replacement closes the current window and leaves the
coverage unavailable (checkout fails closed). Every master edit checks `revision`; `coverageRevision` is the additional
zone-wide serialization guard. The activation job performs the same guarded transition. Existing order snapshots keep the
original rule ID and amount. If no precisely eligible active rule exists, **fail checkout closed** rather than guess a
charge. Snapshot selected version/charge/deadline **rule basis**, not a confirmation-relative absolute date. Effective
windows and legal deadlines are operator-approved, not invented.

### 7.7 `inventoryReservations` — `inventory`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `orderId`! / `variantId`! | ObjectId | Allocation owner and SKU |
| `quantity`! | int | `> 0`; equal to canonical order-item quantity |
| `generation`! | int | Increment on valid reallocation after hold expiration |
| `status`! | enum(`held`,`committed`,`released`,`shipped`) | One-way guarded state machine |
| `activeKey`? | string | Set to `active` while held/committed; cleared on release/shipment |
| `expiresAt`? | Date | Online held allocation: checkout creation + 15 minutes; null after commitment |
| `committedAt`? / `releasedAt`? / `shippedAt`? | Date | Transition timestamps |
| `releaseReason`? / `lastOperationKey`? | string | Replay/reconciliation context |

**Indexes:** unique `{orderId:1,variantId:1,generation:1}`; partial unique `{orderId:1,variantId:1,activeKey:1}` **only where `activeKey` is a string**; `{status:1,expiresAt:1}`. **Do not TTL these records:** they are financial/stock history.

**Rules:** expiry job performs a status-guarded release transaction; TTL time passing does nothing by itself. A payment retry after expired holds acquires a new generation; never overwrite/extend the expired one.

### 7.8 `inventoryMovements` — `inventory` (append-only)

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `variantId`! / `orderId`? / `reservationId`? | ObjectId | Linked source of movement |
| `type`! | enum(`opening`,`adjustment`,`reserve`,`release_hold`,`commit_hold`,`commit_cod`,`release_commit`,`dispatch`,`return_receipt`) | Movement category |
| `deltaPhysical`! / `deltaReserved`! / `deltaCommitted`! | int | Signed counter deltas; sum reconciles to variant stock |
| `operationKey`! | string | Stable idempotency key scoped by variant/type |
| `actor`! | embedded | `{type: system or admin, id?}` |
| `reason`! / `occurredAt`! | string / Date | Audit and causal trace |

**Indexes:** unique `{variantId:1,type:1,operationKey:1}`; `{variantId:1,occurredAt:-1}`; `{orderId:1,occurredAt:1}`.

**Rules:** create movement and conditional counter mutation in the *same* transaction; duplicate movement key means replay, not an additional change. Manual stock adjustments may not make available negative.

## 8. Promotions and Payment Collections

### 8.1 `coupons` — `promotions`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `codeNormalized`! | string | Unique case-normalized coupon code |
| `type`! | enum(`percentage`,`fixed`) | Percentage as integer basis points; fixed value in poisha |
| `value`! | int | Percentage: `1..10000` basis points; fixed: `> 0` poisha |
| `minEligibleSubtotalPoisha`! | int | Threshold checked on post-sale eligible merchandise |
| `startsAt`! / `expiresAt`! | Date | Starts before expiry |
| `status`! | enum(`active`,`inactive`) | New hold eligibility; historical orders unaffected |
| `overallLimit`? / `perCustomerLimit`? | int | Positive limits, if configured |
| `heldCount`! / `redeemedCount`! | int | `>= 0`, `held + redeemed <= overallLimit` when set |
| `eligibleProductIds[]` / `eligibleCategoryIds[]` | ObjectId[] | Bounded optional filters; empty means approved global merchandise scope |
| `termsVersion`! / `revision`! | int | Each meaningful edit increments terms version |

**Indexes:** unique `{codeNormalized:1}`; `{status:1,startsAt:1,expiresAt:1}`.

**Rules:** existing live holds keep their snapshotted terms until expiry; a new/reacquired hold checks *current* coupon state. Guest checkout cannot use any coupon with a per-customer limit (PRD FR-09). Coupon quotas are authoritative in conditional writes, not `countDocuments` alone.

### 8.2 `couponRedemptions` — `promotions`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `couponId`! / `orderId`! | ObjectId | One coupon family per order |
| `userId`? | ObjectId | Required when coupon has per-customer limit |
| `generation`! | int | Distinct safe hold attempts over time |
| `status`! | enum(`held`,`redeemed`,`released`) | Confirmation/release once |
| `activeKey`? | string | `active` for held/redeemed; cleared when released |
| `termsSnapshot`! | embedded | `{code,type,value,version,discountPoisha,eligibleLineIds[]}` |
| `expiresAt`? | Date | 15-minute online hold; null/ignored after redemption |
| `redeemedAt`? / `releasedAt`? / `lastOperationKey`? | Date / Date / string | Traceable transition |

**Indexes:** unique `{couponId:1,orderId:1,generation:1}`; partial unique `{orderId:1,activeKey:1}` where `activeKey` is a string; `{status:1,expiresAt:1}`.

**Rules:** on every redemption creation/reacquisition, transactionally compare `couponId` with immutable
`orders.couponSnapshot.couponId` (the sole coupon identity bound at order creation); reject any different coupon even after
a previous hold is released. The unique active-key index only prevents simultaneous active generations and does **not**
enforce lifetime identity. Pending holds consume quota until deliberately released; pre-shipment eligible cancellation
releases redeemed usage once; post-dispatch refund/non-delivery never automatically restores coupon usage. Coupon edits do
not rewrite accepted orders.

### 8.3 `couponCustomerCounters` — `promotions`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `couponId`! / `userId`! | ObjectId | Unique registered-customer quota key |
| `heldCount`! / `redeemedCount`! | int | Nonnegative, combined total within per-customer limit |
| `revision`! | int | Conditional update guard |

**Indexes:** unique `{couponId:1,userId:1}`.

**Rules:** creation and increment occur atomically with coupon global counter and redemption record; release/confirm adjusts both in one transaction. A missing counter is initialized with an upsert safely under the unique key. Checkout email is not a quota identity.

### 8.4 `payments` — `payments` (one aggregate per order)

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `orderId`! | ObjectId | Unique; payment aggregate belongs to one order |
| `method`! | enum(`online`,`cod`) | Payment method selected on the order |
| `expectedPoisha`! / `currency`! | int / enum(`BDT`) | Immutable order final total, nonnegative |
| `paymentStatus`! | enum(`pending`,`paid`,`failed`,`cancelled`,`partially_refunded`,`refunded`) | Derived summary (§13.2), **never** proof of fulfillment |
| `verifiedCollectedPoisha`! | int | Sum of all **linked, unique verified** source receipts |
| `merchandiseFundedPoisha`! | int | Sum of receipt amounts allocated to original order merchandise **and delivery**, capped at `expectedPoisha` |
| `correctionCollectedPoisha`! | int | Allocated duplicate/excess/late-cancelled funds |
| `unassignedCollectedPoisha`! | int | Linked funds whose disposition is still under review; unmatched intake funds are **excluded** |
| `merchandiseRefundHeldPoisha`! / `merchandiseRefundCompletedPoisha`! | int | Order-class refund reservations and confirmed payouts, including eligible delivery component |
| `correctionRefundHeldPoisha`! / `correctionRefundCompletedPoisha`! | int | Correction-class reservations and confirmed payouts |
| `deliveryRefundHeldPoisha`! / `deliveryRefundCompletedPoisha`! | int | Subsets of merchandise-class refunds; capped by immutable delivery charge |
| `riskStatus`! | enum(`clear`,`review`,`rejected`) | Verified collection and fulfillment clearance are separate |
| `lastReconciledAt`? / `revision`! | Date / int | Projection reconciliation and conditional-write revision |

**Indexes:** unique `{orderId:1}`; `{paymentStatus:1,updatedAt:-1}`.

**Rules:** every projection is reproducible from linked receipts and refund obligations. A distinct late/duplicate payment
creates a second receipt but **does not** create a second order, coupon redemption, stock commitment or fulfillment. Risk
review may hold delivery while collected funds remain verified. Never fold correction refunds into the merchandise refund
progress indicator.

### 8.5 `paymentAttempts` — `payments`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `paymentId`! / `orderId`! | ObjectId | Parent aggregate and order |
| `provider`! | enum(`sslcommerz`) | Online payment provider |
| `tranId`! | string | Unique merchant-generated transaction ID, maximum 30 characters; new for each distinct initiated attempt |
| `expectedAmountPoisha`! / `currency`! | int / enum(`BDT`) | **Exact initiated request** for remaining merchandise funding on this attempt, not the original order total on every retry; valid channel/merchant range checked immediately before initiation |
| `initiatedOutstandingPoisha`! | int | Authoritative original merchandise entitlement remaining when attempt was initiated; immutable audit snapshot |
| `verifiedReceiptAmountPoisha`? | int | Independently verified provider amount; do not force equality by rewriting expected amount |
| `amountDisposition`! | enum(`not_checked`,`matched`,`under_collected`,`over_collected`,`quarantined`) | Records validation result and review treatment separately from attempt state |
| `requestedChannel`? | enum(`bkash`,`nagad`,`rocket`,`provider_other`) | UI only exposes approved active channels |
| `state`! | enum(`created`,`initiated`,`pending`,`uncertain`,`verified_failed`,`verified_cancelled`,`verified_paid`) | Attempt outcome separate from order |
| `providerSessionId`? / `providerValidationId`? / `bankTranId`? | string | Gateway correlation fields; optional until verified |
| `riskLevel`? / `riskTitle`? | int / string | Exact sanitized provider risk classification |
| `initiatedAt`? / `expiresAt`? / `lastCheckedAt`? | Date | Reconciliation scheduling |
| `verification`? | embedded | `{verifiedAt,verifiedStatus,merchantIdMatch,amountMatch,currencyMatch,referenceMatch,rawRecordDigest}` |
| `retryOfAttemptId`? | ObjectId | Attempt lineage; old attempt is never overwritten |

**Indexes:** unique `{provider:1,tranId:1}`; `{state:1,lastCheckedAt:1}`. `providerValidationId`/`bankTranId` lookup indexes are **nonunique** unless the merchant provider contract confirms uniqueness across distinct independently verifiable charges.

**Rules:** select `expectedAmountPoisha` from authoritative **unfunded merchandise entitlement** after independently
verified prior allocations (never from client total). Uncertain earlier attempts block new initiation until reconciled.
Compare provider verified amount to the immutable requested amount and persist both. Mismatched amounts remain in
`providerReceiptIntake` as verified-but-quarantined financial evidence; they do **not** automatically mark the attempt
fully funded or release holds. If the merchant/provider later verifies genuinely settled partial amounts, an audited
reconciliation may allocate the verified smaller receipt, leaving an exact remaining balance for another safely initiated
attempt; overpayments are correction/unassigned, not duplicate merchandise funding. No collection is discarded merely for
an amount mismatch. Never discard a validated paid receipt due to an older failed/cancelled message. Provider-specific
behavior needs sandbox sign-off.

### 8.6 `providerReceiptIntake` and `paymentCollections` — verified receipts

`providerReceiptIntake` is the **single deduplication boundary for online provider money**. It records verified funds even
if the provider's `tran_id` cannot yet be safely mapped to an existing order. `paymentCollections` contains linked receipts
with one authoritative order and class-specific allocation/capacity. No fabricated `orderId`, `paymentId`, or `attemptId`
is permitted to make unmatched money fit an order schema.

**`providerReceiptIntake` — provider-confirmed funds, matched or unmatched**

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `provider`! | enum(`sslcommerz`) | Independent validation source |
| `merchantAccountKey`! | string | Stable non-secret fingerprint identifying the validated merchant account |
| `providerCollectionRef`! | string | Independently verified unique collection identity; required before calling money verified |
| `bankTranId`? / `validationId`? / `reportedTranId`? | string | Sanitized provider references and untrusted matching hints |
| `amountPoisha`! / `currency`! | int / enum(`BDT`) | Confirmed positive amount and BDT |
| `collectedAt`! / `verifiedAt`! | Date | Distinct provider receipt and validation times |
| `validationDigest`! | string | Digest of sanitized provider verification response; no credentials/card data |
| `matchingStatus`! | enum(`unmatched`,`linked`,`quarantined`) | Unknown ownership is never automatically a customer payment |
| `linkedCollectionId`? | ObjectId | Present only after transactional matching to one `paymentCollections` receipt |
| `resolutionKey`? / `resolvedBy`? / `resolvedAt`? | string / ObjectId / Date | Auditable controlled reconciliation |

**Index:** unique `{provider:1,merchantAccountKey:1,providerCollectionRef:1}`; partial unique `{linkedCollectionId:1}` when
ObjectId; `{matchingStatus:1,verifiedAt:1}`. A provider message **not independently confirmed as merchant funds** is an
unverified notification to reconcile, not a `providerReceiptIntake` entry. Reject conflicting verification digests/amounts
for the same provider identity into a supervised security/reconciliation incident; never overwrite historical evidence.

**`paymentCollections` — linked source receipts with immutable core and guarded accounting**

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `paymentId`! / `orderId`! | ObjectId | Must match verified linked order |
| `intakeId`? / `attemptId`? | ObjectId | `intakeId` required for online; `attemptId` when trusted local attempt is identified |
| `provider`! | enum(`sslcommerz`,`cod_manual`) | Verified receipt origin |
| `merchantAccountKey`! / `providerCollectionRef`! | string | Provider-scoped source identity; COD uses stable `internal` account key and server-issued unique receipt reference |
| `bankTranId`? / `validationId`? | string | Sanitized proof correlation references |
| `amountPoisha`! / `currency`! | int / enum(`BDT`) | **Immutable positive** receipt face amount |
| `collectedAt`! / `verifiedAt`! | Date | Immutable receipt event times |
| `evidenceDigest`! / `verifiedBy`! | string / embedded | `{type:provider or admin,actorId?}`; COD requires authorized verified evidence |
| `merchandiseAllocatedPoisha`! | int | Amount funded toward original order and delivery; never above original order outstanding principal |
| `correctionAllocatedPoisha`! | int | Amount attributed to duplicate/overpayment/cancelled-order correction |
| `unassignedAllocatedPoisha`! | int | Known linked funds held without a safe class decision |
| `merchandiseRefundHeldPoisha`! / `merchandiseRefundCompletedPoisha`! | int | Refund capacity consumed from merchandise allocation |
| `correctionRefundHeldPoisha`! / `correctionRefundCompletedPoisha`! | int | Refund capacity consumed from correction allocation |
| `revision`! | int | CAS guard on allocation/capacity mutations |

**Indexes:** unique `{provider:1,merchantAccountKey:1,providerCollectionRef:1}` (COD uses a stable
`merchantAccountKey='internal'`); partial unique `{intakeId:1}` when ObjectId; `{attemptId:1,collectedAt:1}` **nonunique**;
`{orderId:1,collectedAt:-1}`. Every online linked receipt must reference one intake entry; link creation and intake status
change occur atomically. If SSLCOMMERZ evidence cannot establish distinct collection identity, **quarantine and reconcile**
rather than assert a second charge or block a genuinely distinct charge with attempt-level uniqueness.

**Immutability boundary:** IDs, provider identity, face amount, currency, receipt timestamps, proof digest, verified actor
and reference are **write-once**. Only `*AllocatedPoisha`, `*RefundHeldPoisha`, `*RefundCompletedPoisha`, `revision` and
auditable reconciliation metadata may change through allowlisted, revision-guarded domain operations. Allocate or
reclassify funds in a transaction with the `payments` projection; append a redacted `auditLogs` decision with old/new
monetary splits. Generic update endpoints must not mutate financial evidence.

### 8.7 Payment accounting and receipt allocation

For each linked collection `c`, all values are nonnegative integers:

```text
c.amount = c.merchandiseAllocated + c.correctionAllocated + c.unassignedAllocated
c.merchandiseRefundHeld + c.merchandiseRefundCompleted <= c.merchandiseAllocated
c.correctionRefundHeld + c.correctionRefundCompleted <= c.correctionAllocated
payments.verifiedCollected = sum(c.amount)
payments.merchandiseFunded = sum(c.merchandiseAllocated) <= orders.pricingSnapshot.finalTotal
payments.correctionCollected = sum(c.correctionAllocated)
payments.unassignedCollected = sum(c.unassignedAllocated)
payments.verifiedCollected = merchandiseFunded + correctionCollected + unassignedCollected
```

Unmatched entries in `providerReceiptIntake` **do not** enter any order's sums until linked through verified ownership.
Source-level refund reservations and completed payouts are subsets of the corresponding class allocations and are **not
subtracted** when reporting gross verified receipts. Aggregate refund held/completed fields equal class-specific sums of
linked source counters and the corresponding refund obligations, not a second financial debt. A class reassignment may not
take funds below committed/completed refunds. **After stock/coupon commitment or dispatch, do not reduce merchandise
funding below the accepted order entitlement**; any correction requires an explicit compensating business transition,
reviewed financial evidence and a revision-guarded transaction. Reclassification never reverses a confirmed payout.

**Amount gate:** The partial/excess examples below describe **financially verified collections**, not permission to
auto-accept a mismatch against a larger immutable attempt request. A receipt differing from its attempt expectation is
first quarantined, then allocated only after supervised provider-supported reconciliation; a separately initiated smaller
attempt that was exactly verified may allocate normally.

**Deterministic allocation policy:** match a verified merchant receipt to an order using independent provider
`tran_id`/transaction evidence and the local immutable order mapping. If mapping/amount/currency is disputed, link only
when ownership is established and assign disputed amounts to `unassignedAllocatedPoisha` until reviewed. For a
non-cancelled eligible order, assign up to `max(0, expectedPoisha − merchandiseFundedPoisha)` toward merchandise; the
remainder is correction. For an already cancelled order, assign the entire newly verified late amount to correction. A risk
flag can block fulfillment but cannot erase the validated receipt. Multiple receipts can **collectively** fund an order;
fulfillment stock and coupon conversion remain once-only guarded events, and partial funding alone never confirms
fulfillment.

| Scenario (expected 100,000 poisha) | Receipt allocation | Order merchandise funded | Resolution |
| --- | --- | ---: | --- |
| Exact receipt 100,000 | 100,000 merchandise | 100,000 | Eligible to commit allocation after stock, coupon and risk checks |
| First partial receipt 40,000 | 40,000 merchandise | 40,000 | Pending remaining 60,000; do not dispatch |
| Second partial receipt 60,000 | 60,000 merchandise | 100,000 | May commit once after all gates pass |
| First single excess receipt 120,000 | 100,000 merchandise + 20,000 correction | 100,000 | Correct/refund 20,000 against its own collection |
| Subsequent duplicate paid attempt 100,000 | 100,000 correction | 100,000 | Preserve distinct receipt, do not allocate/fulfill again |
| Late paid after cancellation 100,000 | 100,000 correction | 0 | Keep cancelled fulfillment; authorized correction payout |
| Independently verified provider funds with unknown order | 100,000 in unmatched intake; **no linked collection** | Not attributed | Investigate identity before linking/refunding |

When linked receipts span multiple sources, each refund obligation references **one** source receipt and cannot exceed its
class-specific remaining capacity. Cross-source refunds are separate obligations coordinated against original line/delivery
entitlement (§§7.3, 9.2, 12.5). Verified provider status is independent of provider risk clearance or customer fulfillment;
no retry of an uncertain external transaction is presumed safe.

## 9. Returns and Refund Collections

### 9.1 `returnRequests` — `returns`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `orderId`! / `requestedBy`! | ObjectId / embedded | Authenticated user or verified scoped guest session |
| `claimType`! | enum(`physical_return`,`shortage`) | Explicitly separate physical/non-physical processes |
| `items[]`! | embedded[] | `{id,orderItemId,requestedQty,approvedQty?,protectedUnitOrdinals[],approvedUnitOrdinals[],reason,inspectionResult?,resellableQty?,evidenceRefs[]}`; approved ordinals subset of protected |
| `status`! | enum(`requested`,`under_review`,`approved`,`awaiting_return`,`received`,`inspected`,`completed`,`rejected`) | Only valid paths allowed per claim type |
| `requestedAt`! / `approvedAt`? / `receivedAt`? / `inspectedAt`? / `completedAt`? | Date | Stage proof, not derived from UI |
| `eligibilitySnapshot`! | embedded | `{deliveredAt?,requestDeadlineAt?,policyVersion,exceptionBasis?}` |
| `evidenceRefs[]` | embedded[] | `{publicId,access:'private',mimeType,size}`; approved private upload metadata |
| `reviewedBy`? / `decisionReason`? | ObjectId / string | Admin decision and traceability |
| `revision`! | int | Controlled state writes |

**Indexes:** `{orderId:1,status:1,createdAt:-1}`; `{claimType:1,status:1,createdAt:1}`.

**Rules:** normal physical return within PRD's 7-calendar-day baseline unless a qualifying right/policy exception applies.
Physical return must pass receipt and inspection; shortage claim must **not** fabricate receipt, inspection, or restock. In
either route, acquire **specific** `orderItemBalances.unitCoverage[].ordinal` claims under a revision CAS; rejected or
nonapproved ordinals are released only when refund capacity is zero. Both physical and shortage claims share this exact
ordinal namespace. A completed claim does not mean the payout has completed.

### 9.2 `refunds` — `refunds`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `orderId`! / `paymentId`! / `sourceCollectionId`! | ObjectId | One refund funds exactly one verified, linked source collection |
| `basis`! | enum(`cancellation`,`physical_return`,`shortage`,`delivery_exception`,`payment_correction`) | Auditable reason for eligibility |
| `basisRefId`? / `refundGroupKey`? | ObjectId / string | Original claim/cancellation reference and optional common business-refund group for source-funded slices |
| `classification`! | enum(`merchandise`,`payment_correction`) | Separate business vs excess-cash balance |
| `items[]` | embedded[] | For merchandise: `{orderItemId,unitAmounts:[{ordinal,amountPoisha}],amountPoisha}`; sum unit amounts equals line refund and each ordinal respects its unreimbursed net cap; empty for pure correction |
| `merchandiseAmountPoisha`! / `deliveryAmountPoisha`! | int | Both nonnegative; correction uses explicit `correctionAmountPoisha` |
| `correctionAmountPoisha`! / `amountPoisha`! | int | `amount = merchandise + delivery + correction`; positive total |
| `method`! | enum(`gateway`,`manual_bkash`,`manual_nagad`,`manual_rocket`,`manual_bank`) | Original channel preferred if supported; fallback needs consent |
| `status`! | enum(`requested`,`under_review`,`approved`,`processing`,`completed`,`failed`,`rejected`) | Gateway initiation is not completion |
| `capacityStatus`! | enum(`not_reserved`,`reserved`,`completed`,`released`) | Source-collection balance commitment stage |
| `consentEvidenceRef`? | string | Required when switching from supported original channel to approved manual method |
| `approvedBy`? / `approvedAt`? / `completedAt`? | ObjectId / Date / Date | Recorded approvals and verified payout |
| `decisionKey`! | string | Idempotency token for one approved refund obligation |
| `policyVersion`! / `revision`! | string / int | Snapshot applicable approved rules; guarded updates |

**Indexes:** unique `{orderId:1,decisionKey:1}`; `{sourceCollectionId:1,status:1}`; `{orderId:1,classification:1,createdAt:-1}`.

**Rules:** a multi-collection refund uses separate source-funded obligations with exact `unitAmounts[]`, one shared
`refundGroupKey`/business `basisRefId` when applicable, and a **distinct unique `decisionKey` per source-funded slice**.
Reserve class-specific source balance **and** per-ordinal/per-delivery entitlement in the same MongoDB transaction
**before** creating an external payout attempt. On timeout leave the obligation reserved pending reconciliation. Merchant
refunds cannot consume payment-correction-only collections unless explicitly classed as corrections. Refund unit amounts
and ordinals are bounded by original immutable order lines and `orderItemBalances.unitCoverage`; a partially refunded
ordinal can receive another source-funded payment only for its exact remaining net amount.

### 9.3 `refundAttempts` — `refunds`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `refundId`! | ObjectId | One source-funded refund obligation |
| `attemptNumber`! / `idempotencyKey`! | int / string | Monotonic distinct payout attempts; stable local replay key |
| `provider`! | enum(`sslcommerz`,`manual`) | Authorized payout channel |
| `originalBankTranId`? | string | **Required for gateway initiation**; original verified collection's bank transaction ID |
| `refundTransId`? | string | **Required for gateway initiation**: unique **merchant-generated** `refund_trans_id` (maximum 30 characters), persisted **before** sending the request |
| `refundRefId`? | string | Optional **provider-issued** `refund_ref_id` (maximum 50 characters); populated on successful initiation acknowledgment |
| `status`! | enum(`created`,`submitted`,`uncertain`,`confirmed`,`failed`) | Acknowledgment/submission is not completed payout |
| `amountPoisha`! / `initiatedAt`! | int / Date | Must equal a source-reserved refund obligation |
| `lastCheckedAt`? / `confirmedAt`? | Date | Verification timestamps |
| `manualEvidence`? | embedded | `{destinationMasked,transferReference,evidenceDigest,confirmedBy?,confirmedAt?}`; access restricted |
| `failureCode`? / `lastOperationKey`? | string | Safe failure metadata and unique causal reference |

**Indexes:** unique `{refundId:1,attemptNumber:1}`; unique `{provider:1,idempotencyKey:1}`; partial unique
`{provider:1,refundTransId:1}` and `{provider:1,refundRefId:1}` **where the field is a string**, after account-level
semantics are verified; `{status:1,lastCheckedAt:1}`. Use one merchant `refundTransId` for replay/reconciliation of the
**same uncertain gateway request**. A new ID represents a new payout attempt only after independent confirmation that the
previous attempt cannot pay. Never regenerate an ID merely because an HTTP request timed out.

SSLCOMMERZ v4 currently documents `refund_trans_id` as merchant-generated and mandatory (introduced **24 February 2025**),
while `refund_ref_id` is returned after initiation; the status-query call requires `refund_ref_id`. The backend must
preserve both identifiers and check refund-status outcome before `confirmed`. Actual merchant capability, partial gateway
refunds and reference uniqueness must be sandbox-tested before production acceptance. Reference: [SSLCOMMERZ Refund
API](https://developer.sslcommerz.com/doc/v4/index.html#refund-api). Manual payouts require verified transfer evidence,
authorization and applicable consent; a 7-business-day target is a policy target, not payout confirmation.

## 10. Operations and Supporting Collections

### 10.1 `notifications` — `notifications`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `eventKey`! | string | Unique event + recipient + template purpose; prevents duplicate intent |
| `orderId`? / `userId`? | ObjectId | Optional source reference |
| `recipient`! | embedded | `{emailNormalized,displayName?}`; restricted |
| `eventType`! | enum | `registration`, `password_reset`, `order_confirmation`, `payment_success`, `payment_failure`, `order_cancellation`, `shipment_update`, `delivery_completion`, `return_update`, `refund_approval`, `refund_rejection`, `refund_completion` (PRD FR-20) |
| `templateVersion`! / `payload`! | string / embedded | Minimal redacted template data; no secrets |
| `status`! | enum(`queued`,`sending`,`sent`,`retry_wait`,`failed`) | Delivery state independent of business success |
| `attemptCount`! / `nextAttemptAt`? | int / Date | Bounded backoff |
| `providerMessageId`? / `lastErrorCode`? / `sentAt`? | string / string / Date | Outcome trace |

**Indexes:** unique `{eventKey:1}`; `{status:1,nextAttemptAt:1}`.

**Rules:** critical intent is created in the originating business transaction where necessary (outbox-style), then sent asynchronously; a retry cannot repeat the commerce operation. Do not store credentials or full payment details in message payloads.

### 10.2 `complaints` — `support`

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `orderId`? / `userId`? | ObjectId | Optional order/customer reference |
| `contact`! | embedded | `{name,emailNormalized,phone?}` |
| `issue`! | string | Length-limited, access-controlled customer report |
| `status`! | enum(`open`,`in_review`,`resolved`,`closed`) | Admin-managed lifecycle |
| `resolution`? / `respondedAt`? / `resolvedAt`? | string / Date / Date | Document action and response |
| `assignedTo`? | ObjectId | Authorized administrator |

**Indexes:** `{status:1,createdAt:-1}`; `{orderId:1,createdAt:-1}`.

**Rules:** enforce guest/customer ownership and complaint-response policy; legal response period is a tracked operator approval, not hardcoded here.

### 10.3 `auditLogs` — security and operations (append-only)

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `actorType`! / `actorId`? | enum(`customer`,`admin`,`guest_order`,`system`) / ObjectId | Author of privileged action |
| `action`! / `targetType`! / `targetId`? | string / string / ObjectId | Event and affected record |
| `operationKey`! / `occurredAt`! | string / Date | Stable cause/reference; exact record order |
| `beforeDigest`? / `afterDigest`? | string | Minimal change fingerprints, not secret snapshots |
| `reason`? / `requestCorrelationId`? | string | Review and troubleshooting |

**Indexes:** `{targetType:1,targetId:1,occurredAt:-1}`; `{actorId:1,occurredAt:-1}`; optionally unique `{operationKey:1,action:1,targetType:1,targetId:1}` for idempotently emitted audit facts.

**Rules:** record admin stock changes, privilege/suspension, cancellation decisions, payment/correction/risk decisions, refund approvals and payout evidence access. Audit records are write-restricted; do not put plaintext tokens, card information or raw gateway secrets in them.

### 10.4 `storeSettings` — `settings` (singleton)

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `key`! | enum(`primary`) | Unique singleton identity |
| `storeName`? / `branding`? | string / embedded | Operator-approved store name and image references |
| `contact`? / `address`? | embedded | Public operator-supplied data only when approved |
| `lowStockThreshold`! | int | Nonnegative default stock alert threshold |
| `paymentChannels`! | embedded | `{bkashEnabled,nagadEnabled,rocketEnabled,codEnabled}`; operational eligibility subject to verified merchant activation |
| `activePolicyVersions`! | embedded | `{shipping,cancellation,returns,refunds,terms,complaints}` version IDs |
| `policyHistory[]` | embedded[] | **Bounded read-only pointers** to published `policyDocuments` IDs, digest and effective dates (not canonical draft or full policy text) |
| `updatedBy`? / `revision`! | ObjectId / int | Audit and concurrency guard |

**Indexes:** unique `{key:1}`.

**Rules:** `activePolicyVersions` references immutable published `policyDocuments`; publishing an immediately effective
replacement atomically updates the pointer and records the previous version as superseded; future-effective approved
versions are `scheduled` until a CAS-protected activation at `effectiveAt`. Never store gateway secrets here. Store
settings cannot silently change PRD launch gates. Orders snapshot accepted terms and delivery **rule basis**, not an
unknown confirmation-relative absolute deadline; later policy updates do not rewrite accepted transactions.

### 10.5 `policyDocuments` — `settings` (durable revisions)

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `type`! / `version`! | enum(`shipping`,`cancellation`,`returns`,`refunds`,`terms`,`complaints`) / string | Immutable identity unique per policy type and version; no client-selected duplicate version |
| `status`! | enum(`draft`,`approved`,`scheduled`,`published`,`superseded`,`withdrawn`) | Approval distinct from publication; withdrawn published history remains auditable |
| `content`! / `contentDigest`! | sanitized bounded text / string | Full canonical versioned content; immutable from approval onward (new revision for correction) |
| `effectiveAt`? / `publishedAt`? | Date | Never publish without reviewed approved effective time |
| `approvalEvidenceRef`? / `approvedAt`? / `approvedBy`? | string / Date / ObjectId | Durable operator/legal approval proof; publication requires verified reference |
| `supersedesId`? / `supersededAt`? | ObjectId / Date | Publication lineage; never physically replace older accepted versions |
| `revision`! / `createdBy`! | int / ObjectId | CAS for draft edits; audit all publish/withdraw actions |

**Indexes:** unique `{type:1,version:1}`; `{type:1,status:1,effectiveAt:-1}`; `{type:1,publishedAt:-1}`. A single
`storeSettings.activePolicyVersions[type]` is the authoritative public lookup; immediate publication changes it atomically,
while future-effective versions remain `scheduled` until the guarded activation job swaps the pointer at their approved
effective time. Public reads never guess a future version.

**Rules:** draft creation → editable draft → approved with evidence → scheduled (if future-effective) → published when
effective → superseded by another approved version. Published content/digest and historical accepted order pointers are
immutable. Draft edits require a strong revision; no client may self-assert legal approval. Rollback **publishes a new
version** carrying reviewed content rather than rewriting history. Retention of legally relevant published versions follows
approved retention policy.

### 10.6 `jobLeases` — backend maintenance

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `jobKey`! | string | Stable job name/partition key |
| `leaseOwner`? / `leaseUntil`? | string / Date | Acquired by conditional update; expired leases may be reacquired |
| `cursor`? | string | Durable bounded work checkpoint; no secret payload |
| `lastStartedAt`? / `lastSucceededAt`? | Date | Observability and replay tracking |
| `failureCount`! / `lastErrorCode`? | int / string | Operational health |

**Indexes:** unique `{jobKey:1}`; `{leaseUntil:1}`.

**Rules:** process reservation expiry, payment uncertainty, refund verification and notification retries through idempotent domain services. A lease alone does not make a job's financial side effects idempotent.

## 11. Indexes and Query Contracts

### 11.1 Unique and partial-unique index register

Collection-level tables define the exact intended fields. This list contains minimum **enforceable** database keys; a partial unique index must use `partialFilterExpression`, not only an application check. Build and verify indexes before enabling write traffic.

| Collection | Required key | Uniqueness / condition |
| --- | --- | --- |
| `users` | `{emailNormalized:1}` | Unique globally |
| `sessions` / `authChallenges` / `browserContexts` | `{tokenHash:1}` / `{secretHash:1}` / `{contextTokenHash:1}` | Each unique in its own collection |
| `categories` / `products` | `{slug:1}` | Unique in each collection |
| `productVariants` | `{skuNormalized:1}`; `{productId:1,attributeSignature:1}` | Both unique |
| `carts` / `wishlists` | `{userId:1}` | Unique separately |
| `reviews` | `{userId:1,productId:1}` | Unique where `{isActive:true}` |
| `checkoutIntents` | `{scopeType:1,scopeKeyHash:1,idempotencyKeyHash:1}` | Unique persistent identity; **never TTL** |
| `orders` | `{orderNumber:1}`; `{checkoutIntentId:1}` | Both unique |
| `orderItemBalances` | `{orderId:1,orderItemId:1}` | Unique balance; unit ordinals protected by document CAS |
| `inventoryReservations` | `{orderId:1,variantId:1,generation:1}` | Unique generation |
| `inventoryReservations` | `{orderId:1,variantId:1,activeKey:1}` | Unique where `{activeKey:{$type:'string'}}` |
| `inventoryMovements` | `{variantId:1,type:1,operationKey:1}` | Unique stock side-effect |
| `deliveryCharges` | `{coverageKey:1}`; `{coverageKey:1,ruleVersion:1}` | First unique when `{status:'active'}`; second globally unique |
| `coupons` | `{codeNormalized:1}` | Unique |
| `couponRedemptions` | `{couponId:1,orderId:1,generation:1}` | Unique generation |
| `couponRedemptions` | `{orderId:1,activeKey:1}` | Unique where `{activeKey:{$type:'string'}}`; lifetime coupon ID guarded via order snapshot |
| `couponCustomerCounters` | `{couponId:1,userId:1}` | Unique |
| `payments` | `{orderId:1}` | Unique |
| `paymentAttempts` | `{provider:1,tranId:1}` | Unique attempt reference; **not** unique per receipt |
| `providerReceiptIntake` | `{provider:1,merchantAccountKey:1,providerCollectionRef:1}` | Unique independently verified online money identity |
| `providerReceiptIntake` | `{linkedCollectionId:1}` | Unique only where linked ID is ObjectId |
| `paymentCollections` | `{provider:1,merchantAccountKey:1,providerCollectionRef:1}` | Unique linked provider/COD receipt |
| `paymentCollections` | `{intakeId:1}` | Unique where intake ID is ObjectId; online must have intake ID |
| `refunds` | `{orderId:1,decisionKey:1}` | Unique refund obligation |
| `refundAttempts` | `{refundId:1,attemptNumber:1}`; `{provider:1,idempotencyKey:1}` | Both unique |
| `refundAttempts` | `{provider:1,refundTransId:1}`; `{provider:1,refundRefId:1}` | Partial unique where reference is string; validate merchant-account semantics first |
| `notifications` / `storeSettings` / `jobLeases` | `{eventKey:1}` / `{key:1}` / `{jobKey:1}` | Unique in respective collection |

**Do not create a unique `{attemptId:1}` index on `paymentCollections`.** Multiple independently verified provider
collections per attempt are preserved if the provider can establish separate collection identities. Provider `bankTranId`
and `validationId` are indexed for investigation but are **not declared unique** without verified provider guarantees.
MongoDB unique partial indexes constrain only matching documents; missing optional references must not collide. See
[MongoDB partial-index documentation](https://www.mongodb.com/docs/manual/core/index-partial/).

### 11.2 Query and access-path register

| Query | Access path | Required behavior |
| --- | --- | --- |
| Public products by category/status | `products(status,categoryIds,createdAt)` + variant eligibility | Bounded pagination; filter invisible products |
| Public featured/newest | `products(status,featured,createdAt)` | Stable sort with `_id` tie-break |
| Product details | Unique product slug + variants by product ID | No query by unsafe client price |
| Customer orders | `orders(userId,placedAt)` | Authenticated ownership, bounded pages |
| Guest verification | `orders(orderNumber)` then challenge against stored checkout email | No unauthenticated order data disclosure |
| Admin order queue | `orders(fulfillmentStatus,placedAt)` | Paginated queue, deterministic sort |
| Hold expiry | `inventoryReservations(status,expiresAt)` | Claim only `held` and expired records |
| Uncertain payments | `paymentAttempts(state,lastCheckedAt)` | Recovery job selects due candidates |
| Pending refund status | `refundAttempts(status,lastCheckedAt)` | Do not issue blind duplicate payouts |
| Review listing | `reviews(productId,status,createdAt)` | Public includes approved only |
| Notifications | `notifications(status,nextAttemptAt)` | Retry queue with bounded claim batch |
| Admin cash-flow reports | `paymentCollections(collectedAt)` and `refunds(completedAt,status)` | Separate collection/refund dates, Asia/Dhaka grouping |
| Unmatched online receipts | `providerReceiptIntake(matchingStatus,verifiedAt)` | Queue validated merchant money with no asserted order ownership |
| Refund verification | `refundAttempts(status,lastCheckedAt)` and reference lookups | Uncertain payouts remain reserved until outcome is established |

### 11.3 TTL and search-index policy

- TTL indexes may garbage-collect expired *authentication artifacts* (`sessions`, `authChallenges`, `browserContexts`). Authorization and single-use verification **must check expiration in queries** before TTL physically deletes documents.
- Do **not** TTL-delete checkout intents/tombstones, orders, reservations, redemption records, `providerReceiptIntake`, collection receipts, payment/refund attempts, inventory movements, returns, or audit history. A hold becomes expired through an atomic business transition, **not** by TTL.
- Use query plans and representative catalog data to select any text/Atlas Search strategy; do not claim a specific search service or latency target is approved. Enforce public visibility filters in the search path and revalidate checkout against primary business records.
- Avoid unbounded skip/limit pagination for large histories; prefer indexed cursor seek on `(timestamp,_id)` where suitable. Record actual query plans and thresholds in `TESTING.md`.

## 12. Data Integrity and Transaction Contracts

### 12.1 Hard invariants

| ID | Constraint | Enforcement |
| --- | --- | --- |
| DB-I01 | `physical >= reserved + committed >= 0` per SKU | Conditional variant update + transaction + test |
| DB-I02 | One order for one checkout intent/scope/key | Unique intent and order indexes + request fingerprint |
| DB-I03 | No duplicate active allocation for order/SKU | Active-key partial unique index and transaction |
| DB-I04 | Same immutable coupon ID per order for its lifetime; global/per-user quotas never exceeded | Order coupon snapshot identity + conditional counters + redemption transaction |
| DB-I05 | One unique independently verified online intake fact per provider account and receipt identity; link to at most one collection | Unique intake and linked-receipt indexes + provider verification |
| DB-I06 | A paid retry cannot commit fulfillment twice | Guarded order/allocation transitions and unique movement keys |
| DB-I07 | Refund held + completed never exceed **each allocated source class**, each ordinal, order merchandise entitlement or delivery charge | Guarded source, order and `unitCoverage` writes in one transaction |
| DB-I08 | Claims own disjoint original-unit ordinals; cumulative refunded amount per ordinal stays within its purchase-time net value | `unitCoverage` CAS and source-funded obligation transaction |
| DB-I09 | Historic item, price, discount, delivery and policy snapshots remain unchanged | Strict update allowlists; separate mutable operational fields |
| DB-I10 | Guest/customer/admin data access stays scoped | Express authorization; indexed lookups do not grant access |
| DB-I11 | Shipped final non-delivery cannot bypass custody resolution | Transactional item disposition coverage + admin evidence |
| DB-I12 | A replay cannot duplicate a financial, stock, coupon or notification effect | Stable operation keys, unique indexes and state CAS |
| DB-I13 | Linked collection amount equals its exact allocation split; unmatched online funds never impersonate order money | Source amount equation, intake reference, validation and reconciliation guard |
| DB-I14 | A retired checkout key never creates another order and a scheduled delivery rule never overlaps a peer | Persistent key tombstone; serialized coverage writes, uniqueness and time-window check |

**Important:** Mongoose validation alone cannot enforce cross-document quantities, uniqueness, or concurrent account/payment constraints. Use database indexes, predicates and transactions. Approval and provider confirmation are independent of having a valid schema.

### 12.2 Transaction boundaries

| Operation | Atomic database mutation | External work outside transaction |
| --- | --- | --- |
| Customer checkout (online) | Canonical intent + one order/payment + item balances + stock hold + coupon hold + movements + notification intent | Create hosted gateway session; reconcile if outcome uncertain |
| Accepted COD checkout | Intent/order/payment + committed stock + redemption + movements | Dispatch email independently; collection happens later |
| Verified online provider funds | Upsert unique `providerReceiptIntake`; if reliably matched, link exactly one `paymentCollections` receipt, allocate monetary splits, update payment projection and conditionally commit **only if fully funded** and eligible | Independent provider verification **before** transaction; unmatched receipt stays in intake |
| Hold expiration | Conditional held→released; decrement reserved; release eligible coupon quota; append movements | Worker scheduling only |
| Pre-dispatch cancellation approval | Approve request; pending/confirmed/processing→cancelled; release allocation/coupon once; eligible refund obligation | Actual payout outside transaction |
| Dispatch | Guard current fulfillment state; committed→shipped; decrement physical and committed; append movement | Courier action/manual confirmation prior to recorded dispatch |
| Return/shortage claim | CAS-protect exact eligible unit ordinals; create claim with immutable entitlement evidence and requested ordinals | Media upload outside transaction; finalize only validated refs |
| Inspected restock | Mark approved inspected units; increase physical + unique `return_receipt` movement | Physical inspection precedes transaction |
| Refund approval | Guard original unit-ordinal/delivery entitlement, reserve **class-specific** linked source balance, create obligation and provider-ready attempt identity | Payout request only after DB reservation commits |
| Refund payout confirmation | Deduplicate provider/manual proof; mark Completed; source class held→completed; update unit balances, projections and notification intent | Verify provider refund status/manual transfer proof first |
| COD collection | Persist authenticated verified collection and payment aggregate once | Receive/verify physical or transfer evidence first |

**Write protocol:** (1) validate role/policy/input, (2) load current state, (3) start bounded transaction, (4) conditional
writes plus unique keys, (5) record immutable movement/receipt/decision and notification intent, (6) commit, (7) make
external call or return confirmed state. For operations initiated by an external call, persist a recoverable intent
**before** calling it, then reconcile. Retry MongoDB transient transaction conflicts with bounded backoff; never retry an
external financial payout unless its outcome is verified safe.

### 12.3 Stock counter transition examples

| Event | `Δphysical` | `Δreserved` | `Δcommitted` | Preconditions |
| --- | ---: | ---: | ---: | --- |
| New online reservation of `q` | 0 | `+q` | 0 | Available `>= q` |
| Expired/failed eligible hold | 0 | `−q` | 0 | Active held allocation, no paid/other live dependent attempt |
| Verified eligible hold → commit | 0 | `−q` | `+q` | Held, valid, eligible order; coupon consistent |
| Accepted COD direct commit | 0 | 0 | `+q` | Available `>= q`; coupon capacity confirmed |
| Pre-dispatch committed cancellation | 0 | 0 | `−q` | Approved and not dispatched |
| Dispatch committed quantity | `−q` | 0 | `−q` | Current committed `>= q`; guarded order transition |
| Inspected resellable return | `+q` | 0 | 0 | Physically received, inspected, not already restocked |
| Admin stock increase/decrease | `±q` | 0 | 0 | After change `physical >= reserved + committed` |

Example: `physical=10, reserved=3, committed=4 ⇒ available=3`. A fresh online order for four units must fail even though physical stock is ten.

### 12.4 Coupon counter transition examples

| Event | Coupon global counts | Per-user counts | Redemption |
| --- | --- | --- | --- |
| Online accepted hold | `held +1` | `held +1` if per-user restricted | `held` (15 min) |
| Verified eligible payment / COD acceptance | Online: `held −1, redeemed +1`; COD: `redeemed +1` | Same applicable movement | `redeemed` |
| Eligible unpaid expiry/failure | `held −1` | `held −1` if applicable | `released` |
| Approved pre-shipment cancellation | `redeemed −1` if eligible | Same applicable release | `released` |
| Delivered/refunded or final post-dispatch non-delivery | No automatic restoration | No automatic restoration | Remains `redeemed` |

The coupon document uses counts of *redemption units*, not discounted amount; one redemption per order. Global and per-user
counters and redemption status must commit together. If a payment arrives after expired allocation, reacquire both coupon
and stock atomically before fulfillment; retain a verified receipt even when reacquisition fails.

### 12.5 Refund-capacity transaction

1. Resolve an approved business basis, snapshotted merchandise unit entitlements and/or separately eligible delivery charge, **and** a linked, independently verified source collection; unmatched provider intake alone cannot fund a refund.
2. For merchandise-class refunds, acquire the relevant `orderItemBalances` documents under `revision` guards. Each
`{orderItemId,ordinal,amountPoisha}` must be a permitted amount within that ordinal's **remaining** entitlement; delivery
refunds also check `payments.deliveryRefundHeld + deliveryRefundCompleted + newDelivery <= order.deliveryChargePoisha`.
3. Guard `paymentCollections` **per classification**: `merchandiseAllocated − merchandiseRefundHeld −
merchandiseRefundCompleted >= newMerchandiseRefund`, or corresponding `correctionAllocated − correctionRefundHeld −
correctionRefundCompleted >= newCorrectionRefund`. Never use unassigned funds. Ensure the order-wide merchandise refund sum
cannot exceed original funded purchase/delivery entitlement.
4. In **one MongoDB transaction**, reserve source funds, reserve unit/delivery balances, create or advance the unique
source-funded `refunds` obligation, update aggregate projections, and persist the deterministic payout intent. Across
multiple collections, create separately funded obligations; their item amounts may split a unit only within its original
net entitlement.
5. Outside the transaction, submit the payout using the persisted attempt identity and correct provider references. Timeout/unknown outcomes retain `capacityStatus=reserved`; do **not** submit a new external payout ID blindly.
6. On independently verified completion, atomically move source class `Held → Completed`, move matching ordinal/delivery
held to completed, mark obligation Completed and emit audit/notification evidence. On **verified terminal failure**, keep
original obligation and capacity reserved if an authorized retry is needed; release capacity only after documented
cancellation/abandonment and proof that no pending attempt can settle.
7. Rejected **uninitiated** obligations can release their reservations and revert eligible unit refund-held amounts. Completed payouts never reopen source capacity; retried attempts reuse the same approved obligation rather than creating a second refund decision.

**Correction-only refunds:** charge only `correctionAllocatedPoisha` and never consume order-item ordinals or original
merchandise refund progression. For a cancelled order with newly verified funds, preserve the verified receipt, allocate it
to correction and keep fulfillment cancelled. Provider-linked receipts with uncertain class remain
`unassignedAllocatedPoisha` until an audited decision; provider money lacking a verified order link remains **only** in
`providerReceiptIntake`.

**Gateway/uncertainty transition matrix**

| Evidence or decision | Attempt status | Refund / capacity | Monetary effect |
| --- | --- | --- | --- |
| Approved, before external call | `created` | `approved` / `reserved` | Hold class source + unit/delivery amounts once |
| Submitted or request accepted | `submitted` | `processing` / `reserved` | No completed payout yet |
| Timeout, unclear payout | `uncertain` | `processing` / `reserved` | Keep all holds; reconcile same identifier |
| Verified provider completion / manual transfer proof | `confirmed` | `completed` / `completed` | Move held to completed exactly once |
| Verified definitive failure, retry authorized | `failed` | `failed` / `reserved` | Retain same obligation and source capacity for safe new attempt |
| Definitive failure, refund obligation formally withdrawn | `failed` | `failed` / `released` | Release all held funds and unit/delivery reservations in one transaction; new request needs new approved decision |
| Rejected before any payout attempt | No submitted attempt | `rejected` / `released` | Reverse only unspent, still-held balances |

An external acknowledgment or an error string is **not** proof of successful or failed payout. Cancellation/retirement of an obligation with a possibly payable external attempt is prohibited until reconciliation resolves the uncertainty.

## 13. State Transitions and Data Lifecycles

### 13.1 Fulfillment and allocation

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> confirmed: admin COD confirmation / eligible paid order
    pending --> cancelled: approved eligible request
    confirmed --> processing
    confirmed --> cancelled: approved eligible request
    processing --> shipped: dispatch recorded
    processing --> cancelled: approved, not dispatched
    shipped --> delivered
    shipped --> cancelled: final non-delivery + full custody disposition
    delivered --> [*]
    cancelled --> [*]
```

- Checkout accepting COD creates `pending` fulfillment with **committed** stock and confirmed coupon redemption. It does not mark payment Paid or fulfillment Confirmed.
- Verified online collection updates the receipt ledger first. **Fully funded** merchandise is `Paid` regardless of allocation availability or risk review; actual fulfillment confirmation separately requires a non-cancelled order, valid inventory/coupon allocation and risk clearance. Partial funding remains `Pending`; late verified funds for an already-cancelled order remain visible as Paid correction activity without reopening fulfillment. `fulfillmentHold` records why Paid can coexist with pending fulfillment.
- Shipped failed delivery remains Shipped during retries/investigation. `Shipped → Cancelled` is a restricted final non-delivery exception, **not** a pre-dispatch stock-release operation.
- Terminal orders retain payment, refund, return, and audit records; late verified payment against Cancelled creates a correction obligation, not fulfillment reopening.

**Allocation statuses:** `held → committed → shipped` or `held → released`; `committed → released` only before dispatch and with approved cancellation. No transition out of released/shipped; safe retry uses a new generation. Inventory and coupon events share the originating operation key.

### 13.2 Payment, return, and refund state projection

**Payment aggregate decision order** (computed from persisted receipt allocation, original entitlement, refunds and attempt/fulfillment evidence; persist as a rebuildable projection):

| Priority | Condition | `paymentStatus` | Additional presentation / liability |
| --- | --- | --- | --- |
| 1 | Merchandise was fully funded (`merchandiseFunded = expected > 0`) and **completed merchandise-class refund** equals the fully refunded original funded entitlement | `refunded` | Refunds can include separately authorized delivery; only completed payout counts |
| 2 | Merchandise was fully funded and `0 < merchandiseRefundCompleted < merchandiseFunded` | `partially_refunded` | Show reserved/in-progress separately; do not display as refunded before payout |
| 3 | Merchandise funding equals expected (and previous higher-priority conditions false) | `paid` | Can coexist with `fulfillmentHold`, risks or cancelled fulfillment |
| 4 | Fulfillment already cancelled **and verified linked receipt exists** but funds are entirely correction/unassigned | `paid` | Explicit `correction_only` annotation; not a fulfilled purchase |
| 5 | No linked money and order/attempt has a final verified cancelled outcome | `cancelled` | Fulfillment cancellation stays separate |
| 6 | No linked money and all relevant attempts are verified failed with no uncertain/new attempt | `failed` | A future verified collection supersedes this summary |
| 7 | Everything else, including COD awaiting collection, partial/unassigned funds or an uncertain attempt | `pending` | Expose `collected/expected`, `unassigned`, and risk separately |

`expected=0` requires a separately approved zero-value-order flow; do **not** infer `paid` by `0=0`. This proposal does not
create a seventh PRD payment status. `merchandiseRefundCompleted` here includes eligible original delivery charge. For
cancelled orders with merchandise funds already allocated, do not reclassify historic funded receipts merely to make the
status nicer: keep `paid`/refund progression and record cancellation separately. **Correction-only refunds never move a
payment to `partially_refunded` or `refunded`.** Underfunded orders with refunded partial collections remain pending plus
explicit collection/correction detail until approved reconciliation; no automatic dispatch.

**Outstanding liability (as of the report instant):** `merchandiseRefundHeld + correctionRefundHeld` is approved/in-flight
reserved liability; `merchandiseRefundCompleted + correctionRefundCompleted` is disbursed cash, not outstanding liability.
Unassigned and correction funds with no refund obligation are **unresolved cash**, shown separately from approved payout
liability. `unmatched provider intake` is **unattributed merchant cash** in reconciliation reports only, never an order
total. Do not combine these categories into one undifferentiated paid/refunded number.

| Record | Primary permitted path | Important exception |
| --- | --- | --- |
| Payment attempt | `created → initiated → pending/uncertain → verified_paid/verified_failed/verified_cancelled` | A subsequently validated paid receipt remains recorded after stale failure |
| Provider intake | `unmatched → linked` or `unmatched → quarantined → linked` | Linking requires matching proof, one-to-one receipt ID and audit |
| Physical return | `requested → under_review → approved → awaiting_return → received → inspected → completed` | Reject at authorized stages; only inspected resellable stock restocks |
| Shortage claim | `requested → under_review → approved → completed` | Reject with reason; never fabricate received or inspected state |
| Refund | `requested → under_review → approved → processing → completed` | `processing → failed` only after verified terminal outcome; retry retains original obligation/capacity |
| Refund attempt | `created → submitted/uncertain → confirmed/failed` | Unknown payout reconciled before safe retry or release |
| Coupon redemption | `held → redeemed` or `held → released` | `redeemed → released` only for qualifying pre-shipment cancellation |

Payment, fulfillment, risk review, correction, refund capacity, and external provider evidence are different dimensions. A late provider response must not silently reverse a confirmed, verified receipt.

### 13.3 Scheduled expiry and reconciliation

| Record | Trigger | Required action |
| --- | --- | --- |
| Session/challenge/context | `expiresAt <= now` | Reject immediately; TTL may later delete |
| Online hold | `status=held` and hold `expiresAt <= now` | Safely check dependent active/uncertain attempts; transition to released once when eligible |
| Payment attempt | Pending/uncertain beyond provider check window | Independently query provider; preserve ambiguous state until resolved |
| Unmatched provider funds | Validated intake still `unmatched` / `quarantined` | Revalidate matching references, queue authorized reconciliation; never fabricate order ID |
| Refund attempt | Submitted/uncertain payout | Verify provider/manual transfer before marking completed, failed or retry-safe |
| Notification | Retry due and under bounded retry budget | Claim and send; update message state only |
| Job lease | Expired lease | Another worker may claim; business operation remains individually idempotent |

**Expiry is not financial failure.** The 15-minute checkout hold deadline controls stock/coupon allocation, not whether an actual gateway receipt can arrive later. Reconciliation may identify a late paid transaction after expiry, where allocation must be reacquired or the payment corrected.

### 13.4 Creation, updates, and deletion policy

- **Write-once evidence:** `orders.items[]`, checkout customer/delivery **rule**/pricing/terms snapshots, original attempt initiation/verification facts, **receipt core** of `providerReceiptIntake` and `paymentCollections`, stock movement facts, and confirmed payout evidence. Source allocation/class/capacity **projections** are separately allowlisted mutable fields with audit and revision guards (§8.6).
- **Mutable workflow records:** order fulfillment state, live master data, stock counters, active holds, claim/refund statuses and current store settings, always with audit or causal history where material.
- **Deactivation:** user, product, category, variant and coupon eligibility may be deactivated without damaging referenced historical orders.
- **Safe cleanup:** expired token artifacts and abandoned unreferenced media according to approved retention rules; never detach images needed to support open return evidence or orders without a reviewed policy.

## 14. Security, Privacy, and Retention

### 14.1 Data classification and access

| Class | Data examples | Storage and access rule |
| --- | --- | --- |
| Authentication secrets | Password hashes, hashed session/proof/context tokens | Backend-only; exclude from default projections and logs; strong hash for passwords and appropriately keyed/one-way token digests |
| Customer PII | Name, email, phone, address, support complaint | Limit to authorized owner/admin; protect at rest/in transit and in backups; minimize exports |
| Financial evidence | Gateway identifiers, verified collection references, refund/transfer receipts | Restricted service/admin roles; preserve source provenance; no raw card credentials |
| Business master | Products, variants, public policies, active delivery coverage | Public read only for approved subset; admin writes authenticated and validated |
| Operational/audit | IP-related security metadata, job errors, admin decisions | Least privilege, redaction and authorized retention |

- MongoDB credentials and gateway/Cloudinary/email secrets are environment-managed, not stored in collections or browser bundles.
- Enforce row/document ownership in Express, including nested order items, refunds, claims, guest sessions and support records. A valid ObjectId is **not** proof of access.
- Public APIs must omit hashed secrets, administrative notes, raw verification evidence and private guest/customer data.
- Production database users should have narrowly scoped read/write privileges; separate migration/operator credentials from runtime service credentials where feasible.
- Validate schema and query inputs to prevent operator injection; do not pass arbitrary user-defined MongoDB predicates into queries.
- Maintain protected/encrypted backups and sanitized nonproduction fixtures. Do not replicate live personal/customer/payment records to developer machines by default.

### 14.2 Retention and erasure boundaries

| Record category | Default handling | Exact retention period |
| --- | --- | --- |
| Expired sessions/challenges/context | Reject by timestamp; TTL cleanup permitted | Set with security/operations approval |
| Cart/wishlist/profile | Maintain while account exists; deletion requests require verified processing | Operator policy and applicable legal requirements |
| Orders/items/delivery snapshots | Preserve source-of-truth history for disputes, accounting and legal duties | **Not approved here** |
| Attempts, verified collections, refunds, financial corrections | Preserve immutable financial evidence and reconciliation trail | **Not approved here** |
| Inventory movements/redemptions/return claims | Preserve consistency and audit trace | **Not approved here** |
| Complaints/notifications | Minimize and retain for approved response/support obligation | **Not approved here** |
| Administrative/security audit | Append-only, access-controlled, integrity-protected retention | **Not approved here** |
| Product media and return evidence | Clean unused/orphaned assets only when no active evidence/retention dependency | **Not approved here** |

**Account deletion:** verify requester ownership; revoke active sessions; assess ongoing orders, legally required
financial/complaint evidence and deletion rights; pseudonymize/minimize personal account data where law/policy allows
without destroying required immutable financial facts. Record the decision and actions. The PRD does not authorize guessing
a numeric legal retention period or introducing an unapproved self-service deletion workflow.

### 14.3 Reporting data integrity

- Gross merchandise value uses **accepted non-cancelled orders** by **order placement period**, computed from original pre-discount merchandise snapshots; show sale and coupon discounts separately.
- Linked paid collections use verified `paymentCollections.collectedAt`, **including separately disclosed overpayments**; COD counts only after verified collection. Independently verified **unmatched** merchant funds from `providerReceiptIntake` appear in a separate suspense/reconciliation line, never as an order sale or linked receipt.
- Completed refunds use `refunds.completedAt`, separately classified as merchandise vs payment correction.
- Net **linked** cash flow = linked verified collections minus **completed** refunds within the selected cash-flow period; show unmatched intake funds separately. Neither total is profit; pending refunds are outstanding liabilities, not already-paid refunds.
- All reports state date basis, `Asia/Dhaka` business timezone, cutoff, and handling of cancellations/corrections. Any materialized summary must be rebuildable from primary records and reconciled before use.

## 15. Migrations, Environments, and Recovery

### 15.1 Versioned migration procedure

1. **Design:** Register the field/index change, requirement source, impact on existing snapshots, backfill/rollback decision, and approval status.
2. **Preflight:** Inspect duplicate identities, provider references and existing invalid documents **before** creating unique indexes; fail safely rather than force-dropping data.
3. **Expand:** Introduce backward-compatible optional fields and new indexes; do not invalidate running application versions mid-deployment.
4. **Backfill:** Run an idempotent, bounded, resumable migration using checkpointed progress and deterministic transformations. Keep a repair ledger for conflicts.
5. **Verify:** Compare counts, reconciliation equations, unique indexes, and sample documents; execute multi-record transaction tests.
6. **Cut over:** Deploy readers/writers for the new schema version, then tighten validators only after migration and rollback gate approval.
7. **Rollback/repair:** Preserve original accounting evidence; never blindly reverse paid receipts, shipped stock movements, or completed payouts. Use explicit compensating records and authorized incident procedure.
8. **Record:** Commit migration name/version, deployment environment, run result and test evidence. No migration is considered executed by its appearance in this document.

**Proposed code location:** `backend/src/db/migrations/` (or an equally documented backend-owned path); use monotonic
migration IDs, an append-only migration run record and environment-controlled execution. The final repository folder layout
must remain aligned with `ARCHITECTURE.md` §4 rather than silently inventing another application.

### 15.2 Environment matrix

| Environment | Database baseline | Data policy | Required gate |
| --- | --- | --- | --- |
| Local development | Replica-set-capable MongoDB for transaction scenarios | Synthetic seed records | Schemas and tests load cleanly |
| CI/integration | Isolated replica set, reproducible schema/index bootstrap | Deterministic synthetic fixtures | Duplicate/race/failure tests pass |
| Staging | Deployment-equivalent feature/index support | Approved sanitized content and provider sandbox | Integration, reconciliations, restore rehearsal |
| Production | Managed transaction-capable MongoDB with restricted access and backup | Real records; retention controls and encryption | Verified indexes, backups, restore plan, monitoring and release authorization |

### 15.3 Seed/fixture conventions

- Seed operator-independent defaults only; never manufacture customer identities, merchant activation, completed payouts, approved laws, or production stock levels.
- Use deterministic SKUs, identifiers and money amounts in tests; cover one-unit stock, competing holds, guest purchases, high-risk verification, duplicate paid attempts, partial refund unit rounding and return eligibility.
- Fixture cleanup never uses TTL to fake stock release. Explicitly exercise expiry jobs and corresponding movement/redemption records.
- Production bootstrap of the initial admin requires approved private provisioning and credential handling; it is **not** a public signup or shared default credential.

### 15.4 Backup, reconciliation, and restoration prerequisites

- `OPERATIONS.md` will own exact backup cadence, retention, encryption, restore commands, escalation and recovery objectives; these require operator approval and environment capability validation.
- A restored database must retain unique index definitions, checkout-key tombstones, unmatched provider intake, linked receipts, active allocations, live refund commitments, provider references and durable job state; rebuild derived payment/product counters only through a verified reconciliation process.
- Restoration acceptance must check snapshot/index compatibility, aggregate money equations, inventory movement reconciliation, coupon usage totals, and any provider payments/refunds occurring after the backup point. **Restoring old data does not reverse externally completed money movements.**
- Schedule reconciliation of uncertain gateway receipts, unsettled refund attempts, held allocation age, cash-flow projections, and stock movement deltas. Surface discrepancies for authorized resolution instead of silent destructive repairs.

## 16. Verification and Traceability

### 16.1 Database verification matrix

| Area | Required test/assertion | Expected result |
| --- | --- | --- |
| Identity | Concurrent duplicate normalized-email registration | Exactly one valid account; unique conflict for other |
| Sessions/guest | Expired or replayed proof; guest scope escalation; admin/customer cookie confusion | Denied; token not reusable; no cross-role access |
| Catalog | Duplicate SKU/slug, inactive variant/category, missing default SKU | Write/checkout rejected as applicable |
| Checkout | Same key, concurrent submissions; same key with changed payload | One order or deterministic conflict |
| Inventory | Two orders for last unit; expired hold; duplicate release/dispatch | No negative available stock or duplicated movement |
| Coupon | Global/per-user final usage race; guest restricted coupon; retry after expiry | Quotas respected with no phantom redemption |
| Pricing | Sale→coupon→delivery; mixed eligible lines and odd-poisha proportional allocation | Exact integer reconciliation and deterministic split |
| Payment | Duplicate/out-of-order IPN; redirect-only success; no callback; late verified payment | One provider intake per real verified collection, exactly-once linking; no browser-only Paid |
| Unmatched receipt | Independently verified funds with no identifiable local order; later successful matching | No fabricated ownership; one unique unmatched intake record; link once after reconciliation |
| Partial/excess collection | 40k + 60k, 120k against 100k, multi-receipt attempt | Funding/excess allocations reconcile to receipts; no duplicate fulfillment |
| Overpayment | Two separately paid attempts for same order | Two verified receipts; one fulfillment allocation; correction case |
| COD | Accepted without collection; duplicate admin collection proof | Stock committed, payment pending until one verified receipt |
| Cancellation | Request pending while shipment starts | Atomic eligibility check; no post-dispatch ordinary release |
| Claims | Overlapping partial physical/shortage quantities; invalid inspection skip | No overclaim; shortage never restocks |
| Refunds | Concurrent partial refunds across receipts and ordinals; double payout retry; gateway timeout | Source **class**, unit and delivery caps respected; uncertainty stays reserved |
| Refund provider IDs | Initiation with missing/duplicate merchant refund ID; later provider refund-ref result | No initiated gateway request without persisted unique `refundTransId`; payout only on verified status |
| Payment projections | Partially funded, correction-only, refund held vs completed, cancellation after payment | Every status and liability obeys §13.2 priority and can be rebuilt from facts |
| Delivery rules | Concurrent supersession, deactivate/no replacement, scheduled activation and 14-day confirmation anchor | Serialized nonoverlap; immutable charge snapshot; target calculated from real `confirmedAt` and legal cap |
| Policy publication | Draft edit CAS, approval proof, future schedule and rollback | Approved content immutable; public active pointer changes once at effective time; historic order references resolve |
| Master ETags | Concurrent category/product/variant/zone/charge edits | Revision increments on every editable change and stale `If-Match` rejects lost writes |
| Attempt amounts | Provider under/over mismatch vs immutable expected; retry after supervised partial settlement | Quarantine until verified, then allocate only real receipts and compute remaining charge safely |
| Delivery exception | Shipped failed delivery and final closure | Custody coverage and inspected receipt required |
| Security | Model mass assignment, unauthorized nested reads/writes, secrets in projections | All blocked/redacted |
| Lifecycle | TTL race vs session proof; 15-minute hold vs TTL deletion | Authorization/hold transitions unaffected by TTL lag |
| Reporting | Duplicate collection, correction payout and period boundary | Correct distinct collections/refunds and timezone cutoff |
| Recovery | Backup restore plus subsequently verified provider payment | External ledger reconciled; no double order/stock/payout |

**Evidence location:** Executable commands, fixture definitions, concurrency harness, performance budgets and observed results belong in the [`TESTING.md`](./TESTING.md) verification plan and the corresponding `TASKS.md` evidence entry. These are acceptance **requirements**, not claims of passing tests.

### 16.2 Requirements coverage matrix

| PRD source | Database-owned coverage | Primary sections |
| --- | --- | --- |
| FR-01, FR-02, FR-19, FR-21, FR-27 | Users, address snapshots, sessions, verification, scoped guest, deletion review | §§5, 14 |
| FR-03–FR-06, FR-23–FR-24 | Categories, products, variants, search indexes, media references | §§6, 11 |
| FR-07–FR-08 | Registered cart/wishlist; local guest-cart boundary | §6 |
| FR-09, FR-30 | Coupons, eligible totals, held/confirmed usage, global/per-customer counters | §§2.3, 8.1–8.3, 12.4 |
| FR-10, FR-31 | Verified reviews, one-active rule and moderated rating projections | §§6.6, 11 |
| FR-11, FR-14–FR-16, FR-26, FR-28 | Checkout identity, immutable order/charge/terms snapshot, delivery exception, admin review | §§7.1–7.6, 13 |
| FR-12, FR-29 | Provider attempts, independently verified receipts, COD/overpayment and reconciliation | §§8.4–8.7, 12 |
| FR-13, FR-25 | Variant counters, active reservation generations, movements, atomic inventory invariants | §§7.7–7.8, 12.3 |
| FR-17, FR-18, FR-32–FR-33 | Claim quantity, physical/shortage separation, collection-funded refunds and payout evidence | §§7.3, 9, 12.5 |
| FR-20 | Transactional notification intent and retry state | §10.1 |
| FR-22 | Cash-flow periods, collections, merchandise/correction separation, as-of liabilities | §14.3 |
| FR-34 | Store configuration, durable policy drafts/publications and policy-version snapshots | §§7.6, 10.4–10.5 |
| PRD §§10–12, 14, 18–19 | Data integrity, retention/security, exception cases, release checks | §§11–16 |
| Architecture §§7, 9–10, 12 | Technical integrity, access scope, business transitions and retry safety | Throughout |
| Implementation Plan §§3–4, 6, 11 and Tasks P03-017 | Incremental data contracts, tests, migration and evidence gates | §§1, 15–16 |

### 16.3 Acceptance checklist for the specification

- [ ] All 27 PRD logical entities have an explicit storage mapping; all 35 proposed physical collections have an owner.
- [ ] Every proposed physical collection has an owner, business field schema, validation and relevant indexes.
- [ ] Every order/payment/stock/coupon/claim/refund balance has a documented atomic transition and recovery path, including unmatched cash, partial/excess allocations and ordinal-split refunds.
- [ ] Mermaid diagrams agree with the tables and are rendered/visually checked in the target Markdown viewer.
- [ ] Field names and enum values are reconciled with the future `API.md` DTO contracts.
- [ ] Unresolved policy/provider/retention decisions are approved or retained as explicit release blockers.
- [ ] Mongoose schemas, actual MongoDB indexes, unique/partial filter predicates and transaction tests match this specification.
- [ ] All cross-document deviations are approved and documented rather than silently inferred.

---

## Appendix A — Cross-document Decision Register

These are **design proposals or external approvals still required**, not product requirements that have been silently changed. The document can guide implementation, but approval and executable verification remain necessary.

| ID | Decision / dependency | Proposed handling | Status |
| --- | --- | --- | --- |
| DB-D01 | Physical collections vs embedded entities | Split high-growth/independently changed records; embed bounded snapshots/addresses/return items | Proposed |
| DB-D02 | SKU stock authority | Counters live in `productVariants`; immutable event trail in `inventoryMovements` | Proposed |
| DB-D03 | Per-customer coupon quota concurrency | Separate `couponCustomerCounters`, atomic with global coupon counters | Proposed |
| DB-D04 | Refund source accounting | Every refund has exactly one verified `sourceCollectionId`; split cross-collection payouts | Proposed |
| DB-D05 | Guest CSRF context persistence | `browserContexts` plus one-time `authChallenges` and scoped sessions | Proposed |
| DB-D06 | Checkout idempotency retention and legal deletion | Retain minimal **non-TTL** key/order tombstone; retired replay key fails closed; approve erasure/archival duration with API and operations | Open policy decision; duplicate-order safety specified |
| DB-D07 | Merchant/provider identifiers and duplicate-charge cardinality | Merchant `refundTransId` required; provider `refundRefId` later. No unique attempt→receipt assumption. Confirm exact provider identity, refund references and merchant capability in sandbox | External verification required |
| DB-D08 | Active/scheduled delivery rules and regional charges | Serialized non-overlap per coverage key, one current active rule, area-first fallback; actual regions/charges operator supplied | Operator approval required |
| DB-D09 | Store policy versions, delivery/complaint legal deadlines, 7-day return/7-business-day refund targets | Snapshot approved policy; do not assert legal verification from PRD defaults | Legal/operator approval required |
| DB-D10 | PII/transaction/audit retention, deletion and recovery objectives | No invented legal duration; finalize approved retention matrix before production | Legal/operator approval required |
| DB-D11 | Search index design, catalog sizes, performance budgets | Select after profiling real query shapes and approved test workload | Deferred until benchmark |
| DB-D12 | Admin initial account, SSL payment-channel activation and gateway credentials | Protected provisioning/verified merchant configuration; no placeholder production success | External prerequisite |
| DB-D13 | Unmatched, partial and excess verified funds | `providerReceiptIntake` separates unknown ownership; linked receipts have exact merchandise/correction/unassigned amounts and auditable reallocations | Proposed technical contract; sandbox approval pending |
| DB-D14 | Versioned migration execution and actual index support | Verify compatibility with selected MongoDB/Mongoose versions and deployed topology | Not yet verified |
| DB-D15 | Numeric field/array validation limits | Use proposed global bounded defaults in §2.2; reconcile with final API/UI before acceptance | Proposed |
| DB-D16 | Monetary rounding and refund unit accounting | Half-up basis-point calculation; largest remainder tie-break; unit-ordinal source-funded partial refunds | Proposed; requires tests |

## Appendix B — Schema Implementation Checklist

| Stage | Expected code/review artifact | Source gate |
| --- | --- | --- |
| Identity foundation | `users`, sessions, contexts/challenges, index bootstrap, single-use proofs | Tasks P03-003, P03-004, P03-017 |
| Catalog | Category/product/variant models, SKU/index tests and stock counters | Implementation Plan Phase 04 |
| Shopping and promotion | Cart/wishlist/review, coupon global+per-user capacity and holds | Phases 04–05 |
| Checkout/COD | Orders and snapshots, item balances, intent uniqueness, COD allocation/delivery rules | Phase 06 |
| Online payments | Attempts, unmatched provider intake, linked receipts, partial/excess allocation, uncertain reconciliation | Phase 07 |
| Returns/refunds | Unit-ordinal quantity guard, evidence/inspection, class-specific source commitments, merchant/provider payout references | Phase 08 |
| Administration and reporting | Audit/support/settings, reporting cash-flow formulas | Phase 09 |
| Release evidence | Security, race tests, real index verification, backup/restore and reconciliation | Phases 10–11 |
| Handover | Reconcile this schema with delivered Mongoose models, migrations, and tests | Phase 12 |

**Definition of complete:** This document becomes the accepted database contract only after outstanding design decisions
are resolved, `API.md` mappings are reconciled, implementation/indexes are reviewed, integration tests prove the stated
invariants, and release-specific legal/provider/operator prerequisites are verified. A finished Markdown file by itself is
not evidence of a working database. The earlier v1.1 review corrections are retained in this **v1.2** proposal, including the subsequent API/database alignment; runtime, production, and provider sign-off remain pending.
