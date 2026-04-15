---
phase: 48-idle-session-cost-controls
plan: 04
subsystem: ui
tags: [react, tmux, cost-tracking, sqlite, app-settings]

# Dependency graph
requires:
  - phase: 48-idle-session-cost-controls (plans 01-03)
    provides: gracefulShutdown, tmux-cost API, idle detector
  - phase: 45-services-cost-tracking-foundation
    provides: app_settings table + AES-GCM encrypt pattern, ServicesPage/ConfigPage foundations
provides:
  - ServicesPage $/day column per active tmux session
  - UsagePage orange idle cost banner
  - ConfigPage Idle Auto-Close section (threshold, enabled toggle, RAM rate)
  - app_settings seeding for idle_timeout_minutes and railway_ram_rate_monthly
affects: [phase-46-services-api-integrations, future-cost-reports]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - app_settings seeding: insert defaults on GET if key missing (AES-GCM, base64)
    - Promise.allSettled for parallel per-project cost fetches — graceful fallback per project
    - Non-blocking banner: fetch costs asynchronously, hide until data arrives

key-files:
  created: []
  modified:
    - server/routes/app-settings.js
    - client/src/pages/ConfigPage.tsx
    - client/src/pages/ServicesPage.tsx
    - client/src/pages/UsagePage.tsx
    - server/gsd/costMeasurement.js

key-decisions:
  - "costMeasurement.getTmuxRssKb() walks full descendant process tree — pane PID (bash, ~3MB) alone misses the Claude Code child (~500-900MB)"
  - "Banner threshold: idleCostPerDay > 0.01 to suppress noise from near-zero sessions"
  - "ConfigPage initializes idle settings from hardcoded defaults (120 min, $10/GB-month) since GET app-settings returns no plaintext"

patterns-established:
  - "Per-project async cost fetch: Promise.allSettled over /api/gsd/projects/:name/tmux-cost, keyed by project name"
  - "app_settings seeding block in GET handler — idempotent, runs on every cold-start request"

requirements-completed: []

# Metrics
duration: ~35min (tasks 1-2) + checkpoint + inline fix (~20min)
completed: 2026-04-15
---

# Phase 48 Plan 04: UI Cost Surfaces Summary

**Services $/day column, Usage idle banner, and ConfigPage Idle Auto-Close section surface tmux RAM costs across the entire dashboard — with a corrected process-tree RSS measurement that captures Claude Code's actual ~900MB footprint**

## Performance

- **Duration:** ~35 min (tasks 1-2) + human-verify checkpoint + inline orchestrator fix (~20 min)
- **Started:** 2026-04-15 (continuation of phase 48 execution session)
- **Completed:** 2026-04-15
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 5

## Accomplishments

- ConfigPage Settings tab gained an Idle Auto-Close section: enabled toggle, idle threshold input (minutes), Railway RAM rate input ($/GB-month) — all persisted via /api/app-settings POST
- app_settings GET handler seeds `idle_timeout_minutes` (default: 120) and `railway_ram_rate_monthly` (default: 10.0) on first read if keys are absent
- ServicesPage shows "~$X.XX/day" in orange beside each project with an active tmux session (hidden for $0.00/inactive sessions)
- UsagePage shows an orange banner ("X sessions running — ~$Y.YY/day in RAM costs") whenever aggregate daily cost exceeds $0.01
- Inline bug fix: `getTmuxRssKb()` now walks the full descendant process tree instead of measuring only the pane PID — live result changed from $0.001/day (3.6 MB) to $0.29/day (904 MB), reflecting actual Claude Code memory usage

## Task Commits

Each task was committed atomically:

1. **Task 1: Seed app_settings defaults + ConfigPage Idle Auto-Close section** - `ac44c0e` (feat)
2. **Task 2: Services $/day column + Usage page idle banner** - `0b5f973` (feat)
3. **Task 3: Human verify Phase 48 on Railway** - checkpoint approved after orchestrator inline fix
   - Inline fix commit: `6f3eab7` — fix(48): getTmuxRssKb sums full descendant process tree

## Files Created/Modified

- `server/routes/app-settings.js` — Added PHASE_48_DEFAULTS seeding block in GET handler
- `client/src/pages/ConfigPage.tsx` — Added Idle Auto-Close section to Settings tab with state + saveIdleSetting helper
- `client/src/pages/ServicesPage.tsx` — Added TmuxCost interface, per-project cost state, $/day display beside status pills
- `client/src/pages/UsagePage.tsx` — Added fetchIdleCosts(), idle cost banner above weekly gauge
- `server/gsd/costMeasurement.js` — Fixed getTmuxRssKb() to sum RSS across full descendant process tree (ps --ppid recursion)

## Decisions Made

- **Process tree RSS:** pane PID is typically bash (~3MB); Claude Code is a child process (~500-900MB). Summing descendants gives the correct cost signal. Inline fix committed as `6f3eab7`.
- **Banner threshold $0.01:** Avoids showing a banner for dormant sessions where RSS rounds to zero.
- **ConfigPage shows defaults on load:** Since GET /api/app-settings returns only metadata (no plaintext), the UI initializes from hardcoded defaults (120 min, $10/GB-month). Users can overwrite and save; backend enforces the real values.

## Deviations from Plan

### Inline Fix During Human-Verify Checkpoint

**[Rule 1 - Bug] getTmuxRssKb() measured only pane PID, missing Claude Code child process**

- **Found during:** Task 3 (human-verify checkpoint) — live Railway verification showed $0.001/day (3.6 MB RSS), inconsistent with expected Claude Code memory usage of ~500-900MB
- **Issue:** `getTmuxRssKb()` called `ps -o rss= -p {panePid}` which captures the pane process (bash). Claude Code runs as a child of that process and its RSS is not included.
- **Fix:** Changed implementation to walk the full descendant process tree using `ps --ppid` recursively, summing RSS for all descendants of the pane PID. Post-fix: gsddashboard session reports 904 MB / $0.29/day.
- **Files modified:** `server/gsd/costMeasurement.js`
- **Verification:** `node --test server/__tests__/tmux-cost.test.js` — 3/3 tests passed. Live Railway result: 904 MB / $0.29/day (was 3.6 MB / $0.001/day).
- **Committed in:** `6f3eab7` (applied by orchestrator during checkpoint)

---

**Total deviations:** 1 inline fix (Rule 1 - Bug)
**Impact on plan:** Fix was essential for correctness — without it the cost surface feature showed near-zero values and was effectively useless. No scope creep.

## Issues Encountered

None beyond the inline bug fix documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 48 is fully complete: graceful shutdown (plan 01), cost measurement (plan 02), idle detector (plan 03), UI surfaces (plan 04)
- All features deployed to Railway and live-verified
- Ready to plan Phase 46 (Services API Integrations) — credentials panel (railway_pat, openai_admin_key, vercel_token) seeded in Phase 45/48 app_settings are available for API calls

---
*Phase: 48-idle-session-cost-controls*
*Completed: 2026-04-15*
