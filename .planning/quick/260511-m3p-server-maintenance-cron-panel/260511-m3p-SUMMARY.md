---
phase: quick-260511-m3p
plan: 01
subsystem: server-ui
tags: [cron, maintenance, server-page, backend-routes]
dependency_graph:
  requires: []
  provides: [cron-status-api, run-cron-api, maintenance-card-ui]
  affects: [server/routes/system.js, client/src/pages/ServerPage.tsx]
tech_stack:
  added: []
  patterns: [CRON_WHITELIST whitelist pattern, execFile with timeout, expandable output pre block]
key_files:
  created: []
  modified:
    - server/routes/system.js
    - client/src/lib/types.ts
    - client/src/lib/api.ts
    - client/src/pages/ServerPage.tsx
decisions:
  - CRON_WHITELIST hardcoded object — no exec happens before whitelist check (T-m3p-01 mitigation)
  - execFile timeout 60000ms → 504 on kill (T-m3p-04 mitigation)
  - Read last 2KB of log file via fd + readSync rather than readFileSync to avoid loading huge logs
  - runCron callback updates row status after execution via post-run cronStatus fetch
metrics:
  duration: ~15min
  completed_date: "2026-05-11T14:54:01Z"
  tasks: 3
  files: 4
---

# Quick Task 260511-m3p: Server Maintenance Cron Panel Summary

**One-liner:** Cron job panel on /server page with GET /api/system/cron-status + POST /api/system/run-cron/:name (whitelist-enforced) and inline Run Now buttons with expandable output.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Backend — cron-status GET + run-cron POST | f59095c | server/routes/system.js |
| 2 | Types + API client additions | 862e463 | client/src/lib/types.ts, client/src/lib/api.ts |
| 3 | Maintenance card in ServerPage.tsx | 40c2ef6 | client/src/pages/ServerPage.tsx |
| - | Rebuild client dist | 4ca2624 | client/dist/ |

## What Was Built

### Backend (server/routes/system.js)

- `CRON_WHITELIST` — hardcoded map of 3 jobs: `docker-prune`, `prune-old-data`, `memory-guard`
- `GET /api/system/cron-status` — reads each log file's mtime + last 2KB of content; returns `[{name, schedule, lastRun, lastOutput, running}]` x3; absent log = `lastRun: null` (never run)
- `POST /api/system/run-cron/:name` — validates against whitelist first (400 on unknown name), runs via `execFile` with 60s timeout, returns `{ok, output, exitCode}`; 504 on timeout

### Types (client/src/lib/types.ts)

- `CronJobStatus` interface exported
- `RunCronResult` interface exported

### API client (client/src/lib/api.ts)

- `api.system.cronStatus()` → `GET /system/cron-status`
- `api.system.runCron(name)` → `POST /system/run-cron/:name`

### Frontend (client/src/pages/ServerPage.tsx)

- Maintenance card at bottom of `/server` page
- 3 cron rows: name (monospace), schedule badge (pill), last-run timestamp or "Never run" italic
- Run Now button: disabled + spinner during execution, re-enabled after
- Expandable output block: "Show output" / "Hide output" toggle; `<pre>` with max-h-48 scroll
- Post-run: refreshes cron status row via `api.system.cronStatus()`

## Verification

- `curl http://localhost:4820/api/system/cron-status` — returns 3-item array with real data (memory-guard last run 14:50, prune-old-data last run 2026-05-10)
- `curl -X POST http://localhost:4820/api/system/run-cron/bad-name` — returns 400 + "Unknown cron job" message
- Playwright E2E: Maintenance heading visible, all 3 cron rows present, 3 Run Now buttons found
- `npm run build` (client) — zero TypeScript errors
- `npm run test:server` — 341 pass, 11 fail; failures are pre-existing (readProjectMeta, agent-data-proxy, autopilot.manager, heuristic tests) — none in system.js or new code

## Threat Model Compliance

| ID | Disposition | Status |
|----|-------------|--------|
| T-m3p-01 | mitigate | CRON_WHITELIST check before any execFile call; unknown names → 400 |
| T-m3p-02 | accept | Dashboard auth-gated; sudo limited to docker binary |
| T-m3p-03 | accept | Last 2KB of ops logs only; no secrets in log content |
| T-m3p-04 | mitigate | execFile timeout: 60000 → kills child, returns 504 |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- server/routes/system.js: modified with CRON_WHITELIST + 2 routes
- client/src/lib/types.ts: CronJobStatus + RunCronResult exported
- client/src/lib/api.ts: cronStatus + runCron in api.system namespace
- client/src/pages/ServerPage.tsx: Maintenance card at bottom of page
- Commits: f59095c, 862e463, 40c2ef6, 4ca2624 — all present in git log
