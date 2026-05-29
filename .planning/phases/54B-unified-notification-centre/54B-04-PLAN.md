---
phase: 54B
plan: 04
type: execute
wave: 3
depends_on:
  - 54B-02
  - 54B-03
files_modified:
  - server/gsd/stateBroadcaster.js
  - server/gsd/gracefulShutdown.js
  - server/routes/gsd.js
  - server/index.js
  - server/gsd/telegram.js
autonomous: true
requirements:
  - NTF-01
  - NTF-02
  - NTF-05

must_haves:
  truths:
    - "server/routes/gsd.js no longer calls sendNotification() directly"
    - "server/gsd/gracefulShutdown.js no longer calls sendNotification() directly (default notifyFn routes through NotificationCentre)"
    - "server/index.js disk alerts call notify('system_alert', ...) instead of sendNotification()"
    - "server/gsd/stateBroadcaster.js calls notify('waiting_input', ...) after feedStore push"
    - "proxy mode guard (GSD_DATA_URL) prevents notify() calls on proxy instances"
    - "telegram.js sendNotification has @deprecated JSDoc comment"
    - "Phase 42 legacy telegram_alerts migration runs at startup and sets archived_legacy_alerts=1 after first successful delivery"
    - "grep sendNotification server/routes/gsd.js returns 0 matches"
    - "grep sendNotification server/index.js returns 0 matches for disk alerts"
  artifacts:
    - path: "server/gsd/stateBroadcaster.js"
      provides: "notify('waiting_input') call after feedStore push"
      contains: "notificationCentre"
    - path: "server/gsd/gracefulShutdown.js"
      provides: "Default notifyFn routes through notify('idle_session_closed')"
      contains: "idle_session_closed"
    - path: "server/routes/gsd.js"
      provides: "State-transition notification via notify('waiting_input') instead of sendNotification"
      contains: "notificationCentre"
    - path: "server/index.js"
      provides: "Disk alert via notify('system_alert'); Phase 42 migration at startup"
      contains: "system_alert"
  key_links:
    - from: "server/gsd/stateBroadcaster.js"
      to: "server/gsd/notificationCentre.js"
      via: "lazy require inside if(!GSD_DATA_URL) block"
      pattern: "require.*notificationCentre"
    - from: "server/gsd/gracefulShutdown.js"
      to: "server/gsd/notificationCentre.js"
      via: "default notifyFn lambda"
      pattern: "idle_session_closed"
---

<objective>
Migrate all three existing sendNotification() call sites through NotificationCentre and add Phase 42 legacy migration.

Purpose: Completes NTF-01 — makes NotificationCentre the single delivery path. After this plan, no production code calls telegram.sendNotification() directly for event-driven notifications.
Output: Modified stateBroadcaster.js, gracefulShutdown.js, gsd.js, index.js. Phase 42 migration function added to index.js startup block.
</objective>

<execution_context>
@/data/home/gsddashboard/.claude/get-shit-done/workflows/execute-plan.md
@/data/home/gsddashboard/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/54B-unified-notification-centre/54B-RESEARCH.md
@.planning/phases/54B-unified-notification-centre/54B-PATTERNS.md
@.planning/phases/54B-unified-notification-centre/54B-01-SUMMARY.md
@.planning/phases/54B-unified-notification-centre/54B-02-SUMMARY.md

<interfaces>
<!-- Key contracts from RESEARCH.md and PATTERNS.md verified against codebase. -->

From server/routes/gsd.js (current call site to replace, ~lines 162-181):
```js
// Current:
if (telegramEnabled && tmux_session) {
  const prevState = previousStates.get(name);
  previousStates.set(name, sessionState);
  if (prevState && prevState !== sessionState) {
    if (prevState === 'working' && (sessionState === 'waiting' || sessionState === 'paused')) {
      if (shouldNotify(name)) {
        const paneText = await capturePaneTextAsync(tmux_session);
        const options = paneText ? parseOptions(paneText) : [];
        const label = sessionState === 'waiting' ? 'is waiting for your input' : 'has paused';
        const cleanText = paneText ? formatForTelegram(paneText) : '';
        const body = cleanText ? `${label}:\n\n${cleanText}` : label;
        sendNotification(name, body, options).catch(() => {});
      }
    }
  }
}
// Replacement:
if (tmux_session && !GSD_DATA_URL) {
  const prevState = previousStates.get(name);
  previousStates.set(name, sessionState);
  if (prevState && prevState !== sessionState) {
    if (prevState === 'working' && (sessionState === 'waiting' || sessionState === 'paused')) {
      const { notify } = require('../gsd/notificationCentre');
      const paneText = await capturePaneTextAsync(tmux_session);
      const options = paneText ? parseOptions(paneText) : [];
      const label = sessionState === 'waiting' ? 'is waiting for your input' : 'has paused';
      const cleanText = paneText ? formatForTelegram(paneText) : '';
      const body = cleanText ? `${label}:\n\n${cleanText}` : label;
      notify('waiting_input', name, body, options).catch(() => {});
    }
  }
}
```

From server/gsd/gracefulShutdown.js (DI block ~lines 40-48):
```js
// Current:
notifyFn = sendNotification,
// Replacement:
notifyFn = (project, text) => {
  const { notify } = require('./notificationCentre');
  return notify('idle_session_closed', project, text);
},
```

From server/gsd/stateBroadcaster.js (waiting_input push block ~lines 139-165):
```js
// Current (after feedStore.pushEvent(waitingEntry) and broadcastFn call):
// nothing for notification
// Add immediately after broadcastFn call:
if (!process.env.GSD_DATA_URL) {
  const { notify } = require('./notificationCentre');
  notify('waiting_input', project.name, `Waiting for input on ${displayName}`).catch(() => {});
}
```

From server/index.js (disk alert block ~lines 319-344):
```js
// Current:
if (telegramEnabled) { sendNotification('dashboard', `[CRITICAL] Disk at ${diskPct}% ...`); }
if (telegramEnabled) { sendNotification('dashboard', `Warning: Disk at ${diskPct}% ...`); }
// Replacement:
const { notify } = require('./gsd/notificationCentre');
notify('system_alert', 'dashboard', `[CRITICAL] Disk at ${diskPct}% ...`).catch(() => {});
notify('system_alert', 'dashboard', `Warning: Disk at ${diskPct}% ...`).catch(() => {});
// Remove telegramEnabled guard — notificationCentre checks ENABLED internally
```

From server/db.js Phase 42 migration mapping (from RESEARCH.md):
```js
const MAP = {
  state_change:   'waiting_input',
  completion:     'plan_complete',
  error:          'verify_failed',
  waiting_input:  'waiting_input',
  taskComplete:   'plan_complete',
  waitingOnUser:  'waiting_input',
};
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace call sites in gsd.js, gracefulShutdown.js, stateBroadcaster.js</name>
  <files>server/routes/gsd.js, server/gsd/gracefulShutdown.js, server/gsd/stateBroadcaster.js</files>

  <read_first>
    - server/routes/gsd.js — read the notification block (~lines 155-185) and the top-level require/import block to know which imports to remove (shouldNotify, sendNotification)
    - server/gsd/gracefulShutdown.js — read lines 1-60 to see the DI block and sendNotification import
    - server/gsd/stateBroadcaster.js — read lines 130-175 to find the feedStore.pushEvent call for waiting_input and where to insert the notify() call
  </read_first>

  <action>
**server/routes/gsd.js:**

1. Find the destructured require of telegram (should include `shouldNotify`, `sendNotification`, `parseOptions`, `formatForTelegram`). Remove `shouldNotify` and `sendNotification` from the destructure. Keep `parseOptions` and `formatForTelegram` — they are still needed for text preparation.

2. Find `const GSD_DATA_URL` if it already exists in gsd.js (check — it may already be defined). If not, add:
```js
const GSD_DATA_URL = (process.env.GSD_DATA_URL || "").replace(/\/$/, "");
```

3. Replace the notification block verbatim (see `<interfaces>` block above — the `if (tmux_session && !GSD_DATA_URL)` replacement).

4. Delete the `if (shouldNotify(name))` check — rate limiting now lives inside NotificationCentre.

**server/gsd/gracefulShutdown.js:**

1. Read line 46 (the `notifyFn = sendNotification,` default in the DI block).

2. Replace that single line with the lambda:
```js
notifyFn = (project, text) => {
  const { notify } = require('./notificationCentre');
  return notify('idle_session_closed', project, text);
},
```

3. Check whether `sendNotification` is still referenced elsewhere in gracefulShutdown.js. If its only use was the `notifyFn` default, remove it from the destructured require at the top of the file. Do NOT remove `require('./telegram')` entirely — the import may still be needed by tests via the DI interface.

**server/gsd/stateBroadcaster.js:**

1. Find the `waiting_input` block — where `sessionState === 'waiting' && prevRaw !== 'waiting'` is true and `feedStore.pushEvent(waitingEntry)` is called followed by `broadcastFn(...)`.

2. Add the notify call IMMEDIATELY AFTER the `broadcastFn(...)` call for waiting_input:
```js
if (!process.env.GSD_DATA_URL) {
  const { notify } = require('./notificationCentre');
  notify('waiting_input', project.name, `Waiting for input on ${displayName}`).catch(() => {});
}
```

The `require('./notificationCentre')` must be INSIDE the if block (lazy require, avoids circular dep).

Do NOT add notify calls for plan_complete, verify_failed, etc. in stateBroadcaster — those events come from feedStore landmark events which will be wired later if needed. This plan only adds the waiting_input hook since it is the most critical and already has a clear trigger point.
  </action>

  <verify>
    <automated>npm run test:server</automated>
  </verify>

  <acceptance_criteria>
    - grep -c "sendNotification" /home/services/gsddashboard/server/routes/gsd.js returns 0
    - grep "shouldNotify" /home/services/gsddashboard/server/routes/gsd.js returns no matches
    - grep "notify.*waiting_input" /home/services/gsddashboard/server/routes/gsd.js or grep "notificationCentre" /home/services/gsddashboard/server/routes/gsd.js shows the new call
    - grep "idle_session_closed" /home/services/gsddashboard/server/gsd/gracefulShutdown.js
    - grep "notificationCentre" /home/services/gsddashboard/server/gsd/stateBroadcaster.js
    - grep "GSD_DATA_URL" /home/services/gsddashboard/server/gsd/stateBroadcaster.js shows proxy guard
    - npm run test:server exits 0
  </acceptance_criteria>

  <done>All three call sites migrated through notificationCentre. shouldNotify removed from gsd.js. npm test passes.</done>
</task>

<task type="auto">
  <name>Task 2: Migrate index.js disk alerts + Phase 42 startup migration + telegram.js JSDoc deprecation</name>
  <files>server/index.js, server/gsd/telegram.js</files>

  <read_first>
    - server/index.js — read lines 310-350 to find the disk alert block; also find the startup initialization section (after routes are set up) to add the Phase 42 migration call
    - server/gsd/telegram.js — read to find the sendNotification function declaration to add JSDoc
    - server/db.js — confirm stmts.getNotificationPolicy, stmts.upsertNotificationPolicy, getGlobalSettings are accessible
  </read_first>

  <action>
**server/index.js — disk alerts:**

1. Find the maintenance cron block containing the two `sendNotification('dashboard', ...)` calls (lines ~319-344).

2. Replace both disk alert sendNotification calls with notify() calls:
```js
// Replace the two if(telegramEnabled) blocks with:
const { notify } = require('./gsd/notificationCentre');
if (diskPct >= 95) {
  notify('system_alert', 'dashboard', `[CRITICAL] Disk at ${diskPct}%: volume is nearly full. Run docker system prune -f immediately. See docs/DISK-RUNBOOK.md`).catch(() => {});
} else if (diskPct >= 85) {
  notify('system_alert', 'dashboard', `Warning: Disk at ${diskPct}%: volume is getting full. Consider running docker system prune -af --volumes. See docs/DISK-RUNBOOK.md`).catch(() => {});
}
```

Preserve the exact warning text that was there before — read the file first to copy it.

3. Remove `sendNotification` from the destructured require of telegram in server/index.js if it is no longer used anywhere else in index.js after this change. Keep `ENABLED` and `startReplyPoller`/`stopReplyPoller` if they are still used.

**server/index.js — Phase 42 startup migration:**

Add a one-time migration function that runs at startup (after DB initialization, before the server listens). Place it in the server startup block after the existing migration/initialization code:

```js
// Phase 54B: migrate Phase 42 telegram_alerts to notification_policy (one-time, idempotent)
function migratePhase42Notifications() {
  try {
    const { stmts, getGlobalSettings } = require('./db');
    const { EVENT_DEFAULTS } = require('./gsd/notificationCentre');

    // Skip if already migrated
    const existing = stmts.getNotificationPolicy.get();
    if (existing && existing.archived_legacy_alerts === 1) return;

    // Read legacy global settings
    const globalSettings = getGlobalSettings();
    const legacyAlerts = globalSettings.telegram_alerts || {};

    // Build event_toggles from legacy values
    const MAP = {
      state_change:   'waiting_input',
      completion:     'plan_complete',
      error:          'verify_failed',
      waiting_input:  'waiting_input',
      taskComplete:   'plan_complete',
      waitingOnUser:  'waiting_input',
    };

    const event_toggles = {};
    // Start from defaults
    for (const [key, def] of Object.entries(EVENT_DEFAULTS)) {
      event_toggles[key] = def.enabled;
    }
    // Override with legacy values
    for (const [oldKey, newType] of Object.entries(MAP)) {
      if (legacyAlerts[oldKey] === true && newType in event_toggles) {
        event_toggles[newType] = true;
      } else if (legacyAlerts[oldKey] === false && newType in event_toggles) {
        event_toggles[newType] = false;
      }
    }

    // Insert/update notification_policy (archived_legacy_alerts = 0 initially)
    // It becomes 1 after first successful delivery — not set here
    stmts.upsertNotificationPolicy.run(
      1,                           // enabled
      null,                        // quiet_hours_from
      null,                        // quiet_hours_to
      5,                           // rate_limit_per_hour
      JSON.stringify(event_toggles),
      0,                           // archived_legacy_alerts (stays 0 until first delivery)
    );

    console.log('[54B] Migrated Phase 42 telegram_alerts to notification_policy');
  } catch (err) {
    console.warn('[54B] Phase 42 migration skipped:', err.message);
  }
}

migratePhase42Notifications();
```

**server/gsd/telegram.js — JSDoc deprecation:**

Find the `sendNotification` function declaration and add a JSDoc comment immediately above it:
```js
/**
 * @deprecated Use notificationCentre.notify() instead.
 * Direct calls bypass policy evaluation, rate limiting, and quiet hours.
 * This export is kept for: (1) test injection via DI, (2) POST /api/notifications/test route.
 */
async function sendNotification(projectName, text, options) {
```
  </action>

  <verify>
    <automated>npm run test:server</automated>
  </verify>

  <acceptance_criteria>
    - grep -c "sendNotification" /home/services/gsddashboard/server/index.js returns 0 for production calls (only the require line if still present for startReplyPoller etc)
    - grep "system_alert" /home/services/gsddashboard/server/index.js shows the new notify() calls
    - grep "migratePhase42" /home/services/gsddashboard/server/index.js
    - grep "@deprecated" /home/services/gsddashboard/server/gsd/telegram.js shows the JSDoc comment
    - npm run test:server exits 0
  </acceptance_criteria>

  <done>Disk alerts route through notify('system_alert'). Phase 42 migration function present in index.js. sendNotification JSDoc deprecated in telegram.js. Tests pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| stateBroadcaster → notificationCentre | Internal server-to-server call; no external input |
| index.js maintenance cron → notificationCentre | Internal; disk percentage is OS-sourced, not user input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-54B-04-A | Tampering | Phase 42 migration modifying notification_policy at startup | accept | Migration is idempotent (checks archived_legacy_alerts=1 before running); worst case runs once per restart until delivery confirmed |
| T-54B-04-B | Information Disclosure | notification_log stores message_text | accept | Single-user dashboard; log is local SQLite only; no PII in notification messages |
| T-54B-04-C | Repudiation | Old shouldNotify cooldown removed | accept | Replaced by global rate limiter in notificationCentre which is more auditable (logs to DB) |
</threat_model>

<verification>
grep -rn "sendNotification" /home/services/gsddashboard/server/routes/gsd.js — returns 0 matches.
grep -c "sendNotification" /home/services/gsddashboard/server/index.js — returns 0 (or 1 if still in require for startReplyPoller — check that it's not in a call site).
npm run test:server exits 0.
pm2 restart gsd-dashboard then curl http://localhost:3001/api/notifications/policy returns policy JSON.
</verification>

<success_criteria>
- sendNotification() not called directly in gsd.js, gracefulShutdown.js, stateBroadcaster.js, or index.js disk alert block
- All three event sources (state transition, idle close, disk alert) route through notify()
- Phase 42 migration runs at startup and is idempotent
- telegram.js sendNotification has @deprecated JSDoc
- npm run test:server passes
</success_criteria>

<output>
After completion, create `.planning/phases/54B-unified-notification-centre/54B-04-SUMMARY.md`

Then run:
npm run build && pm2 restart gsd-dashboard

Verify the server is up with: curl -s http://localhost:3001/api/notifications/policy | jq .
</output>
