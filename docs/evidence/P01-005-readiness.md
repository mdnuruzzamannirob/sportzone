# P01-005 — Operator and external-service readiness register

**Opened / verified:** 17 October 2026 (Asia/Dhaka)\
**Executor:** Codex\
**Verification:** Passed — register completeness\
**Task status:** Done

Open the register required by P01-005 using [PRD §19](../PRD.md#19-assumptions-and-operational-dependencies),
[Implementation Plan §4.4](../IMPLEMENTATION_PLAN.md#44-integration-and-operator-readiness-register),
[TASKS §6.1](../TASKS.md#61-external-readiness-and-blocker-register) and
[Operations §18.1](../OPERATIONS.md#181-responsibility-matrix). The prerequisite
[P01-002](./P01-002-scope.md#acceptance) is Done with project-owner acceptance.

The repository supplies specifications and accepted planning records; no service-account, named operating appointment,
merchant activation or policy-approval evidence was supplied for this task. Pending means unverified/not supplied,
not that an account is absent, a person has declined ownership or a provider has failed. No account/service is modified.

## Ownership and readiness rules

- Accountable functions below follow the operations responsibility matrix. The project owner appoints actual named
  people and obtains their acknowledgement; a role label is not a fabricated personal assignment or service ownership.
- Record sandbox/test and production readiness separately. Local synthetic fixtures or a mock cannot establish either
  provider acceptance or live activation. Operator inputs without environments use test-fixture versus live-approved scope.
- Current named appointment, sandbox/test readiness and production readiness are Pending for all nine EXT IDs.
  Completed planning tasks do not close external gates or change any M1–M8 acceptance status.
- An entry becomes Verified only when its named owner, exact environment/configuration, actual required evidence and
  independent reviewer decision are recorded. Keep partial evidence scoped; a sandbox pass does not verify production.
- Track evidence as protected references, not credentials, raw merchant documents, customer data or private recovery links
  in Git. Keep deployment values in [Operations Appendix B](../OPERATIONS.md#appendix-b--configuration-inventory).
- When a dependency actually prevents execution/acceptance, update only the affected task to Blocked with EXT ID, owner,
  missing input, risk, evidence and next action. Unrelated safe work continues; future tasks are not all declared Blocked.
- Preserve PRD scope: one Bangladesh store, BDT, one primary admin role, manual shipment updates, all three hosted online
  channels plus COD. Inactive channels stay hidden; their absence does not waive initial-release acceptance.

## Current readiness inventory

| Existing ID | Service / operator input | Accountable function | Execution / review functions | Named appointment | Sandbox / test readiness | Production readiness |
| --- | --- | --- | --- | --- | --- | --- |
| `EXT-01` | SSLCOMMERZ merchant and channels | Merchant owner | Backend lead / QA | Pending | Pending | Pending |
| `EXT-02` | Gateway and COD/manual refund capability | Merchant / finance owner | Backend lead / QA | Pending | Pending | Pending |
| `EXT-03` | MongoDB transactions, indexes and recovery | Infrastructure / data owner | Backend / security / QA | Pending | Pending | Pending |
| `EXT-04` | Cloudinary, product media and private evidence | Store administrator | Backend / security / QA | Pending | Pending | Pending |
| `EXT-05` | Transactional email and proof delivery | Store owner | Backend / security / QA | Pending | Pending | Pending |
| `EXT-06` | Store identity, catalog, pricing and opening stock | Store administrator | Catalog operator / backend / QA | Pending | Pending | Pending |
| `EXT-07` | Delivery coverage, charges and fulfillment arrangements | Store administrator | Fulfillment / support / backend / QA | Pending | Pending | Pending |
| `EXT-08` | Published policies, customer rights and privacy | Store owner / authorized policy approver | Qualified legal/privacy reviewer / support / QA | Pending | Pending | Pending |
| `EXT-09` | Hosting, domains, environment security and operations | Release owner | Infrastructure / security / backend / QA | Pending | Pending | Pending |

## Entry records and next actions

### EXT-01

**Area:** SSLCOMMERZ merchant and channels · **Accountable function:** Merchant owner · **Execution/review functions:** Backend lead / QA

| Register field | Required record / disposition |
| --- | --- |
| Named assignment | Pending — project owner appoints the accountable individual and execution/review contacts; service ownership must be acknowledged |
| Input / decision | Merchant onboarding/account control; distinct sandbox/live merchant identities and protected credential references; supported initiation/validation/IPN/return transport, BDT limits and bKash/Nagad/Rocket enablement. |
| Required closure evidence | Versioned merchant-specific capability reference, redacted sandbox exchanges and independently verified receipts per channel; production ownership and separate live activation/acceptance for all three hosted channels. COD is separately verified under P06-008/P06-012. |
| Earliest / follow-through tasks | `P01-006`, `P07-001`, `P07-003`, `P07-017`, `P11-005`, `P11-009` |
| Blocking condition / acceptance impact | P01-006 feasibility cannot verify account-specific capabilities without documentation/access. P07 sandbox acceptance requires real sandbox proof; M7 requires all three live online channels plus COD. |
| Safe independent work | Implement isolated adapter interfaces, validators and synthetic callback fault tests; keep unactivated channels hidden. Doubles do not establish merchant activation. |
| Next action | Accountable function obtains the named appointment and protected input/evidence references; execute the linked task's checks and submit actual results for independent acceptance |
| Evidence available in this task | Not supplied — readiness remains Pending; this records neither an absent account nor a failed provider |
| Revalidation trigger | Merchant/account/channel/limit/callback changes require fresh evidence and API/config compatibility review. |

### EXT-02

**Area:** Gateway and COD/manual refund capability · **Accountable function:** Merchant / finance owner · **Execution/review functions:** Backend lead / QA

| Register field | Required record / disposition |
| --- | --- |
| Named assignment | Pending — project owner appoints the accountable individual and execution/review contacts; service ownership must be acknowledged |
| Input / decision | Supported original-channel refund/status mechanism and limits per verified source; manual/COD consent, beneficiary verification and transfer-confirmation procedure; escalation contact for uncertain payouts. |
| Required closure evidence | Account-specific provider reference, sandbox request/status/failure evidence, source-balance/quantity caps and approved manual-transfer consent/proof procedure; actual completed payout distinguished from request acceptance. |
| Earliest / follow-through tasks | `P01-006`, `P08-008`, `P08-009`, `P08-010`, `P08-018`, `P11-005`, `P11-009` |
| Blocking condition / acceptance impact | Payout integration/acceptance waits for supported mechanisms and verification evidence. Never blindly resubmit an unknown payout or mark a request Completed. M5/M7 need verified supported pathways. |
| Safe independent work | Build source-funded obligations, deterministic calculations, concurrency and timeout tests with isolated synthetic records; preserve unknown commitments. |
| Next action | Accountable function obtains the named appointment and protected input/evidence references; execute the linked task's checks and submit actual results for independent acceptance |
| Evidence available in this task | Not supplied — readiness remains Pending; this records neither an absent account nor a failed provider |
| Revalidation trigger | Provider/refund capability, payout identity, manual method or authorized finance contact changes require revalidation. |

### EXT-03

**Area:** MongoDB transactions, indexes and recovery · **Accountable function:** Infrastructure / data owner · **Execution/review functions:** Backend / security / QA

| Register field | Required record / disposition |
| --- | --- |
| Named assignment | Pending — project owner appoints the accountable individual and execution/review contacts; service ownership must be acknowledged |
| Input / decision | Isolated transaction-capable local/CI/staging/production topology; runtime/index/migration/backup principals; backup/PITR storage and independent key custody; retention, RPO/RTO and restore-drill policy. |
| Required closure evidence | Real transaction commit/abort and unique-index results; isolated environment manifest; protected backup configuration and freshness; restore with writer fencing, revoked restored proofs, post-cutoff receipt/manual-event reconciliation and explicit lost-gap disposition. |
| Earliest / follow-through tasks | `P03-002`, `P03-003`, `P09-011`, `P10-011`, `P11-002`, `P11-010` |
| Blocking condition / acceptance impact | Transaction-dependent acceptance cannot use standalone MongoDB. M6/M7 recovery acceptance requires approved objectives and a measured isolated restore, not snapshot creation alone. |
| Safe independent work | Prepare schemas/migrations and isolated replica-set fixtures through their owning tasks; perform no live-data export or destructive migration. |
| Next action | Accountable function obtains the named appointment and protected input/evidence references; execute the linked task's checks and submit actual results for independent acceptance |
| Evidence available in this task | Not supplied — readiness remains Pending; this records neither an absent account nor a failed provider |
| Revalidation trigger | Topology, service/version, schema/index, backup/key/retention or recovery-target changes trigger compatible tests and recovery review. |

### EXT-04

**Area:** Cloudinary, product media and private evidence · **Accountable function:** Store administrator · **Execution/review functions:** Backend / security / QA

| Register field | Required record / disposition |
| --- | --- |
| Named assignment | Pending — project owner appoints the accountable individual and execution/review contacts; service ownership must be acknowledged |
| Input / decision | Account/control and protected API references; authorized product/category/brand assets; allowed type/size/scan policy; upload intent/ownership, private claim delivery, temporary lifetime, cleanup and legal holds. |
| Required closure evidence | Ownership attestation and permitted asset inventory; validated upload/attachment/deletion and orphan-race tests; private evidence scope/access tests and verified provider deletion/reconciliation behavior. |
| Earliest / follow-through tasks | `P04-003`, `P04-005`, `P08-012`, `P10-005`, `P11-006` |
| Blocking condition / acceptance impact | Real upload/private-delivery acceptance requires account/configuration and security evidence. Public product media cannot imply public access to return evidence. |
| Safe independent work | Use licensed/synthetic fixtures and adapter fault tests; implement scoped mediaAssets intent/CAS and secure retrieval with no invented live upload success. |
| Next action | Accountable function obtains the named appointment and protected input/evidence references; execute the linked task's checks and submit actual results for independent acceptance |
| Evidence available in this task | Not supplied — readiness remains Pending; this records neither an absent account nor a failed provider |
| Revalidation trigger | Account, asset rights, privacy/scan/size policy, deletion settings or retention/hold changes require renewed review. |

### EXT-05

**Area:** Transactional email and proof delivery · **Accountable function:** Store owner · **Execution/review functions:** Backend / security / QA

| Register field | Required record / disposition |
| --- | --- |
| Named assignment | Pending — project owner appoints the accountable individual and execution/review contacts; service ownership must be acknowledged |
| Input / decision | Provider account and verified sender/domain; isolated nonproduction/live resources; deliverability, rate/retry policy and supported provider idempotency/status; external versioned proof-delivery key references and key custodian. |
| Required closure evidence | Sender/control confirmation, captured nonproduction deliveries, purpose-scoped proof/reissue/expiry tests, deduplication and uncertain-send evidence, AEAD tamper/key-loss denial and redacted logs; production sender verification. |
| Earliest / follow-through tasks | `P03-009`, `P03-010`, `P06-015`, `P06-016`, `P07-016`, `P08-011`, `P10-010`, `P11-004` |
| Blocking condition / acceptance impact | Real delivery acceptance needs sender/provider evidence. Account recovery and guest email access cannot claim delivery from outbox insertion; unknown send does not justify replaying business work. |
| Safe independent work | Use isolated capture transport and synthetic recipients; exercise reference-only outbox, key rotation, crashes and safe proof reissue without sending unsolicited mail. |
| Next action | Accountable function obtains the named appointment and protected input/evidence references; execute the linked task's checks and submit actual results for independent acceptance |
| Evidence available in this task | Not supplied — readiness remains Pending; this records neither an absent account nor a failed provider |
| Revalidation trigger | Sender/domain/provider, transport capability, retry limits, template scope or proof-key custody changes invalidate the affected evidence. |

### EXT-06

**Area:** Store identity, catalog, pricing and opening stock · **Accountable function:** Store administrator · **Execution/review functions:** Catalog operator / backend / QA

| Register field | Required record / disposition |
| --- | --- |
| Named assignment | Pending — project owner appoints the accountable individual and execution/review contacts; service ownership must be acknowledged |
| Input / decision | Final store name/logo/address, support and complaint contacts; authorized product images/descriptions/categories/variants/SKUs, integer-poisha prices and approved opening stock; administrator account ownership. |
| Required closure evidence | Store-owner approved versioned asset/catalog/config manifest, unique SKU/slug and price/stock validation, audited opening balances, actual contact checks and private administrator ownership/recovery acknowledgement. |
| Earliest / follow-through tasks | `P04-002`, `P04-005`, `P04-012`, `P09-005`, `P09-008`, `P11-006` |
| Blocking condition / acceptance impact | Synthetic data supports development; production content/load cannot be accepted without operator approval and validated initial balances. Account ownership also requires EXT-09 security evidence. |
| Safe independent work | Develop catalog/home/settings with explicitly synthetic fixtures and placeholders; never present fabricated business identity, contacts or opening stock as live. |
| Next action | Accountable function obtains the named appointment and protected input/evidence references; execute the linked task's checks and submit actual results for independent acceptance |
| Evidence available in this task | Not supplied — readiness remains Pending; this records neither an absent account nor a failed provider |
| Revalidation trigger | Identity/contact, asset rights, catalog/price/stock or admin-owner changes need the appropriate audited/versioned update; historical snapshots stay immutable. |

### EXT-07

**Area:** Delivery coverage, charges and fulfillment arrangements · **Accountable function:** Store administrator · **Execution/review functions:** Fulfillment / support / backend / QA

| Register field | Required record / disposition |
| --- | --- |
| Named assignment | Pending — project owner appoints the accountable individual and execution/review contacts; service ownership must be acknowledged |
| Input / decision | Approved Bangladesh districts/areas/coverage keys, charges and effective periods; delivery partners/manual fulfillment contacts, capacity and exception/custody process; published commitment basis and complaint-response handoff with EXT-08. |
| Required closure evidence | Versioned zone/charge approval, unsupported-area rejection, global coverage guard tests, unchanged old order snapshots, confirmed deadline basis, manual shipment/failed-delivery and complaint-response walkthrough. |
| Earliest / follow-through tasks | `P01-007`, `P06-001`, `P06-002`, `P06-003`, `P06-017`, `P09-004`, `P11-006` |
| Blocking condition / acceptance impact | Checkout/delivery acceptance needs approved operating data and applicable policy basis. M7 cannot promise unsupported coverage; statutory start events/deadlines are verified through EXT-08. |
| Safe independent work | Use synthetic coverage and future-only charge fixtures; implement manual status/custody/exception flows. No courier API or GPS feature is added. |
| Next action | Accountable function obtains the named appointment and protected input/evidence references; execute the linked task's checks and submit actual results for independent acceptance |
| Evidence available in this task | Not supplied — readiness remains Pending; this records neither an absent account nor a failed provider |
| Revalidation trigger | Coverage/charge schedule, fulfillment arrangements, capacity, deadline basis or operational contact changes require future-only configuration and renewed applicable checks. |

### EXT-08

**Area:** Published policies, customer rights and privacy · **Accountable function:** Store owner / authorized policy approver · **Execution/review functions:** Qualified legal/privacy reviewer / support / QA

| Register field | Required record / disposition |
| --- | --- |
| Named assignment | Pending — project owner appoints the accountable individual and execution/review contacts; service ownership must be acknowledged |
| Input / decision | Current authoritative delivery/complaint/cancellation/return/refund/privacy requirements; approved customer-facing text, effective versions and business calendar; retention/erasure/legal holds and complaint support contacts. |
| Required closure evidence | Dated authoritative review, operator approval, published effective policy versions and historical order references; applicable deadline/start-event/calendar and remedy/consent rules; privacy/retention configuration approval. |
| Earliest / follow-through tasks | `P01-007`, `P06-003`, `P08-002`, `P08-005`, `P09-005`, `P09-008`, `P11-007` |
| Blocking condition / acceptance impact | Development defaults remain the PRD baseline; publishing/legal/launch acceptance requires current qualified/operator evidence. Policy text cannot waive statutory customer rights or invent legal deadlines. |
| Safe independent work | Implement versioned policy workflows and synthetic approved-policy fixtures. P01-007 identifies detailed review gates; do not label drafts legally certified. |
| Next action | Accountable function obtains the named appointment and protected input/evidence references; execute the linked task's checks and submit actual results for independent acceptance |
| Evidence available in this task | Not supplied — readiness remains Pending; this records neither an absent account nor a failed provider |
| Revalidation trigger | Law, provider terms, published copy, calendar, privacy/retention or fulfillment promise changes need owning-source review and preserved historical customer terms. |

### EXT-09

**Area:** Hosting, domains, environment security and operations · **Accountable function:** Release owner · **Execution/review functions:** Infrastructure / security / backend / QA

| Register field | Required record / disposition |
| --- | --- |
| Named assignment | Pending — project owner appoints the accountable individual and execution/review contacts; service ownership must be acknowledged |
| Input / decision | Account/billing/recovery control; runtime/region/domain/DNS/TLS topology, exact origins and callback/guest URLs; protected per-key secret registry; named duty/escalation and service support; approved performance, availability/maintenance and recovery profiles. |
| Required closure evidence | Isolated staging/production manifest, DNS/TLS/account acknowledgement, validated secret references, real cookie/CORS/CSRF/callback traces, measured workload profiles, monitoring/alert-route drills and compatible deploy/rollback/restore evidence. |
| Earliest / follow-through tasks | `P03-003`, `P09-011`, `P09-012`, `P10-008`, `P10-011`, `P11-001`, `P11-003`, `P11-004`, `P11-010`, `P12-006` |
| Blocking condition / acceptance impact | P09-012 integrated staging precedes Phase 10; M6 measurement/recovery needs approved profiles and isolated infrastructure. M7/M8 need deployed ownership, duty coverage and operational acceptance. |
| Safe independent work | Create local workspace/config validators and deterministic fixtures in their owning tasks; document candidate origin/config interfaces without claiming a chosen host or provisioned live resource. |
| Next action | Accountable function obtains the named appointment and protected input/evidence references; execute the linked task's checks and submit actual results for independent acceptance |
| Evidence available in this task | Not supplied — readiness remains Pending; this records neither an absent account nor a failed provider |
| Revalidation trigger | Account/region/domain/origin/callback, runtime/secret, duty contact, workload/SLO/RPO/RTO or support changes trigger environment/security/operational revalidation. |

## PRD dependency and operator-input coverage

Every source item in PRD §§19.3–19.4 has an EXT reference and accountable function. The provider API reference is an
input for P01-006 verification, not a claim that external material was read or a capability was established here.

| Source slot | Source requirement (verbatim) | Existing EXT references | Accountable function |
| --- | --- | --- | --- |
| `PRD19.3-01` | SSLCOMMERZ merchant account and credentials. | EXT-01 | Merchant owner |
| `PRD19.3-02` | SSLCOMMERZ activation of bKash, Nagad, and Rocket channels. | EXT-01 | Merchant owner |
| `PRD19.3-03` | [SSLCOMMERZ payment and refund API reference](https://developer.sslcommerz.com/doc/v4/). | EXT-01, EXT-02 | Merchant / finance owner |
| `PRD19.3-04` | Email delivery service. | EXT-05 | Store owner |
| `PRD19.3-05` | Product images and catalog data. | EXT-04, EXT-06 | Store administrator |
| `PRD19.3-06` | Delivery partners or fulfillment arrangements. | EXT-07 | Store administrator / fulfillment |
| `PRD19.3-07` | Production infrastructure. | EXT-03, EXT-09 | Infrastructure / data / release owner |
| `PRD19.3-08` | Store branding and contact details. | EXT-06 | Store administrator |
| `PRD19.4-01` | Final store name and logo. | EXT-06 | Store administrator |
| `PRD19.4-02` | Product catalog and initial stock. | EXT-06 | Store administrator |
| `PRD19.4-03` | Product prices. | EXT-06 | Store administrator |
| `PRD19.4-04` | Delivery zone coverage. | EXT-07 | Store administrator / fulfillment |
| `PRD19.4-05` | Initial delivery charges. | EXT-07 | Store administrator / fulfillment |
| `PRD19.4-06` | Customer support contact information. | EXT-06, EXT-07, EXT-08 | Store owner / support |
| `PRD19.4-07` | SSLCOMMERZ merchant credentials. | EXT-01 | Merchant owner |
| `PRD19.4-08` | Published policies. | EXT-08 | Store owner / policy approver |
| `PRD19.4-09` | Administrative account ownership. | EXT-06, EXT-09 | Store / security owner |

The confirmed scope/default policies in PRD §§19.1–19.2 remain the accepted
[P01-002 baseline](./P01-002-scope.md#implementation-policy-baseline). Current-authority publication and merchant-specific
capability verification proceed through EXT-01/02/08 and P01-006/P01-007; this register grants no legal/provider approval.

## Implementation Plan readiness coverage

All eight dependencies from Implementation Plan §4.4 retain their original action and acceptance boundary.

| Dependency (verbatim) | Earliest required action (verbatim) | Acceptance dependency (verbatim) | Existing EXT references / accountable function |
| --- | --- | --- | --- |
| SSLCOMMERZ | Confirm merchant onboarding, sandbox access, activated channels, limits, validation and refund capabilities | Sandbox payment/refund evidence in Phases 07–08; live activation in Phase 11 | EXT-01, EXT-02 / Merchant / finance owner |
| MongoDB | Select transaction-capable deployment and backup/restore method | Inventory/checkout concurrency tests and production release | EXT-03 / Infrastructure / data owner |
| Cloudinary | Confirm account, allowed uploads, credentials, and image policy | Product media implementation in Phase 04 | EXT-04 / Store administrator / security |
| Transactional email | Approve sender/service and test delivery | Recovery, guest access, order events; production sender readiness | EXT-05 / Store owner / backend |
| Catalog assets | Obtain approved products, variants, prices, images, categories, stock | Realistic catalog and production launch | EXT-04, EXT-06 / Store administrator |
| Store configuration | Confirm delivery zones/charges, contact, fulfillment process, policy content | Checkout, support, operational acceptance | EXT-06, EXT-07, EXT-08 / Store administrator / policy approver |
| Hosting and DNS | Confirm origin/domain plan supporting API sessions and Next.js runtime | Staging integration and Phase 11 launch | EXT-09 / Release / infrastructure owner |
| Consumer/legal policy review | Verify applicable delivery, complaint, cancellation, return, refund, and privacy requirements against current authority | Public policy publication and production acceptance | EXT-08 / Store owner / qualified reviewer |

## Protected evidence and ownership record

Use one record per EXT/environment/capability; never overwrite a prior accepted revision or collapse sandbox/live proof.

| Required field | Record content |
| --- | --- |
| Identity | EXT ID, capability/input, environment, current record revision and linked source/task |
| Accountable owner | Actual named owner, acknowledgement date, executing reviewer/contact and protected escalation reference |
| Account / asset control | Restricted ownership attestation, recovery/billing/contact authority and service/configuration reference |
| Evidence | Actual test/run/artifact reference, provider/policy version, verification date and sanitized result |
| Decision | Pending / In Verification / Verified / Blocked / Revalidation Required; actual reviewer and acceptance date |
| Impact / next action | Earliest affected task/gate, missing prerequisite, safe independent work and next verification step |
| Revalidation | Configuration/provider/policy/ownership change, superseding evidence and current valid scope |

Named assignment and evidence collection are follow-through actions, not invented completion. The store owner retains
control of business/provider accounts; technical access uses authorized least privilege. Formal workload, availability,
maintenance, backup/retention/RPO/RTO and incident coverage records are obtained before the affected acceptance runs,
following the accepted [P01-004 measurement requirements](./P01-004-nfr-release.md#measurement-and-configuration-approvals).

## Opening checklist and verification

- [x] P01-002 accepted prerequisite verified.
- [x] Preserved EXT-01–EXT-09 identities and their service/scope meanings.
- [x] Every entry records accountable functions, named appointment state, environment readiness and evidence needs.
- [x] Every entry includes blocking impact, safe independent work, next action and revalidation triggers.
- [x] All eight PRD §19.3 dependencies, nine §19.4 inputs and eight Plan §4.4 rows are mapped.
- [x] Merchant/refunds, MongoDB/recovery, email, Cloudinary/media, catalog/branding, delivery, policies and hosting are covered.
- [x] No unknown activation, ownership, live credential, legal approval or provider result is marked Verified.
- [x] Existing source specifications, accepted evidence, task IDs/dependencies and milestone states remain unchanged.

**Command:** `python3 /tmp/p01-005-verify.py`\
**Whitespace:** `git diff --check`\
**Result:** Passed — static register completeness, source/reference, state, prerequisite and Markdown checks.\
**External account/provider/legal/runtime verification:** Not Run — no such verification is claimed by this register.

| Validation | Observed result |
| --- | --- |
| EXT coverage and fields | Passed — nine entries, each with all nine required record/disposition fields |
| Unknown readiness state | Passed — all 27 named-appointment, test-readiness and production-readiness states remain Pending |
| Source coverage | Passed — all 17 PRD dependency/operator inputs and eight Plan readiness dependencies mapped |
| Task and approval integrity | Passed — 171 task IDs/dependencies, prior accepted records and milestone states preserved |
| Documentation integrity | Passed — 694 local links/anchors across 17 Markdown files; tables, fences and whitespace valid |
| Change isolation | Passed — governing specifications, prior evidence and staged user changes preserved |

## Acceptance

**Accepted by:** Project owner\
**Accepted on:** 17 October 2026 (Asia/Dhaka)\
**Acceptance evidence:** Conversation reply to the P01-005 review request: “Readiness register গ্রহণ করছি”.

Verification and independent acceptance satisfy [TASKS §2](../TASKS.md#2-task-management-conventions) and
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting). P01-005 is Done; its checkbox and progress totals reflect
this acceptance. Acceptance completes the register task only; its external readiness entries remain Pending until evidenced.
