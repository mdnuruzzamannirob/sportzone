# SportZone — Product Requirements Document

**Version:** 1.2  
**Updated:** 15 October 2026  
**Project Type:** Full-Stack E-Commerce Web Application  
**Target Market:** Bangladesh  
**Currency:** Bangladeshi Taka (BDT)  
**Platform:** Responsive Web Application  
**Document Status:** Product requirements baseline — implementation and launch acceptance pending  
**Language:** English  

---

This document owns product scope, business rules, customer rights, and product acceptance. Technical design belongs in [Architecture](./ARCHITECTURE.md); detailed data and HTTP contracts belong in [Database](./DATABASE.md) and [API](./API.md). Delivery sequencing belongs in [Implementation Plan](./IMPLEMENTATION_PLAN.md), execution status in [Tasks](./TASKS.md), verification procedures in [Testing](./TESTING.md), and operating procedures in [Operations](./OPERATIONS.md). [Design](./DESIGN.md) owns interface behavior. Root [README](../README.md) and [AGENTS](../AGENTS.md) provide repository orientation and coding-agent instructions.

**Documentation synchronization (16 October 2026):** All twelve planned Markdown documentation files now exist as proposed/baseline artifacts. This editorial synchronization does not change the PRD v1.2 product requirements or claim implementation, technical sign-off, deployment, legal approval, or release acceptance.

**Contents**

- [1. Project Overview](#1-project-overview)
- [2. Target Users](#2-target-users)
- [3. Project Scope](#3-project-scope)
- [4. Product Categories](#4-product-categories)
- [5. Functional Requirements](#5-functional-requirements)
- [6. Business Rules and Policies](#6-business-rules-and-policies)
- [7. User Flows](#7-user-flows)
- [8. Application Pages](#8-application-pages)
- [9. Roles and Permissions](#9-roles-and-permissions)
- [10. Data Requirements](#10-data-requirements)
- [11. State Management and Edge Cases](#11-state-management-and-edge-cases)
- [12. Non-Functional Requirements](#12-non-functional-requirements)
- [13. Technical Constraints and Ownership](#13-technical-constraints-and-ownership)
- [14. Acceptance Criteria](#14-acceptance-criteria)
- [15. Delivery Planning](#15-delivery-planning)
- [16. Success Metrics](#16-success-metrics)
- [17. Future Enhancements](#17-future-enhancements)
- [18. Release, Handover, and Support](#18-release-handover-and-support)
- [19. Assumptions and Operational Dependencies](#19-assumptions-and-operational-dependencies)
- [20. Final Deliverables](#20-final-deliverables)

---

## 1. Project Overview

### 1.1 Introduction

SportZone is a Bangladesh-based e-commerce platform for sports equipment, sportswear, fitness products, and accessories.

Customers can browse products, manage carts and wishlists, use discounts, and pay through local methods. They can also track orders, review purchases, and request returns or refunds.

Administrators manage the catalog, stock, orders, payments, delivery, promotions, reviews, returns, and refunds.

The initial release will support a single online store operating within Bangladesh.

### 1.2 Problem Statement

Customers need a reliable way to find sports products, compare prices, and check stock.

Store owners need one place to manage stock, orders, payments, delivery, and support.

SportZone provides a simple storefront and a centralized store-management system.

### 1.3 Project Objectives

- Build a responsive and user-friendly sports e-commerce platform.
- Provide secure customer authentication and account management.
- Enable efficient product discovery through search, filters, and categories.
- Support shopping carts, wishlists, discounts, and coupons.
- Support bKash, Nagad, Rocket, and Cash on Delivery.
- Provide accurate order processing and inventory management.
- Target delivery within 14 calendar days, or sooner when required by law.
- Allow administrators to configure delivery charges.
- Support verified product reviews and ratings.
- Provide transparent cancellation, return, and refund workflows.
- Maintain secure, reliable, and maintainable business operations.

### 1.4 Product Principles

- Mobile-first shopping experience.
- Transparent pricing and delivery information.
- Secure customer and payment data.
- Accurate inventory and order records.
- Simple administration.
- Clear customer communication.
- Controlled operational complexity.
- Reliable recovery from failed transactions.

---

## 2. Target Users

### 2.1 Guest Customers

Visitors who have not registered an account.

**Capabilities:**

- Browse products and categories.
- Search, filter, and sort products.
- View product details and reviews.
- Add products to a temporary shopping cart.
- Complete guest checkout.
- Access their orders through a secure verification process.

### 2.2 Registered Customers

Customers with an authenticated account.

**Capabilities:**

- Manage personal information.
- Manage saved delivery addresses.
- Maintain a persistent shopping cart.
- Save products to a wishlist.
- Place and track orders.
- Apply discount coupons.
- Submit eligible product reviews.
- Request order cancellations.
- Request product returns and refunds.
- View order, return, and refund history.

### 2.3 Store Administrators

Authorized personnel responsible for store operations.

**Capabilities:**

- Manage products and categories.
- Manage inventory.
- Configure delivery zones and charges.
- Manage orders and customers.
- Verify and reconcile payments.
- Create discounts and coupons.
- Moderate reviews.
- Process cancellations, returns, and refunds.
- Configure store policies.
- Monitor basic business performance.

---

## 3. Project Scope

### 3.1 Included Features

**Customer Features**

1. Customer registration and authentication.
2. Customer profile and address management.
3. Responsive homepage.
4. Product catalog and categories.
5. Product search, filtering, and sorting.
6. Product details and variants.
7. Shopping cart.
8. Wishlist.
9. Product discounts and coupons.
10. Product reviews and ratings.
11. Guest and registered checkout.
12. bKash, Nagad, Rocket, and Cash on Delivery.
13. Order confirmation and history.
14. Order status tracking.
15. Order cancellation requests.
16. Product return requests.
17. Full and partial refunds.
18. Refund status tracking.
19. Transactional notifications.
20. Customer support and policy information.

**Administrative Features**

1. Secure administrator authentication.
2. Dashboard and business overview.
3. Product management.
4. Category and subcategory management.
5. Product variant management.
6. Inventory management.
7. Customer management.
8. Order management.
9. Delivery charge management.
10. Payment monitoring.
11. Discount and coupon management.
12. Review moderation.
13. Return request management.
14. Refund processing.
15. Store settings.
16. Basic reports and activity history.

### 3.2 Excluded Features

The initial release will not include:

- Multi-vendor marketplace.
- Native Android or iOS applications.
- Loyalty and reward points.
- AI-powered product recommendations.
- Automated courier API integration.
- Live GPS shipment tracking.
- Multi-currency payments.
- International shipping.
- Advanced business intelligence.
- Subscription-based orders.
- Automated product exchanges.
- Multiple administrator permission levels.
- Advanced promotional campaign engines.

### 3.3 Release Boundaries

The initial release will operate with:

- One store.
- One currency: BDT.
- One primary administrator role.
- Bangladesh-only delivery.
- A configurable delivery charge system.
- One coupon per order.
- Manual shipment status updates.
- SSLCOMMERZ for enabled bKash, Nagad, and Rocket channels.
- Store-managed Cash on Delivery (COD).

The initial-release baseline requires verified bKash, Nagad, and Rocket through SSLCOMMERZ, plus COD. Hide inactive channels in every environment, but do not treat hiding as completion of a required method. Production launch is blocked until all three online channels pass activation and payment acceptance. A release with fewer channels requires an explicitly approved scope change to PRD and its acceptance checklist, followed by updates to Design, Architecture, Plan, and Tasks.

---

## 4. Product Categories

Initial categories will include:

| Category | Example Products |
| --- | --- |
| Cricket | Bats, Balls, Gloves, Helmets |
| Football | Footballs, Boots, Jerseys |
| Badminton | Rackets, Shuttlecocks, Nets |
| Fitness | Dumbbells, Yoga Mats, Gym Accessories |
| Sportswear | Jerseys, Shorts, Tracksuits |
| Accessories | Sports Bags, Water Bottles |

**Category Rules:**

- Administrators can create, edit, and deactivate categories.
- Categories may contain subcategories.
- Products must belong to at least one active category.
- Categories containing products cannot be permanently deleted without reassignment.
- Inactive categories must not appear in public navigation.

---

## 5. Functional Requirements

### FR-01: Customer Authentication

**Description:** Customers can securely register, log in, and manage their accounts.

**Requirements:**

- Registration using name, email, and password.
- Unique email address per account.
- Login using email and password.
- Secure logout.
- Forgot password functionality.
- Password reset through a time-limited, single-use email link.
- Secure password hashing.
- Secure session management.
- Session expiration and revocation.
- Rate limiting on authentication endpoints.
- Protection against unauthorized account access.

**Business Rules:**

- Public registration creates customer accounts only.
- Administrator accounts cannot be created through public registration.
- Password reset invalidates the used reset token.
- Suspended accounts cannot access authenticated features.
- Sensitive account changes require appropriate authentication.

**Priority:** High

### FR-02: Customer Profile Management

**Description:** Registered customers can manage personal information and account-related activities.

**Requirements:**

- View and update name and phone number.
- View and update email through a verification process.
- Change password.
- Add, edit, and delete saved delivery addresses.
- Select a default delivery address.
- View order history.
- View wishlist.
- View submitted reviews.
- View return and refund history.

**Business Rules:**

- Customers can access only their own account data.
- Existing order records retain the delivery information captured at checkout.
- Account changes must not modify historical order records.

**Priority:** High

### FR-03: Homepage

**Description:** The homepage introduces the store and highlights available products.

**Requirements:**

- Store logo and navigation.
- Product search bar.
- Promotional banner.
- Featured products.
- New arrivals.
- Discounted products.
- Product categories.
- Cart and wishlist indicators.
- Account navigation.
- Contact information and a customer complaint channel.
- Footer with policy links.

**Priority:** High

### FR-04: Product Catalog

**Description:** Customers can browse and discover products.

**Requirements:**

- Responsive product grid.
- Category and subcategory browsing.
- Search by product name and relevant keywords.
- Price range filtering.
- Availability filtering.
- Sorting by newest, price ascending, and price descending.
- Product images, prices, and ratings.
- Pagination.
- Clear empty-result messages.
- Search and filter reset options.
- Product-specific URLs using unique slugs.

**Business Rules:**

- Inactive products are excluded from public listings.
- Out-of-stock products may remain visible but cannot be purchased.
- Search results must respect product visibility and availability rules.

**Priority:** High

### FR-05: Product Details

**Description:** Customers can view detailed product information before purchasing.

**Requirements:**

- Product name.
- Product description.
- Multiple images.
- Regular price.
- Sale price, when applicable.
- Category and subcategory.
- Product variants.
- Stock availability.
- Quantity selector.
- Add to Cart.
- Add to Wishlist.
- Average rating.
- Review count.
- Customer reviews.
- Return eligibility information.
- Related products.

**Business Rules:**

- Customers must select required variants before adding products to the cart.
- Quantity cannot exceed available stock.
- Product prices and stock availability must be validated again at checkout.

**Priority:** High

### FR-06: Product Variants

**Description:** Products may contain purchasable variations such as size, color, or weight.

**Requirements:**

- Support configurable variant attributes.
- Assign a unique SKU to each purchasable variant.
- Maintain variant-specific stock.
- Support variant-specific prices when necessary.
- Display available variant combinations.
- Disable unavailable combinations.
- Preserve selected variants in cart and order records.

**Business Rules:**

- Duplicate SKU values are not allowed.
- Variant stock is managed independently.
- Deactivated variants cannot be newly purchased.
- Existing orders retain their original variant information.

**Priority:** High

### FR-07: Shopping Cart

**Description:** Customers can manage products before checkout.

**Requirements:**

- Add products to cart.
- Remove products.
- Update quantities.
- Display selected variants.
- Calculate item totals and subtotal.
- Display cart item count.
- Preserve guest carts locally.
- Preserve registered customer carts across sessions.
- Merge eligible guest cart items after login.
- Revalidate prices and stock before checkout.

**Business Rules:**

- Adding a product to the cart does not reserve stock.
- Unavailable items must be identified before checkout.
- Cart totals are estimates until server-side checkout validation.
- Cart merging must not create duplicate variant entries.

**Priority:** High

### FR-08: Wishlist

**Description:** Registered customers can save products for later purchases.

**Requirements:**

- Add products to wishlist.
- Remove products from wishlist.
- View saved products.
- Add wishlist products to cart.
- Prevent duplicate wishlist entries.
- Persist wishlist across sessions.

**Business Rules:**

- Authentication is required.
- Adding a product to the wishlist does not reserve stock.
- Inactive or unavailable products must be clearly identified.

**Priority:** High

### FR-09: Discounts and Coupons

**Description:** Customers can receive product discounts and promotional coupon discounts.

**Requirements:**

- Product-specific sale prices.
- Percentage-based coupons.
- Fixed-amount coupons.
- Coupon code validation.
- Start and expiration dates.
- Minimum eligible purchase amount.
- Overall usage limits.
- Per-customer usage limits.
- Coupon activation and deactivation.
- Discount calculation during checkout.
- Clear invalid coupon messages.

**Business Rules:**

- Product sale prices are applied before coupon discounts.
- Only one coupon may be used per order.
- Coupon eligibility is calculated using the discounted product subtotal.
- Delivery charges are excluded from coupon calculations.
- Percentage coupons apply to eligible product amounts only.
- Discounts cannot reduce the eligible product subtotal below zero.
- Currency calculations must use consistent decimal rounding.
- Online coupon usage is held during payment and confirmed after verified payment.
- Failed, cancelled, or expired unpaid attempts release only eligible held coupon usage, once; never release capacity still required by another active attempt or an already-paid order.
- Accepted COD orders confirm coupon usage; eligible cancellations release it once.
- Completed orders that are later refunded, and orders closed for non-delivery after dispatch, do not automatically restore coupon usage.
- Concurrent redemption attempts must respect configured usage limits.
- Coupons with per-customer limits require a registered customer account. Guests may use coupons without per-customer limits, subject to global limits and all other eligibility rules. Checkout email alone is not a verified customer identity.
- Editing or deactivating a coupon does not rewrite an accepted order. Existing live holds retain their quoted terms until expiry; expired holds require current eligibility and capacity checks before payment retry.

**Priority:** High

### FR-10: Reviews and Ratings

**Description:** Eligible customers can submit feedback on purchased products.

**Requirements:**

- Ratings from 1 to 5 stars.
- Written reviews.
- Verified purchase identification.
- Average rating calculation.
- Total review count.
- Review editing.
- Admin moderation.
- Review approval and rejection.
- Display approved reviews only.

**Business Rules:**

- Reviews require an authenticated customer account.
- A qualifying delivered purchase is required to submit a verified review.
- Each customer may maintain one active review per product.
- Customers can edit their own reviews.
- Edited reviews return to moderation when necessary.
- Cancelled purchases do not qualify.
- A fully returned and refunded purchase does not qualify for a new verified review unless another eligible purchase exists.
- Refunds do not automatically remove legitimate reviews. Apply the review moderation policy.
- Administrators cannot alter customer rating values while presenting them as customer-submitted reviews.
- Legitimate negative feedback must not be rejected solely because it is negative.

**Priority:** High

### FR-11: Checkout

**Description:** Customers can place orders using guest or registered checkout.

**Customer Information:**

- Full name.
- Phone number.
- Email address.
- Delivery address.
- District.
- City/Area.
- Optional order notes.

**Requirements:**

- Guest checkout.
- Registered customer checkout.
- Saved address selection.
- Delivery area selection.
- Delivery charge calculation.
- Coupon application.
- Order summary.
- Payment method selection.
- Final amount and applicable delivery deadline confirmation.
- Server-side validation.
- Unique order number generation.
- Duplicate submission prevention.
- Order confirmation.

**Business Rules:**

- Bangladesh phone numbers must be validated.
- Email is required for guest order verification and transactional notifications.
- Delivery charges are calculated from current administrative settings.
- Product prices, stock, discounts, and delivery charges are validated on the server.
- Checkout must reject unavailable delivery areas.
- Customers must accept the applicable store terms before submitting an order.
- An order stores the final pricing and delivery charge snapshot.

**Priority:** High

### FR-12: Payment System

**Description:** Customers can pay using supported Bangladesh payment methods.

**Required Payment Methods:**

- bKash.
- Nagad.
- Rocket.
- Cash on Delivery.

**Requirements:**

- Display available payment methods.
- Create payment sessions on the server.
- Use SSLCOMMERZ hosted checkout for online payments.
- Redirect to the provider's payment interface when required.
- Handle payment success, failure, cancellation, and pending states.
- Verify payments through SSLCOMMERZ validation or status APIs.
- Match order ID, unique transaction ID, amount, BDT currency, and payment status.
- Store provider transaction references.
- Support safe payment retries.
- Prevent duplicate payment initiation and repeated application of the same verified collection. Independently paid attempts remain recorded and resolved under the payment-correction rules.
- Process IPN independently of browser redirects.
- Verify IPN transactions on the server.
- Handle duplicate and out-of-order callbacks safely.
- Maintain payment attempt history.
- Check uncertain payments using SSLCOMMERZ status APIs.
- Flag unresolved payments for administrator review.
- Display payment status to customers and administrators.

**Payment Statuses:**

- Pending.
- Paid.
- Failed.
- Cancelled.
- Partially Refunded.
- Refunded.

**Business Rules:**

- Cash on Delivery orders are not marked Paid until payment collection is confirmed.
- Online orders are not marked Paid solely because a browser returns to a success page.
- Require verified SSLCOMMERZ confirmation before marking an online payment Paid.
- Hold risky payments (including risk_level=1) for review before fulfillment.
- Give each payment retry a unique transaction reference.
- Never create duplicate paid orders or reuse provider transaction IDs.
- Expired payment attempts must release eligible stock reservations.
- Payment records must preserve their original transaction history.
- Show bKash, Nagad, and Rocket only when enabled in the merchant account.
- Hide inactive payment channels.
- Verify live activation and channel limits before launch.

**Priority:** High

### FR-13: Inventory Reservation and Stock Management

**Description:** The platform must prevent overselling and maintain accurate stock records.

**Requirements:**

- Track stock by product variant.
- Validate available stock during checkout.
- Reserve stock for online payment attempts.
- Release expired or failed reservations.
- Commit stock allocation for accepted orders.
- Restore stock after eligible cancellations.
- Maintain inventory movement history.
- Prevent concurrent purchases from overselling available stock.

**Business Rules:**

- Adding products to the cart does not reserve stock.
- Online checkout creates a temporary stock reservation for 15 minutes.
- A verified payment converts eligible reservations into committed allocation once; confirmation additionally requires a non-cancelled order, valid inventory/coupon allocation, and cleared risk review.
- Failed, cancelled, or expired unpaid attempts release only eligible reservations, once; preserve allocation still required by another active attempt or an already-paid order.
- Recheck stock when payment arrives after reservation expiry.
- On late verified payment, record collection first. For an eligible non-cancelled order, atomically recheck inventory and coupon capacity; confirm only after allocation succeeds and risk review is cleared. If capacity is unavailable or risk review is pending, preserve Paid and hold fulfillment for authorized resolution/refund.
- A Cancelled order never reacquires allocation or reopens after late collection; record a payment-correction/refund obligation instead.
- Accepted COD orders commit stock allocation at order placement and remain Pending until administrator confirmation. Acceptance means the backend accepted the checkout; it does not mean fulfillment is Confirmed.
- Available stock = physical stock − reserved stock − committed stock.
- Cancellation releases committed stock only once.
- Shipment reduces physical and committed stock by the shipped quantity.
- Returned products are restocked only after inspection confirms they are resellable.
- Stock reservations, allocations, and adjustments must be atomic and idempotent.

**Priority:** High

### FR-14: Customer Order Management

**Description:** Customers can view and track their orders.

**Requirements:**

- View order history.
- View order details.
- Track order status.
- View payment status.
- View ordered products and quantities.
- View final order totals.
- Request eligible cancellation.
- Request eligible returns.
- View refund information.
- Display estimated delivery date and applicable deadline.

**Order Statuses:**

- Pending.
- Confirmed.
- Processing.
- Shipped.
- Delivered.
- Cancelled.

**Business Rules:**

- Pending orders may transition to Confirmed or Cancelled.
- Confirmed orders may transition to Processing or Cancelled.
- Processing orders may transition to Shipped or Cancelled through an authorized process.
- Shipped orders may transition to Delivered; failed deliveries require an administrative exception workflow.
- Delivered and Cancelled are terminal fulfillment states.
- Returns and refunds have separate statuses and do not overwrite the original fulfillment history.
- Invalid status transitions must be rejected.
- Payment confirmation and order confirmation are separate operations.
- Ordinary fulfillment never reopens a Cancelled order. A later verified payment remains recorded as collected and enters payment-correction/refund resolution without allocating stock or confirming the cancelled order.
- For a Shipped order that cannot be delivered, keep Shipped while a retry or investigation is active. An administrator may exceptionally close it as Cancelled only after recording final non-delivery and custody/disposition of every shipped quantity. This is a delivery-exception transition, not ordinary customer cancellation. Refund collected funds when eligible; restock only physically recovered, inspected resellable units.

**Priority:** High

### FR-15: Order Cancellation

**Description:** Customers can request cancellation of eligible orders.

**Requirements:**

- Display cancellation availability.
- Allow customers to submit cancellation requests.
- Require administrator approval or rejection of every customer cancellation request.
- Record cancellation reasons.
- Update order status.
- Restore eligible inventory.
- Initiate refunds when required.
- Notify customers of the result.

**Business Rules:**

- Customers may request cancellation before the order is Shipped.
- Pending and Confirmed orders are eligible for administrator-reviewed cancellation; submitting a request does not itself cancel or release allocation.
- Processing orders require administrator review and explicit confirmation that dispatch has not occurred. Recheck eligibility atomically when approving so concurrent shipment cannot be cancelled as unshipped.
- Shipped orders are handled through return or delivery-exception procedures rather than standard cancellation.
- Unpaid COD cancellations do not create monetary refunds.
- Paid online cancellations create eligible refund records.
- Inventory must not be restored more than once.

**Priority:** High

### FR-16: Delivery Management

**Description:** The store provides delivery throughout supported areas of Bangladesh.

**Delivery Target:**

- Target 14 calendar days after confirmation, or sooner when legally required.

**Requirements:**

- Delivery area configuration.
- Admin-controlled delivery charges.
- District/zone-based charge rules.
- Delivery availability validation.
- Estimated delivery date and applicable deadline display.
- Delivery address confirmation.
- Manual shipment status updates.
- Delivery completion recording.
- Failed delivery handling.

**Business Rules:**

- Delivery charges are configurable by administrators.
- Administrators can add, edit, activate, or deactivate delivery zones.
- Delivery charges may vary by location.
- Changes to delivery charges apply to new orders only.
- Confirmed orders retain their original delivery charge.
- The 14-day target does not override shorter legal deadlines.
- Verify current delivery deadlines, their scope, and calculation start events against current authority before launch; historical guideline summaries are not approved runtime policy.
- Flag orders at risk of delay.
- Contact the customer, record the reason, and provide an appropriate remedy.
- Notify customers when delivery estimates change.
- Log complaints and respond within the applicable period.
- Track complaint status and resolution.
- Verify the applicable complaint-response period before launch and record its current authoritative source.
- The store must not promise delivery to unsupported locations.
- For failed delivery, contact the customer and arrange a retry or suitable resolution.

**Priority:** High

### FR-17: Return Management

**Description:** Customers can request returns for eligible delivered products.

**Requirements:**

- Return request submission.
- Selection of eligible order items.
- Selection of return quantities.
- Return reason selection.
- Optional supporting image upload.
- Return status tracking.
- Administrator approval or rejection.
- Product receipt and inspection.
- Return history.

**Return Reasons:**

- Damaged product.
- Defective product.
- Incorrect product.
- Missing or incorrect item quantity.
- Incorrect size or variant.
- Product not as described.
- Other eligible reasons.

**Return Statuses:**

- Requested.
- Under Review.
- Approved.
- Rejected.
- Awaiting Return.
- Received.
- Inspected.
- Completed.

**Business Rules:**

- Standard return requests must be submitted within 7 calendar days after delivery.
- Incorrect, damaged, or defective items may qualify subject to the store policy and applicable consumer rights.
- Change-of-mind returns require unused items in original condition, with relevant accessories and packaging.
- Hygiene-sensitive or customized products may have restrictions where legally permitted.
- Supporting evidence may be requested but must not be used to unreasonably reject valid claims.
- The store bears reasonable return shipping costs for confirmed wrong, damaged, or defective deliveries.
- Customers normally bear return shipping costs for eligible change-of-mind returns.
- Duplicate active claims for the same order-item quantity are prohibited across both physical returns and shortage claims. Account for already resolved/refunded quantities when deciding remaining merchandise eligibility.
- Physical returns require receipt and inspection before refund approval.
- Missing items or short-delivered quantities use the same claim/review entry point but do not require returning goods the customer did not receive. Record the approved missing quantity and evidence; an approved shortage claim may create a refund obligation directly. Do not create receipt, inspection, or restock events for missing goods.
- Cancellations and payment corrections do not require product inspection.
- Statutory customer rights take precedence over restrictive store policy terms.

**Priority:** High

### FR-18: Refund Management

**Description:** Eligible customers can receive full or partial refunds.

**Requirements:**

- Full refunds.
- Partial refunds.
- Refund requests.
- Refund approval.
- Refund amount calculation.
- Initiate and track SSLCOMMERZ refunds where supported.
- Manual refund processing.
- Refund transaction history.
- Refund status tracking.
- Failed refund handling.
- Duplicate refund prevention.
- Customer notifications.

**Refund Statuses:**

- Requested.
- Under Review.
- Approved.
- Rejected.
- Processing.
- Completed.
- Failed.

**Business Rules:**

- Refunds require a qualifying cancellation, inspected physical return, approved missing-item/shortage claim, or documented payment correction.
- Refunds use original paid prices, allocated discounts, and eligible item quantities.
- Partial merchandise refunds apply only to eligible items and quantities. Payment corrections, including duplicate collections, may refund excess collected money without consuming merchandise-return quantities.
- Record every independently verified collection, including multiple paid attempts on one order. Fulfill and allocate once. Refunds must identify their source collection; remaining capacity is enforced both per collection and for the order. Refunding an excess collection does not by itself mean the purchased merchandise was refunded.
- Delivery charges are refundable when required by the approved policy or applicable law.
- Remaining refundable balance accounts for pending and completed refunds.
- Total completed and pending refund commitments must not exceed the refundable payment balance.
- Refund to the original channel when supported.
- Otherwise, obtain customer consent and verify the manual transfer.
- Manual refunds require verified transfer details and administrator confirmation.
- COD refunds are processed through an agreed verified method, such as bKash, Nagad, Rocket, or bank transfer.
- A COD refund cannot be completed unless the original payment was collected.
- Target refunds within 7 business days of approval, unless law requires sooner.
- Track provider delays and inform customers.
- Mark refunds Completed only after confirmed payout.
- Gateway acceptance of a refund request is not proof of payment.
- Failed refunds remain visible for authorized retry or investigation.
- All refund actions must be auditable.
- Customers must be informed of approval, rejection, and completion.

**Priority:** High

### FR-19: Guest Order Access

**Description:** Guest customers can securely access order information without creating accounts.

**Requirements:**

- Order lookup using order number and registered email.
- Email-based one-time verification code or secure access link.
- View order status.
- View payment status.
- Request eligible cancellation.
- Submit eligible return requests.
- Track refunds.
- Expiration and rate limiting for verification attempts.

**Business Rules:**

- Order number alone is insufficient to access customer information.
- Guest access must verify control of the checkout email.
- Verification links and codes must expire.
- Guest customers may access only their own verified orders.

**Priority:** High

### FR-20: Notifications

**Description:** Customers receive important account and order updates.

**Notification Events:**

- Account registration.
- Password reset.
- Order confirmation.
- Payment success or failure.
- Order cancellation.
- Shipment update.
- Delivery completion.
- Return request update.
- Refund approval or rejection.
- Refund completion.

**Requirements:**

- Transactional email notifications.
- Clear order or transaction references.
- Notification delivery status tracking.
- Retry handling for temporary failures.
- No duplicate customer notifications for repeated payment callbacks.

**Business Rules:**

- Transactional notifications are separate from marketing messages.
- Notification failure must not reverse a successfully completed business transaction.
- Sensitive payment credentials must never appear in notifications.

**Priority:** High

### FR-21: Admin Authentication

**Description:** Only authorized administrators can access store management functionality.

**Requirements:**

- Secure administrator login.
- Protected administrative routes.
- Server-side authorization.
- Secure sessions.
- Password recovery.
- Logout.
- Authentication rate limiting.
- Administrative activity logging.

**Business Rules:**

- No public administrator registration.
- Initial administrator access must be provisioned securely.
- Administrative operations require server-side permission checks.
- Refund and payment actions require authenticated administrator authorization.

**Priority:** High

### FR-22: Admin Dashboard

**Description:** Administrators can monitor store activity.

**Dashboard Metrics:**

- Total active products.
- Total registered customers.
- Total orders.
- Pending orders.
- Confirmed orders.
- Delivered orders.
- Cancelled orders.
- Paid collections.
- Outstanding COD collections.
- Completed refunds.
- Net collected revenue.
- Low-stock products.
- Recent orders.
- Pending return requests.

**Metric Definitions:**

- Gross merchandise value: purchase-time pre-discount merchandise value of accepted non-cancelled orders in the selected order-placement period. Product and coupon discounts are reported separately.
- Paid collections: verified receipts by collection date, including separately identified overpayments.
- Completed refunds: verified payouts by completion date; distinguish merchandise refunds from payment corrections.
- Net collected revenue: collections minus completed refunds within the selected cash-flow period; this is not profit.
- Outstanding COD and pending refunds: balances as of the displayed cutoff, not period revenue.
- Reports identify their date basis, timezone, cutoff, and treatment of cancellations and corrections. Use Asia/Dhaka for business reporting; technical timestamp storage is defined in `DATABASE.md`.

**Reporting Rules:**

- Gross merchandise value, discounts, paid collections, refunds, and net collections must be reported separately.
- COD amounts are not considered collected revenue before collection confirmation.
- Completed refunds reduce net collected revenue.
- Pending refunds are shown separately.

**Priority:** High

### FR-23: Product Management — Admin

**Requirements:**

- Add products.
- Edit products.
- Deactivate products.
- Upload multiple images.
- Assign categories.
- Manage descriptions.
- Configure regular and sale prices.
- Manage product variants.
- Configure featured products.
- Manage product visibility.
- Maintain unique product slugs.

**Priority:** High

### FR-24: Category Management — Admin

**Requirements:**

- Create categories.
- Edit categories.
- Manage subcategories.
- Configure category images.
- Activate or deactivate categories.
- Prevent destructive deletion of categories with dependent products.

**Priority:** High

### FR-25: Inventory Management — Admin

**Requirements:**

- View available stock.
- View reserved stock.
- View committed stock.
- Update inventory quantities.
- View low-stock alerts.
- View stock movement history.
- Record stock adjustments.
- Review returned stock before restocking.

**Priority:** High

### FR-26: Order Management — Admin

**Requirements:**

- View all orders.
- Search by order number.
- Filter by status.
- View customer and delivery information.
- View purchased items.
- View payment status.
- Confirm COD orders.
- Update fulfillment status.
- Record shipment information.
- Handle cancellation requests.
- Handle delivery exceptions.
- Record and resolve customer complaints.
- Access associated returns and refunds.

**Priority:** High

### FR-27: Customer Management — Admin

**Requirements:**

- View registered customers.
- Search customers.
- View customer order history.
- View return and refund history.
- Suspend or reactivate accounts.
- Restrict sensitive information access.

**Priority:** Medium

### FR-28: Delivery Charge Management — Admin

**Description:** Administrators can control delivery pricing and availability.

**Requirements:**

- Create delivery zones.
- Assign districts or areas to zones.
- Configure delivery charges.
- Edit delivery charges.
- Activate or deactivate delivery zones.
- Configure delivery availability.
- View current delivery rules.

**Business Rules:**

- Delivery charges are controlled by administrators.
- Updated charges apply to future orders.
- Existing orders preserve their original charges.
- Delivery charges must never be negative.
- Checkout must use the active delivery charge rule for the selected location.

**Priority:** High

### FR-29: Payment Management — Admin

**Requirements:**

- View payment records.
- Search by transaction reference.
- Filter by payment method and status.
- Review failed or pending payments.
- View payment attempt history.
- Verify payment reconciliation results.
- Record COD collection.
- View associated refunds.

**Priority:** High

### FR-30: Coupon Management — Admin

**Requirements:**

- Create coupons.
- Edit coupons.
- Configure percentage or fixed discounts.
- Set minimum order value.
- Configure start and expiration dates.
- Configure usage limits.
- Activate or deactivate coupons.
- View redemption history.

**Priority:** High

### FR-31: Review Management — Admin

**Requirements:**

- View customer reviews.
- Approve reviews.
- Reject reviews.
- Hide inappropriate content.
- Record moderation decisions.
- Prevent unauthorized review manipulation.

**Priority:** High

### FR-32: Return Management — Admin

**Requirements:**

- View return requests.
- Verify eligibility.
- Review reasons and evidence.
- Approve or reject requests.
- Record rejection reasons.
- Record product receipt.
- Record inspection results.
- Update return statuses.
- Determine restocking eligibility.
- Initiate related refund processing.

**Priority:** High

### FR-33: Refund Management — Admin

**Requirements:**

- View refund requests.
- Review original payment details.
- Calculate refundable balances.
- Approve or reject refunds.
- Process full refunds.
- Process partial refunds.
- Initiate supported provider refunds.
- Record manual refunds.
- Track refund attempts.
- Resolve failed refunds.
- Maintain refund audit history.

**Priority:** High

### FR-34: Store Settings — Admin

**Requirements:**

- Manage store name and branding.
- Manage contact information.
- Configure store address.
- Manage delivery settings.
- Configure low-stock threshold.
- Manage shipping policy content.
- Manage cancellation policy content.
- Manage return and refund policy content.
- Manage customer support information and complaint contact details.

**Priority:** Medium

---

## 6. Business Rules and Policies

### 6.1 Pricing Rules

FR-09 and FR-11 govern pricing. The business formula is:

`Final Total = Product Subtotal − Product Discounts − Coupon Discount + Delivery Charge`

Allocate coupon discounts proportionally across eligible items and distribute rounding remainders consistently. For example, a BDT 100 coupon against eligible items worth BDT 600 and BDT 400 allocates BDT 60 and BDT 40. The first item's net merchandise value is BDT 540. Refunds use those original allocations, not current prices. Technical numeric representation belongs in Architecture §7.3; the exact allocation algorithm and fields belong in `DATABASE.md` and implementation contracts.

### 6.2 Policy Ownership

| Policy | Authoritative requirements |
| --- | --- |
| Delivery coverage, charges, deadlines, exceptions | FR-16 and FR-28 |
| Cancellation review, eligibility, fulfillment, late collection | FR-14 and FR-15 |
| Physical returns and non-physical shortage claims | FR-17 |
| Refund eligibility, quantities, source balances, payout and timing | FR-18 |
| Verified-review eligibility and moderation | FR-10 |
| Coupon eligibility, account requirements, capacity and restoration | FR-09 |

Use the referenced requirements when implementing or changing policy. This index does not define a second copy of each rule.

---

## 7. User Flows

### 7.1 Registration

Home → Register → Enter Details → Create Account → Login → Customer Account

### 7.2 Product Purchase

Browse Products → Product Details → Select Variant → Add to Cart → Checkout → Apply Coupon → Select Delivery Area → Select Payment → Place Order → Confirmation

### 7.3 Online Payment

Checkout → Create Pending Order → Reserve Stock → SSLCOMMERZ Hosted Checkout → IPN/Transaction Validation → Risk Check → Confirm Order → Send Notification

**Failure Flow:**

Payment Failed/Expired → Update Attempt → Release Reservation → Allow Safe Retry

### 7.4 Cash on Delivery

Checkout → Select COD → Validate Stock → Accept Pending Order and Commit Stock/Coupon → Admin Confirmation → Processing → Shipment → Delivery → Confirm Payment Collection

### 7.5 Wishlist

Login → Browse Products → Add to Wishlist → Wishlist → Add to Cart

### 7.6 Product Review

Login → Delivered Purchase → Select Product → Submit Review → Admin Moderation → Publish

### 7.7 Cancellation

Order Details → Request Cancellation → Eligibility Check → Admin Review and Current Eligibility Check → Cancel Order → Release Stock → Refund if Paid

### 7.8 Return Request

Delivered Order → Select Items → Provide Reason → Submit Request → Admin Review → Return Shipment → Inspection → Resolution

### 7.9 Refund Processing

Eligible Cancellation / Inspected Return / Approved Shortage / Payment Correction → Calculate Refund → Admin Approval → Process Payout → Verify Transfer → Complete Refund

### 7.10 Guest Order Access

Order Lookup → Enter Order Number and Email → Verify Access → View Order → Eligible Order Actions

### 7.11 Admin Order Processing

Admin Login → Orders → Review Order → Confirm → Process → Ship → Mark Delivered

### 7.12 Payment Exception

Payment Callback Missing/Uncertain → Query SSLCOMMERZ Transaction Status → Verify Amount/Currency/Risk → Reconcile Transaction → Update Status or Flag for Admin Resolution

---

## 8. Application Pages

### 8.1 Customer Pages

| Page | Description |
| --- | --- |
| Home | Store homepage |
| Products | Product catalog |
| Category | Category-specific products |
| Product Details | Product information |
| Login | Customer login |
| Register | Account registration |
| Forgot Password | Password recovery |
| Reset Password | Password reset |
| Cart | Shopping cart |
| Wishlist | Saved products |
| Checkout | Delivery and payment |
| Payment Result | Payment outcome |
| Order Confirmation | Order summary |
| Order Lookup | Secure guest order access |
| My Account | Customer dashboard |
| Profile | Profile management |
| Addresses | Saved addresses |
| My Orders | Order history |
| Order Details | Order tracking |
| My Reviews | Review management |
| Return Request | Return submission |
| My Returns | Return history |
| Refund Details | Refund tracking |
| Contact | Store contact |
| Shipping Policy | Delivery information |
| Return & Refund Policy | After-sales policies |
| Privacy Policy | Data handling information |
| Terms & Conditions | Store terms |

### 8.2 Admin Pages

| Page | Description |
| --- | --- |
| Admin Login | Authentication |
| Dashboard | Store overview |
| Products | Product management |
| Add/Edit Product | Product configuration |
| Categories | Category management |
| Inventory | Stock management |
| Orders | Order management |
| Order Details | Order processing |
| Customers | Customer management |
| Delivery Settings | Delivery zones and charges |
| Payments | Payment records |
| Coupons | Coupon management |
| Reviews | Review moderation |
| Returns | Return management |
| Refunds | Refund processing |
| Reports | Basic business reports |
| Store Settings | Store configuration |

---

## 9. Roles and Permissions

| Feature | Guest | Customer | Admin |
| --- | --- | --- | --- |
| Browse Products | Yes | Yes | Yes |
| Search and Filter | Yes | Yes | Yes |
| Shopping Cart | Yes | Yes | — |
| Checkout | Yes | Yes | — |
| Wishlist | No | Own | — |
| Profile Management | No | Own | — |
| Order History | Verified Guest Order | Own | All |
| Product Reviews | Read | Eligible Purchases | Moderate |
| Cancellation | Verified Eligible Order | Own Eligible Orders | Manage |
| Returns | Verified Eligible Order | Own Eligible Orders | Manage |
| Refund Tracking | Verified Own Order | Own | All |
| Product Management | No | No | Yes |
| Inventory Management | No | No | Yes |
| Delivery Charges | No | No | Yes |
| Coupon Management | No | No | Yes |
| Refund Processing | No | No | Yes |
| Store Settings | No | No | Yes |

**Authorization Rules:**

- All protected actions require server-side authorization.
- Customers cannot access other customers' records.
- Guest order access requires verification.
- Administrative access cannot be obtained by modifying client-side requests.

---

## 10. Data Requirements

| Entity | Important Fields |
| --- | --- |
| User | ID, Name, Email, Password Hash, Phone, Role, Status |
| Session | ID, User ID, Expiration, Revocation Status |
| Address | ID, User ID, Recipient, Phone, District, Area, Address |
| Category | ID, Name, Slug, Parent ID, Status |
| Product | ID, Name, Slug, Description, Images, Category, Status |
| Product Variant | ID, Product ID, SKU, Attributes, Price, Sale Price, Physical Stock |
| Cart | User/Guest Identifier, Items, Quantities |
| Wishlist | User ID, Product IDs |
| Order | ID, Order Number, User ID (optional), Customer Snapshot, Delivery Snapshot, Delivery Deadline, Totals, Payment Status, Status |
| Order Item | ID, Order ID, Product Name, SKU, Variant Snapshot, Unit Price, Allocated Discount, Quantity |
| Payment | ID, Order ID, Method, Provider, Paid Amount, Status |
| Payment Attempt | ID, Payment ID, Transaction ID, Validation Reference, Amount, Currency, Status, Expiration |
| Coupon | ID, Code, Type, Value, Validity, Limits |
| Coupon Redemption | ID, Coupon ID, Order ID, User ID (optional), Status, Expiration |
| Inventory Reservation | ID, Variant ID, Order ID, Quantity, Expiration, Status |
| Inventory Movement | ID, Variant ID, Type, Quantity, Reference, Timestamp |
| Review | ID, User ID, Product ID, Rating, Comment, Status |
| Return Request | ID, Order ID, Customer ID (optional), Claim Type (physical return or shortage), Reason, Status |
| Return Item | ID, Return ID, Order Item ID, Requested Qty, Approved Qty, Inspection Result |
| Refund | ID, Order ID, Payment ID, Items/Quantities, Amount, Method, Status |
| Refund Attempt | ID, Refund ID, Provider Reference, Status, Failure Reason |
| Delivery Zone | ID, Name, Districts/Areas, Status |
| Delivery Charge | ID, Zone ID, Amount, Effective Status |
| Notification | ID, Recipient, Event, Channel, Status |
| Complaint | ID, Order ID (optional), Contact, Issue, Status, Resolution, Created At |
| Audit Log | ID, Actor, Action, Target, Timestamp |
| Store Settings | Store Details, Policies, Operational Configuration |

### 10.1 Data Integrity Rules

- User emails must be unique.
- Product slugs must be unique.
- Variant SKUs must be unique.
- Order numbers must be unique.
- Payment references must be unique within their provider scope.
- Historical order snapshots must remain stable.
- Pending and completed refunds cannot exceed the collected payment amount.
- Reservations and allocations cannot exceed physical stock.
- Financial operations must be idempotent.
- Important administrative actions must be recorded.
- Guest orders use optional user IDs and verified order references.
- Order item quantities must be positive; invalid status changes are rejected.

### 10.2 Data Retention

- Completed order and payment records must be preserved for the applicable operational and legal retention period.
- Sensitive customer information must be protected.
- Customer account deletion requests must be handled without improperly destroying legally required transaction records.
- Unused uploaded images should be cleaned up safely.
- Backups must be protected against unauthorized access.

---

## 11. State Management and Edge Cases

### 11.1 Order Lifecycle

Pending → Confirmed → Processing → Shipped → Delivered

Eligible orders may transition to Cancelled before shipment.

Delivery failures require an exception record and administrator resolution.

### 11.2 Payment Lifecycle

These are business summary states, not a complete provider-attempt state machine. A verified late collection must still be recorded after an earlier Failed/Cancelled attempt signal; it never reopens cancelled fulfillment. Multiple collections and payment-correction refunds must remain visible even when the merchandise payment remains Paid. Architecture §10 defines orchestration; `DATABASE.md` will define exact aggregate and attempt fields.

Pending → Paid

Pending → Failed

Pending → Cancelled

Paid → Partially Refunded

Paid/Partially Refunded → Refunded

Each retry is tracked as a separate payment attempt without duplicating the underlying order.

### 11.3 Return Lifecycle

Requested → Under Review → Approved → Awaiting Return → Received → Inspected → Completed

Physical returns may transition to Rejected after review. Non-physical shortage claims follow Requested → Under Review → Approved → Completed, or Rejected; claim completion and refund completion remain distinct.

### 11.4 Refund Lifecycle

Requested → Under Review → Approved → Processing → Completed

Requests may be Rejected during review.

Processing may transition to Failed, followed by authorized retry or investigation.

### 11.5 Required Exception Handling

The system must handle:

- Payment timeout.
- Missing payment callback.
- Duplicate payment notification.
- Payment success after reservation expiry.
- Simultaneous purchase of the final stock unit.
- Duplicate checkout submission.
- Coupon usage-limit race conditions.
- Cancellation during processing.
- Partial order returns.
- Multiple refunds against one payment.
- Refund API failure.
- COD payment not collected.
- Invalid guest order access.
- Delivery delays and failed delivery.
- Failed delivery follows FR-14/FR-16: retry while Shipped, or documented final non-delivery closure with custody, refund, and inspected-restock handling.
- Email notification failure.
- Administrator retry of a previously completed action.

These conditions must not create duplicate orders, apply the same collection twice, produce negative stock, grant unauthorized access, or inflate refundable balances. Independently collected attempts must all remain recorded; any excess enters the payment-correction process without duplicate fulfillment.

---

## 12. Non-Functional Requirements

### 12.1 Performance

- Mobile-first performance optimization.
- Optimized product images.
- Pagination for large product lists.
- Efficient database queries.
- Appropriate caching.
- Minimized unnecessary API calls.
- Performance testing for browsing and checkout. Before release testing, agree measurable latency/load and user-experience budgets against representative catalog size, concurrency, devices, and network conditions; record the approved profile in `TESTING.md`. This baseline does not invent capacity or latency targets.

### 12.2 Security

- HTTPS for production traffic.
- Secure password hashing.
- HTTP-only secure authentication cookies where applicable.
- Session expiration and revocation.
- CSRF protection where applicable.
- Server-side input validation.
- Authentication rate limiting.
- Role and ownership authorization.
- Validate SSLCOMMERZ payments on the server.
- Separate sandbox and live credentials.
- Use valid TLS and protect merchant secrets.
- Refund authorization.
- Idempotent financial operations.
- Secrets stored outside source code.
- Protection against common OWASP web vulnerabilities.
- Audit logging for sensitive operations.

### 12.3 Reliability

- Production monitoring.
- Error tracking.
- Automated database backups.
- Periodic restoration testing.
- Safe payment and refund retries.
- Consistent inventory operations.
- Graceful error handling.
- Recovery from interrupted transactions.

### 12.4 Availability

- The website and order-processing services should remain continuously available under normal conditions.
- Planned maintenance should be minimized.
- Availability and downtime should be monitored.
- A formal uptime target will be agreed based on the selected infrastructure and service budget.

### 12.5 Responsive Design

The application must support:

- Mobile phones.
- Tablets.
- Laptops.
- Desktop computers.

### 12.6 Accessibility

- Keyboard-accessible controls.
- Clear form labels.
- Accessible error messages.
- Sufficient color contrast.
- Alternative text for meaningful images.
- WCAG 2.2 AA as the accessibility target.

### 12.7 Browser Compatibility

The platform should support current stable versions of:

- Google Chrome.
- Mozilla Firefox.
- Microsoft Edge.
- Brave.
- Safari.

### 12.8 Data Protection

- Customer data access must be restricted.
- Payment credentials must not be stored directly.
- Sensitive logs must be protected.
- Backup access must be limited.
- Customer-facing privacy information must be available.

---

## 13. Technical Constraints and Ownership

The product requires a responsive customer storefront, separate administrative interface, secure backend, BDT accounting, enabled SSLCOMMERZ-hosted channels, and store-managed COD. Chosen frameworks, persistence, session design, media, email, and deployment topology are defined in Architecture §§2–14. This PRD does not maintain a competing technology table.

Provider activation and refund support remain merchant-specific release dependencies; a selected vendor does not establish operational readiness.

---

## 14. Acceptance Criteria

### 14.1 Customer Features

- [ ] Customers can register, log in, and reset passwords.
- [ ] Customers can manage profiles and addresses.
- [ ] Guests can place orders without creating accounts.
- [ ] Guests can access only their own orders after email verification.
- [ ] Product browsing, search, filtering, and sorting work.
- [ ] Product variants and stock are handled correctly.
- [ ] Shopping carts persist appropriately.
- [ ] Wishlists work across sessions.
- [ ] Product discounts calculate correctly.
- [ ] Concurrent coupon use respects limits; expired holds are released.
- [ ] Eligible customers can submit reviews.
- [ ] Reviews are moderated appropriately.
- [ ] Checkout calculates accurate order totals.
- [ ] Customers can place COD orders.
- [ ] bKash payments work through approved integration.
- [ ] Nagad payments work through approved integration.
- [ ] Rocket payments work through approved integration.
- [ ] Online payments are verified server-side.
- [ ] Payment retries create no duplicate orders or repeated effects for the same collection; independently paid attempts remain recorded and excess collections enter correction/refund resolution.
- [ ] Customers can view order status.
- [ ] Customers can request eligible cancellations.
- [ ] Customers can request eligible returns.
- [ ] Physical returns are inspected before related refunds are approved; approved missing-item/shortage claims do not require a fictional physical return.
- [ ] Guest coupon eligibility respects the account requirement for per-customer limits.
- [ ] COD placement commits allocation once and remains Pending until administrator confirmation.
- [ ] Customers can track refund status.
- [ ] Customers receive important transactional notifications.

### 14.2 Admin Features

- [ ] Administrator authentication is secure.
- [ ] Products and variants can be managed.
- [ ] Categories can be managed.
- [ ] Physical, reserved, committed, and available stock remain consistent.
- [ ] Delivery zones can be configured.
- [ ] Delivery charges can be changed.
- [ ] Updated charges apply only to future orders.
- [ ] Orders can be managed.
- [ ] Customer complaints can be recorded and resolved.
- [ ] COD collections can be recorded.
- [ ] Payment records can be reviewed.
- [ ] Coupons can be managed.
- [ ] Reviews can be moderated.
- [ ] Return requests can be processed.
- [ ] Full and partial refunds can be processed.
- [ ] Refund history is preserved.
- [ ] Dashboard metrics account for refunds and COD.
- [ ] Sensitive administrative actions are logged.

### 14.3 Reliability and Security

- [ ] Duplicate checkout submissions do not create duplicate orders.
- [ ] Concurrent purchases cannot oversell stock.
- [ ] Expired payment reservations are released.
- [ ] Duplicate payment callbacks do not duplicate financial effects.
- [ ] Combined pending and completed refunds never exceed the collected payment.
- [ ] Duplicate refunds are prevented.
- [ ] Partial refunds use original item prices, discounts, and quantities.
- [ ] Unauthorized users cannot access protected data.
- [ ] Invalid order status transitions are rejected.
- [ ] Core customer and admin workflows pass functional testing.
- [ ] SSLCOMMERZ IPN and browser-return paths are independently reconciled with validated provider status.
- [ ] Payment validation rejects mismatched transaction reference, amount, currency or merchant account.
- [ ] Risk-flagged transactions remain on hold pending authorized review.
- [ ] Late verified payments recheck inventory and coupon capacity only for eligible non-cancelled orders; unavailable capacity holds fulfillment for refund or admin resolution.
- [ ] A verified payment after cancellation is recorded without reopening fulfillment.
- [ ] Duplicate collections remain recorded and can be refunded against their own source balance without duplicating fulfillment.
- [ ] Final failed-delivery closure records custody/disposition; only recovered inspected resellable goods are restocked.
- [ ] Refund initiation and verified refund completion are recorded as distinct events.
- [ ] COD payment remains unpaid until collection is verified.
- [ ] Checkout shows applicable delivery deadlines; complaints receive a tracked response.
- [ ] Payment and refund sandbox tests pass.
- [ ] Database backup and restore procedures are verified.
- [ ] Production services use HTTPS.
- [ ] Website functions across supported devices and browsers.

---

## 15. Delivery Planning

`IMPLEMENTATION_PLAN.md` §§5–7 owns the twelve-phase roadmap, dependencies, work packages, and milestone gates. `TASKS.md` owns task execution status and evidence. Product scope and acceptance remain governed by this PRD.

### 15.1 Development Approach

Deliver and verify features incrementally. Confirm provider feasibility early, use isolated test environments, and review required milestone evidence before release. Scope changes update the product source before dependent plans.

### 15.2 Timeline

Dates depend on capacity, approved content, provider access, and agreed milestones. No delivery dates or completed implementation are claimed here.

---

## 16. Success Metrics

| Metric | Measurement |
| --- | --- |
| Order Completion Rate | Successful orders compared with checkout attempts |
| Payment Success Rate | Verified successful payments compared with payment attempts |
| Checkout Failure Rate | Failed checkout attempts |
| Inventory Accuracy | Recorded stock compared with verified physical stock |
| Delivery Performance | Orders delivered within their applicable promised deadline |
| Refund Processing Time | Time from approval to completed refund |
| Refund Failure Rate | Failed refund attempts |
| Coupon Usage | Successful coupon redemptions |
| Review Participation | Eligible customers submitting reviews |
| Application Availability | Monitored uptime |
| Order Processing Accuracy | Orders completed without operational correction |

Targets will be established after initial operational data is available.

---

## 17. Future Enhancements

Potential future features:

- Loyalty and reward points.
- Courier API integration.
- Live shipment tracking.
- Automated product exchanges.
- Advanced analytics.
- AI-based recommendations.
- Mobile applications.
- Multi-vendor marketplace.
- International delivery.
- Multi-currency payments.
- Advanced marketing automation.

---

## 18. Release, Handover, and Support

### 18.1 Release Requirements

Before production launch:

- Core acceptance criteria must pass.
- Payment methods must be tested and verified.
- Refund procedures must be tested.
- Administrator access must be configured.
- Delivery charges and zones must be configured.
- Store policies must be published.
- Production monitoring must be enabled.
- Backup and recovery procedures must be checked.
- Production checkout must be verified.

### 18.2 Project Handover

The final handover should include:

- Source code and repository access.
- Deployment configuration documentation.
- Environment variable documentation without exposing secrets.
- Administrator account handover.
- Database backup and restoration instructions.
- Payment-provider configuration documentation.
- Basic administration guide.
- Known limitations and operational dependencies.

### 18.3 Support and Maintenance

- Development defects identified during the agreed warranty period will be corrected under the project agreement.
- New features and scope changes require separate approval.
- Third-party service charges are excluded unless explicitly agreed.
- Ongoing maintenance responsibilities must be documented.
- Store ownership and control of production accounts must be established before handover.

---

## 19. Assumptions and Operational Dependencies

### 19.1 Confirmed Decisions

- Target market: Bangladesh.
- Currency: BDT.
- Payment methods: bKash, Nagad, Rocket, and Cash on Delivery.
- Online payment gateway: SSLCOMMERZ.
- Delivery charges: Controlled by administrators.
- Delivery planning target: Within 14 calendar days, subject to shorter applicable deadlines for prepaid orders.
- Customer authentication: Included.
- Wishlist: Included.
- Discounts and coupons: Included.
- Reviews and ratings: Included.
- Return management: Included.
- Full and partial refunds: Included.
- Administrative management: Included.

### 19.2 Default Business Policies

The following values are adopted for development and test fixtures in revision 1.2. Public policy publication and live operation still require operator approval and any overriding current legal requirements. A later policy change updates the owning FR first and is versioned; implementation must not treat these values as independently verified law:

- Standard return request window: 7 calendar days after delivery.
- Cancellation: Before shipment, subject to processing status.
- Refund target: 7 business days after approval, subject to legal and provider requirements.
- Change-of-mind return shipping: Normally paid by the customer.
- Wrong, damaged, or defective product return shipping: Normally paid by the store.
- One coupon per order.
- One active review per customer per product.
- Online payment stock reservation: 15 minutes.
- Bangladesh-only shipping.
- Email-based guest order verification.

Review these policies against current Bangladesh consumer and digital-commerce rules before publication. Store policies cannot override customer rights.

Reference: Digital Commerce Operation Guidelines 2021 (government gazette: https://www.dpp.gov.bd/bgpress/index.php/document/get_extraordinary/40432).

### 19.3 External Dependencies

- SSLCOMMERZ merchant account and credentials.
- SSLCOMMERZ activation of bKash, Nagad, and Rocket channels.
- SSLCOMMERZ payment and refund APIs: https://developer.sslcommerz.com/doc/v4/.
- Email delivery service.
- Product images and catalog data.
- Delivery partners or fulfillment arrangements.
- Production infrastructure.
- Store branding and contact details.

### 19.4 Operational Configuration Required Before Launch

The store owner must provide or approve:

- Final store name and logo.
- Product catalog and initial stock.
- Product prices.
- Delivery zone coverage.
- Initial delivery charges.
- Customer support contact information.
- SSLCOMMERZ merchant credentials.
- Published policies.
- Administrative account ownership.

These are launch configuration requirements rather than missing product features.

---

## 20. Final Deliverables

1. Responsive sports e-commerce storefront.
2. Customer registration and authentication.
3. Customer profile and address management.
4. Product catalog and search.
5. Product variants and inventory management.
6. Shopping cart.
7. Wishlist.
8. Discounts and coupons.
9. Product reviews and ratings.
10. Guest and registered checkout.
11. SSLCOMMERZ payment integration for bKash, Nagad, and Rocket (subject to merchant channel activation).
12. Cash on Delivery.
13. Order management and tracking.
14. Admin-controlled delivery charges.
15. Order cancellation system.
16. Product return system.
17. Full and partial refund system.
18. Customer notifications.
19. Secure admin management interface.
20. Payment and refund administration.
21. Basic business reports.
22. Backend APIs and database.
23. Security and functional testing.
24. Production deployment.
25. Technical documentation and project handover.

---

**End of Product Requirements Document — Version 1.2**
