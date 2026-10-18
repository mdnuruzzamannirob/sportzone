# P03-017 — Identity persistence contracts

**Date:** 18 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner, 18 October 2026 — “Identity persistence contract গ্রহণ করছি”

## Scope and prerequisites

[Task](../TASKS.md#phase-03--authentication-and-core-backend) follows accepted P03-002 and P01-003. P03-004 depends on
this task and P03-018; therefore the prerequisite contract tasks execute before the next numbered model task.
PRD §§10/12.8, Architecture §§7/9, Database §§2/5/11–16, API §§4/9.1/16.3/Appendix D.2 and Plan §4.3 govern this review.

The deliverable is the reviewed persistence specification. It does not implement identity models, public authentication
endpoints, migrations or proof delivery. No application code, dependencies, CI inventory, credentials or deployed
infrastructure changed. The accepted operational runtime and generic DB helpers remain intact.

## Reviewed contract

| Area | Reviewed source / result | Executable handoff |
| --- | --- | --- |
| Physical ownership | Four collections: users, sessions, authChallenges, browserContexts; explicit embedded address/deletion IDs, UTC timestamps, strict fields and absent-only optionals | P03-004 |
| Identity fields | Normalized globally unique email across roles/statuses, default customer role, safe security and per-purpose challenge counters, bounded names/addresses and service-owned phone validation | P03-004, P03-007, P03-008 |
| Session scope | Customer/admin require userId and securityRevisionAtIssue; guest requires orderId; mutually exclusive references, expiry/revocation and role/status checks | P03-004, P03-005; P06-015 guest execution |
| Browser security persistence | Session csrfSecretHash explicitly private; browser context audience explicitly storefront/admin; route-selected scope, rotation and Origin remain independent checks | P03-018, P03-005, P03-006 |
| Verification scope | Four purposes, principal/order-exclusive scope, target email conditional on email_change, scope counter binding; no short numeric-code flow implied | P03-004, P03-010, P03-011, P03-012, P06-015 |
| Indexes | Ten named unique/query/absolute-expiry TTL indexes with exact ordered keys/options; no startup sync/drop; no user/financial TTL | P03-004 |
| Atomic transitions | Conditional consume/reissue plus principal revision in one transaction; old envelope removed, fresh issue rather than expiry extension; guarded address/default mutations | P03-008–012, P06-015 |
| Secret projections | Password/token/CSRF verifiers and encrypted delivery envelope excluded by default; explicit DTO allowlists also required for lean/raw queries; outbox contains challenge reference only | P03-004–010, P03-018 |
| Rollout | Empty owned fixture bootstrap distinguished from deployed migration; duplicate preflight, additive expand/backfill/index/validator verification, compatible cutover, no revival of consumed/revoked credentials | P03-004; later environment migration owner |
| Retention and money | Operator-approved lifetimes/retention remain configuration; no invented legal duration; financial snapshots, verified source collections, class/unit refund caps survive identity review | P03-008, commerce tasks, P11-007 |
| Future schema boundary | Commerce collections remain specifications until their owning feature implementations; 37-collection inventory does not mean models exist | Phases 04–09 |

## Reconciliation findings addressed

1. Database §5.2 did not name the session-bound CSRF verifier required by Architecture §9.1/API §4. It now includes
   `csrfSecretHash`, with private projection and session rotation semantics.
2. Browser-context persistence did not distinguish admin/storefront bootstrap namespaces. Database §5.4 now records
   server-selected `audience`; API §4.2 describes the same private mapping without adding public DTO fields.
3. Existing shorthand left challenge counter keys, conditional scope, embedded deletion-request identity/state and exact
   index names/TTL options implicit. Database §§5.5–5.6 make these explicit without enabling services or data erasure.
4. The implementation checklist could be read as requiring all business models immediately. Database §§5.7/16.3 and
   Appendix B now distinguish the contract, executable identity tasks and future commerce schemas.
5. API Account accepts active/suspended while persistence also contains deletion_pending/deactivated. Database §5.5
   records the boundary: do not silently widen the public enum or map an ineligible identity to active; the owning API
   task must verify denial/administrative projection. No incompatible public contract was introduced.

Password hashing policy, token digest encoding, operational TTLs, proof-key custody and delivery implementation stay with
their designated security/service/operator owners. The schema stores typed verifiers/absolute expiry and cannot establish
cryptographic provenance by string validation. These handoffs do not block contract review or authorize a live credential
flow without the corresponding implementation and tests.

## Live implementation reconciliation

- `backend/src/db/connection.ts`: isolated bounded replica-capable connection; no business model registration.
- `backend/src/db/schema.ts`: strict mutable timestamps, safe integers and absent-only optional ObjectId helper.
- `backend/src/db/indexes.ts`: explicit additive collection/index creation and mismatch verification; no destructive sync.
- `backend/src/db/transaction.ts`: session-aware transaction helper; no external calls inside the transaction.
- `backend/src/modules/health/`: operational probes only; there is no auth/customer/guest persistence module yet.

P03-004 must supply actual schemas, collection validators, private projections and named indexes; helpers do not enforce
these domain rules automatically. Existing P03-002/003 runtime results remain historical evidence for their own scopes.

## Verification

| Check | Observed result |
| --- | --- |
| Repository Markdown/config/local-link checks (`npm run lint`) | Passed; 196 files, 997 local links, zero errors |
| Whitespace/diff review (`git diff --check`) | Passed; no whitespace errors; five documentation files plus this evidence record changed relative to the existing index |
| `python3 /tmp/sportzone-p03-017-review.py` (local review helper) | Passed; 171 stable IDs, only P03-017 advanced, 28 Done/142 Not Started/1 In Review; milestone tracker unchanged; ten index declarations (four unique, three TTL), eight test handoffs and API private-field mapping checked |
| Identity model/index/race/security tests, deployed migration/restore and provider delivery | Not Run; no identity implementation or deployed operation is delivered by this documentation task |

Testing §9.1 maps eight assertion groups to existing DB/API/SEC IDs and owning tasks; no new passing runtime cases or
milestone acceptance are claimed. Re-running unchanged application builds/browser suites is unnecessary for this
specification-only change. The project owner independently accepted this contract task on 18 October 2026 under Tasks §2 and AGENTS §13. No milestone or runtime identity behavior is accepted by this record.

## Reviewed source identity

SHA-256 values bind the reviewed specification and existing DB helpers to this evidence. The local review helper also
compared the pre-existing field/money conventions and commerce/financial/retention sections against the Git index; those
sections are unchanged. Runtime/dependency/CI files have no unstaged changes from this task; earlier staged P03-003 work
was preserved. This is static document/source reconciliation, not execution of identity invariants.

| File | SHA-256 |
| --- | --- |
| `docs/DATABASE.md` | `a0e981d304e6dcceaf5e2361b498367e819d4ff6a9c5e03c0931beb5ca80f38b` |
| `docs/API.md` | `fa33c5e9a437a6775d607092e6ad06f9af2aad3ab2ce6e592306f3c403a947d1` |
| `docs/TESTING.md` | `b9c31b6525d94247ec5a9e768e85bee69ef5f50ad7d1e3daeb30d697d1a7f146` |
| `backend/src/db/connection.ts` | `93ab9c4daa5b458e834c0c965feabfb74da9c6c1ccc9b1a776d57e8607dd1918` |
| `backend/src/db/schema.ts` | `dd29595f2a33b30829b6ea257a10505b8117a9a6583dbaf5ef0484b2a61d04e1` |
| `backend/src/db/indexes.ts` | `e07995983b328a138f44da8bcba6c36c4da5010d1be7bc155ff0f82dc42444f1` |
| `backend/src/db/transaction.ts` | `38247382b295b6a5e1faf43bef676024028fe0e1bdc0f40040d84fab0636528e` |
