---
phase: "09"
plan: "02"
subsystem: "gsd-api"
tags: [tmux, api, send-keys, proxy]
dependency_graph:
  requires: [09-01]
  provides: [POST /api/gsd/projects/:name/send]
  affects: [server/routes/gsd.js]
tech_stack:
  added: []
  patterns: [env-var config override, tmux send-keys integration, upstream proxy]
key_files:
  created: []
  modified:
    - server/routes/gsd.js
    - server/__tests__/api.test.js
decisions:
  - loadConfig reads GSD_PROJECTS_PATH at call time to allow per-request config override in tests
metrics:
  duration: "~5 minutes"
  completed: "2026-03-24"
  tasks: 2
  files: 2
---

# Phase 09 Plan 02: Add POST /api/gsd/projects/:name/send Summary

**One-liner:** POST endpoint that dispatches text to a project's configured tmux session via `send-keys`, with upstream proxy support and full input validation.

## What Was Built

Added `POST /api/gsd/projects/:name/send` to `server/routes/gsd.js`. The endpoint:

1. Proxies to `GSD_DATA_URL` when configured (same pattern as existing routes)
2. Validates `text` field is a non-empty string (400 on failure)
3. Looks up the project by name in config (404 if not found)
4. Checks that `tmux_session` is set on the project (422 if missing)
5. Verifies the tmux session is currently active via `isTmuxSessionActive` (409 if inactive)
6. Runs `execFileSync('tmux', ['send-keys', '-t', session, text, 'Enter'])` and returns `{ ok: true }`

Also updated `loadConfig()` to read `process.env.GSD_PROJECTS_PATH` at call time (rather than using a module-level constant), enabling tests to swap configs per-test without server restart.

## Tests Added

5 new tests in `describe('Phase 9: POST /api/gsd/projects/:name/send')`:

| Test | Status Code |
|------|-------------|
| Unknown project | 404 |
| Project with no tmux_session | 422 |
| Missing text body | 400 |
| Empty string text | 400 |
| Configured session not running | 409 |

All 5 pass. The 2 pre-existing `resolveFile 'plan'` failures are unrelated.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `server/routes/gsd.js` modified with loadConfig change and new POST route
- [x] `server/__tests__/api.test.js` has 5 new passing tests
- [x] Commit `7362c01` verified
