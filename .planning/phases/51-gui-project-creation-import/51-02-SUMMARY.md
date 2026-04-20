---
phase: 51-gui-project-creation-import
plan: "02"
subsystem: backend-api
tags: [projects, creation-pipeline, import, websocket, security]
dependency_graph:
  requires:
    - 51-01 (projectScaffold.js, projectDetector.js, creation_state table)
  provides:
    - "POST /api/projects/create — async project creation pipeline"
    - "POST /api/projects/import — register existing folder"
    - "GET /api/projects/import-candidates — unregistered folder scan"
    - "GET /api/projects/github-pats — PAT key listing"
    - "POST /api/projects/resume/:name — pipeline resume"
  affects:
    - server/index.js (router mount)
    - server/routes/proxy.js (PROXY_PREFIXES)
    - Plans 51-03, 51-04 (UI plans that call these endpoints)
tech_stack:
  added: []
  patterns:
    - "fire-and-forget pipeline: 202 + setImmediate + background async"
    - "lazy require for plan 01 outputs (avoids cold-start failures)"
    - "execFile with AbortSignal 30s timeout per step"
    - "path traversal guard: resolvedRoot.startsWith(DATA_HOME + sep)"
key_files:
  created:
    - server/routes/projects.js
  modified:
    - server/index.js
    - server/routes/proxy.js
decisions:
  - "Lazy-require projectScaffold/projectDetector: plans 01 and 02 run in parallel (same wave); lazy-require avoids module-not-found at server start before wave merge"
  - "Proxy timeout left at 10s: /api/projects/create responds 202 immediately (pipeline is fire-and-forget); no proxy timeout extension needed"
  - "proxy.js /api/projects added as Rule 2 deviation: 51-CONTEXT.md explicitly warns about Phase 45 proxy-prefix bug; added proactively to prevent Railway shadowing new routes"
  - "gsd_install step uses symlink (not npm install): GSD is not an npm package; .claude/get-shit-done -> /data/home/.claude/get-shit-done symlink matches quick task #45 pattern"
metrics:
  duration_minutes: 13
  completed_date: "2026-04-20"
  tasks_completed: 2
  files_changed: 3
---

# Phase 51 Plan 02: Backend Project Creation and Import Controller Summary

**One-liner:** Express controller for async project creation pipeline (scaffold→git→github→push→gsd→tmux→claude) with creation_state tracking, WebSocket broadcast, and import/resume endpoints.

## What Was Built

### server/routes/projects.js (698 lines, new)

Five REST endpoints forming the backend for Phase 51's GUI project creation and import:

- `GET /api/projects/github-pats` — lists `github_pat` and `github_pat_*` keys from encrypted credentials store (NPC-06 multi-PAT support)
- `GET /api/projects/import-candidates` — calls `detectUnregisteredFolders()` from plan 01 and returns unregistered folder paths
- `POST /api/projects/create` — validates input, seeds `creation_state` row, responds 202 immediately, runs 7-step pipeline in background via `setImmediate`
- `POST /api/projects/import` — validates folder, registers in `gsd-projects.json`, starts tmux session, optionally seeds `/gsd-analyse-codebase`
- `POST /api/projects/resume/:name` — reads `failed_at_step` from `creation_state`, reruns pipeline from that step

**Pipeline steps** (in order): `scaffold → git_init → gsd_install → github_create → git_push → tmux_start → claude_launch`

**claude_launch step:** polls tmux pane up to 30s for Claude prompt-ready pattern before sending `/gsd-new-project`, with fallback send if polling times out.

**gsd_install step:** creates `.claude/get-shit-done` symlink pointing to `/data/home/.claude/get-shit-done` (matches quick task #45 pattern; best-effort, non-fatal).

### server/index.js (updated)

Added require and mount:
```javascript
const projectsRouter = require('./routes/projects');
// ...
app.use('/api/projects', projectsRouter);
```

### server/routes/proxy.js (updated)

Added `/api/projects` to `PROXY_PREFIXES` so Railway proxy forwards all project creation/import requests to the local machine (cautionary fix per Phase 45 post-deploy bug in STATE.md).

## Security Posture

All STRIDE threats from the plan's threat model are addressed:

| Threat | Mitigation Applied |
|--------|-------------------|
| T-51-05: Shell injection | `execFile` throughout; `sanitizeName()` applied before all shell args |
| T-51-07: PAT disclosure | `GH_TOKEN` env var only; never in CLI args; never in API responses |
| T-51-08: Path traversal | `resolvedRoot.startsWith(DATA_HOME + sep)` guard in `safeProjectRoot()` |
| T-51-09: Unknown pat_key | `pat_key` validated against `listSecretKeys()` before use |
| T-51-10: ENOSPC/timeout | ENOSPC caught in `PLAIN_ERRORS`; 30s `AbortSignal` per step |

## Deviations from Plan

### Auto-added (Rule 2 — Missing Critical Functionality)

**1. [Rule 2 - Security] Added /api/projects to proxy.js PROXY_PREFIXES**
- **Found during:** Task 2
- **Issue:** 51-CONTEXT.md canonical refs explicitly note the Phase 45 post-deploy bug where missing PROXY_PREFIXES caused Railway to shadow new routes with ephemeral SQLite. The same gap would affect Plan 02's routes in Railway (proxy) mode.
- **Fix:** Added `/api/projects` to `PROXY_PREFIXES` array in `server/routes/proxy.js`
- **Files modified:** `server/routes/proxy.js`
- **Commit:** d6adfa7

### Architecture note: Lazy requires

`projectScaffold.js` and `projectDetector.js` are created by Plan 01 which runs in the same wave. To avoid module-not-found errors on server startup before the wave merges, both modules are required lazily (inside `getScaffold()` / `getDetector()` helper functions called only when the routes execute). This is transparent at runtime and requires no coordination.

## Known Stubs

None — all five endpoints implement their full intended behavior. The `claude_launch` step has a best-effort 30s poll for Claude readiness with a fallback send; this is intentional behavior (not a stub).

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries beyond those documented in the plan's threat model.

## Self-Check: PASSED

| Item | Result |
|------|--------|
| server/routes/projects.js exists | FOUND |
| 51-02-SUMMARY.md exists | FOUND |
| Commit ca4c317 (Task 1) | FOUND |
| Commit d6adfa7 (Task 2) | FOUND |
