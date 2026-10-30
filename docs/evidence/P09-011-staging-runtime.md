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
