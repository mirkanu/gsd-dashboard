---
phase: 58-project-maturity-stages
plan: "01"
subsystem: backend-api
tags: [stage-machine, api, tdd, json-storage]
dependency_graph:
  requires: []
  provides: [stage-storage, PATCH-stage-endpoint, POST-validate-endpoint, stage-backfill]
  affects: [server/routes/gsd.js, server/routes/projects.js]
tech_stack:
  added: []
  patterns: [loadConfigWithBackfill, ALLOWED_TRANSITIONS-set, upstreamFetch-passthrough]
key_files:
  created:
    - server/__tests__/stage-transitions.test.js
    - server/__tests__/stage-nudges.test.js
  modified:
    - server/routes/gsd.js
    - server/routes/projects.js
decisions:
  - "ALLOWED_TRANSITIONS as a Set of 'from->to' strings — O(1) lookup, explicit enumeration prevents drift"
  - "loadConfigWithBackfill writes back only when dirty — idempotent on already-migrated configs"
  - "validateGates module wrapped in try/catch — Plan 01 endpoint works before Plan 02 ships the module"
  - "retired transition calls gracefulShutdown + gh repo archive as non-fatal side effects"
  - "pushEvent require at top of file (not inline) — consistent with other feedStore consumers"
metrics:
  duration_minutes: 7
  completed_date: "2026-05-28"
  tasks_completed: 2
  files_changed: 4
---

# Phase 58 Plan 01: Stage Storage Foundation Summary

Stage storage foundation — PATCH /stage + POST /stage/validate with 14-transition state machine, backfill logic, and TDD test scaffolds for MAT-01/03/04/06/07.

## What Was Built

### loadConfigWithBackfill()
Reads `gsd-projects.json`, adds `stage: 'draft'` and `stageUpdatedAt: now` to any project missing a stage field, writes back only if dirty. Called by both new endpoints so backfill happens lazily on first transition or validation request.

### VALID_STAGES and ALLOWED_TRANSITIONS
14 transition pairs covering both forward and reverse paths, plus any→retired and retired→draft. Stored as a `Set` of `'from->to'` strings for O(1) lookup.

### PATCH /api/gsd/projects/:name/stage
- Validates `to` against VALID_STAGES (400 on invalid)
- Checks ALLOWED_TRANSITIONS (422 on disallowed)
- On `retired`: calls gracefulShutdown + `gh repo archive` (both non-fatal)
- Saves config, broadcasts `project_stage_change` WS event, pushes `stage_change` feed event
- Passes through to GSD_DATA_URL upstream when set

### POST /api/gsd/projects/:name/stage/validate
- Same validation/transition check as PATCH but read-only
- Tries to load `validateGates` module (Plan 02) — falls back to permissive stub `{ valid: true, hardGates: [], softGates: [] }` when module not present

### projects.js backfill at creation
New projects created via the scaffold pipeline now include `stage: 'draft'` and `stageUpdatedAt` in their config entry.

### Test scaffolds
- `stage-transitions.test.js` — 7 tests covering MAT-01 (backfill), MAT-03 (400/422/200), MAT-04 (reversible), MAT-06 (validate shape). All passing.
- `stage-nudges.test.js` — 3 tests for MAT-07 eligibilityChecker (Plan 02 module). Expected to show module-not-found until Plan 02 lands.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1+2 | 2dcb70a | feat(58-01): add stage storage foundation — PATCH /stage + POST /stage/validate endpoints |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `{ valid: true, hardGates: [], softGates: [], requiresProvisioning: [] }` | server/routes/gsd.js POST /stage/validate | validateGates module ships in Plan 02; stub is intentional and documented in code comment |

## Self-Check: PASSED

- `server/__tests__/stage-transitions.test.js` — exists, all 7 tests pass
- `server/__tests__/stage-nudges.test.js` — exists
- `server/routes/gsd.js` — PATCH + POST routes present, VALID_STAGES + ALLOWED_TRANSITIONS defined
- `server/routes/projects.js` — stage: 'draft' in project push
- Commit 2dcb70a — confirmed in git log
