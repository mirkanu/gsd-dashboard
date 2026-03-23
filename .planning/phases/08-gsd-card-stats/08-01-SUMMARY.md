---
phase: 08-gsd-card-stats
plan: 01
subsystem: server/gsd
completed: 2026-03-23
tags: [readers, stats, velocity, streak, next_action]
requires: []
provides: [next_action, velocity, streak, estimatedCompletion]
affects: [server/routes/gsd.js]
tech_stack:
  added: []
  patterns: [regex parsing, fs.readdirSync recursive scan, date math]
key_files:
  modified:
    - server/gsd/readers.js
    - server/__tests__/api.test.js
decisions:
  - Use file mtime as fallback when SUMMARY.md has no date frontmatter
  - computeStreak stops at first gap (i > 0) so today without activity yields 0
  - computeEstimatedCompletion returns null when < 2 SUMMARY.md dates exist or remaining plans = 0
metrics:
  duration: ~10m
  tasks_completed: 4
  files_modified: 2
---

# Phase 8 Plan 01: GSD Card Stats (readers extension) Summary

Extended `server/gsd/readers.js` to compute and return four new stats fields for each project: `next_action` (parsed from STATE.md "Next action:" line), `velocity` (SUMMARY.md completions in last 7 days), `streak` (consecutive active days counting back from today), and `estimatedCompletion` (human-readable ETA string derived from average days-per-plan and remaining plan count).

## What Was Built

- **extractNextAction(text):** Regex helper matching `^Next action:\s*(.+)$`; wired into both `parseStateWithFrontmatter` and `parseStateMarkdown` as `next_action` field.
- **readSummaryDates(root):** Scans `.planning/phases/*/` for `*-SUMMARY.md` files and extracts a Date from frontmatter (`completed:` or `completed_date:`) or falls back to `fs.statSync().mtime`.
- **computeVelocity(dates):** Counts dates within the last 7 days.
- **computeStreak(dates):** Builds a day-string Set, walks backward from today, stops at first gap.
- **computeEstimatedCompletion(dates, phases):** Computes avg days/plan from sorted date span, multiplies by remaining plans; returns null when not computable.
- **formatDaysEstimate(days):** Returns human-readable strings like `~3 days`, `~1 week`, `~2 months`.
- **readProject updated:** Calls `readSummaryDates` once, derives all three computed fields.

## Tests Added

Four tests in `server/__tests__/api.test.js` under `describe('readProject stats')`:
- velocity is a non-negative integer
- streak is a non-negative integer
- estimatedCompletion is null or non-empty string
- readState returns next_action as string or null

All four pass. Pre-existing failures in `resolveFile` and `GET /api/gsd/projects/:name/files/:fileId` are unrelated to this plan and were present before any changes.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `/data/home/gsddashboard/server/gsd/readers.js` contains extractNextAction, readSummaryDates, computeVelocity, computeStreak, computeEstimatedCompletion, formatDaysEstimate
- Commit f0f0309 exists
- All 4 new tests green
