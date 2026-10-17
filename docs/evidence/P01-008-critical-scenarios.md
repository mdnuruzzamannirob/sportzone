# P01-008 — Safety-critical scenarios and dependency path

**Reviewed:** 17 October 2026 (Asia/Dhaka)\
**Executor:** Codex\
**Task status:** Done\
**Verification:** Passed — static scenario, ownership, source coverage and dependency checks\
**Scenario execution:** Not Run

## Purpose and authority

This planning record maps high-risk behavior to existing test specifications, feature owners and later verification owners.
SC IDs are local evidence slots, not new product requirements or runnable/passing tests. Feature implementation, provider
capability, legal approval and milestone acceptance remain separate.

Sources: [PRD §11](../PRD.md#11-state-management-and-edge-cases),
[Architecture §7](../ARCHITECTURE.md#7-data-architecture),
[Architecture §10](../ARCHITECTURE.md#10-critical-business-workflows),
[Implementation Plan §7](../IMPLEMENTATION_PLAN.md#7-dependencies--critical-path),
[Database §12](../DATABASE.md#12-data-integrity-and-transaction-contracts),
[API §15](../API.md#15-idempotency-concurrency--recovery) and
[Testing](../TESTING.md). Prerequisite P01-003 is Done; its accepted traceability is preserved.

## Verification responsibilities and evidence rules

- Feature owners below mean the executor/reviewer assigned to the named implementation tasks; the named QA task owns
  later integrated verification. No person's appointment or successful run is fabricated by this map.
- Every SC slot is Planned / Not Run. Before closing it, attach commit, real test/case IDs, isolated environment/run ID,
  seed, stimulus/interleaving, before/after persisted assertions, observed result, artifacts, defects/retests and reviewer.
- Concurrency cases require synchronized competing operations, repeated supported interleavings and actual replica-set-capable
  MongoDB with real indexes/transactions. Check physical records as well as HTTP/UI responses; standalone MongoDB,
  mocked transaction APIs and sequential requests cannot prove race safety. Inject aborts at each atomic transition.
- Local provider doubles and frozen clocks may inject otherwise inaccessible faults. Actual sandbox field/status support,
  each required wallet's activation and approved live checks need separate provider evidence. Unavailable provider cases
  remain Blocked/Not Verifiable, never silently Passed. bKash, Nagad, Rocket and COD remain initial-release requirements.
- Test actual browser cookie/CSRF/origin/ownership behavior and API-backed UI; synthetic data, redacted artifacts and bounded
  isolated runs only. No production financial operation is authorized by this plan.
- [Testing §18.2](../TESTING.md#182-release-blocking-rules) blocks release for missing mandatory evidence. A mock does not
  waive any SC slot, security/financial invariant, merchant gate or recovery check. P10-012 owns correction/retest and
  P10-013 the M6 evidence decision; P11-011 owns explicit M7 launch acceptance. This task accepts neither milestone.

## Scenario register

### SC-01 — Final stock unit contention

| Field | Planned obligation |
| --- | --- |
| Tests | `INV-01`, `DB-05` |
| Feature owners | `P04-008`, `P06-007` |
| Later verification owner | `P10-002` |
| Required assertions | Race COD and online buyers for one SKU with a barrier, then abort one transaction; available stays nonnegative, at most one allocation wins, no partial order or duplicate movement. |
| Database invariants | `DB-I01`, `DB-I03` |
| Execution status | Planned / Not Run |

### SC-02 — Coupon final-slot and identity races

| Field | Planned obligation |
| --- | --- |
| Tests | `PRM-02`, `PRM-03`, `PRM-04`, `DB-05` |
| Feature owners | `P05-006`, `P05-007`, `P06-007` |
| Later verification owner | `P10-002` |
| Required assertions | Race final global and per-customer slots, guest identity spoofing, hold release and cancellation. Enforce immutable coupon identity, account quotas, one release; completed refunds do not automatically restore quota. |
| Database invariants | `DB-I04`, `DB-I12` |
| Execution status | Planned / Not Run |

### SC-03 — Authoritative quote and money

| Field | Planned obligation |
| --- | --- |
| Tests | `CHK-03`, `PRM-01`, `SEC-07` |
| Feature owners | `P05-005`, `P06-004` |
| Later verification owner | `P10-001` |
| Required assertions | Tamper totals, change prices/zone/coupon after quote, race two keys on one quote and submit expired quote. Reject before mutation; integer-poisha allocation and explicit fresh confirmation; committed replay still resolves old order. |
| Database invariants | `DB-I02`, `DB-I09`, `DB-I14` |
| Execution status | Planned / Not Run |

### SC-04 — Duplicate checkout and stale replay

| Field | Planned obligation |
| --- | --- |
| Tests | `CHK-04`, `CHK-05`, `DB-06`, `REL-01` |
| Feature owners | `P06-006`, `P06-007` |
| Later verification owner | `P10-002` |
| Required assertions | Concurrent same-key submissions, changed fingerprint, response loss and replay after response retention: one order per scope/key, durable tombstone/pointer, no duplicate allocation or provider initiation. |
| Database invariants | `DB-I02`, `DB-I12`, `DB-I14` |
| Execution status | Planned / Not Run |

### SC-05 — Hold expiry, generation and payment race

| Field | Planned obligation |
| --- | --- |
| Tests | `INV-02`, `REL-03`, `REL-07` |
| Feature owners | `P06-009`, `P06-010`, `P07-008` |
| Later verification owner | `P10-002` |
| Required assertions | Race expiry workers against commit; release once. Reacquisition creates aligned stock/coupon generation at 10:20 expiring 10:35; replay never extends expiry or decrements twice; TTL deletion cannot release business state. |
| Database invariants | `DB-I01`, `DB-I03`, `DB-I04`, `DB-I12` |
| Execution status | Planned / Not Run |

### SC-06 — COD acceptance and collection

| Field | Planned obligation |
| --- | --- |
| Tests | `CHK-02`, `PAY-12`, `RFD-06` |
| Feature owners | `P06-008`, `P06-012` |
| Later verification owner | `P10-001` |
| Required assertions | COD commits stock/coupon once but remains Pending until admin confirmation and unpaid until verified collection. Replay collection once; zero collected cash cannot fund a refund. |
| Database invariants | `DB-I01`, `DB-I05`, `DB-I12` |
| Execution status | Planned / Not Run |

### SC-07 — Cancellation versus dispatch

| Field | Planned obligation |
| --- | --- |
| Tests | `ORD-02`, `ORD-03` |
| Feature owners | `P06-011`, `P06-013` |
| Later verification owner | `P10-002` |
| Required assertions | Pending request alone changes no allocation; race admin cancellation approval against dispatch with current eligibility checks. One transition wins; cancellation releases once, shipment decreases physical/committed once. |
| Database invariants | `DB-I01`, `DB-I11`, `DB-I12` |
| Execution status | Planned / Not Run |

### SC-08 — Payment timeout and missing callback

| Field | Planned obligation |
| --- | --- |
| Tests | `PAY-05`, `REL-04` |
| Feature owners | `P07-004`, `P07-012` |
| Later verification owner | `P10-003` |
| Required assertions | Crash/timeout before or after hosted-session request and omit IPN. Query provider before retry, retain uncertain attempts, reconcile without duplicate order/collection; no timeout-as-failure assumption. |
| Database invariants | `DB-I05`, `DB-I06`, `DB-I12` |
| Execution status | Planned / Not Run |

### SC-09 — Redirect and forged callback

| Field | Planned obligation |
| --- | --- |
| Tests | `PAY-02`, `PAY-03`, `PAY-14` |
| Feature owners | `P07-005`, `P07-006` |
| Later verification owner | `P10-003` |
| Required assertions | Success redirect, forged/repeated IPN and invalid merchant/transaction/amount/currency never prove Paid; safe rejection metadata only. Compare with separately verified discrepant funds, which must survive. |
| Database invariants | `DB-I05`, `DB-I13` |
| Execution status | Planned / Not Run |

### SC-10 — Duplicate and out-of-order provider events

| Field | Planned obligation |
| --- | --- |
| Tests | `PAY-04`, `PAY-13`, `PAY-14`, `REL-04` |
| Feature owners | `P07-007`, `P07-008` |
| Later verification owner | `P10-003` |
| Required assertions | Replay valid receipt after failure/cancellation signals, crash at intake/link, reverse redirect/IPN order. One verified intake/collection effect; later genuine funds retained; failure cannot release another funded allocation. |
| Database invariants | `DB-I05`, `DB-I06`, `DB-I12` |
| Execution status | Planned / Not Run |

### SC-11 — Late paid with expired capacity

| Field | Planned obligation |
| --- | --- |
| Tests | `PAY-06`, `INV-02` |
| Feature owners | `P07-009` |
| Later verification owner | `P10-003` |
| Required assertions | After expiry test both capacities free, stock exhausted, coupon exhausted and both exhausted. Record receipt first; atomically reacquire both only for eligible order, otherwise hold fulfillment with authorized resolution. |
| Database invariants | `DB-I01`, `DB-I04`, `DB-I05`, `DB-I06` |
| Execution status | Planned / Not Run |

### SC-12 — Paid after cancellation

| Field | Planned obligation |
| --- | --- |
| Tests | `PAY-07` |
| Feature owners | `P07-009`, `P06-013` |
| Later verification owner | `P10-003` |
| Required assertions | Verify genuine funds after cancellation, including older failed attempt. Keep Cancelled, no reacquisition or fulfillment; retain collection and correction obligation for authorized refund. |
| Database invariants | `DB-I05`, `DB-I06`, `DB-I13` |
| Execution status | Planned / Not Run |

### SC-13 — Risk and allocation independent

| Field | Planned obligation |
| --- | --- |
| Tests | `PAY-08` |
| Feature owners | `P07-010` |
| Later verification owner | `P10-003` |
| Required assertions | Verified risk_level=1 stays financially recorded and fulfillment held; approval cannot bypass missing allocation, rejection requires authorized resolution/refund. Repeat review safely. |
| Database invariants | `DB-I05`, `DB-I06`, `DB-I12` |
| Execution status | Planned / Not Run |

### SC-14 — Two paid attempts and overpayment

| Field | Planned obligation |
| --- | --- |
| Tests | `PAY-09`, `RFD-05` |
| Feature owners | `P07-011`, `P08-007` |
| Later verification owner | `P10-003` |
| Required assertions | Verify both attempts concurrently; preserve both source receipts, fulfill once and separate excess correction capacity. Refunding excess does not consume merchandise ordinals or falsely mark merchandise Refunded. |
| Database invariants | `DB-I05`, `DB-I06`, `DB-I07`, `DB-I13` |
| Execution status | Planned / Not Run |

### SC-15 — Verified discrepant/unmatched funds

| Field | Planned obligation |
| --- | --- |
| Tests | `PAY-10`, `PAY-14` |
| Feature owners | `P07-006`, `P07-012` |
| Later verification owner | `P10-003` |
| Required assertions | Independently verified partial, excess, wrong-attempt, currency/amount discrepancy and unmatched receipts get one durable quarantined intake with exact amount/currency/reference; do not discard or auto-fund an order. |
| Database invariants | `DB-I05`, `DB-I13` |
| Execution status | Planned / Not Run |

### SC-16 — Attempt retry and channel eligibility

| Field | Planned obligation |
| --- | --- |
| Tests | `PAY-01`, `PAY-11`, `ORD-08` |
| Feature owners | `P07-003`, `P07-013` |
| Later verification owner | `P10-003` |
| Required assertions | Retry same order with new attempt identity only after status/ownership/capacity checks; reject unsupported destination, inactive channel and out-of-limit amount safely. Real per-channel sandbox and live activation remain separate. |
| Database invariants | `DB-I02`, `DB-I05`, `DB-I06` |
| Execution status | Planned / Not Run |

### SC-17 — Physical return inspection and restock

| Field | Planned obligation |
| --- | --- |
| Tests | `RET-01`, `RET-02`, `RET-05`, `RET-06`, `INV-03` |
| Feature owners | `P08-002`, `P08-003`, `P08-004` |
| Later verification owner | `P10-004` |
| Required assertions | Eligible delivered unit follows physical lifecycle; no merchandise refund approval/restock before receipt and inspection. Partially resellable inspection restocks approved units once; claim completion is not payout completion. |
| Database invariants | `DB-I01`, `DB-I08`, `DB-I12` |
| Execution status | Planned / Not Run |

### SC-18 — Shortage versus overlapping physical claims

| Field | Planned obligation |
| --- | --- |
| Tests | `RET-03`, `RET-04`, `DB-11` |
| Feature owners | `P08-001`, `P08-007` |
| Later verification owner | `P10-004` |
| Required assertions | Race physical/shortage claims on same original unit ordinal. Only eligible disjoint units win; approved shortage has no fictional receipt, inspection or restock; resolved/refunded units cannot be reclaimed. |
| Database invariants | `DB-I07`, `DB-I08` |
| Execution status | Planned / Not Run |

### SC-19 — Original-price refund entitlements

| Field | Planned obligation |
| --- | --- |
| Tests | `RFD-01`, `DB-07` |
| Feature owners | `P08-006` |
| Later verification owner | `P10-004` |
| Required assertions | Use FX-MONEY-03 original allocated net entitlements 34,34,33 and delivery rules after catalog edits; cumulative per-unit refunds stay within original amounts, not current prices. |
| Database invariants | `DB-I07`, `DB-I08`, `DB-I09` |
| Execution status | Planned / Not Run |

### SC-20 — Concurrent source/class/order refund caps

| Field | Planned obligation |
| --- | --- |
| Tests | `RFD-02`, `DB-12` |
| Feature owners | `P08-005`, `P08-007` |
| Later verification owner | `P10-004` |
| Required assertions | Race merchandise and correction approvals across same/different sources and order. Pending plus completed obligations respect allocated source class, ordinal, order merchandise/delivery bounds; reserve atomically before any provider call. |
| Database invariants | `DB-I07`, `DB-I08`, `DB-I13` |
| Execution status | Planned / Not Run |

### SC-21 — Unknown payout and safe retry

| Field | Planned obligation |
| --- | --- |
| Tests | `RFD-03`, `RFD-04`, `RFD-08`, `REL-06` |
| Feature owners | `P08-008`, `P08-009` |
| Later verification owner | `P10-004` |
| Required assertions | Provider accepts then times out; restart and re-query using persisted references. Processing/uncertain stays uncompleted; do not blindly resend or release capacity. Authorized safe retry preserves history and unique attempt identity. |
| Database invariants | `DB-I07`, `DB-I12` |
| Execution status | Planned / Not Run |

### SC-22 — Manual/COD payout authorization

| Field | Planned obligation |
| --- | --- |
| Tests | `RFD-06`, `RFD-07` |
| Feature owners | `P08-010` |
| Later verification owner | `P10-004` |
| Required assertions | Deny uncollected COD and unauthorized payout; alternate method requires customer consent, separate approval and verified transfer proof. Provider acceptance or entered text alone never confirms disbursement. |
| Database invariants | `DB-I07`, `DB-I10`, `DB-I12` |
| Execution status | Planned / Not Run |

### SC-23 — Refund completion and timing

| Field | Planned obligation |
| --- | --- |
| Tests | `RFD-09`, `API-05`, `NTC-12` |
| Feature owners | `P08-009`, `P08-011`, `P08-013` |
| Later verification owner | `P10-004` |
| Required assertions | Deduplicate actual payout confirmation and held-to-completed movement; expose correct public timeline. Anchor target to approval, not request/retry; missing approved calendar/legal basis remains under_review, no invented date or early Completed notice. |
| Database invariants | `DB-I07`, `DB-I09`, `DB-I12` |
| Execution status | Planned / Not Run |

### SC-24 — Session/recovery lifecycle

| Field | Planned obligation |
| --- | --- |
| Tests | `API-01`, `API-02`, `SEC-01`, `SEC-03`, `NTC-02` |
| Feature owners | `P03-005`, `P03-010`, `P03-014` |
| Later verification owner | `P10-005` |
| Required assertions | Fixation, expired/revoked/suspended session, logout reuse, password reset replay and auth-context changes deny stale access; rotation, scoped cookies, rate limits and single-use proof work on actual origins. |
| Database invariants | `DB-I10` |
| Execution status | Planned / Not Run |

### SC-25 — CSRF, Origin and role boundaries

| Field | Planned obligation |
| --- | --- |
| Tests | `SEC-02`, `SEC-04`, `SEC-11`, `API-07` |
| Feature owners | `P03-006`, `P03-012`, `P03-013` |
| Later verification owner | `P10-005` |
| Required assertions | Reject forged/missing Origin/CSRF, public admin promotion and cross-session-type actions without side effects; include anonymous valid logout and production cookie/CORS checks, not UI hiding alone. |
| Database invariants | `DB-I10` |
| Execution status | Planned / Not Run |

### SC-26 — Guest proof and protected email delivery

| Field | Planned obligation |
| --- | --- |
| Tests | `API-09`, `ORD-07`, `SEC-05`, `NTC-01` |
| Feature owners | `P03-009`, `P06-015` |
| Later verification owner | `P10-005` |
| Required assertions | Reject guessed order ID, expired/replayed/cross-order proof and concurrent consume/reissue. Challenge-local AEAD/key-loss/tamper/send-crash checks preserve scope; reference-only outbox has no plaintext/encrypted proof payload; email is not access proof. |
| Database invariants | `DB-I10`, `DB-I12` |
| Execution status | Planned / Not Run |

### SC-27 — Cross-owner private data and evidence

| Field | Planned obligation |
| --- | --- |
| Tests | `API-03`, `SEC-06`, `SEC-08`, `REL-11` |
| Feature owners | `P03-013`, `P04-003`, `P08-012` |
| Later verification owner | `P10-005` |
| Required assertions | Probe nested orders/claims/refunds/complaints/media across owners and guest scopes. Race private upload attach against cleanup/legal hold; CAS winner only, no referenced deletion, read reauthorizes, unknown external deletion reconciles. |
| Database invariants | `DB-I10`, `DB-I12` |
| Execution status | Planned / Not Run |

### SC-28 — Notification failure and worker replay

| Field | Planned obligation |
| --- | --- |
| Tests | `REL-05`, `REL-07`, `NTC-03`, `NTC-04`, `NTC-05`, `NTC-06`, `NTC-07`, `NTC-08`, `NTC-09`, `NTC-10`, `NTC-11` |
| Feature owners | `P03-009`, `P06-016`, `P07-016`, `P08-011` |
| Later verification owner | `P10-010` |
| Required assertions | Crash before/after business commit and external send; one durable event intent per transition, retries do not repeat order/refund effects. Track delivery uncertainty, accurate status and provider idempotency; do not claim exactly-once email transport. |
| Database invariants | `DB-I12` |
| Execution status | Planned / Not Run |

### SC-29 — Transaction abort and leased job restart

| Field | Planned obligation |
| --- | --- |
| Tests | `DB-05`, `REL-02`, `REL-03`, `REL-07` |
| Feature owners | `P03-002`, `P06-007`, `P06-010`, `P07-012`, `P08-009` |
| Later verification owner | `P10-011` |
| Required assertions | Inject each atomic transition abort and worker lease loss; inspect every persisted counter/movement/outbox before/after. Bounded DB retries, no provider/email calls inside transactions, no duplicate business effects after restart. |
| Database invariants | `DB-I01`, `DB-I02`, `DB-I03`, `DB-I04`, `DB-I05`, `DB-I06`, `DB-I07`, `DB-I08`, `DB-I12` |
| Execution status | Planned / Not Run |

### SC-30 — Backup/restore and financial gaps

| Field | Planned obligation |
| --- | --- |
| Tests | `DB-10`, `REL-08` |
| Feature owners | `P09-012` |
| Later verification owner | `P10-011` |
| Required assertions | Restore before later payments/refunds and local writes; freeze affected mutations, re-query external facts, compare surviving logs/outbox/manual records, enumerate unreconstructable gaps and obtain authorized disposition before reopening. |
| Database invariants | `DB-I05`, `DB-I07`, `DB-I09`, `DB-I12`, `DB-I13` |
| Execution status | Planned / Not Run |

### SC-31 — Failed delivery and final custody

| Field | Planned obligation |
| --- | --- |
| Tests | `ORD-04`, `REL-10`, `SUP-04` |
| Feature owners | `P06-017`, `P09-004` |
| Later verification owner | `P10-001` |
| Required assertions | Retry stays Shipped; final non-delivery requires every shipped quantity disposition, appropriate refund and truthful contact history. No ordinary cancellation release, automatic coupon restoration or restock of lost/damaged units; recovered inspected resale only. |
| Database invariants | `DB-I01`, `DB-I11`, `DB-I12` |
| Execution status | Planned / Not Run |

### SC-32 — Historical terms, charges and deadlines

| Field | Planned obligation |
| --- | --- |
| Tests | `ACC-05`, `ORD-05`, `ORD-06`, `ADM-05`, `SET-01`, `SET-02`, `SET-03` |
| Feature owners | `P06-001`, `P06-003`, `P09-005` |
| Later verification owner | `P10-001` |
| Required assertions | Race cross-zone overlapping scheduled charge activation; singleton/CAS prevents overlap, abort leaves no partial rule. Approved effective policies only, immutable old snapshots; actual confirmation and approved shorter-law start basis determine deadline, otherwise pending. |
| Database invariants | `DB-I09`, `DB-I14` |
| Execution status | Planned / Not Run |

### SC-33 — Private caching, secrets and reporting

| Field | Planned obligation |
| --- | --- |
| Tests | `SEC-10`, `SEC-12`, `ADM-06` |
| Feature owners | `P04-011`, `P09-002` |
| Later verification owner | `P10-009` |
| Required assertions | No private session/order/guest data in shared caches, logs or error URLs; admin reports use verified source-class cash/obligation cutoffs and bounded authorized fields, never confuse unpaid COD, merchandise refunds and corrections. |
| Database invariants | `DB-I09`, `DB-I10`, `DB-I13` |
| Execution status | Planned / Not Run |

### SC-34 — Accessible uncertainty and guarded UI

| Field | Planned obligation |
| --- | --- |
| Tests | `API-05`, `SEC-07` |
| Feature owners | `P06-018`, `P07-014`, `P08-013` |
| Later verification owner | `P10-006` |
| Required assertions | Real API pending/error/retry/investigation states preserve input and authoritative amounts; no redirect/202-as-success; keyboard/focus/reflow and both themes disclose actual outcome without color-only status. |
| Database invariants | `DB-I09`, `DB-I10` |
| Execution status | Planned / Not Run |

### SC-35 — Completed admin action replay

| Field | Planned obligation |
| --- | --- |
| Tests | `DB-09`, `SEC-13`, `ORD-01` |
| Feature owners | `P06-011`, `P08-015`, `P09-007` |
| Later verification owner | `P10-001` |
| Required assertions | Replay completed shipment, cancel, collection, claim/inspection, refund and policy actions; stale If-Match conflicts where required, operation keys/CAS prevent second money/stock/coupon effect, audit actor/reason preserved. |
| Database invariants | `DB-I01`, `DB-I06`, `DB-I07`, `DB-I10`, `DB-I12` |
| Execution status | Planned / Not Run |

## Mandatory exception coverage

Every bullet of PRD §11.5 is retained below; this supplements the scenario assertions.

| PRD exception | Scenario slots |
| --- | --- |
| Payment timeout. | SC-08 |
| Missing payment callback. | SC-08 |
| Duplicate payment notification. | SC-10 |
| Payment success after reservation expiry. | SC-11 |
| Simultaneous purchase of the final stock unit. | SC-01 |
| Duplicate checkout submission. | SC-04 |
| Coupon usage-limit race conditions. | SC-02 |
| Cancellation during processing. | SC-07 |
| Partial order returns. | SC-17 |
| Multiple refunds against one payment. | SC-20 |
| Refund API failure. | SC-21 |
| COD payment not collected. | SC-06 |
| Invalid guest order access. | SC-26 |
| Delivery delays and failed delivery. | SC-31 |
| Failed delivery follows FR-14/FR-16: retry while Shipped, or documented final non-delivery closure with custody, refund, and inspected-restock handling. | SC-31 |
| Email notification failure. | SC-28 |
| Administrator retry of a previously completed action. | SC-35 |

## Dependency path and safe execution order

Follow the existing capability path from Implementation Plan §7.2:

`Foundation → Identity/Admin Access → Catalog/Variant/Stock → Cart/Pricing/Coupon → Delivery/Checkout Intent → COD + Online Hold Foundation → Verified Payments → Returns/Refunds → Integrated Acceptance → Production`

The table expands actual direct task prerequisites for verification/integration checkpoints. Each prerequisite recursively
requires its own declared dependencies. It is a task graph, not a duration estimate or a claim that every adjacent checkpoint
has a direct edge. Task IDs, edges and milestone acceptance states remain unchanged.

| Checkpoint task | Declared direct prerequisites |
| --- | --- |
| `P01-008` | `P01-003` |
| `P01-014` | `P01-005`, `P01-009` |
| `P03-016` | `P03-015`, `P03-014`, `P01-004`, `P01-010`, `P01-011`, `P01-012`, `P02-011`, `P01-013`, `P01-014` |
| `P04-015` | `P04-005`, `P04-004`, `P04-007`, `P04-008`, `P04-012`, `P04-013`, `P04-014`, `P03-016` |
| `P05-013` | `P05-008`, `P05-007`, `P05-011`, `P05-012` |
| `P06-020` | `P06-018`, `P06-019`, `P06-010`, `P06-016`, `P04-015`, `P05-013` |
| `P07-017` | `P07-014`, `P07-015`, `P07-016`, `P07-011`, `P07-009`, `P07-010`, `P07-012`, `P06-020` |
| `P08-018` | `P08-012`, `P08-013`, `P08-014`, `P08-015`, `P08-016`, `P08-017`, `P08-011`, `P08-006`, `P08-007`, `P07-017` |
| `P09-012` | `P03-016`, `P04-015`, `P05-013`, `P06-020`, `P07-017`, `P08-018`, `P09-008`, `P09-010`, `P09-011` |
| `P10-001` | `P09-012`, `P01-003` |
| `P10-002` | `P10-001` |
| `P10-003` | `P10-001` |
| `P10-004` | `P10-001` |
| `P10-005` | `P10-001` |
| `P10-006` | `P10-001` |
| `P10-007` | `P10-001` |
| `P10-008` | `P10-001` |
| `P10-009` | `P10-001` |
| `P10-010` | `P10-001` |
| `P10-011` | `P09-012`, `P10-003`, `P10-004` |
| `P10-012` | `P10-002`, `P10-003`, `P10-004`, `P10-005`, `P10-006`, `P10-007`, `P10-008`, `P10-009`, `P10-010`, `P10-011` |
| `P10-013` | `P10-012`, `P10-001` |
| `P11-011` | `P11-010`, `P11-007`, `P11-008`, `P11-009` |

Independent UI, tests and infrastructure work may proceed only when its own contracts and prerequisites are ready.
P01-009 repository setup is the next numbered task; P01-008 does not initialize applications or run business logic.
Before accepting a dependent implementation, resolve its full prerequisite closure and attach relevant SC run evidence.
Tests for a risky mutation must exist before enabling that mutation in an integrated environment (Plan §3.1).
External calls stay outside MongoDB transactions; each defined transition commits/aborts independently, not as one
transaction spanning checkout through payout.

## External gates and blocker handoff

| Dependency | Affected scenario families / work | Required closure evidence and owner |
| --- | --- | --- |
| EXT-01/02 — merchant channels/refunds | SC-08–16, SC-20–23; P07/P08/P11 | P01-006 assessment remains planning input; P07-017 real sandbox evidence, P11-005/P11-009 verified live methods/refund capability |
| EXT-03/09 — transactional database/hosting/origins | SC-01–07, SC-18–30; foundation and staging | P03-002 isolated replica-set test evidence, P09-011/P09-012 staging deployment, P11-002/P11-003/P11-010 production verification |
| EXT-04 — controlled media | SC-27; P04/P08 | P04-003 actual scoped media adapter/access evidence and REL-11 cleanup/unknown-result checks |
| EXT-05 — approved email | SC-24/26/28; recovery and guest access | P03-009 sender/send/uncertainty evidence plus feature event tests and P10-010 worker regression |
| EXT-06 — approved catalog inputs | SC-01/03/19/33; real fixtures and release | P11-006 actual operator content approval; synthetic fixtures do not prove content readiness |
| EXT-07/08 — operations/policies | SC-07/17/22/23/31/32; truthful customer commitments | P01-007 gate record; P11-007 qualified/operator review and published copy, P11-011 authorized launch decision |

Use the accepted [readiness register](./P01-005-readiness.md),
[gateway assessment](./P01-006-gateway-feasibility.md) and [policy gates](./P01-007-policy-gates.md) for exact evidence
requirements. A missing external gate blocks affected acceptance; safe synthetic development may continue.
Record a failed prerequisite with exact source, impacted task/SC ID, accountable function, risk, evidence and next action.
For unknown payment/payout outcome, investigate/reconcile before any authorized resubmission. No mandatory safety gate
can be deferred merely to keep this path moving.

## Verification record

**Command:** `python3 /tmp/p01-008-verify.py`\
**Whitespace:** `git diff --check`\
**Result:** Passed — all scenario/case/task references, all 17 PRD exception bullets, all 14 Database hard invariants,
checkpoint dependency edges, acyclic 171-task graph, totals, local links/anchors and Markdown structure. Source
specifications, previous accepted evidence, staged user changes and milestone states are preserved.\
**Runtime/security/concurrency/provider/restore execution:** Not Run — no application or runtime test infrastructure exists.

## Acceptance

Accepted by the project owner on 17 October 2026 (Asia/Dhaka): “Critical-scenario map গ্রহণ করছি”.
Independent acceptance is recorded under [TASKS §2](../TASKS.md#2-task-management-conventions) and
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting); P01-008 is Done.
This planning acceptance grants no runtime-test result, provider activation or milestone approval.
