# P01-003 — Functional requirements traceability

**Verified:** 17 October 2026 (Asia/Dhaka)\
**Executor:** Codex\
**Verification:** Passed — planning coverage\
**Task status:** Done

This register maps every [PRD §5](../PRD.md#5-functional-requirements) clause and
[§14](../PRD.md#14-acceptance-criteria) acceptance check to implementation ownership, UI/API context and a planned
verification vector. [P01-001](./P01-001-baseline.md#acceptance) is accepted. Product requirements remain unchanged.

Coverage: 34 FR contexts; 573 clause vectors (550 bullets and 23 descriptions); 69 acceptance checks; eight NFR areas
handed to P01-004. All feature execution/evidence slots are Not Run.

## How to use the register

- Each clause vector has a stable local ID: FR number, source group and ordinal within that group. Existing FR, task,
  scenario and AC IDs retain their meanings. DESC captures the FR description; all 550 source bullets are mapped too.
- The verbatim source cell defines the complete expected assertion, including every condition in a multi-sentence rule.
  Enumerated methods/statuses/reasons each receive their own vector; verify allowed values and forbidden transitions.
- Each clause row has one accountable implementation task. The FR context lists shared delivery tasks, named UI/service
  surfaces and owning API contracts. A task's PXX prefix identifies its phase; named personnel are assigned at execution.
- The scenario family is the starting procedure in TESTING.md, not a claim that an existing executable test already
  proves the clause. Extend it with the exact vector assertion, valid/invalid input, authorization and relevant retry,
  failure/concurrency paths. UI-* entries are suite aliases; GATE-* requires actual provider evidence.
- Use the vector/AC ID as its unique evidence slot. Every slot starts Not Run. Coverage means mapped, never passed.
  A domain feature is accepted only after all its applicable clause vectors and AC checks have real results.

| Required execution field | Content per vector / AC slot |
| --- | --- |
| Source and implementation | Vector/AC ID, owning task, source revision, implementation commit and executable test ID |
| Environment | Run ID, tool versions, isolated data/provider mode and relevant configuration |
| Assertion | Exact source behavior, fixture/input, action, expected result and forbidden side effects |
| Outcome | Passed / Failed / Blocked / Not Run, observed result and defect/EXT reference where applicable |
| Evidence and review | Durable sanitized artifact link, execution time, reviewer and actual acceptance |

## Functional contexts and shared ownership

All clause vectors below inherit the corresponding row's UI/service and API context. The first task is the default
accountable task; clause rows refine responsibility where a requirement crosses domains. All listed shared tasks must
satisfy their declared dependencies; parallel UI work does not bypass backend or provider gates.

| FR context | Accountable / shared tasks | UI or service surface | Owning API contracts | Verification families |
| --- | --- | --- | --- | --- |
| [FR-01](#fr-01) | `P03-007`, `P03-010`, `P03-004`, `P03-005`, `P03-014`, `P03-013`, `P09-003`, `P03-015`, `P03-016`, `P10-005`, `P11-003` | Register / Login / Recovery; identity service | [API §9.1](../API.md#91-authentication-and-account-endpoint-contracts) | API-01, API-02, SEC-01, SEC-03 |
| [FR-02](#fr-02) | `P03-008`, `P03-011`, `P03-010`, `P06-014`, `P05-004`, `P05-012`, `P08-012`, `P06-005`, `P03-004`, `P03-013`, `P03-015`, `P03-016`, `P08-013` | Profile / Addresses / My Orders / Wishlist / My Reviews / Returns / Refund Details | [API §9.1](../API.md#91-authentication-and-account-endpoint-contracts), [API §10.2](../API.md#102-cart-and-wishlist), [API §10.3](../API.md#103-coupon-and-review-contracts), [API §11.1](../API.md#111-checkout-requestquotesubmission), [API §13.1](../API.md#131-customerguest-claims-and-refund-visibility) | ACC-01, ACC-02, ACC-03, ACC-04, ACC-05, SEC-06 |
| [FR-03](#fr-03) | `P04-012`, `P02-006`, `P09-008`, `P04-015`, `P11-006`, `P09-005` | Home / storefront navigation / contact and policy links | [API §10.1](../API.md#101-public-catalog-and-discovery), [API §14.3](../API.md#143-delivery-promotions-content-and-settings) | UI-HOME, UI-CONTENT, CAT-01 |
| [FR-04](#fr-04) | `P04-009`, `P04-013`, `P04-002`, `P04-001`, `P04-011`, `P04-015`, `P10-009` | Products / Category / public catalog service | [API §10.1](../API.md#101-public-catalog-and-discovery) | CAT-01, CAT-03, UI-CAT |
| [FR-05](#fr-05) | `P04-010`, `P04-014`, `P05-001`, `P05-004`, `P05-010`, `P06-004`, `P04-002`, `P04-003`, `P04-011`, `P04-015`, `P10-009` | Product Details / variant selector / reviews / cart and wishlist actions | [API §10.1](../API.md#101-public-catalog-and-discovery), [API §10.2](../API.md#102-cart-and-wishlist), [API §10.3](../API.md#103-coupon-and-review-contracts), [API §13.1](../API.md#131-customerguest-claims-and-refund-visibility) | CAT-01, CAT-02, UI-CAT |
| [FR-06](#fr-06) | `P04-002`, `P04-006`, `P04-014`, `P06-005`, `P04-005`, `P04-010`, `P04-015` | Product Details / admin Products; variant and snapshot services | [API §10.1](../API.md#101-public-catalog-and-discovery), [API §14.1](../API.md#141-catalog-categories-and-variants-admin), [API §11.2](../API.md#112-price-hold-and-order-response-rules) | CAT-02, DB-02, INV-01 |
| [FR-07](#fr-07) | `P05-002`, `P05-011`, `P05-001`, `P05-003`, `P06-004`, `P05-013` | Cart / login merge / checkout refresh | [API §10.2](../API.md#102-cart-and-wishlist), [API §11.1](../API.md#111-checkout-requestquotesubmission) | SHP-01, UI-SHP |
| [FR-08](#fr-08) | `P05-004`, `P05-012`, `P05-013` | Wishlist / Product Details / Cart | [API §10.2](../API.md#102-cart-and-wishlist) | SHP-02, SEC-06, UI-SHP |
| [FR-09](#fr-09) | `P05-006`, `P05-005`, `P05-008`, `P05-007`, `P06-010`, `P06-008`, `P07-013`, `P05-011`, `P05-013`, `P06-004`, `P06-007`, `P06-009`, `P06-020`, `P07-008`, `P07-009`, `P10-002` | Coupon entry / Cart / Checkout / admin Coupons; hold/redemption jobs | [API §10.3](../API.md#103-coupon-and-review-contracts), [API §11.1](../API.md#111-checkout-requestquotesubmission), [API §14.3](../API.md#143-delivery-promotions-content-and-settings), [API §15.](../API.md#15-idempotency-concurrency--recovery) | PRM-01, PRM-02, PRM-03, PRM-04, DB-05 |
| [FR-10](#fr-10) | `P05-009`, `P05-010`, `P09-006`, `P08-016`, `P05-012`, `P05-013`, `P08-017`, `P08-018` | Product reviews / My Reviews / admin Reviews | [API §10.3](../API.md#103-coupon-and-review-contracts), [API §14.2](../API.md#142-orders-delivery-customers-and-review-moderation-admin) | REV-01, SEC-06, UI-CAT, UI-ADMIN |
| [FR-11](#fr-11) | `P06-004`, `P06-001`, `P06-018`, `P06-005`, `P06-006`, `P06-008`, `P06-009`, `P06-020`, `P07-004`, `P10-002`, `P11-008` | Checkout / Order Confirmation; quote, intent and order services | [API §11.1](../API.md#111-checkout-requestquotesubmission), [API §11.2](../API.md#112-price-hold-and-order-response-rules) | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| [FR-12](#fr-12) | `P07-006`, `P07-003`, `P06-008`, `P07-004`, `P07-002`, `P07-013`, `P07-007`, `P07-005`, `P07-012`, `P07-014`, `P06-012`, `P07-010`, `P06-010`, `P11-005`, `P01-006`, `P07-001`, `P07-008`, `P07-009`, `P07-011`, `P07-015`, `P07-017`, `P10-003`, `P11-004`, `P11-009`, `P12-005` | Checkout payment selection / Payment Result / admin Payments; provider callbacks and jobs | [API §12.1](../API.md#121-payment-surfaces-and-statuses), [API §12.2](../API.md#122-hosted-initiation-retries-and-uncertain-state), [API §12.3](../API.md#123-ipn-browser-returns-and-independent-verification), [API §12.4](../API.md#124-financial-projection-and-correction-contract), [API §12.5](../API.md#125-cod-collection) | PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07, PAY-08, PAY-09, PAY-10, PAY-11, PAY-12, PAY-13, PAY-14 |
| [FR-13](#fr-13) | `P04-008`, `P04-006`, `P06-009`, `P06-010`, `P06-013`, `P06-007`, `P07-011`, `P07-009`, `P06-008`, `P06-011`, `P08-004`, `P04-015`, `P06-020`, `P07-008`, `P07-017`, `P10-002` | Checkout / admin Inventory / fulfillment; reservation and movement services/jobs | [API §11.1](../API.md#111-checkout-requestquotesubmission), [API §11.2](../API.md#112-price-hold-and-order-response-rules), [API §11.3](../API.md#113-cancellation-fulfillment-and-shipment), [API §12.4](../API.md#124-financial-projection-and-correction-contract), [API §13.2](../API.md#132-admin-claim-and-return-processing), [API §15.](../API.md#15-idempotency-concurrency--recovery) | INV-01, INV-02, INV-03, DB-05, DB-09 |
| [FR-14](#fr-14) | `P06-014`, `P06-013`, `P08-012`, `P08-013`, `P06-003`, `P06-005`, `P06-011`, `P06-017`, `P07-011`, `P06-019`, `P06-020` | My Orders / Order Details / guest tracking / admin fulfillment | [API §11.1](../API.md#111-checkout-requestquotesubmission), [API §11.3](../API.md#113-cancellation-fulfillment-and-shipment), [API §12.1](../API.md#121-payment-surfaces-and-statuses), [API §13.1](../API.md#131-customerguest-claims-and-refund-visibility) | ORD-01, ORD-02, ORD-03, ORD-04, UI-ORD |
| [FR-15](#fr-15) | `P06-013`, `P08-005`, `P06-016`, `P06-019`, `P06-020`, `P08-018` | Order Details / cancellation request and admin review | [API §11.3](../API.md#113-cancellation-fulfillment-and-shipment), [API §13.3](../API.md#133-refund-obligation-and-payment-execution) | ORD-02, ORD-03, PAY-07 |
| [FR-16](#fr-16) | `P06-003`, `P06-001`, `P06-011`, `P06-017`, `P11-007`, `P06-016`, `P09-004`, `P01-007`, `P06-002`, `P06-018`, `P06-020`, `P09-008`, `P11-006` | Checkout delivery / tracking / Delivery Settings / complaints and exceptions | [API §11.1](../API.md#111-checkout-requestquotesubmission), [API §11.3](../API.md#113-cancellation-fulfillment-and-shipment), [API §14.2](../API.md#142-orders-delivery-customers-and-review-moderation-admin), [API §14.3](../API.md#143-delivery-promotions-content-and-settings), [API §14.4](../API.md#144-dashboard-complaints-and-audit) | ORD-04, ORD-05, ORD-06, SUP-04, REL-10 |
| [FR-17](#fr-17) | `P08-002`, `P08-001`, `P08-012`, `P08-003`, `P08-004`, `P01-007`, `P08-011`, `P08-018`, `P11-007` | Return Request / My Returns / evidence / admin Returns | [API §13.1](../API.md#131-customerguest-claims-and-refund-visibility), [API §13.2](../API.md#132-admin-claim-and-return-processing), [API §16.2](../API.md#162-media-upload-contract) | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| [FR-18](#fr-18) | `P08-005`, `P08-006`, `P08-008`, `P08-010`, `P08-013`, `P08-009`, `P08-011`, `P08-007`, `P01-006`, `P01-007`, `P07-011`, `P08-018`, `P10-004`, `P11-004`, `P11-005`, `P11-007`, `P11-009`, `P12-005` | Refund Details / admin Refunds; payout and reconciliation services | [API §13.1](../API.md#131-customerguest-claims-and-refund-visibility), [API §13.3](../API.md#133-refund-obligation-and-payment-execution), [API §13.4](../API.md#134-refund-response-and-statuses), [API §13.5](../API.md#135-refund-execution-sequence) | RFD-01, RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, DB-12 |
| [FR-19](#fr-19) | `P06-015`, `P06-013`, `P08-012`, `P08-013`, `P06-019`, `P06-020`, `P10-005`, `P11-008` | Guest Order Lookup / scoped Order Details / cancellation / returns / refund tracking | [API §9.2](../API.md#92-verified-guest-access), [API §11.1](../API.md#111-checkout-requestquotesubmission), [API §11.3](../API.md#113-cancellation-fulfillment-and-shipment), [API §13.1](../API.md#131-customerguest-claims-and-refund-visibility) | ORD-07, API-09, SEC-05 |
| [FR-20](#fr-20) | `P03-009`, `P03-010`, `P06-016`, `P07-016`, `P08-011`, `P06-020`, `P10-010`, `P11-004` | Transactional email templates / delivery worker / business event producers | [API §16.3](../API.md#163-transactional-email-and-public-notifications) | NTC-01, NTC-02, NTC-03, NTC-04, NTC-05, NTC-06, NTC-07, NTC-08, NTC-09, NTC-10, NTC-11, NTC-12, REL-05 |
| [FR-21](#fr-21) | `P03-012`, `P03-013`, `P03-005`, `P03-014`, `P03-004`, `P03-015`, `P03-016`, `P09-010`, `P10-005`, `P11-003`, `P11-008` | Admin Login / Recovery / protected layout; provisioning and authorization services | [API §9.1](../API.md#91-authentication-and-account-endpoint-contracts), [API §4.](../API.md#4-authentication-sessions--csrf), [API §5.](../API.md#5-authorization--data-exposure) | SEC-02, SEC-03, SEC-04, UI-ADMIN-AUTH |
| [FR-22](#fr-22) | `P09-001`, `P09-002`, `P09-009`, `P09-010` | Admin Dashboard / Reports; snapshot and financial aggregation services | [API §14.4](../API.md#144-dashboard-complaints-and-audit) | ADM-06, UI-ADMIN |
| [FR-23](#fr-23) | `P04-005`, `P04-003`, `P04-002`, `P04-015`, `P09-010`, `P11-006` | Admin Products / Add / Edit / media uploads | [API §14.1](../API.md#141-catalog-categories-and-variants-admin), [API §16.2](../API.md#162-media-upload-contract) | CAT-01, CAT-02, API-04, UI-ADMIN |
| [FR-24](#fr-24) | `P04-004`, `P04-001`, `P04-003`, `P04-015`, `P09-010` | Admin Categories / hierarchy / category images | [API §14.1](../API.md#141-catalog-categories-and-variants-admin), [API §16.2](../API.md#162-media-upload-contract) | CAT-01, DB-02, UI-ADMIN |
| [FR-25](#fr-25) | `P04-007`, `P04-006`, `P08-004`, `P04-015`, `P09-007`, `P09-010` | Admin Inventory / movements / return restock review | [API §14.1](../API.md#141-catalog-categories-and-variants-admin), [API §13.2](../API.md#132-admin-claim-and-return-processing) | DB-09, INV-01, INV-02, INV-03, UI-ADMIN |
| [FR-26](#fr-26) | `P06-011`, `P07-015`, `P06-013`, `P09-004`, `P08-015`, `P06-003`, `P06-012`, `P06-017`, `P06-019`, `P06-020`, `P09-007`, `P09-010`, `P11-008`, `P12-004` | Admin Orders / Order Details / complaints / linked Returns and Refunds | [API §14.2](../API.md#142-orders-delivery-customers-and-review-moderation-admin), [API §14.4](../API.md#144-dashboard-complaints-and-audit), [API §11.3](../API.md#113-cancellation-fulfillment-and-shipment), [API §13.2](../API.md#132-admin-claim-and-return-processing), [API §13.3](../API.md#133-refund-obligation-and-payment-execution) | ORD-01, ORD-02, ORD-03, ORD-04, SUP-01, SUP-02, SUP-03, SUP-04, UI-ADMIN |
| [FR-27](#fr-27) | `P09-003`, `P09-009`, `P09-010` | Admin Customers / customer order and after-sales history | [API §14.2](../API.md#142-orders-delivery-customers-and-review-moderation-admin), [API §5.](../API.md#5-authorization--data-exposure) | ADM-01, ADM-02, ADM-03, ADM-04, API-08, SEC-06 |
| [FR-28](#fr-28) | `P06-001`, `P06-002`, `P06-020`, `P09-005`, `P09-010`, `P11-006` | Admin Delivery Settings / Checkout; versioned coverage service | [API §14.3](../API.md#143-delivery-promotions-content-and-settings), [API §11.1](../API.md#111-checkout-requestquotesubmission) | ADM-05, ORD-05, ORD-06, API-04 |
| [FR-29](#fr-29) | `P07-015`, `P07-012`, `P06-012`, `P08-015`, `P06-020`, `P07-002`, `P07-010`, `P07-017`, `P09-002`, `P09-007`, `P09-010`, `P10-003`, `P11-009`, `P12-005` | Admin Payments / attempts / reconciliation / COD / linked Refunds | [API §12.1](../API.md#121-payment-surfaces-and-statuses), [API §12.4](../API.md#124-financial-projection-and-correction-contract), [API §12.5](../API.md#125-cod-collection), [API §13.3](../API.md#133-refund-obligation-and-payment-execution) | PAY-05, PAY-09, PAY-10, PAY-11, PAY-12, PAY-13, UI-ADMIN |
| [FR-30](#fr-30) | `P05-008`, `P05-013`, `P09-010` | Admin Coupons / eligibility / redemption history | [API §14.3](../API.md#143-delivery-promotions-content-and-settings), [API §10.3](../API.md#103-coupon-and-review-contracts) | PRM-02, PRM-03, PRM-04, UI-ADMIN |
| [FR-31](#fr-31) | `P09-006`, `P05-009`, `P05-010`, `P05-013`, `P08-016`, `P08-017`, `P09-010` | Admin Reviews / moderation history / public review projection | [API §14.2](../API.md#142-orders-delivery-customers-and-review-moderation-admin), [API §10.3](../API.md#103-coupon-and-review-contracts) | REV-01, UI-ADMIN |
| [FR-32](#fr-32) | `P08-003`, `P08-002`, `P08-004`, `P08-005`, `P08-001`, `P08-014`, `P08-018`, `P09-010` | Admin Returns / eligibility / receipt / inspection / refund handoff | [API §13.1](../API.md#131-customerguest-claims-and-refund-visibility), [API §13.2](../API.md#132-admin-claim-and-return-processing), [API §13.3](../API.md#133-refund-obligation-and-payment-execution) | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, UI-ADMIN |
| [FR-33](#fr-33) | `P08-015`, `P08-005`, `P08-006`, `P08-008`, `P08-010`, `P08-009`, `P08-011`, `P08-018`, `P09-007`, `P09-010`, `P10-004`, `P11-009`, `P12-004`, `P08-007` | Admin Refunds / source balances / payout attempts / audit | [API §13.3](../API.md#133-refund-obligation-and-payment-execution), [API §13.4](../API.md#134-refund-response-and-statuses), [API §13.5](../API.md#135-refund-execution-sequence) | RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, UI-ADMIN |
| [FR-34](#fr-34) | `P09-005`, `P09-008`, `P06-001`, `P01-007`, `P06-017`, `P09-004`, `P09-010`, `P11-006`, `P11-007` | Admin Store Settings / Delivery Settings / public Contact and policies | [API §14.3](../API.md#143-delivery-promotions-content-and-settings), [API §14.4](../API.md#144-dashboard-complaints-and-audit), [API §10.1](../API.md#101-public-catalog-and-discovery) | SET-01, SET-02, SET-03, SET-04, ADM-05, SEC-12, UI-CONTENT |

## Clause verification vectors

### FR-01

**Source:** [PRD — Customer authentication](../PRD.md#fr-01-customer-authentication)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-01-DESC01` | Customers can securely register, log in, and manage their accounts. | `P03-007` | API-01, API-02, SEC-01, SEC-03 |
| `FR-01-REQ01` | Registration using name, email, and password. | `P03-007` | API-01, API-02, SEC-01, SEC-03 |
| `FR-01-REQ02` | Unique email address per account. | `P03-007` | API-01, API-02, SEC-01, SEC-03 |
| `FR-01-REQ03` | Login using email and password. | `P03-007` | API-01, API-02, SEC-01, SEC-03 |
| `FR-01-REQ04` | Secure logout. | `P03-007` | API-01, API-02, SEC-01, SEC-03 |
| `FR-01-REQ05` | Forgot password functionality. | `P03-010` | SEC-01, NTC-02 |
| `FR-01-REQ06` | Password reset through a time-limited, single-use email link. | `P03-010` | SEC-01, NTC-02 |
| `FR-01-REQ07` | Secure password hashing. | `P03-004` | DB-01 |
| `FR-01-REQ08` | Secure session management. | `P03-005` | SEC-03 |
| `FR-01-REQ09` | Session expiration and revocation. | `P03-005` | SEC-03 |
| `FR-01-REQ10` | Rate limiting on authentication endpoints. | `P03-014` | SEC-01, SEC-12 |
| `FR-01-REQ11` | Protection against unauthorized account access. | `P03-013` | SEC-06 |
| `FR-01-BR01` | Public registration creates customer accounts only. | `P03-007` | API-01, API-02, SEC-01, SEC-03 |
| `FR-01-BR02` | Administrator accounts cannot be created through public registration. | `P03-007` | API-01, API-02, SEC-01, SEC-03 |
| `FR-01-BR03` | Password reset invalidates the used reset token. | `P03-010` | SEC-01, NTC-02 |
| `FR-01-BR04` | Suspended accounts cannot access authenticated features. | `P09-003` | ADM-02 |
| `FR-01-BR05` | Sensitive account changes require appropriate authentication. | `P03-013` | SEC-06 |

### FR-02

**Source:** [PRD — Customer profile management](../PRD.md#fr-02-customer-profile-management)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-02-DESC01` | Registered customers can manage personal information and account-related activities. | `P03-008` | ACC-01, ACC-02, ACC-03, ACC-04, ACC-05, SEC-06 |
| `FR-02-REQ01` | View and update name and phone number. | `P03-008` | ACC-01, ACC-02, ACC-03, ACC-04, ACC-05, SEC-06 |
| `FR-02-REQ02` | View and update email through a verification process. | `P03-011` | ACC-02 |
| `FR-02-REQ03` | Change password. | `P03-010` | SEC-01, NTC-02 |
| `FR-02-REQ04` | Add, edit, and delete saved delivery addresses. | `P03-008` | ACC-01, ACC-02, ACC-03, ACC-04, ACC-05, SEC-06 |
| `FR-02-REQ05` | Select a default delivery address. | `P03-008` | ACC-01, ACC-02, ACC-03, ACC-04, ACC-05, SEC-06 |
| `FR-02-REQ06` | View order history. | `P06-014` | ORD-01 |
| `FR-02-REQ07` | View wishlist. | `P05-004` | SHP-02 |
| `FR-02-REQ08` | View submitted reviews. | `P05-012` | UI-SHP |
| `FR-02-REQ09` | View return and refund history. | `P08-012` | RET-01, RFD-03, SEC-06 |
| `FR-02-BR01` | Customers can access only their own account data. | `P03-008` | ACC-01, ACC-02, ACC-03, ACC-04, ACC-05, SEC-06 |
| `FR-02-BR02` | Existing order records retain the delivery information captured at checkout. | `P06-005` | DB-07 |
| `FR-02-BR03` | Account changes must not modify historical order records. | `P06-005` | DB-07 |

### FR-03

**Source:** [PRD — Homepage](../PRD.md#fr-03-homepage)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-03-DESC01` | The homepage introduces the store and highlights available products. | `P04-012` | UI-HOME, UI-CONTENT, CAT-01 |
| `FR-03-REQ01` | Store logo and navigation. | `P02-006` | UI-HOME |
| `FR-03-REQ02` | Product search bar. | `P04-012` | UI-HOME, UI-CONTENT, CAT-01 |
| `FR-03-REQ03` | Promotional banner. | `P04-012` | UI-HOME, UI-CONTENT, CAT-01 |
| `FR-03-REQ04` | Featured products. | `P04-012` | UI-HOME, UI-CONTENT, CAT-01 |
| `FR-03-REQ05` | New arrivals. | `P04-012` | UI-HOME, UI-CONTENT, CAT-01 |
| `FR-03-REQ06` | Discounted products. | `P04-012` | UI-HOME, UI-CONTENT, CAT-01 |
| `FR-03-REQ07` | Product categories. | `P04-012` | UI-HOME, UI-CONTENT, CAT-01 |
| `FR-03-REQ08` | Cart and wishlist indicators. | `P02-006` | UI-HOME |
| `FR-03-REQ09` | Account navigation. | `P02-006` | UI-HOME |
| `FR-03-REQ10` | Contact information and a customer complaint channel. | `P09-008` | UI-CONTENT |
| `FR-03-REQ11` | Footer with policy links. | `P09-008` | UI-CONTENT |

### FR-04

**Source:** [PRD — Product catalog](../PRD.md#fr-04-product-catalog)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-04-DESC01` | Customers can browse and discover products. | `P04-009` | CAT-01, CAT-03, UI-CAT |
| `FR-04-REQ01` | Responsive product grid. | `P04-013` | UI-CAT |
| `FR-04-REQ02` | Category and subcategory browsing. | `P04-009` | CAT-01, CAT-03, UI-CAT |
| `FR-04-REQ03` | Search by product name and relevant keywords. | `P04-009` | CAT-01, CAT-03, UI-CAT |
| `FR-04-REQ04` | Price range filtering. | `P04-009` | CAT-01, CAT-03, UI-CAT |
| `FR-04-REQ05` | Availability filtering. | `P04-009` | CAT-01, CAT-03, UI-CAT |
| `FR-04-REQ06` | Sorting by newest, price ascending, and price descending. | `P04-009` | CAT-01, CAT-03, UI-CAT |
| `FR-04-REQ07` | Product images, prices, and ratings. | `P04-009` | CAT-01, CAT-03, UI-CAT |
| `FR-04-REQ08` | Pagination. | `P04-009` | CAT-01, CAT-03, UI-CAT |
| `FR-04-REQ09` | Clear empty-result messages. | `P04-013` | UI-CAT |
| `FR-04-REQ10` | Search and filter reset options. | `P04-013` | UI-CAT |
| `FR-04-REQ11` | Product-specific URLs using unique slugs. | `P04-002` | CAT-01, CAT-03, UI-CAT |
| `FR-04-BR01` | Inactive products are excluded from public listings. | `P04-009` | CAT-01, CAT-03, UI-CAT |
| `FR-04-BR02` | Out-of-stock products may remain visible but cannot be purchased. | `P04-009` | CAT-01, CAT-03, UI-CAT |
| `FR-04-BR03` | Search results must respect product visibility and availability rules. | `P04-009` | CAT-01, CAT-03, UI-CAT |

### FR-05

**Source:** [PRD — Product details](../PRD.md#fr-05-product-details)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-05-DESC01` | Customers can view detailed product information before purchasing. | `P04-010` | CAT-01, CAT-02, UI-CAT |
| `FR-05-REQ01` | Product name. | `P04-010` | CAT-01, CAT-02, UI-CAT |
| `FR-05-REQ02` | Product description. | `P04-010` | CAT-01, CAT-02, UI-CAT |
| `FR-05-REQ03` | Multiple images. | `P04-010` | CAT-01, CAT-02, UI-CAT |
| `FR-05-REQ04` | Regular price. | `P04-010` | CAT-01, CAT-02, UI-CAT |
| `FR-05-REQ05` | Sale price, when applicable. | `P04-010` | CAT-01, CAT-02, UI-CAT |
| `FR-05-REQ06` | Category and subcategory. | `P04-010` | CAT-01, CAT-02, UI-CAT |
| `FR-05-REQ07` | Product variants. | `P04-010` | CAT-01, CAT-02, UI-CAT |
| `FR-05-REQ08` | Stock availability. | `P04-010` | CAT-01, CAT-02, UI-CAT |
| `FR-05-REQ09` | Quantity selector. | `P04-014` | CAT-02 |
| `FR-05-REQ10` | Add to Cart. | `P05-001` | SHP-01 |
| `FR-05-REQ11` | Add to Wishlist. | `P05-004` | SHP-02 |
| `FR-05-REQ12` | Average rating. | `P05-010` | REV-01 |
| `FR-05-REQ13` | Review count. | `P04-010` | CAT-01, CAT-02, UI-CAT |
| `FR-05-REQ14` | Customer reviews. | `P05-010` | REV-01 |
| `FR-05-REQ15` | Return eligibility information. | `P04-014` | CAT-02 |
| `FR-05-REQ16` | Related products. | `P04-010` | CAT-01, CAT-02, UI-CAT |
| `FR-05-BR01` | Customers must select required variants before adding products to the cart. | `P05-001` | SHP-01 |
| `FR-05-BR02` | Quantity cannot exceed available stock. | `P04-014` | CAT-02 |
| `FR-05-BR03` | Product prices and stock availability must be validated again at checkout. | `P06-004` | CHK-03 |

### FR-06

**Source:** [PRD — Product variants](../PRD.md#fr-06-product-variants)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-06-DESC01` | Products may contain purchasable variations such as size, color, or weight. | `P04-002` | CAT-02, DB-02, INV-01 |
| `FR-06-REQ01` | Support configurable variant attributes. | `P04-002` | CAT-02, DB-02, INV-01 |
| `FR-06-REQ02` | Assign a unique SKU to each purchasable variant. | `P04-002` | CAT-02, DB-02, INV-01 |
| `FR-06-REQ03` | Maintain variant-specific stock. | `P04-006` | INV-01 |
| `FR-06-REQ04` | Support variant-specific prices when necessary. | `P04-002` | CAT-02, DB-02, INV-01 |
| `FR-06-REQ05` | Display available variant combinations. | `P04-014` | CAT-02 |
| `FR-06-REQ06` | Disable unavailable combinations. | `P04-014` | CAT-02 |
| `FR-06-REQ07` | Preserve selected variants in cart and order records. | `P06-005` | DB-07 |
| `FR-06-BR01` | Duplicate SKU values are not allowed. | `P04-002` | CAT-02, DB-02, INV-01 |
| `FR-06-BR02` | Variant stock is managed independently. | `P04-006` | INV-01 |
| `FR-06-BR03` | Deactivated variants cannot be newly purchased. | `P04-005` | CAT-02 |
| `FR-06-BR04` | Existing orders retain their original variant information. | `P06-005` | DB-07 |

### FR-07

**Source:** [PRD — Shopping cart](../PRD.md#fr-07-shopping-cart)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-07-DESC01` | Customers can manage products before checkout. | `P05-002` | SHP-01, UI-SHP |
| `FR-07-REQ01` | Add products to cart. | `P05-002` | SHP-01, UI-SHP |
| `FR-07-REQ02` | Remove products. | `P05-002` | SHP-01, UI-SHP |
| `FR-07-REQ03` | Update quantities. | `P05-002` | SHP-01, UI-SHP |
| `FR-07-REQ04` | Display selected variants. | `P05-011` | UI-SHP |
| `FR-07-REQ05` | Calculate item totals and subtotal. | `P05-011` | UI-SHP |
| `FR-07-REQ06` | Display cart item count. | `P05-011` | UI-SHP |
| `FR-07-REQ07` | Preserve guest carts locally. | `P05-001` | SHP-01 |
| `FR-07-REQ08` | Preserve registered customer carts across sessions. | `P05-002` | SHP-01, UI-SHP |
| `FR-07-REQ09` | Merge eligible guest cart items after login. | `P05-003` | SHP-01 |
| `FR-07-REQ10` | Revalidate prices and stock before checkout. | `P06-004` | CHK-03 |
| `FR-07-BR01` | Adding a product to the cart does not reserve stock. | `P05-001` | SHP-01 |
| `FR-07-BR02` | Unavailable items must be identified before checkout. | `P05-002` | SHP-01, UI-SHP |
| `FR-07-BR03` | Cart totals are estimates until server-side checkout validation. | `P06-004` | CHK-03 |
| `FR-07-BR04` | Cart merging must not create duplicate variant entries. | `P05-003` | SHP-01 |

### FR-08

**Source:** [PRD — Wishlist](../PRD.md#fr-08-wishlist)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-08-DESC01` | Registered customers can save products for later purchases. | `P05-004` | SHP-02, SEC-06, UI-SHP |
| `FR-08-REQ01` | Add products to wishlist. | `P05-004` | SHP-02, SEC-06, UI-SHP |
| `FR-08-REQ02` | Remove products from wishlist. | `P05-004` | SHP-02, SEC-06, UI-SHP |
| `FR-08-REQ03` | View saved products. | `P05-004` | SHP-02, SEC-06, UI-SHP |
| `FR-08-REQ04` | Add wishlist products to cart. | `P05-004` | SHP-02, SEC-06, UI-SHP |
| `FR-08-REQ05` | Prevent duplicate wishlist entries. | `P05-004` | SHP-02, SEC-06, UI-SHP |
| `FR-08-REQ06` | Persist wishlist across sessions. | `P05-004` | SHP-02, SEC-06, UI-SHP |
| `FR-08-BR01` | Authentication is required. | `P05-004` | SHP-02, SEC-06, UI-SHP |
| `FR-08-BR02` | Adding a product to the wishlist does not reserve stock. | `P05-004` | SHP-02, SEC-06, UI-SHP |
| `FR-08-BR03` | Inactive or unavailable products must be clearly identified. | `P05-004` | SHP-02, SEC-06, UI-SHP |

### FR-09

**Source:** [PRD — Discounts and coupons](../PRD.md#fr-09-discounts-and-coupons)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-09-DESC01` | Customers can receive product discounts and promotional coupon discounts. | `P05-006` | PRM-01, PRM-02, PRM-03, PRM-04, DB-05 |
| `FR-09-REQ01` | Product-specific sale prices. | `P05-005` | PRM-01 |
| `FR-09-REQ02` | Percentage-based coupons. | `P05-006` | PRM-01, PRM-02, PRM-03, PRM-04, DB-05 |
| `FR-09-REQ03` | Fixed-amount coupons. | `P05-006` | PRM-01, PRM-02, PRM-03, PRM-04, DB-05 |
| `FR-09-REQ04` | Coupon code validation. | `P05-006` | PRM-01, PRM-02, PRM-03, PRM-04, DB-05 |
| `FR-09-REQ05` | Start and expiration dates. | `P05-006` | PRM-01, PRM-02, PRM-03, PRM-04, DB-05 |
| `FR-09-REQ06` | Minimum eligible purchase amount. | `P05-006` | PRM-01, PRM-02, PRM-03, PRM-04, DB-05 |
| `FR-09-REQ07` | Overall usage limits. | `P05-006` | PRM-01, PRM-02, PRM-03, PRM-04, DB-05 |
| `FR-09-REQ08` | Per-customer usage limits. | `P05-006` | PRM-01, PRM-02, PRM-03, PRM-04, DB-05 |
| `FR-09-REQ09` | Coupon activation and deactivation. | `P05-008` | PRM-02 |
| `FR-09-REQ10` | Discount calculation during checkout. | `P05-006` | PRM-01, PRM-02, PRM-03, PRM-04, DB-05 |
| `FR-09-REQ11` | Clear invalid coupon messages. | `P05-006` | PRM-01, PRM-02, PRM-03, PRM-04, DB-05 |
| `FR-09-BR01` | Product sale prices are applied before coupon discounts. | `P05-005` | PRM-01 |
| `FR-09-BR02` | Only one coupon may be used per order. | `P05-006` | PRM-01, PRM-02, PRM-03, PRM-04, DB-05 |
| `FR-09-BR03` | Coupon eligibility is calculated using the discounted product subtotal. | `P05-005` | PRM-01 |
| `FR-09-BR04` | Delivery charges are excluded from coupon calculations. | `P05-005` | PRM-01 |
| `FR-09-BR05` | Percentage coupons apply to eligible product amounts only. | `P05-005` | PRM-01 |
| `FR-09-BR06` | Discounts cannot reduce the eligible product subtotal below zero. | `P05-005` | PRM-01 |
| `FR-09-BR07` | Currency calculations must use consistent decimal rounding. | `P05-005` | PRM-01 |
| `FR-09-BR08` | Online coupon usage is held during payment and confirmed after verified payment. | `P05-007` | PRM-03 |
| `FR-09-BR09` | Failed, cancelled, or expired unpaid attempts release only eligible held coupon usage, once; never release capacity still required by another active attempt or an already-paid order. | `P06-010` | INV-02 |
| `FR-09-BR10` | Accepted COD orders confirm coupon usage; eligible cancellations release it once. | `P06-008` | CHK-02 |
| `FR-09-BR11` | Completed orders that are later refunded, and orders closed for non-delivery after dispatch, do not automatically restore coupon usage. | `P07-013` | CHK-05, PAY-04, INV-02 |
| `FR-09-BR12` | Concurrent redemption attempts must respect configured usage limits. | `P05-007` | PRM-03 |
| `FR-09-BR13` | Coupons with per-customer limits require a registered customer account. Guests may use coupons without per-customer limits, subject to global limits and all other eligibility rules. Checkout email alone is not a verified customer identity. | `P05-006` | PRM-01, PRM-02, PRM-03, PRM-04, DB-05 |
| `FR-09-BR14` | Editing or deactivating a coupon does not rewrite an accepted order. Existing live holds retain their quoted terms until expiry; expired holds require current eligibility and capacity checks before payment retry. | `P05-008` | PRM-02 |

### FR-10

**Source:** [PRD — Reviews and ratings](../PRD.md#fr-10-reviews-and-ratings)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-10-DESC01` | Eligible customers can submit feedback on purchased products. | `P05-009` | REV-01, SEC-06, UI-CAT, UI-ADMIN |
| `FR-10-REQ01` | Ratings from 1 to 5 stars. | `P05-009` | REV-01, SEC-06, UI-CAT, UI-ADMIN |
| `FR-10-REQ02` | Written reviews. | `P05-009` | REV-01, SEC-06, UI-CAT, UI-ADMIN |
| `FR-10-REQ03` | Verified purchase identification. | `P05-009` | REV-01, SEC-06, UI-CAT, UI-ADMIN |
| `FR-10-REQ04` | Average rating calculation. | `P05-010` | REV-01 |
| `FR-10-REQ05` | Total review count. | `P05-010` | REV-01 |
| `FR-10-REQ06` | Review editing. | `P05-009` | REV-01, SEC-06, UI-CAT, UI-ADMIN |
| `FR-10-REQ07` | Admin moderation. | `P09-006` | REV-01 |
| `FR-10-REQ08` | Review approval and rejection. | `P09-006` | REV-01 |
| `FR-10-REQ09` | Display approved reviews only. | `P05-010` | REV-01 |
| `FR-10-BR01` | Reviews require an authenticated customer account. | `P05-010` | REV-01 |
| `FR-10-BR02` | A qualifying delivered purchase is required to submit a verified review. | `P08-016` | REV-01 |
| `FR-10-BR03` | Each customer may maintain one active review per product. | `P05-009` | REV-01, SEC-06, UI-CAT, UI-ADMIN |
| `FR-10-BR04` | Customers can edit their own reviews. | `P05-009` | REV-01, SEC-06, UI-CAT, UI-ADMIN |
| `FR-10-BR05` | Edited reviews return to moderation when necessary. | `P09-006` | REV-01 |
| `FR-10-BR06` | Cancelled purchases do not qualify. | `P08-016` | REV-01 |
| `FR-10-BR07` | A fully returned and refunded purchase does not qualify for a new verified review unless another eligible purchase exists. | `P08-016` | REV-01 |
| `FR-10-BR08` | Refunds do not automatically remove legitimate reviews. Apply the review moderation policy. | `P09-006` | REV-01 |
| `FR-10-BR09` | Administrators cannot alter customer rating values while presenting them as customer-submitted reviews. | `P09-006` | REV-01 |
| `FR-10-BR10` | Legitimate negative feedback must not be rejected solely because it is negative. | `P09-006` | REV-01 |

### FR-11

**Source:** [PRD — Checkout](../PRD.md#fr-11-checkout)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-11-DESC01` | Customers can place orders using guest or registered checkout. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-INFO01` | Full name. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-INFO02` | Phone number. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-INFO03` | Email address. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-INFO04` | Delivery address. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-INFO05` | District. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-INFO06` | City/Area. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-INFO07` | Optional order notes. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-REQ01` | Guest checkout. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-REQ02` | Registered customer checkout. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-REQ03` | Saved address selection. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-REQ04` | Delivery area selection. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-REQ05` | Delivery charge calculation. | `P06-001` | ADM-05 |
| `FR-11-REQ06` | Coupon application. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-REQ07` | Order summary. | `P06-018` | UI-CHECKOUT |
| `FR-11-REQ08` | Payment method selection. | `P06-018` | UI-CHECKOUT |
| `FR-11-REQ09` | Final amount and applicable delivery deadline confirmation. | `P06-018` | UI-CHECKOUT |
| `FR-11-REQ10` | Server-side validation. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-REQ11` | Unique order number generation. | `P06-005` | DB-07 |
| `FR-11-REQ12` | Duplicate submission prevention. | `P06-006` | CHK-04 |
| `FR-11-REQ13` | Order confirmation. | `P06-018` | UI-CHECKOUT |
| `FR-11-BR01` | Bangladesh phone numbers must be validated. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-BR02` | Email is required for guest order verification and transactional notifications. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-BR03` | Delivery charges are calculated from current administrative settings. | `P06-001` | ADM-05 |
| `FR-11-BR04` | Product prices, stock, discounts, and delivery charges are validated on the server. | `P06-001` | ADM-05 |
| `FR-11-BR05` | Checkout must reject unavailable delivery areas. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-BR06` | Customers must accept the applicable store terms before submitting an order. | `P06-004` | CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, API-06, UI-CHECKOUT |
| `FR-11-BR07` | An order stores the final pricing and delivery charge snapshot. | `P06-005` | DB-07 |

### FR-12

**Source:** [PRD — Payment system](../PRD.md#fr-12-payment-system)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-12-DESC01` | Customers can pay using supported Bangladesh payment methods. | `P07-006` | PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07, PAY-08, PAY-09, PAY-10, PAY-11, PAY-12, PAY-13, PAY-14 |
| `FR-12-METHOD01` | bKash. | `P07-003` | PAY-01 |
| `FR-12-METHOD02` | Nagad. | `P07-003` | PAY-01 |
| `FR-12-METHOD03` | Rocket. | `P07-003` | PAY-01 |
| `FR-12-METHOD04` | Cash on Delivery. | `P06-008` | CHK-02 |
| `FR-12-REQ01` | Display available payment methods. | `P07-003` | PAY-01 |
| `FR-12-REQ02` | Create payment sessions on the server. | `P07-004` | PAY-01 |
| `FR-12-REQ03` | Use SSLCOMMERZ hosted checkout for online payments. | `P07-004` | PAY-01 |
| `FR-12-REQ04` | Redirect to the provider's payment interface when required. | `P07-004` | PAY-01 |
| `FR-12-REQ05` | Handle payment success, failure, cancellation, and pending states. | `P07-006` | PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07, PAY-08, PAY-09, PAY-10, PAY-11, PAY-12, PAY-13, PAY-14 |
| `FR-12-REQ06` | Verify payments through SSLCOMMERZ validation or status APIs. | `P07-006` | PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07, PAY-08, PAY-09, PAY-10, PAY-11, PAY-12, PAY-13, PAY-14 |
| `FR-12-REQ07` | Match order ID, unique transaction ID, amount, BDT currency, and payment status. | `P07-006` | PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07, PAY-08, PAY-09, PAY-10, PAY-11, PAY-12, PAY-13, PAY-14 |
| `FR-12-REQ08` | Store provider transaction references. | `P07-002` | DB-02, PAY-09 |
| `FR-12-REQ09` | Support safe payment retries. | `P07-013` | CHK-05, PAY-04, INV-02 |
| `FR-12-REQ10` | Prevent duplicate payment initiation and repeated application of the same verified collection. Independently paid attempts remain recorded and resolved under the payment-correction rules. | `P07-007` | PAY-04 |
| `FR-12-REQ11` | Process IPN independently of browser redirects. | `P07-005` | PAY-02 |
| `FR-12-REQ12` | Verify IPN transactions on the server. | `P07-006` | PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07, PAY-08, PAY-09, PAY-10, PAY-11, PAY-12, PAY-13, PAY-14 |
| `FR-12-REQ13` | Handle duplicate and out-of-order callbacks safely. | `P07-007` | PAY-04 |
| `FR-12-REQ14` | Maintain payment attempt history. | `P07-002` | DB-02, PAY-09 |
| `FR-12-REQ15` | Check uncertain payments using SSLCOMMERZ status APIs. | `P07-012` | PAY-05 |
| `FR-12-REQ16` | Flag unresolved payments for administrator review. | `P07-012` | PAY-05 |
| `FR-12-REQ17` | Display payment status to customers and administrators. | `P07-014` | UI-CHECKOUT |
| `FR-12-PSTATUS01` | Pending. | `P07-002` | DB-02, PAY-09 |
| `FR-12-PSTATUS02` | Paid. | `P07-002` | DB-02, PAY-09 |
| `FR-12-PSTATUS03` | Failed. | `P07-002` | DB-02, PAY-09 |
| `FR-12-PSTATUS04` | Cancelled. | `P07-002` | DB-02, PAY-09 |
| `FR-12-PSTATUS05` | Partially Refunded. | `P07-002` | DB-02, PAY-09 |
| `FR-12-PSTATUS06` | Refunded. | `P07-002` | DB-02, PAY-09 |
| `FR-12-BR01` | Cash on Delivery orders are not marked Paid until payment collection is confirmed. | `P06-012` | PAY-12 |
| `FR-12-BR02` | Online orders are not marked Paid solely because a browser returns to a success page. | `P07-005` | PAY-02 |
| `FR-12-BR03` | Require verified SSLCOMMERZ confirmation before marking an online payment Paid. | `P07-006` | PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07, PAY-08, PAY-09, PAY-10, PAY-11, PAY-12, PAY-13, PAY-14 |
| `FR-12-BR04` | Hold risky payments (including risk_level=1) for review before fulfillment. | `P07-010` | PAY-08 |
| `FR-12-BR05` | Give each payment retry a unique transaction reference. | `P07-013` | CHK-05, PAY-04, INV-02 |
| `FR-12-BR06` | Never create duplicate paid orders or reuse provider transaction IDs. | `P07-002` | DB-02, PAY-09 |
| `FR-12-BR07` | Expired payment attempts must release eligible stock reservations. | `P06-010` | INV-02 |
| `FR-12-BR08` | Payment records must preserve their original transaction history. | `P07-002` | DB-02, PAY-09 |
| `FR-12-BR09` | Show bKash, Nagad, and Rocket only when enabled in the merchant account. | `P07-003` | PAY-01 |
| `FR-12-BR10` | Hide inactive payment channels. | `P07-003` | PAY-01 |
| `FR-12-BR11` | Verify live activation and channel limits before launch. | `P11-005` | GATE-BKASH, GATE-NAGAD, GATE-ROCKET |

### FR-13

**Source:** [PRD — Inventory reservation and stock management](../PRD.md#fr-13-inventory-reservation-and-stock-management)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-13-DESC01` | The platform must prevent overselling and maintain accurate stock records. | `P04-008` | INV-01, INV-02, INV-03, DB-05, DB-09 |
| `FR-13-REQ01` | Track stock by product variant. | `P04-006` | INV-01 |
| `FR-13-REQ02` | Validate available stock during checkout. | `P04-008` | INV-01, INV-02, INV-03, DB-05, DB-09 |
| `FR-13-REQ03` | Reserve stock for online payment attempts. | `P06-009` | INV-02 |
| `FR-13-REQ04` | Release expired or failed reservations. | `P06-010` | INV-02 |
| `FR-13-REQ05` | Commit stock allocation for accepted orders. | `P04-008` | INV-01, INV-02, INV-03, DB-05, DB-09 |
| `FR-13-REQ06` | Restore stock after eligible cancellations. | `P06-013` | ORD-02, ORD-03 |
| `FR-13-REQ07` | Maintain inventory movement history. | `P04-008` | INV-01, INV-02, INV-03, DB-05, DB-09 |
| `FR-13-REQ08` | Prevent concurrent purchases from overselling available stock. | `P06-007` | INV-01, PRM-03 |
| `FR-13-BR01` | Adding products to the cart does not reserve stock. | `P04-008` | INV-01, INV-02, INV-03, DB-05, DB-09 |
| `FR-13-BR02` | Online checkout creates a temporary stock reservation for 15 minutes. | `P06-009` | INV-02 |
| `FR-13-BR03` | A verified payment converts eligible reservations into committed allocation once; confirmation additionally requires a non-cancelled order, valid inventory/coupon allocation, and cleared risk review. | `P07-011` | PAY-09 |
| `FR-13-BR04` | Failed, cancelled, or expired unpaid attempts release only eligible reservations, once; preserve allocation still required by another active attempt or an already-paid order. | `P06-010` | INV-02 |
| `FR-13-BR05` | Recheck stock when payment arrives after reservation expiry. | `P07-009` | PAY-06 |
| `FR-13-BR06` | On late verified payment, record collection first. For an eligible non-cancelled order, atomically recheck inventory and coupon capacity; confirm only after allocation succeeds and risk review is cleared. If capacity is unavailable or risk review is pending, preserve Paid and hold fulfillment for authorized resolution/refund. | `P07-011` | PAY-09 |
| `FR-13-BR07` | A Cancelled order never reacquires allocation or reopens after late collection; record a payment-correction/refund obligation instead. | `P07-011` | PAY-09 |
| `FR-13-BR08` | Accepted COD orders commit stock allocation at order placement and remain Pending until administrator confirmation. Acceptance means the backend accepted the checkout; it does not mean fulfillment is Confirmed. | `P06-008` | CHK-02 |
| `FR-13-BR09` | Available stock = physical stock − reserved stock − committed stock. | `P04-006` | INV-01 |
| `FR-13-BR10` | Cancellation releases committed stock only once. | `P06-013` | ORD-02, ORD-03 |
| `FR-13-BR11` | Shipment reduces physical and committed stock by the shipped quantity. | `P06-011` | ORD-01 |
| `FR-13-BR12` | Returned products are restocked only after inspection confirms they are resellable. | `P08-004` | RET-02, RET-06 |
| `FR-13-BR13` | Stock reservations, allocations, and adjustments must be atomic and idempotent. | `P06-007` | INV-01, PRM-03 |

### FR-14

**Source:** [PRD — Customer order management](../PRD.md#fr-14-customer-order-management)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-14-DESC01` | Customers can view and track their orders. | `P06-014` | ORD-01, ORD-02, ORD-03, ORD-04, UI-ORD |
| `FR-14-REQ01` | View order history. | `P06-014` | ORD-01, ORD-02, ORD-03, ORD-04, UI-ORD |
| `FR-14-REQ02` | View order details. | `P06-014` | ORD-01, ORD-02, ORD-03, ORD-04, UI-ORD |
| `FR-14-REQ03` | Track order status. | `P06-014` | ORD-01, ORD-02, ORD-03, ORD-04, UI-ORD |
| `FR-14-REQ04` | View payment status. | `P06-014` | ORD-01, ORD-02, ORD-03, ORD-04, UI-ORD |
| `FR-14-REQ05` | View ordered products and quantities. | `P06-014` | ORD-01, ORD-02, ORD-03, ORD-04, UI-ORD |
| `FR-14-REQ06` | View final order totals. | `P06-014` | ORD-01, ORD-02, ORD-03, ORD-04, UI-ORD |
| `FR-14-REQ07` | Request eligible cancellation. | `P06-013` | ORD-02, ORD-03 |
| `FR-14-REQ08` | Request eligible returns. | `P08-012` | RET-01, SEC-08 |
| `FR-14-REQ09` | View refund information. | `P08-013` | RFD-03 |
| `FR-14-REQ10` | Display estimated delivery date and applicable deadline. | `P06-003` | ORD-06 |
| `FR-14-OSTATUS01` | Pending. | `P06-005` | DB-07 |
| `FR-14-OSTATUS02` | Confirmed. | `P06-005` | DB-07 |
| `FR-14-OSTATUS03` | Processing. | `P06-005` | DB-07 |
| `FR-14-OSTATUS04` | Shipped. | `P06-005` | DB-07 |
| `FR-14-OSTATUS05` | Delivered. | `P06-005` | DB-07 |
| `FR-14-OSTATUS06` | Cancelled. | `P06-005` | DB-07 |
| `FR-14-BR01` | Pending orders may transition to Confirmed or Cancelled. | `P06-011` | ORD-01 |
| `FR-14-BR02` | Confirmed orders may transition to Processing or Cancelled. | `P06-011` | ORD-01 |
| `FR-14-BR03` | Processing orders may transition to Shipped or Cancelled through an authorized process. | `P06-011` | ORD-01 |
| `FR-14-BR04` | Shipped orders may transition to Delivered; failed deliveries require an administrative exception workflow. | `P06-017` | ORD-04 |
| `FR-14-BR05` | Delivered and Cancelled are terminal fulfillment states. | `P06-011` | ORD-01 |
| `FR-14-BR06` | Returns and refunds have separate statuses and do not overwrite the original fulfillment history. | `P08-013` | RFD-03 |
| `FR-14-BR07` | Invalid status transitions must be rejected. | `P06-011` | ORD-01 |
| `FR-14-BR08` | Payment confirmation and order confirmation are separate operations. | `P06-011` | ORD-01 |
| `FR-14-BR09` | Ordinary fulfillment never reopens a Cancelled order. A later verified payment remains recorded as collected and enters payment-correction/refund resolution without allocating stock or confirming the cancelled order. | `P07-011` | PAY-09 |
| `FR-14-BR10` | For a Shipped order that cannot be delivered, keep Shipped while a retry or investigation is active. An administrator may exceptionally close it as Cancelled only after recording final non-delivery and custody/disposition of every shipped quantity. This is a delivery-exception transition, not ordinary customer cancellation. Refund collected funds when eligible; restock only physically recovered, inspected resellable units. | `P06-017` | ORD-04 |

### FR-15

**Source:** [PRD — Order cancellation](../PRD.md#fr-15-order-cancellation)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-15-DESC01` | Customers can request cancellation of eligible orders. | `P06-013` | ORD-02, ORD-03, PAY-07 |
| `FR-15-REQ01` | Display cancellation availability. | `P06-013` | ORD-02, ORD-03, PAY-07 |
| `FR-15-REQ02` | Allow customers to submit cancellation requests. | `P06-013` | ORD-02, ORD-03, PAY-07 |
| `FR-15-REQ03` | Require administrator approval or rejection of every customer cancellation request. | `P06-013` | ORD-02, ORD-03, PAY-07 |
| `FR-15-REQ04` | Record cancellation reasons. | `P06-013` | ORD-02, ORD-03, PAY-07 |
| `FR-15-REQ05` | Update order status. | `P06-013` | ORD-02, ORD-03, PAY-07 |
| `FR-15-REQ06` | Restore eligible inventory. | `P06-013` | ORD-02, ORD-03, PAY-07 |
| `FR-15-REQ07` | Initiate refunds when required. | `P08-005` | RFD-02 |
| `FR-15-REQ08` | Notify customers of the result. | `P06-016` | NTC-03, NTC-04, NTC-05, NTC-06 |
| `FR-15-BR01` | Customers may request cancellation before the order is Shipped. | `P06-013` | ORD-02, ORD-03, PAY-07 |
| `FR-15-BR02` | Pending and Confirmed orders are eligible for administrator-reviewed cancellation; submitting a request does not itself cancel or release allocation. | `P06-013` | ORD-02, ORD-03, PAY-07 |
| `FR-15-BR03` | Processing orders require administrator review and explicit confirmation that dispatch has not occurred. Recheck eligibility atomically when approving so concurrent shipment cannot be cancelled as unshipped. | `P06-013` | ORD-02, ORD-03, PAY-07 |
| `FR-15-BR04` | Shipped orders are handled through return or delivery-exception procedures rather than standard cancellation. | `P06-013` | ORD-02, ORD-03, PAY-07 |
| `FR-15-BR05` | Unpaid COD cancellations do not create monetary refunds. | `P08-005` | RFD-02 |
| `FR-15-BR06` | Paid online cancellations create eligible refund records. | `P08-005` | RFD-02 |
| `FR-15-BR07` | Inventory must not be restored more than once. | `P06-013` | ORD-02, ORD-03, PAY-07 |

### FR-16

**Source:** [PRD — Delivery management](../PRD.md#fr-16-delivery-management)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-16-DESC01` | The store provides delivery throughout supported areas of Bangladesh. | `P06-003` | ORD-04, ORD-05, ORD-06, SUP-04, REL-10 |
| `FR-16-TARGET01` | Target 14 calendar days after confirmation, or sooner when legally required. | `P06-003` | ORD-04, ORD-05, ORD-06, SUP-04, REL-10 |
| `FR-16-REQ01` | Delivery area configuration. | `P06-001` | ADM-05 |
| `FR-16-REQ02` | Admin-controlled delivery charges. | `P06-001` | ADM-05 |
| `FR-16-REQ03` | District/zone-based charge rules. | `P06-001` | ADM-05 |
| `FR-16-REQ04` | Delivery availability validation. | `P06-001` | ADM-05 |
| `FR-16-REQ05` | Estimated delivery date and applicable deadline display. | `P06-003` | ORD-04, ORD-05, ORD-06, SUP-04, REL-10 |
| `FR-16-REQ06` | Delivery address confirmation. | `P06-003` | ORD-04, ORD-05, ORD-06, SUP-04, REL-10 |
| `FR-16-REQ07` | Manual shipment status updates. | `P06-011` | ORD-01 |
| `FR-16-REQ08` | Delivery completion recording. | `P06-011` | ORD-01 |
| `FR-16-REQ09` | Failed delivery handling. | `P06-017` | ORD-04 |
| `FR-16-BR01` | Delivery charges are configurable by administrators. | `P06-001` | ADM-05 |
| `FR-16-BR02` | Administrators can add, edit, activate, or deactivate delivery zones. | `P06-001` | ADM-05 |
| `FR-16-BR03` | Delivery charges may vary by location. | `P06-001` | ADM-05 |
| `FR-16-BR04` | Changes to delivery charges apply to new orders only. | `P06-001` | ADM-05 |
| `FR-16-BR05` | Confirmed orders retain their original delivery charge. | `P06-001` | ADM-05 |
| `FR-16-BR06` | The 14-day target does not override shorter legal deadlines. | `P11-007` | ORD-06, SUP-04 |
| `FR-16-BR07` | Verify current delivery deadlines, their scope, and calculation start events against current authority before launch; historical guideline summaries are not approved runtime policy. | `P11-007` | ORD-06, SUP-04 |
| `FR-16-BR08` | Flag orders at risk of delay. | `P06-017` | ORD-04 |
| `FR-16-BR09` | Contact the customer, record the reason, and provide an appropriate remedy. | `P06-017` | ORD-04 |
| `FR-16-BR10` | Notify customers when delivery estimates change. | `P06-016` | NTC-03, NTC-04, NTC-05, NTC-06 |
| `FR-16-BR11` | Log complaints and respond within the applicable period. | `P09-004` | SUP-02, SUP-04 |
| `FR-16-BR12` | Track complaint status and resolution. | `P09-004` | SUP-02, SUP-04 |
| `FR-16-BR13` | Verify the applicable complaint-response period before launch and record its current authoritative source. | `P11-007` | ORD-06, SUP-04 |
| `FR-16-BR14` | The store must not promise delivery to unsupported locations. | `P06-001` | ADM-05 |
| `FR-16-BR15` | For failed delivery, contact the customer and arrange a retry or suitable resolution. | `P06-017` | ORD-04 |

### FR-17

**Source:** [PRD — Return management](../PRD.md#fr-17-return-management)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-17-DESC01` | Customers can request returns for eligible delivered products. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| `FR-17-REQ01` | Return request submission. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| `FR-17-REQ02` | Selection of eligible order items. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| `FR-17-REQ03` | Selection of return quantities. | `P08-001` | RET-04 |
| `FR-17-REQ04` | Return reason selection. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| `FR-17-REQ05` | Optional supporting image upload. | `P08-012` | RET-01, SEC-08 |
| `FR-17-REQ06` | Return status tracking. | `P08-003` | RET-03, RET-05 |
| `FR-17-REQ07` | Administrator approval or rejection. | `P08-003` | RET-03, RET-05 |
| `FR-17-REQ08` | Product receipt and inspection. | `P08-004` | RET-02, RET-06 |
| `FR-17-REQ09` | Return history. | `P08-012` | RET-01, SEC-08 |
| `FR-17-REASON01` | Damaged product. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| `FR-17-REASON02` | Defective product. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| `FR-17-REASON03` | Incorrect product. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| `FR-17-REASON04` | Missing or incorrect item quantity. | `P08-001` | RET-04 |
| `FR-17-REASON05` | Incorrect size or variant. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| `FR-17-REASON06` | Product not as described. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| `FR-17-REASON07` | Other eligible reasons. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| `FR-17-RSTATUS01` | Requested. | `P08-003` | RET-03, RET-05 |
| `FR-17-RSTATUS02` | Under Review. | `P08-003` | RET-03, RET-05 |
| `FR-17-RSTATUS03` | Approved. | `P08-003` | RET-03, RET-05 |
| `FR-17-RSTATUS04` | Rejected. | `P08-003` | RET-03, RET-05 |
| `FR-17-RSTATUS05` | Awaiting Return. | `P08-003` | RET-03, RET-05 |
| `FR-17-RSTATUS06` | Received. | `P08-003` | RET-03, RET-05 |
| `FR-17-RSTATUS07` | Inspected. | `P08-003` | RET-03, RET-05 |
| `FR-17-RSTATUS08` | Completed. | `P08-003` | RET-03, RET-05 |
| `FR-17-BR01` | Standard return requests must be submitted within 7 calendar days after delivery. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| `FR-17-BR02` | Incorrect, damaged, or defective items may qualify subject to the store policy and applicable consumer rights. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| `FR-17-BR03` | Change-of-mind returns require unused items in original condition, with relevant accessories and packaging. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| `FR-17-BR04` | Hygiene-sensitive or customized products may have restrictions where legally permitted. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| `FR-17-BR05` | Supporting evidence may be requested but must not be used to unreasonably reject valid claims. | `P08-012` | RET-01, SEC-08 |
| `FR-17-BR06` | The store bears reasonable return shipping costs for confirmed wrong, damaged, or defective deliveries. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| `FR-17-BR07` | Customers normally bear return shipping costs for eligible change-of-mind returns. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |
| `FR-17-BR08` | Duplicate active claims for the same order-item quantity are prohibited across both physical returns and shortage claims. Account for already resolved/refunded quantities when deciding remaining merchandise eligibility. | `P08-001` | RET-04 |
| `FR-17-BR09` | Physical returns require receipt and inspection before refund approval. | `P08-004` | RET-02, RET-06 |
| `FR-17-BR10` | Missing items or short-delivered quantities use the same claim/review entry point but do not require returning goods the customer did not receive. Record the approved missing quantity and evidence; an approved shortage claim may create a refund obligation directly. Do not create receipt, inspection, or restock events for missing goods. | `P08-001` | RET-04 |
| `FR-17-BR11` | Cancellations and payment corrections do not require product inspection. | `P08-004` | RET-02, RET-06 |
| `FR-17-BR12` | Statutory customer rights take precedence over restrictive store policy terms. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, DB-11 |

### FR-18

**Source:** [PRD — Refund management](../PRD.md#fr-18-refund-management)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-18-DESC01` | Eligible customers can receive full or partial refunds. | `P08-005` | RFD-01, RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, DB-12 |
| `FR-18-REQ01` | Full refunds. | `P08-005` | RFD-01, RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, DB-12 |
| `FR-18-REQ02` | Partial refunds. | `P08-005` | RFD-01, RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, DB-12 |
| `FR-18-REQ03` | Refund requests. | `P08-005` | RFD-01, RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, DB-12 |
| `FR-18-REQ04` | Refund approval. | `P08-005` | RFD-01, RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, DB-12 |
| `FR-18-REQ05` | Refund amount calculation. | `P08-006` | RFD-01 |
| `FR-18-REQ06` | Initiate and track SSLCOMMERZ refunds where supported. | `P08-008` | RFD-08 |
| `FR-18-REQ07` | Manual refund processing. | `P08-010` | RFD-07 |
| `FR-18-REQ08` | Refund transaction history. | `P08-013` | RFD-03 |
| `FR-18-REQ09` | Refund status tracking. | `P08-013` | RFD-03 |
| `FR-18-REQ10` | Failed refund handling. | `P08-009` | RFD-03, RFD-08 |
| `FR-18-REQ11` | Duplicate refund prevention. | `P08-005` | RFD-01, RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, DB-12 |
| `FR-18-REQ12` | Customer notifications. | `P08-011` | NTC-09, NTC-10, NTC-11, NTC-12 |
| `FR-18-FSTATUS01` | Requested. | `P08-005` | RFD-01, RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, DB-12 |
| `FR-18-FSTATUS02` | Under Review. | `P08-005` | RFD-01, RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, DB-12 |
| `FR-18-FSTATUS03` | Approved. | `P08-005` | RFD-01, RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, DB-12 |
| `FR-18-FSTATUS04` | Rejected. | `P08-005` | RFD-01, RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, DB-12 |
| `FR-18-FSTATUS05` | Processing. | `P08-005` | RFD-01, RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, DB-12 |
| `FR-18-FSTATUS06` | Completed. | `P08-005` | RFD-01, RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, DB-12 |
| `FR-18-FSTATUS07` | Failed. | `P08-005` | RFD-01, RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, DB-12 |
| `FR-18-BR01` | Refunds require a qualifying cancellation, inspected physical return, approved missing-item/shortage claim, or documented payment correction. | `P08-005` | RFD-01, RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, DB-12 |
| `FR-18-BR02` | Refunds use original paid prices, allocated discounts, and eligible item quantities. | `P08-006` | RFD-01 |
| `FR-18-BR03` | Partial merchandise refunds apply only to eligible items and quantities. Payment corrections, including duplicate collections, may refund excess collected money without consuming merchandise-return quantities. | `P08-006` | RFD-01 |
| `FR-18-BR04` | Record every independently verified collection, including multiple paid attempts on one order. Fulfill and allocate once. Refunds must identify their source collection; remaining capacity is enforced both per collection and for the order. Refunding an excess collection does not by itself mean the purchased merchandise was refunded. | `P08-007` | RFD-02 |
| `FR-18-BR05` | Delivery charges are refundable when required by the approved policy or applicable law. | `P08-006` | RFD-01 |
| `FR-18-BR06` | Remaining refundable balance accounts for pending and completed refunds. | `P08-007` | RFD-02 |
| `FR-18-BR07` | Total completed and pending refund commitments must not exceed the refundable payment balance. | `P08-007` | RFD-02 |
| `FR-18-BR08` | Refund to the original channel when supported. | `P08-008` | RFD-08 |
| `FR-18-BR09` | Otherwise, obtain customer consent and verify the manual transfer. | `P08-010` | RFD-07 |
| `FR-18-BR10` | Manual refunds require verified transfer details and administrator confirmation. | `P08-010` | RFD-07 |
| `FR-18-BR11` | COD refunds are processed through an agreed verified method, such as bKash, Nagad, Rocket, or bank transfer. | `P08-010` | RFD-07 |
| `FR-18-BR12` | A COD refund cannot be completed unless the original payment was collected. | `P08-010` | RFD-07 |
| `FR-18-BR13` | Target refunds within 7 business days of approval, unless law requires sooner. | `P08-005` | RFD-01, RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, DB-12 |
| `FR-18-BR14` | Track provider delays and inform customers. | `P08-009` | RFD-03, RFD-08 |
| `FR-18-BR15` | Mark refunds Completed only after confirmed payout. | `P08-009` | RFD-03, RFD-08 |
| `FR-18-BR16` | Gateway acceptance of a refund request is not proof of payment. | `P08-009` | RFD-03, RFD-08 |
| `FR-18-BR17` | Failed refunds remain visible for authorized retry or investigation. | `P08-009` | RFD-03, RFD-08 |
| `FR-18-BR18` | All refund actions must be auditable. | `P08-011` | NTC-09, NTC-10, NTC-11, NTC-12 |
| `FR-18-BR19` | Customers must be informed of approval, rejection, and completion. | `P08-011` | NTC-09, NTC-10, NTC-11, NTC-12 |

### FR-19

**Source:** [PRD — Guest order access](../PRD.md#fr-19-guest-order-access)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-19-DESC01` | Guest customers can securely access order information without creating accounts. | `P06-015` | ORD-07, API-09, SEC-05 |
| `FR-19-REQ01` | Order lookup using order number and registered email. | `P06-015` | ORD-07, API-09, SEC-05 |
| `FR-19-REQ02` | Email-based one-time verification code or secure access link. | `P06-015` | ORD-07, API-09, SEC-05 |
| `FR-19-REQ03` | View order status. | `P06-015` | ORD-07, API-09, SEC-05 |
| `FR-19-REQ04` | View payment status. | `P06-015` | ORD-07, API-09, SEC-05 |
| `FR-19-REQ05` | Request eligible cancellation. | `P06-013` | ORD-02, ORD-03, SEC-05 |
| `FR-19-REQ06` | Submit eligible return requests. | `P08-012` | RET-01, SEC-08, SEC-05 |
| `FR-19-REQ07` | Track refunds. | `P08-013` | RFD-03, SEC-05 |
| `FR-19-REQ08` | Expiration and rate limiting for verification attempts. | `P06-015` | ORD-07, API-09, SEC-05 |
| `FR-19-BR01` | Order number alone is insufficient to access customer information. | `P06-015` | ORD-07, API-09, SEC-05 |
| `FR-19-BR02` | Guest access must verify control of the checkout email. | `P06-015` | ORD-07, API-09, SEC-05 |
| `FR-19-BR03` | Verification links and codes must expire. | `P06-015` | ORD-07, API-09, SEC-05 |
| `FR-19-BR04` | Guest customers may access only their own verified orders. | `P06-015` | ORD-07, API-09, SEC-05 |

### FR-20

**Source:** [PRD — Notifications](../PRD.md#fr-20-notifications)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-20-DESC01` | Customers receive important account and order updates. | `P03-009` | NTC-01, NTC-02, NTC-03, NTC-04, NTC-05, NTC-06, NTC-07, NTC-08, NTC-09, NTC-10, NTC-11, NTC-12, REL-05 |
| `FR-20-EVENT01` | Account registration. | `P03-009` | NTC-01 |
| `FR-20-EVENT02` | Password reset. | `P03-010` | NTC-02 |
| `FR-20-EVENT03` | Order confirmation. | `P06-016` | NTC-03 |
| `FR-20-EVENT04` | Payment success or failure. | `P07-016` | NTC-07, NTC-08 |
| `FR-20-EVENT05` | Order cancellation. | `P06-016` | NTC-04 |
| `FR-20-EVENT06` | Shipment update. | `P06-016` | NTC-05 |
| `FR-20-EVENT07` | Delivery completion. | `P06-016` | NTC-06 |
| `FR-20-EVENT08` | Return request update. | `P08-011` | NTC-09 |
| `FR-20-EVENT09` | Refund approval or rejection. | `P08-011` | NTC-10, NTC-11 |
| `FR-20-EVENT10` | Refund completion. | `P08-011` | NTC-12 |
| `FR-20-REQ01` | Transactional email notifications. | `P03-009` | NTC-01, NTC-02, NTC-03, NTC-04, NTC-05, NTC-06, NTC-07, NTC-08, NTC-09, NTC-10, NTC-11, NTC-12, REL-05 |
| `FR-20-REQ02` | Clear order or transaction references. | `P03-009` | NTC-01, NTC-02, NTC-03, NTC-04, NTC-05, NTC-06, NTC-07, NTC-08, NTC-09, NTC-10, NTC-11, NTC-12, REL-05 |
| `FR-20-REQ03` | Notification delivery status tracking. | `P03-009` | NTC-01, NTC-02, NTC-03, NTC-04, NTC-05, NTC-06, NTC-07, NTC-08, NTC-09, NTC-10, NTC-11, NTC-12, REL-05 |
| `FR-20-REQ04` | Retry handling for temporary failures. | `P03-009` | NTC-01, NTC-02, NTC-03, NTC-04, NTC-05, NTC-06, NTC-07, NTC-08, NTC-09, NTC-10, NTC-11, NTC-12, REL-05 |
| `FR-20-REQ05` | No duplicate customer notifications for repeated payment callbacks. | `P07-016` | NTC-07, NTC-08 |
| `FR-20-BR01` | Transactional notifications are separate from marketing messages. | `P03-009` | NTC-01, NTC-02, NTC-03, NTC-04, NTC-05, NTC-06, NTC-07, NTC-08, NTC-09, NTC-10, NTC-11, NTC-12, REL-05 |
| `FR-20-BR02` | Notification failure must not reverse a successfully completed business transaction. | `P03-009` | NTC-01, NTC-02, NTC-03, NTC-04, NTC-05, NTC-06, NTC-07, NTC-08, NTC-09, NTC-10, NTC-11, NTC-12, REL-05 |
| `FR-20-BR03` | Sensitive payment credentials must never appear in notifications. | `P03-009` | NTC-01, NTC-02, NTC-03, NTC-04, NTC-05, NTC-06, NTC-07, NTC-08, NTC-09, NTC-10, NTC-11, NTC-12, REL-05 |

### FR-21

**Source:** [PRD — Admin authentication](../PRD.md#fr-21-admin-authentication)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-21-DESC01` | Only authorized administrators can access store management functionality. | `P03-012` | SEC-02, SEC-03, SEC-04, UI-ADMIN-AUTH |
| `FR-21-REQ01` | Secure administrator login. | `P03-012` | SEC-02, SEC-03, SEC-04, UI-ADMIN-AUTH |
| `FR-21-REQ02` | Protected administrative routes. | `P03-012` | SEC-02, SEC-03, SEC-04, UI-ADMIN-AUTH |
| `FR-21-REQ03` | Server-side authorization. | `P03-013` | SEC-06 |
| `FR-21-REQ04` | Secure sessions. | `P03-005` | SEC-03 |
| `FR-21-REQ05` | Password recovery. | `P03-012` | SEC-02, SEC-03, SEC-04, UI-ADMIN-AUTH |
| `FR-21-REQ06` | Logout. | `P03-012` | SEC-02, SEC-03, SEC-04, UI-ADMIN-AUTH |
| `FR-21-REQ07` | Authentication rate limiting. | `P03-014` | SEC-01, SEC-12 |
| `FR-21-REQ08` | Administrative activity logging. | `P03-014` | SEC-01, SEC-12 |
| `FR-21-BR01` | No public administrator registration. | `P03-012` | SEC-02, SEC-03, SEC-04, UI-ADMIN-AUTH |
| `FR-21-BR02` | Initial administrator access must be provisioned securely. | `P03-012` | SEC-02, SEC-03, SEC-04, UI-ADMIN-AUTH |
| `FR-21-BR03` | Administrative operations require server-side permission checks. | `P03-013` | SEC-06 |
| `FR-21-BR04` | Refund and payment actions require authenticated administrator authorization. | `P03-013` | SEC-06 |

### FR-22

**Source:** [PRD — Admin dashboard](../PRD.md#fr-22-admin-dashboard)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-22-DESC01` | Administrators can monitor store activity. | `P09-001` | ADM-06, UI-ADMIN |
| `FR-22-METRIC01` | Total active products. | `P09-001` | ADM-06, UI-ADMIN |
| `FR-22-METRIC02` | Total registered customers. | `P09-001` | ADM-06, UI-ADMIN |
| `FR-22-METRIC03` | Total orders. | `P09-001` | ADM-06, UI-ADMIN |
| `FR-22-METRIC04` | Pending orders. | `P09-001` | ADM-06, UI-ADMIN |
| `FR-22-METRIC05` | Confirmed orders. | `P09-001` | ADM-06, UI-ADMIN |
| `FR-22-METRIC06` | Delivered orders. | `P09-001` | ADM-06, UI-ADMIN |
| `FR-22-METRIC07` | Cancelled orders. | `P09-001` | ADM-06, UI-ADMIN |
| `FR-22-METRIC08` | Paid collections. | `P09-002` | ADM-06 |
| `FR-22-METRIC09` | Outstanding COD collections. | `P09-002` | ADM-06 |
| `FR-22-METRIC10` | Completed refunds. | `P09-002` | ADM-06 |
| `FR-22-METRIC11` | Net collected revenue. | `P09-002` | ADM-06 |
| `FR-22-METRIC12` | Low-stock products. | `P09-001` | ADM-06, UI-ADMIN |
| `FR-22-METRIC13` | Recent orders. | `P09-001` | ADM-06, UI-ADMIN |
| `FR-22-METRIC14` | Pending return requests. | `P09-001` | ADM-06, UI-ADMIN |
| `FR-22-DEF01` | Gross merchandise value: purchase-time pre-discount merchandise value of accepted non-cancelled orders in the selected order-placement period. Product and coupon discounts are reported separately. | `P09-002` | ADM-06 |
| `FR-22-DEF02` | Paid collections: verified receipts by collection date, including separately identified overpayments. | `P09-002` | ADM-06 |
| `FR-22-DEF03` | Completed refunds: verified payouts by completion date; distinguish merchandise refunds from payment corrections. | `P09-002` | ADM-06 |
| `FR-22-DEF04` | Net collected revenue: collections minus completed refunds within the selected cash-flow period; this is not profit. | `P09-002` | ADM-06 |
| `FR-22-DEF05` | Outstanding COD and pending refunds: balances as of the displayed cutoff, not period revenue. | `P09-002` | ADM-06 |
| `FR-22-DEF06` | Reports identify their date basis, timezone, cutoff, and treatment of cancellations and corrections. Use Asia/Dhaka for business reporting; technical timestamp storage is defined in `DATABASE.md`. | `P09-002` | ADM-06 |
| `FR-22-REPORT01` | Gross merchandise value, discounts, paid collections, refunds, and net collections must be reported separately. | `P09-002` | ADM-06 |
| `FR-22-REPORT02` | COD amounts are not considered collected revenue before collection confirmation. | `P09-002` | ADM-06 |
| `FR-22-REPORT03` | Completed refunds reduce net collected revenue. | `P09-002` | ADM-06 |
| `FR-22-REPORT04` | Pending refunds are shown separately. | `P09-002` | ADM-06 |

### FR-23

**Source:** [PRD — Product management — Admin](../PRD.md#fr-23-product-management--admin)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-23-REQ01` | Add products. | `P04-005` | CAT-01, CAT-02, API-04, UI-ADMIN |
| `FR-23-REQ02` | Edit products. | `P04-005` | CAT-01, CAT-02, API-04, UI-ADMIN |
| `FR-23-REQ03` | Deactivate products. | `P04-005` | CAT-01, CAT-02, API-04, UI-ADMIN |
| `FR-23-REQ04` | Upload multiple images. | `P04-003` | CAT-01, SEC-08 |
| `FR-23-REQ05` | Assign categories. | `P04-005` | CAT-01, CAT-02, API-04, UI-ADMIN |
| `FR-23-REQ06` | Manage descriptions. | `P04-005` | CAT-01, CAT-02, API-04, UI-ADMIN |
| `FR-23-REQ07` | Configure regular and sale prices. | `P04-005` | CAT-01, CAT-02, API-04, UI-ADMIN |
| `FR-23-REQ08` | Manage product variants. | `P04-005` | CAT-01, CAT-02, API-04, UI-ADMIN |
| `FR-23-REQ09` | Configure featured products. | `P04-005` | CAT-01, CAT-02, API-04, UI-ADMIN |
| `FR-23-REQ10` | Manage product visibility. | `P04-005` | CAT-01, CAT-02, API-04, UI-ADMIN |
| `FR-23-REQ11` | Maintain unique product slugs. | `P04-002` | CAT-01, CAT-02, API-04, UI-ADMIN |

### FR-24

**Source:** [PRD — Category management — Admin](../PRD.md#fr-24-category-management--admin)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-24-REQ01` | Create categories. | `P04-004` | CAT-01, DB-02, UI-ADMIN |
| `FR-24-REQ02` | Edit categories. | `P04-004` | CAT-01, DB-02, UI-ADMIN |
| `FR-24-REQ03` | Manage subcategories. | `P04-001` | DB-02 |
| `FR-24-REQ04` | Configure category images. | `P04-003` | CAT-01, SEC-08 |
| `FR-24-REQ05` | Activate or deactivate categories. | `P04-004` | CAT-01, DB-02, UI-ADMIN |
| `FR-24-REQ06` | Prevent destructive deletion of categories with dependent products. | `P04-001` | DB-02 |

### FR-25

**Source:** [PRD — Inventory management — Admin](../PRD.md#fr-25-inventory-management--admin)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-25-REQ01` | View available stock. | `P04-006` | INV-01 |
| `FR-25-REQ02` | View reserved stock. | `P04-006` | INV-01 |
| `FR-25-REQ03` | View committed stock. | `P04-006` | INV-01 |
| `FR-25-REQ04` | Update inventory quantities. | `P04-007` | DB-09, INV-01, INV-02, INV-03, UI-ADMIN |
| `FR-25-REQ05` | View low-stock alerts. | `P04-007` | DB-09, INV-01, INV-02, INV-03, UI-ADMIN |
| `FR-25-REQ06` | View stock movement history. | `P04-007` | DB-09, INV-01, INV-02, INV-03, UI-ADMIN |
| `FR-25-REQ07` | Record stock adjustments. | `P04-007` | DB-09, INV-01, INV-02, INV-03, UI-ADMIN |
| `FR-25-REQ08` | Review returned stock before restocking. | `P08-004` | RET-02, RET-06 |

### FR-26

**Source:** [PRD — Order management — Admin](../PRD.md#fr-26-order-management--admin)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-26-REQ01` | View all orders. | `P06-011` | ORD-01, ORD-02, ORD-03, ORD-04, SUP-01, SUP-02, SUP-03, SUP-04, UI-ADMIN |
| `FR-26-REQ02` | Search by order number. | `P06-011` | ORD-01, ORD-02, ORD-03, ORD-04, SUP-01, SUP-02, SUP-03, SUP-04, UI-ADMIN |
| `FR-26-REQ03` | Filter by status. | `P06-011` | ORD-01, ORD-02, ORD-03, ORD-04, SUP-01, SUP-02, SUP-03, SUP-04, UI-ADMIN |
| `FR-26-REQ04` | View customer and delivery information. | `P06-011` | ORD-01, ORD-02, ORD-03, ORD-04, SUP-01, SUP-02, SUP-03, SUP-04, UI-ADMIN |
| `FR-26-REQ05` | View purchased items. | `P06-011` | ORD-01, ORD-02, ORD-03, ORD-04, SUP-01, SUP-02, SUP-03, SUP-04, UI-ADMIN |
| `FR-26-REQ06` | View payment status. | `P07-015` | PAY-05 |
| `FR-26-REQ07` | Confirm COD orders. | `P06-011` | ORD-01, ORD-02, ORD-03, ORD-04, SUP-01, SUP-02, SUP-03, SUP-04, UI-ADMIN |
| `FR-26-REQ08` | Update fulfillment status. | `P06-011` | ORD-01, ORD-02, ORD-03, ORD-04, SUP-01, SUP-02, SUP-03, SUP-04, UI-ADMIN |
| `FR-26-REQ09` | Record shipment information. | `P06-011` | ORD-01, ORD-02, ORD-03, ORD-04, SUP-01, SUP-02, SUP-03, SUP-04, UI-ADMIN |
| `FR-26-REQ10` | Handle cancellation requests. | `P06-013` | ORD-02, ORD-03 |
| `FR-26-REQ11` | Handle delivery exceptions. | `P09-004` | SUP-02, SUP-04 |
| `FR-26-REQ12` | Record and resolve customer complaints. | `P09-004` | SUP-02, SUP-04 |
| `FR-26-REQ13` | Access associated returns and refunds. | `P08-015` | UI-ADMIN |

### FR-27

**Source:** [PRD — Customer management — Admin](../PRD.md#fr-27-customer-management--admin)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-27-REQ01` | View registered customers. | `P09-003` | ADM-01, ADM-02, ADM-03, ADM-04, API-08, SEC-06 |
| `FR-27-REQ02` | Search customers. | `P09-003` | ADM-01, ADM-02, ADM-03, ADM-04, API-08, SEC-06 |
| `FR-27-REQ03` | View customer order history. | `P09-003` | ADM-01, ADM-02, ADM-03, ADM-04, API-08, SEC-06 |
| `FR-27-REQ04` | View return and refund history. | `P09-003` | ADM-01, ADM-02, ADM-03, ADM-04, API-08, SEC-06 |
| `FR-27-REQ05` | Suspend or reactivate accounts. | `P09-003` | ADM-01, ADM-02, ADM-03, ADM-04, API-08, SEC-06 |
| `FR-27-REQ06` | Restrict sensitive information access. | `P09-003` | ADM-01, ADM-02, ADM-03, ADM-04, API-08, SEC-06 |

### FR-28

**Source:** [PRD — Delivery charge management — Admin](../PRD.md#fr-28-delivery-charge-management--admin)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-28-DESC01` | Administrators can control delivery pricing and availability. | `P06-001` | ADM-05, ORD-05, ORD-06, API-04 |
| `FR-28-REQ01` | Create delivery zones. | `P06-001` | ADM-05, ORD-05, ORD-06, API-04 |
| `FR-28-REQ02` | Assign districts or areas to zones. | `P06-001` | ADM-05, ORD-05, ORD-06, API-04 |
| `FR-28-REQ03` | Configure delivery charges. | `P06-001` | ADM-05, ORD-05, ORD-06, API-04 |
| `FR-28-REQ04` | Edit delivery charges. | `P06-001` | ADM-05, ORD-05, ORD-06, API-04 |
| `FR-28-REQ05` | Activate or deactivate delivery zones. | `P06-001` | ADM-05, ORD-05, ORD-06, API-04 |
| `FR-28-REQ06` | Configure delivery availability. | `P06-001` | ADM-05, ORD-05, ORD-06, API-04 |
| `FR-28-REQ07` | View current delivery rules. | `P06-001` | ADM-05, ORD-05, ORD-06, API-04 |
| `FR-28-BR01` | Delivery charges are controlled by administrators. | `P06-001` | ADM-05, ORD-05, ORD-06, API-04 |
| `FR-28-BR02` | Updated charges apply to future orders. | `P06-001` | ADM-05, ORD-05, ORD-06, API-04 |
| `FR-28-BR03` | Existing orders preserve their original charges. | `P06-001` | ADM-05, ORD-05, ORD-06, API-04 |
| `FR-28-BR04` | Delivery charges must never be negative. | `P06-001` | ADM-05, ORD-05, ORD-06, API-04 |
| `FR-28-BR05` | Checkout must use the active delivery charge rule for the selected location. | `P06-001` | ADM-05, ORD-05, ORD-06, API-04 |

### FR-29

**Source:** [PRD — Payment management — Admin](../PRD.md#fr-29-payment-management--admin)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-29-REQ01` | View payment records. | `P07-015` | PAY-05, PAY-09, PAY-10, PAY-11, PAY-12, PAY-13, UI-ADMIN |
| `FR-29-REQ02` | Search by transaction reference. | `P07-015` | PAY-05, PAY-09, PAY-10, PAY-11, PAY-12, PAY-13, UI-ADMIN |
| `FR-29-REQ03` | Filter by payment method and status. | `P07-015` | PAY-05, PAY-09, PAY-10, PAY-11, PAY-12, PAY-13, UI-ADMIN |
| `FR-29-REQ04` | Review failed or pending payments. | `P07-015` | PAY-05, PAY-09, PAY-10, PAY-11, PAY-12, PAY-13, UI-ADMIN |
| `FR-29-REQ05` | View payment attempt history. | `P07-015` | PAY-05, PAY-09, PAY-10, PAY-11, PAY-12, PAY-13, UI-ADMIN |
| `FR-29-REQ06` | Verify payment reconciliation results. | `P07-012` | PAY-05 |
| `FR-29-REQ07` | Record COD collection. | `P06-012` | PAY-12 |
| `FR-29-REQ08` | View associated refunds. | `P08-015` | UI-ADMIN |

### FR-30

**Source:** [PRD — Coupon management — Admin](../PRD.md#fr-30-coupon-management--admin)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-30-REQ01` | Create coupons. | `P05-008` | PRM-02, PRM-03, PRM-04, UI-ADMIN |
| `FR-30-REQ02` | Edit coupons. | `P05-008` | PRM-02, PRM-03, PRM-04, UI-ADMIN |
| `FR-30-REQ03` | Configure percentage or fixed discounts. | `P05-008` | PRM-02, PRM-03, PRM-04, UI-ADMIN |
| `FR-30-REQ04` | Set minimum order value. | `P05-008` | PRM-02, PRM-03, PRM-04, UI-ADMIN |
| `FR-30-REQ05` | Configure start and expiration dates. | `P05-008` | PRM-02, PRM-03, PRM-04, UI-ADMIN |
| `FR-30-REQ06` | Configure usage limits. | `P05-008` | PRM-02, PRM-03, PRM-04, UI-ADMIN |
| `FR-30-REQ07` | Activate or deactivate coupons. | `P05-008` | PRM-02, PRM-03, PRM-04, UI-ADMIN |
| `FR-30-REQ08` | View redemption history. | `P05-008` | PRM-02, PRM-03, PRM-04, UI-ADMIN |

### FR-31

**Source:** [PRD — Review management — Admin](../PRD.md#fr-31-review-management--admin)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-31-REQ01` | View customer reviews. | `P09-006` | REV-01, UI-ADMIN |
| `FR-31-REQ02` | Approve reviews. | `P09-006` | REV-01, UI-ADMIN |
| `FR-31-REQ03` | Reject reviews. | `P09-006` | REV-01, UI-ADMIN |
| `FR-31-REQ04` | Hide inappropriate content. | `P09-006` | REV-01, UI-ADMIN |
| `FR-31-REQ05` | Record moderation decisions. | `P09-006` | REV-01, UI-ADMIN |
| `FR-31-REQ06` | Prevent unauthorized review manipulation. | `P09-006` | REV-01, UI-ADMIN |

### FR-32

**Source:** [PRD — Return management — Admin](../PRD.md#fr-32-return-management--admin)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-32-REQ01` | View return requests. | `P08-003` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, UI-ADMIN |
| `FR-32-REQ02` | Verify eligibility. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, UI-ADMIN |
| `FR-32-REQ03` | Review reasons and evidence. | `P08-003` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, UI-ADMIN |
| `FR-32-REQ04` | Approve or reject requests. | `P08-003` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, UI-ADMIN |
| `FR-32-REQ05` | Record rejection reasons. | `P08-003` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, UI-ADMIN |
| `FR-32-REQ06` | Record product receipt. | `P08-004` | RET-02, RET-06 |
| `FR-32-REQ07` | Record inspection results. | `P08-004` | RET-02, RET-06 |
| `FR-32-REQ08` | Update return statuses. | `P08-003` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, UI-ADMIN |
| `FR-32-REQ09` | Determine restocking eligibility. | `P08-002` | RET-01, RET-02, RET-03, RET-04, RET-05, RET-06, UI-ADMIN |
| `FR-32-REQ10` | Initiate related refund processing. | `P08-005` | RFD-02 |

### FR-33

**Source:** [PRD — Refund management — Admin](../PRD.md#fr-33-refund-management--admin)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-33-REQ01` | View refund requests. | `P08-015` | RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, UI-ADMIN |
| `FR-33-REQ02` | Review original payment details. | `P08-005` | RFD-02 |
| `FR-33-REQ03` | Calculate refundable balances. | `P08-006` | RFD-01 |
| `FR-33-REQ04` | Approve or reject refunds. | `P08-015` | RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, UI-ADMIN |
| `FR-33-REQ05` | Process full refunds. | `P08-015` | RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, UI-ADMIN |
| `FR-33-REQ06` | Process partial refunds. | `P08-015` | RFD-02, RFD-03, RFD-04, RFD-05, RFD-06, RFD-07, RFD-08, RFD-09, UI-ADMIN |
| `FR-33-REQ07` | Initiate supported provider refunds. | `P08-008` | RFD-08 |
| `FR-33-REQ08` | Record manual refunds. | `P08-010` | RFD-07 |
| `FR-33-REQ09` | Track refund attempts. | `P08-009` | RFD-03, RFD-08 |
| `FR-33-REQ10` | Resolve failed refunds. | `P08-009` | RFD-03, RFD-08 |
| `FR-33-REQ11` | Maintain refund audit history. | `P08-011` | NTC-09, NTC-10, NTC-11, NTC-12 |

### FR-34

**Source:** [PRD — Store settings — Admin](../PRD.md#fr-34-store-settings--admin)

| Vector / source ID | Required behavior (verbatim PRD clause) | Accountable implementation task | Scenario family to extend |
| --- | --- | --- | --- |
| `FR-34-REQ01` | Manage store name and branding. | `P09-005` | SET-01, SET-02, SET-03, SET-04, ADM-05, SEC-12, UI-CONTENT |
| `FR-34-REQ02` | Manage contact information. | `P09-008` | UI-CONTENT |
| `FR-34-REQ03` | Configure store address. | `P09-005` | SET-01, SET-02, SET-03, SET-04, ADM-05, SEC-12, UI-CONTENT |
| `FR-34-REQ04` | Manage delivery settings. | `P06-001` | ADM-05 |
| `FR-34-REQ05` | Configure low-stock threshold. | `P09-005` | SET-01, SET-02, SET-03, SET-04, ADM-05, SEC-12, UI-CONTENT |
| `FR-34-REQ06` | Manage shipping policy content. | `P09-005` | SET-01, SET-02, SET-03, SET-04, ADM-05, SEC-12, UI-CONTENT |
| `FR-34-REQ07` | Manage cancellation policy content. | `P09-005` | SET-01, SET-02, SET-03, SET-04, ADM-05, SEC-12, UI-CONTENT |
| `FR-34-REQ08` | Manage return and refund policy content. | `P09-005` | SET-01, SET-02, SET-03, SET-04, ADM-05, SEC-12, UI-CONTENT |
| `FR-34-REQ09` | Manage customer support information and complaint contact details. | `P09-008` | UI-CONTENT |

## Product acceptance checks

These 69 AC IDs, conditions and scenario families match TESTING Appendix B and PRD §14 in their original order.
Each AC has its own evidence slot in addition to the clause slots. Shared task ownership never substitutes for an
individual result. AC-R22–R24 include operational/nonfunctional acceptance and are linked to P01-004 below.

| Acceptance / evidence slot | PRD condition (verbatim) | Accountable / shared tasks | UI/API/service context | Planned cases / external evidence |
| --- | --- | --- | --- | --- |
| `AC-C01` | Customers can register, log in, and reset passwords. | `P03-007` | [FR-01](#fr-01) | `API-01, SEC-01, SEC-03` |
| `AC-C02` | Customers can manage profiles and addresses. | `P03-008` | [FR-02](#fr-02) | `ACC-01`–`ACC-05`, `SEC-06` |
| `AC-C03` | Guests can place orders without creating accounts. | `P06-004` | [FR-11](#fr-11), [FR-19](#fr-19) | `CHK-01, ORD-07` |
| `AC-C04` | Guests can access only their own orders after email verification. | `P06-015` | [FR-19](#fr-19) | `API-09, SEC-05, ORD-07` |
| `AC-C05` | Product browsing, search, filtering, and sorting work. | `P04-009` | [FR-04](#fr-04) | `CAT-01, CAT-03, UI-CAT` |
| `AC-C06` | Product variants and stock are handled correctly. | `P04-010` | [FR-05](#fr-05), [FR-06](#fr-06), [FR-13](#fr-13) | `CAT-02, INV-01` |
| `AC-C07` | Shopping carts persist appropriately. | `P05-002` | [FR-07](#fr-07) | `SHP-01` |
| `AC-C08` | Wishlists work across sessions. | `P05-004` | [FR-08](#fr-08) | `SHP-02` (cross-session persistence) |
| `AC-C09` | Product discounts calculate correctly. | `P05-005` | [FR-09](#fr-09) | `PRM-01, FX-MONEY-01/02` |
| `AC-C10` | Concurrent coupon use respects limits; expired holds are released. | `P05-007`, `P06-010`, `P10-002` | [FR-09](#fr-09), [FR-13](#fr-13) | `PRM-03, PRM-04, INV-02` |
| `AC-C11` | Eligible customers can submit reviews. | `P05-009` | [FR-10](#fr-10) | `REV-01` |
| `AC-C12` | Reviews are moderated appropriately. | `P09-006` | [FR-10](#fr-10), [FR-31](#fr-31) | `REV-01, UI-ADMIN` |
| `AC-C13` | Checkout calculates accurate order totals. | `P06-004` | [FR-11](#fr-11) | `CHK-03, PRM-01` |
| `AC-C14` | Customers can place COD orders. | `P06-008` | [FR-11](#fr-11), [FR-12](#fr-12), [FR-13](#fr-13) | `CHK-02, PAY-12, GATE-COD` |
| `AC-C15` | bKash payments work through approved integration. | `P07-017`, `P11-005`, `P11-009` | [FR-12](#fr-12) | `PAY-01, GATE-BKASH` |
| `AC-C16` | Nagad payments work through approved integration. | `P07-017`, `P11-005`, `P11-009` | [FR-12](#fr-12) | `PAY-01, GATE-NAGAD` |
| `AC-C17` | Rocket payments work through approved integration. | `P07-017`, `P11-005`, `P11-009` | [FR-12](#fr-12) | `PAY-01, GATE-ROCKET` |
| `AC-C18` | Online payments are verified server-side. | `P07-006` | [FR-12](#fr-12) | `PAY-01, PAY-02, PAY-03` |
| `AC-C19` | Payment retries create no duplicate orders or repeated effects for the same collection; independently paid attempts remain recorded and excess collections enter correction/refund resolution. | `P07-011`, `P06-006`, `P07-007`, `P07-013`, `P08-007` | [FR-11](#fr-11), [FR-12](#fr-12), [FR-13](#fr-13), [FR-18](#fr-18) | `CHK-04, PAY-04, PAY-09, RFD-05` |
| `AC-C20` | Customers can view order status. | `P06-014` | [FR-14](#fr-14) | `ORD-01, UI-ORD` |
| `AC-C21` | Customers can request eligible cancellations. | `P06-013` | [FR-15](#fr-15) | `ORD-02, ORD-03` |
| `AC-C22` | Customers can request eligible returns. | `P08-002` | [FR-17](#fr-17) | `RET-01, RET-05` |
| `AC-C23` | Physical returns are inspected before related refunds are approved; approved missing-item/shortage claims do not require a fictional physical return. | `P08-004`, `P08-003`, `P08-005` | [FR-17](#fr-17), [FR-18](#fr-18) | `RET-02, RET-03` |
| `AC-C24` | Guest coupon eligibility respects the account requirement for per-customer limits. | `P05-006` | [FR-09](#fr-09) | `PRM-02` |
| `AC-C25` | COD placement commits allocation once and remains Pending until administrator confirmation. | `P06-008` | [FR-11](#fr-11), [FR-13](#fr-13) | `CHK-02, INV-01` |
| `AC-C26` | Customers can track refund status. | `P08-013` | [FR-18](#fr-18), [FR-19](#fr-19) | `RFD-03, RFD-09, UI-AFTERSALES` |
| `AC-C27` | Customers receive important transactional notifications. | `P03-009`, `P06-016`, `P07-016`, `P08-011` | [FR-20](#fr-20) | `NTC-01`–`NTC-12`, `REL-05` |
| `AC-A01` | Administrator authentication is secure. | `P03-012` | [FR-21](#fr-21) | `SEC-02, SEC-03, UI-ADMIN-AUTH` |
| `AC-A02` | Products and variants can be managed. | `P04-005` | [FR-23](#fr-23), [FR-06](#fr-06) | `CAT-01, CAT-02, UI-ADMIN` |
| `AC-A03` | Categories can be managed. | `P04-004` | [FR-24](#fr-24) | `CAT-01, UI-ADMIN` |
| `AC-A04` | Physical, reserved, committed, and available stock remain consistent. | `P04-006` | [FR-13](#fr-13), [FR-25](#fr-25) | `INV-01, INV-03, DB-09` |
| `AC-A05` | Delivery zones can be configured. | `P06-001` | [FR-16](#fr-16), [FR-28](#fr-28) | `ADM-05, ORD-05` |
| `AC-A06` | Delivery charges can be changed. | `P06-001` | [FR-28](#fr-28) | `ADM-05, ORD-05, API-04` |
| `AC-A07` | Updated charges apply only to future orders. | `P06-001` | [FR-28](#fr-28), [FR-11](#fr-11) | `ADM-05, ORD-05, DB-07` |
| `AC-A08` | Orders can be managed. | `P06-011` | [FR-26](#fr-26) | `ORD-01, ORD-04, UI-ADMIN` |
| `AC-A09` | Customer complaints can be recorded and resolved. | `P09-004` | [FR-16](#fr-16), [FR-26](#fr-26) | `SUP-01`–`SUP-04`, `REL-10` |
| `AC-A10` | COD collections can be recorded. | `P06-012` | [FR-12](#fr-12), [FR-29](#fr-29) | `PAY-12` |
| `AC-A11` | Payment records can be reviewed. | `P07-015` | [FR-29](#fr-29) | `PAY-05, PAY-09, UI-ADMIN` |
| `AC-A12` | Coupons can be managed. | `P05-008` | [FR-30](#fr-30), [FR-09](#fr-09) | `PRM-02, PRM-03, UI-ADMIN` |
| `AC-A13` | Reviews can be moderated. | `P09-006` | [FR-31](#fr-31) | `REV-01, UI-ADMIN` |
| `AC-A14` | Return requests can be processed. | `P08-003` | [FR-32](#fr-32) | `RET-01, RET-05` |
| `AC-A15` | Full and partial refunds can be processed. | `P08-015`, `P08-006`, `P08-007`, `P08-008`, `P08-009`, `P08-010` | [FR-33](#fr-33), [FR-18](#fr-18) | `RFD-01, RFD-02, RFD-07` |
| `AC-A16` | Refund history is preserved. | `P08-005`, `P08-011` | [FR-18](#fr-18), [FR-33](#fr-33) | `DB-08, RFD-03, RFD-04` |
| `AC-A17` | Dashboard metrics account for refunds and COD. | `P09-001` | [FR-22](#fr-22) | `ADM-06, RFD-05, PAY-12` |
| `AC-A18` | Sensitive administrative actions are logged. | `P09-007` | [FR-21](#fr-21), [FR-26](#fr-26), [FR-29](#fr-29), [FR-33](#fr-33) | `SEC-12, DB-08` |
| `AC-R01` | Duplicate checkout submissions do not create duplicate orders. | `P06-006` | [FR-11](#fr-11) | `CHK-04, CHK-05` |
| `AC-R02` | Concurrent purchases cannot oversell stock. | `P10-002` | [FR-13](#fr-13) | `INV-01` |
| `AC-R03` | Expired payment reservations are released. | `P06-010` | [FR-13](#fr-13), [FR-09](#fr-09) | `INV-02, REL-03` |
| `AC-R04` | Duplicate payment callbacks do not duplicate financial effects. | `P07-007` | [FR-12](#fr-12) | `PAY-04` |
| `AC-R05` | Combined pending and completed refunds never exceed the collected payment. | `P08-007` | [FR-18](#fr-18), [FR-33](#fr-33) | `RFD-02, DB-12` |
| `AC-R06` | Duplicate refunds are prevented. | `P08-007` | [FR-18](#fr-18), [FR-33](#fr-33) | `RFD-02, RFD-04` |
| `AC-R07` | Partial refunds use original item prices, discounts, and quantities. | `P08-006` | [FR-18](#fr-18) | `RFD-01, FX-MONEY-03` |
| `AC-R08` | Unauthorized users cannot access protected data. | `P10-005` | [FR-01](#fr-01), [FR-02](#fr-02), [FR-19](#fr-19), [FR-21](#fr-21), [FR-27](#fr-27) | `API-03, SEC-06` |
| `AC-R09` | Invalid order status transitions are rejected. | `P06-011` | [FR-14](#fr-14), [FR-26](#fr-26) | `ORD-01, ORD-03` |
| `AC-R10` | Core customer and admin workflows pass functional testing. | `P10-001` | All 34 FR contexts | `UI-HOME, UI-CAT, UI-CHECKOUT, UI-ADMIN` |
| `AC-R11` | SSLCOMMERZ IPN and browser-return paths are independently reconciled with validated provider status. | `P07-005` | [FR-12](#fr-12) | `PAY-01, PAY-02, PAY-05` |
| `AC-R12` | Payment validation rejects mismatched transaction reference, amount, currency or merchant account. | `P07-006` | [FR-12](#fr-12) | `PAY-03, PAY-10, PAY-14` |
| `AC-R13` | Risk-flagged transactions remain on hold pending authorized review. | `P07-010` | [FR-12](#fr-12) | `PAY-08` |
| `AC-R14` | Late verified payments recheck inventory and coupon capacity only for eligible non-cancelled orders; unavailable capacity holds fulfillment for refund or admin resolution. | `P07-009`, `P07-010`, `P08-007` | [FR-12](#fr-12), [FR-13](#fr-13), [FR-09](#fr-09) | `PAY-06` |
| `AC-R15` | A verified payment after cancellation is recorded without reopening fulfillment. | `P07-011` | [FR-12](#fr-12), [FR-14](#fr-14), [FR-15](#fr-15), [FR-18](#fr-18) | `PAY-07` |
| `AC-R16` | Duplicate collections remain recorded and can be refunded against their own source balance without duplicating fulfillment. | `P07-011` | [FR-12](#fr-12), [FR-18](#fr-18) | `PAY-09, RFD-05` |
| `AC-R17` | Final failed-delivery closure records custody/disposition; only recovered inspected resellable goods are restocked. | `P06-017` | [FR-14](#fr-14), [FR-16](#fr-16), [FR-25](#fr-25), [FR-32](#fr-32) | `ORD-04, RET-06` |
| `AC-R18` | Refund initiation and verified refund completion are recorded as distinct events. | `P08-009` | [FR-18](#fr-18) | `RFD-03, RFD-08` |
| `AC-R19` | COD payment remains unpaid until collection is verified. | `P06-012` | [FR-12](#fr-12), [FR-29](#fr-29) | `PAY-12` |
| `AC-R20` | Checkout shows applicable delivery deadlines; complaints receive a tracked response. | `P06-003`, `P09-004`, `P11-007` | [FR-11](#fr-11), [FR-16](#fr-16), [FR-26](#fr-26) | `ORD-06, SUP-04, REL-10` |
| `AC-R21` | Payment and refund sandbox tests pass. | `P07-017`, `P08-018`, `P10-003`, `P10-004` | [FR-12](#fr-12), [FR-18](#fr-18) | `PAY-01, RFD-08 + sandbox evidence` |
| `AC-R22` | Database backup and restore procedures are verified. | `P10-011`, `P01-004` | Operations §11; restore/reconciliation services; PRD §12.3 | `REL-08, DB-10` (loss-gap reconciliation) |
| `AC-R23` | Production services use HTTPS. | `P11-001`, `P01-004` | HTTPS ingress / deployed storefront, admin and API; PRD §12.2 | `SEC-11, ENV-01` |
| `AC-R24` | Website functions across supported devices and browsers. | `P10-007`, `P01-004` | All storefront/admin pages; PRD §§12.5–12.7 | `§14 device/browser matrix` |

## Nonfunctional handoff to P01-004

The following are PRD section references, not new NFR IDs. P01-004 owns the full NFR clause and release mapping;
this task establishes the functional cross-links. Security/privacy, availability, responsive behavior, accessibility
and browser support apply across all UI/API contexts even when not repeated in an individual source bullet.

| PRD NFR area | Applicable functional contexts | Execution / verification ownership |
| --- | --- | --- |
| §12.1 Performance | Public discovery, cart, checkout, private history and bounded admin/report queries | P01-004; P04-011, P09-009, P10-008, P10-009 |
| §12.2 Security | All 34 contexts; identity, ownership, callbacks, files and financial operations | P01-004; P03-006, P03-013, P03-014, P10-005, P11-003 |
| §12.3 Reliability | Cart persistence, stock/coupon, orders, payments, notifications, claims, refunds and reports; AC-R22 | P01-004; P10-002, P10-003, P10-004, P10-010, P10-011 |
| §12.4 Availability | All 34 contexts and operational serving/recovery | P01-004; P09-011, P11-004, P11-010 |
| §12.5 Responsive design | All storefront/admin contexts; AC-R24 | P01-004; P02-011, P10-007 |
| §12.6 Accessibility | All interactive contexts and both themes | P01-004; P02-008, P02-011, P10-006 |
| §12.7 Browser compatibility | All storefront/admin contexts; AC-R24 | P01-004; P10-007 |
| §12.8 Data protection | All contexts handling identity, order/payment, claims, evidence, complaints, notifications or audits | P01-004; P03-013, P10-005, P10-009, P10-011 |

## Coverage, dependencies and release blockers

- Structural mapping gaps: none. Every FR description, bullet and PRD §14 acceptance condition has a vector, task,
  surface context and planned evidence slot. This is a planning result; all executable linkage and run evidence are Not Run.
- Shared ownership: FR-02 history depends on order/shopping/after-sales slices; FR-05/10 reviews depend on delivered
  purchases and refunds; FR-09/11/13 share stock/coupon guards; FR-14/15/16/26 share fulfillment/exception handling;
  FR-17/18/32/33 share quantity and source-fund guards; FR-20 spans all business-event producers; FR-22 uses reconciled
  cross-domain facts. The context matrix records these follow-through tasks explicitly.
- Provider gates: EXT-01/02 apply to FR-12/18/29/33, AC-C15–C19 and AC-R11–R16/R18/R21. Merchant activation, exact
  supported callbacks/refunds and sandbox/live evidence are required; COD never waives required online channels.
- Store/policy/media gates: EXT-04/06/07/08 apply to catalog/branding, delivery, complaints, return/refund eligibility,
  private uploads and published customer commitments. P01-005–P01-007 own operational assignment and feasibility;
  P11-006/P11-007 own launch configuration and current-authority approval.
- Environment/delivery gates: EXT-03/05/09 apply to transactions, notifications, origins, performance, recovery and
  production. No financial race test passes on standalone MongoDB; no mock proves live provider capability.
- All mandatory failure states, immutable snapshots, authorization checks, replays, uncertain external outcomes and
  financial/source caps remain subject to PRD/Architecture/API/Database. M1–M8 stay separately unaccepted.

## Verification record

Local checks compare the register against PRD §5, PRD §14, TESTING Appendix B, all 171 tasks and canonical API headings.
They verify exact source text/order, unique vector IDs, valid task and scenario references, ownership, dependency cycles,
progress totals, relative links/anchors, table/fence structure and unchanged governing specifications/prior evidence.

**Command:** `python3 /tmp/p01-003-verify.py`\
**Whitespace check:** `git diff --check`\
**Result:** Passed — static traceability verification. Runtime/provider tests: Not Run (feature execution tasks).

| Validation | Observed result |
| --- | --- |
| Exact PRD §5 coverage | Passed — 34 FRs, all 550 bullets and 23 descriptions preserved in source order |
| PRD §14 / TESTING Appendix B parity | Passed — all 69 AC IDs, conditions and planned cases match |
| Unique planned evidence slots | Passed — 573 clause vectors plus 69 acceptance checks, 642 total |
| Ownership and references | Passed — valid tasks/scenario families, 34 UI/API contexts and eight NFR handoff areas |
| Task register integrity | Passed — all 171 IDs and dependencies preserved; prior owners retained and extended |
| Documentation integrity | Passed — 658 local links/anchors across 15 Markdown files; tables, fences and whitespace valid |
| Change isolation | Passed — governing specifications, prior evidence and staged user changes preserved |

## Acceptance

**Accepted by:** Project owner\
**Accepted on:** 17 October 2026 (Asia/Dhaka)\
**Acceptance evidence:** Conversation reply to the P01-003 review request: “Traceability register গ্রহণ করছি”.

Verification and independent acceptance satisfy [TASKS §2](../TASKS.md#2-task-management-conventions) and
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting). P01-003 is Done; its checkbox and progress totals reflect
this acceptance. This planning acceptance does not complete mapped features or approve any release gate.
