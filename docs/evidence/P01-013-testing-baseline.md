# P01-013 — Testing baseline review

**Reviewed:** 17 October 2026 (Asia/Dhaka)\
**Executor:** Codex\
**Task status:** Done\
**Result:** Passed — baseline consistency and local tooling verification\
**Prerequisites:** P01-004, P01-008 and P01-009 Done

## Scope and source authority

Reviewed [TESTING.md](../TESTING.md) against PRD [§12](../PRD.md#12-non-functional-requirements) and
[§14](../PRD.md#14-acceptance-criteria), [Architecture §12](../ARCHITECTURE.md#12-reliability--performance),
[Implementation Plan §4.3](../IMPLEMENTATION_PLAN.md#43-database-and-application-infrastructure), the owning
[Database](../DATABASE.md) and [API](../API.md) contracts, plus [Design](../DESIGN.md),
[Operations](../OPERATIONS.md) and [TASKS](../TASKS.md).

The review preserves existing application scenarios, acceptance IDs and required execution interface. It clarifies actual
root tooling versus future application tools/scripts, the existing test file versus planned layout, and tooling execution
versus unexecuted product coverage. No application/runtime/CI code or approved requirement was changed.

## Review coverage

| Area | Source / baseline reviewed | Finding |
| --- | --- | --- |
| Test levels | Testing §3; Plan §§3.3,10.1 | Eleven layers/types cover domain/component/API/persistence/contract/E2E/security/performance/recovery/accessibility/regression; real trust boundaries require higher-level proof |
| Environments | Testing §4 and Appendix C; Plan §4.3 | Local/CI/staging/production-safe scopes, real transactional DB, clock/fault controls, separated identities/providers, synthetic data and cleanup prerequisites |
| Current tooling | Testing §5; actual manifests, ci-workspaces.json and CI | Four real root commands; Node tooling regressions exist; no application toolkit or future command is falsely reported installed |
| Fixtures | Testing §6; Database §2 and financial/stock contracts | Twelve named numerical/admin vectors plus role/state catalog; integer-poisha rounding/allocation, ordinal amounts, stock and signed reports remain consistent |
| Functional traceability | Testing §16.2; accepted P01-003 | Every FR-01–FR-34 has existing test specifications, feature handoff and later verification owners below |
| NFR/release traceability | Testing §16.3; accepted P01-004 | All 55 NFR clause slots retain verification owners and evidence requirements; staging/production-specific evidence kept separate |
| Critical financial/security paths | Testing §§8–13; accepted P01-008 | All 35 safety scenarios retain existing case references and owning feature/QA tasks; doubles never waive actual provider/transaction/restore proof |
| Acceptance checklist | Testing Appendix B; PRD §14 | All 69 stable AC entries retain planned scenarios and Not Run state; documentation approval does not mark product acceptance passed |
| Endpoint contracts | Testing §8.2 and Appendix E; API Appendix D | All 164 method/path operations have exact OPV slots, access/success/error profiles and planned checks; these are not runnable tests |
| Evidence and defect control | Testing §§16–18; TASKS §§2,8 | Executable/planned/run counts distinct; redacted reproducible artifacts and independent acceptance; no arbitrary global coverage budget or fake external readiness |
| Feature/release handoff | Testing §§15,18; Plan §§7,11 | Extend suites before enabling risky integrated mutations; M1–M8 remain separately unaccepted; four required payment methods preserved |

## Functional verification ownership

Feature handoff follows the default accountable task in accepted P01-003. Existing shared/clause owners remain in that
register. P10-001 owns all-FR integration; the additional named P10 task supplies the focused security/race/payment/refund/
notification regression where applicable. Task owners are accountable work items, not invented named appointments.
All listed application cases/suites remain Planned / Not Run until implementation and actual evidence exist.

| FR | Feature handoff | Later verification owners | Existing planned tests / suites |
| --- | --- | --- | --- |
| FR-01 | `P03-007` | `P10-001`, `P10-005` | `API-01`, `API-02`, `SEC-01`, `SEC-03`, `UI-ACCOUNT` |
| FR-02 | `P03-008` | `P10-001`, `P10-005` | `ACC-01`–`ACC-05`, `SEC-06`, `UI-ACCOUNT` |
| FR-03 | `P04-012` | `P10-001` | `UI-HOME`, `UI-CONTENT`, `CAT-01` |
| FR-04 | `P04-009` | `P10-001` | `CAT-01`, `CAT-03`, `PERF-CAT`, `UI-CAT` |
| FR-05 | `P04-010` | `P10-001` | `CAT-01`, `CAT-02`, `UI-CAT` |
| FR-06 | `P04-002` | `P10-001` | `CAT-02`, `DB-02`, `INV-01` |
| FR-07 | `P05-002` | `P10-001` | `SHP-01`, `PERF-CART`, `UI-SHP` |
| FR-08 | `P05-004` | `P10-001` | `SHP-02`, `SEC-06`, `UI-SHP` |
| FR-09 | `P05-006` | `P10-001`, `P10-002` | `PRM-01`–`PRM-04`, `DB-05`, `FX-MONEY-*` |
| FR-10 | `P05-009` | `P10-001` | `REV-01`, `SEC-06`, `UI-CAT` |
| FR-11 | `P06-004` | `P10-001`, `P10-002` | `CHK-01`–`CHK-05`, `API-06`, `UI-CHECKOUT` |
| FR-12 | `P07-006` | `P10-001`, `P10-003` | `PAY-01`–`PAY-14`, `API-05`, `REL-04` |
| FR-13 | `P04-008` | `P10-001`, `P10-002` | `INV-01`–`INV-03`, `DB-05`, `DB-09` |
| FR-14 | `P06-014` | `P10-001` | `ORD-01`–`ORD-04`, `UI-ORD` |
| FR-15 | `P06-013` | `P10-001`, `P10-002` | `ORD-02`, `ORD-03`, `PAY-07` |
| FR-16 | `P06-003` | `P10-001` | `ORD-04`–`ORD-06`, `REL-10` |
| FR-17 | `P08-002` | `P10-001`, `P10-004` | `RET-01`–`RET-06`, `DB-11` |
| FR-18 | `P08-005` | `P10-001`, `P10-004` | `RFD-01`–`RFD-09`, `DB-12`, `REL-06` |
| FR-19 | `P06-015` | `P10-001`, `P10-005` | `ORD-07`, `API-09`, `SEC-05` |
| FR-20 | `P03-009` | `P10-001`, `P10-010` | `NTC-01`–`NTC-12`, `REL-05` |
| FR-21 | `P03-012` | `P10-001`, `P10-005` | `SEC-02`–`SEC-04`, `UI-ADMIN-AUTH` |
| FR-22 | `P09-001` | `P10-001` | `ADM-06`, `PERF-ADM`, `UI-ADMIN` |
| FR-23 | `P04-005` | `P10-001` | `CAT-01`, `CAT-02`, `API-04`, `UI-ADMIN` |
| FR-24 | `P04-004` | `P10-001` | `CAT-01`, `DB-02`, `UI-ADMIN` |
| FR-25 | `P04-007` | `P10-001`, `P10-002` | `DB-09`, `INV-01`–`INV-03`, `UI-ADMIN` |
| FR-26 | `P06-011` | `P10-001` | `ORD-01`–`ORD-04`, `SUP-01`–`SUP-04`, `UI-ADMIN` |
| FR-27 | `P09-003` | `P10-001`, `P10-005` | `ADM-01`–`ADM-04`, `API-08`, `SEC-06` |
| FR-28 | `P06-001` | `P10-001` | `ADM-05`, `ORD-05`, `ORD-06`, `API-04` |
| FR-29 | `P07-015` | `P10-001`, `P10-003` | `PAY-05`, `PAY-09`–`PAY-13`, `UI-ADMIN` |
| FR-30 | `P05-008` | `P10-001`, `P10-002` | `PRM-02`–`PRM-04`, `UI-ADMIN` |
| FR-31 | `P09-006` | `P10-001` | `REV-01`, `UI-ADMIN` |
| FR-32 | `P08-003` | `P10-001`, `P10-004` | `RET-01`–`RET-06`, `UI-ADMIN` |
| FR-33 | `P08-015` | `P10-001`, `P10-004` | `RFD-02`–`RFD-09`, `UI-ADMIN` |
| FR-34 | `P09-005` | `P10-001` | `SET-01`–`SET-04`, `ADM-05`, `SEC-12`, `UI-CONTENT` |

## Nonfunctional verification ownership

The accepted [P01-004 NFR/release register](./P01-004-nfr-release.md) retains all 55 clause-level owners and exact proof.
The rows below identify the integrated verification handoff; no numeric workload, SLA, RPO/RTO or retention value is invented.

| PRD NFR area | Verification handoff | Required actual proof |
| --- | --- | --- |
| 12.1 Performance | P10-008, P10-009 | Approved dataset/device/network/load budgets; measured catalog/checkout, indexed bounded queries and private-cache inspection |
| 12.2 Security | P10-005, P11-003 | Real session/CSRF/origin/role/ownership and input negatives, redaction/secrets controls; actual live-domain evidence at production gate |
| 12.3 Reliability | P10-002, P10-003, P10-004, P10-010, P10-011 | Real transaction/unique-index/concurrency, duplicate/restart/unknown-outcome, notifications and isolated restore/reconciliation evidence |
| 12.4 Availability | P10-011, P11-010 | Approved operating target, monitoring/deployment and restore rehearsal with gap disposition |
| 12.5 Responsive design | P10-007 | Actual mobile/tablet/desktop journeys, reflow, menus/forms/tables and both themes |
| 12.6 Accessibility | P10-006 | Automated plus keyboard/focus/screen-reader/contrast/reduced-motion checks in actual critical journeys |
| 12.7 Browser compatibility | P10-007 | Approved target browser/device run matrix and reproduced defect/retest artifacts |
| 12.8 Data protection | P10-005, P10-009, P10-011, P11-007 | Scoped private data/media, no shared-cache leakage, approved retention/rights/legal and protected backup/recovery evidence |

## Fixtures, external gates and execution limits

- FX-MONEY-01: 101 poisha × 50% rounds half-up to 51. FX-MONEY-02: 100 discount over 201/100 weights gives 67/33
  by largest remainder. FX-MONEY-03: 101 over three original ordinals gives 34/34/33. These are static fixture checks,
  not application calculation tests; implementation still needs regression/property tests against the owning contract.
- FX-STOCK-01/02 require real competing writers and persisted counters. FX-HOLD-01 requires controlled 15-minute expiry,
  duplicate jobs, late verified receipts and atomic stock/coupon reacquisition. FX-REFUND-01 needs real source/class/order
  cap assertions and verified payout state, not a mocked monetary success.
- FX-ZONE-01/02 retain future-only historical charges and guarded coverage activation. FX-REPORT-01/02 separate merchandise
  sales, verified cash, held liabilities and correction-class payouts. FX-REPORT-03 permits -10,000 signed period cash flow;
  it never permits a negative source collection or an excess refund commitment.
- [P01-008](./P01-008-critical-scenarios.md) owns the 35 critical scenario handoffs, including final-unit/coupon contention,
  duplicate checkout, hold generations, forged versus independently verified discrepant funds, risk/dual payments, cancelled
  late payment, claim ordinals, unknown payout, guest proof, media cleanup, job restart and restore gaps.
- [P01-005](./P01-005-readiness.md), [P01-006](./P01-006-gateway-feasibility.md) and
  [P01-007](./P01-007-policy-gates.md) retain actual external readiness requirements. Synthetic fixtures are allowed for
  development; actual sender/media/provider capabilities and qualified/operator policy approval need their own evidence.
- A missing prerequisite or inaccessible provider scenario stays Not Run/Blocked/Not Verifiable as appropriate. Do not
  turn application or OPV slots Passed from the 12 tooling regressions or the successful baseline CI run.

## Execution and handoff

| Stage / task | Required action before acceptance |
| --- | --- |
| P02-001/P02-002 | Install frontend tools, implement/discover component tests and real lint/type/build scripts; activate workspace CI and root aliases |
| P03-001/P03-002/P03-017/P03-018 | Implement API/DB/contract tools and runtime validators; provision isolated real transactional MongoDB and verify indexes/abort/concurrency; activate applicable integration/contract checks |
| P04–P08 feature owners | Link each applicable test/SC/OPV slot to executable tests; extend fixtures and negative/failure paths before integrated mutation enablement; record real provider evidence separately |
| P09-011/P09-012 | Deploy isolated integrated staging with runnable configuration and actual dependency readiness |
| P10-001–P10-013 | Run integrated FR/NFR, security/accessibility, financial and restore regression; fix/retest mandatory defects and collect explicit M6 evidence |
| P11/P12 | Verify live-safe channels/policies/operations and handover under separately authorized M7/M8 decisions |

## Verification record

**Commands:** `npm run ci`, `python3 /tmp/p01-013-verify.py`, `git diff --check`\
**Environment:** Existing Node/npm repository foundation; local static contract review; synthetic CI-tooling fixtures\
**Result:** Passed — 18 testing sections and five appendices reviewed; 34 FR rows, 55 NFR slots, 69 AC entries, 164
operation slots, 35 critical handoffs, fixture definitions/arithmetic and current-script inventory reconciled. Source
specifications, previous accepted evidence, runtime/CI files, task dependency edges and milestone decisions preserved.\
**Local executable tests:** 12 CI-tooling functions Passed; zero application acceptance scenarios reported executed.\
**Application/real DB/provider/browser/performance/restore checks:** Not Run — corresponding implementation/infrastructure is not present.

## Acceptance

Accepted by the project owner on 17 October 2026 (Asia/Dhaka): “Testing baseline গ্রহণ করছি”.
Independent acceptance is recorded under [TASKS §2](../TASKS.md#2-task-management-conventions) and
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting); P01-013 is Done.
Acceptance covers the reviewed testing baseline and current/future tooling distinction. Feature and milestone acceptance remain separate.
