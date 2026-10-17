# P01-002 — Initial-release scope confirmation

**Verified:** 17 October 2026 (Asia/Dhaka)\
**Executor:** Codex\
**Verification:** Passed\
**Task status:** Done

Confirm the scope required by [P01-002](../TASKS.md#phase-01--requirements-finalization-and-planning).
The prerequisite [P01-001](./P01-001-baseline.md#acceptance) is Done with project-owner acceptance.
This record applies the Version 1.0 [PRD §3](../PRD.md#3-project-scope) and
[§19](../PRD.md#19-assumptions-and-operational-dependencies) without changing requirements.

## Release boundaries

- One store.
- One currency: BDT.
- One primary administrator role.
- Bangladesh-only delivery.
- A configurable delivery charge system.
- One coupon per order.
- Manual shipment status updates.
- SSLCOMMERZ for enabled bKash, Nagad, and Rocket channels.
- Store-managed Cash on Delivery (COD).

All three SSLCOMMERZ-hosted online channels and COD are required for initial-release acceptance. Hide inactive
channels, but keep launch blocked until every required method is verified. A smaller payment-method set requires
an approved PRD scope change and synchronized acceptance/design/architecture/plan/task records.

The primary administrator role does not add permission tiers. Guest and customer ownership controls remain
server-enforced under PRD §9. Delivery uses manual shipment updates and operator-managed fulfillment arrangements;
these do not require courier APIs or GPS tracking.

## Included features

The following inventory reproduces all 20 customer and 16 administrative features in PRD §3.1.

### Customer features

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

### Administrative features

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

## Excluded features

The following 13 exclusions reproduce PRD §3.2. None is a prerequisite for an included feature.

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

## Implementation policy baseline

The following defaults reproduce PRD §19.2. Apply the detailed owning functional requirements for eligibility,
state transitions, funding, timing and exceptions.

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

The delivery planning target in PRD §19.1 is within 14 calendar days, subject to shorter applicable deadlines for
prepaid orders. These implementation baselines do not certify current legal compliance or provider capability.
Use the current-authority and operator review gates below before publishing customer commitments.

## External decisions and inputs

The following decisions remain subject to actual provider, operator and environment evidence. Roles identify the
accountable function; no named owner, merchant activation, credential or policy approval is fabricated. The EXT IDs
match [TASKS §6.1](../TASKS.md#61-external-readiness-and-blocker-register). P01-005 assigns operational ownership;
P01-006 and P01-007 perform the provider and policy feasibility follow-through.

| Reference | Decision or input to confirm | Accountable role | Owning task(s) | Required closure evidence |
| --- | --- | --- | --- | --- |
| EXT-01 | Merchant sandbox/live account, all three channel activations, limits and callback configuration | Merchant owner / backend lead | P01-005, P01-006; P07; P11 | Account-specific onboarding, supported integration details and verified channel acceptance |
| EXT-02 | Supported original-channel refunds, status verification, limits and authorized manual fallback | Merchant / finance owner | P01-006; P08; P11 | Provider capability evidence, sandbox outcomes and approved payout-verification procedure |
| EXT-03 | Transaction-capable MongoDB topology, isolated test resources and recovery service | Data / platform owner | P01-005; P03; P06; P09–P11 | Transaction/index tests, backup configuration and measured restore/reconciliation results |
| EXT-04 | Media account, upload limits/scanning, private evidence delivery and asset rights | Store / security owner | P01-005; P04 | Approved assets, restricted configuration and upload/access/cleanup verification |
| EXT-05 | Email provider, verified sender, delivery resources and retry/uncertainty handling | Store / backend owner | P01-005; P03; P06–P08; P11 | Sender ownership and isolated delivery/failure/retry evidence |
| EXT-06 | Store identity/logo/contact, catalog content, SKUs, prices and opening stock | Store owner / catalog operator | P01-005; P04; P09; P11 | Operator-approved catalog and store configuration |
| EXT-07 | Bangladesh coverage, delivery charges, effective periods and manual fulfillment arrangements | Store / fulfillment owner | P01-005, P01-007; P06; P11 | Approved coverage/charge versions, service commitments and operating contacts |
| EXT-08 | Applicable delivery/complaint/refund requirements, return/shipping terms, privacy/retention and published policy copy | Store owner with qualified legal/privacy reviewer | P01-007; P06; P08; P09; P11 | Dated authoritative review, approved policy versions and order-time policy snapshots |
| EXT-09 | Hosting, exact origins/DNS/TLS, secret custody, monitoring, on-call and recovery configuration | Platform / security owner | P01-005; P09; P11 | Deployment ownership, environment validation, origin/session checks and operational drills |

Resolve or escalate these inputs through their owning tasks. An absent input blocks the affected integration or
release gate when needed; it does not add excluded functionality or prevent unrelated safe development.
No merchant or legal verification is claimed by this scope task.

## Scope review and change control

- [x] Recorded every release boundary, included feature and excluded feature from PRD §3.
- [x] Recorded the PRD §19.2 implementation defaults and §19.1 delivery target with their qualifications.
- [x] Reviewed the complete 171-task register and Implementation Plan §§1.2, 4.4 and 6 for scope drift.
- [x] Found no excluded feature introduced as a mandatory implementation prerequisite.
- [x] Kept role/ownership checks distinct from excluded administrator permission tiers, basic reports distinct from
  advanced business intelligence, guest proof exchange distinct from product exchanges, and manual shipment updates
  distinct from courier integration.
- [x] Linked every EXT-01–EXT-09 input to its decision, accountable role, follow-through tasks and closure evidence.
- [x] Left PRD, Architecture, Design, Database, API, Testing, Operations and Implementation Plan unchanged.

**Scope changes:** None. Future changes follow [Implementation Plan §13.2](../IMPLEMENTATION_PLAN.md#132-change-control)
and the PRD's subject authority. Mandatory payment, stock, financial, security and customer-rights requirements remain intact.

## Verification record

Environment: local repository, Git and Python 3 standard library. Reviewed PRD §§3, 9, 18–19,
Implementation Plan §§1.2, 4.4 and 6, API Appendix B, Operations Appendix C and the complete task register.

| Check | Result |
| --- | --- |
| Scope inventory | Passed — 36 included features, 13 exclusions and 9 release boundaries match the PRD |
| Policy inventory | Passed — all 10 PRD §19.2 defaults preserved |
| Prerequisite | Passed — P01-001 Done with recorded project-owner acceptance |
| Dependency review | Passed — excluded features are not implementation prerequisites |
| External decisions | Passed — all 9 EXT entries have explicit decision/input, accountable role and closure evidence |
| Source and task integrity | Passed — governing specifications, existing evidence, task IDs and dependency graph preserved |
| Documentation checks | Passed — 374 local links/anchors across 14 Markdown files; structure, phase totals and diff whitespace valid |
| Provider/legal/runtime verification | Not Run — owned by the linked integration and release tasks |

Reproduce the unchanged-source and whitespace checks from the repository root:

```bash
git diff --exit-code HEAD -- docs/PRD.md docs/ARCHITECTURE.md docs/DESIGN.md docs/DATABASE.md docs/API.md docs/TESTING.md docs/OPERATIONS.md docs/IMPLEMENTATION_PLAN.md
git diff --check
```

Supplementary command: `python3 /tmp/sportzone-p01-002-verify.py`. It passed the scope/policy inventory comparisons,
EXT coverage, P01-001 prerequisite, all 171 task IDs and dependencies, phase totals, local links/anchors and Markdown
checks. It also confirmed that existing source specifications, prior evidence and staged user changes were preserved.

## Acceptance

**Accepted by:** Project owner\
**Accepted on:** 17 October 2026 (Asia/Dhaka)\
**Acceptance evidence:** Conversation reply to the P01-002 scope review request: “Scope checklist গ্রহণ করছি”.

Verification and independent acceptance satisfy [TASKS §2](../TASKS.md#2-task-management-conventions) and
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting). P01-002 is Done; its checkbox and progress totals reflect
this acceptance. This record grants no merchant, policy, milestone or production approval.
