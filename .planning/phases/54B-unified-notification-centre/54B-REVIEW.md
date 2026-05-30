---
phase: 54B-unified-notification-centre
reviewed: 2026-05-30T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - client/src/components/NotificationPolicyPanel.tsx
  - client/src/lib/api.ts
  - client/src/pages/ConfigPage.tsx
  - server/db.js
  - server/gsd/gracefulShutdown.js
  - server/gsd/notificationCentre.js
  - server/gsd/stateBroadcaster.js
  - server/gsd/telegram.js
  - server/index.js
  - server/routes/gsd.js
  - server/routes/notifications.js
  - server/routes/proxy.js
  - server/__tests__/notificationCentre-schema.test.js
  - server/__tests__/notificationCentre.test.js
  - server/__tests__/notifications-routes.test.js
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 54B: Code Review Report

**Reviewed:** 2026-05-30
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Phase 54B introduces a unified notification centre: a global policy table (enabled, quiet hours, per-event toggles, rate limit), a notification log, migration of legacy Phase 42 telegram_alerts, and a React UI panel. The architecture is sound — DI-friendly core in `notificationCentre.js`, proxy-aware routes, idempotent DB migrations, and solid test coverage. No critical security or data-loss issues found.

Four warnings relate to logic correctness (migration gap, rate-limit state reset, and a dedup race) and one overlooked error path. Five info items cover dead code, naming, and minor UI edge cases.

## Warnings

### WR-01: Phase 42 migration does not mark `archived_legacy_alerts=1` after successful write

**File:** `server/index.js:251-260`
**Issue:** `migratePhase42Notifications()` writes `archived_legacy_alerts = 0` unconditionally and never sets it to `1`. The guard at line 220 (`if (existing && existing.archived_legacy_alerts === 1) return`) therefore never exits early on subsequent server restarts — the migration re-runs on every boot and overwrites any user changes made to `event_toggles` in the policy table. This is the idempotency guard, but the flag that triggers it is never set.
**Fix:** Set `archived_legacy_alerts = 1` in the upsert call, or perform a follow-up `UPDATE` immediately after the insert succeeds:
```js
stmts.upsertNotificationPolicy.run(
  1,
  null,
  null,
  5,
  JSON.stringify(event_toggles),
  1,   // archived_legacy_alerts = 1 so this branch never runs again
);
```

### WR-02: In-memory rate-limit window is module-level state and survives across test runs (and across `notify()` calls in tests)

**File:** `server/gsd/notificationCentre.js:20`
**Issue:** `rateWindow` is declared at module scope:
```js
let rateWindow = { count: 0, resetAt: Date.now() + HOUR_MS };
```
The rate-limit test in `notificationCentre.test.js` works around this by forcing `nowFn` to a future time, which resets the window inside `_testNotify`. However, tests that do NOT override `nowFn` can be affected by the in-flight state from prior tests within the same process, producing flaky results if the module is cached. More critically: the window is tied to server startup time, so any server restart within the same hour continues counting from the module-level counter (resets to 0 on restart, which is documented as acceptable), but the comment says "resets on server restart" — this is true, yet creates an observable cliff at restart. This is low risk in production but is a correctness gap in the test isolation design. The DI mechanism already threads `nowFn` through but does not thread a `rateWindowFn` or allow resetting state between test groups.
**Fix:** Expose a `_resetRateWindow()` helper (already pattern-matched by `_resetSnapshot` in stateBroadcaster) for test isolation, or move the rate-window into the `fns` injection object so tests can pass a fresh object per call:
```js
async function _testNotify(eventType, projectName, text, options = [], fns = {}) {
  const { sendFn, dbFn, nowFn, rateWindowRef = rateWindow } = fns;
  // use rateWindowRef instead of the module-level rateWindow
  ...
}
```

### WR-03: Dedup window uses `nowFn()` for the cutoff but `stmts.getRecentNotificationLog` queries the DB using a real ISO timestamp — the two clocks can diverge under DI injection

**File:** `server/gsd/notificationCentre.js:110-114`
**Issue:** The dedup cutoff is computed as:
```js
const cutoff = new Date(nowFn() - 30_000).toISOString();
const dupe = stmts.getRecentNotificationLog.get(eventType, projectName, cutoff);
```
The DB query compares `created_at` (which was written using SQLite's `strftime('now')`) against a JavaScript-computed cutoff. When `nowFn` is injected with a far-future time in tests (e.g. `Date.now() + 10h`), the cutoff is also in the future, which means **all previous `notification_log` rows are excluded from the dedup window** — the dedup check becomes a no-op for those test calls. In production this is correct, but a test that inserts a real log row and then calls with a far-future `nowFn` will not detect the duplicate. The rate-limit test at line 147 does this: it sets `FIXED_NOW` to `Date.now() + 10h` and overrides `getRecentNotificationLog` to always return `undefined`, which papers over the issue. This is fragile — if a future test forgets to override `getRecentNotificationLog`, it will silently skip dedup.
**Fix:** Document the constraint in a code comment, and consider injecting the dedup window duration (currently `30_000`) as part of `fns` so tests can set it to a small value or override the cutoff directly.

### WR-04: `sendNotification` in `telegram.js` silently discards delivery errors — callers receive no signal on failure

**File:** `server/gsd/telegram.js:118-131` and `server/gsd/notificationCentre.js:121-125`
**Issue:** `sendNotification` calls `apiCall()` which itself catches all errors and returns `null`. Neither function throws nor returns a falsy/truthy success indicator. `notificationCentre.js` wraps the `sendFn()` call in a `try/catch` that also swallows errors. This means:
- The notification log row is written with `delivered = 1` (line 118 of notificationCentre.js) **before** delivery is attempted
- If delivery fails, the row stays `delivered = 1` — the log is inaccurate
- There is no way for callers to distinguish "sent" from "silently failed"

The comment says "Non-blocking: delivery failure is logged but not thrown" — but delivery failure is not logged. The log row created at step 7 already has `delivered = 1`.
**Fix:** Update `delivered` to `0` on delivery failure with a `suppress_reason` of `'delivery_error'`, or at minimum add a `console.warn` so failures are visible in PM2 logs:
```js
try {
  await sendFn();
} catch (err) {
  // Mark the pre-written log row as not actually delivered
  stmts.insertNotificationLog.run(eventType, projectName, text, 0, 'delivery_error');
  // (The delivered=1 row written at step 7 stays, but this second row reflects reality)
}
```
Note: the current design writes a single row; to update it, the `insertNotificationLog` stmt would need a companion `updateNotificationLog` stmt, or the row should only be written with `delivered=1` after a confirmed send.

## Info

### IN-01: `ALERT_TYPES` array in `ConfigPage.tsx` is legacy dead code — the Telegram alerts section now points users to the new Notification Policy panel

**File:** `client/src/pages/ConfigPage.tsx:83-88`
**Issue:** `ALERT_TYPES` defines four alert types (`state_change`, `error`, `completion`, `waiting_input`) that are rendered as toggles in the "Telegram Alerts" section. The section itself contains a note at line 594–596 saying "Notification settings have moved to the Notifications section below." Both the old toggles and the new `NotificationPolicyPanel` are visible on the page simultaneously, potentially confusing users about which controls are authoritative. The `telegram_alerts` field in `project_settings` is still being written by `handleAlertToggle` but the new `notification_policy` table is the authoritative source.
**Fix:** Either hide the legacy Telegram Alerts section (replace with a migration notice only) or remove the toggle controls and leave only the informational message, pointing users to the new panel.

### IN-02: `GLOBAL_KEY` constant in `ConfigPage.tsx` is duplicated inline instead of imported from a shared location

**File:** `client/src/pages/ConfigPage.tsx:128-129`
**Issue:** `const GLOBAL_KEY = "__global__"` is a string literal that must match the server's `GLOBAL_SETTINGS_KEY = '__global__'` in `db.js`. There is no cross-layer type contract. A rename on either side silently breaks the lookup.
**Fix:** This is a low-risk, existing pattern in the codebase. At minimum add a comment referencing the server constant to make the coupling visible.

### IN-03: `saveSettings` in `ConfigPage.tsx` silently swallows save errors

**File:** `client/src/pages/ConfigPage.tsx:288-290`
**Issue:** The catch block in `saveSettings` is empty with a comment "Silently fail — settings will retry on next change." The user receives no feedback when a project settings save fails. For verbosity and GSD override toggles, the UI optimistically updates local state (`setSettings`) before the save, so the displayed state diverges from the server state on failure.
**Fix:** Add a brief inline error indicator, similar to the `error` state pattern already used in `NotificationPolicyPanel.tsx:248-253`.

### IN-04: `telegram.js` still exports `shouldNotify` which is a cooldown function superseded by `notificationCentre`

**File:** `server/gsd/telegram.js:49-54`
**Issue:** `shouldNotify` implements a per-project 1-minute cooldown that was the pre-Phase 54B rate-limiting mechanism. With the new `notificationCentre.js` handling rate limiting, quiet hours, and deduplication, `shouldNotify` is no longer called anywhere in the reviewed files. It remains exported and adds confusion about which system controls delivery.
**Fix:** Audit usages with `grep -r shouldNotify server/`. If unused, remove the export and the `notifyCooldowns` Map to avoid confusion.

### IN-05: `migratePhase42Notifications` legacy key mapping has a logical gap — `error` key maps to `verify_failed` but the Phase 42 UI label was "Error notifications" which is broader than verify failures

**File:** `server/index.js:226-233`
**Issue:** The migration `MAP` maps legacy `error` → `verify_failed`. In Phase 42, "error" was a general error alert. The new `verify_failed` is specifically about verify-work failures. Users who had `error: true` in Phase 42 likely wanted all error notifications, but the migration only enables `verify_failed`. Other error-related events (`cost_anomaly`, etc.) would remain at their defaults. This is a semantic mismatch that silently narrows notification scope on migration.
**Fix:** Add a comment in the migration documenting this intentional narrowing, so future maintainers understand it was a deliberate choice rather than an oversight.

---

_Reviewed: 2026-05-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
