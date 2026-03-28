---
phase: 04-backend-file-api
plan: 02
subsystem: server/api
tags: [api, file-resolver, planning-files, tdd]
requirements: [API-02, API-03]

dependency_graph:
  requires: [04-01]
  provides: [GET /api/gsd/projects/:name/files/:fileId]
  affects: [server/routes/gsd.js, server/gsd/fileResolver.js]

tech_stack:
  added: []
  patterns: [dynamic-file-resolution, text-plain-response]

key_files:
  created:
    - server/gsd/fileResolver.js
  modified:
    - server/routes/gsd.js
    - server/__tests__/api.test.js

decisions:
  - Validate fileId against whitelist before resolveFile to return 400 vs 404 accurately
  - resolveFile returns null on any error (graceful), route maps null to 404
  - Use text/plain; charset=utf-8 content-type for raw markdown responses

metrics:
  duration_minutes: 9
  completed_date: 2026-03-21
  tasks_completed: 2
  files_created: 1
  files_modified: 2
---

# Phase 4 Plan 02: File Endpoint — Backend File API Summary

**One-liner:** GET /api/gsd/projects/:name/files/:fileId serving raw markdown via server-side path resolution using STATE.md for 'plan' discovery.

## What Was Built

Added a new Express route and supporting module to serve raw planning file content for any configured GSD project.

### server/gsd/fileResolver.js (new)

`resolveFile(projectName, root, fileId)` maps file identifiers to absolute paths:
- `state` → `<root>/.planning/STATE.md`
- `roadmap` → `<root>/.planning/ROADMAP.md`
- `requirements` → `<root>/.planning/REQUIREMENTS.md`
- `plan` → dynamically resolved: reads `current_phase` from STATE.md, extracts phase number, finds the matching `NN-*` subdirectory under `.planning/phases/`, then returns the first PLAN.md file that has no corresponding SUMMARY.md (the active plan). Falls back to last PLAN.md if all have summaries.
- Any other fileId or filesystem error → returns `null`

### server/routes/gsd.js (modified)

Added `GET /api/gsd/projects/:name/files/:fileId`:
1. Look up project by name in `gsd-projects.json`; 404 if not found
2. Reject unknown fileIds with 400 `{"error":"Unknown file identifier"}`
3. Call `resolveFile`; if null → 404 `{"error":"File not found"}`
4. Read file content; send as `text/plain; charset=utf-8`
5. Catch read errors → 404

Existing `/config` and `/projects` routes untouched.

## Test Coverage

12 new tests added (6 unit + 6 integration), all passing. Total server test count: 70, 0 failures.

**Unit tests (resolveFile):**
- state/roadmap/requirements return correct absolute paths
- plan returns a path ending in `-PLAN.md`
- unknown fileId returns null
- missing-root for plan returns null

**Integration tests (GET /api/gsd/projects/:name/files/:fileId):**
- state/roadmap/requirements/plan all return 200 text/plain with non-empty content
- unknown project → 404 `{"error":"Project not found"}`
- unknown fileId → 400 `{"error":"Unknown file identifier"}`

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Description | Hash |
|------|-------------|------|
| 1 | Create fileResolver.js with resolveFile() | 334713b |
| 2 | Add GET /api/gsd/projects/:name/files/:fileId route | ccd08ad |

## Self-Check: PASSED

- server/gsd/fileResolver.js: FOUND
- server/routes/gsd.js: FOUND
- Commit 334713b: FOUND
- Commit ccd08ad: FOUND
