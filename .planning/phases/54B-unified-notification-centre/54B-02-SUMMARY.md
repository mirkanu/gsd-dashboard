---
phase: 54B
plan: "02"
subsystem: notifications
tags: [notifications, api-routes, express, proxy, tdd]
dependency_graph:
  requires: [54B-01]
  provides: [notifications-api, notifications-proxy-passthrough]
  affects: [server/routes/notifications.js, server/index.js, server/routes/proxy.js]
tech_stack:
  added: []
  patterns: [proxy-passthrough-pattern, partial-update-merge, hh-mm-range-validation]
key_files:
  created:
    - server/routes/notifications.js
    - server/__tests__/notifications-routes.test.js
  modified:
    - server/index.js
    - server/routes/proxy.js
decisions:
  - HH:MM validation uses strict regex ([01]\d|2[0-3]):([0-5]\d) — rejects 25:00, 12:99 etc; plan used \d{2}:\d{2} which was too permissive (caught in TDD RED→GREEN cycle)
  - Partial update merge pattern — PUT reads existing row first, applies only supplied fields; absent fields retain current values
  - express.json() middleware scoped to PUT /policy route only (not router-level) to match config.js pattern
  - Test uses real http.createServer + Node http.request rather than mock callRoute — required because express.json() middleware must actually run in the route stack
metrics:
  duration: "15 min"
  completed_date: "2026-05-30"
  tasks_completed: 2
  files_modified: 2
  files_created: 2
requirements:
  - NTF-01
  - NTF-03
---

# Phase 54B Plan 02: Notifications API Routes Summary

Notifications REST API — GET/PUT /api/notifications/policy (CRUD with input validation) and POST /api/notifications/test (direct Telegram delivery), all with GSD_DATA_URL proxy passthrough, mounted in server/index.js and added to PROXY_PREFIXES.

## What Was Built

**server/routes/notifications.js** — Three routes following the config.js proxy passthrough pattern:

- `GET /api/notifications/policy` — returns `{ policy: { enabled, quiet_hours_from, quiet_hours_to, rate_limit_per_hour, event_toggles } }`. Falls back to safe defaults when no DB row exists.
- `PUT /api/notifications/policy` — validates input (boolean enabled, HH:MM quiet hours, integer 1–100 rate limit, known event_toggles keys), merges with existing row for partial updates, persists via `stmts.upsertNotificationPolicy`.
- `POST /api/notifications/test` — lazy-requires telegram.js and calls `sendNotification` directly, bypassing policy engine. Returns `{ ok: true }` on success, `{ error: message }` on failure.

All three routes forward to upstream in `GSD_DATA_URL` proxy mode with 10s timeout.

**server/index.js** — Added `require("./routes/notifications")` and `app.use("/api/notifications", notificationsRouter)` after the configRouter mount. The existing `sendNotification` import for disk alerts is untouched (Plan 04 handles migration).

**server/routes/proxy.js** — Added `'/api/notifications'` to `PROXY_PREFIXES` so tunnel/Railway mode forwards all three routes to the local backend.

**server/__tests__/notifications-routes.test.js** — 10 tests covering all routes and validation cases. Uses a real `http.createServer` + `http.request` pattern (required for `express.json()` middleware to run correctly in the route stack).

## TDD Gate Compliance

- RED commit: `f529e50` — notifications-routes.test.js (10 tests, MODULE_NOT_FOUND — all failing)
- GREEN commit: `e6a399e` — server/routes/notifications.js created; all 10 pass after fixing HH:MM regex from `\d{2}:\d{2}` (too permissive, allowed `25:00`) to `([01]\d|2[0-3]):([0-5]\d)` (strict range)

## Test Results

All 10 new tests pass. Pre-existing 10 failures are unrelated and unchanged.

Final: 412 pass / 10 fail (pre-existing) / 423 total.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Strict HH:MM validation — regex tightened**
- **Found during:** TDD RED→GREEN cycle (test for `25:00` input failed to return 400)
- **Issue:** Plan's suggested regex `^\d{2}:\d{2}$` matched `25:00` because `\d{2}` allows any two digits
- **Fix:** Replaced with `^([01]\d|2[0-3]):([0-5]\d)$` which validates hour range 00–23 and minute range 00–59
- **Files modified:** server/routes/notifications.js
- **Commit:** e6a399e

## Threat Surface Scan

The three new HTTP endpoints (`GET/PUT /api/notifications/policy`, `POST /api/notifications/test`) are all within the existing `/api/*` auth boundary (cookieAuth covers all `/api/` routes in server/index.js). Threat mitigations T-54B-02-A and T-54B-02-B from the plan's threat model are implemented: event_toggles keys validated against VALID_EVENT_KEYS set, rate_limit_per_hour validated as integer 1–100. No new trust boundary crossings beyond what the threat model anticipated.

## Self-Check

Files created:
- server/routes/notifications.js — present
- server/__tests__/notifications-routes.test.js — present

Files modified:
- server/index.js — notificationsRouter require + app.use present
- server/routes/proxy.js — '/api/notifications' in PROXY_PREFIXES

Commits:
- f529e50 — test(54B-02): add failing tests for notifications routes (GET/PUT /policy, POST /test)
- e6a399e — feat(54B-02): create server/routes/notifications.js — GET/PUT /policy + POST /test with proxy passthrough
- f49719e — feat(54B-02): wire notificationsRouter into server/index.js and add /api/notifications to PROXY_PREFIXES

## Self-Check: PASSED
