---
phase: 42-fix-usage-window-filter
plan: 42
subsystem: pricing-api
tags: [pricing, window, sql, regression-test]
dependency_graph:
  requires:
    - sessions.updated_at column (added in earlier migration)
    - stmts.upsertTokenUsage, stmts.insertSession
  provides:
    - "/api/pricing/window now includes long-running sessions active within the window"
  affects:
    - server/routes/pricing.js
    - server/__tests__/api.test.js
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - .planning/quick/42-fix-usage-window-filter-to-include-long-/deferred-items.md
  modified:
    - server/routes/pricing.js
    - server/__tests__/api.test.js
decisions:
  - "Switched window queries to filter on sessions.updated_at (reflects 'active during window') instead of sessions.started_at ('started during window'). Accepts slight overcounting for long-running sessions."
  - "Left /api/pricing/usage-history untouched because its semantics are 'sessions that started each day' and its GROUP BY DATE(s.started_at) would also need changing."
metrics:
  duration: 12min
  completed_date: 2026-04-11
requirements:
  - USG-WIN-01
---

# Quick Task 42: Fix Usage Window Filter Summary

Window queries now filter on `sessions.updated_at` instead of `sessions.started_at`, so long-running sessions (started before the day/week boundary but still receiving token updates inside the window) contribute to the daily and weekly Model Breakdown.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add regression test for long-running session in weekly window | 76f10e1 | server/__tests__/api.test.js |
| 2 | Switch window queries from started_at to updated_at | 38c2196 | server/routes/pricing.js |

## Code Changes

**server/routes/pricing.js** — two SQL WHERE clauses changed:

1. `tokensForWindow(since)` (used for both `daily` and `weekly` breakdowns):
   - `WHERE s.started_at >= ?` → `WHERE s.updated_at >= ?`

2. `weeklyByProjectModel` query (per-project weekly breakdown):
   - `WHERE s.started_at >= ?` → `WHERE s.updated_at >= ?`

The `/api/pricing/usage-history` endpoint (a distinct route) was deliberately left alone — its semantics are "what started each day" and its `DATE(s.started_at)` GROUP BY would need coordinated changes out of scope for this quick task.

**server/__tests__/api.test.js** — new regression test inserts a session with `started_at` 10 days ago and `updated_at` now, seeds a distinctive 777777 input_tokens row for `claude-sonnet-4-6`, and asserts the entry appears in `weekly.by_model` and that `weekly.input_tokens >= 777777`. The test was RED against the pre-fix route and GREEN after the fix. Cleanup removes the fixture rows in a `finally` block to avoid polluting subsequent tests.

## Tradeoffs (accepted)

- **Slight overcounting:** A long-running session contributes ALL its tokens to the window, not only the tokens accumulated during the window. The `token_usage` schema has no per-row timestamp, so per-delta windowing is not possible without a schema change.
- **Deferred:** An event-sourced `token_usage` model with per-write timestamps (so window filters can attribute only the tokens written inside the window) is out of scope here and recorded as a future phase candidate.

## Verification

- `node --test server/__tests__/api.test.js` — new regression test passes; the existing "returns tokens and by_model breakdown" test still passes; all previously passing tests remain green. Two failures observed (`returns version and liveUrl for a project with PROJECT.md`, `POST /api/sessions is not proxied`) are pre-existing and unrelated to this change — see `deferred-items.md`.
- `grep "s.started_at" server/routes/pricing.js` confirms remaining occurrences live only inside `/usage-history` (intentional).
- Response shape of `/api/pricing/window` unchanged (same field names and types).
- Live Railway verification:
  - `git push origin master` → 22fd7c3..38c2196
  - `pm2 restart gsd-dashboard` (Railway proxies upstream via `GSD_DATA_URL` → ngrok → local PM2)
  - `curl -s https://gsd-dashboard-production.up.railway.app/api/pricing/window | jq '.weekly.by_model | map(.display_name)'` → `["Claude Opus 4.6"]`
  - Local DB inspection confirms no sonnet sessions currently have `updated_at >= weekStart (2026-04-06)`, so the weekly breakdown correctly shows only Opus. The fix is verified via the regression test rather than via seeded production data.

## Deviations from Plan

None. Executed as written.

## Self-Check: PASSED

- server/routes/pricing.js modified: FOUND (commit 38c2196)
- server/__tests__/api.test.js modified: FOUND (commit 76f10e1)
- deferred-items.md created: FOUND
- Commits 76f10e1 and 38c2196 present in git log
