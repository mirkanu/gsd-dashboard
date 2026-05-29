---
phase: 54B
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/db.js
  - server/gsd/notificationCentre.js
autonomous: true
requirements:
  - NTF-01
  - NTF-02
  - NTF-04

must_haves:
  truths:
    - "notificationCentre.notify() exists and is callable with (eventType, projectName, text, options)"
    - "Event policy defaults match the ROADMAP table: waiting_input=on, plan_complete=on, verify_failed=on, idle_session_closed=on, cost_anomaly=on; others off"
    - "Rate limiter drops events beyond N/hour (global counter, in-memory)"
    - "Quiet hours suppresses non-high-priority events if current UTC HH:MM is in window"
    - "Duplicate suppression: same event_type+project_name within 30s is suppressed with reason=dedup"
    - "notification_policy table and notification_log table exist in SQLite after startup"
    - "project_settings has notification_enabled and notification_quiet_override columns"
    - "All DB migrations are idempotent (probe-before-alter pattern)"
  artifacts:
    - path: "server/gsd/notificationCentre.js"
      provides: "Policy engine and delivery orchestrator"
      exports: ["notify", "_testNotify", "EVENT_DEFAULTS"]
    - path: "server/db.js"
      provides: "Schema migrations + prepared statements for notification_policy, notification_log, project_settings columns"
      contains: "notification_policy"
  key_links:
    - from: "server/gsd/notificationCentre.js"
      to: "server/gsd/telegram.js"
      via: "lazy require inside notify() to avoid circular dep"
      pattern: "require.*telegram.*inside"
    - from: "server/gsd/notificationCentre.js"
      to: "server/db.js"
      via: "lazy require inside functions"
      pattern: "require.*db.*inside"
---

<objective>
Create the NotificationCentre module and extend the DB schema.

Purpose: Establish the policy engine that all Telegram delivery flows through from Phase 54B onward. No call site migration yet — this plan only creates the module and the schema it reads from.
Output: server/gsd/notificationCentre.js (notify, _testNotify, EVENT_DEFAULTS), DB migrations for notification_policy + notification_log tables + 2 additive project_settings columns.
</objective>

<execution_context>
@/data/home/gsddashboard/.claude/get-shit-done/workflows/execute-plan.md
@/data/home/gsddashboard/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/54B-unified-notification-centre/54B-RESEARCH.md
@.planning/phases/54B-unified-notification-centre/54B-PATTERNS.md
@.planning/phases/54B-unified-notification-centre/54B-VALIDATION.md

<interfaces>
<!-- Key contracts the executor needs. Extracted from codebase. -->

From server/gsd/telegram.js:
```js
'use strict';
const notifyCooldowns = new Map(); // project → timestamp
const COOLDOWN_MS = 60_000;
const pendingRoutes = new Map();
let nextRouteId = 1;
// Lazy-require pattern (lines 84-88):
function getStmts() {
  if (!stmts) { try { stmts = require('../db').stmts; } catch { } }
  return stmts;
}
// Exports: { startReplyPoller, stopReplyPoller, ENABLED, sendNotification, shouldNotify, formatForTelegram, parseOptions }
async function sendNotification(projectName, text, options) { ... } // options = string[] of button labels
```

From server/gsd/gracefulShutdown.js (DI pattern):
```js
async function _testGracefulShutdown(sessionName, projectName, opts = {}, fns = {}) {
  const { isTmuxActiveFn = isTmuxSessionActive, notifyFn = sendNotification, ... } = fns;
}
module.exports = { gracefulShutdown, _testGracefulShutdown };
```

From server/db.js (migration probe pattern):
```js
// Try/catch probe — additive column migration (lines 441-449):
try {
  db.prepare("SELECT suppress_context_reask FROM project_settings LIMIT 1").get();
} catch {
  db.exec(`ALTER TABLE project_settings ADD COLUMN suppress_context_reask INTEGER;
           ALTER TABLE project_settings ADD COLUMN suppress_plan_ceremony INTEGER;`);
}
// New table migration (lines 179-190):
try {
  db.prepare('SELECT 1 FROM project_verify_state LIMIT 1').get();
} catch {
  db.prepare('CREATE TABLE IF NOT EXISTS project_verify_state (...) ').run();
}
// strftime timestamp default: DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
// stmts object — all prepared statements live here
```

From server/db.js (upsertProjectSettings — must update for new columns):
```sql
INSERT INTO project_settings (project_key, verbosity, telegram_alerts, suppress_context_reask, suppress_plan_ceremony, updated_at)
VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(project_key) DO UPDATE SET
  verbosity = excluded.verbosity,
  telegram_alerts = excluded.telegram_alerts,
  suppress_context_reask = COALESCE(excluded.suppress_context_reask, suppress_context_reask),
  suppress_plan_ceremony = COALESCE(excluded.suppress_plan_ceremony, suppress_plan_ceremony),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: DB schema migrations — notification_policy, notification_log, project_settings columns</name>
  <files>server/db.js</files>

  <read_first>
    - server/db.js — read the full file to find the correct insertion points for migrations and prepared statements
  </read_first>

  <behavior>
    - After migrations run, SELECT 1 FROM notification_policy succeeds
    - After migrations run, SELECT 1 FROM notification_log succeeds
    - After migrations run, SELECT notification_enabled FROM project_settings succeeds
    - After migrations run, SELECT notification_quiet_override FROM project_settings succeeds
    - Running migrations twice (idempotent) causes no error (probe-before-alter)
    - stmts.getNotificationPolicy.get() returns row or undefined (not throws)
    - stmts.upsertNotificationPolicy.run(...) inserts/updates the __global__ row
    - stmts.insertNotificationLog.run(...) inserts a row
    - stmts.getRecentNotificationLog.all(eventType, projectName, cutoffIso) returns rows
  </behavior>

  <action>
Add four idempotent migrations to server/db.js, placed after the existing Phase 56 column migrations section (after the suppress_context_reask/suppress_plan_ceremony probe block).

**Migration 1 — notification_policy table:**
```js
// Migration: notification_policy table (Phase 54B)
try {
  db.prepare('SELECT 1 FROM notification_policy LIMIT 1').get();
} catch {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_policy (
      key TEXT PRIMARY KEY DEFAULT '__global__',
      enabled INTEGER NOT NULL DEFAULT 1,
      quiet_hours_from TEXT,
      quiet_hours_to TEXT,
      rate_limit_per_hour INTEGER NOT NULL DEFAULT 5,
      event_toggles TEXT NOT NULL DEFAULT '{}',
      archived_legacy_alerts INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
}
```

**Migration 2 — notification_log table + index:**
```js
// Migration: notification_log table (Phase 54B)
try {
  db.prepare('SELECT 1 FROM notification_log LIMIT 1').get();
} catch {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      project_name TEXT,
      message_text TEXT,
      delivered INTEGER NOT NULL DEFAULT 0,
      suppress_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notification_log_type_project
      ON notification_log(event_type, project_name, created_at);
  `);
}
```

**Migration 3 — project_settings additive columns:**
```js
// Migration: notification override columns in project_settings (Phase 54B)
try {
  db.prepare('SELECT notification_enabled FROM project_settings LIMIT 1').get();
} catch {
  db.exec(`
    ALTER TABLE project_settings ADD COLUMN notification_enabled INTEGER;
    ALTER TABLE project_settings ADD COLUMN notification_quiet_override INTEGER NOT NULL DEFAULT 0;
  `);
}
```

**Prepared statements** — add to the stmts object (after existing listProjectSettings / applyGlobalSettings):
```js
  // Notification policy (Phase 54B)
  getNotificationPolicy: db.prepare(
    `SELECT * FROM notification_policy WHERE key = '__global__'`
  ),
  upsertNotificationPolicy: db.prepare(
    `INSERT INTO notification_policy (key, enabled, quiet_hours_from, quiet_hours_to, rate_limit_per_hour, event_toggles, archived_legacy_alerts, updated_at)
     VALUES ('__global__', ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(key) DO UPDATE SET
       enabled = excluded.enabled,
       quiet_hours_from = excluded.quiet_hours_from,
       quiet_hours_to = excluded.quiet_hours_to,
       rate_limit_per_hour = excluded.rate_limit_per_hour,
       event_toggles = excluded.event_toggles,
       archived_legacy_alerts = COALESCE(excluded.archived_legacy_alerts, archived_legacy_alerts),
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  ),
  insertNotificationLog: db.prepare(
    `INSERT INTO notification_log (event_type, project_name, message_text, delivered, suppress_reason)
     VALUES (?, ?, ?, ?, ?)`
  ),
  getRecentNotificationLog: db.prepare(
    `SELECT id FROM notification_log
     WHERE event_type = ? AND project_name = ? AND delivered = 1 AND created_at > ?
     LIMIT 1`
  ),
```

Also add `getNotificationPolicy`, `upsertNotificationPolicy`, `insertNotificationLog`, `getRecentNotificationLog` to the module.exports at the bottom of db.js if db.js uses named exports for stmts (it exports `{ db, stmts, GLOBAL_SETTINGS_KEY, getGlobalSettings }`).
  </action>

  <verify>
    <automated>npm run test:server</automated>
  </verify>

  <acceptance_criteria>
    - grep -c "notification_policy" /home/services/gsddashboard/server/db.js returns >= 3
    - grep -c "notification_log" /home/services/gsddashboard/server/db.js returns >= 3
    - grep "notification_enabled" /home/services/gsddashboard/server/db.js shows the probe SELECT line
    - grep "getNotificationPolicy" /home/services/gsddashboard/server/db.js shows prepared statement
    - grep "insertNotificationLog" /home/services/gsddashboard/server/db.js shows prepared statement
    - npm run test:server exits 0
  </acceptance_criteria>

  <done>All four migrations are idempotent, all four prepared statements are defined in stmts, tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create notificationCentre.js — policy engine with rate limit, quiet hours, dedup, delivery</name>
  <files>server/gsd/notificationCentre.js</files>

  <read_first>
    - server/gsd/telegram.js — see sendNotification signature, ENABLED flag, lazy-require pattern
    - server/gsd/gracefulShutdown.js — see DI pattern (_testGracefulShutdown, injectable fns)
    - server/db.js — confirm stmts keys are getNotificationPolicy, insertNotificationLog, getRecentNotificationLog (just added in Task 1)
  </read_first>

  <behavior>
    - notify('waiting_input', 'proj', 'text', []) when policy enabled + event enabled: calls sendFn once
    - notify('waiting_input', 'proj', 'text') when notification_policy.enabled=0: does NOT call sendFn (logs with suppress_reason='disabled')
    - notify('verify_passed', 'proj', 'text') when event toggle is off by default: does NOT call sendFn (suppress_reason='disabled')
    - notify('waiting_input', 'proj', 'text') when in quiet hours and NOT high-priority: does NOT call sendFn (suppress_reason='quiet_hours')
    - notify('verify_failed', 'proj', 'text') when in quiet hours: DOES call sendFn (highPriority=true bypasses quiet hours)
    - notify burst: 20 calls in 10s with rate_limit_per_hour=5: exactly 5 calls to sendFn, 15 suppressed with suppress_reason='rate_limit'
    - Duplicate: two notify('waiting_input', 'proj', ...) within 30s: only first calls sendFn; second logs suppress_reason='dedup'
    - notification_log row is written BEFORE sendFn is called (sync write via better-sqlite3)
    - notify() returns a Promise (non-blocking at call sites)
  </behavior>

  <action>
Create server/gsd/notificationCentre.js using the following exact structure:

```js
'use strict';

// Event types and their defaults per ROADMAP Phase 54B spec
const EVENT_DEFAULTS = {
  waiting_input:       { enabled: true,  highPriority: true,  rateLimited: false },
  plan_complete:       { enabled: true,  highPriority: true,  rateLimited: false },
  verify_failed:       { enabled: true,  highPriority: true,  rateLimited: false },
  verify_passed:       { enabled: false, highPriority: false, rateLimited: false },
  idle_session_closed: { enabled: true,  highPriority: false, rateLimited: true  },
  cost_anomaly:        { enabled: true,  highPriority: false, rateLimited: true  },
  github_issue_filed:  { enabled: false, highPriority: false, rateLimited: false },
  session_started:     { enabled: false, highPriority: false, rateLimited: false },
  tool_use:            { enabled: false, highPriority: false, rateLimited: false },
  turn_complete:       { enabled: false, highPriority: false, rateLimited: false },
  system_alert:        { enabled: true,  highPriority: true,  rateLimited: false },
};

// In-memory global rate limit window (resets on server restart — acceptable per spec)
const HOUR_MS = 60 * 60 * 1000;
let rateWindow = { count: 0, resetAt: Date.now() + HOUR_MS };

/**
 * DI-friendly core. Injectable for unit tests.
 * @param {string} eventType
 * @param {string} projectName
 * @param {string} text
 * @param {string[]} [options]
 * @param {object} fns - { sendFn, dbFn, nowFn }
 */
async function _testNotify(eventType, projectName, text, options = [], fns = {}) {
  // Lazy-require production defaults (avoids circular dep at module top)
  const defaultSendFn = () => {
    const { sendNotification } = require('./telegram');
    return sendNotification(projectName, text, options);
  };
  const defaultDbFn = () => require('../db').stmts;
  const defaultNowFn = () => Date.now();

  const {
    sendFn = defaultSendFn,
    dbFn = defaultDbFn,
    nowFn = defaultNowFn,
  } = fns;

  const stmts = dbFn();
  const eventDef = EVENT_DEFAULTS[eventType] || { enabled: false, highPriority: false, rateLimited: false };

  // 1. Load global policy from DB
  let policy;
  try {
    const row = stmts.getNotificationPolicy.get();
    if (row) {
      policy = {
        enabled: row.enabled === 1,
        quiet_hours_from: row.quiet_hours_from || null,
        quiet_hours_to: row.quiet_hours_to || null,
        rate_limit_per_hour: row.rate_limit_per_hour || 5,
        event_toggles: (() => { try { return JSON.parse(row.event_toggles || '{}'); } catch { return {}; } })(),
      };
    }
  } catch { /* no policy row yet — use defaults */ }

  if (!policy) {
    policy = { enabled: true, quiet_hours_from: null, quiet_hours_to: null, rate_limit_per_hour: 5, event_toggles: {} };
  }

  // 2. Global enable check
  if (!policy.enabled) {
    stmts.insertNotificationLog.run(eventType, projectName, text, 0, 'disabled');
    return;
  }

  // 3. Per-event toggle check (DB value overrides default; absent = use default)
  const eventEnabled = (eventType in policy.event_toggles)
    ? policy.event_toggles[eventType]
    : eventDef.enabled;
  if (!eventEnabled) {
    stmts.insertNotificationLog.run(eventType, projectName, text, 0, 'disabled');
    return;
  }

  // 4. Quiet hours check (non-high-priority events only)
  if (!eventDef.highPriority && policy.quiet_hours_from && policy.quiet_hours_to) {
    const nowUtcHHMM = new Date(nowFn()).toISOString().slice(11, 16); // "HH:MM"
    const from = policy.quiet_hours_from;
    const to = policy.quiet_hours_to;
    const inQuiet = from <= to
      ? nowUtcHHMM >= from && nowUtcHHMM < to
      : nowUtcHHMM >= from || nowUtcHHMM < to; // crosses midnight
    if (inQuiet) {
      stmts.insertNotificationLog.run(eventType, projectName, text, 0, 'quiet_hours');
      return;
    }
  }

  // 5. Rate limit check (global counter, non-high-priority events only)
  if (eventDef.rateLimited) {
    const now = nowFn();
    if (now > rateWindow.resetAt) {
      rateWindow = { count: 0, resetAt: now + HOUR_MS };
    }
    if (rateWindow.count >= (policy.rate_limit_per_hour || 5)) {
      stmts.insertNotificationLog.run(eventType, projectName, text, 0, 'rate_limit');
      return;
    }
    rateWindow.count++;
  }

  // 6. Deduplication: same event_type + project_name delivered in last 30s
  const cutoff = new Date(nowFn() - 30_000).toISOString();
  const dupe = stmts.getRecentNotificationLog.get(eventType, projectName, cutoff);
  if (dupe) {
    stmts.insertNotificationLog.run(eventType, projectName, text, 0, 'dedup');
    return;
  }

  // 7. Write log row BEFORE delivery (so dedup check is reliable on rapid calls)
  stmts.insertNotificationLog.run(eventType, projectName, text, 1, null);

  // 8. Deliver
  try {
    await sendFn();
  } catch {
    // Non-blocking: delivery failure is logged but not thrown
  }
}

/**
 * Public entry point. Fire-and-forget at call sites: notify(...).catch(() => {})
 */
async function notify(eventType, projectName, text, options = []) {
  return _testNotify(eventType, projectName, text, options);
}

module.exports = { notify, _testNotify, EVENT_DEFAULTS };
```

Key implementation notes:
- Lazy require of telegram and db inside functions — DO NOT require at module top
- Rate limit counter is GLOBAL (one counter for all events), not per-project
- `rateLimited` flag in EVENT_DEFAULTS controls whether rate limit applies — high-priority events bypass
- Quiet hours: server uses UTC; comparison is string comparison of HH:MM
- Log write is synchronous (better-sqlite3 is sync); happens BEFORE await sendFn()
- `options` is passed through to sendFn (for Telegram inline keyboard buttons)
  </action>

  <verify>
    <automated>npm run test:server</automated>
  </verify>

  <acceptance_criteria>
    - test -f /home/services/gsddashboard/server/gsd/notificationCentre.js
    - grep "module.exports = { notify, _testNotify, EVENT_DEFAULTS }" /home/services/gsddashboard/server/gsd/notificationCentre.js
    - grep "waiting_input" /home/services/gsddashboard/server/gsd/notificationCentre.js shows EVENT_DEFAULTS entry
    - grep "require('./telegram')" /home/services/gsddashboard/server/gsd/notificationCentre.js — must appear INSIDE a function, not at top
    - grep "require('../db')" /home/services/gsddashboard/server/gsd/notificationCentre.js — must appear INSIDE a function, not at top
    - npm run test:server exits 0
  </acceptance_criteria>

  <done>notificationCentre.js exists and exports notify, _testNotify, EVENT_DEFAULTS. Policy pipeline: enabled → event toggle → quiet hours → rate limit → dedup → log → send. Tests pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| notificationCentre → telegram.js | Internal module boundary; telegram.js is trusted |
| notificationCentre → SQLite | Local DB read; no external input passes here |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-54B-01-A | Information Disclosure | notification_log table | mitigate | message_text stored but BOT_TOKEN never stored; log entries are server-local only |
| T-54B-01-B | Tampering | event_toggles JSON in DB | accept | single-user dashboard; no external write path in this plan; validated in Plan 03 route |
</threat_model>

<verification>
node -e "const nc = require('./server/gsd/notificationCentre'); console.log(Object.keys(nc))" from /home/services/gsddashboard prints: [ 'notify', '_testNotify', 'EVENT_DEFAULTS' ]

npm run test:server exits 0.
</verification>

<success_criteria>
- notification_policy table exists after server restart
- notification_log table exists after server restart
- project_settings has notification_enabled and notification_quiet_override columns
- notificationCentre.js exports notify, _testNotify, EVENT_DEFAULTS
- All DB migrations are idempotent
- npm run test:server passes
</success_criteria>

<output>
After completion, create `.planning/phases/54B-unified-notification-centre/54B-01-SUMMARY.md`
</output>
