---
phase: 15-new-project-creation
plan: "01"
subsystem: backend-api
tags: [api, tmux, project-creation, tdd]
dependency_graph:
  requires: []
  provides: [POST /api/gsd/projects/create]
  affects: [server/routes/gsd.js, gsd-projects.json]
tech_stack:
  added: []
  patterns: [execFileSync-tmux, loadConfig-pattern, GSD_DATA_URL-proxy]
key_files:
  created: []
  modified:
    - server/routes/gsd.js
    - server/__tests__/api.test.js
decisions:
  - name: basePath configurable via request body
    rationale: Makes the base path testable and flexible without needing a new env var
  - name: Re-read config before write to avoid race with concurrent writes
    rationale: Prevents losing entries written by other concurrent requests
  - name: Non-fatal send-keys failure
    rationale: Directory and tmux session already exist; user can retry from terminal
metrics:
  duration: ~8min
  completed: 2026-04-24
  tasks_completed: 2
  files_modified: 2
---

# Phase 15 Plan 01: POST /api/gsd/projects/create Summary

**One-liner:** Backend create endpoint that provisions directory + detached tmux session + claude launch sequence and registers the project in gsd-projects.json.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for create endpoint | a5ba7d9 | server/__tests__/api.test.js |
| 2 (GREEN) | Implement POST /api/gsd/projects/create | 20a9627 | server/routes/gsd.js |

## What Was Built

`POST /api/gsd/projects/create` accepts `{ name, basePath? }` and:
1. Validates `name` against `/^[a-zA-Z0-9_-]+$/` — returns 400 on failure
2. Returns 409 if project name already exists in gsd-projects.json
3. Creates directory with `fs.mkdirSync(dir, { recursive: true })`
4. Creates detached tmux session: `tmux new-session -d -s {name} -c {dir}`
5. Sends `claude` + `/gsd:new-project` into the session (500ms pause between)
6. Appends entry to gsd-projects.json and returns 201 `{ ok: true, project: { name, root, tmux_session } }`
7. When `GSD_DATA_URL` is set, proxies to upstream

## Test Coverage

New describe block in `server/__tests__/api.test.js` — 6 tests:
- 400 on empty name
- 400 on missing name
- 400 on name with slash
- 400 on name with dot-dot
- 409 on duplicate project name
- 201 happy path (skips if tmux unavailable in test env)

All 6 pass. Pre-existing failures (readProjectMeta, agent data proxy) unchanged.

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

- RED gate: commit `a5ba7d9` — failing tests written before implementation
- GREEN gate: commit `20a9627` — implementation makes tests pass

## Known Stubs

None — endpoint is fully wired.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: path-traversal | server/routes/gsd.js | basePath is accepted from request body; validated to be absolute but no allowlist |

Note: basePath validation only checks `path.isAbsolute()`. A caller with dashboard access could create directories anywhere on the filesystem. This is acceptable for a single-user local dashboard but noted for future hardening.

## Self-Check

### Files created/modified exist:
- server/routes/gsd.js — modified (contains `router.post('/projects/create'`)
- server/__tests__/api.test.js — modified (contains `POST /api/gsd/projects/create` describe block)

### Commits exist:
- a5ba7d9 — test(15-01)
- 20a9627 — feat(15-01)

## Self-Check: PASSED
