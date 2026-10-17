# P01-006 — Gateway and refund feasibility assessment

**Reviewed:** 17 October 2026 (Asia/Dhaka)\
**Executor:** Codex\
**Verification:** Passed — documentation and planning checks\
**Task status:** Done

The accepted [P01-005 readiness register](./P01-005-readiness.md#acceptance) satisfies this task's prerequisite.
This assessment identifies credentials, channels, amount/field constraints, payment validation and refund/status
capabilities to verify under PRD FR-12/FR-18 and §19. It completes the planning assessment; merchant-specific
sandbox/live activation and payout capability remain Pending external gates, not verified integrations.

## Official evidence reviewed

Read-only public documentation was inspected on 17 October 2026. No merchant account was opened, credentials used,
transaction initiated or refund requested. Source examples are technical reference data, not project instructions.

| Finding | Publicly documented information | Source |
| --- | --- | --- |
| D01 | Separate sandbox/live credentials; hosted initiation, IPN, independent validation and transaction queries. | [Developer v4](https://developer.sslcommerz.com/doc/v4/) |
| D02 | Initiation: POST `gwprocess/v4/api.php`. Validation: GET `validator/api/validationserverAPI.php`. Queries/refunds: GET `validator/api/merchantTransIDvalidationAPI.php`. | [Developer v4](https://developer.sslcommerz.com/doc/v4/) |
| D03 | Credentials: `store_id`, `store_passwd`. Identities: `tran_id`, `bank_tran_id`, `refund_trans_id`, `refund_ref_id`. | [Developer v4](https://developer.sslcommerz.com/doc/v4/) |
| D04 | Published request range: BDT 10–500,000. `tran_id` and `refund_trans_id`: 30 characters. | [Developer v4](https://developer.sslcommerz.com/doc/v4/) |
| D05 | Refund initiation/status are separate; live public-IP registration is documented. The refund `cancelled` description is ambiguous. | [Developer v4](https://developer.sslcommerz.com/doc/v4/) |
| D06 | Some sample code disables TLS peer verification. Some customer-field required labels conflict. | [Developer v4](https://developer.sslcommerz.com/doc/v4/) |
| D07 | Public channel listing names bKash, Nagad and Rocket. | [Official channel listing](https://sslcommerz.com/pricing/) |

The documentary endpoint references are adapter candidates to confirm against the merchant-supported contract, not new
SportZone public routes. No credentials or example financial instruments are copied into this record.

## Project-contract reconciliation

The following requirements come from [API §§12–13](../API.md#12-payments-cod--gateway-callbacks),
[§16.1](../API.md#161-gateway-boundary), [§17](../API.md#17-security-performance--compatibility) and
[Database §2.2](../DATABASE.md#22-field-standards), not assumptions of live provider behavior.

- Use hosted checkout and the single Express business authority. Keep gateway secrets/backend calls out of frontends.
- Persist a unique attempt against an existing order before initiation; integer poisha remains the financial authority.
  Quote/order totals, current allocation, eligibility and authenticated ownership are checked on the backend.
- Independent validation and receipt intake precede funding/fulfillment decisions. Preserve partial, excess, unmatched,
  duplicate and late genuine collections; never silently discard money or trust a success redirect.
- Store source-linked refund obligations and merchant/provider payout identities separately. Reserve eligible capacity
  transactionally; no provider call inside a transaction, no duplicate payout after timeout and no Completed without proof.
- Bound provider identities/fields before transport. Resolve differing field/requiredness conventions in the adapter;
  never silently truncate verified email/address, invent postal/customer data or change order snapshots.
- Keep transport certificate/hostname verification enabled and diagnostics redacted. Public examples cannot override
  the repository's TLS/security policy. Card/EMI/courier examples do not expand SportZone's initial-release scope.
- Resolve the D05 status ambiguity with provider/account evidence before an affected payout can be considered complete.
  Keep an uncertain financial outcome reserved/under review; do not invent a new local business status or trust a label.
- Generic published amount ranges are not confirmed per-channel merchant limits. Runtime configuration and method
  eligibility require current account-specific evidence; client-supplied amounts remain advisory only.

No governing API/Database/business contract is changed by this assessment. Documentation establishes a candidate
integration path; actual compatibility and supported outcomes still require the execution evidence below.

## Required protected inputs

| Input slot | Required input / owner | Availability in this task | Closure evidence |
| --- | --- | --- | --- |
| CRED-01 | Sandbox merchant identity and credential references; merchant owner / platform | Not supplied | Account-control acknowledgement, protected configuration references and successful authenticated sandbox exchange |
| CRED-02 | Separate production merchant identity, activation and credential references; merchant owner | Not supplied | Actual account ownership, activation and authorized live configuration verification |
| INPUT-03 | Exact wallet identifiers, enablement and amount/time-window limits; merchant / finance owner | Not supplied | Merchant-specific dated channel configuration and boundary results for each required online channel |
| INPUT-04 | Current refund/status mechanisms, partial support, limits and uncertainty/escalation contact; merchant / finance owner | Not supplied | Supported contract, provider clarification and sandbox payout/status evidence by original channel |
| INPUT-05 | Registered callback/return origins, production egress settings and TLS; platform / security owner | Not supplied | Registered transport/origin configuration and actual reachable callback/session/TLS verification |
| INPUT-06 | Refund consent/manual transfer, beneficiary verification and source-proof procedure; finance / store owner | Not supplied | Approved procedure, private evidence references and authorized operator walkthrough |

Names of credential fields identify the integration inputs only. Actual values remain in the protected secret store;
public sample keys cannot substitute for the store's sandbox account. Do not paste secret values or merchant KYC data here.

## Channel and capability readiness

| Required method | Sandbox account-specific acceptance | Live activation / account ownership | Effective channel limits | Original-channel refund/status capability |
| --- | --- | --- | --- | --- |
| bKash via hosted checkout | Pending | Pending | Pending | Pending |
| Nagad via hosted checkout | Pending | Pending | Pending | Pending |
| Rocket via hosted checkout | Pending | Pending | Pending | Pending |

COD is an internal store collection workflow, not an additional gateway channel. Its implementation/verified-collection
and manual refund proof are Not Run under P06-008/P06-012/P08-010. It does not require fabricated provider activation.
All three online channels plus COD remain required for M7; hiding inactive channels never grants a scope waiver.

## Feasibility and execution checklist

Each FG row is a planned evidence slot. Its expected proof, accountable role, owning tasks and existing scenario family
are explicit. Not Run is an execution result, not a failure or a claim that an account does not exist.

| Evidence slot | Capability | Accountable / execution function | Owning tasks | Procedure / required proof | Execution |
| --- | --- | --- | --- | --- | --- |
| `FG-01` | Credentials and environments | Merchant owner / platform | `P07-001`, `P11-005` | ENV-01, SEC-10: Obtain separately scoped sandbox/live identity and secret-store references, enabled-account confirmation and authorized technical contact. Never commit values or reuse public sample credentials. | Not Run |
| `FG-02` | Wallet enablement and channel mapping | Merchant owner / backend | `P07-003`, `P11-005` | GATE-BKASH, GATE-NAGAD, GATE-ROCKET: Obtain actual hosted merchant channel configuration and channel identifiers per wallet; validate server-controlled selection and reject/hide inactive or unsupported methods. | Not Run |
| `FG-03` | Amount and channel limits | Merchant owner / finance | `P07-003`, `P07-004`, `P11-005` | PAY-11: Record current merchant/channel min/max, currency, account and time-window constraints; test boundary/ineligible amounts without guessing runtime caps from a generic example. | Not Run |
| `FG-04` | Hosted initiation | Backend / QA | `P07-001`, `P07-002`, `P07-004` | PAY-01, CHK-05: For an existing eligible order, persist a unique bounded attempt identity and authoritative integer-poisha-derived BDT amount; verify accepted session and approved absolute HTTPS redirect target. No second order from retry. | Not Run |
| `FG-05` | Independent payment validation | Backend / security / QA | `P07-006`, `P07-017` | PAY-01, PAY-02, PAY-03, PAY-14: Match merchant, transaction, expected reference, positive verified amount/currency, provider outcome and risk against backend state. Redirect/IPN input alone never proves payment. | Not Run |
| `FG-06` | IPN and browser-return transport | Backend / platform / QA | `P07-005`, `P07-007`, `P11-003` | PAY-02, PAY-04, PAY-13: Verify exact callback registration, accepted form/GET/POST transport, nonpayment acknowledgment and safe fixed browser redirect; preserve one verified effect under duplicates and out-of-order callbacks. | Not Run |
| `FG-07` | Missing callbacks and uncertain initiation | Backend / QA | `P07-012`, `P07-013` | PAY-05, REL-04: Query by the persisted attempt/provider identity, keep uncertainty visible and reconcile before unsafe re-initiation; preserve original attempt history and stable business effects. | Not Run |
| `FG-08` | Late receipt, allocation and risk | Backend / finance / QA | `P07-008`, `P07-009`, `P07-010` | PAY-06, PAY-07, PAY-08: Record verified receipt before fulfillment decisions; non-cancelled orders reacquire stock and coupon atomically, risk blocks dispatch, and cancelled orders never reopen. | Not Run |
| `FG-09` | Multiple, partial, excess and unmatched receipts | Backend / finance / QA | `P07-011`, `P07-012` | PAY-09, PAY-10, PAY-14: Retain each independently verified receipt once; preserve unmatched intake and merchandise/correction/source allocations without duplicate funding, fulfillment or disappearing money. | Not Run |
| `FG-10` | Refund qualification and source identity | Finance / backend / QA | `P08-005`, `P08-007`, `P08-008` | RFD-02, RFD-05, DB-12: Tie each obligation to exactly one verified collection, eligible basis and class; reserve source/order/quantity capacity before external calls and persist attempt identity first. | Not Run |
| `FG-11` | Partial refund and quantity caps | Backend / finance / QA | `P08-006`, `P08-007`, `P10-004` | RFD-01, RFD-02, RFD-06: Verify merchant/channel partial-refund support plus original snapshot allocations, rounding, delivery entitlement and pending/completed caps. Corrections do not consume merchandise-return units. | Not Run |
| `FG-12` | Gateway refund initiation | Finance / backend / QA | `P08-008`, `P08-018` | RFD-03, RFD-08: Obtain supported request/response contract and access; persist original bank/source identity and unique merchant-generated refund identity before sending. Provider acknowledgment cannot mark Completed. | Not Run |
| `FG-13` | Refund status and timeout safety | Finance / backend / QA | `P08-009`, `P08-011`, `P10-004` | RFD-03, RFD-04, RFD-08, RFD-09, REL-06: Persist returned provider reference, independently verify payout outcome and retain capacity while unknown. Resolve ambiguous/cancelled results before releasing balances or authorizing another payout identity; preserve approval-based policy timing and notify delays without inventing a provider completion deadline. | Not Run |
| `FG-14` | TLS, egress and secret redaction | Platform / security / QA | `P07-001`, `P08-008`, `P11-003` | SEC-10, SEC-11: Keep TLS peer/hostname verification enabled. Confirm actual production egress/callback requirements and protect any provider query-string credentials from logs, traces and browser exposure. | Not Run |
| `FG-15` | Provider field bounds and identity preservation | Backend / QA | `P07-001`, `P07-002`, `P08-008` | API-02, DB-02: Check provider-bound fields against Database §2.2 and the confirmed adapter contract; generate bounded unique identities and fail invalid input explicitly, never truncate customer email/address or alter historical order identity. | Not Run |
| `FG-16` | COD/manual transfer control | Finance / store operator / QA | `P06-008`, `P06-012`, `P08-010` | GATE-COD, PAY-12, RFD-07: COD stays store-managed/unpaid until verified original collection. Manual refund requires eligible collected funds, consent where required, verified transfer proof and authorized confirmation. | Not Run |
| `FG-17` | Per-channel sandbox and live acceptance | Merchant owner / QA / release owner | `P07-017`, `P11-005`, `P11-009` | GATE-BKASH, GATE-NAGAD, GATE-ROCKET, GATE-COD: Record separate channel-specific sandbox results and live activation/limits evidence. A generic successful payment or public wallet listing does not satisfy every required channel. | Not Run |
| `FG-18` | Contract ambiguity resolution | Merchant / finance owner / backend | `P01-006`, `P08-009`, `P11-005` | RFD-03, RFD-08: Obtain dated provider clarification and redacted account-specific examples for disputed status/field/channel behavior; review the adapter mapping before affected payout acceptance. Do not relax project financial/security invariants. | Not Run |

## Outstanding decisions and blocking impact

| Existing EXT reference | Decision/input still to evidence | Accountable function | Affected acceptance / safe continuation |
| --- | --- | --- | --- |
| EXT-01 | CRED-01/02, INPUT-03; actual wallet enablement, supported identifiers, limits and transport | Merchant owner with backend/platform | P07 sandbox and P11 live acceptance wait for account/channel evidence. Local adapter, arithmetic and untrusted-callback tests may proceed through their tasks. |
| EXT-02 | INPUT-04/06; original-channel/partial payout support, limits, uncertain-status semantics and manual/COD verification | Merchant / finance owner with backend | P08 provider payout and M5/M7 financial acceptance wait for verified mechanisms. Obligation/source-cap calculations and fault-test fixtures remain safe independent work. |
| EXT-09 | INPUT-05; deployed exact origins, callback reachability, public egress configuration and secret/TLS isolation | Release/platform/security owner | Integrated staging/production transport acceptance waits for environment evidence. Local configuration/interface planning does not assert a deployed route. |

D05/D06 are documentation/adapter reconciliation findings, not conflicts between approved SportZone specifications.
Do not initiate uncertain financial operations to resolve them. Obtain provider clarification through the authorized
merchant contact and preserve dated evidence; no message to a provider was sent by this task.

## Verification record

| Check | Actual outcome |
| --- | --- |
| Official source inspection | Passed — developer documentation and public channel listing reviewed read-only; source findings cited above |
| Planning deliverable | Passed — six protected input slots, three channel readiness rows and 18 execution check slots |
| Existing contract alignment | Passed — provider field bounds, identities, money, callbacks, receipt retention, source-funded refunds and uncertainty controls retained |
| Prerequisite and scope | Passed — P01-005 Done; no merchant/channel/refund activation is represented as confirmed |
| Static verification | Passed — references, task ownership/dependencies, progress totals, source isolation and Markdown structure |
| Reference and coverage checks | Passed — 704 local links/anchors across 18 Markdown files; 18 FG slots reference all 14 PAY and nine RFD scenarios |
| Merchant-authenticated sandbox / live / payout tests | Not Run — inputs and capability evidence were not supplied |

**Command:** `python3 /tmp/p01-006-verify.py`\
**Whitespace:** `git diff --check`

## Acceptance

**Accepted by:** Project owner\
**Accepted on:** 17 October 2026 (Asia/Dhaka)\
**Acceptance evidence:** Conversation reply to the P01-006 review request: “Gateway/refund assessment গ্রহণ করছি”.

Verification and independent acceptance satisfy [TASKS §2](../TASKS.md#2-task-management-conventions) and
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting). P01-006 is Done; its checkbox and progress totals reflect
this acceptance. This task's acceptance does not verify merchant activation, supported live refunds or any milestone.
