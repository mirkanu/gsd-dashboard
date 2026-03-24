---
phase: "09"
plan: "01"
subsystem: tmux-backend-wiring
tags: [tmux, liveness, backend, api]
dependency_graph:
  requires: []
  provides: [tmuxActive field on GET /api/gsd/projects]
  affects: [server/routes/gsd.js, server/gsd/tmux.js]
tech_stack:
  added: []
  patterns: [execFileSync with stdio ignore for silent process check]
key_files:
  created:
    - server/gsd/tmux.js
  modified:
    - server/routes/gsd.js
    - server/__tests__/api.test.js
decisions:
  - Use execFileSync with stdio ignore so tmux output never leaks into server logs
  - Return false for all errors (tmux not installed, session absent) to keep helper non-throwing
metrics:
  duration: ~2 minutes
  completed: 2026-03-24
  tasks_completed: 3
  files_changed: 3
---

# Phase 9 Plan 01: tmux Liveness Helper and tmuxActive Field Summary

Added a tmux session liveness helper (`isTmuxSessionActive`) and wired it into the GET /api/gsd/projects endpoint so every project object carries a `tmuxActive: boolean` field.

## What Was Done

**Task 1 — server/gsd/tmux.js**
New helper module. `isTmuxSessionActive(sessionName)` runs `tmux has-session -t <name>` via `execFileSync` with `stdio: 'ignore'`. Returns `true` if the session exists, `false` for falsy input or any error. Never throws.

**Task 2 — server/routes/gsd.js**
Imported the new helper. Updated the local-path branch of `GET /api/gsd/projects` to destructure `tmux_session` from each config entry and spread `tmuxActive: isTmuxSessionActive(tmux_session)` onto the project object returned by `readProject`.

**Task 3 — server/__tests__/api.test.js**
Added a `Phase 9: tmuxActive` describe block with four tests:
- HTTP endpoint returns `tmuxActive: boolean` for every project
- `isTmuxSessionActive(null)` returns false
- `isTmuxSessionActive("")` returns false
- `isTmuxSessionActive` returns false for a nonexistent session name

## Test Results

All 4 Phase 9 tests pass. Two pre-existing failures in the `resolveFile / 'plan'` suite remain unchanged and are unrelated to this plan.

## Deviations from Plan

None — plan executed exactly as written.
