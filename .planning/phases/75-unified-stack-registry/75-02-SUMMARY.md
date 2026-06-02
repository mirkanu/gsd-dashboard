---
plan: 75-02
phase: 75-unified-stack-registry
status: complete
self_check: PASSED
subsystem: provisioning
tags: [provisioning, sentry, umami, stage-gates, tdd]
dependency_graph:
  requires: [75-01]
  provides: [sentryProvisioner, umamiProvisioner, validateGates-extended]
  affects: [server/gsd/provisioning/stageGates/validateGates.js]
tech_stack:
  added: []
  patterns: [login-per-call-token, domain-matching-check, two-step-api-provision]
key_files:
  created:
    - server/gsd/provisioning/sentryProvisioner.js
    - server/gsd/provisioning/umamiProvisioner.js
  modified:
    - server/gsd/provisioning/stageGates/validateGates.js
decisions:
  - "Sentry uses team=org slug (gsdlabs) as default — createProject fails with descriptive error if wrong; soft gate means this is acceptable"
  - "Umami uses UMAMI_ADMIN_PASSWORD login-per-call (not cached token) to avoid Pitfall 2 (token expiry)"
  - "checkWebsite uses domain matching (not env var presence) to prevent duplicate sites on re-run (Pitfall 3)"
  - "sentryProject pushed to requiresProvisioning even as soft gate — Plan 03 PATCH /stage uses this list to try provisioning (best-effort)"
metrics:
  duration: "~12min"
  completed: "2026-06-02"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 75 Plan 02: Sentry + Umami Provisioners + Gate Extension Summary

## What was built

**sentryProvisioner.js** — two-step Sentry API provisioner following the exact betterStackProvisioner.js pattern. `createProject()` calls `POST /teams/{org}/{team}/projects/` to create a project then `GET /projects/{org}/{slug}/keys/` to retrieve the DSN (which is NOT in the creation response). `checkProject()` calls `GET /projects/{org}/{slug}/` and returns false on any failure. `projectSlug()` sanitises names to `gsd-{name}` with `[a-z0-9-]` only, mirroring `r2Provisioner.bucketName()`.

**umamiProvisioner.js** — login-per-call Umami provisioner. `getToken()` POSTs to `/api/auth/login` with `UMAMI_ADMIN_PASSWORD` on each `createWebsite()` or `checkWebsite()` call (avoids Pitfall 2: token expiry). `checkWebsite()` queries `GET /api/websites` and matches by `domain` field (not env var presence), preventing duplicate site creation on re-runs (Pitfall 3). `websiteName()` sanitises identically to `projectSlug()`.

**validateGates.js extended** — two new imports at top (`sentryProvisioner`, `umamiProvisioner`). In the `beta->launched` block, inserted before the existing GitHub Issues soft gate: (1) Umami hard gate — `checkWebsite(project.name, project.productionUrl)` → pushes `'umamiWebsite'` to `requiresProvisioning` if absent; (2) Sentry soft gate — `checkProject(project.name)` → pushes advisory softGate entry AND `'sentryProject'` to `requiresProvisioning` (Plan 03 PATCH route will attempt provisioning best-effort for soft items).

## Test Results

All 17 provisioning tests GREEN (0 failures):
- PROV-01: sentryProvisioner.createProject() returns `{ dsn, projectSlug }` ✓
- PROV-02: sentryProvisioner.createProject() throws on missing token ✓
- PROV-03: sentryProvisioner.checkProject() returns false on 404 ✓
- PROV-04: umamiProvisioner.createWebsite() returns `{ websiteId }` ✓
- PROV-05: umamiProvisioner.checkWebsite() uses domain matching ✓
- PROV-06: umamiProvisioner.checkWebsite() returns false on login failure ✓
- GATE-01: beta->launched includes `umamiWebsite` in requiresProvisioning ✓
- GATE-02: beta->launched includes `sentryProject` in requiresProvisioning ✓
- All 9 pre-existing betterStack/r2/validateGates tests still GREEN ✓

Pre-existing failures in full suite (10 tests): readProjectMeta, app-settings, autopilot.manager, stateBroadcaster — all unrelated to this plan, not introduced by this plan's changes.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — both provisioners are fully wired to live APIs. Gate checks call real provisioner logic.

## Threat Flags

No new network endpoints or auth paths introduced beyond what the threat model accounts for:
- sentryProvisioner → sentry.io: server-side only, token never reaches client
- umamiProvisioner → localhost:3007: internal call, password never reaches client or appears in error messages

## Self-Check

- [x] sentryProvisioner.js exists: `server/gsd/provisioning/sentryProvisioner.js`
- [x] umamiProvisioner.js exists: `server/gsd/provisioning/umamiProvisioner.js`
- [x] validateGates.js has sentryProvisioner import
- [x] validateGates.js has umamiProvisioner import
- [x] validateGates.js has umamiWebsite gate check
- [x] validateGates.js has sentryProject soft gate
- [x] Task 1 commit: e4a481e
- [x] Task 2 commit: 2d1580d
- [x] 17/17 provisioning tests GREEN
