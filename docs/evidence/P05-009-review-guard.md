# P05-009 — Review ownership and purchase-eligibility guard

## Scope and revision

FR-10/FR-31; Database §6.6/§10.3; API §§10.3,14.2; Testing REV-01.
Base revision: `9ccc53b0b621d04542a51e1ac35fe53e0e770d76`, plus this work package.
Verification: 24 October 2026, Linux, Node.js 24.20.0/npm 11.19.0, isolated MongoDB 8.0.16
replica sets. P03-013, P04-002 and P01-024 are independently accepted prerequisites.
P05-008 belongs to the later Admin stage; this is the next independent backend review foundation.

## Implementation and boundaries

- `reviews/` owns strict review schemas, canonical model, explicit persistence setup and service.
  Reviews retain user/product/order/item evidence, authored rating/comment, moderation state,
  activity and timestamps. A partial unique user/product index enforces one active review, including
  concurrent sessions. Strict database validation rejects invalid ratings, missing proof references,
  empty/untrimmed comments and nonpending moderation without reason/time metadata. Evidence identity
  is immutable through model saves. No review controller imports another module's private models.
- Customer access uses the existing transaction-scoped authenticated account capability. Creation
  requires an authoritative delivered/eligible purchase proof matching **all** customer, product and
  qualifying-item IDs. The production default, with no eligibility adapter, is denial. A boolean,
  foreign evidence or a client-controlled verification/status field cannot create a verified review.
- Creation is pending. Customers read/edit only their own record. Actual rating/comment changes
  return to pending and remove the old rating contribution; identical normalized content does not
  reset approval. Existing legitimate reviews remain after later return/refund and can be corrected;
  a new verification still needs current qualifying proof. No automatic refund-based deletion occurs.
- Moderation requires an explicit transaction-scoped administrator authorizer, durable audit writer
  and receipt reader. Missing authorization/receipt integration fails closed. Moderators choose only
  approve/reject/hide with a required reason, never authored rating/comment values. One-star feedback
  can be approved; no automatic positivity filter exists. Prior decisions survive metadata resets in
  append-only audit facts rather than being erased by customer edits.
- Actor/resource-scoped opaque moderation causes are hashed before audit storage. Receipt replay binds
  actor, review, cause, decision and reason; changed payloads conflict. The same request is recorded
  once under concurrent retries. An approval replay after a later customer edit returns current pending
  state and never reapproves unreviewed content. Generic HTTP key/CSRF/throttle/DTO adapters remain P05-016.
- Catalog's narrow `productReviewAccess` owns product fencing and rating-summary writes. Review
  transitions, summary recalculation and audit insertion commit in one transaction. Only active approved
  reviews contribute; counts/averages reconcile across different administrators and edit/moderation
  races. Reviews cannot directly manipulate product models. Raw authored comments are not copied into
  audit snapshots; minimal before/after SHA-256 fingerprints are stored with actor/action/reason.

The production orders/refund eligibility and audit operations adapters are not implemented by this
slice. Tests provide explicit durable **test-only** order proof/audit capabilities and real identity
session/role checks; this is not represented as production purchase eligibility or audit deployment.
The proof capability must fence its authoritative delivered/return evidence in the same transaction;
the audit writer/reader must be append-only, actor/resource scoped and transactional. P08-016 and
P05-016 supply/verify complete eligibility and HTTP integration. No review route or permissive default
is registered now. Current verified-creation behavior therefore remains closed until that integration.

## Setup and contracts

`bootstrap-reviews.mjs` provides explicit local/test setup after build. It adds only missing review
persistence/indexes, preserves compatible existing data and refuses incompatible validator replacement
or staging/production execution. It does not provision audit or activate eligibility adapters.
Operations records the actual command; Database clarifies moderation metadata and transactional
approved-summary invariants. Existing API operations/artifacts remain unchanged and fresh. No package,
configuration secret, financial rule or unrelated accepted task was changed.

## Observed verification

| Actual command/check | Result |
| --- | --- |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/reviews.test.ts tests/integration/products.test.ts tests/integration/catalog.test.ts` | Initial expanded run Passed: review 23, products 14 and catalog 24 (61). Product/catalog consumers remained unchanged by subsequent review-only replay fixes |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/reviews.test.ts` | Final Passed: all 27 review cases, including actual public catalog ratings and compiled additive bootstrap/production-mode refusal |
| Review-only scoped `-t 'concurrent approvals'` and `-t 'defaults moderation'` follow-ups | Passed: distinct-admin product-summary race and absence of a durable receipt reader fail closed. Filtered cases reuse unchanged results; they are not counted again |
| `npm run test:unit --workspace=backend -- tests/unit/reviews.test.ts tests/unit/catalog.test.ts` | Passed: 43 cases (22 review input/proof/cause guards, 21 catalog consumers), including Unicode limits, negative ratings, protected fields and mandatory moderation reasons |
| `npm run test:contract --workspace=backend` | Passed: 48 schema/router/negative/freshness cases; review HTTP operations remain planned; existing catalog contracts are unchanged |
| `npm run typecheck --workspace=backend`; `npm run lint --workspace=backend`; `npm run build --workspace=backend` | Passed: final strict source/types and actual compiled bootstrap/service build; lint checks 193 files |
| `npm run format:backend`; `npm run lint:boundaries` | Passed: 207 format files and 229 boundary files; existing generic negative private-model/shared/provider fixtures remain applicable |
| `npm run lint`; `git diff --check`; task/checkbox audit | Passed: 481 files, 1,249 local links and zero errors; 209 task IDs/counts/checkbox parity and all 73 accepted records preserved; diff whitespace check passed |
| `npm run test:security` | Passed: zero secret findings and zero dependency advisories |
| Full backend/full-project CI; frontend/UI/browser; hosted CI; HTTP startup smoke; real provider/production order/audit deployment | Not Run: no HTTP startup or frontend wiring changed. Focused owning/consumer checks follow Testing §15.5. Actual public catalog HTTP ratings are tested in-process against real isolated persistence; production adapters/stage gates remain separate |

There are **65 distinct applicable integration scenarios** with successful final evidence: reviews 27,
products 14 and catalog 24. Review cases cover default denial; delivered/missing/cancelled/undelivered/
fully-returned/foreign proof; duplicate sessions; roles/suspension/ownership; retained negative feedback;
customer edits and unchanged-content behavior; audit failure rollback including purchase/product fences;
raw uniqueness/partial indexes/validators; incompatible bootstrap; concurrent cross-admin and edit/
moderation summaries; pending/approved public rating projections; stable-key replay protection; and
actual repeatable compiled local/test bootstrap. Reruns and filtered cases are not added to counts.

Initial lint found an unused test import, removed without suppressions. Strict type checking caught a
UUID-default parameter inferred narrower than arbitrary opaque keys; it was explicitly typed string.
During audit-cause normalization, two replay tests caught a lookup/writer key mismatch; both now use
the identical actor/resource-scoped cause, and the final 27-case run passed under the canonical optional
unique audit index. Final formatting corrected a test-only layout mismatch. Failed/replaced results
remain historical; sanitized logs/reports are retained under `test-results/P05-009/`.

## Recovery and independent review

No production migration, deletion, provider mutation, deployment or publication occurred. Roll out
review validators/indexes additively through reviewed procedures. Preserve authored reviews and audit
facts on rollback; a later refund is not an instruction to erase legitimate feedback. Reconcile/rebuild
rating summaries from active approved reviews through the catalog owner if operational repair is needed.
No new state-changing HTTP path should activate without real eligibility, admin and transactional audit
adapters plus the owning API's access/CSRF/idempotency verification.

On 24 October 2026, the project owner independently accepted the submitted implementation and
verification through the review popup: “Review করেছি—accept করছি, Done করো”. P05-009 moved from
In Review to Done under AGENTS §13. Historical verification results, failed attempts and limitations
above remain unchanged. P08-016/P05-016 eligibility and API integration, later UI stages and
product/provider milestones retain their separate acceptance gates.
