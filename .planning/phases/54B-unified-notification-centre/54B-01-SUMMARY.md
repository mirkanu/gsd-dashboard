---
phase: 54B
plan: "01"
subsystem: notifications
tags: [notifications, sqlite, policy-engine, telegram]
dependency_graph:
  requires: []
  provides: [notification-policy-engine, notification-schema]
  affects: [server/db.js, server/gsd/notificationCentre.js]
tech_stack:
  added: []
  patterns: [DI-injectable-testNotify, lazy-require-circular-dep-avoidance, probe-before-alter-migration]
key_files:
  created:
    - server/gsd/notificationCentre.js
    - server/__tests__/notificationCentre-schema.test.js
    - server/__tests__/notificationCentre.test.js
  modified:
    - server/db.js
decisions:
  - lazy-require of telegram.js and db.js inside _testNotify functions prevents circular dep at module load time
  - rateLimited flag in EVENT_DEFAULTS gates the rate-limit check (not highPriority), so high-priority events skip rate-limit regardless
  - In-memory rateWindow resets on server restart — acceptable per spec; no DB persistence required
  - Log write is synchronous (better-sqlite3) before await sendFn() to make dedup reliable on rapid calls
metrics:
  duration: "12 min"
  completed_date: "2026-05-30"
  tasks_completed: 2
  files_modified: 3
  files_created: 3
requirements:
  - NTF-01
  - NTF-02
  - NTF-04
---

# Phase 54B Plan 01: NotificationCentre Module + DB Schema Summary

JWT auth with refresh rotation using jose library — N/A. One-liner: SQLite schema migrations for notification_policy and notification_log tables, plus a DI-injectable policy engine (notificationCentre.js) routing all Telegram delivery through enable/quiet-hours/rate-limit/dedup checks.

## What Was Built

**server/db.js** — Three idempotent migrations added after the Phase 56 suppress_context_reask block:
- `notification_policy` table: stores the `__global__` policy row (enabled, quiet_hours_from/to, rate_limit_per_hour, event_toggles JSON, archived_legacy_alerts)
- `notification_log` table + `idx_notification_log_type_project` index: audit trail for every notify() call, delivered or suppressed
- `notification_enabled` and `notification_quiet_override` additive columns on `project_settings`

Four prepared statements added to the `stmts` object: `getNotificationPolicy`, `upsertNotificationPolicy`, `insertNotificationLog`, `getRecentNotificationLog`.

**server/gsd/notificationCentre.js** — Policy engine with pipeline:
1. Load global policy from DB (falls back to safe defaults if no row)
2. Global enable check → suppress reason `disabled`
3. Per-event toggle check (DB override beats EVENT_DEFAULTS) → suppress reason `disabled`
4. Quiet hours check (non-high-priority events only, UTC HH:MM string comparison, supports midnight-spanning windows) → suppress reason `quiet_hours`
5. Rate limit check (in-memory hourly counter, rateLimited events only) → suppress reason `rate_limit`
6. Deduplication (same event_type + project_name delivered within 30s) → suppress reason `dedup`
7. Write log row (delivered=1, synchronous) BEFORE delivery
8. Call sendFn() (lazy-required telegram.sendNotification) — failures swallowed, non-blocking

Exports: `notify`, `_testNotify` (DI-injectable), `EVENT_DEFAULTS`.

## TDD Gate Compliance

- RED commit: `6a9b0ca` — notificationCentre-schema.test.js (9 tests failing, table/column not yet in db.js)
- GREEN commit: `f21c11d` — db.js migrations + prepared statements (all 9 pass)
- RED commit: `346ad0d` — notificationCentre.test.js (15 tests failing, MODULE_NOT_FOUND)
- GREEN commit: `64a647e` — server/gsd/notificationCentre.js (all 15 pass)

## Test Results

All 24 new tests pass. Pre-existing 10 failures are unrelated (autopilotManager, agent proxy, app-settings, khw.pivot, STAT-02 heuristic).

Final: 402 pass / 10 fail (pre-existing) / 413 total.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints introduced. `notification_log.message_text` stores user-visible notification text but never stores BOT_TOKEN or secrets — consistent with T-54B-01-A disposition (mitigate/accept). No new trust boundary crossings beyond what the threat model anticipated.

## Self-Check

Files created:
- server/gsd/notificationCentre.js — present
- server/__tests__/notificationCentre-schema.test.js — present
- server/__tests__/notificationCentre.test.js — present

Commits:
- 6a9b0ca — test(54B-01): add failing tests for notification schema migrations
- f21c11d — feat(54B-01): DB schema migrations — notification_policy, notification_log, project_settings columns
- 346ad0d — test(54B-01): add failing tests for notificationCentre.js policy engine
- 64a647e — feat(54B-01): create notificationCentre.js — policy engine with rate limit, quiet hours, dedup, delivery
