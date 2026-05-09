---
phase: 56-cli-verbosity-contract-portfolio-feed
plan: "01"
subsystem: server
tags: [portfolio-feed, landmark-detection, feed-store, state-broadcaster, db-migration]
dependency_graph:
  requires: []
  provides:
    - server/gsd/feedStore.js (in-memory landmark event store)
    - server/gsd/tmux.extractLandmarkEvent (regex-based pane signal extraction)
    - stateBroadcaster feed_event WS messages on pane transitions
    - GET /api/feed route returning {events:[]}
    - project_settings.suppress_context_reask + suppress_plan_ceremony DB columns
  affects:
    - server/gsd/stateBroadcaster.js
    - server/gsd/tmux.js
    - server/routes/proxy.js
    - server/db.js
    - server/routes/config.js
tech_stack:
  added: []
  patterns:
    - In-memory event store with MAX_EVENTS=200 cap (unshift + truncate)
    - TDD RED/GREEN pattern with node:test
    - Migration-safe ALTER TABLE with try/catch probe
    - COALESCE upsert pattern preserving existing nullable booleans
key_files:
  created:
    - server/gsd/feedStore.js
    - server/routes/feed.js
    - server/__tests__/feedStore.test.js
  modified:
    - server/gsd/tmux.js (added extractLandmarkEvent, updated module.exports)
    - server/gsd/stateBroadcaster.js (imports feedStore + extractLandmarkEvent, emits feed_event)
    - server/index.js (registers /api/feed route)
    - server/routes/proxy.js (added /api/feed to PROXY_PREFIXES)
    - server/db.js (Phase 56 migration + upsertProjectSettings extended)
    - server/routes/config.js (PUT handler extracts/persists suppress_* fields)
decisions:
  - feedStore uses unshift+length-truncate (not splice) for O(1) cap enforcement
  - extractLandmarkEvent scans last 50 lines bottom-up; first match wins (most recent)
  - waiting_input detected from state transition (prevRaw !== 'waiting') not pane regex
  - 30s dedup window per project stored on snapshot Map entry (no new DB table)
  - suppress_context_reask and suppress_plan_ceremony stored as nullable INTEGER (0/1/NULL)
  - COALESCE in upsert preserves existing values when new request omits the field
metrics:
  duration_minutes: 28
  completed_date: "2026-05-09"
  tasks_completed: 2
  files_created: 3
  files_modified: 6
  tests_added: 10
  tests_passing: 10
  pre_existing_failures: 12
  new_failures: 0
requirements_satisfied:
  - NAR-03
  - NAR-04
  - NAR-05
---

# Phase 56 Plan 01: Server-Side Portfolio Feed Infrastructure Summary

**One-liner:** In-memory landmark event store + regex pane detection + GET /api/feed + DB columns for verbosity toggles, all wired into the existing stateBroadcaster poll cycle.

## What Was Built

Server-side foundation for the Portfolio Feed feature:

1. **feedStore.js** — In-memory event store (200-event ring buffer, newest-first, resets on server restart). Exports `pushEvent`, `getEvents`, `_resetEvents`.

2. **extractLandmarkEvent() in tmux.js** — Scans the last 50 lines of a tmux pane for four landmark patterns: `plan_complete` (SUMMARY.md written), `phase_complete` (phase N complete), `verify_passed`, `verify_failed`. Returns typed event object or null.

3. **stateBroadcaster.js integration** — On every pane-state transition: (a) emits `waiting_input` feed_event when session transitions to `waiting`; (b) runs `extractLandmarkEvent` and pushes + broadcasts any detected landmark, deduplicated to once per 30s per project.

4. **GET /api/feed route** — Returns `{ events: [] }` (or populated array) from feedStore. Supports `?limit=N` (max 200).

5. **DB migration (Phase 56)** — Adds `suppress_context_reask` and `suppress_plan_ceremony` nullable INTEGER columns to `project_settings`. Migration-safe (try/catch probe pattern).

6. **config.js PUT update** — Extracts and persists the two new boolean fields; response includes their current values.

7. **proxy.js** — Added `/api/feed` to `PROXY_PREFIXES` so Railway mode proxies feed requests to the local machine.

## Test Results

- 10 new TDD tests added (feedStore.test.js): all 10 pass
- Full server suite: 330/343 pass (12 pre-existing failures, 0 new failures)

## Commits

| Hash | Message |
|------|---------|
| eced013 | test(56-01): add failing tests for feedStore and extractLandmarkEvent |
| 5a694f7 | feat(56-01): implement feedStore and extractLandmarkEvent in tmux.js |
| 434a0fe | feat(56-01): server-side Portfolio Feed infrastructure |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — GET /api/feed returns real in-memory data (empty array on fresh server start, which is correct). No placeholder text or hardcoded values in the feed path.

## Threat Surface Scan

No new threat surface beyond what is in the plan's threat model. The four threats (T-56-01 through T-56-04) are all mitigated as specified:
- T-56-01: `/api/feed` protected by existing cookieAuth in index.js
- T-56-03: MAX_EVENTS=200 cap enforced in pushEvent

## Self-Check: PASSED

All 9 key files found. All 3 task commits verified in git log.
