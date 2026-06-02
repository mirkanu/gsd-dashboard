# Phase 75: Discussion Log

**Date:** 2026-06-02
**Participants:** Manuel Kuhs, Claude

---

## Pre-seeded context (from .continue-here.md)

Prior research session on 2026-06-02 inventoried the full service stack and established:
- Two stack categories (infrastructure vs functional)
- stackRegistry concept and shape
- Sentry and Umami as candidates for auto-provisioning
- Sentry already half-configured globally (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG=gsdlabs`)
- Umami running at `umami.gsdlabs.dev` with programmatic API

---

## Area 1: Registry format

**Options presented:** Standalone JS file / Inline in validateGates.js / JSON file

**User chose:** Standalone file — `server/gsd/provisioning/stackRegistry.js`

**Notes:** Chosen for referenceability from both CLAUDE.md and code. validateGates.js imports it.

---

## Area 2: CLAUDE.md update scope

**Options presented:** Service table only / Full provisioning docs / Skip CLAUDE.md

**User chose:** Service table only

**Notes:** CLAUDE.md = human/Claude quick reference; stackRegistry.js = machine reference. No duplication of provisioning instructions.

---

## Area 3: Sentry gate behavior

**Options presented:** Hard gate no alert rules / Hard gate + alert rule / Soft gate advisory only

**User chose:** Soft gate (advisory only)

**Notes:** Sentry missing warns but doesn't block launch. No auto-created alert rules — Sentry defaults are enough, project-specific rules configured in Sentry UI.

---

## Area 4: Umami auth

**Options presented:** Single shared admin token / Per-project token / Skip Umami provisioner

**User chose:** Single shared admin token — `UMAMI_API_TOKEN` in `.env.production`

**Notes:** Self-hosted single-user instance; per-project token isolation is overkill.

---

## Area 5: Project CLAUDE.md injection (user-raised)

**User raised:** How will each project know what stack services are provisioned for it?

**Options presented:** CLAUDE.md injection / gsd-projects.json field / Registry lookup at plan time

**User chose:** CLAUDE.md injection — Dashboard writes `## Stack (auto-managed)` section when Beta→Launched gate succeeds.

---

## Area 6: Stack evolution rule (user-raised)

**User raised:** How to flag new external services for potential addition to the default stack?

**Options presented:** CLAUDE.md rule / Seed file convention / No enforcement

**User chose:** CLAUDE.md rule — global rule requiring stack-check before integrating any new external service.

---

## Deferred Ideas

None raised.

## Claude's Discretion items

- Exact Sentry API endpoint for project creation
- Umami API endpoint for website creation
- CLAUDE.md Stack section exact format
- Which stage transition handler triggers CLAUDE.md injection
- Whether to backfill Stack section for already-launched projects
