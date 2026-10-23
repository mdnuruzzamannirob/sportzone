# P01-014 — Operations baseline review

**Reviewed:** 17 October 2026 (Asia/Dhaka)\
**Executor:** Codex\
**Task status:** Done\
**Result:** Passed — operations contract and repository consistency checks\
**Prerequisites:** P01-005 and P01-009 Done

## Scope and authority

Reviewed [OPERATIONS.md](../OPERATIONS.md) against [PRD §18](../PRD.md#18-release-and-handover-outcomes),
[Architecture §13](../ARCHITECTURE.md#13-deployment-architecture),
[Implementation Plan §4.3](../IMPLEMENTATION_PLAN.md#43-database-and-application-infrastructure),
[Database](../DATABASE.md), [API](../API.md), [Testing](../TESTING.md) and [TASKS](../TASKS.md).
The operating baseline remains Version 1.0. This task reviews readiness procedures and their future proof requirements;
it does not provision, deploy, certify policies, execute financial actions or approve production.

## Reconciled content

| Location | Clarification |
| --- | --- |
| Operations §4.3 | Actual commands, resource/backup/secret-store references, named operator, preflight/abort and tested recovery steps required before executing an environment-specific runbook; unresolved inputs link to P01-005 |
| Operations §5.2 | Required application interface distinguished from existing root checks and manifest-only workspaces; no nonexistent build/deploy/restore command claimed executable |
| Operations §13.5 | Privacy runbook points to qualified policy review in §16.2 rather than its own section |
| Operations Appendix B | Twelve-key local template distinguished from complete deployed per-key registry; blank secrets/lifetimes not valid runtime configuration |

All runbook IDs, financial/recovery procedures, configuration vocabulary, ownership roles, task dependencies, requirement
scope and mandatory release gates are preserved. Existing specifications, prior accepted evidence and runtime/CI code
outside the assigned operations document are unchanged.

## Section review matrix

References below identify the governing contracts linked above. Findings are static review outcomes, not operational runs.

| Operations section | Governing source | Review finding | Result |
| --- | --- | --- | --- |
| [1. Operations overview & objectives](../OPERATIONS.md#1-operations-overview--objectives) | PRD §§3,18; Architecture §§1,13 | Single-store/BDT/four payment methods, one backend, no inferred provider success or operational numbers. | Passed |
| [2. Production infrastructure & topology](../OPERATIONS.md#2-production-infrastructure--topology) | Architecture §13.1 | Next.js runtime, Vite static hosting, protected Express, managed transactional MongoDB and durable jobs; approved DNS/TLS/origins and protected resource inventory. | Passed |
| [3. Environments & configuration management](../OPERATIONS.md#3-environments--configuration-management) | Architecture §§9,13.2; API §§4–5; Database §14 | Four isolated environments; secret/public separation; host-only separated sessions, CSRF/Origin; approved configuration changes and per-key validation. | Passed |
| [4. Infrastructure provisioning & setup](../OPERATIONS.md#4-infrastructure-provisioning--setup) | Plan §4.3; Architecture §13; TASKS §6.1 | Provisioning prerequisites and future exact executable commands; unknown resources/owners stay in the readiness register; synthetic environment not production. | Passed |
| [5. CI/CD & deployment procedures](../OPERATIONS.md#5-cicd--deployment-procedures) | Plan §§4.2,12.2; Testing §§5.3,15 | Actual root CI distinguished from required app build/deploy interface; identified artifact, migration preflight, stop/recovery controls and authorized promotion. | Passed |
| [6. Release management & rollback](../OPERATIONS.md#6-release-management--rollback) | Architecture §13.3; Database §15; Testing §13.3 | Binary/schema read-write compatibility, forward fix when needed; no destructive down-migration, receipt erasure or backup substitution for rollback. | Passed |
| [7. Database operations](../OPERATIONS.md#7-database-operations) | Database §§11–15; Testing §9 | Real indexes/transactions, versioned migration/restart checks, restricted data access; no arbitrary production ledger/model edits. | Passed |
| [8. Background jobs & scheduled tasks](../OPERATIONS.md#8-background-jobs--scheduled-tasks) | Architecture §§6.3,12.1; Database §13.3; API §16.3 | Eight durable work items, lease/retry/schedule controls; stock/coupon release not TTL-driven; quote/proof/media cleanup protects consent and private evidence. | Passed |
| [9. Monitoring, logging & observability](../OPERATIONS.md#9-monitoring-logging--observability) | API §16.4; Architecture §§11–12 | Process live versus restricted dependency readiness; twelve monitored signals, safe correlation fields, redaction and approved actual dashboards/thresholds. | Passed |
| [10. Alerting & incident management](../OPERATIONS.md#10-alerting--incident-management) | Testing §17; Plan §10.4 | Severity, containment, named duty/alert routing and observed incident evidence; response thresholds not invented. | Passed |
| [11. Backup, restore & disaster recovery](../OPERATIONS.md#11-backup-restore--disaster-recovery) | PRD §12.3; Database §15.4; Testing REL-08 | Isolated restore, post-cutoff provider/COD/manual proof, unreconstructable gap quarantine, restored credential invalidation, writer fencing and callback handoff before authorized scoped reopening. | Passed |
| [12. Payment & financial operations](../OPERATIONS.md#12-payment--financial-operations) | Architecture §10; Database §§8–9,12; API §§12–13 | Independent receipt verification, unmatched/partial/excess classification, risk/allocation gates; source-class refund commitments remain held during unknown payout; verified COD and controlled close. | Passed |
| [13. Security & access operations](../OPERATIONS.md#13-security--access-operations) | PRD §12.8; Database §14; API §§4–5,16.3 | Least privilege, rotations, protected forensic evidence, identity-verified privacy requests, approved retention/holds and backup effects; qualified policy review remains separate. | Passed |
| [14. Performance, capacity & reliability](../OPERATIONS.md#14-performance-capacity--reliability) | PRD §12.1; Testing §13.1 | Measured workload/device/network budgets and scaling limits; private caching and transactions/provider constraints preserved; no arbitrary SLA. | Passed |
| [15. Maintenance & operational runbooks](../OPERATIONS.md#15-maintenance--operational-runbooks) | Architecture §§12–13; Testing §§13,18 | Controlled maintenance/callback continuity, unsafe write fencing, provider-status reconciliation, approved cadences and decommissioning/retention safeguards. | Passed |
| [16. Store administration & third-party services](../OPERATIONS.md#16-store-administration--third-party-services) | PRD FR-16–FR-18,FR-34,§19; API §§13–14 | Operator decisions, immutable published policy versions, independent current legal review and merchant capabilities; ten walkthrough actions use synthetic/sandbox data without proving live activation. | Passed |
| [17. Operational verification & acceptance](../OPERATIONS.md#17-operational-verification--acceptance) | Plan §11; Testing §18; TASKS §4 | Staging M6 versus production M7/handover M8 evidence, safe smoke, actual sign-offs; all milestone decisions remain separate. | Passed |
| [18. Ownership, handover & change management](../OPERATIONS.md#18-ownership-handover--change-management) | PRD §18; Plan §14; TASKS §§2,8 | Eight accountable role entries; source-first change control, named appointments/protected inventory and actual recipient handover; no invented approvals. | Passed |

All five appendices were also reviewed: A runbook catalog/execution record; B configuration vocabulary/per-key inventory;
C commissioning owners/evidence; D requirements/tasks crosswalk; E release/incident/recovery records and sign-off rules.

## Configuration reconciliation

The [.env.example](../../.env.example) has twelve keys; values below are local template conventions or blanks, not tested
deployments. Each key occurs in Operations Appendix B. Accountable functions derive from Operations §18.1; actual named
contacts, secret-store references and environment validation remain to be supplied with provisioning and feature setup.

| Key | Current template | Consuming scope / accountable function | Required deployed validation |
| --- | --- | --- | --- |
| NODE_ENV | development | Backend/runtime; release owner | Allowlisted target environment; no production fallback |
| PORT | 4000 | Backend listener; release owner | Valid explicit service port matching routing |
| API_PUBLIC_ORIGIN | http://localhost:4000 | Backend/public origin config; release/security | Approved actual origin, TLS in production, consistent callbacks/cookies |
| STOREFRONT_ORIGIN | http://localhost:3000 | Backend/browser origin config; release/security | Exact approved origin and CORS/CSRF consistency |
| ADMIN_ORIGIN | http://localhost:5173 | Backend/browser origin config; release/security | Exact approved origin, separated admin access |
| CORS_ALLOWED_ORIGINS | Two local frontend origins | Backend; security/owner designate | Exact credentialed allowlist; no wildcard production access |
| MONGODB_URI | Blank | Backend/jobs; infrastructure/data owner | Protected isolated target, TLS/access, replica-set transactions and indexes |
| SESSION_SECRET | Blank | Backend; security/owner designate | Protected required material, correct scoped sessions and rotation; no public bundle |
| PROOF_DELIVERY_KEY_VERSION | Blank | Backend proof worker; security/data owner | Approved version/key-store mapping outside DB/backups, decrypt permission and fail-closed key loss |
| CHECKOUT_QUOTE_TTL_SECONDS | Blank | Backend checkout; store/release owner | Owner-approved positive bounded lifetime; expiry/consent rules, no guessed fallback |
| MEDIA_TEMP_TTL_SECONDS | Blank | Backend/media jobs; security/store administrator | Owner-approved bounded lifetime; cleanup cannot erase referenced/legal-held evidence |
| SSLCOMMERZ_MODE | sandbox | Backend adapter; merchant/finance owner | Explicit target mode and merchant/channel evidence; no fallback from live to sandbox |

This is template reconciliation, not an extra deployed configuration registry. Remaining Appendix B categories (provider
credentials/callbacks/refund mechanisms, email/media, calendar, jobs, monitoring, backup and public UI values) require
exact keys from their real adapters/validators, protected references and the eight per-key registry fields. No unknown
credential name, hostname, production database, refund API path, duration or legal deadline was invented here.

## Runbook verification handoff

Each existing runbook retains its trigger and required evidence in Appendix A. The tasks/cases below own later executable
proof. Runbook runtime status is **Not Run** for every row: the repository has no deployed application or operational
resource evidence establishing these exercises. Task acceptance here is baseline review only.

| Runbook | Later implementation/verification tasks | Existing test handoff | Runtime status |
| --- | --- | --- | --- |
| OP-PROV-01 | `P09-011`, `P11-001`, `P11-002`, `P11-003` | `ENV-01`, `ENV-02`, `ENV-03`, `ENV-04` | Not Run |
| OP-REL-01 | `P09-012`, `P11-008`, `P11-011` | `DEP-01`, `API-02`, `SEC-11` | Not Run |
| OP-REL-02 | `P09-012`, `P11-010` | `DEP-01`, `DEP-02` | Not Run |
| OP-DB-01 | `P03-002`, `P03-017`, `P11-002` | `DB-02`, `DB-05`, `DB-10` | Not Run |
| OP-JOB-01 | `P06-010`, `P07-012`, `P08-009`, `P10-010`, `P11-004` | `REL-03`, `REL-05`, `REL-07` | Not Run |
| OP-INC-01 | `P11-010`, `P12-003` | `REL-04`, `REL-06`, `REL-08` | Not Run |
| OP-DR-01 | `P10-011`, `P11-002`, `P11-010` | `REL-08`, `DB-10` | Not Run |
| OP-FIN-01 | `P07-012`, `P10-003`, `P11-009` | `PAY-05`, `PAY-06`, `PAY-07`, `PAY-08`, `PAY-09`, `PAY-10`, `PAY-14` | Not Run |
| OP-FIN-02 | `P08-009`, `P10-004`, `P11-009` | `RFD-02`, `RFD-03`, `RFD-04`, `RFD-07`, `RFD-08`, `REL-06` | Not Run |
| OP-FIN-03 | `P06-012`, `P09-002`, `P10-001` | `PAY-12`, `ADM-06` | Not Run |
| OP-SEC-01 | `P03-014`, `P10-005`, `P11-003`, `P12-006` | `SEC-03`, `SEC-10`, `SEC-11` | Not Run |
| OP-PRIV-01 | `P10-005`, `P11-007`, `P12-003` | `SEC-06`, `SEC-10` | Not Run |
| OP-MNT-01 | `P11-010`, `P12-003` | `REL-04`, `REL-07`, `REL-08` | Not Run |
| OP-STORE-01 | `P12-004`, `P12-006`, `P12-009` | `ORD-03`, `ORD-04`, `PAY-12`, `RET-03`, `RFD-03`, `SET-02`, `ADM-06` | Not Run |

## Unknown operational decisions and closure gates

The accepted [P01-005 readiness register](./P01-005-readiness.md) remains authoritative for all nine EXT entries and
separate named appointment/test/production states. Functions below identify accountability, not appointments or service
activation. Unknown items block affected execution/acceptance; safe unrelated development may proceed.

| Decision | Accountable function | Required closure / affected task |
| --- | --- | --- |
| OR-01 Hosting, region, domains/DNS/TLS, actual routing and origin plan | Release/infrastructure with security | EXT-09; selected topology and protected resource inventory, staging P09-011/P09-012; production P11-001/P11-003 |
| OR-02 Managed transactional DB, backup policy, RPO/RTO, retention and isolated restore target | Infrastructure/data owner | EXT-03; approved recovery objectives, real backup/restore and transaction/index proof via P03-002/P10-011/P11-002 |
| OR-03 Merchant/live wallets, limits, callback/status/refund support and account control | Merchant/finance owner | EXT-01/02; P01-006 assessment, real P07-017/P08-018 sandbox proof and P11-005/P11-009 live verification |
| OR-04 Email/media resources, sender/private asset policy, service ownership | Store administrator/backend with security | EXT-04/05; P03-009/P04-003 actual scoped access/send/cleanup proof, no assumed provider capability |
| OR-05 Catalog/stock/store identity, delivery/contact/fulfillment and current policy copy | Store owner/administrator with qualified reviewer | EXT-06/07/08; P11-006/P11-007 approved actual content; P01-007 policy gates remain applicable |
| OR-06 Worker schedules, lease/fencing/batch/retry bounds and named duty | Backend with release/security | Domain job tasks and P11-004; approved per-job configuration and restart/idempotency evidence |
| OR-07 Monitoring platform/queries, thresholds, alert routing, coverage and incident contacts | Release/security/owner designate | P11-010; approved measurable alert policy plus actual alert/recovery drill, no guessed SLA |
| OR-08 Proof key custody, privacy retention/hold and refund calendar/deadline basis | Security/data and store/finance with qualified reviewer | P03-009/P06-015/P08-011/P11-007; protected approved configuration, key-loss/rights/timing proofs |
| OR-09 Platform-specific deploy/migrate/rollback/restore commands, principals and writer/callback handoff | Release/infrastructure/data with security | P09-012/P10-011/P11-010/P12-003; tested exact commands, old-writer fencing, revoked-session invalidation and callback continuity |
| OR-10 Performance/load budgets, provider quotas, support/billing and receiving ownership | Release/store owner with QA | P10-008/P12-006/P12-007; approved profiles/limits, named acknowledgements and support boundaries |

Do not place the protected inventory's real credentials, private database/account identifiers or customer evidence in this
public review artifact. Readiness approval needs named authorization, environment, actual observations, artifact identity,
stop/recovery outcome and independent disposition; no placeholder value can satisfy Appendix E.3.

## Critical recovery and financial checks reviewed

- Binary rollback must preserve current financial history and old-build read/write compatibility; do not restore an old
  database just to match code or perform automatic destructive down-migration.
- Restore goes to an isolated target. Fence old API/job/migration/repair writers; DNS switching alone is insufficient.
  Independently reconcile post-cutoff provider transactions, COD cash/manual payouts and surviving audit/outbox facts.
- Enumerate unreconstructable gaps and affected scopes. Bounded exception acceptance does not authorize unsafe writes;
  preserve quarantine and customer-remediation decisions until the particular invariants pass.
- Restored potentially revoked sessions and consumed proofs fail closed. Require fresh authentication/proof where durable
  post-cutoff revocation cannot be proved. Verify one writer generation and callback handoff before scoped reopening.
- Verified-but-unmatched/partial/excess funds remain recorded and classified; full funding, risk, order eligibility,
  stock and coupon allocation jointly guard fulfillment. Redirect/IPN/timeout alone never establishes success/failure.
- Unknown payout keeps source-class commitments reserved; no blind new payout identity or false Completed state.
  Merchandise quantities and correction capacity remain distinct; COD cash must be genuinely verified.
- Liveness is process status; readiness is restricted and dependency-aware, without credentials/topology data. Health
  does not establish financial correctness. Private evidence, authentication proofs and secrets never enter logs/artifacts.
- Policy/retention/refund timing requires actual owner/qualified review, with original historical terms preserved; no
  invented law, statutory deadline, automated courier/GPS capability or infinite retention is added.

## Verification record

**Commands:** `npm run lint`, `python3 /tmp/p01-014-verify.py`, `git diff --check`\
**Environment:** Current repository and local static contract review; no third-party account or infrastructure mutation\
**Result:** Passed — 18 sections/five appendices, 14 runbook handoffs, four environments, twelve template keys, ten decision
records, existing job/signal/ownership/operator matrices and task/milestone references; local links/anchors, source/index
preservation, stable task graph/counts and Markdown checks.\
**Deploy/rollback, real DB, backup/restore, monitoring/incident, provider and operator exercises:** Not Run.
The published baseline and passing foundation CI do not prove operational readiness or accept M1–M8.

## Acceptance

Accepted by the project owner on 17 October 2026 (Asia/Dhaka): “Operations baseline গ্রহণ করছি”.
Independent acceptance is recorded under [TASKS §2](../TASKS.md#2-task-management-conventions) and
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting); P01-014 is Done.
Acceptance covers the operations baseline review. Platform commands, external readiness and operational/milestone approvals remain separate.
