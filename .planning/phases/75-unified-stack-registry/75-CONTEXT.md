# Phase 75: Unified Stack Registry — Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a single canonical `stackRegistry` (`server/gsd/provisioning/stackRegistry.js`) that documents every service in the GSD infrastructure stack. Add Sentry and Umami as auto-provisionable services. When a project launches (Beta→Launched gate), the Dashboard writes a `## Stack` section into the project's CLAUDE.md so every Claude session knows what's provisioned. Update the global CLAUDE.md with the service table and a rule requiring stack-check before integrating any new external service.

This phase does NOT change stage-gate UI, project card layout, or non-provisioning dashboard features.
</domain>

<decisions>
## Implementation Decisions

### Registry Format (D-01)
- **Standalone JS file:** `server/gsd/provisioning/stackRegistry.js` exports a `SERVICES` array.
- Each entry shape: `{ name, category, globalKeys[], perProjectKeys[], customDomain, provisionerModule, gateTriggeredAt }`.
- `validateGates.js` imports it; `stackRegistry.js` becomes the single authoritative reference for what services exist and when they're provisioned.

### Stack Categories (D-02)
Two categories, carried from last session:
- **`infrastructure`** — provisioned at stage gates, same for every web project: Umami, BetterStack, R2/Cloudflare, Sentry.
- **`functional`** — provisioned when a feature needs it, not every project uses all: PostgreSQL, Resend, Cloudflare Tunnel, GitHub, Pipedream.

### Pipedream (D-08)
- Category: **functional** — not auto-provisioned; only relevant when a project needs webhook automation or workflow triggers.
- Global key: `PIPEDREAM_API_KEY` (already in `.env.production`).
- Per-project keys: none standardised yet — document as a known option in the registry with no `gateTriggeredAt` and no provisioner module.
- Registry entry documents its existence so Claude knows to reach for it rather than suggest an alternative automation tool.

### Discovery Pass (D-09)
- As part of building `stackRegistry.js`, the executor scans `server/gsd/gsd-projects.json` and `/home/services/.env.production` for service key patterns already in use across projects (e.g. `*_RESEND_API_KEY`, `*_PIPEDREAM_*`, `*_POSTGRES_*`).
- Any service found in use but not yet in the registry is surfaced as a proposed addition (with suggested shape).
- No code changes to existing projects — discovery only. Output goes into a comment block at the top of `stackRegistry.js` listing "services found in use, not yet formalised" so future phases can pick them up.

### Sentry Provisioner (D-03)
- Provisioner: `server/gsd/provisioning/sentryProvisioner.js` — create project in `gsdlabs` org via Sentry API → store `{PROJECT}_SENTRY_DSN` in `.env.production`.
- Gate behavior: **soft gate** (advisory only) at Beta→Launched. Sentry missing shows a warning but does NOT block launch (same pattern as GitHub Issues in Phase 58 D-04).
- No auto-created alert rules — Sentry's defaults are sufficient; alert rules are project-specific and configured in Sentry UI.
- Existing global keys: `SENTRY_AUTH_TOKEN` and `SENTRY_ORG=gsdlabs` already in `.env.production`. `SENTRY_PROJECT=pr-resources` is PRC-specific — the provisioner creates per-project entries instead.

### Umami Provisioner (D-04)
- Provisioner: `server/gsd/provisioning/umamiProvisioner.js` — create website entry on `umami.gsdlabs.dev` via Umami API → store `{PROJECT}_UMAMI_WEBSITE_ID` in `.env.production`.
- Auth: single shared admin token — add `UMAMI_API_TOKEN` to `.env.production`. No per-project tokens (self-hosted single-user instance, no isolation needed).
- Gate behavior: hard gate at Beta→Launched (consistent with BetterStack and R2 — analytics is a launch requirement).

### Project CLAUDE.md Injection (D-05)
- When a project's Beta→Launched gate succeeds, the Dashboard (stage transition handler) writes/updates a `## Stack (auto-managed)` section in the project's CLAUDE.md.
- Section lists all provisioned infrastructure services with the specific env var names for that project (e.g. `PROJ_UMAMI_WEBSITE_ID`, `PROJ_SENTRY_DSN`).
- This ensures every Claude session inside the project knows what's available without a tool call.
- Format: markdown comment block — do not edit manually; updated by Dashboard on each stage transition.

### Global CLAUDE.md Update (D-06)
- Update `/home/claude/.claude/CLAUDE.md`: extend the existing shared credentials table to cover all services in `stackRegistry.js` (including Umami and Sentry global keys).
- Add a **Stack Registry Rule** section:
  > Before integrating any new external service, check `server/gsd/provisioning/stackRegistry.js`. If the service solves a general problem (monitoring, email, storage, error tracking, analytics), propose adding it to the registry before writing integration code.
- CLAUDE.md = human/Claude quick reference. `stackRegistry.js` = machine reference. No duplication of provisioning instructions in CLAUDE.md.

### Stack Registry Rule Enforcement (D-07)
- Enforced via global CLAUDE.md rule (Claude reads it at session start).
- No seed file or automated gate for this — Claude uses judgment at plan time.

### Claude's Discretion
- Exact Sentry API endpoint for project creation (`POST /api/0/teams/{org}/projects/`)
- Umami API endpoint for website creation (`POST /api/websites`)
- Precise format of the `## Stack (auto-managed)` CLAUDE.md section
- Which stage transition handler in `stageGates/` triggers CLAUDE.md injection
- Whether to backfill CLAUDE.md Stack section for already-launched projects on startup
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

1. `server/gsd/provisioning/betterStackProvisioner.js` — pattern for new provisioners (Sentry, Umami follow same shape)
2. `server/gsd/provisioning/r2Provisioner.js` — pattern for bucket-style provisioners
3. `server/gsd/provisioning/stageGates/validateGates.js` — existing gate logic to extend with Sentry + Umami
4. `.planning/phases/58-project-maturity-stages/58-CONTEXT.md` — original stage gate decisions (D-03, D-04, D-06, D-07)
5. `/home/services/.env.production` — current global keys inventory (SENTRY_AUTH_TOKEN, SENTRY_ORG already present)
6. `/home/claude/.claude/CLAUDE.md` — global CLAUDE.md to update with service table and stack registry rule
</canonical_refs>

<code_context>
## Reusable Assets

- `betterStackProvisioner.js` — `provisionMonitor(projectName, url)` / `checkMonitor(name)` / `deleteMonitor(id)` — direct pattern to copy for Sentry/Umami
- `r2Provisioner.js` — `createBucket(projectName)` / `checkBucket(name)` — bucket-style pattern
- `validateGates.js` — `requiresProvisioning[]` array already supports multiple gates; add `sentryProject` and `umamiWebsite` entries alongside existing `betterStackMonitor` and `r2Bucket`
- Global CLAUDE.md shared credentials table at `/home/claude/.claude/CLAUDE.md` — extend the existing `| Variable | Service | Used for |` table
</code_context>
