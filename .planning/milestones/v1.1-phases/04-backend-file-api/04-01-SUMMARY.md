---
phase: 04-backend-file-api
plan: 01
subsystem: server/gsd
tags: [readers, project-meta, version, liveUrl, tdd]
dependency_graph:
  requires: []
  provides: [readProjectMeta, version-field, liveUrl-field]
  affects: [server/routes/gsd.js, /api/gsd/projects response shape]
tech_stack:
  added: []
  patterns: [regex parsing, first-30-lines scan, null-safe reader]
key_files:
  created: []
  modified:
    - server/gsd/readers.js
    - server/__tests__/api.test.js
decisions:
  - "Scan only first 30 lines of PROJECT.md to avoid false positives in body content"
  - "Try explicit '**Version: vX.Y' regex first, fall back to bare '**vX.Y' pattern"
  - "Take first https:// URL found in scanned lines as liveUrl"
  - "Export readProjectMeta separately so it can be tested in isolation"
metrics:
  duration_seconds: 337
  completed_date: "2026-03-21"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 2
requirements:
  - API-01
---

# Phase 4 Plan 1: Add readProjectMeta — Version and Live URL from PROJECT.md Summary

Parse `version` and `liveUrl` from each project's `.planning/PROJECT.md` and include them in the `readProject()` return value (and therefore the `/api/gsd/projects` API response).

## One-Liner

Added `readProjectMeta()` to `server/gsd/readers.js` using regex-based scanning of the first 30 lines of `PROJECT.md` to extract version string (e.g. `v1`) and live URL (e.g. `https://gsd-dashboard-production.up.railway.app`).

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| RED  | Add failing tests for readProjectMeta | da6f1ae | server/__tests__/api.test.js |
| GREEN | Implement readProjectMeta + extend readProject | 81d3688 | server/gsd/readers.js, server/__tests__/api.test.js |

## What Was Built

### `readProjectMeta(root)`

New function in `server/gsd/readers.js`:

1. Reads `.planning/PROJECT.md` from the project root using existing `readFile` + `planningPath` helpers.
2. Returns `{ version: null, liveUrl: null }` if the file is missing (no crash).
3. Scans only the first 30 lines to avoid false positives deep in the file.
4. Version regex: tries `\*\*[Vv]ersion:\s*(v[\d.]+)` first, falls back to `\*\*(v[\d.]+)\b`.
5. Live URL: takes first `https?://[^\s)>]+` match in scanned lines.
6. Exported from `module.exports` alongside existing exports.

### `readProject()` extension

Extended to call `readProjectMeta(root)` and spread `version` and `liveUrl` into the returned object. The `/api/gsd/projects` response now includes these fields for every project automatically.

### Tests

Three new tests in `server/__tests__/api.test.js` under `describe('readProjectMeta')`:
- Test 1: `gsddashboard` root → version is string starting with `v`, liveUrl starts with `https://`
- Test 2: temp directory (no PROJECT.md) → both fields are `null`
- Test 3: `readProject()` return value has `version` and `liveUrl` keys

All 3 pass. `npm run test:server`: 63/64 pass (the 1 failure is `resolveFile` test for plan 04-02, pre-existing out-of-scope code).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect test path to project root**
- **Found during:** Task 1 GREEN phase
- **Issue:** Test used `path.join(__dirname, "../../..")` which resolves to `/data/home` (3 levels up from `server/__tests__/`) instead of `/data/home/gsddashboard` (2 levels up).
- **Fix:** Changed to `path.join(__dirname, "../..")` in both uses within the `readProjectMeta` describe block.
- **Files modified:** server/__tests__/api.test.js
- **Commit:** 81d3688

## Self-Check: PASSED

- server/gsd/readers.js: FOUND
- server/__tests__/api.test.js: FOUND
- 04-01-SUMMARY.md: FOUND
- Commit da6f1ae (RED tests): FOUND
- Commit 81d3688 (GREEN implementation): FOUND
