# P02-009 — Reusable commerce visual primitives

**Date:** 18 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner, 18 October 2026 — “Commerce primitives গ্রহণ করছি”

## Scope and sources

- [Task](../TASKS.md#phase-02--uiux-design): P02-009; P02-008 is accepted.
- [Design §§6–7](../DESIGN.md#6-ui-components): product/variant/cart/summary, status and loading presentation.
- [API §6 and Appendix D.2](../API.md#62-dto-registry): integer-poisha money, public product/rating data, estimated cart amounts, authoritative quote and immutable order pricing.
- [Usage guide](../UI_COMPONENTS.md#commerce-compositions): presentation props, caller-owned state, image sources and integration boundaries.

No business/API/database contract changed. No cart write, checkout calculation, stock reservation, payment effect or live product data was implemented by this UI task.

## Delivered behavior

| Primitive | Delivered states and safeguards |
| --- | --- |
| Price | Exact integer-poisha formatter; prior price only when strictly higher; explicit sale/current/regular labels; invalid money rejected |
| Product card/image | HeroUI Card, router-aware product link, descriptive image/failure fallback, explicit availability, valid approved rating summary only; optional action stays outside the link |
| Variant selector | Labelled controlled complete-combination choices; unavailable disabled; pending/error/stale/empty states; selected state and checkout recheck notice |
| Cart line | Variant/SKU/image, supplied unit/line estimates, min/max/direct quantity requests, pending edit/removal guards, safe price/stock warning and no-reservation notice |
| Status badge | HeroUI Chip with explicit label; semantic text on grayscale surfaces; no automatic payment/fulfillment/refund conclusion |
| Order summary | Supplied regular subtotal, product/coupon discounts, delivery and final total; estimate/quote/order label and separate method/outcome messaging |
| Skeleton | Product/cart/summary layouts; one polite loading announcement, decorative placeholders hidden, no invented amount or availability |

Components live in `storefront/src/components/commerce/`. Existing public placeholders are untouched; synthetic examples occur only in tests. Feature adapters will supply real public DTOs, quote/snapshot amounts and eligible actions. No dependency, runtime service or CI command was added.

## Verification

Environment: Node 24.20.0 / npm 11.19.0; Vitest/jsdom and React static rendering with synthetic data only. Each explicit theme runs 20 new cases, 40 total.

| Check | Observed result |
| --- | --- |
| `npm run ci` | Passed; all 13 configured commands, 203 tests (12 tooling, 114 storefront, 77 admin), both production builds and six HTTP smoke groups |
| CI report | Passed; `test-results/ci.json`, 18 October 2026, 10:55:50–10:56:36 UTC; generated local artifact, ignored by Git |
| Browser visual/reflow/zoom/native keyboard and actual image-delivery review | Not Run; computer-use inventory returned no enabled apps or browsers |

Tests cover four sale comparisons, zero/large/invalid money, separate card action/link, rating and stock text, image failure/replacement, variant eligibility/announcements, increment/decrement and direct entry limits, pending/removal and warning states, payment/refund labels, all three summary kinds and all three skeleton layouts. Deliberately different supplied totals prove the UI does not multiply/sum browser values into financial truth. Local callbacks prove UI request behavior only, not backend authorization or stock correctness.

## Review boundary

The project owner independently accepted this task on 18 October 2026 under Tasks §2 and AGENTS §13. No milestone is self-approved. Browser evidence is distinct from DOM assertions; catalog/cart/checkout integration, media configuration and provider activation remain in their owning tasks.

## References

- [HeroUI NumberField](https://heroui.com/en/docs/react/components/number-field)
- [HeroUI Chip](https://heroui.com/en/docs/react/components/chip)
- Installed HeroUI 3.2.6 components/declarations and the existing shared BDT formatter.
