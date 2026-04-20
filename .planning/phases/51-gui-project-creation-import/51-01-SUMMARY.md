---
phase: 51-gui-project-creation-import
plan: "01"
subsystem: server/gsd
tags: [infrastructure, scaffold, detector, db-migration, proxy]
dependency_graph:
  requires: []
  provides:
    - server/gsd/projectScaffold.js (scaffoldProject, sanitizeName, STEP_SEQUENCE)
    - server/gsd/projectDetector.js (detectUnregisteredFolders, isProject, MANIFEST_FILES)
    - creation_state table in SQLite
    - /api/projects in PROXY_PREFIXES
  affects:
    - server/db.js (migration appended)
    - server/routes/proxy.js (prefix added, timeout extended)
tech_stack:
  added: []
  patterns:
    - try/catch idempotent DB migration pattern (existing)
    - Node.js built-in test runner with node:test
    - TDD RED/GREEN cycle per task
key_files:
  created:
    - server/gsd/projectScaffold.js
    - server/gsd/projectDetector.js
    - server/__tests__/projectScaffold.test.js
    - server/__tests__/projectDetector.test.js
  modified:
    - server/db.js
    - server/routes/proxy.js
decisions:
  - sanitizeName treats underscores as word separators (→ spaces) before stripping non-[a-z0-9\s-] chars, so "a__b  c" → "a-b-c" per plan spec
  - api.test.js failure (404 vs 400) is pre-existing and unrelated to this plan
metrics:
  duration: "17 minutes"
  completed: "2026-04-20"
  tasks_completed: 2
  files_created: 4
  files_modified: 2
---

# Phase 51 Plan 01: Project Creation Infrastructure Summary

**One-liner:** SQLite creation_state tracking table, projectScaffold.js (name sanitizer + directory scaffolder), projectDetector.js (unregistered folder scanner), and proxy.js /api/projects prefix — foundational layer for the Plan 02 project creation route.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | creation_state DB migration + projectScaffold.js utility | 1585c58 | server/gsd/projectScaffold.js, server/db.js |
| 2 | projectDetector.js utility + proxy.js PROXY_PREFIXES update | 07d35ea | server/gsd/projectDetector.js, server/routes/proxy.js |

## What Was Built

### server/gsd/projectScaffold.js
- `sanitizeName(input)`: lowercase, ASCII-only, underscores/spaces → dashes, collapse dashes, trim
- `scaffoldProject(projectRoot, { name, description })`: creates README.md, .gitignore, package.json; throws if dir already exists
- `STEP_SEQUENCE`: 7-step ordered array (`scaffold`, `git_init`, `gsd_install`, `github_create`, `git_push`, `tmux_start`, `claude_launch`)

### server/gsd/projectDetector.js
- `isProject(folderPath)`: returns true if folder contains `.git`, `package.json`, `pyproject.toml`, `Cargo.toml`, or `go.mod`; never throws
- `detectUnregisteredFolders(dataHomeRoot, registeredNames)`: scans root, skips dotfiles/EXCLUDE_NAMES/registered; returns absolute paths; never throws
- `MANIFEST_FILES`: exported array of manifest filenames

### server/db.js
- Appended idempotent `creation_state` migration (try/catch pattern): table with `project_name` PK, `last_completed_step`, `step_sequence`, `current_step`, `failed_at_step`, `error_message`, timestamps; index on `project_name`

### server/routes/proxy.js
- Added `'/api/projects'` to `PROXY_PREFIXES`
- Extended timeout to 120s for `/api/projects/create` (creation pipeline can take 10-30s)

## Test Results

- 16/16 projectScaffold tests pass
- 16/16 projectDetector tests pass
- 1/1 proxy-prefixes test passes
- Pre-existing api.test.js failure (404 vs 400) confirmed pre-existing (not caused by this plan)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] sanitizeName underscore handling**
- **Found during:** Task 1 GREEN phase
- **Issue:** Plan specified `sanitizeName("a__b  c")` returns `"a-b-c"`. Initial implementation stripped underscores (not in `[a-z0-9\s-]`) producing `"ab-c"` instead
- **Fix:** Added `.replace(/[_]+/g, ' ')` step before char strip so underscores → spaces → dashes, yielding correct `"a-b-c"`
- **Files modified:** server/gsd/projectScaffold.js
- **Commit:** 1585c58

## Known Stubs

None — this plan is pure server-side infrastructure with no UI rendering.

## Threat Surface Scan

No new network endpoints introduced in this plan. The `creation_state` table and utility modules are consumed by Plan 02's route layer. The threat model entries T-51-01 (sanitizeName whitelist) and T-51-02 (path validation — delegated to Plan 02 route layer) are correctly addressed:
- T-51-01: sanitizeName uses whitelist `[a-z0-9\s-]` (mitigated)
- T-51-02: projectRoot path validation deferred to Plan 02 route layer as documented in threat register

## Self-Check: PASSED

- server/gsd/projectScaffold.js: exists, exports scaffoldProject/sanitizeName/STEP_SEQUENCE
- server/gsd/projectDetector.js: exists, exports detectUnregisteredFolders/isProject/MANIFEST_FILES
- server/db.js: contains "CREATE TABLE IF NOT EXISTS creation_state" (4 occurrences)
- server/routes/proxy.js: contains '/api/projects' and 120000
- Commits 06d5b6f (RED test scaffold), 1585c58 (GREEN impl), bece016 (RED test detector), 07d35ea (GREEN impl) all exist in git log
