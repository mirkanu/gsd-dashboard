---
phase: 44-usage-display-enhancements
plan: 01
subsystem: api
tags: [express, sqlite, pricing, tokens, usage]

# Dependency graph
requires:
  - phase: 41-claude-usage-tracking
    provides: calculateCost helper, token_usage table, /api/pricing/window endpoint
provides:
  - Extended /api/pricing/window response with per-window token totals (input/output/cache_read/cache_write)
  - Per-model cost breakdown (by_model) with display_name for each window, sorted by cost descending
  - Backward-compatible foundation for USG-01 (token counts) and USG-04 (model breakdown) UI work
affects: [44-usage-display-enhancements]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive API evolution: new fields only, existing consumers (UsagePanel, UsagePage) untouched"
    - "summarizeWindow helper colocated in pricing.js route to reuse calculateCost output + rules for display_name resolution"

key-files:
  created: []
  modified:
    - server/routes/pricing.js
    - server/__tests__/api.test.js

key-decisions:
  - "Reuse calculateCost breakdown instead of second aggregation pass - single source of cost truth per model"
  - "display_name falls back to raw model string when no pricing rule matches, model_pattern = null for unknown models"
  - "by_model sorted by cost desc server-side so clients can render top-N without re-sorting"

patterns-established:
  - "Window response shape: top-level cost/from/hours_until_reset PLUS flat token totals PLUS by_model array"

requirements-completed: [USG-01, USG-04]

# Metrics
duration: ~8min
completed: 2026-04-11
---

# Phase 44 Plan 01: Usage API Token & Model Breakdown Summary

**Extended /api/pricing/window with per-window token totals and sorted per-model cost breakdown (backend foundation for USG-01 + USG-04 UI)**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-11T00:24:00Z
- **Completed:** 2026-04-11T00:32:21Z
- **Tasks:** 2 (TDD: test-first, then implementation)
- **Files modified:** 2

## Accomplishments
- `/api/pricing/window` now exposes input_tokens, output_tokens, cache_read_tokens, cache_write_tokens on both daily and weekly windows
- Each window returns a `by_model` array: `{model, model_pattern, display_name, cost, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens}` sorted by cost descending
- Display name pulled from pricing rule table (`claude-opus-4%` -> "Opus 4", etc.); unknown models fall back to raw model string
- Existing fields (`cost`, `from`, `hours_until_reset`, `weekly.by_project`) preserved — UsagePanel and UsagePage keep working without changes
- Server test asserts new shape including sort order and entry structure

## Task Commits

Each task was committed atomically following the TDD cycle:

1. **Task 1+2 RED: Failing /window shape test** - `46a9deb` (test)
2. **Task 1 GREEN: summarizeWindow helper + extended response** - `efe4ef8` (feat)

Task 2 (explicit test addition) was fulfilled by the RED commit — the TDD flow in Task 1 produced the full assertion the plan expected, so there was no separate "add test" step to repeat.

## Files Created/Modified
- `server/routes/pricing.js` - Added `summarizeWindow` helper inside the `/window` handler; extended JSON response with token totals + `by_model` array for both daily and weekly
- `server/__tests__/api.test.js` - New test `GET /api/pricing/window returns tokens and by_model breakdown` asserting backward-compat + USG-01 token fields + USG-04 by_model structure + sort order

## Decisions Made
- **Helper inside handler, not module-level:** `summarizeWindow` closes over `rules` (already loaded once at top of handler), avoiding a second `stmts.listPricing.all()` call per window.
- **Sort server-side:** Clients (UsagePage, potentially a future UsagePanel enhancement) can render top-3 / top-N without re-sorting.
- **Keep `weekly.by_project` untouched:** It still uses the separate `weeklyByProjectModel` per-project aggregation block. Mixing projects and models into one structure would break the existing weekly gauge consumer.

## Deviations from Plan

None - plan executed exactly as written. The two tasks in the plan describe the same TDD cycle (behavior spec + explicit test addition); the TDD red-green flow produced both outcomes in a single test-then-implementation pair.

## Issues Encountered

- Full-suite `node --test server/__tests__/*.test.js` run revealed two pre-existing failures (version/liveUrl parsing in `readProjectMeta`, `agent data proxy` POST test returning 404 vs expected 400). Both are unrelated to this plan — documented in Phase 41 summary and Phase 43 deferred items. Not fixed here per scope boundary.

## User Setup Required

None - additive API change, no config, no env vars.

## Next Phase Readiness

- Frontend work (Plan 03) can now read `daily.by_model` / `weekly.by_model` plus token totals directly from `/api/pricing/window`
- No additional API work needed for USG-01 / USG-04 display surfaces
- UsagePanel and UsagePage continue to work on the old fields — can migrate incrementally

## Self-Check: PASSED

- FOUND: server/routes/pricing.js (modified — summarizeWindow + extended response)
- FOUND: server/__tests__/api.test.js (modified — new /window shape test passing)
- FOUND: commit 46a9deb (test RED)
- FOUND: commit efe4ef8 (feat GREEN)
- Targeted test run: `node --test --test-name-pattern="pricing/window" server/__tests__/api.test.js` — pass 1, fail 0

---
*Phase: 44-usage-display-enhancements*
*Completed: 2026-04-11*
