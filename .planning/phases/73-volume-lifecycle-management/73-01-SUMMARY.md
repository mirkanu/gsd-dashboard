---
phase: 73-volume-lifecycle-management
plan: "01"
subsystem: server/routes
tags: [system-api, docker, cron, earlyoom]
dependency_graph:
  requires: []
  provides: [GET /system/docker-df, GET /system/oom-status, docker-prune-cron-v2]
  affects: [server/routes/system.js, crontab]
tech_stack:
  added: []
  patterns: [execSync-with-timeout, graceful-degradation-on-shell-error]
key_files:
  modified:
    - server/routes/system.js
decisions:
  - "readOomStatus placed after disk-detail route (before routes that use it) — minor style deviation, no functional impact"
  - "useSudo: false for docker-prune because claude user is in docker group — no sudo needed"
  - "docker image prune without -a to preserve recently-pulled images per D-05"
  - "Pre-existing test failures in app-settings-route.test.js and others are not caused by this plan"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-29"
  tasks_completed: 2
  files_modified: 1
---

# Phase 73 Plan 01: Docker Space API + OOM Status + Prune Cron Fix Summary

Two new read-only GET endpoints added to the system router plus a targeted fix to the docker-prune cron policy: builder prune with 2 GB keep-storage plus dangling-only image prune (no `-a`).

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add readDockerDf() and GET /docker-df | 1e4fba6 | server/routes/system.js |
| 2 | Add readOomStatus(), GET /oom-status, fix CRON_WHITELIST + crontab | 4db7695 | server/routes/system.js |

## What Was Built

### GET /system/docker-df
- `readDockerDf()` runs `docker system df --format '{{json .}}'` with a 5-second timeout
- Parses one JSON object per line into `{ type, size, reclaimable }` entries
- Returns `{ entries: [...], error: null }` when Docker is available
- Returns `{ entries: [], error: "unavailable" }` on any failure — always 200, never 500

### GET /system/oom-status
- `readOomStatus()` runs `systemctl is-active earlyoom` with a 3-second timeout
- Returns `{ earlyoom: "active" }` or `{ earlyoom: "inactive" }`
- `systemctl` exits non-zero when inactive — caught and returned as `"inactive"`

### CRON_WHITELIST["docker-prune"] update
Before:
```js
cmd: "docker", args: ["system", "prune", "-f"], useSudo: true
```
After:
```js
cmd: "bash", args: ["-c", "docker builder prune --keep-storage 2gb -f && docker image prune -f"], useSudo: false
```
- Preserves 2 GB of recent build cache instead of wiping everything
- No `-a` flag on image prune — dangling-only, preserving recently-pulled images
- `useSudo: false` — claude user is in the `docker` group

### Crontab updated
```
0 4 * * 0 bash -c 'docker builder prune --keep-storage 2gb -f && docker image prune -f' >> /var/log/docker-prune.log 2>&1
```

## Deviations from Plan

### Auto-accepted style deviation
**readOomStatus() placement:** The function was inserted after the `disk-detail` route handler rather than immediately after `readDockerDf()` due to the stash/restore sequence during pre-existing test investigation. All routes that call it are registered after its definition — no functional impact.

### Pre-existing test failures (out of scope)
`npm run test:server` has pre-existing failures unrelated to this plan:
- `app-settings-route.test.js` — railway_ram_rate_monthly key assertion
- `autopilot.manager` tests — circuit breaker / retry logic
- `khw.pivot`, `STAT-02` heuristic tests

These failures existed before any changes in this plan (confirmed by stash verification). They are out of scope per deviation rules and logged here for awareness.

## Threat Model Compliance

| Threat ID | Status |
|-----------|--------|
| T-73-01 | Mitigated — CRON_WHITELIST is a hardcoded server constant; `useSudo: false` eliminates sudo escalation |
| T-73-02 | Mitigated — `timeout: 5000` on readDockerDf(); catch returns `{ entries: [], error: "unavailable" }` |
| T-73-03 | Accepted — dashboard is single-user, cookie-auth gated |
| T-73-04 | Accepted — crontab write runs as claude user, new entry is narrower than previous |

## Known Stubs

None — both endpoints return real data from the OS/Docker daemon.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced beyond what is in the plan's threat model.

## Self-Check: PASSED

- [x] `server/routes/system.js` contains `function readDockerDf()` — line 75
- [x] `server/routes/system.js` contains `router.get("/docker-df"` — line 128
- [x] `server/routes/system.js` contains `function readOomStatus()` — line 118
- [x] `server/routes/system.js` contains `router.get("/oom-status"` — line 136
- [x] CRON_WHITELIST docker-prune has `cmd: "bash"` — line 148
- [x] CRON_WHITELIST docker-prune has `keep-storage 2gb` — line 149
- [x] No `docker image prune -a` in file
- [x] `useSudo: false` — line 150
- [x] Crontab shows `docker builder prune --keep-storage 2gb` entry
- [x] Task 1 commit 1e4fba6 exists
- [x] Task 2 commit 4db7695 exists
- [x] Both endpoints return 307 (auth redirect, not 404) confirming routes are registered
