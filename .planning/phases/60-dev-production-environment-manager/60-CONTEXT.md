# Phase 60: Dev/Production Environment Manager — Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

When a Launched project opts in, provision a staging environment on the same Hetzner VPS as a
second Docker Compose service on a different port, exposed at `{project}.gsdlabs.dev` via
Cloudflare Tunnel + Cloudflare Access (private, user-only). The Dashboard project card shows both
URLs (Staging + Production). A "Promote staging → prod" button verifies-work-passed and shows a
plain-English git commit list before executing the production redeploy via the project's own
`scripts/deploy.sh`. A "Revert last deploy" button runs git revert + redeploy on production.

This phase does NOT cover new project provisioning flows (Phase 51), the stage-gate UI overhaul,
non-launched project lifecycle, or per-service provisioners for Postgres / email (handled by
stackRegistry provisioners in Phase 75).

</domain>

<decisions>
## Implementation Decisions

### Staging Environment Model (D-01)
- **Model:** Same Docker Compose file, second service on a different port. The staging service
  shares the codebase but runs on a port that's separate from production.
- **Subdomain pattern:** `{project-slug}.gsdlabs.dev` exposed via a new Cloudflare Tunnel
  ingress rule added to `/home/services/hetzner-vps/config.yml`.
- **Access control:** Cloudflare Access restricts staging to the user's email
  (`manuelkuhs@gmail.com`). Staging is never publicly accessible.
- **Opt-in:** Staging is NOT automatic for every Launched project. A toggle on the project
  (card or settings) enables it. Small/simple projects that don't need a staging step are not
  forced into it.

### Provisioning Trigger (D-02)
- Staging provisioning is triggered by the user explicitly enabling the staging toggle on a
  Launched project — not automatically during the Beta→Launched gate transition.
- The Dashboard adds the Cloudflare Tunnel ingress rule (editing
  `/home/services/hetzner-vps/config.yml`) and restarts the tunnel (`gsd-tunnel`).
- The staging Docker Compose service is added to the project's `docker-compose.yml`.

### Deploy Script Abstraction (D-03)
- **Each project owns its deploy logic:** The Dashboard SSHes into the VPS and calls
  `scripts/deploy-staging.sh` (for staging) and `scripts/deploy-prod.sh` (for production) from
  the project's root directory. The Dashboard stays generic — one command per environment
  regardless of stack.
- If a project has no deploy scripts when staging is enabled, the Dashboard generates sensible
  defaults (`git pull && docker compose up --build -d`) and writes them into the project.

### Promote Staging → Production (D-04)
- **Gate (hard):** verify-work must have passed on the staging code. If the last verify-work
  result for this project is a fail, the Promote button is disabled with a plain-English
  explanation.
- **Gate (human):** After verify-work passes, a confirmation modal shows the git commits on
  staging not yet in production (plain-English list from `git log`). User must confirm before
  execution.
- **Mechanics:** Dashboard SSHes into VPS, calls `scripts/deploy-prod.sh` which does git pull +
  docker compose up --build on the production service. Same code that was verified on staging
  goes live.

### Promote Preview (D-05)
- Preview reads the git log diff between what's deployed on staging vs production.
- Displayed as plain English: "I'm about to ship 3 changes: [commit message 1], [commit
  message 2], [commit message 3]."
- Uses `git log {prod_commit}..{staging_commit} --oneline --no-merges` as the data source.

### Revert Last Production Deploy (D-06)
- **Mechanics:** Dashboard SSHes into VPS, creates a git revert commit on the production branch,
  then runs `scripts/deploy-prod.sh`. History is preserved — the revert is its own commit.
- No hard delete / reset --hard. Safe, auditable.
- The Revert button is always visible on the project card/panel after the first production
  deploy (ENV-05).

### UI Placement (D-07)
- **Project card** shows both URL chips (Staging and Production) with status dots, matching
  ENV-02. The Promote and Revert buttons live in the project detail panel, not the card.
- The detail panel surface (tab vs inline) is Claude's discretion — fit naturally into the
  existing panel structure.

### Claude's Discretion
- Exact port allocation for staging services (avoid clashes with existing services)
- How the tunnel config edit and restart are executed safely (idempotent)
- Whether staging and production share one `docker-compose.yml` with service suffix, or two
  separate compose files
- The exact shape of the `scripts/deploy-staging.sh` / `scripts/deploy-prod.sh` generated
  defaults
- Detail panel layout for Promote + Revert controls
- How verify-work results are stored and queried (probably from existing
  `verifyOrchestrator.js`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing provisioning patterns
- `server/gsd/provisioning/stageGates/validateGates.js` — stage gate logic; understand how
  hard/soft gates work before adding new gates or UI hooks
- `server/gsd/provisioning/stackRegistry.js` — service registry; understand service categories
  and gate triggers before adding staging as a service concept
- `server/gsd/provisioning/betterStackProvisioner.js` — template for a provisioner module

### Deploy and VPS config patterns (established in Phase 62)
- `/home/services/hetzner-vps/config.yml` — Cloudflare Tunnel ingress rules; staging adds one
  ingress entry per project
- `/home/services/hetzner-vps/docker-compose.yml` — existing service layout; understand how
  services are named and ported before adding staging services

### Existing deploy mechanic (reference from Phase 62 context)
- Phase 62 decisions D-02/D-03: GitHub Actions SSH + git pull + docker compose up pattern
- The `scripts/deploy-prod.sh` approach in this phase mirrors that pattern at the project level

### Dashboard backend
- `server/gsd/verifyOrchestrator.js` — understand verify-work result storage before building
  the promote gate
- `server/routes/gsd.js` — existing stage-change route; promote/revert may reuse or extend this
- `server/gsd/tmux.js` — SSH/shell execution patterns used throughout the backend

### Requirements
- `.planning/REQUIREMENTS.md` §ENV-01 through ENV-05 — original requirements; this context
  supersedes ENV-01 (Railway provision) with the opt-in Hetzner staging model. ENV-02 through
  ENV-05 are preserved with refinements documented in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/gsd/provisioning/stageGates/validateGates.js` — gate check pattern is directly
  reusable for the verify-work promote gate
- `server/routes/gsd.js` PATCH `/projects/:name/stage` — stage-change handler; promote/revert
  are deployment actions that may piggyback on this pattern or add parallel routes
- `server/gsd/verifyOrchestrator.js` — may already store pass/fail results; check before
  building a new verify-work query endpoint

### Established Patterns
- **Cloudflare Tunnel ingress editing:** done programmatically; the Dashboard edits
  `config.yml` and restarts `gsd-tunnel` for tunnel changes (established but verify current
  approach in the codebase)
- **SSH execution:** tmux.js has exec-on-VPS patterns; deploy scripts would use the same
  mechanism

### Integration Points
- Project object in `gsd-projects.json` (via `/data/home/gsddashboard`) needs new fields:
  `stagingEnabled`, `stagingUrl`, `stagingPort` — check `server/routes/gsd.js` for how project
  fields are persisted
- Project card component in `client/src/` needs URL chip rendering for both environments

</code_context>

<specifics>
## Specific Ideas

- **PRC project as the template:** The PRC project already runs this pattern
  (`prc.gsdlabs.dev` → staging, `prc-resources.org` → production). Before building anything,
  read how PRC is configured to ensure the new provisioning matches what's already working.
- **"Test here, then ship":** The UX goal is that the user goes to the staging URL, clicks
  around, and when satisfied, clicks "Promote" in the Dashboard. No branching ceremony.
- **Staging is behind CF Access:** User-only. Never publicly accessible. This is non-negotiable
  for every staging environment provisioned through this feature.

</specifics>

<deferred>
## Deferred Ideas

- Auto-provisioning dev Postgres (separate staging DB): out of scope for this phase. If a
  project needs a staging database, the user sets it up manually via the existing Postgres
  stack. A staging DB provisioner would be a future stackRegistry addition.
- Staging environments for non-Docker-Compose projects (e.g. PM2-only): deferred — Phase 60
  covers Docker Compose projects only for the MVP. PM2-based staging can be added later.

</deferred>

---

*Phase: 60-dev-production-environment-manager*
*Context gathered: 2026-06-12*
