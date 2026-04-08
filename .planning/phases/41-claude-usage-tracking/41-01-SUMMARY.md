---
phase: 41-claude-usage-tracking
plan: 01
subsystem: api
tags: [express, sqlite, token-usage, cost-calculation, pricing]

# Dependency graph
requires:
  - phase: 25-autopilot-core
    provides: token_usage and model_pricing tables with cost calculation
provides:
  - Per-project weekly cost breakdown via GET /api/pricing/window
  - Daily usage history via GET /api/pricing/usage-history
  - Per-session cost in GET /api/gsd/projects response
affects: [41-02 (UI consumption of these endpoints)]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared calculateCost export between route modules]

key-files:
  created: []
  modified:
    - server/routes/pricing.js
    - server/routes/gsd.js
    - server/index.js

key-decisions:
  - "Export calculateCost as named export alongside router from pricing.js"
  - "Cache pricingRules once before Promise.all loop in gsd projects endpoint"
  - "sessionCost is null when no session or no tokens exist"

patterns-established:
  - "Named exports from route modules: { router, helperFn } pattern for cross-route reuse"

requirements-completed: [COST-03, COST-04]

# Metrics
duration: 9min
completed: 2026-04-08
---

# Phase 41 Plan 01: Claude Usage Tracking API Summary

**Per-project cost breakdown, daily usage history, and per-session cost exposed through 3 API endpoints**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-08T07:50:54Z
- **Completed:** 2026-04-08T07:59:39Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Added GET /api/pricing/usage-history returning 7-day daily token cost history with per-day breakdown
- Enhanced GET /api/pricing/window to include weekly.by_project array with per-cwd cost
- Added sessionCost field to each project in GET /api/gsd/projects response
- Exported calculateCost from pricing.js for reuse across route modules

## Task Commits

Each task was committed atomically:

1. **Task 1: Add per-project cost to GSD projects endpoint + usage history endpoint** - `ce2cbba` (feat)

## Files Created/Modified
- `server/routes/pricing.js` - Added usage-history endpoint, per-project weekly breakdown, exported calculateCost
- `server/routes/gsd.js` - Added sessionCost per project using calculateCost from pricing.js
- `server/index.js` - Updated pricing require to destructure { router } from new export shape

## Decisions Made
- Exported calculateCost as a named export from pricing.js rather than creating a shared utility module -- keeps cost logic co-located with pricing routes
- Pricing rules are fetched once before the Promise.all loop in gsd/projects to avoid N+1 queries
- sessionCost returns null (not 0) when there are no tokens or no session, allowing UI to distinguish "no data" from "zero cost"

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing test failure in api.test.js (version parsing for PROJECT.md returns null) -- unrelated to this plan's changes, all 106 other tests pass

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All three API endpoints ready for UI consumption in 41-02
- Response shapes documented in plan for client integration

---
*Phase: 41-claude-usage-tracking*
*Completed: 2026-04-08*

## Self-Check: PASSED
