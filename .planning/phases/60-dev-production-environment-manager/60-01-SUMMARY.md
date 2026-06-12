---
phase: 60-dev-production-environment-manager
plan: "01"
subsystem: backend
tags: [staging, provisioner, cloudflared, yaml, port-allocation]
dependency_graph:
  requires: []
  provides: [stagingProvisioner-module, staging-enable-route, staging-disable-route]
  affects: [server/routes/gsd.js, server/gsd/stagingProvisioner.js]
tech_stack:
  added: [yaml@2.x]
  patterns: [configWriteLock-serialisation, atomic-tmp-rename, execSync-pm2-restart]
key_files:
  created:
    - server/gsd/stagingProvisioner.js
    - server/__tests__/provisioning-staging.test.js
  modified:
    - server/routes/gsd.js
    - package.json
decisions:
  - "Port reuse on repeated enableStaging: if project already has a valid stagingPort in 3100-3199, reuse it rather than allocating a new one — ensures idempotent re-enable"
  - "configWriteLock chained on each call: lock is module-level, shared across add/remove calls — same pattern as envWriteLock in gsd.js"
  - "execSync called AFTER lock resolves: pm2 restart fires after atomic write completes so cloudflared sees the updated config before reloading"
  - "projectSlug derived by lowercasing + hyphenating the project name — consistent with how other slugs are derived in the codebase"
metrics:
  duration_minutes: 10
  completed_date: "2026-06-12"
  tasks_completed: 3
  files_created: 2
  files_modified: 2
---

# Phase 60 Plan 01: Staging Provisioner Backend Summary

**One-liner:** Port-allocating, idempotent YAML-editing staging provisioner with pm2 tunnel restart, two POST routes, and 19 unit tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install yaml + create stagingProvisioner.js | d5ff8b6 | server/gsd/stagingProvisioner.js, package.json |
| 2 | Test scaffold for stagingProvisioner | f288971 | server/__tests__/provisioning-staging.test.js |
| 3 | Add staging toggle routes to gsd.js | 86b03d8 | server/routes/gsd.js |

## What Was Built

`server/gsd/stagingProvisioner.js` — new module with 5 exported functions:

- **allocateStagingPort(config)**: scans all projects for existing `stagingPort` values in 3100–3199, returns the first unoccupied port, throws if range exhausted
- **addStagingIngress(projectSlug, port)**: reads `/home/claude/.cloudflare-tunnel/config.yml` with the `yaml` npm package, idempotently inserts `{hostname, service}` before the catch-all `http_status:404` entry, writes atomically via tmp+rename, serialised via module-level `configWriteLock`
- **removeStagingIngress(projectSlug)**: same parse-filter-write pattern; no-op if rule absent
- **enableStaging(projectName, config)**: calls allocateStagingPort + addStagingIngress, executes `pm2 restart gsd-tunnel`, sets `project.stagingEnabled=true`, `stagingPort`, `stagingUrl="{slug}-staging.gsdlabs.dev"`, `stagingStatus='running'`
- **disableStaging(projectName, config)**: calls removeStagingIngress, executes `pm2 restart gsd-tunnel`, sets `project.stagingEnabled=false`, `stagingStatus='stopped'` (port retained)

`server/__tests__/provisioning-staging.test.js` — 19 tests across 5 describe blocks using `node:test` + `node:assert/strict`. Mocks `child_process.execSync` via monkey-patch; isolates filesystem via `process.env.TUNNEL_CONFIG_PATH` pointing to temp YAML files.

`server/routes/gsd.js` — two new POST routes following the GSD_DATA_URL proxy pattern:
- `POST /api/gsd/projects/:name/staging/enable` → returns `{success, stagingUrl, stagingPort, stagingStatus: 'running'}`
- `POST /api/gsd/projects/:name/staging/disable` → returns `{success, stagingStatus: 'stopped'}`

## Verification Results

```
# All 5 module exports present
['allocateStagingPort', 'addStagingIngress', 'removeStagingIngress', 'enableStaging', 'disableStaging']

# 19 staging tests: pass 19, fail 0
node --test server/__tests__/provisioning-staging.test.js → # pass 19 # fail 0

# Route grep counts
grep -c "staging/enable|staging/disable" server/routes/gsd.js → 6
grep -c "stagingStatus" server/routes/gsd.js → 2

# yaml package
node -e "require('yaml'); console.log('yaml ok')" → yaml ok

# Full suite: 12 pre-existing failures (unchanged baseline), 0 new failures
npm run test:server → # pass 414 # fail 12 (all pre-existing, confirmed via stash)
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all functions fully implemented.

## Threat Flags

No new threat surface beyond what is documented in the plan's `<threat_model>`.

## Self-Check: PASSED

- `server/gsd/stagingProvisioner.js` — FOUND
- `server/__tests__/provisioning-staging.test.js` — FOUND
- Commit d5ff8b6 — FOUND
- Commit f288971 — FOUND
- Commit 86b03d8 — FOUND
