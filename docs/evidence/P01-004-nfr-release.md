# P01-004 — NFR and release acceptance register

**Verified:** 17 October 2026 (Asia/Dhaka)\
**Executor:** Codex\
**Verification:** Passed — planning coverage\
**Task status:** Done

This register completes the nonfunctional handoff from the accepted
[P01-003 register](./P01-003-traceability.md#nonfunctional-handoff-to-p01-004). It maps every bullet in
[PRD §12](../PRD.md#12-non-functional-requirements) and [§18](../PRD.md#18-release-and-handover-outcomes), all
[§14 acceptance checks](../PRD.md#14-acceptance-criteria), and the QA/operations release checklists to tasks and evidence.

Coverage: 55 NFR bullets, 22 release/handover/support bullets, 69 existing AC checks, 28 QA/operations checklist items
and eight milestone records: 182 planned evidence slots. No feature, external capability or milestone is passed by this plan.

## Execution and evidence rules

- Local NFR-12.x-nn and PRD18-x-nn IDs identify the corresponding source subsection and bullet order; QA-FINAL/OPS-M7/
  OPS-M8 identify checklist items. Existing AC, task, test and milestone IDs are retained.
- Every row is a unique planned evidence slot and starts Not Run. The complete source condition is its expected assertion;
  the proof column defines the procedure and artifact. Record Passed/Failed/Blocked only from an actual execution.
- Tasks in PXX own implementation or verification in phase XX; listed functions identify accountable roles, not invented
  named people. Assign actual executor/reviewer and environmental prerequisites before running the check.
- Source clauses are verbatim except joined Markdown line wrapping in multiline checklist items. An inherited AC retains
  its exact condition, owners and cases from P01-003; this register adds NFR and gate controls.
- Every applicable AC is reviewed at M6 and reverified for the deployed scope at M7. The AC gate column identifies its
  first complete evaluation or required provider milestone; earlier slices test their implemented subset. AC-R23 needs
  actual production HTTPS evidence at M7, with staging TLS/origin verification before candidate acceptance.
- Phase 09–10 tasks verify staged controls and recovery; Phase 11 tasks own production-specific observations and
  M7 confirmation. Agree measurement/recovery configuration through P01-005 before the affected staging acceptance;
  do not make M6 depend on completing a production-only task.
- Block affected acceptance when required budgets, provider activation, policy approval, infrastructure or evidence are
  unavailable. Raw measurements, a mock, a generated document or an unchecked checklist cannot establish a pass.

| Per-slot run field | Required record |
| --- | --- |
| Identity | Slot/AC ID, executable case, owning task, source revision and implementation/deployed artifact |
| Environment | Local/CI/staging/authorized production-safe scope, data fixture, provider mode and transaction topology |
| Method | Approved workload/device/browser/configuration, exact command/steps and expected/forbidden outcomes |
| Result | Passed / Failed / Blocked / Not Run, actual observations, defect/EXT references and retest disposition |
| Evidence / acceptance | Sanitized durable artifact, run time, actual executor/reviewer and dated gate decision |

## Nonfunctional clause mapping

### 12.1 Performance

**Source:** [PRD §12.1](../PRD.md#121-performance) · **Accountable functions:** Engineering / QA · **Evaluation:** staging-testable controls at M6; production-specific controls at M7.

| Evidence slot | Requirement (verbatim) | Owning / verification tasks | Procedure / required proof |
| --- | --- | --- | --- |
| `NFR-12.1-01` | Mobile-first performance optimization. | `P10-008`, `P04-014` | PERF-CAT: Measure mobile navigation/product/checkout on the approved device/network profile; retain traces and budget comparison. |
| `NFR-12.1-02` | Optimized product images. | `P04-003`, `P04-011`, `P10-008` | PERF-CAT: Inspect delivered image dimensions/formats, transfer size and page experience against the approved media workload. |
| `NFR-12.1-03` | Pagination for large product lists. | `P04-009`, `P09-009` | DB-04, PERF-CAT, PERF-ADM: Verify bounded stable pages and query plans on representative catalog/admin datasets; reject excessive page/filter inputs. |
| `NFR-12.1-04` | Efficient database queries. | `P04-009`, `P09-002`, `P10-008` | DB-04, PERF-ADM: Retain explain plans, index evidence and measured query costs for catalog, checkout and reporting workloads. |
| `NFR-12.1-05` | Appropriate caching. | `P04-011`, `P10-009` | PERF-CAT, SEC-06: Check public cache invalidation and absence of private session/cart/order data in shared caches; preserve warm/cold traces. |
| `NFR-12.1-06` | Minimized unnecessary API calls. | `P10-008`, `P05-011` | PERF-CART, PERF-CHK: Inspect browser/API traces for redundant requests, state re-fetches and approved call/latency budgets without stale checkout authority. |
| `NFR-12.1-07` | Performance testing for browsing and checkout. Before release testing, agree measurable latency/load and user-experience budgets against representative catalog size, concurrency, devices, and network conditions; record the approved profile in `TESTING.md`. This baseline does not invent capacity or latency targets. | `P10-008` | PERF-CAT, PERF-CART, PERF-CHK, PERF-ADM, PERF-JOB: Approve dataset/load/device/network/latency/error/UX budgets before acceptance runs; compare measured results to that exact profile. |

### 12.2 Security

**Source:** [PRD §12.2](../PRD.md#122-security) · **Accountable functions:** Security / backend / platform · **Evaluation:** staging-testable controls at M6; production-specific controls at M7.

| Evidence slot | Requirement (verbatim) | Owning / verification tasks | Procedure / required proof |
| --- | --- | --- | --- |
| `NFR-12.2-01` | HTTPS for production traffic. | `P11-001`, `P11-003` | SEC-11: Inspect deployed TLS, HTTP upgrade and mixed-content behavior on storefront/admin/API; retain sanitized live-domain evidence. |
| `NFR-12.2-02` | Secure password hashing. | `P03-004`, `P10-005` | DB-01, SEC-01: Verify approved password-hashing behavior, one-way storage and absence of plaintext credentials in records/logs. |
| `NFR-12.2-03` | HTTP-only secure authentication cookies where applicable. | `P03-005`, `P11-003` | SEC-03, SEC-11: Inspect actual customer/admin/guest cookies for HttpOnly/Secure and approved host/context/SameSite isolation. |
| `NFR-12.2-04` | Session expiration and revocation. | `P03-005`, `P10-005` | SEC-03: Advance clocks, revoke/logout/suspend and replay old cookies; confirm stale sessions cannot read or mutate protected data. |
| `NFR-12.2-05` | CSRF protection where applicable. | `P03-006`, `P11-003` | SEC-04, ENV-04: Attempt missing/forged CSRF and Origin on browser mutations; valid contextual requests succeed without cross-context privilege. |
| `NFR-12.2-06` | Server-side input validation. | `P03-001`, `P03-018`, `P10-005` | API-02, SEC-07: Exercise runtime validators for path/query/header/body input, unknown/protected keys and invalid business values; assert no forbidden side effects. |
| `NFR-12.2-07` | Authentication rate limiting. | `P03-014`, `P10-005` | SEC-01: Run isolated throttling, enumeration and recovery-abuse negatives; record limits from environment configuration. |
| `NFR-12.2-08` | Role and ownership authorization. | `P03-013`, `P10-005` | SEC-02, SEC-05, SEC-06: Test wrong-role and cross-owner access, including nested evidence/refund/complaint records and scoped guest proof. |
| `NFR-12.2-09` | Validate SSLCOMMERZ payments on the server. | `P07-006`, `P07-017` | PAY-01, PAY-02, PAY-03, PAY-14: Reject redirect/forged evidence; independently verify merchant/reference/currency/amount/status and retain each genuine receipt once. |
| `NFR-12.2-10` | Separate sandbox and live credentials. | `P03-003`, `P11-005` | ENV-01: Attest distinct sandbox/live accounts, keys, data and service modes; fail unsafe configuration without exposing secret values. |
| `NFR-12.2-11` | Use valid TLS and protect merchant secrets. | `P07-001`, `P11-003`, `P11-005` | SEC-10, SEC-11: Verify provider TLS and backend-only secret custody; inspect redacted logs, errors and frontend build output. |
| `NFR-12.2-12` | Refund authorization. | `P08-007`, `P10-005` | SEC-02, SEC-06, RFD-02: Reject unauthorized approval/payout and source tampering; valid administrator actions preserve quantity and funding caps. |
| `NFR-12.2-13` | Idempotent financial operations. | `P06-006`, `P07-007`, `P08-007`, `P10-003`, `P10-004` | CHK-04, PAY-04, RFD-02, REL-06: Replay concurrent requests/callbacks/jobs; inspect one order/effect per identity and no duplicate or uncertain second payout. |
| `NFR-12.2-14` | Secrets stored outside source code. | `P03-003`, `P01-010`, `P11-001` | ENV-01, SEC-10: Inspect secret-manager/config references, repository and build/log scans; verify no privileged secret is browser-exposed. |
| `NFR-12.2-15` | Protection against common OWASP web vulnerabilities. | `P10-005` | SEC-01, SEC-04, SEC-06, SEC-08, SEC-09, SEC-13: Perform authorized bounded injection, script, CSRF, access, upload and replay checks; retain findings and retest evidence. |
| `NFR-12.2-16` | Audit logging for sensitive operations. | `P03-014`, `P09-007`, `P10-005` | DB-08, SEC-12: Inspect actor/action/time and durable append-only audit records for privileged financial, inventory, access and policy changes. |

### 12.3 Reliability

**Source:** [PRD §12.3](../PRD.md#123-reliability) · **Accountable functions:** Backend / platform / QA · **Evaluation:** staging-testable controls at M6; production-specific controls at M7.

| Evidence slot | Requirement (verbatim) | Owning / verification tasks | Procedure / required proof |
| --- | --- | --- | --- |
| `NFR-12.3-01` | Production monitoring. | `P11-004`, `P11-010` | TESTING §13.2; OPERATIONS §9: Exercise health, metrics, backlog and incident alert routes with named duty coverage; retain actual observations. |
| `NFR-12.3-02` | Error tracking. | `P03-003`, `P11-004` | REL-01, REL-07: Inject safe errors and verify correlated redacted diagnostics, alert delivery and owned follow-up. |
| `NFR-12.3-03` | Automated database backups. | `P01-005`, `P09-011`, `P10-011`, `P11-002` | REL-08: Inspect scheduled backup/PITR policy, encryption, custody and freshness evidence from the selected transaction-capable service. |
| `NFR-12.3-04` | Periodic restoration testing. | `P10-011`, `P11-010` | REL-08, DB-10: Run isolated restore with indexes/history/counters; reconcile post-cutoff external and independently evidenced local events and enumerate irrecoverable gaps. |
| `NFR-12.3-05` | Safe payment and refund retries. | `P07-013`, `P08-009`, `P10-003`, `P10-004` | PAY-05, REL-06: Inject provider timeout before/after possible acceptance; retain uncertain capacity and investigate before safe retry. |
| `NFR-12.3-06` | Consistent inventory operations. | `P04-008`, `P06-007`, `P10-002` | INV-01, INV-02, INV-03, DB-05: Race stock/coupon checkout, expiry, shipment and inspected restock; verify atomic nonnegative counters and unique movements. |
| `NFR-12.3-07` | Graceful error handling. | `P03-001`, `P02-008`, `P10-001` | API-02; TESTING §14.1: Simulate validation/network/server failures; preserve input and accurate pending/error/retry state without sensitive leakage. |
| `NFR-12.3-08` | Recovery from interrupted transactions. | `P10-011`, `P06-006`, `P11-004` | REL-01, REL-02, REL-07, REL-08: Crash at commit/response/lease boundaries; recover durable intents, all-or-nothing state and fenced workers; quarantine unresolved funds or lost local facts. |

### 12.4 Availability

**Source:** [PRD §12.4](../PRD.md#124-availability) · **Accountable functions:** Platform / store owner · **Evaluation:** staging-testable controls at M6; production-specific controls at M7.

| Evidence slot | Requirement (verbatim) | Owning / verification tasks | Procedure / required proof |
| --- | --- | --- | --- |
| `NFR-12.4-01` | The website and order-processing services should remain continuously available under normal conditions. | `P11-004`, `P11-010` | OPERATIONS §§9–10; DEP-01: Observe serving and business-worker health under the approved operating profile; record downtime rather than assume uptime. |
| `NFR-12.4-02` | Planned maintenance should be minimized. | `P10-011`, `P11-010` | DEP-01, DEP-02: Rehearse compatible rollout/rollback and maintenance/callback continuity; compare disruption with the approved maintenance budget. |
| `NFR-12.4-03` | Availability and downtime should be monitored. | `P11-004`, `P11-010` | OPERATIONS §§9–10: Exercise availability/error/worker alerts and record incident start/end, duty routing and measured downtime. |
| `NFR-12.4-04` | A formal uptime target will be agreed based on the selected infrastructure and service budget. | `P01-005`, `P11-010` | TESTING §13.1; OPERATIONS §§10–11: Record store/platform-approved uptime target, measurement window, exclusions, budget and escalation before availability acceptance. |

### 12.5 Responsive design

**Source:** [PRD §12.5](../PRD.md#125-responsive-design) · **Accountable functions:** Frontend / QA · **Evaluation:** staging-testable controls at M6; production-specific controls at M7.

| Evidence slot | Requirement (verbatim) | Owning / verification tasks | Procedure / required proof |
| --- | --- | --- | --- |
| `NFR-12.5-01` | Mobile phones. | `P10-007`, `P02-011` | TESTING §14.2: Test mobile critical journeys, reflow/touch/navigation and both themes; record actual device/OS/viewport/browser. |
| `NFR-12.5-02` | Tablets. | `P10-007`, `P02-011` | TESTING §14.2: Test tablet layout/orientation, controls and admin table overflow in both themes; retain device matrix and traces. |
| `NFR-12.5-03` | Laptops. | `P10-007`, `P02-011` | TESTING §14.2: Test laptop viewport, zoom/keyboard and both themes across discovery, checkout and admin flows. |
| `NFR-12.5-04` | Desktop computers. | `P10-007`, `P02-011` | TESTING §14.2: Test desktop layouts, readable forms/tables and full critical journeys without clipped controls. |

### 12.6 Accessibility

**Source:** [PRD §12.6](../PRD.md#126-accessibility) · **Accountable functions:** Frontend / accessibility QA · **Evaluation:** staging-testable controls at M6; production-specific controls at M7.

| Evidence slot | Requirement (verbatim) | Owning / verification tasks | Procedure / required proof |
| --- | --- | --- | --- |
| `NFR-12.6-01` | Keyboard-accessible controls. | `P10-006`, `P02-008` | TESTING §14.1: Complete critical actions with keyboard; verify focus order/visibility, dialog trapping/return, escape and navigation. |
| `NFR-12.6-02` | Clear form labels. | `P10-006`, `P02-008` | TESTING §14.1: Inspect programmatic labels, required states and input associations using DOM and appropriate assistive technology. |
| `NFR-12.6-03` | Accessible error messages. | `P10-006`, `P02-008` | TESTING §14.1: Trigger validation and asynchronous failures; check associated errors, summary focus/live announcements and preserved input. |
| `NFR-12.6-04` | Sufficient color contrast. | `P10-006`, `P02-003` | TESTING §14.1: Measure text/control/non-text contrast in both themes; verify semantic tokens and approved blue/white primary buttons. |
| `NFR-12.6-05` | Alternative text for meaningful images. | `P10-006`, `P04-014` | TESTING §14.1: Inspect meaningful product/evidence image alternatives and decorative-image treatment with screen-reader checks. |
| `NFR-12.6-06` | WCAG 2.2 AA as the accessibility target. | `P10-006`, `P02-011` | TESTING §14.1: Combine automated scan with keyboard/manual AT, reflow, focus, target and reduced-motion checks; resolve applicable WCAG 2.2 AA findings. |

### 12.7 Browser compatibility

**Source:** [PRD §12.7](../PRD.md#127-browser-compatibility) · **Accountable functions:** Frontend / QA · **Evaluation:** staging-testable controls at M6; production-specific controls at M7.

| Evidence slot | Requirement (verbatim) | Owning / verification tasks | Procedure / required proof |
| --- | --- | --- | --- |
| `NFR-12.7-01` | Google Chrome. | `P10-007` | TESTING §14.2: Record actual stable Chrome version/OS and run critical storefront/admin journeys in both themes. |
| `NFR-12.7-02` | Mozilla Firefox. | `P10-007` | TESTING §14.2: Record actual stable Firefox version/OS and run critical storefront/admin journeys in both themes. |
| `NFR-12.7-03` | Microsoft Edge. | `P10-007` | TESTING §14.2: Record actual stable Edge version/OS and run critical storefront/admin journeys in both themes. |
| `NFR-12.7-04` | Brave. | `P10-007` | TESTING §14.2: Record actual stable Brave version/OS and run critical storefront/admin journeys in both themes. |
| `NFR-12.7-05` | Safari. | `P10-007` | TESTING §14.2: Record actual stable Safari/macOS or iOS version and critical journeys; WebKit emulation alone is insufficient proof of Safari behavior. |

### 12.8 Data protection

**Source:** [PRD §12.8](../PRD.md#128-data-protection) · **Accountable functions:** Security / privacy / platform · **Evaluation:** staging-testable controls at M6; production-specific controls at M7.

| Evidence slot | Requirement (verbatim) | Owning / verification tasks | Procedure / required proof |
| --- | --- | --- | --- |
| `NFR-12.8-01` | Customer data access must be restricted. | `P03-013`, `P10-005` | SEC-05, SEC-06, SEC-12: Verify least-privilege scoped reads/writes, masked admin projections and denial of cross-customer/guest/report access. |
| `NFR-12.8-02` | Payment credentials must not be stored directly. | `P07-001`, `P10-005` | SEC-10: Inspect request DTOs, persisted receipts, provider adapter and frontend/log output; retain no direct sensitive payment credentials. |
| `NFR-12.8-03` | Sensitive logs must be protected. | `P03-003`, `P11-004`, `P10-005` | SEC-10, SEC-12: Verify redaction, restricted log access and environment retention rules with synthetic secret/PII markers. |
| `NFR-12.8-04` | Backup access must be limited. | `P01-005`, `P09-011`, `P10-011`, `P11-002` | REL-08; OPERATIONS §11: Exercise restricted backup/restore principals, protected storage/key custody and auditable access without distributing live dumps. |
| `NFR-12.8-05` | Customer-facing privacy information must be available. | `P09-008`, `P11-007` | SET-02, UI-CONTENT: Verify approved versioned privacy content is publicly reachable and historical policy references remain intact. |

## PRD release, handover and support mapping

Source: PRD §§18.1–18.3. Ownership/account/contract records require actual store or receiving-party acknowledgement;
this mapping does not select a warranty period, provider fee or support commitment.

| Evidence slot | Source requirement (verbatim) | Owning / verification tasks | Gate / accountable function | Procedure / required proof |
| --- | --- | --- | --- | --- |
| `PRD18-1-01` | Core acceptance criteria must pass. | `P10-013`, `P11-011` | M6 + M7 / QA / authorized release owner | All 69 AC slots; TESTING §18: Require passing per-item artifacts and defect disposition, then explicit production authorization. |
| `PRD18-1-02` | Payment methods must be tested and verified. | `P07-017`, `P11-005`, `P11-009` | M4 + M7 / Merchant / QA / release owner | GATE-BKASH, GATE-NAGAD, GATE-ROCKET, GATE-COD: Require distinct sandbox and live-channel acceptance for all three hosted methods plus COD; hiding channels does not waive launch. |
| `PRD18-1-03` | Refund procedures must be tested. | `P08-018`, `P11-009` | M5 + M7 / Finance / merchant / QA | RFD-01, RFD-02, RFD-07, RFD-08, REL-06: Verify source-funded partial/full payout, manual consent/proof, uncertainty and safe retry; provider acceptance is not completion. |
| `PRD18-1-04` | Administrator access must be configured. | `P03-012`, `P11-003`, `P11-006` | M1 + M7 / Security / store owner | SEC-02, SEC-03, SEC-11: Privately provision authorized admin ownership/recovery and verify deployed session/role isolation. |
| `PRD18-1-05` | Delivery charges and zones must be configured. | `P06-001`, `P11-006` | M3 + M7 / Store / fulfillment owner | ADM-05, ORD-05, ORD-08: Load approved Bangladesh coverage and charge versions; reject unsupported areas and preserve old snapshots. |
| `PRD18-1-06` | Store policies must be published. | `P11-007`, `P09-008` | M7 / Store / legal/privacy reviewer | SET-02, SET-03, UI-CONTENT: Publish approved current-authority policy versions and real support/complaint information; preserve accepted order terms. |
| `PRD18-1-07` | Production monitoring must be enabled. | `P11-004`, `P11-010` | M7 / Platform / operations owner | OPERATIONS §§9–10: Exercise restricted probes, redacted metrics/logs, alert routing and incident contacts on deployed infrastructure. |
| `PRD18-1-08` | Backup and recovery procedures must be checked. | `P10-011`, `P11-002`, `P11-010` | M6 + M7 / Data / platform owner | REL-08, DB-10, DEP-01, DEP-02: Keep restore and application rollback evidence separate; verify RPO/RTO, writer fencing and external-effect reconciliation. |
| `PRD18-1-09` | Production checkout must be verified. | `P11-008`, `P11-009` | M7 / Release / merchant / store owner | TESTING §18; OPERATIONS §17.4: Use authorized low-risk production smoke; no unapproved charge/payout or synthetic customer/financial success. |
| `PRD18-2-01` | Source code and repository access. | `P12-006` | M8 / Store owner / receiving operator | OPERATIONS §18: Confirm repository/account control and actual receiving-party access; do not expose credentials. |
| `PRD18-2-02` | Deployment configuration documentation. | `P12-003` | M8 / Platform / receiving operator | DEP-01, DEP-02: Reproduce build/deploy/rollback inputs and operating procedures against the deployed artifact. |
| `PRD18-2-03` | Environment variable documentation without exposing secrets. | `P12-001`, `P12-003` | M8 / Platform / security owner | ENV-01; OPERATIONS Appendix B: Hand over exact validated config keys and protected secret references; exclude secret values from docs. |
| `PRD18-2-04` | Administrator account handover. | `P12-006` | M8 / Store / security owner | SEC-02, SEC-03: Privately transfer admin ownership/recovery and least-privilege access with acknowledgements. |
| `PRD18-2-05` | Database backup and restoration instructions. | `P12-003` | M8 / Data / receiving operator | REL-08; OPERATIONS §11: Walk through backup/restore and reconciliation instructions with recorded restore evidence and recovery contacts. |
| `PRD18-2-06` | Payment-provider configuration documentation. | `P12-005` | M8 / Merchant / finance owner | OPERATIONS §12: Transfer merchant/channel/callback/refund ownership, uncertainty procedure and protected configuration references. |
| `PRD18-2-07` | Basic administration guide. | `P12-004` | M8 / Store / receiving operator | OPERATIONS §16: Walk through actual catalog, stock, fulfillment, complaints, COD, returns and refund interfaces. |
| `PRD18-2-08` | Known limitations and operational dependencies. | `P12-007` | M8 / Store / support owner | OPERATIONS §18: Accept documented constraints, third-party dependencies, ongoing costs and support boundaries without waiving mandatory gates. |
| `PRD18-3-01` | Development defects identified during the agreed warranty period will be corrected under the project agreement. | `P12-007` | M8 / Store / support owner | Agreement / defect record: Record agreed warranty scope/period and defect-report/fix/retest responsibilities; invent no contractual duration. |
| `PRD18-3-02` | New features and scope changes require separate approval. | `P12-007` | M8 and subsequent changes / Store / authorized change owner | Implementation Plan §13.2: Require approved scope/contract updates before adding features; preserve financial/security/product invariants. |
| `PRD18-3-03` | Third-party service charges are excluded unless explicitly agreed. | `P12-007` | M8 / Store / account owner | Agreement / service-cost record: Record provider billing responsibility and explicitly agreed exceptions without inventing prices. |
| `PRD18-3-04` | Ongoing maintenance responsibilities must be documented. | `P12-007` | M8 / Store / receiving support owner | OPERATIONS §18: Record service coverage, escalation, maintenance obligations and actual support acceptance. |
| `PRD18-3-05` | Store ownership and control of production accounts must be established before handover. | `P12-006`, `P12-009` | M8 / Store owner / receiving operator | OPERATIONS §18: Verify actual ownership/control of domain, hosting, DB, email, media, merchant and recovery accounts before handover. |

## Existing product acceptance controls

The 69 AC conditions and owners below remain aligned with the accepted
[P01-003 product acceptance mapping](./P01-003-traceability.md#product-acceptance-checks) and TESTING Appendix B.
The NFR areas are minimum cross-cutting controls; apply other relevant NFRs when a feature's behavior warrants them.

| Existing AC slot | Required condition (verbatim) | Existing accountable / shared tasks | Evaluation gate(s) | NFR controls / planned cases |
| --- | --- | --- | --- | --- |
| `AC-C01` | Customers can register, log in, and reset passwords. | `P03-007` | M1 | §§12.2, 12.3, 12.5–12.8; `API-01, SEC-01, SEC-03` |
| `AC-C02` | Customers can manage profiles and addresses. | `P03-008` | M1 | §§12.2, 12.3, 12.5–12.8; `ACC-01`–`ACC-05`, `SEC-06` |
| `AC-C03` | Guests can place orders without creating accounts. | `P06-004` | M3 | §§12.2, 12.3, 12.5–12.8; `CHK-01, ORD-07` |
| `AC-C04` | Guests can access only their own orders after email verification. | `P06-015` | M3 | §§12.2, 12.3, 12.5–12.8; `API-09, SEC-05, ORD-07` |
| `AC-C05` | Product browsing, search, filtering, and sorting work. | `P04-009` | M2 | §§12.1–12.3, 12.5–12.8; `CAT-01, CAT-03, UI-CAT` |
| `AC-C06` | Product variants and stock are handled correctly. | `P04-010` | M2 | §§12.2, 12.3, 12.5–12.8; `CAT-02, INV-01` |
| `AC-C07` | Shopping carts persist appropriately. | `P05-002` | M3 | §§12.2, 12.3, 12.5–12.8; `SHP-01` |
| `AC-C08` | Wishlists work across sessions. | `P05-004` | M3 | §§12.2, 12.3, 12.5–12.8; `SHP-02` (cross-session persistence) |
| `AC-C09` | Product discounts calculate correctly. | `P05-005` | M3 | §§12.2, 12.3, 12.5–12.8; `PRM-01, FX-MONEY-01/02` |
| `AC-C10` | Concurrent coupon use respects limits; expired holds are released. | `P05-007`, `P06-010`, `P10-002` | M3 | §§12.2, 12.3, 12.5–12.8; `PRM-03, PRM-04, INV-02` |
| `AC-C11` | Eligible customers can submit reviews. | `P05-009` | M5 | §§12.2, 12.3, 12.5–12.8; `REV-01` |
| `AC-C12` | Reviews are moderated appropriately. | `P09-006` | M5 | §§12.2, 12.3, 12.5–12.8; `REV-01, UI-ADMIN` |
| `AC-C13` | Checkout calculates accurate order totals. | `P06-004` | M3 | §§12.1–12.3, 12.5–12.8; `CHK-03, PRM-01` |
| `AC-C14` | Customers can place COD orders. | `P06-008` | M3 | §§12.2, 12.3, 12.5–12.8; `CHK-02, PAY-12, GATE-COD` |
| `AC-C15` | bKash payments work through approved integration. | `P07-017`, `P11-005`, `P11-009` | M4 + M7 | §§12.2, 12.3, 12.5–12.8; `PAY-01, GATE-BKASH` |
| `AC-C16` | Nagad payments work through approved integration. | `P07-017`, `P11-005`, `P11-009` | M4 + M7 | §§12.2, 12.3, 12.5–12.8; `PAY-01, GATE-NAGAD` |
| `AC-C17` | Rocket payments work through approved integration. | `P07-017`, `P11-005`, `P11-009` | M4 + M7 | §§12.2, 12.3, 12.5–12.8; `PAY-01, GATE-ROCKET` |
| `AC-C18` | Online payments are verified server-side. | `P07-006` | M4 | §§12.2, 12.3, 12.5–12.8; `PAY-01, PAY-02, PAY-03` |
| `AC-C19` | Payment retries create no duplicate orders or repeated effects for the same collection; independently paid attempts remain recorded and excess collections enter correction/refund resolution. | `P07-011`, `P06-006`, `P07-007`, `P07-013`, `P08-007` | M4 + M5 | §§12.2, 12.3, 12.5–12.8; `CHK-04, PAY-04, PAY-09, RFD-05` |
| `AC-C20` | Customers can view order status. | `P06-014` | M3 | §§12.2, 12.3, 12.5–12.8; `ORD-01, UI-ORD` |
| `AC-C21` | Customers can request eligible cancellations. | `P06-013` | M3 | §§12.2, 12.3, 12.5–12.8; `ORD-02, ORD-03` |
| `AC-C22` | Customers can request eligible returns. | `P08-002` | M5 | §§12.2, 12.3, 12.5–12.8; `RET-01, RET-05` |
| `AC-C23` | Physical returns are inspected before related refunds are approved; approved missing-item/shortage claims do not require a fictional physical return. | `P08-004`, `P08-003`, `P08-005` | M5 | §§12.2, 12.3, 12.5–12.8; `RET-02, RET-03` |
| `AC-C24` | Guest coupon eligibility respects the account requirement for per-customer limits. | `P05-006` | M3 | §§12.2, 12.3, 12.5–12.8; `PRM-02` |
| `AC-C25` | COD placement commits allocation once and remains Pending until administrator confirmation. | `P06-008` | M3 | §§12.2, 12.3, 12.5–12.8; `CHK-02, INV-01` |
| `AC-C26` | Customers can track refund status. | `P08-013` | M5 | §§12.2, 12.3, 12.5–12.8; `RFD-03, RFD-09, UI-AFTERSALES` |
| `AC-C27` | Customers receive important transactional notifications. | `P03-009`, `P06-016`, `P07-016`, `P08-011` | M6 | §§12.2, 12.3, 12.5–12.8; `NTC-01`–`NTC-12`, `REL-05` |
| `AC-A01` | Administrator authentication is secure. | `P03-012` | M1 | §§12.2, 12.3, 12.5–12.8; `SEC-02, SEC-03, UI-ADMIN-AUTH` |
| `AC-A02` | Products and variants can be managed. | `P04-005` | M2 | §§12.2, 12.3, 12.5–12.8; `CAT-01, CAT-02, UI-ADMIN` |
| `AC-A03` | Categories can be managed. | `P04-004` | M2 | §§12.2, 12.3, 12.5–12.8; `CAT-01, UI-ADMIN` |
| `AC-A04` | Physical, reserved, committed, and available stock remain consistent. | `P04-006` | M2–M5 | §§12.2, 12.3, 12.5–12.8; `INV-01, INV-03, DB-09` |
| `AC-A05` | Delivery zones can be configured. | `P06-001` | M3 | §§12.2, 12.3, 12.5–12.8; `ADM-05, ORD-05` |
| `AC-A06` | Delivery charges can be changed. | `P06-001` | M3 | §§12.2, 12.3, 12.5–12.8; `ADM-05, ORD-05, API-04` |
| `AC-A07` | Updated charges apply only to future orders. | `P06-001` | M3 | §§12.2, 12.3, 12.5–12.8; `ADM-05, ORD-05, DB-07` |
| `AC-A08` | Orders can be managed. | `P06-011` | M3 | §§12.2, 12.3, 12.5–12.8; `ORD-01, ORD-04, UI-ADMIN` |
| `AC-A09` | Customer complaints can be recorded and resolved. | `P09-004` | M6 | §§12.2, 12.3, 12.5–12.8; `SUP-01`–`SUP-04`, `REL-10` |
| `AC-A10` | COD collections can be recorded. | `P06-012` | M3 | §§12.2, 12.3, 12.5–12.8; `PAY-12` |
| `AC-A11` | Payment records can be reviewed. | `P07-015` | M4 | §§12.2, 12.3, 12.5–12.8; `PAY-05, PAY-09, UI-ADMIN` |
| `AC-A12` | Coupons can be managed. | `P05-008` | M3 | §§12.2, 12.3, 12.5–12.8; `PRM-02, PRM-03, UI-ADMIN` |
| `AC-A13` | Reviews can be moderated. | `P09-006` | M5 | §§12.2, 12.3, 12.5–12.8; `REV-01, UI-ADMIN` |
| `AC-A14` | Return requests can be processed. | `P08-003` | M5 | §§12.2, 12.3, 12.5–12.8; `RET-01, RET-05` |
| `AC-A15` | Full and partial refunds can be processed. | `P08-015`, `P08-006`, `P08-007`, `P08-008`, `P08-009`, `P08-010` | M5 | §§12.2, 12.3, 12.5–12.8; `RFD-01, RFD-02, RFD-07` |
| `AC-A16` | Refund history is preserved. | `P08-005`, `P08-011` | M5 | §§12.2, 12.3, 12.5–12.8; `DB-08, RFD-03, RFD-04` |
| `AC-A17` | Dashboard metrics account for refunds and COD. | `P09-001` | M6 | §§12.1–12.3, 12.5–12.8; `ADM-06, RFD-05, PAY-12` |
| `AC-A18` | Sensitive administrative actions are logged. | `P09-007` | M6 | §§12.2, 12.3, 12.5–12.8; `SEC-12, DB-08` |
| `AC-R01` | Duplicate checkout submissions do not create duplicate orders. | `P06-006` | M3 | §§12.2–12.8; `CHK-04, CHK-05` |
| `AC-R02` | Concurrent purchases cannot oversell stock. | `P10-002` | M3 | §§12.2–12.8; `INV-01` |
| `AC-R03` | Expired payment reservations are released. | `P06-010` | M3 | §§12.2–12.8; `INV-02, REL-03` |
| `AC-R04` | Duplicate payment callbacks do not duplicate financial effects. | `P07-007` | M4 | §§12.2–12.8; `PAY-04` |
| `AC-R05` | Combined pending and completed refunds never exceed the collected payment. | `P08-007` | M5 | §§12.2–12.8; `RFD-02, DB-12` |
| `AC-R06` | Duplicate refunds are prevented. | `P08-007` | M5 | §§12.2–12.8; `RFD-02, RFD-04` |
| `AC-R07` | Partial refunds use original item prices, discounts, and quantities. | `P08-006` | M5 | §§12.2–12.8; `RFD-01, FX-MONEY-03` |
| `AC-R08` | Unauthorized users cannot access protected data. | `P10-005` | M1–M6 | §§12.2–12.8; `API-03, SEC-06` |
| `AC-R09` | Invalid order status transitions are rejected. | `P06-011` | M3 | §§12.2–12.8; `ORD-01, ORD-03` |
| `AC-R10` | Core customer and admin workflows pass functional testing. | `P10-001` | M6 | §§12.2–12.8; `UI-HOME, UI-CAT, UI-CHECKOUT, UI-ADMIN` |
| `AC-R11` | SSLCOMMERZ IPN and browser-return paths are independently reconciled with validated provider status. | `P07-005` | M4 | §§12.2–12.8; `PAY-01, PAY-02, PAY-05` |
| `AC-R12` | Payment validation rejects mismatched transaction reference, amount, currency or merchant account. | `P07-006` | M4 | §§12.2–12.8; `PAY-03, PAY-10, PAY-14` |
| `AC-R13` | Risk-flagged transactions remain on hold pending authorized review. | `P07-010` | M4 | §§12.2–12.8; `PAY-08` |
| `AC-R14` | Late verified payments recheck inventory and coupon capacity only for eligible non-cancelled orders; unavailable capacity holds fulfillment for refund or admin resolution. | `P07-009`, `P07-010`, `P08-007` | M4 | §§12.2–12.8; `PAY-06` |
| `AC-R15` | A verified payment after cancellation is recorded without reopening fulfillment. | `P07-011` | M4 | §§12.2–12.8; `PAY-07` |
| `AC-R16` | Duplicate collections remain recorded and can be refunded against their own source balance without duplicating fulfillment. | `P07-011` | M5 | §§12.2–12.8; `PAY-09, RFD-05` |
| `AC-R17` | Final failed-delivery closure records custody/disposition; only recovered inspected resellable goods are restocked. | `P06-017` | M5 | §§12.2–12.8; `ORD-04, RET-06` |
| `AC-R18` | Refund initiation and verified refund completion are recorded as distinct events. | `P08-009` | M5 | §§12.2–12.8; `RFD-03, RFD-08` |
| `AC-R19` | COD payment remains unpaid until collection is verified. | `P06-012` | M3 | §§12.2–12.8; `PAY-12` |
| `AC-R20` | Checkout shows applicable delivery deadlines; complaints receive a tracked response. | `P06-003`, `P09-004`, `P11-007` | M6 | §§12.2–12.8; `ORD-06, SUP-04, REL-10` |
| `AC-R21` | Payment and refund sandbox tests pass. | `P07-017`, `P08-018`, `P10-003`, `P10-004` | M5 | §§12.2–12.8; `PAY-01, RFD-08 + sandbox evidence` |
| `AC-R22` | Database backup and restore procedures are verified. | `P10-011`, `P01-004` | M6 | §§12.3, 12.4, 12.8; `REL-08, DB-10` (loss-gap reconciliation) |
| `AC-R23` | Production services use HTTPS. | `P11-001`, `P01-004` | M7 | §12.2; `SEC-11, ENV-01` |
| `AC-R24` | Website functions across supported devices and browsers. | `P10-007`, `P01-004` | M6 | §§12.5–12.7; `§14 device/browser matrix` |

## QA and operational release checklists

Sources: [Testing §18.3](../TESTING.md#183-final-review-checklist),
[Operations §17.2](../OPERATIONS.md#172-m7-production-readiness-checklist) and
[§17.3](../OPERATIONS.md#173-m8-handover-checklist). Required proof is the complete source condition plus the
per-slot run record; retain deployment, provider, policy and receiving-party evidence as applicable.

| Evidence slot | Source condition (verbatim, line wrapping joined) | Owning / verification tasks | Evaluation gate |
| --- | --- | --- | --- |
| `QA-FINAL-01` | Source versions and approved design decisions match executable tests. | `P10-013` | M6 / M7 / M8 as applicable |
| `QA-FINAL-02` | All FR-01–FR-34 and §14 criteria have actual case/result/evidence links. | `P10-001` | M6 / M7 / M8 as applicable |
| `QA-FINAL-03` | Every implemented API operation has contract and access tests. | `P03-018`, `P10-001` | M6 / M7 / M8 as applicable |
| `QA-FINAL-04` | High-risk MongoDB indexes/transactions and concurrency tests passed against transactional topology. | `P10-002` | M6 / M7 / M8 as applicable |
| `QA-FINAL-05` | Gateway/COD/late-payment/unmatched-cash/refund scenarios have complete evidence. | `P07-017`, `P08-018` | M6 / M7 / M8 as applicable |
| `QA-FINAL-06` | Staging devices, browsers, themes, security, restoration **and rollback rehearsal**, plus performance budgets checked. | `P10-006`, `P10-007`, `P10-008`, `P10-011` | M6 / M7 / M8 as applicable |
| `QA-FINAL-07` | Critical/remaining defect triage and open external dependencies approved. | `P10-012`, `P10-013` | M6 / M7 / M8 as applicable |
| `QA-FINAL-08` | Gate owner signs M1–M8 individually when applicable; no assumed completion. | `P10-013`, `P11-011`, `P12-009` | M6 / M7 / M8 as applicable |
| `OPS-M7-01` | Approved hosting/topology, inventory, domain/DNS/TLS, billing owner and isolated environments recorded. | `P11-001` | M7 |
| `OPS-M7-02` | CI/staging M6 evidence linked; production artifacts and compatible schema/index migration rehearsed. | `P11-010` | M7 |
| `OPS-M7-03` | MongoDB transaction support, indexes, backups, approved recovery targets and successful isolated restore demonstrated. | `P11-002`, `P10-011` | M7 |
| `OPS-M7-04` | Restricted liveness/readiness, logs, metrics, alerts and named incident contacts are working. | `P11-004`, `P11-010` | M7 |
| `OPS-M7-05` | Worker leases, restart/idempotency, expiry jobs and payment/refund reconciliation backlog observed and verified. | `P11-004` | M7 |
| `OPS-M7-06` | Customer/admin/guest cookie separation, allowed origins/CSRF and real deployed callback reachability verified. | `P11-003` | M7 |
| `OPS-M7-07` | Merchant activation and **verified bKash, Nagad, Rocket and COD acceptance** recorded or approved PRD revision already in force. | `P11-005`, `P11-009` | M7 |
| `OPS-M7-08` | Approved provider refund pathways/limits and unknown payout incident procedures verified. | `P11-009` | M7 |
| `OPS-M7-09` | Operator-provided branding/products/stock/delivery settings/support contacts and versioned legally reviewed policies published. | `P11-006`, `P11-007` | M7 |
| `OPS-M7-10` | Safe production browsing/auth/guest/COD/payment/admin smoke evidence recorded, with no unapproved live charge or payout. | `P11-008`, `P11-009` | M7 |
| `OPS-M7-11` | DR single-writer/callback cutover, revoked-session invalidation, post-backup COD/manual payout reconciliation and exception quarantine exercised on staging. | `P10-011`, `P11-010` | M7 |
| `OPS-M7-12` | Callback continuity during maintenance and independently reviewed financial-close controls demonstrated. | `P09-002`, `P11-010` | M7 |
| `OPS-M7-13` | Rollback compatibility, controlled financial recovery and release approval explicitly signed. | `P11-010`, `P11-011` | M7 |
| `OPS-M8-01` | Source repository, deployment identity, immutable release artifacts and tested build/deploy procedures transferred. | `P12-001`, `P12-003`, `P12-006` | M8 |
| `OPS-M8-02` | DNS, hosting, MongoDB, backups, merchant, Cloudinary and email account ownership assigned and acknowledged. | `P12-006` | M8 |
| `OPS-M8-03` | Administrators privately provisioned/recovered; least-privilege accounts and rotation procedures transferred without secret values in documentation. | `P12-006` | M8 |
| `OPS-M8-04` | Runbooks OP-PROV/REL/DB/JOB/INC/DR/FIN/SEC/PRIV/MNT/STORE walked through by recipient. | `P12-003`, `P12-004`, `P12-005` | M8 |
| `OPS-M8-05` | Actual schedules, RPO/RTO, backups, monitoring queries, alert routes, escalation and support boundaries attached to operating inventory. | `P12-003`, `P12-006` | M8 |
| `OPS-M8-06` | Known limitations, provider restrictions, subscriptions/costs, blocked decisions and ongoing maintenance agreements recorded. | `P12-007` | M8 |
| `OPS-M8-07` | `TASKS.md` evidence/status reconciled; final owner acceptance dated and signed. | `P12-008`, `P12-009` | M8 |

## Milestone acceptance controls

Source: [Implementation Plan §11](../IMPLEMENTATION_PLAN.md#11-milestones--acceptance-gates) and
[Testing §18.1](../TESTING.md#181-phase-milestones). These are acceptance prerequisites, not a blanket ban on safe
parallel development. No milestone status in TASKS.md changes through this planning task.

| Existing gate slot | Required evidence (Implementation Plan, verbatim) | Gate task | Acceptance prerequisites | Decision function |
| --- | --- | --- | --- | --- |
| `M1` | Builds/type checks, API/DB health, session separation, baseline CI and token tests | `P03-016` | Foundation task dependencies | Assigned independent technical / QA approver |
| `M2` | Admin CRUD, unique SKU/slug, stock invariants, public search/variant flows | `P04-015` | M1 | Assigned independent technical / QA approver |
| `M3` | Guest/customer checkout, accurate quote, duplicate safety, stock/coupon commitment, order/guest access | `P06-020` | M2 + P05-013 shopping readiness | Assigned independent technical / QA approver |
| `M4` | Gateway sandbox verification, IPN/retry/reconcile, late pay, risk hold, duplicate-collection evidence | `P07-017` | M3 | Assigned independent technical / QA approver |
| `M5` | Valid return/inspection, refund caps and allocation, verified gateway/manual payout, audit history | `P08-018` | M4 | Assigned independent technical / QA approver |
| `M6` | FR-01–FR-34 coverage, completed required admin UI, NFR/security/accessibility/concurrency regression on staging | `P10-013` | M1–M5 + integrated staging | Assigned independent technical / QA approver |
| `M7` | Approved policies/merchant channels, HTTPS, rollback, backup/restore, monitoring, live-safe smoke checks | `P11-011` | M6 | Authorized store/release owner |
| `M8` | Repository, configuration, runbooks, operator guide, ownership, support boundaries, known limitations | `P12-009` | M7 + completed handover review | Authorized store/release owner |

## Measurement and configuration approvals

| Input | Required agreement / record before interpreting a pass | Accountable function / follow-through |
| --- | --- | --- |
| Performance | Versioned dataset size/mix, concurrency/load, device/network classes, p50/p95/p99/error/UX budgets, cache state, server limits and provider-double/sandbox scope | Engineering / QA with store/platform acceptance; P10-008; EXT-03/09 |
| Availability / maintenance | Formal uptime target, measurement window, planned-maintenance treatment, service budget, alert thresholds and duty escalation | Store / platform owner; P01-005, P11-010; EXT-09 |
| Recovery | Backup/PITR cadence/window, retention/legal holds, independent key custody, RPO/RTO, restore drill and authorized gap disposition | Data / security / store owner; P10-011, P11-002; EXT-03/08/09 |
| Device / browser / AT | Actual stable browser and OS versions, representative phone/tablet/laptop/desktop viewports, real Safari checks where needed, assistive technology, both themes and reduced motion | Frontend / QA; P10-006, P10-007 |
| Security / privacy | Environment-specific cookies/origins/expiry/throttles, upload policy, protected logs/backups, retention/erasure/legal holds and approved published privacy copy | Security / privacy / store owner; P10-005, P11-003, P11-007; EXT-04/08/09 |
| Merchant / published commitments | Live bKash/Nagad/Rocket activation plus COD, verified limits/refund/status mechanisms, delivery coverage and current approved customer policies | Merchant / finance / store owner; P01-006, P01-007, P11-005–P11-009; EXT-01/02/07/08 |

Store actual values and approvals in the protected operating inventory and approved test profiles. This task invents no
latency, concurrency, uptime, retention, recovery or contractual numbers. Existing PRD/Design targets remain authoritative.

## Mandatory release-blocking controls

- A mandatory NFR, AC, source requirement or checklist item without passing evidence blocks the affected gate. S0 or any
  unresolved financial, stock, authorization or privacy failure cannot be waived by treating it as an accepted limitation.
- M6 requires integrated staging, complete applicable source coverage and passing security, accessibility, browser,
  concurrency, performance and recovery evidence. Required measurable budgets must exist before acceptance testing.
- M7 additionally requires all three online channels plus COD, actual merchant/refund capabilities, current approved
  published policies, configured store/admin ownership, HTTPS/origin controls, backups/restore, alert routes and safe smoke.
- Restore must preserve/reconcile external receipts/payouts, enumerate unreconstructable local gaps, fence old writers,
  reject restored stale auth proofs and authorize reopening; rollback rehearsal is a separate compatibility control.
- Production-safe verification creates no unapproved charge, payout, customer-data export or destructive correction.
  Provider acceptance or a browser redirect does not prove money collected/disbursed.
- M8 requires real access/account transfers, rehearsed runbooks, support/cost/limitation records and explicit receiving
  acceptance. Documentation or checklist generation alone cannot accept a gate.

## Verification record

**Command:** `python3 /tmp/p01-004-verify.py`\
**Whitespace:** `git diff --check`\
**Result:** Passed — static source, task, case/reference, coverage, prerequisite and Markdown checks.

The check compares all 55 PRD §12 bullets, all 22 PRD §18 bullets, all 69 existing ACs, eight QA final-check bullets,
13 M7 and seven M8 operations bullets, and all eight milestone evidence descriptions. It verifies unique slots, valid
owners, unchanged task dependencies/prior evidence/specifications and reconciled dashboard totals. Runtime, device,
security/provider, restore and production checks remain Not Run until the mapped execution tasks produce actual results.

| Validation | Observed result |
| --- | --- |
| Exact source coverage | Passed — 55 NFRs, 22 PRD §18 clauses, 28 QA/operations checklist items and eight milestone evidence descriptions |
| Prior acceptance parity | Passed — all 69 AC conditions, task owners and planned cases retained |
| Unique evidence slots | Passed — 182 slots with owning tasks and verification/evidence requirements |
| Task and milestone integrity | Passed — all 171 task IDs/dependencies and existing milestone acceptance states preserved |
| Documentation integrity | Passed — 681 local links/anchors across 16 Markdown files; structure and whitespace valid |
| Change isolation | Passed — governing specifications, prior evidence and staged user changes preserved |

## Acceptance

**Accepted by:** Project owner\
**Accepted on:** 17 October 2026 (Asia/Dhaka)\
**Acceptance evidence:** Conversation reply to the P01-004 review request: “NFR/release register গ্রহণ করছি”.

Verification and independent acceptance satisfy [TASKS §2](../TASKS.md#2-task-management-conventions) and
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting). P01-004 is Done; its checkbox and progress totals reflect
this acceptance. This acceptance covers the mapping task only; M1–M8 remain separately unaccepted.
