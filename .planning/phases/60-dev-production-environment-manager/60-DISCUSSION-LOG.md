# Phase 60: Dev/Production Environment Manager — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 60-dev-production-environment-manager
**Areas discussed:** Dev env model, Staging provisioning, Promote mechanic, Promote preview, Promote gate, Revert mechanic, UI placement, Deploy abstraction, Staging scope

---

## Dev Environment Model

| Option | Description | Selected |
|--------|-------------|----------|
| Git branch (dev branch auto-deploys, main = prod) | GitHub Actions deploys `dev` branch to a separate URL | |
| Separate Docker instance (same host, different port/subdomain) | A second Docker Compose instance on a different port + Cloudflare Tunnel subdomain | ✓ |
| Dev = tmux/local server, prod = deployed service | Dev server running in tmux IS the dev environment | |
| Re-scope: skip dev provisioning, just add the promote+revert UI | Drop ENV-01, focus on ENV-02 through ENV-05 | |

**User's choice:** Separate Docker instance — same Compose file, second service on a different port
**Notes:** User described the exact model via the PRC project example: `prc.gsdlabs.dev` (Cloudflare Access-protected staging) vs `prc-resources.org` (production). Changes go to staging first; human-verified at staging.gsdlabs.dev before promoting to production. The user left the git branch mechanic open to Claude's judgment but confirmed the outcome model.

---

## Staging Provisioning

| Option | Description | Selected |
|--------|-------------|----------|
| Same Docker Compose file, second service on different port | Staging service added to existing compose file, new Cloudflare Tunnel ingress rule added | ✓ |
| Separate branch auto-deploys to staging | `staging` branch auto-deploys via GitHub Actions | |
| You decide | Claude picks the most practical approach | |

**User's choice:** Same Docker Compose file, second service on a different port (Recommended)
**Notes:** Matches what's already working for PRC. Dashboard edits `config.yml` and restarts `gsd-tunnel`.

---

## Promote Mechanic

| Option | Description | Selected |
|--------|-------------|----------|
| Redeploy production from the same code running on staging | Dashboard SSHes in, runs deploy-prod.sh. Same code that was verified on staging goes live. | ✓ |
| Merge staging branch into main, then GitHub Actions deploys | Dashboard creates merge commit (staging → main), Actions handles production deploy | |
| You decide | Claude picks the most practical approach | |

**User's choice:** Redeploy production from the same code running on staging (Recommended)

---

## Promote Preview

| Option | Description | Selected |
|--------|-------------|----------|
| Git commits on staging not yet in production (plain-English list) | "I'm about to ship 3 changes: fixed the login bug, added dark mode..." | ✓ |
| Timestamp-based diff | Shows when staging was last deployed vs production | |
| You decide | Claude picks the most informative preview | |

**User's choice:** Git commits on staging not yet in production (plain-English list)

---

## Promote Gate

| Option | Description | Selected |
|--------|-------------|----------|
| Human confirmation at staging IS the gate | No verify-work check — just a "I've tested this on staging" confirmation prompt | |
| verify-work must have passed on staging (keep ENV-04) | Promote blocked until verify-work passes | |
| Both: verify-work check + human confirmation | verify-work gate first, then human confirmation prompt | ✓ |

**User's choice:** Both: verify-work check + human confirmation

---

## Revert Mechanic

| Option | Description | Selected |
|--------|-------------|----------|
| git revert the last commit + redeploy | Dashboard creates a git revert commit, then redeploys. History preserved. | ✓ |
| git reset --hard to previous commit + redeploy | Destructive — loses the commit from history | |
| Redeploy staging to production (roll forward) | Complex — requires snapshotting staging state | |

**User's choice:** git revert the last commit + redeploy (Recommended)

---

## UI Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Project card (both URLs visible at a glance) | Dev and Prod URL chips on the card. Promote + Revert in detail panel. | ✓ |
| Project detail panel only | Card stays minimal; all deployment UI in the expanded view | |
| Dedicated Deployment tab in project detail panel | New tab alongside Overview, Files, etc. | |

**User's choice:** Project card (both URLs visible at a glance), Promote + Revert in detail panel

---

## Deploy Abstraction

| Option | Description | Selected |
|--------|-------------|----------|
| Deploy script in each project | `scripts/deploy.sh` in each project; Dashboard calls it via SSH | ✓ |
| Dashboard knows the deploy pattern | Dashboard has built-in logic per stack type | |
| Only Docker Compose projects supported | Other stack types deferred | |

**User's choice:** Deploy script in each project (Recommended)

---

## Staging Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Opt-in per project | Toggle per project; small/simple projects not forced into staging | ✓ |
| Every Launched project automatically gets staging | Beta→Launched always provisions staging | |
| You decide | Claude picks what makes more sense | |

**User's choice:** Opt-in per project (Recommended)

---

## Claude's Discretion

- Exact port allocation for staging services
- Idempotent tunnel config edit and restart approach
- Whether staging and production share one `docker-compose.yml` with service suffix, or two separate files
- Default content of generated `scripts/deploy-staging.sh` / `scripts/deploy-prod.sh`
- Detail panel layout for Promote + Revert controls
- How verify-work results are queried (from existing `verifyOrchestrator.js`)

## Deferred Ideas

- Auto-provisioning staging Postgres (separate staging DB) — future stackRegistry provisioner
- Staging environments for PM2-only projects — deferred; Phase 60 covers Docker Compose only for MVP
