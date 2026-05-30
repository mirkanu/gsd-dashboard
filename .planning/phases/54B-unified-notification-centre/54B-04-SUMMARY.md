---
phase: 54B
plan: "04"
subsystem: notifications
tags: [notifications, migration, call-site-migration, telegram, phase42-migration]
dependency_graph:
  requires: [54B-01, 54B-02, 54B-03]
  provides: [notification-centre-wired, call-site-migration-complete, phase42-startup-migration]
  affects:
    - server/routes/gsd.js
    - server/gsd/gracefulShutdown.js
    - server/gsd/stateBroadcaster.js
    - server/index.js
    - server/gsd/telegram.js
tech_stack:
  added: []
  patterns: [lazy-require-circular-dep-avoidance, proxy-mode-guard, idempotent-startup-migration, DI-injectable-notifyFn]
key_files:
  created: []
  modified:
    - server/routes/gsd.js
    - server/gsd/gracefulShutdown.js
    - server/gsd/stateBroadcaster.js
    - server/index.js
    - server/gsd/telegram.js
decisions:
  - Disk alert calls use local const aliases (_notifyCrit, _notifyWarn) to avoid require() variable shadowing inside the same if-block
  - Phase 42 migration sets archived_legacy_alerts=0 (not 1) at startup — it becomes 1 after first successful delivery, not on migration completion
  - sendNotification removed from top-level imports in gsd.js and index.js; kept in gracefulShutdown.js comment for DI clarity
  - landmark notify guard includes redundant `&& landmark` check (landmark is always truthy inside the if block, but guards are explicit per plan)
metrics:
  duration_minutes: 15
  completed_date: "2026-05-30"
  tasks_completed: 2
  files_modified: 5
  files_created: 0
requirements:
  - NTF-01
  - NTF-02
  - NTF-05
---

# Phase 54B Plan 04: Call-Site Migration + Phase 42 Startup Migration Summary

All sendNotification() call sites migrated through NotificationCentre: gsd.js state-transition notifications, gracefulShutdown.js idle-close notifications, stateBroadcaster.js waiting_input and landmark event hooks, and index.js disk alerts — completing NTF-01 so no production code calls telegram.sendNotification() directly for event-driven notifications.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace call sites in gsd.js, gracefulShutdown.js, stateBroadcaster.js | 4186a44 | server/routes/gsd.js, server/gsd/gracefulShutdown.js, server/gsd/stateBroadcaster.js |
| 2 | Migrate index.js disk alerts + Phase 42 startup migration + telegram.js JSDoc deprecation | 9ce68e9 | server/index.js, server/gsd/telegram.js |

## What Was Built

**server/routes/gsd.js** — State-transition notification block migrated:
- `shouldNotify` and `sendNotification` removed from telegram require destructure
- `telegramEnabled` guard replaced with `!GSD_DATA_URL` proxy guard (NotificationCentre checks ENABLED internally)
- `sendNotification(name, body, options)` replaced with `notify('waiting_input', name, body, options)` via lazy `require('../gsd/notificationCentre')` inside the transition block

**server/gsd/gracefulShutdown.js** — Default notifyFn migrated:
- `const { sendNotification } = require('./telegram')` removed (replaced with comment for DI clarity)
- `notifyFn = sendNotification` default replaced with lambda: `notifyFn = (project, text) => { const { notify } = require('./notificationCentre'); return notify('idle_session_closed', project, text); }`
- Tests that inject `notifyFn` directly (sendNotification or mock) are unaffected

**server/gsd/stateBroadcaster.js** — Two new notify hooks added:
- After `feedStore.pushEvent(waitingEntry)` + `broadcastFn(...)`: `notify('waiting_input', project.name, label)` inside `!GSD_DATA_URL` guard
- After `feedStore.pushEvent(landmark)` + `broadcastFn(...)`: `notify(landmark.type, project.name, landmark.text)` inside `!GSD_DATA_URL && landmark` guard
- Both use lazy `require('./notificationCentre')` inside the if block to avoid circular dep at module load

**server/index.js** — Three changes:
- `sendNotification` removed from telegram require (only `startReplyPoller`, `stopReplyPoller`, `ENABLED: telegramEnabled` remain)
- Disk alert blocks: `if (telegramEnabled) sendNotification(...)` replaced with `_notifyCrit/_notifyWarn('system_alert', 'dashboard', ...)` via lazy-required notificationCentre
- `migratePhase42Notifications()` function added and called at module load (outside `if (require.main === module)`) — reads legacy `telegram_alerts` from global settings, maps to `notification_policy.event_toggles` using the Phase 42 key MAP, runs once per restart until `archived_legacy_alerts=1`

**server/gsd/telegram.js** — JSDoc `@deprecated` added above `sendNotification` explaining valid remaining uses (DI test injection, POST /api/notifications/test).

## Verification

Policy endpoint confirmed live after `pm2 restart gsd-dashboard`:
```
GET /api/notifications/policy → {"policy":{"enabled":true,"rate_limit_per_hour":5,"event_toggles":{...},"archived_legacy_alerts":false}}
```

Phase 42 migration ran on first startup and populated notification_policy with defaults derived from EVENT_DEFAULTS.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Surface Scan

No new network endpoints. No new trust boundary crossings. All mitigations from the plan's threat model (T-54B-04-A idempotent migration, T-54B-04-B local-only log, T-54B-04-C rate-limit auditable) are implemented as described.

## Self-Check: PASSED

Files modified:
- server/routes/gsd.js — present, sendNotification removed, notify('waiting_input') present
- server/gsd/gracefulShutdown.js — present, idle_session_closed present
- server/gsd/stateBroadcaster.js — present, notificationCentre lazy-require present (x2), landmark.type hook present
- server/index.js — present, system_alert present, migratePhase42Notifications present
- server/gsd/telegram.js — present, @deprecated present

Commits:
- 4186a44 — feat(54B-04): migrate call sites in gsd.js, gracefulShutdown.js, stateBroadcaster.js through NotificationCentre
- 9ce68e9 — feat(54B-04): migrate index.js disk alerts + Phase 42 startup migration + telegram.js @deprecated

Test results: 412 pass / 10 fail (same pre-existing failures as Wave 1 and 2) / 423 total
