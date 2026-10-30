# P09-011 — Isolated staging runtime preparation

**Date:** 25 October 2026
**Executor:** Codex
**Status:** Blocked; not submitted for acceptance
**Revision:** Working-tree preparation against `682b53f53c39a2cc5605d1c7d0ee8645ffd559ef` (accepted P04-018).
Accepted P04-018 changes present at task start were preserved and committed by the owner during this work.

## Scope and unmet prerequisites

Sources: [Tasks P09-011](../TASKS.md), [Architecture §13](../ARCHITECTURE.md#13-deployment-architecture),
[Operations §§4–5](../OPERATIONS.md), Implementation Plan §§4.1/12. P01-024 is accepted.
The task requires a real isolated staging API, transaction-capable DB, workers, protected secrets,
provider/test-email configuration, reviewed container and testable HTTPS/session boundaries.

At kickoff, the owner was asked for approved hosting/project, registry, HTTPS origins and private
DB/provider/test-email configuration references. The response was “ok”; no resource or secret reference
was supplied. That acknowledgment is not provisioning evidence or authorization for an arbitrary
vendor/billable plan. No production credentials, invented origins, fake merchant activation or live email
were used. External readiness EXT-03/04/05/09 is not cleared by this work.

The installed Docker client is 29.9.1. `docker version` and an actual image-build attempt failed with
permission denied on `/var/run/docker.sock`, including with execution outside the sandbox. This is an OS
access limitation, not an automatic approval-review rejection. Socket ownership/mode/groups, sudo access
and daemon security were not changed. No image was built, run, pushed or deployed.

**Accountable functions:** Project owner / platform operator supplies approved isolated resources and
secret references; authorized builder operator supplies a working Docker-enabled runner. Provider owners
supply test-mode account/sender policies and references. Codex can resume implementation/verification
when those inputs are available. All task acceptance remains pending.

## Local preparation delivered

- `backend/Dockerfile`: digest-pinned official Node 24.20.0 image; pinned npm 11.19.0 toolchain; locked
  backend-only build and production dependency stages; non-root runtime; distinct HTTP and one-shot
  notification entry commands; SIGTERM and credential-free liveness configuration.
- `backend/Dockerfile.dockerignore`: Dockerfile-specific root-context allowlist for manifests and required
  backend inputs; excludes frontend applications, local configuration, credentials, Git/test artifacts
  and installed dependencies. Runtime COPY instructions include no source/configuration snapshot.
- `backend/scripts/container-health.mjs`: loopback-only bounded public liveness, validates port/bind host,
  refuses redirects and wrong/invalid/non-200 responses, times out, exits silently with no monitor token.
- `backend/tests/unit/container-health.test.ts`: real synthetic HTTP/child-process cases, discovered by
  existing backend unit CI. No new CI command, frontend check or dependency was introduced.
- Operations §5.6 describes actual recipe/commands, runtime secret handling and required image/staging
  verification in the existing owning section, without presenting preparation as a deployed environment.

The runtime intentionally contains only HTTP/notification launch scripts. It does not bypass existing
local/test-only bootstrap/admin-provisioning restrictions. Staging persistence/admin provisioning needs
its reviewed operator procedure before enabling authenticated commerce; this task does not silently
relax those gates. Future payment/refund/expiry workers remain their owning feature tasks.

The Dockerfile has not been verified by an engine. Its image contents, ignore behavior, unprivileged
execution, OS/native dependency compatibility, health and draining are **not proven** by reading the recipe.

## Observed checks

| Command / procedure | Observed result |
| --- | --- |
| `docker manifest inspect node:24.20.0-bookworm-slim` | Passed; public official image manifest read without daemon access |
| `docker buildx imagetools inspect node:24.20.0-bookworm-slim` | Passed; pinned index digest `sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e` observed |
| `docker version` | Blocked; client available, daemon socket permission denied |
| `docker build --pull --file backend/Dockerfile --tag sportzone-backend:p09-011-local .` | Blocked before build; same socket permission denied |
| Isolated temporary directory containing only root/lock/backend manifests, backend source/tsconfig/build script; `npm ci --offline --workspace=backend --include-workspace-root=false --ignore-scripts --no-audit --no-fund` | Passed; 204 packages; no frontend manifests/source or root workspace install |
| `npm run build --workspace=backend` in that isolated tree | Passed; backend compiled without frontend source/build/test |
| `npm ci --offline --workspace=backend --include-workspace-root=false --omit=dev --ignore-scripts --no-audit --no-fund` in the isolated tree | Passed; 86 packages |
| Isolated production-dependency inventory and HTTP/worker config-failure launch assertions | Passed; no frontend directories/Next/React/Vite/Vitest/TypeScript; both entries resolved runtime dependencies and safely refused absent configuration |
| `npm run test:unit --workspace=backend -- tests/unit/container-health.test.ts` | Passed; 11 local HTTP/environment/redirect/refused-connection cases |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run lint --workspace=backend` | Passed; 211 files |
| `npm run format:backend` | Passed; 225 files |
| `npm run test:security` | Passed; repository secret scan and locked dependency audit, zero findings/advisories; not an image/OS scan |
| `npm run lint`, task-count/checkbox audit and `git diff --check` | Passed; 505 files, 1,286 local links, zero documentation errors; 77 Done/130 Not Started/2 Blocked |

Security result: `test-results/P09-011/security.json` (ignored local artifact).

The isolated directory was `/tmp/sportzone-p09-011-399dokq8`; these are host-side checks, not a Docker
build. An initial host child-process assertion failed because sandbox EPERM returned no process output;
the cause was inspected and the same checks passed with child-process access permitted. This attempt
is not relabelled as a pass. No unrelated application regression was rerun for packaging-only preparation.

Implementation references: [Docker build contexts and Dockerfile-specific ignores](https://docs.docker.com/build/concepts/context/),
[Dockerfile instruction semantics](https://docs.docker.com/reference/dockerfile),
[npm ci workspace and production dependency selection](https://docs.npmjs.com/cli/commands/npm-ci/).
These sources inform the recipe; they do not prove that this image built or deployed.

## Required resume verification

1. Receive approved project/registry/region/resource ownership, API/storefront/admin HTTPS origins and
   protected configuration/secret references; do not paste secrets into chat or commit them.
2. Obtain an authorized Docker builder. Build the recipe, review all layers/config/file/dependency
   inventory for secrets/frontend/dev artifacts, scan image/OS vulnerabilities and record immutable digest.
3. Verify isolated staging DB transaction capability, network roles, approved schema/index bootstrap,
   restricted readiness, image liveness, HTTP SIGTERM draining and real worker restart/lease recovery.
4. Verify approved TLS/origin/customer/admin/guest cookie separation and test-only provider/email behavior.
   Prepare frontend hosting/origins without requiring frontend builds or deployment at this backend stage.
5. Attach actual results and independent acceptance. Do not mark P09-011 Done from these local checks.

Image run/health/draining/restart, image-layer secret/OS scans, hosted deployment, staging transactions,
TLS/session/provider/email tests: **Not Run / Blocked** for the prerequisites above. Product milestones
and provider/legal/production gates remain unaccepted. No acceptance popup is appropriate yet.

## Blocker recheck — 30 October 2026

Rechecked Docker daemon access with `docker version --format` (server-version field): permission denied on `/var/run/docker.sock`. No approved hosting/registry/origins, isolated secret references or authorized builder was supplied. No build, push or deployment was attempted; the host access limitation persists.

The owner requested resolution of pending/blocked tasks. Protected evidence references were requested;
no secret values were requested or inspected. P09-011 remains **Blocked** because task-specific
external acceptance cannot be established by technical regression or generic completion instructions.

Owner response on 30 October 2026: “ami currently dite parchina tumi kono ekta use kore naw”.
Source selection is delegated, but no account/resource access, approved policy or qualified sign-off
is supplied. No synthetic substitute can establish the missing external acceptance; status remains
Blocked. Existing local test fixtures remain available without activating deployed integrations.


## Render/Vercel preparation — 30 October 2026

The owner explicitly selected Render for the API and Vercel for both frontends, requested combined
application deployment preparation, a short branch/local commit and a complete GitHub/deployment guide.
This authorizes local configuration and sequential application build verification; no account access,
resource provisioning, Git push, task acceptance or commercial-plan entitlement was supplied.

Delivered on `chore/render-vercel-deployment`:

- Root `render.yaml`: JSON-form YAML Blueprint, one Free staging Docker API, manual deployment,
  private required input prompts and all commerce/provider activation flags disabled. Source builds do
  not require a separate registry; actual resource/origin/secret configuration remains external.
- Per-app `vercel.json`: explicit root-workspace locked install with npm 11.19.0 and dev dependencies,
  owning app builds, admin SPA fallback; no secret environment values or business proxy added.
- Manual GitHub Container verification workflow: build backend only, verify non-root execution and
  limited secret/source exclusion, preserve image-ID artifact. No image push/deploy or automatic job.
- Operations §5.8 and README navigation: GitHub branches/protection/PRs, exact provider setup,
  account limits, staged environment values, domain/cookie prerequisites, post-deploy checks and rollback.
- Sanitized template: duplicate quote lifetime removed; plain verified EMAIL_FROM syntax clarified.
  Private root `.env` is ignored and is not part of this commit.

### Observed local verification

| Command | Result / environment |
| --- | --- |
| `npm run build --workspace=backend` | Passed, local Node 24.20.0/npm 11.19.0 |
| `npm run build --workspace=admin` | Passed; existing >500kB chunk advisory, no error |
| `npm run build --workspace=storefront` | Passed with local child-process access; Next.js compiled/typechecked and generated 13 static pages |
| `npm run test:unit` | Passed: 60 tooling cases, including 2 deployment configuration safety cases |
| `npm run lint` | Passed: repository syntax, documentation links and configuration/secret controls |
| `npm run format:check` | Passed: 549 files |
| `npm run lint:boundaries` | Passed: 363 source files, zero boundary violations |
| `git diff --check` | Passed |
| `docker version --format '{{.Server.Version}}'` | Blocked: local Docker API socket permission denied |

Initial sandboxed tooling execution passed 58/60; two child-process/watch fixtures could not run there.
Rerun with required local process access passed all 60. Initial sandboxed Next build could not parse
TypeScript child-process configuration output; the same unchanged build passed outside that constraint.
An initial formatting check identified only the two new test loop layouts; formatted the touched test
file and reran successfully. These failures are not relabelled as initial passes.

Docker image build/run and hosted Container verification workflow, clean hosted Vercel install/build,
Render Blueprint/provider validation, actual hosted services/TLS/sessions, staging DB schema/transactions,
real scanner/email/payment, OS/image-layer scans, job schedules and recovery: **Not Run / Blocked**.
No full application regression, UI visual/browser acceptance or financial integration rerun was needed
for deployment metadata/documentation; those suites remain required at their owning task/stage gates.

**Review:** Executor reviewed changed configuration/diff and secret exclusion. Independent acceptance
is not recorded. P09-011 remains Blocked; no external, backend/application or production milestone is Done.
Free Render cannot supply required durable scheduled runtime alone, Vercel Hobby is non-commercial only,
and default cross-site domains need the documented same-site/proxy solution before auth activation.

## Public staging observations — 30 October 2026

The owner supplied staging origins and reported provider setup. Public HTTP checks from this workspace
observed: Render `/api/v1/health/live` **200**, shop home **200**, admin home **200**. A GET of
`/api/v1/products` with the shop Origin returned **503** while allowing that Origin in CORS. The public
catalog service deliberately returns this status when required persistence/index verification fails;
the sanitized response does not establish the exact cause. Inspect protected staging diagnostics and
actual collection/index inventory before an approved additive rollout. Do not run local/test bootstrap
against staging or bypass verification. Liveness and public HTML responses do not establish protected
readiness, successful commerce, data seeding, transaction support, provider qualification or acceptance.

Private staging reference configuration was updated locally; Render/Vercel environment settings were
not inspected or changed. The owner reported credentials present there. Actual provider and operator
qualification, job runner, same-site authentication topology and independent acceptance remain open.

## Guarded catalog rollout work package — 30 October 2026

Owner requested the next two tasks together, with Done only after review. Scope selected: P09-011 and
P04-003. Branch at start: `env-setup`; working tree was clean. This work does not accept either task.

Added the catalog-owned `inspectCatalogRollout`/`applyCatalogRollout` service and
`backend/scripts/staging-catalog.mjs`. Default invocation only inventories canonical collection
existence/counts/validators/indexes and writes a private new report. Apply requires a current protected
review record bound to target and plan digest, real backup/writer-pause references, disabled feature
flags and a fresh unchanged inventory. Existing-data/index/validator conflicts block before mutation;
extra indexes and all records are retained. Partial DDL is resumable after fresh review, never rolled
back by deleting data. The tool refuses production and report overwrite. Operations §7.2 owns usage.

### Observed verification

- `npm run typecheck --workspace=backend`: Passed.
- `npm run build --workspace=backend`: Passed.
- `npm run test:integration --workspace=backend -- catalog-rollout.test.ts catalog.test.ts`:
  **38 Passed** on an isolated generated MongoDB 8.0.16 replica set. Includes read-only absence,
  validator/index conflicts, populated-state denial, stale-plan rejection, replay, extra-index/data
  preservation, competing initial rollouts, production/expired-review denial and report protection.
- `npm run test:unit --workspace=backend -- media.test.ts`: **8 Passed**.
- `npm run api:check --workspace=backend`: Passed; four artifacts unchanged.
- `npm run lint:boundaries`: Passed; 364 source files, zero violations.
- `npm run format:check`: Passed; 553 files.

An initial integration command supplied the script's outputFile option twice and failed before any
suite ran. Removing the duplicate option ran the real suites successfully; no failing test was waived.
A backend lint informational template-literal suggestion was fixed in the touched operator script.

Actual staging read-only inventory using private `.env.staging` failed with CONNECTION_FAILED.
The new default tool was also invoked, wrote a sanitized failed private report and exited nonzero;
no staging validator/index/record changes or transaction writes occurred. The exact network/auth cause
is not established by that high-level failure. Resolve authorized operator connectivity, then run the
read-only report before requesting approval of a concrete target-specific apply plan.

An initial network-restricted GitHub auth check failed; a network-enabled recheck succeeded using
the existing keyring credential. Existing repository CI runs were readable, but they precede this
work package and are not evidence for these changes. No new workflow was published/dispatched, no
secret was transferred, and no deployment occurred. Local Docker engine access remains unqualified. Same-site/proxy, worker/runtime, transaction/recovery and independent acceptance
still require their actual evidence. Status remains **Blocked**, not In Review/Done for the full task.

A further read-only driver diagnostic categorized this workspace's staging connection failure as
TLS handshake failure. The underlying network/access/trust cause remains unconfirmed; certificate
validation was not disabled. Render can have different connectivity from this operator environment.
Historical successful CI observed on GitHub does not substitute for the current rollout review or
an actual target-specific inventory. The catalog preflight/apply tool is ready for review, not an
approved migration or a claim that hosted collections were changed.


The owner later authorized branch publication and read-only hosted media preflight. GitHub environment
creation was rejected by automatic approval review before execution because exact branch scope must
exist in the initial security configuration. No GitHub environment/secrets/workflow side effects
occurred; the authorized branch publication remains a separate action. See P04-003's current record.

The owner subsequently created the GitHub environment manually. Exact feature-branch restriction
was added and verified before storing the three authorized Cloudinary values. The first manual
media run failed at empty reusable-workflow secret resolution; it did not access Atlas or mutate
records. The direct staging-job correction remains within the authorized read-only preflight scope.

Hosted read-only media preflight subsequently passed on branch commit `2aab9e7`:
[run 41081351601](https://github.com/mdnuruzzamannirob/sportzone/actions/runs/41081351601).
The exact branch restriction and only three authorized Cloudinary environment secrets were verified.
No Atlas secret was transferred and no schema/index/record rollout was performed. This removes the
read-only Cloudinary/scanner-connectivity preparation gap but does not clear the Atlas TLS inventory,
transaction, job, same-site/proxy, scanner-runtime or full P09-011 acceptance requirements.

## Authorized hosted inventory — 30 October 2026

The owner explicitly authorized storing the existing staging URI as `STAGING_MONGODB_URI` in the
branch-restricted GitHub staging environment and running read-only inventory. No apply mode,
record/index/schema mutation or additional credential transfer was authorized by this approval.

[Run 41086234040](https://github.com/mdnuruzzamannirob/sportzone/actions/runs/41086234040) failed
before inventory. A fixed-vocabulary private diagnostic was added and verified locally. The rerun
on `f747105`, [41087532710](https://github.com/mdnuruzzamannirob/sportzone/actions/runs/41087532710),
confirmed `phase=connection`, `reason=TLS_HANDSHAKE_FAILED`. Only an RSA-OAEP/AES-GCM encrypted
report was uploaded; its private key remains local and ignored. No raw URI/driver diagnostics
were logged, and no database mutation occurred. TLS verification remains enabled. The actual
network/access/trust cause is unconfirmed; no repeated mutation or speculative rollout is justified.

Local verification for the diagnostic/reload fixes: backend build, typecheck, lint, boundaries,
format and repository documentation checks Passed. The affected integration command
`npm run test:integration --workspace=backend -- database.test.ts media-qualification.test.ts operator-report.test.ts catalog-rollout.test.ts`
Passed **38 tests** on an isolated local MongoDB replica set with network-enabled execution.
The initial sandbox attempt was Blocked by local port-binding EPERM and is not counted as a pass.
These tests do not qualify the inaccessible staging database. P09-011 remains Blocked pending actual
staging inventory/transaction/runtime evidence and independent acceptance.

### Hosted backend image check

[Run 41088818340](https://github.com/mdnuruzzamannirob/sportzone/actions/runs/41088818340)
on `864ed9362e313a04a001c56096036f2febe51e77` Passed the backend-only Docker build and limited
runtime inventory. Actual container checks verified non-root execution, compiled server presence,
and absence of root/backend `.env*`, Git metadata, backend source, admin and storefront directories.
The retained `backend-container-verification` artifact contains image identity and limited scope.
This clears the earlier unavailable Docker-builder check, not hosted DB/health/draining, worker
restart, OS vulnerability scan, provider activation or deployment acceptance. Other jobs were
intentionally skipped in image-only mode and are not counted as passes.

## Render account verification and origin correction — 30 October 2026

The owner supplied a protected Render API key in the ignored staging environment file. Read-only
API access succeeded for the existing `sportzone-api-staging` service: free web service in Oregon,
connected to `main`, not suspended. Existing secret values were compared in memory only; no raw
remote secret inventory was retained or printed. An initial proposal to persist the raw env response
was rejected by automatic approval review before execution; the safe comparison-only alternative
succeeded without writing any credential dump.

The actual Render `API_PUBLIC_ORIGIN` was `https://sportzone-api.onrender.com`, differing from the
service URL and private staging reference. Only that public variable was corrected to
`https://sportzone-api-staging.onrender.com`. Deploy-only operation `dep-dbicka6tlv9c739g3g20`
reused the existing artifact at `a4afd75b8e976efc39f5ae4bc30c214158f5a2c2`; status **live**.
No feature branch merge, new service, paid resource, secret rotation or database mutation occurred.
Post-deploy actual probes: live **200**, authenticated ready **200**, products **503**. Server readiness
checks a real database ping, so Render-to-Atlas connectivity is verified for that runtime; it does not
prove target collection/index inventory, transaction execution or catalog initialization.

The current free-only budget conflicts with completing the planned hosted private scanner and
standalone worker qualification using this existing Render service alone. Official references:
[free service limitations](https://render.com/docs/free),
[shell availability](https://render.com/docs/ssh),
[billed one-off jobs](https://render.com/docs/one-off-jobs), and
[ClamAV container memory requirements](https://docs.clamav.net/manual/Installing/Docker.html).
No paid workaround or weakened scanner/authentication gate was applied. The full task remains
Blocked pending suitable runtime capacity and actual remaining inventory/transaction/worker evidence.

## User-enabled local Docker runtime qualification — 30 October 2026

The owner enabled local Docker socket access; Docker 29.8.0 is reachable. The existing image was
built successfully with `docker build -f backend/Dockerfile -t sportzone-backend:staging-check .`.
New reproducible operator verifier:
`node backend/scripts/verify-container-runtime.mjs sportzone-backend:staging-check` — **Passed**.
It created only a generated local MongoDB 8.0.16 replica set/database and test container, without
loading private env files or using any real provider. Its retained artifact
`test-results/container-runtime.json` reports all eleven checks Passed:

- Transaction commit and abort; container database readiness and readiness authentication.
- Catalog read returns 200 after canonical local test initialization; non-root container identity.
- Actual SIGTERM graceful shutdown and secret redaction; container restart readiness.
- Two distinct reservation-expiry worker processes complete against the same durable lease state.
- The committed synthetic transaction survives container restart.

Both worker runs scanned/released zero reservations. This is an actual CLI/process restart check,
not proof of nonempty expiry correctness or a deployed scheduler. Existing transaction/concurrency
integration tests retain their separate scope. The verifier removed its test container, temporary
env file and generated replica-set data. The built image remains available for further local use.
No live API, Atlas collection/index/record, provider object or credential was changed.

A separate previously authorized read-only staging inventory attempt through Docker host networking
still returned TLS_HANDSHAKE_FAILED before inventory. No apply was attempted. Thus the local Docker
builder/runtime gap is cleared; actual target inventory, hosted jobs/scanner and independent
acceptance remain outstanding. No full task or milestone Done is inferred from this local pass.

## Free Render inventory succeeded — 30 October 2026

Owner instruction: “free te jeta kore kaj chalano jabe setau koro”. No paid service was provisioned.
Added `staging-inventory.mjs` as an explicit staging-only, all-features-off Node preload. It requires
an operator RSA public key and emits only an encrypted catalog inventory envelope. Two real replica-set
integration tests Passed for read-only encrypted reporting and production/feature/missing-key guards.
Backend typecheck/lint, boundaries, formatting, documentation checks and local Docker build Passed.
No prior provider or full unrelated application suites were repeated.

Existing free Render service deployed reviewed commit `a526e4c7641febdd303cbdfa239c3650772bebcf`
in deployment `dep-dbicvdgn74is73b3bilg`, status live. The encrypted inventory was retrieved from
protected Render logs and decrypted only in the local protected report store. This resolves the
operator TLS/network inventory obstacle without opening Atlas to all IPs or provisioning another host.
Private report: `.cache/staging-report/render-catalog-plan.json` (ignored, mode 0600).

### Concrete initial catalog plan awaiting independent authorization

Target `sportzone_staging`, digest
`03fdaaa936a11245e225f52451d86b61c6b546c3e8c7a8c690388ed0e4f7e240`:

| Collection | Current state | Planned additive indexes |
| --- | --- | --- |
| categories | Absent; no records | 3 |
| products | Absent; no records | 5 |
| productVariants | Absent; no records | 3 |

All blockers are empty; canonical inspection reports safeToApply=true. The planned operation creates
only these three missing canonical collections, their declared validators and eleven indexes. No
seed data, record mutation, existing-index drop or collMod is proposed. Current absent collections
are the retained verified-empty recovery baseline, not a claim of a full Atlas backup. Other database
collections are outside the plan. All service feature-admission flags remain false; no worker was
provisioned. Recheck the exact digest immediately before apply. If partial DDL occurs, retain it,
keep admission off and review a new plan; never destructively roll back or blindly retry.

The report preload/public-key variables were removed after capture; deploy-only normal startup was
requested as `dep-dbid14e1egvs73e8p8i0`, subsequently verified live with public liveness
and authenticated readiness both 200. Actual catalog apply has **not** run. Operations §7.2 requires independent target-plan
review; executor-generated approval is not substituted for it. Full hosted worker/scanner acceptance
is Deferred for the free demo, with the initial-release gates unchanged.

### Independent authorization of the exact initial plan

The project owner explicitly accepted the interactive target-plan review: “এই নির্দিষ্ট setup
অনুমোদন করছি”. This authorizes only the previously recorded digest, three absent catalog collections
and eleven canonical indexes, with no existing-data edits/deletes and all feature admission off.
The retained verified-empty catalog report is the reviewed target recovery baseline; partial DDL
requires stopping, preserving state and a fresh plan. It is not a full Atlas backup claim.

The free Render transport now supports an explicit apply flag plus the exact private reviewer
manifest, delegating to the existing guarded CLI rather than startup auto-DDL. Normal mode remains
read-only; production/active features/missing authority/stale plans fail closed. One-time operator
settings must be removed after the result is retained. Full task/milestone acceptance remains separate.
